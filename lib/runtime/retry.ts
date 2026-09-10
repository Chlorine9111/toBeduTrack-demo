import { getRetryAfterSec, isAppError, toAppError } from "@/lib/runtime/app-error";

type RetryPolicy = {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeDelay(params: {
  attempt: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
  retryAfterSec: number | null;
}) {
  if (typeof params.retryAfterSec === "number" && params.retryAfterSec > 0) {
    return params.retryAfterSec * 1000;
  }

  const exponential = Math.min(
    params.maxDelayMs,
    params.baseDelayMs * 2 ** Math.max(0, params.attempt - 1),
  );
  const jitter = params.jitterMs > 0 ? Math.floor(Math.random() * params.jitterMs) : 0;
  return exponential + jitter;
}

export async function runWithRetry<T>(
  action: (attempt: number) => Promise<T>,
  policy?: RetryPolicy,
) {
  const retries = Math.max(0, policy?.retries ?? 2);
  const baseDelayMs = Math.max(50, policy?.baseDelayMs ?? 1000);
  const maxDelayMs = Math.max(baseDelayMs, policy?.maxDelayMs ?? 4000);
  const jitterMs = Math.max(0, policy?.jitterMs ?? 250);

  let lastError: unknown;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      return await action(attempt);
    } catch (error) {
      lastError = error;
      if (attempt > retries) break;

      const appError = isAppError(error)
        ? error
        : toAppError(error, { retryable: false });
      const shouldRetry = policy?.shouldRetry
        ? policy.shouldRetry(error, attempt)
        : appError.retryable;

      if (!shouldRetry) {
        throw error;
      }

      const delayMs = computeDelay({
        attempt,
        baseDelayMs,
        maxDelayMs,
        jitterMs,
        retryAfterSec: getRetryAfterSec(appError),
      });
      await sleep(delayMs);
    }
  }

  throw lastError;
}
