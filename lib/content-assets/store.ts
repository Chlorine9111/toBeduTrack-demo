import type {
  AssetStoreClient,
  ContentAssetSummary,
  AssetCategory,
  AssetSource,
  ContentAsset,
  CreateReferenceAssetInput,
  CreateUploadedAssetInput,
  ProcessingStatus,
} from "@/lib/content-assets/types";
import { ensureDefaultFolders } from "@/lib/content-assets/folders";
import { toContentAssetSummary } from "@/lib/content-assets/summary";
import { normalizeGeneratedContentTitle } from "@/lib/content/title-normalization";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

// ── 缓存 ─────────────────────────────────────────────────

type ReadCacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const ASSET_LIST_CACHE_TTL_MS = 20_000;
const ASSET_DETAIL_CACHE_TTL_MS = 20_000;

const assetReadCache = new Map<string, ReadCacheEntry<unknown>>();
const assetInflightCache = new Map<string, Promise<unknown>>();

function readCachedValue<T>(key: string): T | null {
  const current = assetReadCache.get(key);
  if (!current) return null;
  if (current.expiresAt <= Date.now()) {
    assetReadCache.delete(key);
    return null;
  }
  return current.value as T;
}

async function withReadCache<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const cached = readCachedValue<T>(key);
  if (cached !== null) {
    return cached;
  }

  const inflight = assetInflightCache.get(key);
  if (inflight) {
    return inflight as Promise<T>;
  }

  const next = load()
    .then((value) => {
      assetReadCache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });
      return value;
    })
    .finally(() => {
      assetInflightCache.delete(key);
    });

  assetInflightCache.set(key, next);
  return next;
}

function buildAssetCacheKey(
  scope: "list" | "detail" | "summary-list" | "file-source",
  teacherId: string,
  params: Record<string, unknown>,
) {
  return `asset:${scope}:${teacherId}:${JSON.stringify(params)}`;
}

export function invalidateAssetReadCache(teacherId: string) {
  const teacherKeyFragment = `:${teacherId}:`;
  for (const key of assetReadCache.keys()) {
    if (key.includes(teacherKeyFragment)) {
      assetReadCache.delete(key);
    }
  }
  for (const key of assetInflightCache.keys()) {
    if (key.includes(teacherKeyFragment)) {
      assetInflightCache.delete(key);
    }
  }
}

// ── Row 映射 ──────────────────────────────────────────────

type ContentAssetRow = {
  id: string;
  teacher_id: string;
  folder_id: string | null;
  asset_source: string;
  file_name: string | null;
  file_type: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  storage_path: string | null;
  storage_bucket: string | null;
  ref_entity_type: string | null;
  ref_entity_id: string | null;
  content_library_item_id: string | null;
  title: string;
  raw_text: string | null;
  summary_text: string | null;
  tags: string[];
  search_text: string;
  course_id: string | null;
  unit_id: string | null;
  course_label: string | null;
  unit_label: string | null;
  category: string;
  processing_status: string;
  processing_error: string | null;
  chunk_count: number;
  page_count: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type ContentAssetSummaryRow = {
  id: string;
  folder_id: string | null;
  asset_source: string;
  file_name: string | null;
  file_type: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  ref_entity_type: string | null;
  ref_entity_id: string | null;
  content_library_item_id: string | null;
  title: string;
  course_id: string | null;
  unit_id: string | null;
  course_label: string | null;
  unit_label: string | null;
  category: string;
  summary_text: string | null;
  processing_status: string;
  processing_error: string | null;
  chunk_count: number;
  page_count: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type ContentAssetFileSourceRow = {
  id: string;
  teacher_id: string;
  asset_source: string;
  file_name: string | null;
  mime_type: string | null;
  storage_path: string | null;
  storage_bucket: string | null;
  updated_at: string;
};

export type ContentAssetFileSource = {
  id: string;
  teacherId: string;
  assetSource: AssetSource;
  fileName: string | null;
  mimeType: string | null;
  storagePath: string | null;
  storageBucket: string | null;
  updatedAt: string;
};

export type DeleteAssetResult = {
  assetId: string;
  storagePath: string | null;
  storageBucket: string | null;
};

const VISIBLE_CONTENT_ASSET_OR_FILTER = [
  "asset_source.eq.uploaded",
  "and(asset_source.eq.reference,content_library_item_id.not.is.null)",
  "and(asset_source.eq.reference,ref_entity_type.eq.content_library_item,ref_entity_id.not.is.null)",
  "and(asset_source.eq.reference,ref_entity_type.eq.flashcard_set,ref_entity_id.not.is.null)",
].join(",");

const CONTENT_ASSET_SUMMARY_SELECT = [
  "id",
  "folder_id",
  "asset_source",
  "file_name",
  "file_type",
  "mime_type",
  "file_size_bytes",
  "ref_entity_type",
  "ref_entity_id",
  "content_library_item_id",
  "title",
  "course_id",
  "unit_id",
  "course_label",
  "unit_label",
  "category",
  "summary_text",
  "processing_status",
  "processing_error",
  "chunk_count",
  "page_count",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

const CONTENT_ASSET_DETAIL_SELECT = [
  "id",
  "teacher_id",
  "folder_id",
  "asset_source",
  "file_name",
  "file_type",
  "mime_type",
  "file_size_bytes",
  "storage_path",
  "storage_bucket",
  "ref_entity_type",
  "ref_entity_id",
  "content_library_item_id",
  "title",
  "raw_text",
  "summary_text",
  "tags",
  "search_text",
  "course_id",
  "unit_id",
  "course_label",
  "unit_label",
  "category",
  "processing_status",
  "processing_error",
  "chunk_count",
  "page_count",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

function mapAssetRow(row: ContentAssetRow): ContentAsset {
  const normalizedTitle = normalizeGeneratedContentTitle(row.title) || row.title;
  return {
    id: row.id,
    teacherId: row.teacher_id,
    folderId: row.folder_id,
    assetSource: row.asset_source as AssetSource,
    fileName: row.file_name,
    fileType: row.file_type,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    storagePath: row.storage_path,
    storageBucket: row.storage_bucket,
    refEntityType: row.ref_entity_type as ContentAsset["refEntityType"],
    refEntityId: row.ref_entity_id,
    contentLibraryItemId: row.content_library_item_id,
    title: normalizedTitle,
    rawText: row.raw_text,
    summaryText: row.summary_text,
    tags: row.tags ?? [],
    searchText: row.search_text,
    courseId: row.course_id,
    unitId: row.unit_id,
    courseLabel: row.course_label,
    unitLabel: row.unit_label,
    category: (row.category ?? "uncategorized") as AssetCategory,
    processingStatus: row.processing_status as ProcessingStatus,
    processingError: row.processing_error,
    chunkCount: row.chunk_count,
    pageCount: row.page_count,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAssetSummaryRow(row: ContentAssetSummaryRow): ContentAssetSummary {
  return toContentAssetSummary({
    id: row.id,
    folderId: row.folder_id,
    assetSource: row.asset_source as AssetSource,
    fileName: row.file_name,
    fileType: row.file_type,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    contentLibraryItemId: row.content_library_item_id,
    title: row.title,
    courseId: row.course_id,
    unitId: row.unit_id,
    courseName: row.course_label,
    unitName: row.unit_label,
    category: (row.category ?? "uncategorized") as AssetCategory,
    summaryText: row.summary_text ?? null,
    processingStatus: row.processing_status as ProcessingStatus,
    processingError: row.processing_error,
    chunkCount: row.chunk_count,
    pageCount: row.page_count,
    refEntityType: row.ref_entity_type as ContentAsset["refEntityType"],
    refEntityId: row.ref_entity_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapAssetFileSourceRow(row: ContentAssetFileSourceRow): ContentAssetFileSource {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    assetSource: row.asset_source as AssetSource,
    fileName: row.file_name,
    mimeType: row.mime_type,
    storagePath: row.storage_path,
    storageBucket: row.storage_bucket,
    updatedAt: row.updated_at,
  };
}

// ── 辅助 ──────────────────────────────────────────────────

function cleanText(value: string | null | undefined): string {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function buildSearchText(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => cleanText(part))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

// ── 列表 ──────────────────────────────────────────────────

export type ListAssetsOptions = {
  folderId?: string;
  status?: ProcessingStatus;
  query?: string;
  assetSource?: AssetSource;
  limit?: number;
  offset?: number;
};

export type ListAssetsResult = {
  items: ContentAsset[];
  total: number;
};

export async function listAssetSummaries(
  client: AssetStoreClient,
): Promise<ContentAssetSummary[]> {
  const cacheKey = buildAssetCacheKey("summary-list", client.teacherId, {
    kind: "bootstrap",
  });

  return withReadCache(cacheKey, ASSET_LIST_CACHE_TTL_MS, async () => {
    const { data, error } = await client.supabase
      .from("content_assets")
      .select(CONTENT_ASSET_SUMMARY_SELECT)
      .eq("teacher_id", client.teacherId)
      .or(VISIBLE_CONTENT_ASSET_OR_FILTER)
      .order("updated_at", { ascending: false });

    if (error) {
      throw new Error("读取资产摘要列表失败");
    }

    return ((data ?? []) as unknown as ContentAssetSummaryRow[]).map(mapAssetSummaryRow);
  });
}

export async function listAssetSummariesByIds(
  client: AssetStoreClient,
  assetIds: string[],
): Promise<ContentAssetSummary[]> {
  const normalizedIds = Array.from(
    new Set(assetIds.map((id) => `${id}`.trim()).filter(Boolean)),
  );

  if (normalizedIds.length === 0) {
    return [];
  }

  const { data, error } = await client.supabase
    .from("content_assets")
    .select(CONTENT_ASSET_SUMMARY_SELECT)
    .eq("teacher_id", client.teacherId)
    .in("id", normalizedIds);

  if (error) {
    throw new Error("读取资产状态失败");
  }

  const rows = ((data ?? []) as unknown as ContentAssetSummaryRow[]).map(mapAssetSummaryRow);
  const rowMap = new Map(rows.map((row) => [row.id, row]));
  return normalizedIds
    .map((id) => rowMap.get(id))
    .filter((row): row is ContentAssetSummary => row != null);
}

export async function listAssets(
  client: AssetStoreClient,
  options: ListAssetsOptions = {},
): Promise<ListAssetsResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const queryText = cleanText(options.query);

  const cacheKey = buildAssetCacheKey("list", client.teacherId, {
    folderId: options.folderId ?? null,
    status: options.status ?? null,
    query: queryText,
    assetSource: options.assetSource ?? null,
    limit,
    offset,
  });

  return withReadCache(cacheKey, ASSET_LIST_CACHE_TTL_MS, async () => {
    let query = client.supabase
      .from("content_assets")
      .select(CONTENT_ASSET_DETAIL_SELECT, { count: "exact" })
      .eq("teacher_id", client.teacherId)
      .or(VISIBLE_CONTENT_ASSET_OR_FILTER)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (options.folderId) {
      query = query.eq("folder_id", options.folderId);
    }
    if (options.status) {
      query = query.eq("processing_status", options.status);
    }
    if (options.assetSource) {
      query = query.eq("asset_source", options.assetSource);
    }
    if (queryText) {
      query = query.ilike("search_text", `%${queryText}%`);
    }

    const { data, count, error } = await query;

    if (error) {
      throw new Error("读取资产列表失败");
    }

    const rows = (data ?? []) as unknown as ContentAssetRow[];

    return {
      items: rows.map(mapAssetRow),
      total: count ?? rows.length,
    };
  });
}

// ── 详情 ──────────────────────────────────────────────────

export async function getAsset(
  client: AssetStoreClient,
  assetId: string,
): Promise<ContentAsset | null> {
  const cacheKey = buildAssetCacheKey("detail", client.teacherId, { assetId });

  return withReadCache(cacheKey, ASSET_DETAIL_CACHE_TTL_MS, async () => {
    const { data, error } = await client.supabase
      .from("content_assets")
      .select(CONTENT_ASSET_DETAIL_SELECT)
      .eq("id", assetId)
      .eq("teacher_id", client.teacherId)
      .maybeSingle();

    if (error) {
      throw new Error("读取资产详情失败");
    }

    if (!data) return null;
    return mapAssetRow(data as unknown as ContentAssetRow);
  });
}

export async function getAssetFileSource(
  client: AssetStoreClient,
  assetId: string,
): Promise<ContentAssetFileSource | null> {
  const cacheKey = buildAssetCacheKey("file-source", client.teacherId, { assetId });

  return withReadCache(cacheKey, ASSET_DETAIL_CACHE_TTL_MS, async () => {
    const { data, error } = await client.supabase
      .from("content_assets")
      .select(
        "id, teacher_id, asset_source, file_name, mime_type, storage_path, storage_bucket, updated_at",
      )
      .eq("id", assetId)
      .eq("teacher_id", client.teacherId)
      .maybeSingle();

    if (error) {
      throw new Error("读取资产文件来源失败");
    }

    if (!data) return null;
    return mapAssetFileSourceRow(data as ContentAssetFileSourceRow);
  });
}

// ── 创建上传资产 ──────────────────────────────────────────

export async function createUploadedAsset(
  client: AssetStoreClient,
  input: CreateUploadedAssetInput,
): Promise<ContentAsset> {
  let folderId = input.folderId ?? null;

  if (!folderId) {
    const defaults = await ensureDefaultFolders(client);
    folderId = defaults.uploadsFolder.id;
  }

  const title = cleanText(input.title) || cleanText(input.fileName) || "未命名文件";

  const { data, error } = await client.supabase
    .from("content_assets")
    .insert({
      teacher_id: client.teacherId,
      folder_id: folderId,
      asset_source: "uploaded",
      file_name: input.fileName,
      file_type: input.fileType,
      mime_type: input.mimeType,
      file_size_bytes: input.fileSizeBytes,
      storage_path: input.storagePath,
      storage_bucket: "content-assets",
      title,
      search_text: buildSearchText([title, input.fileName]),
      processing_status: "pending",
      chunk_count: 0,
      tags: [],
      metadata: {},
    })
    .select(CONTENT_ASSET_DETAIL_SELECT)
    .single();

  if (error) {
    throw new Error("创建上传资产失败");
  }

  invalidateAssetReadCache(client.teacherId);
  return mapAssetRow(data as unknown as ContentAssetRow);
}

// ── 创建引用资产 ──────────────────────────────────────────

export async function createReferenceAsset(
  client: AssetStoreClient,
  input: CreateReferenceAssetInput,
): Promise<ContentAsset> {
  const title = cleanText(normalizeGeneratedContentTitle(input.title)) || "未命名引用";
  const fileName = cleanText(input.fileName) || null;

  const { data, error } = await client.supabase
    .from("content_assets")
    .insert({
      teacher_id: client.teacherId,
      folder_id: input.folderId ?? null,
      asset_source: "reference",
      storage_path: null,
      storage_bucket: null as unknown as string,
      file_name: fileName,
      file_type: null,
      mime_type: null,
      file_size_bytes: null,
      ref_entity_type: input.refEntityType,
      ref_entity_id: input.refEntityId,
      content_library_item_id: input.contentLibraryItemId ?? null,
      title,
      raw_text: input.rawText ?? null,
      search_text: buildSearchText([
        title,
        fileName,
        input.rawText,
        input.courseLabel,
        input.unitLabel,
      ]),
      course_id: input.courseId ?? null,
      unit_id: input.unitId ?? null,
      course_label: input.courseLabel ?? null,
      unit_label: input.unitLabel ?? null,
      processing_status: "ready",
      chunk_count: 0,
      tags: [],
      metadata: {},
    })
    .select(CONTENT_ASSET_DETAIL_SELECT)
    .single();

  if (error) {
    throw new Error("创建引用资产失败");
  }

  invalidateAssetReadCache(client.teacherId);
  return mapAssetRow(data as unknown as ContentAssetRow);
}

// ── 更新 ──────────────────────────────────────────────────

export type UpdateAssetInput = {
  title?: string;
  fileName?: string | null;
  folderId?: string | null;
  courseId?: string | null;
  unitId?: string | null;
  category?: string;
};

export async function updateAsset(
  client: AssetStoreClient,
  assetId: string,
  updates: UpdateAssetInput,
): Promise<ContentAsset> {
  const current = await getAsset(client, assetId);
  if (!current) {
    throw new Error("ASSET_NOT_FOUND");
  }

  const nextTitle = Object.prototype.hasOwnProperty.call(updates, "title")
    ? cleanText(updates.title) || current.title
    : current.title;
  const nextFileName = Object.prototype.hasOwnProperty.call(updates, "fileName")
    ? cleanText(updates.fileName) || null
    : current.fileName;

  const nextFolderId = Object.prototype.hasOwnProperty.call(updates, "folderId")
    ? updates.folderId ?? null
    : current.folderId;

  const nextCourseId = Object.prototype.hasOwnProperty.call(updates, "courseId")
    ? updates.courseId ?? null
    : current.courseId;

  const nextUnitId = Object.prototype.hasOwnProperty.call(updates, "unitId")
    ? updates.unitId ?? null
    : current.unitId;

  const nextCategory = Object.prototype.hasOwnProperty.call(updates, "category")
    ? updates.category ?? current.category
    : current.category;

  const { data, error } = await client.supabase
    .from("content_assets")
    .update({
      title: nextTitle,
      file_name: nextFileName,
      folder_id: nextFolderId,
      course_id: nextCourseId,
      unit_id: nextUnitId,
      category: nextCategory,
      search_text: buildSearchText([
        nextTitle,
        nextFileName,
        current.summaryText,
        current.courseLabel,
        current.unitLabel,
      ]),
    })
    .eq("id", assetId)
    .eq("teacher_id", client.teacherId)
    .select(CONTENT_ASSET_DETAIL_SELECT)
    .single();

  if (error) {
    throw new Error("更新资产失败");
  }

  invalidateAssetReadCache(client.teacherId);
  return mapAssetRow(data as unknown as ContentAssetRow);
}

// ── 删除 ──────────────────────────────────────────────────

export async function deleteAsset(
  client: AssetStoreClient,
  assetId: string,
): Promise<DeleteAssetResult> {
  const { data: asset, error: readError } = await client.supabase
    .from("content_assets")
    .select("id, storage_path, storage_bucket")
    .eq("id", assetId)
    .eq("teacher_id", client.teacherId)
    .maybeSingle();

  if (readError) {
    throw new Error("读取资产失败");
  }

  if (!asset) {
    throw new Error("ASSET_NOT_FOUND");
  }

  const { error: deleteError } = await client.supabase
    .from("content_assets")
    .delete()
    .eq("id", assetId)
    .eq("teacher_id", client.teacherId);

  if (deleteError) {
    throw new Error("删除资产失败");
  }

  invalidateAssetReadCache(client.teacherId);

  return {
    assetId: (asset as { id: string }).id,
    storagePath: (asset as { storage_path: string | null }).storage_path,
    storageBucket: (asset as { storage_bucket: string | null }).storage_bucket,
  };
}

export async function runContentAssetCleanupTask(params: {
  client: AssetStoreClient;
  assetId: string;
  storagePath?: string | null;
  storageBucket?: string | null;
}) {
  const { error: semanticError } = await params.client.supabase
    .from("semantic_index_items")
    .delete()
    .eq("source_kind", "content_asset")
    .eq("source_id", params.assetId);

  if (semanticError) {
    throw new Error("删除资产语义索引失败");
  }

  if (params.storagePath && params.storageBucket) {
    const { error: storageError } = await params.client.supabase.storage
      .from(params.storageBucket)
      .remove([params.storagePath]);

    if (storageError) {
      throw new Error(storageError.message || "删除资产文件失败");
    }
  }
}

// ── 移动 ──────────────────────────────────────────────────

export async function moveAsset(
  client: AssetStoreClient,
  assetId: string,
  targetFolderId: string | null,
): Promise<ContentAsset> {
  const { data, error } = await client.supabase
    .from("content_assets")
    .update({ folder_id: targetFolderId })
    .eq("id", assetId)
    .eq("teacher_id", client.teacherId)
    .select(CONTENT_ASSET_DETAIL_SELECT)
    .single();

  if (error) {
    throw new Error("移动资产失败");
  }

  invalidateAssetReadCache(client.teacherId);
  return mapAssetRow(data as unknown as ContentAssetRow);
}

// ── 处理状态更新（admin，绕过 RLS） ──────────────────────

export type UpdateProcessingStatusExtra = {
  rawText?: string;
  chunkCount?: number;
  pageCount?: number;
  error?: string;
  summaryText?: string;
  tags?: string[];
  searchText?: string;
  category?: string;
};

export async function updateProcessingStatus(
  assetId: string,
  status: ProcessingStatus,
  extra?: UpdateProcessingStatusExtra,
): Promise<void> {
  const adminClient = createAdminSupabaseClient();

  const updatePayload: Record<string, unknown> = {
    processing_status: status,
  };

  if (extra?.rawText !== undefined) {
    updatePayload.raw_text = extra.rawText;
  }
  if (extra?.chunkCount !== undefined) {
    updatePayload.chunk_count = extra.chunkCount;
  }
  if (extra?.pageCount !== undefined) {
    updatePayload.page_count = extra.pageCount;
  }
  if (extra?.error !== undefined) {
    updatePayload.processing_error = extra.error;
  }
  if (extra?.summaryText !== undefined) {
    updatePayload.summary_text = extra.summaryText;
  }
  if (extra?.tags !== undefined) {
    updatePayload.tags = extra.tags;
  }
  if (extra?.searchText !== undefined) {
    updatePayload.search_text = extra.searchText;
  }
  if (extra?.category !== undefined) {
    updatePayload.category = extra.category;
  }

  const { error } = await adminClient
    .from("content_assets")
    .update(updatePayload)
    .eq("id", assetId);

  if (error) {
    throw new Error("更新资产处理状态失败");
  }
}
