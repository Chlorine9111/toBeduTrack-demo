"use client";

import { useState, useRef, useCallback } from "react";
import { parseAgentStreamEvents } from "@/lib/api/ui-message-stream";
import type { ChatMessage } from "@/components/main/content-assets/AssetChatBox";

// ── 进度事件（前端展示用） ──────────────────────────────────────

export type OrganizeProgress = {
  id: string;
  phase: string;
  label: string;
  status: "running" | "done" | "error";
  detail?: string;
  progressCurrent?: number;
  progressTotal?: number;
};

// ── 单个操作事件（按序累积，不去重，驱动动画） ───────────────────

export type OperationEvent = {
  index: number;
  total: number;
  detail: string;
  timestamp: number;
};

// ── 操作完成事件（驱动文件树实时更新） ──────────────────────────

export type DoneEvent = {
  kind: "move-done" | "folder-created";
  assetId?: string;
  newFolderId?: string;
  folderName?: string;
  timestamp: number;
};

// ── Undo 栈条目 ────────────────────────────────────────────────

export type UndoEntry = {
  assetId: string;
  previousFolderId: string | null;
};

// ── Hook 返回类型 ──────────────────────────────────────────────

type UseContentChatReturn = {
  messages: ChatMessage[];
  isStreaming: boolean;
  progresses: OrganizeProgress[];
  operationEvents: OperationEvent[];
  doneEvents: DoneEvent[];
  /** 待确认的计划（非 null 时显示确认/取消按钮） */
  pendingPlan: unknown | null;
  undoStack: UndoEntry[];
  canUndo: boolean;
  sendMessage: (text: string) => Promise<void>;
  /** 确认执行待定计划 */
  confirmPlan: () => Promise<void>;
  /** 取消待定计划 */
  cancelPlan: () => void;
  abort: () => void;
  undo: () => Promise<void>;
};

// ── 从 assistant 文本中提取 undo 元数据 ────────────────────────

function extractUndoEntries(text: string): UndoEntry[] {
  const entries: UndoEntry[] = [];
  const matches = text.matchAll(/<!-- undo:([^:]+):([^ ]*) -->/g);
  for (const match of matches) {
    entries.push({
      assetId: match[1],
      previousFolderId: match[2] || null,
    });
  }
  return entries;
}

// ── 移除 HTML 注释中的 undo 元数据（显示给用户的文本） ─────────

function stripUndoMetadata(text: string): string {
  return text.replace(/\s*<!-- undo:[^ ]* -->/g, "").trim();
}

// ── Hook 实现 ──────────────────────────────────────────────────

export function useContentChat(): UseContentChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [progresses, setProgresses] = useState<OrganizeProgress[]>([]);
  const [operationEvents, setOperationEvents] = useState<OperationEvent[]>([]);
  const [doneEvents, setDoneEvents] = useState<DoneEvent[]>([]);
  const [pendingPlan, setPendingPlan] = useState<unknown | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      if (isStreaming) return;

      // 添加用户消息
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: Date.now(),
      };

      const assistantMsgId = crypto.randomUUID();

      setMessages((prev) => [...prev, userMsg]);
      setProgresses([]);
      setOperationEvents([]);
      setDoneEvents([]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      // 构建请求体：包含完整对话历史
      const allMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      let combinedText = "";

      try {
        const response = await fetch("/api/content-assets/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: allMessages }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          const errorMsg =
            errorBody?.error?.message ?? `请求失败 (${response.status})`;
          throw new Error(errorMsg);
        }

        // 使用项目中已有的流解析器
        for await (const event of parseAgentStreamEvents(response)) {
          if (!event || typeof event !== "object") continue;

          switch (event.type) {
            case "text-delta": {
              combinedText += event.text ?? "";
              break;
            }
            case "phase": {
              const progress: OrganizeProgress = {
                id: `${event.phase}-${event.at}`,
                phase: event.phase,
                label: event.label ?? "",
                status:
                  event.status === "done" || event.status === "error"
                    ? event.status
                    : "running",
                detail: event.detail,
                progressCurrent: event.progressCurrent,
                progressTotal: event.progressTotal,
              };

              setProgresses((prev) => {
                // 同一 phase 的事件更新已有条目
                const existingIdx = prev.findIndex(
                  (p) => p.phase === event.phase,
                );
                if (existingIdx >= 0) {
                  return prev.map((p, i) =>
                    i === existingIdx ? progress : p,
                  );
                }
                return [...prev, progress];
              });

              // 捕获待确认计划
              if (event.phase === "pending-plan" && event.detail) {
                try {
                  setPendingPlan(JSON.parse(event.detail as string));
                } catch {
                  // 解析失败忽略
                }
              }

              // 解析操作完成事件 → 驱动文件树实时更新
              if (
                typeof event.phase === "string" &&
                event.phase.startsWith("op-done") &&
                event.detail
              ) {
                const detail = event.detail as string;
                if (detail.startsWith("move-done:")) {
                  // 格式: "move-done:assetId:newFolderId:folderName"
                  const parts = detail.split(":");
                  setDoneEvents((prev) => [
                    ...prev,
                    {
                      kind: "move-done",
                      assetId: parts[1],
                      newFolderId: parts[2] || undefined,
                      folderName: parts[3],
                      timestamp: Date.now(),
                    },
                  ]);
                } else if (detail.startsWith("folder-created:")) {
                  setDoneEvents((prev) => [
                    ...prev,
                    {
                      kind: "folder-created",
                      folderName: detail.replace("folder-created:", ""),
                      timestamp: Date.now(),
                    },
                  ]);
                }
              }

              // 累积单个操作事件（不去重，按序驱动动画）
              if (
                event.phase === "executing" &&
                event.status === "running" &&
                event.detail
              ) {
                setOperationEvents((prev) => [
                  ...prev,
                  {
                    index: event.progressCurrent ?? 0,
                    total: event.progressTotal ?? 0,
                    detail: event.detail!,
                    timestamp: Date.now(),
                  },
                ]);
              }
              break;
            }
            case "error": {
              combinedText += event.message ?? "操作失败";
              break;
            }
            case "finish": {
              // 流结束
              break;
            }
          }
        }

        // 提取 undo 元数据
        const newUndoEntries = extractUndoEntries(combinedText);
        if (newUndoEntries.length > 0) {
          setUndoStack(newUndoEntries);
        }

        // 添加 assistant 消息（移除 undo 元数据后展示）
        const displayText = stripUndoMetadata(combinedText);
        if (displayText) {
          setMessages((prev) => [
            ...prev,
            {
              id: assistantMsgId,
              role: "assistant",
              // 保留原始内容（含 undo 元数据），用于下一轮对话
              content: combinedText,
              timestamp: Date.now(),
            },
          ]);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setMessages((prev) => [
            ...prev,
            {
              id: assistantMsgId,
              role: "assistant",
              content: "已停止。",
              timestamp: Date.now(),
            },
          ]);
        } else {
          const errorMsg =
            error instanceof Error ? error.message : "请求失败，请稍后重试。";
          setMessages((prev) => [
            ...prev,
            {
              id: assistantMsgId,
              role: "assistant",
              content: errorMsg,
              timestamp: Date.now(),
            },
          ]);
        }
      } finally {
        abortRef.current = null;
        setIsStreaming(false);
      }
    },
    [isStreaming, messages],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // 确认执行待定计划
  const confirmPlan = useCallback(async () => {
    if (!pendingPlan || isStreaming) return;

    const plan = pendingPlan;
    setPendingPlan(null);

    // 添加用户确认消息
    const confirmMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: "确认执行",
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, confirmMsg]);
    setProgresses([]);
    setOperationEvents([]);
    setDoneEvents([]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const assistantMsgId = crypto.randomUUID();
    const allMessages = [...messages, confirmMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let combinedText = "";

    try {
      const response = await fetch("/api/content-assets/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: allMessages, pendingPlan: plan }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.error?.message ?? `请求失败 (${response.status})`);
      }

      for await (const event of parseAgentStreamEvents(response)) {
        if (!event || typeof event !== "object") continue;

        switch (event.type) {
          case "text-delta":
            combinedText += event.text ?? "";
            break;
          case "phase": {
            const progress: OrganizeProgress = {
              id: `${event.phase}-${event.at}`,
              phase: event.phase,
              label: event.label ?? "",
              status: event.status === "done" || event.status === "error" ? event.status : "running",
              detail: event.detail,
              progressCurrent: event.progressCurrent,
              progressTotal: event.progressTotal,
            };
            setProgresses((prev) => {
              const idx = prev.findIndex((p) => p.phase === event.phase);
              if (idx >= 0) return prev.map((p, i) => (i === idx ? progress : p));
              return [...prev, progress];
            });

            // 操作完成事件
            if (typeof event.phase === "string" && event.phase.startsWith("op-done") && event.detail) {
              const detail = event.detail as string;
              if (detail.startsWith("move-done:")) {
                const parts = detail.split(":");
                setDoneEvents((prev) => [...prev, {
                  kind: "move-done", assetId: parts[1],
                  newFolderId: parts[2] || undefined, folderName: parts[3],
                  timestamp: Date.now(),
                }]);
              } else if (detail.startsWith("folder-created:")) {
                setDoneEvents((prev) => [...prev, {
                  kind: "folder-created",
                  folderName: detail.replace("folder-created:", ""),
                  timestamp: Date.now(),
                }]);
              }
            }

            // 操作事件
            if (event.phase === "executing" && event.status === "running" && event.detail) {
              setOperationEvents((prev) => [...prev, {
                index: event.progressCurrent ?? 0,
                total: event.progressTotal ?? 0,
                detail: event.detail!,
                timestamp: Date.now(),
              }]);
            }
            break;
          }
          case "error":
            combinedText += event.message ?? "操作失败";
            break;
        }
      }

      const newUndoEntries = extractUndoEntries(combinedText);
      if (newUndoEntries.length > 0) setUndoStack(newUndoEntries);

      const displayText = stripUndoMetadata(combinedText);
      if (displayText) {
        setMessages((prev) => [...prev, {
          id: assistantMsgId, role: "assistant",
          content: combinedText, timestamp: Date.now(),
        }]);
      }
    } catch (error) {
      const errorMsg = error instanceof DOMException && error.name === "AbortError"
        ? "已停止。"
        : (error instanceof Error ? error.message : "请求失败");
      setMessages((prev) => [...prev, {
        id: assistantMsgId, role: "assistant",
        content: errorMsg, timestamp: Date.now(),
      }]);
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }, [pendingPlan, isStreaming, messages]);

  // 取消待定计划
  const cancelPlan = useCallback(() => {
    setPendingPlan(null);
    setMessages((prev) => [...prev, {
      id: crypto.randomUUID(), role: "assistant",
      content: "已取消。你可以重新告诉我怎么整理。",
      timestamp: Date.now(),
    }]);
  }, []);

  const undo = useCallback(async () => {
    if (undoStack.length === 0 || isStreaming) return;
    // 发送撤回请求，后端通过检测 "撤回" 关键词来执行
    await sendMessage("撤回");
    setUndoStack([]);
  }, [undoStack, isStreaming, sendMessage]);

  const canUndo = undoStack.length > 0 && !isStreaming;

  return {
    messages,
    isStreaming,
    progresses,
    operationEvents,
    doneEvents,
    pendingPlan,
    undoStack,
    canUndo,
    sendMessage,
    confirmPlan,
    cancelPlan,
    abort,
    undo,
  };
}
