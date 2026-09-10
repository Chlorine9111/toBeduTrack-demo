import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { internalTable } from "@/lib/runtime/internal-table";

function loadSimpleEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const hit = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!hit) continue;
    const key = hit[1];
    if (process.env[key] !== undefined) continue;
    let value = hit[2].trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadLocalEnvFiles() {
  const cwd = process.cwd();
  loadSimpleEnvFile(path.join(cwd, ".env.local"));
  loadSimpleEnvFile(path.join(cwd, ".env"));
}

loadLocalEnvFiles();

type StepRow = {
  created_at: string | null;
  step: string;
  status: "running" | "completed" | "failed";
  ttft_ms: number | null;
  duration_ms: number | null;
  metadata: Record<string, unknown> | null;
  run_id: string | null;
};

function getArgValue(name: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  if (!hit) return null;
  return hit.slice(prefix.length).trim() || null;
}

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * (sorted.length - 1))),
  );
  return sorted[index];
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toNumberList(values: Array<number | null | undefined>) {
  return values
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .map((value) => Math.max(0, value));
}

function inRange(iso: string | null, from: Date, to: Date) {
  if (!iso) return false;
  const ts = new Date(iso).getTime();
  return Number.isFinite(ts) && ts >= from.getTime() && ts < to.getTime();
}

function toReasonCodes(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return [];
  const value = metadata.reasonCodes;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function toWorkflowId(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return "unknown";
  const value = metadata.workflowId;
  return typeof value === "string" && value.trim().length > 0 ? value : "unknown";
}

function summarizeWindow(rows: StepRow[], from: Date, to: Date) {
  const inWindow = rows.filter((row) => inRange(row.created_at, from, to));
  const triagePrompt = inWindow.filter((row) => row.step === "triage_prompt");
  const triageRuntime = inWindow.filter((row) => row.step === "triage_runtime");
  const triageRuntimeOverride = inWindow.filter(
    (row) => row.step === "triage_runtime_override",
  );
  const streamFirstVisible = inWindow.filter((row) => row.step === "stream_first_visible");
  const streamComplete = inWindow.filter((row) => row.step === "stream_complete");

  const classifierAppliedCount = triagePrompt.filter((row) =>
    toReasonCodes(row.metadata).some((code) => code.startsWith("classifier:applied:")),
  ).length;
  const preflightReadyCount = triagePrompt.filter((row) =>
    toReasonCodes(row.metadata).includes("preflight:ready"),
  ).length;

  const workflowDistribution: Record<string, number> = {};
  for (const row of triagePrompt) {
    const key = toWorkflowId(row.metadata);
    workflowDistribution[key] = (workflowDistribution[key] ?? 0) + 1;
  }

  const ttftValues = toNumberList(streamFirstVisible.map((row) => row.ttft_ms));
  const totalDurationValues = toNumberList(streamComplete.map((row) => row.duration_ms));
  const completeSuccessCount = streamComplete.filter(
    (row) => row.status === "completed",
  ).length;
  const completeFailCount = streamComplete.filter((row) => row.status === "failed").length;

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    counts: {
      triagePrompt: triagePrompt.length,
      triageRuntime: triageRuntime.length,
      triageRuntimeOverride: triageRuntimeOverride.length,
      streamFirstVisible: streamFirstVisible.length,
      streamComplete: streamComplete.length,
    },
    rates: {
      classifierAppliedRate:
        triagePrompt.length > 0 ? classifierAppliedCount / triagePrompt.length : null,
      preflightReadyRate:
        triagePrompt.length > 0 ? preflightReadyCount / triagePrompt.length : null,
      runtimeOverrideRate:
        triageRuntime.length + triageRuntimeOverride.length > 0
          ? triageRuntimeOverride.length /
            (triageRuntime.length + triageRuntimeOverride.length)
          : null,
      completionRate:
        completeSuccessCount + completeFailCount > 0
          ? completeSuccessCount / (completeSuccessCount + completeFailCount)
          : null,
    },
    latencyMs: {
      ttft: {
        avg: average(ttftValues),
        p50: percentile(ttftValues, 50),
        p95: percentile(ttftValues, 95),
      },
      total: {
        avg: average(totalDurationValues),
        p50: percentile(totalDurationValues, 50),
        p95: percentile(totalDurationValues, 95),
      },
    },
    workflowDistribution,
  };
}

function formatPercent(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${Math.round(value)}`;
}

function printWindow(label: string, summary: ReturnType<typeof summarizeWindow>) {
  console.log(`\n[${label}] ${summary.from} ~ ${summary.to}`);
  console.log(`- triagePrompt: ${summary.counts.triagePrompt}`);
  console.log(`- classifierAppliedRate: ${formatPercent(summary.rates.classifierAppliedRate)}`);
  console.log(`- preflightReadyRate: ${formatPercent(summary.rates.preflightReadyRate)}`);
  console.log(`- runtimeOverrideRate: ${formatPercent(summary.rates.runtimeOverrideRate)}`);
  console.log(`- completionRate: ${formatPercent(summary.rates.completionRate)}`);
  console.log(
    `- ttft(ms): avg=${formatNumber(summary.latencyMs.ttft.avg)} p50=${formatNumber(summary.latencyMs.ttft.p50)} p95=${formatNumber(summary.latencyMs.ttft.p95)}`,
  );
  console.log(
    `- total(ms): avg=${formatNumber(summary.latencyMs.total.avg)} p50=${formatNumber(summary.latencyMs.total.p50)} p95=${formatNumber(summary.latencyMs.total.p95)}`,
  );
  const topWorkflows = Object.entries(summary.workflowDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([workflow, count]) => `${workflow}:${count}`)
    .join(", ");
  console.log(`- top workflows: ${topWorkflows || "n/a"}`);
}

async function loadRows(from: Date) {
  const db = createAdminSupabaseClient();
  const { data, error } = await internalTable(db, "workflow_run_steps")
    .select("created_at, step, status, ttft_ms, duration_ms, metadata, run_id")
    .eq("workflow", "agent_chat")
    .in("step", [
      "triage_prompt",
      "triage_runtime",
      "triage_runtime_override",
      "stream_first_visible",
      "stream_complete",
    ])
    .gte("created_at", from.toISOString())
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message || "读取 workflow_run_steps 失败");
  }

  return (data ?? []) as StepRow[];
}

async function main() {
  const days = parsePositiveInt(getArgValue("days"), 7);
  const baselineDays = parsePositiveInt(getArgValue("baseline-days"), days);

  const now = new Date();
  const recentFrom = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const baselineFrom = new Date(
    recentFrom.getTime() - baselineDays * 24 * 60 * 60 * 1000,
  );

  console.log(
    `[triage-metrics] loading workflow_run_steps since ${baselineFrom.toISOString()}...`,
  );
  const rows = await loadRows(baselineFrom);

  const recentSummary = summarizeWindow(rows, recentFrom, now);
  const baselineSummary = summarizeWindow(rows, baselineFrom, recentFrom);

  printWindow(`Recent ${days}d`, recentSummary);
  printWindow(`Baseline ${baselineDays}d`, baselineSummary);

  console.log("\nJSON:");
  console.log(
    JSON.stringify(
      {
        recent: recentSummary,
        baseline: baselineSummary,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error("[triage-metrics] failed", error);
  process.exit(1);
});
