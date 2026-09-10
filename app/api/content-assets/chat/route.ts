import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createCustomAgentStreamResponse } from "@/lib/agent/chat-stream";
import { executeOrganizeContent } from "@/lib/agent/workflows/organize-content";
import { executeOrganizePlanStream } from "@/lib/agent/workflows/organize-content-executor";
import {
  buildContentStructureSnapshot,
  buildContextSummary,
  detectUndoIntent,
} from "@/lib/content-assets/chat-stream";
import { moveAsset } from "@/lib/content-assets/store";

// ── 请求校验 ────────────────────────────────────────────────

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const pendingPlanSchema = z.object({
  operations: z.array(z.object({
    action: z.enum(["move", "create_folder", "rename", "delete_folder", "delete_file"]),
    targetId: z.string(),
    targetTitle: z.string(),
    destinationFolder: z.string(),
    reason: z.string(),
  })),
  summary: z.string(),
});

const requestBodySchema = z.object({
  messages: z.array(chatMessageSchema).min(1),
  currentStructure: z
    .object({
      folders: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          parentId: z.string().nullable(),
        }),
      ),
      assets: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          folderId: z.string().nullable(),
          tags: z.array(z.string()),
        }),
      ),
    })
    .optional(),
  // 用户确认后传入的待执行计划
  pendingPlan: pendingPlanSchema.optional(),
});

// ── 从历史消息中提取上一次操作的撤回信息 ────────────────────

type UndoEntry = {
  assetId: string;
  previousFolderId: string | null;
};

function extractUndoEntries(messages: Array<{ role: string; content: string }>): UndoEntry[] {
  const entries: UndoEntry[] = [];
  // 从最近的 assistant 消息中提取 undo 元数据（格式：<!-- undo:assetId:folderId -->）
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    const matches = msg.content.matchAll(/<!-- undo:([^:]+):([^ ]*) -->/g);
    for (const match of matches) {
      entries.push({
        assetId: match[1],
        previousFolderId: match[2] || null,
      });
    }
    break; // 只取最近一条 assistant 消息
  }
  return entries;
}

// ── POST handler ────────────────────────────────────────────

export async function POST(request: Request) {
  const { teacherId, authBypass, errorMessage, errorStatus } =
    await getTeacherContext();

  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  let body: z.infer<typeof requestBodySchema>;
  try {
    const raw = await request.json();
    body = requestBodySchema.parse(raw);
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues.map((issue) => issue.message).join("; ")
        : "请求格式无效";
    return jsonError("VALIDATION_ERROR", message, 400);
  }

  const startedAt = Date.now();
  const adminSupabase = createAdminSupabaseClient();
  const client = { teacherId, supabase: adminSupabase };
  const lastUserMessage = body.messages.filter((m) => m.role === "user").at(-1);
  const userRequest = lastUserMessage?.content?.trim() ?? "";

  if (!userRequest) {
    return jsonError("VALIDATION_ERROR", "用户消息不能为空", 400);
  }

  // 检测撤回意图
  if (detectUndoIntent(userRequest)) {
    const undoEntries = extractUndoEntries(body.messages);
    if (undoEntries.length === 0) {
      return createCustomAgentStreamResponse({
        startedAt,
        execute: async (writer) => {
          writer.writeText("没有找到可撤回的操作记录。请先执行一次整理操作后再尝试撤回。");
          return { totalMs: Date.now() - startedAt, finishReason: "stop" };
        },
      });
    }

    return createCustomAgentStreamResponse({
      startedAt,
      execute: async (writer) => {
        writer.writePhase({
          phase: "undo",
          label: "撤回操作",
          status: "running",
        });

        let undoneCount = 0;
        const undoErrors: string[] = [];

        // 逆序执行撤回
        for (const entry of [...undoEntries].reverse()) {
          try {
            await moveAsset(client, entry.assetId, entry.previousFolderId);
            undoneCount += 1;
          } catch (error) {
            const msg = error instanceof Error ? error.message : "未知错误";
            undoErrors.push(msg);
          }
        }

        writer.writePhase({
          phase: "undo",
          label: "撤回操作",
          status: undoErrors.length > 0 ? "error" : "done",
        });

        const text = undoErrors.length > 0
          ? `已撤回 ${undoneCount} 项操作，${undoErrors.length} 项失败：${undoErrors.join("、")}`
          : `已成功撤回 ${undoneCount} 项操作，文件已移回原位。`;
        writer.writeText(text);

        return { totalMs: Date.now() - startedAt, finishReason: "stop" };
      },
    });
  }

  // ── 有 pendingPlan → 用户已确认，直接执行 ─────────────────
  if (body.pendingPlan) {
    const plan = body.pendingPlan;

    return createCustomAgentStreamResponse({
      startedAt,
      execute: async (writer) => {
        // 跳过规划，直接执行
        writer.writePhase({
          phase: "executing",
          label: "执行整理操作",
          status: "running",
          progressCurrent: 0,
          progressTotal: plan.operations.length,
        });

        let succeeded = 0;
        let failed = 0;
        const undoMetadata: string[] = [];

        for await (const event of executeOrganizePlanStream({
          teacherId,
          operations: plan.operations,
          client,
        })) {
          switch (event.phase) {
            case "executing":
              writer.writePhase({
                phase: "executing",
                label: "执行整理操作",
                status: "running",
                progressCurrent: event.index,
                progressTotal: event.total,
                detail: event.op.action === "move"
                  ? `move:${event.op.targetId}:${event.op.targetTitle}\u2192${event.op.destinationFolder}`
                  : `${event.op.action}: ${event.op.targetTitle || event.op.destinationFolder}`,
              });
              if (event.op.action === "move" && event.op.targetId) {
                undoMetadata.push(
                  `<!-- undo:${event.op.targetId}:${event.previousFolderId ?? ""} -->`,
                );
              }
              break;
            case "done":
              succeeded += 1;
              if (event.op.action === "move" && event.result) {
                writer.writePhase({
                  phase: `op-done-${event.index}`,
                  label: `已移动 ${event.op.targetTitle}`,
                  status: "done",
                  detail: `move-done:${event.op.targetId}:${event.result.folderId ?? ""}:${event.op.destinationFolder}`,
                });
              } else if (event.op.action === "create_folder") {
                writer.writePhase({
                  phase: `op-done-${event.index}`,
                  label: `已创建 ${event.op.destinationFolder}`,
                  status: "done",
                  detail: `folder-created:${event.op.destinationFolder}`,
                });
              } else if (event.op.action === "delete_folder") {
                writer.writePhase({
                  phase: `op-done-${event.index}`,
                  label: `已删除文件夹 ${event.op.targetTitle}`,
                  status: "done",
                  detail: `folder-deleted:${event.op.targetId}:${event.op.targetTitle}`,
                });
              } else if (event.op.action === "delete_file") {
                writer.writePhase({
                  phase: `op-done-${event.index}`,
                  label: `已删除 ${event.op.targetTitle}`,
                  status: "done",
                  detail: `file-deleted:${event.op.targetId}:${event.op.targetTitle}`,
                });
              }
              break;
            case "error":
              failed += 1;
              break;
            case "summary":
              succeeded = event.succeeded;
              failed = event.failed;
              break;
          }
        }

        writer.writePhase({
          phase: "executing",
          label: "执行整理操作",
          status: failed > 0 ? "error" : "done",
          progressCurrent: plan.operations.length,
          progressTotal: plan.operations.length,
        });

        const contextSummary = buildContextSummary({ plan, succeeded, failed });
        const resultText = failed > 0
          ? `${plan.summary}\n\n${succeeded} 项操作成功，${failed} 项失败。`
          : `${plan.summary}\n\n全部 ${succeeded} 项操作已完成。`;

        const undoBlock = undoMetadata.length > 0 ? `\n${undoMetadata.join("\n")}` : "";
        writer.writeText(resultText + undoBlock);

        writer.writePhase({
          phase: "context",
          label: contextSummary,
          status: "done",
        });

        return { totalMs: Date.now() - startedAt, finishReason: "stop" };
      },
    });
  }

  // ── 无 pendingPlan → 规划并返回计划等待确认 ─────────────────
  return createCustomAgentStreamResponse({
    startedAt,
    execute: async (writer) => {
      // Phase 1: 构建内容结构快照
      writer.writePhase({
        phase: "snapshot",
        label: "读取内容库",
        status: "running",
      });

      const structure = body.currentStructure ?? await buildContentStructureSnapshot(client);

      writer.writePhase({
        phase: "snapshot",
        label: "读取内容库",
        status: "done",
        detail: `${structure.assets.length} 个文件，${structure.folders.length} 个文件夹`,
      });

      // Phase 2: LLM 规划
      writer.writePhase({
        phase: "planning",
        label: "AI 规划整理方案",
        status: "running",
      });

      const contextMessages = body.messages
        .filter((m) => m.role === "assistant")
        .map((m) => m.content.replace(/<!-- undo:[^ ]* -->/g, "").trim())
        .filter(Boolean);

      const fullUserRequest = contextMessages.length > 0
        ? `之前的对话上下文：\n${contextMessages.join("\n")}\n\n当前请求：${userRequest}`
        : userRequest;

      const { plan } = await executeOrganizeContent({
        teacherId,
        userRequest: fullUserRequest,
        client,
      });

      writer.writePhase({
        phase: "planning",
        label: "AI 规划整理方案",
        status: "done",
        detail: plan.summary,
      });

      if (plan.operations.length === 0) {
        writer.writeText(plan.summary);
        return { totalMs: Date.now() - startedAt, finishReason: "stop" };
      }

      // Phase 3: 返回计划等待确认（不执行）
      // 构建可读的计划文本
      const planLines = plan.operations.map((op, i) => {
        const actionLabel = op.action === "move" ? "移动"
          : op.action === "create_folder" ? "新建文件夹"
          : op.action === "rename" ? "重命名"
          : op.action === "delete_folder" ? "删除文件夹"
          : "删除文件";
        const target = op.action === "create_folder"
          ? `「${op.destinationFolder}」`
          : (op.action === "delete_folder" || op.action === "delete_file")
            ? `「${op.targetTitle}」`
            : `「${op.targetTitle}」→「${op.destinationFolder}」`;
        return `${i + 1}. ${actionLabel} ${target}`;
      });

      const planText = `**整理计划** (${plan.operations.length} 项操作)\n\n${planLines.join("\n")}\n\n${plan.summary}`;

      // 通过特殊 phase 发送计划 JSON（前端用于确认按钮）
      writer.writePhase({
        phase: "pending-plan",
        label: "等待确认",
        status: "running",
        detail: JSON.stringify(plan),
      });

      writer.writeText(planText);

      return { totalMs: Date.now() - startedAt, finishReason: "stop" };
    },
  });
}
