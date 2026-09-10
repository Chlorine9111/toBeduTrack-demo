"use client";

import { useCallback, useEffect, useRef, useState, startTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, ScrollShadow, Separator, Spinner } from "@heroui/react";
import { Check, MessageSquare, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DURATION_PANEL, EASING_DEFAULT } from "./animation-constants";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { apiDelete, apiGet, apiPatch } from "@/lib/api/client";
import {
  AGENT_CONVERSATION_RESTORE_STATUS_EVENT,
  AGENT_CONVERSATION_STORAGE_KEY,
  AGENT_CONVERSATIONS_UPDATED_EVENT,
  AGENT_OPEN_CONVERSATION_EVENT,
  AGENT_RESET_EVENT,
  buildAgentConversationHref,
  syncAgentConversationUrl,
  type AgentConversationRestoreStatusDetail,
  type AgentOpenConversationDetail,
} from "@/lib/agent/workspace";

type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

type ConversationsResponse = {
  conversations: ConversationSummary[];
  total: number;
};

const CACHE_KEY = "deskmate-conversations-cache";
const MAX_DISPLAY = 30;

function readCachedConversations(): ConversationSummary[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCachedConversations(conversations: ConversationSummary[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(conversations.slice(0, MAX_DISPLAY)));
  } catch {
    // localStorage full — ignore
  }
}

function formatTime(value: string, isZh: boolean) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = Date.now();
  const diffMs = Math.max(0, now - date.getTime());
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) return isZh ? "刚刚" : "Just now";
  if (diffHours < 24) {
    return date.toLocaleTimeString(isZh ? "zh-CN" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (diffHours < 48) return isZh ? "昨天" : "Yesterday";
  if (diffHours < 168) {
    return date.toLocaleDateString(isZh ? "zh-CN" : "en-US", { weekday: "short" });
  }
  return date.toLocaleDateString(isZh ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatTitle(title: string, index: number, isZh: boolean) {
  const trimmed = title?.trim();
  if (trimmed) return trimmed;
  return isZh ? `对话 ${index + 1}` : `Chat ${index + 1}`;
}

type ConversationPanelProps = {
  open: boolean;
  onClose: () => void;
};

export default function ConversationPanel(props: ConversationPanelProps) {
  const { open } = props;
  const { isZh } = useAppI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentConversationId = searchParams.get("conversationId")?.trim() ?? "";
  const isAgentRoute =
    pathname === "/main" ||
    pathname === "/main/" ||
    pathname.startsWith("/main/agent");

  // SSR 安全：初始化为空数组，挂载后从 localStorage 读取缓存
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState("");
  const [openingId, setOpeningId] = useState("");
  const [renamingId, setRenamingId] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchConversations = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await apiGet<ConversationsResponse>("/api/chat/conversations", {
        signal,
      });
      if (signal?.aborted) return;
      const items = result.conversations.slice(0, MAX_DISPLAY);
      startTransition(() => {
        setConversations(items);
        setLoading(false);
      });
      writeCachedConversations(items);
    } catch {
      // 网络失败时保留缓存数据
      startTransition(() => setLoading(false));
    }
  }, []);

  // 挂载时：先从 localStorage 恢复缓存（零等待），再后台 revalidate
  useEffect(() => {
    const cached = readCachedConversations();
    if (cached.length > 0) {
      setConversations(cached);
      setLoading(false);
    }
    const controller = new AbortController();
    abortRef.current = controller;
    void fetchConversations(controller.signal);
    return () => controller.abort();
  }, [fetchConversations]);

  // 监听更新事件（新建/删除对话后触发）
  useEffect(() => {
    const handleUpdated = () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      void fetchConversations(controller.signal);
    };
    window.addEventListener(AGENT_CONVERSATIONS_UPDATED_EVENT, handleUpdated);
    return () => window.removeEventListener(AGENT_CONVERSATIONS_UPDATED_EVENT, handleUpdated);
  }, [fetchConversations]);

  const handleNewChat = useCallback(() => {
    localStorage.removeItem(AGENT_CONVERSATION_STORAGE_KEY);
    window.dispatchEvent(new Event(AGENT_RESET_EVENT));
    if (isAgentRoute) {
      router.replace("/main/agent");
    } else {
      router.push("/main/agent");
    }
  }, [isAgentRoute, router]);

  const handleOpen = useCallback(
    (id: string) => {
      if (!id || openingId) return;
      if (isAgentRoute && currentConversationId === id) return;
      setOpeningId(id);
      const href = buildAgentConversationHref(id);
      if (isAgentRoute) {
        syncAgentConversationUrl(id);
      }
      window.dispatchEvent(
        new CustomEvent<AgentOpenConversationDetail>(AGENT_OPEN_CONVERSATION_EVENT, {
          detail: { conversationId: id },
        }),
      );
      if (!isAgentRoute) {
        router.push(href);
      }
    },
    [isAgentRoute, currentConversationId, router, openingId],
  );

  useEffect(() => {
    const handleRestoreStatus = (
      event: Event,
    ) => {
      const detail = (event as CustomEvent<AgentConversationRestoreStatusDetail>).detail;
      if (!detail?.conversationId || detail.state !== "finished") return;
      setOpeningId((current) =>
        current === detail.conversationId ? "" : current,
      );
    };

    window.addEventListener(
      AGENT_CONVERSATION_RESTORE_STATUS_EVENT,
      handleRestoreStatus as EventListener,
    );
    return () =>
      window.removeEventListener(
        AGENT_CONVERSATION_RESTORE_STATUS_EVENT,
        handleRestoreStatus as EventListener,
      );
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!id) return;
      const target = conversations.find((c) => c.id === id);
      const title = target?.title?.trim() || (isZh ? "这条对话" : "this conversation");
      if (!window.confirm(isZh ? `确认删除"${title}"吗？` : `Delete "${title}"?`)) return;

      setDeletingId(id);
      try {
        await apiDelete(`/api/chat/conversations/${encodeURIComponent(id)}`);
        // Optimistic remove
        setConversations((prev) => {
          const next = prev.filter((c) => c.id !== id);
          writeCachedConversations(next);
          return next;
        });
        window.dispatchEvent(new Event(AGENT_CONVERSATIONS_UPDATED_EVENT));
        if (currentConversationId === id) {
          window.dispatchEvent(new Event(AGENT_RESET_EVENT));
          if (isAgentRoute) router.replace("/main/agent");
        }
      } catch {
        // 静默失败，下次 revalidate 会恢复
      } finally {
        setDeletingId("");
      }
    },
    [conversations, currentConversationId, isAgentRoute, isZh, router],
  );

  const handleStartRename = useCallback((id: string, currentTitle: string) => {
    setRenamingId(id);
    setRenameDraft(currentTitle);
    setTimeout(() => renameInputRef.current?.focus(), 50);
  }, []);

  const handleCancelRename = useCallback(() => {
    setRenamingId("");
    setRenameDraft("");
  }, []);

  const handleConfirmRename = useCallback(async () => {
    if (!renamingId) return;
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      handleCancelRename();
      return;
    }

    const original = conversations.find((c) => c.id === renamingId);
    if (original && trimmed === original.title?.trim()) {
      handleCancelRename();
      return;
    }

    // Optimistic update
    setConversations((prev) => {
      const next = prev.map((c) =>
        c.id === renamingId ? { ...c, title: trimmed } : c,
      );
      writeCachedConversations(next);
      return next;
    });
    const savedId = renamingId;
    handleCancelRename();

    try {
      await apiPatch(`/api/chat/conversations/${encodeURIComponent(savedId)}`, { title: trimmed });
    } catch {
      // 回滚
      if (original) {
        setConversations((prev) => {
          const next = prev.map((c) =>
            c.id === savedId ? { ...c, title: original.title } : c,
          );
          writeCachedConversations(next);
          return next;
        });
      }
    }
  }, [renamingId, renameDraft, conversations, handleCancelRename]);

  return (
    <div
      className="fixed left-0 top-0 z-50 flex h-full w-[240px] flex-col bg-[#FBFBFA] shadow-lg"
      style={{
        transform: open ? "translateX(0)" : "translateX(-100%)",
        visibility: open ? "visible" : "hidden",
        transition: `transform ${DURATION_PANEL}ms ${EASING_DEFAULT}, visibility ${DURATION_PANEL}ms ${EASING_DEFAULT}`,
      }}
      tabIndex={open ? undefined : -1}
    >
      {/* New Chat */}
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <span className="text-[13px] font-medium text-foreground">
          {isZh ? "对话" : "Chats"}
        </span>
        <Button
          isIconOnly
          variant="ghost"
          onPress={handleNewChat}
          className="h-7 w-7 min-w-0"
          aria-label={isZh ? "新建对话" : "New chat"}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <Separator className="mx-3" />

      {/* Conversation list */}
      <ScrollShadow className="flex min-h-0 flex-1 flex-col gap-0.5 px-2 pb-3 pt-2">
        {loading && conversations.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-default-400">
            <Spinner size="sm" className="h-3.5 w-3.5" />
            {isZh ? "加载中..." : "Loading..."}
          </div>
        ) : conversations.length === 0 ? (
          <div className="px-3 py-6 text-center text-[13px] text-default-300">
            {isZh ? "还没有历史对话" : "No conversations yet"}
          </div>
        ) : (
          conversations.map((conversation, index) => {
            const active = currentConversationId === conversation.id;
            const isOpening = openingId === conversation.id;
            const isRenaming = renamingId === conversation.id;
            return (
              <div
                key={conversation.id}
                className={cn(
                  "group flex items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] transition-colors",
                  active
                    ? "bg-default-200 font-medium text-foreground"
                    : isOpening
                      ? "bg-default-100 text-foreground"
                      : "text-default-500 hover:bg-default-50",
                )}
              >
                {isRenaming ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <input
                      ref={renameInputRef}
                      type="text"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleConfirmRename();
                        if (e.key === "Escape") handleCancelRename();
                      }}
                      onBlur={() => void handleConfirmRename()}
                      className="min-w-0 flex-1 rounded border border-default-300 bg-white px-1.5 py-0.5 text-[13px] text-foreground outline-none focus:border-blue-400"
                    />
                    <Button
                      isIconOnly
                      variant="ghost"
                      onPress={() => void handleConfirmRename()}
                      className="h-6 w-6 min-w-0 shrink-0 text-green-600"
                      aria-label={isZh ? "确认" : "Confirm"}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      isIconOnly
                      variant="ghost"
                      onPress={handleCancelRename}
                      className="h-6 w-6 min-w-0 shrink-0"
                      aria-label={isZh ? "取消" : "Cancel"}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      onPress={() => handleOpen(conversation.id)}
                      isDisabled={!!openingId}
                      className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left h-auto justify-start"
                    >
                      {isOpening ? (
                        <Spinner size="sm" className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-40" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {formatTitle(conversation.title, index, isZh)}
                      </span>
                      <span className="shrink-0 text-[11px] opacity-40">
                        {formatTime(conversation.updatedAt, isZh)}
                      </span>
                    </Button>
                    <Button
                      isIconOnly
                      variant="ghost"
                      onPress={() => handleStartRename(conversation.id, formatTitle(conversation.title, index, isZh))}
                      className={cn(
                        "h-6 w-6 min-w-0 shrink-0 transition-colors hover:text-blue-500",
                        "opacity-0 group-hover:opacity-100",
                      )}
                      aria-label={isZh ? "重命名" : "Rename"}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      isIconOnly
                      variant="ghost"
                      onPress={() => void handleDelete(conversation.id)}
                      isDisabled={deletingId === conversation.id}
                      className={cn(
                        "h-6 w-6 min-w-0 shrink-0 transition-colors hover:text-rose-500",
                        deletingId === conversation.id
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100",
                      )}
                      aria-label={isZh ? "删除" : "Delete"}
                    >
                      {deletingId === conversation.id ? (
                        <Spinner size="sm" className="h-3 w-3 text-rose-400" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                  </>
                )}
              </div>
            );
          })
        )}
      </ScrollShadow>
    </div>
  );
}
