import type { ExerciseDifficulty } from "@/types/exercise";
import type { RubricData } from "@/lib/pdf/types";

export interface WorksheetExerciseOption {
  label: string;
  text: string;
  isCorrect?: boolean;
}

export interface WorksheetExercise {
  type: "MC" | "FR" | "fill_in";
  difficulty: ExerciseDifficulty;
  questionText: string;
  options?: WorksheetExerciseOption[];
  correctAnswer?: string;
  solutionSteps?: string;
  parts?: Record<string, unknown> | null;
  totalPoints?: number | null;
  isBlankBlock?: boolean;
  blankContent?: string;
  blankHeight?: number;
  drawingData?: string;
  stimulusImageUrl?: string | null;
  stimulusImageScale?: number;
  sectionTitle?: string;
}

export interface WorksheetRenderInput {
  title: string;
  courseName?: string | null;
  teacherName?: string | null;
  date?: string | null;
  exercises: WorksheetExercise[];
  includeAnswerKey: boolean;
  includeExplanations: boolean;
  rubrics?: RubricData[];
}

export type WorksheetTemplateVariant = "academic" | "friendly";
