import { createClient } from "@supabase/supabase-js";
import { normalizeSubskillConfidence } from "@/lib/exercises/confidence";
import { classifyExerciseTaxonomyBatchWithAi } from "@/lib/question-bank/taxonomy-ai";
import type { Database } from "@/types/database";
import type { Exercise } from "@/types/exercise";

type ExerciseBackfillRow = Pick<
  Database["public"]["Tables"]["exercises"]["Row"],
  | "teacher_id"
  | "id"
  | "question_text"
  | "exercise_type"
  | "teacher_prompt"
  | "knowledge_cluster"
  | "knowledge_subskill_key"
  | "knowledge_subskill_label"
  | "knowledge_tags"
  | "assessment_style"
  | "assessment_tags"
  | "classification_confidence"
  | "classification_status"
  | "classification_reasons"
  | "subskill_confidence"
  | "subskill_match_mode"
  | "subskill_reasons"
>;

function getEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`缺少环境变量：${name}`);
  }
  return value;
}

function arraysEqual(left: string[] | null | undefined, right: string[] | null | undefined) {
  const normalizedLeft = [...new Set((left ?? []).filter(Boolean))].sort();
  const normalizedRight = [...new Set((right ?? []).filter(Boolean))].sort();
  if (normalizedLeft.length !== normalizedRight.length) return false;
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function needsUpdate(row: ExerciseBackfillRow, next: {
  knowledgeCluster: string | null;
  knowledgeSubskillKey: string | null;
  knowledgeSubskillLabel: string | null;
  knowledgeTags: string[];
  assessmentStyle: string | null;
  assessmentTags: string[];
  classificationConfidence: number;
  classificationStatus: string;
  classificationReasons: string[];
  subskillConfidence: number | null;
  subskillMatchMode: string | null;
  subskillReasons: string[];
}) {
  return (
    row.knowledge_cluster !== next.knowledgeCluster ||
    row.knowledge_subskill_key !== next.knowledgeSubskillKey ||
    row.knowledge_subskill_label !== next.knowledgeSubskillLabel ||
    row.assessment_style !== next.assessmentStyle ||
    !arraysEqual(row.knowledge_tags, next.knowledgeTags) ||
    !arraysEqual(row.assessment_tags, next.assessmentTags) ||
    (row.classification_confidence ?? 0) !== next.classificationConfidence ||
    row.classification_status !== next.classificationStatus ||
    !arraysEqual(row.classification_reasons, next.classificationReasons) ||
    (row.subskill_confidence ?? 0) !==
      (normalizeSubskillConfidence(next.subskillConfidence) ?? 0) ||
    row.subskill_match_mode !== (next.subskillMatchMode ?? "needs_review") ||
    !arraysEqual(row.subskill_reasons, next.subskillReasons)
  );
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let from = 0;
  const pageSize = 200;
  let totalScanned = 0;
  let totalUpdated = 0;

  while (true) {
    const { data, error } = await supabase
      .from("exercises")
      .select(
        "teacher_id, id, question_text, exercise_type, teacher_prompt, knowledge_cluster, knowledge_subskill_key, knowledge_subskill_label, knowledge_tags, assessment_style, assessment_tags, classification_confidence, classification_status, classification_reasons, subskill_confidence, subskill_match_mode, subskill_reasons",
      )
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`读取 exercises 失败：${error.message}`);
    }

    const rows = (data ?? []) as ExerciseBackfillRow[];
    if (rows.length === 0) break;

    totalScanned += rows.length;

    const taxonomies = await classifyExerciseTaxonomyBatchWithAi({
      supabase,
      items: rows.map((row) => ({
        teacherId: row.teacher_id,
        questionText: row.question_text,
        responseFormat: row.exercise_type as Exercise["type"],
        subjectHint: row.teacher_prompt,
      })),
      concurrency: 3,
    });

    for (const [index, row] of rows.entries()) {
      const taxonomy = taxonomies[index];

      if (!needsUpdate(row, taxonomy)) continue;

      totalUpdated += 1;
      if (dryRun) continue;

      const { error: updateError } = await supabase
        .from("exercises")
        .update({
          knowledge_cluster: taxonomy.knowledgeCluster,
          knowledge_subskill_key: taxonomy.knowledgeSubskillKey,
          knowledge_subskill_label: taxonomy.knowledgeSubskillLabel,
          knowledge_tags: taxonomy.knowledgeTags,
          assessment_style: taxonomy.assessmentStyle,
          assessment_tags: taxonomy.assessmentTags,
          classification_confidence: taxonomy.classificationConfidence,
          classification_status: taxonomy.classificationStatus,
          classification_reasons: taxonomy.classificationReasons,
          subskill_confidence:
            normalizeSubskillConfidence(taxonomy.subskillConfidence) ?? 0,
          subskill_match_mode: taxonomy.subskillMatchMode ?? "needs_review",
          subskill_reasons: taxonomy.subskillReasons,
        })
        .eq("id", row.id);

      if (updateError) {
        throw new Error(`更新题目 ${row.id} 分类失败：${updateError.message}`);
      }
    }

    from += rows.length;
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        totalScanned,
        totalUpdated,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
