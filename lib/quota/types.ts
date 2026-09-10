export type QuotaPlan = "beta_teacher" | "pro" | "unlimited";

export type QuotaClass =
  | "system"
  | "light"
  | "agent_chat"
  | "standard"
  | "standard_plus"
  | "heavy";

export type QuotaAction =
  | "agent_chat"
  | "generate_rubric"
  | "generate_exercises"
  | "generate_lesson_plan"
  | "generate_pbl"
  | "auto_grade"
  | "generate_wechat_article"
  | "doc_ai_edit";

export type QuotaSummary = {
  plan: string;
  status: string;
  quotaTotal: number;
  quotaUsed: number;
  quotaRemaining: number;
  quotaSoftRemaining: number;
  graceBuffer: number;
  periodDays: number;
  periodStart: string;
  periodEnd: string;
  usageRatio: number;
};

export type QuotaAdmission = QuotaSummary & {
  allowed: boolean;
  reason: string | null;
  requestedUnits: number;
};

export type QuotaFinalizeResult = QuotaSummary & {
  charged: boolean;
  alreadyRecorded: boolean;
  reason: string | null;
  transactionId: string | null;
};
