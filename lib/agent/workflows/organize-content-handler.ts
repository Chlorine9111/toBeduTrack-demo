import { addConversationMessage } from "@/lib/assistant/store";
import { type AgentMemoryPreview } from "@/lib/agent/context-memory";
import {
  createDirectToolResponse,
  type AgentStreamLifecycleHooks,
} from "@/lib/agent/chat-stream";
import { type StoredConversationMessage } from "@/lib/agent/chat-shared";
import type { AgentTaskContext } from "@/lib/agent/task-context";
import { executeOrganizeContent, type OrganizePlan } from "@/lib/agent/workflows/organize-content";
import { executeOrganizePlan } from "@/lib/agent/workflows/organize-content-executor";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { buildConversationOverviewTitle } from "@/lib/agent/chat-direct-routing";

type ConversationStoreClient = Parameters<typeof addConversationMessage>[0];
type ConversationRecord = { id: string; title: string | null };

type HandleOrganizeContentParams = {
  supabase: ConversationStoreClient;
  teacherId: string;
  conversation: ConversationRecord;
  previousMessages: StoredConversationMessage[];
  isFirstTurn: boolean;
  displayUserPrompt: string;
  latestUserPrompt: string;
  profileKey: string;
  memoryPreview?: AgentMemoryPreview;
  taskContext?: AgentTaskContext | null;
  streamHooks?: AgentStreamLifecycleHooks;
};

function formatPlanAsMarkdown(plan: OrganizePlan): string {
  if (plan.operations.length === 0) {
    return plan.summary;
  }

  const lines = [
    `**整理计划：** ${plan.summary}`,
    "",
    "| # | 操作 | 目标 | 目标文件夹/新名称 | 原因 |",
    "|---|------|------|-----------------|------|",
  ];

  for (let i = 0; i < plan.operations.length; i++) {
    const op = plan.operations[i];
    const actionLabel =
      op.action === "move" ? "移动"
        : op.action === "create_folder" ? "新建文件夹"
        : op.action === "rename" ? "重命名"
        : op.action === "delete_folder" ? "删除文件夹"
        : op.action === "delete_file" ? "删除文件"
        : op.action === "categorize" ? "分类"
        : op.action;
    lines.push(
      `| ${i + 1} | ${actionLabel} | ${op.targetTitle || "-"} | ${op.destinationFolder} | ${op.reason} |`,
    );
  }

  lines.push("");
  lines.push(`共 ${plan.operations.length} 项操作，已自动执行完成。`);

  return lines.join("\n");
}

export async function handleOrganizeContentRequest(
  params: HandleOrganizeContentParams,
): Promise<Response> {
  const startedAt = Date.now();
  const userPrompt = (params.displayUserPrompt || params.latestUserPrompt).trim();

  const adminSupabase = createAdminSupabaseClient();
  const client = { teacherId: params.teacherId, supabase: adminSupabase };

  // Step 1: Generate organize plan via LLM
  const { plan } = await executeOrganizeContent({
    teacherId: params.teacherId,
    userRequest: userPrompt,
    client,
  });

  // Step 2: Auto-execute the plan (skip confirmation for simplicity)
  let executionSummary = "";
  if (plan.operations.length > 0) {
    const result = await executeOrganizePlan({
      teacherId: params.teacherId,
      operations: plan.operations,
      client,
    });
    if (result.failedCount > 0) {
      executionSummary = `\n\n执行结果：${result.executedCount} 项成功，${result.failedCount} 项失败。\n失败详情：\n${result.errors.map((e) => `- ${e}`).join("\n")}`;
    }
  }

  const totalMs = Date.now() - startedAt;
  const responseText = formatPlanAsMarkdown(plan) + executionSummary;

  // Save to conversation
  const title = buildConversationOverviewTitle({
    currentTitle: params.conversation.title,
    displayPrompt: params.displayUserPrompt,
    latestPrompt: params.latestUserPrompt,
    uploadedFileNames: [],
  });

  await addConversationMessage(params.supabase, {
    teacherId: params.teacherId,
    conversationId: params.conversation.id,
    role: "assistant",
    content: responseText,
  });

  return createDirectToolResponse({
    text: responseText,
    startedAt,
    totalMs,
    conversationId: params.conversation.id,
    memoryPreview: params.memoryPreview,
    toolName: "organize_content",
    toolInput: { userRequest: userPrompt },
    toolOutput: { plan },
    stepLabel: "整理内容库",
    hooks: params.streamHooks,
  });
}
