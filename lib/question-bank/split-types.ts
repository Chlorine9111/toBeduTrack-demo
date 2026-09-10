import type {
  QuestionConfidenceSignals,
  QuestionType,
  ScanSourceType,
  ScannedQuestion,
} from "@/lib/pdf-scan/types";
import type { ScanQuestionReviewTier } from "@/lib/pdf-scan/review";

export type QuestionBankSplitExerciseType = "MC" | "FR" | "fill_in";

export type QuestionBankSplitOption = {
  label: string;
  text: string;
  isCorrect?: boolean;
};

export type QuestionBankSplitQuestion = {
  id: string;
  questionNumber: number;
  exerciseType: QuestionBankSplitExerciseType;
  questionText: string;
  difficulty: "easy" | "medium" | "hard";
  options: QuestionBankSplitOption[] | null;
  correctAnswer: string | null;
  solutionSteps: string | null;
  subject: string | null;
  knowledgePoint: string | null;
  confidence: number;
  reviewTier: ScanQuestionReviewTier;
  reviewReasons: string[];
  isLowConfidence: boolean;
  sourcePageNumber: number | null;
  sourceType?: ScanSourceType;
  rawQuestionNumber?: string | null;
  linkedFigures?: string[];
  confidenceSignals?: QuestionConfidenceSignals;
  originalQuestionType?: QuestionType;
};

export type QuestionBankSplitDocumentStatus =
  | "processing"
  | "ready"
  | "saving"
  | "saved"
  | "failed";

export type QuestionBankSplitDocument = {
  uploadId: string;
  fileName: string;
  fileType: string;
  label: string;
  courseId: string;
  unitId: string;
  curriculumHint: string;
  status: QuestionBankSplitDocumentStatus;
  errorText: string;
  questionCount: number;
  rejectedCount: number;
  extractionMode: string;
  analysis: {
    contentKind: string;
    confidence: number;
    reasons: string[];
  } | null;
  questions: QuestionBankSplitQuestion[];
  importBatchId: string | null;
  importBatchLabel: string | null;
  savedCount: number;
  lastSavedAt: string | null;
  activeQuestionId: string | null;
};

export type QuestionBankSplitScanResponse = {
  uploadId: string;
  fileName: string;
  fileType: string;
  extractionMode: string;
  analysis: {
    contentKind: string;
    confidence: number;
    reasons: string[];
  } | null;
  questions: QuestionBankSplitQuestion[];
  rejectedCount: number;
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

export type QuestionBankSplitStoredScanResult = {
  questions: ScannedQuestion[];
  textPreview?: string;
  analysis?: {
    contentKind: string;
    confidence: number;
    reasons: string[];
  } | null;
  extractionMode?: string;
  fileType?: string;
  pageImages?: Array<{ pageNumber: number; url: string }>;
};
