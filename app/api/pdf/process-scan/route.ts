import { NextResponse } from "next/server";
import { z } from "zod";
import { optionalNullableUuidLikeSchema } from "@/lib/api/id-schemas";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ensureTeacher,
  EnsureTeacherError,
} from "@/lib/teachers/ensure-teacher";
import { isAuthBypassEnabled } from "@/lib/auth/bypass";
import { jsonError } from "@/lib/api/response";
import { parseJsonBody, InvalidJsonBodyError } from "@/lib/api/request";
import type { ScannedQuestion, PdfScanStats } from "@/lib/pdf-scan/types";
import { runScanPipeline } from "@/lib/pdf-scan/pipeline";
import { hasPdfLlmParseProvider } from "@/lib/pdf-scan/ai-vision";
import { persistSourcePageImages } from "@/lib/pdf-scan/page-images";
import { saveScannedUploadsToLibrary } from "@/lib/pdf-scan/save-to-library";
import { createLogger } from "@/lib/logger";
import type { OcrProvider } from "@/lib/pdf-scan/ocr-router";
import type { Json } from "@/types/database";

const logger = createLogger("process-scan");

const requestSchema = z.object({
  uploadId: z.string().uuid(),
  courseId: optionalNullableUuidLikeSchema,
  unitId: optionalNullableUuidLikeSchema,
  topicId: optionalNullableUuidLikeSchema,
  curriculumHint: z.string().trim().max(400).nullable().optional(),
  subject: z.string().trim().min(1).max(120).optional(),
  forceProvider: z.enum(["mathpix", "mistral"]).optional(),
  skipSave: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const startTime = Date.now();
  let parsedUploadId: string | null = null;
  let dbRef: Awaited<ReturnType<typeof ensureTeacher>>["supabase"] | null = null;

  try {
    const body = await parseJsonBody(request);
    const {
      uploadId,
      courseId,
      unitId,
      topicId,
      curriculumHint,
      subject,
      forceProvider,
      skipSave,
    } =
      requestSchema.parse(body);
    parsedUploadId = uploadId;

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const authBypass = isAuthBypassEnabled();

    if (!user && !authBypass) {
      return jsonError("UNAUTHORIZED", "请先登录", 401);
    }

    const ensured = await ensureTeacher({ supabase, user, authBypass });
    const teacherId = ensured.teacherId;
    const db = ensured.supabase;
    dbRef = db;

    const admin = createAdminSupabaseClient();
    const { data: record, error } = await db
      .from("pdf_scan_uploads")
      .select("id, file_name, storage_path, mathpix_id, status")
      .eq("id", uploadId)
      .eq("teacher_id", teacherId)
      .single();

    if (error || !record) {
      return jsonError("NOT_FOUND", "记录不存在", 404);
    }

    if (!record.storage_path) {
      return jsonError("NOT_FOUND", "文件存储路径不存在", 404);
    }

    await db
      .from("pdf_scan_uploads")
      .update({
        status: "processing",
        error_message: null,
      })
      .eq("id", uploadId);

    const { data: fileData, error: downloadError } = await admin.storage
      .from("pdfs")
      .download(record.storage_path);

    if (downloadError || !fileData) {
      await db
        .from("pdf_scan_uploads")
        .update({
          status: "failed",
          error_message: downloadError?.message ?? "文件不存在",
        })
        .eq("id", uploadId);
      return jsonError(
        "NOT_FOUND",
        `下载文件失败: ${downloadError?.message ?? "文件不存在"}`,
        404,
      );
    }

    const useVision =
      process.env.USE_VISION_LAYOUT === "true" || hasPdfLlmParseProvider();
    const fileBuffer = Buffer.from(await fileData.arrayBuffer());
    const pipelineResult = await runScanPipeline({
      fileBuffer,
      fileName: record.file_name,
      mathpixId: record.mathpix_id,
      uploadId,
      teacherId,
      useVision,
      subject,
      forceProvider: forceProvider as OcrProvider | undefined,
    });
    const questions: ScannedQuestion[] = pipelineResult.questions;

    const lowConfidenceCount = questions.filter(
      (q) => q.confidence < 60,
    ).length;
    const byType: Record<string, number> = {};
    for (const q of questions) {
      byType[q.questionType] = (byType[q.questionType] ?? 0) + 1;
    }

    const stats: PdfScanStats = {
      total: questions.length,
      byType,
      lowConfidenceCount,
      averageConfidence:
        questions.length > 0
          ? Math.round(
              questions.reduce((sum, q) => sum + q.confidence, 0) /
                questions.length,
            )
          : 0,
    };

    const processingTime = Date.now() - startTime;
    const pageImages = await persistSourcePageImages({
      fileBuffer,
      fileName: record.file_name,
      uploadId,
      teacherId,
      pageNumbers:
        questions
          .map((question) => Number(question.sourcePageNumber ?? 0))
          .filter((pageNumber) => Number.isFinite(pageNumber) && pageNumber > 0),
    });
    const storedScanResult = {
      questions,
      stats,
      fileType: pipelineResult.fileType,
      extractionMode: pipelineResult.extractionMode,
      textPreview: pipelineResult.textPreview,
      analysis: pipelineResult.analysis,
      timings: pipelineResult.timings,
      pageImages,
    } as unknown as Json;

    await db
      .from("pdf_scan_uploads")
      .update({
        status: skipSave ? "completed" : "processing",
        question_count: questions.length,
        scan_result: storedScanResult,
        processing_time_ms: processingTime,
      })
      .eq("id", uploadId);

    let saveResult: Awaited<ReturnType<typeof saveScannedUploadsToLibrary>> | null = null;
    let saveErrorMessage: string | null = null;
    if (!skipSave) {
      try {
        saveResult = await saveScannedUploadsToLibrary({
          supabase: db,
          teacherId,
          uploadIds: [uploadId],
          courseId: courseId ?? null,
          unitId: unitId ?? null,
          topicId: topicId ?? null,
          curriculumHint: curriculumHint ?? null,
        });

        await db
          .from("pdf_scan_uploads")
          .update({
            status: "completed",
            question_count: questions.length,
          })
          .eq("id", uploadId);
      } catch (saveErr) {
        await db
          .from("pdf_scan_uploads")
          .update({
            status: "failed",
            error_message:
              saveErr instanceof Error ? saveErr.message : "保存失败",
            scan_result: {
              ...(storedScanResult as Record<string, unknown>),
              saveError:
                saveErr instanceof Error ? saveErr.message : "保存失败",
            } as unknown as Json,
          })
          .eq("id", uploadId);
        saveErrorMessage =
          saveErr instanceof Error ? saveErr.message : "保存失败";
      }
    }

    if (saveErrorMessage) {
      return jsonError("INTERNAL_ERROR", saveErrorMessage, 500);
    }

    return NextResponse.json({
      questions,
      stats,
      fileType: pipelineResult.fileType,
      extractionMode: pipelineResult.extractionMode,
      textPreview: pipelineResult.textPreview,
      analysis: pipelineResult.analysis,
      timings: pipelineResult.timings,
      saveResult: saveResult?.files[0] ?? null,
    });
  } catch (err) {
    if (parsedUploadId && dbRef) {
      await dbRef
        .from("pdf_scan_uploads")
        .update({ status: "failed" })
        .eq("id", parsedUploadId)
        .then(() => null, () => null);
    }
    if (err instanceof EnsureTeacherError) {
      return jsonError("UNAUTHORIZED", err.message, err.status);
    }
    if (err instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", err.message, 400);
    }
    if (err instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "参数格式错误", 400);
    }
    const message = err instanceof Error ? err.message : "处理失败";
    logger.error("PDF 处理流程异常", { action: "POST", uploadId: parsedUploadId ?? "unknown" }, err);
    return jsonError("INTERNAL_ERROR", message, 500);
  }
}
