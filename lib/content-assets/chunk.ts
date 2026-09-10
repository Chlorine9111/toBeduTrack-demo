import {
  DEFAULT_EMBEDDING_DIMENSION,
  canUseMultimodalEmbeddingForFile,
  generateEmbeddings,
  generateMultimodalEmbeddings,
} from "@/lib/ai/embeddings";
import { trimContextText } from "@/lib/context-engineering/core";
import {
  deleteSemanticIndexDocuments,
  serializeEmbedding,
  upsertPreparedSemanticIndexDocuments,
  upsertSemanticIndexDocuments,
} from "@/lib/semantic-index/store";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

// ── 常量 ──────────────────────────────────────────────────

const DEFAULT_CHUNK_LENGTH = 1200;
const DEFAULT_CHUNK_OVERLAP = 180;
const MAX_INDEXED_CHUNKS = 96;
const EMBEDDING_BATCH_SIZE = 8;
const CONTENT_PREVIEW_LENGTH = 200;
const MULTIMODAL_CONTENT_PREVIEW_LENGTH = 1200;
const MULTIMODAL_ASSET_CHUNK_KEY = "__file__";

// ── 类型 ──────────────────────────────────────────────────

export type AssetChunkDraft = {
  chunkIndex: number;
  title: string | null;
  content: string;
  contentPreview: string;
  tokenCount: number;
  pageStart: number | null;
  pageEnd: number | null;
};

type AssetMultimodalSource = {
  fileBuffer: Buffer;
  mimeType: string;
  fileName: string;
  pageCount?: number | null;
};

// ── 内部工具 ──────────────────────────────────────────────

function normalizeWhitespace(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function estimateTokenCount(text: string) {
  const normalized = text.trim();
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 4));
}

function detectChunkTitle(params: {
  fileName: string;
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
    return `${params.fileName} · 第 ${params.pageStart} 页`;
  }
  return params.fileName;
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

function splitTextIntoWindows(
  text: string,
  maxLength = DEFAULT_CHUNK_LENGTH,
  overlap = DEFAULT_CHUNK_OVERLAP,
) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];
  if (normalized.length <= maxLength) return [normalized];

  const windows: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const targetEnd = Math.min(start + maxLength, normalized.length);
    const end =
      targetEnd >= normalized.length
        ? normalized.length
        : findBreakPoint(normalized, start, targetEnd);
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

function buildAssetSemanticDocumentText(params: {
  fileName: string;
  chunks: AssetChunkDraft[];
}) {
  const preview = trimContextText(
    params.chunks
      .map((chunk) => chunk.contentPreview || chunk.content)
      .filter(Boolean)
      .join("\n\n"),
    MULTIMODAL_CONTENT_PREVIEW_LENGTH,
  );

  return [
    `文件标题：${params.fileName}`,
    preview ? `文件摘录：\n${preview}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

// ── 公开 API ─────────────────────────────────────────────

export function buildAssetChunks(params: {
  assetId: string;
  fileName: string;
  rawText: string;
  pageTexts?: string[];
  maxChunkLength?: number;
  overlap?: number;
  maxChunks?: number;
}): AssetChunkDraft[] {
  const maxChunkLength = params.maxChunkLength ?? DEFAULT_CHUNK_LENGTH;
  const overlap = params.overlap ?? DEFAULT_CHUNK_OVERLAP;
  const maxChunks = params.maxChunks ?? MAX_INDEXED_CHUNKS;

  const pageTexts =
    params.pageTexts
      ?.map((page) => normalizeWhitespace(page))
      .filter(Boolean) ?? [];

  const drafts: AssetChunkDraft[] = [];
  let chunkIndex = 0;

  if (pageTexts.length > 0) {
    for (let pageIndex = 0; pageIndex < pageTexts.length; pageIndex++) {
      const windows = splitTextIntoWindows(
        pageTexts[pageIndex],
        maxChunkLength,
        overlap,
      );
      for (const content of windows) {
        if (drafts.length >= maxChunks) break;
        const pageNumber = pageIndex + 1;
        const title = detectChunkTitle({
          fileName: params.fileName,
          pageStart: pageNumber,
          content,
        });
        const prefixedContent = `[${params.fileName}]${title ? ` ${title}` : ""}\n\n${content}`;
        drafts.push({
          chunkIndex: chunkIndex++,
          title,
          content: prefixedContent,
          contentPreview: trimContextText(content, CONTENT_PREVIEW_LENGTH),
          tokenCount: estimateTokenCount(prefixedContent),
          pageStart: pageNumber,
          pageEnd: pageNumber,
        });
      }
      if (drafts.length >= maxChunks) break;
    }
  }

  if (drafts.length === 0) {
    const windows = splitTextIntoWindows(
      params.rawText,
      maxChunkLength,
      overlap,
    );
    for (const content of windows) {
      if (drafts.length >= maxChunks) break;
      const title = detectChunkTitle({
        fileName: params.fileName,
        pageStart: null,
        content,
      });
      const prefixedContent = `[${params.fileName}]${title ? ` ${title}` : ""}\n\n${content}`;
      drafts.push({
        chunkIndex: chunkIndex++,
        title,
        content: prefixedContent,
        contentPreview: trimContextText(content, CONTENT_PREVIEW_LENGTH),
        tokenCount: estimateTokenCount(prefixedContent),
        pageStart: null,
        pageEnd: null,
      });
    }
  }

  return drafts;
}

export async function indexAssetChunks(params: {
  teacherId: string;
  assetId: string;
  chunks: AssetChunkDraft[];
  multimodalSource?: AssetMultimodalSource;
}): Promise<{ chunkCount: number; embeddedCount: number }> {
  const admin = createAdminSupabaseClient();

  // 清理旧数据
  await Promise.all([
    admin
      .from("content_asset_chunks")
      .delete()
      .eq("asset_id", params.assetId),
    deleteSemanticIndexDocuments({
      db: admin,
      teacherId: params.teacherId,
      sourceKind: "content_asset",
      sourceId: params.assetId,
    }),
  ]);

  if (params.chunks.length === 0) {
    return { chunkCount: 0, embeddedCount: 0 };
  }

  const useMultimodalEmbedding =
    params.multimodalSource &&
    canUseMultimodalEmbeddingForFile({
      mimeType: params.multimodalSource.mimeType,
      pageCount: params.multimodalSource.pageCount,
    });

  if (useMultimodalEmbedding && params.multimodalSource) {
    const semanticText = buildAssetSemanticDocumentText({
      fileName: params.multimodalSource.fileName,
      chunks: params.chunks,
    });

    try {
      const multimodal = await generateMultimodalEmbeddings({
        input: {
          parts: [
            {
              type: "text",
              text: `教学资料：${params.multimodalSource.fileName}`,
            },
            {
              type: "file",
              mimeType: params.multimodalSource.mimeType,
              fileBuffer: params.multimodalSource.fileBuffer,
              displayName: params.multimodalSource.fileName,
            },
          ],
          textFallback: semanticText,
        },
        kind: "search_document",
        dimensions: DEFAULT_EMBEDDING_DIMENSION,
        titles: [params.multimodalSource.fileName],
      });

      if (multimodal.strategy === "multimodal" && multimodal.embeddings[0]) {
        const payload = params.chunks.map((chunk) => ({
          asset_id: params.assetId,
          teacher_id: params.teacherId,
          chunk_index: chunk.chunkIndex,
          page_start: chunk.pageStart,
          page_end: chunk.pageEnd,
          title: chunk.title,
          content: chunk.content,
          content_preview: chunk.contentPreview,
          token_count: chunk.tokenCount,
          embedding: null,
          metadata: {} as Json,
        }));

        const { error } = await admin
          .from("content_asset_chunks")
          .insert(payload);

        if (error) {
          throw new Error(`content_asset_chunks 写入失败: ${error.message}`);
        }

        await upsertPreparedSemanticIndexDocuments({
          db: admin,
          embeddingModel: multimodal.model,
          embeddings: [multimodal.embeddings[0]],
          items: [
            {
              teacherId: params.teacherId,
              sourceKind: "content_asset",
              sourceId: params.assetId,
              chunkKey: MULTIMODAL_ASSET_CHUNK_KEY,
              contentText: semanticText,
              metadata: {
                assetId: params.assetId,
                chunkIndex: null,
                pageStart: params.chunks[0]?.pageStart ?? null,
                pageEnd: params.chunks.at(-1)?.pageEnd ?? null,
                title: params.multimodalSource.fileName,
                contentPreview: trimContextText(semanticText, CONTENT_PREVIEW_LENGTH),
                embeddingMode: "google_multimodal_file",
                mimeType: params.multimodalSource.mimeType,
              } as Json,
            },
          ],
        });

        return { chunkCount: params.chunks.length, embeddedCount: 1 };
      }
    } catch (error) {
      console.warn("[content-assets/chunk] 多模态 embedding 失败，回退文本分块", error);
    }
  }

  // 生成 embeddings（分批）
  const embeddings: number[][] = [];
  let embeddingFailed = false;

  try {
    for (let i = 0; i < params.chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = params.chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
      const response = await generateEmbeddings({
        input: batch.map((chunk) => chunk.content),
        kind: "search_document",
        dimensions: DEFAULT_EMBEDDING_DIMENSION,
      });
      embeddings.push(...response.embeddings);
    }
  } catch (error) {
    console.warn("[content-assets/chunk] embedding 生成失败，仅写入文本", error);
    embeddingFailed = true;
  }

  // 批量写入 content_asset_chunks
  const payload = params.chunks.map((chunk, index) => ({
    asset_id: params.assetId,
    teacher_id: params.teacherId,
    chunk_index: chunk.chunkIndex,
    page_start: chunk.pageStart,
    page_end: chunk.pageEnd,
    title: chunk.title,
    content: chunk.content,
    content_preview: chunk.contentPreview,
    token_count: chunk.tokenCount,
    embedding:
      !embeddingFailed && embeddings[index]
        ? serializeEmbedding(embeddings[index])
        : null,
    metadata: {} as Json,
  }));

  const { data: insertedRows, error } = await admin
    .from("content_asset_chunks")
    .insert(payload)
    .select("id,chunk_index");

  if (error) {
    throw new Error(`content_asset_chunks 写入失败: ${error.message}`);
  }

  // 写入 semantic_index_items
  try {
    const chunkIdByIndex = new Map(
      ((insertedRows ?? []) as Array<{ id: string; chunk_index: number }>).map(
        (row) => [row.chunk_index, row.id],
      ),
    );

    await upsertSemanticIndexDocuments({
      db: admin,
      kind: "search_document",
      items: params.chunks.map((chunk) => ({
        teacherId: params.teacherId,
        sourceKind: "content_asset" as const,
        sourceId: params.assetId,
        chunkKey: `${chunk.chunkIndex}`,
        contentText: chunk.content,
        metadata: {
          chunkId: chunkIdByIndex.get(chunk.chunkIndex) ?? null,
          assetId: params.assetId,
          chunkIndex: chunk.chunkIndex,
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          title: chunk.title,
          contentPreview: chunk.contentPreview,
        } as Json,
      })),
    });
  } catch (semanticError) {
    console.warn(
      "[content-assets/chunk] semantic index 写入失败，已保留 chunk 文本索引",
      semanticError,
    );
  }

  const embeddedCount = embeddingFailed ? 0 : embeddings.length;
  return { chunkCount: params.chunks.length, embeddedCount };
}
