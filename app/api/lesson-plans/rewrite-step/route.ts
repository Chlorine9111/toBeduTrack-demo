import { z } from "zod"
import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api/response"
import { parseJsonBody, InvalidJsonBodyError } from "@/lib/api/request"
import { rewriteLessonStepWithAi } from "@/lib/lesson-plan/rewrite-step"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { ensureTeacher, EnsureTeacherError } from "@/lib/teachers/ensure-teacher"
import { isAuthBypassEnabled } from "@/lib/auth/bypass"

const stepSchema = z.object({
  id: z.string().min(1),
  phase: z.enum(["warm-up", "instruction", "practice", "summary", "extension"]),
  title: z.string().min(1).max(200),
  duration: z.number().int().min(1).max(120),
  teacherActions: z.array(z.string().min(1)).min(1).max(8),
  studentActions: z.array(z.string().min(1)).min(1).max(8),
})

const requestSchema = z.object({
  stepId: z.string().min(1),
  instruction: z.string().trim().min(1).max(500),
  currentStep: stepSchema,
})

export async function POST(request: Request) {
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
    const rawBody = await parseJsonBody<unknown>(request)
    const parsed = requestSchema.parse(rawBody)
    const rewritten = await rewriteLessonStepWithAi({
      instruction: parsed.instruction,
      currentStep: parsed.currentStep,
    })

    return NextResponse.json({
      step: {
        ...rewritten,
        id: parsed.stepId,
      },
    })
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400)
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten())
    }
    console.error("改写教案 step 失败", error)
    return jsonError("INTERNAL_ERROR", "改写失败，请稍后重试", 500)
  }
}

