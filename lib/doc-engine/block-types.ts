import type { LessonPlanBlock } from "@/lib/lesson-plan/types";
import type { ExerciseContentLeaf } from "@/types/exercise";

export type DocumentKind =
  | "worksheet"
  | "exam"
  | "rubric"
  | "lesson-plan"
  | "quiz"
  | "exercises"
  | "notes";

export type DocumentPageSize = "A4" | "Letter";

export type DocumentMargins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type DocumentLayoutConfig = {
  pageSize: DocumentPageSize;
  columns: 1 | 2;
  margins: DocumentMargins;
  headerText?: string | null;
  footerText?: string | null;
  showPageNumbers: boolean;
};

export type DocumentMeta = {
  courseName?: string | null;
  unitName?: string | null;
  teacherName?: string | null;
  schoolLogo?: string | null;
  date?: string | null;
  totalPoints?: number | null;
  duration?: number | null;
  downloadUrl?: string | null;
};

export type HeaderBlock = {
  id: string;
  type: "header";
  data: {
    title: string;
    subtitle?: string;
    eyebrow?: string;
  };
};

export type SectionTitleBlock = {
  id: string;
  type: "section-title";
  data: {
    title: string;
    numbering?: string;
    subtitle?: string;
  };
};

export type InstructionBlock = {
  id: string;
  type: "instruction";
  data: {
    text: string;
  };
};

export type QuestionOption = {
  label: string;
  text: string;
  blocks?: ExerciseContentLeaf[];
  isCorrect?: boolean;
};

export type QuestionContentLeaf = ExerciseContentLeaf;

export type QuestionBlock = {
  id: string;
  type: "question";
  data:
    | {
        instanceId?: string | null;
        sourceExerciseId?: string | null;
        number?: number;
        stem: string;
        stemBlocks?: QuestionContentLeaf[];
        questionType: "mc";
        points?: number;
        difficulty?: string | null;
        options: QuestionOption[];
        correctAnswer?: string | null;
        answerBlocks?: QuestionContentLeaf[] | null;
        explanation?: string | null;
        explanationBlocks?: QuestionContentLeaf[] | null;
        sourceLabel?: string | null;
      }
    | {
        instanceId?: string | null;
        sourceExerciseId?: string | null;
        number?: number;
        stem: string;
        stemBlocks?: QuestionContentLeaf[];
        questionType: "frq";
        points?: number;
        difficulty?: string | null;
        answerSpace?: "small" | "medium" | "large";
        sampleAnswer?: string | null;
        sampleAnswerBlocks?: QuestionContentLeaf[] | null;
        explanation?: string | null;
        explanationBlocks?: QuestionContentLeaf[] | null;
        sourceLabel?: string | null;
      }
    | {
        instanceId?: string | null;
        sourceExerciseId?: string | null;
        number?: number;
        stem: string;
        stemBlocks?: QuestionContentLeaf[];
        questionType: "fill";
        points?: number;
        difficulty?: string | null;
        blanks?: Array<{ position: number; answer?: string | null }>;
        explanation?: string | null;
        explanationBlocks?: QuestionContentLeaf[] | null;
        sourceLabel?: string | null;
      }
    | {
        instanceId?: string | null;
        sourceExerciseId?: string | null;
        number?: number;
        stem: string;
        stemBlocks?: QuestionContentLeaf[];
        questionType: "tf";
        points?: number;
        difficulty?: string | null;
        correctAnswer?: boolean | null;
        answerBlocks?: QuestionContentLeaf[] | null;
        explanation?: string | null;
        explanationBlocks?: QuestionContentLeaf[] | null;
        sourceLabel?: string | null;
      };
};

export type RubricLevel = {
  label: string;
  score?: number | string | null;
  description: string;
};

export type RubricRowBlock = {
  id: string;
  type: "rubric-row";
  data: {
    dimension: string;
    description?: string | null;
    weight?: number | null;
    levels: RubricLevel[];
  };
};

export type LessonStepBlock = {
  id: string;
  type: "lesson-step";
  data: {
    phase?: string;
    title: string;
    duration?: number | null;
    summary?: string | null;
    objectives?: string[];
    activities?: string[];
    materials?: string[];
    teacherNotes?: string | null;
    blocks?: LessonPlanBlock[];
  };
};

export type DividerBlock = {
  id: string;
  type: "divider";
  data: {
    style?: "solid" | "dashed" | "dotted";
  };
};

export type AnswerSpaceBlock = {
  id: string;
  type: "answer-space";
  data: {
    size: "small" | "medium" | "large";
    lines?: number;
  };
};

export type TableBlock = {
  id: string;
  type: "table";
  data: {
    headers: string[];
    rows: string[][];
    caption?: string;
  };
};

export type PageBreakBlock = {
  id: string;
  type: "page-break";
  data: Record<string, never>;
};

export type DocumentBlock =
  | HeaderBlock
  | SectionTitleBlock
  | InstructionBlock
  | QuestionBlock
  | RubricRowBlock
  | LessonStepBlock
  | DividerBlock
  | AnswerSpaceBlock
  | TableBlock
  | PageBreakBlock;

export type DocumentModel = {
  id: string;
  type: DocumentKind;
  title: string;
  meta: DocumentMeta;
  blocks: DocumentBlock[];
  layoutConfig: DocumentLayoutConfig;
};

export const DEFAULT_DOCUMENT_LAYOUT: DocumentLayoutConfig = {
  pageSize: "A4",
  columns: 1,
  margins: {
    top: 24,
    right: 24,
    bottom: 24,
    left: 24,
  },
  headerText: null,
  footerText: null,
  showPageNumbers: false,
};
