import {
  claimJobByKey,
  claimNextJob,
  completeJob,
  failJob,
  type BackgroundJob,
} from "@/lib/background-jobs/store";

export type JobHandler = (job: BackgroundJob) => Promise<void>;

const handlerRegistry = new Map<string, JobHandler>();

const JOB_TIMEOUT_MS = 60_000;

/**
 * Register a handler for a specific job type.
 * Must be called before processNextBatch for the handler to be invoked.
 */
export function registerJobHandler(
  jobType: string,
  handler: JobHandler,
): void {
  handlerRegistry.set(jobType, handler);
}

/**
 * Get all registered job types (used to filter claim queries).
 */
function getRegisteredJobTypes(): string[] {
  return Array.from(handlerRegistry.keys());
}

/**
 * Run a handler with a timeout guard.
 * Rejects if the handler exceeds JOB_TIMEOUT_MS.
 */
function runWithTimeout(
  handler: JobHandler,
  job: BackgroundJob,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Job ${job.id} (${job.jobType}) 超时 (${JOB_TIMEOUT_MS}ms)`));
    }, JOB_TIMEOUT_MS);

    handler(job)
      .then(() => {
        clearTimeout(timer);
        resolve();
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Process a batch of pending jobs.
 * Claims jobs one by one and executes the registered handler.
 * Each handler is wrapped in a timeout guard (60s).
 */
export async function processNextBatch(params?: {
  limit?: number;
}): Promise<{ processed: number; failed: number }> {
  const jobTypes = getRegisteredJobTypes();
  if (jobTypes.length === 0) {
    return { processed: 0, failed: 0 };
  }

  const maxJobs = params?.limit ?? 5;
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < maxJobs; i++) {
    let job: BackgroundJob | null = null;

    try {
      job = await claimNextJob({ jobTypes });
    } catch (error) {
      console.error("[background-jobs/worker] claimNextJob 失败", error);
      break;
    }

    if (!job) break;

    const handler = handlerRegistry.get(job.jobType);

    if (!handler) {
      try {
        await failJob(
          job.id,
          `未注册 handler: ${job.jobType}`,
        );
      } catch (error) {
        console.error("[background-jobs/worker] failJob 失败", error);
      }
      failed += 1;
      continue;
    }

    try {
      await runWithTimeout(handler, job);
      await completeJob(job.id, { completedBy: "worker" });
      processed += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "未知错误";
      try {
        await failJob(job.id, message);
      } catch (failError) {
        console.error("[background-jobs/worker] failJob 失败", failError);
      }
      failed += 1;
    }
  }

  return { processed, failed };
}

export async function processJobByKey(jobKey: string): Promise<{
  processed: number;
  failed: number;
  skipped: boolean;
}> {
  const job = await claimJobByKey(jobKey);
  if (!job) {
    return { processed: 0, failed: 0, skipped: true };
  }

  const handler = handlerRegistry.get(job.jobType);
  if (!handler) {
    await failJob(job.id, `未注册 handler: ${job.jobType}`);
    return { processed: 0, failed: 1, skipped: false };
  }

  try {
    await runWithTimeout(handler, job);
    await completeJob(job.id, { completedBy: "worker" });
    return { processed: 1, failed: 0, skipped: false };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "未知错误";
    await failJob(job.id, message);
    return { processed: 0, failed: 1, skipped: false };
  }
}
