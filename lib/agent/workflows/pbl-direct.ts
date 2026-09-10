import { addConversationMessage } from "@/lib/assistant/store";
import { buildAgentConversationContext, type AgentMemoryPreview } from "@/lib/agent/context-memory";
import { extractEmbeddedArtifactPayload, stripEmbeddedArtifactPayload } from "@/lib/agent/artifact-payload";
import {
  createCustomAgentStreamResponse,
  createDirectToolResponse,
  writeArtifactTextDeltaChunks,
  type AgentStreamLifecycleHooks,
} from "@/lib/agent/chat-stream";
import { buildPblArtifactAssistantText } from "@/lib/agent/pbl-artifact";
import { extractPlanMetadata } from "@/lib/pbl/metadata-extractor";
import { runPblWorkflow } from "@/lib/agent/pbl-workflow";
import { syncPblProjectContentLibraryItem } from "@/lib/content-library/sync";
import { generateChatIteration } from "@/lib/pbl/generator";
import { summarizeMarkdownPlain } from "@/lib/pbl/plan-markdown";
import { getProjectPlan, replaceProjectPlan, saveProjectPlan } from "@/lib/pbl/store";
import type { PblPlan } from "@/lib/pbl/types";
import { enqueueAgentMemoryFormation } from "@/lib/agent/memory-jobs";
import { type AgentTaskContext, type StoredConversationMessage } from "@/lib/agent/chat-shared";
import { type ConversationRecord, type ConversationStoreClient } from "@/lib/agent/workflows/worksheet-direct-types";
import { scheduleReliableAfterTask } from "@/lib/runtime/background-task";

type HandlePblRequestParams = {
  supabase: ConversationStoreClient;
  teacherId: string;
  conversation: ConversationRecord;
  previousMessages: StoredConversationMessage[];
  isFirstTurn: boolean;
  displayUserPrompt: string;
  profileKey: string;
  taskContext?: AgentTaskContext | null;
  memoryPreview?: AgentMemoryPreview;
  streamHooks?: AgentStreamLifecycleHooks;
};

function findLatestPblPlanId(previousMessages: StoredConversationMessage[]) {
  for (let index = previousMessages.length - 1; index >= 0; index -= 1) {
    const message = previousMessages[index];
    if (message.role !== "assistant") continue;
    const payload = extractEmbeddedArtifactPayload(message.content);
    if (payload?.kind === "pbl" && payload.metadata?.planId) {
      return payload.metadata.planId;
    }
  }
  return null;
}

async function updateExistingPblPlan(params: HandlePblRequestParams, existingPlan: PblPlan) {
  const markdownContent = await generateChatIteration({
    markdownContent: existingPlan.markdownContent,
    chatHistory: existingPlan.chatHistory,
    message: params.displayUserPrompt,
  });
  const metadata = await extractPlanMetadata(markdownContent);
  const now = new Date().toISOString();

  return {
    ...existingPlan,
    title: metadata.title,
    drivingQuestion: metadata.drivingQuestion,
    markdownContent,
    studentVersionMarkdown: markdownContent,
    overviewText: summarizeMarkdownPlain(markdownContent, 240),
    chatHistory: [
      ...existingPlan.chatHistory,
      {
        id: `${existingPlan.id}-user-${existingPlan.version + 1}`,
        role: "user" as const,
        content: params.displayUserPrompt,
        createdAt: now,
      },
      {
        id: `${existingPlan.id}-assistant-${existingPlan.version + 1}`,
        role: "assistant" as const,
        content: "已根据本轮要求更新整份 PBL 方案。",
        changeSummary: params.displayUserPrompt.slice(0, 120),
        createdAt: now,
      },
    ],
    version: existingPlan.version + 1,
    updatedAt: now,
  };
}

export async function handlePblRequest(params: HandlePblRequestParams) {
  const startedAt = Date.now();
  const pblTeacherRequest = params.displayUserPrompt;
  const shouldContinueExistingPlan = params.taskContext?.kind === "pbl" && params.taskContext.mode === "continuation";
  const latestPblPlanId = shouldContinueExistingPlan ? findLatestPblPlanId(params.previousMessages) : null;

  return createCustomAgentStreamResponse({
    startedAt,
    conversationId: params.conversation.id,
    memoryPreview: params.memoryPreview,
    hooks: params.streamHooks,
    execute: async (writer) => {
      const toolCallId = `pbl:${params.conversation.id}:${Date.now()}`;
      writer.write({
        type: "tool-call",
        toolCallId,
        toolName: shouldContinueExistingPlan ? "iterate_pbl_project" : "generate_pbl_project",
        input: {
          teacherRequest: pblTeacherRequest,
          latestPlanId: latestPblPlanId,
          mode: shouldContinueExistingPlan ? "continuation" : "new",
        },
        at: Date.now(),
      });
      writer.writePhase({
        phase: "pbl_generating",
        label: "生成 PBL 方案",
        status: "running",
        detail: shouldContinueExistingPlan
          ? "正在基于上一版方案继续迭代。"
          : "正在生成完整 PBL 项目方案。",
        at: Date.now(),
      });

      let plan: PblPlan;
      let isContinuation = false;
      let timings: Record<string, number> = {};

      if (latestPblPlanId) {
        const existingPlan = await getProjectPlan(
          { teacherId: params.teacherId, supabase: params.supabase, isMock: false },
          latestPblPlanId,
        );

        if (existingPlan) {
          plan = await updateExistingPblPlan(params, existingPlan);
          isContinuation = true;
          timings = { iterateMs: Math.max(0, Date.now() - startedAt) };
        } else {
          const pblResult = await runPblWorkflow({
            teacherRequest: pblTeacherRequest,
            taskContext: params.taskContext,
          });
          if (!pblResult.ok) {
            throw new Error(
              `PBL 项目生成失败：${pblResult.reason}\n\n请补充学科、年级和主题信息后重试，例如：帮我设计一个 AP Chemistry 高一的 PBL 项目，主题是水质检测，8 课时。`,
            );
          }
          plan = pblResult.plan;
          timings = pblResult.timings;
        }
      } else {
        const pblResult = await runPblWorkflow({
          teacherRequest: pblTeacherRequest,
          taskContext: params.taskContext,
        });

        if (!pblResult.ok) {
          throw new Error(
            `PBL 项目生成失败：${pblResult.reason}\n\n请补充学科、年级和主题信息后重试，例如：帮我设计一个 AP Chemistry 高一的 PBL 项目，主题是水质检测，8 课时。`,
          );
        }

        plan = pblResult.plan;
        timings = pblResult.timings;
      }

      const artifactSummary = summarizeMarkdownPlain(plan.markdownContent, 220);
      writer.write({
        type: "tool-result",
        toolCallId,
        toolName: shouldContinueExistingPlan ? "iterate_pbl_project" : "generate_pbl_project",
        output: {
          ok: true,
          planId: plan.id,
          title: plan.title,
          stageCount: plan.stages.length,
          updated: isContinuation,
          timings,
        },
        at: Date.now(),
      });
      writer.writePhase({
        phase: "pbl_generating",
        label: "生成 PBL 方案",
        status: "done",
        detail: "PBL 方案内容已完成，正在同步右侧 Canvas。",
        at: Date.now(),
      });
      writer.writeArtifactChunk({
        toolCallId,
        artifactKind: "pbl",
        chunkType: "meta",
        data: {
          title: plan.title,
          summary: artifactSummary,
          previewText: "正在流式整理 PBL 正文，右侧 Canvas 会先显示排版预览。",
        },
      });
      writeArtifactTextDeltaChunks({
        writer,
        toolCallId,
        artifactKind: "pbl",
        delta: plan.markdownContent,
        title: plan.title,
        summary: artifactSummary,
        previewText: "正在流式整理 PBL 正文，右侧 Canvas 会先显示排版预览。",
      });
      writer.writeArtifactChunk({
        toolCallId,
        artifactKind: "pbl",
        chunkType: "complete",
        data: {
          title: plan.title,
          summary: artifactSummary,
          previewText: "PBL 方案已完成，正在写入当前会话。",
          rawContent: plan.markdownContent,
        },
      });

      const assistantText = buildPblArtifactAssistantText(plan, { isContinuation });
      const assistantMessage = await addConversationMessage(params.supabase, {
        teacherId: params.teacherId,
        conversationId: params.conversation.id,
        role: "assistant",
        content: assistantText,
      });

      scheduleReliableAfterTask({
        taskType: "agent.pbl_postprocess",
        taskKey: assistantMessage.id,
        teacherId: params.teacherId,
        conversationId: params.conversation.id,
        payload: {
          projectId: plan.id,
        },
        run: async () => {
          if (isContinuation) {
            await replaceProjectPlan(
              { teacherId: params.teacherId, supabase: params.supabase, isMock: false },
              plan.id,
              plan,
            );
          } else {
            await saveProjectPlan(
              { teacherId: params.teacherId, supabase: params.supabase, isMock: false },
              plan,
            );
          }

          await syncPblProjectContentLibraryItem({
            supabase: params.supabase,
            teacherId: params.teacherId,
            plan,
          });

          const nextConvCtx = buildAgentConversationContext([
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
            assistantText: stripEmbeddedArtifactPayload(assistantText),
            toolNames: ["generate_pbl_project"],
            nextConversationContext: nextConvCtx,
            isFirstTurn: params.isFirstTurn,
            scheduleWithAfter: false,
          });
        },
      });

      writer.writeTextChunks(assistantText);
      return {
        totalMs: Math.max(0, Date.now() - startedAt),
        finishReason: "stop",
      };
    },
  });
}
