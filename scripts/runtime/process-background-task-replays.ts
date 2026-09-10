import {
  listDueBackgroundTaskReplays,
  processBackgroundTaskReplay,
} from "@/lib/runtime/background-task";

function readNumericArg(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((item) => item.startsWith(prefix));
  if (!raw) return fallback;
  const value = Number.parseInt(raw.slice(prefix.length), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function main() {
  const limit = readNumericArg("limit", 20);
  const dueFailures = await listDueBackgroundTaskReplays(limit);

  if (dueFailures.length === 0) {
    console.log("[background-task-replay] 当前没有待重放任务");
    return;
  }

  console.log(`[background-task-replay] 发现 ${dueFailures.length} 个待重放任务`);

  const results = [];
  for (const failure of dueFailures) {
    const startedAt = Date.now();
    try {
      const processed = await processBackgroundTaskReplay({ failureId: failure.id });
      const durationMs = Date.now() - startedAt;
      console.log(
        `[background-task-replay] ${failure.taskType} ${failure.taskKey} -> ${processed?.replayStatus ?? "skipped"} (${durationMs}ms)`,
      );
      results.push({
        failureId: failure.id,
        taskType: failure.taskType,
        replayStatus: processed?.replayStatus ?? "skipped",
        durationMs,
      });
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      console.error(
        `[background-task-replay] ${failure.taskType} ${failure.taskKey} 处理失败 (${durationMs}ms)`,
        error,
      );
      results.push({
        failureId: failure.id,
        taskType: failure.taskType,
        replayStatus: "failed",
        durationMs,
      });
    }
  }

  const resolved = results.filter((item) => item.replayStatus === "resolved").length;
  const deadLetter = results.filter((item) => item.replayStatus === "dead_letter").length;
  const pending = results.filter((item) => item.replayStatus === "pending").length;
  const unsupported = results.filter((item) => item.replayStatus === "unsupported").length;
  console.log(
    `[background-task-replay] resolved ${resolved} 个，pending ${pending} 个，dead_letter ${deadLetter} 个，unsupported ${unsupported} 个，总计 ${results.length} 个`,
  );
}

void main().catch((error) => {
  console.error("[background-task-replay] worker 执行失败", error);
  process.exitCode = 1;
});
