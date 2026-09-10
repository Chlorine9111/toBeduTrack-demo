import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { parseJsonBody, InvalidJsonBodyError } from "@/lib/api/request";
import { optionalNullableUuidLikeSchema } from "@/lib/api/id-schemas";
import { requireRouteActorAnyRole } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ensureTeacher, EnsureTeacherError } from "@/lib/teachers/ensure-teacher";
import { isAuthBypassEnabled } from "@/lib/auth/bypass";
import { commitQuestionBankSplitDocument } from "@/lib/question-bank/split-service";
import type { QuestionBankSplitQuestion } from "@/lib/question-bank/split-types";
import { toExerciseDifficulty } from "@/types/exercise";

const questionSchema = z.object({
  id: z.string().trim().min(1),
  questionNumber: z.coerce.number().int().min(1),
  exerciseType: z.enum(["MC", "FR", "fill_in"]),
  questionText: z.string().trim().min(1),
  difficulty: z.union([
    z.enum(["easy", "medium", "hard"]),
    z.coerce.number().int().min(1).max(4).transform((v) => toExerciseDifficulty(v)),
  ]),
  options: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(4),
        text: z.string().trim().max(5000),
        isCorrect: z.boolean().optional(),
      }),
    )
    .nullable()
    .optional(),
  correctAnswer: z.string().trim().max(1000).nullable().optional(),
  solutionSteps: z.string().trim().max(20_000).nullable().optional(),
  subject: z.string().trim().max(200).nullable().optional(),
  knowledgePoint: z.string().trim().max(300).nullable().optional(),
  confidence: z.coerce.number().min(0).max(100),
  reviewTier: z.enum(["ready", "review", "critical"]),
  reviewReasons: z.array(z.string().trim().max(500)).max(20),
  isLowConfidence: z.boolean(),
  sourcePageNumber: z.coerce.number().int().positive().nullable().optional(),
  sourceType: z.enum(["pdf", "image", "word"]).optional(),
  rawQuestionNumber: z.string().trim().max(100).nullable().optional(),
  linkedFigures: z.array(z.string().trim().max(2000)).max(20).optional(),
  confidenceSignals: z.any().optional(),
  originalQuestionType: z.string().trim().max(50).optional(),
});

const requestSchema = z.object({
  uploadId: z.string().uuid(),
  label: z.string().trim().max(300).optional().nullable(),
  courseId: optionalNullableUuidLikeSchema,
  unitId: optionalNullableUuidLikeSchema,
  curriculumHint: z.string().trim().max(400).optional().nullable(),
  questions: z.array(questionSchema).min(1).max(300),
});

export async function POST(request: Request) {
  try {
    const access = await requireRouteActorAnyRole(["subject_teacher", "admin"], {
      nextPath: "/main/agent",
    });
    if ("response" in access) {
      return access.response;
    }

    const body = requestSchema.parse(await parseJsonBody(request));
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const authBypass = isAuthBypassEnabled();

    if (!user && !authBypass) {
      return jsonError("UNAUTHORIZED", "请先登录", 401);
    }

    const ensured = await ensureTeacher({ supabase, user, authBypass });
    const questions: QuestionBankSplitQuestion[] = body.questions.map((question) => ({
      ...question,
      difficulty: question.difficulty,
      options: question.options ?? null,
      correctAnswer: question.correctAnswer ?? null,
      solutionSteps: question.solutionSteps ?? null,
      subject: question.subject ?? null,
      knowledgePoint: question.knowledgePoint ?? null,
      sourcePageNumber: question.sourcePageNumber ?? null,
      rawQuestionNumber: question.rawQuestionNumber ?? null,
      linkedFigures: question.linkedFigures ?? [],
      originalQuestionType:
        question.originalQuestionType as QuestionBankSplitQuestion["originalQuestionType"],
    }));

    const result = await commitQuestionBankSplitDocument({
      supabase: ensured.supabase,
      teacherId: ensured.teacherId,
      uploadId: body.uploadId,
      label: body.label ?? null,
      courseId: body.courseId ?? null,
      unitId: body.unitId ?? null,
      curriculumHint: body.curriculumHint ?? null,
      questions,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof EnsureTeacherError) {
      return jsonError("UNAUTHORIZED", error.message, error.status);
    }
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", error.message, 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "拆题保存参数不合法", 400, error.flatten());
    }
    const message = error instanceof Error ? error.message : "保存拆题结果失败";
    return jsonError("INTERNAL_ERROR", message, 500);
  }
}
