import type {
  ExerciseDifficulty,
  ExerciseOption,
  ExerciseType,
} from "@/types/exercise";
import type {
  ExamData,
  ExamSection,
  FRQPart,
  FRQQuestion,
  MCQuestion,
  RubricData,
} from "@/lib/pdf/types";

export interface PdfExercise {
  type: ExerciseType;
  difficulty: ExerciseDifficulty;
  questionText: string;
  options?: ExerciseOption[];
  correctAnswer?: string;
  solutionSteps?: string;
  loIds?: string[];
  ekIds?: string[];
  parts?: Record<string, unknown> | null;
  totalPoints?: number | null;
}

export interface ExercisePdfRenderInput {
  title: string;
  exercises: PdfExercise[];
  includeAnswerKey: boolean;
  includeRubric: boolean;
  pageSize: "A4" | "Letter";
}

export type ExamTemplateVariant = "classic" | "modern";

function mapDifficulty(difficulty: ExerciseDifficulty) {
  switch (difficulty) {
    case "easy":
      return { difficulty: "Easy" as const, label: "基础", level: "easy" as const };
    case "medium":
      return { difficulty: "Medium" as const, label: "中等", level: "medium" as const };
    case "hard":
      return { difficulty: "Hard" as const, label: "进阶", level: "hard" as const };
    default:
      return { difficulty: "Medium" as const, label: "中等", level: "medium" as const };
  }
}

function buildMetaLine(exercise: PdfExercise) {
  const loLine =
    exercise.loIds && exercise.loIds.length > 0
      ? `LO: ${exercise.loIds.join(", ")}`
      : "";
  const ekLine =
    exercise.ekIds && exercise.ekIds.length > 0
      ? `EK: ${exercise.ekIds.join(", ")}`
      : "";
  return [loLine, ekLine].filter(Boolean).join(" · ");
}

function normalizeParts(parts?: Record<string, unknown> | null): FRQPart[] {
  if (!parts || typeof parts !== "object") return [];
  return Object.entries(parts).map(([label, value]) => {
    if (!value || typeof value !== "object") {
      return {
        label,
        prompt: String(value ?? ""),
        points: 0,
      };
    }
    const record = value as Record<string, unknown>;
    const prompt =
      (typeof record.prompt === "string" && record.prompt) ||
      (typeof record.text === "string" && record.text) ||
      (typeof record.question === "string" && record.question) ||
      JSON.stringify(record);
    return {
      label,
      prompt,
      points: typeof record.points === "number" ? record.points : 0,
      blankHeight:
        typeof record.blankHeight === "number" ? record.blankHeight : undefined,
      solution: typeof record.solution === "string" ? record.solution : undefined,
      rubricCriteria: Array.isArray(record.rubricCriteria)
        ? (record.rubricCriteria as string[])
        : undefined,
    };
  });
}

export function createExamDataFromExercises(input: ExercisePdfRenderInput): ExamData {
  const dateLabel = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const mcQuestions = input.exercises
    .filter((exercise) => exercise.type === "MC")
    .map((exercise, index) => {
      const difficulty = mapDifficulty(exercise.difficulty);
      return {
        type: "MC",
        number: index + 1,
        stem: exercise.questionText,
        options: (exercise.options ?? []).map((option) => ({
          label: option.label,
          text: option.text,
        })),
        answer: exercise.correctAnswer ?? "",
        difficulty: difficulty.difficulty,
        difficultyLabel: difficulty.label,
        level: difficulty.level,
        lo: exercise.loIds?.join(", "),
        meta: buildMetaLine(exercise),
      } satisfies MCQuestion;
    });

  const frqQuestions = input.exercises
    .filter((exercise) => exercise.type === "FR")
    .map((exercise, index) => {
      const difficulty = mapDifficulty(exercise.difficulty);
      return {
        type: "FRQ",
        number: index + 1,
        stem: exercise.questionText,
        parts: normalizeParts(exercise.parts),
        difficulty: difficulty.difficulty,
        difficultyLabel: difficulty.label,
        level: difficulty.level,
        solution: exercise.solutionSteps,
        meta: buildMetaLine(exercise),
      } satisfies FRQQuestion;
    });

  const sections: ExamSection[] = [];
  if (mcQuestions.length > 0) {
    sections.push({
      type: "MC",
      title: "Section I：选择题（Multiple Choice）",
      directions: `请为每道题选择最佳答案。（共 ${mcQuestions.length} 题）`,
      questions: mcQuestions,
    });
  }

  if (frqQuestions.length > 0) {
    sections.push({
      type: "FRQ",
      title: "Section II：简答题（FRQ）",
      directions: `请完整写出解题过程，并在空白处作答。（共 ${frqQuestions.length} 题）`,
      questions: frqQuestions,
    });
  }

  return {
    title: input.title,
    subtitle: dateLabel,
    course: input.title,
    sections,
    includeAnswerKey: input.includeAnswerKey,
    includeRubric: input.includeRubric,
  };
}

export function sanitizePdfFileName(value: string) {
  return value
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/[\\/:*?"<>|;\r\n]/g, "-")
    .trim() || "Deskmate-document";
}
