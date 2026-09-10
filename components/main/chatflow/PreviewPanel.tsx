"use client"

import { useRef } from "react"
import { AnimatePresence, motion } from "motion/react"
import type { PreviewPanelProps } from "./types"
import { useLessonPlanDocument } from "@/hooks/use-lesson-plan-document"
import DashboardView from "./DashboardView"
import ExerciseCard from "./ExerciseCard"
import RubricTable from "./RubricTable"
import PdfMockPreview from "./PdfMockPreview"
import WorksheetPreview from "./WorksheetPreview"
import LessonPlanView from "./LessonPlanView"
import SwipeFilterView from "./SwipeFilterView"
import { Button, Chip } from "@heroui/react"
import { BookOpen, AlertTriangle, ListFilter } from "lucide-react"
import GenerationTimeline, { type TimelineStep } from "./GenerationTimeline"

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="px-6 py-10 text-center">
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 text-sm text-gray-500">{description}</p>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="px-6 py-10 text-center">
      <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold text-gray-900">生成失败</h3>
      <p className="mt-2 text-sm text-gray-600">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onPress={onRetry} className="mt-4">
          重试
        </Button>
      )}
    </div>
  )
}

export default function PreviewPanel({
  content,
  phase,
  tabStatus,
  pdfExporting,
  onExerciseToggleAnswer,
  onExerciseChange,
  onExerciseDelete,
  onExerciseRegenerate,
  onExerciseReorder,
  onRubricChange,
  onWorksheetChange,
  onLessonPlanChange,
  onAction,
  onSwipeComplete,
  timelineSteps,
  timelineElapsed,
  canvasSelection,
  onSelectItem,
  rewriteContext,
  onAcceptRewrite,
  onRejectRewrite,
}: PreviewPanelProps) {
  const draggingIndexRef = useRef<number | null>(null)

  const lessonPlanId = content.type === "lesson-plan" ? content.lessonPlan?.id : undefined
  const fullLessonPlanState = useLessonPlanDocument(
    lessonPlanId,
    content.type === "lesson-plan" && tabStatus === "completed",
  )

  const handleDrop = (toIndex: number) => {
    const fromIndex = draggingIndexRef.current
    draggingIndexRef.current = null
    if (fromIndex == null || fromIndex === toIndex) return
    onExerciseReorder?.(fromIndex, toIndex)
  }

  const renderContent = () => {
    if (content.errorMessage) {
      return (
        <ErrorState
          message={content.errorMessage}
          onRetry={onAction ? () => onAction("retry_last_task") : undefined}
        />
      )
    }

    switch (content.type) {
      case "dashboard":
        return <DashboardView onRecentClick={(id) => onAction?.(`open_recent:${id}`)} />

      case "unit-info":
        return content.unit ? (
          <div className="px-6 py-6">
            <h2 className="mb-1 text-lg font-semibold text-gray-900">
              Unit {content.unit.unitNumber}: {content.unit.title}
            </h2>
            <p className="mb-4 text-sm text-gray-500">
              已有 {content.unit.exerciseCount} 道题 · 上次生成: {content.unit.lastGenerated}
            </p>
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-700">知识点</h3>
              <div className="flex flex-wrap gap-2">
                {content.unit.topics.length > 0 ? (
                  content.unit.topics.map((topic) => (
                    <Chip key={topic} color="accent" size="sm">
                      {topic}
                    </Chip>
                  ))
                ) : (
                  <span className="text-xs text-gray-400">暂无知识点数据</span>
                )}
              </div>
            </div>
          </div>
        ) : null

      case "exercises": {
        const exercises = content.exercises ?? []
        if (exercises.length === 0) {
          if (content.generatingProgress) {
            return (
              <EmptyState
                title={`正在生成习题 ${content.generatingProgress.current}/${content.generatingProgress.total}`}
                description="后端正在流式生成，题目会逐条出现。"
              />
            )
          }
          return <EmptyState title="暂无习题" description="请先通过左侧对话生成真实习题。" />
        }
        return (
          <div className="px-6 py-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">生成的习题</h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  共 {exercises.length} 道题
                  {content.generatingProgress
                    ? ` · 正在生成 ${content.generatingProgress.current}/${content.generatingProgress.total}`
                    : ""}
                </p>
              </div>
              <Chip color="accent" size="sm">
                <BookOpen className="mr-1 inline h-3.5 w-3.5" />
                {exercises.length} 题
              </Chip>
            </div>
            <div className="space-y-4">
              <AnimatePresence initial={false}>
                {exercises.map((ex, i) => (
                  <motion.div
                    key={ex.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                    draggable
                    onDragStart={() => {
                      draggingIndexRef.current = i
                    }}
                    onDragOver={(event: React.DragEvent) => {
                      event.preventDefault()
                    }}
                    onDrop={() => handleDrop(i)}
                  >
                    <ExerciseCard
                      exercise={ex}
                      index={i}
                      phase={phase}
                      isLast={i === exercises.length - 1}
                      onEdit={onExerciseChange}
                      onDelete={onExerciseDelete}
                      onToggleAnswer={onExerciseToggleAnswer}
                      onRegenerate={onExerciseRegenerate}
                      isSelected={canvasSelection?.type === "exercise" && canvasSelection.itemId === ex.id}
                      onSelect={onSelectItem}
                      rewriteContext={canvasSelection?.type === "exercise" && canvasSelection.itemId === ex.id ? rewriteContext : null}
                      onAcceptRewrite={onAcceptRewrite}
                      onRejectRewrite={onRejectRewrite}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
              {tabStatus === "completed" && !content.generatingProgress && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.15 }}
                  className="mt-6 flex justify-center"
                >
                  <Button variant="secondary" onPress={() => onAction?.("enter_swipe")}>
                    <ListFilter className="h-4 w-4" />
                    进入筛选模式
                  </Button>
                </motion.div>
              )}
            </div>
          </div>
        )
      }

      case "rubric": {
        const rubric = content.rubric
        if (!rubric) {
          return <EmptyState title="暂无 Rubric" description="请先生成 Rubric 后再查看详情。" />
        }
        return (
          <RubricTable
            rubric={rubric}
            isCompleted={tabStatus === "completed"}
            pdfExporting={pdfExporting}
            onAction={onAction}
            onChange={onRubricChange}
            canvasSelection={canvasSelection}
            onSelectDimension={onSelectItem}
            rewriteContext={canvasSelection?.type === "rubric-dimension" ? rewriteContext : null}
            onAcceptRewrite={onAcceptRewrite}
            onRejectRewrite={onRejectRewrite}
          />
        )
      }

      case "pdf": {
        const exercises = content.exercises ?? []
        if (exercises.length === 0) {
          return <EmptyState title="暂无导出内容" description="请先生成真实习题后再进行导出。" />
        }
        return (
          <PdfMockPreview
            title={content.pdfTitle ?? "AP Calculus AB/BC"}
            exercises={exercises}
            onAction={onAction}
          />
        )
      }

      case "worksheet": {
        const worksheet = content.worksheet
        const exercises = content.exercises ?? []
        if (!worksheet || exercises.length === 0) {
          return <EmptyState title="暂无练习卷" description="请先生成真实习题，再创建练习卷。" />
        }
        return (
          <WorksheetPreview
            worksheet={worksheet}
            exercises={exercises}
            isCompleted={tabStatus === "completed"}
            pdfExporting={pdfExporting}
            onAction={onAction}
            onChange={onWorksheetChange}
          />
        )
      }

      case "lesson-plan": {
        const lessonPlan = content.lessonPlan
        if (!lessonPlan) return null
        return (
          <LessonPlanView
            lessonPlan={lessonPlan}
            fullDocument={fullLessonPlanState.document}
            fullLoading={fullLessonPlanState.loading}
            fullError={fullLessonPlanState.error}
            isCompleted={tabStatus === "completed"}
            pdfExporting={pdfExporting}
            onChange={onLessonPlanChange}
            onAction={onAction}
            canvasSelection={canvasSelection}
            onSelectStep={onSelectItem}
            rewriteContext={canvasSelection?.type === "lesson-step" ? rewriteContext : null}
            onAcceptRewrite={onAcceptRewrite}
            onRejectRewrite={onRejectRewrite}
          />
        )
      }

      case "swipe-filter": {
        const exercises = content.swipeExercises ?? content.exercises ?? []
        if (exercises.length === 0) {
          return <EmptyState title="暂无可筛选习题" description="请先生成真实习题后再进入筛选模式。" />
        }
        return (
          <SwipeFilterView
            exercises={exercises}
            onSwipeComplete={onSwipeComplete}
            onAction={onAction}
          />
        )
      }

      default:
        return null
    }
  }

  const castSteps = timelineSteps as TimelineStep[] | undefined
  const showTimeline = castSteps && castSteps.some((s) => s.status !== "pending")

  return (
    <div className="bg-white">
      {showTimeline && (
        <div className="border-b border-gray-100 px-6 py-4">
          <GenerationTimeline steps={castSteps} elapsed={timelineElapsed} />
        </div>
      )}
      {renderContent()}
    </div>
  )
}
