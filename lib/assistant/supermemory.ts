import type {
  ConversationMemorySearchResult,
  ConversationSummaryExtraction,
  KnowledgeSearchResult,
} from "@/lib/assistant/types";
import type { DocumentChunk } from "@/lib/assistant/chunker";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function getApiKey() {
  return process.env.SUPERMEMORY_API_KEY?.trim() || "";
}

function getBaseUrl() {
  return process.env.SUPERMEMORY_BASE_URL?.trim() || "https://api.supermemory.ai";
}

function getContainerPrefix() {
  const configured = process.env.SUPERMEMORY_CONTAINER_PREFIX?.trim();
  if (configured) return configured;
  return "user";
}

export function buildTeacherContainerTag(teacherId: string) {
  const prefix = getContainerPrefix();
  return `${prefix}_${teacherId}`;
}

export function isSupermemoryConfigured() {
  return Boolean(getApiKey());
}

async function requestSupermemory(path: string, init: RequestInit) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("SUPERMEMORY_API_KEY 未配置");
  }

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const data = asObject(payload);
    const detail =
      (typeof data.error === "string" && data.error) ||
      (typeof data.message === "string" && data.message) ||
      "";
    throw new Error(`Supermemory 请求失败: ${response.status}${detail ? ` ${detail}` : ""}`);
  }

  return payload;
}

function extractMemoryId(payload: unknown): string | null {
  const data = asObject(payload);
  if (typeof data.id === "string" && data.id) return data.id;

  const memories = data.memories;
  if (Array.isArray(memories) && memories.length > 0) {
    const first = asObject(memories[0]);
    if (typeof first.id === "string" && first.id) return first.id;
  }

  return null;
}

function extractMemoryIds(payload: unknown, expectedCount: number): Array<string | null> {
  const data = asObject(payload);
  const memories = Array.isArray(data.memories) ? data.memories : [];
  const ids = memories.map((item) => {
    const parsed = asObject(item);
    return typeof parsed.id === "string" && parsed.id ? parsed.id : null;
  });

  if (ids.length === 0) {
    const fallback = extractMemoryId(payload);
    return Array.from({ length: expectedCount }, (_, index) => (index === 0 ? fallback : null));
  }

  return Array.from({ length: expectedCount }, (_, index) => ids[index] ?? null);
}

export async function saveDocumentMemory(params: {
  teacherId: string;
  content: string;
  metadata: Record<string, unknown>;
}) {
  if (!isSupermemoryConfigured()) {
    return { memoryId: null };
  }

  const payload = await requestSupermemory("/v4/memories", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      containerTag: buildTeacherContainerTag(params.teacherId),
      memories: [
        {
          content: params.content,
          isStatic: true,
          metadata: {
            recordType: "document",
            ...params.metadata,
          },
        },
      ],
    }),
  });

  return {
    memoryId: extractMemoryId(payload),
  };
}

export async function saveDocumentChunks(params: {
  teacherId: string;
  documentId: string;
  chunks: DocumentChunk[];
  metadata: Record<string, unknown>;
}) {
  if (!isSupermemoryConfigured()) {
    return {
      memoryIds: params.chunks.map(() => null),
    };
  }

  if (params.chunks.length === 0) {
    return {
      memoryIds: [],
    };
  }

  const payload = await requestSupermemory("/v4/memories", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      containerTag: buildTeacherContainerTag(params.teacherId),
      memories: params.chunks.map((chunk) => ({
        content: chunk.content,
        isStatic: true,
        metadata: {
          recordType: "document_chunk",
          documentId: params.documentId,
          chunkIndex: chunk.index,
          heading: chunk.heading ?? null,
          pageRange: chunk.pageRange ?? null,
          pageStart: chunk.pageStart ?? null,
          pageEnd: chunk.pageEnd ?? null,
          charOffset: chunk.charOffset,
          tokenEstimate: chunk.tokenEstimate,
          ...params.metadata,
        },
      })),
    }),
  });

  return {
    memoryIds: extractMemoryIds(payload, params.chunks.length),
  };
}

async function searchKnowledgeByRecordType(params: {
  teacherId: string;
  query: string;
  limit: number;
  recordType: "document" | "document_chunk";
}): Promise<KnowledgeSearchResult[]> {
  const payload = await requestSupermemory("/v4/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: params.query,
      limit: params.limit,
      containerTag: buildTeacherContainerTag(params.teacherId),
      rerank: true,
      filters: {
        AND: [{ key: "recordType", value: params.recordType, negate: false }],
      },
    }),
  });

  const data = asObject(payload);
  const results = Array.isArray(data.results) ? data.results : [];

  return results
    .map((item) => {
      const parsed = asObject(item);
      const id = typeof parsed.id === "string" ? parsed.id : "";
      const contentCandidate =
        typeof parsed.memory === "string"
          ? parsed.memory
          : typeof parsed.content === "string"
            ? parsed.content
            : "";
      const metadata = asObject(parsed.metadata);
      const score = typeof parsed.score === "number" ? parsed.score : undefined;
      if (!id || !contentCandidate) return null;
      return {
        id,
        content: contentCandidate,
        metadata,
        score,
      } as KnowledgeSearchResult;
    })
    .filter((item): item is KnowledgeSearchResult => item !== null);
}

export async function searchTeacherKnowledge(params: {
  teacherId: string;
  query: string;
  limit?: number;
}): Promise<KnowledgeSearchResult[]> {
  if (!isSupermemoryConfigured()) {
    return [];
  }

  const requestedLimit = Math.max(1, params.limit ?? 6);
  const [chunkResults, documentResults] = await Promise.all([
    searchKnowledgeByRecordType({
      teacherId: params.teacherId,
      query: params.query,
      limit: requestedLimit,
      recordType: "document_chunk",
    }).catch(() => []),
    searchKnowledgeByRecordType({
      teacherId: params.teacherId,
      query: params.query,
      limit: Math.max(2, Math.ceil(requestedLimit / 2)),
      recordType: "document",
    }).catch(() => []),
  ]);

  const merged = [...chunkResults, ...documentResults];
  const deduped = new Map<string, KnowledgeSearchResult>();

  for (const item of merged) {
    const previous = deduped.get(item.id);
    if (!previous) {
      deduped.set(item.id, item);
      continue;
    }

    const prevScore = previous.score ?? Number.NEGATIVE_INFINITY;
    const nextScore = item.score ?? Number.NEGATIVE_INFINITY;
    if (nextScore > prevScore) {
      deduped.set(item.id, item);
    }
  }

  return Array.from(deduped.values())
    .sort((left, right) => {
      const scoreDiff = (right.score ?? Number.NEGATIVE_INFINITY) - (left.score ?? Number.NEGATIVE_INFINITY);
      if (scoreDiff !== 0) return scoreDiff;

      const leftRecordType = typeof left.metadata.recordType === "string" ? left.metadata.recordType : "";
      const rightRecordType = typeof right.metadata.recordType === "string" ? right.metadata.recordType : "";
      if (leftRecordType !== rightRecordType) {
        return leftRecordType === "document_chunk" ? -1 : 1;
      }

      return 0;
    })
    .slice(0, requestedLimit);
}

function parseConversationSummaryRecord(content: string) {
  try {
    const parsed = JSON.parse(content);
    const data = asObject(parsed);
    const summary =
      typeof data.summary === "string" ? data.summary.trim() : "";
    const preferences = Array.isArray(data.preferences)
      ? data.preferences
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
      : [];
    const progress = Array.isArray(data.progress)
      ? data.progress
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
      : [];
    const weakPoints = Array.isArray(data.weakPoints)
      ? data.weakPoints
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
      : [];

    return {
      summary,
      preferences,
      progress,
      weakPoints,
    };
  } catch {
    return {
      summary: "",
      preferences: [],
      progress: [],
      weakPoints: [],
    };
  }
}

export async function searchTeacherConversationSummaries(params: {
  teacherId: string;
  query: string;
  limit?: number;
}): Promise<ConversationMemorySearchResult[]> {
  if (!isSupermemoryConfigured()) {
    return [];
  }

  const payload = await requestSupermemory("/v4/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: params.query,
      limit: params.limit ?? 4,
      containerTag: buildTeacherContainerTag(params.teacherId),
      rerank: true,
      filters: {
        AND: [{ key: "recordType", value: "conversation_summary", negate: false }],
      },
    }),
  });

  const data = asObject(payload);
  const results = Array.isArray(data.results) ? data.results : [];

  const mapped: ConversationMemorySearchResult[] = [];

  for (const item of results) {
    const parsed = asObject(item);
    const id = typeof parsed.id === "string" ? parsed.id : "";
    const contentCandidate =
      typeof parsed.memory === "string"
        ? parsed.memory
        : typeof parsed.content === "string"
          ? parsed.content
          : "";
    const score = typeof parsed.score === "number" ? parsed.score : undefined;
    if (!id || !contentCandidate) continue;

    const record = parseConversationSummaryRecord(contentCandidate);
    if (
      !record.summary &&
      record.preferences.length === 0 &&
      record.progress.length === 0 &&
      record.weakPoints.length === 0
    ) {
      continue;
    }

    mapped.push({
      id,
      summary: record.summary,
      preferences: record.preferences,
      progress: record.progress,
      weakPoints: record.weakPoints,
      score,
    });
  }

  return mapped;
}

export async function appendConversationSummaryMemory(params: {
  teacherId: string;
  conversationId: string;
  extraction: ConversationSummaryExtraction;
}) {
  if (!isSupermemoryConfigured()) {
    return { memoryId: null };
  }

  const content = JSON.stringify({
    summary: params.extraction.summary,
    preferences: params.extraction.preferences,
    progress: params.extraction.progress,
    weakPoints: params.extraction.weakPoints,
  });

  const payload = await requestSupermemory("/v4/memories", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      containerTag: buildTeacherContainerTag(params.teacherId),
      memories: [
        {
          content,
          isStatic: false,
          metadata: {
            recordType: "conversation_summary",
            conversationId: params.conversationId,
            createdAt: new Date().toISOString(),
          },
        },
      ],
    }),
  });

  return {
    memoryId: extractMemoryId(payload),
  };
}
