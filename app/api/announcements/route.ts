import { z } from "zod"
import { NextResponse } from "next/server"
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/response"
import { parseJsonBody, InvalidJsonBodyError } from "@/lib/api/request"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"
import { getFeedbackAdminAccess } from "@/lib/feedback/admin-auth"
import { getTeacherIdentity } from "@/lib/api/teacher-context"
import { mapRowToAnnouncement } from "@/lib/announcements/types"

const querySchema = z.object({
  scope: z.enum(["active", "all"]).default("active"),
})

const createSchema = z.object({
  title: z.string().trim().min(1, "标题不能为空").max(200),
  content: z.string().trim().max(2000).default(""),
  targetType: z.enum(["global", "school"]).default("global"),
  targetSchools: z.array(z.string().trim().min(1)).default([]),
  startsAt: z.string().optional(),
  expiresAt: z.string().nullable().optional(),
})

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const params = querySchema.parse(Object.fromEntries(url.searchParams))
    const admin = createAdminSupabaseClient()

    if (params.scope === "all") {
      const access = await getFeedbackAdminAccess()
      if (!access.allowed) {
        return jsonError("FORBIDDEN", "无权访问公告管理", 403)
      }

      const { data, error } = await admin
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) {
        return jsonError("INTERNAL_ERROR", error.message, 500)
      }

      return NextResponse.json({
        items: (data ?? []).map((row) => mapRowToAnnouncement(row as Record<string, unknown>)),
        total: data?.length ?? 0,
      })
    }

    const identity = await getTeacherIdentity()
    if (!identity.teacherId) {
      return jsonError("UNAUTHORIZED", "请先登录", 401)
    }

    const { data: teacherRow } = await admin
      .from("teachers")
      .select("school_name")
      .eq("id", identity.teacherId)
      .maybeSingle()

    const schoolName = teacherRow?.school_name ?? null

    const now = new Date().toISOString()

    const { data: allActive, error: activeError } = await admin
      .from("announcements")
      .select("*")
      .eq("is_active", true)
      .lte("starts_at", now)
      .order("created_at", { ascending: false })

    if (activeError) {
      return jsonError("INTERNAL_ERROR", activeError.message, 500)
    }

    const visibleAnnouncements = (allActive ?? []).filter((row) => {
      if (row.expires_at && new Date(row.expires_at as string) < new Date()) return false
      if (row.target_type === "global") return true
      if (row.target_type === "school") {
        const targets = row.target_schools as string[] | null
        if (schoolName) return targets?.includes(schoolName) ?? false
        return targets?.includes("__no_school__") ?? false
      }
      return false
    })

    const { data: reads } = await admin
      .from("announcement_reads")
      .select("announcement_id")
      .eq("teacher_id", identity.teacherId)

    const dismissedIds = new Set((reads ?? []).map((r) => r.announcement_id))

    const items = visibleAnnouncements
      .filter((row) => !dismissedIds.has(row.id))
      .map((row) => mapRowToAnnouncement(row as Record<string, unknown>))

    return NextResponse.json({ items, total: items.length })
  } catch (error) {
    return jsonErrorFromUnknown(error)
  }
}

export async function POST(request: Request) {
  try {
    const access = await getFeedbackAdminAccess()
    if (!access.teacherId) {
      return jsonError("UNAUTHORIZED", "请先登录", 401)
    }
    if (!access.allowed) {
      return jsonError("FORBIDDEN", "无权发布公告", 403)
    }

    const body = await parseJsonBody(request)
    const payload = createSchema.parse(body)

    const admin = createAdminSupabaseClient()

    const { data, error } = await admin
      .from("announcements")
      .insert({
        title: payload.title,
        content: payload.content,
        target_type: payload.targetType,
        target_schools: payload.targetSchools,
        is_active: true,
        starts_at: payload.startsAt ?? new Date().toISOString(),
        expires_at: payload.expiresAt ?? null,
        created_by: access.teacherId,
      })
      .select()
      .single()

    if (error) {
      return jsonError("DB_WRITE_FAILED", error.message, 500)
    }

    return NextResponse.json(mapRowToAnnouncement(data as Record<string, unknown>), { status: 201 })
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", error.message, 400)
    }
    return jsonErrorFromUnknown(error)
  }
}
