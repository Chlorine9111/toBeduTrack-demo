import { listDueGradingJobs, processGradingJob } from "@/lib/grading/jobs";

function readNumericArg(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((item) => item.startsWith(prefix));
  if (!raw) return fallback;
  const value = Number.parseInt(raw.slice(prefix.length), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function main() {
  const limit = readNumericArg("limit", 10);
  const dueJobs = await listDueGradingJobs(limit);

  if (dueJobs.length === 0) {
    console.log("[grading-jobs] 当前没有待处理任务");
    return;
  }

  console.log(`[grading-jobs] 发现 ${dueJobs.length} 个待处理任务`);

  const results = [];
  for (const job of dueJobs) {
    const startedAt = Date.now();
    try {
      const processed = await processGradingJob({ jobId: job.id });
      const durationMs = Date.now() - startedAt;
      console.log(
        `[grading-jobs] ${job.kind} ${job.id} -> ${processed.status} (${durationMs}ms)`,
      );
      results.push({
        jobId: job.id,
        kind: job.kind,
        status: processed.status,
        durationMs,
      });
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      console.error(
        `[grading-jobs] ${job.kind} ${job.id} 处理失败 (${durationMs}ms)`,
        error,
      );
      results.push({
        jobId: job.id,
        kind: job.kind,
        status: "failed",
        durationMs,
      });
    }
  }

  const completed = results.filter((item) => item.status === "completed").length;
  const failed = results.filter((item) => item.status === "failed").length;
  console.log(
    `[grading-jobs] 完成 ${completed} 个，失败 ${failed} 个，总计 ${results.length} 个`,
  );
}

void main().catch((error) => {
  console.error("[grading-jobs] worker 执行失败", error);
  process.exitCode = 1;
});
