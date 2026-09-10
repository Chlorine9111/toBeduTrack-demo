import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  assertFileHeader,
  detectScanFileType,
  getAllowedUploadHint,
} from "@/lib/pdf-scan/file-type";
import { uploadPDF, hasMathpixCredentials } from "@/lib/pdf-scan/mathpix";
import { runScanPipeline } from "@/lib/pdf-scan/pipeline";
import { persistSourcePageImages } from "@/lib/pdf-scan/page-images";
import { assessScannedQuestionForReview } from "@/lib/pdf-scan/review";
import { saveScannedUploadsToLibrary } from "@/lib/pdf-scan/save-to-library";
import { updateExerciseImportBatch } from "@/lib/question-bank/store";
import type {
  QuestionBankSplitCommitResponse,
  QuestionBankSplitExerciseType,
  QuestionBankSplitQuestion,
  QuestionBankSplitScanResponse,
  QuestionBankSplitStoredScanResult,
} from "@/lib/question-bank/split-types";
import type {
  DifficultyLevel,
  QuestionType,
  ScannedQuestion,
} from "@/lib/pdf-scan/types";
import type { Database, Json } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

const MAX_FILE_SIZE = 50 * 1024 * 1024;

function sanitizeFileName(name: string) {
  const basename = name.split(/[/\\]/).pop() || "upload";
  return basename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function mapQuestionTypeToExerciseType(
  questionType: QuestionType | string | null | undefined,
  hasOptions: boolean,
): QuestionBankSplitExerciseType {
  const normalized = cleanText(questionType).toLowerCase();
  if (normalized === "choice" || hasOptions) return "MC";
  if (normalized === "fill") return "fill_in";
  return "FR";
}

function mapExerciseTypeToQuestionType(
  exerciseType: QuestionBankSplitExerciseType,
): QuestionType {
  if (exerciseType === "MC") return "choice";
  if (exerciseType === "fill_in") return "fill";
  return "short_answer";
}

function mapDifficultyToLevel(
  difficulty: DifficultyLevel | string | null | undefined,
): "easy" | "medium" | "hard" {
  switch (`${difficulty ?? ""}`.toLowerCase()) {
    case "easy":
      return "easy";
    case "hard":
      return "hard";
    case "expert":
      return "hard";
    default:
      return "medium";
  }
}

function mapLevelToDifficulty(level: string | number): DifficultyLevel {
  if (typeof level === "string") {
    const lower = level.toLowerCase();
    if (lower === "easy") return "easy";
    if (lower === "hard") return "hard";
    return "medium";
  }
  if (level <= 1) return "easy";
  if (level >= 3) return "hard";
  return "medium";
}

function optionRecordToArray(
  options: Record<string, string | undefined> | null | undefined,
  correctAnswer: string | null | undefined,
) {
  if (!options) return null;
  const normalized = Object.entries(options)
    .filter(([, text]) => cleanText(text).length > 0)
    .map(([label, text]) => ({
      label,
      text: text ?? "",
      isCorrect: label === cleanText(correctAnswer),
    }));
  return normalized.length > 0 ? normalized : null;
}

function optionArrayToRecord(
  options: QuestionBankSplitQuestion["options"],
): Record<string, string | undefined> | null {
  if (!options || options.length === 0) return null;

  const entries = options
    .map((option) => ({
      label: cleanText(option.label).toUpperCase(),
      text: option.text,
    }))
    .filter((option) => option.label && cleanText(option.text).length > 0)
    .map((option) => [option.label, option.text] as const);

  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function toJsonRecord(value: Json | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : null;
}

export function mapScannedQuestionToSplitQuestion(
  question: ScannedQuestion,
  fallbackNumber: number,
): QuestionBankSplitQuestion {
  const review = assessScannedQuestionForReview(question, fallbackNumber);
  const correctAnswer = cleanText(question.correctAnswer);

  return {
    id: `split-question-${randomUUID()}`,
    questionNumber: review.questionNumber,
    exerciseType: mapQuestionTypeToExerciseType(question.questionType, Boolean(question.options)),
    questionText: question.content ?? "",
    difficulty: mapDifficultyToLevel(question.difficulty),
    options: optionRecordToArray(question.options, correctAnswer),
    correctAnswer: correctAnswer || null,
    solutionSteps: cleanText(question.solutionSteps) || null,
    subject: cleanText(question.subject) || null,
    knowledgePoint: cleanText(question.knowledgePoint) || null,
    confidence: review.confidence,
    reviewTier: review.reviewTier,
    reviewReasons: review.reasons,
    isLowConfidence: review.reviewTier !== "ready",
    sourcePageNumber: question.sourcePageNumber ?? null,
    sourceType: question.sourceType,
    rawQuestionNumber: question.rawQuestionNumber ?? null,
    linkedFigures: question.linkedFigures ?? [],
    confidenceSignals: question.confidenceSignals,
    originalQuestionType: question.questionType,
  };
}

export function mapSplitQuestionToScannedQuestion(
  question: QuestionBankSplitQuestion,
): ScannedQuestion {
  return {
    questionNumber: question.questionNumber,
    content: question.questionText,
    questionType: mapExerciseTypeToQuestionType(question.exerciseType),
    difficulty: mapLevelToDifficulty(question.difficulty),
    subject: question.subject ?? "",
    knowledgePoint: question.knowledgePoint ?? "",
    options: optionArrayToRecord(question.options),
    correctAnswer: cleanText(question.correctAnswer),
    solutionSteps: cleanText(question.solutionSteps),
    confidence: question.confidence,
    confidenceSignals: question.confidenceSignals,
    rawQuestionNumber: question.rawQuestionNumber ?? undefined,
    linkedFigures: question.linkedFigures ?? [],
    sourceType: question.sourceType,
    sourcePageNumber: question.sourcePageNumber ?? undefined,
  };
}

export async function scanQuestionBankSplitSourceFile(params: {
  supabase: AppSupabase;
  teacherId: string;
  file: File;
  subject?: string | null;
}): Promise<QuestionBankSplitScanResponse> {
  if (params.file.size > MAX_FILE_SIZE) {
    throw new Error("文件大小不能超过 50MB");
  }

  const fileType = detectScanFileType({
    fileName: params.file.name,
    mimeType: params.file.type,
  });
  if (!fileType) {
    throw new Error(`不支持的文件格式：${getAllowedUploadHint()}`);
  }

  const headerBuffer = await params.file.slice(0, 12).arrayBuffer();
  assertFileHeader({
    fileType,
    fileName: params.file.name,
    bytes: new Uint8Array(headerBuffer),
  });

  const admin = createAdminSupabaseClient();
  const timestamp = Date.now();
  const safeName = sanitizeFileName(params.file.name);
  const storagePath = `pdfs/scans/${params.teacherId}/${timestamp}-${safeName}`;
  const fileBuffer = Buffer.from(await params.file.arrayBuffer());

  const { error: storageError } = await admin.storage
    .from("pdfs")
    .upload(storagePath, fileBuffer, {
      contentType: params.file.type || "application/octet-stream",
      upsert: false,
    });

  if (storageError) {
    throw new Error(`上传源文件失败: ${storageError.message}`);
  }

  const { data: urlData } = admin.storage.from("pdfs").getPublicUrl(storagePath);

  let mathpixId: string | null = null;
  if (fileType === "pdf" && hasMathpixCredentials()) {
    try {
      mathpixId = await uploadPDF(fileBuffer, params.file.name);
    } catch (error) {
      console.error("[question-bank/split] Mathpix upload failed", error);
    }
  }

  const { data: record, error: insertError } = await params.supabase
    .from("pdf_scan_uploads")
    .insert({
      teacher_id: params.teacherId,
      file_name: params.file.name,
      file_url: urlData?.publicUrl ?? null,
      storage_path: storagePath,
      file_size: params.file.size,
      status: mathpixId ? "processing" : "pending",
      mathpix_id: mathpixId,
    })
    .select("id")
    .single();

  if (insertError || !record) {
    throw new Error(`创建扫描记录失败: ${insertError?.message ?? "unknown error"}`);
  }

  try {
    await params.supabase
      .from("pdf_scan_uploads")
      .update({ status: "processing", error_message: null })
      .eq("id", record.id)
      .eq("teacher_id", params.teacherId);

    const pipelineResult = await runScanPipeline({
      fileBuffer,
      fileName: params.file.name,
      mathpixId,
      uploadId: record.id,
      teacherId: params.teacherId,
      useVision: true,
      subject: cleanText(params.subject) || undefined,
    });

    const pageImages = await persistSourcePageImages({
      fileBuffer,
      fileName: params.file.name,
      uploadId: record.id,
      teacherId: params.teacherId,
      pageNumbers:
        pipelineResult.questions
          .map((question) => Number(question.sourcePageNumber ?? 0))
          .filter((pageNumber) => Number.isFinite(pageNumber) && pageNumber > 0),
    });

    const storedScanResult = {
      questions: pipelineResult.questions,
      fileType: pipelineResult.fileType,
      extractionMode: pipelineResult.extractionMode,
      textPreview: pipelineResult.textPreview,
      analysis: pipelineResult.analysis,
      timings: pipelineResult.timings,
      pageImages,
      saveSummary: null,
    } as unknown as Json;

    await params.supabase
      .from("pdf_scan_uploads")
      .update({
        status: "completed",
        question_count: pipelineResult.questions.length,
        scan_result: storedScanResult,
        processing_time_ms: pipelineResult.timings.totalMs,
      })
      .eq("id", record.id)
      .eq("teacher_id", params.teacherId);

    return {
      uploadId: record.id,
      fileName: params.file.name,
      fileType: pipelineResult.fileType,
      extractionMode: pipelineResult.extractionMode,
      analysis: pipelineResult.analysis,
      questions: pipelineResult.questions.map((question, index) =>
        mapScannedQuestionToSplitQuestion(question, index + 1),
      ),
      rejectedCount: 0,
    };
  } catch (error) {
    await params.supabase
      .from("pdf_scan_uploads")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "拆题失败",
      })
      .eq("id", record.id)
      .eq("teacher_id", params.teacherId);
    throw error;
  }
}

export async function commitQuestionBankSplitDocument(params: {
  supabase: AppSupabase;
  teacherId: string;
  uploadId: string;
  label?: string | null;
  courseId?: string | null;
  unitId?: string | null;
  curriculumHint?: string | null;
  questions: QuestionBankSplitQuestion[];
}): Promise<QuestionBankSplitCommitResponse> {
  const { data: row, error } = await params.supabase
    .from("pdf_scan_uploads")
    .select("id,file_name,scan_result,question_count")
    .eq("id", params.uploadId)
    .eq("teacher_id", params.teacherId)
    .single();

  if (error || !row) {
    throw new Error("未找到待保存的拆题记录");
  }

  const scanResultRecord = toJsonRecord(row.scan_result);
  const saveSummary = scanResultRecord?.saveSummary;
  if (
    saveSummary &&
    typeof saveSummary === "object" &&
    (saveSummary as Record<string, unknown>).status === "saved"
  ) {
    return {
      uploadId: params.uploadId,
      fileName: row.file_name,
      status: "already_saved",
      savedCount:
        typeof (saveSummary as Record<string, unknown>).savedCount === "number"
          ? Number((saveSummary as Record<string, unknown>).savedCount)
          : 0,
      importBatchId:
        typeof (saveSummary as Record<string, unknown>).importBatchId === "string"
          ? ((saveSummary as Record<string, unknown>).importBatchId as string)
          : null,
      importBatchLabel:
        typeof (saveSummary as Record<string, unknown>).importBatchLabel === "string"
          ? ((saveSummary as Record<string, unknown>).importBatchLabel as string)
          : null,
      message: "该拆题结果已经保存过了。",
      reviewPendingCount: 0,
    };
  }

  const updatedScanResult = {
    ...(scanResultRecord ?? {}),
    questions: params.questions.map((question) => mapSplitQuestionToScannedQuestion(question)),
    saveSummary: null,
  } as unknown as Json;

  await params.supabase
    .from("pdf_scan_uploads")
    .update({
      status: "processing",
      question_count: params.questions.length,
      scan_result: updatedScanResult,
      error_message: null,
    })
    .eq("id", params.uploadId)
    .eq("teacher_id", params.teacherId);

  try {
    const result = await saveScannedUploadsToLibrary({
      supabase: params.supabase,
      teacherId: params.teacherId,
      uploadIds: [params.uploadId],
      courseId: params.courseId ?? null,
      unitId: params.unitId ?? null,
      curriculumHint: params.curriculumHint ?? null,
      includeLowConfidence: true,
    });

    const file = result.files[0];
    if (!file) {
      throw new Error("拆题结果保存失败");
    }

    if (file.importBatchId && cleanText(params.label)) {
      await updateExerciseImportBatch(
        {
          teacherId: params.teacherId,
          supabase: params.supabase,
        },
        file.importBatchId,
        {
          label: cleanText(params.label),
        },
      ).catch((updateError) => {
        console.error("[question-bank/split] failed to update import batch label", updateError);
      });
    }

    const normalizedStatus =
      file.status === "no_questions" ? "failed" : file.status;

    await params.supabase
      .from("pdf_scan_uploads")
      .update({
        status:
          normalizedStatus === "saved" || normalizedStatus === "already_saved"
            ? "completed"
            : "failed",
        error_message: normalizedStatus === "failed" ? file.message : null,
      })
      .eq("id", params.uploadId)
      .eq("teacher_id", params.teacherId);

    return {
      uploadId: params.uploadId,
      fileName: file.fileName,
      status: normalizedStatus,
      savedCount: file.savedCount,
      importBatchId: file.importBatchId,
      importBatchLabel: cleanText(params.label) || file.importBatchLabel,
      message: file.message,
      reviewPendingCount: file.reviewPendingCount,
    };
  } catch (error) {
    await params.supabase
      .from("pdf_scan_uploads")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "保存拆题结果失败",
      })
      .eq("id", params.uploadId)
      .eq("teacher_id", params.teacherId);
    throw error;
  }
}
