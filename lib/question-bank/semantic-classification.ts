import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EXERCISE_SEMANTIC_CHUNK_KEYS,
  searchExerciseSemanticHits,
} from "@/lib/question-bank/semantic-index";
import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type SimilarExerciseExample = {
  exerciseId: string;
  similarity: number;
  questionSnippet: string;
  type: string | null;
  knowledgeCluster: string | null;
  knowledgeSubskillLabel: string | null;
  assessmentStyle: string | null;
  sourceFileName: string | null;
};

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function toSnippet(value: string, maxLength = 180) {
  const normalized = cleanText(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

export function buildExerciseClassificationQuery(params: {
  questionText: string;
  optionsText?: string | null;
  sourceKnowledgePoint?: string | null;
  subjectHint?: string | null;
}) {
  return [
    cleanText(params.questionText),
    cleanText(params.optionsText),
    cleanText(params.sourceKnowledgePoint),
    cleanText(params.subjectHint),
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function searchSimilarExerciseExamples(params: {
  supabase: AppSupabase;
  teacherId: string;
  query: string;
  excludeExerciseIds?: string[];
  limit?: number;
}) {
  const exclude = new Set((params.excludeExerciseIds ?? []).filter(Boolean));
  if (!cleanText(params.query)) return [] as SimilarExerciseExample[];

  const hits = await searchExerciseSemanticHits({
    supabase: params.supabase,
    teacherId: params.teacherId,
    query: params.query,
    limit: Math.max((params.limit ?? 4) * 2, 6),
    chunkKeys: [EXERCISE_SEMANTIC_CHUNK_KEYS.classification],
  });

  return hits
    .filter((hit) => !exclude.has(hit.exerciseId))
    .map((hit) => ({
      exerciseId: hit.exerciseId,
      similarity: hit.score,
      questionSnippet: toSnippet(`${hit.metadata.questionPreview ?? ""}` || ""),
      type: cleanText(hit.metadata.type as string | null | undefined) || null,
      knowledgeCluster:
        cleanText(hit.metadata.knowledgeCluster as string | null | undefined) || null,
      knowledgeSubskillLabel:
        cleanText(hit.metadata.knowledgeSubskillLabel as string | null | undefined) || null,
      assessmentStyle:
        cleanText(hit.metadata.assessmentStyle as string | null | undefined) || null,
      sourceFileName:
        cleanText(hit.metadata.sourceFileName as string | null | undefined) || null,
    }))
    .filter(
      (item) =>
        item.knowledgeCluster || item.knowledgeSubskillLabel || item.assessmentStyle,
    )
    .slice(0, Math.max(1, params.limit ?? 4));
}

export function formatSimilarExerciseExamples(examples: SimilarExerciseExample[]) {
  if (examples.length === 0) return "暂无稳定参考题。";

  return examples
    .map((example, index) =>
      [
        `${index + 1}. 相似度=${example.similarity.toFixed(3)}`,
        example.type ? `题型=${example.type}` : "",
        example.knowledgeCluster ? `大类=${example.knowledgeCluster}` : "",
        example.knowledgeSubskillLabel ? `细分=${example.knowledgeSubskillLabel}` : "",
        example.assessmentStyle ? `考察方式=${example.assessmentStyle}` : "",
        example.sourceFileName ? `来源=${example.sourceFileName}` : "",
        `题干摘录=${example.questionSnippet}`,
      ]
        .filter(Boolean)
        .join(" | "),
    )
    .join("\n");
}
