import type { AgentTaskContext } from "@/lib/agent/task-context";
import {
  mergeAgentTaskStateWithContext,
  type AgentTaskKind,
  type AgentTaskState,
  type AgentToolName,
} from "@/lib/agent/task-state";
import type { ParsedIntent } from "@/lib/chat/intent";
import {
  looksLikeQuestionBankRetrievalRequest,
  normalizeIntentSurfaceText,
} from "@/lib/chat/intent";

type ResolveEffectiveAgentTaskStateParams = {
  promptTaskState: AgentTaskState;
  contextualTaskState: AgentTaskState;
  taskContext?: AgentTaskContext | null;
  parsedIntent: ParsedIntent;
  visiblePrompt: string;
};

const ANSWER_KEY_PATTERN =
  /(answer\s*key|worked\s+solutions?|solutions?|答案解析|答案与解析|详细解析|配答案|给答案|生成答案)/i;
const EXPLICIT_EXIT_TICKET_PATTERN =
  /(exit\s*ticket|课末检测|课堂检测|下课前检测|离堂检测)/i;
const QUICK_CHECK_PATTERN = /(quick\s*check)/i;
const WORKSHEET_REQUEST_PATTERN =
  /(worksheet|guided\s*notes|handout|activity\s*sheet|study\s*guide|学习单|讲义|活动单|阅读单|课堂讲义)/i;
const ADAPT_DIFFICULTY_PATTERN =
  /(降一档|简化(?:一点|一些)?|更简单|更容易|提高一档|更难|challenge|honors|拔高|挑战版|支架|scaffold|加几道challenge)/i;
const PREVIOUS_ARTIFACT_REFERENCE_PATTERN =
  /(刚才|上一版|上一个|刚刚|基于刚才|按刚才|那份|这份|原来的|把它|已经生成|已生成)/i;

function hasPromptPinnedIntent(
  taskState: AgentTaskState,
  parsedIntent: ParsedIntent,
  preferredTools: AgentToolName[],
) {
  return (
    preferredTools.length > 0 ||
    parsedIntent.actions.length > 0 ||
    taskState.kind !== "general"
  );
}

function matchesForcedTool(
  taskContext: AgentTaskContext,
  forcedToolChoice: AgentToolName,
) {
  switch (forcedToolChoice) {
    case "generate_rubric":
      return taskContext.kind === "rubric" || taskContext.action === "generate_rubric";
    case "generate_worksheet":
      return (
        taskContext.action === "create_worksheet" ||
        taskContext.action === "export_worksheet_pdf"
      );
    case "assemble_worksheet":
      return (
        taskContext.action === "retrieve_question_bank" ||
        taskContext.attachmentMode === "scan_pool_worksheet"
      );
    case "generate_ap_exercises_pipeline":
      return (
        taskContext.action === "generate_exercises" ||
        taskContext.action === "export_exam_pdf" ||
        taskContext.action === "save_exercises"
      );
    case "generate_lesson_plan_workflow":
      return (
        taskContext.kind === "lesson_plan" ||
        taskContext.action === "generate_lesson_plan" ||
        taskContext.action === "lesson_plan" ||
        taskContext.action === "scan_lesson"
      );
    case "generate_pbl_project":
      return taskContext.kind === "pbl" || taskContext.action === "generate_pbl";
    case "generate_answer_key":
      return (
        taskContext.action === "save_exercises" ||
        taskContext.action === "export_exam_pdf" ||
        taskContext.action === "create_worksheet"
      );
    case "generate_exit_ticket":
      return taskContext.action === "create_worksheet";
    case "adapt_difficulty":
      return (
        taskContext.action === "create_worksheet" ||
        taskContext.action === "generate_rubric" ||
        taskContext.action === "generate_exercises" ||
        taskContext.action === "export_exam_pdf" ||
        taskContext.action === "save_exercises"
      );
    default:
      return false;
  }
}

function dedupePreferredTools(tools: AgentToolName[]) {
  return Array.from(new Set(tools));
}

function resolvePreferredAgentTools(_params: {
  parsedIntent: ParsedIntent;
  visiblePrompt: string;
  forcedToolChoice: AgentToolName | null;
}) {
  const normalizedPrompt = normalizeIntentSurfaceText(_params.visiblePrompt);
  if (_params.forcedToolChoice) {
    const preferredTools: AgentToolName[] = [_params.forcedToolChoice];
    if (
      _params.forcedToolChoice === "generate_worksheet" &&
      ANSWER_KEY_PATTERN.test(normalizedPrompt)
    ) {
      preferredTools.push("generate_answer_key");
    }
    return dedupePreferredTools(preferredTools);
  }

  if (looksLikeQuestionBankRetrievalRequest(normalizedPrompt)) {
    return dedupePreferredTools([
      /组卷|试卷|抽题|assemble|worksheet|exam/i.test(normalizedPrompt)
        ? "assemble_worksheet"
        : "search_question_bank",
    ]);
  }

  if (WORKSHEET_REQUEST_PATTERN.test(normalizedPrompt)) {
    return dedupePreferredTools([
      "generate_worksheet",
      ...(ANSWER_KEY_PATTERN.test(normalizedPrompt) ? ["generate_answer_key" as const] : []),
    ]);
  }

  return [] as AgentToolName[];
}

export function resolveForcedAgentToolChoice(_params: {
  parsedIntent: ParsedIntent;
  visiblePrompt: string;
  taskKind: AgentTaskKind;
}) {
  const normalizedPrompt = normalizeIntentSurfaceText(_params.visiblePrompt);
  const hasWorksheetRequest = WORKSHEET_REQUEST_PATTERN.test(normalizedPrompt);
  if (
    ANSWER_KEY_PATTERN.test(normalizedPrompt) &&
    !hasWorksheetRequest
  ) {
    return "generate_answer_key";
  }
  if (
    ADAPT_DIFFICULTY_PATTERN.test(normalizedPrompt) &&
    PREVIOUS_ARTIFACT_REFERENCE_PATTERN.test(normalizedPrompt)
  ) {
    return "adapt_difficulty";
  }
  if (
    EXPLICIT_EXIT_TICKET_PATTERN.test(normalizedPrompt) ||
    (QUICK_CHECK_PATTERN.test(normalizedPrompt) && !hasWorksheetRequest)
  ) {
    return "generate_exit_ticket";
  }
  if (hasWorksheetRequest) {
    return looksLikeQuestionBankRetrievalRequest(normalizedPrompt)
      ? "assemble_worksheet"
      : "generate_worksheet";
  }
  if (_params.taskKind === "rubric") return "generate_rubric";
  if (_params.taskKind === "lesson_plan") return "generate_lesson_plan_workflow";
  if (_params.taskKind === "pbl") return "generate_pbl_project";
  return null;
}

export function resolveEffectiveAgentTaskState(
  params: ResolveEffectiveAgentTaskStateParams,
) {
  const {
    promptTaskState,
    contextualTaskState,
    taskContext,
    parsedIntent,
    visiblePrompt,
  } = params;
  const normalizedPrompt = normalizeIntentSurfaceText(visiblePrompt);
  const baseForcedToolChoice = resolveForcedAgentToolChoice({
    parsedIntent,
    visiblePrompt: normalizedPrompt,
    taskKind: promptTaskState.kind,
  });
  const preferredTools = resolvePreferredAgentTools({
    parsedIntent,
    visiblePrompt: normalizedPrompt,
    forcedToolChoice: baseForcedToolChoice,
  });
  const forcedToolChoice =
    baseForcedToolChoice ??
    (preferredTools.length === 1 ? preferredTools[0] : null);

  if (!taskContext) {
    return {
      taskState: promptTaskState,
      taskContext: undefined,
      forcedToolChoice,
      preferredTools,
    };
  }

  const promptPinned = hasPromptPinnedIntent(
    promptTaskState,
    parsedIntent,
    preferredTools,
  );
  if (!promptPinned) {
    if (taskContext.mode !== "continuation") {
      return {
        taskState: promptTaskState,
        taskContext: undefined,
        forcedToolChoice,
        preferredTools,
      };
    }

    return {
      taskState: contextualTaskState,
      taskContext,
      forcedToolChoice,
      preferredTools,
    };
  }

  const compatibleTaskContext = forcedToolChoice
    ? matchesForcedTool(taskContext, forcedToolChoice)
    : taskContext.kind === promptTaskState.kind;

  if (!compatibleTaskContext) {
    return {
      taskState: promptTaskState,
      taskContext: undefined,
      forcedToolChoice,
      preferredTools,
    };
  }

  return {
    taskState: mergeAgentTaskStateWithContext(promptTaskState, taskContext),
    taskContext,
    forcedToolChoice,
    preferredTools,
  };
}
