"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import type { TimelineStep, StepStatus } from "@/components/main/chatflow/GenerationTimeline"

export type GenerationType = "exercises" | "rubric" | "lesson-plan"

function buildInitialSteps(type: GenerationType, total: number): TimelineStep[] {
  if (type === "exercises") {
    return [
      { id: "analyze", label: "分析学习目标与知识点", status: "pending" },
      { id: "prompt", label: "构建提示词", status: "pending" },
      ...Array.from({ length: total }, (_, i) => ({
        id: `exercise-${i + 1}`,
        label: `生成第 ${i + 1}/${total} 道习题`,
        status: "pending" as StepStatus,
      })),
      { id: "review", label: "质量审核", status: "pending" },
    ]
  }

  if (type === "rubric") {
    return [
      { id: "analyze", label: "分析课程标准与评估要求", status: "pending" },
      { id: "prompt", label: "构建评分量规模板", status: "pending" },
      ...Array.from({ length: total }, (_, i) => ({
        id: `dimension-${i + 1}`,
        label: `生成第 ${i + 1}/${total} 个评分维度`,
        status: "pending" as StepStatus,
      })),
      { id: "review", label: "质量审核", status: "pending" },
    ]
  }

  // lesson-plan
  return [
    { id: "analyze", label: "分析教学目标与内容框架", status: "pending" },
    { id: "prompt", label: "设计教学活动序列", status: "pending" },
    ...Array.from({ length: total }, (_, i) => ({
      id: `step-${i + 1}`,
      label: `生成第 ${i + 1}/${total} 个教学环节`,
      status: "pending" as StepStatus,
    })),
    { id: "review", label: "质量审核", status: "pending" },
  ]
}

function setStepStatus(
  steps: readonly TimelineStep[],
  stepId: string,
  status: StepStatus,
  detail?: string,
): TimelineStep[] {
  return steps.map((step) =>
    step.id === stepId
      ? { ...step, status, ...(detail !== undefined ? { detail } : {}) }
      : step,
  )
}

export function useGenerationTimeline() {
  const [steps, setSteps] = useState<TimelineStep[]>([])
  const [elapsed, setElapsed] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const typeRef = useRef<GenerationType>("exercises")

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    startTimeRef.current = Date.now()
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsed(Date.now() - startTimeRef.current)
      }
    }, 200)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (startTimeRef.current) {
      setElapsed(Date.now() - startTimeRef.current)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const start = useCallback(
    (type: GenerationType, total: number) => {
      typeRef.current = type
      const initial = buildInitialSteps(type, total)
      const ready = initial.map((step, i) => {
        if (i === 0) return { ...step, status: "completed" as StepStatus }
        if (i === 1) return { ...step, status: "completed" as StepStatus }
        if (i === 2) return { ...step, status: "active" as StepStatus }
        return step
      })
      setSteps(ready)
      setElapsed(0)
      startTimer()
    },
    [startTimer],
  )

  const onItemComplete = useCallback(
    (index: number, total: number) => {
      const type = typeRef.current
      setSteps((prev) => {
        const itemStepId =
          type === "exercises"
            ? `exercise-${index}`
            : type === "rubric"
              ? `dimension-${index}`
              : `step-${index}`

        let next = setStepStatus(prev, itemStepId, "completed")

        const nextItemId =
          type === "exercises"
            ? `exercise-${index + 1}`
            : type === "rubric"
              ? `dimension-${index + 1}`
              : `step-${index + 1}`

        const nextStep = next.find((s) => s.id === nextItemId)
        if (nextStep) {
          next = setStepStatus(next, nextItemId, "active")
        }

        if (index >= total) {
          next = setStepStatus(next, "review", "active")
        }

        return next
      })
    },
    [],
  )

  const onComplete = useCallback(() => {
    stopTimer()
    setSteps((prev) => setStepStatus(prev, "review", "completed"))
  }, [stopTimer])

  const onError = useCallback(
    (message?: string) => {
      stopTimer()
      setSteps((prev) => {
        const activeStep = prev.find((s) => s.status === "active")
        if (activeStep) {
          return setStepStatus(prev, activeStep.id, "failed", message)
        }
        return prev
      })
    },
    [stopTimer],
  )

  const reset = useCallback(() => {
    stopTimer()
    setSteps([])
    setElapsed(0)
  }, [stopTimer])

  return {
    steps,
    elapsed,
    isActive: steps.length > 0 && !steps.every((s) => s.status === "completed" || s.status === "failed"),
    start,
    onItemComplete,
    onComplete,
    onError,
    reset,
  }
}
