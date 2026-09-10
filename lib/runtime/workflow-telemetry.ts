import { randomUUID } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { internalTable } from "@/lib/runtime/internal-table";

type WorkflowStatus = "running" | "completed" | "failed";

export type WorkflowRunRecord = {
  id: string;
  workflow: string;
  requestId?: string | null;
  teacherId?: string | null;
  conversationId?: string | null;
  status?: WorkflowStatus;
  metadata?: Record<string, unknown> | null;
};

export async function createWorkflowRun(record: WorkflowRunRecord) {
  try {
    const admin = createAdminSupabaseClient();
    const id = record.id || randomUUID();
    await internalTable(admin, "workflow_runs").insert({
      id,
      workflow: record.workflow,
      request_id: record.requestId ?? null,
      teacher_id: record.teacherId ?? null,
      conversation_id: record.conversationId ?? null,
      status: record.status ?? "running",
      metadata: record.metadata ?? {},
    });
    return id;
  } catch (error) {
    console.warn("[workflow-telemetry] create run failed", error);
    return record.id;
  }
}

export async function finalizeWorkflowRun(params: {
  runId?: string | null;
  status: WorkflowStatus;
  metadata?: Record<string, unknown> | null;
}) {
  if (!params.runId) return;
  try {
    const admin = createAdminSupabaseClient();
    await internalTable(admin, "workflow_runs")
      .update({
        status: params.status,
        completed_at: new Date().toISOString(),
        metadata: params.metadata ?? {},
      })
      .eq("id", params.runId);
  } catch (error) {
    console.warn("[workflow-telemetry] finalize run failed", error);
  }
}

export async function recordWorkflowStep(params: {
  runId?: string | null;
  workflow: string;
  step: string;
  status: WorkflowStatus;
  provider?: string | null;
  model?: string | null;
  durationMs?: number | null;
  ttftMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheHit?: boolean;
  fallbackTriggered?: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  try {
    const admin = createAdminSupabaseClient();
    await internalTable(admin, "workflow_run_steps").insert({
      id: randomUUID(),
      run_id: params.runId ?? null,
      workflow: params.workflow,
      step: params.step,
      status: params.status,
      provider: params.provider ?? null,
      model: params.model ?? null,
      duration_ms: params.durationMs ?? null,
      ttft_ms: params.ttftMs ?? null,
      input_tokens: params.inputTokens ?? null,
      output_tokens: params.outputTokens ?? null,
      cache_hit: params.cacheHit ?? false,
      fallback_triggered: params.fallbackTriggered ?? false,
      error_code: params.errorCode ?? null,
      error_message: params.errorMessage ?? null,
      metadata: params.metadata ?? {},
    });
  } catch (error) {
    console.warn("[workflow-telemetry] record step failed", error);
  }
}
