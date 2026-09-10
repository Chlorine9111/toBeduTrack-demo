import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  formatIntentUnitName,
  inferCurriculumContext,
} from "@/lib/chat/curriculum-context";
import {
  GENERIC_COURSE_CODE,
  readCourseFallbackUnitBucket,
  readGenericCurriculumBucket,
  readUnitFallbackTopicBucket,
} from "@/lib/curriculum/generic";
import { normalizeSubskillConfidence } from "@/lib/exercises/confidence";
import {
  buildExerciseContentFromLegacy,
  deriveLegacyExerciseFieldsFromContent,
  normalizeExerciseContent,
  normalizeExerciseContentForStorage,
} from "@/lib/exercises/content";
import { buildExerciseSimilarityFingerprint } from "@/lib/question-bank/fingerprint";
import { syncExerciseSemanticIndexRows } from "@/lib/question-bank/semantic-index";
import {
  createExerciseImportBatch,
  updateExerciseImportBatch,
} from "@/lib/question-bank/store";
import { classifyExerciseTaxonomy } from "@/lib/question-bank/taxonomy";
import {
  classifyDocumentSubject,
  matchDocumentSubjectCourse,
} from "@/lib/pdf-scan/classify-document-subject";
import { assessScannedQuestionForReview } from "@/lib/pdf-scan/review";
import { createLogger } from "@/lib/logger";
import type { Database, Json } from "@/types/database";

const logger = createLogger("save-to-library");

type AppSupabase = SupabaseClient<Database>;

const optionMapSchema = z
  .record(z.string(), z.string().optional())
  .nullable()
  .optional();

const confidenceSignalSchema = z.object({
  score: z.number().optional().default(0),
  reasons: z.array(z.string()).optional().default([]),
});

const scannedQuestionSchema = z.object({
  questionNumber: z.union([z.number(), z.string()]).optional(),
  content: z.string().optional().default(""),
  questionType: z.string().optional().default("essay"),
  difficulty: z
    .enum(["easy", "medium", "hard", "expert"])
    .optional()
    .default("medium"),
  subject: z.string().optional().default(""),
  knowledgePoint: z.string().optional().default(""),
  options: optionMapSchema,
  correctAnswer: z.string().optional().default(""),
  solutionSteps: z.string().optional().default(""),
  confidence: z.number().optional().default(0),
  confidenceSignals: z
    .object({
      questionNumbering: confidenceSignalSchema.optional().default({
        score: 0,
        reasons: [],
      }),
      contentCompleteness: confidenceSignalSchema.optional().default({
        score: 0,
        reasons: [],
      }),
      optionIntegrity: confidenceSignalSchema.optional().default({
        score: 0,
        reasons: [],
      }),
      visionAgreement: confidenceSignalSchema.optional().default({
        score: 0,
        reasons: [],
      }),
    })
    .optional(),
  rawQuestionNumber: z.string().optional(),
  subQuestions: z
    .array(
      z.object({
        label: z.string().optional().default(""),
        content: z.string().optional().default(""),
      }),
    )
    .optional()
    .default([]),
  linkedFigures: z.array(z.string()).optional().default([]),
  sourceType: z.string().optional(),
  sourcePageNumber: z.number().int().positive().optional().nullable(),
});

const storedSaveSummarySchema = z.object({
  status: z.literal("saved"),
  savedCount: z.number().int().min(0),
  exerciseIds: z.array(z.string().uuid()).default([]),
  savedQuestionNumbers: z.array(z.number().int().positive()).default([]),
  reviewPendingQuestionNumbers: z.array(z.number().int().positive()).default([]),
  importBatchId: z.string().uuid().nullable().optional().default(null),
  importBatchLabel: z.string().nullable().optional().default(null),
  courseId: z.string().uuid(),
  courseLabel: z.string().nullable().optional().default(null),
  unitId: z.string().uuid().nullable().optional().default(null),
  unitLabel: z.string().nullable().optional().default(null),
  topicId: z.string().uuid().nullable().optional().default(null),
  savedAt: z.string(),
});

const storedScanResultSchema = z.object({
  questions: z.array(scannedQuestionSchema).optional().default([]),
  textPreview: z.string().optional().default(""),
  saveSummary: storedSaveSummarySchema.nullable().optional(),
});

type StoredScannedQuestion = z.infer<typeof scannedQuestionSchema>;

export type ScanLibrarySaveStatus =
  | "saved"
  | "already_saved"
  | "requires_review"
  | "requires_curriculum"
  | "no_questions"
  | "failed";

export type ScanLibrarySaveFileResult = {
  uploadId: string;
  fileName: string;
  status: ScanLibrarySaveStatus;
  savedCount: number;
  exerciseIds: string[];
  importBatchId: string | null;
  importBatchLabel: string | null;
  courseId: string | null;
  courseLabel: string | null;
  unitId: string | null;
  unitLabel: string | null;
  topicId: string | null;
  message: string;
  reviewPendingCount: number;
};

export type SaveScannedUploadsResult = {
  files: ScanLibrarySaveFileResult[];
  totalSaved: number;
};

type SaveSingleUploadParams = {
  supabase: AppSupabase;
  teacherId: string;
  uploadId: string;
  explicitCourseId?: string | null;
  explicitUnitId?: string | null;
  explicitTopicId?: string | null;
  curriculumHint?: string | null;
  includeLowConfidence?: boolean;
  sourceDocumentId?: string | null;
  sourceKind?: "pdf_scan" | "knowledge_document";
};

type QuickExerciseTaxonomyResult = Awaited<
  ReturnType<typeof classifyExerciseTaxonomy>
> & {
  knowledgeSubskillKey: string | null;
  knowledgeSubskillLabel: string | null;
  subskillConfidence: number | null;
  subskillMatchMode: Database["public"]["Tables"]["exercises"]["Row"]["subskill_match_mode"];
  subskillReasons: string[];
};

type ResolvedCurriculum = {
  courseId: string;
  courseLabel: string;
  unitId: string | null;
  unitLabel: string | null;
  topicId: string | null;
  topicLabel: string | null;
  isGenericCourse: boolean;
};

async function readResolvedGenericCurriculum(supabase: AppSupabase): Promise<ResolvedCurriculum | null> {
  const bucket = await readGenericCurriculumBucket(supabase);
  if (!bucket) return null;
  return {
    ...bucket,
    isGenericCourse: true,
  };
}

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function normalizeDifficulty(
  value: StoredScannedQuestion["difficulty"] | string | undefined,
): 1 | 2 | 3 | 4 {
  switch (`${value ?? ""}`.toLowerCase()) {
    case "easy":
      return 1;
    case "hard":
      return 3;
    case "expert":
      return 4;
    case "medium":
    default:
      return 2;
  }
}

export function buildRenderableFigureMarkdown(figures: string[] | undefined) {
  const normalized = Array.from(
    new Set(
      (figures ?? [])
        .map((item) => cleanText(item))
        .filter((item) => /^(https?:\/\/|\/)/i.test(item)),
    ),
  );

  if (normalized.length === 0) return "";

  if (normalized.length === 1) {
    return `![题目附图](${normalized[0]})`;
  }

  return normalized
    .map((figure, index) => `![题目附图 ${index + 1}](${figure})`)
    .join("\n\n");
}

async function classifyExerciseTaxonomyQuickBatch(params: {
  items: Array<{
    questionText: string;
    responseFormat: "MC" | "FR";
    optionsText: string;
    sourceKnowledgePoint: string | null | undefined;
    subjectHint: string | null | undefined;
  }>;
}) {
  const limit = 5;
  const results: QuickExerciseTaxonomyResult[] = new Array(params.items.length);

  for (let start = 0; start < params.items.length; start += limit) {
    const batch = params.items.slice(start, start + limit);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        try {
          const taxonomy = await classifyExerciseTaxonomy({
            questionText: item.questionText,
            responseFormat: item.responseFormat,
            optionsText: item.optionsText,
            sourceKnowledgePoint: item.sourceKnowledgePoint,
            subjectHint: item.subjectHint,
          });

          return {
            ...taxonomy,
            knowledgeSubskillKey: taxonomy.knowledgeSubskillKey ?? null,
            knowledgeSubskillLabel: taxonomy.knowledgeSubskillLabel ?? null,
            subskillConfidence: taxonomy.classificationConfidence,
            subskillMatchMode: taxonomy.knowledgeSubskillLabel ? "candidate_new" as const : "needs_review" as const,
            subskillReasons: taxonomy.knowledgeSubskillLabel
              ? [`Haiku 三层分类：${taxonomy.knowledgeCluster} → ${taxonomy.knowledgeSubskillKey} → ${taxonomy.knowledgeSubskillLabel}`]
              : ["快速入库路径暂未做细分知识点扩展分类。"],
          } satisfies QuickExerciseTaxonomyResult;
        } catch {
          return {
            knowledgeCluster: "general",
            knowledgeSubskillKey: null,
            knowledgeSubskillLabel: null,
            knowledgeTags: ["general"],
            assessmentStyle: "mixed",
            assessmentTags: ["mixed"],
            classificationConfidence: 10,
            classificationStatus: "needs_review" as const,
            classificationReasons: ["分类 API 调用失败，已标记待复核"],
            subskillConfidence: null,
            subskillMatchMode: "needs_review" as const,
            subskillReasons: ["分类 API 调用失败"],
          } satisfies QuickExerciseTaxonomyResult;
        }
      }),
    );

    batchResults.forEach((item, index) => {
      results[start + index] = item;
    });
  }

  return results;
}

function normalizeOptions(
  raw: Record<string, string | undefined> | null | undefined,
) {
  if (!raw) return null;

  const entries = Object.entries(raw)
    .map(([label, text]) => ({
      label: label.trim().toUpperCase(),
      text: cleanText(text),
      isCorrect: false,
    }))
    .filter((item) => item.label && item.text);

  return entries.length > 0 ? entries : null;
}

function formatOptionsText(
  options:
    | Array<{ label: string; text: string; isCorrect: boolean }>
    | null
    | undefined,
) {
  if (!options || options.length === 0) return "";
  return options.map((item) => `${item.label}. ${item.text}`).join("\n");
}

function buildQuestionText(question: StoredScannedQuestion) {
  const stem = cleanText(question.content);
  const figureMarkdown = buildRenderableFigureMarkdown(question.linkedFigures);

  return [stem, figureMarkdown].filter(Boolean).join("\n\n").trim();
}

export function resolveExerciseType(question: StoredScannedQuestion) {
  if (question.options && Object.keys(question.options).length >= 2) return "MC" as const;
  if (question.questionType === "choice") return "MC" as const;
  if (question.questionType === "fill") return "fill_in" as const;
  return "FR" as const;
}

function buildPlaceholderSolution(fileName: string, questionNumber: number) {
  return [
    `该题由 PDF 拆题导入（来源：${fileName}，题号 ${questionNumber}）。`,
    "当前仅保存原始题干与选项，答案与解析尚未自动识别，请在使用前补充或继续让 AI 生成。",
  ].join("\n");
}

function buildQuestionSample(questions: StoredScannedQuestion[]) {
  return questions
    .slice(0, 8)
    .map((question, index) => {
      const line = [question.content, question.knowledgePoint].filter(Boolean).join(" ");
      return line ? `${index + 1}. ${line}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

export function inferScopedUnitFromHint(params: {
  hintText: string;
  course: { id: string; name: string; code: string | null };
  units: Array<{
    id: string;
    course_id: string;
    unit_number: string | number | null;
    title: string;
  }>;
}) {
  if (!cleanText(params.hintText)) return null;
  if (!params.units.length) return null;

  const inferred = inferCurriculumContext({
    message: [params.course.name, params.course.code ?? "", params.hintText]
      .filter(Boolean)
      .join("\n"),
    courses: [
      {
        id: params.course.id,
        name: params.course.name,
        code: params.course.code ?? "",
      },
    ],
    units: params.units.map((unit) => ({
      id: unit.id,
      courseId: unit.course_id,
      unitNumber: `${unit.unit_number ?? ""}`,
      title: unit.title,
    })),
  });

  if (!inferred.unitId || !inferred.unitName) {
    return null;
  }

  return {
    unitId: inferred.unitId,
    unitLabel: inferred.unitName,
  };
}

function toJsonRecord(value: Json | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, Json>;
}

function parseStoredScanResult(value: Json | null | undefined) {
  const parsed = storedScanResultSchema.safeParse(toJsonRecord(value) ?? {});
  if (!parsed.success) {
    return {
      questions: [] as Array<z.infer<typeof scannedQuestionSchema>>,
      textPreview: "",
      saveSummary: null,
    };
  }
  return parsed.data;
}

async function resolveCurriculum(params: {
  supabase: AppSupabase;
  explicitCourseId?: string | null;
  explicitUnitId?: string | null;
  explicitTopicId?: string | null;
  hintText: string;
}): Promise<ResolvedCurriculum | null> {
  if (params.explicitCourseId) {
    const [{ data: course }, { data: unit }, { data: topic }] = await Promise.all([
      params.supabase
        .from("courses")
        .select("id,name,code")
        .eq("id", params.explicitCourseId)
        .maybeSingle(),
      params.explicitUnitId
        ? params.supabase
            .from("units")
            .select("id,course_id,unit_number,title")
            .eq("id", params.explicitUnitId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      params.explicitTopicId
        ? params.supabase
            .from("topics")
            .select("id,unit_id,topic_number,title")
            .eq("id", params.explicitTopicId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (!course) {
      return readResolvedGenericCurriculum(params.supabase);
    }

    let resolvedUnit =
      unit && unit.course_id === course.id
        ? {
            unitId: unit.id,
            unitLabel: formatIntentUnitName({
              unitNumber: unit.unit_number,
              title: unit.title,
            }),
          }
        : null;

    if (!resolvedUnit && cleanText(params.hintText)) {
      const { data: courseUnits } = await params.supabase
        .from("units")
        .select("id,course_id,unit_number,title")
        .eq("course_id", course.id)
        .order("unit_number", { ascending: true });

      resolvedUnit = inferScopedUnitFromHint({
        hintText: params.hintText,
        course,
        units: courseUnits ?? [],
      });
    }

    if (!resolvedUnit) {
      resolvedUnit = await readCourseFallbackUnitBucket(params.supabase, course.id);
    }

    const fallbackTopic =
      resolvedUnit?.unitId
        ? await readUnitFallbackTopicBucket(params.supabase, resolvedUnit.unitId)
        : null;
    const resolvedTopic =
      topic && (!resolvedUnit?.unitId || topic.unit_id === resolvedUnit.unitId)
        ? {
            topicId: topic.id,
            topicLabel: topic.title,
          }
        : fallbackTopic;

    return {
      courseId: course.id,
      courseLabel: course.name,
      unitId: resolvedUnit?.unitId ?? null,
      unitLabel: resolvedUnit?.unitLabel ?? null,
      topicId: resolvedTopic?.topicId ?? null,
      topicLabel: resolvedTopic?.topicLabel ?? null,
      isGenericCourse: `${course.code ?? ""}`.trim().toUpperCase() === GENERIC_COURSE_CODE,
    };
  }

  const [{ data: courses }, { data: units }, { data: topics }] = await Promise.all([
    params.supabase
      .from("courses")
      .select("id,name,code")
      .order("name", { ascending: true }),
    params.supabase
      .from("units")
      .select("id,course_id,unit_number,title")
      .order("unit_number", { ascending: true }),
    params.supabase
      .from("topics")
      .select("id,unit_id,topic_number,title")
      .order("topic_number", { ascending: true }),
  ]);

  const inferableCourses = (courses ?? []).filter(
    (item) => `${item.code ?? ""}`.trim().toUpperCase() !== GENERIC_COURSE_CODE,
  );
  const inferableCourseIds = new Set(inferableCourses.map((item) => item.id));
  const inferableUnits = (units ?? []).filter(
    (item) => inferableCourseIds.has(item.course_id) && `${item.unit_number ?? ""}`.trim() !== "",
  );
  const inferableTopics = (topics ?? []).filter(
    (item) => `${item.topic_number ?? ""}`.trim() !== "",
  );

  const inferred = inferCurriculumContext({
    message: params.hintText,
    courses: inferableCourses.map((item) => ({
      id: item.id,
      name: item.name,
      code: item.code,
    })),
    units: inferableUnits.map((item) => ({
      id: item.id,
      courseId: item.course_id,
      unitNumber: item.unit_number,
      title: item.title,
    })),
    topics: inferableTopics.map((item) => ({
      id: item.id,
      unitId: item.unit_id,
      topicNumber: item.topic_number,
      title: item.title,
    })),
  });

  if (!inferred.courseId || !inferred.courseName) {
    return readResolvedGenericCurriculum(params.supabase);
  }

  const fallbackUnit = await readCourseFallbackUnitBucket(params.supabase, inferred.courseId);
  const resolvedUnitId = inferred.unitId ?? fallbackUnit?.unitId ?? null;
  const resolvedUnitLabel = inferred.unitName ?? fallbackUnit?.unitLabel ?? null;
  const fallbackTopic =
    resolvedUnitId
      ? await readUnitFallbackTopicBucket(params.supabase, resolvedUnitId)
      : null;

  return {
    courseId: inferred.courseId,
    courseLabel: inferred.courseName,
    unitId: resolvedUnitId,
    unitLabel: resolvedUnitLabel,
    topicId: inferred.topicId ?? fallbackTopic?.topicId ?? null,
    topicLabel: inferred.topicName ?? fallbackTopic?.topicLabel ?? null,
    isGenericCourse: false,
  };
}

async function maybeCollapseCurriculumForMixedTaxonomy(params: {
  supabase: AppSupabase;
  curriculum: ResolvedCurriculum;
  taxonomyResults: QuickExerciseTaxonomyResult[];
  explicitUnitId?: string | null;
  explicitTopicId?: string | null;
}): Promise<ResolvedCurriculum> {
  if (params.curriculum.isGenericCourse) {
    return params.curriculum;
  }

  if (params.explicitUnitId || params.explicitTopicId) {
    return params.curriculum;
  }

  const uniqueClusters = new Set(
    params.taxonomyResults
      .map((item) => cleanText(item.knowledgeCluster))
      .filter((item) => item && item !== "general"),
  );

  if (uniqueClusters.size < 3) {
    return params.curriculum;
  }

  const fallbackUnit = await readCourseFallbackUnitBucket(
    params.supabase,
    params.curriculum.courseId,
  );
  const fallbackTopic =
    fallbackUnit?.unitId
      ? await readUnitFallbackTopicBucket(params.supabase, fallbackUnit.unitId)
      : null;

  if (!fallbackUnit) {
    return params.curriculum;
  }

  return {
    ...params.curriculum,
    unitId: fallbackUnit.unitId,
    unitLabel: fallbackUnit.unitLabel,
    topicId: fallbackTopic?.topicId ?? null,
    topicLabel: fallbackTopic?.topicLabel ?? null,
  };
}

async function saveSingleUpload(
  params: SaveSingleUploadParams,
): Promise<ScanLibrarySaveFileResult> {
  const { data: row, error } = await params.supabase
    .from("pdf_scan_uploads")
    .select("id,file_name,scan_result")
    .eq("id", params.uploadId)
    .eq("teacher_id", params.teacherId)
    .maybeSingle();

  if (error || !row) {
    return {
      uploadId: params.uploadId,
      fileName: "未知文件",
      status: "failed",
      savedCount: 0,
      exerciseIds: [],
      importBatchId: null,
      importBatchLabel: null,
      courseId: null,
      courseLabel: null,
      unitId: null,
      unitLabel: null,
      topicId: null,
      message: "未找到拆题上传记录。",
      reviewPendingCount: 0,
    };
  }

  const stored = parseStoredScanResult(row.scan_result);
  const questions = stored.questions.map((question) => ({
    ...question,
    content: cleanText(question.content),
    knowledgePoint: cleanText(question.knowledgePoint),
    linkedFigures: (question.linkedFigures ?? [])
      .map((item) => cleanText(item))
      .filter(Boolean),
  }));

  if (questions.length === 0) {
    return {
      uploadId: row.id,
      fileName: row.file_name,
      status: "no_questions",
      savedCount: 0,
      exerciseIds: [],
      importBatchId: null,
      importBatchLabel: null,
      courseId: null,
      courseLabel: null,
      unitId: null,
      unitLabel: null,
      topicId: null,
      message: "当前文件没有可入库的结构化题目。",
      reviewPendingCount: 0,
    };
  }

  if (
    stored.saveSummary?.status === "saved" &&
    stored.saveSummary.exerciseIds.length > 0 &&
    stored.saveSummary.reviewPendingQuestionNumbers.length === 0
  ) {
    return {
      uploadId: row.id,
      fileName: row.file_name,
      status: "already_saved",
      savedCount: stored.saveSummary.savedCount,
      exerciseIds: stored.saveSummary.exerciseIds,
      importBatchId: stored.saveSummary.importBatchId ?? null,
      importBatchLabel: stored.saveSummary.importBatchLabel ?? null,
      courseId: stored.saveSummary.courseId,
      courseLabel: stored.saveSummary.courseLabel ?? null,
      unitId: stored.saveSummary.unitId ?? null,
      unitLabel: stored.saveSummary.unitLabel ?? null,
      topicId: stored.saveSummary.topicId ?? null,
      message: "拆题结果已归档到内容库。",
      reviewPendingCount: 0,
    };
  }

  const sampleQuestions = buildQuestionSample(questions);
  const hintText = [
    params.curriculumHint,
    row.file_name,
    stored.textPreview,
    sampleQuestions,
  ]
    .filter(Boolean)
    .join("\n");

  let resolvedCourseId = params.explicitCourseId ?? null;
  if (!resolvedCourseId) {
    const { data: courses } = await params.supabase
      .from("courses")
      .select("id,name,code")
      .order("name", { ascending: true });
    const documentSubject = await classifyDocumentSubject({
      fileName: row.file_name,
      textPreview: stored.textPreview,
      sampleQuestions,
      courses: courses ?? [],
    });

    if (
      (documentSubject.courseName || documentSubject.courseCode) &&
      documentSubject.confidence >= 50
    ) {
      const matchedCourse = matchDocumentSubjectCourse({
        courses: courses ?? [],
        courseName: documentSubject.courseName,
        courseCode: documentSubject.courseCode,
      });

      if (matchedCourse) {
        resolvedCourseId = matchedCourse.id;
      }

      logger.info("整卷学科识别完成", {
        action: "classifyDocumentSubject",
        uploadId: row.id,
        recognizedCourseName: documentSubject.courseName,
        recognizedCourseCode: documentSubject.courseCode,
        confidence: documentSubject.confidence,
        matchedCourseId: matchedCourse?.id ?? null,
      });
    }
  }

  let curriculum = await resolveCurriculum({
    supabase: params.supabase,
    explicitCourseId: resolvedCourseId,
    explicitUnitId: params.explicitUnitId ?? null,
    explicitTopicId: params.explicitTopicId ?? null,
    hintText,
  });

  if (!curriculum) {
    return {
      uploadId: row.id,
      fileName: row.file_name,
      status: "requires_curriculum" as const,
      savedCount: 0,
      exerciseIds: [],
      importBatchId: null,
      importBatchLabel: null,
      courseId: null,
      courseLabel: null,
      unitId: null,
      unitLabel: null,
      topicId: null,
      message: "已完成拆题，但暂时无法确定课程与单元，尚未自动归档。",
      reviewPendingCount: questions.length,
    };
  }

  const savedQuestionNumbers = new Set(stored.saveSummary?.savedQuestionNumbers ?? []);
  const archiveCandidates = questions
    .map((question, index) => {
      const assessment = assessScannedQuestionForReview(question, index + 1);
      return {
        question,
        questionNumber: assessment.questionNumber,
        questionText: buildQuestionText(question),
        options: normalizeOptions(question.options),
        confidence: assessment.confidence,
        ready: assessment.shouldAutoArchive,
        reviewTier: assessment.reviewTier,
        issues: assessment.reasons,
      };
    })
    .filter((item) => !savedQuestionNumbers.has(item.questionNumber));
  const readyCandidates = archiveCandidates.filter((item) => item.ready);
  const blockedCandidates = archiveCandidates.filter((item) => !item.ready);
  const candidatesToSave =
    params.includeLowConfidence === true ? archiveCandidates : readyCandidates;
  const pendingAfterThisSave =
    params.includeLowConfidence === true
      ? []
      : blockedCandidates.map((item) => item.questionNumber);

  if (candidatesToSave.length === 0) {
    return {
      uploadId: row.id,
      fileName: row.file_name,
      status: "requires_review",
      savedCount: 0,
      exerciseIds: [],
      importBatchId: stored.saveSummary?.importBatchId ?? null,
      importBatchLabel: stored.saveSummary?.importBatchLabel ?? null,
      courseId: curriculum.courseId,
      courseLabel: curriculum.courseLabel,
      unitId: curriculum.unitId,
      unitLabel: curriculum.unitLabel,
      topicId: curriculum.topicId,
      message:
        "拆题已完成，但当前题目结构或置信度不足，建议先人工复核后再归档。",
      reviewPendingCount:
        stored.saveSummary?.reviewPendingQuestionNumbers.length ??
        blockedCandidates.length,
    };
  }

  const batchLabel =
    stored.saveSummary?.importBatchLabel ??
    `${row.file_name} · ${new Date().toLocaleDateString("zh-CN")}`;
  const importBatchId =
    stored.saveSummary?.importBatchId ??
    (
      await createExerciseImportBatch(
        {
          teacherId: params.teacherId,
          supabase: params.supabase,
        },
        {
          sourceKind: params.sourceKind ?? "pdf_scan",
          sourceDocumentId: params.sourceDocumentId ?? null,
          label: batchLabel,
          status: "processing",
          sourceUploadId: row.id,
          totalDetected: questions.length,
          totalSaved: stored.saveSummary?.savedCount ?? 0,
          metadata: {
            fileName: row.file_name,
            courseId: curriculum.courseId,
            unitId: curriculum.unitId,
            topicId: curriculum.topicId,
          },
        },
      )
    ).id;

  const documentSubjectHint = curriculum.isGenericCourse
    ? null
    : curriculum.courseLabel;
  const taxonomyResults = await classifyExerciseTaxonomyQuickBatch({
    items: candidatesToSave.map((candidate) => {
      const exerciseType = resolveExerciseType(candidate.question);
      return {
        questionText: candidate.questionText || `第 ${candidate.questionNumber} 题`,
        responseFormat: exerciseType === "MC" ? "MC" : "FR",
        optionsText: formatOptionsText(candidate.options),
        sourceKnowledgePoint: candidate.question.knowledgePoint,
        subjectHint: [documentSubjectHint, candidate.question.subject]
          .filter(Boolean)
          .join(" · "),
      };
    }),
  });

  curriculum = await maybeCollapseCurriculumForMixedTaxonomy({
    supabase: params.supabase,
    curriculum,
    taxonomyResults,
    explicitUnitId: params.explicitUnitId ?? null,
    explicitTopicId: params.explicitTopicId ?? null,
  });

  const exerciseRows = candidatesToSave.map((candidate, index) => {
    const exerciseType = resolveExerciseType(candidate.question);
    const taxonomy = taxonomyResults[index];
    const normalizedCorrectAnswer = cleanText(candidate.question.correctAnswer);
    const normalizedSolutionSteps = cleanText(candidate.question.solutionSteps);
    const content = normalizeExerciseContentForStorage(normalizeExerciseContent(
      buildExerciseContentFromLegacy({
        type: exerciseType,
        questionText: candidate.questionText || `第 ${candidate.questionNumber} 题`,
        options: candidate.options,
        correctAnswer: normalizedCorrectAnswer || "待补充",
        solutionSteps:
          normalizedSolutionSteps ||
          buildPlaceholderSolution(
            row.file_name,
            candidate.questionNumber,
          ),
        commonMistakes: [],
      }),
    ));
    const derived = deriveLegacyExerciseFieldsFromContent(content);
    return {
      teacher_id: params.teacherId,
      course_id: curriculum.courseId,
      unit_id: curriculum.unitId,
      topic_id: curriculum.topicId,
      rubric_id: null,
      exercise_type: exerciseType,
      difficulty: normalizeDifficulty(candidate.question.difficulty),
      content_json: content as unknown as Json,
      question_text: derived.questionText,
      options: exerciseType === "MC" ? (derived.options ?? null) : null,
      correct_answer: derived.correctAnswer,
      solution_steps: derived.solutionSteps,
      common_mistakes: derived.commonMistakes,
      verification_status: "manual_review" as const,
      verification_attempts: 0,
      is_ai_generated: false,
      teacher_modified: false,
      teacher_prompt: `PDF 拆题导入：${row.file_name}（upload ${row.id}）`,
      import_batch_id: importBatchId,
      source_kind: params.sourceKind ?? ("pdf_scan" as const),
      source_document_id: params.sourceDocumentId ?? null,
      source_upload_id: row.id,
      source_file_name: row.file_name,
      source_page_start: candidate.question.sourcePageNumber ?? null,
      source_page_end: candidate.question.sourcePageNumber ?? null,
      source_confidence: candidate.confidence,
      source_review_status: candidate.reviewTier,
      similarity_fingerprint: buildExerciseSimilarityFingerprint(
        candidate.questionText || `第 ${candidate.questionNumber} 题`,
      ),
      knowledge_cluster: taxonomy.knowledgeCluster,
      knowledge_subskill_key: taxonomy.knowledgeSubskillKey,
      knowledge_subskill_label: taxonomy.knowledgeSubskillLabel,
      knowledge_tags: taxonomy.knowledgeTags,
      assessment_style: taxonomy.assessmentStyle,
      assessment_tags: taxonomy.assessmentTags,
      classification_confidence: taxonomy.classificationConfidence,
      classification_status: taxonomy.classificationStatus,
      classification_reasons: taxonomy.classificationReasons,
      subskill_confidence: normalizeSubskillConfidence(taxonomy.subskillConfidence) ?? 0,
      subskill_match_mode: taxonomy.subskillMatchMode ?? "needs_review",
      subskill_reasons: taxonomy.subskillReasons,
    };
  });

  const { data: insertedRows, error: insertError } = await params.supabase
    .from("exercises")
    .insert(exerciseRows)
    .select("id");

  if (insertError) {
    return {
      uploadId: row.id,
      fileName: row.file_name,
      status: "failed",
      savedCount: 0,
      exerciseIds: [],
      importBatchId,
      importBatchLabel: batchLabel,
      courseId: curriculum.courseId,
      courseLabel: curriculum.courseLabel,
      unitId: curriculum.unitId,
      unitLabel: curriculum.unitLabel,
      topicId: curriculum.topicId,
      message: "拆题结果保存到题库失败。",
      reviewPendingCount:
        stored.saveSummary?.reviewPendingQuestionNumbers.length ??
        blockedCandidates.length,
    };
  }

  const exerciseIds = (insertedRows ?? []).map((item) => item.id);

  let semanticIndexPending = false;
  const semanticRetryLimit = 2;
  for (let attempt = 1; attempt <= semanticRetryLimit; attempt++) {
    try {
      await syncExerciseSemanticIndexRows({
        supabase: params.supabase,
        teacherId: params.teacherId,
        exerciseIds,
      });
      semanticIndexPending = false;
      break;
    } catch {
      semanticIndexPending = true;
      if (attempt < semanticRetryLimit) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  const saveSummary = {
    status: "saved" as const,
    savedCount: (stored.saveSummary?.savedCount ?? 0) + exerciseIds.length,
    exerciseIds: [
      ...(stored.saveSummary?.exerciseIds ?? []),
      ...exerciseIds,
    ],
    savedQuestionNumbers: [
      ...(stored.saveSummary?.savedQuestionNumbers ?? []),
      ...candidatesToSave.map((candidate) => candidate.questionNumber),
    ],
    reviewPendingQuestionNumbers: pendingAfterThisSave,
    importBatchId,
    importBatchLabel: batchLabel,
    courseId: curriculum.courseId,
    courseLabel: curriculum.courseLabel,
    unitId: curriculum.unitId,
    unitLabel: curriculum.unitLabel,
    topicId: curriculum.topicId,
    savedAt: new Date().toISOString(),
    semanticIndexPending,
    semanticIndexPendingIds: semanticIndexPending ? exerciseIds : [],
  };

  const nextScanResult = {
    ...(toJsonRecord(row.scan_result) ?? {}),
    saveSummary,
  } satisfies Record<string, Json>;

  await params.supabase
    .from("pdf_scan_uploads")
    .update({ scan_result: nextScanResult as Json })
    .eq("id", row.id)
    .eq("teacher_id", params.teacherId);

  await updateExerciseImportBatch(
    {
      teacherId: params.teacherId,
      supabase: params.supabase,
    },
    importBatchId,
    {
      status: pendingAfterThisSave.length > 0 ? "processing" : "completed",
      totalDetected: questions.length,
      totalSaved: saveSummary.savedCount,
      metadata: {
        fileName: row.file_name,
        reviewPendingQuestionNumbers: pendingAfterThisSave,
        courseId: curriculum.courseId,
        unitId: curriculum.unitId,
        topicId: curriculum.topicId,
      },
    },
  ).catch((err) => {
    logger.warn("更新导入批次状态失败", { action: "updateExerciseImportBatch", importBatchId }, err);
  });

  return {
    uploadId: row.id,
    fileName: row.file_name,
    status: "saved",
    savedCount: saveSummary.savedCount,
    exerciseIds: saveSummary.exerciseIds,
    importBatchId,
    importBatchLabel: batchLabel,
    courseId: curriculum.courseId,
    courseLabel: curriculum.courseLabel,
    unitId: curriculum.unitId,
    unitLabel: curriculum.unitLabel,
    topicId: curriculum.topicId,
    message:
      params.includeLowConfidence === true
        ? `已按人工确认归档 ${candidatesToSave.length} 道待审核题。`
        : blockedCandidates.length > 0
          ? `已自动归档 ${candidatesToSave.length} 道高置信题，另有 ${blockedCandidates.length} 道待人工复核。`
          : `已自动归档 ${candidatesToSave.length} 道题目。`,
    reviewPendingCount: pendingAfterThisSave.length,
  };
}

export async function saveScannedUploadsToLibrary(params: {
  supabase: AppSupabase;
  teacherId: string;
  uploadIds: string[];
  courseId?: string | null;
  unitId?: string | null;
  topicId?: string | null;
  curriculumHint?: string | null;
  includeLowConfidence?: boolean;
  sourceDocumentId?: string | null;
  sourceKind?: "pdf_scan" | "knowledge_document";
}): Promise<SaveScannedUploadsResult> {
  const uniqueUploadIds = Array.from(
    new Set(params.uploadIds.map((item) => item.trim()).filter(Boolean)),
  );
  const files: ScanLibrarySaveFileResult[] = [];

  for (const uploadId of uniqueUploadIds) {
    files.push(
      await saveSingleUpload({
        supabase: params.supabase,
        teacherId: params.teacherId,
        uploadId,
        explicitCourseId: params.courseId ?? null,
        explicitUnitId: params.unitId ?? null,
        explicitTopicId: params.topicId ?? null,
        curriculumHint: params.curriculumHint ?? null,
        includeLowConfidence: params.includeLowConfidence ?? false,
        sourceDocumentId: params.sourceDocumentId ?? null,
        sourceKind: params.sourceKind ?? "pdf_scan",
      }),
    );
  }

  return {
    files,
    totalSaved: files.reduce((sum, file) => sum + file.savedCount, 0),
  };
}
