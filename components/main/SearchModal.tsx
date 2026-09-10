"use client"

import { useEffect, useRef } from "react"
import { Search, X } from "lucide-react"

interface SearchModalProps {
  open: boolean
  onClose: () => void
}

const recentProjects = [
  { id: "1", name: "Simple To-Do Pal", author: "T", time: "13 minutes ago" },
]

export default function SearchModal({ open, onClose }: SearchModalProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={onClose}
    >
      {/* 背景遮罩 */}
      <div className="fixed inset-0 bg-black/50" />

      {/* 弹窗卡片 */}
      <div
        className="relative z-10 w-full max-w-lg rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 搜索栏 */}
        <div className="flex items-center gap-3 px-4 py-3">
          <Search className="h-4 w-4 text-neutral-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search projects"
            className="flex-1 text-sm outline-hidden placeholder:text-neutral-400"
          />
          <button
            onClick={onClose}
            className="h-6 w-6 rounded-md hover:bg-neutral-100 flex items-center justify-center shrink-0"
          >
            <X className="h-4 w-4 text-neutral-400" />
          </button>
        </div>

        {/* 分隔线 */}
        <div className="border-t border-neutral-200" />

        {/* 最近项目 */}
        <div className="p-3">
          <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider px-2 mb-2">
            Recent Projects
          </p>

          <ul>
            {recentProjects.map((project) => (
              <li
                key={project.id}
                className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-neutral-100 cursor-pointer"
              >
                {/* 缩略图占位 */}
                <div className="h-8 w-8 rounded-md bg-neutral-200 shrink-0" />

                {/* 项目名 */}
                <span className="text-sm text-neutral-900 flex-1 truncate">
                  {project.name}
                </span>

                {/* 用户头像 */}
                <div className="h-5 w-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center shrink-0">
                  {project.author}
                </div>

                {/* 时间 */}
                <span className="text-xs text-neutral-400 shrink-0">
                  {project.time}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
