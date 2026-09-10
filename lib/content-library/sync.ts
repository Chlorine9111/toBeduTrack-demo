import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildExerciseContentFromLegacy,
  buildExerciseTitleFromContent,
  deriveLegacyExerciseFieldsFromContent,
  normalizeExerciseContent,
  readExerciseContent,
} from "@/lib/exercises/content";
import {
  getLessonPlanById,
} from "@/lib/lesson-plan/store";
import type { LessonPlanDocument } from "@/lib/lesson-plan/types";
import type { PblPlan } from "@/lib/pbl/types";
import {
  deleteContentLibraryItemByOriginKey,
  type ContentLibraryClient,
  upsertSynchronizedContentLibraryItem,
} from "@/lib/content-library/store";
import type { ContentLibraryLessonPlanMarkdownSnapshot } from "@/lib/content-library/types";
import {
  getAssessmentStyleLabel,
  getKnowledgeClusterLabel,
} from "@/lib/question-bank/taxonomy";
import { getSubskillLabel } from "@/lib/question-bank/subskills";
import { getRubricDetail } from "@/lib/rubric/queries";
import { syncContentAssetReference } from "@/lib/content-assets/sync-reference";
import type { Database } from "@/types/database";
import {
  toExerciseDifficulty,
  type Exercise,
  type ExerciseSourceKind,
  type ExerciseSourceReviewStatus,
} from "@/types/exercise";

type AppSupabase = SupabaseClient<Database>;

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"] & {
  course?: { id: string; name: string; code: string } | Array<{ id: string; name: string; code: string }> | null;
  unit?: { id: string; unit_number: number | string; title: string } | Array<{ id: string; unit_number: number | string; title: string }> | null;
  clusterNode?:
    | { id: string; canonical_label: string; status: string }
    | Array<{ id: string; canonical_label: string; status: string }>
    | null;
  subskillNode?:
    | { id: string; canonical_key: string; canonical_label: string; status: string }
    | Array<{ id: string; canonical_key: string; canonical_label: string; status: string }>
    | null;
  importBatch?: { id: string; label: string } | Array<{ id: string; label: string }> | null;
};

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function extractMarkdownTitle(markdown: string, fallback: string) {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1];
  const normalized = cleanText(heading);
  if (normalized) return normalized;
  return cleanText(fallback) || "未命名教案";
}

function summarizeMarkdown(markdown: string) {
  const stripped = cleanText(
    markdown
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[#>*`-]/g, " "),
  );
  if (!stripped) return null;
  return stripped.length > 220 ? `${stripped.slice(0, 220)}...` : stripped;
}

function summarizeLessonPlan(plan: LessonPlanDocument) {
  const firstSection = plan.sections[0];
  const summary = cleanText(firstSection?.summary);
  if (summary) return summary;
  const blockText = firstSection?.blocks
    .map((block) => {
      const text = block.content && typeof block.content === "object"
        ? Object.values(block.content).filter((item): item is string => typeof item === "string").join(" ")
        : "";
      return cleanText(text);
    })
    .filter(Boolean)
    .join(" ");

  if (!blockText) return null;
  return blockText.length > 220 ? `${blockText.slice(0, 220)}...` : blockText;
}

function toExerciseSnapshot(row: ExerciseRow): Exercise {
  const importBatch = pickFirst(row.importBatch);
  const sourceKind =
    (row.source_kind as ExerciseSourceKind | null) ?? "manual";
  const reviewStatus =
    (row.source_review_status as ExerciseSourceReviewStatus | null) ??
    "unreviewed";
  const content = normalizeExerciseContent(
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
  const derived = deriveLegacyExerciseFieldsFromContent(content);
  const knowledgeCluster = (row.knowledge_cluster as Exercise["knowledgeCluster"]) ?? null;
  const knowledgeSubskillLabel =
    row.knowledge_subskill_label ??
    getSubskillLabel(knowledgeCluster, row.knowledge_subskill_key);
  return {
    id: row.id,
    teacherId: row.teacher_id,
    courseId: row.course_id,
    unitId: row.unit_id,
    topicId: row.topic_id,
    rubricId: row.rubric_id,
    knowledgeCluster,
    knowledgeClusterNodeId: row.knowledge_cluster_node_id,
    knowledgeClusterStatus:
      (pickFirst(row.clusterNode)?.status as Exercise["knowledgeClusterStatus"]) ?? null,
    knowledgeSubskillKey: row.knowledge_subskill_key,
    knowledgeSubskillLabel,
    knowledgeSubskillNodeId: row.knowledge_subskill_node_id,
    knowledgeSubskillStatus:
      (pickFirst(row.subskillNode)?.status as Exercise["knowledgeSubskillStatus"]) ?? null,
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
    teacherPrompt: row.teacher_prompt,
    importBatchId: row.import_batch_id,
    importBatchLabel: importBatch?.label ?? null,
    source: row.source_kind
      ? {
          kind: sourceKind,
          documentId: row.source_document_id,
          uploadId: row.source_upload_id,
          fileName: row.source_file_name,
          pageStart: row.source_page_start,
          pageEnd: row.source_page_end,
          confidence: row.source_confidence,
          reviewStatus,
        }
      : null,
    similarityFingerprint: row.similarity_fingerprint,
    knowledgeTags: row.knowledge_tags ?? [],
    assessmentStyle: (row.assessment_style as Exercise["assessmentStyle"]) ?? null,
    assessmentTags: row.assessment_tags ?? [],
    classificationConfidence: row.classification_confidence ?? null,
    classificationStatus:
      (row.classification_status as Exercise["classificationStatus"]) ?? null,
    classificationReasons: row.classification_reasons ?? [],
    classificationUpdatedByTeacher: row.classification_updated_by_teacher,
    subskillConfidence: row.subskill_confidence ?? null,
    subskillMatchMode:
      (row.subskill_match_mode as Exercise["subskillMatchMode"]) ?? null,
    subskillReasons: row.subskill_reasons ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toContentLibraryClient(supabase: AppSupabase, teacherId: string): ContentLibraryClient {
  return { supabase, teacherId };
}

export async function syncRubricContentLibraryItem(params: {
  supabase: AppSupabase;
  teacherId: string;
  rubricId: string;
  sourceConversationId?: string | null;
  sourceMessageId?: string | null;
}) {
  const client = toContentLibraryClient(params.supabase, params.teacherId);
  const rubric = await getRubricDetail(params.rubricId, params.supabase, {
    teacherId: params.teacherId,
  });

  if (!rubric) {
    throw new Error("RUBRIC_NOT_FOUND");
  }

  const dimensionNames = rubric.dimensions.slice(0, 3).map((item) => item.name).join(" · ");
  const contentLibraryItemId = await upsertSynchronizedContentLibraryItem(client, {
    originKey: `rubric:${rubric.id}`,
    originEntityType: "rubric",
    originEntityId: rubric.id,
    sourceConversationId: params.sourceConversationId ?? null,
    sourceMessageId: params.sourceMessageId ?? null,
    contentType: "rubric",
    rendererType: "rubric",
    title: rubric.title,
    summaryText: dimensionNames || rubric.teacherPrompt || null,
    courseId: rubric.courseId,
    unitId: rubric.unitId ?? null,
    courseLabel: rubric.course.name,
    unitLabel:
      rubric.unit ? `Unit ${rubric.unit.unitNumber} · ${rubric.unit.title}` : null,
    snapshot: {
      kind: "rubric",
      rubric,
    },
    metadata: {
      status: rubric.status,
      dimensionCount: rubric.dimensions.length,
    },
    extraSearchText: [rubric.teacherPrompt, dimensionNames].filter(Boolean).join(" "),
  });

  await syncContentAssetReference({
    supabase: params.supabase,
    teacherId: params.teacherId,
    contentLibraryItemId: contentLibraryItemId ?? undefined,
    refEntityType: "rubric",
    refEntityId: rubric.id,
    title: rubric.title,
    courseId: rubric.courseId,
    unitId: rubric.unitId ?? null,
    courseLabel: rubric.course.name,
    unitLabel: rubric.unit ? `Unit ${rubric.unit.unitNumber} · ${rubric.unit.title}` : null,
  });
}

export async function removeRubricContentLibraryItem(params: {
  supabase: AppSupabase;
  teacherId: string;
  rubricId: string;
}) {
  await deleteContentLibraryItemByOriginKey(
    toContentLibraryClient(params.supabase, params.teacherId),
    `rubric:${params.rubricId}`,
  );
}

export async function syncLessonPlanContentLibraryItem(params: {
  supabase: AppSupabase;
  teacherId: string;
  planId: string;
  sourceConversationId?: string | null;
  sourceMessageId?: string | null;
}) {
  const client = toContentLibraryClient(params.supabase, params.teacherId);
  const lessonPlan = await getLessonPlanById(
    {
      teacherId: params.teacherId,
      supabase: params.supabase,
      isMock: false,
    },
    params.planId,
  );

  if (!lessonPlan) {
    throw new Error("LESSON_PLAN_NOT_FOUND");
  }

  const contentLibraryItemId = await upsertSynchronizedContentLibraryItem(client, {
    originKey: `lesson-plan:${lessonPlan.id}`,
    originEntityType: "lesson_plan",
    originEntityId: lessonPlan.id,
    sourceConversationId: params.sourceConversationId ?? null,
    sourceMessageId: params.sourceMessageId ?? null,
    contentType: "lesson_plan",
    rendererType: "lesson_plan_document",
    title: lessonPlan.title,
    summaryText: summarizeLessonPlan(lessonPlan),
    courseId: lessonPlan.courseId,
    unitId: lessonPlan.unitId ?? null,
    courseLabel: lessonPlan.subjectLabel,
    unitLabel: null,
    snapshot: {
      kind: "lesson_plan_document",
      lessonPlan,
    },
    metadata: {
      status: lessonPlan.status,
      sectionCount: lessonPlan.sections.length,
    },
    extraSearchText: lessonPlan.sourcePrompt,
  });

  await syncContentAssetReference({
    supabase: params.supabase,
    teacherId: params.teacherId,
    contentLibraryItemId: contentLibraryItemId ?? undefined,
    refEntityType: "lesson_plan",
    refEntityId: lessonPlan.id,
    title: lessonPlan.title,
    courseId: lessonPlan.courseId,
    unitId: lessonPlan.unitId ?? null,
    courseLabel: lessonPlan.subjectLabel,
  });
}

export async function removeLessonPlanContentLibraryItem(params: {
  supabase: AppSupabase;
  teacherId: string;
  planId: string;
}) {
  await deleteContentLibraryItemByOriginKey(
    toContentLibraryClient(params.supabase, params.teacherId),
    `lesson-plan:${params.planId}`,
  );
}

async function readExerciseRow(params: {
  supabase: AppSupabase;
  teacherId: string;
  exerciseId: string;
}) {
  const { data, error } = await params.supabase
    .from("exercises")
    .select(
      `
        *,
        course:courses(id,name,code),
        unit:units(id,unit_number,title),
        clusterNode:question_taxonomy_nodes!exercises_knowledge_cluster_node_id_fkey(id,canonical_label,status),
        subskillNode:question_taxonomy_nodes!exercises_knowledge_subskill_node_id_fkey(id,canonical_key,canonical_label,status),
        importBatch:exercise_import_batches(id,label)
      `,
    )
    .eq("id", params.exerciseId)
    .eq("teacher_id", params.teacherId)
    .maybeSingle();

  if (error) {
    throw new Error("读取习题失败");
  }

  return (data as ExerciseRow | null) ?? null;
}

export async function syncExerciseContentLibraryItem(params: {
  supabase: AppSupabase;
  teacherId: string;
  exerciseId: string;
  sourceConversationId?: string | null;
  sourceMessageId?: string | null;
}) {
  const row = await readExerciseRow(params);
  if (!row) {
    throw new Error("EXERCISE_NOT_FOUND");
  }

  const course = pickFirst(row.course);
  const unit = pickFirst(row.unit);
  const exercise = toExerciseSnapshot(row);
  const title = exercise.content
    ? buildExerciseTitleFromContent(exercise.content)
    : exercise.questionText.slice(0, 72) || "未命名习题";
  const summaryText =
    exercise.questionText.length > 220
      ? `${exercise.questionText.slice(0, 220)}...`
      : exercise.questionText;
  const knowledgeClusterLabel = getKnowledgeClusterLabel(exercise.knowledgeCluster);
  const assessmentStyleLabel = getAssessmentStyleLabel(exercise.assessmentStyle);

  const contentLibraryItemId = await upsertSynchronizedContentLibraryItem(
    toContentLibraryClient(params.supabase, params.teacherId),
    {
      originKey: `exercise:${row.id}`,
      originEntityType: "exercise",
      originEntityId: row.id,
      sourceConversationId: params.sourceConversationId ?? null,
      sourceMessageId: params.sourceMessageId ?? null,
      contentType: "question",
      rendererType: "exercise",
      title,
      summaryText,
      courseId: row.course_id,
      unitId: row.unit_id,
      courseLabel: course?.name ?? null,
      unitLabel: unit ? `Unit ${unit.unit_number} · ${unit.title}` : null,
      snapshot: {
        kind: "exercise",
        exercise,
      },
      metadata: {
        type: row.exercise_type,
        difficulty: row.difficulty,
        verificationStatus: row.verification_status,
        sourceKind: row.source_kind,
        sourceFileName: row.source_file_name,
        sourcePageStart: row.source_page_start,
        sourcePageEnd: row.source_page_end,
        sourceConfidence: row.source_confidence,
        sourceReviewStatus: row.source_review_status,
        importBatchId: row.import_batch_id,
        importBatchLabel: pickFirst(row.importBatch)?.label ?? null,
        similarityFingerprint: row.similarity_fingerprint,
        knowledgeCluster: exercise.knowledgeCluster,
        knowledgeClusterLabel,
        knowledgeSubskillKey: exercise.knowledgeSubskillKey ?? null,
        knowledgeSubskillLabel: exercise.knowledgeSubskillLabel ?? null,
        knowledgeTags: exercise.knowledgeTags,
        assessmentStyle: exercise.assessmentStyle,
        assessmentStyleLabel,
        assessmentTags: exercise.assessmentTags,
        classificationConfidence: exercise.classificationConfidence,
        classificationStatus: exercise.classificationStatus,
        subskillConfidence: exercise.subskillConfidence,
        subskillMatchMode: exercise.subskillMatchMode,
        classificationUpdatedByTeacher: row.classification_updated_by_teacher,
      },
      extraSearchText: [
        row.source_file_name,
        knowledgeClusterLabel,
        exercise.knowledgeSubskillLabel,
        ...(exercise.knowledgeTags ?? []),
        assessmentStyleLabel,
        ...(exercise.assessmentTags ?? []),
        row.correct_answer,
        row.solution_steps,
        ...(row.common_mistakes ?? []),
      ].join(" "),
    },
  );

  const assetCourse = pickFirst(row.course);
  const assetUnit = pickFirst(row.unit);
  await syncContentAssetReference({
    supabase: params.supabase,
    teacherId: params.teacherId,
    contentLibraryItemId: contentLibraryItemId ?? undefined,
    refEntityType: "exercise",
    refEntityId: row.id,
    title,
    courseId: row.course_id,
    unitId: row.unit_id,
    courseLabel: assetCourse?.name ?? null,
    unitLabel: assetUnit ? `Unit ${assetUnit.unit_number} · ${assetUnit.title}` : null,
  });
}

export async function removeExerciseContentLibraryItem(params: {
  supabase: AppSupabase;
  teacherId: string;
  exerciseId: string;
}) {
  await deleteContentLibraryItemByOriginKey(
    toContentLibraryClient(params.supabase, params.teacherId),
    `exercise:${params.exerciseId}`,
  );
}

export async function createAgentLessonPlanContentLibraryItem(params: {
  supabase: AppSupabase;
  teacherId: string;
  conversationId: string;
  messageId: string;
  teacherRequest: string;
  markdown: string;
  sources: Array<{ title: string; url: string }>;
  warnings: string[];
  qualityAudit: unknown | null;
  revisionRounds: number;
}) {
  const snapshot: ContentLibraryLessonPlanMarkdownSnapshot = {
    kind: "lesson_plan_markdown",
    markdown: params.markdown,
    sources: params.sources,
    warnings: params.warnings,
    qualityAudit: params.qualityAudit,
    revisionRounds: params.revisionRounds,
  };

  const contentLibraryItemId = await upsertSynchronizedContentLibraryItem(
    toContentLibraryClient(params.supabase, params.teacherId),
    {
      originKey: `assistant-message:${params.messageId}:lesson-plan`,
      originEntityType: "assistant_message",
      originEntityId: params.messageId,
      sourceConversationId: params.conversationId,
      sourceMessageId: params.messageId,
      contentType: "lesson_plan",
      rendererType: "lesson_plan_markdown",
      title: extractMarkdownTitle(params.markdown, params.teacherRequest),
      summaryText: summarizeMarkdown(params.markdown),
      snapshot,
      metadata: {
        sourceCount: params.sources.length,
        warningCount: params.warnings.length,
        revisionRounds: params.revisionRounds,
      },
      extraSearchText: params.teacherRequest,
    },
  );

  await syncContentAssetReference({
    supabase: params.supabase,
    teacherId: params.teacherId,
    contentLibraryItemId: contentLibraryItemId ?? undefined,
    refEntityType: "content_library_item",
    refEntityId: contentLibraryItemId ?? params.messageId,
    title: extractMarkdownTitle(params.markdown, params.teacherRequest),
    rawText: params.markdown,
  });
}

export async function syncPblProjectContentLibraryItem(params: {
  supabase: AppSupabase;
  teacherId: string;
  plan: PblPlan;
}) {
  const { plan } = params;
  const summary = plan.overviewText || summarizeMarkdown(plan.markdownContent);
  const searchParts = [
    plan.title,
    plan.drivingQuestion,
    plan.primarySubject,
    plan.grade,
    plan.originalPrompt,
    ...plan.searchResults.map((item) => item.title),
  ].filter(Boolean);

  const contentLibraryItemId = await upsertSynchronizedContentLibraryItem(
    toContentLibraryClient(params.supabase, params.teacherId),
    {
      originKey: `pbl-project-plan:${plan.id}`,
      originEntityType: "pbl_project_plan",
      originEntityId: plan.id,
      contentType: "pbl",
      rendererType: "pbl_project_plan",
      title: plan.title,
      summaryText: summary || plan.drivingQuestion || null,
      snapshot: {
        kind: "pbl_project_plan",
        pblPlan: plan,
      },
      metadata: {
        curriculumSystem: plan.curriculumSystem,
        primarySubject: plan.primarySubject,
        difficulty: plan.difficulty,
        stageCount: plan.stages.length,
        status: plan.status,
      },
      extraSearchText: searchParts.join(" "),
    },
  );

  await syncContentAssetReference({
    supabase: params.supabase,
    teacherId: params.teacherId,
    contentLibraryItemId: contentLibraryItemId ?? undefined,
    refEntityType: "pbl_project_plan",
    refEntityId: plan.id,
    title: plan.title,
  });
}

export async function removePblProjectContentLibraryItem(params: {
  supabase: AppSupabase;
  teacherId: string;
  planId: string;
}) {
  await deleteContentLibraryItemByOriginKey(
    toContentLibraryClient(params.supabase, params.teacherId),
    `pbl-project-plan:${params.planId}`,
  );
}
