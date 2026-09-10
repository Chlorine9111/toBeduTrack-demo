import type { AgentTaskKind, AgentToolName } from "@/lib/agent/task-state";
import type {
  AgentTriageArtifactIntent,
  AgentWorkflowId,
} from "@/lib/agent/triage/types";

export type AgentWorkflowRegistration = {
  id: AgentWorkflowId;
  label: string;
  defaultAllowedTools: AgentToolName[];
  artifactIntent: AgentTriageArtifactIntent;
  defaultRunMode:
    | "chat_answer"
    | "document_artifact"
    | "retrieval_only"
    | "retrieval_then_document";
};

const AGENT_WORKFLOW_REGISTRY = {
  general_chat: {
    id: "general_chat",
    label: "通用对话",
    defaultAllowedTools: [],
    artifactIntent: "none",
    defaultRunMode: "chat_answer",
  },
  retrieval: {
    id: "retrieval",
    label: "检索整合",
    defaultAllowedTools: ["web_search", "read_webpage"],
    artifactIntent: "none",
    defaultRunMode: "retrieval_only",
  },
  lesson_plan: {
    id: "lesson_plan",
    label: "教案工作流",
    defaultAllowedTools: ["generate_lesson_plan_workflow"],
    artifactIntent: "single_primary",
    defaultRunMode: "document_artifact",
  },
  exercises: {
    id: "exercises",
    label: "习题工作流",
    defaultAllowedTools: [
      "generate_ap_exercises_pipeline",
      "generate_answer_key",
      "adapt_difficulty",
      "search_question_bank",
      "assemble_worksheet",
      "generate_worksheet",
      "generate_exit_ticket",
    ],
    artifactIntent: "single_primary",
    defaultRunMode: "document_artifact",
  },
  worksheet: {
    id: "worksheet",
    label: "Worksheet 工作流",
    defaultAllowedTools: [
      "generate_worksheet",
      "generate_answer_key",
      "adapt_difficulty",
    ],
    artifactIntent: "single_primary",
    defaultRunMode: "document_artifact",
  },
  rubric: {
    id: "rubric",
    label: "Rubric 工作流",
    defaultAllowedTools: ["generate_rubric"],
    artifactIntent: "single_primary",
    defaultRunMode: "document_artifact",
  },
  pbl: {
    id: "pbl",
    label: "PBL 工作流",
    defaultAllowedTools: ["generate_pbl_project"],
    artifactIntent: "single_primary",
    defaultRunMode: "document_artifact",
  },
  question_bank: {
    id: "question_bank",
    label: "题库调取工作流",
    defaultAllowedTools: [
      "search_question_bank",
      "assemble_worksheet",
      "generate_answer_key",
    ],
    artifactIntent: "primary_plus_auxiliary",
    defaultRunMode: "document_artifact",
  },
  answer_key: {
    id: "answer_key",
    label: "答案解析工作流",
    defaultAllowedTools: ["generate_answer_key"],
    artifactIntent: "single_primary",
    defaultRunMode: "document_artifact",
  },
  adapt_difficulty: {
    id: "adapt_difficulty",
    label: "难度改写工作流",
    defaultAllowedTools: ["adapt_difficulty"],
    artifactIntent: "single_primary",
    defaultRunMode: "document_artifact",
  },
  exit_ticket: {
    id: "exit_ticket",
    label: "Exit Ticket 工作流",
    defaultAllowedTools: ["generate_exit_ticket"],
    artifactIntent: "single_primary",
    defaultRunMode: "document_artifact",
  },
} satisfies Record<AgentWorkflowId, AgentWorkflowRegistration>;

export function getAgentWorkflowRegistration(
  workflow: AgentWorkflowId,
): AgentWorkflowRegistration {
  return AGENT_WORKFLOW_REGISTRY[workflow];
}

function uniqueTools(items: AgentToolName[]) {
  return Array.from(new Set(items));
}

export function resolveDefaultAllowedToolsForTaskKind(params: {
  kind: AgentTaskKind;
  shouldPreferWeb: boolean;
  shouldPreferQuestionBank: boolean;
}) {
  if (params.kind === "general" || params.kind === "summary" || params.kind === "organize") {
    return [] as AgentToolName[];
  }

  if (params.kind === "research") {
    return params.shouldPreferWeb
      ? getAgentWorkflowRegistration("retrieval").defaultAllowedTools
      : [];
  }

  if (params.kind === "lesson_plan") {
    return uniqueTools([
      ...getAgentWorkflowRegistration("lesson_plan").defaultAllowedTools,
      ...(params.shouldPreferWeb
        ? getAgentWorkflowRegistration("retrieval").defaultAllowedTools
        : []),
    ]);
  }

  if (params.kind === "rubric") {
    return getAgentWorkflowRegistration("rubric").defaultAllowedTools;
  }

  if (params.kind === "pbl") {
    return getAgentWorkflowRegistration("pbl").defaultAllowedTools;
  }

  if (params.kind === "exercise") {
    if (params.shouldPreferQuestionBank) {
      return getAgentWorkflowRegistration("question_bank").defaultAllowedTools;
    }
    return uniqueTools([
      ...getAgentWorkflowRegistration("exercises").defaultAllowedTools,
      ...(params.shouldPreferWeb
        ? getAgentWorkflowRegistration("retrieval").defaultAllowedTools
        : []),
    ]);
  }

  return [] as AgentToolName[];
}

export function resolveAgentWorkflowFromRouting(params: {
  kind: AgentTaskKind;
  forcedToolChoice: AgentToolName | null;
  preferredTools: AgentToolName[];
  shouldPreferWeb: boolean;
  shouldPreferQuestionBank: boolean;
}): AgentWorkflowId {
  if (params.forcedToolChoice) {
    switch (params.forcedToolChoice) {
      case "generate_lesson_plan_workflow":
        return "lesson_plan";
      case "generate_rubric":
        return "rubric";
      case "generate_pbl_project":
        return "pbl";
      case "generate_worksheet":
        return "worksheet";
      case "assemble_worksheet":
      case "search_question_bank":
        return "question_bank";
      case "generate_ap_exercises_pipeline":
        return "exercises";
      case "generate_answer_key":
        return "answer_key";
      case "adapt_difficulty":
        return "adapt_difficulty";
      case "generate_exit_ticket":
        return "exit_ticket";
      default:
        break;
    }
  }

  if (params.shouldPreferQuestionBank) {
    return "question_bank";
  }

  if (params.preferredTools.includes("generate_worksheet")) {
    return "worksheet";
  }
  if (params.preferredTools.includes("generate_rubric")) {
    return "rubric";
  }
  if (params.preferredTools.includes("generate_lesson_plan_workflow")) {
    return "lesson_plan";
  }
  if (params.preferredTools.includes("generate_pbl_project")) {
    return "pbl";
  }
  if (params.preferredTools.includes("generate_exit_ticket")) {
    return "exit_ticket";
  }
  if (params.preferredTools.includes("generate_answer_key")) {
    return "answer_key";
  }
  if (params.preferredTools.includes("adapt_difficulty")) {
    return "adapt_difficulty";
  }
  if (
    params.preferredTools.includes("assemble_worksheet") ||
    params.preferredTools.includes("search_question_bank")
  ) {
    return "question_bank";
  }
  if (params.preferredTools.includes("generate_ap_exercises_pipeline")) {
    return "exercises";
  }

  switch (params.kind) {
    case "lesson_plan":
      return "lesson_plan";
    case "rubric":
      return "rubric";
    case "pbl":
      return "pbl";
    case "exercise":
      return "exercises";
    case "research":
      return params.shouldPreferWeb ? "retrieval" : "general_chat";
    default:
      return "general_chat";
  }
}
