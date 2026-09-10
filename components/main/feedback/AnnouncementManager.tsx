"use client"

import { useCallback, useEffect, useState } from "react"
import { Alert, Button, Card, Spinner } from "@heroui/react"
import { Megaphone, Plus, Trash2, X } from "lucide-react"
import { ApiError, apiDelete, apiGet, apiPost, apiPatch } from "@/lib/api/client"
import { mapRowToAnnouncement, type Announcement, type AnnouncementListResponse } from "@/lib/announcements/types"
import { cn } from "@/lib/utils"

function formatDate(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const yyyy = date.getFullYear()
  const mm = `${date.getMonth() + 1}`.padStart(2, "0")
  const dd = `${date.getDate()}`.padStart(2, "0")
  const hh = `${date.getHours()}`.padStart(2, "0")
  const min = `${date.getMinutes()}`.padStart(2, "0")
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`
}

export default function AnnouncementManager() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [targetType, setTargetType] = useState<"global" | "school">("global")
  const [targetSchools, setTargetSchools] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [schoolOptions, setSchoolOptions] = useState<string[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadAnnouncements = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiGet<AnnouncementListResponse>("/api/announcements?scope=all")
      setAnnouncements(result.items)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "加载公告失败"
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSchools = useCallback(async () => {
    try {
      const result = await apiGet<{ schools: string[] }>("/api/admin/schools")
      setSchoolOptions(result.schools)
    } catch {
      // 学校列表加载失败不阻塞
    }
  }, [])

  useEffect(() => {
    void loadAnnouncements()
    void loadSchools()
  }, [loadAnnouncements, loadSchools])

  const handleSubmit = async () => {
    if (!title.trim() || submitting) return
    setSubmitting(true)
    setFormError(null)

    try {
      const schools = targetType === "school" ? targetSchools : []

      const created = await apiPost<Announcement>("/api/announcements", {
        title: title.trim(),
        content: content.trim(),
        targetType,
        targetSchools: schools,
      })

      setAnnouncements((prev) => [created, ...prev])
      setTitle("")
      setContent("")
      setTargetType("global")
      setTargetSchools([])
      setShowForm(false)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "发布公告失败"
      setFormError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleActive = async (item: Announcement) => {
    try {
      await apiPatch(`/api/announcements/${item.id}`, { isActive: !item.isActive })
      setAnnouncements((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, isActive: !a.isActive } : a)),
      )
    } catch {
      // 静默
    }
  }

  const handleDelete = async (item: Announcement) => {
    if (deletingId) return
    const confirmed = window.confirm("确认删除这条公告？")
    if (!confirmed) return

    setDeletingId(item.id)
    try {
      await apiDelete(`/api/announcements/${item.id}`)
      setAnnouncements((prev) => prev.filter((a) => a.id !== item.id))
    } catch {
      // 静默
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-default-500" />
          <h2 className="text-sm font-semibold text-foreground">公告管理</h2>
        </div>

        <Button
          variant="ghost"
          onPress={() => setShowForm(!showForm)}
          className="inline-flex h-8 items-center gap-1.5 rounded-2xl border border-divider bg-white px-3 text-xs font-medium text-foreground hover:bg-default-100"
        >
          {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showForm ? "取消" : "发布公告"}
        </Button>
      </div>

      {showForm ? (
        <Card className="rounded-[24px] border border-accent/20 bg-white/92 shadow-xs">
          <Card.Content className="space-y-3 p-4">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="公告标题"
              className="w-full rounded-2xl border border-divider bg-white px-4 py-3 text-sm text-foreground outline-hidden placeholder:text-default-400 focus:border-accent/60"
            />

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="公告内容（可选）"
              rows={3}
              className="w-full resize-none rounded-2xl border border-divider bg-white px-4 py-3 text-sm text-foreground outline-hidden placeholder:text-default-400 focus:border-accent/60"
            />

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as "global" | "school")}
                className="h-10 rounded-2xl border border-divider bg-white px-3 text-xs text-foreground outline-hidden focus:border-accent/60"
              >
                <option value="global">全部用户</option>
                <option value="school">指定学校</option>
              </select>

              {targetType === "school" ? (
                <div className="w-full rounded-2xl border border-divider bg-white px-3 py-2">
                  {schoolOptions.map((school) => (
                    <label key={school} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-xs text-foreground hover:bg-default-50">
                      <input
                        type="checkbox"
                        checked={targetSchools.includes(school)}
                        onChange={() => {
                          setTargetSchools((prev) =>
                            prev.includes(school) ? prev.filter((s) => s !== school) : [...prev, school],
                          )
                        }}
                        className="h-3.5 w-3.5 rounded border-divider accent-accent"
                      />
                      {school}
                    </label>
                  ))}
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-xs text-default-400 hover:bg-default-50">
                    <input
                      type="checkbox"
                      checked={targetSchools.includes("__no_school__")}
                      onChange={() => {
                        setTargetSchools((prev) =>
                          prev.includes("__no_school__") ? prev.filter((s) => s !== "__no_school__") : [...prev, "__no_school__"],
                        )
                      }}
                      className="h-3.5 w-3.5 rounded border-divider accent-accent"
                    />
                    未设置学校
                  </label>
                  {schoolOptions.length === 0 ? (
                    <p className="px-1 py-1.5 text-xs text-default-400">暂无学校数据</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {formError ? (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{formError}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}

            <div className="flex justify-end">
              <Button
                variant="primary"
                onPress={() => { void handleSubmit() }}
                isDisabled={!title.trim() || submitting}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-2xl px-4 text-xs font-medium text-white",
                  !title.trim() || submitting ? "bg-default-200" : "bg-accent hover:bg-accent/90",
                )}
              >
                {submitting ? <Spinner size="sm" /> : <Megaphone className="h-3.5 w-3.5" />}
                发布
              </Button>
            </div>
          </Card.Content>
        </Card>
      ) : null}

      {error ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-3 text-sm text-default-500">
          <Spinner size="sm" />
          加载中...
        </div>
      ) : null}

      {!loading && announcements.length === 0 && !error ? (
        <div className="rounded-[24px] border border-dashed border-divider bg-white/92 px-6 py-8 text-center text-sm text-default-500">
          暂无公告
        </div>
      ) : null}

      {announcements.map((item) => (
        <Card
          key={item.id}
          className={cn(
            "rounded-[24px] border shadow-xs backdrop-blur-sm",
            item.isActive
              ? "border-divider bg-white/92"
              : "border-divider/50 bg-default-50/60 opacity-60",
          )}
        >
          <Card.Content className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      item.isActive ? "bg-[#DDEDEA] text-[#0F7B6C]" : "bg-[#EBECED] text-[#9B9A97]",
                    )}
                  >
                    {item.isActive ? "生效中" : "已停用"}
                  </span>
                  <span className="rounded-full bg-default-100 px-2 py-0.5 text-[11px] text-default-500">
                    {item.targetType === "global"
                      ? "全部"
                      : item.targetSchools.map((s) => s === "__no_school__" ? "未设置学校" : s).join(", ")}
                  </span>
                </div>

                {item.content ? (
                  <p className="mt-1 whitespace-pre-line text-xs leading-5 text-default-500">{item.content}</p>
                ) : null}

                <p className="mt-2 text-[11px] text-default-400">{formatDate(item.createdAt)}</p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="ghost"
                  onPress={() => { void handleToggleActive(item) }}
                  className="h-7 rounded-xl border border-divider px-2.5 text-[11px] text-default-500 hover:bg-default-100"
                >
                  {item.isActive ? "停用" : "启用"}
                </Button>

                <Button
                  variant="ghost"
                  isIconOnly
                  onPress={() => { void handleDelete(item) }}
                  isDisabled={Boolean(deletingId)}
                  className="h-7 w-7 rounded-xl border border-divider text-default-400 hover:border-red-200 hover:text-red-500"
                >
                  {deletingId === item.id ? <Spinner size="sm" /> : <Trash2 className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          </Card.Content>
        </Card>
      ))}
    </div>
  )
}
