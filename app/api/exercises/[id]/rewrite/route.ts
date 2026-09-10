import { z } from "zod"
import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api/response"
import { requireRouteActorAnyRole } from "@/lib/auth/require-role"
import { parseJsonBody, InvalidJsonBodyError } from "@/lib/api/request"
import { rewriteExerciseWithAi } from "@/lib/exercise/rewrite"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { ensureTeacher, EnsureTeacherError } from "@/lib/teachers/ensure-teacher"
import { isAuthBypassEnabled } from "@/lib/auth/bypass"

const optionSchema = z.object({
  label: z.string().min(1).max(4),
  text: z.string().min(1),
  isCorrect: z.boolean(),
})

const exerciseSchema = z.object({
  id: z.string().min(1),
  questionText: z.string().min(1),
  type: z.enum(["MC", "FR"]),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  options: z.array(optionSchema).optional(),
  correctAnswer: z.string().min(1),
  solutionSteps: z.string().min(1),
})

const requestSchema = z.object({
  exerciseId: z.string().min(1).optional(),
  instruction: z.string().trim().min(1).max(600),
  currentExercise: exerciseSchema,
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireRouteActorAnyRole(["subject_teacher", "admin"], {
    nextPath: "/main/agent",
  })
  if (access.response) {
    return access.response
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const authBypass = isAuthBypassEnabled() || process.env.E2E_TEST === "1"

  if (!user && !authBypass) {
    return jsonError("UNAUTHORIZED", "Unauthorized", 401)
  }

  try {
    await ensureTeacher({ supabase, user, authBypass })
  } catch (error) {
    if (error instanceof EnsureTeacherError) {
      return jsonError("UNAUTHORIZED", error.message, error.status)
    }
    throw error
  }

  try {
    const params = await context.params
    const rawBody = await parseJsonBody<unknown>(request)
    const parsed = requestSchema.parse(rawBody)

    if (parsed.exerciseId && parsed.exerciseId !== params.id) {
      return jsonError("VALIDATION_ERROR", "exerciseId 与路径参数不一致", 400)
    }

    const rewritten = await rewriteExerciseWithAi({
      instruction: parsed.instruction,
      currentExercise: {
        ...parsed.currentExercise,
        id: params.id,
      },
    })

    return NextResponse.json({
      exercise: {
        ...rewritten,
        id: params.id,
      },
    })
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400)
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten())
    }
    if (error instanceof Error && error.message.includes("AI 服务未配置")) {
      return jsonError("SERVICE_UNAVAILABLE", error.message, 503)
    }
    console.error("改写习题失败", error)
    return jsonError("INTERNAL_ERROR", "改写失败，请稍后重试", 500)
  }
}
