import type { PartnerExerciseType } from "@/lib/partner/types";
import type { QuestionBasketItem } from "@/lib/question-bank/basket";

export type WorksheetQuestionBankItem = QuestionBasketItem & {
  id: string;
  tags?: string[];
  course?: string | null;
  unit?: number | null;
  cognitive_task?: string | null;
  stimulusImageUrl?: string | null;
};

export type WorksheetSidebarTab = "search" | "outline" | "materials";

export type WorksheetMaterialListItem = {
  id: string;
  label: string;
  fileName: string;
  questionCount: number;
  stage?: string | null;
  subject?: string | null;
  gradeLevel?: string | null;
  textbookVersion?: string | null;
  reviewFlag?: "disputed" | null;
  createdAt: string;
  course?: string | null;
  unit?: number | null;
  sourceAssessment?: string | null;
};

export type WorksheetMaterialListResponse = {
  items: WorksheetMaterialListItem[];
  total?: number;
  page?: number;
  limit?: number;
};

export type WorksheetMaterialExercise = {
  id: string;
  exerciseType:
    | "MC"
    | "FR"
    | "fill_in"
    | "TF"
    | "experiment"
    | "proof"
    | "drawing";
  difficulty: number;
  questionText: string;
  options: Array<{ label: string; text: string; isCorrect?: boolean }> | null;
  correctAnswer?: string | null;
  solutionSteps?: string | null;
  commonMistakes?: string[] | null;
  visibility?: "private" | "school";
  tags?: string[];
  stage?: string | null;
  subject?: string | null;
  gradeLevel?: string | null;
  textbookVersion?: string | null;
  knowledgePoints?: string[];
  reviewFlag?: "disputed" | null;
  reviewFlagReason?: string | null;
  sourceFileName?: string | null;
  sourcePageStart?: number | null;
  sourcePageEnd?: number | null;
  sourceConfidence?: number | null;
  createdAt?: string | null;
};

export type WorksheetMaterialDetail = {
  material: WorksheetMaterialListItem;
  exercises?: WorksheetMaterialExercise[];
  questions?: TikuSearchResultRow[];
};

// 避免循环导入，内联 tiku 行类型
type TikuSearchResultRow = {
  id: string;
  course: string;
  unit: number;
  stem: string;
  choices: Record<string, { text: string; misconception: string | null }>;
  correct_answer: string;
  explanation: string | null;
  difficulty: string;
  cognitive_task: string | null;
  topic_code: string | null;
  key_concepts: string[];
  [key: string]: unknown;
};

export type WorksheetSourceScope = "all" | "global" | "personal";

export type WorksheetSearchFilters = {
  query: string;
  course: string;
  unit: string;
  difficulty: string;
  cognitiveTask: string;
  exerciseType: "all" | PartnerExerciseType;
  sourceScope: WorksheetSourceScope;
};

export type WorksheetEditorSection = {
  id: string;
  title: string;
  order: number;
};

export type WorksheetProjectStoredAsset = {
  bucket: string;
  path: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSizeBytes?: number | null;
};

export type WorksheetEditorQuestion = {
  id: string;
  exerciseId: string;
  sectionId: string;
  order: number;
  points: number;
  questionText: string;
  options: Array<{ label: string; text: string; isCorrect?: boolean }> | null;
  correctAnswer: string;
  solutionSteps: string;
  knowledgePoints: string[];
  difficulty: 1 | 2 | 3 | 4;
  questionType: PartnerExerciseType;
  tags: string[];
  stage?: string | null;
  subject?: string | null;
  gradeLevel?: string | null;
  textbookVersion?: string | null;
  sourceKind?: string | null;
  isModified: boolean;
  isAiGenerated: boolean;
  showSolution: boolean;
  createdAt?: string | null;
  isBlankBlock?: boolean;
  blankContent?: string;
  blankHeight?: number;
  drawingData?: string;
  stimulusImageUrl?: string | null;
  stimulusImageScale?: number; // 0.25 ~ 1.0，默认 0.5
  stimulusImageAsset?: WorksheetProjectStoredAsset | null;
};

export type WorksheetEditorDraft = {
  title: string;
  description: string;
  duration: number;
  sections: WorksheetEditorSection[];
  questions: WorksheetEditorQuestion[];
};

export type WorksheetEditorStats = {
  questionCount: number;
  totalPoints: number;
  countsByType: Record<string, number>;
};
