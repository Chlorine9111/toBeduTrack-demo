// 基于 Context7 文档: Supermemory v4 API
// 轻量 API 客户端，仅封装 create / search / update / forget

import type { MemoryDocumentType, MemorySearchResult } from "@/lib/memory/types";

function getApiKey(): string {
  return process.env.SUPERMEMORY_API_KEY?.trim() ?? "";
}

function getBaseUrl(): string {
  return process.env.SUPERMEMORY_BASE_URL?.trim() || "https://api.supermemory.ai";
}

function getContainerPrefix(): string {
  return process.env.SUPERMEMORY_CONTAINER_PREFIX?.trim() || "toBeduTrack";
}

export function isSupermemoryEnabled(): boolean {
  return Boolean(getApiKey());
}

export function buildContainerTag(teacherId: string): string {
  return `${getContainerPrefix()}_${teacherId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

async function request(path: string, init: RequestInit): Promise<unknown> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("SUPERMEMORY_API_KEY 未配置");

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
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
    throw new Error(`Supermemory ${response.status}${detail ? `: ${detail}` : ""}`);
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

// ===== 创建记忆 =====
export async function createMemory(params: {
  teacherId: string;
  content: string;
  type: MemoryDocumentType;
  metadata?: Record<string, unknown>;
  isStatic?: boolean;
}): Promise<string | null> {
  const payload = await request("/v4/memories", {
    method: "POST",
    body: JSON.stringify({
      containerTag: buildContainerTag(params.teacherId),
      memories: [
        {
          content: params.content,
          isStatic: params.isStatic ?? false,
          metadata: {
            type: params.type,
            teacherId: params.teacherId,
            createdAt: new Date().toISOString(),
            ...params.metadata,
          },
        },
      ],
    }),
  });
  return extractMemoryId(payload);
}

// ===== 更新记忆 =====
export async function updateMemory(params: {
  memoryId: string;
  teacherId: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await request("/v4/memories", {
    method: "PATCH",
    body: JSON.stringify({
      id: params.memoryId,
      containerTag: buildContainerTag(params.teacherId),
      newContent: params.content,
      metadata: {
        ...params.metadata,
        updatedAt: new Date().toISOString(),
      },
    }),
  });
}

// ===== 搜索记忆 =====
export async function searchMemories(params: {
  teacherId: string;
  query: string;
  type?: MemoryDocumentType;
  limit?: number;
  threshold?: number;
}): Promise<MemorySearchResult[]> {
  const filters = params.type
    ? { AND: [{ key: "type", value: params.type, negate: false }] }
    : undefined;

  const payload = await request("/v4/search", {
    method: "POST",
    body: JSON.stringify({
      q: params.query,
      containerTag: buildContainerTag(params.teacherId),
      limit: params.limit ?? 5,
      threshold: params.threshold ?? 0.5,
      rerank: true,
      filters,
    }),
  });

  const data = asObject(payload);
  const results = Array.isArray(data.results) ? data.results : [];

  return results
    .map((item) => {
      const parsed = asObject(item);
      const id = typeof parsed.id === "string" ? parsed.id : "";
      const content =
        typeof parsed.memory === "string"
          ? parsed.memory
          : typeof parsed.content === "string"
            ? parsed.content
            : "";
      const similarity = typeof parsed.similarity === "number"
        ? parsed.similarity
        : typeof parsed.score === "number"
          ? parsed.score
          : 0;
      const metadata = asObject(parsed.metadata);
      if (!id || !content) return null;
      return { id, content, similarity, metadata } satisfies MemorySearchResult;
    })
    .filter((item): item is MemorySearchResult => item !== null);
}

// ===== 软删除记忆 =====
export async function forgetMemory(memoryId: string): Promise<void> {
  await request(`/v4/memories/${memoryId}/forget`, { method: "POST" });
}
