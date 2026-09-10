import type { PartnerExerciseType, PartnerVisibility } from "@/lib/partner/types";

export type QuestionBankSplitQuestion = {
  id: string;
  exerciseType: PartnerExerciseType;
  difficulty: number;
  questionText: string;
  options: Array<{ label: string; text: string; isCorrect?: boolean }> | null;
  correctAnswer?: string | null;
  solutionSteps?: string | null;
  commonMistakes?: string[] | null;
  visibility?: PartnerVisibility;
  tags?: string[];
  stage?: string | null;
  subject?: string | null;
  gradeLevel?: string | null;
  textbookVersion?: string | null;
  knowledgePoints?: string[];
  reviewFlag?: "disputed" | null;
  reviewFlagReason?: string | null;
  sourceKind?: string;
  sourceFileName?: string | null;
  sourcePageStart?: number | null;
  sourcePageEnd?: number | null;
  sourceConfidence?: number | null;
  isLowConfidence: boolean;
  isAiGenerated?: boolean;
  sectionTitle?: string | null;
  showSolution: boolean;
};

export type QuestionBankSplitDocumentStatus =
  | "queued"
  | "uploading"
  | "processing"
  | "completed"
  | "failed";

export type QuestionBankSplitDocument = {
  id: string;
  file: File | null;
  sourceFilePath: string | null;
  fileName: string;
  label: string;
  courseId: string;
  unitId: string;
  curriculumHint: string;
  stage: string;
  subject: string;
  gradeLevel: string;
  textbookVersion: string;
  visibility: "private" | "school";
  status: QuestionBankSplitDocumentStatus;
  progress: number;
  progressLabel: string;
  errorText: string;
  questionCount: number;
  extractionMode: string;
  analysis: {
    contentKind: string;
    confidence: number;
    reasons: string[];
  } | null;
  questions: QuestionBankSplitQuestion[];
  fileType?: string;
  rejectedCount: number;
  activeQuestionId: string | null;
  importBatchId: string | null;
  importedAt: string | null;
  lastSavedAt: string | null;
};

export type QuestionBankSplitScanResponse = {
  uploadId: string;
  fileType?: string;
  extractionMode: string;
  analysis: {
    contentKind: string;
    confidence: number;
    reasons: string[];
  };
  questions: Array<{
    id: string;
    questionNumber: number;
    exerciseType: "MC" | "FR" | "fill_in";
    questionText: string;
    difficulty: 1 | 2 | 3 | 4;
    options: Array<{ label: string; text: string; isCorrect?: boolean }> | null;
    correctAnswer: string | null;
    solutionSteps: string | null;
    subject: string | null;
    knowledgePoint: string | null;
    confidence: number;
    reviewTier: "ready" | "review" | "critical";
    reviewReasons: string[];
    isLowConfidence: boolean;
    sourcePageNumber: number | null;
    sourceType?: "pdf" | "image" | "word";
    rawQuestionNumber?: string | null;
    linkedFigures?: string[];
    confidenceSignals?: unknown;
    originalQuestionType?: string;
  }>;
  textPreview?: string;
  rejectedCount?: number;
  sourceFilePath?: string | null;
};

export type QuestionBankSplitCommitResponse = {
  uploadId: string;
  fileName: string;
  status: "saved" | "requires_curriculum" | "requires_review" | "already_saved" | "failed";
  savedCount: number;
  importBatchId: string | null;
  importBatchLabel: string | null;
  message: string;
  reviewPendingCount: number;
};

export type QuestionBankAiSearchResult = {
  id: string;
  questionText: string;
  exerciseType:
    | "MC"
    | "FR"
    | "fill_in"
    | "TF"
    | "experiment"
    | "proof"
    | "drawing";
  difficulty: number;
  options: Array<{ label: string; text: string; isCorrect?: boolean }> | null;
  correctAnswer?: string | null;
  solutionSteps?: string | null;
  stage?: string | null;
  subject?: string | null;
  gradeLevel?: string | null;
  textbookVersion?: string | null;
  knowledgePoints?: string[];
  sourceKind?: string | null;
  createdAt?: string | null;
  tags?: string[];
};

export type QuestionBankAiSuggestResponse = {
  plan: {
    query: string;
    count: number;
    type: string;
    difficulty: number;
  };
  matchedCount: number;
  items: QuestionBankAiSearchResult[];
};

export type QuestionBankSplitRewriteResponse = {
  question: {
    questionText: string;
    exerciseType: "MC" | "FR";
    difficulty: 1 | 2 | 3 | 4;
    options: Array<{ label: string; text: string; isCorrect?: boolean }> | null;
    correctAnswer: string;
    solutionSteps: string;
  };
};

export type QuestionBankOutlineSection = {
  id: string;
  label: string;
  items: Array<{
    questionId: string;
    title: string;
    content: string;
  }>;
};

export type PersistedQuestionBankSplitDocument = Omit<QuestionBankSplitDocument, "file"> & {
  file: null;
};
