import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createExerciseImportBatch,
  updateExerciseImportBatch,
} from "@/lib/question-bank/store";
import { AGENT_GENERATED_SOURCE_LABEL } from "@/lib/question-bank/constants";
import type { Database, Json } from "@/types/database";
import type { Exercise } from "@/types/exercise";

type AppSupabase = SupabaseClient<Database>;

type AgentGeneratedMaterialExercise = Pick<
  Exercise,
  "type" | "difficulty" | "questionText"
>;

type AgentGeneratedMaterialContext = {
  teacherId: string;
  supabase: AppSupabase;
  sourceConversationId?: string | null;
  sourceMessageId?: string | null;
  teacherPrompt: string;
  artifactMarkdown?: string | null;
  courseId?: string | null;
  courseLabel?: string | null;
  unitId?: string | null;
  unitLabel?: string | null;
  topicId?: string | null;
  topicLabel?: string | null;
  exercises: AgentGeneratedMaterialExercise[];
};

type AgentGeneratedMaterialMetadata = {
  materialType: "agent_generated_batch";
  sourceLabel: typeof AGENT_GENERATED_SOURCE_LABEL;
  title: string;
  summary: string | null;
  promptText: string;
  artifactMarkdown: string | null;
  courseId: string | null;
  courseLabel: string | null;
  unitId: string | null;
  unitLabel: string | null;
  topicId: string | null;
  topicLabel: string | null;
  detectedQuestionCount: number;
  savedCount: number;
  tags: string[];
  questionTypes: string[];
  difficulties: string[];
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  message: string;
  savedAt: string | null;
} & Record<string, Json>;

export type AgentGeneratedMaterialBatch = {
  id: string;
  label: string;
  metadata: AgentGeneratedMaterialMetadata;
};

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => cleanText(value))
        .filter(Boolean),
    ),
  );
}

function summarizeText(value: string | null | undefined, max = 220) {
  const normalized = cleanText(value);
  if (!normalized) return null;
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function toTypeLabel(type: Exercise["type"]) {
  if (type === "MC") return "选择题";
  if (type === "FR") return "问答题";
  if (type === "fill_in") return "填空题";
  return "习题";
}

function buildMaterialTitle(params: {
  courseLabel?: string | null;
  unitLabel?: string | null;
  topicLabel?: string | null;
  exercises: AgentGeneratedMaterialExercise[];
}) {
  const scope = [params.courseLabel, params.unitLabel, params.topicLabel]
    .map((item) => cleanText(item))
    .filter(Boolean)
    .join(" · ");
  const distinctTypes = uniqueStrings(
    params.exercises.map((exercise) => toTypeLabel(exercise.type)),
  );
  const typeLabel =
    distinctTypes.length === 1 ? distinctTypes[0] : distinctTypes.length > 1 ? "混合题型" : "习题";
  const countLabel = `${params.exercises.length}道${typeLabel}`;
  return [scope || "未分类题目", countLabel, AGENT_GENERATED_SOURCE_LABEL]
    .filter(Boolean)
    .join(" · ");
}

function buildMaterialTags(params: {
  courseLabel?: string | null;
  unitLabel?: string | null;
  topicLabel?: string | null;
  exercises: AgentGeneratedMaterialExercise[];
}) {
  const typeTags = uniqueStrings(
    params.exercises.map((exercise) => toTypeLabel(exercise.type)),
  );
  const difficultyTags = uniqueStrings(
    params.exercises.map((exercise) => `难度${exercise.difficulty}`),
  );
  return uniqueStrings([
    AGENT_GENERATED_SOURCE_LABEL,
    params.courseLabel,
    params.unitLabel,
    params.topicLabel,
    ...typeTags,
    ...difficultyTags,
  ]);
}

function buildBaseMetadata(
  params: Omit<AgentGeneratedMaterialContext, "teacherId" | "supabase">,
) {
  const title = buildMaterialTitle({
    courseLabel: params.courseLabel,
    unitLabel: params.unitLabel,
    topicLabel: params.topicLabel,
    exercises: params.exercises,
  });
  const metadata = {
    materialType: "agent_generated_batch",
    sourceLabel: AGENT_GENERATED_SOURCE_LABEL,
    title,
    summary: summarizeText(params.teacherPrompt),
    promptText: params.teacherPrompt,
    artifactMarkdown: params.artifactMarkdown ?? null,
    courseId: params.courseId ?? null,
    courseLabel: params.courseLabel ?? null,
    unitId: params.unitId ?? null,
    unitLabel: params.unitLabel ?? null,
    topicId: params.topicId ?? null,
    topicLabel: params.topicLabel ?? null,
    detectedQuestionCount: params.exercises.length,
    savedCount: 0,
    tags: buildMaterialTags({
      courseLabel: params.courseLabel,
      unitLabel: params.unitLabel,
      topicLabel: params.topicLabel,
      exercises: params.exercises,
    }),
    questionTypes: uniqueStrings(params.exercises.map((exercise) => exercise.type)),
    difficulties: Array.from(
      new Set(
        params.exercises.map((exercise) => exercise.difficulty),
      ),
    ).sort(),
    sourceConversationId: params.sourceConversationId ?? null,
    sourceMessageId: params.sourceMessageId ?? null,
    message: "正在把这批 toBeduTrack 生成的题目归档到题库。",
    savedAt: null,
  } satisfies AgentGeneratedMaterialMetadata;

  return {
    title,
    metadata,
  };
}

export async function createAgentGeneratedMaterialBatch(
  params: AgentGeneratedMaterialContext,
): Promise<AgentGeneratedMaterialBatch> {
  const { title, metadata } = buildBaseMetadata(params);
  const batch = await createExerciseImportBatch(
    {
      teacherId: params.teacherId,
      supabase: params.supabase,
    },
    {
      sourceKind: "agent_generated",
      label: title,
      status: "processing",
      totalDetected: params.exercises.length,
      totalSaved: 0,
      metadata: metadata as unknown as Record<string, unknown>,
    },
  );

  return {
    id: batch.id,
    label: title,
    metadata,
  };
}

export async function finalizeAgentGeneratedMaterialBatch(params: {
  teacherId: string;
  supabase: AppSupabase;
  batchId: string;
  base: AgentGeneratedMaterialBatch;
  sourceMessageId?: string | null;
  artifactMarkdown?: string | null;
  savedCount: number;
  status?: "completed" | "failed";
  message?: string | null;
}) {
  const nextMetadata = {
    ...params.base.metadata,
    sourceMessageId: params.sourceMessageId ?? params.base.metadata.sourceMessageId ?? null,
    artifactMarkdown: params.artifactMarkdown ?? params.base.metadata.artifactMarkdown ?? null,
    savedCount: params.savedCount,
    message:
      cleanText(params.message) ||
      (params.savedCount > 0
        ? `toBeduTrack 已归档 ${params.savedCount} 道题到题库。`
        : "toBeduTrack 生成结果未成功归档到题库。"),
    savedAt: new Date().toISOString(),
  } satisfies AgentGeneratedMaterialMetadata;

  await updateExerciseImportBatch(
    {
      teacherId: params.teacherId,
      supabase: params.supabase,
    },
    params.batchId,
    {
      status: params.status ?? (params.savedCount > 0 ? "completed" : "failed"),
      totalDetected: params.base.metadata.detectedQuestionCount,
      totalSaved: params.savedCount,
      metadata: nextMetadata as unknown as Record<string, unknown>,
    },
  );
}
