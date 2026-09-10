import { addConversationMessage } from "@/lib/assistant/store";
import { buildAgentConversationContext, type AgentMemoryPreview } from "@/lib/agent/context-memory";
import { embedArtifactPayload } from "@/lib/agent/artifact-payload";
import { buildArtifactRenderSnapshot } from "@/lib/agent/artifact-render-snapshot";
import {
  buildExerciseMissingContextMessage,
  resolveApExerciseCurriculum,
} from "@/lib/agent/exercise-curriculum";
import { runApExercisePipeline } from "@/lib/agent/exercise-pipeline";
import {
  createCustomAgentStreamResponse,
  createDirectToolResponse,
  writeArtifactTextDeltaChunks,
  type AgentStreamLifecycleHooks,
} from "@/lib/agent/chat-stream";
import { type StoredConversationMessage, type UploadedMaterial, uniqueNonEmpty } from "@/lib/agent/chat-shared";
import { enqueueAgentMemoryFormation } from "@/lib/agent/memory-jobs";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import { saveExercises } from "@/lib/exercises/save-service";
import { classifyAndPersistExerciseTaxonomy } from "@/lib/exercises/taxonomy";
import { fromExerciseDifficulty } from "@/types/exercise";
import { uuidLikeSchema } from "@/lib/api/id-schemas";
import { extractRequestedArtifactTitle } from "@/lib/chat/intent";
import {
  createAgentGeneratedMaterialBatch,
  finalizeAgentGeneratedMaterialBatch,
} from "@/lib/question-bank/agent-generated-material";
import { syncExerciseSemanticIndexRows } from "@/lib/question-bank/semantic-index";
import { buildExerciseTeacherRequest } from "@/lib/agent/workflows/worksheet-shared";
import { scheduleReliableAfterTask } from "@/lib/runtime/background-task";
import type { AgentTaskContext } from "@/lib/agent/task-context";
import {
  buildExercisesDocumentFromMarkdown,
  buildExercisesDocumentFromAgentQuestions,
  serializeDocumentToMarkdown,
} from "@/lib/doc-engine/adapters";
import type { QuestionBlock } from "@/lib/doc-engine/block-types";
import {
  collectRecentConversationText,
  formatExerciseAssistantText,
  formatExerciseAssistantSummaryText,
  inferExerciseCount,
  inferExerciseLanguage,
  inferExerciseType,
  resolveExerciseSaveDecision,
  shouldCarryWorksheetConversation,
} from "@/lib/agent/workflows/exercise-direct-helpers";

type ConversationStoreClient = Parameters<typeof addConversationMessage>[0];

type ConversationRecord = {
  id: string;
  title: string | null;
};

function mapQuestionBlockToArtifactQuestion(
  block: QuestionBlock,
): {
  questionNumber: number;
  question: {
    id: string;
    questionNumber: number;
    questionType?: string;
    title: string;
    stem: string;
    options: Array<{ key: string; content: string }>;
    answer?: string;
    solution?: string;
  };
} | null {
  const number = typeof block.data.number === "number" ? block.data.number : null;
  if (!number || !block.data.stem.trim()) return null;

  if (block.data.questionType === "mc") {
    if (block.data.options.length < 2 && !block.data.correctAnswer?.trim()) {
      return null;
    }
    return {
      questionNumber: number,
      question: {
        id: block.id,
        questionNumber: number,
        questionType: "MC",
        title: `第 ${number} 题`,
        stem: block.data.stem,
        options: block.data.options.map((option) => ({
          key: option.label,
          content: option.text,
        })),
        answer: block.data.correctAnswer ?? undefined,
        solution: block.data.explanation ?? undefined,
      },
    };
  }

  return {
    questionNumber: number,
    question: {
      id: block.id,
      questionNumber: number,
      questionType: block.data.questionType === "frq" ? "FR" : "fill_in",
      title: `第 ${number} 题`,
      stem: block.data.stem,
      options: [],
      answer:
        block.data.questionType === "frq"
          ? block.data.sampleAnswer ?? undefined
          : undefined,
      solution: block.data.explanation ?? undefined,
    },
  };
}

function resolvePersistedTopicId(topicId: string | null | undefined, fallback: string | null | undefined) {
  const normalizedTopicId = `${topicId ?? ""}`.trim();
  if (normalizedTopicId && uuidLikeSchema.safeParse(normalizedTopicId).success) {
    return normalizedTopicId;
  }
  const normalizedFallback = `${fallback ?? ""}`.trim();
  return normalizedFallback && uuidLikeSchema.safeParse(normalizedFallback).success
    ? normalizedFallback
    : undefined;
}

export async function handleExerciseRequest(params: {
  supabase: ConversationStoreClient;
  teacherId: string;
  conversation: ConversationRecord;
  previousMessages: StoredConversationMessage[];
  isFirstTurn: boolean;
  displayUserPrompt: string;
  latestUserPrompt: string;
  uploaded: {
    materials: UploadedMaterial[];
    warnings: string[];
    materialSummary: string;
  };
  profileKey: string;
  memoryPreview?: AgentMemoryPreview;
  taskContext?: AgentTaskContext | null;
  streamHooks?: AgentStreamLifecycleHooks;
}) {
  const startedAt = Date.now();
  const shouldCarryConversation =
    params.taskContext?.mode === "continuation" ||
    shouldCarryWorksheetConversation(
      params.displayUserPrompt || params.latestUserPrompt,
    );
  const recentConversationText = shouldCarryConversation
    ? collectRecentConversationText(params.previousMessages)
    : "";
  const exerciseRequestText = buildExerciseTeacherRequest(
    params.displayUserPrompt || params.latestUserPrompt,
    params.previousMessages,
    shouldCarryConversation,
    params.taskContext
      ? {
          curriculum: params.taskContext.curriculum,
          topic: params.taskContext.topic,
          count: params.taskContext.count,
          duration: params.taskContext.duration,
          scope: params.taskContext.scope,
        }
      : null,
  );
  const curriculum = await resolveApExerciseCurriculum({
    supabase: params.supabase,
    promptText: exerciseRequestText,
    recentConversationText,
  });

  // 有上传材料时跳过课程追问 — 从材料内容推断即可
  const hasMaterialContext = params.uploaded.materials.length > 0 &&
    params.uploaded.materials.some((m) => m.textContent && m.textContent.length > 100);
  if (curriculum.missing.length > 0 && !hasMaterialContext) {
    const assistantText = buildExerciseMissingContextMessage(curriculum);
    const assistantMessage = await addConversationMessage(params.supabase, {
      teacherId: params.teacherId,
      conversationId: params.conversation.id,
      role: "assistant",
      content: assistantText,
    });

    const nextConversationContext = buildAgentConversationContext([
      ...params.previousMessages,
      { role: "user", content: params.displayUserPrompt },
      { role: "assistant", content: assistantText },
    ]);
    await enqueueAgentMemoryFormation({
      teacherId: params.teacherId,
      profileKey: params.profileKey,
      conversationId: params.conversation.id,
      conversationTitle: params.conversation.title,
      assistantMessageId: assistantMessage.id,
      displayUserPrompt: params.displayUserPrompt,
      assistantText,
      toolNames: ["generate_ap_exercises_pipeline"],
      nextConversationContext,
      isFirstTurn: params.isFirstTurn,
    });

    return createDirectToolResponse({
      text: assistantText,
      startedAt,
      totalMs: Math.max(0, Date.now() - startedAt),
      conversationId: params.conversation.id,
      memoryPreview: params.memoryPreview,
      toolName: "generate_ap_exercises_pipeline",
      toolInput: {
        mode: "needs_context",
        prompt: params.displayUserPrompt,
      },
      toolOutput: {
        missing: curriculum.missing,
        courseName: curriculum.courseName,
      },
      hooks: params.streamHooks,
    });
  }

  const inferenceTexts = uniqueNonEmpty([
    params.displayUserPrompt,
    params.latestUserPrompt,
    exerciseRequestText,
    recentConversationText,
    ...params.uploaded.materials.map((item) => item.fileName),
    params.uploaded.materialSummary,
  ]);
  const requestedArtifactTitle = extractRequestedArtifactTitle(
    params.displayUserPrompt || params.latestUserPrompt,
  );
  const count = inferExerciseCount(inferenceTexts);
  const exerciseType = inferExerciseType(inferenceTexts, curriculum.parsedIntent);
  const language = inferExerciseLanguage(inferenceTexts);
  const exerciseModel = getResolvedLanguageModelForTask("assistant_exercises");
  const saveDecision = resolveExerciseSaveDecision({
    taskSavePreference: params.taskContext?.savePreference ?? null,
    promptText: params.displayUserPrompt || params.latestUserPrompt,
    curriculumSaveMode: curriculum.saveMode,
    courseId: curriculum.courseId,
    curriculumSaveHint: curriculum.saveHint ?? null,
  });

  return createCustomAgentStreamResponse({
    startedAt,
    conversationId: params.conversation.id,
    memoryPreview: params.memoryPreview,
    hooks: params.streamHooks,
    execute: async (writer) => {
      const pipelineToolCallId = `exercise-pipeline:${params.conversation.id}:${Date.now()}`;
      const streamedQuestionNumbers = new Set<number>();
      let streamedMarkdown = "";
      writer.write({
        type: "tool-call",
        toolCallId: pipelineToolCallId,
        toolName: "generate_ap_exercises_pipeline",
        input: {
          count,
          exerciseType,
          language,
          courseId: curriculum.courseId ?? null,
          unitId: curriculum.unitId ?? null,
          topicId: curriculum.topicId ?? null,
          uploadedMaterialCount: params.uploaded.materials.length,
        },
        at: Date.now(),
      });
      writer.writeArtifactChunk({
        toolCallId: pipelineToolCallId,
        artifactKind: "exercises",
        chunkType: "meta",
        data: {
          title: requestedArtifactTitle
            ? `${requestedArtifactTitle}（生成中）`
            : "试题（生成中）",
          summary: "右侧 Canvas 会随着模型输出持续补全题目正文。",
          previewText: "正在流式生成试题正文...",
        },
      });
      writer.writePhase({
        phase: "candidate_generating",
        label: "生成候选题",
        status: "running",
        detail: `正在生成 ${count} 道 ${exerciseType} 题。`,
        at: Date.now(),
      });

      const pipelineOutput = await runApExercisePipeline({
        model: exerciseModel,
        teacherRequest: exerciseRequestText,
        count,
        exerciseType,
        language,
        courseId: curriculum.courseId ?? undefined,
        unitId: curriculum.unitId ?? undefined,
        topicId: curriculum.topicId ?? undefined,
        uploadedMaterials: params.uploaded.materials,
        maxRepairRounds: 2,
        onTextDelta: async (delta) => {
          if (!delta) return;
          streamedMarkdown += delta;
          writeArtifactTextDeltaChunks({
            writer,
            toolCallId: pipelineToolCallId,
            artifactKind: "exercises",
            delta,
            title: requestedArtifactTitle || "试题（生成中）",
            previewText: "正在流式生成试题正文...",
          });

          const previewDocument = buildExercisesDocumentFromMarkdown(
            streamedMarkdown,
            requestedArtifactTitle || "试题（生成中）",
          );
          if (!previewDocument) return;

          for (const block of previewDocument.blocks) {
            if (block.type !== "question") continue;
            const mapped = mapQuestionBlockToArtifactQuestion(block);
            if (!mapped) continue;
            if (streamedQuestionNumbers.has(mapped.questionNumber)) continue;
            streamedQuestionNumbers.add(mapped.questionNumber);
            writer.writeQuestion(mapped.question);
          }
        },
      });

      writer.write({
        type: "tool-result",
        toolCallId: pipelineToolCallId,
        toolName: "generate_ap_exercises_pipeline",
        output: {
          passed: pipelineOutput.passedExercises.length,
          requested: count,
          saveMode: saveDecision.effectiveSaveMode,
          saveHint: saveDecision.effectiveSaveHint,
          courseId: curriculum.courseId ?? null,
          unitId: curriculum.unitId ?? null,
          fallbackUsed: pipelineOutput.fallbackUsed,
          fallbackReason: pipelineOutput.fallbackReason,
        },
        at: Date.now(),
      });
      writer.writePhase({
        phase: "candidate_generating",
        label: "生成候选题",
        status: "done",
        detail: `候选题生成完成，当前通过 ${pipelineOutput.passedExercises.length} 道。`,
        at: Date.now(),
        progressCurrent: pipelineOutput.passedExercises.length,
        progressTotal: count,
      });

      if (pipelineOutput.passedExercises.length === 0) {
        throw new Error(
          "当前没有通过验证的习题可保存，请补充更明确的题型或主题后重试。",
        );
      }

      writer.writePhase({
        phase: "question_packaging",
        label: "整理题目块",
        status: "running",
        detail: "正在把通过校验的题整理成可直接预览的题块。",
        at: Date.now(),
      });

      const artifactQuestions = pipelineOutput.passedResults.map((item, index) => ({
        id: `${params.conversation.id}-exercise-${index + 1}`,
        questionNumber: index + 1,
        questionType: item.exercise.type,
        title: `第 ${index + 1} 题`,
        stem: item.exercise.questionText,
        options:
          item.exercise.type === "MC" && item.exercise.options
            ? item.exercise.options.map((option) => ({
                key: option.label,
                content: option.text,
              }))
            : [],
        answer: item.exercise.correctAnswer,
        solution: item.exercise.solutionSteps,
        knowledgePoint: curriculum.topicName ?? undefined,
        sourceLabel: curriculum.courseName
          ? [curriculum.courseName, curriculum.unitLabel].filter(Boolean).join(" · ")
          : undefined,
      }));

      for (const question of artifactQuestions) {
        if (question.questionNumber && streamedQuestionNumbers.has(question.questionNumber)) {
          continue;
        }
        writer.writeQuestion(question);
      }

      writer.writePhase({
        phase: "question_packaging",
        label: "整理题目块",
        status: "done",
        detail: "题目块已就绪，正在决定是否写入题库。",
        at: Date.now(),
      });

      const shouldSaveToQuestionBank =
        saveDecision.shouldSaveToQuestionBank;
      let saveResult = { ids: [] as string[] };
      let materialBatch:
        | Awaited<ReturnType<typeof createAgentGeneratedMaterialBatch>>
        | null = null;

      if (shouldSaveToQuestionBank) {
        const activeMaterialBatch = await createAgentGeneratedMaterialBatch({
          supabase: params.supabase,
          teacherId: params.teacherId,
          sourceConversationId: params.conversation.id,
          teacherPrompt: params.displayUserPrompt,
          courseId: curriculum.courseId ?? null,
          courseLabel: curriculum.courseName ?? null,
          unitId: curriculum.unitId ?? null,
          unitLabel: curriculum.unitLabel ?? null,
          topicId: curriculum.topicId ?? null,
          topicLabel: curriculum.topicName ?? null,
          exercises: pipelineOutput.passedResults.map((item) => ({
            type: item.exercise.type,
            difficulty: item.exercise.difficulty,
            questionText: item.exercise.questionText,
          })),
        });
        materialBatch = activeMaterialBatch;
        const saveToolCallId = `save-exercises:${params.conversation.id}:${Date.now()}`;
        writer.write({
          type: "tool-call",
          toolCallId: saveToolCallId,
          toolName: "save_exercises",
          input: {
            count: pipelineOutput.passedResults.length,
            courseId: curriculum.courseId,
            unitId: curriculum.unitId ?? null,
            importBatchId: activeMaterialBatch.id,
          },
          at: Date.now(),
        });
        writer.writePhase({
          phase: "saving",
          label: "保存到题库",
          status: "running",
          detail: "正在把通过的题目写入真实题库。",
          at: Date.now(),
        });

        try {
          saveResult = await saveExercises({
            supabase: params.supabase,
            teacherId: params.teacherId,
            sourceConversationId: params.conversation.id,
            syncToContentLibrary: true,
            deferPostProcessing: true,
            request: {
              exercises: pipelineOutput.passedResults.map((item) => ({
                ...item.exercise,
                courseId: curriculum.courseId!,
                unitId: curriculum.unitId ?? undefined,
                topicId: resolvePersistedTopicId(
                  item.exercise.topicId,
                  curriculum.topicId,
                ),
                sourceKind: "agent_generated",
                importBatchId: activeMaterialBatch.id,
                sourceFileName: activeMaterialBatch.label,
                verificationStatus: pipelineOutput.fallbackUsed
                  ? "manual_review"
                  : item.verificationStatus,
                verificationAttempts: Math.max(1, item.logs.length),
                teacherPrompt: params.displayUserPrompt,
                isAiGenerated: true,
                teacherModified: false,
              })),
            },
          });
        } catch (error) {
          await finalizeAgentGeneratedMaterialBatch({
            supabase: params.supabase,
            teacherId: params.teacherId,
            batchId: activeMaterialBatch.id,
            base: activeMaterialBatch,
            savedCount: 0,
            status: "failed",
            message:
              error instanceof Error
                ? `toBeduTrack 生成完成，但归档题库失败：${error.message}`
                : "toBeduTrack 生成完成，但归档题库失败。",
          }).catch(() => null);
          throw error;
        }

        writer.write({
          type: "tool-result",
          toolCallId: saveToolCallId,
          toolName: "save_exercises",
          output: {
            savedCount: saveResult.ids.length,
            ids: saveResult.ids,
          },
          at: Date.now(),
        });
        writer.writePhase({
          phase: "saving",
          label: "保存到题库",
          status: "done",
          detail: `已保存 ${saveResult.ids.length} 道题到题库。`,
          at: Date.now(),
          progressCurrent: saveResult.ids.length,
          progressTotal: pipelineOutput.passedResults.length,
        });
      }

      const assistantText = formatExerciseAssistantText({
        courseName: curriculum.courseName,
        unitLabel: curriculum.unitLabel,
        topicName: curriculum.topicName,
        output: pipelineOutput,
        savedCount: saveResult.ids.length,
        saveMode: saveDecision.effectiveSaveMode,
        saveHint: saveDecision.effectiveSaveHint,
        savePreference: saveDecision.effectivePreference,
      });
      const assistantSummaryText = formatExerciseAssistantSummaryText({
        courseName: curriculum.courseName,
        unitLabel: curriculum.unitLabel,
        topicName: curriculum.topicName,
        output: pipelineOutput,
        savedCount: saveResult.ids.length,
        saveMode: saveDecision.effectiveSaveMode,
        saveHint: saveDecision.effectiveSaveHint,
        savePreference: saveDecision.effectivePreference,
      });
      const artifactTitle =
        requestedArtifactTitle ||
        [curriculum.courseName, curriculum.unitLabel, curriculum.topicName]
          .filter(Boolean)
          .join(" · ") || "AI 生成试题";
      const artifactDocument = buildExercisesDocumentFromAgentQuestions({
        title: artifactTitle,
        questions: artifactQuestions,
      });
      const artifactRawContent = serializeDocumentToMarkdown(artifactDocument);
      const artifactSummary =
        assistantSummaryText.trim() ||
        `已生成 ${pipelineOutput.passedResults.length} 道试题，可在右侧 Canvas 查看完整正文。`;
      const artifactSnapshot = buildArtifactRenderSnapshot({
        kind: "exercises",
        title: artifactTitle,
        summary: artifactSummary,
        rawContent: artifactRawContent,
        document: artifactDocument,
        sourceStage: "complete",
      });
      writer.writeArtifactChunk({
        toolCallId: pipelineToolCallId,
        artifactKind: "exercises",
        chunkType: "complete",
        data: {
          title: artifactSnapshot.title,
          summary: artifactSnapshot.summary,
          previewText: "试题已生成，正在写入当前会话。",
          rawContent: artifactSnapshot.rawContent,
          document: artifactSnapshot.document,
          htmlContent: artifactSnapshot.htmlContent,
          layoutConfig: artifactSnapshot.layoutConfig,
          renderVersion: artifactSnapshot.renderVersion,
          sourceStage: artifactSnapshot.sourceStage,
        },
      });
      if (assistantSummaryText) {
        writer.writeTextChunks(assistantSummaryText);
      }
      const persistedAssistantText = embedArtifactPayload(assistantText, {
        kind: "exercises",
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
        content: persistedAssistantText,
      });

      if (materialBatch) {
        await finalizeAgentGeneratedMaterialBatch({
          supabase: params.supabase,
          teacherId: params.teacherId,
          batchId: materialBatch.id,
          base: materialBatch,
          sourceMessageId: assistantMessage.id,
          artifactMarkdown: assistantText,
          savedCount: saveResult.ids.length,
          message:
            saveResult.ids.length > 0
              ? `toBeduTrack 已生成并归档 ${saveResult.ids.length} 道题到题库。`
              : "toBeduTrack 生成完成，但本轮题目未成功归档到题库。",
        });
      }

      const nextConversationContext = buildAgentConversationContext([
        ...params.previousMessages,
        { role: "user", content: params.displayUserPrompt },
        { role: "assistant", content: persistedAssistantText },
      ]);

      scheduleReliableAfterTask({
        taskType: "agent.exercise_postprocess",
        taskKey: assistantMessage.id,
        teacherId: params.teacherId,
        conversationId: params.conversation.id,
        payload: {
          savedCount: saveResult.ids.length,
          courseName: curriculum.courseName ?? null,
          unitLabel: curriculum.unitLabel ?? null,
        },
        run: async () => {
        if (saveResult.ids.length === 0) {
          await enqueueAgentMemoryFormation({
            teacherId: params.teacherId,
            profileKey: params.profileKey,
            conversationId: params.conversation.id,
            conversationTitle: params.conversation.title,
            assistantMessageId: assistantMessage.id,
            displayUserPrompt: params.displayUserPrompt,
            assistantText: persistedAssistantText,
            toolNames: ["generate_ap_exercises_pipeline"],
            nextConversationContext,
            isFirstTurn: params.isFirstTurn,
            scheduleWithAfter: false,
          });
          return;
        }

        const postProcessExercisesTask = classifyAndPersistExerciseTaxonomy({
          supabase: params.supabase,
          teacherId: params.teacherId,
          syncContentLibrary: false,
          exercises: saveResult.ids.map((exerciseId, index) => ({
            exerciseId,
            questionText:
              pipelineOutput.passedResults[index]?.exercise.questionText ?? "",
            correctAnswer:
              pipelineOutput.passedResults[index]?.exercise.correctAnswer ?? "",
            solutionSteps:
              pipelineOutput.passedResults[index]?.exercise.solutionSteps ?? "",
            type: pipelineOutput.passedResults[index]?.exercise.type ?? "FR",
            difficulty:
              fromExerciseDifficulty(pipelineOutput.passedResults[index]?.exercise.difficulty ?? "medium"),
            teacherPrompt: params.displayUserPrompt,
            courseLabel: curriculum.courseName ?? null,
            unitLabel: curriculum.unitLabel ?? null,
          })),
        })
          .then(async () => {
            await syncExerciseSemanticIndexRows({
              supabase: params.supabase,
              teacherId: params.teacherId,
              exerciseIds: saveResult.ids,
            });
          })
          .catch((error) => {
            console.error("习题 taxonomy/semantic 后台同步失败", error);
          });

        await Promise.all([
          enqueueAgentMemoryFormation({
            teacherId: params.teacherId,
            profileKey: params.profileKey,
            conversationId: params.conversation.id,
            conversationTitle: params.conversation.title,
            assistantMessageId: assistantMessage.id,
            displayUserPrompt: params.displayUserPrompt,
            assistantText: persistedAssistantText,
            toolNames: ["generate_ap_exercises_pipeline"],
            nextConversationContext,
            isFirstTurn: params.isFirstTurn,
            scheduleWithAfter: false,
          }),
          postProcessExercisesTask,
        ]);
        },
      });

      writer.writeTextChunks(persistedAssistantText);
      return {
        totalMs: Math.max(0, Date.now() - startedAt),
        finishReason: "stop",
      };
    },
  });
}
