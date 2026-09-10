import { NextResponse } from "next/server";
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
import { getSubmission } from "@/lib/grading/store";
import { checkQuotaAdmissionSafe, finalizeQuotaSpendSafe } from "@/lib/quota/service";
import { buildQuotaHeaders, buildQuotaExhaustedDetails } from "@/lib/quota/headers";
import type { QuotaAction } from "@/lib/quota/types";
import { createFeatureDisabledError } from "@/lib/runtime/app-error";
import { scheduleReliableAfterTask } from "@/lib/runtime/background-task";
import { isFeatureEnabled } from "@/lib/runtime/feature-flags";
import { getWorkflowProfile } from "@/lib/runtime/workflow-profiles";

const QUOTA_ACTION: QuotaAction = "auto_grade";

export async function POST(
  _request: Request,
  context: { params: Promise<{ sessionId: string; submissionId: string }> },
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
  if (!uuidParamSchema.safeParse(params.submissionId).success) {
    return invalidIdResponse("答卷 ID");
  }

  // ── 配额准入检查 ──
  const { supabase } = gradingContext;
  const quotaIdempotencyKey = `auto-grade:${params.submissionId}`;
  const quotaAdmission = supabase
    ? await checkQuotaAdmissionSafe(supabase, {
        teacherId: gradingContext.teacherId,
        action: QUOTA_ACTION,
      })
    : null;
  if (quotaAdmission && !quotaAdmission.allowed) {
    return jsonError(
      "QUOTA_EXHAUSTED",
      "当前测试期使用量已达上限，请等待下个周期重置后继续。",
      403,
      buildQuotaExhaustedDetails(quotaAdmission),
      buildQuotaHeaders(quotaAdmission, { snapshot: "admission" }),
    );
  }

  try {
    const asyncJobsEnabled = await isFeatureEnabled("grading.async_jobs", true);
    const workflowProfile = getWorkflowProfile("grading_auto_grade");
    if (!asyncJobsEnabled) {
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
        const result = await autoGradeSubmissionById({
          gradingContext,
          sessionId: params.sessionId,
          submissionId: params.submissionId,
        });

        // 同步模式：判卷成功后扣减配额
        if (supabase) {
          await finalizeQuotaSpendSafe(supabase, {
            teacherId: gradingContext.teacherId,
            action: QUOTA_ACTION,
            idempotencyKey: quotaIdempotencyKey,
            metadata: {
              route: "/api/grading/sessions/[sessionId]/submissions/[submissionId]/auto-grade",
              sessionId: params.sessionId,
              submissionId: params.submissionId,
            },
          });
        }

        return NextResponse.json({
          submission: result.submission,
          answers: result.answers,
          session: result.session,
          stats: result.stats,
          provider: result.provider,
          qualityGate: result.qualityGate,
        });
      } finally {
        concurrencyLease.release();
      }
    }

    const submission = await getSubmission(
      gradingContext,
      params.sessionId,
      params.submissionId,
    );
    if (!submission) {
      throw new AutoGradeError("NOT_FOUND", "未找到学生答卷", 404);
    }
    const admission = await getGradingJobAdmission({
      teacherId: gradingContext.teacherId,
      kind: "auto_grade_submission",
      sessionId: params.sessionId,
      submissionId: params.submissionId,
    });
    if (!admission.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: admission.reason,
            details: {
              workflow: admission.workflow,
              active: admission.active,
              limit: admission.limit,
              blockingJobs: admission.blockingJobs,
            },
          },
        },
        {
          status: 429,
          headers: {
            ...buildConcurrencyLimitHeaders({
              active: admission.active,
              limit: admission.limit,
            }),
            "Retry-After": String(admission.retryAfterSec),
          },
        },
      );
    }

    const job = await enqueueGradingJob({
      teacherId: gradingContext.teacherId,
      sessionId: params.sessionId,
      submissionId: params.submissionId,
      kind: "auto_grade_submission",
      idempotencyKey: buildGradingIdempotencyKey({
        kind: "auto_grade_submission",
        sessionId: params.sessionId,
        submissionId: params.submissionId,
      }),
      payload: {
        requestedBy: gradingContext.teacherId,
      },
    });

    scheduleReliableAfterTask({
      taskType: "grading.auto_grade_submission",
      taskKey: job.id,
      teacherId: gradingContext.teacherId,
      payload: {
        sessionId: params.sessionId,
        submissionId: params.submissionId,
        jobId: job.id,
      },
      run: async () => {
        await processGradingJob({ jobId: job.id });
      },
    });

    // 异步模式：job 入队成功后扣减配额
    if (supabase) {
      await finalizeQuotaSpendSafe(supabase, {
        teacherId: gradingContext.teacherId,
        action: QUOTA_ACTION,
        idempotencyKey: quotaIdempotencyKey,
        metadata: {
          route: "/api/grading/sessions/[sessionId]/submissions/[submissionId]/auto-grade",
          sessionId: params.sessionId,
          submissionId: params.submissionId,
          jobId: job.id,
        },
      });
    }

    return NextResponse.json(
      {
        async: true,
        job,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof AutoGradeError) {
      return jsonErrorFromUnknown(error, error.message, error.status);
    }
    console.error("自动判卷失败", error);
    return jsonErrorFromUnknown(error, "自动判卷失败", 500);
  }
}
