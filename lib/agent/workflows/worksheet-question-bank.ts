import { addConversationMessage } from "@/lib/assistant/store";
import { buildAgentConversationContext } from "@/lib/agent/context-memory";
import { runApExercisePipeline } from "@/lib/agent/exercise-pipeline";
import { buildExerciseMissingContextMessage, resolveApExerciseCurriculum } from "@/lib/agent/exercise-curriculum";
import { inferExerciseLanguage } from "@/lib/agent/workflows/exercise-direct-helpers";
import { fromExerciseDifficulty } from "@/types/exercise";
import {
  createCustomAgentStreamResponse,
  createDirectToolResponse,
  writeArtifactTextDeltaChunks,
} from "@/lib/agent/chat-stream";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import { inferExplicitDifficultyFromTexts, inferExplicitExerciseTypeFromTexts } from "@/lib/chat/intent";
import { countPdfPages, ensurePdfSizeLimit } from "@/lib/pdf/pdf-service";
import { buildExamPdfDataFromDocument } from "@/lib/pdf/document-typst-mappers";
import { persistPdfDocument } from "@/lib/pdf/pdf-storage";
import { renderExamTypstPdf } from "@/lib/typst/render-exam";
import { renderWorksheetTypstPdf } from "@/lib/typst/render-worksheet";
import { assembleWorksheetFromSemanticSearch, type AssembleWorksheetResult } from "@/lib/worksheet/assemble";
import { enqueueAgentMemoryFormation } from "@/lib/agent/memory-jobs";
import { uniqueNonEmpty } from "@/lib/agent/chat-shared";
import {
  getAssessmentArtifactPresentation,
  buildExerciseTeacherRequest,
  buildWorksheetAssistantText,
  inferWorksheetCount,
  inferWorksheetPageSize,
  inferWorksheetTemplateVariant,
  mapAssembledExercisesToWorksheetExercises,
  resolveAssessmentArtifactKind,
  shouldCarryWorksheetConversation,
} from "@/lib/agent/workflows/worksheet-shared";
import { embedArtifactPayload } from "@/lib/agent/artifact-payload";
import { buildArtifactRenderSnapshot } from "@/lib/agent/artifact-render-snapshot";
import {
  buildExamDocumentFromRenderInput,
  buildExamDocumentFromMarkdown,
  buildWorksheetDocumentFromMarkdown,
  buildWorksheetDocument,
  buildWorksheetDocumentFromRenderInput,
  serializeDocumentToMarkdown,
} from "@/lib/doc-engine/adapters";
import type { QuestionBlock } from "@/lib/doc-engine/block-types";
import {
  collectRecentConversationText,
  type QuestionBankWorksheetParams,
  WORKSHEET_ANSWER_KEY_PATTERN,
} from "@/lib/agent/workflows/worksheet-direct-types";

function buildQuestionBankQuestionBlock(
  exercise: AssembleWorksheetResult["exercises"][number],
  index: number,
) {
  return {
    id: exercise.id || `worksheet-question-${index + 1}`,
    questionNumber: index + 1,
    questionType: exercise.exerciseType,
    title: `第 ${index + 1} 题`,
    stem: exercise.questionText,
    options:
      exercise.options?.map((option) => ({
        key: option.label,
        content: option.text,
      })) ?? [],
    sourceLabel: [exercise.sourceFileName, exercise.knowledgeSubskillLabel]
      .filter(Boolean)
      .join(" · "),
  };
}

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

type WorksheetCurriculumResolution = Awaited<
  ReturnType<typeof resolveApExerciseCurriculum>
>;

type GeneratedWorksheetResult = Awaited<
  ReturnType<typeof runApExercisePipeline>
>["passedResults"][number];

function shouldUseGeneratedWorksheetFallback(params: {
  curriculum: WorksheetCurriculumResolution;
  worksheetRequestText: string;
  taskContext?: QuestionBankWorksheetParams["taskContext"];
}) {
  const explicitApSignal =
    params.curriculum.parsedIntent.track === "ap" ||
    Boolean(params.curriculum.parsedIntent.courseHint) ||
    /\bap\b/i.test(params.worksheetRequestText) ||
    /\bunit\s*\d{1,2}\b/i.test(params.worksheetRequestText) ||
    Boolean(params.taskContext?.curriculum?.trim());
  const explicitTopicSignal = Boolean(
    params.curriculum.parsedIntent.topic ||
      params.curriculum.parsedIntent.topicFocus ||
      params.curriculum.parsedIntent.topicHint ||
      params.taskContext?.topic?.trim(),
  );

  if (!explicitApSignal && !explicitTopicSignal) {
    return false;
  }

  if (!params.curriculum.courseId) {
    return true;
  }

  if (params.curriculum.parsedIntent.unitHint && !params.curriculum.unitId) {
    return true;
  }

  return false;
}

function buildGeneratedWorksheetReason(params: {
  curriculum: WorksheetCurriculumResolution;
  taskContext?: QuestionBankWorksheetParams["taskContext"];
}) {
  if (!params.curriculum.courseId) {
    return "当前题库没有命中这门课的结构化课程映射，已自动切到生成式组卷。";
  }
  if (params.curriculum.parsedIntent.unitHint && !params.curriculum.unitId) {
    return "当前题库没有命中该 Unit 的可用结构化范围，已自动切到生成式组卷。";
  }
  if (params.taskContext?.mode === "continuation") {
    return "已沿用上一版要求继续生成，并切到生成式组卷保持链路连续。";
  }
  return "题库候选不足，已自动切到生成式组卷。";
}

function mapGeneratedResultToWorksheetExercise(result: GeneratedWorksheetResult) {
  return {
    type: result.exercise.type,
    difficulty: result.exercise.difficulty,
    questionText: result.exercise.questionText,
    options:
      result.exercise.type === "MC" && result.exercise.options
        ? result.exercise.options.map((option) => ({
            label: option.label,
            text: option.text,
          }))
        : undefined,
    correctAnswer: result.exercise.correctAnswer,
    solutionSteps: result.exercise.solutionSteps,
  };
}

function buildGeneratedWorksheetAssistantText(params: {
  title: string;
  courseLabel: string | null;
  unitLabel: string | null;
  count: number;
  reason: string;
  downloadUrl: string;
  fileSize: number;
  pageCount: number;
  includeAnswerKey: boolean;
  outputKind: "worksheet" | "exam";
}) {
  const labelZh = params.outputKind === "exam" ? "试卷" : "练习卷";
  return [
    `## 已生成一套${labelZh}`,
    "",
    `- 标题：${params.title}`,
    params.courseLabel ? `- 课程：${params.courseLabel}` : "",
    params.unitLabel ? `- 单元：${params.unitLabel}` : "",
    `- 题目数：${params.count}`,
    `- PDF 页数：${params.pageCount}`,
    `- 文件大小：${(params.fileSize / 1024).toFixed(1)} KB`,
    params.includeAnswerKey ? "- 已附答案页：是" : "- 已附答案页：否",
    "- 组卷方式：生成式组卷",
    "",
    `### 说明\n${params.reason}`,
    "",
    "### 导出说明",
    "- 请在右侧 Canvas 中使用“导出 PDF”获取与当前可见排版一致的版本。",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function handleQuestionBankWorksheetRequest(
  params: QuestionBankWorksheetParams,
) {
  const startedAt = Date.now();
  const shouldCarryConversation =
    params.taskContext?.mode === "continuation" ||
    shouldCarryWorksheetConversation(
      params.displayUserPrompt || params.latestUserPrompt,
    );
  const recentConversationText = shouldCarryConversation
    ? collectRecentConversationText(params.previousMessages)
    : "";
  const worksheetRequestText = buildExerciseTeacherRequest(
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
    promptText: worksheetRequestText,
    recentConversationText,
  });

  const useGeneratedWorksheetFallback = shouldUseGeneratedWorksheetFallback({
    curriculum,
    worksheetRequestText,
    taskContext: params.taskContext,
  });
  const needsClarification =
    !useGeneratedWorksheetFallback &&
    (curriculum.missing.length > 0 || !curriculum.courseId);

  if (needsClarification) {
    const worksheetClarification = !curriculum.courseId
      ? [
          curriculum.saveHint ||
            "要直接从题库里组卷，我还需要先知道你要用哪门课或知识领域的题。",
          "请补充课程或知识领域；如果你已经知道单元，也可以一起告诉我。",
          "直接回复示例：AP Calculus BC Unit 3 或 microeconomics unit 1",
        ].join("\n")
      : `${buildExerciseMissingContextMessage(curriculum)}\n\n补齐课程/单元后，我就可以直接从题库里组卷并导出 worksheet。`;
    const assistantText = worksheetClarification;
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
      toolNames: ["assemble_question_bank_worksheet"],
      nextConversationContext,
      isFirstTurn: params.isFirstTurn,
    });

    return createDirectToolResponse({
      text: assistantText,
      startedAt,
      totalMs: Math.max(0, Date.now() - startedAt),
      conversationId: params.conversation.id,
      memoryPreview: params.memoryPreview,
      toolName: "assemble_question_bank_worksheet",
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

  return createCustomAgentStreamResponse({
    startedAt,
    conversationId: params.conversation.id,
    memoryPreview: params.memoryPreview,
    hooks: params.streamHooks,
    execute: async (writer) => {
      const inferenceTexts = uniqueNonEmpty([
        params.displayUserPrompt,
        params.latestUserPrompt,
        worksheetRequestText,
        recentConversationText,
        ...params.uploadedFileNames,
        params.uploadedMaterialSummary,
      ]);
      const worksheetCount = inferWorksheetCount(inferenceTexts);
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
        `${curriculum.courseName ?? "题库"}${curriculum.unitLabel ? ` · ${curriculum.unitLabel}` : ""} ${presentation.titleSuffix}`;
      const requestedWorksheetType = inferExplicitExerciseTypeFromTexts(
        inferenceTexts,
      );
      const requestedWorksheetDifficulty =
        inferExplicitDifficultyFromTexts(inferenceTexts);
      const worksheetAssessmentStyle = inferenceTexts.some((text) =>
        /(实验|experiment)/i.test(text),
      )
        ? "experiment_analysis"
        : inferenceTexts.some((text) => /(数据|data)/i.test(text))
          ? "data_analysis"
          : inferenceTexts.some((text) => /(图|graph|chart|figure|diagram)/i.test(text))
            ? "graph_interpretation"
            : undefined;
      const worksheetHasFigure = inferenceTexts.some((text) =>
        /(图像|图表|配图|graph|chart|figure|diagram)/i.test(text),
      )
        ? true
        : undefined;

      const runGeneratedWorksheetFallback = async (reason: string) => {
        const pipelineToolCallId = `generate-worksheet:${params.conversation.id}:${Date.now()}`;
        const artifactSummary = `${reason}右侧 Canvas 会继续以排版后的${presentation.labelZh}形式流式补全。`;
        const language = inferExerciseLanguage(inferenceTexts);
        const exerciseModel = getResolvedLanguageModelForTask("assistant_exercises");
        let streamedMarkdown = "";
        const streamedQuestionNumbers = new Set<number>();

        writer.writePhase({
          phase: "curriculum_resolving",
          label: "锁定课程范围",
          status: "done",
          detail: reason,
          at: Date.now(),
        });
        writer.write({
          type: "tool-call",
          toolCallId: pipelineToolCallId,
          toolName: "generate_ap_exercises_pipeline",
          input: {
            mode: "worksheet_fallback",
            count: worksheetCount,
            exerciseType: requestedWorksheetType ?? "MC",
            language,
            courseId: curriculum.courseId ?? null,
            unitId: curriculum.unitId ?? null,
            topicId: curriculum.topicId ?? null,
          },
          at: Date.now(),
        });
        writer.writeArtifactChunk({
          toolCallId: pipelineToolCallId,
          artifactKind: outputKind,
          chunkType: "meta",
          data: {
            title: worksheetTitle,
            summary: artifactSummary,
            previewText: presentation.generatingPreviewText,
          },
        });
        writeArtifactTextDeltaChunks({
          writer,
          toolCallId: pipelineToolCallId,
          artifactKind: outputKind,
          delta: `# ${worksheetTitle}\n\n`,
          title: worksheetTitle,
          summary: artifactSummary,
          previewText: presentation.generatingPreviewText,
        });
        streamedMarkdown = `# ${worksheetTitle}\n\n`;
        writer.writePhase({
          phase: "question_generating",
          label: "生成试题并组卷",
          status: "running",
          detail: `正在直接生成 ${worksheetCount} 道题，并同步排版为${presentation.labelZh}。`,
          at: Date.now(),
        });

        const pipelineOutput = await runApExercisePipeline({
          model: exerciseModel,
          teacherRequest: worksheetRequestText,
          count: worksheetCount,
          exerciseType: requestedWorksheetType ?? "MC",
          language,
          courseId: curriculum.courseId ?? undefined,
          unitId: curriculum.unitId ?? undefined,
          topicId: curriculum.topicId ?? undefined,
          uploadedMaterials: params.uploadedMaterials,
          maxRepairRounds: 2,
          onTextDelta: async (delta) => {
            if (!delta) return;
            streamedMarkdown += delta;
            writeArtifactTextDeltaChunks({
              writer,
              toolCallId: pipelineToolCallId,
              artifactKind: outputKind,
              delta,
              title: worksheetTitle,
              summary: artifactSummary,
              previewText: presentation.generatingPreviewText,
            });

            const previewDocument =
              outputKind === "exam"
                ? buildExamDocumentFromMarkdown(streamedMarkdown, worksheetTitle)
                : buildWorksheetDocumentFromMarkdown(
                    streamedMarkdown,
                    worksheetTitle,
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
            requested: worksheetCount,
            fallbackUsed: pipelineOutput.fallbackUsed,
            fallbackReason: pipelineOutput.fallbackReason,
          },
          at: Date.now(),
        });

        if (pipelineOutput.passedResults.length === 0) {
          throw new Error("当前无法生成可用的试卷题目，请补充更明确的题型、主题或课程要求后重试。");
        }

        writer.writePhase({
          phase: "question_generating",
          label: "生成试题并组卷",
          status: "done",
          detail: `已生成 ${pipelineOutput.passedResults.length} 道题，并整理成${presentation.labelZh}。`,
          at: Date.now(),
          progressCurrent: pipelineOutput.passedResults.length,
          progressTotal: worksheetCount,
        });

        const sectionTitle =
          curriculum.unitLabel ||
          params.taskContext?.topic?.trim() ||
          params.taskContext?.curriculum?.trim() ||
          "生成试题";
        const worksheetDocument =
          outputKind === "exam"
            ? buildExamDocumentFromRenderInput({
                id: `${params.conversation.id}-generated-exam`,
                title: worksheetTitle,
                courseName: curriculum.courseName ?? params.taskContext?.curriculum ?? null,
                unitName: curriculum.unitLabel ?? null,
                downloadUrl: null,
                sections: [
                  {
                    title: sectionTitle,
                    rationale: reason,
                    exerciseIds: pipelineOutput.passedResults.map(
                      (_, index) => `${params.conversation.id}-generated-${index + 1}`,
                    ),
                  },
                ],
                exercises: pipelineOutput.passedResults.map((item, index) => ({
                  id: `${params.conversation.id}-generated-${index + 1}`,
                  exerciseType: item.exercise.type,
                  difficulty: fromExerciseDifficulty(item.exercise.difficulty),
                  questionText: item.exercise.questionText,
                  options:
                    item.exercise.type === "MC" && item.exercise.options
                      ? item.exercise.options.map((option) => ({
                          label: option.label,
                          text: option.text,
                          isCorrect: option.isCorrect,
                        }))
                      : [],
                  correctAnswer: item.exercise.correctAnswer,
                  solutionSteps: item.exercise.solutionSteps,
                  sourceLabel: "AI 生成",
                })),
              })
            : buildWorksheetDocumentFromRenderInput({
                id: `${params.conversation.id}-generated-worksheet`,
                title: worksheetTitle,
                courseName: curriculum.courseName ?? params.taskContext?.curriculum ?? null,
                unitName: curriculum.unitLabel ?? null,
                downloadUrl: null,
                sections: [
                  {
                    title: sectionTitle,
                    rationale: reason,
                    exerciseIds: pipelineOutput.passedResults.map(
                      (_, index) => `${params.conversation.id}-generated-${index + 1}`,
                    ),
                  },
                ],
                exercises: pipelineOutput.passedResults.map((item, index) => ({
                  id: `${params.conversation.id}-generated-${index + 1}`,
                  exerciseType: item.exercise.type,
                  difficulty: fromExerciseDifficulty(item.exercise.difficulty),
                  questionText: item.exercise.questionText,
                  options:
                    item.exercise.type === "MC" && item.exercise.options
                      ? item.exercise.options.map((option) => ({
                          label: option.label,
                          text: option.text,
                          isCorrect: option.isCorrect,
                        }))
                      : [],
                  correctAnswer: item.exercise.correctAnswer,
                  solutionSteps: item.exercise.solutionSteps,
                  sourceLabel: "AI 生成",
                })),
              });

        writer.writePhase({
          phase: "pdf_rendering",
          label: presentation.pdfPhaseLabel,
          status: "running",
          detail: "正在把生成好的题目排版成可下载 PDF。",
          at: Date.now(),
        });
        writer.write({
          type: "tool-call",
          toolCallId: pipelineToolCallId,
          toolName: presentation.exportToolName,
          input: {
            pageSize,
            templateVariant,
            includeAnswerKey,
            selectedCount: pipelineOutput.passedResults.length,
            sourceMode: "generated_fallback",
          },
          at: Date.now(),
        });

        const worksheetExercises = pipelineOutput.passedResults.map(
          mapGeneratedResultToWorksheetExercise,
        );
        const pdfBuffer =
          outputKind === "exam"
            ? await renderExamTypstPdf(
                buildExamPdfDataFromDocument(worksheetDocument),
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
                  courseName: curriculum.courseName ?? params.taskContext?.curriculum ?? null,
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
            sourceMode: "generated_fallback",
            pageSize,
            templateVariant,
            examTemplate:
              outputKind === "exam"
                ? params.latestParsedIntent.exportParams?.examTemplate ?? "exam-classic"
                : null,
            includeAnswerKey,
            includeExplanations: includeAnswerKey,
            questionCount: pipelineOutput.passedResults.length,
            curriculumCourseId: curriculum.courseId ?? null,
            curriculumUnitId: curriculum.unitId ?? null,
          },
        });
        const downloadUrl = `/api/pdf/download/${record.recordId}`;

        writer.write({
          type: "tool-result",
          toolCallId: pipelineToolCallId,
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

        const finalWorksheetDocument = {
          ...worksheetDocument,
          meta: {
            ...worksheetDocument.meta,
            downloadUrl,
          },
        };
        const fullWorksheetMarkdown =
          serializeDocumentToMarkdown(finalWorksheetDocument);
        const artifactSnapshot = buildArtifactRenderSnapshot({
          kind: outputKind,
          title: worksheetTitle,
          summary: artifactSummary,
          rawContent: fullWorksheetMarkdown,
          document: finalWorksheetDocument,
          sourceStage: "complete",
        });
        writer.writeArtifactChunk({
          toolCallId: pipelineToolCallId,
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

        const assistantText = buildGeneratedWorksheetAssistantText({
          title: worksheetTitle,
          courseLabel: curriculum.courseName ?? params.taskContext?.curriculum ?? null,
          unitLabel: curriculum.unitLabel,
          count: pipelineOutput.passedResults.length,
          reason,
          downloadUrl,
          fileSize: record.fileSize,
          pageCount,
          includeAnswerKey,
          outputKind,
        });
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
        await enqueueAgentMemoryFormation({
          teacherId: params.teacherId,
          profileKey: params.profileKey,
          conversationId: params.conversation.id,
          conversationTitle: params.conversation.title,
          assistantMessageId: assistantMessage.id,
          displayUserPrompt: params.displayUserPrompt,
          assistantText: assistantArtifactText,
          toolNames: [
            "generate_ap_exercises_pipeline",
            presentation.exportToolName,
          ],
          nextConversationContext,
          isFirstTurn: params.isFirstTurn,
        });

        writer.writeTextChunks(assistantArtifactText);
        return {
          totalMs: Math.max(0, Date.now() - startedAt),
          finishReason: "stop" as const,
        };
      };

      if (useGeneratedWorksheetFallback) {
        return runGeneratedWorksheetFallback(
          buildGeneratedWorksheetReason({
            curriculum,
            taskContext: params.taskContext,
          }),
        );
      }

      writer.writePhase({
        phase: "curriculum_resolving",
        label: "锁定课程范围",
        status: "done",
        detail: `已锁定 ${curriculum.courseName}${curriculum.unitLabel ? ` · ${curriculum.unitLabel}` : ""}。`,
        at: Date.now(),
      });

      writer.writePhase({
        phase: "question_selecting",
        label: "从题库检索并组题",
        status: "running",
        detail: `正在从题库里挑出 ${worksheetCount} 道最合适的题。`,
        at: Date.now(),
      });
      const assembleToolCallId = `assemble-question-bank:${params.conversation.id}:${Date.now()}`;
      writer.write({
        type: "tool-call",
        toolCallId: assembleToolCallId,
        toolName: "assemble_question_bank_worksheet",
        input: {
          courseId: curriculum.courseId,
          unitId: curriculum.unitId ?? null,
          count: worksheetCount,
          type: requestedWorksheetType ?? null,
          difficulty: requestedWorksheetDifficulty ?? null,
        },
        at: Date.now(),
      });

      const assembled = await assembleWorksheetFromSemanticSearch({
        supabase: params.supabase,
        teacherId: params.teacherId,
        courseId: curriculum.courseId || undefined,
        unitId: curriculum.unitId ?? undefined,
        title: worksheetTitle,
        description: params.displayUserPrompt || params.latestUserPrompt,
        query: worksheetRequestText,
        type: requestedWorksheetType,
        difficulty: requestedWorksheetDifficulty,
        assessmentStyle: worksheetAssessmentStyle,
        hasFigure: worksheetHasFigure,
        count: worksheetCount,
        maxCandidates: Math.min(Math.max(worksheetCount * 3, 12), 18),
        includeSeedExercise: false,
      });

      if (assembled.exercises.length === 0) {
        writer.writePhase({
          phase: "question_selecting",
          label: "从题库检索并组题",
          status: "done",
          detail: "题库候选不足，已切换到生成式组卷。",
          at: Date.now(),
          progressCurrent: 0,
          progressTotal: worksheetCount,
        });
        return runGeneratedWorksheetFallback(
          "当前题库没有命中足够的可用题目，已自动切到生成式组卷。",
        );
      }

      writer.write({
        type: "tool-result",
        toolCallId: assembleToolCallId,
        toolName: "assemble_question_bank_worksheet",
        output: {
          selectedCount: assembled.exercises.length,
          sectionCount: assembled.sections.length,
        },
        at: Date.now(),
      });

      writer.writePhase({
        phase: "question_selecting",
        label: "从题库检索并组题",
        status: "done",
        detail: `已选出 ${assembled.exercises.length} 道题，并完成 ${assembled.sections.length || 1} 个分组。`,
        at: Date.now(),
        progressCurrent: assembled.exercises.length,
        progressTotal: worksheetCount,
      });

      for (const [index, exercise] of assembled.exercises.entries()) {
        writer.writeQuestion(buildQuestionBankQuestionBlock(exercise, index));
      }

      const renderToolCallId = `render-question-bank-worksheet:${params.conversation.id}:${Date.now()}`;
      const previewWorksheetDocument =
        outputKind === "exam"
          ? buildExamDocumentFromRenderInput({
              id: assembled.worksheet.id,
              title: worksheetTitle,
              courseName: curriculum.courseName,
              unitName: curriculum.unitLabel,
              downloadUrl: null,
              sections: assembled.sections.map((section) => ({
                title: section.title,
                rationale: section.rationale,
                exerciseIds: section.exerciseIds,
              })),
              exercises: assembled.exercises.map((exercise) => ({
                id: exercise.id,
                exerciseType: exercise.exerciseType,
                difficulty: exercise.difficulty,
                questionText: exercise.questionText,
                options: exercise.options,
                correctAnswer: exercise.correctAnswer,
                solutionSteps: exercise.solutionSteps,
                sourceLabel: [exercise.sourceFileName, exercise.knowledgeSubskillLabel]
                  .filter(Boolean)
                  .join(" · "),
              })),
            })
          : buildWorksheetDocument({
              worksheet: assembled.worksheet,
              exercises: assembled.exercises,
              sections: assembled.sections,
              courseName: curriculum.courseName,
              unitName: curriculum.unitLabel,
              includeAnswerKey,
              downloadUrl: null,
            });
      const previewWorksheetMarkdown =
        serializeDocumentToMarkdown(previewWorksheetDocument);
      writer.writeArtifactChunk({
        toolCallId: renderToolCallId,
        artifactKind: outputKind,
        chunkType: "meta",
        data: {
          title: worksheetTitle,
          summary: assembled.summary,
          previewText: presentation.arrangingPreviewText,
        },
      });
      writeArtifactTextDeltaChunks({
        writer,
        toolCallId: renderToolCallId,
        artifactKind: outputKind,
        delta: previewWorksheetMarkdown,
        title: worksheetTitle,
        summary: assembled.summary,
        previewText: presentation.arrangingPreviewText,
      });

      writer.writePhase({
        phase: "pdf_rendering",
        label: presentation.pdfPhaseLabel,
        status: "running",
        detail: "正在把挑选出的题渲染成可下载 PDF。",
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
          selectedCount: assembled.exercises.length,
        },
        at: Date.now(),
      });

      const worksheetExercises = mapAssembledExercisesToWorksheetExercises(
        assembled.exercises,
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
                courseName: curriculum.courseName,
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
        worksheetId: assembled.worksheet.id,
        config: {
          sourceMode: "question_bank",
          courseId: curriculum.courseId,
          unitId: curriculum.unitId ?? null,
          pageSize,
          templateVariant,
          examTemplate:
            outputKind === "exam"
              ? params.latestParsedIntent.exportParams?.examTemplate ?? "exam-classic"
              : null,
          includeAnswerKey,
          includeExplanations: includeAnswerKey,
          questionCount: assembled.exercises.length,
          sectionCount: assembled.sections.length,
          exerciseIds: assembled.exercises.map((item) => item.id),
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

      const assistantText = buildWorksheetAssistantText({
        worksheet: assembled.worksheet,
        courseName: curriculum.courseName,
        unitLabel: curriculum.unitLabel,
        exercises: assembled.exercises,
        sections: assembled.sections,
        summary: assembled.summary,
        semanticQuery: assembled.semanticQuery,
        downloadUrl,
        fileSize: record.fileSize,
        pageCount,
        includeAnswerKey,
        outputKind,
        titleOverride: worksheetTitle,
      });
      const worksheetDocument =
        outputKind === "exam"
          ? buildExamDocumentFromRenderInput({
              id: record.recordId,
              title: worksheetTitle,
              courseName: curriculum.courseName,
              unitName: curriculum.unitLabel,
              downloadUrl,
              sections: assembled.sections.map((section) => ({
                title: section.title,
                rationale: section.rationale,
                exerciseIds: section.exerciseIds,
              })),
              exercises: assembled.exercises.map((exercise) => ({
                id: exercise.id,
                exerciseType: exercise.exerciseType,
                difficulty: exercise.difficulty,
                questionText: exercise.questionText,
                options: exercise.options,
                correctAnswer: exercise.correctAnswer,
                solutionSteps: exercise.solutionSteps,
                sourceLabel: [exercise.sourceFileName, exercise.knowledgeSubskillLabel]
                  .filter(Boolean)
                  .join(" · "),
              })),
            })
          : buildWorksheetDocument({
              worksheet: assembled.worksheet,
              exercises: assembled.exercises,
              sections: assembled.sections,
              courseName: curriculum.courseName,
              unitName: curriculum.unitLabel,
              includeAnswerKey,
              downloadUrl,
            });
      const fullWorksheetMarkdown = serializeDocumentToMarkdown(worksheetDocument);
      const artifactSnapshot = buildArtifactRenderSnapshot({
        kind: outputKind,
        title: worksheetTitle,
        summary: assembled.summary,
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
      await enqueueAgentMemoryFormation({
        teacherId: params.teacherId,
        profileKey: params.profileKey,
        conversationId: params.conversation.id,
        conversationTitle: params.conversation.title,
        assistantMessageId: assistantMessage.id,
        displayUserPrompt: params.displayUserPrompt,
        assistantText: assistantArtifactText,
        toolNames: [
          "assemble_question_bank_worksheet",
          presentation.exportToolName,
        ],
        nextConversationContext,
        isFirstTurn: params.isFirstTurn,
      });

      writer.writeTextChunks(assistantArtifactText);
      return {
        totalMs: Math.max(0, Date.now() - startedAt),
        finishReason: "stop",
      };
    },
  });
}
