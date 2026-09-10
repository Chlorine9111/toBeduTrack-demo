import { z } from "zod"
import { jsonError } from "@/lib/api/response"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"
import { getFeedbackAdminAccess } from "@/lib/feedback/admin-auth"
import { deleteDevFeedback } from "@/lib/feedback/dev-store"
import type { Json } from "@/types/database"

const paramsSchema = z.object({
  feedbackId: z.string().uuid(),
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

function toFeedbackAttachmentPaths(value: Json): string[] {
  if (!Array.isArray(value)) return []

  const markerList = [
    "/storage/v1/object/public/feedback-attachments/",
    "/object/public/feedback-attachments/",
  ]

  const paths = new Set<string>()

  for (const item of value) {
    if (!item || typeof item !== "object") continue

    const url = "url" in item ? String(item.url ?? "") : ""
    if (!url) continue

    try {
      const parsed = new URL(url)
      for (const marker of markerList) {
        const index = parsed.pathname.indexOf(marker)
        if (index >= 0) {
          const path = decodeURIComponent(parsed.pathname.slice(index + marker.length))
          if (path) {
            paths.add(path)
          }
          break
        }
      }
    } catch {
      // 仅解析有效 URL
    }
  }

  return [...paths]
}

export async function DELETE(
  _request: Request,
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

    const admin = createAdminSupabaseClient()

    const { data: feedback, error: feedbackError } = await admin
      .from("feedback")
      .select("id,attachments")
      .eq("id", parsedParams.feedbackId)
      .maybeSingle()

    if (feedbackError) {
      if (isMissingFeedbackTables(feedbackError)) {
        const fallbackDeleted = await deleteDevFeedback(parsedParams.feedbackId)
        if (!fallbackDeleted) {
          return jsonError("NOT_FOUND", "反馈不存在", 404)
        }

        return Response.json({
          id: fallbackDeleted.id,
          deleted: true,
        })
      }

      return jsonError("INTERNAL_ERROR", "读取反馈失败", 500)
    }

    if (!feedback) {
      return jsonError("NOT_FOUND", "反馈不存在", 404)
    }

    const attachmentPaths = toFeedbackAttachmentPaths(feedback.attachments)
    if (attachmentPaths.length > 0) {
      const { error: storageError } = await admin.storage
        .from("feedback-attachments")
        .remove(attachmentPaths)

      if (storageError) {
        console.error("删除反馈附件失败", storageError)
      }
    }

    const { error: deleteError } = await admin
      .from("feedback")
      .delete()
      .eq("id", parsedParams.feedbackId)

    if (deleteError) {
      return jsonError("DB_WRITE_FAILED", "删除反馈失败", 500)
    }

    return Response.json({
      id: parsedParams.feedbackId,
      deleted: true,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten())
    }

    return jsonError("INTERNAL_ERROR", "删除反馈失败，请稍后重试", 500)
  }
}
