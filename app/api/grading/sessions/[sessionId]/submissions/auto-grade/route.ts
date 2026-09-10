import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/response";
import {
  acquireConcurrencySlot,
  buildConcurrencyLimitHeaders,
} from "@/lib/api/concurrency-limit";
import { getGradingContextOrResponse, invalidIdResponse, uuidParamSchema } from "@/lib/grading/api";
import { AutoGradeError, autoGradeSubmissionById } from "@/lib/grading/auto-grade";
import {
  buildGradingIdempotencyKey,
  enqueueGradingJob,
  getGradingJobAdmission,
  processGradingJob,
} from "@/lib/grading/jobs";
import { getGradingSession, listSessionSubmissions } from "@/lib/grading/store";
import { createFeatureDisabledError } from "@/lib/runtime/app-error";
import { scheduleReliableAfterTask } from "@/lib/runtime/background-task";
import { isFeatureEnabled } from "@/lib/runtime/feature-flags";
import { getWorkflowProfile } from "@/lib/runtime/workflow-profiles";

const batchAutoGradeSchema = z.object({
  submissionIds: z.array(z.string().uuid()).max(200).optional(),
  includeCompleted: z.boolean().optional(),
  concurrency: z.number().int().min(1).max(3).optional(),
});

type BatchItemResult = {
  submissionId: string;
  ok: boolean;
  status?: string;
  totalScore?: number | null;
  maxScore?: number | null;
  provider?: string;
  error?: string;
};

async function parseOptionalJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  return JSON.parse(text);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const size = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index]);
    }
  }

  await Promise.all(Array.from({ length: size }, () => worker()));
  return results;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { context: gradingContext, response } = await getGradingContextOrResponse();
  if (!gradingContext) return response;

  const autoGradeEnabled = await isFeatureEnabled("grading.auto_grade.enabled", true);
  if (!autoGradeEnabled) {
    return jsonErrorFromUnknown(createFeatureDisabledError("智能判卷当前已关闭"));
  }

  const params = await context.params;
  if (!uuidParamSchema.safeParse(params.sessionId).success) {
    return invalidIdResponse("任务 ID");
  }

  try {
    const rawBody = await parseOptionalJsonBody(request);
    const body = batchAutoGradeSchema.parse(rawBody);

    const session = await getGradingSession(gradingContext, params.sessionId);
    if (!session) {
      return jsonError("NOT_FOUND", "未找到判卷任务", 404);
    }
    if (!session.answerKey.length) {
      return jsonError("VALIDATION_ERROR", "请先配置答案键", 400);
    }

    const allSubmissions = await listSessionSubmissions(gradingContext, params.sessionId);
    const requested = body.submissionIds?.length ? new Set(body.submissionIds) : null;
    const includeCompleted = body.includeCompleted ?? false;
    const targets = allSubmissions.filter((item) => {
      if (requested && !requested.has(item.id)) return false;
      if (!includeCompleted && item.status === "completed") return false;
      return true;
    });
    const skippedCompleted = includeCompleted
      ? 0
      : allSubmissions.filter(
          (item) => (!requested || requested.has(item.id)) && item.status === "completed",
        ).length;

    if (!targets.length) {
      return NextResponse.json({
        total: 0,
        succeeded: 0,
        failed: 0,
        skippedCompleted,
        results: [],
        message: "没有可执行的答卷（可能都已判分，或 submissionIds 不匹配）。",
      });
    }

    const asyncJobsEnabled = await isFeatureEnabled("grading.async_jobs", true);
    if (!asyncJobsEnabled) {
      const workflowProfile = getWorkflowProfile("grading_auto_grade");
      const concurrencyLease = acquireConcurrencySlot({
        key: workflowProfile.name,
        identifier: gradingContext.teacherId,
        limit: workflowProfile.concurrency?.maxInFlight ?? 1,
      });
      if (!concurrencyLease.allowed) {
        return jsonError(
          "RATE_LIMITED",
          "当前进行中的智能判卷任务过多，请等待已有任务完成后再试。",
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
      const results = await mapWithConcurrency(
        targets,
        body.concurrency ?? 1,
        async (submission): Promise<BatchItemResult> => {
          try {
            const graded = await autoGradeSubmissionById({
              gradingContext,
              sessionId: params.sessionId,
              submissionId: submission.id,
            });
            return {
              submissionId: submission.id,
              ok: true,
              status: graded.submission.status,
              totalScore: graded.submission.totalScore,
              maxScore: graded.submission.maxScore,
              provider: graded.provider,
            };
          } catch (error) {
            if (error instanceof AutoGradeError) {
              return {
                submissionId: submission.id,
                ok: false,
                error: error.message,
              };
            }
            console.error("批量自动判卷单份失败", {
              submissionId: submission.id,
              error,
            });
            return {
              submissionId: submission.id,
              ok: false,
              error: "自动判卷失败",
            };
          }
        },
      );

      const succeeded = results.filter((item) => item.ok).length;
      const failed = results.length - succeeded;
      const latestSession = await getGradingSession(gradingContext, params.sessionId);
      const latestSubmissions = await listSessionSubmissions(gradingContext, params.sessionId);

      return NextResponse.json({
        total: results.length,
        succeeded,
        failed,
        skippedCompleted,
        session: latestSession,
        submissions: latestSubmissions,
        results,
      });
      } finally {
        concurrencyLease.release();
      }
    }

    const admission = await getGradingJobAdmission({
      teacherId: gradingContext.teacherId,
      kind: "auto_grade_batch",
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

    const job = await enqueueGradingJob({
      teacherId: gradingContext.teacherId,
      sessionId: params.sessionId,
      kind: "auto_grade_batch",
      idempotencyKey:
        request.headers.get("x-idempotency-key") ||
        buildGradingIdempotencyKey({
          kind: "auto_grade_batch",
          sessionId: params.sessionId,
          submissionIds: targets.map((item) => item.id),
        }),
      payload: {
        submissionIds: targets.map((item) => item.id),
        requestedBy: gradingContext.teacherId,
      },
    });

    scheduleReliableAfterTask({
      taskType: "grading.auto_grade_batch",
      taskKey: job.id,
      teacherId: gradingContext.teacherId,
      payload: {
        sessionId: params.sessionId,
        submissionIds: targets.map((item) => item.id),
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
        skippedCompleted,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "批量判分参数不合法", 400, error.flatten());
    }
    console.error("批量自动判卷失败", error);
    return jsonErrorFromUnknown(error, "批量自动判卷失败", 500);
  }
}
