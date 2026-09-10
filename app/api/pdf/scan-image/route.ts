import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { isAuthBypassEnabled } from "@/lib/auth/bypass"
import { jsonError } from "@/lib/api/response"
import { ensureTeacher, EnsureTeacherError } from "@/lib/teachers/ensure-teacher"

const requestSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(512)
    .regex(/^question-images\/([0-9a-f-]+)\/.+$/i, "图片路径不合法"),
})

const IMAGE_BUCKET = process.env.QUESTION_IMAGE_BUCKET ?? "pdfs"

function guessContentType(storagePath: string) {
  const lower = storagePath.toLowerCase()
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  if (lower.endsWith(".png")) return "image/png"
  if (lower.endsWith(".webp")) return "image/webp"
  if (lower.endsWith(".gif")) return "image/gif"
  if (lower.endsWith(".svg")) return "image/svg+xml"
  if (lower.endsWith(".bmp")) return "image/bmp"
  if (lower.endsWith(".tiff") || lower.endsWith(".tif")) return "image/tiff"
  return "application/octet-stream"
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const { path } = requestSchema.parse({
      path: url.searchParams.get("path"),
    })

    const teacherIdInPath = path.split("/")[1]
    if (!teacherIdInPath) {
      return jsonError("VALIDATION_ERROR", "图片路径不完整", 400)
    }

    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const authBypass = isAuthBypassEnabled()

    if (!user && !authBypass) {
      return jsonError("UNAUTHORIZED", "请先登录", 401)
    }

    const ensured = await ensureTeacher({ supabase, user, authBypass })
    if (ensured.teacherId !== teacherIdInPath) {
      return jsonError("FORBIDDEN", "无权访问该图片", 403)
    }

    const admin = createAdminSupabaseClient()
    const { data, error } = await admin.storage.from(IMAGE_BUCKET).download(path)

    if (error || !data) {
      return jsonError("NOT_FOUND", "图片不存在", 404)
    }

    const buffer = Buffer.from(await data.arrayBuffer())
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": data.type || guessContentType(path),
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": "inline",
      },
    })
  } catch (error) {
    if (error instanceof EnsureTeacherError) {
      return jsonError("UNAUTHORIZED", error.message, error.status)
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "图片路径参数错误", 400)
    }
    const message = error instanceof Error ? error.message : "读取图片失败"
    return jsonError("INTERNAL_ERROR", message, 500)
  }
}
