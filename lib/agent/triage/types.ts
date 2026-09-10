import type { AgentTaskContext } from "@/lib/agent/task-context";
import type {
  AgentTaskState,
  AgentToolName,
} from "@/lib/agent/task-state";

export type AgentWorkflowId =
  | "general_chat"
  | "retrieval"
  | "lesson_plan"
  | "exercises"
  | "worksheet"
  | "rubric"
  | "pbl"
  | "question_bank"
  | "answer_key"
  | "adapt_difficulty"
  | "exit_ticket";

export type AgentTriageSource =
  | "rules"
  | "structured_classifier"
  | "runtime_context";

export type AgentTriageContinuationMode =
  | "new_task"
  | "continuation"
  | "artifact_followup";

export type AgentTriageRetrievalSource =
  | "none"
  | "knowledge"
  | "web"
  | "question_bank"
  | "mixed";

export type AgentTriageArtifactIntent =
  | "none"
  | "single_primary"
  | "primary_plus_auxiliary";

export type AgentTriageConfidence =
  | "forced"
  | "high"
  | "medium"
  | "low";

export type AgentTriageDecision = {
  source: AgentTriageSource;
  workflow: AgentWorkflowId;
  workflowLabel: string;
  taskState: AgentTaskState;
  taskContext?: AgentTaskContext;
  forcedToolChoice: AgentToolName | null;
  preferredTools: AgentToolName[];
  allowedTools: AgentToolName[];
  continuationMode: AgentTriageContinuationMode;
  retrievalSources: AgentTriageRetrievalSource;
  artifactIntent: AgentTriageArtifactIntent;
  confidence: AgentTriageConfidence;
  reasonCodes: string[];
};
