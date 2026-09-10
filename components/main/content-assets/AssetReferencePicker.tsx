"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpenText, FileText, Search, X } from "lucide-react";
import { Button, Spinner } from "@heroui/react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";
import type { ContentAsset } from "@/lib/content-assets/types";
import { listAssets } from "@/lib/content-assets/client";

export type AgentReferenceSelection = {
  id: string;
  title: string;
  fileType: string | null;
  assetSource: ContentAsset["assetSource"];
};

type AssetReferencePickerProps = {
  open: boolean;
  selectedIds: string[];
  onClose: () => void;
  onConfirm: (assets: AgentReferenceSelection[]) => void;
};

const MAX_SELECTION = 8;

function mapReferenceTypeLabel(asset: ContentAsset, isZh: boolean) {
  if (asset.assetSource === "reference") return isZh ? "内容" : "Content";
  const fileType = asset.fileType;
  if (!fileType) return isZh ? "文件" : "File";
  if (fileType.includes("pdf")) return "PDF";
  if (fileType.includes("image") || fileType.includes("png") || fileType.includes("jpg") || fileType.includes("jpeg")) {
    return isZh ? "图片" : "Image";
  }
  if (fileType.includes("doc") || fileType.includes("word")) return "Word";
  if (fileType.includes("sheet") || fileType.includes("excel") || fileType.includes("csv")) {
    return isZh ? "表格" : "Sheet";
  }
  if (fileType.includes("text") || fileType.includes("txt")) return isZh ? "文本" : "Text";
  return isZh ? "文件" : "File";
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

export default function AssetReferencePicker({
  open,
  selectedIds,
  onClose,
  onConfirm,
}: AssetReferencePickerProps) {
  const { isZh, locale } = useAppI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContentAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [draftSelectedIds, setDraftSelectedIds] = useState<Set<string>>(new Set(selectedIds));
  const [assetMap, setAssetMap] = useState<Map<string, ContentAsset>>(new Map());

  useEffect(() => {
    if (!open) return;
    setDraftSelectedIds(new Set(selectedIds));
    setQuery("");
  }, [open, selectedIds]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
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

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setErrorText("");

      try {
        const response = await listAssets({
          query: query.trim() || undefined,
          status: "ready",
          limit: 60,
        });

        if (cancelled) return;
        setResults(response.items);

        setAssetMap((prev) => {
          const next = new Map(prev);
          for (const item of response.items) {
            next.set(item.id, item);
          }
          return next;
        });
      } catch (err) {
        if (cancelled) return;
        setResults([]);
        setErrorText(err instanceof Error ? err.message : isZh ? "读取内容列表失败" : "Failed to load content list");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isZh, open, query]);

  const untitledLabel = isZh ? "未命名" : "Untitled";

  const toggleItem = (asset: ContentAsset) => {
    setDraftSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(asset.id)) {
        next.delete(asset.id);
      } else if (next.size < MAX_SELECTION) {
        next.add(asset.id);
      }
      return next;
    });
    setAssetMap((prev) => {
      const next = new Map(prev);
      next.set(asset.id, asset);
      return next;
    });
  };

  const handleConfirm = () => {
    const selected = Array.from(draftSelectedIds)
      .map((id) => {
        const asset = assetMap.get(id);
        return asset
          ? {
              id: asset.id,
              title: asset.title,
              fileType: asset.fileType,
              assetSource: asset.assetSource,
            }
          : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    onConfirm(selected);
  };

  const draftSelectedAssets = useMemo(() => {
    return Array.from(draftSelectedIds)
      .map((id) => assetMap.get(id))
      .filter((asset): asset is ContentAsset => asset !== undefined);
  }, [draftSelectedIds, assetMap]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center px-4 py-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-slate-950/42" />

      <section
        data-testid="agent-asset-reference-picker"
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-divider bg-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-divider px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-foreground/40">
              {isZh ? "我的内容" : "My Content"}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              {isZh ? "选择引用内容" : "Choose Content to Reference"}
            </h2>
            <p className="mt-1 text-sm text-default-500">
              {isZh
                ? `最多选择 ${MAX_SELECTION} 项内容。文件原件和内容库条目都会作为本轮上下文进入生成链路。`
                : `Select up to ${MAX_SELECTION} items. Source files and library entries will both be added to this run's context.`}
            </p>
          </div>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            onPress={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-default bg-white text-foreground-400 hover:bg-default-100 hover:text-foreground-600"
            aria-label={isZh ? "关闭内容引用面板" : "Close content reference panel"}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="border-b border-divider px-5 py-4">
          <label className="flex items-center gap-3 rounded-2xl border border-divider bg-content1 px-4 py-3">
            <Search className="h-4 w-4 text-default-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={isZh ? "搜索标题、课程或单元..." : "Search titles, courses, or units..."}
              className="w-full bg-transparent text-sm text-foreground outline-hidden placeholder:text-default-400"
            />
          </label>

          {draftSelectedAssets.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {draftSelectedAssets.map((asset) => (
                <Button
                  key={asset.id}
                  size="sm"
                  variant="ghost"
                  data-testid="agent-asset-reference-tag"
                  onPress={() => toggleItem(asset)}
                  className="inline-flex h-auto items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-100"
                >
                  {asset.assetSource === "reference" ? (
                    <BookOpenText className="h-3.5 w-3.5" />
                  ) : (
                    <FileText className="h-3.5 w-3.5" />
                  )}
                  <span className="max-w-[220px] truncate">
                    {asset.title || asset.fileName || untitledLabel}
                  </span>
                  <X className="h-3 w-3" />
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-sm text-foreground-500">
              <Spinner size="sm" />
              {isZh ? "正在读取内容列表..." : "Loading content list..."}
            </div>
          ) : null}

          {!loading && errorText ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorText}
            </div>
          ) : null}

          {!loading && !errorText && results.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-default-200 bg-content1 text-sm text-default-400">
              {isZh ? "暂无可用内容" : "No content available"}
            </div>
          ) : null}

          {!loading && !errorText ? (
            <div className="space-y-2">
              {results.map((asset) => {
                const checked = draftSelectedIds.has(asset.id);
                const disabled = !checked && draftSelectedIds.size >= MAX_SELECTION;

                return (
                  <button
                    key={asset.id}
                    type="button"
                    data-testid={`agent-asset-reference-item-${asset.id}`}
                    onClick={() => toggleItem(asset)}
                    disabled={disabled}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
                      checked
                        ? "border-amber-300 bg-amber-50"
                        : "border-divider bg-white hover:bg-content1",
                      disabled && "cursor-not-allowed opacity-45",
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold",
                        checked
                          ? "border-amber-500 bg-amber-500 text-white"
                          : "border-default-300 bg-white text-transparent",
                      )}
                    >
                      ✓
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {asset.title || asset.fileName || untitledLabel}
                        </span>
                        <span className="rounded-full bg-[#F5F5F5] px-2 py-0.5 text-[11px] text-default-400">
                          {mapReferenceTypeLabel(asset, isZh)}
                        </span>
                        {asset.assetSource === "reference" ? (
                          <span className="rounded-full bg-[rgba(105,64,165,0.08)] px-2 py-0.5 text-[11px] text-[#6940A5]">
                            {isZh ? "内容库" : "Library"}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-default-400">
                        {asset.courseLabel ? <span>{asset.courseLabel}</span> : null}
                        {asset.unitLabel ? <span>{asset.unitLabel}</span> : null}
                        {asset.updatedAt ? (
                          <span>
                            {isZh ? "更新于" : "Updated"} {formatUpdatedAt(asset.updatedAt, locale)}
                          </span>
                        ) : null}
                      </div>
                      {asset.summaryText ? (
                        <p className="mt-2 line-clamp-2 text-sm text-default-500">
                          {asset.summaryText}
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
              ? `已选择 ${draftSelectedIds.size} / ${MAX_SELECTION} 项内容`
              : `Selected ${draftSelectedIds.size} / ${MAX_SELECTION} items`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onPress={onClose}
              className="rounded-2xl border border-default bg-white px-4 py-2 text-sm text-foreground-500 hover:bg-default-100"
            >
              {isZh ? "取消" : "Cancel"}
            </Button>
            <Button
              onPress={handleConfirm}
              className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            >
              {isZh ? "确认引用" : "Confirm Reference"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
