import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteSemanticIndexDocuments,
  searchSemanticIndex,
  upsertSemanticIndexDocuments,
} from "@/lib/semantic-index/store";
import type { Database, Json } from "@/types/database";
import type { Exercise, ExerciseDifficulty } from "@/types/exercise";

type AppSupabase = SupabaseClient<Database>;

type ContentLibrarySemanticRow = Pick<
  Database["public"]["Tables"]["content_library_items"]["Row"],
  | "id"
  | "teacher_id"
  | "content_type"
  | "renderer_type"
  | "origin_entity_type"
  | "origin_entity_id"
  | "title"
  | "custom_title"
  | "note"
  | "summary_text"
  | "search_text"
  | "course_id"
  | "unit_id"
  | "course_label"
  | "unit_label"
  | "updated_at"
  | "snapshot"
>;

type ContentLibrarySemanticHit = {
  itemId: string;
  score: number;
  metadata: Record<string, unknown>;
};

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function extractExerciseSnapshot(snapshot: Json): Exercise | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }
  if (Reflect.get(snapshot, "kind") !== "exercise") {
    return null;
  }

  const exercise = Reflect.get(snapshot, "exercise");
  if (!exercise || typeof exercise !== "object" || Array.isArray(exercise)) {
    return null;
  }

  return exercise as unknown as Exercise;
}

function exerciseHasFigure(exercise: Exercise | null) {
  if (!exercise) return false;
  const values = [
    cleanText(exercise.questionText),
    ...((exercise.options ?? []).map((item) => cleanText(item?.text))),
  ];
  return values.some((value) => /!\[[^\]]*]\(([^)]+)\)/.test(value));
}

export function buildContentLibrarySemanticText(row: ContentLibrarySemanticRow) {
  const exercise = extractExerciseSnapshot(row.snapshot);
  return [
    cleanText(row.custom_title),
    cleanText(row.title),
    cleanText(row.note),
    cleanText(row.summary_text),
    cleanText(row.search_text),
    cleanText(row.course_label),
    cleanText(row.unit_label),
    cleanText(`${row.content_type ?? ""}`),
    cleanText(`${row.origin_entity_type ?? ""}`),
    cleanText(exercise?.questionText),
    cleanText(exercise?.knowledgeCluster),
    cleanText(exercise?.knowledgeSubskillLabel),
    cleanText(exercise?.assessmentStyle),
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

function buildContentLibrarySemanticMetadata(row: ContentLibrarySemanticRow): Json {
  const exercise = extractExerciseSnapshot(row.snapshot);
  return {
    contentType: row.content_type,
    rendererType: row.renderer_type,
    originEntityType: row.origin_entity_type,
    originEntityId: row.origin_entity_id,
    courseId: row.course_id,
    unitId: row.unit_id,
    courseLabel: row.course_label,
    unitLabel: row.unit_label,
    displayTitle: cleanText(row.custom_title) || cleanText(row.title),
    updatedAt: row.updated_at,
    itemType: exercise?.type ?? null,
    difficulty: exercise?.difficulty ?? null,
    knowledgeCluster: exercise?.knowledgeCluster ?? null,
    clusterNodeId: exercise?.knowledgeClusterNodeId ?? null,
    knowledgeSubskillLabel: exercise?.knowledgeSubskillLabel ?? null,
    subskillNodeId: exercise?.knowledgeSubskillNodeId ?? null,
    assessmentStyle: exercise?.assessmentStyle ?? null,
    hasFigure: exerciseHasFigure(exercise),
  } as Json;
}

async function readContentItemsForSemanticIndex(params: {
  supabase: AppSupabase;
  teacherId: string;
  itemIds: string[];
}) {
  if (params.itemIds.length === 0) return [] as ContentLibrarySemanticRow[];

  const { data, error } = await params.supabase
    .from("content_library_items")
    .select(
      `
        id,
        teacher_id,
        content_type,
        renderer_type,
        origin_entity_type,
        origin_entity_id,
        title,
        custom_title,
        note,
        summary_text,
        search_text,
        course_id,
        unit_id,
        course_label,
        unit_label,
        updated_at,
        snapshot
      `,
    )
    .eq("teacher_id", params.teacherId)
    .in("id", params.itemIds);

  if (error) {
    throw new Error(`读取内容库语义索引素材失败: ${error.message}`);
  }

  return (data ?? []) as ContentLibrarySemanticRow[];
}

export async function syncContentLibrarySemanticIndexItems(params: {
  supabase: AppSupabase;
  teacherId: string;
  itemIds: string[];
}) {
  const itemIds = Array.from(new Set(params.itemIds.filter(Boolean)));
  if (itemIds.length === 0) return;

  const rows = await readContentItemsForSemanticIndex(params);
  if (rows.length === 0) {
    await deleteSemanticIndexDocuments({
      db: params.supabase,
      teacherId: params.teacherId,
      sourceKind: "content_library_item",
      sourceIds: itemIds,
    });
    return;
  }

  await upsertSemanticIndexDocuments({
    db: params.supabase,
    kind: "search_document",
    items: rows.map((row) => ({
      teacherId: params.teacherId,
      sourceKind: "content_library_item",
      sourceId: row.id,
      contentText: buildContentLibrarySemanticText(row),
      metadata: buildContentLibrarySemanticMetadata(row),
    })),
  });
}

export async function removeContentLibrarySemanticIndexItems(params: {
  supabase: AppSupabase;
  teacherId: string;
  itemIds: string[];
}) {
  const itemIds = Array.from(new Set(params.itemIds.filter(Boolean)));
  if (itemIds.length === 0) return;
  await deleteSemanticIndexDocuments({
    db: params.supabase,
    teacherId: params.teacherId,
    sourceKind: "content_library_item",
    sourceIds: itemIds,
  });
}

export async function searchContentLibrarySemanticHits(params: {
  supabase: AppSupabase;
  teacherId: string;
  query: string;
  limit?: number;
  filters?: {
    contentType?: string;
    courseId?: string;
    unitId?: string;
    difficulty?: ExerciseDifficulty;
    assessmentStyle?: string;
    clusterNodeId?: string;
    subskillNodeId?: string;
  };
}) {
  const hits = await searchSemanticIndex({
    db: params.supabase,
    teacherId: params.teacherId,
    query: params.query,
    sourceKinds: ["content_library_item"],
    limit: params.limit ?? 120,
    matchThreshold: 0.28,
    filters: {
      contentTypes: params.filters?.contentType ? [params.filters.contentType] : undefined,
      courseIds: params.filters?.courseId ? [params.filters.courseId] : undefined,
      unitIds: params.filters?.unitId ? [params.filters.unitId] : undefined,
      difficulties:
        params.filters?.difficulty ? [params.filters.difficulty] : undefined,
      assessmentStyles: params.filters?.assessmentStyle
        ? [params.filters.assessmentStyle]
        : undefined,
      clusterNodeIds: params.filters?.clusterNodeId ? [params.filters.clusterNodeId] : undefined,
      subskillNodeIds: params.filters?.subskillNodeId ? [params.filters.subskillNodeId] : undefined,
    },
  });

  return hits.map((hit) => ({
    itemId: hit.sourceId,
    score: hit.similarity,
    metadata: hit.metadata,
  })) satisfies ContentLibrarySemanticHit[];
}
