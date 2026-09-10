"use client"

import { useCallback, useEffect, useState } from "react"
import { X } from "lucide-react"
import { apiGet, apiPost } from "@/lib/api/client"
import type { Announcement } from "@/lib/announcements/types"

type AnnouncementListResponse = { items: Announcement[]; total: number }

export default function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [dismissing, setDismissing] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const result = await apiGet<AnnouncementListResponse>("/api/announcements?scope=active")
        if (!cancelled && result.items.length > 0) {
          setAnnouncement(result.items[0])
        }
      } catch {
        // 静默失败，不影响正常使用
      }
    }

    void load()
    return () => { cancelled = true }
  }, [])

  const handleDismiss = useCallback(async () => {
    if (!announcement || dismissing) return
    setDismissing(true)

    try {
      await apiPost(`/api/announcements/${announcement.id}`, {})
    } catch {
      // 即使请求失败也在本地关闭
    }

    setAnnouncement(null)
    setDismissing(false)
  }, [announcement, dismissing])

  if (!announcement) return null

  return (
    <div className="relative z-20 shrink-0 border-b border-[rgba(94,106,210,0.12)] bg-[rgba(94,106,210,0.06)] px-4 py-2.5 md:px-6">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{announcement.title}</p>
          {announcement.content ? (
            <p className="mt-0.5 whitespace-pre-line text-xs leading-5 text-default-500">{announcement.content}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => { void handleDismiss() }}
          disabled={dismissing}
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-default-400 transition-colors hover:bg-black/5 hover:text-default-600"
          aria-label="关闭公告"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
