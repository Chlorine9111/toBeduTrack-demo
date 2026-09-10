"use client"

import { useCallback, useEffect, useState } from "react"
import { Alert, Avatar, Button, Card, Chip, Modal, Spinner } from "@heroui/react";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  MessageSquare,
  RefreshCcw,
  Search,
  SendHorizontal,
  Trash2,
  Wrench,
} from "lucide-react"
import { ApiError, apiDelete, apiGet, apiPost } from "@/lib/api/client"
import {
  getFeedbackCategoryLabel,
  type FeedbackItem,
  type FeedbackListResponse,
  type FeedbackReply,
} from "@/lib/feedback/types"
import { cn } from "@/lib/utils"

type FeedbackStatus = "open" | "replied" | "closed"

type ReplyResponse = {
  id: string
  createdAt: string
}

type DeleteFeedbackResponse = {
  id: string
  deleted: boolean
}

type StatusFilter = "all" | "open" | "replied"

const PAGE_SIZE = 20

function formatTimestamp(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso

  const yyyy = date.getFullYear()
  const mm = `${date.getMonth() + 1}`.padStart(2, "0")
  const dd = `${date.getDate()}`.padStart(2, "0")
  const hh = `${date.getHours()}`.padStart(2, "0")
  const min = `${date.getMinutes()}`.padStart(2, "0")
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`
}

function isImageAttachment(type: string) {
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

function getStatusMeta(status: FeedbackStatus) {
  if (status === "open") {
    return {
      label: "待回复",
      className: "bg-amber-100 text-amber-700",
    }
  }

  if (status === "replied") {
    return {
      label: "已回复",
      className: "bg-green-100 text-green-700",
    }
  }

  return {
    label: "已关闭",
    className: "bg-gray-100 text-gray-500",
  }
}

export default function DevFeedbackPage() {
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [listError, setListError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  const [replyingId, setReplyingId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")
  const [replying, setReplying] = useState(false)
  const [replyError, setReplyError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [previewImageName, setPreviewImageName] = useState("")

  const [overview, setOverview] = useState({ total: 0, open: 0, today: 0 })

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchTodayCount = useCallback(async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let currentPage = 1
    let todayCount = 0

    while (currentPage <= 20) {
      const result = await apiGet<FeedbackListResponse>(`/api/feedback?page=${currentPage}&limit=50&scope=all`)
      if (result.items.length === 0) break

      let hasOlder = false
      for (const item of result.items) {
        const createdAt = new Date(item.createdAt)
        if (!Number.isNaN(createdAt.getTime()) && createdAt >= today) {
          todayCount += 1
        } else {
          hasOlder = true
        }
      }

      if (hasOlder || currentPage * result.limit >= result.total) {
        break
      }

      currentPage += 1
    }

    return todayCount
  }, [])

  const loadOverview = useCallback(async () => {
    try {
      const [allResult, openResult, todayCount] = await Promise.all([
        apiGet<FeedbackListResponse>("/api/feedback?page=1&limit=1&scope=all"),
        apiGet<FeedbackListResponse>("/api/feedback?page=1&limit=1&filter=open&scope=all"),
        fetchTodayCount(),
      ])

      setOverview({
        total: allResult.total,
        open: openResult.total,
        today: todayCount,
      })
    } catch {
      // 统计加载失败时保持静默，不影响主流程
    }
  }, [fetchTodayCount])

  const loadPage = useCallback(
    async (targetPage: number, append: boolean) => {
      setLoading(true)
      setListError(null)

      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          limit: String(PAGE_SIZE),
        })

        const trimmedSearch = debouncedSearch.trim()
        if (trimmedSearch) {
          params.set("search", trimmedSearch)
        }

        if (statusFilter !== "all") {
          params.set("filter", statusFilter)
        }

        params.set("scope", "all")
        const result = await apiGet<FeedbackListResponse>(`/api/feedback?${params.toString()}`)
        setFeedbackList((prev) => (append ? [...prev, ...result.items] : result.items))
        setHasMore(targetPage * result.limit < result.total)
        setPage(targetPage)
        setTotal(result.total)
      } catch (error) {
        if (error instanceof ApiError && error.status === 403) {
          setListError("当前账号没有反馈后台权限")
        } else {
          setListError(getErrorMessage(error, "加载反馈失败，请稍后重试"))
        }
      } finally {
        setLoading(false)
      }
    },
    [debouncedSearch, statusFilter],
  )

  useEffect(() => {
    void loadPage(1, false)
  }, [loadPage])

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  const handleRefresh = async () => {
    setDeleteError(null)
    await Promise.all([loadPage(1, false), loadOverview()])
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
      const created = await apiPost<ReplyResponse>(`/api/feedback/${item.id}/reply`, { content })

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
            status: "replied",
            replies: [...feedback.replies, insertedReply],
          }
        }),
      )
      setReplyingId(null)
      setReplyText("")
      setReplyError(null)
      setExpandedReplies((prev) => {
        const next = new Set(prev)
        next.add(item.id)
        return next
      })
      void loadOverview()
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setReplyError("当前账号没有反馈回复权限")
        return
      }

      setReplyError(getErrorMessage(error, "发送回复失败，请稍后重试"))
    } finally {
      setReplying(false)
    }
  }

  const handleDeleteFeedback = async (item: FeedbackItem) => {
    if (deletingId) return

    const confirmed = window.confirm("确认删除这条反馈吗？删除后无法恢复。")
    if (!confirmed) return

    setDeletingId(item.id)
    setDeleteError(null)

    try {
      const result = await apiDelete<DeleteFeedbackResponse>(`/api/feedback/${item.id}`)
      if (!result.deleted) {
        setDeleteError("删除失败，请稍后重试")
        return
      }

      setFeedbackList((prev) => prev.filter((feedback) => feedback.id !== item.id))
      setExpandedReplies((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })

      if (replyingId === item.id) {
        setReplyingId(null)
        setReplyText("")
        setReplyError(null)
      }

      setTotal((prevTotal) => {
        const nextTotal = Math.max(prevTotal - 1, 0)
        setHasMore(page * PAGE_SIZE < nextTotal)
        return nextTotal
      })

      void loadOverview()
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setDeleteError("当前账号没有删除反馈权限")
        return
      }
      setDeleteError(getErrorMessage(error, "删除失败，请稍后重试"))
    } finally {
      setDeletingId(null)
    }
  }

  const emptyMessage = debouncedSearch.trim()
    ? "未找到匹配反馈"
    : statusFilter === "open"
      ? "暂无待回复反馈"
      : statusFilter === "replied"
        ? "暂无已回复反馈"
        : "暂无反馈数据"

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-5 py-4">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">反馈管理</h1>
            <p className="mt-1 text-xs text-gray-500">集中处理用户反馈并进行开发者回复</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onPress={() => {
                void handleRefresh()
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              刷新
            </Button>
            <div className="inline-flex h-8 items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs text-gray-600">
              <span>总反馈 {overview.total}</span>
              <span>待回复 {overview.open}</span>
              <span>今日新增 {overview.today}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索反馈内容..."
              aria-label="搜索反馈内容"
              className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-700 outline-hidden transition-colors placeholder:text-gray-400 focus:border-indigo-400"
            />
          </label>

          <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
            {[
              { key: "all", label: "全部" },
              { key: "open", label: "待回复" },
              { key: "replied", label: "已回复" },
            ].map((item) => {
              const active = statusFilter === item.key
              return (
                <Button
                  key={item.key}
                  variant={active ? "primary" : "ghost"}
                  onPress={() => setStatusFilter(item.key as StatusFilter)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs transition-colors",
                    active ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100",
                  )}
                >
                  {item.label}
                </Button>
              )
            })}
          </div>
        </div>
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
          {listError && (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{listError}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          {deleteError && (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{deleteError}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          {!loading && feedbackList.length === 0 && !listError && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500">
              {emptyMessage}
            </div>
          )}

          {feedbackList.map((item) => {
            const statusMeta = getStatusMeta(item.status)
            const repliesExpanded = expandedReplies.has(item.id)
            const isReplyingThis = replyingId === item.id
            const isDeletingThis = deletingId === item.id

            return (
              <Card key={item.id} className="px-4 py-4 shadow-xs">
                <Card.Content>
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-sm font-medium text-gray-900">
                    <Avatar size="sm" className="h-7 w-7">
                      <Avatar.Fallback>{item.displayName.charAt(0)}</Avatar.Fallback>
                    </Avatar>
                    <span>{item.displayName}</span>
                    <Chip size="sm" className="bg-slate-100 text-slate-700">
                      {getFeedbackCategoryLabel(item.category, true)}
                    </Chip>
                    <Chip size="sm" className={statusMeta.className}>
                      {statusMeta.label}
                    </Chip>
                  </div>
                  <span className="text-xs text-gray-400">{formatTimestamp(item.createdAt)}</span>
                </div>

                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{item.content}</p>

                {(item.sourceLabel || item.sourcePath || item.locale) && (
                  <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="flex flex-wrap gap-2 text-[11px] text-gray-600">
                      {item.sourceLabel ? (
                        <span className="rounded-full bg-white px-2 py-1">页面: {item.sourceLabel}</span>
                      ) : null}
                      {item.sourcePath ? (
                        <span className="rounded-full bg-white px-2 py-1">{item.sourcePath}</span>
                      ) : null}
                      {item.locale ? (
                        <span className="rounded-full bg-white px-2 py-1">语言: {item.locale}</span>
                      ) : null}
                      {item.metadata.submittedFrom ? (
                        <span className="rounded-full bg-white px-2 py-1">
                          来源: {item.metadata.submittedFrom === "drawer" ? "抽屉反馈" : "反馈页"}
                        </span>
                      ) : null}
                    </div>
                    {item.metadata.currentUrl ? (
                      <p className="mt-2 break-all text-[11px] text-gray-500">{item.metadata.currentUrl}</p>
                    ) : null}
                  </div>
                )}

                {item.attachments.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.attachments.map((attachment) =>
                      isImageAttachment(attachment.type) ? (
                        <button
                          key={`${item.id}-${attachment.url}`}
                          type="button"
                          onClick={() => {
                            setPreviewImageUrl(attachment.url)
                            setPreviewImageName(attachment.name)
                          }}
                          className="group overflow-hidden rounded-lg border border-gray-200 bg-white text-left transition-colors hover:border-indigo-300"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={attachment.url}
                            alt={attachment.name}
                            className="h-24 w-24 object-cover"
                          />
                          <div className="max-w-24 border-t border-gray-100 px-2 py-1">
                            <p className="truncate text-[11px] text-gray-600">{attachment.name}</p>
                          </div>
                        </button>
                      ) : (
                        <a
                          key={`${item.id}-${attachment.url}`}
                          href={attachment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-[320px] items-center gap-2 rounded-md border border-gray-200 px-2 py-2 text-xs text-gray-600 hover:bg-gray-50"
                        >
                          <FileText className="h-4 w-4 text-gray-500" />
                          <span className="truncate">{attachment.name}</span>
                        </a>
                      ),
                    )}
                  </div>
                )}

                <div className="mt-4 border-t border-gray-100 pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <Button
                      variant="ghost"
                      onPress={() => handleToggleReplies(item.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
                    >
                      {repliesExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                      已有 {item.replies.length} 条回复
                    </Button>

                    <div className="inline-flex items-center gap-2">
                      <Button
                        variant="ghost"
                        onPress={() => {
                          void handleDeleteFeedback(item)
                        }}
                        isDisabled={Boolean(deletingId) || replying}
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
                          isDeletingThis
                            ? "cursor-not-allowed border-red-300 bg-red-50 text-red-600"
                            : "border-red-200 text-red-600 hover:bg-red-50",
                        )}
                      >
                        {isDeletingThis ? (
                          <Spinner size="sm" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        删除
                      </Button>

                      {!isReplyingThis ? (
                        <Button
                          variant="ghost"
                          onPress={() => handleStartReply(item.id)}
                          isDisabled={Boolean(deletingId)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-300 px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          回复
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          onPress={() => {
                            setReplyingId(null)
                            setReplyText("")
                            setReplyError(null)
                          }}
                          isDisabled={Boolean(deletingId)}
                          className="inline-flex h-8 items-center rounded-md border border-gray-300 px-2.5 text-xs text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                        >
                          取消
                        </Button>
                      )}
                    </div>
                  </div>

                  {repliesExpanded && item.replies.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {item.replies.map((reply) => {
                        const isDeveloper = reply.authorRole === "developer"
                        return (
                          <div
                            key={reply.id}
                            className={cn(
                              "rounded-lg border px-3 py-2",
                              isDeveloper
                                ? "border-indigo-200 border-l-4 border-l-indigo-500 bg-indigo-50/70"
                                : "border-gray-200 bg-gray-50",
                            )}
                          >
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <div className="inline-flex items-center gap-2 text-xs font-medium">
                                {isDeveloper && <Wrench className="h-3.5 w-3.5 text-indigo-600" />}
                                <span className={isDeveloper ? "text-indigo-700" : "text-gray-700"}>
                                  {reply.authorName}
                                </span>
                                {isDeveloper && (
                                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                                    开发团队
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-gray-400">
                                {formatTimestamp(reply.createdAt)}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                              {reply.content}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {isReplyingThis && (
                    <div className="mt-3 rounded-lg border border-gray-300 bg-white p-2">
                      <textarea
                        value={replyText}
                        onChange={(event) => setReplyText(event.target.value)}
                        rows={2}
                        placeholder="输入回复内容..."
                        className="w-full resize-none rounded-md border-none p-1 text-sm text-gray-800 outline-hidden placeholder:text-gray-400"
                      />

                      {replyError && (
                        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
                          {replyError}
                        </div>
                      )}

                      <div className="mt-2 flex justify-end">
                        <Button
                          variant="primary"
                          onPress={() => {
                            void handleSendReply(item)
                          }}
                          isDisabled={replying || replyText.trim().length === 0}
                          className={cn(
                            "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-white",
                            replying || replyText.trim().length === 0
                              ? "bg-gray-300"
                              : "bg-indigo-600 hover:bg-indigo-700",
                          )}
                        >
                          {replying ? (
                            <Spinner size="sm" />
                          ) : (
                            <SendHorizontal className="h-3.5 w-3.5" />
                          )}
                          发送
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card.Content></Card>
            )
          })}

          <div className="flex items-center justify-between py-1 text-xs text-gray-500">
            <span>当前结果：{feedbackList.length} / {total}</span>

            {!loading && hasMore && (
              <Button
                variant="ghost"
                onPress={() => {
                  void loadPage(page + 1, true)
                }}
                className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50"
              >
                加载更多
              </Button>
            )}
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-gray-500">
              <Spinner size="sm" />
              加载中...
            </div>
          )}
        </div>
      </section>

      <Modal.Backdrop
        isOpen={Boolean(previewImageUrl)}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setPreviewImageUrl(null)
            setPreviewImageName("")
          }
        }}
      >
        <Modal.Container>
          <Modal.Dialog className="max-h-[90vh] sm:max-w-[860px]">
            <header className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-gray-900">附件预览</h2>
                {previewImageName ? (
                  <p className="mt-0.5 truncate text-xs text-gray-500">{previewImageName}</p>
                ) : null}
              </div>
              <Modal.CloseTrigger />
            </header>
            <div className="flex min-h-[320px] items-center justify-center bg-gray-950/95 p-4">
              {previewImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewImageUrl}
                  alt={previewImageName || "反馈附件预览"}
                  className="max-h-[75vh] max-w-full rounded-lg object-contain"
                />
              ) : null}
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  )
}
