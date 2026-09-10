import { NextResponse } from "next/server"
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/response"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"
import { getFeedbackAdminAccess } from "@/lib/feedback/admin-auth"

export async function GET() {
  try {
    const access = await getFeedbackAdminAccess()
    if (!access.teacherId) {
      return jsonError("UNAUTHORIZED", "请先登录", 401)
    }
    if (!access.allowed) {
      return jsonError("FORBIDDEN", "无权访问", 403)
    }

    const admin = createAdminSupabaseClient()
    const { data, error } = await admin
      .from("teachers")
      .select("school_name")
      .not("school_name", "is", null)
      .order("school_name")

    if (error) {
      return jsonError("INTERNAL_ERROR", error.message, 500)
    }

    const uniqueSchools = [...new Set(
      (data ?? [])
        .map((row) => row.school_name)
        .filter((name): name is string => Boolean(name?.trim())),
    )]

    return NextResponse.json({ schools: uniqueSchools })
  } catch (error) {
    return jsonErrorFromUnknown(error)
  }
}
