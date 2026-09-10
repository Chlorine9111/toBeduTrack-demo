"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { apiGet } from "@/lib/api/client"
import type { LessonPlanDocument } from "@/lib/lesson-plan/types"

type State = {
  loading: boolean
  error: string
  document: LessonPlanDocument | null
}

type UpdateBlockOptions = {
  persist?: boolean
}

type HookState = State & {
  setDocument: (document: LessonPlanDocument | null) => void
  updateBlock: (
    sectionId: string,
    blockId: string,
    newContent: Record<string, unknown>,
    options?: UpdateBlockOptions,
  ) => Promise<boolean>
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
}

export function useLessonPlanDocument(planId?: string, enabled = false): HookState {
  const cacheRef = useRef(new Map<string, LessonPlanDocument>())
  const inflightRef = useRef(new Map<string, Promise<LessonPlanDocument>>())
  const latestDocumentRef = useRef<LessonPlanDocument | null>(null)

  const key = useMemo(() => {
    if (!enabled) return null
    if (!planId) return null
    if (!isUuid(planId)) return null
    return planId
  }, [enabled, planId])

  const [state, setState] = useState<State>({
    loading: Boolean(key),
    error: "",
    document: null,
  })

  useEffect(() => {
    latestDocumentRef.current = state.document
  }, [state.document])

  const setDocument = useCallback(
    (document: LessonPlanDocument | null) => {
      if (key && document) {
        cacheRef.current.set(key, document)
      }
      latestDocumentRef.current = document
      setState((prev) => ({
        ...prev,
        document,
      }))
    },
    [key],
  )

  const persistDocument = useCallback(
    async (document: LessonPlanDocument) => {
      if (!key) return
      const response = await fetch(`/api/lesson-plans/${encodeURIComponent(key)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: document.title,
          sourcePrompt: document.sourcePrompt,
          subjectLabel: document.subjectLabel,
          courseId: document.courseId,
          unitId: document.unitId,
          topicIds: document.topicIds,
          learningObjectiveCodes: document.learningObjectiveCodes,
          essentialKnowledge: document.essentialKnowledge,
          preferences: document.preferences,
          sections: document.sections,
        }),
      })
      if (!response.ok) {
        let message = `HTTP ${response.status}`
        try {
          const body = (await response.json()) as {
            error?: {
              message?: string
            }
          }
          if (body?.error?.message) {
            message = body.error.message
          }
        } catch {
          // Keep fallback message.
        }
        throw new Error(message)
      }
    },
    [key],
  )

  const updateBlock = useCallback(
    async (
      sectionId: string,
      blockId: string,
      newContent: Record<string, unknown>,
      options?: UpdateBlockOptions,
    ) => {
      const current = latestDocumentRef.current
      if (!current) {
        return false
      }

      let updated = false
      const nextSections = current.sections.map((section) => {
        if (section.id !== sectionId) return section
        const nextBlocks = section.blocks.map((block) => {
          if (block.id !== blockId) return block
          updated = true
          return {
            ...block,
            content: newContent,
          }
        })
        return {
          ...section,
          blocks: nextBlocks,
        }
      })

      if (!updated) {
        return false
      }

      const nextDocument: LessonPlanDocument = {
        ...current,
        sections: nextSections,
      }

      latestDocumentRef.current = nextDocument
      if (key) {
        cacheRef.current.set(key, nextDocument)
      }
      setState((prev) => ({
        ...prev,
        document: nextDocument,
      }))

      if (options?.persist) {
        await persistDocument(nextDocument)
      }

      return true
    },
    [key, persistDocument],
  )

  useEffect(() => {
    if (!key) {
      latestDocumentRef.current = null
      setState({ loading: false, error: "", document: null })
      return
    }

    const cached = cacheRef.current.get(key)
    if (cached) {
      latestDocumentRef.current = cached
      setState({ loading: false, error: "", document: cached })
      return
    }

    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: "" }))

    const existing = inflightRef.current.get(key)
    const request =
      existing ??
      (async () => {
        const response = await apiGet<{ lessonPlan: LessonPlanDocument }>(
          `/api/lesson-plans/${encodeURIComponent(key)}`,
        )
        if (!response?.lessonPlan) throw new Error("未返回完整教案数据")
        return response.lessonPlan
      })()

    inflightRef.current.set(key, request)

    void request
      .then((doc) => {
        inflightRef.current.delete(key)
        cacheRef.current.set(key, doc)
        if (cancelled) return
        latestDocumentRef.current = doc
        setState({ loading: false, error: "", document: doc })
      })
      .catch((err) => {
        inflightRef.current.delete(key)
        if (cancelled) return
        const message = err instanceof Error ? err.message : "加载完整教案失败"
        setState({ loading: false, error: message, document: null })
      })

    return () => {
      cancelled = true
    }
  }, [key])

  return {
    ...state,
    setDocument,
    updateBlock,
  }
}
