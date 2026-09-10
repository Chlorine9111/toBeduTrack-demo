"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Chip, Input, Spinner } from "@heroui/react";
import { BookOpenText, X } from "lucide-react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";
import type { ContentLibraryListItem, ContentLibraryType } from "@/lib/content-library/types";

type ContentLibraryListResponse = {
  items: ContentLibraryListItem[];
  total: number;
  hasMore: boolean;
};

type ContentLibraryReferencePickerProps = {
  open: boolean;
  selectedItems: ContentLibraryListItem[];
  onClose: () => void;
  onConfirm: (items: ContentLibraryListItem[]) => void;
};

const MAX_SELECTION = 8;

function mapTypeLabel(contentType: ContentLibraryType, isZh: boolean) {
  switch (contentType) {
    case "lesson_plan":
      return isZh ? "教案" : "Lesson Plan";
    case "question":
      return isZh ? "题目" : "Question";
    case "rubric":
      return "Rubric";
    case "pbl":
      return "PBL";
    case "other":
    default:
      return isZh ? "其他" : "Other";
  }
}

function formatUpdatedAt(value: string, locale: "zh" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function ContentLibraryReferencePicker({
  open,
  selectedItems,
  onClose,
  onConfirm,
}: ContentLibraryReferencePickerProps) {
  const { isZh, locale } = useAppI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContentLibraryListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [draftSelectedItems, setDraftSelectedItems] = useState<ContentLibraryListItem[]>(selectedItems);

  const selectedIdSet = useMemo(
    () => new Set(draftSelectedItems.map((item) => item.id)),
    [draftSelectedItems],
  );

  useEffect(() => {
    if (!open) return;
    setDraftSelectedItems(selectedItems);
    setQuery("");
  }, [open, selectedItems]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setErrorText("");

      try {
        const searchParams = new URLSearchParams();
        searchParams.set("limit", "60");
        if (query.trim()) {
          searchParams.set("q", query.trim());
        }

        const response = await fetch(`/api/content-library?${searchParams.toString()}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });

        const payload = (await response.json().catch(() => ({}))) as Partial<ContentLibraryListResponse> & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || (isZh ? "读取内容库失败" : "Failed to load the library"));
        }

        setResults(Array.isArray(payload.items) ? payload.items : []);
      } catch (error) {
        if (controller.signal.aborted) return;
        setResults([]);
        setErrorText(
          error instanceof Error
            ? error.message
            : isZh
              ? "读取内容库失败"
              : "Failed to load the library",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [isZh, open, query]);

  const toggleItem = (item: ContentLibraryListItem) => {
    setDraftSelectedItems((current) => {
      if (current.some((entry) => entry.id === item.id)) {
        return current.filter((entry) => entry.id !== item.id);
      }
      if (current.length >= MAX_SELECTION) {
        return current;
      }
      return [...current, item];
    });
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center px-4 py-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-slate-950/42" />

      <section
        data-testid="agent-content-reference-picker"
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-divider bg-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-divider px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-400">
              {isZh ? "内容库引用" : "Library References"}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              {isZh ? "选择本轮要引用的内容" : "Choose content to reference in this request"}
            </h2>
            <p className="mt-1 text-sm text-default-500">
              {isZh
                ? `最多选择 ${MAX_SELECTION} 项。发送后会作为本轮上下文进入生成链路。`
                : `Select up to ${MAX_SELECTION} items. They will be attached as context for this request.`}
            </p>
          </div>
          <Button
            isIconOnly
            variant="ghost"
            onPress={onClose}
            aria-label={isZh ? "关闭内容库引用面板" : "Close library reference panel"}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="border-b border-divider px-5 py-4">
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              isZh
                ? "搜索标题、备注、课程或单元"
                : "Search by title, notes, course, or unit"
            }
          />

          {draftSelectedItems.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {draftSelectedItems.map((item) => (
                <Chip
                  key={item.id}
                  data-testid="agent-content-reference-tag"
                 
                  color="accent"
                  className="cursor-pointer"
                  onClick={() => toggleItem(item)}
                >
                  <BookOpenText className="mr-1 inline h-3.5 w-3.5" />
                  <span className="max-w-[220px] truncate">{item.displayTitle}</span>
                </Chip>
              ))}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-sm text-default-500">
              <Spinner size="sm" />
              {isZh ? "正在读取内容库..." : "Loading library items..."}
            </div>
          ) : null}

          {!loading && errorText ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorText}
            </div>
          ) : null}

          {!loading && !errorText && results.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-default-200 bg-default-100 text-sm text-default-400">
              {isZh ? "暂时没有匹配内容" : "No matching content yet"}
            </div>
          ) : null}

          {!loading && !errorText ? (
            <div className="space-y-2">
              {results.map((item) => {
                const checked = selectedIdSet.has(item.id);
                const disabled = !checked && draftSelectedItems.length >= MAX_SELECTION;

                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`agent-content-reference-item-${item.id}`}
                    onClick={() => toggleItem(item)}
                    disabled={disabled}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
                      checked
                        ? "border-blue-300 bg-blue-50"
                        : "border-divider bg-white hover:bg-default-100",
                      disabled && "cursor-not-allowed opacity-45",
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold",
                        checked
                          ? "border-blue-500 bg-blue-500 text-white"
                          : "border-default-300 bg-white text-transparent",
                      )}
                    >
                      ✓
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {item.displayTitle}
                        </span>
                        <Chip size="sm">
                          {mapTypeLabel(item.contentType, isZh)}
                        </Chip>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-default-400">
                        {item.courseName ? <span>{item.courseName}</span> : null}
                        {item.unitName ? <span>{item.unitName}</span> : null}
                        {item.updatedAt ? (
                          <span>
                            {isZh ? "更新于 " : "Updated "}
                            {formatUpdatedAt(item.updatedAt, locale)}
                          </span>
                        ) : null}
                      </div>
                      {item.summaryText ? (
                        <p className="mt-2 line-clamp-2 text-sm text-default-500">
                          {item.summaryText}
                        </p>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-divider px-5 py-4">
          <p className="text-sm text-default-500">
            {isZh
              ? `已选择 ${draftSelectedItems.length} / ${MAX_SELECTION} 项`
              : `Selected ${draftSelectedItems.length} / ${MAX_SELECTION}`}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onPress={onClose}>
              {isZh ? "取消" : "Cancel"}
            </Button>
            <Button variant="primary" onPress={() => onConfirm(draftSelectedItems)}>
              {isZh ? "确认引用" : "Confirm References"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
