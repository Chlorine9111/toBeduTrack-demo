import type { Json } from "@/types/database"

export const FEEDBACK_CATEGORY_VALUES = [
  "bug",
  "suggestion",
  "content",
  "account",
  "other",
] as const

export type FeedbackCategory = (typeof FEEDBACK_CATEGORY_VALUES)[number]

export const FEEDBACK_STATUS_VALUES = ["open", "replied", "closed"] as const

export type FeedbackStatus = (typeof FEEDBACK_STATUS_VALUES)[number]

export type FeedbackAttachment = {
  url: string
  name: string
  type: string
  size: number
}

export type FeedbackMetadata = {
  currentUrl?: string
  userAgent?: string
  viewportWidth?: number
  viewportHeight?: number
  submittedFrom?: "page" | "drawer"
}

export type FeedbackReply = {
  id: string
  authorRole: "user" | "developer"
  authorName: string
  content: string
  createdAt: string
}

export type FeedbackItem = {
  id: string
  displayName: string
  isAnonymous: boolean
  content: string
  attachments: FeedbackAttachment[]
  status: FeedbackStatus
  createdAt: string
  replies: FeedbackReply[]
  category: FeedbackCategory
  sourcePath: string | null
  sourceLabel: string | null
  locale: string | null
  metadata: FeedbackMetadata
}

export type FeedbackListResponse = {
  items: FeedbackItem[]
  total: number
  page: number
  limit: number
}

export type CreateFeedbackResponse = {
  id: string
  createdAt: string
  displayName?: string
  isAnonymous?: boolean
  status?: FeedbackStatus
  category?: FeedbackCategory
  sourcePath?: string | null
  sourceLabel?: string | null
  locale?: string | null
  metadata?: FeedbackMetadata
}

export function parseFeedbackMetadata(value: Json): FeedbackMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  const record = value as Record<string, unknown>
  const metadata: FeedbackMetadata = {}

  if (typeof record.currentUrl === "string" && record.currentUrl.trim()) {
    metadata.currentUrl = record.currentUrl.trim()
  }
  if (typeof record.userAgent === "string" && record.userAgent.trim()) {
    metadata.userAgent = record.userAgent.trim()
  }
  if (typeof record.viewportWidth === "number" && Number.isFinite(record.viewportWidth)) {
    metadata.viewportWidth = Math.max(0, Math.trunc(record.viewportWidth))
  }
  if (typeof record.viewportHeight === "number" && Number.isFinite(record.viewportHeight)) {
    metadata.viewportHeight = Math.max(0, Math.trunc(record.viewportHeight))
  }
  if (record.submittedFrom === "page" || record.submittedFrom === "drawer") {
    metadata.submittedFrom = record.submittedFrom
  }

  return metadata
}

export function getFeedbackCategoryLabel(category: FeedbackCategory, isZh: boolean) {
  if (category === "bug") return isZh ? "Bug" : "Bug"
  if (category === "suggestion") return isZh ? "建议" : "Suggestion"
  if (category === "content") return isZh ? "内容问题" : "Content"
  if (category === "account") return isZh ? "账户 / 权限" : "Account"
  return isZh ? "其他" : "Other"
}

export function getFeedbackStatusLabel(status: FeedbackStatus, isZh: boolean) {
  if (status === "open") return isZh ? "待处理" : "Open"
  if (status === "replied") return isZh ? "已回复" : "Replied"
  return isZh ? "已关闭" : "Closed"
}
