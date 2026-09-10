export type WorkflowProfileName =
  | "agent_preflight"
  | "agent_chat"
  | "grading_answer_key_infer"
  | "grading_auto_grade";

type WorkflowBudgetProfile = {
  targetTotalMs?: number;
  maxTotalMs?: number;
  targetTtftMs?: number;
};

type WorkflowConcurrencyProfile = {
  maxInFlight: number;
};

export type WorkflowProfile = {
  name: WorkflowProfileName;
  displayName: string;
  budgets: WorkflowBudgetProfile;
  concurrency?: WorkflowConcurrencyProfile;
};

const WORKFLOW_PROFILES: Record<WorkflowProfileName, WorkflowProfile> = {
  agent_preflight: {
    name: "agent_preflight",
    displayName: "Agent Preflight",
    budgets: {
      targetTotalMs: 800,
      maxTotalMs: 1_500,
    },
  },
  agent_chat: {
    name: "agent_chat",
    displayName: "Agent Chat",
    budgets: {
      targetTtftMs: 2_000,
      maxTotalMs: 30_000,
    },
    concurrency: {
      maxInFlight: 2,
    },
  },
  grading_answer_key_infer: {
    name: "grading_answer_key_infer",
    displayName: "Grading Answer Key Infer",
    budgets: {
      maxTotalMs: 30_000,
    },
    concurrency: {
      maxInFlight: 1,
    },
  },
  grading_auto_grade: {
    name: "grading_auto_grade",
    displayName: "Grading Auto Grade",
    budgets: {
      maxTotalMs: 30_000,
    },
    concurrency: {
      maxInFlight: 1,
    },
  },
};

export type WorkflowBudgetEvaluation = {
  targetTotalMs: number | null;
  maxTotalMs: number | null;
  targetTtftMs: number | null;
  observedTotalMs: number | null;
  observedTtftMs: number | null;
  overTargetTotal: boolean;
  overMaxTotal: boolean;
  overTargetTtft: boolean;
};

export function getWorkflowProfile(name: WorkflowProfileName): WorkflowProfile {
  return WORKFLOW_PROFILES[name];
}

export function evaluateWorkflowBudget(
  profile: WorkflowProfile,
  metrics: {
    totalMs?: number | null;
    ttftMs?: number | null;
  },
): WorkflowBudgetEvaluation {
  const observedTotalMs =
    typeof metrics.totalMs === "number" && Number.isFinite(metrics.totalMs)
      ? metrics.totalMs
      : null;
  const observedTtftMs =
    typeof metrics.ttftMs === "number" && Number.isFinite(metrics.ttftMs)
      ? metrics.ttftMs
      : null;
  const targetTotalMs = profile.budgets.targetTotalMs ?? null;
  const maxTotalMs = profile.budgets.maxTotalMs ?? null;
  const targetTtftMs = profile.budgets.targetTtftMs ?? null;

  return {
    targetTotalMs,
    maxTotalMs,
    targetTtftMs,
    observedTotalMs,
    observedTtftMs,
    overTargetTotal:
      observedTotalMs !== null &&
      targetTotalMs !== null &&
      observedTotalMs > targetTotalMs,
    overMaxTotal:
      observedTotalMs !== null &&
      maxTotalMs !== null &&
      observedTotalMs > maxTotalMs,
    overTargetTtft:
      observedTtftMs !== null &&
      targetTtftMs !== null &&
      observedTtftMs > targetTtftMs,
  };
}

export function serializeWorkflowProfile(profile: WorkflowProfile) {
  return {
    name: profile.name,
    displayName: profile.displayName,
    budgets: profile.budgets,
    concurrency: profile.concurrency ?? null,
  };
}
