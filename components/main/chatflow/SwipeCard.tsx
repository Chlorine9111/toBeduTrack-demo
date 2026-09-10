"use client"

import { useCallback } from "react"
import {
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "motion/react"
import { Card, Chip } from "@heroui/react"
import { cn } from "@/lib/utils"
import QuestionContentWithImages from "@/components/shared/QuestionContentWithImages"
import MathText from "./MathText"
import type { MockExercise, SwipeDecision } from "./types"

interface SwipeCardProps {
  exercise: MockExercise
  index: number
  totalCount: number
  onDecision: (decision: SwipeDecision) => void
  isTop: boolean
}

const SWIPE_THRESHOLD = 100
const FLY_OUT_DISTANCE = 500

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

export default function SwipeCard({
  exercise,
  index,
  totalCount,
  onDecision,
  isTop,
}: SwipeCardProps) {
  // 基于 Context7 文档: useMotionValue + useTransform drag gesture
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-200, 0, 200], [-15, 0, 15])
  const keepOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1])
  const skipOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0])

  const handleDragEnd = useCallback(
    (_event: PointerEvent, info: PanInfo) => {
      const offsetX = info.offset.x

      if (Math.abs(offsetX) > SWIPE_THRESHOLD) {
        const direction = offsetX > 0 ? 1 : -1
        const decision: SwipeDecision = direction > 0 ? "keep" : "discard"

        // 飞出动画：通过设置 x 值触发
        x.set(direction * FLY_OUT_DISTANCE)
        // 延迟调用决定回调，等待飞出动画
        setTimeout(() => {
          onDecision(decision)
        }, 300)
      }
    },
    [onDecision, x]
  )

  return (
    <motion.div
      drag={isTop ? "x" : false}
      dragElastic={0.9}
      onDragEnd={isTop ? handleDragEnd : undefined}
      style={{
        x: isTop ? x : 0,
        rotate: isTop ? rotate : 0,
        pointerEvents: isTop ? "auto" : "none",
      }}
      animate={
        isTop
          ? undefined
          : { x: 0, rotate: 0 }
      }
      className={cn(
        "absolute inset-0 select-none overflow-hidden",
        "bg-white rounded-xl shadow-lg border border-gray-200",
        "p-6 flex flex-col gap-4",
        isTop && "cursor-grab active:cursor-grabbing"
      )}
    >
      {/* KEEP 浮层 */}
      {isTop && (
        <motion.div
          style={{ opacity: keepOpacity }}
          className="absolute top-8 left-8 z-10 rotate-[-15deg] border-4 border-green-500 rounded-lg px-4 py-2"
        >
          <span className="text-3xl font-extrabold text-green-500 tracking-wider">
            KEEP ✓
          </span>
        </motion.div>
      )}

      {/* SKIP 浮层 */}
      {isTop && (
        <motion.div
          style={{ opacity: skipOpacity }}
          className="absolute top-8 right-8 z-10 rotate-15 border-4 border-red-500 rounded-lg px-4 py-2"
        >
          <span className="text-3xl font-extrabold text-red-500 tracking-wider">
            SKIP ✗
          </span>
        </motion.div>
      )}

      {/* 头部：题号 + 难度 */}
      <div className="flex items-center justify-between shrink-0">
        <span className="text-sm font-semibold text-gray-500">
          #{index + 1}/{totalCount}
        </span>
        <Chip size="sm" className={difficultyColors[exercise.difficulty]}>
          {difficultyLabels[exercise.difficulty]}
        </Chip>
      </div>

      {/* 可滚动内容区 */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
        {/* 题目文本 */}
        <QuestionContentWithImages
          content={exercise.questionText}
          textClassName="text-base font-medium leading-relaxed text-gray-900"
          galleryClassName="mt-2 space-y-2"
          figureClassName="bg-white"
          imageClassName="max-h-[220px] w-full object-scale-down"
        />

        {/* 选择题选项 */}
        {exercise.type === "MC" && exercise.options && (
          <div className="flex flex-col gap-2">
            {exercise.options.map((opt) => (
              <div
                key={opt.label}
                className={cn(
                  "flex items-start gap-2 px-3 py-2 rounded-lg text-sm border",
                  opt.isCorrect
                    ? "bg-green-50 border-green-300 text-green-800"
                    : "bg-gray-50 border-gray-200 text-gray-700"
                )}
              >
                <span className="font-semibold w-6">{opt.label}.</span>
                <div className="flex-1">
                  <QuestionContentWithImages
                    content={opt.text}
                    textClassName="text-sm leading-6 text-inherit"
                    galleryClassName="mt-2 grid gap-2"
                    figureClassName="bg-white"
                    imageClassName="max-h-[140px] w-full object-scale-down"
                  />
                </div>
                {opt.isCorrect && (
                  <span className="text-green-600 font-bold">✓</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 问答题解答 */}
        {exercise.type === "FR" && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              参考答案
            </div>
            <div className="whitespace-pre-wrap rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm leading-relaxed text-gray-700">
              <MathText text={exercise.correctAnswer} />
            </div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              解题步骤
            </div>
            <div className="whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm leading-relaxed text-gray-600">
              <MathText text={exercise.solutionSteps} />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
