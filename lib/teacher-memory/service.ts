import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  appendSupermemoryEventDocument,
  getSupermemoryStateDocument,
  isSupermemoryEnabled,
  upsertSupermemoryStateDocument,
} from "@/lib/teacher-memory/supermemory";
import {
  buildTeacherMemoryMaintenanceSummary,
  readTeacherMemoryView,
  reconcileTeacherMemoryState,
} from "@/lib/teacher-memory/state";
import { syncTeacherMemorySemanticCapsules } from "@/lib/teacher-memory/semantic-memory";
import { getModelForTask } from "@/lib/ai/model-router";
import { extractAgentLongTermMemoryUpdate, type AgentConversationContext } from "@/lib/agent/context-memory";
import type {
  TeacherMemoryContext,
  TeacherMemoryFormationJob,
  TeacherMemoryFormationJobPayload,
  TeacherMemoryMutationDraft,
  TeacherMemoryMutationMeta,
  TeacherMemoryRecord,
  TeacherMemoryScope,
} from "@/lib/teacher-memory/types";

type DbClient = ReturnType<typeof createAdminSupabaseClient>;

type RowRecord = Record<string, unknown>;

const memoryFallbackStore = new Map<string, TeacherMemoryRecord>();

const TEACHER_USAGE_MEMORY_SELECT = [
  "id",
  "profile_key",
  "teacher_id",
  "scope",
  "preferences",
  "summary",
  "history",
  "last_active_at",
  "created_at",
  "updated_at",
].join(", ");

const TEACHER_MEMORY_JOB_SELECT = [
  "id",
  "teacher_id",
  "profile_key",
  "scope",
  "conversation_id",
  "turn_key",
  "status",
  "attempts",
  "last_error",
  "payload",
  "created_at",
  "updated_at",
  "processed_at",
].join(", ");

function teacherMemoryJobsTable(db: DbClient) {
  return (db.from as unknown as (table: string) => ReturnType<DbClient["from"]>)("teacher_memory_jobs");
}

function teacherMemoryMutationsTable(db: DbClient) {
  return (db.from as unknown as (table: string) => ReturnType<DbClient["from"]>)("teacher_memory_mutations");
}

function allowTeacherMemoryFallback() {
  return process.env.E2E_TEST === "1";
}

function isTeacherMemorySupermemoryPrimaryEnabled() {
  return process.env.SUPERMEMORY_PRIMARY === "1" && isSupermemoryEnabled();
}

function shouldMirrorTeacherMemoryToSupermemory() {
  return process.env.SUPERMEMORY_MIRROR === "1" && isSupermemoryEnabled();
}

function nowIso(): string {
  return new Date().toISOString();
}

function memoryKey(profileKey: string, scope: TeacherMemoryScope): string {
  return `${scope}:${profileKey}`;
}

function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function asRow(input: unknown): RowRecord {
  return input as RowRecord;
}

function asRows(input: unknown[] | null | undefined): RowRecord[] {
  return (input ?? []) as unknown as RowRecord[];
}

function asArrayObject(input: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(input)) return [];
  return input.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item))
    .filter(Boolean);
}

function getTopKey(bucket: unknown): string | null {
  const map = asObject(bucket);
  let maxKey: string | null = null;
  let maxValue = -1;
  for (const [key, value] of Object.entries(map)) {
    const score = Number(value);
    if (Number.isFinite(score) && score > maxValue) {
      maxValue = score;
      maxKey = key;
    }
  }
  return maxKey;
}

function incCounter(container: Record<string, unknown>, bucketName: string, key: string): Record<string, unknown> {
  const bucket = asObject(container[bucketName]);
  const current = Number(bucket[key] ?? 0);
  return {
    ...container,
    [bucketName]: {
      ...bucket,
      [key]: Number.isFinite(current) ? current + 1 : 1,
    },
  };
}

function createEmptyMemory(profileKey: string, scope: TeacherMemoryScope, teacherId: string | null): TeacherMemoryRecord {
  const now = nowIso();
  if (scope === "agent_workspace") {
    return {
      id: crypto.randomUUID(),
      profileKey,
      teacherId,
      scope,
      preferences: {
        responseStyle: "结构化、短段落、可执行",
        lastConversationId: null,
        lastConversationTitle: null,
      },
      history: [],
      summary: {
        sessions: 0,
        toolUsage: {},
        recentTopics: [],
        activeGoals: [],
        openLoops: [],
        stablePreferences: [],
        knowledgeAnchors: [],
        proceduralMemory: [],
        semanticMemory: [],
        episodicMemory: [],
        coreProfile: {},
        latestConversationSummary: "",
        lastArtifactType: "",
        lastArtifactSummary: "",
        lastConversationId: null,
        lastConversationTitle: null,
        lastUsedAt: now,
      },
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    };
  }

  return {
    id: crypto.randomUUID(),
    profileKey,
    teacherId,
    scope,
    preferences: {
      lastTab: "template",
      lastTemplateId: null,
      lastAiAction: null,
      lastTitle: null,
    },
    history: [],
    summary: {
      sessions: 0,
      tabUsage: {},
      templateUsage: {},
      aiUsage: {},
      recentTitles: [],
      lastUsedAt: now,
    },
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
  };
}

function mapDbToMemory(row: Record<string, unknown>): TeacherMemoryRecord {
  return {
    id: String(row.id),
    profileKey: String(row.profile_key),
    teacherId: row.teacher_id ? String(row.teacher_id) : null,
    scope: String(row.scope) as TeacherMemoryScope,
    preferences: asObject(row.preferences),
    history: asArrayObject(row.history),
    summary: asObject(row.summary),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastActiveAt: String(row.last_active_at),
  };
}

function mapMemoryToDb(memory: TeacherMemoryRecord): Record<string, unknown> {
  return {
    id: memory.id,
    profile_key: memory.profileKey,
    teacher_id: memory.teacherId,
    scope: memory.scope,
    preferences: memory.preferences,
    history: memory.history,
    summary: memory.summary,
    created_at: memory.createdAt,
    updated_at: memory.updatedAt,
    last_active_at: memory.lastActiveAt,
  };
}

function safeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

function safeTeacherId(value: unknown, fallback: string | null): string | null {
  if (typeof value === "string") return value;
  if (value === null) return null;
  return fallback;
}

function normalizeStoredMemory(raw: unknown, fallback: TeacherMemoryRecord): TeacherMemoryRecord {
  const data = asObject(raw);
  const preferences = asObject(data.preferences);
  const summary = asObject(data.summary);
  const history = asArrayObject(data.history);

  return {
    id: safeString(data.id, fallback.id),
    profileKey: safeString(data.profileKey, fallback.profileKey),
    teacherId: safeTeacherId(data.teacherId, fallback.teacherId),
    scope:
      data.scope === "wechat_editor" || data.scope === "agent_workspace"
        ? data.scope
        : fallback.scope,
    preferences: Object.keys(preferences).length > 0 ? preferences : fallback.preferences,
    history: history.length > 0 ? history : fallback.history,
    summary: Object.keys(summary).length > 0 ? summary : fallback.summary,
    createdAt: safeString(data.createdAt, fallback.createdAt),
    updatedAt: safeString(data.updatedAt, fallback.updatedAt),
    lastActiveAt: safeString(data.lastActiveAt, fallback.lastActiveAt),
  };
}

function serializeMemoryForSupermemory(memory: TeacherMemoryRecord): string {
  return JSON.stringify({
    version: 1,
    memory,
  });
}

function parseMemoryFromSupermemoryContent(content: string, fallback: TeacherMemoryRecord): TeacherMemoryRecord {
  try {
    const parsed = JSON.parse(content);
    const root = asObject(parsed);
    const maybeMemory = Object.keys(asObject(root.memory)).length > 0 ? root.memory : parsed;
    return normalizeStoredMemory(maybeMemory, fallback);
  } catch {
    return fallback;
  }
}

function computeInsights(memory: TeacherMemoryRecord): TeacherMemoryContext["insights"] {
  const summary = asObject(memory.summary);
  const recentTitles = asStringList(summary.recentTitles).slice(0, 5);

  if (memory.scope === "agent_workspace") {
    const view = readTeacherMemoryView(memory);
    return {
      favoriteTab: null,
      favoriteTemplate: null,
      favoriteAiAction: null,
      favoriteTool: getTopKey(summary.toolUsage),
      totalSessions: Number(summary.sessions ?? 0) || 0,
      lastUsedAt: summary.lastUsedAt ? String(summary.lastUsedAt) : memory.lastActiveAt,
      recentTitles,
      recentTopics: view.recentTopics.slice(0, 5),
      activeGoals: view.activeGoals.slice(0, 5),
      openLoops: view.openLoops.slice(0, 5),
      proceduralMemory: view.proceduralMemory.slice(0, 5),
      semanticMemory: view.semanticMemory.slice(0, 5),
      episodicMemory: view.episodicMemory.slice(0, 5),
      coreProfile: view.coreProfile,
      lastConversationTitle: asString(summary.lastConversationTitle) || null,
    };
  }

  return {
    favoriteTab: getTopKey(summary.tabUsage),
    favoriteTemplate: getTopKey(summary.templateUsage),
    favoriteAiAction: getTopKey(summary.aiUsage),
    totalSessions: Number(summary.sessions ?? 0) || 0,
    lastUsedAt: summary.lastUsedAt ? String(summary.lastUsedAt) : memory.lastActiveAt,
    recentTitles,
  };
}

function getDbClient(): DbClient | null {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
}

async function getMemoryFromSupermemory(
  profileKey: string,
  scope: TeacherMemoryScope,
  teacherId: string | null
): Promise<TeacherMemoryRecord> {
  const existing = await getSupermemoryStateDocument({
    profileKey,
    scope,
  });

  const fallback = createEmptyMemory(profileKey, scope, teacherId);
  if (existing?.content) {
    const restored = parseMemoryFromSupermemoryContent(existing.content, fallback);
    return {
      ...restored,
      profileKey,
      scope,
      teacherId: restored.teacherId ?? teacherId,
    };
  }

  const created = {
    ...fallback,
    profileKey,
    scope,
    teacherId: fallback.teacherId ?? teacherId,
  };
  await upsertSupermemoryStateDocument({
    profileKey,
    scope,
    teacherId: created.teacherId,
    content: serializeMemoryForSupermemory(created),
    lastActiveAt: created.lastActiveAt,
  });
  return created;
}

async function getMemoryFromDb(
  db: DbClient,
  profileKey: string,
  scope: TeacherMemoryScope,
  teacherId: string | null
): Promise<TeacherMemoryRecord> {
  const { data: existingRow, error } = await db
    .from("teacher_usage_memory")
    .select(TEACHER_USAGE_MEMORY_SELECT)
    .eq("profile_key", profileKey)
    .eq("scope", scope)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (existingRow) {
    const existing = mapDbToMemory(asRow(existingRow));
    const now = nowIso();
    const nextTeacherId = existing.teacherId ?? teacherId;

    const { data: updatedRow, error: updateError } = await db
      .from("teacher_usage_memory")
      .update({
        teacher_id: nextTeacherId,
        last_active_at: now,
        updated_at: now,
      })
      .eq("id", existing.id)
      .select(TEACHER_USAGE_MEMORY_SELECT)
      .single();

    if (updateError || !updatedRow) {
      throw new Error(updateError?.message || "更新老师记忆失败");
    }

    return mapDbToMemory(asRow(updatedRow));
  }

  const created = createEmptyMemory(profileKey, scope, teacherId);
  const { data: insertedRow, error: insertError } = await db
    .from("teacher_usage_memory")
    .insert(mapMemoryToDb(created))
    .select(TEACHER_USAGE_MEMORY_SELECT)
    .single();

  if (insertError || !insertedRow) {
    const isDuplicateKey =
      insertError?.code === "23505" ||
      insertError?.message?.includes("teacher_usage_memory_profile_key_scope_key");

    if (isDuplicateKey) {
      const { data: retriedRow, error: retryError } = await db
        .from("teacher_usage_memory")
        .select(TEACHER_USAGE_MEMORY_SELECT)
        .eq("profile_key", profileKey)
        .eq("scope", scope)
        .maybeSingle();

      if (retryError || !retriedRow) {
        throw new Error(retryError?.message || "创建老师记忆失败");
      }

      return mapDbToMemory(asRow(retriedRow));
    }

    throw new Error(insertError?.message || "创建老师记忆失败");
  }

  return mapDbToMemory(asRow(insertedRow));
}

function getMemoryFromFallback(profileKey: string, scope: TeacherMemoryScope, teacherId: string | null): TeacherMemoryRecord {
  const key = memoryKey(profileKey, scope);
  const existing = memoryFallbackStore.get(key);
  if (existing) {
    const now = nowIso();
    const next: TeacherMemoryRecord = {
      ...existing,
      teacherId: existing.teacherId ?? teacherId,
      lastActiveAt: now,
      updatedAt: now,
    };
    memoryFallbackStore.set(key, next);
    return next;
  }

  const created = createEmptyMemory(profileKey, scope, teacherId);
  memoryFallbackStore.set(key, created);
  return created;
}

export async function getOrCreateTeacherMemory(params: {
  profileKey: string;
  scope?: TeacherMemoryScope;
  teacherId?: string | null;
}): Promise<TeacherMemoryContext> {
  const scope = params.scope ?? "wechat_editor";
  const teacherId = params.teacherId ?? null;

  if (isTeacherMemorySupermemoryPrimaryEnabled()) {
    try {
      const memory = await getMemoryFromSupermemory(params.profileKey, scope, teacherId);
      return {
        memory,
        insights: computeInsights(memory),
      };
    } catch (error) {
      console.error(
        "[teacher-memory] Supermemory 读取失败，已回退本地存储:",
        error instanceof Error ? error.message : error
      );
    }
  }

  const db = getDbClient();
  let memory: TeacherMemoryRecord;
  if (!db) {
    if (!allowTeacherMemoryFallback()) {
      throw new Error("老师记忆数据库未配置");
    }
    memory = getMemoryFromFallback(params.profileKey, scope, teacherId);
  } else {
    try {
      memory = await getMemoryFromDb(db, params.profileKey, scope, teacherId);
    } catch (error) {
      if (!allowTeacherMemoryFallback()) {
        throw error instanceof Error ? error : new Error("读取老师记忆失败");
      }
      console.error(
        "[teacher-memory] 数据库读取失败，已回退本地存储:",
        error instanceof Error ? error.message : error,
      );
      memory = getMemoryFromFallback(params.profileKey, scope, teacherId);
    }
  }

  return {
    memory,
    insights: computeInsights(memory),
  };
}

export async function getTeacherMemoryByTeacherId(params: {
  teacherId: string;
  scope?: TeacherMemoryScope;
}): Promise<TeacherMemoryContext | null> {
  const scope = params.scope ?? "agent_workspace";
  const db = getDbClient();
  if (!db) return null;

  try {
    const { data: row, error } = await db
      .from("teacher_usage_memory")
      .select(TEACHER_USAGE_MEMORY_SELECT)
      .eq("teacher_id", params.teacherId)
      .eq("scope", scope)
      .maybeSingle();

    if (error || !row) return null;

    const memory = mapDbToMemory(asRow(row));
    return {
      memory,
      insights: computeInsights(memory),
    };
  } catch {
    return null;
  }
}

function applyEvent(
  memory: TeacherMemoryRecord,
  eventType: string,
  payload: Record<string, unknown>,
  meta?: TeacherMemoryMutationMeta,
): { memory: TeacherMemoryRecord; mutations: TeacherMemoryMutationDraft[] } {
  const now = nowIso();
  const nextPreferences = {
    ...asObject(memory.preferences),
  };
  let nextSummary = {
    ...asObject(memory.summary),
  };
  const nextHistory = [...memory.history];
  let mutations: TeacherMemoryMutationDraft[] = [];

  nextSummary = {
    ...nextSummary,
    lastUsedAt: now,
  };

  if (eventType === "session_start") {
    const sessions = Number(nextSummary.sessions ?? 0);
    nextSummary.sessions = (Number.isFinite(sessions) ? sessions : 0) + 1;
  }

  if (typeof payload.tab === "string" && payload.tab) {
    nextPreferences.lastTab = payload.tab;
    nextSummary = incCounter(nextSummary, "tabUsage", payload.tab);
  }

  if (typeof payload.templateId === "string" && payload.templateId) {
    nextPreferences.lastTemplateId = payload.templateId;
    nextSummary = incCounter(nextSummary, "templateUsage", payload.templateId);
  }

  if (typeof payload.aiAction === "string" && payload.aiAction) {
    nextPreferences.lastAiAction = payload.aiAction;
    nextSummary = incCounter(nextSummary, "aiUsage", payload.aiAction);
  }

  if (typeof payload.title === "string" && payload.title.trim()) {
    const nextTitle = payload.title.trim();
    nextPreferences.lastTitle = nextTitle;
    const titles = asStringList(nextSummary.recentTitles);
    const merged = [nextTitle, ...titles.filter((item) => item !== nextTitle)].slice(0, 10);
    nextSummary.recentTitles = merged;
  }

  if (memory.scope === "agent_workspace") {
    if (typeof payload.conversationId === "string" && payload.conversationId.trim()) {
      nextPreferences.lastConversationId = payload.conversationId.trim();
      nextSummary.lastConversationId = payload.conversationId.trim();
    }

    if (typeof payload.conversationTitle === "string" && payload.conversationTitle.trim()) {
      const title = payload.conversationTitle.trim();
      nextPreferences.lastConversationTitle = title;
      nextSummary.lastConversationTitle = title;
      const titles = asStringList(nextSummary.recentTitles);
      nextSummary.recentTitles = [title, ...titles.filter((item) => item !== title)].slice(0, 10);
    }

    if (typeof payload.toolName === "string" && payload.toolName.trim()) {
      nextSummary = incCounter(nextSummary, "toolUsage", payload.toolName.trim());
    }

    for (const toolName of asStringList(payload.toolNames)) {
      nextSummary = incCounter(nextSummary, "toolUsage", toolName);
    }

    if (typeof payload.responseStyle === "string" && payload.responseStyle.trim()) {
      nextPreferences.responseStyle = payload.responseStyle.trim();
    }

    if (Object.keys(payload).length > 0) {
      const reconciled = reconcileTeacherMemoryState({
        memory: {
          ...memory,
          preferences: nextPreferences,
          summary: nextSummary,
          updatedAt: now,
          lastActiveAt: now,
        },
        payload,
        now,
        meta,
      });
      nextSummary = reconciled.nextSummary;
      mutations = reconciled.mutations;
    }
  }

  nextHistory.unshift({
    eventType,
    payload,
    at: now,
  });

  return {
    memory: {
      ...memory,
      preferences: nextPreferences,
      summary: nextSummary,
      history: nextHistory.slice(0, 80),
      updatedAt: now,
      lastActiveAt: now,
    },
    mutations,
  };
}

async function persistMemory(memory: TeacherMemoryRecord): Promise<TeacherMemoryRecord> {
  const db = getDbClient();
  let saved = memory;
  if (!db) {
    if (!allowTeacherMemoryFallback()) {
      throw new Error("老师记忆数据库未配置");
    }
    memoryFallbackStore.set(memoryKey(memory.profileKey, memory.scope), memory);
  } else {
    try {
      const { data, error } = await db
        .from("teacher_usage_memory")
        .update({
          teacher_id: memory.teacherId,
          preferences: memory.preferences,
          summary: memory.summary,
          history: memory.history,
          updated_at: memory.updatedAt,
          last_active_at: memory.lastActiveAt,
        })
        .eq("id", memory.id)
        .select(TEACHER_USAGE_MEMORY_SELECT)
        .single();

      if (error || !data) {
        throw new Error(error?.message || "保存老师记忆失败");
      }

      saved = mapDbToMemory(asRow(data));
    } catch (error) {
      if (!allowTeacherMemoryFallback()) {
        throw error instanceof Error ? error : new Error("保存老师记忆失败");
      }
      console.error(
        "[teacher-memory] 数据库写入失败，已回退本地存储:",
        error instanceof Error ? error.message : error,
      );
      memoryFallbackStore.set(memoryKey(memory.profileKey, memory.scope), memory);
    }
  }

  if (shouldMirrorTeacherMemoryToSupermemory()) {
    try {
      await upsertSupermemoryStateDocument({
        profileKey: saved.profileKey,
        scope: saved.scope,
        teacherId: saved.teacherId,
        content: serializeMemoryForSupermemory(saved),
        lastActiveAt: saved.lastActiveAt,
      });
    } catch (error) {
      console.error(
        "[teacher-memory] Supermemory 镜像写入失败:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return saved;
}

async function insertEvent(params: {
  memory: TeacherMemoryRecord;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  const db = getDbClient();
  if (!db) {
    if (!allowTeacherMemoryFallback()) {
      throw new Error("老师记忆事件数据库未配置");
    }
    return;
  }

  const { error } = await db.from("teacher_usage_events").insert({
    id: crypto.randomUUID(),
    memory_id: params.memory.id,
    profile_key: params.memory.profileKey,
    teacher_id: params.memory.teacherId,
    scope: params.memory.scope,
    event_type: params.eventType,
    payload: params.payload,
    created_at: nowIso(),
  });

  if (error) {
    if (!allowTeacherMemoryFallback()) {
      throw new Error(error.message || "记录老师记忆事件失败");
    }
    console.error("[teacher-memory] 事件写入失败:", error.message);
  }

  if (shouldMirrorTeacherMemoryToSupermemory()) {
    await appendSupermemoryEventDocument({
      profileKey: params.memory.profileKey,
      scope: params.memory.scope,
      teacherId: params.memory.teacherId,
      eventType: params.eventType,
      payload: params.payload,
      createdAt: nowIso(),
    }).catch((mirrorError) => {
      console.error(
        "[teacher-memory] Supermemory 事件镜像写入失败:",
        mirrorError instanceof Error ? mirrorError.message : mirrorError,
      );
    });
  }
}

async function insertMemoryMutations(params: {
  memory: TeacherMemoryRecord;
  mutations: TeacherMemoryMutationDraft[];
  meta?: TeacherMemoryMutationMeta;
}) {
  if (params.mutations.length === 0) return;

  const db = getDbClient();
  if (!db) {
    if (!allowTeacherMemoryFallback()) {
      throw new Error("老师记忆审计数据库未配置");
    }
    return;
  }

  const rows = params.mutations.map((mutation) => ({
    id: crypto.randomUUID(),
    memory_id: params.memory.id,
    teacher_id: params.memory.teacherId,
    profile_key: params.memory.profileKey,
    scope: params.memory.scope,
    turn_key: params.meta?.turnKey ?? null,
    bucket: mutation.bucket,
    operation: mutation.operation,
    target_key: mutation.targetKey,
    before_value: mutation.beforeValue,
    after_value: mutation.afterValue,
    reason: mutation.reason,
    model: params.meta?.model ?? null,
    created_at: nowIso(),
  }));

  const { error } = await teacherMemoryMutationsTable(db).insert(rows);
  if (error) {
    if (!allowTeacherMemoryFallback()) {
      throw new Error(error.message || "记录老师记忆变更失败");
    }
    console.error("[teacher-memory] 变更审计写入失败:", error.message);
  }
}

export async function trackTeacherMemoryEvent(params: {
  profileKey: string;
  scope?: TeacherMemoryScope;
  teacherId?: string | null;
  eventType: string;
  payload?: Record<string, unknown>;
  meta?: TeacherMemoryMutationMeta;
}) {
  const current = await getOrCreateTeacherMemory({
    profileKey: params.profileKey,
    scope: params.scope,
    teacherId: params.teacherId,
  });

  const payload = params.payload ?? {};
  const applied = applyEvent(current.memory, params.eventType, payload, params.meta);
  const saved = await persistMemory(applied.memory);
  await insertEvent({ memory: saved, eventType: params.eventType, payload });
  await insertMemoryMutations({
    memory: saved,
    mutations: applied.mutations,
    meta: params.meta,
  });
  await syncTeacherMemorySemanticCapsules({ memory: saved }).catch((error) => {
    console.error(
      "[teacher-memory] semantic capsules 同步失败:",
      error instanceof Error ? error.message : error,
    );
  });

  return {
    memory: saved,
    insights: computeInsights(saved),
  };
}

export async function patchTeacherMemoryPreferences(params: {
  profileKey: string;
  scope?: TeacherMemoryScope;
  teacherId?: string | null;
  patch: Record<string, unknown>;
}) {
  const current = await getOrCreateTeacherMemory({
    profileKey: params.profileKey,
    scope: params.scope,
    teacherId: params.teacherId,
  });

  const now = nowIso();
  const merged: TeacherMemoryRecord = {
    ...current.memory,
    preferences: {
      ...asObject(current.memory.preferences),
      ...params.patch,
    },
    updatedAt: now,
    lastActiveAt: now,
  };

  const saved = await persistMemory(merged);
  await syncTeacherMemorySemanticCapsules({ memory: saved }).catch((error) => {
    console.error(
      "[teacher-memory] semantic capsules 同步失败:",
      error instanceof Error ? error.message : error,
    );
  });
  return {
    memory: saved,
    insights: computeInsights(saved),
  };
}

function mapJobRow(row: RowRecord): TeacherMemoryFormationJob {
  const payload = asObject(row.payload) as unknown as TeacherMemoryFormationJobPayload;
  return {
    id: String(row.id),
    teacherId: row.teacher_id ? String(row.teacher_id) : null,
    profileKey: String(row.profile_key),
    scope: String(row.scope) as TeacherMemoryScope,
    conversationId: row.conversation_id ? String(row.conversation_id) : null,
    turnKey: String(row.turn_key),
    status: String(row.status),
    attempts: Number(row.attempts ?? 0) || 0,
    lastError: row.last_error ? String(row.last_error) : null,
    payload,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    processedAt: row.processed_at ? String(row.processed_at) : null,
  };
}

export async function enqueueTeacherMemoryFormationJob(params: {
  turnKey: string;
  payload: TeacherMemoryFormationJobPayload;
}) {
  const db = getDbClient();
  if (!db) {
    throw new Error("老师记忆任务数据库未配置");
  }

  const row = {
    teacher_id: params.payload.teacherId,
    profile_key: params.payload.profileKey,
    scope: params.payload.scope,
    conversation_id: params.payload.conversationId ?? null,
    turn_key: params.turnKey,
    job_type: "formation",
    payload: params.payload,
    status: "queued",
    attempts: 0,
  };

  const { data, error } = await teacherMemoryJobsTable(db)
    .upsert(row, {
      onConflict: "turn_key",
      ignoreDuplicates: false,
    })
    .select(TEACHER_MEMORY_JOB_SELECT)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "创建老师记忆任务失败");
  }

  return mapJobRow(asRow(data));
}

async function updateTeacherMemoryJob(params: {
  db: DbClient;
  jobId: string;
  patch: Record<string, unknown>;
}) {
  const { data, error } = await teacherMemoryJobsTable(params.db)
    .update({
      ...params.patch,
      updated_at: nowIso(),
    })
    .eq("id", params.jobId)
    .select(TEACHER_MEMORY_JOB_SELECT)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "更新老师记忆任务失败");
  }

  return mapJobRow(asRow(data));
}

export async function processTeacherMemoryFormationJob(params: {
  jobId: string;
}) {
  const db = getDbClient();
  if (!db) {
    throw new Error("老师记忆任务数据库未配置");
  }

  const { data: existingRow, error: existingError } = await teacherMemoryJobsTable(db)
    .select(TEACHER_MEMORY_JOB_SELECT)
    .eq("id", params.jobId)
    .maybeSingle();

  if (existingError || !existingRow) {
    throw new Error(existingError?.message || "老师记忆任务不存在");
  }

  const job = mapJobRow(asRow(existingRow));
  if (job.status === "processed") return job;

  await updateTeacherMemoryJob({
    db,
    jobId: job.id,
    patch: {
      status: "processing",
      attempts: job.attempts + 1,
      last_error: null,
    },
  });

  try {
    const current = await getOrCreateTeacherMemory({
      profileKey: job.payload.profileKey,
      scope: job.payload.scope,
      teacherId: job.payload.teacherId,
    });

    const memoryUpdate = await extractAgentLongTermMemoryUpdate({
      memory: current.memory,
      latestUserPrompt: job.payload.latestUserPrompt,
      latestAssistantReply: job.payload.latestAssistantReply,
      toolNames: job.payload.toolNames,
      conversation: job.payload.conversation as AgentConversationContext,
    });

    const updated = await trackTeacherMemoryEvent({
      profileKey: job.payload.profileKey,
      scope: job.payload.scope,
      teacherId: job.payload.teacherId,
      eventType: job.payload.eventType,
      payload: {
        title: job.payload.title ?? job.payload.conversationTitle ?? "",
        conversationId: job.payload.conversationId ?? null,
        conversationTitle: job.payload.conversationTitle ?? null,
        toolNames: job.payload.toolNames,
        ...memoryUpdate,
      },
      meta: {
        turnKey: job.turnKey,
        model: getModelForTask("assistant_memory_extract"),
      },
    });

    const processed = await updateTeacherMemoryJob({
      db,
      jobId: job.id,
      patch: {
        status: "processed",
        processed_at: nowIso(),
        memory_id: updated.memory.id,
        last_error: null,
      },
    });

    return processed;
  } catch (error) {
    const message = error instanceof Error ? error.message : "老师记忆任务处理失败";
    await updateTeacherMemoryJob({
      db,
      jobId: job.id,
      patch: {
        status: "failed",
        last_error: message,
      },
    });
    throw error instanceof Error ? error : new Error(message);
  }
}

export async function runTeacherMemoryMaintenance(params?: {
  teacherId?: string;
  scope?: TeacherMemoryScope;
  limit?: number;
}) {
  const db = getDbClient();
  if (!db) {
    throw new Error("老师记忆数据库未配置");
  }

  let query = (db.from as unknown as (table: string) => ReturnType<DbClient["from"]>)("teacher_usage_memory")
    .select(TEACHER_USAGE_MEMORY_SELECT)
    .order("updated_at", { ascending: false })
    .limit(params?.limit ?? 50);

  if (params?.teacherId) {
    query = query.eq("teacher_id", params.teacherId);
  }
  if (params?.scope) {
    query = query.eq("scope", params.scope);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || "读取老师记忆失败");
  }

  const rows = asRows(data).map((row) => mapDbToMemory(row));
  const results: Array<{ memoryId: string; changed: boolean; mutationCount: number }> = [];

  for (const memory of rows) {
    const maintenance = buildTeacherMemoryMaintenanceSummary(memory, nowIso());
    const nextMemory: TeacherMemoryRecord = {
      ...memory,
      summary: maintenance.nextSummary,
      updatedAt: nowIso(),
      lastActiveAt: memory.lastActiveAt,
    };

    const changed =
      JSON.stringify(memory.summary) !== JSON.stringify(nextMemory.summary);
    if (!changed) {
      results.push({
        memoryId: memory.id,
        changed: false,
        mutationCount: 0,
      });
      continue;
    }

    const saved = await persistMemory(nextMemory);
    await insertMemoryMutations({
      memory: saved,
      mutations: maintenance.mutations,
      meta: {
        turnKey: `maintenance:${saved.id}:${Date.now()}`,
        model: "maintenance",
      },
    });
    await syncTeacherMemorySemanticCapsules({ memory: saved }).catch((syncError) => {
      console.error(
        "[teacher-memory] maintenance semantic capsules 同步失败:",
        syncError instanceof Error ? syncError.message : syncError,
      );
    });
    results.push({
      memoryId: saved.id,
      changed: true,
      mutationCount: maintenance.mutations.length,
    });
  }

  return results;
}
