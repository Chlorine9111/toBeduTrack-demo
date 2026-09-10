"use client"

import dynamic from "next/dynamic"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react"
import { usePathname, useRouter } from "next/navigation"
import { Alert, Button, Card, Spinner } from "@heroui/react"
import { ArrowLeft, ChevronDown, ChevronUp, FileText, MessageSquare, Paperclip, Search, SendHorizontal, Trash2, X } from "lucide-react"
import { ApiError, apiDelete, apiGet, apiPost, apiPostFormData } from "@/lib/api/client"
import { useAppI18n } from "@/lib/app-i18n/provider"
import { formatLocaleDateTime } from "@/lib/app-i18n/text"
import {
  getFeedbackCategoryLabel,
  getFeedbackStatusLabel,
  type CreateFeedbackResponse,
  type FeedbackAttachment,
  type FeedbackCategory,
  type FeedbackItem,
  type FeedbackListResponse,
  type FeedbackMetadata,
  type FeedbackReply,
} from "@/lib/feedback/types"
import { cn } from "@/lib/utils"

const AnnouncementManager = dynamic(() => import("./AnnouncementManager"), {
  loading: () => null,
})

type FeedbackCenterProps = {
  mode: "page" | "panel"
  isAdmin?: boolean
  onClose?: () => void
}

type StatusFilter = "all" | "open" | "has_reply"

const PAGE_SIZE = 20
const MAX_ATTACHMENTS = 5
const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_UPLOAD_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
])

const CATEGORY_ORDER: FeedbackCategory[] = ["bug", "suggestion", "content", "account", "other"]

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatTimestamp(iso: string, isZh: boolean, locale: "zh" | "en") {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso

  const diffMs = Date.now() - date.getTime()
  if (diffMs >= 0) {
    const minutes = Math.floor(diffMs / (60 * 1000))
    if (minutes < 1) return isZh ? "刚刚" : "Just now"
    if (minutes < 60) return isZh ? `${minutes} 分钟前` : `${minutes} min ago`

    const hours = Math.floor(minutes / 60)
    if (hours < 24) return isZh ? `${hours} 小时前` : `${hours} hr ago`

    const days = Math.floor(hours / 24)
    if (days <= 7) return isZh ? `${days} 天前` : `${days} day(s) ago`
  }

  return formatLocaleDateTime(locale, date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function isImage(type: string) {
  return type.startsWith("image/")
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.message.trim()) {
    return error.message
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return fallback
}

function normalizeSourceLabel(value: string) {
  return value
    .replace(/\s+—\s+Deskmate$/i, "")
    .replace(/\s+-\s+Deskmate$/i, "")
    .trim()
}

function getStatusBadgeClass(status: FeedbackItem["status"]) {
  if (status === "open") return "bg-[#FAEBDD] text-[#D9730D]"
  if (status === "replied") return "bg-[#DDEDEA] text-[#0F7B6C]"
  return "bg-[#EBECED] text-[#9B9A97]"
}

function getCategoryBadgeClass(category: FeedbackCategory) {
  if (category === "bug") return "bg-[#FBE4E4] text-[#E03E3E]"
  if (category === "suggestion") return "bg-[#DDEBF1] text-[#0B6E99]"
  if (category === "content") return "bg-[#EAE4F2] text-[#6940A5]"
  if (category === "account") return "bg-[#E9E5E3] text-[#64473A]"
  return "bg-[#EBECED] text-[#9B9A97]"
}

export default function FeedbackCenter({ mode, isAdmin, onClose }: FeedbackCenterProps) {
  const { isZh, locale } = useAppI18n()
  const router = useRouter()
  const pathname = usePathname()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [listError, setListError] = useState<string | null>(null)

  const [inputText, setInputText] = useState("")
  const [category, setCategory] = useState<FeedbackCategory>("bug")
  const [isAnonymous, setIsAnonymous] = useState(true)
  const [attachments, setAttachments] = useState<FeedbackAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [dragActive, setDragActive] = useState(false)
  const [sourcePath, setSourcePath] = useState(pathname)
  const [sourceLabel, setSourceLabel] = useState("")
  const [metadata, setMetadata] = useState<FeedbackMetadata>({})

  const [replyingId, setReplyingId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")
  const [replying, setReplying] = useState(false)
  const [replyError, setReplyError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    if (typeof window === "undefined") return

    const nextSourceLabel = normalizeSourceLabel(document.title || "")
    setSourcePath(pathname)
    setSourceLabel(nextSourceLabel)
    setMetadata({
      currentUrl: window.location.href,
      userAgent: window.navigator.userAgent,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      submittedFrom: mode === "page" ? "page" : "drawer",
    })
  }, [mode, pathname])

  const loadPage = useCallback(
    async (targetPage: number, append: boolean) => {
      setLoading(true)
      setListError(null)

      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          limit: String(PAGE_SIZE),
          scope: isAdmin ? "all" : "mine",
        })

        const trimmedSearch = debouncedSearch.trim()
        if (trimmedSearch) {
          params.set("search", trimmedSearch)
        }

        if (statusFilter !== "all") {
          params.set("filter", statusFilter)
        }

        const result = await apiGet<FeedbackListResponse>(`/api/feedback?${params.toString()}`)
        setFeedbackList((prev) => (append ? [...prev, ...result.items] : result.items))
        setHasMore(targetPage * result.limit < result.total)
        setPage(targetPage)
      } catch (error) {
        setListError(
          getErrorMessage(
            error,
            isZh ? "加载反馈失败，请稍后重试" : "Failed to load feedback. Try again shortly.",
          ),
        )
      } finally {
        setLoading(false)
      }
    },
    [debouncedSearch, isAdmin, isZh, statusFilter],
  )

  useEffect(() => {
    void loadPage(1, false)
  }, [loadPage])

  const canSubmit = inputText.trim().length > 0 && !uploading && !submitting
  const showPageContext = !(mode === "page" && pathname === "/main/feedback")
  const sourceCaption = useMemo(
    () => sourceLabel || sourcePath || (isZh ? "当前页面" : "Current page"),
    [isZh, sourceLabel, sourcePath],
  )

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return

      if (attachments.length + files.length > MAX_ATTACHMENTS) {
        setActionError(
          isZh
            ? `最多上传 ${MAX_ATTACHMENTS} 个附件`
            : `You can upload up to ${MAX_ATTACHMENTS} attachments`,
        )
        return
      }

      setActionError(null)
      setSubmitSuccess(null)
      setUploading(true)

      try {
        const uploaded: FeedbackAttachment[] = []
        for (const file of files) {
          if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
            throw new Error(
              isZh
                ? "仅支持 PNG/JPEG/WEBP/GIF 图片或 PDF"
                : "Only PNG/JPEG/WEBP/GIF images or PDF files are supported",
            )
          }
          if (file.size > MAX_FILE_SIZE) {
            throw new Error(
              isZh ? "单个附件大小不能超过 10MB" : "Each attachment must be smaller than 10MB",
            )
          }

          const formData = new FormData()
          formData.append("file", file)

          const uploadedItem = await apiPostFormData<FeedbackAttachment>(
            "/api/feedback/upload",
            formData,
          )
          uploaded.push(uploadedItem)
        }

        setAttachments((prev) => [...prev, ...uploaded])
      } catch (error) {
        setActionError(getErrorMessage(error, isZh ? "上传附件失败" : "Failed to upload attachment"))
      } finally {
        setUploading(false)
      }
    },
    [attachments.length, isZh],
  )

  const handleOpenUploader = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ""
    await uploadFiles(files)
  }

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setDragActive(false)
    const files = Array.from(event.dataTransfer.files ?? [])
    await uploadFiles(files)
  }

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, currentIndex) => currentIndex !== index))
  }

  const handleSubmit = async () => {
    if (!canSubmit) return

    setActionError(null)
    setSubmitSuccess(null)
    setSubmitting(true)

    const content = inputText.trim()

    try {
      const created = await apiPost<CreateFeedbackResponse>("/api/feedback", {
        content,
        category,
        isAnonymous,
        attachments,
        sourcePath,
        sourceLabel,
        locale,
        metadata,
      })

      const inserted: FeedbackItem = {
        id: created.id,
        displayName:
          created.displayName ||
          (isAnonymous
            ? isZh
              ? "匿名用户"
              : "Anonymous user"
            : isZh
              ? "实名用户"
              : "Named user"),
        isAnonymous: created.isAnonymous ?? isAnonymous,
        content,
        attachments,
        category: created.category ?? category,
        sourcePath: created.sourcePath ?? sourcePath,
        sourceLabel: created.sourceLabel ?? sourceLabel,
        locale: created.locale ?? locale,
        metadata: created.metadata ?? metadata,
        status: created.status ?? "open",
        createdAt: created.createdAt,
        replies: [],
      }

      setFeedbackList((prev) => [inserted, ...prev])
      setInputText("")
      setAttachments([])
      setCategory("bug")
      setStatusFilter("all")
      setSearchQuery("")
      setSubmitSuccess(isZh ? "已提交" : "Sent")
    } catch (error) {
      setActionError(
        getErrorMessage(
          error,
          isZh ? "提交反馈失败，请稍后重试" : "Failed to submit feedback. Try again shortly.",
        ),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const isComposing = (event.nativeEvent as { isComposing?: boolean }).isComposing
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !isComposing) {
      event.preventDefault()
      void handleSubmit()
    }
  }

  const handleToggleReplies = (feedbackId: string) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev)
      if (next.has(feedbackId)) {
        next.delete(feedbackId)
      } else {
        next.add(feedbackId)
      }
      return next
    })
  }

  const handleStartReply = (feedbackId: string) => {
    setReplyingId(feedbackId)
    setReplyText("")
    setReplyError(null)
    setExpandedReplies((prev) => {
      const next = new Set(prev)
      next.add(feedbackId)
      return next
    })
  }

  const handleSendReply = async (item: FeedbackItem) => {
    const content = replyText.trim()
    if (!content || replying) return

    setReplying(true)
    setReplyError(null)

    try {
      const created = await apiPost<{ id: string; createdAt: string }>(
        `/api/feedback/${item.id}/reply`,
        { content },
      )

      const insertedReply: FeedbackReply = {
        id: created.id,
        authorRole: "developer",
        authorName: "Deskmate Team",
        content,
        createdAt: created.createdAt,
      }

      setFeedbackList((prev) =>
        prev.map((feedback) => {
          if (feedback.id !== item.id) return feedback
          return {
            ...feedback,
            status: "replied" as const,
            replies: [...feedback.replies, insertedReply],
          }
        }),
      )
      setReplyingId(null)
      setReplyText("")
      setExpandedReplies((prev) => {
        const next = new Set(prev)
        next.add(item.id)
        return next
      })
    } catch (error) {
      setReplyError(
        getErrorMessage(
          error,
          isZh ? "发送回复失败，请稍后重试" : "Failed to send reply. Try again shortly.",
        ),
      )
    } finally {
      setReplying(false)
    }
  }

  const handleDeleteFeedback = async (item: FeedbackItem) => {
    if (deletingId) return

    const confirmed = window.confirm(
      isZh ? "确认删除这条反馈吗？删除后无法恢复。" : "Delete this feedback? This cannot be undone.",
    )
    if (!confirmed) return

    setDeletingId(item.id)
    setDeleteError(null)

    try {
      const result = await apiDelete<{ id: string; deleted: boolean }>(`/api/feedback/${item.id}`)
      if (!result.deleted) {
        setDeleteError(isZh ? "删除失败，请稍后重试" : "Failed to delete. Try again shortly.")
        return
      }

      setFeedbackList((prev) => prev.filter((feedback) => feedback.id !== item.id))
      if (replyingId === item.id) {
        setReplyingId(null)
        setReplyText("")
        setReplyError(null)
      }
    } catch (error) {
      setDeleteError(
        getErrorMessage(
          error,
          isZh ? "删除失败，请稍后重试" : "Failed to delete. Try again shortly.",
        ),
      )
    } finally {
      setDeletingId(null)
    }
  }

  const emptyMessage = debouncedSearch.trim()
    ? isZh
      ? "没有匹配结果"
      : "No matching feedback"
    : statusFilter === "has_reply"
      ? isZh
        ? "还没有回复"
        : "No replies yet"
      : statusFilter === "open"
        ? isZh
          ? "暂无待回复反馈"
          : "No open feedback"
        : isZh
          ? "还没有记录"
          : "No feedback yet"

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-(--bg-page)">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,139,90,0.10),transparent_24%),radial-gradient(circle_at_80%_10%,rgba(55,53,47,0.05),transparent_32%),linear-gradient(180deg,rgba(255,255,255,1),rgba(247,246,243,0.84))]" />
      </div>

      <header className="relative z-10 shrink-0 border-b border-divider/70 bg-white/80 backdrop-blur">
        <div
          className={cn(
            "mx-auto flex w-full items-center gap-3 px-4 py-4 md:px-6",
            mode === "page" ? "" : "",
          )}
        >
          {mode === "page" ? (
            <Button
              isIconOnly
              variant="ghost"
              onPress={() => router.back()}
              className="h-9 w-9 rounded-2xl border border-divider bg-white text-default-500 shadow-xs hover:bg-default-100"
              aria-label={isZh ? "返回" : "Back"}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : null}

          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {isZh ? "告诉我们哪里不顺" : "Tell us what felt off"}
            </h1>
            {showPageContext ? (
              <p className="mt-1 truncate text-sm text-default-500">{sourceCaption}</p>
            ) : null}
          </div>

          {mode === "panel" && onClose ? (
            <Button
              isIconOnly
              variant="ghost"
              onPress={onClose}
              className="h-9 w-9 rounded-2xl border border-divider bg-white text-default-500 shadow-xs hover:bg-default-100"
              aria-label={isZh ? "关闭反馈面板" : "Close feedback panel"}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </header>

      <section className="relative z-10 min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn(
            "mx-auto flex w-full flex-col gap-4 px-4 py-5 md:px-6 md:py-6",
            mode === "page" ? "" : "",
          )}
        >
          <Card
            className={cn(
              "overflow-hidden rounded-[28px] border border-divider bg-white/92 shadow-xs backdrop-blur-sm",
              dragActive ? "ring-2 ring-accent/20" : "",
            )}
          >
            <Card.Content className="space-y-4 p-4 sm:p-5">
              {submitSuccess ? (
                <Alert status="success">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{submitSuccess}</Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}

              {actionError ? (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{actionError}</Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}

              <div className="space-y-2">
                <textarea
                  value={inputText}
                  onChange={(event) => setInputText(event.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder={
                    isZh
                      ? "描述问题，或说明你想要什么。"
                      : "Describe the issue, or tell us what you need."
                  }
                  rows={mode === "page" ? 8 : 6}
                  aria-label={isZh ? "反馈内容" : "Feedback input"}
                  className="min-h-40 w-full resize-y rounded-[24px] border border-divider bg-white px-4 py-4 text-sm leading-6 text-foreground outline-hidden transition-colors placeholder:text-default-400 focus:border-accent/60 focus:ring-2 focus:ring-accent/10"
                />

                <div
                  className={cn(
                    "flex items-center gap-3 text-[11px] text-default-400",
                    showPageContext ? "justify-between" : "justify-end",
                  )}
                >
                  {showPageContext ? <span>{sourceCaption}</span> : null}
                  <span>{inputText.trim().length}/5000</span>
                </div>
              </div>

              <div
                onDragEnter={(event) => {
                  event.preventDefault()
                  setDragActive(true)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragActive(true)
                }}
                onDragLeave={(event) => {
                  event.preventDefault()
                  if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    return
                  }
                  setDragActive(false)
                }}
                onDrop={(event) => {
                  void handleDrop(event)
                }}
                className={cn(
                  "rounded-[24px] border border-dashed px-4 py-3 transition-colors",
                  dragActive
                    ? "border-accent/50 bg-accent/5"
                    : "border-divider bg-default-100/80",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
                    aria-label={isZh ? "反馈分类" : "Feedback category"}
                    className="h-10 rounded-2xl border border-divider bg-white px-3 text-xs text-foreground outline-hidden transition-colors focus:border-accent/60"
                  >
                    {CATEGORY_ORDER.map((item) => (
                      <option key={item} value={item}>
                        {getFeedbackCategoryLabel(item, isZh)}
                      </option>
                    ))}
                  </select>

                  <label className="inline-flex h-10 items-center gap-2 rounded-2xl border border-divider bg-white px-3 text-xs text-default-600">
                    <input
                      type="checkbox"
                      checked={isAnonymous}
                      onChange={(event) => setIsAnonymous(event.target.checked)}
                      className="h-3.5 w-3.5"
                    />
                    <span>{isZh ? "匿名" : "Anonymous"}</span>
                  </label>

                  <Button
                    variant="ghost"
                    onPress={handleOpenUploader}
                    isDisabled={uploading || attachments.length >= MAX_ATTACHMENTS}
                    className="inline-flex h-10 items-center gap-2 rounded-2xl border border-divider bg-white px-3 text-xs font-medium text-foreground hover:bg-default-100"
                  >
                    {uploading ? <Spinner size="sm" /> : <Paperclip className="h-4 w-4" />}
                    {isZh ? "附件" : "Attach"}
                  </Button>

                  <div className="ml-auto text-[11px] text-default-400">
                    {isZh ? `最多 ${MAX_ATTACHMENTS} 个` : `Up to ${MAX_ATTACHMENTS}`}
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    void handleFileSelect(event)
                  }}
                />

                {attachments.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {attachments.map((attachment, index) => (
                      <div
                        key={`${attachment.url}-${index}`}
                        className="inline-flex max-w-full items-center gap-2 rounded-2xl border border-divider bg-white px-2.5 py-2 shadow-xs"
                      >
                        {isImage(attachment.type) ? (
                          <img
                            src={attachment.url}
                            alt={attachment.name}
                            className="h-10 w-10 rounded-xl object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-default-50">
                            <FileText className="h-4 w-4 text-default-500" />
                          </div>
                        )}

                        <div className="min-w-0 max-w-[180px]">
                          <p className="truncate text-xs text-foreground">{attachment.name}</p>
                          <p className="text-[11px] text-default-400">{formatBytes(attachment.size)}</p>
                        </div>

                        <Button
                          isIconOnly
                          variant="ghost"
                          onPress={() => handleRemoveAttachment(index)}
                          className="h-7 w-7 rounded-xl border border-divider bg-white text-default-500 hover:bg-default-100"
                          aria-label={isZh ? "删除附件" : "Remove attachment"}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-default-400">
                    {isZh ? "可拖入截图或 PDF。" : "Drop screenshots or PDF here."}
                  </p>
                )}
              </div>

              <div className="flex justify-end">
                <Button
                  variant="primary"
                  data-tour-id="feedback-submit"
                  onPress={() => {
                    void handleSubmit()
                  }}
                  isDisabled={!canSubmit}
                  className={cn(
                    "inline-flex h-11 items-center gap-2 rounded-2xl px-5 text-sm font-medium text-white shadow-xs",
                    canSubmit ? "bg-accent hover:bg-accent/90" : "bg-default-200",
                  )}
                >
                  {submitting ? <Spinner size="sm" /> : <SendHorizontal className="h-4 w-4" />}
                  {isZh ? "发送" : "Send"}
                </Button>
              </div>
            </Card.Content>
          </Card>

          {isAdmin ? <AnnouncementManager /> : null}

          <div className="min-h-0 w-full space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">{isZh ? "最近记录" : "Recent"}</h2>
                <p className="text-xs text-default-400">
                  {isZh ? "回复会直接显示在这里。" : "Replies appear here."}
                </p>
              </div>

              {mode === "page" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="relative w-[190px] max-w-full">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-default-400" />
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder={isZh ? "搜索" : "Search"}
                      aria-label={isZh ? "搜索反馈" : "Search feedback"}
                      className="h-10 w-full rounded-2xl border border-divider bg-white pl-9 pr-3 text-xs text-foreground outline-hidden transition-colors placeholder:text-default-400 focus:border-accent/60"
                    />
                  </label>

                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                    aria-label={isZh ? "反馈筛选" : "Feedback filter"}
                    className="h-10 rounded-2xl border border-divider bg-white px-3 text-xs text-foreground outline-hidden transition-colors focus:border-accent/60"
                  >
                    <option value="all">{isZh ? "全部" : "All"}</option>
                    {isAdmin ? (
                      <option value="open">{isZh ? "待回复" : "Open"}</option>
                    ) : null}
                    <option value="has_reply">{isZh ? "已回复" : "Replied"}</option>
                  </select>
                </div>
              ) : null}
            </div>

            {listError ? (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{listError}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}

            {!loading && feedbackList.length === 0 && !listError ? (
              <div className="rounded-[24px] border border-dashed border-divider bg-white/92 px-6 py-10 text-center text-sm text-default-500 shadow-xs">
                {emptyMessage}
              </div>
            ) : null}

            {deleteError ? (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{deleteError}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}

            {feedbackList.map((item) => {
              const isReplyingThis = replyingId === item.id
              const isDeletingThis = deletingId === item.id
              const repliesExpanded = expandedReplies.has(item.id)

              return (
              <Card key={item.id} className="rounded-[24px] border border-divider bg-white/92 shadow-xs backdrop-blur-sm">
                <Card.Content className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-default-500">
                    {isAdmin ? (
                      <span className="font-medium text-foreground">{item.displayName}</span>
                    ) : null}
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 font-medium",
                        getStatusBadgeClass(item.status),
                      )}
                    >
                      {getFeedbackStatusLabel(item.status, isZh)}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1",
                        getCategoryBadgeClass(item.category),
                      )}
                    >
                      {getFeedbackCategoryLabel(item.category, isZh)}
                    </span>
                    <span>{formatTimestamp(item.createdAt, isZh, locale)}</span>
                  </div>

                  {item.sourceLabel || item.sourcePath ? (
                    <p className="truncate text-[11px] text-default-400">
                      {item.sourceLabel || item.sourcePath}
                    </p>
                  ) : null}

                  <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{item.content}</p>

                  {item.attachments.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {item.attachments.map((attachment) =>
                        isImage(attachment.type) ? (
                          <a
                            key={`${item.id}-${attachment.url}`}
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="overflow-hidden rounded-2xl border border-divider bg-white shadow-xs"
                          >
                            <img
                              src={attachment.url}
                              alt={attachment.name}
                              className="h-16 w-16 object-cover"
                            />
                          </a>
                        ) : (
                          <a
                            key={`${item.id}-${attachment.url}`}
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-[260px] items-center gap-2 rounded-2xl border border-divider bg-white px-3 py-2 text-xs text-default-500 shadow-xs hover:bg-default-100"
                          >
                            <FileText className="h-4 w-4 text-default-500" />
                            <span className="truncate">{attachment.name}</span>
                          </a>
                        ),
                      )}
                    </div>
                  ) : null}

                  {item.replies.length > 0 ? (
                    <div className="border-t border-black/5 pt-3">
                      {isAdmin ? (
                        <Button
                          variant="ghost"
                          onPress={() => handleToggleReplies(item.id)}
                          className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-default-500 hover:text-foreground"
                        >
                          {repliesExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                          {item.replies.length} {isZh ? "条回复" : item.replies.length === 1 ? "reply" : "replies"}
                        </Button>
                      ) : null}

                      {(!isAdmin || repliesExpanded) ? (
                        <div className="space-y-2">
                          {item.replies.map((reply) => {
                            const isDeveloper = reply.authorRole === "developer"
                            return (
                              <div
                                key={reply.id}
                                className={cn(
                                  "rounded-2xl border px-3 py-2",
                                  isDeveloper
                                    ? "border-[rgba(255,139,90,0.18)] bg-[rgba(255,139,90,0.08)]"
                                    : "border-divider bg-[#F7F6F3]",
                                )}
                              >
                                <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-default-400">
                                  <span className={isDeveloper ? "font-medium text-foreground" : ""}>
                                    {isDeveloper
                                      ? isZh
                                        ? "产品团队"
                                        : "Product team"
                                      : reply.authorName}
                                  </span>
                                  <span>{formatTimestamp(reply.createdAt, isZh, locale)}</span>
                                </div>
                                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                                  {reply.content}
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {isAdmin ? (
                    <div className="border-t border-black/5 pt-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          onPress={() => {
                            void handleDeleteFeedback(item)
                          }}
                          isDisabled={Boolean(deletingId) || replying}
                          className={cn(
                            "inline-flex h-8 items-center gap-1.5 rounded-2xl border px-3 text-xs font-medium transition-colors",
                            isDeletingThis
                              ? "cursor-not-allowed border-red-300 bg-red-50 text-red-600"
                              : "border-divider text-default-500 hover:border-red-200 hover:text-red-600",
                          )}
                        >
                          {isDeletingThis ? (
                            <Spinner size="sm" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          {isZh ? "删除" : "Delete"}
                        </Button>

                        {!isReplyingThis ? (
                          <Button
                            variant="ghost"
                            onPress={() => handleStartReply(item.id)}
                            isDisabled={Boolean(deletingId)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-2xl border border-divider px-3 text-xs font-medium text-default-600 hover:bg-default-100"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            {isZh ? "回复" : "Reply"}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            onPress={() => {
                              setReplyingId(null)
                              setReplyText("")
                              setReplyError(null)
                            }}
                            className="inline-flex h-8 items-center rounded-2xl border border-divider px-3 text-xs text-default-500 hover:bg-default-100"
                          >
                            {isZh ? "取消" : "Cancel"}
                          </Button>
                        )}
                      </div>

                      {isReplyingThis ? (
                        <div className="mt-3 rounded-2xl border border-divider bg-white p-3">
                          <textarea
                            value={replyText}
                            onChange={(event) => setReplyText(event.target.value)}
                            rows={2}
                            placeholder={isZh ? "输入回复内容..." : "Type your reply..."}
                            className="w-full resize-none rounded-xl border-none bg-transparent p-1 text-sm text-foreground outline-hidden placeholder:text-default-400"
                          />

                          {replyError ? (
                            <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
                              {replyError}
                            </div>
                          ) : null}

                          <div className="mt-2 flex justify-end">
                            <Button
                              variant="primary"
                              onPress={() => {
                                void handleSendReply(item)
                              }}
                              isDisabled={replying || replyText.trim().length === 0}
                              className={cn(
                                "inline-flex h-8 items-center gap-1.5 rounded-2xl px-3 text-xs font-medium text-white",
                                replying || replyText.trim().length === 0
                                  ? "bg-default-200"
                                  : "bg-accent hover:bg-accent/90",
                              )}
                            >
                              {replying ? (
                                <Spinner size="sm" />
                              ) : (
                                <SendHorizontal className="h-3.5 w-3.5" />
                              )}
                              {isZh ? "发送" : "Send"}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </Card.Content>
              </Card>
              )
            })}

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-3 text-sm text-default-500">
                <Spinner size="sm" />
                {isZh ? "加载中..." : "Loading..."}
              </div>
            ) : null}

            {!loading && hasMore ? (
              <div className="flex justify-center py-1">
                <Button
                  variant="ghost"
                  onPress={() => {
                    void loadPage(page + 1, true)
                  }}
                  className="inline-flex h-10 items-center rounded-2xl border border-divider bg-white px-4 text-xs font-medium text-foreground shadow-xs hover:bg-default-100"
                >
                  {isZh ? "更多" : "More"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  )
}
