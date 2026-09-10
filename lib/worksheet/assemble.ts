import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import { generateStructuredObject } from "@/lib/ai/structured-output";
import { searchExerciseSemanticHits } from "@/lib/question-bank/semantic-index";
import { DEFAULT_WORKSHEET_LAYOUT_CONFIG } from "@/lib/worksheet/constants";
import type { Database, Json } from "@/types/database";
import type { ExerciseOption } from "@/types/exercise";

type AppSupabase = SupabaseClient<Database>;

const WORKSHEET_SELECT = [
  "id",
  "teacher_id",
  "course_id",
  "unit_id",
  "title",
  "description",
  "layout_config",
  "status",
  "pdf_url",
  "pdf_path",
  "pdf_generated_at",
  "created_at",
  "updated_at",
].join(",");

type ExerciseRow = Pick<
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
  | "knowledge_cluster"
  | "knowledge_subskill_label"
  | "assessment_style"
  | "source_file_name"
  | "similarity_fingerprint"
  | "updated_at"
>;

type WorksheetRow = Database["public"]["Tables"]["worksheets"]["Row"];

type CandidateExercise = {
  id: string;
  courseId: string;
  unitId: string | null;
  type: string;
  difficulty: number;
  questionText: string;
  options: ExerciseOption[];
  correctAnswer: string | null;
  solutionSteps: string | null;
  knowledgeCluster: string | null;
  knowledgeSubskillLabel: string | null;
  assessmentStyle: string | null;
  sourceFileName: string | null;
  similarityFingerprint: string | null;
  semanticScore: number;
  updatedAt: string;
};

export type AssembledWorksheetSection = {
  title: string;
  rationale: string;
  exerciseIds: string[];
};

export type AssembledWorksheetExercise = {
  id: string;
  exerciseType: string;
  difficulty: number;
  questionText: string;
  options: ExerciseOption[] | null;
  correctAnswer: string | null;
  solutionSteps: string | null;
  knowledgeCluster: string | null;
  knowledgeSubskillLabel: string | null;
  assessmentStyle: string | null;
  sourceFileName: string | null;
  semanticScore: number;
};

export type AssembleWorksheetInput = {
  supabase: AppSupabase;
  teacherId: string;
  courseId?: string;
  unitId?: string;
  title: string;
  description?: string;
  query?: string;
  seedExerciseId?: string;
  type?: "MC" | "FR" | "fill_in";
  difficulty?: 1 | 2 | 3 | 4;
  knowledgeCluster?: string;
  assessmentStyle?: string;
  clusterNodeId?: string;
  subskillNodeId?: string;
  hasFigure?: boolean;
  count: number;
  maxCandidates: number;
  includeSeedExercise?: boolean;
};

export type AssembleWorksheetResult = {
  worksheet: {
    id: string;
    teacherId: string;
    courseId: string;
    unitId: string | null;
    title: string;
    description: string | null;
    layoutConfig: Json;
    status: string;
    pdfUrl: string | null;
    createdAt: string;
    updatedAt: string;
  };
  exercises: AssembledWorksheetExercise[];
  sections: AssembledWorksheetSection[];
  summary: string;
  selectionReasons: string[];
  semanticQuery: string;
  candidateCount: number;
};

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}...`;
}

function formatOptions(value: unknown) {
  if (!Array.isArray(value)) return [] as ExerciseOption[];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const label = cleanText(Reflect.get(item, "label") as string | null | undefined);
      const text = cleanText(Reflect.get(item, "text") as string | null | undefined);
      const isCorrect = Boolean(Reflect.get(item, "isCorrect"));
      if (!label || !text) return null;
      return { label, text, isCorrect } satisfies ExerciseOption;
    })
    .filter((item): item is ExerciseOption => Boolean(item));
}

function buildOptionsSummary(options: ExerciseOption[]) {
  return options
    .map((option) => `${option.label}. ${cleanText(option.text)}`)
    .filter(Boolean)
    .join(" | ");
}

function toCandidateExercise(row: ExerciseRow, semanticScore: number): CandidateExercise {
  return {
    id: row.id,
    courseId: row.course_id,
    unitId: row.unit_id,
    type: cleanText(row.exercise_type) || "unknown",
    difficulty: typeof row.difficulty === "number" ? row.difficulty : 1,
    questionText: row.question_text,
    options: formatOptions(row.options),
    correctAnswer: cleanText(row.correct_answer) || null,
    solutionSteps: cleanText(row.solution_steps) || null,
    knowledgeCluster: cleanText(row.knowledge_cluster) || null,
    knowledgeSubskillLabel: cleanText(row.knowledge_subskill_label) || null,
    assessmentStyle: cleanText(row.assessment_style) || null,
    sourceFileName: cleanText(row.source_file_name) || null,
    similarityFingerprint: cleanText(row.similarity_fingerprint) || null,
    semanticScore,
    updatedAt: row.updated_at,
  };
}

function buildSemanticQuery(params: {
  query?: string;
  seedExercise?: CandidateExercise | null;
}) {
  return [cleanText(params.query), cleanText(params.seedExercise?.questionText), buildOptionsSummary(params.seedExercise?.options ?? [])]
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeSearchTerm(value: string) {
  return cleanText(value).replace(/[“”"'`]/g, "").trim();
}

function extractExplicitSourceFileNames(input: string) {
  const normalized = normalizeSearchTerm(input);
  if (!normalized) return [];
  return Array.from(
    new Set(normalized.match(/[A-Za-z0-9._-]+\.pdf/gi) ?? []),
  ).slice(0, 4);
}

function extractWorksheetKeywordTerms(input: string) {
  const normalized = normalizeSearchTerm(input);
  if (!normalized) return [];

  const terms = new Set<string>();
  extractExplicitSourceFileNames(normalized).forEach((value) => terms.add(value));

  normalized
    .replace(/[，。！？；：、（）()【】\[\]{}<>《》]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 3 &&
        !/^(unit|course|worksheet|source|file|chemistry|biology|physics|calculus|return|download)$/i.test(
          token,
        ) &&
        !/\.pdf$/i.test(token),
    )
    .slice(0, 10)
    .forEach((value) => terms.add(value));

  return Array.from(terms).slice(0, 8);
}

async function loadKeywordCandidateScores(params: {
  supabase: AppSupabase;
  teacherId: string;
  courseId?: string;
  unitId?: string;
  type?: "MC" | "FR" | "fill_in";
  difficulty?: 1 | 2 | 3 | 4;
  knowledgeCluster?: string;
  assessmentStyle?: string;
  clusterNodeId?: string;
  subskillNodeId?: string;
  semanticQuery: string;
  limit: number;
}) {
  const ranking = new Map<string, number>();
  const sourceFileNames = extractExplicitSourceFileNames(params.semanticQuery);
  const terms = extractWorksheetKeywordTerms(params.semanticQuery);

  if (sourceFileNames.length === 0 && terms.length === 0) {
    return ranking;
  }

  for (const [fileIndex, sourceFileName] of sourceFileNames.entries()) {
    let sourceQuery = params.supabase
      .from("exercises")
      .select("id,updated_at")
      .eq("teacher_id", params.teacherId)
      .eq("source_file_name", sourceFileName)
      .limit(params.limit);

    if (params.unitId) {
      sourceQuery = sourceQuery.eq("unit_id", params.unitId);
    }
    if (params.type) {
      sourceQuery = sourceQuery.eq("exercise_type", params.type);
    }
    if (typeof params.difficulty === "number") {
      sourceQuery = sourceQuery.eq("difficulty", params.difficulty);
    }
    if (params.knowledgeCluster) {
      sourceQuery = sourceQuery.eq("knowledge_cluster", params.knowledgeCluster);
    }
    if (params.assessmentStyle) {
      sourceQuery = sourceQuery.eq("assessment_style", params.assessmentStyle);
    }
    if (params.clusterNodeId) {
      sourceQuery = sourceQuery.eq("knowledge_cluster_node_id", params.clusterNodeId);
    }
    if (params.subskillNodeId) {
      sourceQuery = sourceQuery.eq("knowledge_subskill_node_id", params.subskillNodeId);
    }

    const { data, error } = await sourceQuery;
    if (error) {
      throw new Error("读取组卷题源候选失败");
    }

    ((data ?? []) as Array<{ id: string; updated_at: string }>).forEach((row, index) => {
      const score = 200 - fileIndex * 10 - index;
      ranking.set(row.id, Math.max(ranking.get(row.id) ?? 0, score));
    });
  }

  for (const [termIndex, term] of terms.entries()) {
    let query = params.supabase
      .from("exercises")
      .select("id,updated_at")
      .eq("teacher_id", params.teacherId)
      .limit(params.limit);

    if (params.courseId) {
      query = query.eq("course_id", params.courseId);
    }
    if (params.unitId) {
      query = query.eq("unit_id", params.unitId);
    }
    if (params.type) {
      query = query.eq("exercise_type", params.type);
    }
    if (typeof params.difficulty === "number") {
      query = query.eq("difficulty", params.difficulty);
    }
    if (params.knowledgeCluster) {
      query = query.eq("knowledge_cluster", params.knowledgeCluster);
    }
    if (params.assessmentStyle) {
      query = query.eq("assessment_style", params.assessmentStyle);
    }
    if (params.clusterNodeId) {
      query = query.eq("knowledge_cluster_node_id", params.clusterNodeId);
    }
    if (params.subskillNodeId) {
      query = query.eq("knowledge_subskill_node_id", params.subskillNodeId);
    }

    const escaped = term.replace(/[%_,]/g, " ");
    const { data, error } = await query.or(
      `question_text.ilike.%${escaped}%,source_file_name.ilike.%${escaped}%,teacher_prompt.ilike.%${escaped}%,knowledge_subskill_label.ilike.%${escaped}%`,
    );

    if (error) {
      throw new Error("读取组卷关键词候选失败");
    }

    ((data ?? []) as Array<{ id: string; updated_at: string }>).forEach((row, index) => {
      const score = 60 - termIndex * 4 - index;
      ranking.set(row.id, Math.max(ranking.get(row.id) ?? 0, score));
    });
  }

  return ranking;
}

async function loadExerciseById(params: {
  supabase: AppSupabase;
  teacherId: string;
  exerciseId: string;
}) {
  const { data, error } = await params.supabase
    .from("exercises")
    .select(
      "id,teacher_id,course_id,unit_id,exercise_type,difficulty,question_text,options,correct_answer,solution_steps,knowledge_cluster,knowledge_subskill_label,assessment_style,source_file_name,similarity_fingerprint,updated_at",
    )
    .eq("id", params.exerciseId)
    .eq("teacher_id", params.teacherId)
    .maybeSingle();

  if (error) {
    throw new Error("读取种子题失败");
  }
  if (!data) {
    return null;
  }

  return toCandidateExercise(data as ExerciseRow, 1);
}

async function loadCandidateExercises(params: {
  supabase: AppSupabase;
  teacherId: string;
  courseId?: string;
  unitId?: string;
  semanticQuery: string;
  seedExercise?: CandidateExercise | null;
  includeSeedExercise: boolean;
  maxCandidates: number;
  type?: "MC" | "FR" | "fill_in";
  difficulty?: 1 | 2 | 3 | 4;
  knowledgeCluster?: string;
  assessmentStyle?: string;
  clusterNodeId?: string;
  subskillNodeId?: string;
  hasFigure?: boolean;
}) {
  const ranking = new Map<string, number>();
  const candidateLimit = Math.min(Math.max(params.maxCandidates * 4, 24), 120);
  const explicitSourceFileNames = extractExplicitSourceFileNames(params.semanticQuery);

  if (params.semanticQuery) {
    const hits = await searchExerciseSemanticHits({
      supabase: params.supabase,
      teacherId: params.teacherId,
      query: params.semanticQuery,
      limit: candidateLimit,
      filters: {
        courseId: params.courseId,
        unitId: params.unitId,
        type: params.type,
        difficulty: params.difficulty,
        knowledgeCluster: params.knowledgeCluster,
        assessmentStyle: params.assessmentStyle,
        clusterNodeId: params.clusterNodeId,
        subskillNodeId: params.subskillNodeId,
        hasFigure: params.hasFigure,
      },
    });

    hits.forEach((hit, index) => {
      const baseScore = Math.max(0, hit.score) * 1000;
      ranking.set(hit.exerciseId, Math.max(ranking.get(hit.exerciseId) ?? 0, baseScore - index));
    });

    // 只在语义搜索结果不足时才触发关键词搜索
    const hasEnoughSemanticResults = ranking.size >= params.maxCandidates * 2;
    if (!hasEnoughSemanticResults) {
      const keywordScores = await loadKeywordCandidateScores({
        supabase: params.supabase,
        teacherId: params.teacherId,
        courseId: params.courseId,
        unitId: params.unitId,
        type: params.type,
        difficulty: params.difficulty,
        knowledgeCluster: params.knowledgeCluster,
        assessmentStyle: params.assessmentStyle,
        clusterNodeId: params.clusterNodeId,
        subskillNodeId: params.subskillNodeId,
        semanticQuery: params.semanticQuery,
        limit: candidateLimit,
      });

      keywordScores.forEach((score, exerciseId) => {
        ranking.set(exerciseId, Math.max(ranking.get(exerciseId) ?? 0, score));
      });
    }
  }

  if (params.includeSeedExercise && params.seedExercise) {
    ranking.set(params.seedExercise.id, 10_000);
  }

  const candidateIds = Array.from(ranking.keys());
  if (candidateIds.length === 0) {
    return [] as CandidateExercise[];
  }

  let query = params.supabase
    .from("exercises")
    .select(
      "id,teacher_id,course_id,unit_id,exercise_type,difficulty,question_text,options,correct_answer,solution_steps,knowledge_cluster,knowledge_subskill_label,assessment_style,source_file_name,similarity_fingerprint,updated_at",
    )
    .eq("teacher_id", params.teacherId)
    .in("id", candidateIds);

  if (params.courseId) {
    query = query.eq("course_id", params.courseId);
  }

  if (explicitSourceFileNames.length > 0) {
    query = query.in("source_file_name", explicitSourceFileNames);
  }

  if (params.unitId) {
    query = query.eq("unit_id", params.unitId);
  }
  if (params.type) {
    query = query.eq("exercise_type", params.type);
  }
  if (typeof params.difficulty === "number") {
    query = query.eq("difficulty", params.difficulty);
  }
  if (params.knowledgeCluster) {
    query = query.eq("knowledge_cluster", params.knowledgeCluster);
  }
  if (params.assessmentStyle) {
    query = query.eq("assessment_style", params.assessmentStyle);
  }
  if (params.clusterNodeId) {
    query = query.eq("knowledge_cluster_node_id", params.clusterNodeId);
  }
  if (params.subskillNodeId) {
    query = query.eq("knowledge_subskill_node_id", params.subskillNodeId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error("读取候选题失败");
  }

  const ordered = ((data ?? []) as ExerciseRow[])
    .map((row) => toCandidateExercise(row, ranking.get(row.id) ?? 0))
    .sort((left, right) => {
      const scoreDiff = right.semanticScore - left.semanticScore;
      if (scoreDiff !== 0) return scoreDiff;
      return `${right.updatedAt}`.localeCompare(`${left.updatedAt}`);
    });

  const deduped: CandidateExercise[] = [];
  const seenFingerprints = new Set<string>();
  const seenIds = new Set<string>();

  for (const item of ordered) {
    if (seenIds.has(item.id)) continue;
    if (item.similarityFingerprint && seenFingerprints.has(item.similarityFingerprint)) {
      continue;
    }

    seenIds.add(item.id);
    if (item.similarityFingerprint) {
      seenFingerprints.add(item.similarityFingerprint);
    }
    deduped.push(item);

    if (deduped.length >= params.maxCandidates) {
      break;
    }
  }

  if (
    params.includeSeedExercise &&
    params.seedExercise &&
    !deduped.some((item) => item.id === params.seedExercise?.id)
  ) {
    deduped.unshift(params.seedExercise);
  }

  return deduped.slice(0, params.maxCandidates);
}

function buildCandidateCatalog(candidates: CandidateExercise[]) {
  return candidates
    .map((candidate, index) => {
      const promptPreview = cleanText(candidate.questionText).slice(0, 160);
      const optionPreview = buildOptionsSummary(candidate.options).slice(0, 120);
      return [
        `${index + 1}. id=${candidate.id}`,
        `semanticScore=${candidate.semanticScore.toFixed(3)}`,
        `type=${candidate.type}`,
        `difficulty=${candidate.difficulty}`,
        candidate.knowledgeCluster ? `knowledgeCluster=${candidate.knowledgeCluster}` : "",
        candidate.knowledgeSubskillLabel
          ? `knowledgeSubskill=${candidate.knowledgeSubskillLabel}`
          : "",
        candidate.assessmentStyle ? `assessmentStyle=${candidate.assessmentStyle}` : "",
        candidate.sourceFileName ? `source=${candidate.sourceFileName}` : "",
        `question=${promptPreview}`,
        optionPreview ? `options=${optionPreview}` : "",
      ]
        .filter(Boolean)
        .join(" | ");
    })
    .join("\n");
}

function sanitizeSelection(params: {
  selectedExerciseIds: string[];
  candidates: CandidateExercise[];
  count: number;
  seedExerciseId?: string;
  includeSeedExercise: boolean;
}) {
  const candidateMap = new Map(params.candidates.map((item) => [item.id, item]));
  const selected: string[] = [];
  const seen = new Set<string>();

  for (const exerciseId of params.selectedExerciseIds) {
    if (!candidateMap.has(exerciseId) || seen.has(exerciseId)) continue;
    selected.push(exerciseId);
    seen.add(exerciseId);
    if (selected.length >= params.count) break;
  }

  if (params.includeSeedExercise && params.seedExerciseId && candidateMap.has(params.seedExerciseId)) {
    if (!seen.has(params.seedExerciseId)) {
      selected.unshift(params.seedExerciseId);
      seen.add(params.seedExerciseId);
    }
  }

  for (const candidate of params.candidates) {
    if (selected.length >= params.count) break;
    if (seen.has(candidate.id)) continue;
    selected.push(candidate.id);
    seen.add(candidate.id);
  }

  return selected.slice(0, params.count);
}

function sanitizeSections(params: {
  sections: AssembledWorksheetSection[];
  selectedExerciseIds: string[];
}) {
  const selectedSet = new Set(params.selectedExerciseIds);
  const normalized = params.sections
    .map((section) => ({
      title: cleanText(section.title) || "同类题组",
      rationale: cleanText(section.rationale) || "围绕同一核心考察内容组织。",
      exerciseIds: Array.from(
        new Set(section.exerciseIds.filter((exerciseId) => selectedSet.has(exerciseId))),
      ),
    }))
    .filter((section) => section.exerciseIds.length > 0);

  const assigned = new Set(normalized.flatMap((section) => section.exerciseIds));
  const unassigned = params.selectedExerciseIds.filter((exerciseId) => !assigned.has(exerciseId));
  if (unassigned.length > 0) {
    normalized.push({
      title: "补充题组",
      rationale: "模型未显式分组的题目，按召回顺序补入。",
      exerciseIds: unassigned,
    });
  }

  return normalized;
}

function buildFallbackWorksheetSelection(params: {
  candidates: CandidateExercise[];
  count: number;
  semanticQuery: string;
  seedExerciseId?: string;
  includeSeedExercise: boolean;
  reason?: string;
}) {
  const selectedExerciseIds = sanitizeSelection({
    selectedExerciseIds: [],
    candidates: params.candidates,
    count: params.count,
    seedExerciseId: params.seedExerciseId,
    includeSeedExercise: params.includeSeedExercise,
  });
  const fallbackReason =
    cleanText(params.reason) || "模型分组结果不稳定，已按召回排序自动兜底组卷。";

  return {
    summary: params.semanticQuery
      ? `已根据“${truncateText(params.semanticQuery, 64)}”自动兜底选择一组题目。`
      : "已按候选题相关度自动兜底选择一组题目。",
    selectionReasons: [fallbackReason],
    selectedExerciseIds,
    sections: selectedExerciseIds.length > 0
      ? [
          {
            title: "核心题组",
            rationale: fallbackReason,
            exerciseIds: selectedExerciseIds,
          },
        ]
      : [],
  };
}

async function curateWorksheetSelection(params: {
  candidates: CandidateExercise[];
  count: number;
  semanticQuery: string;
  seedExerciseId?: string;
  includeSeedExercise: boolean;
  requestedType?: string;
  requestedDifficulty?: number;
  requestedKnowledgeCluster?: string;
  requestedAssessmentStyle?: string;
  requestedHasFigure?: boolean;
}) {
  const exerciseIdSchema = z.string().uuid();
  const schema = z.object({
    summary: z.string().trim().min(8).max(480),
    selectionReasons: z.array(z.string().trim().min(4).max(220)).max(6).default([]),
    selectedExerciseIds: z
      .array(exerciseIdSchema)
      .min(1)
      .max(Math.max(1, params.count)),
    sections: z
      .array(
        z.object({
          title: z.string().trim().min(2).max(80),
          rationale: z.string().trim().min(4).max(220),
          exerciseIds: z.array(exerciseIdSchema).min(1).max(Math.max(1, params.count)),
        }),
      )
      .min(1)
      .max(6),
  });

  let result: z.infer<typeof schema>;
  try {
    result = await generateStructuredObject({
      model: getResolvedLanguageModelForTask("worksheet_curate"),
      schema,
      systemPrompt:
        "你是教师组卷助手。请根据语义相近度、知识点一致性、考察方式相近性，从候选题里挑出最适合组成一张练习卷的一组题。优先保证核心考察内容一致，再保留少量难度层次变化。输出必须严格遵守 schema，不要解释，不要输出 schema 之外的字段。",
      userPrompt: [
        `目标题量：${params.count}`,
        params.semanticQuery ? `教师检索目标：${params.semanticQuery}` : "",
        params.seedExerciseId
          ? `种子题要求：${params.includeSeedExercise ? `必须包含 ${params.seedExerciseId}` : `可参考 ${params.seedExerciseId}`}`
          : "",
        params.requestedType ? `题型约束：${params.requestedType}` : "",
        typeof params.requestedDifficulty === "number"
          ? `难度约束：${params.requestedDifficulty}`
          : "",
        params.requestedKnowledgeCluster ? `知识大类约束：${params.requestedKnowledgeCluster}` : "",
        params.requestedAssessmentStyle ? `考察方式约束：${params.requestedAssessmentStyle}` : "",
        typeof params.requestedHasFigure === "boolean"
          ? `题图约束：${params.requestedHasFigure ? "优先带图题" : "优先无图题"}`
          : "",
        "",
        "候选题列表：",
        buildCandidateCatalog(params.candidates),
        "",
        "选择规则：",
        "1. 先看考察内容是否本质相同或高度相近，再看题型和难度。",
        "2. 允许同一考点下保留不同表达方式，但不要混入明显跑题的题。",
        "3. sections 需要按教学逻辑分组，例如“基础辨析 / 变式应用 / 综合提升”。",
        "4. selectedExerciseIds 与 sections.exerciseIds 只能从候选题 id 中选。",
        "5. 如果存在明确结构化约束，不能为追求相似度而违反题型、难度或考察方式要求。",
      ]
        .filter(Boolean)
        .join("\n"),
      temperature: 0.2,
      maxTokens: 1000,
      maxRetries: 2,
    });
  } catch (error) {
    return buildFallbackWorksheetSelection({
      candidates: params.candidates,
      count: params.count,
      semanticQuery: params.semanticQuery,
      seedExerciseId: params.seedExerciseId,
      includeSeedExercise: params.includeSeedExercise,
      reason: error instanceof Error ? error.message : undefined,
    });
  }

  const selectedExerciseIds = sanitizeSelection({
    selectedExerciseIds: result.selectedExerciseIds,
    candidates: params.candidates,
    count: params.count,
    seedExerciseId: params.seedExerciseId,
    includeSeedExercise: params.includeSeedExercise,
  });
  const sections = sanitizeSections({
    sections: result.sections,
    selectedExerciseIds,
  });

  if (selectedExerciseIds.length === 0 || sections.length === 0) {
    return buildFallbackWorksheetSelection({
      candidates: params.candidates,
      count: params.count,
      semanticQuery: params.semanticQuery,
      seedExerciseId: params.seedExerciseId,
      includeSeedExercise: params.includeSeedExercise,
      reason: "模型未返回可用题组，已按召回结果自动兜底。",
    });
  }

  return {
    summary: cleanText(result.summary) || "按相似考察内容自动整理了一组题。",
    selectionReasons: result.selectionReasons.map((reason) => cleanText(reason)).filter(Boolean),
    selectedExerciseIds,
    sections,
  };
}

async function insertWorksheet(params: {
  supabase: AppSupabase;
  teacherId: string;
  courseId?: string;
  unitId?: string;
  title: string;
  description?: string;
  exerciseIds: string[];
}) {
  // 如果没有 courseId，查找通用课程作为 fallback
  let resolvedCourseId = params.courseId;
  if (!resolvedCourseId) {
    const { data: genericCourse } = await params.supabase
      .from("courses")
      .select("id")
      .eq("code", "GENERAL_UNCLASSIFIED")
      .maybeSingle();
    resolvedCourseId = genericCourse?.id;
  }

  const insertPayload: Database["public"]["Tables"]["worksheets"]["Insert"] = {
    teacher_id: params.teacherId,
    course_id: resolvedCourseId ?? params.teacherId,
    unit_id: params.unitId ?? null,
    title: params.title,
    description: cleanText(params.description) || null,
    layout_config: DEFAULT_WORKSHEET_LAYOUT_CONFIG as unknown as Json,
    status: "draft",
  };

  const { data, error } = await params.supabase
    .from("worksheets")
    .insert(insertPayload)
    .select(WORKSHEET_SELECT)
    .maybeSingle();

  if (error || !data) {
    throw new Error("创建自动组卷失败");
  }

  const worksheet = data as unknown as WorksheetRow;
  const exerciseRows: Database["public"]["Tables"]["worksheet_exercises"]["Insert"][] =
    params.exerciseIds.map((exerciseId, index) => ({
      worksheet_id: worksheet.id,
      exercise_id: exerciseId,
      sort_order: index,
      points: null,
    }));

  const { error: insertError } = await params.supabase
    .from("worksheet_exercises")
    .insert(exerciseRows);

  if (insertError) {
    await params.supabase.from("worksheets").delete().eq("id", worksheet.id);
    throw new Error("写入练习卷题目失败");
  }

  return worksheet;
}

function toAssembledExercise(item: CandidateExercise): AssembledWorksheetExercise {
  return {
    id: item.id,
    exerciseType: item.type,
    difficulty: item.difficulty,
    questionText: item.questionText,
    options: item.options.length > 0 ? item.options : null,
    correctAnswer: item.correctAnswer,
    solutionSteps: item.solutionSteps,
    knowledgeCluster: item.knowledgeCluster,
    knowledgeSubskillLabel: item.knowledgeSubskillLabel,
    assessmentStyle: item.assessmentStyle,
    sourceFileName: item.sourceFileName,
    semanticScore: item.semanticScore,
  };
}

export async function assembleWorksheetFromSemanticSearch(
  input: AssembleWorksheetInput,
): Promise<AssembleWorksheetResult> {
  const seedExercise = input.seedExerciseId
    ? await loadExerciseById({
        supabase: input.supabase,
        teacherId: input.teacherId,
        exerciseId: input.seedExerciseId,
      })
    : null;

  if (input.seedExerciseId && !seedExercise) {
    throw new Error("种子题不存在或无权限访问");
  }

  if (seedExercise && seedExercise.courseId !== input.courseId) {
    throw new Error("种子题不属于当前课程");
  }

  if (seedExercise && input.unitId && seedExercise.unitId !== input.unitId) {
    throw new Error("种子题不属于当前单元");
  }

  const semanticQuery = buildSemanticQuery({
    query: input.query,
    seedExercise,
  });
  const explicitSourceFileNames = extractExplicitSourceFileNames(semanticQuery);

  const candidates = await loadCandidateExercises({
    supabase: input.supabase,
    teacherId: input.teacherId,
    courseId: input.courseId,
    unitId: input.unitId,
    semanticQuery,
    seedExercise,
    includeSeedExercise: input.includeSeedExercise !== false,
    maxCandidates: input.maxCandidates,
    type: input.type,
    difficulty: input.difficulty,
    knowledgeCluster: input.knowledgeCluster,
    assessmentStyle: input.assessmentStyle,
    clusterNodeId: input.clusterNodeId,
    subskillNodeId: input.subskillNodeId,
    hasFigure: input.hasFigure,
  });

  if (candidates.length === 0) {
    throw new Error("没有找到可用于组卷的候选题");
  }

  const curated = await curateWorksheetSelection({
    candidates,
    count: input.count,
    semanticQuery,
    seedExerciseId: input.seedExerciseId,
    includeSeedExercise: input.includeSeedExercise !== false,
    requestedType: input.type,
    requestedDifficulty: input.difficulty,
    requestedKnowledgeCluster: input.knowledgeCluster,
    requestedAssessmentStyle: input.assessmentStyle,
    requestedHasFigure: input.hasFigure,
  });

  if (curated.selectedExerciseIds.length === 0) {
    throw new Error("模型未挑出可用题目");
  }

  const worksheet = await insertWorksheet({
    supabase: input.supabase,
    teacherId: input.teacherId,
    courseId: input.courseId,
    unitId: input.unitId,
    title: input.title,
    description: cleanText(input.description) || curated.summary,
    exerciseIds: curated.selectedExerciseIds,
  });

  const candidateMap = new Map(candidates.map((item) => [item.id, item]));
  const selectedExercises = curated.selectedExerciseIds
    .map((exerciseId) => candidateMap.get(exerciseId))
    .filter((item): item is CandidateExercise => Boolean(item))
    .map(toAssembledExercise);
  const shortageReason =
    selectedExercises.length < input.count
      ? explicitSourceFileNames.length > 0
        ? `指定题源仅匹配到 ${selectedExercises.length} 道题，本次未混入其他来源。`
        : `当前只找到 ${selectedExercises.length} 道符合条件的现成题，本次未强行补齐。`
      : "";
  const summary = shortageReason
    ? explicitSourceFileNames.length > 0
      ? `${shortageReason} 已按同一来源文件完成组卷与分组。`
      : `${shortageReason} 已按当前候选题完成组卷与分组。`
    : curated.summary;
  const selectionReasons = shortageReason
    ? [shortageReason, ...curated.selectionReasons].slice(0, 6)
    : curated.selectionReasons;

  return {
    worksheet: {
      id: worksheet.id,
      teacherId: worksheet.teacher_id,
      courseId: worksheet.course_id,
      unitId: worksheet.unit_id,
      title: worksheet.title,
      description: worksheet.description,
      layoutConfig: worksheet.layout_config,
      status: worksheet.status,
      pdfUrl: worksheet.pdf_url,
      createdAt: worksheet.created_at,
      updatedAt: worksheet.updated_at,
    },
    exercises: selectedExercises,
    sections: curated.sections,
    summary,
    selectionReasons,
    semanticQuery,
    candidateCount: candidates.length,
  };
}
