export type AnswerKeySource = "exercise" | "manual" | "rubric";
export type GradingSessionStatus = "draft" | "processing" | "completed" | "failed";
export type SubmissionStatus = "pending" | "ocr_done" | "grading" | "completed" | "failed";
export type GradingQuestionType = "MC" | "FR" | "essay" | "calculation";
export type GradingResponseMode = "text" | "math" | "diagram" | "mixed";
export type GradingJobKind =
  | "infer_answer_key"
  | "auto_grade_submission"
  | "auto_grade_batch";
export type GradingJobStatus = "queued" | "running" | "completed" | "failed";

export interface AnswerKeyItem {
  questionNumber: number;
  questionText: string;
  questionType: GradingQuestionType;
  correctAnswer: string;
  maxScore: number;
  responseMode?: GradingResponseMode;
  solutionOutline?: string | null;
  subjectHint?: string | null;
  languageHint?: string | null;
  sourceQuestionType?: string | null;
  rubricDimensions?: Array<{
    name: string;
    weight: number;
    description: string;
  }>;
  knowledgePoints?: string[];
  inferenceConfidence?: number;
  reviewRecommended?: boolean;
  reviewReason?: string | null;
}

export interface GradingStats {
  averageScore: number;
  maxScore: number;
  minScore: number;
  medianScore: number;
  stdDeviation: number;
  distribution: Record<string, number>;
  questionStats: Array<{
    questionNumber: number;
    averageScore: number;
    maxScore: number;
    correctRate: number;
  }>;
  weakKnowledgePoints: Array<{
    point: string;
    averageRate: number;
  }>;
}

export interface GradingSession {
  id: string;
  teacherId: string;
  title: string;
  courseId: string | null;
  unitId: string | null;
  topicId: string | null;
  answerKeySource: AnswerKeySource;
  answerKey: AnswerKeyItem[];
  rubricId: string | null;
  status: GradingSessionStatus;
  studentCount: number;
  questionCount: number;
  stats: GradingStats | null;
  createdAt: string;
  updatedAt: string;
}

export interface OcrResult {
  pages: Array<{
    pageNumber: number;
    questions: Array<{
      questionNumber: number;
      studentAnswer: string;
      confidence: number;
      boundingBox?: { x: number; y: number; w: number; h: number };
    }>;
  }>;
}

export interface GradingSubmission {
  id: string;
  sessionId: string;
  studentName: string;
  fileUrl: string | null;
  storagePath: string | null;
  pageCount: number;
  ocrResult: OcrResult | null;
  status: SubmissionStatus;
  totalScore: number | null;
  maxScore: number | null;
  gradedAt: string | null;
  createdAt: string;
}

export interface ScoringBreakdownItem {
  dimension: string;
  score: number;
  maxScore: number;
  reason: string;
}

export interface GradingAnswer {
  id: string;
  submissionId: string;
  questionNumber: number;
  studentAnswer: string;
  correctAnswer: string;
  score: number;
  maxScore: number;
  aiFeedback: string;
  confidence: number;
  questionType: GradingQuestionType;
  scoringBreakdown: ScoringBreakdownItem[] | null;
  needsReview: boolean;
  teacherOverrideScore: number | null;
  teacherOverrideFeedback: string | null;
  createdAt: string;
}

export interface OcrProvider {
  recognize(
    imageBuffers: Buffer[],
    options?: { language?: string },
  ): Promise<OcrResult>;
}

export interface GradingJob {
  id: string;
  teacherId: string;
  sessionId: string;
  submissionId: string | null;
  kind: GradingJobKind;
  status: GradingJobStatus;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
