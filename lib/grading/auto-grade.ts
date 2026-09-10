import type { ApiErrorCode } from "@/lib/api/response";
import type { LessonPlanContext } from "@/lib/lesson-plan/context";
import { recognizeSubmissionByStoragePath } from "@/lib/grading/ocr";
import { gradeSubmissionByAI } from "@/lib/grading/grader";
import {
  evaluateAnswerKeyQuality,
  evaluateSubmissionQuality,
} from "@/lib/grading/quality-gates";
import { buildSessionStats } from "@/lib/grading/report-builder";
import { createTimeoutError, toAppError } from "@/lib/runtime/app-error";
import { runWithDeadline } from "@/lib/runtime/deadline";
import {
  getGradingSession,
  getSubmission,
  listSessionSubmissions,
  listSubmissionAnswers,
  replaceSubmissionAnswers,
  setSessionStats,
  updateSubmission,
} from "@/lib/grading/store";

export class AutoGradeError extends Error {
  code: ApiErrorCode;
  status: number;

  constructor(code: ApiErrorCode, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type AutoGradeStep =
  | "load_session"
  | "load_submission"
  | "ocr_submission"
  | "persist_ocr_result"
  | "mark_grading"
  | "grade_submission"
  | "persist_answers"
  | "persist_submission_total"
  | "rebuild_session_stats";

type AutoGradeStepEvent = {
  step: AutoGradeStep;
  status: "running" | "completed" | "failed";
  durationMs?: number;
  metadata?: Record<string, unknown>;
  error?: unknown;
};

type AutoGradeStepHook = (event: AutoGradeStepEvent) => Promise<void> | void;

const DEFAULT_AUTO_GRADE_BUDGETS = {
  // Keep the full auto-grade request within the 30s UX budget while
  // leaving enough headroom for real OCR on image submissions.
  ocrMs: 22_000,
  gradingMs: 12_000,
};

async function emitAutoGradeStep(
  hook: AutoGradeStepHook | undefined,
  event: AutoGradeStepEvent,
) {
  if (!hook) return;
  await hook(event);
}

async function runAutoGradeStep<T>(params: {
  step: AutoGradeStep;
  onStep?: AutoGradeStepHook;
  timeoutMs?: number;
  parentSignal?: AbortSignal;
  metadata?: Record<string, unknown>;
  action: (signal: AbortSignal | undefined) => Promise<T>;
}) {
  await emitAutoGradeStep(params.onStep, {
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
            parentSignal: params.parentSignal,
            reason: `${params.step}>timeout`,
            onTimeout: () =>
              createTimeoutError(
                `自动判卷步骤 ${params.step} 超时（>${params.timeoutMs}ms）`,
                params.step,
              ),
            action: (signal) => params.action(signal),
          })
        : await params.action(params.parentSignal);

    await emitAutoGradeStep(params.onStep, {
      step: params.step,
      status: "completed",
      durationMs: Date.now() - startedAt,
      metadata: params.metadata,
    });
    return result;
  } catch (error) {
    await emitAutoGradeStep(params.onStep, {
      step: params.step,
      status: "failed",
      durationMs: Date.now() - startedAt,
      metadata: params.metadata,
      error: toAppError(error, {
        message: error instanceof Error ? error.message : `自动判卷步骤 ${params.step} 失败`,
        source: params.step,
      }),
    });
    throw error;
  }
}

export async function autoGradeSubmissionById(params: {
  gradingContext: LessonPlanContext;
  sessionId: string;
  submissionId: string;
  abortSignal?: AbortSignal;
  onStep?: AutoGradeStepHook;
  budgets?: Partial<typeof DEFAULT_AUTO_GRADE_BUDGETS>;
}) {
  const { gradingContext, sessionId, submissionId } = params;
  const budgets = {
    ...DEFAULT_AUTO_GRADE_BUDGETS,
    ...params.budgets,
  };

  const session = await runAutoGradeStep({
    step: "load_session",
    onStep: params.onStep,
    action: async () => getGradingSession(gradingContext, sessionId),
  });
  if (!session) {
    throw new AutoGradeError("NOT_FOUND", "未找到判卷任务", 404);
  }
  if (!session.answerKey.length) {
    throw new AutoGradeError("VALIDATION_ERROR", "请先配置答案键", 400);
  }
  const answerKeyQuality = evaluateAnswerKeyQuality({
    answerKey: session.answerKey,
  });
  if (answerKeyQuality.blocked) {
    throw new AutoGradeError(
      "CONFLICT",
      `答案键仍需补齐或复核：${answerKeyQuality.reasons[0] ?? "请先复核答案键后再自动判卷。"}`,
      409,
    );
  }

  const submission = await runAutoGradeStep({
    step: "load_submission",
    onStep: params.onStep,
    action: async () => getSubmission(gradingContext, sessionId, submissionId),
  });
  if (!submission) {
    throw new AutoGradeError("NOT_FOUND", "未找到学生答卷", 404);
  }

  let ocrProvider = "existing";
  let ocrResult = submission.ocrResult;
  let pageCount = submission.pageCount;

  if (!ocrResult) {
    if (!submission.storagePath && !gradingContext.isMock) {
      throw new AutoGradeError("VALIDATION_ERROR", "答卷未上传原始文件，无法 OCR", 400);
    }

    if (gradingContext.isMock) {
      ocrResult = {
        pages: [
          {
            pageNumber: 1,
            questions: session.answerKey.map((item) => ({
              questionNumber: item.questionNumber,
              studentAnswer: "",
              confidence: 0.6,
            })),
          },
        ],
      };
      pageCount = 1;
      ocrProvider = "mock";
    } else {
      const recognized = await runAutoGradeStep({
        step: "ocr_submission",
        onStep: params.onStep,
        timeoutMs: budgets.ocrMs,
        parentSignal: params.abortSignal,
        metadata: { submissionId },
        action: async (signal) =>
          recognizeSubmissionByStoragePath(submission.storagePath!, {
            answerKey: session.answerKey,
            sessionTitle: session.title,
            abortSignal: signal,
          }),
      });
      ocrResult = recognized.ocrResult;
      pageCount = recognized.pageCount;
      ocrProvider = recognized.provider;
    }

    await runAutoGradeStep({
      step: "persist_ocr_result",
      onStep: params.onStep,
      metadata: { submissionId, pageCount },
      action: async () => {
        await updateSubmission(gradingContext, sessionId, submissionId, {
          status: "ocr_done",
          ocrResult,
          pageCount,
        });
      },
    });
  }

  await runAutoGradeStep({
    step: "mark_grading",
    onStep: params.onStep,
    metadata: { submissionId },
    action: async () => {
      await updateSubmission(gradingContext, sessionId, submissionId, {
        status: "grading",
      });
    },
  });

  const graded = await runAutoGradeStep({
    step: "grade_submission",
    onStep: params.onStep,
    timeoutMs: budgets.gradingMs,
    parentSignal: params.abortSignal,
    metadata: { submissionId, answerKeyCount: session.answerKey.length },
    action: async (signal) =>
      gradeSubmissionByAI(session.answerKey, ocrResult, {
        abortSignal: signal,
      }),
  });
  const qualityGate = evaluateSubmissionQuality({
    answerKey: session.answerKey,
    extractedAnswers: graded.extractedAnswers,
    gradedAnswers: graded.answers.map((item) => ({
      questionNumber: item.questionNumber,
      needsReview: item.needsReview,
    })),
  });

  const savedAnswers = await runAutoGradeStep({
    step: "persist_answers",
    onStep: params.onStep,
    metadata: {
      submissionId,
      answerCount: graded.answers.length,
      qualityStatus: qualityGate.status,
      missingOcrCount: qualityGate.missingOcrQuestionNumbers.length,
      reviewCount: qualityGate.reviewRecommendedQuestionNumbers.length,
    },
    action: async () =>
      replaceSubmissionAnswers(
        gradingContext,
        submissionId,
        graded.answers.map((item) => ({
          submissionId,
          ...item,
        })),
      ),
  });

  const updatedSubmission = await runAutoGradeStep({
    step: "persist_submission_total",
    onStep: params.onStep,
    metadata: { submissionId, totalScore: graded.totalScore, maxScore: graded.maxScore },
    action: async () =>
      updateSubmission(
        gradingContext,
        sessionId,
        submissionId,
        {
          status: "completed",
          totalScore: graded.totalScore,
          maxScore: graded.maxScore,
          gradedAt: new Date().toISOString(),
        },
      ),
  });

  if (!updatedSubmission) {
    throw new AutoGradeError("NOT_FOUND", "未找到学生答卷", 404);
  }

  const { stats, sessionAfterStats } = await runAutoGradeStep({
    step: "rebuild_session_stats",
    onStep: params.onStep,
    metadata: { submissionId, sessionId },
    action: async () => {
      const submissions = await listSessionSubmissions(gradingContext, sessionId);
      const answersBySubmission = new Map<string, Awaited<ReturnType<typeof listSubmissionAnswers>>>();

      await Promise.all(
        submissions.map(async (item) => {
          const answers = await listSubmissionAnswers(gradingContext, item.id);
          answersBySubmission.set(item.id, answers);
        }),
      );

      const stats = buildSessionStats({
        submissions,
        answersBySubmission,
        answerKey: session.answerKey,
      });

      const sessionAfterStats = await setSessionStats(
        gradingContext,
        sessionId,
        stats,
        submissions.filter((item) => item.status === "completed").length,
      );

      return {
        stats,
        sessionAfterStats,
      };
    },
  });

  return {
    submission: updatedSubmission,
    answers: savedAnswers,
    session: sessionAfterStats,
    stats,
    provider: ocrProvider,
    qualityGate,
  };
}
