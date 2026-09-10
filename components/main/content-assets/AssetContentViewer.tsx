"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  BookOpenText,
  FileText,
  Download,
} from "lucide-react";
import { Button } from "@heroui/react";
import { ApiError } from "@/lib/api/client";
import { useAppI18n } from "@/lib/app-i18n/provider";
import type {
  ContentAsset,
  ContentAssetDetail,
  ContentAssetSpreadsheetPreview,
  ContentAssetSummary,
} from "@/lib/content-assets/types";
import * as assetClient from "@/lib/content-assets/client";
import AssetTextViewer from "./AssetTextViewer";

const AssetImageViewer = dynamic(() => import("./AssetImageViewer"), {
  ssr: false,
  loading: () => <div className="h-[480px] animate-pulse rounded-xl bg-slate-100" />,
});

const FlashcardViewer = dynamic(() => import("./FlashcardViewer"), {
  ssr: false,
  loading: () => <div className="h-[320px] animate-pulse rounded-xl bg-slate-100" />,
});

const PdfViewerInner = dynamic(() => import("./PdfViewerInner"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-default-300 border-t-foreground" />
    </div>
  ),
});

const AssetDocxViewer = dynamic(() => import("./AssetDocxViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-default-300 border-t-foreground" />
    </div>
  ),
});

const AssetSpreadsheetViewer = dynamic(
  () => import("./AssetSpreadsheetViewer"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-20">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-default-300 border-t-foreground" />
      </div>
    ),
  },
);

const ContentLibrarySnapshotView = dynamic(
  () =>
    import("@/components/main/content-library/ContentLibraryRenderers").then(
      (module) => module.ContentLibrarySnapshotView,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-20">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-default-300 border-t-foreground" />
      </div>
    ),
  },
);

type AssetContentViewerProps = {
  asset: ContentAssetSummary | null;
  onAssetUnavailable?: (assetId: string) => void;
};

const VIEWER_CACHE_TTL_MS = 10 * 60 * 1000;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const detailCache = new Map<string, CacheEntry<ContentAssetDetail>>();
const detailInflight = new Map<string, Promise<ContentAssetDetail>>();
const signedUrlCache = new Map<string, CacheEntry<string>>();
const signedUrlInflight = new Map<string, Promise<string>>();
const docxPreviewCache = new Map<string, CacheEntry<string>>();
const docxPreviewInflight = new Map<string, Promise<string>>();
const spreadsheetPreviewCache = new Map<
  string,
  CacheEntry<ContentAssetSpreadsheetPreview>
>();
const spreadsheetPreviewInflight = new Map<
  string,
  Promise<ContentAssetSpreadsheetPreview>
>();

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string) {
  const current = cache.get(key);
  if (!current) return null;
  if (current.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return current.value;
}

async function withInflightCache<T>(
  cache: Map<string, CacheEntry<T>>,
  inflight: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>,
) {
  const cached = readCache(cache, key);
  if (cached !== null) {
    return cached;
  }

  const existing = inflight.get(key);
  if (existing) {
    return existing;
  }

  const next = load()
    .then((value) => {
      cache.set(key, {
        expiresAt: Date.now() + VIEWER_CACHE_TTL_MS,
        value,
      });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, next);
  return next;
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string, locale: "zh" | "en") {
  try {
    return new Date(iso).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function isWorksheetProjectReferenceItem(
  item: ContentAssetDetail["contentLibraryItem"],
): item is NonNullable<ContentAssetDetail["contentLibraryItem"]> & {
  snapshot: Extract<
    NonNullable<ContentAssetDetail["contentLibraryItem"]>["snapshot"],
    { kind: "worksheet_project" }
  >;
} {
  return item?.snapshot.kind === "worksheet_project";
}

function resolveDisplayFileName(asset: {
  title?: string | null;
  fileName?: string | null;
}) {
  return asset.fileName?.trim() || asset.title?.trim() || "—";
}

function shouldLoadDetail(summary: ContentAssetSummary) {
  return summary.previewKind === "text" || summary.assetSource === "reference";
}

function shouldLoadSignedUrl(summary: ContentAssetSummary) {
  return (
    summary.previewKind === "image" ||
    summary.previewKind === "pdf" ||
    summary.previewKind === "download"
  );
}

function shouldLoadDocxPreview(summary: ContentAssetSummary) {
  return summary.previewKind === "docx";
}

function shouldLoadSpreadsheetPreview(summary: ContentAssetSummary) {
  return summary.previewKind === "spreadsheet";
}

function canFallbackToSignedUrl(summary: ContentAssetSummary) {
  return shouldLoadSignedUrl(summary) || summary.previewKind === "text";
}

async function readAssetDetail(assetId: string) {
  return withInflightCache(detailCache, detailInflight, assetId, () =>
    assetClient.getAssetDetail(assetId),
  );
}

async function readAssetSignedUrl(assetId: string) {
  return withInflightCache(signedUrlCache, signedUrlInflight, assetId, () =>
    assetClient.getAssetSignedUrl(assetId),
  );
}

async function readAssetDocxPreview(assetId: string) {
  return withInflightCache(docxPreviewCache, docxPreviewInflight, assetId, () =>
    assetClient.getAssetDocxPreview(assetId),
  );
}

async function readAssetSpreadsheetPreview(assetId: string) {
  return withInflightCache(
    spreadsheetPreviewCache,
    spreadsheetPreviewInflight,
    assetId,
    () => assetClient.getAssetSpreadsheetPreview(assetId),
  );
}

export function primeAssetDetailCache(detail: ContentAssetDetail) {
  detailCache.set(detail.asset.id, {
    expiresAt: Date.now() + VIEWER_CACHE_TTL_MS,
    value: detail,
  });
}

function peekAssetDetailCache(assetId: string) {
  return readCache(detailCache, assetId);
}

const contentVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

const contentTransition = {
  duration: 0.18,
  ease: [0.25, 0.1, 0.25, 1] as const,
};

export default function AssetContentViewer({
  asset,
  onAssetUnavailable,
}: AssetContentViewerProps) {
  const { isZh, locale } = useAppI18n();
  const router = useRouter();
  const [detailAsset, setDetailAsset] = useState<ContentAsset | null>(null);
  const [referenceItem, setReferenceItem] = useState<ContentAssetDetail["contentLibraryItem"]>(null);
  const [referenceStatus, setReferenceStatus] = useState<ContentAssetDetail["referenceStatus"]>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [spreadsheetPreview, setSpreadsheetPreview] =
    useState<ContentAssetSpreadsheetPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAsset = useCallback(async (summary: ContentAssetSummary) => {
    if (shouldLoadDetail(summary)) {
      const cachedDetail = peekAssetDetailCache(summary.id);
      if (cachedDetail) {
        setLoading(false);
        setError(null);
        setSignedUrl(null);
        setDetailAsset(cachedDetail.asset);
        setReferenceItem(cachedDetail.contentLibraryItem);
        setReferenceStatus(cachedDetail.referenceStatus);
        setDocxHtml(null);
        setSpreadsheetPreview(null);
        return;
      }
    }

    setLoading(true);
    setError(null);
    setSignedUrl(null);
    setDetailAsset(null);
    setReferenceItem(null);
    setReferenceStatus(null);
    setDocxHtml(null);
    setSpreadsheetPreview(null);

    try {
      if (shouldLoadDetail(summary)) {
        const detail = await readAssetDetail(summary.id);
        setDetailAsset(detail.asset);
        setReferenceItem(detail.contentLibraryItem);
        setReferenceStatus(detail.referenceStatus);

        if (detail.detailKind === "reference") {
          return;
        }

        if (!detail.asset.rawText && canFallbackToSignedUrl(summary)) {
          const url = await readAssetSignedUrl(summary.id);
          setSignedUrl(url);
        }
        return;
      }

      if (shouldLoadDocxPreview(summary)) {
        const html = await readAssetDocxPreview(summary.id);
        setDocxHtml(html);
        return;
      }

      if (shouldLoadSpreadsheetPreview(summary)) {
        const preview = await readAssetSpreadsheetPreview(summary.id);
        setSpreadsheetPreview(preview);
        return;
      }

      if (shouldLoadSignedUrl(summary)) {
        const url = await readAssetSignedUrl(summary.id);
        setSignedUrl(url);
      }
    } catch (nextError) {
      if (nextError instanceof ApiError && nextError.status === 404) {
        onAssetUnavailable?.(summary.id);
        setError(
          isZh
            ? "该资产已失效，正在从内容库中移除"
            : "This asset is no longer available and is being removed from the library",
        );
        return;
      }
      setError(nextError instanceof Error ? nextError.message : isZh ? "加载失败" : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [isZh, onAssetUnavailable]);

  useEffect(() => {
    if (!asset) {
      setDetailAsset(null);
      setReferenceItem(null);
      setReferenceStatus(null);
      setSignedUrl(null);
      setDocxHtml(null);
      setSpreadsheetPreview(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (asset.previewKind === "flashcard") {
      setDetailAsset(null);
      setReferenceItem(null);
      setSignedUrl(null);
      setDocxHtml(null);
      setSpreadsheetPreview(null);
      setError(null);
      setLoading(false);
      return;
    }

    void loadAsset(asset);
  }, [asset, loadAsset]);

  const title = asset?.title || detailAsset?.title || asset?.fileName || (isZh ? "未命名" : "Untitled");
  const metaLine = [
    referenceItem?.courseName ?? asset?.courseName,
    referenceItem?.unitName ?? asset?.unitName,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <AnimatePresence mode="wait">
      {!asset ? (
        <motion.div
          key="empty"
          {...contentVariants}
          transition={contentTransition}
          className="flex flex-1 flex-col items-center justify-center text-default-300"
        >
          <FileText className="mb-3 h-10 w-10" strokeWidth={1} />
          <p className="text-[13px]">
            {isZh ? "选择文件以查看内容" : "Select a file to view content"}
          </p>
        </motion.div>
      ) : (
        <motion.div
          key={asset.id}
          {...contentVariants}
          transition={contentTransition}
          className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden"
        >
          {loading ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-default-300 border-t-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-sm font-medium text-rose-600">
                {isZh ? "加载失败" : "Failed to load"}
              </p>
              <p className="text-xs text-default-400">{error}</p>
            </div>
          ) : (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: 0.06 }}
                className="flex shrink-0 items-center justify-between border-b border-divider px-5 py-3"
              >
                <div className="min-w-0">
                  <h2
                    data-testid="content-asset-viewer-title"
                    className="truncate text-[14px] font-medium text-foreground"
                  >
                    {title}
                  </h2>
                  {metaLine ? (
                    <p className="mt-1 truncate text-[12px] text-default-400">
                      {metaLine}
                    </p>
                  ) : null}
                </div>
                <Button
                  onPress={() =>
                    router.push(`/main/agent?refAssetId=${encodeURIComponent(asset.id)}`)
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accent/90"
                >
                  <BookOpenText className="h-3.5 w-3.5" />
                  {isZh ? "引用到 Agent" : "Add to Agent"}
                </Button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: 0.1 }}
                className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-5"
              >
                <AssetContentBody
                  summary={asset}
                  detailAsset={detailAsset}
                  referenceItem={referenceItem}
                  referenceStatus={referenceStatus}
                  signedUrl={signedUrl}
                  docxHtml={docxHtml}
                  spreadsheetPreview={spreadsheetPreview}
                  isZh={isZh}
                />
              </motion.div>

              <AssetMetaBar
                asset={detailAsset ?? asset}
                referenceItem={referenceItem}
                isZh={isZh}
                locale={locale}
              />
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AssetContentBody({
  summary,
  detailAsset,
  referenceItem,
  referenceStatus,
  signedUrl,
  docxHtml,
  spreadsheetPreview,
  isZh,
}: {
  summary: ContentAssetSummary;
  detailAsset: ContentAsset | null;
  referenceItem: ContentAssetDetail["contentLibraryItem"];
  referenceStatus: ContentAssetDetail["referenceStatus"];
  signedUrl: string | null;
  docxHtml: string | null;
  spreadsheetPreview: ContentAssetSpreadsheetPreview | null;
  isZh: boolean;
}) {
  if (referenceItem) {
    return (
      <div data-testid="content-asset-reference-view">
        <ContentLibrarySnapshotView item={referenceItem} />
      </div>
    );
  }

  if (summary.assetSource === "reference" && referenceStatus === "orphan") {
    return (
      <div
        data-testid="content-asset-reference-orphan-view"
        className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-5 text-sm text-amber-900"
      >
        <p className="font-medium">
          {isZh ? "该内容索引已失效" : "This content reference is no longer available"}
        </p>
        <p className="mt-2 text-[13px] leading-6 text-amber-800">
          {isZh
            ? "这条资产是历史内容库引用，但底层内容已不存在或未完成迁移，当前不会再尝试按 PDF / Word 原件打开。你可以删除这条记录，或重新生成并保存一份新的内容。"
            : "This asset points to an older library reference whose underlying content no longer exists or was not migrated. It can no longer be opened from the original PDF or Word file. You can delete this record or regenerate and save a new copy."}
        </p>
      </div>
    );
  }

  if (summary.previewKind === "flashcard" && summary.flashcardSetId) {
    return <FlashcardViewer setId={summary.flashcardSetId} />;
  }

  if (summary.previewKind === "image" && signedUrl) {
    return (
      <div className="flex min-h-0 flex-1">
        <AssetImageViewer
          fileUrl={signedUrl}
          rawText={detailAsset?.rawText ?? null}
        />
      </div>
    );
  }

  if (summary.previewKind === "pdf" && signedUrl) {
    return (
      <div data-testid="content-asset-pdf-view" className="flex min-h-0 flex-1">
        <PdfViewerInner fileUrl={signedUrl} />
      </div>
    );
  }

  if (summary.previewKind === "docx" && docxHtml) {
    return (
      <div data-testid="content-asset-docx-view" className="flex min-h-0 flex-1">
        <AssetDocxViewer html={docxHtml} />
      </div>
    );
  }

  if (summary.previewKind === "spreadsheet" && spreadsheetPreview) {
    return (
      <div
        data-testid="content-asset-spreadsheet-view"
        className="flex min-h-0 flex-1"
      >
        <AssetSpreadsheetViewer
          preview={spreadsheetPreview}
          fileName={summary.fileName}
        />
      </div>
    );
  }

  if (detailAsset?.rawText) {
    return (
      <div data-testid="content-asset-text-view" className="min-h-0 flex-1">
        <AssetTextViewer
          rawText={detailAsset.rawText}
          fileType={detailAsset.fileType}
          fileName={detailAsset.fileName}
        />
      </div>
    );
  }

  if ((summary.previewKind === "download" || summary.previewKind === "text") && signedUrl) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-default-300 py-10">
        <Download className="h-8 w-8 text-default-300" />
        <a
          href={signedUrl}
          target="_blank"
          rel="noopener noreferrer"
          download={summary.fileName || undefined}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent/90"
        >
          {isZh ? "下载文件" : "Download file"}
        </a>
        {summary.fileName && (
          <p className="text-[12px] text-default-400">{summary.fileName}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed border-default-300 py-10 text-sm text-default-400">
      {isZh ? "暂无可预览内容" : "No preview available"}
    </div>
  );
}

function AssetMetaBar({
  asset,
  referenceItem,
  isZh,
  locale,
}: {
  asset: Pick<
    ContentAsset,
    "title" | "fileName" | "fileSizeBytes" | "pageCount" | "createdAt"
  > | Pick<ContentAssetSummary, "title" | "fileName" | "fileSizeBytes" | "pageCount" | "createdAt">;
  referenceItem: ContentAssetDetail["contentLibraryItem"];
  isZh: boolean;
  locale: "zh" | "en";
}) {
  const worksheetProjectSnapshot = isWorksheetProjectReferenceItem(referenceItem)
    ? referenceItem.snapshot
    : null;
  const durationValue =
    worksheetProjectSnapshot && worksheetProjectSnapshot.draft.duration > 0
      ? isZh
        ? `${worksheetProjectSnapshot.draft.duration} 分钟`
        : `${worksheetProjectSnapshot.draft.duration} min`
      : "—";
  const questionPageValue = worksheetProjectSnapshot
    ? [
        isZh
          ? `${worksheetProjectSnapshot.stats.questionCount} 题`
          : `${worksheetProjectSnapshot.stats.questionCount} questions`,
        worksheetProjectSnapshot.stats.pageCount
          ? isZh
            ? `${worksheetProjectSnapshot.stats.pageCount} 页`
            : `${worksheetProjectSnapshot.stats.pageCount} pages`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-divider px-5 py-3 text-[11px] text-default-400 md:grid-cols-4">
      <div>
        <p className="mb-1 text-[11px] font-medium text-foreground/30">
          {isZh ? "文件名" : "File name"}
        </p>
        <p className="truncate text-[12px] text-foreground">
          {resolveDisplayFileName(asset)}
        </p>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium text-foreground/30">
          {worksheetProjectSnapshot ? (isZh ? "时长" : "Duration") : isZh ? "大小" : "Size"}
        </p>
        <p className="text-[12px] text-foreground">
          {worksheetProjectSnapshot ? durationValue : formatFileSize(asset.fileSizeBytes)}
        </p>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium text-foreground/30">
          {worksheetProjectSnapshot ? (isZh ? "题数 / 页数" : "Questions / Pages") : isZh ? "页数" : "Pages"}
        </p>
        <p className="text-[12px] text-foreground">
          {worksheetProjectSnapshot ? questionPageValue || "—" : asset.pageCount ?? "—"}
        </p>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium text-foreground/30">
          {isZh ? "添加时间" : "Added"}
        </p>
        <p className="text-[12px] text-foreground">
          {formatDate(asset.createdAt, locale)}
        </p>
      </div>
    </div>
  );
}
