/**
 * Worksheet domain types and layout configuration.
 */

export type WorksheetStatus = "draft" | "published";
export type WorksheetPageSize = "A4" | "Letter";
export type WorksheetColumns = 1 | 2;
export type AnswerSpaceSize = "small" | "medium" | "large";

export interface WorksheetLayoutConfig {
  columns: WorksheetColumns;
  showHeaderFooter: boolean;
  headerText?: string | null;
  footerText?: string | null;
  teacherName?: string | null;
  schoolLogoUrl?: string | null;
  answerSpaceSize: AnswerSpaceSize;
  includeAnswerKey: boolean;
  pageSize: WorksheetPageSize;
}

export interface Worksheet {
  id: string;
  teacherId: string;
  courseId: string;
  unitId?: string | null;
  title: string;
  description?: string | null;
  layoutConfig: WorksheetLayoutConfig;
  status: WorksheetStatus;
  pdfUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  exercises?: WorksheetExercise[];
}

export interface WorksheetExercise {
  id: string;
  worksheetId: string;
  exerciseId: string;
  sortOrder: number;
  points?: number | null;
}
