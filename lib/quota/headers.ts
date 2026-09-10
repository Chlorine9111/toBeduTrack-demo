import type { QuotaAdmission, QuotaFinalizeResult, QuotaSummary } from "@/lib/quota/types";

type QuotaLike = QuotaSummary | QuotaAdmission | QuotaFinalizeResult;

export function buildQuotaHeaders(
  summary: QuotaLike | null | undefined,
  options?: {
    snapshot?: "admission" | "final" | "summary";
    charged?: boolean | null;
  },
): HeadersInit {
  if (!summary) return {};
  return {
    "X-Quota-Plan": summary.plan,
    "X-Quota-Status": summary.status,
    "X-Quota-Total": String(summary.quotaTotal),
    "X-Quota-Used": String(summary.quotaUsed),
    "X-Quota-Remaining": String(summary.quotaRemaining),
    "X-Quota-Soft-Remaining": String(summary.quotaSoftRemaining),
    "X-Quota-Grace-Buffer": String(summary.graceBuffer),
    "X-Quota-Period-End": summary.periodEnd,
    "X-Quota-Snapshot": options?.snapshot ?? "summary",
    ...(options?.charged == null
      ? {}
      : {
          "X-Quota-Charged": options.charged ? "1" : "0",
        }),
  };
}

export function buildQuotaExhaustedDetails(summary: QuotaAdmission) {
  return {
    plan: summary.plan,
    status: summary.status,
    quotaTotal: summary.quotaTotal,
    quotaUsed: summary.quotaUsed,
    quotaRemaining: summary.quotaRemaining,
    periodEnd: summary.periodEnd,
    requestedUnits: summary.requestedUnits,
    reason: summary.reason,
  };
}

export function mergeHeaders(...sources: Array<HeadersInit | undefined>) {
  const merged = new Headers();
  for (const source of sources) {
    if (!source) continue;
    const headers = new Headers(source);
    headers.forEach((value, key) => {
      merged.set(key, value);
    });
  }
  return merged;
}
