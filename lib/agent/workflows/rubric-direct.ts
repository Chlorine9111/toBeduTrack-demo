import { addConversationMessage } from "@/lib/assistant/store";
import {
  buildAgentConversationContext,
  type AgentMemoryPreview,
} from "@/lib/agent/context-memory";
import { embedArtifactPayload } from "@/lib/agent/artifact-payload";
import { buildArtifactRenderSnapshot } from "@/lib/agent/artifact-render-snapshot";
import {
  createCustomAgentStreamResponse,
  writeArtifactTextDeltaChunks,
  writeArtifactTextSnapshot,
  type AgentStreamLifecycleHooks,
} from "@/lib/agent/chat-stream";
import {
  buildTaskContextTeacherPrompt,
  RUBRIC_REFINE_PATTERN,
  trimText,
  type StoredConversationMessage,
  type UploadedMaterial,
} from "@/lib/agent/chat-shared";
import { enqueueAgentMemoryFormation } from "@/lib/agent/memory-jobs";
import type { AgentTaskContext } from "@/lib/agent/task-context";
import { resolveApExerciseCurriculum } from "@/lib/agent/exercise-curriculum";
import { parseIntentFromText } from "@/lib/chat/intent";
import { syncRubricContentLibraryItem } from "@/lib/content-library/sync";
import {
  buildRubricDocumentFromDetail,
  parseRubricMarkdownToMock,
  serializeDocumentToMarkdown,
} from "@/lib/doc-engine/adapters";
import {
  extractRequestedRubricDimensionCount,
  extractRequestedRubricDimensionNames,
  extractRequestedRubricTitle,
} from "@/lib/ai/prompt-assembler";
import { buildTaskAwareMaterialContext } from "@/lib/agent/material-context";
import { generateRubricDetail } from "@/lib/rubric/generation";

type ConversationStoreClient = Parameters<typeof addConversationMessage>[0];

type ConversationRecord = {
  id: string;
  title: string | null;
};

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = `${value ?? ""}`.trim();
    if (normalized) return normalized;
  }
  return "";
}

function buildRubricTeacherRequest(params: {
  displayUserPrompt: string;
  latestUserPrompt: string;
  taskContext?: AgentTaskContext | null;
  uploadedMaterials: UploadedMaterial[];
  uploadedMaterialSummary: string;
  uploadedWarnings: string[];
  previousRubric: string;
}) {
  const rawPrompt = params.displayUserPrompt || params.latestUserPrompt;
  const hasStrongStructureEdit =
    Boolean(extractRequestedRubricDimensionCount(rawPrompt)) ||
    extractRequestedRubricDimensionNames(rawPrompt).length > 0 ||
    Boolean(extractRequestedRubricTitle(rawPrompt));
  const basePrompt =
    buildTaskContextTeacherPrompt({
      rawPrompt,
      taskContext: params.taskContext,
      includeFields: ["curriculum", "topic", "scope"],
    }) ||
    rawPrompt;
  const materialContext = buildTaskAwareMaterialContext({
    materials: params.uploadedMaterials,
    taskKind: "rubric",
    query: basePrompt,
    maxLength: 2_400,
  });

  const previousRubricPreview = (() => {
    if (!params.previousRubric) return "";
    if (!hasStrongStructureEdit) {
      return `以下是上一版 Rubric 内容，请在此基础上按用户要求修改（而非从零重新生成）：\n\n${params.previousRubric}`;
    }

    const parsedPrevious = parseRubricMarkdownToMock(params.previousRubric);
    if (!parsedPrevious) {
      return `上一版 Rubric 仅供修改参考，本轮显式要求优先，不要沿用旧标题或旧维度数量：\n${trimText(
        params.previousRubric,
        600,
      )}`;
    }

    const dimensionNames = parsedPrevious.dimensions
      .map((dimension) => dimension.name.trim())
      .filter(Boolean)
      .join("、");

    return [
      "上一版 Rubric 仅供修改参考，本轮显式要求优先，不要沿用旧标题或旧维度数量。",
      `- 上一版标题：${parsedPrevious.title}`,
      dimensionNames ? `- 上一版维度：${dimensionNames}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  })();

  return [
    previousRubricPreview,
    basePrompt,
    materialContext,
    params.uploadedMaterialSummary
      ? `上传材料摘要：${params.uploadedMaterialSummary}`
      : "",
    params.uploadedWarnings.length > 0
      ? `材料处理提醒：${params.uploadedWarnings.join("；")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function buildRubricArtifactSummary(
  title: string,
  dimensions: Array<{ name: string }>,
) {
  const dimensionSummary = dimensions
    .slice(0, 4)
    .map((item) => item.name.trim())
    .filter(Boolean)
    .join(" · ");

  return (
    trimText(dimensionSummary, 140) ||
    `已生成「${title}」的完整评分标准，可在右侧 Canvas 查看。`
  );
}

export async function handleRubricRequest(params: {
  supabase: ConversationStoreClient;
  teacherId: string;
  conversation: ConversationRecord;
  previousMessages: StoredConversationMessage[];
  isFirstTurn: boolean;
  displayUserPrompt: string;
  latestUserPrompt: string;
  previousRubric?: string;
  uploadedMaterials: UploadedMaterial[];
  uploadedMaterialSummary: string;
  uploadedWarnings: string[];
  profileKey: string;
  memoryPreview?: AgentMemoryPreview;
  taskContext?: AgentTaskContext | null;
  streamHooks?: AgentStreamLifecycleHooks;
}) {
  const startedAt = Date.now();
  const rawPrompt = params.displayUserPrompt || params.latestUserPrompt;
  const requestedRubricTitle = extractRequestedRubricTitle(rawPrompt);
  const allowCarryover =
    !/^\s*新任务[:：]?/i.test(rawPrompt) &&
    RUBRIC_REFINE_PATTERN.test(rawPrompt);
  const teacherRequest = buildRubricTeacherRequest({
    displayUserPrompt: params.displayUserPrompt,
    latestUserPrompt: params.latestUserPrompt,
    taskContext: params.taskContext,
    uploadedMaterials: params.uploadedMaterials,
    uploadedMaterialSummary: params.uploadedMaterialSummary,
    uploadedWarnings: params.uploadedWarnings,
    previousRubric: allowCarryover ? params.previousRubric ?? "" : "",
  });

  return createCustomAgentStreamResponse({
    startedAt,
    conversationId: params.conversation.id,
    memoryPreview: params.memoryPreview,
    hooks: params.streamHooks,
    execute: async (writer) => {
      const toolCallId = `rubric:${params.conversation.id}:${Date.now()}`;
      writer.write({
        type: "tool-call",
        toolCallId,
        toolName: "generate_rubric",
        input: {
          taskKind: params.taskContext?.kind ?? "rubric",
          curriculum: params.taskContext?.curriculum ?? "",
          topic: params.taskContext?.topic ?? "",
          hasUploadedMaterials:
            params.uploadedMaterials.length > 0 ||
            Boolean(params.uploadedMaterialSummary),
        },
        at: Date.now(),
      });
      writer.writeArtifactChunk({
        toolCallId,
        artifactKind: "rubric",
        chunkType: "meta",
        data: {
          title: requestedRubricTitle
            ? `${requestedRubricTitle}（生成中）`
            : "Rubric（生成中）",
          summary: "右侧 Canvas 会随着 Rubric 正文持续补全。",
          previewText: "正在流式生成 Rubric 正文...",
        },
      });
      writer.writePhase({
        phase: "rubric_planning",
        label: "整理评分维度",
        status: "running",
        detail: "正在识别任务上下文并生成可直接使用的评分标准。",
        at: Date.now(),
      });

      const curriculum = await resolveApExerciseCurriculum({
        supabase: params.supabase,
        promptText: teacherRequest,
      });
      const parsedIntent = parseIntentFromText(teacherRequest);
      const generalTopic = firstNonEmpty(
        params.taskContext?.topic,
        parsedIntent.topic,
        parsedIntent.topicFocus,
        parsedIntent.topicHint,
        params.displayUserPrompt,
        params.latestUserPrompt,
        "当前作业任务",
      );
      const track =
        curriculum.courseId &&
        (parsedIntent.track === "ap" ||
          Boolean(parsedIntent.courseHint) ||
          /\bap\b/i.test(params.taskContext?.curriculum ?? "") ||
          /\bap\b/i.test(teacherRequest))
          ? "ap"
          : "general";

      const rubric = await generateRubricDetail({
        supabase: params.supabase,
        teacherId: params.teacherId,
        track,
        courseId: track === "ap" ? curriculum.courseId ?? undefined : undefined,
        unitId: track === "ap" ? curriculum.unitId ?? undefined : undefined,
        topic: track === "general" ? generalTopic : undefined,
        subjectCategory:
          track === "general"
            ? firstNonEmpty(parsedIntent.subjectCategory, params.taskContext?.curriculum)
            : undefined,
        gradeLevel:
          track === "general" ? firstNonEmpty(parsedIntent.gradeLevel) : undefined,
        teacherRequest,
        onPreview: async (update) => {
          if (update.reset) {
            writeArtifactTextSnapshot({
              writer,
              toolCallId,
              artifactKind: "rubric",
              rawContent: update.snapshot,
              title: requestedRubricTitle || "Rubric（生成中）",
              previewText: "正在流式生成 Rubric 正文...",
            });
            return;
          }
          if (!update.delta) return;
          writeArtifactTextDeltaChunks({
            writer,
            toolCallId,
            artifactKind: "rubric",
            delta: update.delta,
            title: requestedRubricTitle || "Rubric（生成中）",
            previewText: "正在流式生成 Rubric 正文...",
          });
        },
      });

      writer.write({
        type: "tool-result",
        toolCallId,
        toolName: "generate_rubric",
        output: {
          track,
          rubricId: rubric.id,
          title: rubric.title,
          dimensionCount: rubric.dimensions.length,
          courseName: rubric.course.name,
          unitTitle: rubric.unit?.title ?? null,
        },
        at: Date.now(),
      });
      writer.writePhase({
        phase: "rubric_planning",
        label: "整理评分维度",
        status: "done",
        detail: "评分维度已生成，正在整理为右侧可预览文档。",
        at: Date.now(),
      });

      const rubricDocument = buildRubricDocumentFromDetail(rubric);
      const rawContent = serializeDocumentToMarkdown(rubricDocument);
      const artifactTitle = rubric.title.trim() || "Rubric";
      const artifactSummary = buildRubricArtifactSummary(
        artifactTitle,
        rubric.dimensions,
      );
      const artifactSnapshot = buildArtifactRenderSnapshot({
        kind: "rubric",
        title: artifactTitle,
        summary: artifactSummary,
        rawContent,
        document: rubricDocument,
        sourceStage: "complete",
      });
      const visibleAssistantText = [
        `已生成「${artifactTitle}」的完整评分标准，点击引用块可在右侧 Canvas 查看表格正文。`,
        rubric.course?.name ? `课程：${rubric.course.name}` : "",
        rubric.unit
          ? `单元：Unit ${rubric.unit.unitNumber} · ${rubric.unit.title}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
      const persistedAssistantText = embedArtifactPayload(visibleAssistantText, {
        kind: "rubric",
        title: artifactSnapshot.title,
        summary: artifactSnapshot.summary,
        rawContent: artifactSnapshot.rawContent,
        document: artifactSnapshot.document,
        htmlContent: artifactSnapshot.htmlContent,
        layoutConfig: artifactSnapshot.layoutConfig,
        renderVersion: artifactSnapshot.renderVersion,
        sourceStage: "persisted",
      });

      writer.writePhase({
        phase: "rubric_packaging",
        label: "整理 Rubric 正文",
        status: "running",
        detail: "正在写入会话并同步右侧 Canvas。",
        at: Date.now(),
      });

      writer.writeArtifactChunk({
        toolCallId,
        artifactKind: "rubric",
        chunkType: "complete",
        data: {
          title: artifactSnapshot.title,
          summary: artifactSnapshot.summary,
          previewText: "Rubric 已完成，正在写入当前会话。",
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

      if (track === "ap") {
        await syncRubricContentLibraryItem({
          supabase: params.supabase,
          teacherId: params.teacherId,
          rubricId: rubric.id,
          sourceConversationId: params.conversation.id,
          sourceMessageId: persistedAssistantMessage.id,
        });
      }

      const nextConversationContext = buildAgentConversationContext([
        ...params.previousMessages,
        { role: "user", content: params.displayUserPrompt },
        { role: "assistant", content: persistedAssistantText },
      ]);
      await enqueueAgentMemoryFormation({
        teacherId: params.teacherId,
        profileKey: params.profileKey,
        conversationId: params.conversation.id,
        conversationTitle: params.conversation.title,
        assistantMessageId: persistedAssistantMessage.id,
        displayUserPrompt: params.displayUserPrompt,
        assistantText: persistedAssistantText,
        toolNames: ["generate_rubric"],
        nextConversationContext,
        isFirstTurn: params.isFirstTurn,
      });

      writer.writePhase({
        phase: "rubric_packaging",
        label: "整理 Rubric 正文",
        status: "done",
        detail: "Rubric 已完成并写入当前对话。",
        at: Date.now(),
      });
      writer.writeTextChunks(persistedAssistantText);

      return {
        totalMs: Math.max(0, Date.now() - startedAt),
        finishReason: "stop",
      };
    },
  });
}
