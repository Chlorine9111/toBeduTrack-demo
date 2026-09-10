import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateEmbeddings,
  resolveEmbeddingDimension,
  type EmbeddingKind,
} from "@/lib/ai/embeddings";
import type { Database, Json } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type SemanticIndexSourceKind =
  | "knowledge_chunk"
  | "exercise"
  | "content_library_item"
  | "content_asset"
  | "memory_capsule";

export type SemanticIndexItemDraft = {
  teacherId: string;
  sourceKind: SemanticIndexSourceKind;
  sourceId: string;
  chunkKey?: string | null;
  contentText: string;
  metadata?: Json;
  status?: string;
  expiresAt?: string | null;
};

export type SemanticIndexSearchHit = {
  id: string;
  teacherId: string;
  sourceKind: SemanticIndexSourceKind;
  sourceId: string;
  chunkKey: string;
  contentText: string;
  metadata: Record<string, unknown>;
  embeddingModel: string | null;
  status: string;
  expiresAt: string | null;
  similarity: number;
};

export type SemanticIndexFilters = {
  contentTypes?: string[];
  originEntityTypes?: string[];
  courseIds?: string[];
  unitIds?: string[];
  itemTypes?: string[];
  sourceValues?: string[];
  clusterNodeIds?: string[];
  subskillNodeIds?: string[];
  knowledgeClusters?: string[];
  assessmentStyles?: string[];
  difficulties?: Array<string | number>;
  chunkKeys?: string[];
  hasFigure?: boolean | null;
};

type SemanticIndexMatchRow = {
  id: string;
  teacher_id: string;
  source_kind: SemanticIndexSourceKind;
  source_id: string;
  chunk_key: string;
  content_text: string;
  metadata: Json;
  embedding_model: string | null;
  status: string;
  expires_at: string | null;
  similarity: number;
};

const EMBEDDING_BATCH_SIZE = 16;
const SEARCH_QUERY_EMBEDDING_TTL_MS = 300_000;
const MAX_SEARCH_QUERY_EMBEDDING_CACHE_ENTRIES = 128;
const searchQueryEmbeddingCache = new Map<
  string,
  { expiresAt: number; embedding: number[] }
>();
const searchQueryEmbeddingInflight = new Map<string, Promise<number[] | null>>();

function semanticIndexTable(db: AppSupabase) {
  return (db.from as unknown as (table: string) => ReturnType<AppSupabase["from"]>)("semantic_index_items");
}

export function serializeEmbedding(values: number[]) {
  return `[${values.join(",")}]`;
}

function asMetadata(value: Json | undefined): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Json;
  }
  return value;
}

function cleanScalarText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function buildSearchQueryEmbeddingKey(params: {
  query: string;
  dimensions: number;
}) {
  return `${params.dimensions}:${cleanScalarText(params.query).toLowerCase()}`;
}

function readCachedSearchQueryEmbedding(key: string) {
  const current = searchQueryEmbeddingCache.get(key);
  if (!current) return null;
  if (current.expiresAt <= Date.now()) {
    searchQueryEmbeddingCache.delete(key);
    return null;
  }
  searchQueryEmbeddingCache.delete(key);
  searchQueryEmbeddingCache.set(key, current);
  return current.embedding;
}

function writeCachedSearchQueryEmbedding(key: string, embedding: number[]) {
  if (searchQueryEmbeddingCache.has(key)) {
    searchQueryEmbeddingCache.delete(key);
  }

  searchQueryEmbeddingCache.set(key, {
    embedding,
    expiresAt: Date.now() + SEARCH_QUERY_EMBEDDING_TTL_MS,
  });

  while (searchQueryEmbeddingCache.size > MAX_SEARCH_QUERY_EMBEDDING_CACHE_ENTRIES) {
    const oldestKey = searchQueryEmbeddingCache.keys().next().value;
    if (!oldestKey) break;
    searchQueryEmbeddingCache.delete(oldestKey);
  }
}

async function getSearchQueryEmbedding(params: {
  query: string;
  dimensions: number;
}) {
  const cacheKey = buildSearchQueryEmbeddingKey(params);
  const cached = readCachedSearchQueryEmbedding(cacheKey);
  if (cached) {
    return cached;
  }

  const inflight = searchQueryEmbeddingInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const next = generateEmbeddings({
    input: params.query,
    kind: "search_query",
    dimensions: params.dimensions,
  })
    .then((embedded) => {
      const embedding = embedded.embeddings[0] ?? null;
      if (embedding) {
        writeCachedSearchQueryEmbedding(cacheKey, embedding);
      }
      return embedding;
    })
    .finally(() => {
      searchQueryEmbeddingInflight.delete(cacheKey);
    });

  searchQueryEmbeddingInflight.set(cacheKey, next);
  return next;
}

export function normalizeSemanticContentText(value: string | null | undefined) {
  return `${value ?? ""}`
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeSemanticIndexItems(items: SemanticIndexItemDraft[]) {
  return items
    .map((item) => ({
      ...item,
      chunkKey: cleanScalarText(item.chunkKey) || "",
      contentText: normalizeSemanticContentText(item.contentText),
      status: cleanScalarText(item.status) || "active",
    }))
    .filter((item) => item.contentText);
}

export async function upsertPreparedSemanticIndexDocuments(params: {
  db: AppSupabase;
  items: SemanticIndexItemDraft[];
  embeddings: Array<number[] | null | undefined>;
  embeddingModel: string | null;
}) {
  const items = normalizeSemanticIndexItems(params.items);
  if (items.length === 0) {
    return {
      itemCount: 0,
      embeddedCount: 0,
      embeddingModel: params.embeddingModel,
    };
  }

  if (params.embeddings.length > 0 && params.embeddings.length !== items.length) {
    throw new Error("semantic index 预计算 embedding 数量与 items 不一致");
  }

  const dimensions = resolveEmbeddingDimension();
  const normalizedEmbeddings = params.embeddings.map((embedding) => embedding ?? null);
  if (
    normalizedEmbeddings.some(
      (embedding) => embedding && embedding.length !== dimensions,
    )
  ) {
    throw new Error(`semantic index embedding 维度不一致，期望 ${dimensions}`);
  }

  const payload = items.map((item, index) => ({
    teacher_id: item.teacherId,
    source_kind: item.sourceKind,
    source_id: item.sourceId,
    chunk_key: item.chunkKey,
    content_text: item.contentText,
    embedding: normalizedEmbeddings[index] ? serializeEmbedding(normalizedEmbeddings[index]!) : null,
    embedding_model: normalizedEmbeddings[index] ? params.embeddingModel : null,
    status: item.status,
    expires_at: item.expiresAt ?? null,
    metadata: asMetadata(item.metadata),
  }));

  const { error } = await semanticIndexTable(params.db).upsert(payload, {
    onConflict: "teacher_id,source_kind,source_id,chunk_key",
    ignoreDuplicates: false,
  });

  if (error) {
    throw new Error(`semantic index 写入失败: ${error.message}`);
  }

  return {
    itemCount: items.length,
    embeddedCount: normalizedEmbeddings.filter(Boolean).length,
    embeddingModel: params.embeddingModel,
  };
}

export async function upsertSemanticIndexDocuments(params: {
  db: AppSupabase;
  items: SemanticIndexItemDraft[];
  kind?: EmbeddingKind;
}) {
  const items = normalizeSemanticIndexItems(params.items);

  if (items.length === 0) {
    return {
      itemCount: 0,
      embeddedCount: 0,
      embeddingModel: null,
    };
  }

  const dimensions = resolveEmbeddingDimension();
  const embeddings: number[][] = [];
  let embeddingModel: string | null = null;

  for (let index = 0; index < items.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = items.slice(index, index + EMBEDDING_BATCH_SIZE);
    const response = await generateEmbeddings({
      input: batch.map((item) => item.contentText),
      kind: params.kind ?? "search_document",
      dimensions,
    });

    if (!embeddingModel && response.model) {
      embeddingModel = response.model;
    }
    embeddings.push(...response.embeddings);
  }

  if (
    embeddings.length > 0 &&
    embeddings.some((embedding) => embedding.length !== dimensions)
  ) {
    throw new Error(`semantic index embedding 维度不一致，期望 ${dimensions}`);
  }

  return upsertPreparedSemanticIndexDocuments({
    db: params.db,
    items,
    embeddings,
    embeddingModel,
  });
}

export async function deleteSemanticIndexDocuments(params: {
  db: AppSupabase;
  teacherId: string;
  sourceKind?: SemanticIndexSourceKind;
  sourceKinds?: SemanticIndexSourceKind[];
  sourceIds?: string[];
  sourceId?: string;
}) {
  let query = semanticIndexTable(params.db).delete().eq("teacher_id", params.teacherId);

  const sourceKinds = params.sourceKinds ?? (params.sourceKind ? [params.sourceKind] : []);
  if (sourceKinds.length === 1) {
    query = query.eq("source_kind", sourceKinds[0]);
  } else if (sourceKinds.length > 1) {
    query = query.in("source_kind", sourceKinds);
  }

  const sourceIds = params.sourceIds ?? (params.sourceId ? [params.sourceId] : []);
  if (sourceIds.length === 1) {
    query = query.eq("source_id", sourceIds[0]);
  } else if (sourceIds.length > 1) {
    query = query.in("source_id", sourceIds);
  }

  const { error } = await query;
  if (error) {
    throw new Error(`semantic index 删除失败: ${error.message}`);
  }
}

export async function searchSemanticIndex(params: {
  db: AppSupabase;
  teacherId: string;
  query: string;
  sourceKinds: SemanticIndexSourceKind[];
  limit?: number;
  matchThreshold?: number;
  status?: string | null;
  subject?: string | null;
  unit?: string | null;
  filters?: SemanticIndexFilters;
}) {
  const normalizedQuery = cleanScalarText(params.query);
  if (!normalizedQuery) return [] as SemanticIndexSearchHit[];

  const dimensions = resolveEmbeddingDimension();
  const queryEmbedding = await getSearchQueryEmbedding({
    query: normalizedQuery,
    dimensions,
  });
  if (!queryEmbedding) return [] as SemanticIndexSearchHit[];

  const { data, error } = await (params.db.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>)("match_semantic_index_items", {
    p_teacher_id: params.teacherId,
    p_source_kinds: params.sourceKinds,
    query_embedding: serializeEmbedding(queryEmbedding),
    match_count: Math.max(1, params.limit ?? 8),
    match_threshold: params.matchThreshold ?? 0.35,
    p_status: params.status ?? "active",
    p_subject: params.subject ?? null,
    p_unit: params.unit ?? null,
    p_content_types: params.filters?.contentTypes ?? null,
    p_origin_entity_types: params.filters?.originEntityTypes ?? null,
    p_course_ids: params.filters?.courseIds ?? null,
    p_unit_ids: params.filters?.unitIds ?? null,
    p_item_types: params.filters?.itemTypes ?? null,
    p_source_values: params.filters?.sourceValues ?? null,
    p_cluster_node_ids: params.filters?.clusterNodeIds ?? null,
    p_subskill_node_ids: params.filters?.subskillNodeIds ?? null,
    p_knowledge_clusters: params.filters?.knowledgeClusters ?? null,
    p_assessment_styles: params.filters?.assessmentStyles ?? null,
    p_difficulties:
      params.filters?.difficulties?.map((value) => `${value}`.trim()).filter(Boolean) ?? null,
    p_chunk_keys: params.filters?.chunkKeys ?? null,
    p_has_figure:
      typeof params.filters?.hasFigure === "boolean" ? params.filters.hasFigure : null,
  });

  if (error) {
    throw new Error(`semantic index 检索失败: ${error.message}`);
  }

  const rows = (data ?? []) as SemanticIndexMatchRow[];
  return rows.map((row) => ({
    id: row.id,
    teacherId: row.teacher_id,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    chunkKey: row.chunk_key,
    contentText: row.content_text,
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    embeddingModel: row.embedding_model,
    status: row.status,
    expiresAt: row.expires_at,
    similarity: row.similarity,
  }));
}
