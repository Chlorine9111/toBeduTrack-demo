import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_EMBEDDING_DIMENSION,
  generateEmbeddings,
  resolveEmbeddingModel,
} from "@/lib/ai/embeddings";
import { searchTeacherKnowledge as searchTeacherKnowledgeFallback } from "@/lib/assistant/supermemory";
import {
  deleteSemanticIndexDocuments,
  searchSemanticIndex,
  upsertSemanticIndexDocuments,
} from "@/lib/semantic-index/store";
import { buildKnowledgeContentPreview } from "@/lib/assistant/chunk-preview";
import type {
  KnowledgeRagSearchResponse,
  KnowledgeRetrievalConfidence,
  KnowledgeSearchResult,
} from "@/lib/assistant/types";
import { trimContextText } from "@/lib/context-engineering/core";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { ParsedDocument } from "@/lib/wechat/document-parser";
import type { Database, Json } from "@/types/database";

type DB = SupabaseClient<Database>;

export type KnowledgeDocumentChunkDraft = {
  chunkIndex: number;
  pageStart: number | null;
  pageEnd: number | null;
  title: string | null;
  content: string;
  contentPreview: string;
  tokenCount: number;
  metadata: Json;
};

const DEFAULT_CHUNK_LENGTH = 1200;
const DEFAULT_CHUNK_OVERLAP = 180;
const DEFAULT_MATCH_COUNT = 8;
const DEFAULT_MATCH_THRESHOLD = 0.45;
const MAX_INDEXED_CHUNKS = 96;
const EMBEDDING_BATCH_SIZE = 8;
const CORRECTIVE_SEARCH_THRESHOLD = 58;
const RETRIEVAL_STOPWORDS = new Set([
  "请",
  "帮我",
  "帮忙",
  "根据",
  "基于",
  "结合",
  "生成",
  "整理",
  "制作",
  "搜索",
  "查询",
  "找到",
  "需要",
  "可以",
  "老师",
  "材料",
  "资料",
  "内容",
  "这份",
  "这些",
  "那个",
  "这个",
  "then",
  "with",
  "from",
  "based",
  "please",
  "help",
  "material",
  "materials",
]);

function normalizeWhitespace(text: string) {
  return text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function dedupeStrings(items: string[], limit = 8) {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const item of items) {
    const normalized = item.trim().replace(/\s+/g, " ");
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(normalized);
    if (next.length >= limit) break;
  }

  return next;
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function extractRetrievalTerms(text: string) {
  const englishTerms =
    (text.toLowerCase().match(/[a-z][a-z0-9./+-]{1,24}/g) ?? []).filter(
      (item) => !RETRIEVAL_STOPWORDS.has(item),
    );
  const chineseTerms = (text.match(/[\u4e00-\u9fa5]{2,16}/g) ?? []).filter(
    (item) => !RETRIEVAL_STOPWORDS.has(item),
  );
  const numericTerms = text.match(/unit\s*\d+|topic\s*\d+(?:\.\d+)?|第\s*\d+\s*页/gim) ?? [];

  return dedupeStrings([...englishTerms, ...numericTerms, ...chineseTerms], 16);
}

function countTermHits(terms: string[], text: string) {
  if (terms.length === 0 || !text.trim()) return 0;
  const normalized = text.toLowerCase();
  let hits = 0;
  for (const term of terms) {
    const lowered = term.toLowerCase();
    if (!lowered) continue;
    if (normalized.includes(lowered)) {
      hits += lowered.length >= 6 ? 2 : 1;
    }
  }
  return hits;
}

function inferRetrievalConfidence(score: number): KnowledgeRetrievalConfidence {
  if (score >= 75) return "high";
  if (score >= 55) return "medium";
  return "low";
}

export function buildCorrectiveKnowledgeQueries(params: {
  query: string;
  subject?: string | null;
  unit?: string | null;
  limit?: number;
}) {
  const normalizedQuery = normalizeWhitespace(params.query);
  const terms = extractRetrievalTerms(normalizedQuery);
  const limitedTerms = terms.slice(0, 8);

  const focusedQuery = limitedTerms.join(" ");
  const constrainedQuery = dedupeStrings(
    [
      [params.subject ?? "", params.unit ?? "", ...limitedTerms].filter(Boolean).join(" "),
      [params.subject ?? "", ...limitedTerms].filter(Boolean).join(" "),
      focusedQuery,
    ],
    params.limit ?? 3,
  ).filter((item) => item.toLowerCase() !== normalizedQuery.toLowerCase());

  return constrainedQuery;
}

function estimateTokenCount(text: string) {
  const normalized = text.trim();
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 4));
}

function detectChunkTitle(params: {
  filename: string;
  pageStart: number | null;
  content: string;
}) {
  const lines = params.content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLine = lines[0] ?? "";
  if (firstLine && firstLine.length <= 72 && !/[。！？.!?]{2,}/.test(firstLine)) {
    return firstLine;
  }
  if (params.pageStart != null) {
    return `${params.filename} · 第 ${params.pageStart} 页`;
  }
  return params.filename;
}

function findBreakPoint(text: string, start: number, targetEnd: number) {
  const candidates = [
    text.lastIndexOf("\n\n", targetEnd),
    text.lastIndexOf("\n", targetEnd),
    text.lastIndexOf("。", targetEnd),
    text.lastIndexOf("！", targetEnd),
    text.lastIndexOf("？", targetEnd),
    text.lastIndexOf(".", targetEnd),
    text.lastIndexOf(";", targetEnd),
    text.lastIndexOf("；", targetEnd),
    text.lastIndexOf(" ", targetEnd),
  ].filter((value) => value >= start);

  if (candidates.length === 0) {
    return targetEnd;
  }

  const preferred = Math.max(...candidates);
  if (preferred <= start + Math.floor((targetEnd - start) * 0.45)) {
    return targetEnd;
  }
  return preferred + 1;
}

function splitTextIntoWindows(text: string, maxLength = DEFAULT_CHUNK_LENGTH, overlap = DEFAULT_CHUNK_OVERLAP) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];
  if (normalized.length <= maxLength) return [normalized];

  const windows: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const targetEnd = Math.min(start + maxLength, normalized.length);
    const end = targetEnd >= normalized.length ? normalized.length : findBreakPoint(normalized, start, targetEnd);
    const slice = normalized.slice(start, end).trim();
    if (slice) {
      windows.push(slice);
    }
    if (end >= normalized.length) break;
    start = Math.max(end - overlap, start + 1);
    while (start < normalized.length && /\s/.test(normalized[start] ?? "")) {
      start += 1;
    }
  }

  return windows;
}

function buildChunkMetadata(params: {
  filename: string;
  pageStart: number | null;
  pageEnd: number | null;
  subject?: string | null;
  unit?: string | null;
  tags?: string[];
  source: "page" | "document";
  truncated: boolean;
}) {
  return {
    filename: params.filename,
    pageStart: params.pageStart,
    pageEnd: params.pageEnd,
    subject: params.subject ?? null,
    unit: params.unit ?? null,
    tags: params.tags ?? [],
    source: params.source,
    truncated: params.truncated,
  } as Json;
}

export function buildKnowledgeDocumentChunks(params: {
  filename: string;
  parsedDocument?: ParsedDocument | null;
  fallbackText?: string;
  subject?: string | null;
  unit?: string | null;
  tags?: string[];
  maxChunkLength?: number;
  overlap?: number;
  maxChunks?: number;
}) {
  const maxChunkLength = params.maxChunkLength ?? DEFAULT_CHUNK_LENGTH;
  const overlap = params.overlap ?? DEFAULT_CHUNK_OVERLAP;
  const maxChunks = params.maxChunks ?? MAX_INDEXED_CHUNKS;

  const pageTexts =
    params.parsedDocument?.pageTexts?.map((page) => normalizeWhitespace(page)).filter(Boolean) ?? [];
  const baseText =
    params.parsedDocument?.fullTextContent ||
    params.parsedDocument?.textContent ||
    params.fallbackText ||
    "";

  const drafts: KnowledgeDocumentChunkDraft[] = [];
  let chunkIndex = 0;

  if (pageTexts.length > 0) {
    pageTexts.forEach((pageText, pageIndex) => {
      const windows = splitTextIntoWindows(pageText, maxChunkLength, overlap);
      windows.forEach((content) => {
        if (drafts.length >= maxChunks) return;
        const pageNumber = pageIndex + 1;
        drafts.push({
          chunkIndex: chunkIndex++,
          pageStart: pageNumber,
          pageEnd: pageNumber,
          title: detectChunkTitle({
            filename: params.filename,
            pageStart: pageNumber,
            content,
          }),
          content,
          contentPreview: trimContextText(content, 220),
          tokenCount: estimateTokenCount(content),
          metadata: buildChunkMetadata({
            filename: params.filename,
            pageStart: pageNumber,
            pageEnd: pageNumber,
            subject: params.subject,
            unit: params.unit,
            tags: params.tags,
            source: "page",
            truncated: false,
          }),
        });
      });
    });
  }

  if (drafts.length === 0) {
    const windows = splitTextIntoWindows(baseText, maxChunkLength, overlap);
    windows.forEach((content) => {
      if (drafts.length >= maxChunks) return;
      drafts.push({
        chunkIndex: chunkIndex++,
        pageStart: null,
        pageEnd: null,
        title: detectChunkTitle({
          filename: params.filename,
          pageStart: null,
          content,
        }),
        content,
        contentPreview: trimContextText(content, 220),
        tokenCount: estimateTokenCount(content),
        metadata: buildChunkMetadata({
          filename: params.filename,
          pageStart: null,
          pageEnd: null,
          subject: params.subject,
          unit: params.unit,
          tags: params.tags,
          source: "document",
          truncated: false,
        }),
      });
    });
  }

  if (drafts.length > maxChunks) {
    return drafts.slice(0, maxChunks).map((item) => ({
      ...item,
      metadata: {
        ...(item.metadata as Record<string, unknown>),
        truncated: true,
      } as Json,
    }));
  }

  return drafts;
}

export function getKnowledgeEmbeddingModel() {
  return resolveEmbeddingModel();
}

async function embedChunkTexts(texts: string[]) {
  const model = getKnowledgeEmbeddingModel();
  if (!model || texts.length === 0) {
    return {
      model: null,
      embeddings: [] as number[][],
    };
  }

  const embeddings: number[][] = [];

  for (let index = 0; index < texts.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(index, index + EMBEDDING_BATCH_SIZE);
    const response = await generateEmbeddings({
      input: batch,
      kind: "search_document",
      dimensions: DEFAULT_EMBEDDING_DIMENSION,
    });
    embeddings.push(...response.embeddings);
  }

  if (embeddings.some((embedding) => embedding.length !== DEFAULT_EMBEDDING_DIMENSION)) {
    throw new Error(`embedding 维度与知识库索引不一致，期望 ${DEFAULT_EMBEDDING_DIMENSION}`);
  }

  return {
    model,
    embeddings,
  };
}

function buildKnowledgeChunkSemanticMetadata(params: {
  chunk: KnowledgeDocumentChunkDraft;
  documentId: string;
  chunkId?: string | null;
}) {
  const metadata =
    typeof params.chunk.metadata === "object" &&
    params.chunk.metadata &&
    !Array.isArray(params.chunk.metadata)
      ? (params.chunk.metadata as Record<string, unknown>)
      : {};

  const filename =
    typeof metadata.filename === "string" && metadata.filename
      ? metadata.filename
      : typeof metadata.original_filename === "string" && metadata.original_filename
        ? metadata.original_filename
        : null;
  const contentType =
    typeof metadata.contentType === "string" && metadata.contentType ? metadata.contentType : "text";

  return {
    ...metadata,
    filename,
    contentType,
    type:
      typeof metadata.type === "string" && metadata.type ? metadata.type : contentType,
    documentId: params.documentId,
    chunkId: params.chunkId ?? null,
    chunkIndex: params.chunk.chunkIndex,
    pageStart: params.chunk.pageStart,
    pageEnd: params.chunk.pageEnd,
    title: params.chunk.title,
    contentPreview: params.chunk.contentPreview,
  } as Json;
}

function createOptionalAdminDb() {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
}

export async function indexPreparedKnowledgeDocumentChunksForRag(params: {
  db: DB;
  teacherId: string;
  documentId: string;
  chunks: KnowledgeDocumentChunkDraft[];
}) {
  await Promise.all([
    params.db
      .from("knowledge_document_chunks")
      .delete()
      .eq("document_id", params.documentId)
      .eq("teacher_id", params.teacherId),
    deleteSemanticIndexDocuments({
      db: params.db,
      teacherId: params.teacherId,
      sourceKind: "knowledge_chunk",
      sourceId: params.documentId,
    }),
  ]);

  if (params.chunks.length === 0) {
    return {
      chunkCount: 0,
      embeddedCount: 0,
      embeddingModel: null,
      strategy: "empty" as const,
    };
  }

  let embeddingModel: string | null = null;
  let embeddings: number[][] = [];

  try {
    const embedded = await embedChunkTexts(params.chunks.map((chunk) => chunk.content));
    embeddingModel = embedded.model;
    embeddings = embedded.embeddings;
  } catch (error) {
    console.warn("[knowledge-rag] embedding 生成失败，已回退关键词检索模式", error);
  }

  const payload = params.chunks.map((chunk, index) => ({
    document_id: params.documentId,
    teacher_id: params.teacherId,
    chunk_index: chunk.chunkIndex,
    page_start: chunk.pageStart,
    page_end: chunk.pageEnd,
    title: chunk.title,
    content: chunk.content,
    content_preview: chunk.contentPreview,
    token_count: chunk.tokenCount,
    embedding: embeddings[index] ? `[${embeddings[index].join(",")}]` : null,
    metadata: chunk.metadata,
  }));

  const { data: insertedRows, error } = await params.db
    .from("knowledge_document_chunks")
    .insert(payload)
    .select("id,chunk_index");

  if (error) {
    throw new Error(`知识库分块写入失败: ${error.message}`);
  }

  try {
    const chunkIdByIndex = new Map(
      ((insertedRows ?? []) as Array<{ id: string; chunk_index: number }>).map((item) => [
        item.chunk_index,
        item.id,
      ]),
    );

    const semanticResult = await upsertSemanticIndexDocuments({
      db: params.db,
      kind: "search_document",
      items: params.chunks.map((chunk) => ({
        teacherId: params.teacherId,
        sourceKind: "knowledge_chunk",
        sourceId: params.documentId,
        chunkKey: `${chunk.chunkIndex}`,
        contentText: chunk.content,
        metadata: buildKnowledgeChunkSemanticMetadata({
          chunk,
          documentId: params.documentId,
          chunkId: chunkIdByIndex.get(chunk.chunkIndex) ?? null,
        }),
      })),
    });

    if (semanticResult.embeddingModel) {
      embeddingModel = semanticResult.embeddingModel;
    }
  } catch (semanticError) {
    console.warn("[knowledge-rag] semantic index 写入失败，已保留知识块文本索引", semanticError);
  }

  return {
    chunkCount: params.chunks.length,
    embeddedCount: embeddings.length,
    embeddingModel,
    strategy: embeddingModel && embeddings.length > 0 ? ("semantic" as const) : ("keyword" as const),
  };
}

export async function indexKnowledgeDocumentForRag(params: {
  db: DB;
  teacherId: string;
  documentId: string;
  filename: string;
  parsedDocument?: ParsedDocument | null;
  fallbackText?: string;
  subject?: string | null;
  unit?: string | null;
  tags?: string[];
}) {
  const chunks = buildKnowledgeDocumentChunks({
    filename: params.filename,
    parsedDocument: params.parsedDocument,
    fallbackText: params.fallbackText,
    subject: params.subject,
    unit: params.unit,
    tags: params.tags,
  });

  return indexPreparedKnowledgeDocumentChunksForRag({
    db: params.db,
    teacherId: params.teacherId,
    documentId: params.documentId,
    chunks,
  });
}

export async function syncKnowledgeDocumentSemanticIndex(params: {
  db: DB;
  teacherId: string;
  documentIds?: string[];
}) {
  let query = params.db
    .from("knowledge_document_chunks")
    .select(
      `
        id,
        document_id,
        teacher_id,
        chunk_index,
        page_start,
        page_end,
        title,
        content,
        content_preview,
        metadata,
        document:knowledge_documents!knowledge_document_chunks_document_id_fkey(
          id,
          filename,
          subject,
          unit
        )
      `,
    )
    .eq("teacher_id", params.teacherId);

  if (params.documentIds && params.documentIds.length > 0) {
    query = query.in("document_id", params.documentIds);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`读取知识块语义回填素材失败: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{
    id: string;
    document_id: string;
    chunk_index: number;
    page_start: number | null;
    page_end: number | null;
    title: string | null;
    content: string;
    content_preview: string | null;
    metadata: Json;
    document?:
      | {
          id: string;
          filename: string;
          subject: string | null;
          unit: string | null;
        }
      | Array<{
          id: string;
          filename: string;
          subject: string | null;
          unit: string | null;
        }>
      | null;
  }>;

  const documentIds = Array.from(new Set(rows.map((row) => row.document_id)));
  if (documentIds.length > 0) {
    await deleteSemanticIndexDocuments({
      db: params.db,
      teacherId: params.teacherId,
      sourceKind: "knowledge_chunk",
      sourceIds: documentIds,
    });
  }

  await upsertSemanticIndexDocuments({
    db: params.db,
    kind: "search_document",
    items: rows.map((row) => {
      const document = pickFirst(row.document);
      return {
        teacherId: params.teacherId,
        sourceKind: "knowledge_chunk" as const,
        sourceId: row.document_id,
        chunkKey: `${row.chunk_index}`,
        contentText: row.content,
        metadata: {
          ...(typeof row.metadata === "object" && row.metadata && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : {}),
          chunkId: row.id,
          documentId: row.document_id,
          filename: document?.filename ?? null,
          subject: document?.subject ?? null,
          unit: document?.unit ?? null,
          chunkIndex: row.chunk_index,
          pageStart: row.page_start,
          pageEnd: row.page_end,
          title: row.title,
          contentPreview: buildKnowledgeContentPreview(row.content) ?? row.content_preview,
        } as Json,
      };
    }),
  });
}

function mapSemanticHitToKnowledgeResult(hit: Awaited<ReturnType<typeof searchSemanticIndex>>[number]): KnowledgeSearchResult {
  const metadata = hit.metadata;
  const chunkIndex =
    typeof metadata.chunkIndex === "number"
      ? metadata.chunkIndex
      : Number.parseInt(hit.chunkKey, 10);

  return {
    id:
      typeof metadata.chunkId === "string" && metadata.chunkId
        ? metadata.chunkId
        : hit.id,
    content: hit.contentText,
    score: hit.similarity,
    metadata: {
      source: "knowledge_document_chunk",
      retrievalMode: "semantic",
      documentId:
        typeof metadata.documentId === "string" && metadata.documentId
          ? metadata.documentId
          : hit.sourceId,
      filename: typeof metadata.filename === "string" ? metadata.filename : null,
      subject: typeof metadata.subject === "string" ? metadata.subject : null,
      unit: typeof metadata.unit === "string" ? metadata.unit : null,
      chunkIndex: Number.isFinite(chunkIndex) ? chunkIndex : 0,
      pageStart: typeof metadata.pageStart === "number" ? metadata.pageStart : null,
      pageEnd: typeof metadata.pageEnd === "number" ? metadata.pageEnd : null,
      title: typeof metadata.title === "string" ? metadata.title : null,
      contentPreview:
        buildKnowledgeContentPreview(hit.contentText) ??
        (typeof metadata.contentPreview === "string"
          ? metadata.contentPreview
          : trimContextText(hit.contentText, 220)),
      ...metadata,
    },
  };
}

function mapSemanticHitToContentAssetResult(
  hit: Awaited<ReturnType<typeof searchSemanticIndex>>[number],
): KnowledgeSearchResult {
  const metadata = hit.metadata;
  const parsedChunkIndex =
    hit.chunkKey === "__file__"
      ? Number.NaN
      : Number.parseInt(hit.chunkKey, 10);
  const chunkIndex =
    typeof metadata.chunkIndex === "number"
      ? metadata.chunkIndex
      : parsedChunkIndex;
  const pageStart = typeof metadata.pageStart === "number" ? metadata.pageStart : null;
  const pageEnd = typeof metadata.pageEnd === "number" ? metadata.pageEnd : null;
  const title = typeof metadata.title === "string" ? metadata.title : null;
  const source =
    typeof metadata.embeddingMode === "string" && metadata.embeddingMode === "google_multimodal_file"
      ? "content_asset_file"
      : "content_asset_chunk";

  return {
    id:
      typeof metadata.chunkId === "string" && metadata.chunkId
        ? metadata.chunkId
        : hit.id,
    content: hit.contentText,
    score: hit.similarity,
    metadata: {
      source,
      retrievalMode: "semantic",
      assetId:
        typeof metadata.assetId === "string" && metadata.assetId
          ? metadata.assetId
          : hit.sourceId,
      filename: title,
      title,
      chunkIndex: Number.isFinite(chunkIndex) ? chunkIndex : null,
      pageStart,
      pageEnd,
      contentPreview:
        buildKnowledgeContentPreview(hit.contentText) ??
        (typeof metadata.contentPreview === "string"
          ? metadata.contentPreview
          : trimContextText(hit.contentText, 220)),
      embeddingMode:
        typeof metadata.embeddingMode === "string" ? metadata.embeddingMode : "text_chunk",
      mimeType: typeof metadata.mimeType === "string" ? metadata.mimeType : null,
      ...metadata,
    },
  };
}

function compactKnowledgeResults(
  results: KnowledgeSearchResult[],
  limit: number,
) {
  const deduped: KnowledgeSearchResult[] = [];
  const seenIds = new Set<string>();
  const perSourceCount = new Map<string, number>();

  for (const item of results) {
    const sourceType =
      typeof item.metadata.source === "string" ? item.metadata.source : "unknown";
    const sourceId =
      typeof item.metadata.documentId === "string"
        ? item.metadata.documentId
        : typeof item.metadata.assetId === "string"
          ? item.metadata.assetId
          : item.id;
    const dedupeKey = `${sourceType}:${sourceId}:${item.id}`;
    if (seenIds.has(dedupeKey)) continue;

    const sourceBucketKey = `${sourceType}:${sourceId}`;
    const currentCount = perSourceCount.get(sourceBucketKey) ?? 0;
    if (currentCount >= 2) continue;

    seenIds.add(dedupeKey);
    perSourceCount.set(sourceBucketKey, currentCount + 1);
    deduped.push(item);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function computeLexicalCoverage(query: string, item: KnowledgeSearchResult) {
  const queryTerms = extractRetrievalTerms(query);
  if (queryTerms.length === 0) {
    return {
      overlapCount: 0,
      lexicalCoverage: 0,
    };
  }

  const haystack = [
    typeof item.metadata.title === "string" ? item.metadata.title : "",
    typeof item.metadata.contentPreview === "string" ? item.metadata.contentPreview : "",
    item.content,
  ]
    .filter(Boolean)
    .join("\n");
  const overlapCount = countTermHits(queryTerms, haystack);
  return {
    overlapCount,
    lexicalCoverage: clamp01(overlapCount / Math.max(queryTerms.length * 2, 1)),
  };
}

function summarizeRetrievalReason(params: {
  hitCount: number;
  topCoverage: number;
  topSemantic: number;
  topKeyword: number;
}) {
  if (params.hitCount === 0) return "当前检索没有找到可靠证据";
  if (params.topCoverage < 0.18) return "命中文本与当前问题的关键词重合偏低";
  if (params.topSemantic < 0.22 && params.topKeyword < 0.18) {
    return "语义和关键词命中都偏弱";
  }
  if (params.hitCount < 2) return "命中数量偏少，证据覆盖不够";
  return "检索证据可用";
}

function summarizeSemanticResultSourceLabel(results: KnowledgeSearchResult[]) {
  let hasKnowledgeChunk = false;
  let hasContentAsset = false;

  for (const item of results) {
    const source = typeof item.metadata.source === "string" ? item.metadata.source : "";
    if (source === "knowledge_document_chunk") {
      hasKnowledgeChunk = true;
    } else if (source === "content_asset_chunk" || source === "content_asset_file") {
      hasContentAsset = true;
    }
  }

  if (hasKnowledgeChunk && hasContentAsset) return "教师知识库 + 内容库文件";
  if (hasKnowledgeChunk) return "教师知识库";
  if (hasContentAsset) return "内容库文件";
  return "语义索引";
}

export function assessKnowledgeRetrievalQuality(params: {
  query: string;
  results: KnowledgeSearchResult[];
}) {
  const topResults = params.results.slice(0, 3);
  const coverageStats = topResults.map((item) => computeLexicalCoverage(params.query, item));
  const topCoverage = coverageStats[0]?.lexicalCoverage ?? 0;
  const avgCoverage =
    coverageStats.length > 0
      ? coverageStats.reduce((sum, item) => sum + item.lexicalCoverage, 0) / coverageStats.length
      : 0;
  const topMetadata = topResults[0]?.metadata ?? {};
  const topSemantic = typeof topMetadata.semanticScore === "number" ? topMetadata.semanticScore : 0;
  const topKeyword = typeof topMetadata.keywordScore === "number" ? topMetadata.keywordScore : 0;

  let score = 0;
  if (params.results.length >= 4) score += 20;
  else if (params.results.length >= 2) score += 12;
  else if (params.results.length >= 1) score += 6;

  score += Math.round(topCoverage * 28);
  score += Math.round(avgCoverage * 16);
  score += Math.round(topSemantic * 26);
  score += Math.round(topKeyword * 10);
  if (topSemantic > 0.3 && topKeyword > 0.25) score += 8;

  const confidence = inferRetrievalConfidence(score);
  const reason = summarizeRetrievalReason({
    hitCount: params.results.length,
    topCoverage,
    topSemantic,
    topKeyword,
  });

  return {
    confidence,
    confidenceScore: score,
    needsCorrection:
      score < CORRECTIVE_SEARCH_THRESHOLD ||
      params.results.length === 0 ||
      topCoverage < 0.18,
    reason,
  };
}

function buildFallbackResult(item: KnowledgeSearchResult) {
  return {
    ...item,
    metadata: {
      ...item.metadata,
      retrievalMode: "fallback",
      retrievalStage: "fallback",
    },
    score: item.score ?? 0,
  } satisfies KnowledgeSearchResult;
}

/**
 * 简化版知识库检索：纯 embedding 语义搜索 + top N，不做混合评分/纠错/重排。
 * Claude 1M 上下文窗口足以容纳更多 chunk，由模型自行判断相关性。
 */
export async function searchTeacherKnowledgeRagDetailed(params: {
  teacherId: string;
  query: string;
  limit?: number;
  subject?: string | null;
  unit?: string | null;
  db?: DB;
}): Promise<KnowledgeRagSearchResponse> {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 30);
  const expandedLimit = Math.min(Math.max(limit * 3, 12), 48);
  const db = params.db ?? createOptionalAdminDb();

  if (db) {
    try {
      const [knowledgeHits, contentAssetHits] = await Promise.all([
        searchSemanticIndex({
          db,
          teacherId: params.teacherId,
          query: params.query,
          sourceKinds: ["knowledge_chunk"],
          limit: expandedLimit,
          matchThreshold: 0.35,
          subject: params.subject,
          unit: params.unit,
        }),
        searchSemanticIndex({
          db,
          teacherId: params.teacherId,
          query: params.query,
          sourceKinds: ["content_asset"],
          limit: expandedLimit,
          matchThreshold: 0.32,
        }).catch((error) => {
          console.warn("[knowledge-rag] content asset semantic 检索失败，已跳过内容库文件命中", error);
          return [];
        }),
      ]);

      const results = compactKnowledgeResults(
        [
          ...knowledgeHits.map(mapSemanticHitToKnowledgeResult),
          ...contentAssetHits.map(mapSemanticHitToContentAssetResult),
        ].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
        limit,
      );
      const semanticSourceLabel = summarizeSemanticResultSourceLabel(results);
      return {
        results,
        retrieval: {
          strategy: "semantic",
          confidence: results.length >= 3 ? "high" : results.length > 0 ? "medium" : "low",
          corrected: false,
          originalQuery: params.query,
          finalQuery: params.query,
          reason: results.length > 0 ? `语义检索命中（${semanticSourceLabel}）` : "未找到相关知识",
          attempts: [{
            query: params.query,
            stage: "primary",
            strategy: "semantic",
            hitCount: results.length,
            confidence: results.length >= 3 ? "high" : results.length > 0 ? "medium" : "low",
            reason: results.length > 0 ? `语义检索命中（${semanticSourceLabel}）` : "未命中",
          }],
        },
      };
    } catch (error) {
      console.warn("[knowledge-rag] semantic 检索失败，回退 Supermemory", error);
    }
  }

  const fallbackResults = await searchTeacherKnowledgeFallback({
    teacherId: params.teacherId,
    query: params.query,
    limit,
  });

  return {
    results: fallbackResults.map(buildFallbackResult),
    retrieval: {
      strategy: "fallback",
      confidence: fallbackResults.length > 0 ? "medium" : "low",
      corrected: false,
      originalQuery: params.query,
      finalQuery: params.query,
      reason: fallbackResults.length > 0 ? "已回退到长期文档记忆检索" : "未找到可用知识库证据",
      attempts: [
        {
          query: params.query,
          stage: "fallback",
          strategy: "fallback",
          hitCount: fallbackResults.length,
          confidence: fallbackResults.length > 0 ? "medium" : "low",
          reason: fallbackResults.length > 0 ? "chunk 检索不可用，已回退文档搜索" : "回退文档搜索也未命中",
        },
      ],
    },
  };
}

export async function searchTeacherKnowledgeRag(params: {
  teacherId: string;
  query: string;
  limit?: number;
  subject?: string | null;
  unit?: string | null;
  db?: DB;
}) {
  const response = await searchTeacherKnowledgeRagDetailed(params);
  return response.results;
}
