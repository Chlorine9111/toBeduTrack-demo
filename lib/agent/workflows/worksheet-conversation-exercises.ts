/**
 * 上轮习题→组卷 workflow
 *
 * 当用户说"把刚才那几道题组成 worksheet"时，从会话历史中提取
 * 上一轮已生成的习题，直接渲染成 worksheet PDF，无需重新生成。
 */
import { addConversationMessage } from "@/lib/assistant/store";
import { buildAgentConversationContext, type AgentMemoryPreview } from "@/lib/agent/context-memory";
import {
  createCustomAgentStreamResponse,
  writeArtifactTextDeltaChunks,
  type AgentStreamLifecycleHooks,
} from "@/lib/agent/chat-stream";
import { type StoredConversationMessage, uniqueNonEmpty } from "@/lib/agent/chat-shared";
import type { AgentTaskContext } from "@/lib/agent/task-context";
import { embedArtifactPayload } from "@/lib/agent/artifact-payload";
import { buildArtifactRenderSnapshot } from "@/lib/agent/artifact-render-snapshot";
import { enqueueAgentMemoryFormation } from "@/lib/agent/memory-jobs";
import {
  getAssessmentArtifactPresentation,
  inferWorksheetPageSize,
  inferWorksheetTemplateVariant,
  resolveAssessmentArtifactKind,
} from "@/lib/agent/workflows/worksheet-shared";
import {
  WORKSHEET_ANSWER_KEY_PATTERN,
} from "@/lib/agent/workflows/worksheet-direct-types";
import type { ExerciseArtifactContext } from "@/lib/agent/workflows/exercise-save-followup";
import { fromExerciseDifficulty } from "@/types/exercise";
import type { ParsedIntent } from "@/lib/chat/intent";
import { countPdfPages, ensurePdfSizeLimit } from "@/lib/pdf/pdf-service";
import { persistPdfDocument } from "@/lib/pdf/pdf-storage";
import { buildExamPdfDataFromDocument } from "@/lib/pdf/document-typst-mappers";
import type { WorksheetExercise } from "@/lib/pdf/templates/worksheet-template";
import { renderExamTypstPdf } from "@/lib/typst/render-exam";
import { renderWorksheetTypstPdf } from "@/lib/typst/render-worksheet";
import {
  buildExamDocumentFromRenderInput,
  buildWorksheetDocumentFromRenderInput,
  serializeDocumentToMarkdown,
} from "@/lib/doc-engine/adapters";
import { scheduleReliableAfterTask } from "@/lib/runtime/background-task";

type ConversationStoreClient = Parameters<typeof addConversationMessage>[0];

type ConversationRecord = {
  id: string;
  title: string | null;
};

function mapConversationExercisesToWorksheetExercises(
  artifact: ExerciseArtifactContext,
): WorksheetExercise[] {
  return artifact.exercises.map((exercise) => ({
    type: exercise.type,
    difficulty: exercise.difficulty,
    questionText: exercise.questionText,
    options: exercise.options?.map((option) => ({
      label: option.label,
      text: option.text,
    })),
    correctAnswer: exercise.correctAnswer,
    solutionSteps: exercise.solutionSteps,
  }));
}

export async function handleConversationExerciseWorksheetRequest(params: {
  supabase: ConversationStoreClient;
  teacherId: string;
  conversation: ConversationRecord;
  previousMessages: StoredConversationMessage[];
  isFirstTurn: boolean;
  displayUserPrompt: string;
  latestUserPrompt: string;
  latestParsedIntent: ParsedIntent;
  exerciseArtifact: ExerciseArtifactContext;
  profileKey: string;
  memoryPreview?: AgentMemoryPreview;
  taskContext?: AgentTaskContext | null;
  streamHooks?: AgentStreamLifecycleHooks;
}) {
  const startedAt = Date.now();

  return createCustomAgentStreamResponse({
    startedAt,
    conversationId: params.conversation.id,
    memoryPreview: params.memoryPreview,
    hooks: params.streamHooks,
    execute: async (writer) => {
      const exerciseCount = params.exerciseArtifact.exercises.length;

      writer.writePhase({
        phase: "reuse_exercises",
        label: "复用上轮习题",
        status: "done",
        detail: `已从上轮会话中提取 ${exerciseCount} 道题，无需重新生成。`,
        at: Date.now(),
        progressCurrent: exerciseCount,
        progressTotal: exerciseCount,
      });

      // 向前端输出题目块预览
      for (const [index, exercise] of params.exerciseArtifact.exercises.entries()) {
        writer.writeQuestion({
          id: `${params.conversation.id}-reuse-${index + 1}`,
          questionNumber: index + 1,
          questionType: exercise.type,
          title: `第 ${index + 1} 题`,
          stem: exercise.questionText,
          options:
            exercise.type === "MC" && exercise.options
              ? exercise.options.map((option) => ({
                  key: option.label,
                  content: option.text,
                }))
              : [],
          answer: exercise.correctAnswer,
          solution: exercise.solutionSteps,
        });
      }

      // 推断 worksheet 渲染参数
      const inferenceTexts = uniqueNonEmpty([
        params.displayUserPrompt,
        params.latestUserPrompt,
      ]);
      const includeAnswerKey = inferenceTexts.some((text) =>
        WORKSHEET_ANSWER_KEY_PATTERN.test(text),
      );
      const templateVariant = inferWorksheetTemplateVariant(
        inferenceTexts,
        params.latestParsedIntent,
      );
      const pageSize = inferWorksheetPageSize(inferenceTexts);
      const outputKind = resolveAssessmentArtifactKind(
        inferenceTexts,
        params.latestParsedIntent,
      );
      const presentation = getAssessmentArtifactPresentation(outputKind);
      const worksheetTitle =
        params.latestParsedIntent.exportParams?.worksheetTitle?.trim() ||
        `会话习题 ${presentation.titleSuffix}`;
      const renderToolCallId = `render-conversation-worksheet:${params.conversation.id}:${Date.now()}`;
      const previewWorksheetDocument =
        outputKind === "exam"
          ? buildExamDocumentFromRenderInput({
              id: `preview-${renderToolCallId}`,
              title: worksheetTitle,
              courseName: null,
              unitName: null,
              downloadUrl: null,
              sections: [
                {
                  title: "上轮习题",
                  rationale: "直接复用上一轮会话中生成的全部题目",
                  exerciseIds: params.exerciseArtifact.exercises.map(
                    (_, index) => `${params.conversation.id}-reuse-${index + 1}`,
                  ),
                },
              ],
              exercises: params.exerciseArtifact.exercises.map((exercise, index) => ({
                id: `${params.conversation.id}-reuse-${index + 1}`,
                exerciseType: exercise.type,
                difficulty: fromExerciseDifficulty(exercise.difficulty),
                questionText: exercise.questionText,
                options:
                  exercise.type === "MC" && exercise.options
                    ? exercise.options.map((option) => ({
                        label: option.label,
                        text: option.text,
                      }))
                    : [],
                correctAnswer: exercise.correctAnswer,
                solutionSteps: exercise.solutionSteps,
                sourceLabel: undefined,
              })),
            })
          : buildWorksheetDocumentFromRenderInput({
              id: `preview-${renderToolCallId}`,
              title: worksheetTitle,
              courseName: null,
              unitName: null,
              downloadUrl: null,
              sections: [
                {
                  title: "上轮习题",
                  rationale: "直接复用上一轮会话中生成的全部题目",
                  exerciseIds: params.exerciseArtifact.exercises.map(
                    (_, index) => `${params.conversation.id}-reuse-${index + 1}`,
                  ),
                },
              ],
              exercises: params.exerciseArtifact.exercises.map((exercise, index) => ({
                id: `${params.conversation.id}-reuse-${index + 1}`,
                exerciseType: exercise.type,
                difficulty: fromExerciseDifficulty(exercise.difficulty),
                questionText: exercise.questionText,
                options:
                  exercise.type === "MC" && exercise.options
                    ? exercise.options.map((option) => ({
                        label: option.label,
                        text: option.text,
                      }))
                    : [],
                correctAnswer: exercise.correctAnswer,
                solutionSteps: exercise.solutionSteps,
                sourceLabel: undefined,
              })),
            });
      const previewWorksheetMarkdown =
        serializeDocumentToMarkdown(previewWorksheetDocument);
      const artifactSummary = `已复用上轮 ${exerciseCount} 道题组成${presentation.labelZh}`;
      writer.writeArtifactChunk({
        toolCallId: renderToolCallId,
        artifactKind: outputKind,
        chunkType: "meta",
        data: {
          title: worksheetTitle,
          summary: artifactSummary,
          previewText: presentation.arrangingPreviewText,
        },
      });
      writeArtifactTextDeltaChunks({
        writer,
        toolCallId: renderToolCallId,
        artifactKind: outputKind,
        delta: previewWorksheetMarkdown,
        title: worksheetTitle,
        summary: artifactSummary,
        previewText: presentation.arrangingPreviewText,
      });

      writer.writePhase({
        phase: "pdf_rendering",
        label: presentation.pdfPhaseLabel,
        status: "running",
        detail: "正在把上轮生成的题渲染成可下载 PDF。",
        at: Date.now(),
      });
      writer.write({
        type: "tool-call",
        toolCallId: renderToolCallId,
        toolName: presentation.exportToolName,
        input: {
          pageSize,
          templateVariant,
          includeAnswerKey,
          selectedCount: exerciseCount,
          sourceMode: "conversation_exercises",
        },
        at: Date.now(),
      });

      const worksheetExercises = mapConversationExercisesToWorksheetExercises(
        params.exerciseArtifact,
      );
      const pdfBuffer =
        outputKind === "exam"
          ? await renderExamTypstPdf(
              buildExamPdfDataFromDocument(previewWorksheetDocument),
              {
                pageSize,
                templateVariant:
                  params.latestParsedIntent.exportParams?.examTemplate === "exam-modern"
                    ? "modern"
                    : "classic",
              },
            )
          : await renderWorksheetTypstPdf(
              {
                title: worksheetTitle,
                courseName: null,
                teacherName: null,
                date: null,
                exercises: worksheetExercises,
                includeAnswerKey,
                includeExplanations: includeAnswerKey,
                rubrics: [],
              },
              {
                pageSize,
                templateVariant,
              },
            );
      ensurePdfSizeLimit(pdfBuffer);
      const pageCount = countPdfPages(pdfBuffer);

      const record = await persistPdfDocument(params.supabase, {
        teacherId: params.teacherId,
        documentType: outputKind,
        title: worksheetTitle,
        buffer: pdfBuffer,
        config: {
          sourceMode: "conversation_exercises",
          pageSize,
          templateVariant,
          examTemplate:
            outputKind === "exam"
              ? params.latestParsedIntent.exportParams?.examTemplate ?? "exam-classic"
              : null,
          includeAnswerKey,
          includeExplanations: includeAnswerKey,
          questionCount: exerciseCount,
        },
      });
      const downloadUrl = `/api/pdf/download/${record.recordId}`;

      writer.write({
        type: "tool-result",
        toolCallId: renderToolCallId,
        toolName: presentation.exportToolName,
        output: {
          recordId: record.recordId,
          downloadUrl,
          fileSize: record.fileSize,
          pageCount,
        },
        at: Date.now(),
      });

      writer.writePhase({
        phase: "pdf_rendering",
        label: presentation.pdfPhaseLabel,
        status: "done",
        detail: "PDF 已生成，可直接下载。",
        at: Date.now(),
      });

      // 构建 worksheet 文档对象，用于 Canvas 预览
      const worksheetDocument =
        outputKind === "exam"
          ? buildExamDocumentFromRenderInput({
              id: record.recordId,
              title: worksheetTitle,
              courseName: null,
              unitName: null,
              downloadUrl,
              sections: [
                {
                  title: "上轮习题",
                  rationale: "直接复用上一轮会话中生成的全部题目",
                  exerciseIds: params.exerciseArtifact.exercises.map(
                    (_, index) => `${params.conversation.id}-reuse-${index + 1}`,
                  ),
                },
              ],
              exercises: params.exerciseArtifact.exercises.map((exercise, index) => ({
                id: `${params.conversation.id}-reuse-${index + 1}`,
                exerciseType: exercise.type,
                difficulty: fromExerciseDifficulty(exercise.difficulty),
                questionText: exercise.questionText,
                options:
                  exercise.type === "MC" && exercise.options
                    ? exercise.options.map((option) => ({
                        label: option.label,
                        text: option.text,
                      }))
                    : [],
                correctAnswer: exercise.correctAnswer,
                solutionSteps: exercise.solutionSteps,
                sourceLabel: undefined,
              })),
            })
          : buildWorksheetDocumentFromRenderInput({
              id: record.recordId,
              title: worksheetTitle,
              courseName: null,
              unitName: null,
              downloadUrl,
              sections: [
                {
                  title: "上轮习题",
                  rationale: "直接复用上一轮会话中生成的全部题目",
                  exerciseIds: params.exerciseArtifact.exercises.map(
                    (_, index) => `${params.conversation.id}-reuse-${index + 1}`,
                  ),
                },
              ],
              exercises: params.exerciseArtifact.exercises.map((exercise, index) => ({
                id: `${params.conversation.id}-reuse-${index + 1}`,
                exerciseType: exercise.type,
                difficulty: fromExerciseDifficulty(exercise.difficulty),
                questionText: exercise.questionText,
                options:
                  exercise.type === "MC" && exercise.options
                    ? exercise.options.map((option) => ({
                        label: option.label,
                        text: option.text,
                      }))
                    : [],
                correctAnswer: exercise.correctAnswer,
                solutionSteps: exercise.solutionSteps,
                sourceLabel: undefined,
              })),
            });
      const fullWorksheetMarkdown = serializeDocumentToMarkdown(worksheetDocument);
      const artifactSnapshot = buildArtifactRenderSnapshot({
        kind: outputKind,
        title: worksheetTitle,
        summary: artifactSummary,
        rawContent: fullWorksheetMarkdown,
        document: worksheetDocument,
        sourceStage: "complete",
      });
      writer.writeArtifactChunk({
        toolCallId: renderToolCallId,
        artifactKind: outputKind,
        chunkType: "complete",
        data: {
          title: artifactSnapshot.title,
          summary: artifactSnapshot.summary,
          previewText: presentation.completedPreviewText,
          rawContent: artifactSnapshot.rawContent,
          document: artifactSnapshot.document,
          htmlContent: artifactSnapshot.htmlContent,
          layoutConfig: artifactSnapshot.layoutConfig,
          renderVersion: artifactSnapshot.renderVersion,
          sourceStage: artifactSnapshot.sourceStage,
        },
      });

      const assistantText = [
        `## 已用上轮习题组好${presentation.labelZh}`,
        "",
        `- 题目数：${exerciseCount}`,
        `- PDF 页数：${pageCount}`,
        `- 文件大小：${(record.fileSize / 1024).toFixed(1)} KB`,
        includeAnswerKey ? "- 已附答案页：是" : "- 已附答案页：否",
        "",
        "### 题目预览",
        ...params.exerciseArtifact.exercises.slice(0, 6).map((exercise, index) => {
          const preview = exercise.questionText.replace(/\s+/g, " ").trim().slice(0, 72);
          return `${index + 1}. ${preview}${preview.length >= 72 ? "…" : ""}`;
        }),
        "",
        "### 导出说明",
        "- 请在右侧 Canvas 中使用“导出 PDF”获取与当前可见排版一致的版本。",
      ]
        .filter(Boolean)
        .join("\n");

      const assistantArtifactText = embedArtifactPayload(assistantText, {
        kind: outputKind,
        title: artifactSnapshot.title,
        summary: artifactSnapshot.summary,
        rawContent: artifactSnapshot.rawContent,
        document: artifactSnapshot.document,
        htmlContent: artifactSnapshot.htmlContent,
        layoutConfig: artifactSnapshot.layoutConfig,
        renderVersion: artifactSnapshot.renderVersion,
        sourceStage: "persisted",
      });

      const assistantMessage = await addConversationMessage(params.supabase, {
        teacherId: params.teacherId,
        conversationId: params.conversation.id,
        role: "assistant",
        content: assistantArtifactText,
      });

      const nextConversationContext = buildAgentConversationContext([
        ...params.previousMessages,
        { role: "user", content: params.displayUserPrompt },
        { role: "assistant", content: assistantArtifactText },
      ]);

      scheduleReliableAfterTask({
        taskType: "agent.conversation_exercise_worksheet_postprocess",
        taskKey: assistantMessage.id,
        teacherId: params.teacherId,
        conversationId: params.conversation.id,
        payload: {
          exerciseCount,
        },
        run: async () => {
          await enqueueAgentMemoryFormation({
            teacherId: params.teacherId,
            profileKey: params.profileKey,
            conversationId: params.conversation.id,
            conversationTitle: params.conversation.title,
            assistantMessageId: assistantMessage.id,
            displayUserPrompt: params.displayUserPrompt,
            assistantText: assistantArtifactText,
            toolNames: [presentation.exportToolName],
            nextConversationContext,
            isFirstTurn: params.isFirstTurn,
            scheduleWithAfter: false,
          });
        },
      });

      writer.writeTextChunks(assistantArtifactText);
      return {
        totalMs: Math.max(0, Date.now() - startedAt),
        finishReason: "stop",
      };
    },
  });
}
