import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { ensureTeacher, EnsureTeacherError } from "@/lib/teachers/ensure-teacher"
import { isAuthBypassEnabled } from "@/lib/auth/bypass"
import { jsonError } from "@/lib/api/response"
import { checkStatus as checkMathpixStatus } from "@/lib/pdf-scan/mathpix"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  try {
    const { uploadId: rawUploadId } = await params
    const parsed = z.string().uuid().safeParse(rawUploadId)
    if (!parsed.success) {
      return jsonError("VALIDATION_ERROR", "Invalid uploadId format", 400)
    }
    const uploadId = parsed.data

    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    const authBypass = isAuthBypassEnabled()

    if (!user && !authBypass) {
      return jsonError("UNAUTHORIZED", "请先登录", 401)
    }

    const ensured = await ensureTeacher({ supabase, user, authBypass })
    const teacherId = ensured.teacherId
    const db = ensured.supabase

    const { data: record, error } = await db
      .from("pdf_scan_uploads")
      .select("id, status, mathpix_id, question_count, error_message, scan_result")
      .eq("id", uploadId)
      .eq("teacher_id", teacherId)
      .single()

    if (error || !record) {
      return jsonError("NOT_FOUND", "记录不存在", 404)
    }

    // 没有 Mathpix ID 的任务：
    // - pending: 仅表示文件上传完成，前端可以进入 process-scan
    // - processing: 表示 process-scan 已被占用，仍在解析/入库中，不能误报 completed
    if (record.status === "pending" && !record.mathpix_id) {
      return NextResponse.json({
        status: "completed",
        progress: 100,
      })
    }

    if (record.status === "processing" && !record.mathpix_id) {
      const hasStructuredResult =
        Boolean(record.scan_result) &&
        typeof record.scan_result === "object"

      return NextResponse.json({
        status: "processing",
        progress: hasStructuredResult ? 88 : 72,
      })
    }

    // 如果在处理中且有 Mathpix ID，查询 Mathpix 进度
    let progress = 0
    if (record.status === "processing" && record.mathpix_id) {
      try {
        const mathpixStatus = await checkMathpixStatus(record.mathpix_id)
        progress = mathpixStatus.progress

        if (mathpixStatus.status === "completed") {
          return NextResponse.json({
            status: "completed",
            progress: 100,
          })
        }

        if (mathpixStatus.status === "error") {
          await db
            .from("pdf_scan_uploads")
            .update({ status: "failed", error_message: "Mathpix OCR 处理失败" })
            .eq("id", uploadId)

          return NextResponse.json({
            status: "failed",
            progress: 0,
          })
        }
      } catch (err) {
        console.error("[scan-status] Mathpix status check failed:", err instanceof Error ? err.message : err)
      }
    }

    return NextResponse.json({
      status: record.status,
      progress,
    })
  } catch (err) {
    if (err instanceof EnsureTeacherError) {
      return jsonError("UNAUTHORIZED", err.message, err.status)
    }
    const message = err instanceof Error ? err.message : "查询失败"
    return jsonError("INTERNAL_ERROR", message, 500)
  }
}
