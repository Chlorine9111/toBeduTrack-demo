import type {
  LessonPlanExplanationDepth,
  LessonPlanPreferences,
  LessonPlanQuizDensity,
  LessonPlanStudentLevel,
  LessonPlanTemplateKind,
} from "@/lib/lesson-plan/types";

export const DEFAULT_LESSON_PLAN_PREFERENCES: LessonPlanPreferences = {
  durationMinutes: 45,
  studentLevel: "medium",
  languagePref: "follow",
  templateKind: "concept",
  quizDensity: "medium",
  explanationDepth: "standard",
  includeExtension: false,
  showCedCodes: true,
  includeTeacherNotes: false,
};

export const TEMPLATE_LABELS: Record<LessonPlanTemplateKind, string> = {
  concept: "概念讲解型",
  example: "例题驱动型",
  sprint: "考前冲刺型",
  inquiry: "探究讨论型",
};

export const STUDENT_LEVEL_LABELS: Record<LessonPlanStudentLevel, string> = {
  basic: "基础",
  medium: "中等",
  advanced: "进阶",
};

export const QUIZ_DENSITY_LABELS: Record<LessonPlanQuizDensity, string> = {
  low: "少",
  medium: "中",
  high: "多",
};

export const EXPLANATION_DEPTH_LABELS: Record<LessonPlanExplanationDepth, string> = {
  concise: "简洁",
  standard: "标准",
  detailed: "详细",
};

export const BLOCK_TYPE_OPTIONS = [
  { value: "heading", label: "标题" },
  { value: "paragraph", label: "正文" },
  { value: "math", label: "公式" },
  { value: "image", label: "图片" },
  { value: "callout", label: "提示框" },
  { value: "divider", label: "分隔线" },
  { value: "definition", label: "定义" },
  { value: "example", label: "例题" },
  { value: "steps", label: "步骤" },
  { value: "quiz", label: "Quiz" },
  { value: "poll", label: "Poll" },
] as const;
