"use client";

import { useState, useEffect, useRef, useCallback, startTransition, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertDialog, Avatar, Button, Kbd, Header, Label, ListBox, ScrollShadow, Separator, Tooltip } from "@heroui/react";
import {
  Search,
  FolderOpen,
  Database,
  Settings,
  Languages,
  MessageSquareText,
  Plus,
  Trash2,
  GraduationCap,
  FileText,
  LayoutDashboard,
} from "lucide-react";
import DotPulseLoader from "@/components/main/agent/DotPulseLoader";
import { cn } from "@/lib/utils";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { requestWorksheetBuilderNavigation } from "@/lib/question-bank/builder-navigation-guard";
import { useQuotaSummary } from "@/hooks/useQuotaSummary";
import { useProductTour } from "@/lib/product-tour/context";
import { apiDelete, apiGet } from "@/lib/api/client";
import type { ShellIconKey, ShellNavItem } from "@/components/shells/navigation";
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

const ICON_MAP: Record<ShellIconKey, React.ElementType> = {
  plus: Plus,
  "folder-open": FolderOpen,
  database: Database,
  "message-square-text": MessageSquareText,
  "file-text": FileText,
  "graduation-cap": GraduationCap,
  "layout-dashboard": LayoutDashboard,
};


function LanguageButton({ expanded }: { expanded: boolean }) {
  const { locale, toggleLocale } = useAppI18n();
  const label = locale === "zh" ? "EN" : "中文";
  const title = locale === "zh" ? "切换到英文" : "Switch to Chinese";

  return (
    <Button
      variant="ghost"
      onPress={toggleLocale}
      aria-label={expanded ? undefined : title}
      className={cn(
        "flex items-center gap-3 rounded-lg transition-all duration-150",
        expanded ? "h-10 px-3" : "h-10 w-10 justify-center",
        "text-default-400 hover:bg-default-100 hover:text-foreground"
      )}
    >
      <Languages className="h-5 w-5 shrink-0" />
      {expanded && (
        <span className="text-sm font-medium text-foreground">{label}</span>
      )}
    </Button>
  );
}

type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

const CONV_CACHE_KEY = "deskmate-conversations-cache";

function readCachedConversations(): ConversationSummary[] {
  try {
    const raw = localStorage.getItem(CONV_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeCachedConversations(items: ConversationSummary[]) {
  try {
    localStorage.setItem(CONV_CACHE_KEY, JSON.stringify(items.slice(0, 30)));
  } catch {}
}

type ConversationGroup = {
  key: string;
  label: string;
  items: ConversationSummary[];
};

function groupConversationsByTime(items: ConversationSummary[], isZh: boolean): ConversationGroup[] {
  const now = Date.now();
  const groups: Record<string, ConversationSummary[]> = {};
  const order: string[] = [];

  for (const conv of items) {
    const d = new Date(conv.updatedAt);
    const h = Number.isNaN(d.getTime()) ? Infinity : (now - d.getTime()) / 3_600_000;

    let key: string;
    if (h < 24) key = isZh ? "今天" : "Today";
    else if (h < 48) key = isZh ? "昨天" : "Yesterday";
    else if (h < 168) key = isZh ? "本周" : "This week";
    else key = isZh ? "更早" : "Earlier";

    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(conv);
  }

  return order.map((key) => ({ key, label: key, items: groups[key] }));
}

type IconSidebarProps = {
  navigation: ShellNavItem[];
  actorLabel: { zh: string; en: string } | null;
  showQuota: boolean;
  onSearchClick?: () => void;
};

export default function IconSidebar({
  navigation,
  actorLabel,
  showQuota,
  onSearchClick,
}: IconSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isZh } = useAppI18n();
  const { summary: quota } = useQuotaSummary({ enabled: showQuota });
  const { isSidebarTourActive } = useProductTour();
  const [expanded, setExpanded] = useState(false);
  const [isMac, setIsMac] = useState(true);
  const [isNavigating, startNavTransition] = useTransition();
  const [navigatingHref, setNavigatingHref] = useState<string | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const convAbortRef = useRef<AbortController | null>(null);

  // 导航完成后清除 navigatingHref
  useEffect(() => {
    if (!isNavigating) setNavigatingHref(null);
  }, [isNavigating]);

  const isAgentRoute = pathname === "/main" || pathname === "/main/" || pathname.startsWith("/main/agent");
  const currentConvId = searchParams.get("conversationId")?.trim() ?? "";
  // 始终渲染会话列表 DOM（Agent 路由下），用 CSS 控制显隐，避免 mount/unmount 开销
  const renderConversations = isAgentRoute;
  const showConversations = isAgentRoute && expanded;

  // 会话列表 — localStorage 首帧 + 后台 revalidate
  // 初始化为空数组避免 SSR hydration mismatch（服务端无 localStorage）
  // mount 后从缓存读取首帧数据
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [deletingId, setDeletingId] = useState("");

  const fetchConversations = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await apiGet<{ conversations: ConversationSummary[] }>("/api/chat/conversations", { signal });
      if (signal?.aborted) return;
      const items = res.conversations.slice(0, 30);
      startTransition(() => { setConversations(items); setConvLoading(false); });
      writeCachedConversations(items);
    } catch {
      startTransition(() => setConvLoading(false));
    }
  }, []);

  // Mount 后从 localStorage 读取缓存（避免 SSR hydration mismatch）
  useEffect(() => {
    const cached = readCachedConversations();
    if (cached.length > 0) {
      setConversations(cached);
      setConvLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAgentRoute) return;
    if (!expanded) return;
    const c = new AbortController();
    convAbortRef.current = c;
    void fetchConversations(c.signal);
    return () => c.abort();
  }, [expanded, fetchConversations, isAgentRoute]);

  useEffect(() => {
    const h = () => {
      if (!expanded || !isAgentRoute) return;
      convAbortRef.current?.abort();
      const c = new AbortController();
      convAbortRef.current = c;
      void fetchConversations(c.signal);
    };
    window.addEventListener(AGENT_CONVERSATIONS_UPDATED_EVENT, h);
    return () => window.removeEventListener(AGENT_CONVERSATIONS_UPDATED_EVENT, h);
  }, [expanded, fetchConversations, isAgentRoute]);

  const [newChatLoading, setNewChatLoading] = useState(false);

  const handleNewChat = useCallback(() => {
    const targetHref = "/main/agent";
    if (!requestWorksheetBuilderNavigation(targetHref)) {
      return;
    }

    setNewChatLoading(true);
    localStorage.removeItem(AGENT_CONVERSATION_STORAGE_KEY);
    window.dispatchEvent(new Event(AGENT_RESET_EVENT));
    startNavTransition(() => {
      if (isAgentRoute) { router.replace(targetHref); } else { router.push(targetHref); }
    });
  }, [isAgentRoute, router]);

  // 新建对话导航完成后恢复按钮
  useEffect(() => {
    if (!isNavigating && newChatLoading) setNewChatLoading(false);
  }, [isNavigating, newChatLoading]);

  const [openingConvId, setOpeningConvId] = useState<string | null>(null);

  const handleOpenConv = useCallback((id: string) => {
    if (!id) return;
    if (openingConvId) return;
    if (isAgentRoute && currentConvId === id) return;

    const targetHref = buildAgentConversationHref(id);
    if (!requestWorksheetBuilderNavigation(targetHref)) {
      return;
    }

    setOpeningConvId(id);
    if (isAgentRoute) {
      syncAgentConversationUrl(id);
    }
    window.dispatchEvent(new CustomEvent<AgentOpenConversationDetail>(AGENT_OPEN_CONVERSATION_EVENT, { detail: { conversationId: id } }));
    if (!isAgentRoute) {
      startNavTransition(() => {
        router.push(targetHref);
      });
    }
  }, [isAgentRoute, currentConvId, openingConvId, router]);

  // 会话导航完成后恢复
  useEffect(() => {
    if (!isNavigating && openingConvId) setOpeningConvId(null);
  }, [isNavigating, openingConvId]);

  useEffect(() => {
    const handleRestoreStatus = (event: Event) => {
      const detail = (event as CustomEvent<AgentConversationRestoreStatusDetail>).detail;
      if (!detail?.conversationId || detail.state !== "finished") return;
      setOpeningConvId((current) =>
        current === detail.conversationId ? null : current,
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

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const confirmDelete = useCallback(async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    setDeletingId(id);
    try {
      await apiDelete(`/api/chat/conversations/${encodeURIComponent(id)}`);
      setConversations((prev) => { const next = prev.filter((c) => c.id !== id); writeCachedConversations(next); return next; });
      window.dispatchEvent(new Event(AGENT_CONVERSATIONS_UPDATED_EVENT));
      if (currentConvId === id) { window.dispatchEvent(new Event(AGENT_RESET_EVENT)); if (isAgentRoute) router.replace("/main/agent"); }
    } catch {} finally { setDeletingId(""); }
  }, [pendingDeleteId, currentConvId, isAgentRoute, router]);

  const isActive = (matchPrefix: string) => pathname.startsWith(matchPrefix);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const isAgentLikeRoute =
      pathname === "/main" ||
      pathname === "/main/" ||
      pathname.startsWith("/main/agent");

    const runPrefetch = () => {
      const prefetchHrefs = Array.from(
        new Set([...navigation.map((item) => item.href), "/main/settings"]),
      );
      for (const href of prefetchHrefs) {
        if (href !== pathname) {
          router.prefetch(href);
        }
      }
    };

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(runPrefetch, {
        timeout: isAgentLikeRoute ? 4000 : 1500,
      });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = window.setTimeout(runPrefetch, isAgentLikeRoute ? 2200 : 250);
    return () => window.clearTimeout(timeoutId);
  }, [navigation, pathname, router]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (expanded && sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [expanded]);

  const handleMouseEnter = () => {
    if (isSidebarTourActive) return;
    clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setExpanded(true), 220);
  };

  const handleMouseLeave = () => {
    if (isSidebarTourActive) return;
    clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setExpanded(false), 320);
  };

  const renderNavItem = (item: ShellNavItem) => {
    const ItemIcon = ICON_MAP[item.icon];
    const isNewChat = item.testId === "sidebar-nav-new-chat";
    // 题库按钮：仅在主搜索页 active + disabled，子路由（builder/split/ap）下高亮但可点击回主页
    const matchesPrefix = !isNewChat && isActive(item.matchPrefix);
    const isQuestionBankSubRoute =
      item.matchPrefix === "/main/question-bank" &&
      matchesPrefix &&
      pathname !== "/main/question-bank" &&
      pathname !== "/main/question-bank/";
    const active = matchesPrefix && !isQuestionBankSubRoute;
    const label = isZh ? item.label.zh : item.label.en;

    if (isNewChat) {
      const button = (
        <Button
          variant="ghost"
          data-testid={item.testId}
          data-tour-id={item.tourId}
          isDisabled={newChatLoading}
          onPress={handleNewChat}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg transition-all duration-150",
            expanded ? "h-10 justify-start px-3" : "h-10 w-10 justify-center",
            newChatLoading
              ? "bg-default-100 text-foreground opacity-70"
              : "text-default-400 hover:bg-default-100 hover:text-foreground",
          )}
          aria-label={expanded ? undefined : label}
        >
          {newChatLoading
            ? <DotPulseLoader className="h-5 w-5 shrink-0 text-default-400" />
            : <ItemIcon className="h-5 w-5 shrink-0" />}
          {expanded && (
            <span className="truncate text-sm font-medium text-foreground">
              {label}
            </span>
          )}
        </Button>
      );

      return (
        <li key="new-chat">
          {expanded ? button : (
            <Tooltip delay={0}>
              {button}
              <Tooltip.Content><p>{label}</p></Tooltip.Content>
            </Tooltip>
          )}
        </li>
      );
    }

    const isItemNavigating = navigatingHref === item.href;

    const link = (
      <Button
        variant="ghost"
        data-testid={item.testId}
        data-tour-id={item.tourId}
        aria-current={active ? "page" : undefined}
        isDisabled={active || isItemNavigating}
        onPress={() => {
          if (!active && !isItemNavigating) {
            if (!requestWorksheetBuilderNavigation(item.href)) {
              return;
            }
            if (item.href === "/main/content-assets" && process.env.NODE_ENV === "development") {
              setNavigatingHref(item.href);
              window.location.assign(item.href);
              return;
            }
            setNavigatingHref(item.href);
            startNavTransition(() => { router.push(item.href); });
          }
        }}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg transition-all duration-150",
          expanded ? "h-10 justify-start px-3" : "h-10 w-10 min-w-0 justify-center",
          active
            ? "bg-default-200 text-foreground"
            : isQuestionBankSubRoute
              ? "bg-default-100 text-foreground hover:bg-default-200"
              : isItemNavigating
                ? "bg-default-100 text-foreground opacity-70"
                : "text-default-400 hover:bg-default-100 hover:text-foreground",
        )}
        aria-label={expanded ? undefined : label}
      >
        {isItemNavigating
          ? <DotPulseLoader className="h-5 w-5 shrink-0 text-default-400" />
          : <ItemIcon className="h-5 w-5 shrink-0" />}
        {expanded && (
          <span className="truncate text-sm font-medium text-foreground">
            {label}
          </span>
        )}
      </Button>
    );

    return (
      <li key={item.href}>
        {expanded ? link : (
          <Tooltip delay={0}>
            {link}
            <Tooltip.Content><p>{label}</p></Tooltip.Content>
          </Tooltip>
        )}
      </li>
    );
  };

  return (
    <aside
      ref={sidebarRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-divider bg-surface transform-gpu transition-[width] duration-200 ease-out will-change-[width]",
        expanded ? "w-[240px] shadow-dm-sidebar" : "w-[56px]"
      )}
    >
      {/* Logo */}
      <div className={cn("flex items-center px-4 pt-4 pb-2", expanded ? "gap-3" : "justify-center")}>
        {expanded ? (
          <span className="inline-flex items-end text-[17px] font-semibold tracking-tight text-foreground">
            <svg className="mb-[3px] mr-px inline-block h-[1.15em] w-[1.15em]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"><path d="M20 4 L20 20 L4 20 Z" /></svg>eskmate
          </span>
        ) : (
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"><path d="M20 4 L20 20 L4 20 Z" /></svg>
        )}
      </div>

      {/* Search */}
      <div className="px-2 py-1">
        <Button
          variant="ghost"
          onPress={onSearchClick}
          className={cn(
            "flex items-center gap-3 rounded-lg transition-all duration-150",
            expanded ? "h-10 px-3" : "h-10 w-10 justify-center",
            "text-default-400 hover:bg-default-100 hover:text-foreground"
          )}
          aria-label={expanded ? undefined : `${isZh ? "搜索" : "Search"} (${isMac ? "⌘" : "Ctrl+"}K)`}
        >
          <Search className="h-5 w-5 shrink-0" />
          {expanded && (
            <>
              <span className="text-sm font-medium">{isZh ? "搜索" : "Search"}</span>
              <Kbd className="ml-auto">
                <Kbd.Abbr keyValue={isMac ? "command" : "ctrl"} />
                <Kbd.Content>K</Kbd.Content>
              </Kbd>
            </>
          )}
        </Button>
      </div>

      {/* Main nav */}
      <nav className={cn("px-2 pt-1", showConversations ? "" : "flex-1 overflow-y-auto")}>
        <ul className="flex flex-col gap-1">
          {navigation.map(renderNavItem)}
        </ul>

      </nav>

      {/* 会话区域 — Agent 路由始终挂载，CSS 控制显隐 */}
      {renderConversations ? (
        <div className={cn(
          "flex min-h-0 flex-1 flex-col transition-opacity duration-200 ease-out",
          showConversations ? "opacity-100" : "pointer-events-none opacity-0",
        )}>
          {/* 分隔线 */}
          <div className="mx-3 my-1.5">
            <Separator />
          </div>

          {/* 历史列表 */}
          <ScrollShadow className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-2">
            {convLoading && conversations.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-6 text-[12px] text-default-400">
                <DotPulseLoader className="text-default-400" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-default-400">
                {isZh ? "开始你的第一次对话" : "Start your first chat"}
              </div>
            ) : (
              <ListBox
                aria-label={isZh ? "对话历史" : "Conversation history"}
                selectionMode="single"
                selectedKeys={currentConvId ? new Set([currentConvId]) : new Set()}
                onAction={(key) => handleOpenConv(String(key))}
                className="w-full"
              >
                {groupConversationsByTime(conversations, isZh).map((group) => (
                  <ListBox.Section key={group.key}>
                    <Header className="px-2 pb-1 pt-3 text-[11px] font-medium text-default-400">
                      {group.label}
                    </Header>
                    {group.items.map((conv, i) => {
                      const title = conv.title?.trim() || (isZh ? `对话 ${i + 1}` : `Chat ${i + 1}`);
                      return (
                        <ListBox.Item
                          key={conv.id}
                          id={conv.id}
                          textValue={title}
                          className={cn(
                            "group/conv rounded-lg px-2.5 py-1.5",
                            openingConvId === conv.id && "opacity-70",
                          )}
                        >
                          {openingConvId === conv.id
                            ? <DotPulseLoader className="mr-1.5 shrink-0 text-default-400" />
                            : null}
                          <Label className="min-w-0 flex-1 truncate text-[13px]">{title}</Label>
                          <div
                            role="button"
                            tabIndex={-1}
                            className={cn(
                              "flex size-5 shrink-0 items-center justify-center rounded-md text-default-400 transition-all hover:bg-danger-50 hover:text-danger",
                              deletingId === conv.id ? "opacity-100" : "opacity-0 group-hover/conv:opacity-100",
                            )}
                            onClick={(e) => { e.stopPropagation(); setPendingDeleteId(conv.id); }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setPendingDeleteId(conv.id); } }}
                          >
                            {deletingId === conv.id ? <DotPulseLoader className="text-danger-400" /> : <Trash2 className="size-3" />}
                          </div>
                        </ListBox.Item>
                      );
                    })}
                  </ListBox.Section>
                ))}
              </ListBox>
            )}
          </ScrollShadow>
        </div>
      ) : null}

      {/* Bottom: Language + Settings + Avatar */}
      <div className="flex flex-col gap-1 px-2 pb-4">
        <LanguageButton expanded={expanded} />
        {(() => {
          const settingsActive = isActive("/main/settings");
          const settingsNavigating = navigatingHref === "/main/settings";
          return (
            <Button
              variant="ghost"
              data-testid="sidebar-nav-settings"
              data-tour-id="nav-settings"
              aria-current={settingsActive ? "page" : undefined}
              isDisabled={settingsActive || settingsNavigating}
              onPress={() => {
                if (!settingsActive && !settingsNavigating) {
                  if (!requestWorksheetBuilderNavigation("/main/settings")) {
                    return;
                  }
                  setNavigatingHref("/main/settings");
                  startNavTransition(() => { router.push("/main/settings"); });
                }
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg transition-all duration-150",
                expanded ? "h-10 justify-start px-3" : "h-10 w-10 min-w-0 justify-center",
                settingsActive
                  ? "bg-default-200 text-foreground"
                  : settingsNavigating
                    ? "bg-default-100 text-foreground opacity-70"
                    : "text-default-400 hover:bg-default-100 hover:text-foreground",
              )}
              aria-label={expanded ? undefined : isZh ? "设置" : "Settings"}
            >
              {settingsNavigating
                ? <DotPulseLoader className="h-5 w-5 shrink-0 text-default-400" />
                : <Settings className="h-5 w-5 shrink-0" />}
              {expanded && (
                <span className="text-sm font-medium text-foreground">
                  {isZh ? "设置" : "Settings"}
                </span>
              )}
            </Button>
          );
        })()}

        <div className={cn("flex items-center", expanded ? "gap-3 px-3 py-2" : "justify-center py-1")}>
          <Avatar size="sm" color="default" className="h-6 w-6 shrink-0 text-[10px]">
            <Avatar.Fallback>T</Avatar.Fallback>
          </Avatar>
          {expanded && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {isZh ? (actorLabel?.zh ?? "成员") : (actorLabel?.en ?? "Member")}
              </p>
              {showQuota && quota ? (
                <div className="mt-0.5">
                  <div className="flex items-center justify-between text-[10px] text-default-500">
                    <span>{isZh ? `剩余 ${quota.quotaRemaining}` : `${quota.quotaRemaining} left`}</span>
                    <span>{Math.round(quota.usageRatio * 100)}%</span>
                  </div>
                  <div className="mt-0.5 h-[3px] w-full rounded-full bg-default-200">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        quota.usageRatio < 0.8
                          ? "bg-[#5E6AD2]"
                          : quota.usageRatio < 1
                            ? "bg-[#F59E0B]"
                            : "bg-[#E07070]",
                      )}
                      style={{ width: `${Math.min(quota.usageRatio * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ) : showQuota ? (
                <span className="inline-flex items-center rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-medium text-default-500">
                  {isZh ? "免费版" : "Free"}
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* 删除确认弹窗 */}
      <AlertDialog.Backdrop
        isOpen={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[360px]">
            {({ close }) => (
              <>
                <AlertDialog.Header>
                  <AlertDialog.Icon status="danger" />
                  <AlertDialog.Heading>
                    {isZh ? "删除对话" : "Delete conversation"}
                  </AlertDialog.Heading>
                </AlertDialog.Header>
                <AlertDialog.Body>
                  <p className="text-sm text-muted">
                    {isZh
                      ? "确认删除这条对话？删除后无法恢复。"
                      : "This conversation will be permanently deleted. This action cannot be undone."}
                  </p>
                </AlertDialog.Body>
                <AlertDialog.Footer>
                  <Button variant="tertiary" onPress={close}>
                    {isZh ? "取消" : "Cancel"}
                  </Button>
                  <Button
                    variant="danger"
                    onPress={() => { close(); void confirmDelete(); }}
                  >
                    {isZh ? "删除" : "Delete"}
                  </Button>
                </AlertDialog.Footer>
              </>
            )}
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </aside>
  );
}
