import type { LessonPlanDocument } from "@/lib/lesson-plan/types";
import type { PblPlan } from "@/lib/pbl/types";
import type { WorksheetProjectSnapshot } from "@/lib/question-bank/worksheet-project-types";
import type { Exercise, ExerciseDifficulty } from "@/types/exercise";
import type { RubricDetailPayload } from "@/types/rubric";

export type ContentLibraryType = "rubric" | "lesson_plan" | "question" | "pbl" | "other";
export type ContentLibraryRenderer =
  | "rubric"
  | "lesson_plan_document"
  | "lesson_plan_markdown"
  | "exercise"
  | "pbl_project_plan"
  | "worksheet_project"
  | "html"
  | "markdown";
export type ContentLibraryOriginEntity =
  | "rubric"
  | "lesson_plan"
  | "exercise"
  | "pbl_project_plan"
  | "worksheet_project"
  | "assistant_message"
  | "content_asset";

export type ContentLibraryLessonPlanMarkdownSnapshot = {
  kind: "lesson_plan_markdown";
  markdown: string;
  sources: Array<{ title: string; url: string }>;
  warnings: string[];
  qualityAudit: unknown | null;
  revisionRounds: number;
};

export type ContentLibrarySnapshot =
  | { kind: "rubric"; rubric: RubricDetailPayload }
  | { kind: "lesson_plan_document"; lessonPlan: LessonPlanDocument }
  | ContentLibraryLessonPlanMarkdownSnapshot
  | { kind: "exercise"; exercise: Exercise }
  | { kind: "pbl_project_plan"; pblPlan: PblPlan }
  | WorksheetProjectSnapshot
  | { kind: "html"; html: string }
  | { kind: "markdown"; markdown: string };

export type ContentLibraryListItem = {
  id: string;
  documentId: string | null;
  contentType: ContentLibraryType;
  rendererType: ContentLibraryRenderer;
  originEntityType: ContentLibraryOriginEntity;
  originEntityId: string | null;
  title: string;
  displayTitle: string;
  note: string | null;
  summaryText: string | null;
  courseId: string | null;
  unitId: string | null;
  courseName: string | null;
  unitName: string | null;
  createdAt: string;
  updatedAt: string;
  sourceConversationId: string | null;
  sourceConversationTitle: string | null;
  sourceMessageId: string | null;
};

export type ContentLibraryDetail = ContentLibraryListItem & {
  customTitle: string | null;
  sourceItemId: string | null;
  metadata: Record<string, unknown>;
  snapshot: ContentLibrarySnapshot;
};

export type ContentLibraryListOptions = {
  type?: ContentLibraryType | "all";
  query?: string;
  courseId?: string;
  unitId?: string;
  difficulty?: ExerciseDifficulty;
  assessmentStyle?: string;
  clusterNodeId?: string;
  subskillNodeId?: string;
  limit?: number;
  offset?: number;
};

export type ContentLibraryListResult = {
  items: ContentLibraryListItem[];
  total: number;
};
