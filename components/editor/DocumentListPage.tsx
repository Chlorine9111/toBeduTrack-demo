"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  ClipboardList,
  Copy,
  FileCheck,
  FileDown,
  FileText,
  Lightbulb,
  MoreHorizontal,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  Button,
  Card,
  Chip,
  Dropdown,
  Input,
  Skeleton,
  Spinner,
  TextField,
} from "@heroui/react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";
import { requestJson } from "@/components/main/question-bank/helpers";
import { isPblUiEnabled } from "@/lib/pbl/feature";
import type {
  EditorDocumentListItem,
  ListDocumentsResponse,
} from "@/lib/documents/types";

// ---------------------------------------------------------------------------
// 类型颜色映射
// ---------------------------------------------------------------------------

type KindConfig = {
  bg: string;
  text: string;
  label: string;
  icon: typeof FileText;
};

function getKindConfig(kind: string, isZh: boolean): KindConfig {
  const labels = {
    rubric: "Rubric",
    "lesson-plan": isZh ? "教案" : "Lesson Plan",
    exam: isZh ? "试卷" : "Exam",
    pbl: "PBL",
    notes: isZh ? "笔记" : "Notes",
    default: isZh ? "文档" : "Document",
  } as const;

  const map: Record<string, KindConfig> = {
    rubric: {
      bg: "bg-[rgba(234,228,242,0.8)]",
      text: "text-[#9065B0]",
      label: labels.rubric,
      icon: ClipboardList,
    },
    "lesson-plan": {
      bg: "bg-[rgba(250,235,221,0.8)]",
      text: "text-[#CC772F]",
      label: labels["lesson-plan"],
      icon: BookOpen,
    },
    exam: {
      bg: "bg-[rgba(255,226,221,0.8)]",
      text: "text-[#DF5452]",
      label: labels.exam,
      icon: FileCheck,
    },
    pbl: {
      bg: "bg-[rgba(221,235,241,0.8)]",
      text: "text-primary",
      label: labels.pbl,
      icon: Lightbulb,
    },
    notes: {
      bg: "bg-[rgba(221,237,234,0.8)]",
      text: "text-[#4D7C0F]",
      label: labels.notes,
      icon: FileText,
    },
  };

  return map[kind] ?? {
    bg: "bg-[rgba(238,224,218,0.8)]",
    text: "text-[#976D57]",
    label: labels.default,
    icon: FileText,
  };
}

// ---------------------------------------------------------------------------
// 筛选选项
// ---------------------------------------------------------------------------

const FILTER_VALUES = [
  "all",
  "starred",
  "rubric",
  "lesson-plan",
  "exam",
  "pbl",
  "notes",
] as const;

type FilterValue = (typeof FILTER_VALUES)[number];

function getFilterOptions(isZh: boolean) {
  return [
    { value: "all" as const, label: isZh ? "全部" : "All" },
    { value: "starred" as const, label: isZh ? "已收藏" : "Starred" },
    { value: "rubric" as const, label: "Rubric" },
    { value: "lesson-plan" as const, label: isZh ? "教案" : "Lesson Plan" },
    { value: "exam" as const, label: isZh ? "试卷" : "Exam" },
    { value: "pbl" as const, label: "PBL" },
    { value: "notes" as const, label: isZh ? "笔记" : "Notes" },
  ];
}

type DocumentListPageProps = {
  initialData?: ListDocumentsResponse | null;
  initialFilter?: string;
  initialSearch?: string;
};

function normalizeFilterValue(value: string | undefined): FilterValue {
  if (!value) return "all";
  if (value === "pbl" && !isPblUiEnabled()) return "all";
  return FILTER_VALUES.includes(value as FilterValue) ? (value as FilterValue) : "all";
}

function buildQueryKey(filter: FilterValue, search: string) {
  return `${filter}::${search.trim()}`;
}

// ---------------------------------------------------------------------------
// 相对时间
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string, isZh: boolean): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return isZh ? "刚刚" : "Just now";
  if (diffMin < 60) return isZh ? `${diffMin} 分钟前` : `${diffMin}m ago`;
  if (diffHour < 24) return isZh ? `${diffHour} 小时前` : `${diffHour}h ago`;
  if (diffDay < 30) return isZh ? `${diffDay} 天前` : `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString(isZh ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// 防抖 hook
// ---------------------------------------------------------------------------

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

// ---------------------------------------------------------------------------
// 下拉菜单（使用 HeroUI Dropdown）
// ---------------------------------------------------------------------------

// DropdownMenu 已由内联 <Dropdown> 替代，详见 DocumentRow

// ---------------------------------------------------------------------------
// 确认弹窗（使用 HeroUI AlertDialog）
// ---------------------------------------------------------------------------

// ConfirmDialog 已由 <AlertDialog> 替代，详见主组件底部

// ---------------------------------------------------------------------------
// 文档行组件
// ---------------------------------------------------------------------------

function DocumentRow({
  doc,
  isZh,
  onToggleStar,
  onDuplicate,
  onDelete,
}: {
  doc: EditorDocumentListItem;
  isZh: boolean;
  onToggleStar: (id: string, starred: boolean) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const router = useRouter();
  const kindCfg = getKindConfig(doc.documentKind, isZh);
  const Icon = kindCfg.icon;

  return (
    <Card
      data-testid="document-row"
      data-doc-id={doc.id}
      className="group flex h-[72px] cursor-pointer flex-row items-center gap-4 rounded-none border-b border-divider px-4 shadow-none transition-colors hover:bg-default-100"
      onClick={() => router.push(`/main/library/${doc.id}`)}
    >
      {/* 图标 */}
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          kindCfg.bg,
        )}
      >
        <Icon className={cn("h-5 w-5", kindCfg.text)} />
      </div>

      {/* 标题 + 元信息 */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium text-foreground">
          {doc.title || (isZh ? "未命名文档" : "Untitled")}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs">
          <Chip size="sm" className={cn("h-auto border-none px-0", kindCfg.bg)}>
            <span className={cn("text-[10px] font-bold uppercase tracking-wide", kindCfg.text)}>
              {kindCfg.label}
            </span>
          </Chip>
          <span className="text-default-300">&middot;</span>
          <span className="text-default-400">
            {relativeTime(doc.updatedAt, isZh)}
          </span>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <Button
          data-testid="document-row-star"
          isIconOnly
          variant="ghost"
          size="sm"
          className={cn(
            "opacity-0 group-hover:opacity-100",
            doc.starred && "opacity-100",
          )}
          onPress={() => onToggleStar(doc.id, !doc.starred)}
        >
          <Star
            className={cn(
              "h-4 w-4",
              doc.starred
                ? "fill-[#DFAB01] text-[#DFAB01]"
                : "text-default-400",
            )}
          />
        </Button>

        <Dropdown>
          <Dropdown.Trigger>
            <Button
              data-testid="document-row-menu"
              isIconOnly
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100"
            >
              <MoreHorizontal className="h-4 w-4 text-default-400" />
            </Button>
          </Dropdown.Trigger>
          <Dropdown.Popover>
            <Dropdown.Menu
              onAction={(key) => {
                if (key === "duplicate") onDuplicate(doc.id);
                if (key === "delete") onDelete(doc.id);
              }}
            >
              <Dropdown.Item id="duplicate" textValue={isZh ? "复制" : "Duplicate"}>
                <Copy className="h-4 w-4 text-default-400" />
                {isZh ? "复制" : "Duplicate"}
              </Dropdown.Item>
              <Dropdown.Item id="export-pdf" textValue={isZh ? "导出 PDF" : "Export PDF"}>
                <FileDown className="h-4 w-4 text-default-400" />
                {isZh ? "导出 PDF" : "Export PDF"}
              </Dropdown.Item>
              <Dropdown.Section>
                <Dropdown.Item
                  id="delete"
                  textValue={isZh ? "删除" : "Delete"}
                  className="text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                  {isZh ? "删除" : "Delete"}
                </Dropdown.Item>
              </Dropdown.Section>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 空状态组件
// ---------------------------------------------------------------------------

function EmptyState({
  isZh,
  onCreateNew,
}: {
  isZh: boolean;
  onCreateNew: () => void;
}) {
  return (
    <Card className="mx-auto mt-12 flex max-w-md flex-col items-center justify-center px-8 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-default-100">
        <FileText className="h-8 w-8 text-default-300" />
      </div>
      <p className="mb-1 text-base font-medium text-foreground">
        {isZh ? "还没有文档" : "No documents yet"}
      </p>
      <p className="mb-6 text-sm text-default-400">
        {isZh ? "创建第一份文档后即可开始使用" : "Create your first document to get started"}
      </p>
      <Button onPress={onCreateNew}>
        <Plus className="h-4 w-4" />
        {isZh ? "新建文档" : "New Document"}
      </Button>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------------

const PAGE_LIMIT = 20;

export default function DocumentListPage({
  initialData,
  initialFilter,
  initialSearch,
}: DocumentListPageProps) {
  const { isZh } = useAppI18n();
  const router = useRouter();
  const visibleFilterOptions = getFilterOptions(isZh).filter((option) =>
    option.value === "pbl" ? isPblUiEnabled() : true,
  );
  const normalizedInitialFilter = normalizeFilterValue(initialFilter);
  const initialSearchValue = initialSearch?.trim() ?? "";
  const initialQueryKey = buildQueryKey(
    normalizedInitialFilter,
    initialSearchValue,
  );

  // 状态
  const [docs, setDocs] = useState<EditorDocumentListItem[]>(
    initialData?.items ?? [],
  );
  const [total, setTotal] = useState(initialData?.total ?? 0);
  const [hasMore, setHasMore] = useState(initialData?.hasMore ?? false);
  const [page, setPage] = useState(initialData?.page ?? 1);
  const [loading, setLoading] = useState(!initialData);
  const [loadingMore, setLoadingMore] = useState(false);

  const [searchInput, setSearchInput] = useState(initialSearchValue);
  const debouncedSearch = useDebounce(searchInput, 300);

  const [activeFilter, setActiveFilter] = useState<FilterValue>(
    normalizedInitialFilter,
  );
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  // 无限滚动 sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 用于取消过期请求
  const fetchIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const hasUsedInitialDataRef = useRef(Boolean(initialData));

  // 数据获取
  const fetchDocs = useCallback(
    async (pageNum: number, append: boolean) => {
      const currentFetchId = ++fetchIdRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams();
        params.set("page", String(pageNum));
        params.set("limit", String(PAGE_LIMIT));
        params.set("sort", "updatedAt");
        params.set("order", "desc");

        if (activeFilter === "starred") {
          params.set("starred", "true");
        } else if (activeFilter !== "all") {
          params.set("kind", activeFilter);
        }
        if (debouncedSearch.trim()) {
          params.set("q", debouncedSearch.trim());
        }

        const data = await requestJson<ListDocumentsResponse>(
          `/api/documents?${params.toString()}`,
          {
            signal: controller.signal,
          },
        );

        // 过期请求丢弃
        if (currentFetchId !== fetchIdRef.current) return;

        if (append) {
          setDocs((prev) => [...prev, ...data.items]);
        } else {
          setDocs(data.items);
        }
        setTotal(data.total);
        setHasMore(data.hasMore);
        setPage(data.page);
      } catch (error) {
        // 静默处理，避免过期请求报错
        if (currentFetchId !== fetchIdRef.current) return;
        if (controller.signal.aborted) return;
        console.error("Failed to fetch documents:", error);
      } finally {
        if (currentFetchId === fetchIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [activeFilter, debouncedSearch],
  );

  // 初始加载 + 筛选/搜索变化时重新请求
  useEffect(() => {
    const currentQueryKey = buildQueryKey(activeFilter, debouncedSearch);

    if (
      hasUsedInitialDataRef.current &&
      currentQueryKey === initialQueryKey
    ) {
      hasUsedInitialDataRef.current = false;
      return;
    }

    fetchDocs(1, false);
  }, [activeFilter, debouncedSearch, fetchDocs, initialQueryKey]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // 无限滚动
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore && !loading) {
          fetchDocs(page + 1, true);
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, page, fetchDocs]);

  // 切换筛选
  function handleFilterChange(value: FilterValue) {
    setActiveFilter(value);
  }

  // 切换星标
  async function handleToggleStar(id: string, starred: boolean) {
    // 乐观更新
    setDocs((prev) =>
      prev.map((d) => (d.id === id ? { ...d, starred } : d)),
    );

    try {
      await requestJson(`/api/documents/${id}/star`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starred }),
      });
    } catch {
      // 回滚
      setDocs((prev) =>
        prev.map((d) => (d.id === id ? { ...d, starred: !starred } : d)),
      );
    }
  }

  // 复制文档
  async function handleDuplicate(id: string) {
    try {
      await requestJson<{ document: { id: string } }>(
        `/api/documents/${id}/duplicate`,
        { method: "POST" },
      );
      // 刷新列表
      fetchDocs(1, false);
    } catch (error) {
      console.error("Failed to duplicate document:", error);
    }
  }

  // 删除文档 — 弹出确认弹窗
  function handleDeleteRequest(id: string) {
    const doc = docs.find((d) => d.id === id);
    setDeleteTarget({ id, title: doc?.title || (isZh ? "未命名文档" : "Untitled") });
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleteTarget(null);

    // 乐观移除
    setDocs((prev) => prev.filter((d) => d.id !== id));
    setTotal((prev) => prev - 1);

    try {
      await requestJson(`/api/documents/${id}`, {
        method: "DELETE",
      });
    } catch {
      // 回滚：重新获取
      fetchDocs(1, false);
    }
  }

  // 新建文档
  async function handleCreateNew() {
    try {
      const result = await requestJson<{ document: { id: string } }>(
        "/api/documents",
        { method: "POST" },
      );
      router.push(`/main/library/${result.document.id}`);
    } catch (error) {
      console.error("Failed to create document:", error);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header 区域 */}
      <header className="shrink-0 border-b border-divider px-8 pb-4 pt-8">
        {/* 标题行 */}
        <div className="flex items-center justify-between">
          <h1 data-testid="document-list-heading" className="text-2xl font-bold text-foreground">
            {isZh ? "文档库" : "Library"}
          </h1>

          <div className="flex items-center gap-3">
            {/* 搜索框 */}
            <TextField
              aria-label={isZh ? "搜索文档" : "Search documents"}
              value={searchInput}
              onChange={(value) => setSearchInput(value)}
              className="relative w-[240px]"
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-default-400" />
              <Input
                placeholder={isZh ? "搜索文档..." : "Search documents..."}
                className="pl-9"
              />
            </TextField>

            {/* 新建按钮 */}
            <Button size="sm" onPress={handleCreateNew}>
              <Plus className="h-4 w-4" />
              {isZh ? "新建文档" : "New Document"}
            </Button>
          </div>
        </div>

        {/* 筛选药丸按钮行 */}
        <div className="mt-4 flex items-center gap-2">
          {visibleFilterOptions.map((opt) => (
            <Chip
              key={opt.value}
              variant={activeFilter === opt.value ? "primary" : "soft"}
              size="sm"
              className={cn(
                "cursor-pointer transition-colors",
                activeFilter === opt.value
                  ? "bg-foreground text-white"
                  : "text-default-500 hover:bg-default-100",
              )}
              onClick={() => handleFilterChange(opt.value)}
            >
              {opt.label}
            </Chip>
          ))}
        </div>
      </header>

      {/* 列表区域 */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[960px] px-4 py-2">
          {loading ? (
            // 骨架加载
            <div className="space-y-0">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex h-[72px] items-center gap-4 border-b border-divider px-4"
                >
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48 rounded" />
                    <Skeleton className="h-3 w-32 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : docs.length === 0 ? (
            <EmptyState isZh={isZh} onCreateNew={handleCreateNew} />
          ) : (
            <>
              {docs.map((doc, index) => (
                <div
                  key={doc.id}
                  className="animate-list-item-enter"
                  style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
                >
                  <DocumentRow
                    doc={doc}
                    isZh={isZh}
                    onToggleStar={handleToggleStar}
                    onDuplicate={handleDuplicate}
                    onDelete={handleDeleteRequest}
                  />
                </div>
              ))}

              {/* 无限滚动哨兵 */}
              <div ref={sentinelRef} className="h-1" />

              {loadingMore && (
                <div className="flex justify-center py-6">
                  <Spinner size="sm" />
                </div>
              )}

              {/* 底部统计 */}
              {!hasMore && docs.length > 0 && (
                <p className="py-6 text-center text-xs text-default-400">
                  {isZh
                    ? `共 ${total} 份文档`
                    : `${total} document${total !== 1 ? "s" : ""} total`}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* 删除确认弹窗 */}
      <AlertDialog.Backdrop
        data-testid="document-delete-dialog"
        isOpen={deleteTarget != null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[400px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>{isZh ? "删除文档" : "Delete Document"}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                {deleteTarget
                  ? isZh
                    ? `确定要删除「${deleteTarget.title}」吗？此操作无法撤回。`
                    : `Delete "${deleteTarget.title}"? This action cannot be undone.`
                  : ""}
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="secondary" onPress={() => setDeleteTarget(null)}>
                {isZh ? "取消" : "Cancel"}
              </Button>
              <Button variant="danger" onPress={handleDeleteConfirm}>
                {isZh ? "删除" : "Delete"}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  );
}
