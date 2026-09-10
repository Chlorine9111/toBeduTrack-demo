import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type BackgroundJob = {
  id: string;
  teacherId: string | null;
  jobType: string;
  jobKey: string;
  status: "pending" | "running" | "completed" | "failed" | "dead_letter";
  priority: number;
  attempts: number;
  maxAttempts: number;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  availableAt: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const BACKGROUND_JOB_SELECT = [
  "id",
  "teacher_id",
  "job_type",
  "job_key",
  "status",
  "priority",
  "attempts",
  "max_attempts",
  "payload",
  "result",
  "error_message",
  "available_at",
  "started_at",
  "completed_at",
  "created_at",
  "updated_at",
].join(",");

const RETRY_BASE_DELAY_MS = 5_000;
const RETRY_MAX_DELAY_MS = 300_000;
const RESTARTABLE_STATUSES = ["completed", "failed", "dead_letter"];

function nowIso() {
  return new Date().toISOString();
}

function computeRetryDelayMs(attempt: number) {
  return Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** attempt);
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

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function mapRow(row: Record<string, unknown>): BackgroundJob {
  return {
    id: asString(row.id),
    teacherId: asNullableString(row.teacher_id),
    jobType: asString(row.job_type),
    jobKey: asString(row.job_key),
    status: asString(row.status, "pending") as BackgroundJob["status"],
    priority: asNumber(row.priority),
    attempts: asNumber(row.attempts),
    maxAttempts: Math.max(1, asNumber(row.max_attempts, 3)),
    payload: asObject(row.payload),
    result: row.result ? asObject(row.result) : null,
    errorMessage: asNullableString(row.error_message),
    availableAt: asString(row.available_at, nowIso()),
    startedAt: asNullableString(row.started_at),
    completedAt: asNullableString(row.completed_at),
    createdAt: asString(row.created_at, nowIso()),
    updatedAt: asString(row.updated_at, nowIso()),
  };
}

/**
 * Enqueue a background job. If a job with the same job_key already exists
 * and is in a terminal status (completed/failed/dead_letter), it resets to pending.
 * If pending or running, it is left unchanged (idempotent).
 */
export async function enqueueJob(params: {
  teacherId?: string;
  jobType: string;
  jobKey: string;
  payload: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
  delayMs?: number;
}): Promise<{ id: string; status: string }> {
  const admin = createAdminSupabaseClient();
  const availableAt =
    params.delayMs && params.delayMs > 0
      ? new Date(Date.now() + params.delayMs).toISOString()
      : nowIso();

  // Try insert first
  const { data: insertData, error: insertError } = await admin
    .from("background_jobs")
    .insert({
      teacher_id: params.teacherId ?? null,
      job_type: params.jobType,
      job_key: params.jobKey,
      payload: params.payload,
      priority: params.priority ?? 0,
      max_attempts: Math.max(1, params.maxAttempts ?? 3),
      available_at: availableAt,
      status: "pending",
    })
    .select("id, status")
    .single();

  if (!insertError && insertData) {
    const row = asObject(insertData);
    return { id: asString(row.id), status: asString(row.status) };
  }

  // Conflict on job_key — update only if in a terminal status
  const { data: existing, error: readError } = await admin
    .from("background_jobs")
    .select("id, status")
    .eq("job_key", params.jobKey)
    .single();

  if (readError) {
    throw new Error(readError.message || "enqueueJob 查询现有任务失败");
  }

  const existingRow = asObject(existing);
  const existingStatus = asString(existingRow.status);

  if (!RESTARTABLE_STATUSES.includes(existingStatus)) {
    // Job is pending or running — return as-is (idempotent)
    return {
      id: asString(existingRow.id),
      status: existingStatus,
    };
  }

  // Reset to pending
  const { data: updated, error: updateError } = await admin
    .from("background_jobs")
    .update({
      status: "pending",
      payload: params.payload,
      priority: params.priority ?? 0,
      max_attempts: Math.max(1, params.maxAttempts ?? 3),
      available_at: availableAt,
      attempts: 0,
      result: null,
      error_message: null,
      started_at: null,
      completed_at: null,
    })
    .eq("job_key", params.jobKey)
    .in("status", RESTARTABLE_STATUSES)
    .select("id, status")
    .single();

  if (updateError) {
    throw new Error(updateError.message || "enqueueJob 更新失败");
  }

  const updatedRow = asObject(updated);
  return {
    id: asString(updatedRow.id),
    status: asString(updatedRow.status),
  };
}

/**
 * Atomically claim the next available job using CAS (compare-and-swap).
 * Selects the highest-priority pending job whose available_at <= now,
 * then attempts an optimistic update with status/attempts guard.
 */
export async function claimNextJob(params: {
  jobTypes: string[];
  limit?: number;
}): Promise<BackgroundJob | null> {
  if (params.jobTypes.length === 0) return null;

  const admin = createAdminSupabaseClient();
  const now = nowIso();

  // Find the best candidate
  const { data: candidates, error: selectError } = await admin
    .from("background_jobs")
    .select(BACKGROUND_JOB_SELECT)
    .eq("status", "pending")
    .lte("available_at", now)
    .in("job_type", params.jobTypes)
    .order("priority", { ascending: false })
    .order("available_at", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(params.limit ?? 5);

  if (selectError) {
    throw new Error(selectError.message || "claimNextJob 查询失败");
  }

  const rows = Array.isArray(candidates) ? candidates : [];

  // Try to claim each candidate with CAS guard
  for (const candidate of rows) {
    const row = asObject(candidate);
    const jobId = asString(row.id);
    const currentAttempts = asNumber(row.attempts);

    const { data: claimed, error: claimError } = await admin
      .from("background_jobs")
      .update({
        status: "running",
        started_at: nowIso(),
        attempts: currentAttempts + 1,
      })
      .eq("id", jobId)
      .eq("status", "pending")
      .eq("attempts", currentAttempts)
      .select(BACKGROUND_JOB_SELECT)
      .maybeSingle();

    if (claimError) {
      // Another worker may have claimed it — try next candidate
      continue;
    }

    if (claimed) {
      return mapRow(asObject(claimed));
    }
    // CAS failed (status or attempts changed) — try next candidate
  }

  return null;
}

export async function claimJobByKey(jobKey: string): Promise<BackgroundJob | null> {
  const admin = createAdminSupabaseClient();
  const now = nowIso();

  const { data: currentData, error: currentError } = await admin
    .from("background_jobs")
    .select(BACKGROUND_JOB_SELECT)
    .eq("job_key", jobKey)
    .eq("status", "pending")
    .lte("available_at", now)
    .maybeSingle();

  if (currentError) {
    throw new Error(currentError.message || "claimJobByKey 查询失败");
  }

  if (!currentData) {
    return null;
  }

  const current = asObject(currentData);
  const jobId = asString(current.id);
  const currentAttempts = asNumber(current.attempts);

  const { data: claimed, error: claimError } = await admin
    .from("background_jobs")
    .update({
      status: "running",
      started_at: nowIso(),
      attempts: currentAttempts + 1,
    })
    .eq("id", jobId)
    .eq("status", "pending")
    .eq("attempts", currentAttempts)
    .select(BACKGROUND_JOB_SELECT)
    .maybeSingle();

  if (claimError || !claimed) {
    return null;
  }

  return mapRow(asObject(claimed));
}

/**
 * Mark a job as completed with an optional result payload.
 */
export async function completeJob(
  jobId: string,
  result?: Record<string, unknown>,
): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("background_jobs")
    .update({
      status: "completed",
      completed_at: nowIso(),
      result: result ?? null,
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(error.message || "completeJob 更新失败");
  }
}

/**
 * Mark a job as failed. If attempts >= maxAttempts, moves to dead_letter.
 * Otherwise resets to pending with exponential backoff.
 */
export async function failJob(
  jobId: string,
  errorMessage: string,
): Promise<void> {
  const admin = createAdminSupabaseClient();

  const { data: currentData, error: readError } = await admin
    .from("background_jobs")
    .select("attempts, max_attempts")
    .eq("id", jobId)
    .single();

  if (readError) {
    throw new Error(readError.message || "failJob 读取任务失败");
  }

  const current = asObject(currentData);
  const attempts = asNumber(current.attempts);
  const maxAttempts = Math.max(1, asNumber(current.max_attempts, 3));
  const exhausted = attempts >= maxAttempts;

  const updatePayload = exhausted
    ? {
        status: "dead_letter" as const,
        error_message: errorMessage,
      }
    : {
        status: "pending" as const,
        error_message: errorMessage,
        available_at: new Date(
          Date.now() + computeRetryDelayMs(attempts),
        ).toISOString(),
      };

  const { error } = await admin
    .from("background_jobs")
    .update(updatePayload)
    .eq("id", jobId);

  if (error) {
    throw new Error(error.message || "failJob 更新失败");
  }
}

/**
 * List jobs belonging to a specific teacher, with optional filters.
 */
export async function listTeacherJobs(
  teacherId: string,
  options?: { status?: string; jobType?: string; limit?: number },
): Promise<BackgroundJob[]> {
  const admin = createAdminSupabaseClient();
  let query = admin
    .from("background_jobs")
    .select(BACKGROUND_JOB_SELECT)
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 50);

  if (options?.status) {
    query = query.eq("status", options.status);
  }

  if (options?.jobType) {
    query = query.eq("job_type", options.jobType);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message || "listTeacherJobs 查询失败");
  }

  return (Array.isArray(data) ? data : []).map((row) =>
    mapRow(asObject(row)),
  );
}
