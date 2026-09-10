import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, InvalidJsonBodyError } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { requireRouteActorAnyRole } from "@/lib/auth/require-role";
import { rewriteExerciseWithAi } from "@/lib/exercise/rewrite";

const optionSchema = z.object({
  label: z.string().trim().min(1).max(4),
  text: z.string().trim().min(1).max(4000),
  isCorrect: z.boolean().optional().default(false),
});

const currentQuestionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  exerciseType: z.enum(["MC", "FR", "fill_in", "TF", "experiment", "proof", "drawing"]),
  difficulty: z.coerce.number().int().min(1).max(4),
  questionText: z.string().trim().min(1).max(20000),
  options: z.array(optionSchema).max(8).optional().nullable(),
  correctAnswer: z.string().trim().max(4000).optional().nullable(),
  solutionSteps: z.string().trim().max(20000).optional().nullable(),
  knowledgePoints: z.array(z.string().trim().min(1).max(120)).max(20).optional().default([]),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).optional().default([]),
  course: z.string().trim().max(120).optional().default(""),
  unit: z.string().trim().max(120).optional().default(""),
});

const requestSchema = z.object({
  instruction: z.string().trim().min(1).max(600),
  currentQuestion: currentQuestionSchema,
});

function toRewriteExercise(question: z.infer<typeof currentQuestionSchema>) {
  const mcOptions =
    question.exerciseType === "MC"
    && Array.isArray(question.options)
    && question.options.length === 4
    && question.options.filter((option) => option.isCorrect).length === 1;

  return {
    id: question.id,
    questionText: question.questionText,
    type: mcOptions ? "MC" : "FR",
    difficulty: question.difficulty as 1 | 2 | 3 | 4,
    options: mcOptions
      ? question.options?.map((option) => ({
          label: option.label,
          text: option.text,
          isCorrect: option.isCorrect ?? false,
        }))
      : undefined,
    correctAnswer: question.correctAnswer?.trim() || "待补充",
    solutionSteps: question.solutionSteps?.trim() || "请补充解析。",
  } as const;
}

export async function POST(request: Request) {
  const access = await requireRouteActorAnyRole(["subject_teacher", "admin"], { nextPath: "/main/agent" });
  if (access.response) {
    return access.response;
  }

  const { teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  try {
    const body = requestSchema.parse(await parseJsonBody(request));

    const rewritten = await rewriteExerciseWithAi({
      instruction: body.instruction,
      currentExercise: toRewriteExercise(body.currentQuestion),
    });

    return NextResponse.json({
      question: {
        questionText: rewritten.questionText,
        exerciseType: rewritten.type,
        difficulty: rewritten.difficulty,
        options: rewritten.type === "MC" ? rewritten.options ?? null : null,
        correctAnswer: rewritten.correctAnswer,
        solutionSteps: rewritten.solutionSteps,
      },
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是合法 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "修案参数不合法", 400, error.flatten());
    }
    if (error instanceof Error && error.message.includes("AI 服务未配置")) {
      return jsonError("SERVICE_UNAVAILABLE", error.message, 503);
    }
    if (error instanceof Error && error.message.includes("习题改写失败")) {
      return jsonError("SERVICE_UNAVAILABLE", error.message, 503);
    }

    console.error("[question-bank/split/rewrite] failed", error);
    return jsonError("INTERNAL_ERROR", "习题改写失败", 500);
  }
}
