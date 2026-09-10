"use client"

import { useState, useCallback } from "react"
import { apiPostStream } from "@/lib/api/client"
import { parseNDJSON } from "@/lib/api/ndjson"
import { adaptRubric } from "@/lib/api/adapters/rubric"
import type { MockRubric } from "@/components/main/chatflow/types"

interface GenerateRubricParams {
  track?: "ap" | "general"
  courseId?: string
  unitId?: string
  topic?: string
  subjectCategory?: string
  gradeLevel?: string
  teacherRequest: string
}

interface GenerateRubricOptions {
  onProgress?: (rubric: MockRubric) => void
  signal?: AbortSignal
}

type RubricStreamEvent =
  | { type: "meta"; stage?: string }
  | { type: "dimension"; index?: number; total?: number; dimension?: Record<string, unknown> }
  | { type: "complete"; rubric?: Record<string, unknown> }
  | { type: "error"; message?: string }

function readLevelText(levels: unknown, key: "excellent" | "good" | "passing" | "failing") {
  if (!levels || typeof levels !== "object") {
    return ""
  }
  return String((levels as Record<string, unknown>)[key] ?? "")
}

export function useRubric() {
  const [loading, setLoading] = useState(false)

  const generate = useCallback(
    async (
      params: GenerateRubricParams,
      options?: GenerateRubricOptions,
    ): Promise<{ rubric: MockRubric }> => {
      setLoading(true)
      try {
        const response = await apiPostStream(
          "/api/ai/rubric",
          {
            ...params,
            stream: true,
          },
          { timeoutMs: 180000, signal: options?.signal },
        )

        const contentType = response.headers.get("content-type") ?? ""
        if (!contentType.includes("application/x-ndjson")) {
          const payload = (await response.json()) as {
            rubric: Record<string, unknown>
          }
          const adapted = adaptRubric(payload)
          options?.onProgress?.(adapted)
          return {
            rubric: adapted,
          }
        }

        let latestRubric: MockRubric | null = null

        for await (const rawEvent of parseNDJSON<RubricStreamEvent>(response)) {
          if (!rawEvent || typeof rawEvent !== "object") continue
          if (rawEvent.type === "dimension" && rawEvent.dimension && typeof rawEvent.dimension === "object") {
            if (!latestRubric) {
              latestRubric = {
                id: "rubric-stream",
                title: "正在生成 Rubric...",
                dimensions: [],
              }
            }
            const dimensions: MockRubric["dimensions"] = [
              ...latestRubric.dimensions,
              {
                id: String(rawEvent.dimension.id ?? `dim-${latestRubric.dimensions.length + 1}`),
                name: String(rawEvent.dimension.name ?? ""),
                description: String(rawEvent.dimension.description ?? ""),
                weight: Number(rawEvent.dimension.weight ?? 0),
                levels: {
                  excellent: readLevelText(rawEvent.dimension.levels, "excellent"),
                  good: readLevelText(rawEvent.dimension.levels, "good"),
                  passing: readLevelText(rawEvent.dimension.levels, "passing"),
                  failing: readLevelText(rawEvent.dimension.levels, "failing"),
                },
              },
            ]
            latestRubric = {
              ...latestRubric,
              dimensions,
            }
            options?.onProgress?.(latestRubric)
            continue
          }
          if (rawEvent.type === "complete" && rawEvent.rubric && typeof rawEvent.rubric === "object") {
            const adapted = adaptRubric({ rubric: rawEvent.rubric })
            options?.onProgress?.(adapted)
            return {
              rubric: adapted,
            }
          }
          if (rawEvent.type === "error") {
            throw new Error(rawEvent.message ?? "Rubric 生成失败")
          }
        }

        throw new Error("Rubric 流式返回不完整")
      } catch (error) {
        throw error
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  return { generate, loading }
}
