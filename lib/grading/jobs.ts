import { createHash, randomUUID } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createScopedLessonPlanContext } from "@/lib/lesson-plan/context";
import { inferAnswerKeyFromQuestionPaper } from "@/lib/grading/answer-key-inference";
import { autoGradeSubmissionById } from "@/lib/grading/auto-grade";
import { getGradingSession, getSubmission, setSessionAnswerKey } from "@/lib/grading/store";
import type { GradingJob, GradingJobKind, GradingJobStatus } from "@/lib/grading/types";
import {
  createConflictError,
  createNotFoundError,
  createPersistenceError,
  createRateLimitError,
  createTimeoutError,
  createValidationError,
  toAppError,
} from "@/lib/runtime/app-error";
import { runWithDeadline } from "@/lib/runtime/deadline";
import { internalTable } from "@/lib/runtime/internal-table";
import { runWithRetry } from "@/lib/runtime/retry";
import { createWorkflowRun, finalizeWorkflowRun, recordWorkflowStep } from "@/lib/runtime/workflow-telemetry";
import {
  evaluateWorkflowBudget,
  getWorkflowProfile,
  serializeWorkflowProfile,
  type WorkflowProfileName,
} from "@/lib/runtime/workflow-profiles";

type DbClient = ReturnType<typeof createAdminSupabaseClient>;

type GradingJobPayload = {
  questionPaperStoragePath?: string | null;
  questionPaperFileName?: string | null;
  submissionIds?: string[];
  requestedBy?: string | null;
};

const GRADING_JOB_BUDGETS = {
  loadQuestionPaperMs: 3_000,
  inferAnswerKeyMs: 24_000,
  persistAnswerKeyMs: 3_000,
  loadSubmissionMs: 2_000,
  ocrSubmissionMs: 22_000,
  gradeSubmissionMs: 12_000,
  persistSubmissionMs: 5_000,
};

const ACTIVE_GRADING_JOB_STATUSES: GradingJobStatus[] = ["queued", "running"];
const DEFAULT_GRADING_RETRY_AFTER_SEC = 15;

const GRADING_JOB_SELECT = [
  "id",
  "teacher_id",
  "session_id",
  "submission_id",
  "kind",
  "status",
  "idempotency_key",
  "payload",
  "result",
  "error_code",
  "error_message",
  "attempts",
  "max_attempts",
  "available_at",
  "started_at",
  "completed_at",
  "created_at",
  "updated_at",
].join(", ");

type EnqueueGradingJobInput = {
  teacherId: string;
  sessionId: string;
  submissionId?: string | null;
  kind: GradingJobKind;
  idempotencyKey: string;
  payload?: GradingJobPayload;
  maxAttempts?: number;
};

type ActiveGradingJobSummary = Pick<
  GradingJob,
  "id" | "kind" | "sessionId" | "submissionId" | "status" | "createdAt"
>;

export type GradingJobAdmission = {
  allowed: boolean;
  workflow: WorkflowProfileName;
  active: number;
  limit: number;
  retryAfterSec: number;
  reason: string;
  blockingJobs: ActiveGradingJobSummary[];
};

function resolveGradingWorkflowName(kind: GradingJobKind): WorkflowProfileName {
  return kind === "infer_answer_key"
    ? "grading_answer_key_infer"
    : "grading_auto_grade";
}

function resolveCompetingGradingKinds(kind: GradingJobKind): GradingJobKind[] {
  return kind === "infer_answer_key"
    ? ["infer_answer_key"]
    : ["auto_grade_submission", "auto_grade_batch"];
}

function gradingJobsTable(db: DbClient) {
  return internalTable(db, "grading_jobs");
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asRow(value: unknown): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

function asRows(value: unknown): Record<string, unknown>[] {
  return (value ?? []) as unknown as Record<string, unknown>[];
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asStringOrNull(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asJsonRecord(value: unknown) {
  return asObject(value) as Record<string, unknown>;
}

function mapGradingJob(row: Record<string, unknown>): GradingJob {
  return {
    id: asString(row.id),
    teacherId: asString(row.teacher_id),
    sessionId: asString(row.session_id),
    submissionId: asStringOrNull(row.submission_id),
    kind: asString(row.kind) as GradingJobKind,
    status: asString(row.status) as GradingJobStatus,
    idempotencyKey: asString(row.idempotency_key),
    payload: asJsonRecord(row.payload),
    result: row.result ? asJsonRecord(row.result) : null,
    errorCode: asStringOrNull(row.error_code),
    errorMessage: asStringOrNull(row.error_message),
    attempts: asNumber(row.attempts),
    maxAttempts: asNumber(row.max_attempts, 3),
    availableAt: asString(row.available_at),
    startedAt: asStringOrNull(row.started_at),
    completedAt: asStringOrNull(row.completed_at),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

async function listTeacherActiveGradingJobs(params: {
  teacherId: string;
  kind: GradingJobKind;
}) {
  const admin = createAdminSupabaseClient();
  const competingKinds = resolveCompetingGradingKinds(params.kind);
  const { data, error } = await gradingJobsTable(admin)
    .select(GRADING_JOB_SELECT)
    .eq("teacher_id", params.teacherId)
    .in("status", ACTIVE_GRADING_JOB_STATUSES)
    .in("kind", competingKinds);

  if (error) {
    throw createPersistenceError("读取教师活跃判卷任务失败", { cause: error });
  }

  return asRows(data).map((row) =>
    mapGradingJob(row),
  );
}

export async function getGradingJobAdmission(params: {
  teacherId: string;
  kind: GradingJobKind;
  sessionId: string;
  submissionId?: string | null;
}) {
  const workflow = resolveGradingWorkflowName(params.kind);
  const profile = getWorkflowProfile(workflow);
  const limit = profile.concurrency?.maxInFlight ?? 1;
  const activeJobs = await listTeacherActiveGradingJobs({
    teacherId: params.teacherId,
    kind: params.kind,
  });

  const blockingJobs = activeJobs.filter((job) => {
    if (job.sessionId !== params.sessionId) return true;
    if (!params.submissionId) return true;
    return job.submissionId === params.submissionId;
  });

  if (blockingJobs.length < limit) {
    return {
      allowed: true,
      workflow,
      active: blockingJobs.length,
      limit,
      retryAfterSec: DEFAULT_GRADING_RETRY_AFTER_SEC,
      reason: "",
      blockingJobs,
    } satisfies GradingJobAdmission;
  }

  const sameTargetJob = blockingJobs.find((job) => {
    if (job.sessionId !== params.sessionId) return false;
    if (!params.submissionId) return true;
    return job.submissionId === params.submissionId;
  });
  const reason = sameTargetJob
    ? "相同判卷链路已有后台任务正在执行，请等待当前任务完成后再试。"
    : "当前进行中的判卷任务过多，请等待已有任务完成后再试。";

  return {
    allowed: false,
    workflow,
    active: blockingJobs.length,
    limit,
    retryAfterSec: DEFAULT_GRADING_RETRY_AFTER_SEC,
    reason,
    blockingJobs: blockingJobs.slice(0, 3).map((job) => ({
      id: job.id,
      kind: job.kind,
      sessionId: job.sessionId,
      submissionId: job.submissionId,
      status: job.status,
      createdAt: job.createdAt,
    })),
  } satisfies GradingJobAdmission;
}

function stableDigest(value: unknown) {
  return createHash("sha1").update(JSON.stringify(value)).digest("hex");
}

export function buildGradingIdempotencyKey(params: {
  kind: GradingJobKind;
  sessionId: string;
  submissionId?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  lastModified?: number | null;
  submissionIds?: string[];
}) {
  if (params.kind === "infer_answer_key") {
    return stableDigest({
      kind: params.kind,
      sessionId: params.sessionId,
      fileName: params.fileName ?? null,
      fileSize: params.fileSize ?? null,
      lastModified: params.lastModified ?? null,
    });
  }

  if (params.kind === "auto_grade_submission") {
    return stableDigest({
      kind: params.kind,
      sessionId: params.sessionId,
      submissionId: params.submissionId ?? null,
    });
  }

  return stableDigest({
    kind: params.kind,
    sessionId: params.sessionId,
    submissionIds: [...(params.submissionIds ?? [])].sort(),
  });
}

export async function getGradingJobForTeacher(params: {
  teacherId: string;
  jobId: string;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await gradingJobsTable(admin)
    .select(GRADING_JOB_SELECT)
    .eq("id", params.jobId)
    .eq("teacher_id", params.teacherId)
    .maybeSingle();

  if (error) {
    throw createPersistenceError("读取判卷任务失败", { cause: error });
  }

  return data ? mapGradingJob(asRow(data)) : null;
}

export async function enqueueGradingJob(input: EnqueueGradingJobInput) {
  const admin = createAdminSupabaseClient();

  const { data: existing, error: existingError } = await gradingJobsTable(admin)
    .select(GRADING_JOB_SELECT)
    .eq("teacher_id", input.teacherId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (existingError) {
    throw createPersistenceError("检查判卷任务幂等键失败", { cause: existingError });
  }

  if (existing) {
    const job = mapGradingJob(asRow(existing));
    if (job.status === "failed") {
      const { data: resetData, error: resetError } = await gradingJobsTable(admin)
        .update({
          status: "queued",
          available_at: new Date().toISOString(),
          completed_at: null,
          error_code: null,
          error_message: null,
        })
        .eq("id", job.id)
        .select(GRADING_JOB_SELECT)
        .maybeSingle();

      if (resetError) {
        throw createPersistenceError("重置判卷任务失败", { cause: resetError });
      }

      if (resetData) {
        return mapGradingJob(asRow(resetData));
      }
    }
    return job;
  }

  const admission = await getGradingJobAdmission({
    teacherId: input.teacherId,
    kind: input.kind,
    sessionId: input.sessionId,
    submissionId: input.submissionId,
  });
  if (!admission.allowed) {
    throw createRateLimitError(admission.reason, {
      source: admission.workflow,
      retryAfterSec: admission.retryAfterSec,
    });
  }

  const insertPayload = {
    teacher_id: input.teacherId,
    session_id: input.sessionId,
    submission_id: input.submissionId ?? null,
    kind: input.kind,
    status: "queued",
    idempotency_key: input.idempotencyKey,
    payload: input.payload ?? {},
    max_attempts: Math.max(1, input.maxAttempts ?? 3),
  };

  const { data, error } = await gradingJobsTable(admin)
    .insert(insertPayload)
    .select(GRADING_JOB_SELECT)
    .maybeSingle();

  if (error) {
    const message = error.message || "";
    if (message.toLowerCase().includes("duplicate") || message.includes("unique")) {
      const { data: conflict } = await gradingJobsTable(admin)
        .select(GRADING_JOB_SELECT)
        .eq("teacher_id", input.teacherId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (conflict) return mapGradingJob(asRow(conflict));
      throw createConflictError("判卷任务已存在");
    }
    throw createPersistenceError("创建判卷任务失败", { cause: error, details: insertPayload });
  }

  if (!data) {
    throw createPersistenceError("创建判卷任务失败，未返回任务记录", { details: insertPayload });
  }

  return mapGradingJob(asRow(data));
}

async function claimGradingJob(jobId: string) {
  const admin = createAdminSupabaseClient();
  const { data: currentData, error: currentError } = await gradingJobsTable(admin)
    .select(GRADING_JOB_SELECT)
    .eq("id", jobId)
    .maybeSingle();

  if (currentError) {
    throw createPersistenceError("读取判卷任务失败", { cause: currentError });
  }

  if (!currentData) {
    return null;
  }

  const current = mapGradingJob(asRow(currentData));
  if (!["queued", "failed"].includes(current.status)) {
    return null;
  }
  if (current.attempts >= current.maxAttempts) {
    return null;
  }

  const { data: bumped, error: bumpError } = await gradingJobsTable(admin)
    .update({
      status: "running",
      attempts: current.attempts + 1,
      started_at: new Date().toISOString(),
      completed_at: null,
      error_code: null,
      error_message: null,
    })
    .eq("id", jobId)
    .eq("status", current.status)
    .eq("attempts", current.attempts)
    .select(GRADING_JOB_SELECT)
    .maybeSingle();

  if (bumpError) {
    throw createPersistenceError("更新判卷任务尝试次数失败", { cause: bumpError });
  }

  return bumped ? mapGradingJob(asRow(bumped)) : null;
}

async function markGradingJobCompleted(jobId: string, result: Record<string, unknown>) {
  const admin = createAdminSupabaseClient();
  const completedAt = new Date().toISOString();
  const { data, error } = await gradingJobsTable(admin)
    .update({
      status: "completed",
      result,
      completed_at: completedAt,
      error_code: null,
      error_message: null,
    })
    .eq("id", jobId)
    .select(GRADING_JOB_SELECT)
    .maybeSingle();

  if (error) {
    throw createPersistenceError("写入判卷任务结果失败", { cause: error });
  }

  if (!data) {
    throw createPersistenceError("写入判卷任务结果失败，未返回任务记录");
  }

  return mapGradingJob(asRow(data));
}

async function markGradingJobFailed(job: GradingJob, error: unknown) {
  const admin = createAdminSupabaseClient();
  const appError = toAppError(error, {
    message: error instanceof Error ? error.message : "判卷任务失败",
    retryable: false,
  });
  const { data: failedData, error: failedError } = await gradingJobsTable(admin)
    .update({
      status: "failed",
      error_code: appError.code,
      error_message: appError.message,
      completed_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .select(GRADING_JOB_SELECT)
    .maybeSingle();

  if (failedError) {
    throw createPersistenceError("更新判卷任务失败状态失败", { cause: failedError });
  }

  return failedData ? mapGradingJob(asRow(failedData)) : job;
}

async function readQuestionPaperFromStorage(storagePath: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.storage.from("pdfs").download(storagePath);
  if (error || !data) {
    throw createNotFoundError("无法读取题目卷文件");
  }

  return Buffer.from(await data.arrayBuffer());
}

async function recordGradingJobStep(params: {
  runId?: string | null;
  workflow: WorkflowProfileName;
  step: string;
  status: "running" | "completed" | "failed";
  durationMs?: number;
  error?: unknown;
  metadata?: Record<string, unknown>;
}) {
  const appError =
    params.status === "failed" && params.error
      ? toAppError(params.error, {
          message:
            params.error instanceof Error
              ? params.error.message
              : `判卷步骤 ${params.step} 失败`,
          source: params.step,
        })
      : null;

  await recordWorkflowStep({
    runId: params.runId,
    workflow: params.workflow,
    step: params.step,
    status: params.status,
    durationMs: params.durationMs ?? null,
    errorCode: appError?.code ?? null,
    errorMessage: appError?.message ?? null,
    metadata: params.metadata ?? {},
  });
}

async function runGradingJobStep<T>(params: {
  runId?: string | null;
  workflow: WorkflowProfileName;
  step: string;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
  action: (signal: AbortSignal | undefined) => Promise<T>;
}) {
  await recordGradingJobStep({
    runId: params.runId,
    workflow: params.workflow,
    step: params.step,
    status: "running",
    metadata: params.metadata,
  });

  const startedAt = Date.now();
  try {
    const result =
      typeof params.timeoutMs === "number" && params.timeoutMs > 0
        ? await runWithDeadline({
            timeoutMs: params.timeoutMs,
            reason: `${params.step}>timeout`,
            onTimeout: () =>
              createTimeoutError(`判卷步骤 ${params.step} 超时（>${params.timeoutMs}ms）`, params.step),
            action: (signal) => params.action(signal),
          })
        : await params.action(undefined);

    await recordGradingJobStep({
      runId: params.runId,
      workflow: params.workflow,
      step: params.step,
      status: "completed",
      durationMs: Date.now() - startedAt,
      metadata: params.metadata,
    });
    return result;
  } catch (error) {
    await recordGradingJobStep({
      runId: params.runId,
      workflow: params.workflow,
      step: params.step,
      status: "failed",
      durationMs: Date.now() - startedAt,
      metadata: params.metadata,
      error,
    });
    throw error;
  }
}

async function processInferAnswerKeyJob(
  job: GradingJob,
  workflow: WorkflowProfileName,
  runId?: string | null,
) {
  const payload = job.payload as GradingJobPayload;
  if (!payload.questionPaperStoragePath || !payload.questionPaperFileName) {
    throw createValidationError("题目卷任务缺少 storagePath/fileName");
  }

  const gradingContext = createScopedLessonPlanContext(job.teacherId);
  const session = await getGradingSession(gradingContext, job.sessionId);
  if (!session) {
    throw createNotFoundError("未找到判卷任务");
  }

  const fileBuffer = await runGradingJobStep({
    runId,
    workflow,
    step: "load_question_paper",
    timeoutMs: GRADING_JOB_BUDGETS.loadQuestionPaperMs,
    metadata: { jobId: job.id },
    action: async () => readQuestionPaperFromStorage(payload.questionPaperStoragePath!),
  });
  const inferred = await runGradingJobStep({
    runId,
    workflow,
    step: "infer_answer_key",
    timeoutMs: GRADING_JOB_BUDGETS.inferAnswerKeyMs,
    metadata: { jobId: job.id, fileName: payload.questionPaperFileName },
    action: async (signal) =>
      runWithRetry(
        async () =>
          inferAnswerKeyFromQuestionPaper({
            fileBuffer,
            fileName: payload.questionPaperFileName!,
            sessionTitle: session.title,
            abortSignal: signal,
            onStep: async (event) => {
              await recordGradingJobStep({
                runId,
                workflow,
                step: `infer_answer_key.${event.step}`,
                status: event.status,
                durationMs: event.durationMs,
                metadata: {
                  jobId: job.id,
                  fileName: payload.questionPaperFileName,
                  ...(event.metadata ?? {}),
                },
                error: event.error,
              });
            },
          }),
        {
          retries: 1,
          shouldRetry: (error) => {
            const appError = toAppError(error, {
              message: error instanceof Error ? error.message : "答案键推断失败",
              source: "infer_answer_key",
            });
            return appError.retryable && appError.code !== "TIMEOUT";
          },
        },
      ),
  });

  const updated = await runGradingJobStep({
    runId,
    workflow,
    step: "persist_answer_key",
    timeoutMs: GRADING_JOB_BUDGETS.persistAnswerKeyMs,
    metadata: {
      jobId: job.id,
      answerKeyCount: inferred.answerKey.length,
      qualityStatus: inferred.qualityGate.status,
      qualityBlocked: inferred.qualityGate.blocked,
    },
    action: async () =>
      setSessionAnswerKey(gradingContext, job.sessionId, {
        answerKeySource: "exercise",
        answerKey: inferred.answerKey,
      }),
  });

  if (!updated) {
    throw createNotFoundError("未找到判卷任务");
  }

  return {
    session: updated,
    analysis: inferred.analysis,
    qualityGate: inferred.qualityGate,
  };
}

async function processAutoGradeSubmissionJob(
  job: GradingJob,
  workflow: WorkflowProfileName,
  runId?: string | null,
) {
  if (!job.submissionId) {
    throw createValidationError("自动判卷任务缺少 submissionId");
  }

  const gradingContext = createScopedLessonPlanContext(job.teacherId);
  const submission = await runGradingJobStep({
    runId,
    workflow,
    step: "load_submission",
    timeoutMs: GRADING_JOB_BUDGETS.loadSubmissionMs,
    metadata: { jobId: job.id, submissionId: job.submissionId },
    action: async () => getSubmission(gradingContext, job.sessionId, job.submissionId!),
  });
  if (!submission) {
    throw createNotFoundError("未找到学生答卷");
  }

  const graded = await runWithRetry(
    async () =>
      autoGradeSubmissionById({
        gradingContext,
        sessionId: job.sessionId,
        submissionId: job.submissionId!,
        budgets: {
          ocrMs: GRADING_JOB_BUDGETS.ocrSubmissionMs,
          gradingMs: GRADING_JOB_BUDGETS.gradeSubmissionMs,
        },
        onStep: async (event) => {
          await recordGradingJobStep({
            runId,
            workflow,
            step: event.step,
            status: event.status,
            durationMs: event.durationMs,
            metadata: {
              jobId: job.id,
              submissionId: job.submissionId,
              ...(event.metadata ?? {}),
            },
            error: event.error,
          });
        },
      }),
    {
      retries: 1,
      shouldRetry: (error) => {
        const appError = toAppError(error, {
          message: error instanceof Error ? error.message : "自动判卷失败",
          source: "auto_grade_submission",
        });
        return appError.retryable && appError.code !== "TIMEOUT";
      },
    },
  );

  return {
    submission: graded.submission,
    answers: graded.answers,
    session: graded.session,
    stats: graded.stats,
    provider: graded.provider,
    qualityGate: graded.qualityGate,
  };
}

async function processAutoGradeBatchJob(
  job: GradingJob,
  workflow: WorkflowProfileName,
  runId?: string | null,
) {
  const gradingContext = createScopedLessonPlanContext(job.teacherId);
  const session = await getGradingSession(gradingContext, job.sessionId);
  if (!session) {
    throw createNotFoundError("未找到判卷任务");
  }

  const payload = job.payload as GradingJobPayload;
  const submissionIds = Array.isArray(payload.submissionIds)
    ? payload.submissionIds.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];

  if (submissionIds.length === 0) {
    throw createValidationError("批量自动判卷任务缺少 submissionIds");
  }

  const results: Array<Record<string, unknown>> = [];
  for (const submissionId of submissionIds) {
    try {
      const graded = await processAutoGradeSubmissionJob({
        ...job,
        submissionId,
        kind: "auto_grade_submission",
      }, workflow, runId);
      results.push({
        submissionId,
        ok: true,
        status: graded.qualityGate.status,
        submission: graded.submission,
        provider: graded.provider,
        qualityGate: graded.qualityGate,
      });
    } catch (error) {
      const appError = toAppError(error, {
        message: error instanceof Error ? error.message : "批量自动判卷单份失败",
        source: "auto_grade_batch",
      });
      await recordGradingJobStep({
        runId,
        workflow,
        step: "auto_grade_batch.item_failed",
        status: "failed",
        error: appError,
        metadata: {
          jobId: job.id,
          submissionId,
        },
      });
      results.push({
        submissionId,
        ok: false,
        status: "failed",
        errorCode: appError.code,
        errorMessage: appError.message,
      });
    }
  }

  const latestSession = await getGradingSession(gradingContext, job.sessionId);
  const succeeded = results.filter((item) => item.ok === true).length;
  const failed = results.filter((item) => item.ok === false).length;
  return {
    status: failed > 0 ? "partial_result" : "completed",
    total: results.length,
    succeeded,
    failed,
    results,
    session: latestSession,
  };
}

export async function processGradingJob(params: { jobId: string }) {
  const claimed = await claimGradingJob(params.jobId);
  if (!claimed) {
    const existing = await getGradingJobAdmin(params.jobId);
    if (!existing) {
      throw createNotFoundError("未找到判卷任务");
    }
    return existing;
  }

  const workflow = resolveGradingWorkflowName(claimed.kind);
  const workflowProfile = getWorkflowProfile(workflow);
  const workflowStartedAt = Date.now();
  const runId = await createWorkflowRun({
    id: randomUUID(),
    workflow,
    teacherId: claimed.teacherId,
    metadata: {
      jobId: claimed.id,
      kind: claimed.kind,
      attempt: claimed.attempts,
      profile: serializeWorkflowProfile(workflowProfile),
    },
    status: "running",
  });

  try {
    let result: Record<string, unknown>;
    if (claimed.kind === "infer_answer_key") {
      result = await processInferAnswerKeyJob(claimed, workflow, runId);
    } else if (claimed.kind === "auto_grade_submission") {
      result = await processAutoGradeSubmissionJob(claimed, workflow, runId);
    } else {
      result = await processAutoGradeBatchJob(claimed, workflow, runId);
    }
    const totalMs = Date.now() - workflowStartedAt;
    const budget = evaluateWorkflowBudget(workflowProfile, {
      totalMs,
    });

    await recordWorkflowStep({
      runId,
      workflow,
      step: claimed.kind,
      status: "completed",
      durationMs: totalMs,
      metadata: {
        jobId: claimed.id,
        budget,
      },
    });
    await finalizeWorkflowRun({
      runId,
      status: "completed",
      metadata: {
        jobId: claimed.id,
        kind: claimed.kind,
        budget,
      },
    });
    return await markGradingJobCompleted(claimed.id, result);
  } catch (error) {
    const appError = toAppError(error, {
      message: error instanceof Error ? error.message : "判卷任务失败",
      retryable: false,
    });
    const totalMs = Date.now() - workflowStartedAt;
    const budget = evaluateWorkflowBudget(workflowProfile, {
      totalMs,
    });
    await recordWorkflowStep({
      runId,
      workflow,
      step: claimed.kind,
      status: "failed",
      durationMs: totalMs,
      errorCode: appError.code,
      errorMessage: appError.message,
      metadata: {
        jobId: claimed.id,
        budget,
      },
    });
    await finalizeWorkflowRun({
      runId,
      status: "failed",
      metadata: {
        jobId: claimed.id,
        kind: claimed.kind,
        errorCode: appError.code,
        budget,
      },
    });
    return await markGradingJobFailed(claimed, appError);
  }
}

export async function listDueGradingJobs(limit = 20) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await gradingJobsTable(admin)
    .select(GRADING_JOB_SELECT)
    .eq("status", "queued")
    .lte("available_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw createPersistenceError("读取待处理判卷任务失败", { cause: error });
  }

  return asRows(data).map((row) => mapGradingJob(row));
}

async function getGradingJobAdmin(jobId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await gradingJobsTable(admin)
    .select(GRADING_JOB_SELECT)
    .eq("id", jobId)
    .maybeSingle();
  if (error) {
    throw createPersistenceError("读取判卷任务失败", { cause: error });
  }
  return data ? mapGradingJob(asRow(data)) : null;
}
