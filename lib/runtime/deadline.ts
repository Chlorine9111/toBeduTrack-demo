type TimeoutInput =
  | number
  | {
      totalMs?: number;
      stepMs?: number;
      chunkMs?: number;
    }
  | undefined;

export function resolveTimeoutMs(timeout: TimeoutInput, fallbackMs: number) {
  if (typeof timeout === "number" && Number.isFinite(timeout) && timeout > 0) {
    return timeout;
  }

  if (!timeout || typeof timeout !== "object") return fallbackMs;

  if (typeof timeout.stepMs === "number" && timeout.stepMs > 0) {
    return timeout.stepMs;
  }

  if (typeof timeout.totalMs === "number" && timeout.totalMs > 0) {
    return timeout.totalMs;
  }

  if (typeof timeout.chunkMs === "number" && timeout.chunkMs > 0) {
    return timeout.chunkMs;
  }

  return fallbackMs;
}

export function createDeadlineSignal(params: {
  timeoutMs: number;
  parentSignal?: AbortSignal;
  reason?: string;
}) {
  const controller = new AbortController();
  const timeoutMs = Math.max(1, params.timeoutMs);
  const relayAbort = () => {
    if (controller.signal.aborted) return;
    controller.abort(params.parentSignal?.reason ?? params.reason ?? "aborted");
  };

  if (params.parentSignal) {
    if (params.parentSignal.aborted) {
      relayAbort();
    } else {
      params.parentSignal.addEventListener("abort", relayAbort, { once: true });
    }
  }

  const timer = setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort(params.reason ?? `timeout>${timeoutMs}ms`);
    }
  }, timeoutMs);

  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timer);
      if (params.parentSignal) {
        params.parentSignal.removeEventListener("abort", relayAbort);
      }
    },
  };
}

export async function runWithDeadline<T>(params: {
  timeoutMs: number;
  parentSignal?: AbortSignal;
  reason?: string;
  onTimeout?: (reason: string) => Error;
  action: (signal: AbortSignal) => Promise<T>;
}) {
  const deadline = createDeadlineSignal({
    timeoutMs: params.timeoutMs,
    parentSignal: params.parentSignal,
    reason: params.reason,
  });

  const abortPromise = new Promise<T>((_, reject) => {
    const handleAbort = () => {
      const reason =
        typeof deadline.signal.reason === "string" && deadline.signal.reason
          ? deadline.signal.reason
          : params.reason ?? `timeout>${params.timeoutMs}ms`;
      reject(params.onTimeout ? params.onTimeout(reason) : new DOMException(reason, "AbortError"));
    };

    if (deadline.signal.aborted) {
      handleAbort();
      return;
    }

    deadline.signal.addEventListener("abort", handleAbort, { once: true });
  });

  try {
    return await Promise.race([params.action(deadline.signal), abortPromise]);
  } finally {
    deadline.clear();
  }
}
