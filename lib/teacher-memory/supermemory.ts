import type { TeacherMemoryScope } from "@/lib/teacher-memory/types";

interface SupermemorySearchResponse {
  results?: Array<Record<string, unknown>>;
}

interface SupermemoryMemoryRecord {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  updatedAt: string | null;
}

const SUPERMEMORY_RECORD_TYPE_STATE = "teacher_memory_state";
const SUPERMEMORY_RECORD_TYPE_EVENT = "teacher_memory_event";
const memoryIdCache = new Map<string, string>();

function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function getApiKey(): string {
  return process.env.SUPERMEMORY_API_KEY?.trim() || "";
}

function getBaseUrl(): string {
  return process.env.SUPERMEMORY_BASE_URL?.trim() || "https://api.supermemory.ai";
}

function getContainerPrefix(): string {
  return process.env.SUPERMEMORY_CONTAINER_PREFIX?.trim() || "toBeduTrack_teacher_memory";
}

function buildContainerTag(profileKey: string, scope: TeacherMemoryScope): string {
  const raw = `${getContainerPrefix()}_${scope}_${profileKey}`;
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function buildCacheKey(profileKey: string, scope: TeacherMemoryScope): string {
  return `${scope}:${profileKey}`;
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

function sanitizeMetadataValue(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeMetadataValue(item))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const source = asObject(value);
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(source)) {
      const normalized = sanitizeMetadataValue(item);
      if (normalized !== undefined) next[key] = normalized;
    }
    return next;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return undefined;
}

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const normalized = sanitizeMetadataValue(metadata);
  return asObject(normalized);
}

async function supermemoryRequest(path: string, init: RequestInit): Promise<unknown> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("SUPERMEMORY_API_KEY 未配置");
  }

  const url = `${getBaseUrl()}${path}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };

  const response = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const data = asObject(payload);
    const simpleError =
      (typeof data.error === "string" && data.error) ||
      (typeof data.message === "string" && data.message) ||
      (Array.isArray(data.error)
        ? data.error
            .map((item) => asObject(item))
            .map((item) => (typeof item.message === "string" ? item.message : ""))
            .find(Boolean)
        : "") ||
      "";
    throw new Error(`Supermemory 请求失败: ${response.status}${simpleError ? ` ${simpleError}` : ""}`);
  }
  return payload;
}

function timeToNumber(value: string | null): number {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function normalizeSearchResult(item: unknown): SupermemoryMemoryRecord | null {
  const data = asObject(item);
  const id = typeof data.id === "string" ? data.id : "";
  const contentCandidate = typeof data.memory === "string" ? data.memory : data.content;
  const content = typeof contentCandidate === "string" ? contentCandidate : "";
  const metadata = asObject(data.metadata);
  const updatedAt = typeof data.updatedAt === "string" ? data.updatedAt : null;
  if (!id || !content) return null;
  return { id, content, metadata, updatedAt };
}

async function searchStateMemory(params: {
  profileKey: string;
  scope: TeacherMemoryScope;
  query: string;
}): Promise<SupermemoryMemoryRecord | null> {
  const containerTag = buildContainerTag(params.profileKey, params.scope);
  const payload = await supermemoryRequest("/v4/search", {
    method: "POST",
    body: JSON.stringify({
      q: params.query,
      containerTag,
      limit: 5,
      rerank: false,
      filters: {
        AND: [
          { key: "recordType", value: SUPERMEMORY_RECORD_TYPE_STATE, negate: false },
          { key: "profileKey", value: params.profileKey, negate: false },
          { key: "scope", value: params.scope, negate: false },
        ],
      },
    }),
  });

  const searchData = payload as SupermemorySearchResponse;
  const results = Array.isArray(searchData.results) ? searchData.results : [];
  const normalizedResults = results
    .map((item) => normalizeSearchResult(item))
    .filter((item): item is SupermemoryMemoryRecord => item !== null);
  if (normalizedResults.length === 0) return null;

  normalizedResults.sort((a, b) => timeToNumber(b.updatedAt) - timeToNumber(a.updatedAt));
  return normalizedResults[0] || null;
}

async function findStateMemory(profileKey: string, scope: TeacherMemoryScope): Promise<SupermemoryMemoryRecord | null> {
  const firstPass = await searchStateMemory({
    profileKey,
    scope,
    query: profileKey,
  });
  if (firstPass) return firstPass;

  return searchStateMemory({
    profileKey,
    scope,
    query: SUPERMEMORY_RECORD_TYPE_STATE,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createMemory(params: {
  profileKey: string;
  scope: TeacherMemoryScope;
  content: string;
  metadata: Record<string, unknown>;
  isStatic: boolean;
}): Promise<string> {
  const containerTag = buildContainerTag(params.profileKey, params.scope);
  const metadata = sanitizeMetadata(params.metadata);
  const payload = await supermemoryRequest("/v4/memories", {
    method: "POST",
    body: JSON.stringify({
      containerTag,
      memories: [
        {
          content: params.content,
          isStatic: params.isStatic,
          metadata,
        },
      ],
    }),
  });

  const memoryId = extractMemoryId(payload);
  if (!memoryId) {
    throw new Error("Supermemory 创建记忆失败：未返回 memory id");
  }
  return memoryId;
}

export function isSupermemoryEnabled(): boolean {
  return Boolean(getApiKey());
}

export async function getSupermemoryStateDocument(params: {
  profileKey: string;
  scope: TeacherMemoryScope;
}): Promise<SupermemoryMemoryRecord | null> {
  if (!isSupermemoryEnabled()) return null;
  return findStateMemory(params.profileKey, params.scope);
}

export async function upsertSupermemoryStateDocument(params: {
  profileKey: string;
  scope: TeacherMemoryScope;
  teacherId: string | null;
  content: string;
  lastActiveAt: string;
}): Promise<{ memoryId: string }> {
  const cacheKey = buildCacheKey(params.profileKey, params.scope);
  const cachedMemoryId = memoryIdCache.get(cacheKey);
  const metadata = sanitizeMetadata({
    recordType: SUPERMEMORY_RECORD_TYPE_STATE,
    profileKey: params.profileKey,
    scope: params.scope,
    teacherId: params.teacherId,
    lastActiveAt: params.lastActiveAt,
  });

  if (cachedMemoryId) {
    try {
      const updated = await supermemoryRequest("/v4/memories", {
        method: "PATCH",
        body: JSON.stringify({
          id: cachedMemoryId,
          containerTag: buildContainerTag(params.profileKey, params.scope),
          newContent: params.content,
          metadata,
        }),
      });
      const updatedId = extractMemoryId(updated) || cachedMemoryId;
      memoryIdCache.set(cacheKey, updatedId);
      return { memoryId: updatedId };
    } catch {
      memoryIdCache.delete(cacheKey);
    }
  }

  const existing = await findStateMemory(params.profileKey, params.scope);
  if (existing?.id) {
    try {
      const updated = await supermemoryRequest("/v4/memories", {
        method: "PATCH",
        body: JSON.stringify({
          id: existing.id,
          containerTag: buildContainerTag(params.profileKey, params.scope),
          newContent: params.content,
          metadata,
        }),
      });
      const updatedId = extractMemoryId(updated) || existing.id;
      memoryIdCache.set(cacheKey, updatedId);
      return { memoryId: updatedId };
    } catch {
      if (existing.content) {
        try {
          const updatedByContent = await supermemoryRequest("/v4/memories", {
            method: "PATCH",
            body: JSON.stringify({
              content: existing.content,
              containerTag: buildContainerTag(params.profileKey, params.scope),
              newContent: params.content,
              metadata,
            }),
          });
          const updatedId = extractMemoryId(updatedByContent) || existing.id;
          memoryIdCache.set(cacheKey, updatedId);
          return { memoryId: updatedId };
        } catch {
          memoryIdCache.delete(cacheKey);
        }
      } else {
        memoryIdCache.delete(cacheKey);
      }
    }
  }

  // supermemory 写入后存在短暂索引延迟，避免并发请求在延迟窗口内重复创建 state 文档。
  await sleep(250);
  const delayedExisting = await findStateMemory(params.profileKey, params.scope);
  if (delayedExisting?.content) {
    try {
      const updated = await supermemoryRequest("/v4/memories", {
        method: "PATCH",
        body: JSON.stringify({
          content: delayedExisting.content,
          containerTag: buildContainerTag(params.profileKey, params.scope),
          newContent: params.content,
          metadata,
        }),
      });
      const updatedId = extractMemoryId(updated) || delayedExisting.id;
      memoryIdCache.set(cacheKey, updatedId);
      return { memoryId: updatedId };
    } catch {
      memoryIdCache.delete(cacheKey);
    }
  }

  const createdId = await createMemory({
    profileKey: params.profileKey,
    scope: params.scope,
    content: params.content,
    metadata,
    isStatic: true,
  });

  memoryIdCache.set(cacheKey, createdId);
  return { memoryId: createdId };
}

export async function appendSupermemoryEventDocument(params: {
  profileKey: string;
  scope: TeacherMemoryScope;
  teacherId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}) {
  if (!isSupermemoryEnabled()) return;

  await createMemory({
    profileKey: params.profileKey,
    scope: params.scope,
    content: JSON.stringify({
      version: 1,
      profileKey: params.profileKey,
      scope: params.scope,
      teacherId: params.teacherId,
      eventType: params.eventType,
      createdAt: params.createdAt,
      payload: params.payload,
    }),
    metadata: {
      recordType: SUPERMEMORY_RECORD_TYPE_EVENT,
      profileKey: params.profileKey,
      scope: params.scope,
      teacherId: params.teacherId,
      eventType: params.eventType,
      createdAt: params.createdAt,
    },
    isStatic: false,
  });
}
