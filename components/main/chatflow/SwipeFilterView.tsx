"use client"

import { useState, useCallback, useMemo } from "react"
import { cn } from "@/lib/utils"
import SwipeCard from "./SwipeCard"
import SwipeResult from "./SwipeResult"
import type { MockExercise, SwipeDecision } from "./types"
import { Button } from "@heroui/react"
import { X, Check, ArrowLeft } from "lucide-react"

interface SwipeFilterViewProps {
  exercises: MockExercise[]
  onSwipeComplete?: (keptExercises: MockExercise[]) => void
  onAction?: (action: string) => void
}

/** 可见卡片数量上限 */
const VISIBLE_CARD_COUNT = 3

/** 堆叠样式配置 */
const stackStyles: Array<{
  scale: number
  translateY: number
  opacity: number
}> = [
  { scale: 1, translateY: 0, opacity: 1 },
  { scale: 0.95, translateY: 8, opacity: 0.7 },
  { scale: 0.9, translateY: 16, opacity: 0.4 },
]

export default function SwipeFilterView({
  exercises,
  onSwipeComplete,
  onAction,
}: SwipeFilterViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [decisions, setDecisions] = useState<Map<string, SwipeDecision>>(
    () => new Map()
  )

  const isComplete = currentIndex >= exercises.length

  // 计算保留和淘汰的题目
  const keptExercises = useMemo(
    () =>
      exercises.filter((ex) => decisions.get(ex.id) === "keep"),
    [exercises, decisions]
  )

  const discardedCount = useMemo(
    () =>
      Array.from(decisions.values()).filter((d) => d === "discard").length,
    [decisions]
  )

  // 已完成筛选的题目数
  const decidedCount = useMemo(
    () =>
      Array.from(decisions.values()).filter(
        (d) => d === "keep" || d === "discard"
      ).length,
    [decisions]
  )

  // 进度百分比
  const progressPercent = exercises.length > 0
    ? Math.round((decidedCount / exercises.length) * 100)
    : 0

  // 处理决定（不可变更新）
  const handleDecision = useCallback(
    (decision: SwipeDecision) => {
      const currentExercise = exercises[currentIndex]
      if (!currentExercise) return

      setDecisions((prev) => {
        const next = new Map(prev)
        next.set(currentExercise.id, decision)
        return next
      })

      const nextIndex = currentIndex + 1
      setCurrentIndex(nextIndex)

      // 检查是否全部完成
      if (nextIndex >= exercises.length) {
        // 计算最终保留的题目（包含当前这道的决定）
        const finalKept = exercises.filter((ex) => {
          if (ex.id === currentExercise.id) return decision === "keep"
          return decisions.get(ex.id) === "keep"
        })
        onSwipeComplete?.(finalKept)
      }
    },
    [currentIndex, exercises, decisions, onSwipeComplete]
  )

  // 按钮点击触发的决定（模拟拖拽飞出效果）
  const handleButtonDecision = useCallback(
    (decision: SwipeDecision) => {
      handleDecision(decision)
    },
    [handleDecision]
  )

  // 当前可见的卡片（最多 3 张）
  const visibleCards = useMemo(() => {
    if (isComplete) return []
    const cards: Array<{ exercise: MockExercise; stackIndex: number }> = []
    for (
      let i = 0;
      i < VISIBLE_CARD_COUNT && currentIndex + i < exercises.length;
      i++
    ) {
      cards.push({
        exercise: exercises[currentIndex + i],
        stackIndex: i,
      })
    }
    return cards
  }, [currentIndex, exercises, isComplete])

  // 结果页面
  if (isComplete) {
    return (
      <div className="flex flex-col h-full">
        {/* 顶部栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <Button variant="ghost" onPress={() => onAction?.("exit_swipe")} className="flex items-center gap-1.5 text-sm text-gray-500">
            <ArrowLeft className="w-4 h-4" />
            退出筛选
          </Button>
          <span className="text-sm font-medium text-gray-700">筛选完成</span>
          <div className="w-16" />
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          <SwipeResult
            keptExercises={keptExercises}
            discardedCount={discardedCount}
            onAction={onAction}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <Button variant="ghost" onPress={() => onAction?.("exit_swipe")} className="flex items-center gap-1.5 text-sm text-gray-500">
          <ArrowLeft className="w-4 h-4" />
          退出筛选
        </Button>
        <span className="text-sm font-medium text-gray-700">
          筛选模式 · {decidedCount}/{exercises.length} 已筛选
        </span>
        <div className="w-16" />
      </div>

      {/* 进度条 */}
      <div className="px-4 pt-3">
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-linear-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 卡片堆叠区域 */}
      <div className="flex-1 flex items-center justify-center px-6 py-4">
        <div className="relative w-full max-w-sm" style={{ height: 420 }}>
          {/* 从底部到顶部渲染，保证顶部卡片在最上层 */}
          {[...visibleCards].reverse().map(({ exercise, stackIndex }) => {
            const style = stackStyles[stackIndex]
            return (
              <div
                key={exercise.id}
                className="absolute inset-0"
                style={{
                  transform: `scale(${style.scale}) translateY(${style.translateY}px)`,
                  opacity: style.opacity,
                  zIndex: VISIBLE_CARD_COUNT - stackIndex,
                  transition:
                    stackIndex > 0
                      ? "transform 0.3s ease-out, opacity 0.3s ease-out"
                      : undefined,
                }}
              >
                <SwipeCard
                  exercise={exercise}
                  index={currentIndex + stackIndex}
                  totalCount={exercises.length}
                  onDecision={handleDecision}
                  isTop={stackIndex === 0}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="flex items-center justify-center gap-8 px-6 pb-6 pt-2">
        <Button
          isIconOnly
          onPress={() => handleButtonDecision("discard")}
          className={cn(
            "flex items-center justify-center w-16 h-16 rounded-full",
            "bg-red-50 border-2 border-red-200 text-red-500",
            "active:scale-90 transition-all duration-150"
          )}
          aria-label="淘汰"
        >
          <X className="w-7 h-7" strokeWidth={2.5} />
        </Button>
        <Button
          isIconOnly
          onPress={() => handleButtonDecision("keep")}
          className={cn(
            "flex items-center justify-center w-16 h-16 rounded-full",
            "bg-green-50 border-2 border-green-200 text-green-500",
            "active:scale-90 transition-all duration-150"
          )}
          aria-label="保留"
        >
          <Check className="w-7 h-7" strokeWidth={2.5} />
        </Button>
      </div>
    </div>
  )
}
