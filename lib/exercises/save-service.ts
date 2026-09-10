import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { syncExerciseContentLibraryItem } from "@/lib/content-library/sync";
import { normalizeSubskillConfidence } from "@/lib/exercises/confidence";
import {
  buildExerciseContentFromLegacy,
  deriveLegacyExerciseFieldsFromContent,
  normalizeExerciseContent,
  normalizeExerciseContentForStorage,
} from "@/lib/exercises/content";
import { classifyAndPersistExerciseTaxonomy } from "@/lib/exercises/taxonomy";
import { syncExerciseSemanticIndexRows } from "@/lib/question-bank/semantic-index";
import { classifyExerciseTaxonomyBatchWithAi } from "@/lib/question-bank/taxonomy-ai";
import { exerciseSaveRequestSchema } from "@/lib/validation/api";
import type { Database, Json } from "@/types/database";
import { fromExerciseDifficulty } from "@/types/exercise";

type AppSupabase = SupabaseClient<Database>;

export type SaveExercisesParams = {
  supabase: AppSupabase;
  teacherId: string;
  request: Record<string, unknown> | z.infer<typeof exerciseSaveRequestSchema>;
  sourceConversationId?: string | null;
  sourceMessageId?: string | null;
  syncToContentLibrary?: boolean;
  deferPostProcessing?: boolean;
};

type SaveExercisesResult = {
  ids: string[];
};

export async function saveExercises(params: SaveExercisesParams): Promise<SaveExercisesResult> {
  const body = exerciseSaveRequestSchema.parse(
    normalizeExerciseSaveRequest(params.request),
  );

  const rubricIds = Array.from(
    new Set(body.exercises.map((exercise) => exercise.rubricId).filter(Boolean)),
  ) as string[];
  const importBatchIds = Array.from(
    new Set(body.exercises.map((exercise) => exercise.importBatchId).filter(Boolean)),
  ) as string[];
  if (rubricIds.length > 0) {
    const { data: rubrics, error: rubricError } = await params.supabase
      .from("rubrics")
      .select("id")
      .in("id", rubricIds)
      .eq("teacher_id", params.teacherId);
    if (rubricError) {
      throw new Error("Failed to validate rubrics");
    }

    const foundRubrics = new Set((rubrics ?? []).map((row) => row.id));
    const missingRubrics = rubricIds.filter((id) => !foundRubrics.has(id));
    if (missingRubrics.length > 0) {
      throw new z.ZodError(
        missingRubrics.map((id) => ({
          code: z.ZodIssueCode.custom,
          message: `Invalid rubric reference: ${id}`,
          path: ["rubricId"],
        })),
      );
    }
  }

  if (importBatchIds.length > 0) {
    const { data: batches, error: batchError } = await params.supabase
      .from("exercise_import_batches")
      .select("id")
      .in("id", importBatchIds)
      .eq("teacher_id", params.teacherId);

    if (batchError) {
      throw new Error("Failed to validate import batches");
    }

    const foundBatches = new Set((batches ?? []).map((row) => row.id));
    const missingBatches = importBatchIds.filter((id) => !foundBatches.has(id));
    if (missingBatches.length > 0) {
      throw new z.ZodError(
        missingBatches.map((id) => ({
          code: z.ZodIssueCode.custom,
          message: `Invalid import batch reference: ${id}`,
          path: ["importBatchId"],
        })),
      );
    }
  }

  const unitIds = Array.from(
    new Set(body.exercises.map((exercise) => exercise.unitId).filter(Boolean)),
  ) as string[];
  const topicIds = Array.from(
    new Set(body.exercises.map((exercise) => exercise.topicId).filter(Boolean)),
  ) as string[];

  const unitById = new Map<string, { course_id: string }>();
  if (unitIds.length > 0) {
    const { data: units, error: unitError } = await params.supabase
      .from("units")
      .select("id, course_id")
      .in("id", unitIds);
    if (unitError) {
      throw new Error("Failed to validate units");
    }
    (units ?? []).forEach((unit) => {
      unitById.set(unit.id, { course_id: unit.course_id });
    });
  }

  const topicById = new Map<string, { unit_id: string }>();
  if (topicIds.length > 0) {
    const { data: topics, error: topicError } = await params.supabase
      .from("topics")
      .select("id, unit_id")
      .in("id", topicIds);
    if (topicError) {
      throw new Error("Failed to validate topics");
    }
    (topics ?? []).forEach((topic) => {
      topicById.set(topic.id, { unit_id: topic.unit_id });
    });
  }

  const referenceIssues: Array<{ index: number; message: string }> = [];
  body.exercises.forEach((exercise, index) => {
    if (exercise.unitId) {
      const unit = unitById.get(exercise.unitId);
      if (!unit) {
        referenceIssues.push({
          index,
          message: "Unit not found for exercise.",
        });
      } else if (unit.course_id !== exercise.courseId) {
        referenceIssues.push({
          index,
          message: "Unit does not belong to the provided course.",
        });
      }
    }

    if (exercise.topicId) {
      const topic = topicById.get(exercise.topicId);
      if (!topic) {
        referenceIssues.push({
          index,
          message: "Topic not found for exercise.",
        });
      } else if (!exercise.unitId) {
        referenceIssues.push({
          index,
          message: "Topic requires a unit id.",
        });
      } else if (topic.unit_id !== exercise.unitId) {
        referenceIssues.push({
          index,
          message: "Topic does not belong to the provided unit.",
        });
      }
    }
  });

  if (referenceIssues.length > 0) {
    throw new z.ZodError(
      referenceIssues.map((issue) => ({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path: ["exercises", issue.index],
      })),
    );
  }

  const rows = await Promise.all(body.exercises.map(async (exercise) => {
    const content = normalizeExerciseContentForStorage(normalizeExerciseContent(
      exercise.content ??
        buildExerciseContentFromLegacy({
          type: exercise.type,
          questionText: exercise.questionText ?? "",
          options: exercise.options ?? null,
          correctAnswer: exercise.correctAnswer ?? null,
          solutionSteps: exercise.solutionSteps ?? null,
          commonMistakes: exercise.commonMistakes ?? [],
        }),
    ));
    const derived = deriveLegacyExerciseFieldsFromContent(content);

    if (exercise.type === "MC" && (!(derived.options) || derived.options.length !== 4)) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: "MC exercises must include exactly 4 options.",
          path: ["options"],
        },
      ]);
    }
    if (exercise.type === "MC") {
      const correctCount = (derived.options ?? []).filter(
        (option) => option.isCorrect,
      ).length;
      if (correctCount !== 1) {
        throw new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            message: "MC exercises must have exactly one correct option.",
            path: ["options"],
          },
        ]);
      }
    }

    const options =
      exercise.type === "MC" ? (derived.options ?? null) : null;
    const normalizedVerificationStatus =
      exercise.verificationStatus === "rule_checked"
        ? "pending"
        : exercise.verificationStatus ?? "pending";

    return {
      exercise,
      content,
      derived,
      options,
      normalizedVerificationStatus,
    };
  }));

  const taxonomies = params.deferPostProcessing
    ? rows.map(({ exercise }) => ({
        knowledgeCluster: exercise.knowledgeCluster ?? null,
        knowledgeSubskillKey: exercise.knowledgeSubskillKey ?? null,
        knowledgeSubskillLabel: exercise.knowledgeSubskillLabel ?? null,
        knowledgeTags: exercise.knowledgeTags ?? [],
        assessmentStyle: exercise.assessmentStyle ?? null,
        assessmentTags: exercise.assessmentTags ?? [],
        classificationConfidence: exercise.classificationConfidence ?? 0,
        classificationStatus: exercise.classificationStatus ?? "unreviewed",
        classificationReasons:
          exercise.classificationReasons ?? ["待后台完成知识点分类"],
        subskillConfidence:
          normalizeSubskillConfidence(exercise.subskillConfidence ?? 0) ?? 0,
        subskillMatchMode: exercise.subskillMatchMode ?? "needs_review",
        subskillReasons: exercise.subskillReasons ?? ["待后台完成知识点分类"],
      }))
    : await classifyExerciseTaxonomyBatchWithAi({
        supabase: params.supabase,
        teacherId: params.teacherId,
        items: rows.map(({ exercise, derived, options }) => ({
          questionText: derived.questionText,
          responseFormat: exercise.type,
          optionsText:
            exercise.type === "MC"
              ? (options ?? [])
                  .map((option) => `${option.label}. ${option.text}`)
                  .join("\n")
              : "",
          subjectHint: String(exercise.teacherPrompt ?? ""),
        })),
      });

  const insertRows = rows.map(({ exercise, content, derived, options, normalizedVerificationStatus }, index) => {
    const taxonomy = taxonomies[index];
    return {
      teacher_id: params.teacherId,
      course_id: exercise.courseId,
      unit_id: exercise.unitId ?? null,
      topic_id: exercise.topicId ?? null,
      rubric_id: exercise.rubricId ?? null,
      exercise_type: exercise.type,
      difficulty: fromExerciseDifficulty(exercise.difficulty),
      content_json: content as unknown as Json,
      question_text: derived.questionText,
      options,
      correct_answer: derived.correctAnswer,
      solution_steps: derived.solutionSteps,
      common_mistakes: derived.commonMistakes,
      verification_status: normalizedVerificationStatus,
      verification_attempts: exercise.verificationAttempts ?? 0,
      is_ai_generated: exercise.isAiGenerated ?? true,
      teacher_modified: exercise.teacherModified ?? false,
      teacher_prompt: exercise.teacherPrompt ?? null,
      import_batch_id: exercise.importBatchId ?? null,
      source_kind: exercise.sourceKind ?? "manual",
      source_document_id: exercise.sourceDocumentId ?? null,
      source_upload_id: exercise.sourceUploadId ?? null,
      source_file_name: exercise.sourceFileName ?? null,
      source_page_start: exercise.sourcePageStart ?? null,
      source_page_end: exercise.sourcePageEnd ?? null,
      source_confidence: exercise.sourceConfidence ?? null,
      source_review_status: exercise.sourceReviewStatus ?? "unreviewed",
      similarity_fingerprint: exercise.similarityFingerprint ?? null,
      knowledge_cluster: exercise.knowledgeCluster ?? taxonomy.knowledgeCluster,
      knowledge_subskill_key:
        exercise.knowledgeSubskillKey ?? taxonomy.knowledgeSubskillKey,
      knowledge_subskill_label:
        exercise.knowledgeSubskillLabel ?? taxonomy.knowledgeSubskillLabel,
      knowledge_tags: exercise.knowledgeTags ?? taxonomy.knowledgeTags,
      assessment_style: exercise.assessmentStyle ?? taxonomy.assessmentStyle,
      assessment_tags: exercise.assessmentTags ?? taxonomy.assessmentTags,
      classification_confidence:
        exercise.classificationConfidence ?? taxonomy.classificationConfidence,
      classification_status:
        exercise.classificationStatus ?? taxonomy.classificationStatus,
      classification_reasons:
        exercise.classificationReasons ?? taxonomy.classificationReasons,
      subskill_confidence:
        normalizeSubskillConfidence(
          exercise.subskillConfidence ?? taxonomy.subskillConfidence,
        ) ?? 0,
      subskill_match_mode:
        exercise.subskillMatchMode ?? taxonomy.subskillMatchMode ?? "needs_review",
      subskill_reasons:
        exercise.subskillReasons ?? taxonomy.subskillReasons,
    };
  });

  const { data, error } = await params.supabase
    .from("exercises")
    .insert(insertRows)
    .select("id");

  if (error) {
    console.error("Failed to save exercises", {
      teacherId: params.teacherId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      firstRow: insertRows[0]
        ? {
            course_id: insertRows[0].course_id,
            unit_id: insertRows[0].unit_id,
            topic_id: insertRows[0].topic_id,
            exercise_type: insertRows[0].exercise_type,
            source_kind: insertRows[0].source_kind,
            classification_status: insertRows[0].classification_status,
            subskill_match_mode: insertRows[0].subskill_match_mode,
            question_preview: `${insertRows[0].question_text ?? ""}`.slice(0, 120),
          }
        : null,
    });
    throw new Error(`Failed to save exercises: ${error.message}`);
  }

  const insertedIds = data?.map((row) => row.id) ?? [];
  if (!params.deferPostProcessing && insertedIds.length > 0) {
    try {
      await classifyAndPersistExerciseTaxonomy({
        supabase: params.supabase,
        teacherId: params.teacherId,
        syncContentLibrary: false,
        exercises: insertedIds.map((exerciseId, index) => ({
          exerciseId,
          questionText: rows[index]?.derived.questionText ?? "",
          correctAnswer: rows[index]?.derived.correctAnswer ?? "",
          solutionSteps: rows[index]?.derived.solutionSteps ?? "",
          type: body.exercises[index]?.type ?? "FR",
          difficulty: fromExerciseDifficulty(body.exercises[index]?.difficulty ?? "medium"),
          teacherPrompt: body.exercises[index]?.teacherPrompt ?? null,
        })),
      });
    } catch (error) {
      console.error("Exercise taxonomy classification failed after save", error);
    }
  }

  if (!params.deferPostProcessing) {
    await syncExerciseSemanticIndexRows({
      supabase: params.supabase,
      teacherId: params.teacherId,
      exerciseIds: insertedIds,
    });
  }

  // 题目保存成功后，异步同步到内容库（fire-and-forget，不阻塞主链响应时间）
  if (params.syncToContentLibrary !== false && insertedIds.length > 0) {
    Promise.all(
      insertedIds.map((exerciseId) =>
        syncExerciseContentLibraryItem({
          supabase: params.supabase,
          teacherId: params.teacherId,
          exerciseId,
          sourceConversationId: params.sourceConversationId ?? null,
          sourceMessageId: params.sourceMessageId ?? null,
        }).catch((err) => {
          console.warn(
            `[save-service] syncExerciseContentLibraryItem failed for ${exerciseId}:`,
            err,
          );
        }),
      ),
    ).catch((err) => {
      console.warn("[save-service] content library batch sync failed:", err);
    });
  }

  return { ids: insertedIds };
}

export function normalizeExerciseSaveRequest(body: Record<string, unknown>) {
  const normalizeOptionalId = (value: unknown) => {
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized ? normalized : undefined;
  };

  const exercises = Array.isArray(body.exercises)
    ? body.exercises
    : Array.isArray(body.exercise)
      ? body.exercise
      : Array.isArray(body.exercise_list)
        ? body.exercise_list
        : [];

  return {
    exercises: exercises.map((item) => {
      const exercise = item as Record<string, unknown>;
      return {
        courseId: normalizeOptionalId(exercise.courseId ?? exercise.course_id),
        unitId: normalizeOptionalId(exercise.unitId ?? exercise.unit_id),
        topicId: normalizeOptionalId(exercise.topicId ?? exercise.topic_id),
        rubricId: normalizeOptionalId(exercise.rubricId ?? exercise.rubric_id),
        type:
          exercise.type ??
          exercise.exerciseType ??
          exercise.question_type ??
          exercise.exercise_type,
        difficulty: exercise.difficulty,
        questionText: exercise.questionText ?? exercise.question_text,
        content: exercise.content ?? exercise.content_json ?? exercise.contentJson,
        options: exercise.options ?? exercise.choices,
        correctAnswer: exercise.correctAnswer ?? exercise.correct_answer,
        solutionSteps: exercise.solutionSteps ?? exercise.solution_steps,
        commonMistakes: exercise.commonMistakes ?? exercise.common_mistakes,
        verificationStatus:
          exercise.verificationStatus ?? exercise.verification_status,
        verificationAttempts:
          exercise.verificationAttempts ?? exercise.verification_attempts,
        teacherPrompt: exercise.teacherPrompt ?? exercise.teacher_prompt,
        isAiGenerated: exercise.isAiGenerated ?? exercise.is_ai_generated,
        teacherModified: exercise.teacherModified ?? exercise.teacher_modified,
        importBatchId: normalizeOptionalId(
          exercise.importBatchId ?? exercise.import_batch_id,
        ),
        sourceKind: exercise.sourceKind ?? exercise.source_kind,
        sourceDocumentId: normalizeOptionalId(
          exercise.sourceDocumentId ?? exercise.source_document_id,
        ),
        sourceUploadId: normalizeOptionalId(
          exercise.sourceUploadId ?? exercise.source_upload_id,
        ),
        sourceFileName: exercise.sourceFileName ?? exercise.source_file_name,
        sourcePageStart: exercise.sourcePageStart ?? exercise.source_page_start,
        sourcePageEnd: exercise.sourcePageEnd ?? exercise.source_page_end,
        sourceConfidence: exercise.sourceConfidence ?? exercise.source_confidence,
        sourceReviewStatus: exercise.sourceReviewStatus ?? exercise.source_review_status,
        similarityFingerprint: exercise.similarityFingerprint ?? exercise.similarity_fingerprint,
        knowledgeCluster: exercise.knowledgeCluster ?? exercise.knowledge_cluster,
        knowledgeSubskillKey:
          exercise.knowledgeSubskillKey ?? exercise.knowledge_subskill_key,
        knowledgeSubskillLabel:
          exercise.knowledgeSubskillLabel ?? exercise.knowledge_subskill_label,
        knowledgeTags: exercise.knowledgeTags ?? exercise.knowledge_tags,
        assessmentStyle: exercise.assessmentStyle ?? exercise.assessment_style,
        assessmentTags: exercise.assessmentTags ?? exercise.assessment_tags,
        classificationConfidence:
          exercise.classificationConfidence ?? exercise.classification_confidence,
        classificationStatus:
          exercise.classificationStatus ?? exercise.classification_status,
        classificationReasons:
          exercise.classificationReasons ?? exercise.classification_reasons,
        subskillConfidence:
          exercise.subskillConfidence ?? exercise.subskill_confidence,
        subskillMatchMode:
          exercise.subskillMatchMode ?? exercise.subskill_match_mode,
        subskillReasons:
          exercise.subskillReasons ?? exercise.subskill_reasons,
      };
    }),
  };
}
