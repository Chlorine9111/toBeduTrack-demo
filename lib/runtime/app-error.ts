export type AppErrorCode =
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "VALIDATION"
  | "PERSISTENCE"
  | "FEATURE_DISABLED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "BACKGROUND_TASK_FAILED"
  | "UNAUTHORIZED"
  | "INTERNAL";

type AppErrorParams = {
  code: AppErrorCode;
  message: string;
  status?: number;
  retryable?: boolean;
  source?: string | null;
  details?: unknown;
  cause?: unknown;
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly source: string | null;
  readonly details?: unknown;
  override readonly cause?: unknown;

  constructor(params: AppErrorParams) {
    super(params.message);
    this.name = "AppError";
    this.code = params.code;
    this.status = params.status ?? 500;
    this.retryable = params.retryable ?? false;
    this.source = params.source ?? null;
    this.details = params.details;
    this.cause = params.cause;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function createTimeoutError(message: string, source?: string | null) {
  return new AppError({
    code: "TIMEOUT",
    message,
    status: 504,
    retryable: true,
    source,
  });
}

export function createRateLimitError(
  message: string,
  params?: { retryAfterSec?: number | null; source?: string | null },
) {
  return new AppError({
    code: "RATE_LIMITED",
    message,
    status: 429,
    retryable: true,
    source: params?.source ?? null,
    details:
      typeof params?.retryAfterSec === "number"
        ? { retryAfterSec: params.retryAfterSec }
        : undefined,
  });
}

export function createUpstreamUnavailableError(message: string, source?: string | null) {
  return new AppError({
    code: "UPSTREAM_UNAVAILABLE",
    message,
    status: 503,
    retryable: true,
    source,
  });
}

export function createValidationError(message: string, details?: unknown) {
  return new AppError({
    code: "VALIDATION",
    message,
    status: 400,
    retryable: false,
    details,
  });
}

export function createPersistenceError(message: string, params?: { details?: unknown; cause?: unknown }) {
  return new AppError({
    code: "PERSISTENCE",
    message,
    status: 500,
    retryable: false,
    details: params?.details,
    cause: params?.cause,
  });
}

export function createFeatureDisabledError(message: string) {
  return new AppError({
    code: "FEATURE_DISABLED",
    message,
    status: 503,
    retryable: false,
  });
}

export function createNotFoundError(message: string, details?: unknown) {
  return new AppError({
    code: "NOT_FOUND",
    message,
    status: 404,
    retryable: false,
    details,
  });
}

export function createConflictError(message: string, details?: unknown) {
  return new AppError({
    code: "CONFLICT",
    message,
    status: 409,
    retryable: false,
    details,
  });
}

export function createBackgroundTaskError(message: string, params?: { details?: unknown; cause?: unknown }) {
  return new AppError({
    code: "BACKGROUND_TASK_FAILED",
    message,
    status: 500,
    retryable: true,
    details: params?.details,
    cause: params?.cause,
  });
}

function extractStatus(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function extractRetryAfterSec(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const details = (error as { details?: unknown }).details;
  if (!details || typeof details !== "object") return null;
  const retryAfterSec = (details as { retryAfterSec?: unknown }).retryAfterSec;
  return typeof retryAfterSec === "number" ? retryAfterSec : null;
}

export function toAppError(
  error: unknown,
  fallback?: {
    message?: string;
    source?: string | null;
    code?: AppErrorCode;
    status?: number;
    retryable?: boolean;
  },
) {
  if (isAppError(error)) return error;

  if (error instanceof Error && error.name === "AbortError") {
    return createTimeoutError(
      fallback?.message ?? (error.message || "请求超时"),
      fallback?.source ?? null,
    );
  }

  const status = extractStatus(error);
  if (status === 429) {
    return createRateLimitError(
      fallback?.message ?? (error instanceof Error ? error.message : "请求频率过高"),
      {
        source: fallback?.source ?? null,
        retryAfterSec: extractRetryAfterSec(error),
      },
    );
  }

  if (status && [502, 503, 504].includes(status)) {
    return createUpstreamUnavailableError(
      fallback?.message ?? (error instanceof Error ? error.message : "上游服务暂时不可用"),
      fallback?.source ?? null,
    );
  }

  return new AppError({
    code: fallback?.code ?? "INTERNAL",
    message:
      fallback?.message ??
      (error instanceof Error ? error.message : "发生未知错误"),
    status: fallback?.status ?? status ?? 500,
    retryable: fallback?.retryable ?? false,
    source: fallback?.source ?? null,
    cause: error,
  });
}

export function getRetryAfterSec(error: unknown) {
  return extractRetryAfterSec(error);
}
