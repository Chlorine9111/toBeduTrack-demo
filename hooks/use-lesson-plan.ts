"use client"

import { useState, useCallback } from "react"
import { apiPostStream, ApiError } from "@/lib/api/client"
import { parseLessonStream } from "@/lib/api/ndjson"
import { adaptLessonPlanFromEvents } from "@/lib/api/adapters/lesson-plan"
import type { MockLessonPlan } from "@/components/main/chatflow/types"

interface GenerateLessonPlanParams {
  sourcePrompt?: string
  track?: "ap" | "general"
  topic?: string
  subjectCategory?: string
  gradeLevel?: string
  courseId?: string
  unitId?: string
  duration?: number
  level?: string
  template?: string
  enableWebSearch?: boolean
  materials?: File[]
}

interface GenerateLessonPlanOptions {
  signal?: AbortSignal
  onProgress?: (payload: {
    lessonPlan: MockLessonPlan
    progress: string
    sectionCount: number
    hasPendingSection?: boolean
  }) => void
}

export function useLessonPlan() {
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState("")

  const postStreamWithFormData = useCallback(
    async (
      path: string,
      formData: FormData,
      options?: { timeoutMs?: number; signal?: AbortSignal },
    ) => {
      const controller = new AbortController()
      const relayAbort = () => controller.abort(options?.signal?.reason)
      if (options?.signal) {
        if (options.signal.aborted) {
          relayAbort()
        } else {
          options.signal.addEventListener("abort", relayAbort, { once: true })
        }
      }
      const timer = options?.timeoutMs
        ? setTimeout(() => controller.abort(), options.timeoutMs)
        : undefined
      try {
        const response = await fetch(path, {
          method: "POST",
          credentials: "include",
          body: formData,
          signal: controller.signal,
        })
        if (!response.ok) {
          let message = `HTTP ${response.status}`
          try {
            const errorBody = (await response.json()) as {
              error?: { message?: string } | string
            }
            if (
              errorBody?.error &&
              typeof errorBody.error === "object" &&
              typeof errorBody.error.message === "string"
            ) {
              message = errorBody.error.message
            } else if (typeof errorBody?.error === "string") {
              message = errorBody.error
            }
          } catch {
            // ignore json parse error
          }
          throw new ApiError(response.status, message)
        }
        return response
      } finally {
        if (options?.signal) {
          options.signal.removeEventListener("abort", relayAbort)
        }
        if (timer !== undefined) clearTimeout(timer)
      }
    },
    [],
  )

  const generate = useCallback(
    async (
      params: GenerateLessonPlanParams,
      options?: GenerateLessonPlanOptions,
    ): Promise<{ lessonPlan: MockLessonPlan }> => {
      setLoading(true)
      setProgress("正在分析教学需求...")
      try {
        const materialFiles = Array.isArray(params.materials)
          ? params.materials.filter((file) => file instanceof File)
          : []
        const payload: Omit<GenerateLessonPlanParams, "materials"> = {
          sourcePrompt: params.sourcePrompt,
          track: params.track,
          topic: params.topic,
          subjectCategory: params.subjectCategory,
          gradeLevel: params.gradeLevel,
          courseId: params.courseId,
          unitId: params.unitId,
          duration: params.duration,
          level: params.level,
          template: params.template,
          enableWebSearch: params.enableWebSearch,
        }
        const response =
          materialFiles.length > 0
            ? await postStreamWithFormData(
                "/api/lesson-plans/generate",
                (() => {
                  const formData = new FormData()
                  formData.append("payload", JSON.stringify(payload))
                  materialFiles.forEach((file) => {
                    formData.append("materials", file)
                  })
                  return formData
                })(),
                { timeoutMs: 300000, signal: options?.signal },
              )
            : await apiPostStream(
                "/api/lesson-plans/generate",
                payload,
                { timeoutMs: 300000, signal: options?.signal },
              )

        const contentType = response.headers.get("content-type") ?? ""
        if (
          !contentType.includes("application/x-ndjson") &&
          !contentType.includes("text/event-stream")
        ) {
          const payload = (await response.json()) as {
            message?: string
          }
          if (!response.ok) {
            throw new Error(payload.message ?? "教案生成失败")
          }
          throw new Error("教案接口返回了非流式数据，当前前端暂不支持该格式。")
        }

        const events: Record<string, unknown>[] = []
        let streamCompleted = false
        for await (const event of parseLessonStream(response)) {
          events.push(event)

          const type = event.type as string
          if (type === "error") {
            const message =
              typeof event.message === "string" && event.message.trim()
                ? event.message
                : "教案生成失败"
            throw new Error(message)
          }
          if (type === "complete") {
            streamCompleted = true
          }
          if (type === "meta") {
            setProgress("正在规划教学目标...")
          } else if (type === "section") {
            const section = event.section as { title?: unknown } | undefined
            const sectionTitle =
              typeof section?.title === "string" ? section.title.trim() : ""
            setProgress(sectionTitle ? `正在生成：${sectionTitle}` : "正在生成章节内容...")
          } else if (type === "section_warning" || type === "warning") {
            setProgress("正在修复并校验教案质量...")
          }

          const lessonPlan = adaptLessonPlanFromEvents(events, {
            excludeLastIncomplete: !streamCompleted,
          })
          const hasPendingSection = !streamCompleted && type !== "complete" && events.some(
            (item) =>
              item?.type === "section" &&
              item.section != null &&
              typeof item.section === "object" &&
              !Array.isArray(item.section),
          )
          options?.onProgress?.({
            lessonPlan,
            progress: type === "section"
              ? `已完成 ${lessonPlan.steps.length} 个教学步骤`
              : hasPendingSection
                ? `已完成 ${lessonPlan.steps.length} 个教学步骤，正在生成下一个环节...`
                : "正在生成教案内容...",
            sectionCount: lessonPlan.steps.length,
            hasPendingSection,
          })
        }

        return {
          lessonPlan: adaptLessonPlanFromEvents(events, {
            excludeLastIncomplete: false,
          }),
        }
      } catch (error) {
        throw error
      } finally {
        setLoading(false)
        setProgress("")
      }
    },
    [postStreamWithFormData],
  )

  return { generate, loading, progress }
}
