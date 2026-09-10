import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContextFragment } from "@/lib/context-engineering/core";
import {
  deleteSemanticIndexDocuments,
  searchSemanticIndex,
  upsertSemanticIndexDocuments,
} from "@/lib/semantic-index/store";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { readTeacherMemoryView } from "@/lib/teacher-memory/state";
import type { TeacherMemoryRecord } from "@/lib/teacher-memory/types";
import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type TeacherMemoryCapsuleType =
  | "core_profile"
  | "procedural"
  | "semantic"
  | "active_goal"
  | "open_loop"
  | "episodic";

export type TeacherMemoryCapsule = {
  id: string;
  memoryId: string;
  capsuleType: TeacherMemoryCapsuleType;
  label: string;
  content: string;
  score?: number;
  expiresAt: string | null;
  metadata: Record<string, unknown>;
};

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function asStringList(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input.map((item) => cleanText(`${item}`)).filter(Boolean);
}

function dedupeStrings(values: string[], limit: number) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const normalized = cleanText(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(normalized);
    if (next.length >= limit) break;
  }
  return next;
}

function createCapsuleKey(prefix: TeacherMemoryCapsuleType, content: string) {
  const hash = createHash("sha1").update(`${prefix}:${content}`).digest("hex");
  return `${prefix}:${hash.slice(0, 16)}`;
}

function addDays(base: string, days: number) {
  const source = new Date(base);
  if (Number.isNaN(source.getTime())) return null;
  source.setUTCDate(source.getUTCDate() + days);
  return source.toISOString();
}

function capsulePriority(type: TeacherMemoryCapsuleType) {
  switch (type) {
    case "core_profile":
      return 12;
    case "procedural":
      return 10;
    case "semantic":
      return 8;
    case "active_goal":
      return 7;
    case "open_loop":
      return 7;
    case "episodic":
      return 6;
    default:
      return 6;
  }
}

function capsuleLabel(type: TeacherMemoryCapsuleType) {
  switch (type) {
    case "core_profile":
      return "教师档案";
    case "procedural":
      return "稳定偏好与习惯";
    case "semantic":
      return "稳定事实与知识锚点";
    case "active_goal":
      return "当前目标";
    case "open_loop":
      return "待跟进事项";
    case "episodic":
      return "最近任务记忆";
    default:
      return "长期记忆";
  }
}

function getDbClient(provided?: AppSupabase | null) {
  if (provided) return provided;
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
}

function buildTeacherMemoryCapsuleDrafts(memory: TeacherMemoryRecord) {
  const teacherId = cleanText(memory.teacherId ?? "");
  if (!teacherId) return [];

  const view = readTeacherMemoryView(memory);
  const semanticMemory = dedupeStrings(view.semanticMemory, 12);
  const openLoops = dedupeStrings(view.openLoops, 8);
  const episodicMemory = dedupeStrings(
    [
      ...view.episodicMemory,
      cleanText(view.latestConversationSummary),
      cleanText(view.lastArtifactSummary),
    ],
    10,
  );

  const drafts: Array<{
    type: TeacherMemoryCapsuleType;
    content: string;
    expiresAt?: string | null;
  }> = [];
  semanticMemory.forEach((content) => {
    drafts.push({ type: "semantic", content });
  });
  openLoops.forEach((content) => {
    drafts.push({
      type: "open_loop",
      content,
      expiresAt: addDays(memory.lastActiveAt, 30),
    });
  });
  episodicMemory.forEach((content) => {
    drafts.push({
      type: "episodic",
      content,
      expiresAt: addDays(memory.lastActiveAt, 30),
    });
  });

  return drafts.map((draft) => ({
    teacherId,
    sourceKind: "memory_capsule" as const,
    sourceId: memory.id,
    chunkKey: createCapsuleKey(draft.type, draft.content),
    contentText: draft.content,
    status: "active",
    expiresAt: draft.expiresAt ?? null,
    metadata: {
      capsuleType: draft.type,
      label: capsuleLabel(draft.type),
      scope: memory.scope,
      profileKey: memory.profileKey,
      priority: capsulePriority(draft.type),
    },
  }));
}

export async function syncTeacherMemorySemanticCapsules(params: {
  memory: TeacherMemoryRecord;
  supabase?: AppSupabase | null;
}) {
  const teacherId = cleanText(params.memory.teacherId ?? "");
  if (!teacherId) return;

  const db = getDbClient(params.supabase ?? null);
  if (!db) return;

  await deleteSemanticIndexDocuments({
    db,
    teacherId,
    sourceKind: "memory_capsule",
    sourceId: params.memory.id,
  });

  await upsertSemanticIndexDocuments({
    db,
    kind: "memory_capsule",
    items: buildTeacherMemoryCapsuleDrafts(params.memory),
  });
}

export async function searchTeacherMemoryCapsules(params: {
  teacherId: string;
  query: string;
  limit?: number;
  supabase?: AppSupabase | null;
}) {
  const db = getDbClient(params.supabase ?? null);
  if (!db) return [] as TeacherMemoryCapsule[];

  const hits = await searchSemanticIndex({
    db,
    teacherId: params.teacherId,
    query: params.query,
    sourceKinds: ["memory_capsule"],
    limit: params.limit ?? 10,
    matchThreshold: 0.2,
  });

  return hits.map((hit) => {
    const capsuleType = cleanText(hit.metadata.capsuleType as string | null | undefined) as TeacherMemoryCapsuleType;
    return {
      id: hit.id,
      memoryId: hit.sourceId,
      capsuleType,
      label: cleanText(hit.metadata.label as string | null | undefined) || capsuleLabel(capsuleType || "semantic"),
      content: hit.contentText,
      score: hit.similarity,
      expiresAt: hit.expiresAt,
      metadata: hit.metadata,
    };
  });
}

export function buildTeacherMemoryCapsuleFragments(items: TeacherMemoryCapsule[]): ContextFragment[] {
  return items.map((item, index) => ({
    id: item.id,
    kind: "memory" as const,
    label: item.label,
    content: item.content,
    priority: Math.max(4, (Number(item.metadata.priority) || capsulePriority(item.capsuleType)) - index),
    maxLength:
      item.capsuleType === "core_profile"
        ? 220
        : item.capsuleType === "procedural" || item.capsuleType === "semantic"
          ? 260
          : 320,
    sticky: item.capsuleType === "core_profile" || item.capsuleType === "procedural",
    suppressOnReset:
      item.capsuleType === "episodic" ||
      item.capsuleType === "open_loop" ||
      item.capsuleType === "active_goal",
  }));
}

function fragmentDedupeKey(fragment: ContextFragment) {
  return `${fragment.label}:${fragment.content}`.replace(/\s+/g, " ").trim().toLowerCase();
}

export function dedupeTeacherMemoryFragments(items: ContextFragment[]) {
  const bestByKey = new Map<string, ContextFragment>();

  for (const item of items) {
    const key = fragmentDedupeKey(item);
    const existing = bestByKey.get(key);
    if (!existing) {
      bestByKey.set(key, item);
      continue;
    }

    const candidateScore =
      (item.sticky ? 20 : 0) + (item.priority ?? 0) + (item.maxLength ?? 0) / 1000;
    const existingScore =
      (existing.sticky ? 20 : 0) + (existing.priority ?? 0) + (existing.maxLength ?? 0) / 1000;

    if (candidateScore > existingScore) {
      bestByKey.set(key, item);
    }
  }

  return Array.from(bestByKey.values()).sort(
    (a, b) =>
      Number(Boolean(b.sticky)) - Number(Boolean(a.sticky)) ||
      (b.priority ?? 0) - (a.priority ?? 0),
  );
}
