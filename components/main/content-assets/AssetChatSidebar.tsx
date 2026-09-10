"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowUp,
  X,
  Undo2,
  PanelRightClose,
  Sparkles,
  FolderOpen,
  Trash2,
  Tag,
  Check,
  AlertCircle,
} from "lucide-react";
import { Button } from "@heroui/react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";
import type { OrganizeProgress } from "@/hooks/use-content-chat";

// ── 消息类型 ────────────────────────────────────────────────────

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

// ── Props ────────────────────────────────────────────────────────

type AssetChatSidebarProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

// ── 常量 ────────────────────────────────────────────────────────

const MIN_WIDTH = 280;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 340;

function stripUndoMetadata(text: string): string {
  return text.replace(/\s*<!-- undo:[^ ]* -->/g, "").trim();
}

// ── 快捷建议标签 ────────────────────────────────────────────────

const SUGGESTIONS = [
  {
    label: { zh: "按学科整理", en: "Organize by Subject" },
    icon: FolderOpen,
    prompt: { zh: "帮我按学科整理所有文件", en: "Organize all files by subject" },
  },
  {
    label: { zh: "清理空文件夹", en: "Clean Empty Folders" },
    icon: Trash2,
    prompt: { zh: "删除所有空文件夹", en: "Delete all empty folders" },
  },
  {
    label: { zh: "自动归类", en: "Auto Classify" },
    icon: Tag,
    prompt: { zh: "检查文件分类是否合理并修正", en: "Review file categories and correct them" },
  },
];

function EmptyState({ onSend, isZh }: { onSend: (text: string) => void; isZh: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      {/* 品牌图标 */}
      <motion.div
        className="mb-5 flex h-10 w-10 items-center justify-center rounded-[12px] bg-default-100"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        <Sparkles size={18} className="text-default-300" />
      </motion.div>

      <motion.p
        className="mb-1.5 text-[14px] font-medium text-foreground"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
      >
        {isZh ? "整理助手" : "Organizer Assistant"}
      </motion.p>
      <motion.p
        className="mb-5 text-center text-[12.5px] leading-relaxed text-default-400"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
      >
        {isZh ? "用自然语言整理你的内容库" : "Organize your library with natural language"}
      </motion.p>

      {/* 快捷建议 */}
      <div className="flex w-full flex-col gap-1.5">
        {SUGGESTIONS.map((s, i) => (
          <motion.button
            key={isZh ? s.label.zh : s.label.en}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2.5",
              "text-left text-[13px] text-default-500",
              "bg-default-100 transition-all duration-150",
              "hover:bg-default-100 hover:text-foreground",
            )}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.05 }}
            onClick={() => onSend(isZh ? s.prompt.zh : s.prompt.en)}
          >
            <s.icon size={14} className="shrink-0 text-default-300" />
            {isZh ? s.label.zh : s.label.en}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

// ── 进度步骤（带时间线连接） ────────────────────────────────────

function ProgressTimeline({ progresses }: { progresses: OrganizeProgress[] }) {
  if (progresses.length === 0) return null;

  return (
    <div className="mb-3 px-1">
      {progresses.map((p, i) => {
        const isLast = i === progresses.length - 1;
        const isDone = p.status === "done";
        const isError = p.status === "error";
        const isRunning = p.status === "running";

        return (
          <motion.div
            key={p.id}
            className="flex gap-2.5"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.04 }}
          >
            {/* 时间线 */}
            <div className="flex w-4 shrink-0 flex-col items-center">
              {/* 圆点指示器 */}
              {isRunning ? (
                <span className="relative mt-[5px] flex h-3.5 w-3.5 items-center justify-center">
                  <span className="absolute h-3 w-3 animate-ping rounded-full bg-default-200" />
                  <span className="h-[7px] w-[7px] rounded-full bg-default-400" />
                </span>
              ) : isDone ? (
                <span className="mt-[5px] flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#0F7B6C]">
                  <Check size={8} className="text-white" strokeWidth={3} />
                </span>
              ) : (
                <span className="mt-[5px] flex h-3.5 w-3.5 items-center justify-center rounded-full bg-danger">
                  <AlertCircle size={8} className="text-white" strokeWidth={3} />
                </span>
              )}
              {/* 连接线 */}
              {!isLast && (
                <div className={cn(
                  "w-[1.5px] flex-1 min-h-[12px]",
                  isDone ? "bg-[#0F7B6C]/20" : isError ? "bg-danger/20" : "bg-default-200",
                )} />
              )}
            </div>

            {/* 内容 */}
            <div className="min-w-0 flex-1 pb-2.5">
              <p className={cn(
                "truncate text-[13px] leading-[1.4]",
                isRunning ? "font-medium text-foreground" : "text-default-500",
              )}>
                {p.label}
                {p.progressTotal && p.progressTotal > 0
                  ? ` (${p.progressCurrent ?? 0}/${p.progressTotal})`
                  : ""}
              </p>
              {p.detail && isRunning && (
                <p className="mt-0.5 truncate text-[12px] text-default-400">
                  {p.detail}
                </p>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── 消息气泡 ────────────────────────────────────────────────────

function MessageBubble({ message, index }: { message: ChatMessage; index: number }) {
  const isUser = message.role === "user";
  const displayText = stripUndoMetadata(message.content);

  if (isUser) {
    return (
      <motion.div
        className="mb-3 flex justify-end"
        initial={{ opacity: 0, y: 6, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.12) }}
      >
        <div className="max-w-[85%] rounded-[12px] rounded-br-[4px] bg-accent/10 px-3.5 py-2.5 text-[13px] leading-[1.65] text-foreground">
          {displayText}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="mb-3"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.12) }}
    >
      <div className="relative rounded-[12px] rounded-bl-[4px] border border-divider bg-default-100 px-3.5 py-2.5">
        {/* 左侧暖色装饰线 */}
        <div className="absolute left-0 top-[8px] bottom-[8px] w-[2px] rounded-full bg-default-300" />
        <div className="whitespace-pre-wrap pl-1 text-[13px] leading-[1.65] text-foreground">
          {displayText}
        </div>
      </div>
    </motion.div>
  );
}

// ── 流式指示条 ──────────────────────────────────────────────────

function StreamingBar() {
  return (
    <div className="relative h-[2px] w-full overflow-hidden">
      <motion.div
        className="absolute inset-y-0 w-1/3 rounded-full bg-default-300"
        animate={{ left: ["-33%", "100%"] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

// ── 主组件 ──────────────────────────────────────────────────────

export default function AssetChatSidebar({
  open,
  onOpenChange,
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
}: AssetChatSidebarProps) {
  const { isZh } = useAppI18n();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [input, setInput] = useState("");
  const [isResizing, setIsResizing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── 自动滚动 ──────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, progresses, open]);

  // ── 展开时聚焦 ────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [open]);

  // ── 拖拽调整宽度 ─────────────────────────────────────────
  const handleResizeStart = useCallback((e: ReactPointerEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = width;

    const handleMove = (ev: globalThis.PointerEvent) => {
      const delta = startX - ev.clientX;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta)));
    };
    const handleUp = () => {
      setIsResizing(false);
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
    };
    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
  }, [width]);

  // ── 发送 ──────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setInput("");
  }, [input, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // ── 过滤进度 ─────────────────────────────────────────────
  const visibleProgresses = progresses.filter(
    (p) => !p.phase.startsWith("pending-plan") && p.phase !== "context" && !p.phase.startsWith("op-done"),
  );

  const isEmpty = messages.length === 0 && visibleProgresses.length === 0;

  return (
    <>
      {/* ── 收起状态：右侧触发按钮 ──────────────────────────── */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="chat-trigger"
            className={cn(
              "fixed right-0 top-1/2 z-30",
              "flex h-[68px] w-[28px] items-center justify-center",
              "rounded-l-[10px] border border-r-0 border-divider",
              "bg-white/90 backdrop-blur-sm",
              "text-default-300",
              "transition-all duration-200",
              "hover:w-[32px] hover:bg-white hover:text-foreground hover:shadow-sm",
            )}
            style={{ marginTop: -34 }}
            initial={{ x: 28, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 28, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            onClick={() => onOpenChange(true)}
            title={isZh ? "打开整理助手" : "Open organizer assistant"}
            aria-label={isZh ? "打开整理助手" : "Open organizer assistant"}
          >
            <Sparkles size={13} />
            {isStreaming && (
              <motion.span
                className="absolute top-2 right-1.5 h-[5px] w-[5px] rounded-full bg-[#F59E0B]"
                animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── 展开状态 ─────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="chat-sidebar"
            className="relative flex h-full shrink-0 flex-col overflow-hidden border-l border-divider bg-white"
            style={{ width }}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{
              width: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] },
              opacity: { duration: 0.15 },
            }}
          >
            {/* 拖拽手柄 */}
            <div
              className={cn(
                "absolute left-0 top-0 bottom-0 w-[5px] cursor-col-resize z-10",
                "transition-colors duration-150",
                isResizing ? "bg-default-300" : "hover:bg-default-200",
              )}
              onPointerDown={handleResizeStart}
            />

            {/* ── 头部 ────────────────────────────────────────── */}
            <div className="shrink-0">
              <div className="flex h-[42px] items-center gap-2 px-3.5">
                <Sparkles size={13} className="shrink-0 text-default-300" />
                <span className="flex-1 text-[13px] font-medium tracking-[-0.01em] text-foreground">
                  {isZh ? "整理助手" : "Organizer Assistant"}
                </span>
                <Button
                  isIconOnly
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 min-w-0 rounded-[6px] text-default-300 hover:bg-default-200 hover:text-foreground-600"
                  onPress={() => onOpenChange(false)}
                  aria-label={isZh ? "收起" : "Collapse"}
                >
                  <PanelRightClose size={14} />
                </Button>
              </div>
              {/* 流式指示 / 分隔线 */}
              {isStreaming ? <StreamingBar /> : (
                <div className="h-[1px] bg-default-200" />
              )}
            </div>

            {/* ── 内容区 ──────────────────────────────────────── */}
            <div className="relative flex-1 overflow-hidden">
              {/* 顶部渐隐 */}
              <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-3 bg-gradient-to-b from-white to-transparent" />

              <div className="h-full overflow-y-auto px-3.5 pt-4 pb-2 scrollbar-thin">
                {isEmpty ? (
                  <EmptyState onSend={onSend} isZh={isZh} />
                ) : (
                  <>
                    {messages.map((msg, i) => (
                      <MessageBubble key={msg.id} message={msg} index={i} />
                    ))}

                    {/* 进度时间线 */}
                    <ProgressTimeline progresses={visibleProgresses} />

                    {/* 确认/取消 */}
                    <AnimatePresence>
                      {hasPendingPlan && !isStreaming && (
                        <motion.div
                          className="mb-3 flex gap-2"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.2 }}
                        >
                          <Button
                            onPress={onConfirmPlan}
                            className={cn(
                              "flex flex-1 items-center justify-center gap-1.5 rounded-[8px] py-2.5",
                              "bg-accent text-[13px] font-medium text-white",
                              "hover:bg-accent/90 hover:shadow-sm",
                            )}
                          >
                            <Check size={13} strokeWidth={2.5} />
                            {isZh ? "确认执行" : "Confirm"}
                          </Button>
                          <Button
                            variant="ghost"
                            onPress={onCancelPlan}
                            className={cn(
                              "flex items-center justify-center rounded-[8px] px-4 py-2.5",
                              "text-[13px] font-medium text-foreground-400",
                              "hover:bg-default-100 hover:text-foreground",
                            )}
                          >
                            {isZh ? "取消" : "Cancel"}
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* 撤回 */}
                    <AnimatePresence>
                      {canUndo && !isStreaming && !hasPendingPlan && (
                        <motion.div
                          className="mb-3"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            onPress={onUndo}
                            className="flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12px] font-medium text-foreground-400 hover:bg-default-100 hover:text-foreground"
                          >
                            <Undo2 size={11} />
                            {isZh ? "撤回" : "Undo"}
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* 底部渐隐 */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-3 bg-gradient-to-t from-white to-transparent" />
            </div>

            {/* ── 输入区 ──────────────────────────────────────── */}
            <div className="shrink-0 px-3 pb-3 pt-1">
              <div className={cn(
                "flex items-end gap-1.5 rounded-[10px] border px-2.5 py-2 transition-colors duration-200",
                input.length > 0
                  ? "border-default-400 bg-white"
                  : "border-divider bg-default-100",
              )}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isZh ? "告诉我怎么整理..." : "Tell me how to organize..."}
                  rows={1}
                  className={cn(
                    "flex-1 resize-none bg-transparent py-0.5",
                    "text-[13px] text-foreground placeholder:text-default-300",
                    "border-0 outline-none ring-0",
                    "max-h-[72px] overflow-y-auto",
                  )}
                />
                {isStreaming ? (
                  <Button
                    isIconOnly
                    variant="ghost"
                    size="sm"
                    onPress={onAbort}
                    className="h-7 w-7 min-w-0 shrink-0 rounded-[6px] bg-default-200 text-foreground-400 hover:bg-default-200"
                    aria-label={isZh ? "停止" : "Stop"}
                  >
                    <X size={13} />
                  </Button>
                ) : (
                  <Button
                    isIconOnly
                    size="sm"
                    onPress={handleSend}
                    isDisabled={!input.trim()}
                    className={cn(
                      "h-7 w-7 min-w-0 shrink-0 rounded-[6px]",
                      input.trim()
                        ? "bg-accent text-white hover:bg-accent/90"
                        : "bg-transparent text-default-200",
                    )}
                    aria-label={isZh ? "发送" : "Send"}
                  >
                    <ArrowUp size={13} strokeWidth={2.5} />
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
