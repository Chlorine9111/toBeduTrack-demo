import type {
  AssetCategory,
  AssetPreviewKind,
  AssetSource,
  ContentAsset,
  ContentAssetSummary,
  ProcessingStatus,
  RefEntityType,
} from "@/lib/content-assets/types";
import { normalizeGeneratedContentTitle } from "@/lib/content/title-normalization";

type AssetSummarySource = {
  id: string;
  folderId: string | null;
  assetSource: AssetSource;
  fileName: string | null;
  fileType: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  contentLibraryItemId?: string | null;
  title: string;
  note?: string | null;
  rendererType?: ContentAssetSummary["rendererType"];
  originEntityType?: ContentAssetSummary["originEntityType"];
  originEntityId?: string | null;
  courseId?: string | null;
  unitId?: string | null;
  courseName?: string | null;
  unitName?: string | null;
  sourceConversationId?: string | null;
  sourceConversationTitle?: string | null;
  category: AssetCategory;
  summaryText?: string | null;
  processingStatus: ProcessingStatus;
  processingError: string | null;
  chunkCount: number;
  pageCount: number | null;
  refEntityType?: RefEntityType | null;
  refEntityId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

function readFileName(source: AssetSummarySource) {
  return `${source.fileName ?? ""}`.trim().toLowerCase();
}

function readMime(source: AssetSummarySource) {
  return `${source.mimeType ?? source.fileType ?? ""}`.trim().toLowerCase();
}

export function resolveFlashcardSetId(source: {
  refEntityType?: RefEntityType | null;
  refEntityId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  if (
    source.refEntityType === "flashcard_set" &&
    typeof source.refEntityId === "string" &&
    source.refEntityId.trim()
  ) {
    return source.refEntityId.trim();
  }

  const flashcardSetId = source.metadata?.flashcard_set_id;
  return typeof flashcardSetId === "string" && flashcardSetId.trim()
    ? flashcardSetId.trim()
    : null;
}

export function inferAssetPreviewKind(source: AssetSummarySource): AssetPreviewKind {
  if (resolveFlashcardSetId(source)) {
    return "flashcard";
  }

  if (source.assetSource === "reference") {
    return "text";
  }

  const mime = readMime(source);
  const fileName = readFileName(source);

  // 原件优先 — 有存储文件的按格式渲染
  if (
    mime === "application/pdf" ||
    mime === "pdf" ||
    fileName.endsWith(".pdf")
  ) {
    return "pdf";
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.oasis.opendocument.spreadsheet" ||
    mime === "text/csv" ||
    mime === "text/tab-separated-values" ||
    fileName.endsWith(".xlsx") ||
    fileName.endsWith(".xls") ||
    fileName.endsWith(".csv") ||
    fileName.endsWith(".tsv") ||
    fileName.endsWith(".ods")
  ) {
    return "spreadsheet";
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword" ||
    fileName.endsWith(".docx") ||
    fileName.endsWith(".doc")
  ) {
    return "docx";
  }

  if (
    mime.startsWith("image/") ||
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg") ||
    fileName.endsWith(".png") ||
    fileName.endsWith(".gif") ||
    fileName.endsWith(".webp") ||
    fileName.endsWith(".svg") ||
    fileName.endsWith(".bmp")
  ) {
    return "image";
  }

  // 纯文本/Markdown
  if (
    mime.startsWith("text/") ||
    mime.includes("markdown") ||
    fileName.endsWith(".txt") ||
    fileName.endsWith(".md") ||
    fileName.endsWith(".markdown")
  ) {
    return "text";
  }

  // 有提取文本的走文本渲染
  if (source.chunkCount > 0) {
    return "text";
  }

  return "download";
}

export function toContentAssetSummary(source: AssetSummarySource): ContentAssetSummary {
  const isReferenceAsset = source.assetSource === "reference";
  const normalizedTitle = normalizeGeneratedContentTitle(source.title) || source.title;

  return {
    id: source.id,
    folderId: source.folderId,
    assetSource: source.assetSource,
    fileName: source.fileName,
    fileType: source.fileType,
    mimeType: source.mimeType,
    fileSizeBytes: source.fileSizeBytes,
    refEntityType: isReferenceAsset ? (source.refEntityType ?? null) : null,
    refEntityId: isReferenceAsset ? (source.refEntityId ?? null) : null,
    contentLibraryItemId: isReferenceAsset ? (source.contentLibraryItemId ?? null) : null,
    title: normalizedTitle,
    note: source.note ?? null,
    rendererType: isReferenceAsset ? (source.rendererType ?? null) : null,
    originEntityType: isReferenceAsset ? (source.originEntityType ?? null) : null,
    originEntityId: isReferenceAsset ? (source.originEntityId ?? null) : null,
    courseId: source.courseId ?? null,
    unitId: source.unitId ?? null,
    courseName: source.courseName ?? null,
    unitName: source.unitName ?? null,
    sourceConversationId: source.sourceConversationId ?? null,
    sourceConversationTitle: source.sourceConversationTitle ?? null,
    category: source.category,
    summaryText: source.summaryText ?? null,
    processingStatus: source.processingStatus,
    processingError: source.processingError,
    chunkCount: source.chunkCount,
    pageCount: source.pageCount,
    previewKind: inferAssetPreviewKind(source),
    flashcardSetId: resolveFlashcardSetId(source),
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

export function toContentAssetSummaryFromAsset(asset: ContentAsset): ContentAssetSummary {
  return toContentAssetSummary({
    id: asset.id,
    folderId: asset.folderId,
    assetSource: asset.assetSource,
    fileName: asset.fileName,
    fileType: asset.fileType,
    mimeType: asset.mimeType,
    fileSizeBytes: asset.fileSizeBytes,
    contentLibraryItemId: asset.contentLibraryItemId,
    title: asset.title,
    note: null,
    rendererType: null,
    originEntityType: null,
    originEntityId: null,
    courseId: asset.courseId,
    unitId: asset.unitId,
    courseName: asset.courseLabel,
    unitName: asset.unitLabel,
    category: asset.category,
    summaryText: asset.summaryText ?? null,
    processingStatus: asset.processingStatus,
    processingError: asset.processingError,
    chunkCount: asset.chunkCount,
    pageCount: asset.pageCount,
    refEntityType: asset.refEntityType,
    refEntityId: asset.refEntityId,
    metadata: asset.metadata,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  });
}
