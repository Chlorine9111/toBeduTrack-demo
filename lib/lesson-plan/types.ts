export type LessonPlanTemplateKind = "concept" | "example" | "sprint" | "inquiry";
export type LessonPlanStudentLevel = "basic" | "medium" | "advanced";
export type LessonPlanLanguagePref = "follow" | "en" | "zh" | "bilingual";
export type LessonPlanQuizDensity = "low" | "medium" | "high";
export type LessonPlanExplanationDepth = "concise" | "standard" | "detailed";
export type LessonPlanStatus = "draft" | "published" | "archived";

export type BlockType =
  | "heading"
  | "paragraph"
  | "math"
  | "image"
  | "callout"
  | "divider"
  | "definition"
  | "example"
  | "steps"
  | "quiz"
  | "poll";

export type CalloutSubtype = "warning" | "think" | "misconception" | "connection";

export type LessonPlanPreferences = {
  durationMinutes: number;
  studentLevel: LessonPlanStudentLevel;
  languagePref: LessonPlanLanguagePref;
  templateKind: LessonPlanTemplateKind;
  quizDensity: LessonPlanQuizDensity;
  explanationDepth: LessonPlanExplanationDepth;
  includeExtension: boolean;
  showCedCodes: boolean;
  includeTeacherNotes: boolean;
};

export type CedObjective = {
  code: string;
  description: string;
};

export type CedTopicMatch = {
  id: string;
  topicNumber: string;
  title: string;
  learningObjectives: CedObjective[];
  essentialKnowledge: CedObjective[];
};

export type LessonIntentConfirmation = {
  subject: {
    courseId: string | null;
    code: string;
    name: string;
  };
  unit: {
    id: string | null;
    unitNumber: string;
    title: string;
  };
  topics: CedTopicMatch[];
  preferences: LessonPlanPreferences;
};

export type LessonIntentResult =
  | {
      needsClarification: true;
      missing: Array<"subject" | "unit" | "topic">;
      questions: string[];
      suggestions?: {
        subjects?: string[];
        units?: string[];
        topics?: string[];
      };
    }
  | {
      needsClarification: false;
      confirmation: LessonIntentConfirmation;
      defaultsApplied: Partial<Record<keyof LessonPlanPreferences, boolean>>;
    };

export type OutlineSection = {
  id: string;
  title: string;
  summary: string;
  durationMinutes: number;
  keyPoints: string[];
};

export type OutlineResult = {
  title: string;
  sections: OutlineSection[];
};

export type LessonPlanBlock = {
  id: string;
  type: BlockType;
  subtype?: CalloutSubtype;
  sortOrder: number;
  content: Record<string, unknown>;
  cedCodes: string[];
  teacherNote?: string | null;
};

export type LessonPlanSection = {
  id: string;
  title: string;
  summary: string;
  durationMinutes: number;
  sortOrder: number;
  blocks: LessonPlanBlock[];
};

export type LessonPlanDocument = {
  id: string;
  title: string;
  sourcePrompt: string;
  subjectLabel: string;
  courseId: string | null;
  unitId: string | null;
  topicIds: string[];
  learningObjectiveCodes: string[];
  essentialKnowledge: CedObjective[];
  preferences: LessonPlanPreferences;
  status: LessonPlanStatus;
  publishedSlug: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sections: LessonPlanSection[];
};

export type PublicLessonPlanSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: LessonPlanStatus;
  subjectLabel: string;
  templateKind: LessonPlanTemplateKind;
  publishedSlug: string | null;
};

export type LessonPlanListStatus = "active" | "draft" | "published" | "archived" | "all";
export type LessonPlanListSort = "updated_desc" | "created_desc" | "title_asc" | "title_desc";

export type LessonPlanListOptions = {
  status?: LessonPlanListStatus;
  query?: string;
  courseId?: string;
  sort?: LessonPlanListSort;
  limit?: number;
  offset?: number;
};

export type LessonPlanListResult = {
  items: PublicLessonPlanSummary[];
  total: number;
};
