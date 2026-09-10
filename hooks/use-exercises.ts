"use client"

import { useState, useCallback } from "react"
import { apiPostStream } from "@/lib/api/client"
import { parseNDJSON } from "@/lib/api/ndjson"
import { adaptExercise, adaptExercises } from "@/lib/api/adapters/exercise"
import type { MockExercise } from "@/components/main/chatflow/types"

interface GenerateExercisesParams {
  track?: "ap" | "general"
  courseId?: string
  unitId?: string
  topic?: string
  subjectCategory?: string
  gradeLevel?: string
  exerciseType: "MC" | "FR" | "MIXED"
  difficulty: number
  count: number
  teacherRequest?: string
}

interface ExerciseStreamProgress {
  current: number
  total: number
  exercises: MockExercise[]
  latest?: MockExercise
}

interface GenerateExercisesOptions {
  onProgress?: (progress: ExerciseStreamProgress) => void
  signal?: AbortSignal
}

type ExerciseStreamEvent =
  | { type: "meta"; total?: number }
  | { type: "exercise"; total?: number; exercise?: Record<string, unknown> }
  | {
      type: "complete"
      total?: number
      exercises?: Record<string, unknown>[]
    }
  | { type: "error"; message?: string }

export function useExercises() {
  const [loading, setLoading] = useState(false)

  const generate = useCallback(
    async (
      params: GenerateExercisesParams,
      options?: GenerateExercisesOptions,
    ): Promise<{ exercises: MockExercise[] }> => {
      setLoading(true)
      try {
        const response = await apiPostStream(
          "/api/ai/exercises/generate",
          {
            ...params,
            exerciseType:
              params.exerciseType === "MIXED" ? "MC" : params.exerciseType,
            stream: true,
          },
          { timeoutMs: 120000, signal: options?.signal },
        )

        const contentType = response.headers.get("content-type") ?? ""
        if (!contentType.includes("application/x-ndjson")) {
          const payload = (await response.json()) as {
            exercises: Record<string, unknown>[]
          }
          return {
            exercises: adaptExercises(payload),
          }
        }

        const exercises: MockExercise[] = []
        let total = params.count

        for await (const rawEvent of parseNDJSON<ExerciseStreamEvent>(response)) {
          if (!rawEvent || typeof rawEvent !== "object") {
            continue
          }

          if (rawEvent.type === "meta") {
            total = Number(rawEvent.total ?? total)
            options?.onProgress?.({ current: exercises.length, total, exercises: [...exercises] })
            continue
          }

          if (rawEvent.type === "exercise") {
            if (!rawEvent.exercise || typeof rawEvent.exercise !== "object") {
              continue
            }
            total = Number(rawEvent.total ?? total)
            const latest = adaptExercise(rawEvent.exercise, exercises.length)
            exercises.push(latest)
            options?.onProgress?.({
              current: exercises.length,
              total,
              exercises: [...exercises],
              latest,
            })
            continue
          }

          if (rawEvent.type === "complete") {
            if (Array.isArray(rawEvent.exercises)) {
              const completeExercises = adaptExercises({ exercises: rawEvent.exercises })
              options?.onProgress?.({
                current: completeExercises.length,
                total: Number(rawEvent.total ?? completeExercises.length),
                exercises: completeExercises,
              })
              return { exercises: completeExercises }
            }
            options?.onProgress?.({
              current: exercises.length,
              total: Number(rawEvent.total ?? exercises.length),
              exercises: [...exercises],
            })
            return { exercises }
          }

          if (rawEvent.type === "error") {
            throw new Error(rawEvent.message ?? "习题生成失败")
          }
        }

        return { exercises }
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
