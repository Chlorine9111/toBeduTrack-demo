"use client";

import { ArrowRight, Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SearchPeekMeta,
  SearchPeekConversationPayload,
} from "@/lib/search/peek-types";

type ConversationPeekProps = {
  item: SearchPeekMeta;
  preview: SearchPeekConversationPayload;
};

function formatRelativeTime(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 1) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  return `${Math.floor(days / 30)} 个月前`;
}

function formatMessageTime(dateString: string) {
  try {
    return new Date(dateString).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

/** Strip JSON-like, HTML comments, and system content from preview text */
function cleanPreviewContent(text: string) {
  // Truncate if starts with { or [ (JSON blobs)
  if (/^\s*[{[]/.test(text)) {
    return "[系统数据]";
  }
  const cleaned = text
    // Remove HTML comments — complete or truncated (backend may cut mid-comment)
    .replace(/<!--[\s\S]*?(-->|$)/g, "")
    // Remove base64 blobs
    .replace(/[A-Za-z0-9+/=]{60,}/g, "")
    // Remove EDUTRACK_ prefixes that survive truncation
    .replace(/\bEDUTRACK_\w+:?\s*/gi, "")
    // Remove TRACK_ABSTRACT or other system prefixes
    .replace(/^[A-Z_]{4,}\s+/g, "")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "[空消息]";
}

export default function ConversationPeek({
  item,
  preview,
}: ConversationPeekProps) {
  // Filter out system messages for cleaner display
  const visibleMessages = preview.messages.filter(
    (m) => m.role !== "system",
  );

  return (
    <>
      {/* Header */}
      <header className="px-8 pt-8 pb-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-foreground">
            {item.title}
          </h1>
          <p className="text-[11px] font-medium text-foreground/40">
            {formatRelativeTime(item.updatedAt)}
            {preview.messageCount > preview.messages.length
              ? ` · 共 ${preview.messageCount} 条消息`
              : null}
          </p>
        </div>
      </header>

      {/* Conversation flow */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
        {visibleMessages.map((message) => {
          const isUser = message.role === "user";
          const content = cleanPreviewContent(message.contentPreview);
          const time = formatMessageTime(message.createdAt);

          return (
            <div key={message.id} className="flex gap-3">
              {/* Avatar */}
              <div
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  isUser
                    ? "bg-default-100"
                    : "bg-accent/10 text-accent",
                )}
              >
                {isUser ? (
                  <User className="h-4 w-4 text-default-400" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>

              {/* Bubble */}
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {isUser ? "你" : "Deskmate"}
                  </span>
                  {time ? (
                    <span className="text-[11px] text-default-300">
                      {time}
                    </span>
                  ) : null}
                </div>
                <div
                  className={cn(
                    "inline-block rounded-xl px-4 py-3 text-sm leading-relaxed",
                    isUser
                      ? "bg-default-100 text-foreground"
                      : "border border-divider bg-white text-default-500",
                  )}
                >
                  <p className="whitespace-pre-wrap wrap-break-word">
                    {content.length > 280
                      ? `${content.slice(0, 280)}…`
                      : content}
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        {preview.messageCount > preview.messages.length ? (
          <div className="py-2 text-center text-xs text-default-400">
            已显示 {visibleMessages.length} / {preview.messageCount} 条消息
          </div>
        ) : null}
      </div>
    </>
  );
}

export function ConversationPeekFooter({
  onContinueChat,
}: {
  onContinueChat?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onContinueChat}
      className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-xs transition-all hover:bg-accent/90 active:opacity-80"
    >
      <span>继续对话</span>
      <ArrowRight className="h-4 w-4" />
    </button>
  );
}
