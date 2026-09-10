import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import type { FeedbackCategory } from "@/lib/feedback/types"
import type { Json } from "@/types/database"

type DevFeedback = {
  id: string
  teacher_id: string | null
  display_name: string
  is_anonymous: boolean
  content: string
  attachments: Json
  category: FeedbackCategory
  source_path: string | null
  source_label: string | null
  locale: string | null
  metadata: Json
  status: "open" | "replied" | "closed"
  created_at: string
}

type DevFeedbackReply = {
  id: string
  feedback_id: string
  author_role: "user" | "developer"
  author_name: string
  content: string
  created_at: string
}

type DevStore = {
  feedback: DevFeedback[]
  replies: DevFeedbackReply[]
}

type FeedbackFilter = "all" | "open" | "replied" | "has_reply"

const STORE_PATH = join(tmpdir(), "deskmate-feedback-dev-store.json")

async function readStore(): Promise<DevStore> {
  try {
    const raw = await readFile(STORE_PATH, "utf8")
    const parsed = JSON.parse(raw) as Partial<DevStore>
    return {
      feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
      replies: Array.isArray(parsed.replies) ? parsed.replies : [],
    }
  } catch {
    return { feedback: [], replies: [] }
  }
}

async function writeStore(store: DevStore) {
  await mkdir(dirname(STORE_PATH), { recursive: true })
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8")
}

export async function listDevFeedback(params: {
  page: number
  limit: number
  search?: string
  filter?: FeedbackFilter
  teacherId?: string | null
  scope?: "mine" | "all"
}) {
  const {
    page,
    limit,
    search = "",
    filter = "all",
    teacherId = null,
    scope = "mine",
  } = params
  const store = await readStore()

  const start = (page - 1) * limit
  const end = start + limit
  const sortedFeedback = [...store.feedback].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const normalizedSearch = search.trim().toLowerCase()

  const developerRepliedIds = new Set(
    store.replies
      .filter((reply) => reply.author_role === "developer")
      .map((reply) => reply.feedback_id),
  )

  const filtered = sortedFeedback.filter((item) => {
    if (scope === "mine" && teacherId && item.teacher_id !== teacherId) {
      return false
    }

    if (normalizedSearch && !item.content.toLowerCase().includes(normalizedSearch)) {
      const haystack = [
        item.content,
        item.source_path ?? "",
        item.source_label ?? "",
        item.category,
      ]
        .join(" ")
        .toLowerCase()
      if (!haystack.includes(normalizedSearch)) {
        return false
      }
    }

    if (filter === "open" && item.status !== "open") return false
    if (filter === "replied" && item.status !== "replied") return false
    if (filter === "has_reply" && !developerRepliedIds.has(item.id)) return false

    return true
  })

  const items = filtered.slice(start, end)
  const visibleIds = new Set(items.map((item) => item.id))

  const repliesMap = new Map<string, DevFeedbackReply[]>()
  const sortedReplies = [...store.replies].sort((a, b) => a.created_at.localeCompare(b.created_at))
  for (const reply of sortedReplies) {
    if (!visibleIds.has(reply.feedback_id)) continue

    const existing = repliesMap.get(reply.feedback_id)
    if (existing) {
      existing.push(reply)
    } else {
      repliesMap.set(reply.feedback_id, [reply])
    }
  }

  return {
    items,
    repliesMap,
    total: filtered.length,
  }
}

export async function insertDevFeedback(input: {
  teacherId?: string | null
  displayName: string
  isAnonymous: boolean
  content: string
  attachments: Json
  category: FeedbackCategory
  sourcePath?: string | null
  sourceLabel?: string | null
  locale?: string | null
  metadata?: Json
}) {
  const store = await readStore()

  const row: DevFeedback = {
    id: crypto.randomUUID(),
    teacher_id: input.teacherId ?? null,
    display_name: input.displayName,
    is_anonymous: input.isAnonymous,
    content: input.content,
    attachments: input.attachments,
    category: input.category,
    source_path: input.sourcePath ?? null,
    source_label: input.sourceLabel ?? null,
    locale: input.locale ?? null,
    metadata: input.metadata ?? {},
    status: "open",
    created_at: new Date().toISOString(),
  }

  store.feedback.push(row)
  await writeStore(store)
  return row
}

export async function insertDevFeedbackReply(input: {
  feedbackId: string
  authorRole: "user" | "developer"
  authorName: string
  content: string
}) {
  const store = await readStore()
  const feedback = store.feedback.find((item) => item.id === input.feedbackId)
  if (!feedback) return null

  const reply: DevFeedbackReply = {
    id: crypto.randomUUID(),
    feedback_id: input.feedbackId,
    author_role: input.authorRole,
    author_name: input.authorName,
    content: input.content,
    created_at: new Date().toISOString(),
  }

  store.replies.push(reply)
  feedback.status = "replied"

  await writeStore(store)
  return reply
}

export async function deleteDevFeedback(feedbackId: string) {
  const store = await readStore()
  const index = store.feedback.findIndex((item) => item.id === feedbackId)
  if (index < 0) return null

  const [deleted] = store.feedback.splice(index, 1)
  store.replies = store.replies.filter((reply) => reply.feedback_id !== feedbackId)

  await writeStore(store)
  return deleted
}
