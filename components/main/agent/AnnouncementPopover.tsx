"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Megaphone, X } from "lucide-react"
import { apiGet, apiPost } from "@/lib/api/client"
import type { Announcement } from "@/lib/announcements/types"
import { cn } from "@/lib/utils"

type AnnouncementListResponse = { items: Announcement[]; total: number }

function formatDate(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const mm = `${date.getMonth() + 1}`.padStart(2, "0")
  const dd = `${date.getDate()}`.padStart(2, "0")
  return `${date.getFullYear()}-${mm}-${dd}`
}

export default function AnnouncementPopover() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [open, setOpen] = useState(false)
  const [dismissingId, setDismissingId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const result = await apiGet<AnnouncementListResponse>("/api/announcements?scope=active")
        if (!cancelled && result.items.length > 0) {
          setAnnouncements(result.items)
        }
      } catch {
        // 静默失败
      }
    }

    void load()
    return () => { cancelled = true }
  }, [])

  // 点击外部关闭
  useEffect(() => {
    if (!open) return

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  const handleDismiss = useCallback(async (item: Announcement) => {
    if (dismissingId) return
    setDismissingId(item.id)

    try {
      await apiPost(`/api/announcements/${item.id}`, {})
    } catch {
      // 即使请求失败也在本地移除
    }

    setAnnouncements((prev) => prev.filter((a) => a.id !== item.id))
    setDismissingId(null)
  }, [dismissingId])

  return (
    <div ref={containerRef} className="relative">
      {/* 触发按钮 */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl border border-divider bg-white text-default-500 shadow-xs transition-all hover:bg-default-50 hover:text-foreground",
          open && "bg-default-50 text-foreground",
        )}
        aria-label="查看公告"
      >
        <Megaphone className="h-4 w-4" />
        {announcements.length > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
        ) : null}
      </button>

      {/* 悬浮面板 */}
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[340px] rounded-2xl border border-divider bg-white shadow-lg">
          {/* 面板头 */}
          <div className="flex items-center justify-between border-b border-divider px-4 py-3">
            <div className="flex items-center gap-2">
              <Megaphone className="h-3.5 w-3.5 text-default-400" />
              <span className="text-sm font-medium text-foreground">公告</span>
              <span className="rounded-full bg-default-100 px-1.5 py-0.5 text-[11px] text-default-500">
                {announcements.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-default-400 transition-colors hover:bg-default-100 hover:text-default-600"
              aria-label="关闭"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* 公告列表 */}
          <div className="max-h-[360px] overflow-y-auto p-2">
            {announcements.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-default-400">
                暂无公告
              </div>
            ) : null}
            {announcements.map((item) => (
              <div
                key={item.id}
                className="group relative rounded-xl p-3 transition-colors hover:bg-default-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug text-foreground">
                      {item.title}
                    </p>
                    {item.content ? (
                      <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-default-500">
                        {item.content}
                      </p>
                    ) : null}
                    <p className="mt-1.5 text-[11px] text-default-400">
                      {formatDate(item.createdAt)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => { void handleDismiss(item) }}
                    disabled={dismissingId === item.id}
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-default-300 opacity-0 transition-all hover:bg-default-100 hover:text-default-500 group-hover:opacity-100"
                    aria-label="关闭此公告"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
