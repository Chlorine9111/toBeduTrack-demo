"use client"

import { motion } from "motion/react"
import { Button, Chip } from "@heroui/react"
import { cn } from "@/lib/utils"
import type { MockExercise } from "./types"
import { Save, Download, RefreshCw } from "lucide-react"

interface SwipeResultProps {
  keptExercises: MockExercise[]
  discardedCount: number
  onAction?: (action: string) => void
}

const difficultyLabels: Record<number, string> = {
  1: "基础",
  2: "中等",
  3: "较难",
  4: "困难",
}

const difficultyColors: Record<number, string> = {
  1: "bg-green-100 text-green-700",
  2: "bg-yellow-100 text-yellow-700",
  3: "bg-orange-100 text-orange-700",
  4: "bg-red-100 text-red-700",
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + "..."
}

export default function SwipeResult({
  keptExercises,
  discardedCount,
  onAction,
}: SwipeResultProps) {
  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-lg mx-auto py-6">
      {/* 计数统计 */}
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex items-center gap-8"
      >
        <div className="text-center">
          <motion.span
            initial={false}
            animate={{ scale: [0.5, 1.1, 1] }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="block text-5xl font-extrabold text-green-600"
          >
            {keptExercises.length}
          </motion.span>
          <span className="text-sm text-gray-500 mt-1 block">道保留</span>
        </div>
        <div className="w-px h-12 bg-gray-200" />
        <div className="text-center">
          <motion.span
            initial={false}
            animate={{ scale: [0.5, 1.1, 1] }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.15 }}
            className="block text-5xl font-extrabold text-red-400"
          >
            {discardedCount}
          </motion.span>
          <span className="text-sm text-gray-500 mt-1 block">道淘汰</span>
        </div>
      </motion.div>

      {/* 完成提示 */}
      <motion.p
        initial={false}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="text-gray-600 text-center text-sm"
      >
        筛选完成！以下是你保留的题目：
      </motion.p>

      {/* 保留题目列表 */}
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="w-full flex flex-col gap-2"
      >
        {keptExercises.map((ex, i) => (
          <motion.div
            key={ex.id}
            initial={false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.55 + i * 0.06, duration: 0.3 }}
            className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3"
          >
            <span className="text-xs font-semibold text-gray-400 w-8 shrink-0">
              #{i + 1}
            </span>
            <span className="text-sm text-gray-800 flex-1 leading-snug">
              {truncateText(ex.questionText, 50)}
            </span>
            <Chip size="sm" className={cn("shrink-0", difficultyColors[ex.difficulty])}>
              {difficultyLabels[ex.difficulty]}
            </Chip>
          </motion.div>
        ))}

        {keptExercises.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-6">
            没有保留任何题目
          </div>
        )}
      </motion.div>

      {/* 操作按钮 */}
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.4 }}
        className="flex flex-wrap items-center justify-center gap-3 w-full"
      >
        <Button variant="primary" onPress={() => onAction?.("save_filtered")} className="bg-green-600">
          <Save className="w-4 h-4" />
          保存到题库
        </Button>
        <Button variant="secondary" onPress={() => onAction?.("export_filtered_pdf")}>
          <Download className="w-4 h-4" />
          导出 PDF
        </Button>
        <Button variant="secondary" onPress={() => onAction?.("restart_swipe")}>
          <RefreshCw className="w-4 h-4" />
          重新筛选
        </Button>
      </motion.div>
    </div>
  )
}
