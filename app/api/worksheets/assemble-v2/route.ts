import { NextResponse } from "next/server"
import { z } from "zod"
import { jsonError } from "@/lib/api/response"
import { getTeacherIdentity } from "@/lib/api/teacher-context"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"
import { assembleWorksheetV2 } from "@/lib/worksheet/assemble-v2"

const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(1000),
  course: z.string().trim().max(50).optional().default(""),
  unit: z.coerce.number().int().min(1).max(20).optional(),
  questionCount: z.coerce.number().int().min(1).max(60).default(15),
})

export async function POST(request: Request) {
  const { teacherId, errorMessage, errorStatus } = await getTeacherIdentity()
  if (!teacherId) {
    return jsonError("UNAUTHORIZED", errorMessage ?? "Please sign in first", errorStatus ?? 401)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError("VALIDATION_ERROR", "Invalid request body", 400)
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return jsonError("VALIDATION_ERROR", "Invalid parameters", 400, parsed.error.flatten())
  }

  try {
    const supabase = createAdminSupabaseClient()
    const result = await assembleWorksheetV2({
      supabase,
      prompt: parsed.data.prompt,
      course: parsed.data.course,
      unit: parsed.data.unit,
      questionCount: parsed.data.questionCount,
    })

    return NextResponse.json({
      blueprint: result.blueprint,
      questions: result.questions,
      sections: result.sections,
      skipped: result.skipped,
      summary: result.summary,
    })
  } catch (error) {
    console.error("[assemble-v2] failed:", error)
    return jsonError(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "Assembly failed",
      500,
    )
  }
}
