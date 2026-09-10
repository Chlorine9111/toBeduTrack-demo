import type { GradingQuestionType, GradingResponseMode } from "@/lib/grading/types";

export interface OcrQuestionItem {
  questionNumber: number;
  studentAnswer: string;
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface OcrPageResult {
  pageNumber: number;
  questions: OcrQuestionItem[];
}

export interface OcrOutput {
  pages: OcrPageResult[];
}

export interface OcrQuestionContext {
  questionNumber: number;
  questionText?: string;
  questionType?: GradingQuestionType;
  responseMode?: GradingResponseMode;
  subjectHint?: string | null;
  languageHint?: string | null;
  knowledgePoints?: string[];
  correctAnswer?: string;
}

export interface OcrEngineInput {
  buffers: Buffer[];
  mimeType: "image/png" | "image/jpeg";
  language?: string;
  sessionTitle?: string;
  questionContext?: OcrQuestionContext[];
  abortSignal?: AbortSignal;
}

export interface OcrEngine {
  recognize(input: OcrEngineInput): Promise<OcrOutput>;
}
