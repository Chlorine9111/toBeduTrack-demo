import type { LessonPlanSection } from "@/lib/lesson-plan/types";

export type LessonPlanTemplateVariant = "standard" | "compact";

export interface LessonPlanPdfInput {
  title: string;
  courseName?: string | null;
  unitName?: string | null;
  totalMinutes?: number | null;
  level?: string | null;
  sections: LessonPlanSection[];
  mode?: "teacher" | "student" | "classroom";
  pageSize?: "A4" | "Letter";
}
