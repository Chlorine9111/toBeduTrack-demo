import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteSemanticIndexDocuments,
  searchSemanticIndex,
  upsertSemanticIndexDocuments,
} from "@/lib/semantic-index/store";
import type { Database, Json } from "@/types/database";
import { summarizeExerciseFigures } from "@/lib/question-bank/figure-summary";

type AppSupabase = SupabaseClient<Database>;

type CourseMeta = { id: string; name: string; code: string };
type UnitMeta = { id: string; unit_number: number | string; title: string };

type ExerciseSemanticRow = Pick<
  Database["public"]["Tables"]["exercises"]["Row"],
  | "id"
  | "teacher_id"
  | "course_id"
  | "unit_id"
  | "exercise_type"
  | "difficulty"
  | "question_text"
  | "options"
  | "correct_answer"
  | "solution_steps"
  | "teacher_prompt"
  | "source_kind"
  | "source_file_name"
  | "source_review_status"
  | "knowledge_cluster"
  | "knowledge_cluster_node_id"
  | "knowledge_subskill_label"
  | "knowledge_subskill_node_id"
  | "knowledge_tags"
  | "assessment_style"
  | "assessment_tags"
  | "updated_at"
> & {
  course?: CourseMeta | CourseMeta[] | null;
  unit?: UnitMeta | UnitMeta[] | null;
};

type ExerciseSemanticHit = {
  exerciseId: string;
  score: number;
  metadata: Record<string, unknown>;
};

export const EXERCISE_SEMANTIC_CHUNK_KEYS = {
  search: "search",
  classification: "classification",
  dedupe: "dedupe",
} as const;

type ExerciseSemanticChunkKey =
  (typeof EXERCISE_SEMANTIC_CHUNK_KEYS)[keyof typeof EXERCISE_SEMANTIC_CHUNK_KEYS];

type ExerciseSemanticFilters = {
  courseId?: string;
  unitId?: string;
  type?: string;
  knowledgeCluster?: string;
  clusterNodeId?: string;
  subskillNodeId?: string;
  assessmentStyle?: string;
  difficulty?: number;
  difficulties?: Array<number | string>;
  sourceKind?: string;
  hasFigure?: boolean;
  knowledgeTag?: string;
  assessmentTag?: string;
};

type FigureSummary = Awaited<ReturnType<typeof summarizeExerciseFigures>>;

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function formatUnitLabel(unit: UnitMeta | null) {
  if (!unit) return "";
  const unitNumber = `${unit.unit_number}`.trim();
  return unitNumber ? `Unit ${unitNumber} ${unit.title}` : unit.title;
}

function formatOptions(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const label = cleanText(Reflect.get(item, "label") as string | null | undefined);
      const text = cleanText(Reflect.get(item, "text") as string | null | undefined);
      return [label, text].filter(Boolean).join(". ");
    })
    .filter(Boolean)
    .join("\n");
}

function formatOptionItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    text:
      item && typeof item === "object"
        ? cleanText(Reflect.get(item, "text") as string | null | undefined)
        : "",
  }));
}

function readTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(`${item}`)).filter(Boolean);
}

function buildFigureSummaryText(summary: FigureSummary) {
  if (!summary) return "";
  return [
    summary.summary,
    summary.keywords.length > 0 ? `关键词：${summary.keywords.join("、")}` : "",
    summary.figureType ? `图像类型：${summary.figureType}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildExerciseSearchText(row: ExerciseSemanticRow, figureSummary: FigureSummary) {
  const course = pickFirst(row.course);
  const unit = pickFirst(row.unit);

  return [
    cleanText(row.question_text),
    formatOptions(row.options),
    cleanText(row.correct_answer),
    cleanText(row.solution_steps)?.slice(0, 500),
    cleanText(row.teacher_prompt),
    cleanText(row.source_file_name),
    cleanText(row.knowledge_subskill_label),
    cleanText(`${row.knowledge_cluster ?? ""}`),
    cleanText(`${row.assessment_style ?? ""}`),
    readTags(row.knowledge_tags).join(" "),
    readTags(row.assessment_tags).join(" "),
    cleanText(course?.name),
    cleanText(formatUnitLabel(unit)),
    buildFigureSummaryText(figureSummary),
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

function buildExerciseClassificationText(row: ExerciseSemanticRow, figureSummary: FigureSummary) {
  const figureText = buildFigureSummaryText(figureSummary);
  return [
    cleanText(row.question_text),
    formatOptions(row.options),
    cleanText(`${row.knowledge_cluster ?? ""}`),
    cleanText(row.knowledge_subskill_label),
    cleanText(`${row.assessment_style ?? ""}`),
    readTags(row.knowledge_tags).join(" "),
    figureText ? `题图摘要：${figureText}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

function buildExerciseDedupeText(row: ExerciseSemanticRow, figureSummary: FigureSummary) {
  return [
    cleanText(row.question_text),
    formatOptions(row.options),
    buildFigureSummaryText(figureSummary),
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

function buildExerciseSemanticMetadata(
  row: ExerciseSemanticRow,
  chunkKey: ExerciseSemanticChunkKey,
  figureSummary: FigureSummary,
): Json {
  const course = pickFirst(row.course);
  const unit = pickFirst(row.unit);
  return {
    contentType: "question",
    originEntityType: "exercise",
    courseId: row.course_id,
    courseName: course?.name ?? null,
    unitId: row.unit_id,
    unitName: unit ? formatUnitLabel(unit) : null,
    type: row.exercise_type,
    difficulty: typeof row.difficulty === "number" ? `${row.difficulty}` : null,
    knowledgeCluster: row.knowledge_cluster,
    clusterNodeId: row.knowledge_cluster_node_id,
    knowledgeSubskillLabel: row.knowledge_subskill_label,
    subskillNodeId: row.knowledge_subskill_node_id,
    assessmentStyle: row.assessment_style,
    sourceKind: row.source_kind,
    reviewStatus: row.source_review_status,
    sourceFileName: row.source_file_name,
    knowledgeTags: readTags(row.knowledge_tags),
    assessmentTags: readTags(row.assessment_tags),
    updatedAt: row.updated_at,
    questionPreview: cleanText(row.question_text).slice(0, 180),
    hasFigure: Boolean(figureSummary),
    taskProfile: chunkKey,
    figureType: figureSummary?.figureType ?? null,
  } as Json;
}

async function readExercisesForSemanticIndex(params: {
  supabase: AppSupabase;
  teacherId: string;
  exerciseIds: string[];
}) {
  if (params.exerciseIds.length === 0) return [] as ExerciseSemanticRow[];

  const { data, error } = await params.supabase
    .from("exercises")
    .select(
      `
        id,
        teacher_id,
        course_id,
        unit_id,
        exercise_type,
        difficulty,
        question_text,
        options,
        correct_answer,
        solution_steps,
        teacher_prompt,
        source_kind,
        source_file_name,
        source_review_status,
        knowledge_cluster,
        knowledge_cluster_node_id,
        knowledge_subskill_label,
        knowledge_subskill_node_id,
        knowledge_tags,
        assessment_style,
        assessment_tags,
        updated_at,
        course:courses(id,name,code),
        unit:units(id,unit_number,title)
      `,
    )
    .eq("teacher_id", params.teacherId)
    .in("id", params.exerciseIds);

  if (error) {
    throw new Error(`读取题目语义索引素材失败: ${error.message}`);
  }

  return (data ?? []) as ExerciseSemanticRow[];
}

async function resolveFigureSummary(row: ExerciseSemanticRow) {
  return summarizeExerciseFigures({
    questionText: row.question_text,
    options: formatOptionItems(row.options),
  });
}

function mergeExerciseHits(hits: ExerciseSemanticHit[], limit: number) {
  const ranking = new Map<string, ExerciseSemanticHit>();

  for (const hit of hits) {
    const current = ranking.get(hit.exerciseId);
    if (!current || hit.score > current.score) {
      ranking.set(hit.exerciseId, hit);
    }
  }

  return Array.from(ranking.values())
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export async function syncExerciseSemanticIndexRows(params: {
  supabase: AppSupabase;
  teacherId: string;
  exerciseIds: string[];
}) {
  const exerciseIds = Array.from(new Set(params.exerciseIds.filter(Boolean)));
  if (exerciseIds.length === 0) return;

  const rows = await readExercisesForSemanticIndex(params);
  if (rows.length === 0) {
    await deleteSemanticIndexDocuments({
      db: params.supabase,
      teacherId: params.teacherId,
      sourceKind: "exercise",
      sourceIds: exerciseIds,
    });
    return;
  }

  const prepared = await Promise.all(
    rows.map(async (row) => {
      const figureSummary = await resolveFigureSummary(row).catch((error) => {
        console.warn("题图摘要同步失败，继续写入文本语义索引", {
          exerciseId: row.id,
          message: error instanceof Error ? error.message : String(error),
        });
        return null;
      });

      return {
        row,
        figureSummary,
      };
    }),
  );

  await upsertSemanticIndexDocuments({
    db: params.supabase,
    kind: "search_document",
    items: prepared.flatMap(({ row, figureSummary }) => [
      {
        teacherId: params.teacherId,
        sourceKind: "exercise",
        sourceId: row.id,
        chunkKey: EXERCISE_SEMANTIC_CHUNK_KEYS.search,
        contentText: buildExerciseSearchText(row, figureSummary),
        metadata: buildExerciseSemanticMetadata(
          row,
          EXERCISE_SEMANTIC_CHUNK_KEYS.search,
          figureSummary,
        ),
      },
      // classification chunk 已移除 — Haiku 直接分类，不需要参考题向量
      {
        teacherId: params.teacherId,
        sourceKind: "exercise",
        sourceId: row.id,
        chunkKey: EXERCISE_SEMANTIC_CHUNK_KEYS.dedupe,
        contentText: buildExerciseDedupeText(row, figureSummary),
        metadata: buildExerciseSemanticMetadata(
          row,
          EXERCISE_SEMANTIC_CHUNK_KEYS.dedupe,
          figureSummary,
        ),
      },
    ]),
  });
}

export async function removeExerciseSemanticIndexRows(params: {
  supabase: AppSupabase;
  teacherId: string;
  exerciseIds: string[];
}) {
  const exerciseIds = Array.from(new Set(params.exerciseIds.filter(Boolean)));
  if (exerciseIds.length === 0) return;
  await deleteSemanticIndexDocuments({
    db: params.supabase,
    teacherId: params.teacherId,
    sourceKind: "exercise",
    sourceIds: exerciseIds,
  });
}

export async function searchExerciseSemanticHits(params: {
  supabase: AppSupabase;
  teacherId: string;
  query: string;
  limit?: number;
  filters?: ExerciseSemanticFilters;
  chunkKeys?: ExerciseSemanticChunkKey[];
}) {
  const hits = await searchSemanticIndex({
    db: params.supabase,
    teacherId: params.teacherId,
    query: params.query,
    sourceKinds: ["exercise"],
    limit: Math.max((params.limit ?? 120) * 2, 24),
    matchThreshold: 0.42,
    filters: {
      courseIds: params.filters?.courseId ? [params.filters.courseId] : undefined,
      unitIds: params.filters?.unitId ? [params.filters.unitId] : undefined,
      itemTypes: params.filters?.type ? [params.filters.type] : undefined,
      sourceValues: params.filters?.sourceKind ? [params.filters.sourceKind] : undefined,
      knowledgeClusters: params.filters?.knowledgeCluster
        ? [params.filters.knowledgeCluster]
        : undefined,
      clusterNodeIds: params.filters?.clusterNodeId ? [params.filters.clusterNodeId] : undefined,
      subskillNodeIds: params.filters?.subskillNodeId
        ? [params.filters.subskillNodeId]
        : undefined,
      assessmentStyles: params.filters?.assessmentStyle
        ? [params.filters.assessmentStyle]
        : undefined,
      difficulties: params.filters?.difficulties ??
        (typeof params.filters?.difficulty === "number" ? [params.filters.difficulty] : undefined),
      hasFigure:
        typeof params.filters?.hasFigure === "boolean" ? params.filters.hasFigure : undefined,
      chunkKeys: params.chunkKeys ?? [EXERCISE_SEMANTIC_CHUNK_KEYS.search],
    },
  });

  let filtered = hits;

  if (params.filters?.knowledgeTag) {
    const knowledgeTag = params.filters.knowledgeTag;
    filtered = filtered.filter((hit) => {
      const tags = hit.metadata?.knowledgeTags;
      return Array.isArray(tags) && tags.includes(knowledgeTag);
    });
  }

  if (params.filters?.assessmentTag) {
    const assessmentTag = params.filters.assessmentTag;
    filtered = filtered.filter((hit) => {
      const tags = hit.metadata?.assessmentTags;
      return Array.isArray(tags) && tags.includes(assessmentTag);
    });
  }

  const merged = mergeExerciseHits(
    filtered.map((hit) => ({
      exerciseId: hit.sourceId,
      score: hit.similarity,
      metadata: hit.metadata,
    })),
    params.limit ?? 120,
  );

  return merged satisfies ExerciseSemanticHit[];
}
