/**
 * 回填 knowledge_cluster 为 null 的题目。
 * 用 Haiku 快速分类，并发 5，约 1 秒/题。
 *
 * 用法: npx tsx scripts/backfill-knowledge-cluster.ts
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BATCH_SIZE = 5;
const LIMIT = 500;

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY);

async function classifyWithHaiku(questionText: string, optionsText: string, subjectHint: string) {
  const { classifyExerciseTaxonomy } = await import("@/lib/question-bank/taxonomy");
  return classifyExerciseTaxonomy({
    questionText,
    optionsText: optionsText || undefined,
    subjectHint: subjectHint || undefined,
  });
}

function formatOptions(options: unknown): string {
  if (!options || !Array.isArray(options)) return "";
  return options
    .map((opt: Record<string, unknown>) => `${opt.label ?? ""}: ${opt.text ?? ""}`)
    .join("\n");
}

async function main() {
  console.log("Fetching exercises with null knowledge_cluster...");

  const { data: exercises, error } = await supabase
    .from("exercises")
    .select("id, question_text, options, teacher_prompt")
    .is("knowledge_cluster", null)
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (error) {
    console.error("Failed to fetch exercises:", error.message);
    process.exit(1);
  }

  console.log(`Found ${exercises.length} exercises to classify.`);

  let classified = 0;
  let failed = 0;

  for (let i = 0; i < exercises.length; i += BATCH_SIZE) {
    const batch = exercises.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (ex) => {
        const taxonomy = await classifyWithHaiku(
          ex.question_text,
          formatOptions(ex.options),
          ex.teacher_prompt ?? "",
        );

        const { error: updateError } = await supabase
          .from("exercises")
          .update({
            knowledge_cluster: taxonomy.knowledgeCluster,
            knowledge_subskill_key: taxonomy.knowledgeSubskillKey ?? null,
            knowledge_subskill_label: taxonomy.knowledgeSubskillLabel ?? null,
            assessment_style: taxonomy.assessmentStyle,
            knowledge_tags: taxonomy.knowledgeTags,
            assessment_tags: taxonomy.assessmentTags,
            classification_confidence: taxonomy.classificationConfidence,
            classification_status: taxonomy.classificationStatus,
            classification_reasons: taxonomy.classificationReasons,
          })
          .eq("id", ex.id);

        if (updateError) throw new Error(updateError.message);
        return taxonomy.knowledgeCluster;
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled") {
        classified++;
      } else {
        failed++;
        console.warn("  Failed:", r.reason);
      }
    }

    console.log(`  ${i + batch.length}/${exercises.length} done (classified: ${classified}, failed: ${failed})`);
  }

  console.log(`\nDone! Classified: ${classified}, Failed: ${failed}`);
}

main();
