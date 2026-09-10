import { addConversationMessage } from "@/lib/assistant/store";
import {
  buildAgentConversationContext,
  type AgentConversationContext,
  type AgentMemoryPreview,
} from "@/lib/agent/context-memory";
import {
  createCustomAgentStreamResponse,
  type AgentStreamWriter,
  type AgentStreamLifecycleHooks,
} from "@/lib/agent/chat-stream";
import {
  buildTaskContextTeacherPrompt,
  type StoredConversationMessage,
  LESSON_PLAN_REFINE_PATTERN,
  trimText,
  type UploadedMaterial,
} from "@/lib/agent/chat-shared";
import { embedArtifactPayload } from "@/lib/agent/artifact-payload";
import { buildArtifactRenderSnapshot } from "@/lib/agent/artifact-render-snapshot";
import {
  createInitialMarkdownOutlineProjectorState,
  diffMarkdownOutlineProjectorState,
  extractMarkdownOutlineProjectorState,
  type MarkdownOutlineProjectorState,
} from "@/lib/agent/markdown-outline-streaming";
import { generateLessonPlanWithWorkflow } from "@/lib/agent/lesson-plan-workflow";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import { createAgentLessonPlanContentLibraryItem } from "@/lib/content-library/sync";
import {
  buildLessonPlanDocumentFromMarkdown,
  serializeDocumentToMarkdown,
} from "@/lib/doc-engine/adapters";
import { enqueueAgentMemoryFormation } from "@/lib/agent/memory-jobs";
import { scheduleReliableAfterTask } from "@/lib/runtime/background-task";
import type { AgentTaskContext } from "@/lib/agent/task-context";

type ConversationStoreClient = Parameters<typeof addConversationMessage>[0];

type ConversationRecord = {
  id: string;
  title: string | null;
};

function createLessonPlanStreamProjector(params: {
  writer: AgentStreamWriter;
  toolCallId: string;
}) {
  let accumulatedMarkdown = "";
  let pendingDelta = "";
  let lastFlushAt = 0;
  let state = createInitialMarkdownOutlineProjectorState({
    title: "教案（生成中）",
    summary: "右侧 Canvas 会先显示模型决定的结构骨架，再按同一结构持续补全文本。",
    previewText: "正在等待模型给出教案结构骨架...",
  });

  const flush = (force = false) => {
    if (!pendingDelta && !force) return;
    const now = Date.now();
    if (!force && now - lastFlushAt < 160 && pendingDelta.length < 90) {
      return;
    }

    lastFlushAt = now;
    pendingDelta = "";

    const nextState = extractMarkdownOutlineProjectorState({
      streamText: accumulatedMarkdown,
      fallbackTitle: state.title,
      summary: state.summary,
      previewText: "正在按模型决定的结构补全教案正文...",
      complete: force,
    });
    const diff = diffMarkdownOutlineProjectorState(state, nextState);
    if (
      !diff.titleChanged &&
      !diff.summaryChanged &&
      !diff.previewTextChanged &&
      diff.changedNodes.length === 0
    ) {
      return;
    }

    params.writer.writeArtifactChunk({
      toolCallId: params.toolCallId,
      artifactKind: "lesson-plan",
      chunkType: "node-patch",
      data: {
        title: nextState.title,
        summary: nextState.summary,
        previewText: nextState.previewText,
        nodes: diff.changedNodes,
      },
    });
    state = nextState;
  };

  return {
    sendOutline() {
      params.writer.writeArtifactChunk({
        toolCallId: params.toolCallId,
        artifactKind: "lesson-plan",
        chunkType: "outline-solid",
        data: state,
      });
    },
    pushDelta(delta: string) {
      if (!delta) return;
      accumulatedMarkdown += delta;
      pendingDelta += delta;
      flush(false);
    },
    reset(previewText: string) {
      accumulatedMarkdown = "";
      pendingDelta = "";
      lastFlushAt = 0;
      state = createInitialMarkdownOutlineProjectorState({
        title: "教案（生成中）",
        summary: "右侧 Canvas 会先显示模型决定的结构骨架，再按同一结构持续补全文本。",
        previewText,
      });
      params.writer.writeArtifactChunk({
        toolCallId: params.toolCallId,
        artifactKind: "lesson-plan",
        chunkType: "outline-solid",
        data: state,
      });
    },
    complete(finalMarkdown: string, paramsForComplete?: {
      title?: string;
      summary?: string;
      previewText?: string;
    }) {
      accumulatedMarkdown = finalMarkdown;
      pendingDelta = "";
      const nextState = extractMarkdownOutlineProjectorState({
        streamText: finalMarkdown,
        fallbackTitle: paramsForComplete?.title ?? state.title,
        summary: paramsForComplete?.summary ?? state.summary,
        previewText: paramsForComplete?.previewText ?? "教案正文已完成。",
        complete: true,
      });
      const diff = diffMarkdownOutlineProjectorState(state, nextState);
      if (
        diff.titleChanged ||
        diff.summaryChanged ||
        diff.previewTextChanged ||
        diff.changedNodes.length > 0
      ) {
        params.writer.writeArtifactChunk({
          toolCallId: params.toolCallId,
          artifactKind: "lesson-plan",
          chunkType: "node-patch",
          data: {
            title: nextState.title,
            summary: nextState.summary,
            previewText: nextState.previewText,
            nodes: diff.changedNodes,
          },
        });
      }
      state = nextState;
    },
  };
}

export async function handleLessonPlanRequest(params: {
  supabase: ConversationStoreClient;
  teacherId: string;
  conversation: ConversationRecord;
  previousMessages: StoredConversationMessage[];
  isFirstTurn: boolean;
  displayUserPrompt: string;
  latestUserPrompt: string;
  previousLessonPlan: string;
  uploaded: {
    materials: UploadedMaterial[];
    warnings: string[];
  };
  taskContext?: AgentTaskContext | null;
  shouldPreferWeb: boolean;
  memoryPrompt: string;
  conversationContext: AgentConversationContext;
  retrievalHint?: string;
  profileKey: string;
  memoryPreview?: AgentMemoryPreview;
  streamHooks?: AgentStreamLifecycleHooks;
}) {
  const startedAt = Date.now();
  const allowCarryover =
    params.taskContext?.mode === "continuation" ||
    LESSON_PLAN_REFINE_PATTERN.test(
      params.displayUserPrompt || params.latestUserPrompt,
    );
  const teacherRequest =
    buildTaskContextTeacherPrompt({
      rawPrompt: params.displayUserPrompt || params.latestUserPrompt,
      taskContext: params.taskContext,
      includeFields: ["curriculum", "topic", "duration"],
    }) ||
    (params.uploaded.materials.length > 0
      ? "请基于我上传的材料生成可直接上课的完整教案。"
      : "请生成一份可直接上课的完整教案。");

  return createCustomAgentStreamResponse({
    startedAt,
    conversationId: params.conversation.id,
    memoryPreview: params.memoryPreview,
    hooks: params.streamHooks,
    execute: async (writer) => {
      const toolCallId = `lesson-plan:${params.conversation.id}:${Date.now()}`;
      const lessonPlanProjector = createLessonPlanStreamProjector({
        writer,
        toolCallId,
      });
      writer.write({
        type: "tool-call",
        toolCallId,
        toolName: "generate_lesson_plan_workflow",
        input: {
          includeWebSearch: params.shouldPreferWeb,
          uploadedMaterialCount: params.uploaded.materials.length,
          hasPreviousLessonPlan: Boolean(params.previousLessonPlan.trim()),
        },
        at: Date.now(),
      });
      writer.writeArtifactChunk({
        toolCallId,
        artifactKind: "lesson-plan",
        chunkType: "meta",
        data: {
          title: "教案（生成中）",
          summary: "右侧 Canvas 会先显示模型决定的结构骨架，再按同一结构持续补全文本。",
          previewText: "正在等待模型给出教案结构骨架...",
        },
      });
      lessonPlanProjector.sendOutline();
      writer.writePhase({
        phase: "lesson_planning",
        label: "整理教学目标与材料",
        status: "running",
        detail:
          params.uploaded.materials.length > 0
            ? allowCarryover
              ? "正在结合你上传的材料和必要上下文生成教案。"
              : "正在结合你上传的材料生成教案。"
            : allowCarryover
              ? "正在根据你的要求并参考必要上下文生成教案。"
              : "正在根据你的要求生成教案结构。",
        at: Date.now(),
      });

      const workflow = await generateLessonPlanWithWorkflow({
        model: getResolvedLanguageModelForTask("assistant_lesson_plan"),
        teacherId: params.teacherId,
        teacherRequest,
        includeWebSearch: params.shouldPreferWeb,
        uploadedMaterials: params.uploaded.materials,
        previousLessonPlan: allowCarryover ? params.previousLessonPlan : "",
        memoryPrompt: allowCarryover ? params.memoryPrompt : "",
        conversationSummary: allowCarryover
          ? params.conversationContext.olderSummary ||
            params.conversationContext.latestAssistantArtifact
          : "",
        retrievalHint: allowCarryover ? params.retrievalHint : undefined,
        onTextDelta: async (delta) => {
          if (!delta) return;
          lessonPlanProjector.pushDelta(delta);
        },
        onTextReset: async () => {
          lessonPlanProjector.reset("主生成失败，正在切换紧凑兜底生成...");
        },
      });

      if (!workflow.ok) {
        throw new Error("教案生成失败，请稍后重试。");
      }

      writer.write({
        type: "tool-result",
        toolCallId,
        toolName: "generate_lesson_plan_workflow",
        output: {
          sourceCount: workflow.sources.length,
          knowledgeCount: workflow.knowledgeCount,
          warningCount: workflow.warnings?.length ?? 0,
          revisionRounds: workflow.revisionRounds,
        },
        at: Date.now(),
      });

      writer.writePhase({
        phase: "lesson_planning",
        label: "整理教学目标与材料",
        status: "done",
        detail: "教案正文已生成，正在整理来源与告警信息。",
        at: Date.now(),
      });

      writer.writePhase({
        phase: "lesson_packaging",
        label: "整理教案正文",
        status: "running",
        detail: "正在生成可直接保存和查看的教案正文。",
        at: Date.now(),
      });

      const sourceLines =
        workflow.sources.length > 0
          ? `\n\n参考来源：\n${workflow.sources.map((item) => `- ${item.title} ${item.url}`).join("\n")}`
          : "";
      const lessonWarnings = [...params.uploaded.warnings, ...(workflow.warnings ?? [])];
      const warningLines =
        lessonWarnings.length > 0
          ? `\n\n材料处理提醒：\n${lessonWarnings.map((item) => `- ${item}`).join("\n")}`
          : "";
      const assistantText =
        `${workflow.markdown}${sourceLines}${warningLines}`.trim();
      const lessonDocument = buildLessonPlanDocumentFromMarkdown(workflow.markdown);
      const lessonRawContent =
        workflow.markdown.trim() ||
        (lessonDocument ? serializeDocumentToMarkdown(lessonDocument) : "");
      const artifactTitle = lessonDocument?.title?.trim() || "完整教案";
      const artifactSummary =
        trimText(
          workflow.markdown
            .split(/\n+/)
            .map((line) => line.replace(/^#+\s*/, "").trim())
            .find((line) => line && !line.startsWith(">")) || "",
          140,
        ) || "已生成完整教案，可在右侧 Canvas 查看正文。";
      const artifactSnapshot = buildArtifactRenderSnapshot({
        kind: "lesson-plan",
        title: artifactTitle,
        summary: artifactSummary,
        rawContent: lessonRawContent,
        document: lessonDocument,
        sourceStage: "complete",
      });
      lessonPlanProjector.complete(lessonRawContent, {
        title: artifactTitle,
        summary: artifactSummary,
        previewText: "教案正文已完成，正在写入当前会话。",
      });
      const persistedAssistantText = lessonDocument
        ? embedArtifactPayload(assistantText, {
            kind: "lesson-plan",
            title: artifactSnapshot.title,
            summary: artifactSnapshot.summary,
            rawContent: artifactSnapshot.rawContent,
            document: artifactSnapshot.document,
            htmlContent: artifactSnapshot.htmlContent,
            layoutConfig: artifactSnapshot.layoutConfig,
            renderVersion: artifactSnapshot.renderVersion,
            sourceStage: "persisted",
          })
        : assistantText;

      writer.writePhase({
        phase: "lesson_packaging",
        label: "整理教案正文",
        status: "done",
        detail: "教案正文已整理完成，正在写入会话和内容库。",
        at: Date.now(),
      });

      const routeTimings = {
        ...(workflow.timings ?? {}),
      } as Record<string, number>;
      const nextConversationContext = buildAgentConversationContext([
        ...params.previousMessages,
        { role: "user", content: params.displayUserPrompt },
        { role: "assistant", content: persistedAssistantText },
      ]);
      routeTimings.totalMs = Math.max(0, Date.now() - startedAt);

      writer.writeArtifactChunk({
        toolCallId,
        artifactKind: "lesson-plan",
        chunkType: "complete",
        data: {
          title: artifactSnapshot.title,
          summary: artifactSnapshot.summary,
          previewText: "教案正文已完成，正在写入当前会话。",
          rawContent: artifactSnapshot.rawContent,
          document: artifactSnapshot.document,
          htmlContent: artifactSnapshot.htmlContent,
          layoutConfig: artifactSnapshot.layoutConfig,
          renderVersion: artifactSnapshot.renderVersion,
          sourceStage: artifactSnapshot.sourceStage,
        },
      });

      const persistedAssistantMessage = await addConversationMessage(
        params.supabase,
        {
          teacherId: params.teacherId,
          conversationId: params.conversation.id,
          role: "assistant",
          content: persistedAssistantText,
        },
      );

      scheduleReliableAfterTask({
        taskType: "agent.lesson_plan_postprocess",
        taskKey: persistedAssistantMessage.id,
        teacherId: params.teacherId,
        conversationId: params.conversation.id,
        payload: {
          sourceCount: workflow.sources.length,
          knowledgeCount: workflow.knowledgeCount,
        },
        run: async () => {
          await createAgentLessonPlanContentLibraryItem({
            supabase: params.supabase,
            teacherId: params.teacherId,
            conversationId: params.conversation.id,
            messageId: persistedAssistantMessage.id,
            teacherRequest: params.displayUserPrompt,
            markdown: workflow.markdown,
            sources: workflow.sources.map((item) => ({
              title: item.title,
              url: item.url,
            })),
            warnings: lessonWarnings,
            qualityAudit: workflow.qualityAudit,
            revisionRounds: workflow.revisionRounds,
          });

          await enqueueAgentMemoryFormation({
            teacherId: params.teacherId,
            profileKey: params.profileKey,
            conversationId: params.conversation.id,
            conversationTitle: params.conversation.title,
            assistantMessageId: persistedAssistantMessage.id,
            displayUserPrompt: params.displayUserPrompt,
            assistantText: persistedAssistantText,
            toolNames: [
              "generate_lesson_plan_workflow",
              ...(workflow.sources.length > 0 ? ["web_search"] : []),
              ...(workflow.knowledgeCount > 0 ? ["search_teacher_knowledge"] : []),
            ],
            nextConversationContext,
            isFirstTurn: params.isFirstTurn,
            scheduleWithAfter: false,
          });
        },
      });

      writer.writeTextChunks(persistedAssistantText);
      return {
        totalMs: routeTimings.totalMs,
        finishReason: "stop",
      };
    },
  });
}
