import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { QUOTA_ACTION_CLASS, getQuotaActionUnits } from "@/lib/quota/constants";
import type {
  QuotaAction,
  QuotaAdmission,
  QuotaFinalizeResult,
  QuotaSummary,
} from "@/lib/quota/types";
import type { Database, Json } from "@/types/database";

type AppSupabaseClient = SupabaseClient<Database>;

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function normalizeSummaryRow(row: Record<string, unknown> | null | undefined): QuotaSummary {
  if (!row) {
    throw new Error("额度摘要返回为空");
  }

  return {
    plan: asString(row.plan, "beta_teacher"),
    status: asString(row.status, "active"),
    quotaTotal: asNumber(row.quota_total),
    quotaUsed: asNumber(row.quota_used),
    quotaRemaining: asNumber(row.quota_remaining),
    quotaSoftRemaining: asNumber(row.quota_soft_remaining),
    graceBuffer: asNumber(row.grace_buffer),
    periodDays: asNumber(row.period_days, 30),
    periodStart: asString(row.period_start),
    periodEnd: asString(row.period_end),
    usageRatio: asNumber(row.usage_ratio),
  };
}

function normalizeAdmissionRow(row: Record<string, unknown> | null | undefined): QuotaAdmission {
  const summary = normalizeSummaryRow(row);
  return {
    ...summary,
    allowed: Boolean(row?.allowed),
    reason: asNullableString(row?.reason),
    requestedUnits: asNumber(row?.requested_units),
  };
}

function normalizeFinalizeRow(
  row: Record<string, unknown> | null | undefined,
): QuotaFinalizeResult {
  const summary = normalizeSummaryRow(row);
  return {
    ...summary,
    charged: Boolean(row?.charged),
    alreadyRecorded: Boolean(row?.already_recorded),
    reason: asNullableString(row?.reason),
    transactionId: asNullableString(row?.transaction_id),
  };
}

async function requireSingleRow<T>(
  label: string,
  data: T[] | null,
  error: { message: string } | null,
) {
  if (error) {
    throw new Error(`${label} 失败: ${error.message}`);
  }
  const row = data?.[0];
  if (!row) {
    throw new Error(`${label} 未返回结果`);
  }
  return row;
}

export function resolveQuotaIdempotencyKey(
  request: Request,
  fallbackPrefix: string,
) {
  return request.headers.get("x-idempotency-key") || `${fallbackPrefix}:${randomUUID()}`;
}

export async function getQuotaSummary(
  supabase: AppSupabaseClient,
  teacherId: string,
) {
  const { data, error } = await supabase.rpc("get_quota_summary", {
    p_teacher_id: teacherId,
  });
  const row = await requireSingleRow("get_quota_summary", data, error);
  return normalizeSummaryRow(row as Record<string, unknown>);
}

export async function getQuotaSummarySafe(
  supabase: AppSupabaseClient,
  teacherId: string,
) {
  try {
    return await getQuotaSummary(supabase, teacherId);
  } catch (error) {
    console.error("读取额度摘要失败，降级跳过。", error);
    return null;
  }
}

export async function checkQuotaAdmission(
  supabase: AppSupabaseClient,
  params: {
    teacherId: string;
    action: QuotaAction;
  },
) {
  const { data, error } = await supabase.rpc("check_quota_admission", {
    p_teacher_id: params.teacherId,
    p_units: getQuotaActionUnits(params.action),
  });
  const row = await requireSingleRow("check_quota_admission", data, error);
  return normalizeAdmissionRow(row as Record<string, unknown>);
}

export async function checkQuotaAdmissionSafe(
  supabase: AppSupabaseClient,
  params: {
    teacherId: string;
    action: QuotaAction;
  },
) {
  try {
    return await checkQuotaAdmission(supabase, params);
  } catch (error) {
    console.error(`额度准入检查失败，按放行处理（${params.action}）。`, error);
    return null;
  }
}

export async function finalizeQuotaSpend(
  supabase: AppSupabaseClient,
  params: {
    teacherId: string;
    action: QuotaAction;
    idempotencyKey: string;
    metadata?: Json;
  },
) {
  const { data, error } = await supabase.rpc("finalize_quota_spend", {
    p_teacher_id: params.teacherId,
    p_action: params.action,
    p_quota_class: QUOTA_ACTION_CLASS[params.action],
    p_units: getQuotaActionUnits(params.action),
    p_idempotency_key: params.idempotencyKey,
    p_metadata: (params.metadata ?? {}) as Json,
  });
  const row = await requireSingleRow("finalize_quota_spend", data, error);
  return normalizeFinalizeRow(row as Record<string, unknown>);
}

export async function finalizeQuotaSpendSafe(
  supabase: AppSupabaseClient,
  params: {
    teacherId: string;
    action: QuotaAction;
    idempotencyKey: string;
    metadata?: Json;
  },
) {
  try {
    return await finalizeQuotaSpend(supabase, params);
  } catch (error) {
    console.error(`额度扣减失败，降级跳过（${params.action}）。`, error);
    return null;
  }
}
