import { after } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createBackgroundTaskError, toAppError } from "@/lib/runtime/app-error";
import { internalTable } from "@/lib/runtime/internal-table";
import { runWithRetry } from "@/lib/runtime/retry";
import {
  resolveBackgroundTaskReplayDefinition,
  type BackgroundTaskReplayContext,
} from "@/lib/runtime/background-task-replay";

type ReliableAfterTaskParams = {
  taskType: string;
  taskKey: string;
  teacherId?: string | null;
  conversationId?: string | null;
  requestId?: string | null;
  payload?: Record<string, unknown> | null;
  retries?: number;
  maxReplayAttempts?: number;
  run: () => Promise<void>;
};

type BackgroundTaskReplayStatus =
  | "pending"
  | "running"
  | "resolved"
  | "dead_letter"
  | "unsupported";

type BackgroundTaskFailureRecord = {
  id: string;
  taskType: string;
  taskKey: string;
  teacherId: string | null;
  conversationId: string | null;
  requestId: string | null;
  errorCode: string;
  errorMessage: string;
  payload: Record<string, unknown>;
  replayStatus: BackgroundTaskReplayStatus;
  replayAttempts: number;
  replayMaxAttempts: number;
  replayAvailableAt: string;
  replayStartedAt: string | null;
  replayResolvedAt: string | null;
  replayLastError: string | null;
  replayHandler: string | null;
  createdAt: string;
};

const BACKGROUND_TASK_FAILURE_SELECT = [
  "id",
  "task_type",
  "task_key",
  "teacher_id",
  "conversation_id",
  "request_id",
  "error_code",
  "error_message",
  "payload",
  "replay_status",
  "replay_attempts",
  "replay_max_attempts",
  "replay_available_at",
  "replay_started_at",
  "replay_resolved_at",
  "replay_last_error",
  "replay_handler",
  "created_at",
].join(",");

const DEFAULT_BACKGROUND_REPLAY_ATTEMPTS = 3;
const BACKGROUND_REPLAY_BASE_DELAY_MS = 30_000;
const BACKGROUND_REPLAY_MAX_DELAY_MS = 15 * 60_000;
const BACKGROUND_REPLAY_JITTER_MS = 5_000;

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function computeReplayDelayMs(attempt: number) {
  const exponential = Math.min(
    BACKGROUND_REPLAY_MAX_DELAY_MS,
    BACKGROUND_REPLAY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1),
  );
  const jitter = Math.floor(Math.random() * BACKGROUND_REPLAY_JITTER_MS);
  return exponential + jitter;
}

function mapBackgroundTaskFailure(row: Record<string, unknown>): BackgroundTaskFailureRecord {
  return {
    id: asString(row.id),
    taskType: asString(row.task_type),
    taskKey: asString(row.task_key),
    teacherId: asNullableString(row.teacher_id),
    conversationId: asNullableString(row.conversation_id),
    requestId: asNullableString(row.request_id),
    errorCode: asString(row.error_code),
    errorMessage: asString(row.error_message),
    payload: asObject(row.payload),
    replayStatus: asString(row.replay_status, "unsupported") as BackgroundTaskReplayStatus,
    replayAttempts: asNumber(row.replay_attempts),
    replayMaxAttempts: Math.max(1, asNumber(row.replay_max_attempts, DEFAULT_BACKGROUND_REPLAY_ATTEMPTS)),
    replayAvailableAt: asString(row.replay_available_at, nowIso()),
    replayStartedAt: asNullableString(row.replay_started_at),
    replayResolvedAt: asNullableString(row.replay_resolved_at),
    replayLastError: asNullableString(row.replay_last_error),
    replayHandler: asNullableString(row.replay_handler),
    createdAt: asString(row.created_at, nowIso()),
  };
}

export async function recordBackgroundTaskFailure(params: {
  taskType: string;
  taskKey: string;
  teacherId?: string | null;
  conversationId?: string | null;
  requestId?: string | null;
  payload?: Record<string, unknown> | null;
  maxReplayAttempts?: number;
  error: unknown;
}) {
  const appError = toAppError(params.error, {
    code: "BACKGROUND_TASK_FAILED",
    message:
      params.error instanceof Error
        ? params.error.message
        : `${params.taskType} 后台任务失败`,
    retryable: true,
  });
  const replayDefinition = resolveBackgroundTaskReplayDefinition(params.taskType);

  try {
    const admin = createAdminSupabaseClient();
    await internalTable(admin, "background_task_failures").insert({
      task_type: params.taskType,
      task_key: params.taskKey,
      teacher_id: params.teacherId ?? null,
      conversation_id: params.conversationId ?? null,
      request_id: params.requestId ?? null,
      error_code: appError.code,
      error_message: appError.message,
      payload: params.payload ?? {},
      replay_status: replayDefinition ? "pending" : "unsupported",
      replay_attempts: 0,
      replay_max_attempts: Math.max(1, params.maxReplayAttempts ?? DEFAULT_BACKGROUND_REPLAY_ATTEMPTS),
      replay_available_at: nowIso(),
      replay_started_at: null,
      replay_resolved_at: null,
      replay_last_error: appError.message,
      replay_handler: replayDefinition?.handlerKey ?? null,
    });
  } catch (error) {
    console.error("[background-task] 记录失败任务失败", {
      taskType: params.taskType,
      taskKey: params.taskKey,
      originalError: appError.message,
      recordError: error,
    });
  }
}

async function runReliableTask(params: ReliableAfterTaskParams) {
  try {
    await runWithRetry(async () => {
      await params.run();
    }, {
      retries: Math.max(0, params.retries ?? 1),
      shouldRetry: (error) => {
        const appError = toAppError(error, {
          code: "BACKGROUND_TASK_FAILED",
          message:
            error instanceof Error
              ? error.message
              : `${params.taskType} 后台任务失败`,
          retryable: true,
        });
        return appError.retryable;
      },
    });
  } catch (error) {
    const backgroundError = createBackgroundTaskError(
      `${params.taskType} 后台任务失败`,
      { cause: error, details: params.payload ?? undefined },
    );
    await recordBackgroundTaskFailure({
      taskType: params.taskType,
      taskKey: params.taskKey,
      teacherId: params.teacherId ?? null,
      conversationId: params.conversationId ?? null,
      requestId: params.requestId ?? null,
      payload: params.payload ?? null,
      maxReplayAttempts: params.maxReplayAttempts,
      error: backgroundError,
    });
    throw backgroundError;
  }
}

export function scheduleReliableAfterTask(params: ReliableAfterTaskParams) {
  after(async () => {
    try {
      await runReliableTask(params);
    } catch (error) {
      console.error("[background-task] after task failed", {
        taskType: params.taskType,
        taskKey: params.taskKey,
        error,
      });
    }
  });
}

export async function runReliableBackgroundTaskNow(params: ReliableAfterTaskParams) {
  await runReliableTask(params);
}

async function claimBackgroundTaskFailure(failureId: string) {
  const admin = createAdminSupabaseClient();
  const { data: currentData, error: currentError } = await internalTable(admin, "background_task_failures")
    .select(BACKGROUND_TASK_FAILURE_SELECT)
    .eq("id", failureId)
    .maybeSingle();

  if (currentError) {
    throw new Error(currentError.message || "读取后台任务失败记录失败");
  }
  if (!currentData) {
    return null;
  }

  const current = mapBackgroundTaskFailure(asObject(currentData));
  if (current.replayStatus !== "pending") {
    return null;
  }
  if (new Date(current.replayAvailableAt).getTime() > Date.now()) {
    return null;
  }

  const startedAt = nowIso();
  const { data: claimedData, error: claimedError } = await internalTable(admin, "background_task_failures")
    .update({
      replay_status: "running",
      replay_attempts: current.replayAttempts + 1,
      replay_started_at: startedAt,
      replay_last_error: null,
    })
    .eq("id", failureId)
    .eq("replay_status", "pending")
    .eq("replay_attempts", current.replayAttempts)
    .select(BACKGROUND_TASK_FAILURE_SELECT)
    .maybeSingle();

  if (claimedError) {
    throw new Error(claimedError.message || "锁定后台任务重放失败");
  }

  return claimedData ? mapBackgroundTaskFailure(asObject(claimedData)) : null;
}

export async function listDueBackgroundTaskReplays(limit = 20) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await internalTable(admin, "background_task_failures")
    .select(BACKGROUND_TASK_FAILURE_SELECT)
    .eq("replay_status", "pending")
    .lte("replay_available_at", nowIso())
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message || "读取待重放后台任务失败");
  }

  return (Array.isArray(data) ? data : []).map((row) =>
    mapBackgroundTaskFailure(asObject(row)),
  );
}

export async function processBackgroundTaskReplay(params: { failureId: string }) {
  const claimed = await claimBackgroundTaskFailure(params.failureId);
  if (!claimed) {
    return null;
  }

  const replayDefinition = resolveBackgroundTaskReplayDefinition(claimed.taskType);
  const admin = createAdminSupabaseClient();

  if (!replayDefinition) {
    const { data, error } = await internalTable(admin, "background_task_failures")
      .update({
        replay_status: "unsupported",
        replay_started_at: null,
        replay_last_error: "当前任务类型尚未接入自动重放 handler",
      })
      .eq("id", claimed.id)
      .select(BACKGROUND_TASK_FAILURE_SELECT)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "更新后台任务重放状态失败");
    }
    return data ? mapBackgroundTaskFailure(asObject(data)) : claimed;
  }

  const replayContext: BackgroundTaskReplayContext = {
    taskType: claimed.taskType,
    taskKey: claimed.taskKey,
    teacherId: claimed.teacherId,
    conversationId: claimed.conversationId,
    requestId: claimed.requestId,
    payload: claimed.payload,
  };

  try {
    await replayDefinition.replay(replayContext);

    const { data, error } = await internalTable(admin, "background_task_failures")
      .update({
        replay_status: "resolved",
        replay_resolved_at: nowIso(),
        replay_started_at: null,
        replay_last_error: null,
      })
      .eq("id", claimed.id)
      .select(BACKGROUND_TASK_FAILURE_SELECT)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "更新后台任务重放成功状态失败");
    }
    return data ? mapBackgroundTaskFailure(asObject(data)) : claimed;
  } catch (error) {
    const appError = toAppError(error, {
      code: "BACKGROUND_TASK_FAILED",
      message:
        error instanceof Error
          ? error.message
          : `${claimed.taskType} 后台任务重放失败`,
      retryable: true,
    });
    const exhausted = claimed.replayAttempts >= claimed.replayMaxAttempts;
    const nextAvailableAt = new Date(
      Date.now() + computeReplayDelayMs(claimed.replayAttempts),
    ).toISOString();
    const { data, error: updateError } = await internalTable(admin, "background_task_failures")
      .update({
        error_code: appError.code,
        error_message: appError.message,
        replay_status: exhausted ? "dead_letter" : "pending",
        replay_started_at: null,
        replay_last_error: appError.message,
        replay_available_at: exhausted ? claimed.replayAvailableAt : nextAvailableAt,
      })
      .eq("id", claimed.id)
      .select(BACKGROUND_TASK_FAILURE_SELECT)
      .maybeSingle();

    if (updateError) {
      throw new Error(updateError.message || "更新后台任务重放失败状态失败");
    }
    return data ? mapBackgroundTaskFailure(asObject(data)) : claimed;
  }
}
