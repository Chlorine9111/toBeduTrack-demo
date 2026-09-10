import { NextResponse } from "next/server"
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/response"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"
import { getFeedbackAdminAccess } from "@/lib/feedback/admin-auth"
import { getTeacherIdentity } from "@/lib/api/teacher-context"

type RouteContext = { params: Promise<{ announcementId: string }> }

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { announcementId } = await context.params
    const access = await getFeedbackAdminAccess()

    if (!access.teacherId) {
      return jsonError("UNAUTHORIZED", "请先登录", 401)
    }
    if (!access.allowed) {
      return jsonError("FORBIDDEN", "无权删除公告", 403)
    }

    const admin = createAdminSupabaseClient()
    const { error } = await admin
      .from("announcements")
      .delete()
      .eq("id", announcementId)

    if (error) {
      return jsonError("DB_WRITE_FAILED", error.message, 500)
    }

    return NextResponse.json({ id: announcementId, deleted: true })
  } catch (error) {
    return jsonErrorFromUnknown(error)
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { announcementId } = await context.params
    const access = await getFeedbackAdminAccess()

    if (!access.teacherId) {
      return jsonError("UNAUTHORIZED", "请先登录", 401)
    }
    if (!access.allowed) {
      return jsonError("FORBIDDEN", "无权修改公告", 403)
    }

    const body = await request.json()
    const admin = createAdminSupabaseClient()

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.isActive === "boolean") updates.is_active = body.isActive
    if (typeof body.title === "string") updates.title = body.title
    if (typeof body.content === "string") updates.content = body.content

    const { data, error } = await admin
      .from("announcements")
      .update(updates)
      .eq("id", announcementId)
      .select()
      .single()

    if (error) {
      return jsonError("DB_WRITE_FAILED", error.message, 500)
    }

    return NextResponse.json(data)
  } catch (error) {
    return jsonErrorFromUnknown(error)
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { announcementId } = await context.params
    const identity = await getTeacherIdentity()

    if (!identity.teacherId) {
      return jsonError("UNAUTHORIZED", "请先登录", 401)
    }

    const admin = createAdminSupabaseClient()

    const { error } = await admin
      .from("announcement_reads")
      .upsert(
        {
          announcement_id: announcementId,
          teacher_id: identity.teacherId,
          dismissed_at: new Date().toISOString(),
        },
        { onConflict: "announcement_id,teacher_id" },
      )

    if (error) {
      return jsonError("DB_WRITE_FAILED", error.message, 500)
    }

    return NextResponse.json({ dismissed: true })
  } catch (error) {
    return jsonErrorFromUnknown(error)
  }
}
