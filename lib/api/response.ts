import { NextResponse } from "next/server";
import { isAppError } from "@/lib/runtime/app-error";

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "ASSET_NOT_FILE_BACKED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "FEATURE_DISABLED"
  | "SERVICE_UNAVAILABLE"
  | "BACKGROUND_JOB_FAILED"
  | "PDF_RENDER_FAILED"
  | "PDF_RENDER_TIMEOUT"
  | "PDF_TOO_LARGE"
  | "STORAGE_UPLOAD_FAILED"
  | "STORAGE_DELETE_FAILED"
  | "DB_WRITE_FAILED"
  | "QUOTA_EXHAUSTED"
  | "INTERNAL_ERROR";

export function jsonError(
  code: ApiErrorCode,
  message: string,
  status = 400,
  details?: unknown,
  headers?: HeadersInit,
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        details,
      },
    },
    { status, headers },
  );
}

export function jsonErrorFromUnknown(
  error: unknown,
  fallbackMessage = "请求失败",
  fallbackStatus = 500,
) {
  if (isAppError(error)) {
    const code: ApiErrorCode =
      error.code === "UNAUTHORIZED"
        ? "UNAUTHORIZED"
        : error.code === "NOT_FOUND"
          ? "NOT_FOUND"
          : error.code === "CONFLICT"
            ? "CONFLICT"
            : error.code === "VALIDATION"
              ? "VALIDATION_ERROR"
              : error.code === "RATE_LIMITED"
                ? "RATE_LIMITED"
                : error.code === "TIMEOUT"
                  ? "TIMEOUT"
                  : error.code === "FEATURE_DISABLED"
                    ? "FEATURE_DISABLED"
                    : error.code === "BACKGROUND_TASK_FAILED"
                      ? "BACKGROUND_JOB_FAILED"
                      : error.code === "UPSTREAM_UNAVAILABLE"
                        ? "SERVICE_UNAVAILABLE"
                        : error.code === "PERSISTENCE"
                          ? "DB_WRITE_FAILED"
                          : "INTERNAL_ERROR";

    return jsonError(code, error.message, error.status, error.details);
  }

  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : fallbackMessage;
  return jsonError("INTERNAL_ERROR", message, fallbackStatus);
}
