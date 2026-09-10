import type { QuotaAction, QuotaClass } from "@/lib/quota/types";

export const BETA_TEACHER_QUOTA_TOTAL = 300;
export const BETA_TEACHER_GRACE_BUFFER = 50;
export const DEFAULT_QUOTA_PERIOD_DAYS = 30;

export const QUOTA_CLASS_UNITS: Record<QuotaClass, number> = {
  system: 0,
  light: 1,
  agent_chat: 2,
  standard: 4,
  standard_plus: 6,
  heavy: 12,
};

export const QUOTA_ACTION_CLASS: Record<QuotaAction, QuotaClass> = {
  agent_chat: "agent_chat",
  generate_rubric: "standard",
  generate_exercises: "standard",
  generate_lesson_plan: "heavy",
  generate_pbl: "heavy",
  auto_grade: "standard_plus",
  generate_wechat_article: "standard",
  doc_ai_edit: "agent_chat",
};

export function getQuotaClassUnits(quotaClass: QuotaClass) {
  return QUOTA_CLASS_UNITS[quotaClass];
}

export function getQuotaActionUnits(action: QuotaAction) {
  return getQuotaClassUnits(QUOTA_ACTION_CLASS[action]);
}
