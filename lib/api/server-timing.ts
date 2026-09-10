type ServerTimingMetric = {
  name: string;
  durationMs: number;
  description?: string;
};

function sanitizeMetricName(name: string) {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "metric";
}

function sanitizeDescription(description: string) {
  return description
    .replace(/["\r\n]+/g, " ")
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function createServerTimingRecorder() {
  const metrics: ServerTimingMetric[] = [];

  return {
    mark(name: string, durationMs: number, description?: string) {
      if (!Number.isFinite(durationMs) || durationMs < 0) return;
      const nextDescription = description ? sanitizeDescription(description) : undefined;
      metrics.push({
        name: sanitizeMetricName(name),
        durationMs,
        description: nextDescription || undefined,
      });
    },
    measure(name: string, startedAt: number, description?: string) {
      this.mark(name, Math.max(0, performance.now() - startedAt), description);
    },
    toHeaderValue() {
      if (metrics.length === 0) return "";
      return metrics
        .map((metric) => {
          const parts = [
            metric.name,
            `dur=${metric.durationMs.toFixed(1)}`,
          ];
          if (metric.description) {
            parts.push(`desc="${metric.description}"`);
          }
          return parts.join(";");
        })
        .join(", ");
    },
  };
}

export function appendServerTimingHeader(
  headersInit: HeadersInit | undefined,
  recorder: ReturnType<typeof createServerTimingRecorder>,
) {
  const headers = new Headers(headersInit);
  const nextValue = recorder.toHeaderValue();
  if (!nextValue) return headers;

  const currentValue = headers.get("Server-Timing");
  headers.set(
    "Server-Timing",
    currentValue ? `${currentValue}, ${nextValue}` : nextValue,
  );
  return headers;
}

export function withServerTiming(
  response: Response,
  recorder: ReturnType<typeof createServerTimingRecorder>,
) {
  const headers = appendServerTimingHeader(response.headers, recorder);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
