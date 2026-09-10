"use client";

import type { StructuredScanBatch, StructuredScanFile } from "@/components/main/scan/ScanStructuredResult";

export const MAX_CONTEXT_LENGTH = 8000;
export const MAX_VISIBLE_QUESTIONS_PER_FILE = 30;

export type ScanQuestion = {
  questionNumber?: number | string | null;
  content?: unknown;
  options?: Record<string, unknown> | null;
  subQuestions?: Array<{ label?: unknown; content?: unknown }>;
  linkedFigures?: unknown[];
  knowledgePoint?: unknown;
  questionType?: unknown;
  sourceType?: unknown;
  confidence?: unknown;
};

export type ScanFileSummary = StructuredScanFile & {
  detailedBlocks: string[];
  contextLines: string[];
};

export type ScanBatchResult = Omit<StructuredScanBatch, "files"> & {
  files: ScanFileSummary[];
  displayText: string;
  summaryText: string;
  contextText: string;
};

export type ScanProcessResponse = {
  questions?: ScanQuestion[];
  stats?: {
    total?: number;
    byType?: Record<string, number>;
    lowConfidenceCount?: number;
    averageConfidence?: number;
  };
  textPreview?: string;
  analysis?: {
    contentKind?: "question_set" | "material" | "mixed";
    confidence?: number;
    reasons?: string[];
  };
  saveResult?: ScanSaveFileResponse | null;
};

export type InjectScanFileDetail = {
  base64?: string;
  fileName?: string;
  mimeType?: string;
};

export type ScanUploadResponse = {
  uploadId: string;
};

export type ScanStatusResponse = {
  status: string;
  progress: number;
};

export type ScanSaveFileResponse = {
  uploadId: string;
  fileName: string;
  status:
    | "saved"
    | "already_saved"
    | "requires_review"
    | "requires_curriculum"
    | "no_questions"
    | "failed";
  savedCount: number;
  exerciseIds: string[];
  courseId: string | null;
  courseLabel: string | null;
  unitId: string | null;
  unitLabel: string | null;
  topicId: string | null;
  message: string;
  reviewPendingCount?: number;
};

export type ScanSaveBatchResponse = {
  files?: ScanSaveFileResponse[];
  totalSaved?: number;
};
