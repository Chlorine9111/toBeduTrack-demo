import { addConversationMessage } from "@/lib/assistant/store";
import { buildAgentConversationContext } from "@/lib/agent/context-memory";
import {
  createCustomAgentStreamResponse,
  createDirectToolResponse,
  writeArtifactTextDeltaChunks,
} from "@/lib/agent/chat-stream";
import { countPdfPages, ensurePdfSizeLimit } from "@/lib/pdf/pdf-service";
import { buildExamPdfDataFromDocument } from "@/lib/pdf/document-typst-mappers";
import { persistPdfDocument } from "@/lib/pdf/pdf-storage";
import { renderExamTypstPdf } from "@/lib/typst/render-exam";
import { renderWorksheetTypstPdf } from "@/lib/typst/render-worksheet";
import {
  createTempQuestionPoolFromUploads,
  getTempQuestionPool,
} from "@/lib/agent/temp-question-pool";
import { assembleWorksheetFromTempPool } from "@/lib/worksheet/assemble-temp-pool";
import { enqueueAgentMemoryFormation } from "@/lib/agent/memory-jobs";
import {
  getAssessmentArtifactPresentation,
  buildExerciseTeacherRequest,
  buildTempPoolQuestionBlock,
  buildTempPoolWorksheetAssistantText,
  inferWorksheetCount,
  inferWorksheetPageSize,
  inferWorksheetTemplateVariant,
  mapTempPoolQuestionsToWorksheetExercises,
  resolveAssessmentArtifactKind,
  shouldCarryWorksheetConversation,
} from "@/lib/agent/workflows/worksheet-shared";
import { inferExplicitDifficultyFromTexts, inferExplicitExerciseTypeFromTexts } from "@/lib/chat/intent";
import { fromExerciseDifficulty, toExerciseDifficulty } from "@/types/exercise";
import { uniqueNonEmpty } from "@/lib/agent/chat-shared";
import { embedArtifactPayload } from "@/lib/agent/artifact-payload";
import { buildArtifactRenderSnapshot } from "@/lib/agent/artifact-render-snapshot";
import {
  buildExamDocumentFromRenderInput,
  buildWorksheetDocumentFromRenderInput,
  serializeDocumentToMarkdown,
} from "@/lib/doc-engine/adapters";
import {
  type TempPoolWorksheetParams,
  WORKSHEET_ANSWER_KEY_PATTERN,
} from "@/lib/agent/workflows/worksheet-direct-types";
import { scheduleReliableAfterTask } from "@/lib/runtime/background-task";

export async function handleTempPoolWorksheetRequest(
  params: TempPoolWorksheetParams,
) {
  const startedAt = Date.now();
  const taskUploadIds = params.taskContext?.attachmentUploadIds ?? [];
  const existingTempPool =
    taskUploadIds.length === 0
      ? await getTempQuestionPool({
          supabase: params.supabase,
          teacherId: params.teacherId,
          conversationId: params.conversation.id,
        }).catch(() => null)
      : null;

  if (taskUploadIds.length === 0 && !existingTempPool) {
    const assistantText =
      "当前会话里还没有可直接组卷的临时题池。请先上传 PDF，或先让我把这份 PDF 拆题后再组卷。";
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

    scheduleReliableAfterTask({
      taskType: "agent.temp_pool_missing_notice",
      taskKey: assistantMessage.id,
      teacherId: params.teacherId,
      conversationId: params.conversation.id,
      run: async () => {
        await enqueueAgentMemoryFormation({
          teacherId: params.teacherId,
          profileKey: params.profileKey,
          conversationId: params.conversation.id,
          conversationTitle: params.conversation.title,
          assistantMessageId: assistantMessage.id,
          displayUserPrompt: params.displayUserPrompt,
          assistantText,
          toolNames: ["assemble_temp_question_pool_worksheet"],
          nextConversationContext,
          isFirstTurn: params.isFirstTurn,
          scheduleWithAfter: false,
        });
      },
    });

    return createDirectToolResponse({
      text: assistantText,
      startedAt,
      totalMs: Math.max(0, Date.now() - startedAt),
      conversationId: params.conversation.id,
      memoryPreview: params.memoryPreview,
      toolName: "assemble_temp_question_pool_worksheet",
      toolInput: {
        attachmentMode: params.taskContext?.attachmentMode ?? null,
        uploadIds: taskUploadIds,
      },
      toolOutput: {
        status: "missing_pool",
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
      const poolToolCallId = `temp-pool:${params.conversation.id}:${Date.now()}`;
      writer.write({
        type: "tool-call",
        toolCallId: poolToolCallId,
        toolName: "prepare_temp_question_pool",
        input: {
          uploadIds: taskUploadIds,
          reuseExistingPool: Boolean(existingTempPool),
        },
        at: Date.now(),
      });
      writer.writePhase({
        phase: "temp_pool_preparing",
        label: "准备临时题池",
        status: "running",
        detail:
          taskUploadIds.length > 0
            ? "正在把刚上传 PDF 的拆题结果整理成临时题池。"
            : "正在读取当前会话里的临时题池。",
        at: Date.now(),
      });

      const tempPool =
        existingTempPool ??
        (await createTempQuestionPoolFromUploads({
          supabase: params.supabase,
          teacherId: params.teacherId,
          conversationId: params.conversation.id,
          uploadIds: taskUploadIds,
          label: params.taskContext?.attachmentsSummary || undefined,
        }));

      writer.write({
        type: "tool-result",
        toolCallId: poolToolCallId,
        toolName: "prepare_temp_question_pool",
        output: {
          poolId: tempPool.id,
          questionCount: tempPool.questionCount,
          readyQuestionCount: tempPool.readyQuestionCount,
        },
        at: Date.now(),
      });

      writer.writePhase({
        phase: "temp_pool_preparing",
        label: "准备临时题池",
        status: "done",
        detail: `已准备 ${tempPool.questionCount} 道题，可直接临时组卷。`,
        at: Date.now(),
        progressCurrent: tempPool.readyQuestionCount,
        progressTotal: tempPool.questionCount,
      });

      const inferenceTexts = uniqueNonEmpty([
        params.displayUserPrompt,
        params.latestUserPrompt,
        tempPool.label,
        tempPool.summaryText,
        ...tempPool.sourceFileNames,
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
      const requestedWorksheetType = inferExplicitExerciseTypeFromTexts(
        inferenceTexts,
      );
      const requestedWorksheetDifficultyRaw =
        inferExplicitDifficultyFromTexts(inferenceTexts);
      const requestedWorksheetDifficulty =
        typeof requestedWorksheetDifficultyRaw === "number"
          ? toExerciseDifficulty(requestedWorksheetDifficultyRaw)
          : undefined;

      writer.writePhase({
        phase: "question_selecting",
        label: "挑选题目并组织结构",
        status: "running",
        detail: `正在从当前 PDF 的 ${tempPool.questionCount} 道题里挑出 ${worksheetCount} 道题。`,
        at: Date.now(),
      });
      const assembleToolCallId = `assemble-temp-pool:${params.conversation.id}:${Date.now()}`;
      writer.write({
        type: "tool-call",
        toolCallId: assembleToolCallId,
        toolName: "assemble_temp_question_pool_worksheet",
        input: {
          count: worksheetCount,
          type: requestedWorksheetType ?? null,
          difficulty: requestedWorksheetDifficulty ?? null,
        },
        at: Date.now(),
      });

      const assembled = await assembleWorksheetFromTempPool({
        questions: tempPool.questions,
        requestText: buildExerciseTeacherRequest(
          params.displayUserPrompt || params.latestUserPrompt,
          params.previousMessages,
          params.taskContext?.mode === "continuation" ||
            shouldCarryWorksheetConversation(
              params.displayUserPrompt || params.latestUserPrompt,
            ),
          params.taskContext
            ? {
                curriculum: params.taskContext.curriculum,
                topic: params.taskContext.topic,
                count: params.taskContext.count,
                duration: params.taskContext.duration,
                scope: params.taskContext.scope,
              }
            : null,
        ),
        count: worksheetCount,
        type: requestedWorksheetType,
        difficulty: requestedWorksheetDifficulty,
      });

      writer.write({
        type: "tool-result",
        toolCallId: assembleToolCallId,
        toolName: "assemble_temp_question_pool_worksheet",
        output: {
          selectedCount: assembled.selectedQuestions.length,
          sectionCount: assembled.sections.length,
        },
        at: Date.now(),
      });

      writer.writePhase({
        phase: "question_selecting",
        label: "挑选题目并组织结构",
        status: "done",
        detail: `已选出 ${assembled.selectedQuestions.length} 道题，并完成 ${assembled.sections.length || 1} 个分组。`,
        at: Date.now(),
        progressCurrent: assembled.selectedQuestions.length,
        progressTotal: worksheetCount,
      });

      for (const question of assembled.selectedQuestions) {
        writer.writeQuestion(buildTempPoolQuestionBlock(question));
      }

      const renderToolCallId = `render-temp-worksheet:${params.conversation.id}:${Date.now()}`;
      const worksheetTitle =
        params.latestParsedIntent.exportParams?.worksheetTitle?.trim() ||
        `${tempPool.sourceFileNames[0]?.replace(/\.[^.]+$/, "") || "上传题目"} ${presentation.titleSuffix}`;
      const previewWorksheetDocument =
        outputKind === "exam"
          ? buildExamDocumentFromRenderInput({
              id: `preview-${renderToolCallId}`,
              title: worksheetTitle,
              courseName: null,
              unitName: tempPool.sourceFileNames.join("、"),
              downloadUrl: null,
              sections: assembled.sections.map((section) => ({
                title: section.title,
                rationale: section.rationale,
                exerciseIds: section.questionIds,
              })),
              exercises: assembled.selectedQuestions.map((question) => ({
                id: question.id,
                exerciseType: question.normalizedType,
                difficulty: fromExerciseDifficulty(question.difficultyLevel),
                questionText: question.stem,
                options:
                  question.options?.map((option) => ({
                    label: option.key,
                    text: option.content,
                  })) ?? [],
                correctAnswer: null,
                solutionSteps: null,
                sourceLabel: [question.sourceFileName, question.sourcePageNumber ? `第 ${question.sourcePageNumber} 页` : ""]
                  .filter(Boolean)
                  .join(" · "),
              })),
            })
          : buildWorksheetDocumentFromRenderInput({
              id: `preview-${renderToolCallId}`,
              title: worksheetTitle,
              courseName: null,
              unitName: tempPool.sourceFileNames.join("、"),
              downloadUrl: null,
              sections: assembled.sections.map((section) => ({
                title: section.title,
                rationale: section.rationale,
                exerciseIds: section.questionIds,
              })),
              exercises: assembled.selectedQuestions.map((question) => ({
                id: question.id,
                exerciseType: question.normalizedType,
                difficulty: fromExerciseDifficulty(question.difficultyLevel),
                questionText: question.stem,
                options:
                  question.options?.map((option) => ({
                    label: option.key,
                    text: option.content,
                  })) ?? [],
                correctAnswer: null,
                solutionSteps: null,
                sourceLabel: [question.sourceFileName, question.sourcePageNumber ? `第 ${question.sourcePageNumber} 页` : ""]
                  .filter(Boolean)
                  .join(" · "),
              })),
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
        detail: "正在把临时题池里的题渲染成可下载 PDF。",
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
          selectedCount: assembled.selectedQuestions.length,
        },
        at: Date.now(),
      });

      const worksheetExercises = mapTempPoolQuestionsToWorksheetExercises(
        assembled.selectedQuestions,
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
          sourceMode: "temporary_pool",
          poolId: tempPool.id,
          pageSize,
          templateVariant,
          examTemplate:
            outputKind === "exam"
              ? params.latestParsedIntent.exportParams?.examTemplate ?? "exam-classic"
              : null,
          includeAnswerKey,
          includeExplanations: includeAnswerKey,
          questionCount: assembled.selectedQuestions.length,
          sectionCount: assembled.sections.length,
          sourceFileNames: tempPool.sourceFileNames,
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

      const assistantText = buildTempPoolWorksheetAssistantText({
        poolLabel: tempPool.label,
        sourceFileNames: tempPool.sourceFileNames,
        selectedQuestions: assembled.selectedQuestions,
        sections: assembled.sections,
        summary: assembled.summary,
        selectionReasons: assembled.selectionReasons,
        downloadUrl,
        fileSize: record.fileSize,
        pageCount,
        includeAnswerKey,
        allowedBankFallback: false,
        outputKind,
        titleOverride: worksheetTitle,
      });
      const worksheetDocument =
        outputKind === "exam"
          ? buildExamDocumentFromRenderInput({
              id: record.recordId,
              title: worksheetTitle,
              courseName: null,
              unitName: tempPool.sourceFileNames.join("、"),
              downloadUrl,
              sections: assembled.sections.map((section) => ({
                title: section.title,
                rationale: section.rationale,
                exerciseIds: section.questionIds,
              })),
              exercises: assembled.selectedQuestions.map((question) => ({
                id: question.id,
                exerciseType: question.normalizedType,
                difficulty: fromExerciseDifficulty(question.difficultyLevel),
                questionText: question.stem,
                options:
                  question.options?.map((option) => ({
                    label: option.key,
                    text: option.content,
                  })) ?? [],
                correctAnswer: null,
                solutionSteps: null,
                sourceLabel: [question.sourceFileName, question.sourcePageNumber ? `第 ${question.sourcePageNumber} 页` : ""]
                  .filter(Boolean)
                  .join(" · "),
              })),
            })
          : buildWorksheetDocumentFromRenderInput({
              id: record.recordId,
              title: worksheetTitle,
              courseName: null,
              unitName: tempPool.sourceFileNames.join("、"),
              downloadUrl,
              sections: assembled.sections.map((section) => ({
                title: section.title,
                rationale: section.rationale,
                exerciseIds: section.questionIds,
              })),
              exercises: assembled.selectedQuestions.map((question) => ({
                id: question.id,
                exerciseType: question.normalizedType,
                difficulty: fromExerciseDifficulty(question.difficultyLevel),
                questionText: question.stem,
                options:
                  question.options?.map((option) => ({
                    label: option.key,
                    text: option.content,
                  })) ?? [],
                correctAnswer: null,
                solutionSteps: null,
                sourceLabel: [question.sourceFileName, question.sourcePageNumber ? `第 ${question.sourcePageNumber} 页` : ""]
                  .filter(Boolean)
                  .join(" · "),
              })),
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

      scheduleReliableAfterTask({
        taskType: "agent.temp_pool_worksheet_postprocess",
        taskKey: assistantMessage.id,
        teacherId: params.teacherId,
        conversationId: params.conversation.id,
        payload: {
          selectedCount: assembled.selectedQuestions.length,
          sourceFileNames: tempPool.sourceFileNames,
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
            toolNames: [
              "assemble_temp_question_pool_worksheet",
              presentation.exportToolName,
            ],
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
