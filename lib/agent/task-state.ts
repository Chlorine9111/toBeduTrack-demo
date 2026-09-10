import {
  looksLikeQuestionBankRetrievalRequest,
  normalizeIntentSurfaceText,
  parseIntentFromText,
  type ParsedIntent,
  type WorkflowAction,
} from "@/lib/chat/intent";
import type { AgentTaskContext } from "@/lib/agent/task-context";
import {
  detectContextContinuation,
  detectContextReset,
} from "@/lib/context-engineering/core";
import { resolveDefaultAllowedToolsForTaskKind } from "@/lib/agent/workflow-registry";

export type AgentToolName =
  | "adapt_difficulty"
  | "generate_answer_key"
  | "generate_ap_exercises_pipeline"
  | "generate_exit_ticket"
  | "generate_lesson_plan_workflow"
  | "generate_pbl_project"
  | "generate_rubric"
  | "generate_worksheet"
  | "assemble_worksheet"
  | "search_question_bank"
  | "web_search"
  | "read_webpage";

export type AgentTaskKind =
  | "lesson_plan"
  | "exercise"
  | "rubric"
  | "pbl"
  | "research"
  | "summary"
  | "organize"
  | "general";

export type AgentTaskState = {
  kind: AgentTaskKind;
  primaryAction: WorkflowAction | "unknown";
  parsedIntent: ParsedIntent;
  resetApplied: boolean;
  continuationLikely: boolean;
  hasUploadedMaterials: boolean;
  shouldPreferAttachments: boolean;
  shouldPreferKnowledge: boolean;
  shouldPreferWeb: boolean;
  allowedTools: AgentToolName[];
  sourcePriority: string[];
  summary: string;
};

const SEARCH_PATTERN =
  /(最新|最近|趋势|出处|来源|检索|搜索|联网|查找|对比|资料来源|引用|\breferences?\b|\bsources?\b|news|latest|search)/i;
const LESSON_WEB_SEARCH_PATTERN =
  /(最新|最近|近期|案例|真实案例|时事|新闻|来源|引用|文献|\breferences?\b|\bsources?\b|latest|recent|case\s*study|current\s+events?)/i;
const SUMMARY_PATTERN =
  /(总结|摘要|提炼|梳理|概述|归纳|整理成要点|整理重点|总结成|summary|summari[sz]e|outline|takeaways?|tl;dr)/i;
const EXERCISE_PATTERN =
  /(习题|题目|题单|练习题|worksheet|guided\s*notes?|学习单|讲义|handout|activity\s*sheet|活动单|课堂活动单|mcq|frq|multiple\s*choice|free\s*response|exercise|practice\s+questions?)/i;
const LESSON_PATTERN =
  /(教案|教学设计|教学计划|lesson\s*plan|mini\s*lesson|micro\s*lesson|备课|课堂设计|课堂流程|课时安排|上课|微课)/i;
const RUBRIC_PATTERN = /(rubric|评分标准|评分量表|评分细则|评分规则)/i;
const PBL_PATTERN = /(pbl|项目式学习|项目制学习|project\s*-?\s*based\s*learning)/i;
function uniqueTools(items: AgentToolName[]) {
  return Array.from(new Set(items));
}

function isWorkflowAction(value: string): value is WorkflowAction {
  return [
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
  ].includes(value);
}

function resolveTaskKind(params: {
  parsedIntent: ParsedIntent;
  message: string;
  lastArtifactType?: string | null;
  continuationLikely: boolean;
}): AgentTaskKind {
  const message = params.message.trim();
  const actions = params.parsedIntent.actions;

  if (
    actions.includes("generate_exercises") ||
    actions.includes("create_worksheet") ||
    actions.includes("export_exam_pdf") ||
    actions.includes("export_worksheet_pdf")
  ) {
    return "exercise";
  }
  if (actions.includes("generate_lesson_plan")) return "lesson_plan";
  if (
    actions.includes("generate_rubric") ||
    actions.includes("export_rubric_pdf")
  ) {
    return "rubric";
  }
  if (actions.includes("generate_pbl")) return "pbl";
  if (actions.includes("organize_content")) return "organize";

  if (looksLikeQuestionBankRetrievalRequest(message)) return "exercise";
  if (PBL_PATTERN.test(message)) return "pbl";
  if (EXERCISE_PATTERN.test(message)) return "exercise";
  if (LESSON_PATTERN.test(message)) return "lesson_plan";
  if (RUBRIC_PATTERN.test(message)) return "rubric";
  if (SUMMARY_PATTERN.test(message)) return "summary";
  if (SEARCH_PATTERN.test(message)) return "research";

  if (params.continuationLikely) {
    if (params.lastArtifactType === "lesson_plan") return "lesson_plan";
    if (params.lastArtifactType === "exercises") return "exercise";
    if (params.lastArtifactType === "exam") return "exercise";
    if (params.lastArtifactType === "worksheet") return "exercise";
    if (params.lastArtifactType === "rubric") return "rubric";
    if (params.lastArtifactType === "pbl") return "pbl";
  }

  return "general";
}

function buildAllowedTools(params: {
  kind: AgentTaskKind;
  shouldPreferWeb: boolean;
  shouldPreferQuestionBank: boolean;
}) {
  return uniqueTools(resolveDefaultAllowedToolsForTaskKind(params));
}

function buildTaskStateSummary(params: {
  kind: AgentTaskKind;
  resetApplied: boolean;
  continuationLikely: boolean;
  sourcePriority: string[];
  allowedTools: AgentToolName[];
  preferQuestionBank?: boolean;
  normalizedRequest?: string;
}) {
  return [
    `任务类型：${
      params.kind === "lesson_plan"
        ? "教案"
        : params.kind === "exercise"
          ? "习题"
          : params.kind === "rubric"
            ? "Rubric"
            : params.kind === "pbl"
              ? "PBL 项目"
              : params.kind === "research"
                ? "检索研究"
                : params.kind === "summary"
                  ? "摘要整理"
                  : params.kind === "organize"
                      ? "内容库整理"
                      : "通用对话"
    }`,
    params.resetApplied ? "上下文模式：新任务，优先忽略旧上下文" : "",
    params.continuationLikely ? "上下文模式：延续上一轮任务" : "",
    `优先来源：${params.sourcePriority.join(" > ")}`,
    params.normalizedRequest ? `标准化请求：${params.normalizedRequest}` : "",
    params.preferQuestionBank ? "执行策略：优先从题库调取现成题" : "",
    params.allowedTools.length > 0 ? `允许工具：${params.allowedTools.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("；");
}

export function buildAgentTaskState(params: {
  visiblePrompt: string;
  latestPrompt: string;
  lastArtifactType?: string | null;
  hasUploadedMaterials: boolean;
}) {
  const prompt = normalizeIntentSurfaceText(
    (params.visiblePrompt || params.latestPrompt).trim(),
  );
  const parsedIntent = parseIntentFromText(prompt);
  const resetApplied = detectContextReset(prompt);
  const continuationLikely = !resetApplied && detectContextContinuation(prompt);
  const kind = resolveTaskKind({
    parsedIntent,
    message: prompt,
    lastArtifactType: params.lastArtifactType ?? "",
    continuationLikely,
  });

  const shouldPreferAttachments = params.hasUploadedMaterials;
  const shouldPreferKnowledge = false;
  const shouldPreferQuestionBank =
    kind === "exercise" && looksLikeQuestionBankRetrievalRequest(prompt);
  const shouldPreferWeb =
    !resetApplied &&
    (kind === "research" ||
      (kind === "lesson_plan" && LESSON_WEB_SEARCH_PATTERN.test(prompt)) ||
      SEARCH_PATTERN.test(prompt));
  const allowedTools = buildAllowedTools({
    kind,
    shouldPreferWeb,
    shouldPreferQuestionBank,
  });

  const sourcePriority = [
    "当前教师输入",
    shouldPreferAttachments ? "当前上传材料" : "",
    resetApplied ? "" : "当前对话上下文",
    shouldPreferWeb ? "联网结果" : "",
  ].filter(Boolean);

  const primaryAction = parsedIntent.actions[0] ?? "unknown";
  const summary = buildTaskStateSummary({
    kind,
    resetApplied,
    continuationLikely,
    sourcePriority,
    allowedTools,
    preferQuestionBank: shouldPreferQuestionBank,
    normalizedRequest: prompt,
  });

  return {
    kind,
    primaryAction,
    parsedIntent,
    resetApplied,
    continuationLikely,
    hasUploadedMaterials: params.hasUploadedMaterials,
    shouldPreferAttachments,
    shouldPreferKnowledge,
    shouldPreferWeb,
    allowedTools,
    sourcePriority,
    summary,
  } satisfies AgentTaskState;
}

export function mergeAgentTaskStateWithContext(
  base: AgentTaskState,
  taskContext?: AgentTaskContext,
) {
  if (!taskContext) return base;

  const kind = taskContext.kind;
  const resetApplied = taskContext.mode === "reset";
  const continuationLikely = taskContext.mode === "continuation";
  const shouldPreferAttachments = base.shouldPreferAttachments;
  const shouldPreferKnowledge = false;
  const shouldPreferQuestionBank =
    taskContext.action === "retrieve_question_bank" ||
    (kind === "exercise" &&
      looksLikeQuestionBankRetrievalRequest(taskContext.normalizedRequest));
  const shouldPreferWeb =
    taskContext.mode !== "reset" &&
    (kind === "research" ||
      (kind === "lesson_plan" &&
        (SEARCH_PATTERN.test(taskContext.normalizedRequest) ||
          LESSON_WEB_SEARCH_PATTERN.test(taskContext.normalizedRequest))));
  const allowedTools = buildAllowedTools({
    kind,
    shouldPreferWeb,
    shouldPreferQuestionBank,
  });
  const sourcePriority =
    taskContext.sourcePriority.length > 0
      ? taskContext.sourcePriority
      : base.sourcePriority;
  const primaryAction = isWorkflowAction(taskContext.action)
    ? taskContext.action
    : base.primaryAction;

  return {
    ...base,
    kind,
    primaryAction,
    resetApplied,
    continuationLikely,
    shouldPreferAttachments,
    shouldPreferKnowledge,
    shouldPreferWeb,
    allowedTools,
    sourcePriority,
    summary: buildTaskStateSummary({
      kind,
      resetApplied,
      continuationLikely,
      sourcePriority,
      allowedTools,
      preferQuestionBank: shouldPreferQuestionBank,
      normalizedRequest: taskContext.normalizedRequest,
    }),
  } satisfies AgentTaskState;
}
