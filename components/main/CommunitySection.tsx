"use client"

import { cn } from "@/lib/utils"
import { MOCK_COMMUNITY_RESOURCES } from "./chatflow/mock-data"
import type { CommunityResource } from "./chatflow/types"

const TYPE_LABELS: Record<CommunityResource["type"], string> = {
  "lesson-plan": "教案",
  exercises: "题库",
  rubric: "Rubric",
  worksheet: "练习卷",
}

const TYPE_COLORS: Record<CommunityResource["type"], string> = {
  "lesson-plan": "bg-emerald-100 text-emerald-700",
  exercises: "bg-blue-100 text-blue-700",
  rubric: "bg-purple-100 text-purple-700",
  worksheet: "bg-amber-100 text-amber-700",
}

interface CommunitySectionProps {
  onCite?: (resource: CommunityResource) => void
}

export default function CommunitySection({ onCite }: CommunitySectionProps) {
  return (
    <div>
      {/* 分隔线标题 */}
      <div className="flex items-center gap-2 mb-4">
        <div className="h-px flex-1 bg-neutral-200" />
        <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
          教师社区 · 热门教案
        </span>
        <div className="h-px flex-1 bg-neutral-200" />
      </div>

      {/* 横向滚动容器 */}
      <div
        className={cn(
          "flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2",
          "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        )}
      >
        {MOCK_COMMUNITY_RESOURCES.map((resource) => (
          <div
            key={resource.id}
            className={cn(
              "flex w-[200px] shrink-0 snap-start flex-col rounded-xl border border-neutral-200 bg-white p-4",
              "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            )}
          >
            {/* 头像 + 姓名 + 学校 */}
            <div className="mb-3 flex items-center gap-2">
              <span className="text-2xl">{resource.authorAvatar}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-800 truncate">
                  {resource.authorName}
                </p>
                <p className="text-xs text-neutral-400 truncate">
                  {resource.authorSchool}
                </p>
              </div>
            </div>

            {/* 标题 */}
            <p className="mb-2 text-sm font-semibold text-neutral-800 line-clamp-2 leading-snug">
              {resource.title}
            </p>

            {/* 科目标签 */}
            <span
              className={cn(
                "mb-3 inline-block w-fit rounded-full px-2 py-0.5 text-xs font-medium",
                TYPE_COLORS[resource.type]
              )}
            >
              {TYPE_LABELS[resource.type]}
            </span>

            {/* 评分 + 使用次数 */}
            <div className="mb-3 flex items-center gap-2 text-xs text-neutral-500">
              <span className="flex items-center gap-0.5">
                <span className="text-amber-400">&#11088;</span>
                {resource.rating}
              </span>
              <span>{resource.useCount} 次引用</span>
            </div>

            {/* 引用按钮 */}
            <button
              onClick={() => onCite?.(resource)}
              className="mt-auto text-xs text-neutral-400 transition-colors hover:text-indigo-500"
            >
              引用
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
