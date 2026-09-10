import type { MockExercise } from "@/types/chatflow"
import type { ScannedQuestion } from "@/lib/pdf-scan/types"

function mapDifficulty(level: string): 1 | 2 | 3 | 4 {
  switch (level) {
    case "easy":
      return 1
    case "medium":
      return 2
    case "hard":
      return 3
    case "expert":
      return 4
    default:
      return 2
  }
}

function mapOptions(
  raw: Record<string, string | undefined> | null,
): Array<{ label: string; text: string; isCorrect: boolean }> | undefined {
  if (!raw) return undefined

  return Object.entries(raw)
    .filter(([, text]) => text != null)
    .map(([label, text]) => ({
      label,
      text: text!,
      isCorrect: false,
    }))
}

export function adaptScannedQuestion(q: ScannedQuestion): MockExercise {
  const isChoice = q.questionType === "choice"

  return {
    id: `scan-${q.questionNumber}-${Date.now()}`,
    questionText: q.content,
    type: isChoice ? "MC" : "FR",
    difficulty: mapDifficulty(q.difficulty),
    options: isChoice ? mapOptions(q.options) : undefined,
    correctAnswer: "",
    solutionSteps: "",
  }
}

export function adaptScannedQuestions(questions: ScannedQuestion[]): MockExercise[] {
  return questions.map(adaptScannedQuestion)
}
