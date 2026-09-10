"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Database,
  FileText,
  FolderKanban,
  MessageSquare,
  Search,
} from "lucide-react";
import { Chip, Kbd, Modal, Skeleton, Spinner } from "@heroui/react";
import { cn } from "@/lib/utils";
import type {
  GlobalSearchBootstrapResponse,
  GlobalSearchItem,
  GlobalSearchResponse,
  GlobalSearchResultType,
} from "@/lib/search/types";
import PeekContent from "./peek/PeekContent";

type SearchModalProps = {
  open: boolean;
  onClose: () => void;
};

type RecentSearchItem = GlobalSearchItem & {
  openedAt: string;
};

const RECENT_STORAGE_KEY = "deskmate-global-search-recent-v1";
const BOOTSTRAP_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_RECENT_ITEMS = 20;

let bootstrapCache: {
  expiresAt: number;
  items: GlobalSearchItem[];
} | null = null;

function isFetchLikeError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const text = cleanText(`${error.name} ${error.message}`).toLowerCase();
  return (
    text.includes("failed to fetch") ||
    text.includes("networkerror") ||
    text.includes("load failed") ||
    text.includes("fetch failed") ||
    text.includes("network request failed")
  );
}

function readApiErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return "";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? cleanText(message) : "";
}

function readSearchItems(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const items = (payload as { items?: unknown }).items;
  return Array.isArray(items) ? (items as GlobalSearchItem[]) : null;
}

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function normalizeText(value: string | null | undefined) {
  return cleanText(value).toLowerCase();
}

// ── 类型视觉映射 ────────────────────────────────────────────
type TypeVisual = {
  label: string;
  icon: typeof FileText;
  chipColor: "default" | "accent" | "success" | "warning" | "danger";
  iconBg: string;
  iconText: string;
};

const TYPE_VISUALS: Record<GlobalSearchResultType, TypeVisual> = {
  content_library_item: {
    label: "内容库",
    icon: FileText,
    chipColor: "accent",
    iconBg: "bg-accent/10",
    iconText: "text-accent",
  },
  question: {
    label: "题库",
    icon: Database,
    chipColor: "default",
    iconBg: "bg-[#0B6E99]/10",
    iconText: "text-[#0B6E99]",
  },
  lesson_plan: {
    label: "教案",
    icon: BookOpen,
    chipColor: "success",
    iconBg: "bg-[#6940A5]/10",
    iconText: "text-[#6940A5]",
  },
  pbl_project: {
    label: "PBL",
    icon: FolderKanban,
    chipColor: "warning",
    iconBg: "bg-[#AD1A72]/10",
    iconText: "text-[#AD1A72]",
  },
  conversation: {
    label: "对话",
    icon: MessageSquare,
    chipColor: "default",
    iconBg: "bg-foreground/5",
    iconText: "text-foreground/50",
  },
};

function getTypeVisual(type: GlobalSearchResultType): TypeVisual {
  return TYPE_VISUALS[type] ?? TYPE_VISUALS.conversation;
}

// ── 最近访问存储 ────────────────────────────────────────────
function readRecentItems() {
  if (typeof window === "undefined") return [] as RecentSearchItem[];

  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const items: RecentSearchItem[] = [];

    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const data = item as Record<string, unknown>;
      const id = cleanText(`${data.id ?? ""}`);
      const title = cleanText(`${data.title ?? ""}`);
      const route = cleanText(`${data.route ?? ""}`);
      const type = cleanText(`${data.type ?? ""}`) as GlobalSearchResultType;
      if (!id || !title || !route || !type) continue;

      items.push({
        id,
        type,
        title,
        subtitle: cleanText(`${data.subtitle ?? ""}`),
        route,
        updatedAt: cleanText(`${data.updatedAt ?? ""}`),
        keywords: Array.isArray(data.keywords)
          ? data.keywords.map((value) => cleanText(`${value}`)).filter(Boolean)
          : [],
        matchSource: data.matchSource === "text" ? "text" : "bootstrap",
        openedAt: cleanText(`${data.openedAt ?? ""}`) || new Date().toISOString(),
      });
    }

    return items.slice(0, MAX_RECENT_ITEMS);
  } catch {
    return [];
  }
}

function writeRecentItems(items: RecentSearchItem[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(items.slice(0, MAX_RECENT_ITEMS)));
  } catch {
    // ignore localStorage failures
  }
}

function pushRecentItem(item: GlobalSearchItem) {
  const next: RecentSearchItem = {
    ...item,
    openedAt: new Date().toISOString(),
  };
  const current = readRecentItems();
  const deduped = [next, ...current.filter((entry) => !(entry.id === item.id && entry.type === item.type))];
  const trimmed = deduped.slice(0, MAX_RECENT_ITEMS);
  writeRecentItems(trimmed);
  return trimmed;
}

// ── 评分逻辑 ────────────────────────────────────────────────
function scoreLocalMatch(item: GlobalSearchItem, query: string, recentMap: Map<string, number>) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0;

  const title = normalizeText(item.title);
  const subtitle = normalizeText(item.subtitle);
  const keywords = item.keywords.map((value) => normalizeText(value)).join(" ");
  const recentRank = recentMap.get(`${item.type}:${item.id}`);
  let score = 0;
  let matched = false;

  if (title === normalizedQuery) {
    score += 1200;
    matched = true;
  } else if (title.startsWith(normalizedQuery)) {
    score += 980;
    matched = true;
  } else if (title.includes(normalizedQuery)) {
    score += 760;
    matched = true;
  }

  if (subtitle.startsWith(normalizedQuery)) {
    score += 280;
    matched = true;
  } else if (subtitle.includes(normalizedQuery)) {
    score += 180;
    matched = true;
  }

  if (keywords.includes(normalizedQuery)) {
    score += 140;
    matched = true;
  }

  if (!matched) return 0;

  if (typeof recentRank === "number") {
    score += Math.max(0, 90 - recentRank * 5);
  }

  const updatedAt = Date.parse(item.updatedAt);
  if (Number.isFinite(updatedAt)) {
    score += Math.max(0, 60 - Math.floor((Date.now() - updatedAt) / (1000 * 60 * 60 * 24)));
  }

  return score;
}

function mergeResults(localItems: GlobalSearchItem[], remoteItems: GlobalSearchItem[]) {
  const merged = new Map<string, GlobalSearchItem>();

  for (const item of [...localItems, ...remoteItems]) {
    const key = `${item.type}:${item.id}`;
    if (!merged.has(key)) {
      merged.set(key, item);
    }
  }

  return Array.from(merged.values());
}

// ── 骨架屏 ──────────────────────────────────────────────────
function ResultSkeleton() {
  return (
    <div className="space-y-1 px-2 py-2">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 rounded" style={{ width: `${85 - i * 10}%` }} />
            <Skeleton className="h-3 w-3/5 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 搜索弹窗 ────────────────────────────────────────────────
export default function SearchModal({ open, onClose }: SearchModalProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const remoteRequestIdRef = useRef(0);
  const [query, setQuery] = useState("");
  const [bootstrapItems, setBootstrapItems] = useState<GlobalSearchItem[]>([]);
  const [recentItems, setRecentItems] = useState<RecentSearchItem[]>([]);
  const [remoteItems, setRemoteItems] = useState<GlobalSearchItem[]>([]);
  const [loadingBootstrap, setLoadingBootstrap] = useState(false);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [errorText, setErrorText] = useState("");
  const [peekItem, setPeekItem] = useState<GlobalSearchItem | null>(null);

  const openPeek = useCallback(
    (item: GlobalSearchItem) => {
      const nextRecent = pushRecentItem(item);
      setRecentItems(nextRecent);
      setPeekItem(item);
    },
    [],
  );

  const closePeek = useCallback(() => {
    setPeekItem(null);
  }, []);

  const closePeekAndSearch = useCallback(() => {
    setPeekItem(null);
    onClose();
  }, [onClose]);

  const recentMap = useMemo(
    () =>
      new Map(recentItems.map((item, index) => [`${item.type}:${item.id}`, index])),
    [recentItems],
  );

  const localResults = useMemo(() => {
    if (!query.trim()) {
      if (recentItems.length > 0) return recentItems;
      return bootstrapItems.slice(0, 12);
    }

    return bootstrapItems
      .map((item) => ({
        item,
        score: scoreLocalMatch(item, query, recentMap),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return `${right.item.updatedAt}`.localeCompare(`${left.item.updatedAt}`);
      })
      .slice(0, 12)
      .map((entry) => entry.item);
  }, [bootstrapItems, query, recentItems, recentMap]);

  const results = useMemo(() => {
    if (!query.trim()) return localResults;
    return mergeResults(localResults, remoteItems).slice(0, 12);
  }, [localResults, query, remoteItems]);

  useEffect(() => {
    if (!open) return;

    setRecentItems(readRecentItems());
    setQuery("");
    setRemoteItems([]);
    setErrorText("");
    setSelectedIndex(0);
    setPeekItem(null);

    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const loadBootstrap = async () => {
      if (bootstrapCache && bootstrapCache.expiresAt > Date.now()) {
        setBootstrapItems(bootstrapCache.items);
        return;
      }

      setLoadingBootstrap(true);
      try {
        const response = await fetch("/api/search/bootstrap", {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as
          | Partial<GlobalSearchBootstrapResponse>
          | { error?: { message?: string } };
        const items = readSearchItems(payload);
        if (!response.ok || !items) {
          throw new Error(readApiErrorMessage(payload) || "读取搜索索引失败，请稍后再试");
        }
        bootstrapCache = {
          items,
          expiresAt: Date.now() + BOOTSTRAP_CACHE_TTL_MS,
        };
        if (cancelled) return;
        setBootstrapItems(items);
      } catch (error) {
        if (cancelled) return;
        const message =
          isFetchLikeError(error)
            ? "搜索服务暂时不可用，请稍后再试"
            : error instanceof Error && cleanText(error.message)
              ? error.message
              : "读取搜索索引失败，请稍后再试";
        setErrorText(message);
      } finally {
        setLoadingBootstrap(false);
      }
    };

    void loadBootstrap();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!query.trim() || query.trim().length < 2) {
      searchAbortRef.current?.abort();
      searchAbortRef.current = null;
      setRemoteItems([]);
      setLoadingRemote(false);
      return;
    }

    const controller = new AbortController();
    searchAbortRef.current?.abort();
    searchAbortRef.current = controller;

    const timer = window.setTimeout(async () => {
      const requestId = remoteRequestIdRef.current + 1;
      remoteRequestIdRef.current = requestId;
      setLoadingRemote(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}&limit=12`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as
          | Partial<GlobalSearchResponse>
          | { error?: { message?: string } };
        const items = readSearchItems(payload);
        if (!response.ok || !items) {
          throw new Error(readApiErrorMessage(payload) || "搜索失败，请稍后再试");
        }
        if (
          controller.signal.aborted ||
          searchAbortRef.current !== controller ||
          remoteRequestIdRef.current !== requestId
        ) {
          return;
        }
        setRemoteItems(items);
        setErrorText("");
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof Error && error.name === "AbortError") ||
          searchAbortRef.current !== controller ||
          remoteRequestIdRef.current !== requestId
        ) {
          return;
        }
        const message =
          isFetchLikeError(error)
            ? "搜索服务暂时不可用，请稍后再试"
            : error instanceof Error && cleanText(error.message)
              ? error.message
              : "搜索失败，请稍后再试";
        setErrorText(message);
      } finally {
        if (!controller.signal.aborted) {
          setLoadingRemote(false);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (peekItem) {
          setPeekItem(null);
        } else {
          onClose();
        }
        return;
      }

      if (peekItem) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) => Math.max(current - 1, 0));
        return;
      }

      if (event.key === "Enter") {
        const target = results[selectedIndex];
        if (!target) return;
        event.preventDefault();
        openPeek(target);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, openPeek, peekItem, results, selectedIndex]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;

  if (peekItem) {
    return (
      <PeekContent
        peekItem={peekItem}
        onClose={closePeekAndSearch}
        onBack={closePeek}
      />
    );
  }

  const sectionLabel = query.trim()
    ? "搜索结果"
    : recentItems.length > 0
      ? "最近访问"
      : "最近更新";

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <Modal.Container placement="top">
        <Modal.Dialog className="sm:max-w-[640px]" style={{ maxHeight: "560px" }}>
          {/* ── 搜索栏 ──────────────────────────────────────── */}
          <div className="flex h-[52px] min-h-[52px] items-center gap-3 border-b border-foreground/6 px-4">
            {loadingBootstrap || loadingRemote ? (
              <Spinner size="sm" color="accent" className="shrink-0" />
            ) : (
              <Search className="h-4.5 w-4.5 shrink-0 text-foreground/30" />
            )}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setErrorText("");
              }}
              placeholder="搜索内容、题目、教案、PBL 或最近对话"
              className="flex-1 bg-transparent text-[15px] text-foreground outline-hidden placeholder:text-foreground/30"
              data-testid="global-search-input"
            />
            <Kbd variant="light">
              <Kbd.Abbr keyValue="escape" />
            </Kbd>
          </div>

          {/* ── 结果区域 ────────────────────────────────────── */}
          <div className="overflow-y-auto" style={{ maxHeight: "508px" }}>
            {/* 区段标题 */}
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[12px] font-medium text-foreground/40">
                {sectionLabel}
              </span>
              {loadingRemote && results.length > 0 && (
                <Spinner size="sm" color="current" className="h-3 w-3 text-foreground/30" />
              )}
            </div>

            {/* 错误状态 */}
            {errorText ? (
              <div className="px-4 py-3 text-[13px] text-danger">{errorText}</div>
            ) : /* 加载骨架屏 */
            (loadingBootstrap || (query.trim() && loadingRemote)) && results.length === 0 ? (
              <ResultSkeleton />
            ) : /* 空状态 */
            results.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-14">
                <Search className="h-8 w-8 text-foreground/12" strokeWidth={1.2} />
                <p className="text-[14px] font-medium text-foreground/40">
                  {query.trim() ? "没有找到匹配结果" : "输入关键词开始搜索"}
                </p>
                <p className="text-[12px] text-foreground/25">
                  {query.trim() ? "尝试使用不同的关键词" : "支持搜索内容库、题目、教案、PBL 和对话"}
                </p>
              </div>
            ) : (
              /* 结果列表 */
              <div className="px-2 py-1">
                {results.map((item, index) => {
                  const visual = getTypeVisual(item.type);
                  const Icon = visual.icon;
                  const active = index === selectedIndex;
                  return (
                    <button
                      key={`${item.type}:${item.id}`}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-100",
                        active
                          ? "bg-accent/6"
                          : "hover:bg-foreground/3",
                      )}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => openPeek(item)}
                      data-testid="global-search-result"
                    >
                      {/* 语义图标 */}
                      <div className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        visual.iconBg,
                      )}>
                        <Icon className={cn("h-4 w-4", visual.iconText)} />
                      </div>

                      {/* 内容 */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[14px] font-medium text-foreground">
                            {item.title}
                          </span>
                          <Chip
                            size="sm"
                            variant="soft"
                            color={visual.chipColor}
                            className="shrink-0"
                          >
                            {visual.label}
                          </Chip>
                        </div>
                        <p className="mt-0.5 truncate text-[12px] text-foreground/40">
                          {item.subtitle || "可直接跳转"}
                        </p>
                      </div>

                      {/* 键盘提示 */}
                      {active && (
                        <span className="shrink-0 text-[11px] text-foreground/20">
                          ↵
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* 底部键盘提示 */}
            {results.length > 0 && (
              <div className="flex items-center gap-3 border-t border-foreground/6 px-4 py-2">
                <span className="flex items-center gap-1.5 text-[11px] text-foreground/25">
                  <span className="inline-flex gap-0.5">
                    <kbd className="rounded bg-foreground/5 px-1 py-0.5 text-[10px] font-medium">↑</kbd>
                    <kbd className="rounded bg-foreground/5 px-1 py-0.5 text-[10px] font-medium">↓</kbd>
                  </span>
                  导航
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-foreground/25">
                  <kbd className="rounded bg-foreground/5 px-1 py-0.5 text-[10px] font-medium">↵</kbd>
                  预览
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-foreground/25">
                  <kbd className="rounded bg-foreground/5 px-1 py-0.5 text-[10px] font-medium">esc</kbd>
                  关闭
                </span>
              </div>
            )}
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
