export interface ExamData {
  title: string;
  subtitle?: string;
  course: string;
  sections: ExamSection[];
  includeAnswerKey: boolean;
  includeRubric: boolean;
}

export interface ExamSection {
  type: "MC" | "FRQ";
  title: string;
  directions: string;
  questions: Question[];
}

export interface MCQuestion {
  type: "MC";
  number: number;
  stem: string;
  options: { label: string; text: string }[];
  answer: string;
  difficulty: "Easy" | "Medium" | "Hard";
  difficultyLabel?: string;
  level?: string;
  lo?: string;
  explanation?: string;
  meta?: string;
}

export interface FRQQuestion {
  type: "FRQ";
  number: number;
  stem: string;
  parts: FRQPart[];
  difficulty: "Easy" | "Medium" | "Hard";
  difficultyLabel?: string;
  level?: string;
  solution?: string;
  meta?: string;
}

export interface FRQPart {
  label: string;
  prompt: string;
  points: number;
  blankHeight?: number;
  solution?: string;
  rubricCriteria?: string[];
}

export interface RubricData {
  title: string;
  subtitle?: string;
  courseName?: string;
  unitTitle?: string | null;
  notes?: string[];
  totalPoints: number;
  parts: {
    label: string;
    description: string;
    points: number;
    criteria: { text: string; points: number }[];
  }[];
}

export interface WorksheetData {
  title: string;
  course: string;
  steps: {
    level: string;
    instructions: string;
    problems: { text: string; hints?: string[] }[];
  }[];
}

export interface LessonPlanPdfData {
  title: string;
  courseName?: string | null;
  unitName?: string | null;
  totalMinutes?: number | null;
  level?: string | null;
  sections: Array<{
    id: string;
    title: string;
    summary: string;
    durationMinutes: number;
    sortOrder: number;
    blocks: Array<{
      id: string;
      type: string;
      subtype?: string;
      sortOrder: number;
      content: Record<string, unknown>;
      cedCodes: string[];
      teacherNote?: string | null;
    }>;
  }>;
}

export type Question = MCQuestion | FRQQuestion;
