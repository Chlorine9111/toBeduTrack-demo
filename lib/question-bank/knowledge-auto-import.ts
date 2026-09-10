import type { SupabaseClient } from "@supabase/supabase-js";
import { updateKnowledgeDocument } from "@/lib/assistant/store";
import { hasPdfLlmParseProvider } from "@/lib/pdf-scan/ai-vision";
import { runScanPipeline } from "@/lib/pdf-scan/pipeline";
import { parseQuestionsFromText } from "@/lib/pdf-scan/question-parser";
import { saveScannedUploadsToLibrary } from "@/lib/pdf-scan/save-to-library";
import type { ParsedDocument } from "@/lib/wechat/document-parser";
import type { MistralOcrPage } from "@/lib/pdf-scan/mistral-ocr";
import type { Database, Json } from "@/types/database";

type DB = SupabaseClient<Database>;

export const KNOWLEDGE_DOCUMENT_UPLOAD_LINK_PREFIX = "knowledge-document:";

const QUESTION_FILENAME_PATTERN =
  /(试题|习题|练习|题册|题单|试卷|真题|模拟|exam|worksheet|practice|quiz|question|questions|problem[\s-]?set|frq|mcq)/i;

type QuestionBankStatus =
  | "queued"
  | "skipped"
  | "processing"
  | "saved"
  | "requires_review"
  | "requires_curriculum"
  | "no_questions"
  | "failed";

type QuestionBankMetadata = {
  status: QuestionBankStatus;
  reason?: string;
  parsedQuestionCount?: number;
  markerCount?: number;
  detectedQuestionCount?: number;
  savedCount?: number;
  reviewPendingCount?: number;
  scanUploadId?: string | null;
  importBatchId?: string | null;
  importBatchLabel?: string | null;
  lastProcessedAt?: string;
  message?: string;
};

type ImportPlan = {
  shouldProcess: boolean;
  metadata: QuestionBankMetadata;
};

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function countQuestionMarkers(text: string) {
  return (
    text.match(
      /(?:^|\n)\s*(?:第\s*\d+\s*题|\d+[.)、．]\s+|Q(?:uestion)?\s*\d+[.:：]?\s+|\(\d+\)\s+)/gim,
    )?.length ?? 0
  );
}

function toMetadataRecord(value: Json | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function buildPrefetchedOcrPages(
  parsedDocument: ParsedDocument | null,
): MistralOcrPage[] | undefined {
  const pageTexts = parsedDocument?.pageTexts?.filter((page) => cleanText(page).length > 0);
  if (!pageTexts || pageTexts.length === 0) return undefined;

  return pageTexts.map((markdown, index) => ({
    pageNumber: index + 1,
    markdown: markdown.trim(),
    images: [],
    dimensions: {
      width: 0,
      height: 0,
    },
  }));
}

function buildQuestionBankMetadata(
  currentMetadata: Json | null | undefined,
  nextQuestionBank: QuestionBankMetadata,
) {
  const base = toMetadataRecord(currentMetadata);
  return {
    ...base,
    questionBank: {
      ...(base.questionBank && typeof base.questionBank === "object" && !Array.isArray(base.questionBank)
        ? (base.questionBank as Record<string, unknown>)
        : {}),
      ...nextQuestionBank,
    },
  } as Json;
}

export function planKnowledgeDocumentQuestionImport(params: {
  fileName: string;
  fileType: string;
  extractedText: string;
  parsedDocument: ParsedDocument | null;
}) : ImportPlan {
  const rawText = `${params.parsedDocument?.fullTextContent || params.extractedText || ""}`.trim();
  // Keep line breaks for heuristic detection. Flattened text destroys
  // "Question 1/2/3" style markers and causes real question PDFs to be skipped.
  const rawPreviewText = rawText.slice(0, 24000);
  const parsedQuestions = rawPreviewText ? parseQuestionsFromText(rawPreviewText) : [];
  const markerCount = countQuestionMarkers(rawPreviewText);
  const detectedQuestionCount = Math.max(parsedQuestions.length, markerCount);
  const fileNameSuggestsQuestions = QUESTION_FILENAME_PATTERN.test(params.fileName);
  const likelyQuestionMaterial =
    params.fileType.toLowerCase().includes("pdf") &&
    (parsedQuestions.length >= 2 || markerCount >= 3 || fileNameSuggestsQuestions);

  if (!params.fileType.toLowerCase().includes("pdf")) {
    return {
      shouldProcess: false,
      metadata: {
        status: "skipped",
        reason: "当前只对 PDF 资料自动抽题，其他格式先保留为资料。",
      },
    };
  }

  if (!likelyQuestionMaterial) {
    return {
      shouldProcess: false,
      metadata: {
        status: "skipped",
        reason: "当前文档更像讲义资料，未自动进入拆题流程。",
        parsedQuestionCount: detectedQuestionCount,
        markerCount,
      },
    };
  }

  return {
    shouldProcess: true,
    metadata: {
      status: "queued",
      reason: fileNameSuggestsQuestions
        ? "文件名与内容都像题目资料，已加入自动拆题队列。"
        : "检测到稳定题号结构，已加入自动拆题队列。",
      parsedQuestionCount: detectedQuestionCount,
      markerCount,
    },
  };
}

export async function autoImportKnowledgeDocumentToQuestionBank(params: {
  db: DB;
  teacherId: string;
  documentId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath: string | null;
  summary: string | null;
  metadata: Json | null | undefined;
  fileBuffer?: Buffer | null;
  parsedDocument: ParsedDocument | null;
  extractedText: string;
  subject?: string | null;
  unit?: string | null;
}) {
  const plan = planKnowledgeDocumentQuestionImport({
    fileName: params.fileName,
    fileType: params.fileType,
    extractedText: params.extractedText,
    parsedDocument: params.parsedDocument,
  });

  if (!plan.shouldProcess || !params.storagePath) {
    await updateKnowledgeDocument(params.db, params.teacherId, params.documentId, {
      metadata: buildQuestionBankMetadata(params.metadata, plan.metadata),
    }).catch(() => null);
    return plan.metadata;
  }

  await updateKnowledgeDocument(params.db, params.teacherId, params.documentId, {
    metadata: buildQuestionBankMetadata(params.metadata, {
      ...plan.metadata,
      status: "processing",
      lastProcessedAt: new Date().toISOString(),
    }),
  }).catch(() => null);

  const startedAt = Date.now();
  const { data: uploadRecord, error: uploadError } = await params.db
    .from("pdf_scan_uploads")
    .insert({
      teacher_id: params.teacherId,
      file_name: params.fileName,
      file_url: `${KNOWLEDGE_DOCUMENT_UPLOAD_LINK_PREFIX}${params.documentId}`,
      storage_path: params.storagePath,
      file_size: params.fileSize,
      page_count: params.parsedDocument?.pageTexts?.length ?? null,
      status: "processing",
      mathpix_id: null,
      question_count: 0,
    })
    .select("id")
    .single();

  if (uploadError || !uploadRecord) {
    const failedMetadata: QuestionBankMetadata = {
      status: "failed",
      reason: "创建自动拆题记录失败。",
      lastProcessedAt: new Date().toISOString(),
    };
    await updateKnowledgeDocument(params.db, params.teacherId, params.documentId, {
      metadata: buildQuestionBankMetadata(params.metadata, failedMetadata),
    }).catch(() => null);
    return failedMetadata;
  }

  try {
    let fileBuffer = params.fileBuffer ?? null;
    if (!fileBuffer) {
      const { data: fileData, error: downloadError } = await params.db.storage
        .from("pdfs")
        .download(params.storagePath);

      if (downloadError || !fileData) {
        throw new Error(`下载知识库文件失败: ${downloadError?.message ?? "文件不存在"}`);
      }

      fileBuffer = Buffer.from(await fileData.arrayBuffer());
    }

    const pipelineResult = await runScanPipeline({
      fileBuffer,
      fileName: params.fileName,
      uploadId: uploadRecord.id,
      teacherId: params.teacherId,
      useVision: hasPdfLlmParseProvider(),
      allowMathpixUpload: false,
      subject: params.subject ?? undefined,
      prefetchedText: params.extractedText,
      prefetchedPages: buildPrefetchedOcrPages(params.parsedDocument),
      prefetchedMode:
        typeof toMetadataRecord(params.metadata).ocrProvider === "string"
          ? `${toMetadataRecord(params.metadata).ocrProvider}-prefetched`
          : "ocr-prefetched",
    });

    const questions = pipelineResult.questions;
    const lowConfidenceCount = questions.filter((item) => item.confidence < 60).length;
    const byType: Record<string, number> = {};
    for (const question of questions) {
      byType[question.questionType] = (byType[question.questionType] ?? 0) + 1;
    }

    await params.db
      .from("pdf_scan_uploads")
      .update({
        status: "completed",
        question_count: questions.length,
        scan_result: {
          questions,
          stats: {
            total: questions.length,
            byType,
            lowConfidenceCount,
            averageConfidence:
              questions.length > 0
                ? Math.round(
                    questions.reduce((sum, item) => sum + item.confidence, 0) /
                      questions.length,
                  )
                : 0,
          },
          fileType: pipelineResult.fileType,
          extractionMode: pipelineResult.extractionMode,
          textPreview: pipelineResult.textPreview,
          analysis: pipelineResult.analysis,
          timings: pipelineResult.timings,
        } as unknown as Json,
        processing_time_ms: Date.now() - startedAt,
      })
      .eq("id", uploadRecord.id);

    const saveResult = await saveScannedUploadsToLibrary({
      supabase: params.db,
      teacherId: params.teacherId,
      uploadIds: [uploadRecord.id],
      curriculumHint: [
        params.subject,
        params.unit,
        params.summary,
        params.fileName,
      ]
        .filter(Boolean)
        .join("\n"),
      sourceDocumentId: params.documentId,
      sourceKind: "knowledge_document",
    });

    const fileResult = saveResult.files[0];
    const nextMetadata: QuestionBankMetadata = {
      status: (fileResult?.status ?? "failed") as QuestionBankStatus,
      detectedQuestionCount: questions.length,
      savedCount: fileResult?.savedCount ?? 0,
      reviewPendingCount: fileResult?.reviewPendingCount ?? questions.length,
      scanUploadId: uploadRecord.id,
      importBatchId: fileResult?.importBatchId ?? null,
      importBatchLabel: fileResult?.importBatchLabel ?? null,
      lastProcessedAt: new Date().toISOString(),
      message: fileResult?.message ?? "自动拆题完成。",
    };

    await updateKnowledgeDocument(params.db, params.teacherId, params.documentId, {
      metadata: buildQuestionBankMetadata(params.metadata, nextMetadata),
    }).catch(() => null);

    return nextMetadata;
  } catch (error) {
    const message = error instanceof Error ? error.message : "自动拆题失败";
    await params.db
      .from("pdf_scan_uploads")
      .update({
        status: "failed",
        error_message: message,
        processing_time_ms: Date.now() - startedAt,
      })
      .eq("id", uploadRecord.id);

    const failedMetadata: QuestionBankMetadata = {
      status: "failed",
      reason: message,
      scanUploadId: uploadRecord.id,
      lastProcessedAt: new Date().toISOString(),
    };
    await updateKnowledgeDocument(params.db, params.teacherId, params.documentId, {
      metadata: buildQuestionBankMetadata(params.metadata, failedMetadata),
    }).catch(() => null);
    return failedMetadata;
  }
}
