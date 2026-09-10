import type {
  ContentLibraryRenderer,
  ContentLibraryType,
} from "@/lib/content-library/types";
import type { LessonPlanStatus } from "@/lib/lesson-plan/types";
import type {
  PblCurriculumSystem,
  PblPlanStatus,
  PblStageType,
} from "@/lib/pbl/types";
import type { GlobalSearchResultType } from "@/lib/search/types";
import type { Exercise } from "@/types/exercise";

export type SearchPeekMeta = {
  id: string;
  type: GlobalSearchResultType;
  title: string;
  subtitle: string;
  updatedAt: string;
  route: string;
};

export type SearchPeekQuestionOption = {
  label: string;
  text: string;
  isCorrect: boolean;
};

export type SearchPeekQuestionPayload = {
  kind: "question";
  questionType: Exercise["type"];
  difficulty: Exercise["difficulty"];
  verificationStatus: Exercise["verificationStatus"];
  questionText: string;
  options: SearchPeekQuestionOption[];
  correctAnswer: string | null;
  explanation: string | null;
  sourceFileName: string | null;
  sourcePageLabel: string | null;
  knowledgeClusterLabel: string;
  knowledgeSubskillLabel: string | null;
  sourcePageImageUrl: string | null;
  similarItems: Array<{
    id: string;
    title: string;
    sourceFileName: string | null;
    sourcePageLabel: string | null;
    updatedAt: string;
  }>;
};

export type SearchPeekLessonSection = {
  id: string;
  title: string;
  summary: string;
  durationMinutes: number;
  blockCount: number;
  previewText: string;
};

export type SearchPeekLessonPlanPayload = {
  kind: "lesson_plan";
  subjectLabel: string;
  status: LessonPlanStatus;
  totalDurationMinutes: number;
  sectionCount: number;
  sections: SearchPeekLessonSection[];
};

export type SearchPeekPblStage = {
  stageNumber: number;
  name: string;
  stageType: PblStageType;
  objective: string;
  deliverables: string[];
};

export type SearchPeekPblPayload = {
  kind: "pbl_project";
  status: PblPlanStatus;
  primarySubject: string;
  curriculumSystem: PblCurriculumSystem;
  grade: string;
  totalPeriods: number;
  drivingQuestion: string;
  overviewText: string;
  finalOutcomeForm: string;
  stageCount: number;
  stages: SearchPeekPblStage[];
};

export type SearchPeekConversationPayload = {
  kind: "conversation";
  messageCount: number;
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    contentPreview: string;
    createdAt: string;
  }>;
};

export type SearchPeekContentBody =
  | {
      kind: "text";
      excerpt: string;
    }
  | {
      kind: "exercise";
      questionText: string;
      options: SearchPeekQuestionOption[];
      correctAnswer: string | null;
      explanation: string | null;
    }
  | {
      kind: "lesson_plan";
      sectionCount: number;
      sections: SearchPeekLessonSection[];
    }
  | {
      kind: "pbl_project";
      drivingQuestion: string;
      overviewText: string;
      stageCount: number;
      stages: SearchPeekPblStage[];
    }
  | {
      kind: "rubric";
      dimensionCount: number;
      dimensions: Array<{
        id: string;
        name: string;
        weight: number;
        description: string;
        levels: Array<{
          id: string;
          score: number;
          description: string;
        }>;
      }>;
    };

export type SearchPeekContentLibraryPayload = {
  kind: "content_library_item";
  contentType: ContentLibraryType;
  rendererType: ContentLibraryRenderer;
  note: string | null;
  summaryText: string | null;
  courseName: string | null;
  unitName: string | null;
  sourceConversationTitle: string | null;
  body: SearchPeekContentBody;
};

export type SearchPeekPayload =
  | SearchPeekQuestionPayload
  | SearchPeekLessonPlanPayload
  | SearchPeekPblPayload
  | SearchPeekConversationPayload
  | SearchPeekContentLibraryPayload;

export type SearchPeekResponse = {
  item: SearchPeekMeta;
  preview: SearchPeekPayload;
};
