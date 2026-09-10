"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from "react";
import { MessageSquare, ArrowUp, ChevronDown, X, Undo2 } from "lucide-react";
import { Button } from "@heroui/react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";
import type { OrganizeProgress } from "@/hooks/use-content-chat";

// ── 消息类型 ──────────────────────────────────────────────────

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

// ── Props ─────────────────────────────────────────────────────

type AssetChatBoxProps = {
  messages: ChatMessage[];
  isStreaming: boolean;
  progresses: OrganizeProgress[];
  canUndo: boolean;
  hasPendingPlan: boolean;
  onSend: (text: string) => void;
  onAbort: () => void;
  onUndo: () => void;
  onConfirmPlan: () => void;
  onCancelPlan: () => void;
};

// ── 自动收起超时 ──────────────────────────────────────────────

const AUTO_COLLAPSE_MS = 90_000;

// ── 移除 undo HTML 注释（显示用） ────────────────────────────

function stripUndoMetadata(text: string): string {
  return text.replace(/\s*<!-- undo:[^ ]* -->/g, "").trim();
}

// ── 进度卡片 ─────────────────────────────────────────────────

function ProgressCard({ progress }: { progress: OrganizeProgress }) {
  const statusIcon =
    progress.status === "running"
      ? "\u23F3"
      : progress.status === "done"
        ? "\u2713"
        : "\u2717";
  const statusColor =
    progress.status === "running"
      ? "text-default-400"
      : progress.status === "done"
        ? "text-success"
        : "text-danger";

  const progressText =
    progress.progressTotal && progress.progressTotal > 0
      ? ` (${progress.progressCurrent ?? 0}/${progress.progressTotal})`
      : "";

  return (
    <div className="flex items-center gap-2 rounded-lg bg-default-100 px-3 py-2 text-[13px]">
      <span className={cn("shrink-0 text-[14px]", statusColor)}>
        {statusIcon}
      </span>
      <span className="truncate text-foreground">
        {progress.label}{progressText}
      </span>
      {progress.detail && (
        <span className="truncate text-default-400">
          {progress.detail}
        </span>
      )}
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────

export default function AssetChatBox({
  messages,
  isStreaming,
  progresses,
  canUndo,
  hasPendingPlan,
  onSend,
  onAbort,
  onUndo,
  onConfirmPlan,
  onCancelPlan,
}: AssetChatBoxProps) {
  const { isZh } = useAppI18n();
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const autoCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 自动滚动到底部 ────────────────────────────────────────
  useEffect(() => {
    if (expanded) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, progresses, expanded]);

  // ── 展开时聚焦输入框 ──────────────────────────────────────
  useEffect(() => {
    if (expanded) {
      inputRef.current?.focus();
    }
  }, [expanded]);

  // ── 自动收起计时器 ────────────────────────────────────────
  const resetAutoCollapse = useCallback(() => {
    if (autoCollapseTimer.current) {
      clearTimeout(autoCollapseTimer.current);
    }
    autoCollapseTimer.current = setTimeout(() => {
      setExpanded(false);
    }, AUTO_COLLAPSE_MS);
  }, []);

  // 展开时启动计时器，收起时清除
  useEffect(() => {
    if (expanded && !isStreaming) {
      resetAutoCollapse();
    }
    return () => {
      if (autoCollapseTimer.current) {
        clearTimeout(autoCollapseTimer.current);
      }
    };
  }, [expanded, isStreaming, resetAutoCollapse]);

  // 流式传输期间暂停自动收起
  useEffect(() => {
    if (isStreaming && autoCollapseTimer.current) {
      clearTimeout(autoCollapseTimer.current);
      autoCollapseTimer.current = null;
    }
  }, [isStreaming]);

  // ── 发送消息 ──────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setInput("");
    setExpanded(true);
    resetAutoCollapse();
  }, [input, isStreaming, onSend, resetAutoCollapse]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      resetAutoCollapse();
    },
    [handleSend, resetAutoCollapse],
  );

  // ── 展开/收起 ────────────────────────────────────────────
  const toggleExpand = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  // ── 渲染 ─────────────────────────────────────────────────

  return (
    <div
      className={cn(
        "fixed bottom-0 right-6 z-30 w-[380px] max-w-[calc(100vw-48px)]",
        "flex flex-col overflow-hidden",
        "rounded-t-[12px] border border-b-0 border-default-300",
        "bg-white shadow-sm",
        "transition-all duration-300 ease-out",
        expanded ? "h-[380px]" : "h-[48px]",
      )}
      onClick={() => {
        if (!expanded) toggleExpand();
        resetAutoCollapse();
      }}
      onMouseMove={() => {
        if (expanded) resetAutoCollapse();
      }}
    >
      {/* ── 收起状态栏 / 头部 ───────────────────────────────── */}
      <div
        className={cn(
          "flex h-[48px] shrink-0 cursor-pointer items-center gap-2.5 px-4",
          "transition-colors duration-150",
          !expanded && "hover:bg-default-50",
        )}
        onClick={(e) => {
          if (expanded) {
            e.stopPropagation();
            toggleExpand();
          }
        }}
      >
        <MessageSquare size={16} className="shrink-0 text-default-400" />
        <span className="flex-1 text-[13px] font-medium text-default-500">
          {isStreaming
            ? (isZh ? "正在整理..." : "Organizing...")
            : (isZh ? "整理文件..." : "Organize files...")}
        </span>
        {expanded ? (
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            className="h-6 w-6 min-w-0 rounded text-default-300 hover:bg-default-200 hover:text-foreground-600"
            onPress={() => toggleExpand()}
          >
            <ChevronDown size={14} />
          </Button>
        ) : (
          isStreaming && (
            <span className="flex gap-[3px]">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-[5px] w-[5px] rounded-full bg-black/25"
                  style={{
                    animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </span>
          )
        )}
      </div>

      {/* ── 消息列表 ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 pb-2">
        {messages.length === 0 && progresses.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-[13px] text-default-300">
              {isZh ? "告诉我怎么整理你的文件" : "Tell me how to organize your files"}
            </p>
          </div>
        )}

        {/* 聊天消息 */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "mb-2",
              msg.role === "user" ? "flex justify-end" : "flex justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-[12px] px-3 py-2 text-[13px] leading-relaxed",
                msg.role === "user"
                  ? "bg-accent text-white"
                  : "bg-default-100 text-foreground",
              )}
            >
              {stripUndoMetadata(msg.content)}
            </div>
          </div>
        ))}

        {/* 操作进度卡片（过滤掉 pending-plan 和 context 等非展示事件） */}
        {progresses.length > 0 && (
          <div className="mb-2 flex flex-col gap-1.5">
            {progresses
              .filter((p) => !p.phase.startsWith("pending-plan") && p.phase !== "context" && !p.phase.startsWith("op-done"))
              .map((progress) => (
                <ProgressCard key={progress.id} progress={progress} />
              ))}
          </div>
        )}

        {/* 确认/取消计划按钮 */}
        {hasPendingPlan && !isStreaming && (
          <div className="mb-2 flex justify-start gap-2">
            <Button
              onPress={() => onConfirmPlan()}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-[12px] font-medium text-white hover:bg-accent/90"
            >
              {isZh ? "确认执行" : "Confirm"}
            </Button>
            <Button
              variant="ghost"
              onPress={() => onCancelPlan()}
              className="flex items-center gap-1.5 rounded-lg bg-default-100 px-3 py-1.5 text-[12px] font-medium text-foreground-500 hover:bg-default-200 hover:text-foreground"
            >
              {isZh ? "取消" : "Cancel"}
            </Button>
          </div>
        )}

        {/* 撤回按钮 */}
        {canUndo && !isStreaming && !hasPendingPlan && (
          <div className="mb-2 flex justify-start">
            <Button
              variant="ghost"
              size="sm"
              onPress={() => onUndo()}
              className="flex items-center gap-1.5 rounded-lg bg-default-100 px-3 py-1.5 text-[12px] font-medium text-foreground-500 hover:bg-default-200 hover:text-foreground"
            >
              <Undo2 size={12} />
              {isZh ? "撤回操作" : "Undo action"}
            </Button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── 输入区域 ────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-divider px-3 py-2.5">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isZh ? "告诉我怎么整理..." : "Tell me how to organize..."}
            rows={1}
            className={cn(
              "flex-1 resize-none rounded-lg bg-default-100 px-3 py-2",
              "text-[13px] text-foreground placeholder:text-default-300",
              "border-0 outline-none ring-0",
              "max-h-[80px] overflow-y-auto",
              "transition-colors focus:bg-default-200",
            )}
          />
          {isStreaming ? (
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              onPress={() => onAbort()}
              className="h-8 w-8 min-w-0 shrink-0 rounded-lg bg-default-200 text-foreground-400 hover:bg-default-300"
              aria-label={isZh ? "停止" : "Stop"}
            >
              <X size={14} />
            </Button>
          ) : (
            <Button
              isIconOnly
              size="sm"
              onPress={() => handleSend()}
              isDisabled={!input.trim()}
              className={cn(
                "h-8 w-8 min-w-0 shrink-0 rounded-lg",
                input.trim()
                  ? "bg-accent text-white hover:bg-accent/90"
                  : "bg-default-200 text-default-300",
              )}
              aria-label={isZh ? "发送" : "Send"}
            >
              <ArrowUp size={14} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
