import { NextResponse } from "next/server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { ensureTeacher, EnsureTeacherError } from "@/lib/teachers/ensure-teacher"
import { isAuthBypassEnabled } from "@/lib/auth/bypass"
import { jsonError } from "@/lib/api/response"
import { uploadPDF, hasMathpixCredentials } from "@/lib/pdf-scan/mathpix"
import {
  assertFileHeader,
  detectScanFileType,
  getAllowedUploadHint,
} from "@/lib/pdf-scan/file-type"

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

function sanitizeFileName(name: string): string {
  const basename = name.split(/[/\\]/).pop() || "upload"
  // Supabase Storage 不接受非 ASCII 字符，只保留英文、数字、点、连字符、下划线
  return basename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200)
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    const authBypass = isAuthBypassEnabled()

    if (!user && !authBypass) {
      return jsonError("UNAUTHORIZED", "请先登录", 401)
    }

    const ensured = await ensureTeacher({ supabase, user, authBypass })
    const teacherId = ensured.teacherId
    const db = ensured.supabase

    const formData = await request.formData()
    const file = formData.get("file")

    if (!file || !(file instanceof File)) {
      return jsonError("VALIDATION_ERROR", "Missing file", 400)
    }

    if (file.size > MAX_FILE_SIZE) {
      return jsonError("VALIDATION_ERROR", "文件大小不能超过 20MB", 400)
    }

    const fileType = detectScanFileType({
      fileName: file.name,
      mimeType: file.type,
    })
    if (!fileType) {
      return jsonError("VALIDATION_ERROR", `不支持的文件格式：${getAllowedUploadHint()}`, 400)
    }

    const headerBuffer = await file.slice(0, 12).arrayBuffer()
    const header = new Uint8Array(headerBuffer)
    try {
      assertFileHeader({
        fileType,
        fileName: file.name,
        bytes: header,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "文件格式校验失败"
      return jsonError("VALIDATION_ERROR", message, 400)
    }

    // 上传到 Supabase Storage（始终使用 admin client）
    const admin = createAdminSupabaseClient()
    const timestamp = Date.now()
    const safeName = sanitizeFileName(file.name)
    const storagePath = `pdfs/scans/${teacherId}/${timestamp}-${safeName}`
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    const { error: storageError } = await admin.storage
      .from("pdfs")
      .upload(storagePath, fileBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })

    if (storageError) {
      return jsonError("STORAGE_UPLOAD_FAILED", `上传失败: ${storageError.message}`, 500)
    }

    const { data: urlData } = admin.storage.from("pdfs").getPublicUrl(storagePath)

    // 调用 Mathpix OCR
    let mathpixId: string | null = null
    if (fileType === "pdf" && hasMathpixCredentials()) {
      try {
        mathpixId = await uploadPDF(fileBuffer, file.name)
      } catch (err) {
        console.error("[upload-scan] Mathpix upload failed (non-blocking):", err instanceof Error ? err.message : err)
      }
    }

    // 插入数据库记录
    const { data: record, error: dbError } = await db
      .from("pdf_scan_uploads")
      .insert({
        teacher_id: teacherId,
        file_name: file.name,
        file_url: urlData?.publicUrl ?? null,
        storage_path: storagePath,
        file_size: file.size,
        status: mathpixId ? "processing" : "pending",
        mathpix_id: mathpixId,
      })
      .select("id")
      .single()

    if (dbError) {
      return jsonError("DB_WRITE_FAILED", `数据库错误: ${dbError.message}`, 500)
    }

    return NextResponse.json({
      uploadId: record.id,
      fileName: file.name,
      fileSize: file.size,
      fileType,
    })
  } catch (err) {
    if (err instanceof EnsureTeacherError) {
      return jsonError("UNAUTHORIZED", err.message, err.status)
    }
    const message = err instanceof Error ? err.message : "上传失败"
    return jsonError("INTERNAL_ERROR", message, 500)
  }
}
