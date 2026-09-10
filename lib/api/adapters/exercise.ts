import type { MockExercise } from "@/types/chatflow"

function sanitizeLatex(text: string): string {
  return text
    .replace(/\x08([a-z])/g, '\\b$1')   // 退格 → \b (begin, binom)
    .replace(/\x09([a-z])/g, '\\t$1')   // 制表 → \t (text, theta)
    .replace(/\x0c([a-z])/g, '\\f$1')   // 换页 → \f (frac, forall)
    .replace(/\x0d([a-z])/g, '\\r$1')   // 回车 → \r (right, rangle)
    .replace(/\x0a(eq|u|abla|eg|otin)\b/g, '\\n$1')  // 换行 → \n (neq, nu, nabla)
}

const DIFFICULTY_MAP: Record<string, 1 | 2 | 3 | 4> = {
  easy: 1,
  medium: 2,
  hard: 3,
  advanced: 4,
  very_hard: 4,
  veryhard: 4,
}

const TYPE_MAP: Record<string, MockExercise["type"]> = {
  MCQ: "MC",
  FRQ: "FR",
  MC: "MC",
  FR: "FR",
  multiple_choice: "MC",
  free_response: "FR",
  fill_in: "FR",
}

function normalizeDifficulty(
  raw: number | string | undefined | null,
  fallbackRaw?: string | undefined,
): 1 | 2 | 3 | 4 {
  if (typeof raw === "number" && raw >= 1 && raw <= 4) return raw as 1 | 2 | 3 | 4
  if (typeof raw === "string") {
    const byLabel = DIFFICULTY_MAP[raw.toLowerCase()]
    if (byLabel) return byLabel
    const byNumber = Number(raw)
    if (byNumber >= 1 && byNumber <= 4) return byNumber as 1 | 2 | 3 | 4
  }
  if (fallbackRaw) {
    const byFallback = DIFFICULTY_MAP[fallbackRaw.toLowerCase()]
    if (byFallback) return byFallback
  }
  if (raw == null) return 2
  if (typeof raw === "number" && raw >= 1 && raw <= 4) return raw as 1 | 2 | 3 | 4
  return 2
}

function normalizeType(raw: Record<string, unknown>): MockExercise["type"] {
  const value = raw.type ?? raw.questionType ?? raw.question_type ?? raw.exerciseType ?? raw.exercise_type
  if (typeof value === "string") {
    const normalized = TYPE_MAP[value] ?? TYPE_MAP[value.toUpperCase()]
    if (normalized) return normalized
  }
  return "MC"
}

function normalizeOptions(
  raw: unknown,
  correctAnswer: string
): Array<{ label: string; text: string; isCorrect: boolean }> | undefined {
  if (raw == null) return undefined

  if (Array.isArray(raw)) {
    const normalized = raw
      .map((item, index) => {
        if (item && typeof item === "object") {
          const opt = item as Record<string, unknown>
          const label = String(opt.label ?? opt.key ?? opt.id ?? String.fromCharCode(65 + index))
          const text = sanitizeLatex(String(opt.text ?? opt.content ?? opt.value ?? ""))
          const explicitCorrect = opt.isCorrect
          return {
            label,
            text,
            isCorrect:
              typeof explicitCorrect === "boolean"
                ? explicitCorrect
                : label === correctAnswer,
          }
        }
        const label = String.fromCharCode(65 + index)
        return {
          label,
          text: sanitizeLatex(String(item ?? "")),
          isCorrect: label === correctAnswer,
        }
      })
      .filter((opt) => opt.text.trim().length > 0)

    return normalized.length > 0 ? normalized : undefined
  }

  if (typeof raw === "object") {
    const normalized = Object.entries(raw as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
      ([label, text]) => ({
        label,
        text: sanitizeLatex(String(text ?? "")),
        isCorrect: label === correctAnswer,
      })
    )
      .filter((opt) => opt.text.trim().length > 0)

    return normalized.length > 0 ? normalized : undefined
  }

  return undefined
}

function pickString(raw: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === "string" && value.trim().length > 0) {
      return value
    }
  }
  return ""
}

export function adaptExercise(
  raw: Record<string, unknown>,
  index: number
): MockExercise {
  const correctAnswer = sanitizeLatex(
    pickString(raw, ["correctAnswer", "correct_answer", "answer"])
  )
  const questionText = sanitizeLatex(
    pickString(raw, ["questionText", "stem", "question_text"])
  )
  const solutionSteps = sanitizeLatex(
    pickString(raw, ["solutionSteps", "solution", "solution_steps"])
  )
  const difficulty = normalizeDifficulty(
    raw.difficulty as number | string | undefined,
    typeof raw.difficultyLabel === "string"
      ? raw.difficultyLabel
      : typeof raw.difficulty_label === "string"
        ? raw.difficulty_label
        : undefined,
  )

  return {
    id: String(raw.id ?? raw.exerciseId ?? raw.exercise_id ?? `ex-${index + 1}`),
    questionText,
    type: normalizeType(raw),
    difficulty,
    options: normalizeOptions(raw.options, correctAnswer),
    correctAnswer,
    solutionSteps,
  }
}

export function adaptExercises(response: {
  exercises: Record<string, unknown>[]
}): MockExercise[] {
  const exercises = response?.exercises
  if (!Array.isArray(exercises)) return []
  return exercises.map((raw, i) => adaptExercise(raw ?? {}, i))
}
