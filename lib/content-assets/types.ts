import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ContentLibraryDetail,
  ContentLibraryOriginEntity,
  ContentLibraryRenderer,
} from "@/lib/content-library/types";
import type { Database } from "@/types/database";

// ── 枚举类型 ──────────────────────────────────────────────

export type AssetSource = "uploaded" | "reference";

export type ProcessingStatus =
  | "pending"
  | "parsing"
  | "chunking"
  | "embedding"
  | "summarizing"
  | "ready"
  | "failed";

export type AssetCategory =
  | "instructional"
  | "assessment"
  | "student_work"
  | "reference"
  | "uncategorized";

export type RefEntityType =
  | "rubric"
  | "lesson_plan"
  | "exercise"
  | "pbl_project_plan"
  | "content_library_item"
  | "flashcard_set";

export type AssetPreviewKind =
  | "flashcard"
  | "text"
  | "image"
  | "pdf"
  | "spreadsheet"
  | "docx"
  | "download";

// ── 实体类型 ──────────────────────────────────────────────

export type ContentFolder = {
  id: string;
  teacherId: string;
  parentId: string | null;
  name: string;
  slug: string;
  sortOrder: number;
  isSystem: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ContentAsset = {
  id: string;
  teacherId: string;
  folderId: string | null;
  assetSource: AssetSource;
  fileName: string | null;
  fileType: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  storagePath: string | null;
  storageBucket: string | null;
  refEntityType: RefEntityType | null;
  refEntityId: string | null;
  contentLibraryItemId: string | null;
  title: string;
  rawText: string | null;
  summaryText: string | null;
  tags: string[];
  searchText: string;
  courseId: string | null;
  unitId: string | null;
  courseLabel: string | null;
  unitLabel: string | null;
  category: AssetCategory;
  processingStatus: ProcessingStatus;
  processingError: string | null;
  chunkCount: number;
  pageCount: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ContentAssetSummary = {
  id: string;
  folderId: string | null;
  assetSource: AssetSource;
  fileName: string | null;
  fileType: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  refEntityType: RefEntityType | null;
  refEntityId: string | null;
  contentLibraryItemId: string | null;
  title: string;
  note: string | null;
  rendererType: ContentLibraryRenderer | null;
  originEntityType: ContentLibraryOriginEntity | null;
  originEntityId: string | null;
  courseId: string | null;
  unitId: string | null;
  courseName: string | null;
  unitName: string | null;
  sourceConversationId: string | null;
  sourceConversationTitle: string | null;
  category: AssetCategory;
  summaryText: string | null;
  processingStatus: ProcessingStatus;
  processingError: string | null;
  chunkCount: number;
  pageCount: number | null;
  previewKind: AssetPreviewKind;
  flashcardSetId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContentAssetsBootstrapData = {
  folders: ContentFolder[];
  assets: ContentAssetSummary[];
};

export type ContentAssetDetail = {
  detailKind: "uploaded" | "reference";
  referenceStatus: "resolved" | "orphan" | null;
  asset: ContentAsset;
  contentLibraryItem: ContentLibraryDetail | null;
};

export type ContentAssetSpreadsheetSheet = {
  name: string;
  headers: string[];
  rows: string[][];
  totalRows: number;
  totalColumns: number;
  visibleRows: number;
  visibleColumns: number;
  usedFirstRowAsHeader: boolean;
};

export type ContentAssetSpreadsheetPreview = {
  sheets: ContentAssetSpreadsheetSheet[];
};

export type ContentAssetChunk = {
  id: string;
  assetId: string;
  teacherId: string;
  chunkIndex: number;
  pageStart: number | null;
  pageEnd: number | null;
  title: string | null;
  content: string;
  contentPreview: string | null;
  tokenCount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

// ── Client ────────────────────────────────────────────────

export type AssetStoreClient = {
  teacherId: string;
  supabase: SupabaseClient<Database>;
};

// ── 写入输入 ──────────────────────────────────────────────

export type CreateUploadedAssetInput = {
  folderId?: string;
  fileName: string;
  fileType: string;
  mimeType: string;
  fileSizeBytes: number;
  storagePath: string;
  title?: string;
};

export type CreateReferenceAssetInput = {
  folderId?: string;
  refEntityType: RefEntityType;
  refEntityId: string;
  contentLibraryItemId?: string;
  title: string;
  fileName?: string | null;
  rawText?: string;
  courseId?: string;
  unitId?: string;
  courseLabel?: string;
  unitLabel?: string;
};
