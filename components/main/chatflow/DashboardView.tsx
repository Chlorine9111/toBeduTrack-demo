"use client"

import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import {
  BookOpen,
  ClipboardList,
  FileText,
  BarChart3,
  Zap,
  ArrowRight,
} from "lucide-react"
import { DASHBOARD_STATS, MOCK_RECENT_WORK } from "./mock-data"
import type { RecentWork } from "./types"

const STAT_ITEMS = [
  {
    key: "totalExercises",
    label: "题库",
    value: DASHBOARD_STATS.totalExercises,
    icon: BookOpen,
    gradient: "from-blue-50 to-indigo-50",
    iconColor: "text-blue-600",
    iconBg: "bg-blue-100",
  },
  {
    key: "totalRubrics",
    label: "Rubric",
    value: DASHBOARD_STATS.totalRubrics,
    icon: ClipboardList,
    gradient: "from-purple-50 to-violet-50",
    iconColor: "text-purple-600",
    iconBg: "bg-purple-100",
  },
  {
    key: "totalWorksheets",
    label: "教案",
    value: DASHBOARD_STATS.totalWorksheets + DASHBOARD_STATS.totalLessonPlans,
    icon: FileText,
    gradient: "from-emerald-50 to-teal-50",
    iconColor: "text-emerald-600",
    iconBg: "bg-emerald-100",
  },
  {
    key: "weeklyGenerated",
    label: "本周生成",
    value: DASHBOARD_STATS.weeklyGenerated,
    icon: Zap,
    gradient: "from-amber-50 to-orange-50",
    iconColor: "text-amber-600",
    iconBg: "bg-amber-100",
  },
] as const

const TYPE_EMOJI_MAP: Record<RecentWork["type"], string> = {
  exercises: "📝",
  rubric: "📊",
  worksheet: "📋",
  "lesson-plan": "📖",
  pdf: "📄",
}

interface DashboardViewProps {
  onRecentClick?: (id: string) => void
}

export default function DashboardView({ onRecentClick }: DashboardViewProps) {
  return (
    <div className="h-full flex flex-col px-6 py-6">
      {/* 标题 */}
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6"
      >
        <h2 className="text-lg font-semibold text-gray-900">
          你的教学仪表盘
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          汇总你的教学资源与最近生成内容
        </p>
      </motion.div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {STAT_ITEMS.map((stat, i) => {
          const Icon = stat.icon
          return (
            <motion.div
              key={stat.key}
              initial={false}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className={cn(
                "relative rounded-xl border border-gray-200 p-4 bg-linear-to-br",
                stat.gradient,
                "hover:shadow-md transition-shadow cursor-default"
              )}
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center mb-3",
                  stat.iconBg
                )}
              >
                <Icon className={cn("w-4 h-4", stat.iconColor)} />
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {stat.value}
              </div>
              <div className="text-xs font-medium text-gray-500 mt-0.5">
                {stat.label}
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* 最近生成 */}
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.25 }}
        className="flex-1"
      >
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-gray-400" />
          最近生成
        </h3>
        <div className="space-y-1">
          {MOCK_RECENT_WORK.map((item, i) => (
            <motion.div
              key={item.id}
              initial={false}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: 0.3 + i * 0.05 }}
              onClick={() => onRecentClick?.(item.id)}
              className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/80 transition-colors cursor-pointer"
            >
              <span className="text-base shrink-0">
                {TYPE_EMOJI_MAP[item.type]}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">
                  {item.title}
                </div>
                <div className="text-xs text-gray-400">{item.detail}</div>
              </div>
              <span className="text-xs text-gray-400 shrink-0">
                {item.timestamp}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* 底部提示 */}
      <motion.div
        initial={false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="mt-6 text-center text-xs text-gray-400"
      >
        开始对话，内容将在这里展示
      </motion.div>
    </div>
  )
}
