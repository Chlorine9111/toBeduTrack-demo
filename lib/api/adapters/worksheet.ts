import type {
  MockExercise,
  MockWorksheet,
  MockWorksheetSection,
} from "@/types/chatflow"

const POINTS_MC = 4
const POINTS_FR = 6

function buildSection(
  id: string,
  title: string,
  instructions: string,
  exercises: MockExercise[],
  pointsPerQuestion: number
): MockWorksheetSection {
  return {
    id,
    title,
    instructions,
    exerciseIds: exercises.map((e) => e.id),
    pointsPerQuestion,
  }
}

export function adaptExercisesToWorksheet(
  exercises: MockExercise[],
  title?: string,
  courseName?: string
): MockWorksheet {
  const safeExercises = Array.isArray(exercises) ? exercises : []

  const mcExercises = safeExercises.filter((e) => e.type === "MC")
  const frExercises = safeExercises.filter((e) => e.type === "FR")

  const sections: MockWorksheetSection[] = []
  let sectionIndex = 0

  if (mcExercises.length > 0) {
    sections.push(
      buildSection(
        `section-${++sectionIndex}`,
        `Part ${String.fromCharCode(64 + sectionIndex)}: Multiple Choice`,
        "Choose the best answer for each question.",
        mcExercises,
        POINTS_MC
      )
    )
  }

  if (frExercises.length > 0) {
    sections.push(
      buildSection(
        `section-${++sectionIndex}`,
        `Part ${String.fromCharCode(64 + sectionIndex)}: Free Response`,
        "Show all your work. Partial credit may be awarded.",
        frExercises,
        POINTS_FR
      )
    )
  }

  const totalPoints = sections.reduce(
    (sum, s) => sum + s.exerciseIds.length * s.pointsPerQuestion,
    0
  )

  return {
    id: "ws-1",
    title: title ?? "Practice Worksheet",
    courseName: courseName ?? "AP Calculus AB",
    totalPoints,
    sections,
  }
}
