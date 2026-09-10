import type { AgentTaskContext } from "@/lib/agent/task-context";
import type { ParsedIntent } from "@/lib/chat/intent";
import { resolveEffectiveAgentTaskState } from "@/lib/agent/request-routing";
import {
  getAgentWorkflowRegistration,
  resolveAgentWorkflowFromRouting,
} from "@/lib/agent/workflow-registry";
import type { AgentTriageDecision } from "@/lib/agent/triage/types";
import type { AgentTaskState, AgentToolName } from "@/lib/agent/task-state";

const PREVIOUS_ARTIFACT_REFERENCE_PATTERN =
  /(刚才|上一版|上一个|刚刚|基于刚才|按刚才|那份|这份|原来的|把它|已经生成|已生成|previous|last version|that worksheet|that rubric)/i;

function dedupeTools(items: AgentToolName[]) {
  return Array.from(new Set(items));
}

function resolveContinuationMode(params: {
  taskState: AgentTaskState;
  taskContext?: AgentTaskContext;
  forcedToolChoice: AgentToolName | null;
  visiblePrompt: string;
}): AgentTriageDecision["continuationMode"] {
  if (
    params.forcedToolChoice === "generate_answer_key" ||
    params.forcedToolChoice === "adapt_difficulty" ||
    PREVIOUS_ARTIFACT_REFERENCE_PATTERN.test(params.visiblePrompt)
  ) {
    return "artifact_followup";
  }

  if (
    params.taskContext?.mode === "continuation" ||
    params.taskState.continuationLikely
  ) {
    return "continuation";
  }

  return "new_task";
}

function resolveRetrievalSources(params: {
  taskState: AgentTaskState;
  preferredTools: AgentToolName[];
  shouldPreferQuestionBank: boolean;
}): AgentTriageDecision["retrievalSources"] {
  const sources = new Set<"knowledge" | "web" | "question_bank">();

  if (params.taskState.shouldPreferAttachments || params.taskState.shouldPreferKnowledge) {
    sources.add("knowledge");
  }
  if (
    params.taskState.shouldPreferWeb ||
    params.preferredTools.includes("web_search") ||
    params.preferredTools.includes("read_webpage")
  ) {
    sources.add("web");
  }
  if (
    params.shouldPreferQuestionBank ||
    params.preferredTools.includes("search_question_bank") ||
    params.preferredTools.includes("assemble_worksheet")
  ) {
    sources.add("question_bank");
  }

  if (sources.size === 0) return "none";
  if (sources.size > 1) return "mixed";
  return Array.from(sources)[0];
}

function resolveArtifactIntent(params: {
  workflow: AgentTriageDecision["workflow"];
  preferredTools: AgentToolName[];
}) {
  if (params.preferredTools.includes("generate_answer_key")) {
    const hasPrimaryDocument = params.preferredTools.some((tool) =>
      tool !== "generate_answer_key" && tool !== "read_webpage" && tool !== "web_search",
    );
    if (hasPrimaryDocument) {
      return "primary_plus_auxiliary" as const;
    }
  }

  return getAgentWorkflowRegistration(params.workflow).artifactIntent;
}

function resolveConfidence(params: {
  workflow: AgentTriageDecision["workflow"];
  forcedToolChoice: AgentToolName | null;
  preferredTools: AgentToolName[];
  taskState: AgentTaskState;
}): AgentTriageDecision["confidence"] {
  if (params.forcedToolChoice) return "forced";
  if (
    params.preferredTools.length > 0 ||
    params.workflow !== "general_chat" ||
    params.taskState.kind !== "general"
  ) {
    return "high";
  }
  return "medium";
}

export function resolveAgentTriageDecision(params: {
  promptTaskState: AgentTaskState;
  contextualTaskState: AgentTaskState;
  taskContext?: AgentTaskContext | null;
  parsedIntent: ParsedIntent;
  visiblePrompt: string;
  sourceOverride?: AgentTriageDecision["source"];
  extraReasonCodes?: string[];
}): AgentTriageDecision {
  const routing = resolveEffectiveAgentTaskState(params);
  const shouldPreferQuestionBank =
    routing.taskState.kind === "exercise" &&
    (routing.preferredTools.includes("search_question_bank") ||
      routing.preferredTools.includes("assemble_worksheet"));
  const workflow = resolveAgentWorkflowFromRouting({
    kind: routing.taskState.kind,
    forcedToolChoice: routing.forcedToolChoice,
    preferredTools: routing.preferredTools,
    shouldPreferWeb: routing.taskState.shouldPreferWeb,
    shouldPreferQuestionBank,
  });
  const registration = getAgentWorkflowRegistration(workflow);
  const allowedTools = dedupeTools(
    routing.preferredTools.length > 0
      ? routing.preferredTools
      : routing.taskState.allowedTools.length > 0
        ? routing.taskState.allowedTools
        : registration.defaultAllowedTools,
  );
  const continuationMode = resolveContinuationMode({
    taskState: routing.taskState,
    taskContext: routing.taskContext,
    forcedToolChoice: routing.forcedToolChoice,
    visiblePrompt: params.visiblePrompt,
  });
  const retrievalSources = resolveRetrievalSources({
    taskState: routing.taskState,
    preferredTools: routing.preferredTools,
    shouldPreferQuestionBank,
  });
  const artifactIntent = resolveArtifactIntent({
    workflow,
    preferredTools: routing.preferredTools,
  });
  const confidence = resolveConfidence({
    workflow,
    forcedToolChoice: routing.forcedToolChoice,
    preferredTools: routing.preferredTools,
    taskState: routing.taskState,
  });
  const reasonCodes = [
    ...(params.extraReasonCodes ?? []),
    `workflow:${workflow}`,
    routing.forcedToolChoice ? `forced_tool:${routing.forcedToolChoice}` : "",
    routing.preferredTools.length > 0
      ? `preferred_tools:${routing.preferredTools.join(",")}`
      : "",
    retrievalSources !== "none" ? `retrieval:${retrievalSources}` : "",
    continuationMode !== "new_task" ? `continuation:${continuationMode}` : "",
    artifactIntent !== "none" ? `artifact:${artifactIntent}` : "",
  ].filter(Boolean);

  return {
    source:
      params.sourceOverride ??
      (routing.taskContext ? "runtime_context" : "rules"),
    workflow,
    workflowLabel: registration.label,
    taskState: routing.taskState,
    taskContext: routing.taskContext,
    forcedToolChoice: routing.forcedToolChoice,
    preferredTools: routing.preferredTools,
    allowedTools,
    continuationMode,
    retrievalSources,
    artifactIntent,
    confidence,
    reasonCodes,
  };
}
