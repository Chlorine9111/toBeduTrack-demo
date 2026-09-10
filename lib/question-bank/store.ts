import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  buildExerciseContentFromLegacy,
  buildExerciseTitleFromContent,
  deriveLegacyExerciseFieldsFromContent,
  normalizeExerciseContent,
  readExerciseContent,
} from "@/lib/exercises/content";
import {
  toExerciseDifficulty,
  type ExerciseAssessmentStyle,
  type ExerciseClassificationStatus,
  type Exercise,
  type ExerciseKnowledgeCluster,
  type ExerciseSourceKind,
  type ExerciseSourceReviewStatus,
  type ExerciseSubskillMatchMode,
} from "@/types/exercise";
import type {
  QuestionBankMaterialItem,
  QuestionBankQuestionDetail,
  QuestionBankQuestionListItem,
} from "@/lib/question-bank/types";
import { KNOWLEDGE_DOCUMENT_UPLOAD_LINK_PREFIX } from "@/lib/question-bank/knowledge-auto-import";
import { readStoredPageImageUrl } from "@/lib/pdf-scan/page-images";
import {
  classifyExerciseTaxonomySync,
  getAssessmentStyleLabel,
  getKnowledgeClusterLabel,
} from "@/lib/question-bank/taxonomy";
import {
  searchExerciseSemanticHits,
} from "@/lib/question-bank/semantic-index";
import { getSubskillLabel } from "@/lib/question-bank/subskills";
export {
  syncExerciseSemanticIndexRows,
  removeExerciseSemanticIndexRows,
} from "@/lib/question-bank/semantic-index";

type AppSupabase = SupabaseClient<Database>;

type QuestionBankClient = {
  teacherId: string;
  supabase: AppSupabase;
};

type CourseMeta = { id: string; name: string; code: string };
type UnitMeta = { id: string; unit_number: number | string; title: string };
type ImportBatchMeta = { id: string; label: string; source_kind: string; status: string };

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"] & {
  course?: CourseMeta | CourseMeta[] | null;
  unit?: UnitMeta | UnitMeta[] | null;
  importBatch?: ImportBatchMeta | ImportBatchMeta[] | null;
  clusterNode?:
    | { id: string; canonical_label: string; status: string }
    | Array<{ id: string; canonical_label: string; status: string }>
    | null;
  subskillNode?:
    | { id: string; canonical_key: string; canonical_label: string; status: string }
    | Array<{ id: string; canonical_key: string; canonical_label: string; status: string }>
    | null;
};

type KnowledgeDocumentRow = Database["public"]["Tables"]["knowledge_documents"]["Row"];
type PdfScanUploadRow = Database["public"]["Tables"]["pdf_scan_uploads"]["Row"];
type ExerciseImportBatchRow = Database["public"]["Tables"]["exercise_import_batches"]["Row"];

const KNOWLEDGE_DOCUMENT_SELECT = [
  "chunk_count",
  "id",
  "teacher_id",
  "filename",
  "file_type",
  "file_size",
  "full_text_length",
  "ocr_provider",
  "subject",
  "supermemory_ids",
  "unit",
  "tags",
  "supermemory_id",
  "storage_path",
  "status",
  "summary",
  "metadata",
  "created_at",
  "updated_at",
].join(",");

const PDF_SCAN_UPLOAD_SELECT = [
  "id",
  "teacher_id",
  "file_name",
  "file_url",
  "storage_path",
  "file_size",
  "page_count",
  "status",
  "mathpix_id",
  "question_count",
  "scan_result",
  "error_message",
  "processing_time_ms",
  "created_at",
  "updated_at",
].join(",");

const EXERCISE_IMPORT_BATCH_SELECT = [
  "id",
  "teacher_id",
  "source_kind",
  "label",
  "status",
  "source_document_id",
  "source_upload_id",
  "total_detected",
  "total_saved",
  "metadata",
  "created_at",
  "updated_at",
].join(",");

// 精简列表查询 — 去掉列表不需要的 clusterNode JOIN（仅详情页使用）
const QUESTION_BANK_LIST_SELECT_BASE = `
  id,teacher_id,exercise_type,difficulty,
  knowledge_cluster,knowledge_subskill_key,knowledge_subskill_label,
  knowledge_tags,assessment_style,assessment_tags,
  classification_confidence,classification_status,
  subskill_confidence,subskill_match_mode,
  source_kind,source_file_name,source_page_start,source_page_end,
  source_confidence,source_review_status,
  import_batch_id,similarity_fingerprint,
  verification_status,
  knowledge_cluster_node_id,knowledge_subskill_node_id,
  classification_reasons,subskill_reasons,classification_updated_by_teacher,
  created_at,updated_at,
  course_id,unit_id,question_text,
  course:courses(id,name,code),
  unit:units(id,unit_number,title),
  importBatch:exercise_import_batches(id,label,source_kind,status),
  subskillNode:question_taxonomy_nodes!exercises_knowledge_subskill_node_id_fkey(id,canonical_key,canonical_label,status)
`;

const QUESTION_BANK_LIST_SELECT = `
  ${QUESTION_BANK_LIST_SELECT_BASE.slice(0, QUESTION_BANK_LIST_SELECT_BASE.indexOf("knowledge_cluster"))}
  content_json,
  ${QUESTION_BANK_LIST_SELECT_BASE.slice(QUESTION_BANK_LIST_SELECT_BASE.indexOf("knowledge_cluster"))}
`;

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function isMissingContentJsonColumnError(
  error: { code?: string | null; message?: string | null } | null | undefined,
) {
  return error?.code === "42703" && /content_json/i.test(error.message ?? "");
}

function coerceExerciseRows(data: unknown) {
  return (data ?? []) as unknown as ExerciseRow[];
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function formatUnitLabel(unit: UnitMeta | null, fallback: string | null) {
  if (!unit) return fallback;
  const unitNumber = `${unit.unit_number}`.trim();
  return unitNumber ? `Unit ${unitNumber} · ${unit.title}` : unit.title;
}

function buildQuestionTitle(text: string) {
  const normalized = cleanText(text);
  if (!normalized) return "未命名题目";
  return normalized.length > 88 ? `${normalized.slice(0, 88)}…` : normalized;
}

function readExerciseContentSnapshot(row: ExerciseRow) {
  return normalizeExerciseContent(
    readExerciseContent(row.content_json) ??
      buildExerciseContentFromLegacy({
        type: row.exercise_type as Exercise["type"],
        questionText: row.question_text,
        options: row.options as Exercise["options"],
        correctAnswer: row.correct_answer,
        solutionSteps: row.solution_steps,
        commonMistakes: row.common_mistakes ?? [],
      }),
  );
}

function buildSourcePageLabel(pageStart: number | null, pageEnd: number | null) {
  if (pageStart == null && pageEnd == null) return null;
  if (pageStart != null && pageEnd != null && pageStart !== pageEnd) {
    return `第 ${pageStart}-${pageEnd} 页`;
  }
  const page = pageStart ?? pageEnd;
  return page != null ? `第 ${page} 页` : null;
}

function applyFilterEq<TQuery, TValue>(query: TQuery, column: string, value: TValue) {
  return (query as TQuery & {
    eq: (nextColumn: string, nextValue: TValue) => TQuery;
  }).eq(column, value);
}

function applyFilterOr<TQuery>(query: TQuery, filters: string) {
  return (query as TQuery & {
    or: (nextFilters: string) => TQuery;
  }).or(filters);
}

function applyFilterContains<TQuery>(query: TQuery, column: string, value: unknown[]) {
  return (query as TQuery & {
    contains: (nextColumn: string, nextValue: unknown) => TQuery;
  }).contains(column, value);
}

function mapExerciseRowToExercise(row: ExerciseRow): Exercise {
  const importBatch = pickFirst(row.importBatch);
  const sourceKind =
    (row.source_kind as ExerciseSourceKind | null) ?? "manual";
  const reviewStatus =
    (row.source_review_status as ExerciseSourceReviewStatus | null) ??
    "unreviewed";
  const taxonomy = resolveExerciseTaxonomy(row);
  const content = readExerciseContentSnapshot(row);
  const derived = deriveLegacyExerciseFieldsFromContent(content);
  return {
    id: row.id,
    teacherId: row.teacher_id,
    courseId: row.course_id,
    unitId: row.unit_id,
    topicId: row.topic_id,
    rubricId: row.rubric_id,
    type: row.exercise_type as Exercise["type"],
    difficulty: toExerciseDifficulty(row.difficulty),
    content,
    questionText: derived.questionText,
    options: derived.options,
    correctAnswer: derived.correctAnswer,
    solutionSteps: derived.solutionSteps,
    commonMistakes: derived.commonMistakes,
    verificationStatus: row.verification_status as Exercise["verificationStatus"],
    verificationAttempts: row.verification_attempts,
    isAiGenerated: row.is_ai_generated,
    teacherModified: row.teacher_modified,
    teacherPrompt: row.teacher_prompt ?? null,
    importBatchId: row.import_batch_id,
    importBatchLabel: importBatch?.label ?? null,
    source: {
      kind: sourceKind,
      documentId: row.source_document_id,
      uploadId: row.source_upload_id,
      fileName: row.source_file_name,
      pageStart: row.source_page_start,
      pageEnd: row.source_page_end,
      confidence: row.source_confidence,
      reviewStatus,
    },
    similarityFingerprint: row.similarity_fingerprint,
    knowledgeCluster: taxonomy.knowledgeCluster,
    knowledgeClusterNodeId: row.knowledge_cluster_node_id,
    knowledgeClusterStatus:
      (pickFirst(row.clusterNode)?.status as Exercise["knowledgeClusterStatus"]) ?? null,
    knowledgeSubskillNodeId: row.knowledge_subskill_node_id,
    knowledgeSubskillKey: taxonomy.knowledgeSubskillKey,
    knowledgeSubskillLabel: taxonomy.knowledgeSubskillLabel,
    knowledgeSubskillStatus:
      (pickFirst(row.subskillNode)?.status as Exercise["knowledgeSubskillStatus"]) ?? null,
    knowledgeTags: taxonomy.knowledgeTags,
    assessmentStyle: taxonomy.assessmentStyle,
    assessmentTags: taxonomy.assessmentTags,
    classificationConfidence: taxonomy.classificationConfidence,
    classificationStatus: taxonomy.classificationStatus,
    classificationReasons: taxonomy.classificationReasons,
    classificationUpdatedByTeacher: row.classification_updated_by_teacher,
    subskillConfidence: taxonomy.subskillConfidence,
    subskillMatchMode: taxonomy.subskillMatchMode,
    subskillReasons: taxonomy.subskillReasons,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapQuestionListItem(row: ExerciseRow, similarityCount: number): QuestionBankQuestionListItem {
  const course = pickFirst(row.course);
  const unit = pickFirst(row.unit);
  const importBatch = pickFirst(row.importBatch);
  const taxonomy = resolveExerciseTaxonomy(row);
  const content = readExerciseContentSnapshot(row);
  const derived = deriveLegacyExerciseFieldsFromContent(content);
  return {
    id: row.id,
    title: buildExerciseTitleFromContent(content),
    questionText: derived.questionText,
    type: row.exercise_type as Exercise["type"],
    difficulty: toExerciseDifficulty(row.difficulty),
    verificationStatus: row.verification_status as Exercise["verificationStatus"],
    courseId: row.course_id,
    unitId: row.unit_id,
    courseName: course?.name ?? null,
    unitName: formatUnitLabel(unit, null),
    sourceKind: row.source_kind as QuestionBankQuestionListItem["sourceKind"],
    sourceFileName: row.source_file_name,
    sourcePageLabel: buildSourcePageLabel(row.source_page_start, row.source_page_end),
    sourceReviewStatus: row.source_review_status,
    sourceConfidence: row.source_confidence,
    importBatchId: row.import_batch_id,
    importBatchLabel: importBatch?.label ?? null,
    similarityCount,
    knowledgeCluster: taxonomy.knowledgeCluster,
    knowledgeClusterLabel: getKnowledgeClusterLabel(taxonomy.knowledgeCluster),
    knowledgeSubskillNodeId: row.knowledge_subskill_node_id,
    knowledgeSubskillKey: taxonomy.knowledgeSubskillKey,
    knowledgeSubskillLabel: taxonomy.knowledgeSubskillLabel,
    knowledgeSubskillStatus:
      (pickFirst(row.subskillNode)?.status as Exercise["knowledgeSubskillStatus"]) ?? null,
    knowledgeTags: taxonomy.knowledgeTags,
    assessmentStyle: taxonomy.assessmentStyle,
    assessmentStyleLabel: getAssessmentStyleLabel(taxonomy.assessmentStyle),
    assessmentTags: taxonomy.assessmentTags,
    classificationConfidence: taxonomy.classificationConfidence,
    classificationStatus: taxonomy.classificationStatus,
    classificationReasons: taxonomy.classificationReasons,
    classificationUpdatedByTeacher: row.classification_updated_by_teacher,
    subskillConfidence: taxonomy.subskillConfidence,
    subskillMatchMode: taxonomy.subskillMatchMode,
    subskillReasons: taxonomy.subskillReasons,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function resolveExerciseTaxonomy(row: ExerciseRow) {
  const persistedCluster = (row.knowledge_cluster as ExerciseKnowledgeCluster | null | undefined) ?? null;
  const persistedSubskillKey =
    (row.knowledge_subskill_key as string | null | undefined) ?? null;
  const persistedSubskillLabel =
    (row.knowledge_subskill_label as string | null | undefined) ??
    getSubskillLabel(persistedCluster, persistedSubskillKey);
  const persistedTags = Array.isArray(row.knowledge_tags) ? row.knowledge_tags.filter(Boolean) : [];
  const persistedStyle = (row.assessment_style as ExerciseAssessmentStyle | null | undefined) ?? null;
  const persistedStyleTags = Array.isArray(row.assessment_tags) ? row.assessment_tags.filter(Boolean) : [];
  const persistedConfidence =
    typeof row.classification_confidence === "number" ? row.classification_confidence : null;
  const persistedStatus =
    (row.classification_status as ExerciseClassificationStatus | null | undefined) ?? null;
  const persistedReasons = Array.isArray(row.classification_reasons)
    ? row.classification_reasons.filter(Boolean)
    : [];
  const persistedSubskillConfidence =
    typeof row.subskill_confidence === "number" ? row.subskill_confidence : null;
  const persistedSubskillMode =
    (row.subskill_match_mode as ExerciseSubskillMatchMode | null | undefined) ?? null;
  const persistedSubskillReasons = Array.isArray(row.subskill_reasons)
    ? row.subskill_reasons.filter(Boolean)
    : [];

  if (persistedCluster || persistedStyle) {
    return {
      knowledgeCluster: persistedCluster,
      knowledgeSubskillKey: persistedSubskillKey,
      knowledgeSubskillLabel: persistedSubskillLabel,
      knowledgeTags: persistedTags,
      assessmentStyle: persistedStyle,
      assessmentTags: persistedStyleTags,
      classificationConfidence: persistedConfidence,
      classificationStatus: persistedStatus,
      classificationReasons: persistedReasons,
      subskillConfidence: persistedSubskillConfidence,
      subskillMatchMode: persistedSubskillMode,
      subskillReasons: persistedSubskillReasons,
    };
  }

  const fallback = classifyExerciseTaxonomySync({
    questionText: deriveLegacyExerciseFieldsFromContent(readExerciseContentSnapshot(row)).questionText,
    responseFormat: row.exercise_type as Exercise["type"],
    subjectHint: [pickFirst(row.course)?.name, pickFirst(row.unit)?.title, row.teacher_prompt]
      .filter(Boolean)
      .join(" "),
  });

  return {
    ...fallback,
    knowledgeSubskillKey: null,
    knowledgeSubskillLabel: null,
    subskillConfidence: null,
    subskillMatchMode: "needs_review" as const,
    subskillReasons: ["旧题还没有细分知识点分类，建议重新回填。"],
  };
}

async function loadSimilarityCounts(client: QuestionBankClient, fingerprints: string[]) {
  const uniqueFingerprints = Array.from(new Set(fingerprints.filter(Boolean)));
  if (uniqueFingerprints.length === 0) return new Map<string, number>();

  const { data, error } = await client.supabase
    .from("exercises")
    .select("similarity_fingerprint")
    .eq("teacher_id", client.teacherId)
    .in("similarity_fingerprint", uniqueFingerprints);

  if (error) {
    throw new Error("读取相似题统计失败");
  }

  const counts = new Map<string, number>();
  (data ?? []).forEach((row) => {
    if (!row.similarity_fingerprint) return;
    counts.set(row.similarity_fingerprint, (counts.get(row.similarity_fingerprint) ?? 0) + 1);
  });

  return counts;
}

function applyQuestionBankFilters<TQuery>(query: TQuery, options: {
  courseId?: string;
  unitId?: string;
  type?: Exercise["type"] | "all";
  difficulty?: Exercise["difficulty"];
  knowledgeCluster?: ExerciseKnowledgeCluster | "all";
  assessmentStyle?: ExerciseAssessmentStyle | "all";
  knowledgeTag?: string;
  assessmentTag?: string;
  sourceKind?: QuestionBankQuestionListItem["sourceKind"] | "all";
  reviewStatus?: "all" | "ready" | "review" | "critical" | "unreviewed";
}) {
  let next = query;
  if (options.courseId) next = applyFilterEq(next, "course_id", options.courseId);
  if (options.unitId) next = applyFilterEq(next, "unit_id", options.unitId);
  if (options.type && options.type !== "all") next = applyFilterEq(next, "exercise_type", options.type);
  if (typeof options.difficulty === "number") next = applyFilterEq(next, "difficulty", options.difficulty);
  if (options.knowledgeCluster && options.knowledgeCluster !== "all") {
    next = applyFilterEq(next, "knowledge_cluster", options.knowledgeCluster);
  }
  if (options.assessmentStyle && options.assessmentStyle !== "all") {
    next = applyFilterEq(next, "assessment_style", options.assessmentStyle);
  }
  if (options.knowledgeTag) {
    next = applyFilterContains(next, "knowledge_tags", [options.knowledgeTag]);
  }
  if (options.assessmentTag) {
    next = applyFilterContains(next, "assessment_tags", [options.assessmentTag]);
  }
  if (options.sourceKind && options.sourceKind !== "all") next = applyFilterEq(next, "source_kind", options.sourceKind);
  if (options.reviewStatus && options.reviewStatus !== "all") next = applyFilterEq(next, "source_review_status", options.reviewStatus);
  return next;
}

function applyQuestionKeywordSearch<TQuery>(query: TQuery, rawQuery: string) {
  const safe = cleanText(rawQuery)
    .replace(/,/g, " ")
    .replace(/\./g, " ");
  if (!safe) return query;
  return applyFilterOr(
    query,
    `question_text.ilike.%${safe}%,source_file_name.ilike.%${safe}%,teacher_prompt.ilike.%${safe}%,knowledge_subskill_label.ilike.%${safe}%`,
  );
}

export async function listQuestionBankQuestions(
  client: QuestionBankClient,
  options: {
    query?: string;
    courseId?: string;
    unitId?: string;
    type?: Exercise["type"] | "all";
    difficulty?: Exercise["difficulty"];
    knowledgeCluster?: ExerciseKnowledgeCluster | "all";
    assessmentStyle?: ExerciseAssessmentStyle | "all";
    knowledgeTag?: string;
    assessmentTag?: string;
    sourceKind?: QuestionBankQuestionListItem["sourceKind"] | "all";
    reviewStatus?: "all" | "ready" | "review" | "critical" | "unreviewed";
    limit?: number;
    offset?: number;
  } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const queryText = cleanText(options.query);
  let rows: ExerciseRow[] = [];
  let total = 0;

  const runListQuery = async (select: string) => {
    let query = client.supabase
      .from("exercises")
      .select(select, { count: "exact" })
      .eq("teacher_id", client.teacherId)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);
    query = applyQuestionBankFilters(query, options);
    return query;
  };

  const runDetailQuery = async (select: string, candidateIds: string[]) => {
    let detailQuery = client.supabase
      .from("exercises")
      .select(select)
      .eq("teacher_id", client.teacherId)
      .in("id", candidateIds);
    detailQuery = applyQuestionBankFilters(detailQuery, options);
    return detailQuery;
  };

  if (!queryText) {
    let { data, count, error } = await runListQuery(QUESTION_BANK_LIST_SELECT);
    if (isMissingContentJsonColumnError(error)) {
      ({ data, count, error } = await runListQuery(QUESTION_BANK_LIST_SELECT_BASE));
    }
    if (error) {
      throw new Error("读取题库列表失败");
    }
    rows = coerceExerciseRows(data);
    total = count ?? rows.length;
  } else {
    const candidateLimit = Math.min(Math.max((offset + limit) * 2, 80), 200);
    const [semanticHits, keywordRowsResult] = await Promise.all([
      searchExerciseSemanticHits({
        supabase: client.supabase,
        teacherId: client.teacherId,
        query: queryText,
        limit: candidateLimit,
        filters: {
          courseId: options.courseId,
          unitId: options.unitId,
          type: options.type && options.type !== "all" ? options.type : undefined,
          difficulty: typeof options.difficulty === "number" ? options.difficulty : undefined,
          knowledgeCluster:
            options.knowledgeCluster && options.knowledgeCluster !== "all"
              ? options.knowledgeCluster
              : undefined,
          assessmentStyle:
            options.assessmentStyle && options.assessmentStyle !== "all"
              ? options.assessmentStyle
              : undefined,
          knowledgeTag: options.knowledgeTag,
          assessmentTag: options.assessmentTag,
          sourceKind:
            options.sourceKind && options.sourceKind !== "all"
              ? options.sourceKind
              : undefined,
        },
      }).catch(() => []),
      (async () => {
        let keywordQuery = client.supabase
          .from("exercises")
          .select("id,updated_at")
          .eq("teacher_id", client.teacherId)
          .order("updated_at", { ascending: false })
          .limit(candidateLimit);
        keywordQuery = applyQuestionBankFilters(keywordQuery, options);
        keywordQuery = applyQuestionKeywordSearch(keywordQuery, queryText);
        return keywordQuery;
      })(),
    ]);

    if (keywordRowsResult.error) {
      throw new Error("读取题库检索候选失败");
    }

    const keywordRows = (keywordRowsResult.data ?? []) as Array<{ id: string; updated_at: string }>;
    const ranking = new Map<string, number>();

    semanticHits.forEach((hit, index) => {
      ranking.set(hit.exerciseId, Math.max(ranking.get(hit.exerciseId) ?? 0, 120 - index + hit.score * 100));
    });
    keywordRows.forEach((row, index) => {
      ranking.set(row.id, Math.max(ranking.get(row.id) ?? 0, 80 - index));
    });

    const candidateIds = Array.from(ranking.keys());
    if (candidateIds.length === 0) {
      return { items: [], total: 0 };
    }

    let { data, error } = await runDetailQuery(QUESTION_BANK_LIST_SELECT, candidateIds);
    if (isMissingContentJsonColumnError(error)) {
      ({ data, error } = await runDetailQuery(QUESTION_BANK_LIST_SELECT_BASE, candidateIds));
    }
    if (error) {
      throw new Error("读取题库列表失败");
    }

    rows = coerceExerciseRows(data).sort((left, right) => {
      const scoreDiff = (ranking.get(right.id) ?? 0) - (ranking.get(left.id) ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      return `${right.updated_at}`.localeCompare(`${left.updated_at}`);
    });
    total = rows.length;
    rows = rows.slice(offset, offset + limit);
  }

  const similarityCounts = await loadSimilarityCounts(
    client,
    rows.map((row) => row.similarity_fingerprint ?? "").filter(Boolean),
  );

  return {
    items: rows.map((row) =>
      mapQuestionListItem(row, similarityCounts.get(row.similarity_fingerprint ?? "") ?? 0),
    ),
    total,
  };
}

export async function getQuestionBankQuestionDetail(client: QuestionBankClient, questionId: string) {
  const { data, error } = await client.supabase
    .from("exercises")
    .select(
      `
        *,
        course:courses(id,name,code),
        unit:units(id,unit_number,title),
        importBatch:exercise_import_batches(id,label,source_kind,status),
        clusterNode:question_taxonomy_nodes!exercises_knowledge_cluster_node_id_fkey(id,canonical_label,status),
        subskillNode:question_taxonomy_nodes!exercises_knowledge_subskill_node_id_fkey(id,canonical_key,canonical_label,status)
      `,
    )
    .eq("id", questionId)
    .eq("teacher_id", client.teacherId)
    .maybeSingle();

  if (error) {
    throw new Error("读取题目详情失败");
  }
  if (!data) return null;

  const row = data as ExerciseRow;
  const similarityFingerprint = row.similarity_fingerprint;
  let similarItems: QuestionBankQuestionDetail["similarItems"] = [];
  let sourcePageImageUrl: string | null = null;

  if (row.source_kind === "pdf_scan" && row.source_upload_id) {
    const { data: uploadRow, error: uploadError } = await client.supabase
      .from("pdf_scan_uploads")
      .select("scan_result")
      .eq("id", row.source_upload_id)
      .eq("teacher_id", client.teacherId)
      .maybeSingle();

    if (uploadError) {
      throw new Error("读取 PDF 来源页截图失败");
    }

    sourcePageImageUrl = readStoredPageImageUrl(
      uploadRow?.scan_result ?? null,
      row.source_page_start,
    );
  }

  if (similarityFingerprint) {
    const { data: similarRows, error: similarError } = await client.supabase
      .from("exercises")
      .select("id,question_text,source_file_name,source_page_start,source_page_end,updated_at")
      .eq("teacher_id", client.teacherId)
      .eq("similarity_fingerprint", similarityFingerprint)
      .neq("id", questionId)
      .order("updated_at", { ascending: false })
      .limit(6);

    if (similarError) {
      throw new Error("读取相似题失败");
    }

    similarItems = (similarRows ?? []).map((item) => ({
      id: item.id,
      title: buildQuestionTitle(item.question_text),
      sourceFileName: item.source_file_name,
      sourcePageLabel: buildSourcePageLabel(item.source_page_start, item.source_page_end),
      updatedAt: item.updated_at,
    }));
  }

  return {
    ...mapQuestionListItem(row, similarItems.length + (similarityFingerprint ? 1 : 0)),
    exercise: mapExerciseRowToExercise(row),
    note: row.teacher_prompt,
    sourcePageImageUrl,
    similarItems,
  } satisfies QuestionBankQuestionDetail;
}

function mapKnowledgeDocumentToMaterialItem(
  row: KnowledgeDocumentRow,
  savedQuestionCount: number,
): QuestionBankMaterialItem {
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const questionBank =
    metadata.questionBank && typeof metadata.questionBank === "object" && !Array.isArray(metadata.questionBank)
      ? (metadata.questionBank as Record<string, unknown>)
      : {};
  const detectedQuestionCount =
    typeof questionBank.detectedQuestionCount === "number"
      ? questionBank.detectedQuestionCount
      : typeof questionBank.savedCount === "number"
        ? questionBank.savedCount
        : savedQuestionCount;

  return {
    id: row.id,
    materialType: "knowledge_document",
    title: row.filename,
    fileType: row.file_type,
    status: row.status,
    summary: row.summary,
    subject: row.subject,
    unit: row.unit,
    tags: row.tags ?? [],
    detectedQuestionCount,
    savedQuestionCount,
    questionBankStatus:
      typeof questionBank.status === "string" ? questionBank.status : null,
    questionBankMessage:
      typeof questionBank.message === "string"
        ? questionBank.message
        : typeof questionBank.reason === "string"
          ? questionBank.reason
          : null,
    importBatchId:
      typeof questionBank.importBatchId === "string" ? questionBank.importBatchId : null,
    importBatchLabel:
      typeof questionBank.importBatchLabel === "string"
        ? questionBank.importBatchLabel
        : null,
    linkedDocumentId: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapScanUploadToMaterialItem(
  row: PdfScanUploadRow,
  savedQuestionCount: number,
): QuestionBankMaterialItem {
  const linkedDocumentId =
    typeof row.file_url === "string" && row.file_url.startsWith(KNOWLEDGE_DOCUMENT_UPLOAD_LINK_PREFIX)
      ? row.file_url.slice(KNOWLEDGE_DOCUMENT_UPLOAD_LINK_PREFIX.length)
      : null;
  return {
    id: row.id,
    materialType: "pdf_scan_upload",
    title: row.file_name,
    fileType: "application/pdf",
    status: row.status,
    summary: typeof row.error_message === "string" && row.error_message ? row.error_message : null,
    subject: null,
    unit: null,
    tags: [],
    detectedQuestionCount: row.question_count ?? 0,
    savedQuestionCount,
    questionBankStatus: null,
    questionBankMessage: null,
    importBatchId: null,
    importBatchLabel: null,
    linkedDocumentId,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAgentGeneratedBatchToMaterialItem(
  row: ExerciseImportBatchRow,
): QuestionBankMaterialItem {
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const tags = Array.isArray(metadata.tags)
    ? metadata.tags.filter((item): item is string => typeof item === "string" && cleanText(item).length > 0)
    : [];

  return {
    id: row.id,
    materialType: "agent_generated_batch",
    title:
      typeof metadata.title === "string" && cleanText(metadata.title)
        ? metadata.title
        : row.label,
    fileType: "生成批次",
    status: row.status,
    summary:
      typeof metadata.summary === "string" && cleanText(metadata.summary)
        ? metadata.summary
        : typeof metadata.promptText === "string" && cleanText(metadata.promptText)
          ? metadata.promptText
          : null,
    subject:
      typeof metadata.courseLabel === "string" && cleanText(metadata.courseLabel)
        ? metadata.courseLabel
        : null,
    unit:
      typeof metadata.unitLabel === "string" && cleanText(metadata.unitLabel)
        ? metadata.unitLabel
        : null,
    tags,
    detectedQuestionCount:
      typeof metadata.detectedQuestionCount === "number"
        ? metadata.detectedQuestionCount
        : row.total_detected,
    savedQuestionCount:
      typeof metadata.savedCount === "number" ? metadata.savedCount : row.total_saved,
    questionBankStatus:
      row.status === "completed"
        ? "saved"
        : row.status === "processing" || row.status === "pending"
          ? "processing"
          : row.status === "failed"
            ? "failed"
            : null,
    questionBankMessage:
      typeof metadata.message === "string" && cleanText(metadata.message)
        ? metadata.message
        : "本批题目由 toBeduTrack 生成并已归档到题库。",
    importBatchId: row.id,
    importBatchLabel: row.label,
    linkedDocumentId: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function matchesAgentGeneratedBatchQuery(
  row: ExerciseImportBatchRow,
  queryText: string,
) {
  if (!queryText) return true;
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const tags = Array.isArray(metadata.tags)
    ? metadata.tags.filter((item): item is string => typeof item === "string")
    : [];
  const haystack = [
    row.label,
    typeof metadata.title === "string" ? metadata.title : null,
    typeof metadata.summary === "string" ? metadata.summary : null,
    typeof metadata.promptText === "string" ? metadata.promptText : null,
    typeof metadata.courseLabel === "string" ? metadata.courseLabel : null,
    typeof metadata.unitLabel === "string" ? metadata.unitLabel : null,
    typeof metadata.topicLabel === "string" ? metadata.topicLabel : null,
    ...tags,
  ]
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(queryText.toLowerCase());
}

export async function listQuestionBankMaterials(
  client: QuestionBankClient,
  options: {
    query?: string;
    limit?: number;
  } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 300);
  const queryText = cleanText(options.query);

  let documentQuery = client.supabase
    .from("knowledge_documents")
    .select(KNOWLEDGE_DOCUMENT_SELECT)
    .eq("teacher_id", client.teacherId)
    .order("created_at", { ascending: false })
    .limit(limit);

  let scanQuery = client.supabase
    .from("pdf_scan_uploads")
    .select(PDF_SCAN_UPLOAD_SELECT)
    .eq("teacher_id", client.teacherId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const batchQuery = client.supabase
    .from("exercise_import_batches")
    .select(EXERCISE_IMPORT_BATCH_SELECT)
    .eq("teacher_id", client.teacherId)
    .eq("source_kind", "agent_generated")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (queryText) {
    documentQuery = documentQuery.or(`filename.ilike.%${queryText}%,summary.ilike.%${queryText}%`);
    scanQuery = scanQuery.ilike("file_name", `%${queryText}%`);
  }

  const [
    { data: docs, error: docError },
    { data: scans, error: scanError },
    { data: batches, error: batchError },
  ] = await Promise.all([
    documentQuery,
    scanQuery,
    batchQuery,
  ]);

  if (docError) throw new Error("读取资料库文档失败");
  if (scanError) throw new Error("读取拆题资料失败");
  if (batchError) throw new Error("读取 AI 生成资料失败");

  const knowledgeRows = (docs ?? []) as unknown as KnowledgeDocumentRow[];
  const scanRows = (scans ?? []) as unknown as PdfScanUploadRow[];
  const batchRows = ((batches ?? []) as unknown as ExerciseImportBatchRow[]).filter((row) =>
    matchesAgentGeneratedBatchQuery(row, queryText),
  );
  const documentIds = knowledgeRows.map((item) => item.id);
  const scanIds = scanRows.map((item) => item.id);

  const docCounts = new Map<string, number>();
  const scanCounts = new Map<string, number>();

  if (documentIds.length > 0) {
    const { data, error } = await client.supabase
      .from("exercises")
      .select("id,source_document_id")
      .eq("teacher_id", client.teacherId)
      .in("source_document_id", documentIds);
    if (error) throw new Error("读取资料题目统计失败");
    (data ?? []).forEach((row) => {
      if (!row.source_document_id) return;
      docCounts.set(row.source_document_id, (docCounts.get(row.source_document_id) ?? 0) + 1);
    });
  }

  if (scanIds.length > 0) {
    const { data, error } = await client.supabase
      .from("exercises")
      .select("id,source_upload_id")
      .eq("teacher_id", client.teacherId)
      .in("source_upload_id", scanIds);
    if (error) throw new Error("读取拆题题目统计失败");
    (data ?? []).forEach((row) => {
      if (!row.source_upload_id) return;
      scanCounts.set(row.source_upload_id, (scanCounts.get(row.source_upload_id) ?? 0) + 1);
    });
  }

  const items: QuestionBankMaterialItem[] = [
    ...knowledgeRows.map((row) =>
      mapKnowledgeDocumentToMaterialItem(row, docCounts.get(row.id) ?? 0),
    ),
    ...scanRows.map((row) =>
      mapScanUploadToMaterialItem(row, scanCounts.get(row.id) ?? 0),
    ),
    ...batchRows.map((row) => mapAgentGeneratedBatchToMaterialItem(row)),
  ]
    .filter((item) => item.materialType !== "pdf_scan_upload" || !item.linkedDocumentId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return items.slice(0, limit);
}

export async function createExerciseImportBatch(
  client: QuestionBankClient,
  input: {
    sourceKind: "pdf_scan" | "knowledge_document" | "agent_generated" | "manual";
    label: string;
    status?: "pending" | "processing" | "completed" | "failed";
    sourceDocumentId?: string | null;
    sourceUploadId?: string | null;
    totalDetected?: number;
    totalSaved?: number;
    metadata?: Record<string, unknown>;
  },
) : Promise<Database["public"]["Tables"]["exercise_import_batches"]["Row"]> {
  const { data, error } = await client.supabase
    .from("exercise_import_batches")
    .insert({
      teacher_id: client.teacherId,
      source_kind: input.sourceKind,
      label: cleanText(input.label) || "未命名批次",
      status: input.status ?? "completed",
      source_document_id: input.sourceDocumentId ?? null,
      source_upload_id: input.sourceUploadId ?? null,
      total_detected: input.totalDetected ?? 0,
      total_saved: input.totalSaved ?? 0,
      metadata: (input.metadata ?? {}) as Database["public"]["Tables"]["exercise_import_batches"]["Insert"]["metadata"],
    })
    .select(EXERCISE_IMPORT_BATCH_SELECT)
    .single();

  if (error || !data) {
    throw new Error("创建题目导入批次失败");
  }

  return data as unknown as Database["public"]["Tables"]["exercise_import_batches"]["Row"];
}

export async function updateExerciseImportBatch(
  client: QuestionBankClient,
  batchId: string,
  patch: {
    label?: string;
    status?: "pending" | "processing" | "completed" | "failed";
    totalDetected?: number;
    totalSaved?: number;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await client.supabase
    .from("exercise_import_batches")
    .update({
      label: patch.label,
      status: patch.status,
      total_detected: patch.totalDetected,
      total_saved: patch.totalSaved,
      metadata: patch.metadata as Database["public"]["Tables"]["exercise_import_batches"]["Update"]["metadata"],
    })
    .eq("id", batchId)
    .eq("teacher_id", client.teacherId);

  if (error) {
    throw new Error("更新题目导入批次失败");
  }
}
