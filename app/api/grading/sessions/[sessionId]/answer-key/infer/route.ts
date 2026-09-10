import { NextResponse } from "next/server";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/response";
import {
  acquireConcurrencySlot,
  buildConcurrencyLimitHeaders,
} from "@/lib/api/concurrency-limit";
import { getGradingContextOrResponse, invalidIdResponse, uuidParamSchema } from "@/lib/grading/api";
import { inferAnswerKeyFromQuestionPaper } from "@/lib/grading/answer-key-inference";
import {
  buildGradingIdempotencyKey,
  enqueueGradingJob,
  getGradingJobAdmission,
  processGradingJob,
} from "@/lib/grading/jobs";
import { getGradingSession, setSessionAnswerKey, updateGradingSession } from "@/lib/grading/store";
import { createFeatureDisabledError } from "@/lib/runtime/app-error";
import { scheduleReliableAfterTask } from "@/lib/runtime/background-task";
import { isFeatureEnabled } from "@/lib/runtime/feature-flags";
import { getWorkflowProfile } from "@/lib/runtime/workflow-profiles";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  assertFileHeader,
  detectScanFileType,
  getAllowedUploadHint,
} from "@/lib/pdf-scan/file-type";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

function sanitizeFileName(name: string) {
  const baseName = name.split(/[/\\]/).pop() || "question-paper";
  return baseName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

async function uploadQuestionPaper(params: {
  teacherId: string;
  sessionId: string;
  file: File;
  fileBuffer: Buffer;
}) {
  const safeName = sanitizeFileName(params.file.name);
  const storagePath = `grading/${params.teacherId}/${params.sessionId}/question-paper/${Date.now()}-${safeName}`;

  const admin = createAdminSupabaseClient();
  const { error } = await admin.storage.from("pdfs").upload(storagePath, params.fileBuffer, {
    contentType: params.file.type,
    upsert: false,
  });

  if (error) {
    throw new Error(`上传题目卷失败: ${error.message}`);
  }

  return {
    storagePath,
    fileName: safeName,
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { context: gradingContext, response } = await getGradingContextOrResponse();
  if (!gradingContext) return response;

  const inferEnabled = await isFeatureEnabled("grading.answer_key_inference.enabled", true);
  if (!inferEnabled) {
    return jsonErrorFromUnknown(createFeatureDisabledError("智能生成答案键当前已关闭"));
  }

  const params = await context.params;
  if (!uuidParamSchema.safeParse(params.sessionId).success) {
    return invalidIdResponse("任务 ID");
  }

  try {
    const session = await getGradingSession(gradingContext, params.sessionId);
    if (!session) {
      return jsonError("NOT_FOUND", "未找到判卷任务", 404);
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return jsonError("VALIDATION_ERROR", "缺少题目卷文件", 400);
    }
    if (file.size > MAX_FILE_SIZE) {
      return jsonError("VALIDATION_ERROR", "题目卷文件不能超过 20MB", 400);
    }

    const fileType = detectScanFileType({
      fileName: file.name,
      mimeType: file.type,
    });
    if (!fileType) {
      return jsonError("VALIDATION_ERROR", getAllowedUploadHint(), 400);
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    assertFileHeader({
      fileType,
      fileName: file.name,
      bytes: fileBuffer,
    });

    const asyncJobsEnabled = await isFeatureEnabled("grading.async_jobs", true);
    const workflowProfile = getWorkflowProfile("grading_answer_key_infer");
    if (!asyncJobsEnabled) {
      const concurrencyLease = acquireConcurrencySlot({
        key: workflowProfile.name,
        identifier: gradingContext.teacherId,
        limit: workflowProfile.concurrency?.maxInFlight ?? 1,
      });
      if (!concurrencyLease.allowed) {
        return jsonError(
          "RATE_LIMITED",
          "当前进行中的答案键推断任务过多，请等待已有任务完成后再试。",
          429,
          {
            workflow: workflowProfile.name,
            active: concurrencyLease.active,
            limit: concurrencyLease.limit,
          },
          buildConcurrencyLimitHeaders({
            active: concurrencyLease.active,
            limit: concurrencyLease.limit,
          }),
        );
      }

      try {
        const inferred = await inferAnswerKeyFromQuestionPaper({
          fileBuffer,
          fileName: file.name,
          sessionTitle: session.title,
        });

        const updated = await setSessionAnswerKey(gradingContext, params.sessionId, {
          answerKeySource: "exercise",
          answerKey: inferred.answerKey,
        });

        if (!updated) {
          return jsonError("NOT_FOUND", "未找到判卷任务", 404);
        }

        return NextResponse.json({
          session: updated,
          analysis: inferred.analysis,
          qualityGate: inferred.qualityGate,
        });
      } finally {
        concurrencyLease.release();
      }
    }

    const admission = await getGradingJobAdmission({
      teacherId: gradingContext.teacherId,
      kind: "infer_answer_key",
      sessionId: params.sessionId,
    });
    if (!admission.allowed) {
      return jsonError(
        "RATE_LIMITED",
        admission.reason,
        429,
        {
          workflow: admission.workflow,
          active: admission.active,
          limit: admission.limit,
          blockingJobs: admission.blockingJobs,
        },
        {
          ...buildConcurrencyLimitHeaders({
            active: admission.active,
            limit: admission.limit,
          }),
          "Retry-After": String(admission.retryAfterSec),
        },
      );
    }

    const uploaded = await uploadQuestionPaper({
      teacherId: gradingContext.teacherId,
      sessionId: params.sessionId,
      file,
      fileBuffer,
    });
    const idempotencyKey =
      request.headers.get("x-idempotency-key") ||
      buildGradingIdempotencyKey({
        kind: "infer_answer_key",
        sessionId: params.sessionId,
        fileName: file.name,
        fileSize: file.size,
        lastModified: file.lastModified,
      });

    const job = await enqueueGradingJob({
      teacherId: gradingContext.teacherId,
      sessionId: params.sessionId,
      kind: "infer_answer_key",
      idempotencyKey,
      payload: {
        questionPaperStoragePath: uploaded.storagePath,
        questionPaperFileName: uploaded.fileName,
        requestedBy: gradingContext.teacherId,
      },
    });

    await updateGradingSession(gradingContext, params.sessionId, { status: "processing" });

    scheduleReliableAfterTask({
      taskType: "grading.infer_answer_key",
      taskKey: job.id,
      teacherId: gradingContext.teacherId,
      payload: {
        sessionId: params.sessionId,
        jobId: job.id,
      },
      run: async () => {
        await processGradingJob({ jobId: job.id });
      },
    });

    return NextResponse.json(
      {
        async: true,
        job,
      },
      { status: 202 },
    );
  } catch (error) {
    console.error("智能生成答案键失败", error);
    return jsonErrorFromUnknown(error, "智能生成答案键失败", 500);
  }
}
