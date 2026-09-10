import { z } from "zod"
import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api/response"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { parseJsonBody, InvalidJsonBodyError } from "@/lib/api/request"
import { requireRouteActorAnyRole } from "@/lib/auth/require-role"
import { ensureTeacher, EnsureTeacherError } from "@/lib/teachers/ensure-teacher"
import { isAuthBypassEnabled } from "@/lib/auth/bypass"
import { getFeedbackAdminAccess } from "@/lib/feedback/admin-auth"
import { insertDevFeedback, listDevFeedback } from "@/lib/feedback/dev-store"
import {
  FEEDBACK_CATEGORY_VALUES,
  parseFeedbackMetadata,
  type FeedbackCategory,
} from "@/lib/feedback/types"
import type { Database, Json } from "@/types/database"

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(200).default(""),
  filter: z.enum(["all", "open", "replied", "has_reply"]).default("all"),
  scope: z.enum(["mine", "all"]).default("mine"),
})

const attachmentSchema = z.object({
  url: z.string().url(),
  name: z.string().trim().min(1),
  type: z.string().trim().min(1),
  size: z.number().int().nonnegative(),
})

const createFeedbackSchema = z.object({
  content: z.string().trim().min(1, "反馈内容不能为空").max(5000),
  isAnonymous: z.boolean().default(true),
  attachments: z.array(attachmentSchema).max(5).default([]),
  category: z.enum(FEEDBACK_CATEGORY_VALUES).default("other"),
  sourcePath: z.string().trim().max(500).optional().nullable(),
  sourceLabel: z.string().trim().max(500).optional().nullable(),
  locale: z.string().trim().max(32).optional().nullable(),
  metadata: z
    .object({
      currentUrl: z.string().trim().max(2000).optional(),
      userAgent: z.string().trim().max(1000).optional(),
      viewportWidth: z.number().int().min(0).max(10000).optional(),
      viewportHeight: z.number().int().min(0).max(10000).optional(),
      submittedFrom: z.enum(["page", "drawer"]).optional(),
    })
    .default({}),
})

type FeedbackRow = Pick<
  Database["public"]["Tables"]["feedback"]["Row"],
  | "id"
  | "display_name"
  | "is_anonymous"
  | "content"
  | "attachments"
  | "category"
  | "source_path"
  | "source_label"
  | "locale"
  | "metadata"
  | "status"
  | "created_at"
>
type LegacyFeedbackRow = Pick<
  Database["public"]["Tables"]["feedback"]["Row"],
  "id" | "display_name" | "is_anonymous" | "content" | "attachments" | "status" | "created_at"
>
type FeedbackReplyRow = Database["public"]["Tables"]["feedback_replies"]["Row"]

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

function isMissingFeedbackColumns(error: unknown) {
  if (!error || typeof error !== "object") return false

  const message = "message" in error ? String(error.message ?? "").toLowerCase() : ""
  return (
    message.includes("category") ||
    message.includes("source_path") ||
    message.includes("source_label") ||
    message.includes("locale") ||
    message.includes("metadata")
  )
}

function parseAttachmentList(value: Json): z.infer<typeof attachmentSchema>[] {
  if (!Array.isArray(value)) return []

  const parsedList: z.infer<typeof attachmentSchema>[] = []
  for (const item of value) {
    const parsed = attachmentSchema.safeParse(item)
    if (parsed.success) {
      parsedList.push(parsed.data)
    }
  }
  return parsedList
}

function toReplyItem(row: FeedbackReplyRow) {
  return {
    id: row.id,
    authorRole: row.author_role as "user" | "developer",
    authorName: row.author_name,
    content: row.content,
    createdAt: row.created_at,
  }
}

function toFeedbackItem(row: FeedbackRow, replies: FeedbackReplyRow[]) {
  return {
    id: row.id,
    displayName: row.display_name,
    isAnonymous: row.is_anonymous,
    content: row.content,
    attachments: parseAttachmentList(row.attachments),
    category: row.category as FeedbackCategory,
    sourcePath: row.source_path,
    sourceLabel: row.source_label,
    locale: row.locale,
    metadata: parseFeedbackMetadata(row.metadata),
    status: row.status as "open" | "replied" | "closed",
    createdAt: row.created_at,
    replies: replies.map(toReplyItem),
  }
}

function toLegacyFeedbackItem(row: LegacyFeedbackRow, replies: FeedbackReplyRow[]) {
  return {
    id: row.id,
    displayName: row.display_name,
    isAnonymous: row.is_anonymous,
    content: row.content,
    attachments: parseAttachmentList(row.attachments),
    category: "other" as FeedbackCategory,
    sourcePath: null,
    sourceLabel: null,
    locale: null,
    metadata: {},
    status: row.status as "open" | "replied" | "closed",
    createdAt: row.created_at,
    replies: replies.map(toReplyItem),
  }
}

function escapeLikePattern(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}

function toJsonObject(
  value: Record<string, string | number | boolean | null | undefined>,
): Json {
  const result: Record<string, Json> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue
    result[key] = item
  }
  return result
}

export async function GET(request: Request) {
  const access = await requireRouteActorAnyRole(["subject_teacher", "admin"], {
    nextPath: "/main/feedback",
  })
  if (access.response) {
    return access.response
  }

  const url = new URL(request.url)
  const parsedQuery = querySchema.safeParse({
    page: url.searchParams.get("page") ?? "1",
    limit: url.searchParams.get("limit") ?? "20",
    search: url.searchParams.get("search") ?? "",
    filter: url.searchParams.get("filter") ?? "all",
    scope: url.searchParams.get("scope") ?? "mine",
  })

  if (!parsedQuery.success) {
    return jsonError("VALIDATION_ERROR", "查询参数不合法", 400, parsedQuery.error.flatten())
  }

  const { page, limit, search, filter, scope } = parsedQuery.data
  const normalizedSearch = search.trim()
  const from = (page - 1) * limit
  const to = from + limit - 1
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const authBypass = isAuthBypassEnabled() || process.env.E2E_TEST === "1"

  const isAdminScope = scope === "all"
  if (isAdminScope) {
    const access = await getFeedbackAdminAccess({
      teacherId: user?.id ?? (authBypass ? process.env.AUTH_BYPASS_USER_ID ?? null : null),
      authBypass,
      appMetadata: user?.app_metadata ?? null,
    })
    if (!access.teacherId) {
      return jsonError("UNAUTHORIZED", "请先登录", 401)
    }
    if (!access.allowed) {
      return jsonError("FORBIDDEN", "无权访问反馈后台", 403)
    }
  }

  if (!isAdminScope && !user && !authBypass) {
    return jsonError("UNAUTHORIZED", "请先登录", 401)
  }

  let teacherId: string | null = null
  if (!isAdminScope && (user || authBypass)) {
    const ensured = await ensureTeacher({ supabase, user, authBypass })
    teacherId = ensured.teacherId
  }

  const admin = createAdminSupabaseClient()
  let hasReplyIds: string[] | null = null

  if (filter === "has_reply") {
    let repliedQuery = admin
      .from("feedback_replies")
      .select("feedback_id")
      .eq("author_role", "developer")

    if (!isAdminScope && teacherId) {
      const { data: ownFeedbackRows, error: ownFeedbackError } = await admin
        .from("feedback")
        .select("id")
        .eq("teacher_id", teacherId)

      if (ownFeedbackError) {
        if (isMissingFeedbackTables(ownFeedbackError)) {
          const fallback = await listDevFeedback({
            page,
            limit,
            search: normalizedSearch,
            filter,
            teacherId,
            scope,
          })
          return NextResponse.json({
            items: fallback.items.map((row) =>
              toFeedbackItem(row, fallback.repliesMap.get(row.id) ?? []),
            ),
            total: fallback.total,
            page,
            limit,
          })
        }

        console.error("读取个人反馈索引失败", ownFeedbackError)
        return jsonError("INTERNAL_ERROR", "读取反馈失败", 500)
      }

      const ownFeedbackIds = (ownFeedbackRows ?? []).map((row) => row.id)
      if (ownFeedbackIds.length === 0) {
        return NextResponse.json({ items: [], total: 0, page, limit })
      }
      repliedQuery = repliedQuery.in("feedback_id", ownFeedbackIds)
    }

    const { data: repliedRows, error: repliedError } = await repliedQuery

    if (repliedError) {
      if (isMissingFeedbackTables(repliedError)) {
        const fallback = await listDevFeedback({
          page,
          limit,
          search: normalizedSearch,
          filter,
          teacherId,
          scope,
        })
        return NextResponse.json({
          items: fallback.items.map((row) =>
            toFeedbackItem(row, fallback.repliesMap.get(row.id) ?? []),
          ),
          total: fallback.total,
          page,
          limit,
        })
      }

      console.error("读取开发者回复索引失败", repliedError)
      return jsonError("INTERNAL_ERROR", "读取反馈回复失败", 500)
    }

    hasReplyIds = [...new Set((repliedRows ?? []).map((row) => row.feedback_id))]
    if (hasReplyIds.length === 0) {
      return NextResponse.json({
        items: [],
        total: 0,
        page,
        limit,
      })
    }
  }

  let feedbackQuery = admin.from("feedback").select(
    "id,display_name,is_anonymous,content,attachments,category,source_path,source_label,locale,metadata,status,created_at",
    {
      count: "exact",
    },
  )

  if (normalizedSearch) {
    const searchValue = `%${escapeLikePattern(normalizedSearch)}%`
    feedbackQuery = feedbackQuery.or(
      [
        `content.ilike.${searchValue}`,
        `source_path.ilike.${searchValue}`,
        `source_label.ilike.${searchValue}`,
        `category.ilike.${searchValue}`,
      ].join(","),
    )
  }

  if (!isAdminScope) {
    if (!teacherId) {
      return NextResponse.json({ items: [], total: 0, page, limit })
    }
    feedbackQuery = feedbackQuery.eq("teacher_id", teacherId)
  }

  if (filter === "open") {
    feedbackQuery = feedbackQuery.eq("status", "open")
  } else if (filter === "replied") {
    feedbackQuery = feedbackQuery.eq("status", "replied")
  } else if (filter === "has_reply" && hasReplyIds) {
    feedbackQuery = feedbackQuery.in("id", hasReplyIds)
  }

  let legacyMode = false
  let feedbackRows: FeedbackRow[] | LegacyFeedbackRow[] | null = null
  let feedbackError: unknown = null
  let count: number | null = null

  {
    const result = await feedbackQuery
      .order("created_at", { ascending: false })
      .range(from, to)

    feedbackRows = result.data
    feedbackError = result.error
    count = result.count
  }

  if (feedbackError && isMissingFeedbackColumns(feedbackError)) {
    legacyMode = true

    let legacyQuery = admin.from("feedback").select(
      "id,display_name,is_anonymous,content,attachments,status,created_at",
      {
        count: "exact",
      },
    )

    if (normalizedSearch) {
      legacyQuery = legacyQuery.ilike("content", `%${escapeLikePattern(normalizedSearch)}%`)
    }
    if (!isAdminScope && teacherId) {
      legacyQuery = legacyQuery.eq("teacher_id", teacherId)
    }
    if (filter === "open") {
      legacyQuery = legacyQuery.eq("status", "open")
    } else if (filter === "replied") {
      legacyQuery = legacyQuery.eq("status", "replied")
    } else if (filter === "has_reply" && hasReplyIds) {
      legacyQuery = legacyQuery.in("id", hasReplyIds)
    }

    const legacyResult = await legacyQuery
      .order("created_at", { ascending: false })
      .range(from, to)

    feedbackRows = legacyResult.data
    feedbackError = legacyResult.error
    count = legacyResult.count
  }

  if (feedbackError) {
    if (isMissingFeedbackTables(feedbackError)) {
      const fallback = await listDevFeedback({
        page,
        limit,
        search: normalizedSearch,
        filter,
        teacherId,
        scope,
      })
      return NextResponse.json({
        items: fallback.items.map((row) =>
          toFeedbackItem(row, fallback.repliesMap.get(row.id) ?? []),
        ),
        total: fallback.total,
        page,
        limit,
      })
    }

    console.error("获取反馈列表失败", feedbackError)
    return jsonError("INTERNAL_ERROR", "读取反馈列表失败", 500)
  }

  const rows = feedbackRows ?? []
  const feedbackIds = rows.map((row) => row.id)

  let repliesRows: FeedbackReplyRow[] = []
  if (feedbackIds.length > 0) {
    const { data, error } = await admin
      .from("feedback_replies")
      .select("id,feedback_id,author_role,author_name,content,created_at")
      .in("feedback_id", feedbackIds)
      .order("created_at", { ascending: true })

    if (error) {
      if (isMissingFeedbackTables(error)) {
        repliesRows = []
      } else {
        console.error("获取反馈回复失败", error)
        return jsonError("INTERNAL_ERROR", "读取反馈回复失败", 500)
      }
    } else {
      repliesRows = data ?? []
    }
  }

  const repliesMap = new Map<string, FeedbackReplyRow[]>()
  for (const reply of repliesRows) {
    const list = repliesMap.get(reply.feedback_id)
    if (list) {
      list.push(reply)
    } else {
      repliesMap.set(reply.feedback_id, [reply])
    }
  }

  return NextResponse.json({
    items: rows.map((row) =>
      legacyMode
        ? toLegacyFeedbackItem(row as LegacyFeedbackRow, repliesMap.get(row.id) ?? [])
        : toFeedbackItem(row as FeedbackRow, repliesMap.get(row.id) ?? []),
    ),
    total: count ?? 0,
    page,
    limit,
  })
}

export async function POST(request: Request) {
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

  try {
    const body = await parseJsonBody<unknown>(request)
    const parsed = createFeedbackSchema.parse(body)

    let teacherId: string | null = null
    let displayName = "匿名用户"

    if (user || authBypass) {
      const ensured = await ensureTeacher({ supabase, user, authBypass })
      teacherId = ensured.teacherId

      const { data: teacher, error: teacherError } = await ensured.supabase
        .from("teachers")
        .select("display_name,full_name")
        .eq("id", teacherId)
        .maybeSingle()

      if (teacherError) {
        console.error("读取教师名称失败", teacherError)
        return jsonError("INTERNAL_ERROR", "读取用户信息失败", 500)
      }

      if (!parsed.isAnonymous) {
        displayName =
          teacher?.display_name?.trim() ||
          teacher?.full_name?.trim() ||
          user?.email?.trim() ||
          "实名用户"
      }
    }

    const requestUserAgent = request.headers.get("user-agent")?.trim() ?? ""
    const metadata = toJsonObject({
      ...parsed.metadata,
      userAgent: parsed.metadata.userAgent?.trim() || requestUserAgent || undefined,
    })

    const admin = createAdminSupabaseClient()
    let { data: inserted, error: insertError } = await admin
      .from("feedback")
      .insert({
        teacher_id: teacherId,
        display_name: displayName,
        is_anonymous: parsed.isAnonymous,
        content: parsed.content,
        attachments: parsed.attachments,
        category: parsed.category,
        source_path: parsed.sourcePath?.trim() || null,
        source_label: parsed.sourceLabel?.trim() || null,
        locale: parsed.locale?.trim() || null,
        metadata,
      })
      .select("id,created_at,display_name,is_anonymous,category,source_path,source_label,locale,metadata,status")
      .single()

    let legacyInserted:
      | Pick<
          Database["public"]["Tables"]["feedback"]["Row"],
          "id" | "created_at" | "display_name" | "is_anonymous" | "status"
        >
      | null = null

    if (insertError && isMissingFeedbackColumns(insertError)) {
      const legacyInsertResult = await admin
        .from("feedback")
        .insert({
          teacher_id: teacherId,
          display_name: displayName,
          is_anonymous: parsed.isAnonymous,
          content: parsed.content,
          attachments: parsed.attachments,
        })
        .select("id,created_at,display_name,is_anonymous,status")
        .single()

      insertError = legacyInsertResult.error
      legacyInserted = legacyInsertResult.data
      inserted = null
    }

    if (insertError) {
      if (isMissingFeedbackTables(insertError)) {
        const fallback = await insertDevFeedback({
          teacherId,
          displayName,
          isAnonymous: parsed.isAnonymous,
          content: parsed.content,
          attachments: parsed.attachments,
          category: parsed.category,
          sourcePath: parsed.sourcePath,
          sourceLabel: parsed.sourceLabel,
          locale: parsed.locale,
          metadata,
        })

        return NextResponse.json({
          id: fallback.id,
          createdAt: fallback.created_at,
          displayName: fallback.display_name,
          isAnonymous: fallback.is_anonymous,
          category: fallback.category,
          sourcePath: fallback.source_path,
          sourceLabel: fallback.source_label,
          locale: fallback.locale,
          metadata: parseFeedbackMetadata(fallback.metadata),
          status: fallback.status,
        })
      }

      console.error("提交反馈失败", insertError)
      return jsonError("DB_WRITE_FAILED", "提交反馈失败", 500)
    }

    if (legacyInserted) {
      return NextResponse.json({
        id: legacyInserted.id,
        createdAt: legacyInserted.created_at,
        displayName: legacyInserted.display_name,
        isAnonymous: legacyInserted.is_anonymous,
        category: "other" as FeedbackCategory,
        sourcePath: null,
        sourceLabel: null,
        locale: null,
        metadata: {},
        status: legacyInserted.status,
      })
    }

    if (!inserted) {
      console.error("提交反馈失败：反馈记录写入后未返回数据")
      return jsonError("DB_WRITE_FAILED", "提交反馈失败", 500)
    }

    return NextResponse.json({
      id: inserted.id,
      createdAt: inserted.created_at,
      displayName: inserted.display_name,
      isAnonymous: inserted.is_anonymous,
      category: inserted.category as FeedbackCategory,
      sourcePath: inserted.source_path,
      sourceLabel: inserted.source_label,
      locale: inserted.locale,
      metadata: parseFeedbackMetadata(inserted.metadata),
      status: inserted.status,
    })
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400)
    }

    if (error instanceof EnsureTeacherError) {
      return jsonError("UNAUTHORIZED", error.message, error.status)
    }

    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten())
    }

    console.error("提交反馈失败", error)
    return jsonError("INTERNAL_ERROR", "提交反馈失败，请稍后重试", 500)
  }
}
