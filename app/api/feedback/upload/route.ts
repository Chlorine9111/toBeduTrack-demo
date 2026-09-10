import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api/response"
import { requireRouteActorAnyRole } from "@/lib/auth/require-role"
import { isAuthBypassEnabled } from "@/lib/auth/bypass"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
])

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
}

function formatDateSegment(input: Date) {
  const year = String(input.getFullYear())
  const month = String(input.getMonth() + 1).padStart(2, "0")
  const day = String(input.getDate()).padStart(2, "0")
  return `${year}${month}${day}`
}

async function uploadWithBucketBootstrap(params: {
  storagePath: string
  fileBuffer: Buffer
  contentType: string
}) {
  const admin = createAdminSupabaseClient()

  const attemptUpload = async () =>
    admin.storage
      .from("feedback-attachments")
      .upload(params.storagePath, params.fileBuffer, {
        contentType: params.contentType,
        upsert: false,
      })

  let uploadResult = await attemptUpload()
  if (!uploadResult.error) {
    return { admin, uploadError: null as null | { message: string } }
  }

  const message = uploadResult.error.message.toLowerCase()
  const missingBucket =
    message.includes("bucket not found") ||
    message.includes("not found") ||
    message.includes("feedback-attachments")

  if (missingBucket) {
    await admin.storage.createBucket("feedback-attachments", {
      public: true,
      fileSizeLimit: MAX_FILE_SIZE,
      allowedMimeTypes: [...ALLOWED_MIME_TYPES],
    })
    uploadResult = await attemptUpload()
  }

  if (uploadResult.error) {
    return { admin, uploadError: { message: uploadResult.error.message } }
  }

  return { admin, uploadError: null as null | { message: string } }
}

export async function POST(request: Request) {
  try {
    const access = await requireRouteActorAnyRole(["subject_teacher", "admin"], {
      nextPath: "/main/feedback",
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
      return jsonError("UNAUTHORIZED", "请先登录", 401)
    }

    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return jsonError("VALIDATION_ERROR", "缺少附件文件", 400)
    }

    if (file.size > MAX_FILE_SIZE) {
      return jsonError("VALIDATION_ERROR", "附件大小不能超过 10MB", 400)
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return jsonError("VALIDATION_ERROR", "仅支持图片或 PDF 文件", 400)
    }

    const extension = MIME_EXTENSION_MAP[file.type]
    const storagePath = `${formatDateSegment(new Date())}/${crypto.randomUUID()}.${extension}`

    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const { admin, uploadError } = await uploadWithBucketBootstrap({
      storagePath,
      fileBuffer,
      contentType: file.type,
    })

    if (uploadError) {
      return jsonError("STORAGE_UPLOAD_FAILED", `附件上传失败: ${uploadError.message}`, 500)
    }

    const { data: urlData } = admin.storage
      .from("feedback-attachments")
      .getPublicUrl(storagePath)

    return NextResponse.json({
      url: urlData.publicUrl,
      name: file.name,
      type: file.type,
      size: file.size,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "附件上传失败"
    return jsonError("INTERNAL_ERROR", message, 500)
  }
}
