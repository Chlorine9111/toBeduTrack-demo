"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Avatar, Separator } from "@heroui/react";
import {
  ChevronLeft,
  FileText,
  Loader2,
  FolderTree,
  MessageSquare,
  MessageSquareText,
  Plus,
  Settings,
  Library,
  Trash2,
  X,
} from "lucide-react";
import LocaleToggle from "@/components/shared/LocaleToggle";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { formatLocaleDate, formatLocaleTime } from "@/lib/app-i18n/text";
import { requestWorksheetBuilderNavigation } from "@/lib/question-bank/builder-navigation-guard";
import { cn } from "@/lib/utils";
import { apiDelete, apiGet } from "@/lib/api/client";
import {
  AGENT_CONVERSATION_RESTORE_STATUS_EVENT,
  AGENT_CONVERSATION_STORAGE_KEY,
  AGENT_CONVERSATIONS_UPDATED_EVENT,
  AGENT_OPEN_CONVERSATION_EVENT,
  AGENT_RESET_EVENT,
  buildAgentConversationHref,
  buildAgentConversationStorageKey,
  syncAgentConversationUrl,
  type AgentConversationRestoreStatusDetail,
  type AgentOpenConversationDetail,
} from "@/lib/agent/workspace";

type NavHref =
  | "/main/agent"
  | "/main/content-assets"
  | "/main/feedback"
  | "/main/pbl"
  | "/main/question-bank"
  | "/main/wechat-editor"
  | "/main/settings";

type ConversationSummary = {
  id: string;
  title: string | null;
  updatedAt: string;
  createdAt: string;
};

type ConversationsResponse = {
  conversations: ConversationSummary[];
  total: number;
};

type SidebarProfile = {
  id: string;
  displayName: string;
  schoolName: string | null;
  email: string | null;
  initials: string;
};

type AccountProfileResponse = {
  profile: SidebarProfile;
};

function createEmptyProfile(isZh: boolean): SidebarProfile {
  return {
    id: "",
    displayName: isZh ? "教师账户" : "Teacher account",
    schoolName: null,
    email: null,
    initials: "T",
  };
}

function formatConversationTitle(title: string | null, index: number, isZh: boolean) {
  const normalized = title?.trim();
  if (normalized) return normalized;
  return isZh ? `未命名对话 ${index + 1}` : `Untitled chat ${index + 1}`;
}

type AppSidebarProps = {
  mobileOpen?: boolean;
  onClose?: () => void;
  desktopHidden?: boolean;
  onToggleDesktopHidden?: () => void;
};

export default function AppSidebar({
  mobileOpen = false,
  onClose,
  desktopHidden = false,
  onToggleDesktopHidden,
}: AppSidebarProps) {
  const { isZh, locale } = useAppI18n();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [account, setAccount] = useState<SidebarProfile>(() => createEmptyProfile(isZh));
  const [accountLoading, setAccountLoading] = useState(true);
  const [accountErrorText, setAccountErrorText] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsErrorText, setConversationsErrorText] = useState("");
  const [deletingConversationId, setDeletingConversationId] = useState("");
  const [openingConversationId, setOpeningConversationId] = useState("");

  const isAgentRoute = pathname === "/main" || pathname === "/main/" || pathname.startsWith("/main/agent");
  const isLibraryRoute =
    pathname.startsWith("/main/content-assets") ||
    pathname.startsWith("/main/library");
  const isFeedbackRoute = pathname.startsWith("/main/feedback");
  const currentConversationId = searchParams.get("conversationId")?.trim() ?? "";
  const conversationStorageKey = buildAgentConversationStorageKey(account.id);
  const navItems = [
    {
      href: "/main/agent",
      label: isZh ? "对话" : "Chat",
      icon: MessageSquare,
      isActive: isAgentRoute,
      testId: "sidebar-nav-agent",
    },
    {
      href: "/main/content-assets",
      label: isZh ? "内容库" : "Library",
      icon: Library,
      isActive: isLibraryRoute,
      testId: "sidebar-nav-library",
    },
    {
      href: "/main/question-bank",
      label: isZh ? "题库" : "Question Bank",
      icon: FolderTree,
      isActive: pathname.startsWith("/main/question-bank"),
      testId: "sidebar-nav-question-bank",
    },
    {
      href: "/main/feedback",
      label: isZh ? "反馈" : "Feedback",
      icon: MessageSquareText,
      isActive: isFeedbackRoute,
      testId: "sidebar-nav-feedback",
    },
    {
      href: "/main/wechat-editor",
      label: isZh ? "公众号编辑器" : "WeChat Editor",
      icon: FileText,
      isActive: pathname.startsWith("/main/wechat-editor"),
      testId: "sidebar-nav-wechat-editor",
    },
    {
      href: "/main/settings",
      label: isZh ? "设置" : "Settings",
      icon: Settings,
      isActive: pathname.startsWith("/main/settings"),
      testId: "sidebar-nav-settings",
    },
  ] as const;

  const formatConversationTime = (value: string) => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";

    const now = Date.now();
    const diffHours = Math.max(0, now - date.getTime()) / (1000 * 60 * 60);
    if (diffHours < 24) {
      return formatLocaleTime(locale, date, {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    return formatLocaleDate(locale, date, {
      month: "2-digit",
      day: "2-digit",
    });
  };

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadProfile = async () => {
      const profileResult = await apiGet<AccountProfileResponse>("/api/account/profile", {
        signal: controller.signal,
      });
      if (cancelled || controller.signal.aborted) return;
      setAccount(profileResult.profile);
      setAccountErrorText("");
      setAccountLoading(false);
    };

    const loadConversations = async () => {
      const conversationsResult = await apiGet<ConversationsResponse>("/api/chat/conversations", {
        signal: controller.signal,
      });
      if (cancelled || controller.signal.aborted) return;
      setConversations(conversationsResult.conversations.slice(0, 12));
      setConversationsErrorText("");
      setConversationsLoading(false);
    };

    const loadSidebarData = async () => {
      const [profileResult, conversationsResult] = await Promise.allSettled([
        loadProfile(),
        loadConversations(),
      ]);

      if (cancelled || controller.signal.aborted) return;

      if (profileResult.status === "rejected") {
        setAccount(createEmptyProfile(isZh));
        setAccountErrorText(isZh ? "账户信息读取失败" : "Failed to load account");
        setAccountLoading(false);
      }

      if (conversationsResult.status === "rejected") {
        setConversations([]);
        setConversationsErrorText(isZh ? "最近对话读取失败" : "Failed to load recent chats");
        setConversationsLoading(false);
      }
    };

    void loadSidebarData();

    const handleProfileUpdated = () => {
      setAccountLoading(true);
      void loadProfile()
        .catch(() => {
          if (cancelled || controller.signal.aborted) return;
          setAccount(createEmptyProfile(isZh));
          setAccountErrorText(isZh ? "账户信息读取失败" : "Failed to load account");
        })
        .finally(() => {
          if (!cancelled && !controller.signal.aborted) {
            setAccountLoading(false);
          }
        });
    };

    const handleConversationsUpdated = () => {
      setConversationsLoading(true);
      void loadConversations().catch(() => {
        if (cancelled || controller.signal.aborted) return;
        setConversations([]);
        setConversationsErrorText(isZh ? "最近对话读取失败" : "Failed to load recent chats");
        setConversationsLoading(false);
      });
    };

    const handleSigningOut = () => {
      controller.abort();
      if (cancelled) return;
      setAccount(createEmptyProfile(isZh));
      setConversations([]);
      setAccountLoading(false);
      setConversationsLoading(false);
      setAccountErrorText("");
      setConversationsErrorText("");
    };

    window.addEventListener("deskmate-profile-updated", handleProfileUpdated);
    window.addEventListener(AGENT_CONVERSATIONS_UPDATED_EVENT, handleConversationsUpdated);
    window.addEventListener("deskmate-auth-signing-out", handleSigningOut);

    return () => {
      cancelled = true;
      controller.abort();
      window.removeEventListener("deskmate-profile-updated", handleProfileUpdated);
      window.removeEventListener(AGENT_CONVERSATIONS_UPDATED_EVENT, handleConversationsUpdated);
      window.removeEventListener("deskmate-auth-signing-out", handleSigningOut);
    };
  }, [isZh]);

  useEffect(() => {
    router.prefetch("/main/agent");
    router.prefetch("/main/feedback");
    router.prefetch("/main/question-bank");
    router.prefetch("/main/wechat-editor");
    router.prefetch("/main/settings");
  }, [router]);

  const navigateTo = (href: NavHref, isActive: boolean) => {
    if (href === "/main/agent" && isAgentRoute) {
      return;
    }

    if (isActive) {
      return;
    }

    if (!requestWorksheetBuilderNavigation(href)) {
      return;
    }

    if (href === "/main/content-assets" && process.env.NODE_ENV === "development") {
      window.location.assign(href);
      onClose?.();
      return;
    }

    router.push(href);
    onClose?.();
  };

  const handleNewChat = () => {
    const targetHref = "/main/agent";
    if (!requestWorksheetBuilderNavigation(targetHref)) {
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AGENT_CONVERSATION_STORAGE_KEY);
      window.localStorage.removeItem(conversationStorageKey);
      window.dispatchEvent(new Event(AGENT_RESET_EVENT));
    }

    if (isAgentRoute) {
      router.replace(targetHref);
      onClose?.();
      return;
    }

    router.push(targetHref);
    onClose?.();
  };

  const handleOpenConversation = (conversationId: string) => {
    if (!conversationId) return;
    if (openingConversationId) return;

    const href = buildAgentConversationHref(conversationId);
    if (isAgentRoute && currentConversationId === conversationId) {
      onClose?.();
      return;
    }

    if (!requestWorksheetBuilderNavigation(href)) {
      return;
    }

    setOpeningConversationId(conversationId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(conversationStorageKey, conversationId);
      window.localStorage.removeItem(AGENT_CONVERSATION_STORAGE_KEY);
      if (isAgentRoute) {
        syncAgentConversationUrl(conversationId);
      }
      window.dispatchEvent(
        new CustomEvent<AgentOpenConversationDetail>(AGENT_OPEN_CONVERSATION_EVENT, {
          detail: { conversationId },
        }),
      );
    }

    if (!isAgentRoute) {
      router.push(href);
    }
    onClose?.();
  };

  useEffect(() => {
    const handleRestoreStatus = (event: Event) => {
      const detail = (event as CustomEvent<AgentConversationRestoreStatusDetail>).detail;
      if (!detail?.conversationId || detail.state !== "finished") return;
      setOpeningConversationId((current) =>
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

  const handleDeleteConversation = async (conversationId: string) => {
    if (!conversationId) return;

    const targetConversation = conversations.find((item) => item.id === conversationId) ?? null;
    const title = targetConversation?.title?.trim() || (isZh ? "这条历史对话" : "this conversation");
    const confirmed = window.confirm(
      isZh
        ? `确认删除“${title}”吗？这只会删除历史对话记录，已单独保存到内容库/题库/PBL 的内容不会一起删除。`
        : `Delete “${title}”? This only removes the chat history. Saved library, question bank, and PBL content will remain.`,
    );
    if (!confirmed) return;

    setDeletingConversationId(conversationId);
    setConversationsErrorText("");

    try {
      await apiDelete(`/api/chat/conversations/${encodeURIComponent(conversationId)}`);
      setConversations((current) => current.filter((item) => item.id !== conversationId));

      if (typeof window !== "undefined") {
        const storedConversationId =
          window.localStorage.getItem(conversationStorageKey)?.trim() ?? "";
        if (storedConversationId === conversationId) {
          window.localStorage.removeItem(conversationStorageKey);
          window.localStorage.removeItem(AGENT_CONVERSATION_STORAGE_KEY);
        }
        window.dispatchEvent(new Event(AGENT_CONVERSATIONS_UPDATED_EVENT));
      }

      if (currentConversationId === conversationId) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event(AGENT_RESET_EVENT));
        }
        if (isAgentRoute) {
          router.replace("/main/agent");
        }
      }
    } catch (error) {
      setConversationsErrorText(
        error instanceof Error
          ? error.message
          : isZh
            ? "删除对话失败"
            : "Failed to delete the conversation",
      );
    } finally {
      setDeletingConversationId("");
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label={isZh ? "关闭导航遮罩" : "Close navigation overlay"}
        onClick={() => onClose?.()}
        className={cn(
          "fixed inset-0 z-40 bg-foreground/28 transition-opacity md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full w-[280px] max-w-[calc(100vw-1.5rem)] shrink-0 flex-col border-r border-divider/80 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.18)] transition-[transform,opacity] duration-300 ease-out md:static md:z-auto md:w-[220px] md:max-w-none md:shadow-none",
          desktopHidden ? "md:pointer-events-none md:-translate-x-full md:opacity-0" : "md:translate-x-0 md:opacity-100",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="flex flex-col gap-4 px-5 pb-2 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-end text-[17px] font-semibold tracking-tight text-foreground">
                <svg className="mb-[3px] mr-px inline-block h-[1.15em] w-[1.15em]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"><path d="M20 4 L20 20 L4 20 Z" /></svg>eskmate
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onToggleDesktopHidden?.()}
                className="hidden h-9 w-9 items-center justify-center rounded-full text-default-400 transition-colors hover:bg-default-100 hover:text-foreground md:inline-flex"
                aria-label={isZh ? "向左隐藏侧边栏" : "Hide sidebar to the left"}
                title={isZh ? "向左隐藏侧边栏" : "Hide sidebar to the left"}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onClose?.()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-default-500 transition-colors hover:bg-default-200 hover:text-foreground md:hidden"
                aria-label={isZh ? "收起导航" : "Close navigation"}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleNewChat}
            className="flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-foreground"
            aria-label={isZh ? "新建对话" : "New chat"}
          >
            <Plus className="h-4 w-4" />
            {isZh ? "新建对话" : "New chat"}
          </button>
        </div>

        <Separator className="mx-4" />

        <nav
          className="flex flex-col gap-0.5 px-3 py-3"
        >
          {navItems.map((item) => {
            const isActive = item.isActive;

            return (
              <button
                key={item.href}
                type="button"
                data-testid={item.testId}
                disabled={isActive}
                onClick={() => navigateTo(item.href, isActive)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:cursor-default disabled:ring-0",
                  isActive
                    ? "bg-default-100 font-medium text-foreground"
                    : "text-default-500 hover:bg-default-100",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <item.icon
                  className={cn(
                    "h-4 w-4",
                    isActive ? "text-foreground" : "text-default-400",
                  )}
                />
                {item.label}
              </button>
            );
          })}
        </nav>

        <Separator className="mx-4" />

        <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
          <span className="mb-2 px-2 text-[11px] font-medium uppercase tracking-[1.2px] text-default-400">
            {isZh ? "最近" : "Recent"}
          </span>
          <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
            {conversationsLoading ? (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-default-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {isZh ? "正在读取最近对话..." : "Loading recent chats..."}
              </div>
            ) : conversationsErrorText ? (
              <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[13px] text-rose-600">
                {conversationsErrorText}
              </div>
            ) : conversations.length === 0 ? (
              <div className="rounded-lg px-3 py-2 text-[13px] text-default-400">
                {isZh ? "还没有历史对话" : "No history yet"}
              </div>
            ) : (
              conversations.map((conversation, index) => {
                const active = currentConversationId === conversation.id;
                const opening = openingConversationId === conversation.id;
                return (
                  <div
                    key={conversation.id}
                    className={cn(
                      "group flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] transition-colors",
                      active
                        ? "bg-default-200/80 font-medium text-foreground"
                        : opening
                          ? "bg-default-100 text-foreground"
                        : "text-default-500 hover:bg-default-100",
                    )}
                  >
                    <button
                      type="button"
                      data-testid="sidebar-recent-conversation"
                      onClick={() => handleOpenConversation(conversation.id)}
                      disabled={Boolean(openingConversationId)}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left disabled:opacity-80"
                    >
                      {opening ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-default-400" />
                      ) : (
                        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-default-400" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {formatConversationTitle(conversation.title, index, isZh)}
                      </span>
                      <span className="shrink-0 text-[11px] text-default-400">
                        {formatConversationTime(conversation.updatedAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteConversation(conversation.id)}
                      disabled={deletingConversationId === conversation.id}
                      className={cn(
                        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-default-400 transition-colors hover:bg-white hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-60",
                        deletingConversationId === conversation.id
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                      )}
                      aria-label={isZh ? "删除这条历史对话" : "Delete this conversation"}
                    >
                      {deletingConversationId === conversation.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="border-t border-divider px-4 pb-2 pt-3">
          <LocaleToggle className="w-full justify-center" />
        </div>

        <button
          type="button"
          onClick={() => navigateTo("/main/settings", pathname.startsWith("/main/settings"))}
          className="border-t border-divider px-4 py-4 text-left"
          aria-label={isZh ? "打开账户设置" : "Open account settings"}
        >
          <div className="flex items-center gap-3">
            <Avatar size="sm" className="shrink-0 bg-foreground text-[11px] font-semibold text-white">
              <Avatar.Fallback>
                {accountLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : account.initials}
              </Avatar.Fallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {accountLoading
                  ? isZh
                    ? "正在读取账户..."
                    : "Loading account..."
                  : accountErrorText || account.displayName}
              </p>
              <p className="truncate text-xs text-default-400">
                {accountLoading
                  ? isZh
                    ? "打开账户设置"
                    : "Open account settings"
                  : accountErrorText
                    ? isZh
                      ? "请刷新页面或重新登录"
                      : "Refresh the page or sign in again"
                    : account.schoolName ||
                      account.email ||
                      (isZh ? "打开账户设置" : "Open account settings")}
              </p>
            </div>
          </div>
        </button>
      </aside>
    </>
  );
}
