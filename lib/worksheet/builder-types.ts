import type { DocumentModel, QuestionBlock } from "@/lib/doc-engine/block-types";
import type {
  ExerciseContent,
  ExerciseDifficulty,
  ExerciseOption,
  ExerciseType,
} from "@/types/exercise";
import type { WorksheetLayoutConfig } from "@/types/worksheet";

export const WORKSHEET_BUILDER_DRAFT_VERSION = 1;

export type WorksheetBuilderQuestionInstance = {
  instanceId: string;
  originExerciseId: string;
  number: number;
  title: string;
  type: ExerciseType;
  difficulty: ExerciseDifficulty;
  sourceLabel: string | null;
  importedAt: string;
  originSnapshot: {
    content?: ExerciseContent | null;
    questionText: string;
    options: ExerciseOption[] | null;
    correctAnswer: string;
    solutionSteps: string;
  };
  block: QuestionBlock;
};

export type WorksheetBuilderDraft = {
  version: typeof WORKSHEET_BUILDER_DRAFT_VERSION;
  html: string;
  document: DocumentModel;
  questionInstances: WorksheetBuilderQuestionInstance[];
  updatedAt: string;
};

export type WorksheetBuilderSummary = {
  id: string;
  teacherId: string;
  courseId: string;
  unitId: string | null;
  courseName: string | null;
  unitName: string | null;
  title: string;
  description: string | null;
  layoutConfig: WorksheetLayoutConfig;
  status: string;
  pdfUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorksheetBuilderDetail = WorksheetBuilderSummary & {
  builderDraft: WorksheetBuilderDraft;
};
