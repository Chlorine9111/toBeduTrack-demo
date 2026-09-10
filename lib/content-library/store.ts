import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { fromExerciseDifficulty } from "@/types/exercise";
import {
  removeContentLibrarySemanticIndexItems,
  searchContentLibrarySemanticHits,
  syncContentLibrarySemanticIndexItems,
} from "@/lib/content-library/semantic-index";
import {
  buildEditableContentLibraryHtml,
  resolveContentLibraryDocumentKind,
} from "@/lib/content-library/editable-document";
import { normalizeGeneratedContentTitle } from "@/lib/content/title-normalization";
import { deleteContentLibraryRowsAfterLinkedAssets } from "@/lib/content-library/delete-helpers";
import type {
  ContentLibraryOriginCleanupPayload,
  ContentLibraryProjectionSyncPayload,
} from "@/lib/content-library/background-tasks";
import { revalidateContentAssets } from "@/lib/content-assets/bootstrap";
import { invalidateAssetReadCache } from "@/lib/content-assets/store";
import {
  autosaveDocument,
  createDocument,
  getDocumentDetail,
  type DocumentClient,
} from "@/lib/documents/store";
import { extractWorksheetProjectStoredAssetsFromSnapshot, deleteWorksheetProjectStoredAssets } from "@/lib/question-bank/worksheet-project-storage";
import type { WorksheetProjectSnapshot } from "@/lib/question-bank/worksheet-project-types";
import type {
  ContentLibraryDetail,
  ContentLibraryListItem,
  ContentLibraryListOptions,
  ContentLibraryListResult,
  ContentLibraryOriginEntity,
  ContentLibraryRenderer,
  ContentLibrarySnapshot,
  ContentLibraryType,
} from "@/lib/content-library/types";

type AppSupabase = SupabaseClient<Database>;

export type ContentLibraryClient = {
  teacherId: string;
  supabase: AppSupabase;
};

type EnsureContentLibraryDocumentResult = {
  item: ContentLibraryDetail;
  document: NonNullable<Awaited<ReturnType<typeof getDocumentDetail>>>;
  created: boolean;
};

type ContentLibraryRow = Database["public"]["Tables"]["content_library_items"]["Row"];
type CourseMeta = { id: string; name: string; code: string };
type UnitMeta = { id: string; unit_number: number | string; title: string; course_id?: string };
type ConversationMeta = { id: string; title: string | null };

type JoinedContentLibraryRow = ContentLibraryRow & {
  course?: CourseMeta | CourseMeta[] | null;
  unit?: UnitMeta | UnitMeta[] | null;
  sourceConversation?: ConversationMeta | ConversationMeta[] | null;
};

type ReadCacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const CONTENT_LIBRARY_LIST_SELECT_BASE = `
  id,teacher_id,content_type,renderer_type,
  origin_key,origin_entity_type,origin_entity_id,
  title,custom_title,note,summary_text,
  course_id,unit_id,course_label,unit_label,
  source_conversation_id,source_message_id,source_item_id,
  created_at,updated_at,
  course:courses(id,name,code),
  unit:units(id,unit_number,title),
  sourceConversation:assistant_conversations(id,title)
`;
// 列表查询精简 SELECT — 排除 snapshot/metadata/search_text 等大字段
const CONTENT_LIBRARY_LIST_SELECT = `
  document_id,
  ${CONTENT_LIBRARY_LIST_SELECT_BASE}
`;
const CONTENT_LIBRARY_LIST_SELECT_LEGACY = CONTENT_LIBRARY_LIST_SELECT_BASE;
// 详情查询保持全字段
const CONTENT_LIBRARY_DETAIL_SELECT = `
  *,
  course:courses(id,name,code),
  unit:units(id,unit_number,title),
  sourceConversation:assistant_conversations(id,title)
`;
const CONTENT_LIBRARY_CORE_SELECT_BASE = `
  id,teacher_id,content_type,renderer_type,
  origin_key,origin_entity_type,origin_entity_id,
  title,custom_title,note,summary_text,search_text,
  course_id,unit_id,course_label,unit_label,
  source_conversation_id,source_message_id,source_item_id,
  metadata,snapshot,created_at,updated_at
`;
const CONTENT_LIBRARY_CORE_SELECT = `
  document_id,
  ${CONTENT_LIBRARY_CORE_SELECT_BASE}
`;
const CONTENT_LIBRARY_CORE_SELECT_LEGACY = CONTENT_LIBRARY_CORE_SELECT_BASE;
const CONTENT_LIBRARY_LIST_CACHE_TTL_MS = 20_000;
const CONTENT_LIBRARY_DETAIL_CACHE_TTL_MS = 20_000;
const CONTENT_LIBRARY_FILTER_CACHE_TTL_MS = 20_000;
const contentLibraryReadCache = new Map<string, ReadCacheEntry<unknown>>();
const contentLibraryInflightCache = new Map<string, Promise<unknown>>();
let contentLibraryDocumentIdColumnSupported: boolean | null = null;

type UpsertContentLibraryInput = {
  originKey: string;
  originEntityType: ContentLibraryOriginEntity;
  originEntityId?: string | null;
  sourceConversationId?: string | null;
  sourceMessageId?: string | null;
  sourceItemId?: string | null;
  contentType: ContentLibraryType;
  rendererType: ContentLibraryRenderer;
  title: string;
  summaryText?: string | null;
  courseId?: string | null;
  unitId?: string | null;
  courseLabel?: string | null;
  unitLabel?: string | null;
  snapshot: ContentLibrarySnapshot;
  metadata?: Record<string, unknown>;
  extraSearchText?: string | null;
};

type UpdateContentLibraryInput = {
  title?: string | null;
  note?: string | null;
  courseId?: string;
  unitId?: string | null;
  documentHtml?: string;
};

type UpdateContentLibraryResult = {
  item: ContentLibraryDetail;
  projectionSyncPayload: ContentLibraryProjectionSyncPayload | null;
};

type DeleteContentLibraryResult = {
  deletedIds: string[];
  blockedIds: string[];
  missingIds: string[];
  originCleanupPayload: ContentLibraryOriginCleanupPayload | null;
};

type ReclassifyContentLibraryResult = {
  updatedIds: string[];
  missingIds: string[];
};

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function isWorksheetProjectSnapshot(
  snapshot: Json | null,
): snapshot is WorksheetProjectSnapshot {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return false;
  }
  return Reflect.get(snapshot, "kind") === "worksheet_project";
}

function syncWorksheetProjectSnapshotTitle(
  snapshot: Json | null,
  title: string,
): Json | null {
  if (!isWorksheetProjectSnapshot(snapshot)) {
    return snapshot;
  }
  return {
    ...snapshot,
    draft: {
      ...snapshot.draft,
      title,
    },
  } as unknown as Json;
}

function buildSearchText(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => cleanText(part))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function shouldPreferKeywordOnlySearch(queryText: string) {
  const normalized = cleanText(queryText);
  if (!normalized) return false;
  if (normalized.length > 40) return false;
  if (/["'()[\]{}:]/.test(normalized)) return false;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length > 3) return false;
  return true;
}

function readCachedValue<T>(key: string): T | null {
  const current = contentLibraryReadCache.get(key);
  if (!current) return null;
  if (current.expiresAt <= Date.now()) {
    contentLibraryReadCache.delete(key);
    return null;
  }
  return current.value as T;
}

async function withReadCache<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const cached = readCachedValue<T>(key);
  if (cached !== null) {
    return cached;
  }

  const inflight = contentLibraryInflightCache.get(key);
  if (inflight) {
    return inflight as Promise<T>;
  }

  const next = load()
    .then((value) => {
      contentLibraryReadCache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });
      return value;
    })
    .finally(() => {
      contentLibraryInflightCache.delete(key);
    });

  contentLibraryInflightCache.set(key, next);
  return next;
}

function buildContentLibraryCacheKey(
  scope: "list" | "detail" | "question-filters",
  teacherId: string,
  params: Record<string, unknown>,
) {
  return `${scope}:${teacherId}:${JSON.stringify(params)}`;
}

export function invalidateContentLibraryReadCache(teacherId: string) {
  const teacherKeyFragment = `:${teacherId}:`;
  for (const key of contentLibraryReadCache.keys()) {
    if (key.includes(teacherKeyFragment)) {
      contentLibraryReadCache.delete(key);
    }
  }
  for (const key of contentLibraryInflightCache.keys()) {
    if (key.includes(teacherKeyFragment)) {
      contentLibraryInflightCache.delete(key);
    }
  }
}

function formatUnitLabel(unitNumber: number | string, title: string) {
  const normalizedNumber = `${unitNumber}`.trim();
  if (!normalizedNumber) {
    return title.trim() || null;
  }
  return `Unit ${normalizedNumber} · ${title.trim()}`;
}

function extractExerciseOriginId(snapshot: Json): string | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }

  const kind = Reflect.get(snapshot, "kind");
  if (kind !== "exercise") {
    return null;
  }

  const exercise = Reflect.get(snapshot, "exercise");
  if (!exercise || typeof exercise !== "object" || Array.isArray(exercise)) {
    return null;
  }

  const exerciseId = Reflect.get(exercise, "id");
  return typeof exerciseId === "string" && exerciseId.trim() ? exerciseId : null;
}

function resolveOriginEntity(row: Pick<ContentLibraryRow, "origin_entity_type" | "origin_entity_id" | "renderer_type"> & { snapshot?: ContentLibraryRow["snapshot"] | null }) {
  if (row.origin_entity_type === "exercise" && row.origin_entity_id) {
    return {
      originEntityType: "exercise" as const,
      originEntityId: row.origin_entity_id,
    };
  }

  // snapshot 可能在轻量列表查询中不存在，安全处理
  if (row.renderer_type === "exercise" && row.snapshot) {
    const exerciseId = extractExerciseOriginId(row.snapshot);
    if (exerciseId) {
      return {
        originEntityType: "exercise" as const,
        originEntityId: exerciseId,
      };
    }
  }

  return {
    originEntityType: row.origin_entity_type as ContentLibraryOriginEntity,
    originEntityId: row.origin_entity_id,
  };
}

function resolveRowDocumentId(row: {
  document_id?: string | null;
  metadata?: Json | Record<string, unknown> | null;
}) {
  if (typeof row.document_id === "string" && row.document_id.trim()) {
    return row.document_id;
  }

  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : null;
  const fallbackDocumentId = metadata?.documentId;
  return typeof fallbackDocumentId === "string" && fallbackDocumentId.trim()
    ? fallbackDocumentId
    : null;
}

function mapListItem(row: JoinedContentLibraryRow): ContentLibraryListItem {
  const course = pickFirst(row.course);
  const unit = pickFirst(row.unit);
  const sourceConversation = pickFirst(row.sourceConversation);
  const origin = resolveOriginEntity(row);
  const normalizedTitle = normalizeGeneratedContentTitle(row.title) || row.title;
  const normalizedCustomTitle = normalizeGeneratedContentTitle(row.custom_title) || row.custom_title;

  return {
    id: row.id,
    documentId: resolveRowDocumentId(row),
    contentType: row.content_type as ContentLibraryType,
    rendererType: row.renderer_type as ContentLibraryRenderer,
    originEntityType: origin.originEntityType,
    originEntityId: origin.originEntityId,
    title: normalizedTitle,
    displayTitle: normalizedCustomTitle?.trim() || normalizedTitle,
    note: row.note,
    summaryText: row.summary_text,
    courseId: row.course_id,
    unitId: row.unit_id,
    courseName: course?.name ?? row.course_label ?? null,
    unitName:
      (unit ? formatUnitLabel(unit.unit_number, unit.title) : null) ??
      row.unit_label ??
      null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceConversationId: row.source_conversation_id,
    sourceConversationTitle: sourceConversation?.title ?? null,
    sourceMessageId: row.source_message_id,
  };
}

function mapDetail(row: JoinedContentLibraryRow): ContentLibraryDetail {
  return {
    ...mapListItem(row),
    customTitle: row.custom_title,
    sourceItemId: row.source_item_id,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    snapshot: row.snapshot as unknown as ContentLibrarySnapshot,
  };
}

function buildOriginLookupKey(
  originEntityType: ContentLibraryOriginEntity,
  originEntityId: string,
) {
  return `${originEntityType}:${originEntityId}`;
}

function toDocumentClient(client: ContentLibraryClient): DocumentClient {
  return {
    teacherId: client.teacherId,
    supabase: client.supabase,
  };
}

function normalizeMetadataRecord(value: Json | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function buildContentLibraryDocumentLinkUpdate(params: {
  currentMetadata: Json | Record<string, unknown> | null | undefined;
  documentId: string;
  htmlContent: string;
  version: number;
}) {
  return {
    document_id: params.documentId,
    metadata: {
      ...normalizeMetadataRecord(params.currentMetadata as Json),
      documentId: params.documentId,
      documentHtml: params.htmlContent,
      sourceDocumentVersion: params.version,
    } as Json,
  };
}

async function updateContentLibraryDocumentLinkRecord(params: {
  client: ContentLibraryClient;
  itemId: string;
  currentMetadata: Json | Record<string, unknown> | null | undefined;
  documentId: string;
  htmlContent: string;
  version: number;
}) {
  const payload = buildContentLibraryDocumentLinkUpdate(params);
  const runUpdate = (nextPayload: { document_id?: string | null; metadata: Json }) =>
    params.client.supabase
      .from("content_library_items")
      .update(nextPayload)
      .eq("id", params.itemId)
      .eq("teacher_id", params.client.teacherId);

  if (contentLibraryDocumentIdColumnSupported === false) {
    return runUpdate({
      metadata: payload.metadata,
    });
  }

  const result = await runUpdate(payload);
  if (!result.error) {
    contentLibraryDocumentIdColumnSupported = true;
    return result;
  }

  if (!isMissingContentLibraryDocumentIdColumnError(result.error)) {
    return result;
  }

  contentLibraryDocumentIdColumnSupported = false;
  return runUpdate({
    metadata: payload.metadata,
  });
}

async function readContentLibraryRowById(client: ContentLibraryClient, itemId: string) {
  const { data, error } = await client.supabase
    .from("content_library_items")
    .select(CONTENT_LIBRARY_DETAIL_SELECT)
    .eq("id", itemId)
    .eq("teacher_id", client.teacherId)
    .maybeSingle();

  if (error) {
    throw new Error("读取内容失败");
  }

  return (data as JoinedContentLibraryRow | null) ?? null;
}

async function persistContentLibraryDocumentLink(params: {
  client: ContentLibraryClient;
  item: ContentLibraryDetail;
  documentId: string;
  htmlContent: string;
  version: number;
}) {
  const { error } = await updateContentLibraryDocumentLinkRecord({
    client: params.client,
    itemId: params.item.id,
    currentMetadata: params.item.metadata,
    documentId: params.documentId,
    htmlContent: params.htmlContent,
    version: params.version,
  });

  if (error) {
    console.error("[content-library] 更新内容文档关联失败", error);
    throw new Error("更新内容文档关联失败");
  }
}

async function readContentLibraryListRowsByIds(
  client: ContentLibraryClient,
  itemIds: string[],
) {
  if (itemIds.length === 0) return [];

  const { data, error } = await runContentLibraryQueryWithDocumentIdFallback({
    run: (select) =>
      client.supabase
        .from("content_library_items")
        .select(select)
        .in("id", itemIds)
        .eq("teacher_id", client.teacherId),
    select: CONTENT_LIBRARY_LIST_SELECT,
    legacySelect: CONTENT_LIBRARY_LIST_SELECT_LEGACY,
  });

  if (error) {
    console.error("[content-library] 读取内容列表失败", error);
    throw new Error("读取内容列表失败");
  }

  return (data ?? []) as unknown as JoinedContentLibraryRow[];
}

async function readContentLibraryRowsByIds(client: ContentLibraryClient, itemIds: string[]) {
  if (itemIds.length === 0) return [];
  const { data, error } = await runContentLibraryQueryWithDocumentIdFallback({
    run: (select) =>
      client.supabase
        .from("content_library_items")
        .select(select)
        .in("id", itemIds)
        .eq("teacher_id", client.teacherId),
    select: CONTENT_LIBRARY_CORE_SELECT,
    legacySelect: CONTENT_LIBRARY_CORE_SELECT_LEGACY,
  });

  if (error) {
    console.error("[content-library] 读取内容详情失败", error);
    throw new Error("读取内容失败");
  }

  return (data ?? []) as unknown as ContentLibraryRow[];
}

async function readContentLibraryListRowsByOrigins(
  client: ContentLibraryClient,
  origins: Array<{
    originEntityType: ContentLibraryOriginEntity;
    originEntityId: string;
  }>,
) {
  const groupedOrigins = new Map<ContentLibraryOriginEntity, string[]>();

  for (const origin of origins) {
    const originEntityId = origin.originEntityId.trim();
    if (!originEntityId) continue;
    const bucket = groupedOrigins.get(origin.originEntityType) ?? [];
    bucket.push(originEntityId);
    groupedOrigins.set(origin.originEntityType, bucket);
  }

  const rows: JoinedContentLibraryRow[] = [];

  for (const [originEntityType, originEntityIds] of groupedOrigins.entries()) {
    const { data, error } = await runContentLibraryQueryWithDocumentIdFallback({
      run: (select) =>
        client.supabase
          .from("content_library_items")
          .select(select)
          .eq("teacher_id", client.teacherId)
          .eq("origin_entity_type", originEntityType)
          .in("origin_entity_id", Array.from(new Set(originEntityIds))),
      select: CONTENT_LIBRARY_LIST_SELECT,
      legacySelect: CONTENT_LIBRARY_LIST_SELECT_LEGACY,
    });

    if (error) {
      console.error("[content-library] 读取来源内容列表失败", error);
      throw new Error("读取内容列表失败");
    }

    rows.push(...((data ?? []) as unknown as JoinedContentLibraryRow[]));
  }

  return rows;
}

async function readContentLibraryDetailRowsByOrigins(
  client: ContentLibraryClient,
  origins: Array<{
    originEntityType: ContentLibraryOriginEntity;
    originEntityId: string;
  }>,
) {
  const groupedOrigins = new Map<ContentLibraryOriginEntity, string[]>();

  for (const origin of origins) {
    const originEntityId = origin.originEntityId.trim();
    if (!originEntityId) continue;
    const bucket = groupedOrigins.get(origin.originEntityType) ?? [];
    bucket.push(originEntityId);
    groupedOrigins.set(origin.originEntityType, bucket);
  }

  const rows: JoinedContentLibraryRow[] = [];

  for (const [originEntityType, originEntityIds] of groupedOrigins.entries()) {
    const { data, error } = await client.supabase
      .from("content_library_items")
      .select(CONTENT_LIBRARY_DETAIL_SELECT)
      .eq("teacher_id", client.teacherId)
      .eq("origin_entity_type", originEntityType)
      .in("origin_entity_id", Array.from(new Set(originEntityIds)));

    if (error) {
      throw new Error("读取内容详情失败");
    }

    rows.push(...((data ?? []) as unknown as JoinedContentLibraryRow[]));
  }

  return rows;
}

async function findQuestionOriginEntityIdsByQuestionFilters(
  client: ContentLibraryClient,
  options: Pick<
    ContentLibraryListOptions,
    "clusterNodeId" | "subskillNodeId" | "difficulty" | "assessmentStyle" | "courseId" | "unitId"
  >,
  ) {
  if (
    !options.clusterNodeId &&
    !options.subskillNodeId &&
    !options.difficulty &&
    !options.assessmentStyle
  ) {
    return null;
  }

  const cacheKey = buildContentLibraryCacheKey("question-filters", client.teacherId, {
    clusterNodeId: options.clusterNodeId ?? null,
    subskillNodeId: options.subskillNodeId ?? null,
    difficulty: options.difficulty ?? null,
    assessmentStyle: options.assessmentStyle ?? null,
    courseId: options.courseId ?? null,
    unitId: options.unitId ?? null,
  });

  return withReadCache(cacheKey, CONTENT_LIBRARY_FILTER_CACHE_TTL_MS, async () => {
    const matchingExerciseIds = new Set<string>();

    if (options.clusterNodeId || options.subskillNodeId) {
      let taxonomyQuery = client.supabase
        .from("exercise_taxonomy_links")
        .select("exercise_id")
        .eq("teacher_id", client.teacherId);

      if (options.clusterNodeId) {
        taxonomyQuery = taxonomyQuery.eq("cluster_node_id", options.clusterNodeId);
      }
      if (options.subskillNodeId) {
        taxonomyQuery = taxonomyQuery.eq("subskill_node_id", options.subskillNodeId);
      }

      const { data, error } = await taxonomyQuery;
      if (error) {
        throw new Error("读取题目 taxonomy 过滤条件失败");
      }

      (data ?? []).forEach((row) => matchingExerciseIds.add(row.exercise_id));
      if (matchingExerciseIds.size === 0) {
        return [];
      }
    }

    if (options.difficulty || options.assessmentStyle) {
      let exerciseQuery = client.supabase
        .from("exercises")
        .select("id")
        .eq("teacher_id", client.teacherId);

      if (options.courseId) {
        exerciseQuery = exerciseQuery.eq("course_id", options.courseId);
      }
      if (options.unitId) {
        exerciseQuery = exerciseQuery.eq("unit_id", options.unitId);
      }
      if (options.difficulty) {
        exerciseQuery = exerciseQuery.eq("difficulty", fromExerciseDifficulty(options.difficulty));
      }
      if (options.assessmentStyle) {
        exerciseQuery = exerciseQuery.eq("assessment_style", options.assessmentStyle);
      }
      if (matchingExerciseIds.size > 0) {
        exerciseQuery = exerciseQuery.in("id", Array.from(matchingExerciseIds));
      }

      const { data, error } = await exerciseQuery;
      if (error) {
        throw new Error("读取题目过滤条件失败");
      }

      matchingExerciseIds.clear();
      (data ?? []).forEach((row) => matchingExerciseIds.add(row.id));
    }

    return Array.from(matchingExerciseIds);
  });
}

type ExistingSyncFields = {
  id: string;
  custom_title?: string | null;
  note?: string | null;
  metadata?: Json | null;
} | null;

function isMissingContentLibraryTableError(error: { code?: string | null; message?: string | null } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "PGRST205" || /Could not find the table/i.test(message);
}

type ContentLibraryQueryError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null;

function isMissingContentLibraryDocumentIdColumnError(error: ContentLibraryQueryError) {
  if (!error) return false;
  const combined = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return (
    (error.code === "42703" && /document_id/i.test(combined)) ||
    (/document_id/i.test(combined) &&
      /(column|content_library_items|schema cache)/i.test(combined))
  );
}

async function runContentLibraryQueryWithDocumentIdFallback<
  TResult extends { error: ContentLibraryQueryError },
>(params: {
  run: (select: string) => PromiseLike<TResult>;
  select: string;
  legacySelect: string;
}): Promise<TResult> {
  const preferLegacy = contentLibraryDocumentIdColumnSupported === false;
  const primary = await params.run(preferLegacy ? params.legacySelect : params.select);

  if (!primary.error) {
    if (!preferLegacy) {
      contentLibraryDocumentIdColumnSupported = true;
    }
    return primary;
  }

  if (preferLegacy || !isMissingContentLibraryDocumentIdColumnError(primary.error)) {
    return primary;
  }

  contentLibraryDocumentIdColumnSupported = false;
  return params.run(params.legacySelect);
}

function applyFilterEq<TQuery, TValue>(query: TQuery, column: string, value: TValue) {
  return (query as TQuery & {
    eq: (nextColumn: string, nextValue: TValue) => TQuery;
  }).eq(column, value);
}

function applyFilterIn<TQuery, TValue>(query: TQuery, column: string, values: readonly TValue[]) {
  return (query as TQuery & {
    in: (nextColumn: string, nextValues: readonly TValue[]) => TQuery;
  }).in(column, values);
}

function applyContentLibraryFilters<TQuery>(
  query: TQuery,
  options: Pick<ContentLibraryListOptions, "type" | "courseId" | "unitId"> & {
    filteredExerciseIds?: string[] | null;
  },
) {
  let next = query;
  if (options.type && options.type !== "all") {
    next = applyFilterEq(next, "content_type", options.type);
  }
  if (options.filteredExerciseIds) {
    next = applyFilterEq(next, "origin_entity_type", "exercise");
    next = applyFilterIn(next, "origin_entity_id", options.filteredExerciseIds);
  }
  if (options.courseId) {
    next = applyFilterEq(next, "course_id", options.courseId);
  }
  if (options.unitId) {
    next = applyFilterEq(next, "unit_id", options.unitId);
  }
  return next;
}

export function isContentLibraryUnavailableError(error: unknown) {
  return error instanceof Error && /CONTENT_LIBRARY_UNAVAILABLE/.test(error.message);
}

async function readExistingSyncFields(client: ContentLibraryClient, originKey: string): Promise<ExistingSyncFields> {
  const current = await client.supabase
    .from("content_library_items")
    .select("id,custom_title,note,metadata")
    .eq("origin_key", originKey)
    .eq("teacher_id", client.teacherId)
    .limit(1);

  if (current.error?.code === "42703") {
    const legacy = await client.supabase
      .from("content_library_items")
      .select("id")
      .eq("origin_key", originKey)
      .eq("teacher_id", client.teacherId)
      .limit(1);

    if (legacy.error) {
      throw new Error("读取内容同步状态失败");
    }

    return legacy.data?.[0] ?? null;
  }

  if (isMissingContentLibraryTableError(current.error)) {
    return null;
  }

  if (current.error) {
    throw new Error("读取内容同步状态失败");
  }

  return current.data?.[0] ?? null;
}

async function resolveCourseUnitSelection(
  client: ContentLibraryClient,
  params: { courseId?: string | null; unitId?: string | null },
) {
  let unitRow: UnitMeta | null = null;
  if (params.unitId) {
    const { data, error } = await client.supabase
      .from("units")
      .select("id,title,unit_number,course_id")
      .eq("id", params.unitId)
      .maybeSingle();

    if (error) {
      throw new Error("读取单元失败");
    }
    if (!data) {
      throw new Error("UNIT_NOT_FOUND");
    }
    unitRow = data as UnitMeta;
  }

  const effectiveCourseId = params.courseId ?? unitRow?.course_id ?? null;
  let courseRow: CourseMeta | null = null;
  if (effectiveCourseId) {
    const { data, error } = await client.supabase
      .from("courses")
      .select("id,name,code")
      .eq("id", effectiveCourseId)
      .maybeSingle();

    if (error) {
      throw new Error("读取课程失败");
    }
    if (!data) {
      throw new Error("COURSE_NOT_FOUND");
    }
    courseRow = data as CourseMeta;
  }

  if (unitRow && effectiveCourseId && unitRow.course_id !== effectiveCourseId) {
    throw new Error("UNIT_COURSE_MISMATCH");
  }

  return {
    courseId: courseRow?.id ?? null,
    unitId: unitRow?.id ?? null,
    courseLabel: courseRow?.name ?? null,
    unitLabel: unitRow ? formatUnitLabel(unitRow.unit_number, unitRow.title) : null,
  };
}

async function propagateClassificationToOrigin(
  client: ContentLibraryClient,
  row: ContentLibraryRow,
  params: { courseId: string | null; unitId: string | null },
) {
  const origin = resolveOriginEntity(row);
  if (!origin.originEntityId) return;

  if (origin.originEntityType === "rubric") {
    if (!params.courseId) {
      return;
    }
    const { error } = await client.supabase
      .from("rubrics")
      .update({
        course_id: params.courseId!,
        unit_id: params.unitId,
      })
      .eq("id", origin.originEntityId)
      .eq("teacher_id", client.teacherId);

    if (error) {
      throw new Error("更新 Rubric 归类失败");
    }
    return;
  }

  if (origin.originEntityType === "exercise") {
    if (!params.courseId) {
      return;
    }
    const { error } = await client.supabase
      .from("exercises")
      .update({
        course_id: params.courseId!,
        unit_id: params.unitId,
      })
      .eq("id", origin.originEntityId)
      .eq("teacher_id", client.teacherId);

    if (error) {
      throw new Error("更新习题归类失败");
    }
    return;
  }

  if (origin.originEntityType === "lesson_plan") {
    const { error } = await client.supabase
      .from("lesson_plans")
      .update({
        course_id: params.courseId,
        unit_id: params.unitId,
      })
      .eq("id", origin.originEntityId)
      .eq("teacher_id", client.teacherId);

    if (error) {
      throw new Error("更新教案归类失败");
    }
  }
}

async function findPublishedLessonPlanBlockedItemIds(
  client: ContentLibraryClient,
  rows: ContentLibraryRow[],
) {
  const lessonPlanByItemId = rows
    .filter(
      (row) => row.origin_entity_type === "lesson_plan" && Boolean(row.origin_entity_id),
    )
    .map((row) => ({
      itemId: row.id,
      originEntityId: row.origin_entity_id as string,
    }));

  if (lessonPlanByItemId.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await client.supabase
    .from("lesson_plans")
    .select("id,status")
    .eq("teacher_id", client.teacherId)
    .in(
      "id",
      lessonPlanByItemId.map((item) => item.originEntityId),
    );

  if (error) {
    throw new Error("读取教案状态失败");
  }

  const publishedPlanIds = new Set(
    (data ?? [])
      .filter((row) => row.status === "published")
      .map((row) => row.id),
  );

  return new Set(
    lessonPlanByItemId
      .filter((item) => publishedPlanIds.has(item.originEntityId))
      .map((item) => item.itemId),
  );
}

export async function upsertSynchronizedContentLibraryItem(
  client: ContentLibraryClient,
  input: UpsertContentLibraryInput,
) {
  const existing = await readExistingSyncFields(client, input.originKey);
  const title = cleanText(normalizeGeneratedContentTitle(input.title)) || "未命名内容";
  const summaryText = cleanText(input.summaryText) || null;
  const courseLabel = cleanText(input.courseLabel) || null;
  const unitLabel = cleanText(input.unitLabel) || null;
  const preservedMetadata =
    existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
      ? existing.metadata
      : {};

  const payload: Database["public"]["Tables"]["content_library_items"]["Insert"] = {
    teacher_id: client.teacherId,
    content_type: input.contentType,
    renderer_type: input.rendererType,
    origin_key: input.originKey,
    origin_entity_type: input.originEntityType,
    origin_entity_id: input.originEntityId ?? null,
    source_conversation_id: input.sourceConversationId ?? null,
    source_message_id: input.sourceMessageId ?? null,
    source_item_id: input.sourceItemId ?? null,
    title,
    summary_text: summaryText,
    search_text: buildSearchText([
      title,
      existing?.custom_title,
      existing?.note,
      summaryText,
      courseLabel,
      unitLabel,
      input.extraSearchText,
    ]),
    course_id: input.courseId ?? null,
    unit_id: input.unitId ?? null,
    course_label: courseLabel,
    unit_label: unitLabel,
    snapshot: input.snapshot as unknown as Json,
    metadata: {
      ...preservedMetadata,
      ...(input.metadata ?? {}),
    } as Json,
  };

  const { data, error } = await client.supabase
    .from("content_library_items")
    .upsert(payload, { onConflict: "origin_key", ignoreDuplicates: false })
    .select("id")
    .single();

  if (isMissingContentLibraryTableError(error)) {
    throw new Error("CONTENT_LIBRARY_UNAVAILABLE");
  }

  if (error) {
    throw new Error("同步内容库失败");
  }

  if (data?.id) {
    try {
      await syncContentLibrarySemanticIndexItems({
        supabase: client.supabase,
        teacherId: client.teacherId,
        itemIds: [data.id],
      });
    } catch (error) {
      console.error("同步内容库语义索引失败，已保留内容库主记录", {
        itemId: data.id,
        teacherId: client.teacherId,
        message: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  invalidateContentLibraryReadCache(client.teacherId);

  return data?.id ?? null;
}

export async function deleteContentLibraryItemByOriginKey(
  client: ContentLibraryClient,
  originKey: string,
) {
  const { data: existingRows, error: readError } = await client.supabase
    .from("content_library_items")
    .select("id")
    .eq("teacher_id", client.teacherId)
    .eq("origin_key", originKey);

  if (readError) {
    throw new Error("读取内容库索引失败");
  }

  const { error } = await client.supabase
    .from("content_library_items")
    .delete()
    .eq("teacher_id", client.teacherId)
    .eq("origin_key", originKey);

  if (error) {
    throw new Error("删除内容库索引失败");
  }

  await deleteLinkedContentAssetsForLibraryItems(
    client,
    (existingRows ?? []).map((row) => row.id),
  );

  await removeContentLibrarySemanticIndexItems({
    supabase: client.supabase,
    teacherId: client.teacherId,
    itemIds: (existingRows ?? []).map((row) => row.id),
  });
  invalidateContentLibraryReadCache(client.teacherId);
  invalidateAssetReadCache(client.teacherId);
  revalidateContentAssets(client.teacherId);
}

export async function listContentLibraryItems(
  client: ContentLibraryClient,
  options: ContentLibraryListOptions = {},
): Promise<ContentLibraryListResult> {
  const type = options.type ?? "all";
  const limit = Math.min(Math.max(options.limit ?? 120, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const queryText = cleanText(options.query);
  const cacheKey = buildContentLibraryCacheKey("list", client.teacherId, {
    type,
    limit,
    offset,
    queryText,
    courseId: options.courseId ?? null,
    unitId: options.unitId ?? null,
    difficulty: options.difficulty ?? null,
    assessmentStyle: options.assessmentStyle ?? null,
    clusterNodeId: options.clusterNodeId ?? null,
    subskillNodeId: options.subskillNodeId ?? null,
  });

  return withReadCache(cacheKey, CONTENT_LIBRARY_LIST_CACHE_TTL_MS, async () => {
    const filteredExerciseIds = await findQuestionOriginEntityIdsByQuestionFilters(client, {
      clusterNodeId: options.clusterNodeId,
      subskillNodeId: options.subskillNodeId,
      difficulty: options.difficulty,
      assessmentStyle: options.assessmentStyle,
      courseId: options.courseId,
      unitId: options.unitId,
    });

    if (filteredExerciseIds && filteredExerciseIds.length === 0) {
      return {
        items: [],
        total: 0,
      };
    }

    let rows: JoinedContentLibraryRow[] = [];
    let total = 0;

    if (!queryText) {
      const { data, count, error } = await runContentLibraryQueryWithDocumentIdFallback({
        run: (select) => {
          let query = client.supabase
            .from("content_library_items")
            .select(select, { count: "exact" })
            .eq("teacher_id", client.teacherId)
            .order("updated_at", { ascending: false })
            .range(offset, offset + limit - 1);

          query = applyContentLibraryFilters(query, {
            type,
            courseId: options.courseId,
            unitId: options.unitId,
            filteredExerciseIds,
          });

          return query;
        },
        select: CONTENT_LIBRARY_LIST_SELECT,
        legacySelect: CONTENT_LIBRARY_LIST_SELECT_LEGACY,
      });
      if (error) {
        console.error("[content-library] 读取内容库列表失败", error);
        throw new Error("读取内容库列表失败");
      }
      rows = (data ?? []) as unknown as JoinedContentLibraryRow[];
      total = count ?? rows.length;
    } else {
      if (shouldPreferKeywordOnlySearch(queryText)) {
        const { data, count, error } = await runContentLibraryQueryWithDocumentIdFallback({
          run: (select) => {
            let keywordOnlyQuery = client.supabase
              .from("content_library_items")
              .select(select, { count: "exact" })
              .eq("teacher_id", client.teacherId)
              .order("updated_at", { ascending: false })
              .range(offset, offset + limit - 1);
            keywordOnlyQuery = applyContentLibraryFilters(keywordOnlyQuery, {
              type,
              courseId: options.courseId,
              unitId: options.unitId,
              filteredExerciseIds,
            });
            keywordOnlyQuery = keywordOnlyQuery.ilike("search_text", `%${queryText}%`);
            return keywordOnlyQuery;
          },
          select: CONTENT_LIBRARY_LIST_SELECT,
          legacySelect: CONTENT_LIBRARY_LIST_SELECT_LEGACY,
        });
        if (error) {
          console.error("[content-library] 读取内容库关键词列表失败", error);
          throw new Error("读取内容库列表失败");
        }

        return {
          items: ((data ?? []) as unknown as JoinedContentLibraryRow[]).map(mapListItem),
          total: count ?? ((data ?? []) as unknown as JoinedContentLibraryRow[]).length,
        };
      }

      const candidateLimit = Math.min(Math.max((offset + limit) * 2, 60), 160);
      const [semanticHits, keywordRowsResult] = await Promise.all([
        searchContentLibrarySemanticHits({
          supabase: client.supabase,
          teacherId: client.teacherId,
          query: queryText,
          limit: candidateLimit,
          filters: {
            contentType: type !== "all" ? type : undefined,
            courseId: options.courseId,
            unitId: options.unitId,
            difficulty: options.difficulty,
            assessmentStyle: options.assessmentStyle,
            clusterNodeId: options.clusterNodeId,
            subskillNodeId: options.subskillNodeId,
          },
        }).catch(() => []),
        (async () => {
          let keywordQuery = client.supabase
            .from("content_library_items")
            .select("id,updated_at")
            .eq("teacher_id", client.teacherId)
            .order("updated_at", { ascending: false })
            .limit(candidateLimit);
          keywordQuery = applyContentLibraryFilters(keywordQuery, {
            type,
            courseId: options.courseId,
            unitId: options.unitId,
            filteredExerciseIds,
          });
          keywordQuery = keywordQuery.ilike("search_text", `%${queryText}%`);
          return keywordQuery;
        })(),
      ]);

      if (keywordRowsResult.error) {
        throw new Error("读取内容库检索候选失败");
      }

      const ranking = new Map<string, number>();
      semanticHits.forEach((hit, index) => {
        ranking.set(hit.itemId, Math.max(ranking.get(hit.itemId) ?? 0, 120 - index + hit.score * 100));
      });
      ((keywordRowsResult.data ?? []) as Array<{ id: string; updated_at: string }>).forEach((row, index) => {
        ranking.set(row.id, Math.max(ranking.get(row.id) ?? 0, 80 - index));
      });

      const candidateIds = Array.from(ranking.keys());
      if (candidateIds.length === 0) {
        return { items: [], total: 0 };
      }

      const { data, error } = await runContentLibraryQueryWithDocumentIdFallback({
        run: (select) => {
          let detailQuery = client.supabase
            .from("content_library_items")
            .select(select)
            .eq("teacher_id", client.teacherId)
            .in("id", candidateIds);
          detailQuery = applyContentLibraryFilters(detailQuery, {
            type,
            courseId: options.courseId,
            unitId: options.unitId,
            filteredExerciseIds,
          });

          return detailQuery;
        },
        select: CONTENT_LIBRARY_LIST_SELECT,
        legacySelect: CONTENT_LIBRARY_LIST_SELECT_LEGACY,
      });
      if (error) {
        console.error("[content-library] 读取内容库候选详情失败", error);
        throw new Error("读取内容库列表失败");
      }

      rows = ((data ?? []) as unknown as JoinedContentLibraryRow[]).sort((left, right) => {
        const scoreDiff = (ranking.get(right.id) ?? 0) - (ranking.get(left.id) ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        return `${right.updated_at}`.localeCompare(`${left.updated_at}`);
      });
      total = rows.length;
      rows = rows.slice(offset, offset + limit);
    }

    return {
      items: rows.map(mapListItem),
      total,
    };
  });
}

export async function getContentLibraryItemDetail(client: ContentLibraryClient, itemId: string) {
  const cacheKey = buildContentLibraryCacheKey("detail", client.teacherId, { itemId });
  return withReadCache(cacheKey, CONTENT_LIBRARY_DETAIL_CACHE_TTL_MS, async () => {
    const row = await readContentLibraryRowById(client, itemId);
    if (!row) return null;
    return mapDetail(row);
  });
}

export async function getContentLibraryItemDetailsByIds(
  client: ContentLibraryClient,
  itemIds: string[],
) {
  const uniqueIds = Array.from(new Set(itemIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const rows = await readContentLibraryRowsByIds(client, uniqueIds);
  const rowById = new Map(rows.map((row) => [row.id, row]));

  return uniqueIds
    .map((itemId) => {
      const row = rowById.get(itemId);
      if (!row) return null;
      return mapDetail(row as JoinedContentLibraryRow);
    })
    .filter((item): item is ContentLibraryDetail => Boolean(item));
}

export async function getContentLibraryListItemsByIds(
  client: ContentLibraryClient,
  itemIds: string[],
) {
  const uniqueIds = Array.from(new Set(itemIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const rows = await readContentLibraryListRowsByIds(client, uniqueIds);
  const rowById = new Map(rows.map((row) => [row.id, row]));

  return uniqueIds
    .map((itemId) => {
      const row = rowById.get(itemId);
      if (!row) return null;
      return mapListItem(row);
    })
    .filter((item): item is ContentLibraryListItem => Boolean(item));
}

export async function getContentLibraryListItemsByOrigins(
  client: ContentLibraryClient,
  origins: Array<{
    originEntityType: ContentLibraryOriginEntity;
    originEntityId: string;
  }>,
) {
  if (origins.length === 0) return [];

  const rows = await readContentLibraryListRowsByOrigins(client, origins);
  const rowByOrigin = new Map(
    rows.map((row) => {
      const origin = resolveOriginEntity(row);
      return [buildOriginLookupKey(origin.originEntityType, origin.originEntityId ?? ""), row];
    }),
  );

  return origins
    .map((origin) => {
      const row = rowByOrigin.get(
        buildOriginLookupKey(origin.originEntityType, origin.originEntityId),
      );
      if (!row) return null;
      return mapListItem(row);
    })
    .filter((item): item is ContentLibraryListItem => Boolean(item));
}

export async function getContentLibraryItemDetailsByOrigins(
  client: ContentLibraryClient,
  origins: Array<{
    originEntityType: ContentLibraryOriginEntity;
    originEntityId: string;
  }>,
) {
  if (origins.length === 0) return [];

  const rows = await readContentLibraryDetailRowsByOrigins(client, origins);
  const rowByOrigin = new Map(
    rows.map((row) => {
      const origin = resolveOriginEntity(row);
      return [buildOriginLookupKey(origin.originEntityType, origin.originEntityId ?? ""), row];
    }),
  );

  return origins
    .map((origin) => {
      const row = rowByOrigin.get(
        buildOriginLookupKey(origin.originEntityType, origin.originEntityId),
      );
      if (!row) return null;
      return mapDetail(row);
    })
    .filter((item): item is ContentLibraryDetail => Boolean(item));
}

export async function ensureContentLibraryDocument(
  client: ContentLibraryClient,
  itemId: string,
): Promise<EnsureContentLibraryDocumentResult> {
  const current = await readContentLibraryRowById(client, itemId);
  if (!current) {
    throw new Error("ITEM_NOT_FOUND");
  }

  const currentItem = mapDetail(current);
  const documentClient = toDocumentClient(client);

  if (currentItem.documentId) {
    const existing = await getDocumentDetail(documentClient, currentItem.documentId);
    if (existing) {
      return {
        item: currentItem,
        document: existing,
        created: false,
      };
    }
  }

  const document = await createDocument(documentClient, {
    title: currentItem.displayTitle || currentItem.title,
    htmlContent: buildEditableContentLibraryHtml(currentItem),
    properties: [],
    documentKind: resolveContentLibraryDocumentKind(currentItem),
    editorKind: "html",
    sourceType: "content_library",
    sourceId: currentItem.id,
    metadata: {
      ...currentItem.metadata,
      contentLibraryItemId: currentItem.id,
      sourceContentLibraryItemId: currentItem.id,
    },
  });

  await persistContentLibraryDocumentLink({
    client,
    item: currentItem,
    documentId: document.id,
    htmlContent: document.htmlContent,
    version: document.version,
  });

  invalidateContentLibraryReadCache(client.teacherId);
  const nextItem = await getContentLibraryItemDetail(client, itemId);

  return {
    item:
      nextItem ?? {
        ...currentItem,
        documentId: document.id,
        metadata: {
          ...currentItem.metadata,
          documentId: document.id,
          documentHtml: document.htmlContent,
          sourceDocumentVersion: document.version,
        },
      },
    document,
    created: !currentItem.documentId,
  };
}

async function deleteLinkedContentAssetsForLibraryItems(
  client: ContentLibraryClient,
  itemIds: string[],
) {
  const uniqueIds = Array.from(new Set(itemIds.filter(Boolean)));
  if (uniqueIds.length === 0) return;

  const { error: deleteReferenceError } = await client.supabase
    .from("content_assets")
    .delete()
    .eq("teacher_id", client.teacherId)
    .eq("asset_source", "reference")
    .in("content_library_item_id", uniqueIds);

  if (deleteReferenceError) {
    throw new Error("删除关联资产引用失败");
  }

  const { error: unlinkUploadedError } = await client.supabase
    .from("content_assets")
    .update({
      content_library_item_id: null,
    })
    .eq("teacher_id", client.teacherId)
    .eq("asset_source", "uploaded")
    .in("content_library_item_id", uniqueIds);

  if (unlinkUploadedError) {
    throw new Error("清理上传资产文档库关联失败");
  }
}

export async function updateContentLibraryItem(
  client: ContentLibraryClient,
  itemId: string,
  input: UpdateContentLibraryInput,
): Promise<UpdateContentLibraryResult> {
  const current = await readContentLibraryRowById(client, itemId);
  if (!current) {
    throw new Error("ITEM_NOT_FOUND");
  }

  const isWorksheetProjectItem = current.renderer_type === "worksheet_project";
  const nextCanonicalTitle =
    Object.prototype.hasOwnProperty.call(input, "title") && isWorksheetProjectItem
      ? cleanText(input.title) || current.title
      : current.title;

  const hasClassificationUpdate =
    Object.prototype.hasOwnProperty.call(input, "courseId") ||
    Object.prototype.hasOwnProperty.call(input, "unitId");

  let nextCourseId = current.course_id;
  let nextUnitId = current.unit_id;
  let nextCourseLabel = current.course_label;
  let nextUnitLabel = current.unit_label;

  if (hasClassificationUpdate) {
    const resolved = await resolveCourseUnitSelection(client, {
      courseId:
        Object.prototype.hasOwnProperty.call(input, "courseId")
          ? input.courseId ?? null
          : current.course_id,
      unitId:
        Object.prototype.hasOwnProperty.call(input, "unitId")
          ? input.unitId ?? null
          : current.unit_id,
    });

    nextCourseId = resolved.courseId;
    nextUnitId = resolved.unitId;
    nextCourseLabel = resolved.courseLabel;
    nextUnitLabel = resolved.unitLabel;

    await propagateClassificationToOrigin(client, current, {
      courseId: nextCourseId,
      unitId: nextUnitId,
    });
  }

  const customTitle =
    Object.prototype.hasOwnProperty.call(input, "title")
      ? isWorksheetProjectItem
        ? nextCanonicalTitle
        : cleanText(input.title) || null
      : current.custom_title;
  const note =
    Object.prototype.hasOwnProperty.call(input, "note")
      ? cleanText(input.note) || null
      : current.note;
  let documentLink: {
    documentId: string;
    htmlContent: string;
    version: number;
  } | null = null;

  if (Object.prototype.hasOwnProperty.call(input, "documentHtml")) {
    const ensured = await ensureContentLibraryDocument(client, itemId);
    const htmlContent = input.documentHtml?.trim() || "<p></p>";
    const autosave = await autosaveDocument(toDocumentClient(client), ensured.document.id, {
      title: ensured.document.title || current.title,
      htmlContent,
      properties: ensured.document.properties,
      expectedVersion: ensured.document.version,
    });

    documentLink = {
      documentId: ensured.document.id,
      htmlContent,
      version: autosave.version,
    };
  }
  const nextMetadata =
    documentLink
      ? {
          ...normalizeMetadataRecord(current.metadata),
          documentId: documentLink.documentId,
          documentHtml: documentLink.htmlContent,
          sourceDocumentVersion: documentLink.version,
        }
      : current.metadata;
  const nextSnapshot =
    Object.prototype.hasOwnProperty.call(input, "title") && isWorksheetProjectItem
      ? syncWorksheetProjectSnapshotTitle(current.snapshot, nextCanonicalTitle)
      : current.snapshot;
  const updatePayload = {
    title: nextCanonicalTitle,
    custom_title: customTitle,
    note,
    course_id: nextCourseId,
    unit_id: nextUnitId,
    course_label: nextCourseLabel,
    unit_label: nextUnitLabel,
    search_text: buildSearchText([
      nextCanonicalTitle,
      customTitle,
      note,
      current.summary_text,
      nextCourseLabel,
      nextUnitLabel,
    ]),
    document_id: documentLink?.documentId ?? current.document_id,
    metadata: nextMetadata as Json,
    snapshot: nextSnapshot as Json,
  };

  const runUpdate = (payload: typeof updatePayload | Omit<typeof updatePayload, "document_id">) =>
    client.supabase
      .from("content_library_items")
      .update(payload)
      .eq("id", itemId)
      .eq("teacher_id", client.teacherId);

  const primaryUpdate =
    contentLibraryDocumentIdColumnSupported === false
      ? await runUpdate({
          title: updatePayload.title,
          custom_title: updatePayload.custom_title,
          note: updatePayload.note,
          course_id: updatePayload.course_id,
          unit_id: updatePayload.unit_id,
          course_label: updatePayload.course_label,
          unit_label: updatePayload.unit_label,
          search_text: updatePayload.search_text,
          metadata: updatePayload.metadata,
          snapshot: updatePayload.snapshot,
        })
      : await runUpdate(updatePayload);

  if (primaryUpdate.error && isMissingContentLibraryDocumentIdColumnError(primaryUpdate.error)) {
    contentLibraryDocumentIdColumnSupported = false;
    const legacyUpdate = await runUpdate({
      title: updatePayload.title,
      custom_title: updatePayload.custom_title,
      note: updatePayload.note,
      course_id: updatePayload.course_id,
      unit_id: updatePayload.unit_id,
      course_label: updatePayload.course_label,
      unit_label: updatePayload.unit_label,
      search_text: updatePayload.search_text,
      metadata: updatePayload.metadata,
      snapshot: updatePayload.snapshot,
    });
    if (legacyUpdate.error) {
      console.error("[content-library] 更新内容失败", legacyUpdate.error);
      throw new Error("更新内容失败");
    }
  } else if (primaryUpdate.error) {
    console.error("[content-library] 更新内容失败", primaryUpdate.error);
    throw new Error("更新内容失败");
  } else if (contentLibraryDocumentIdColumnSupported !== false) {
    contentLibraryDocumentIdColumnSupported = true;
  }

  invalidateContentLibraryReadCache(client.teacherId);

  const next = await getContentLibraryItemDetail(client, itemId);
  if (!next) {
    throw new Error("ITEM_NOT_FOUND");
  }
  invalidateAssetReadCache(client.teacherId);
  return {
    item: next,
    projectionSyncPayload: {
      itemIds: [itemId],
    },
  };
}

export async function deleteContentLibraryItems(
  client: ContentLibraryClient,
  itemIds: string[],
): Promise<DeleteContentLibraryResult> {
  const uniqueIds = Array.from(new Set(itemIds));
  if (uniqueIds.length === 0) {
    return {
      deletedIds: [],
      blockedIds: [],
      missingIds: [],
      originCleanupPayload: null,
    };
  }

  const rows = await readContentLibraryRowsByIds(client, uniqueIds);
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const missingIds = uniqueIds.filter((itemId) => !rowById.has(itemId));
  const blockedByPublishedLessonPlan = await findPublishedLessonPlanBlockedItemIds(
    client,
    rows,
  );
  const blockedIds = uniqueIds.filter((itemId) =>
    blockedByPublishedLessonPlan.has(itemId),
  );
  const deletedRows = uniqueIds
    .map((itemId) => rowById.get(itemId) ?? null)
    .filter(
      (row): row is ContentLibraryRow =>
        row != null && !blockedByPublishedLessonPlan.has(row.id),
    );
  const deletedIds = deletedRows.map((row) => row.id);

  if (deletedIds.length > 0) {
    const worksheetProjectAssets = deletedRows.flatMap((row) =>
      extractWorksheetProjectStoredAssetsFromSnapshot(row.snapshot),
    );
    if (worksheetProjectAssets.length > 0) {
      await deleteWorksheetProjectStoredAssets(worksheetProjectAssets).catch((error) => {
        console.error("[content-library] 删除组卷工程附件失败，已继续删除主记录", {
          teacherId: client.teacherId,
          itemIds: deletedIds,
          error,
        });
      });
    }
    await deleteContentLibraryRowsAfterLinkedAssets({
      deleteLinkedAssets: () => deleteLinkedContentAssetsForLibraryItems(client, deletedIds),
      deleteItems: () =>
        client.supabase
          .from("content_library_items")
          .delete()
          .eq("teacher_id", client.teacherId)
          .in("id", deletedIds),
      onDeleteItemsError: (error) => {
        console.error("[content-library] 删除内容前已清理关联资产，删除条目失败", {
          teacherId: client.teacherId,
          itemIds: deletedIds,
          error,
        });
      },
    });
  }

  invalidateContentLibraryReadCache(client.teacherId);
  invalidateAssetReadCache(client.teacherId);
  revalidateContentAssets(client.teacherId);

  return {
    deletedIds,
    blockedIds,
    missingIds,
    originCleanupPayload:
      deletedRows.length > 0
        ? {
            items: deletedRows.map((row) => {
              const origin = resolveOriginEntity(row);
              return {
                itemId: row.id,
                originEntityType: origin.originEntityType,
                originEntityId: origin.originEntityId,
              };
            }),
          }
        : null,
  };
}

export async function reclassifyContentLibraryItems(
  client: ContentLibraryClient,
  itemIds: string[],
  input: { courseId?: string; unitId?: string | null },
): Promise<ReclassifyContentLibraryResult> {
  const uniqueIds = Array.from(new Set(itemIds));
  if (uniqueIds.length === 0) {
    return { updatedIds: [], missingIds: [] };
  }

  const rows = await readContentLibraryRowsByIds(client, uniqueIds);
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const missingIds = uniqueIds.filter((itemId) => !rowById.has(itemId));
  const updatedIds: string[] = [];

  for (const itemId of uniqueIds) {
    const row = rowById.get(itemId);
    if (!row) continue;

    const resolved = await resolveCourseUnitSelection(client, {
      courseId: input.courseId ?? row.course_id,
      unitId:
        Object.prototype.hasOwnProperty.call(input, "unitId")
          ? input.unitId ?? null
          : row.unit_id,
    });

    await propagateClassificationToOrigin(client, row, {
      courseId: resolved.courseId,
      unitId: resolved.unitId,
    });

    const { error } = await client.supabase
      .from("content_library_items")
      .update({
        course_id: resolved.courseId,
        unit_id: resolved.unitId,
        course_label: resolved.courseLabel,
        unit_label: resolved.unitLabel,
        search_text: buildSearchText([
          row.title,
          row.custom_title,
          row.note,
          row.summary_text,
          resolved.courseLabel,
          resolved.unitLabel,
        ]),
      })
      .eq("id", row.id)
      .eq("teacher_id", client.teacherId);

    if (error) {
      throw new Error("更新内容归类失败");
    }

    await syncContentLibrarySemanticIndexItems({
      supabase: client.supabase,
      teacherId: client.teacherId,
      itemIds: [row.id],
    });

    updatedIds.push(row.id);
  }

  invalidateContentLibraryReadCache(client.teacherId);

  return {
    updatedIds,
    missingIds,
  };
}
