import { z } from "zod"
import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api/response"
import { parseJsonBody, InvalidJsonBodyError } from "@/lib/api/request"
import { rewriteRubricDimensionWithAi } from "@/lib/rubric/rewrite"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { ensureTeacher, EnsureTeacherError } from "@/lib/teachers/ensure-teacher"
import { isAuthBypassEnabled } from "@/lib/auth/bypass"

const dimensionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  weight: z.number().min(0).max(100),
  levels: z.object({
    excellent: z.string().min(1),
    good: z.string().min(1),
    passing: z.string().min(1),
    failing: z.string().min(1),
  }),
})

const requestSchema = z.object({
  dimensionId: z.string().min(1),
  instruction: z.string().trim().min(1).max(600),
  currentDimension: dimensionSchema,
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

    const rewritten = await rewriteRubricDimensionWithAi({
      instruction: parsed.instruction,
      currentDimension: {
        ...parsed.currentDimension,
        id: parsed.dimensionId,
      },
    })

    return NextResponse.json({
      dimension: {
        ...rewritten,
        id: parsed.dimensionId,
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
    console.error("改写 rubric 维度失败", error)
    return jsonError("INTERNAL_ERROR", "改写失败，请稍后重试", 500)
  }
}
