import type { AgentTaskKind } from "@/lib/agent/task-state";
import {
  looksLikeQuestionBankRetrievalRequest,
  normalizeIntentSurfaceText,
  type WorkflowAction,
} from "@/lib/chat/intent";

const DIRECT_WORKFLOW_ACTIONS = new Set<WorkflowAction>([
  "generate_rubric",
  "generate_exercises",
  "generate_lesson_plan",
  "generate_pbl",
  "save_exercises",
  "create_worksheet",
  "export_exam_pdf",
  "export_worksheet_pdf",
  "export_rubric_pdf",
  "organize_content",
]);

const BLOCKING_TASK_CONTEXT_ACTIONS = new Set([
  "generate_exercises",
  "generate_lesson_plan",
  "generate_rubric",
  "generate_pbl",
  "create_worksheet",
  "export_exam_pdf",
  "export_worksheet_pdf",
  "export_rubric_pdf",
  "organize_content",
]);

const EXTERNAL_SEARCH_HINT_PATTERN =
  /(最新|最近|近期|趋势|时事|案例|来源|出处|搜索|联网|查找|对比|文献|\breferences?\b|\bsources?\b|news|latest|search|current\s+events?)/i;

export type AgentRequestMode =
  | "chat_answer"
  | "document_artifact"
  | "retrieval_only"
  | "retrieval_then_document";

function hasBlockingWorkflowAction(
  actions: WorkflowAction[],
  taskContextAction?: string | null,
) {
  const normalized = taskContextAction?.trim();
  if (normalized && BLOCKING_TASK_CONTEXT_ACTIONS.has(normalized)) {
    return true;
  }
  return actions.some((action) => DIRECT_WORKFLOW_ACTIONS.has(action));
}

export function resolveAgentRequestMode(params: {
  taskKind: AgentTaskKind;
  actions: WorkflowAction[];
  taskContextAction?: string | null;
  visiblePrompt?: string;
}) : AgentRequestMode {
  const normalizedPrompt = normalizeIntentSurfaceText(params.visiblePrompt ?? "");

  if (hasBlockingWorkflowAction(params.actions, params.taskContextAction)) {
    if (EXTERNAL_SEARCH_HINT_PATTERN.test(normalizedPrompt)) {
      return "retrieval_then_document";
    }
    return "document_artifact";
  }

  if (looksLikeQuestionBankRetrievalRequest(normalizedPrompt)) {
    return "retrieval_only";
  }

  if (
    params.taskKind === "research" &&
    EXTERNAL_SEARCH_HINT_PATTERN.test(normalizedPrompt)
  ) {
    return "retrieval_only";
  }

  return "chat_answer";
}

export function shouldUseLightweightChatAnswerMode(params: {
  taskKind: AgentTaskKind;
  actions: WorkflowAction[];
  taskContextAction?: string | null;
  visiblePrompt?: string;
}) {
  return (
    resolveAgentRequestMode({
      taskKind: params.taskKind,
      actions: params.actions,
      taskContextAction: params.taskContextAction,
      visiblePrompt: params.visiblePrompt,
    }) === "chat_answer"
  );
}

export function shouldUseSelectedReferenceQaFastPath(params: {
  hasSelectedReferenceMaterials: boolean;
  hasInlineUploads: boolean;
  taskKind: AgentTaskKind;
  actions: WorkflowAction[];
  taskContextAction?: string | null;
  visiblePrompt?: string;
}) {
  if (!params.hasSelectedReferenceMaterials) {
    return false;
  }

  if (params.hasInlineUploads) {
    return false;
  }

  if (hasBlockingWorkflowAction(params.actions, params.taskContextAction)) {
    return false;
  }

  if (params.taskKind === "summary" || params.taskKind === "general") {
    return true;
  }

  if (params.taskKind === "research") {
    return !EXTERNAL_SEARCH_HINT_PATTERN.test(
      normalizeIntentSurfaceText(params.visiblePrompt ?? ""),
    );
  }

  return false;
}
