import { z } from "zod"
import { jsonError } from "@/lib/api/response"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"
import { parseJsonBody, InvalidJsonBodyError } from "@/lib/api/request"
import { getFeedbackAdminAccess } from "@/lib/feedback/admin-auth"
import { insertDevFeedbackReply } from "@/lib/feedback/dev-store"

const paramsSchema = z.object({
  feedbackId: z.string().uuid(),
})

const requestSchema = z.object({
  content: z.string().trim().min(1, "回复内容不能为空").max(5000),
})

function isMissingFeedbackTables(error: unknown) {
  if (!error || typeof error !== "object") return false

  const code = "code" in error ? String(error.code ?? "") : ""
  const message = "message" in error ? String(error.message ?? "") : ""
  return (
    code === "PGRST205" ||
    message.includes("public.feedback") ||
    message.includes("public.feedback_replies")
  )
}

export async function POST(
  request: Request,
  context: { params: Promise<{ feedbackId: string }> },
) {
  const access = await getFeedbackAdminAccess()
  if (!access.teacherId) {
    return jsonError("UNAUTHORIZED", "请先登录", 401)
  }
  if (!access.allowed) {
    return jsonError("FORBIDDEN", "无权访问反馈后台", 403)
  }

  try {
    const params = await context.params
    const parsedParams = paramsSchema.parse(params)

    const body = await parseJsonBody<unknown>(request)
    const parsedBody = requestSchema.parse(body)

    const admin = createAdminSupabaseClient()

    const { data: exists, error: existsError } = await admin
      .from("feedback")
      .select("id")
      .eq("id", parsedParams.feedbackId)
      .maybeSingle()

    if (existsError) {
      if (isMissingFeedbackTables(existsError)) {
        const fallbackReply = await insertDevFeedbackReply({
          feedbackId: parsedParams.feedbackId,
          authorRole: "developer",
          authorName: "Deskmate Team",
          content: parsedBody.content,
        })

        if (!fallbackReply) {
          return jsonError("NOT_FOUND", "反馈不存在", 404)
        }

        return Response.json({
          id: fallbackReply.id,
          createdAt: fallbackReply.created_at,
        })
      }

      return jsonError("INTERNAL_ERROR", "读取反馈失败", 500)
    }

    if (!exists) {
      return jsonError("NOT_FOUND", "反馈不存在", 404)
    }

    const { data: reply, error: replyError } = await admin
      .from("feedback_replies")
      .insert({
        feedback_id: parsedParams.feedbackId,
        author_role: "developer",
        author_name: "Deskmate Team",
        content: parsedBody.content,
      })
      .select("id,created_at")
      .single()

    if (replyError) {
      return jsonError("DB_WRITE_FAILED", "写入回复失败", 500)
    }

    const { error: updateError } = await admin
      .from("feedback")
      .update({ status: "replied" })
      .eq("id", parsedParams.feedbackId)

    if (updateError) {
      return jsonError("DB_WRITE_FAILED", "更新反馈状态失败", 500)
    }

    return Response.json({
      id: reply.id,
      createdAt: reply.created_at,
    })
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400)
    }

    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten())
    }

    return jsonError("INTERNAL_ERROR", "回复失败，请稍后重试", 500)
  }
}
