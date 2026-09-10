import { z } from "zod";
import { generateStructuredObject } from "@/lib/ai/structured-output";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import type { AgentTaskContext } from "@/lib/agent/task-context";
import type { AgentTaskKind, AgentTaskState, AgentToolName } from "@/lib/agent/task-state";
import type { ParsedIntent } from "@/lib/chat/intent";
import {
  looksLikeQuestionBankRetrievalRequest,
  normalizeIntentSurfaceText,
} from "@/lib/chat/intent";

const EXTERNAL_SEARCH_HINT_PATTERN =
  /(最新|最近|近期|趋势|时事|案例|来源|出处|搜索|搜寻|联网|网络相关|网页|网路|查找|对比|文献|\breferences?\b|\bsources?\b|news|latest|search|current\s+events?)/i;
const WORKSHEET_HINT_PATTERN =
  /(worksheet|guided\s*notes?|handout|activity\s*sheet|study\s*guide|学习单|讲义|活动单|阅读单|课堂讲义)/i;
const ANSWER_KEY_HINT_PATTERN =
  /(answer\s*key|worked\s+solutions?|solutions?|答案解析|答案与解析|详细解析|配答案|给答案|生成答案)/i;
const EXIT_TICKET_HINT_PATTERN =
  /(exit\s*ticket|quick\s*check|课末检测|课堂检测|下课前检测|离堂检测)/i;
const ADAPT_DIFFICULTY_HINT_PATTERN =
  /(降一档|简化(?:一点|一些)?|更简单|更容易|提高一档|更难|challenge|honors|拔高|挑战版|支架|scaffold|加几道challenge)/i;
const PREVIOUS_ARTIFACT_REFERENCE_PATTERN =
  /(刚才|上一版|上一个|刚刚|基于刚才|按刚才|那份|这份|原来的|把它|已经生成|已生成)/i;
const DOCUMENT_REQUEST_PATTERN =
  /(worksheet|guided\s*notes?|handout|activity\s*sheet|study\s*guide|学习单|讲义|活动单|阅读单|课堂讲义|rubric|评分标准|评分量表|lesson\s*plan|教案|教学设计|教学计划|exam|试卷|测试卷|练习卷|exit\s*ticket|quick\s*check|answer\s*key|答案解析|解析|difficulty|challenge|scaffold|更简单|更难)/i;

const executionPlannerSchema = z.object({
  taskType: z.enum([
    "chat_answer",
    "worksheet",
    "rubric",
    "lesson_plan",
    "exam",
    "exit_ticket",
    "answer_key",
    "adapt_difficulty",
    "pbl",
    "retrieval",
  ]),
  secondaryTask: z.enum(["none", "answer_key"]).default("none"),
  requiresSearch: z.boolean().default(false),
  useQuestionBank: z.boolean().default(false),
  requiresRecentArtifact: z.boolean().default(false),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
  uiLabel: z.string().trim().min(1).max(120),
});

export type AgentExecutionMode =
  | "chat_answer"
  | "document_artifact"
  | "retrieval_only"
  | "retrieval_then_document";

export type AgentExecutionTaskType = z.infer<typeof executionPlannerSchema>["taskType"];
export type AgentExecutionConfidence = "forced" | z.infer<
  typeof executionPlannerSchema
>["confidence"];

export type AgentExecutionPlan = {
  taskType: AgentExecutionTaskType;
  mode: AgentExecutionMode;
  confidence: AgentExecutionConfidence;
  forcedToolChoice: AgentToolName | null;
  preferredTools: AgentToolName[];
  artifactPolicy: AgentTurnArtifactPolicy;
  requiresSearch: boolean;
  requiresRecentArtifact: boolean;
  useQuestionBank: boolean;
  useSelectedReferenceQaFastPath: boolean;
  uiLabel: string;
};

export type AgentTurnArtifactPolicy = {
  maxPrimaryArtifacts: number;
  allowAuxiliaryArtifacts: boolean;
  explicitMultiArtifact: boolean;
};

export const DOCUMENT_SEQUENCE_TOOL_NAMES = new Set<AgentToolName>([
  "adapt_difficulty",
  "generate_answer_key",
  "generate_ap_exercises_pipeline",
  "generate_exit_ticket",
  "generate_lesson_plan_workflow",
  "generate_pbl_project",
  "generate_rubric",
  "generate_worksheet",
  "assemble_worksheet",
]);

const RETRIEVAL_PRIMER_TOOL_NAMES = new Set<AgentToolName>([
  "web_search",
  "search_question_bank",
]);

export type AgentToolLoopPlan = {
  forcedToolSequence: AgentToolName[] | null;
  stepLimit: number;
};

export function buildAgentToolLoopPlan(params: {
  requestMode: AgentExecutionMode;
  preferredTools: AgentToolName[];
}) : AgentToolLoopPlan {
  const forcedToolSequence =
    params.requestMode === "retrieval_then_document" &&
    params.preferredTools.some((tool) => RETRIEVAL_PRIMER_TOOL_NAMES.has(tool)) &&
    params.preferredTools.some((tool) => DOCUMENT_SEQUENCE_TOOL_NAMES.has(tool))
      ? params.preferredTools
      : null;

  return {
    forcedToolSequence,
    stepLimit: forcedToolSequence
      ? Math.max(4, params.preferredTools.length + 1)
      : Math.max(2, params.preferredTools.length + 1),
  };
}

export function buildExecutionPlanWorkingNote(plan: AgentExecutionPlan) {
  switch (plan.mode) {
    case "retrieval_then_document":
      return {
        title: plan.uiLabel,
        markdown:
          "当前请求会先做联网/资料检索，再进入唯一合适的文档工具。检索结果只用于支撑后续文档生成，不会把整篇正文留在左侧聊天区。",
      };
    case "document_artifact":
      return {
        title: plan.uiLabel,
        markdown:
          "当前请求会直接进入文档型工具，左侧只保留简短摘要，完整正文会在右侧 Canvas 持续补全。",
      };
    case "retrieval_only":
      return {
        title: plan.uiLabel,
        markdown: "当前请求以检索与整合结果为主，不会误触发文档生成工具。",
      };
    case "chat_answer":
    default:
      return {
        title: plan.uiLabel,
        markdown: "当前请求会优先整理资料与会话上下文，并直接在左侧开始回答。",
      };
  }
}

type AgentExecutionPlannerInput = {
  visiblePrompt: string;
  promptTaskState: AgentTaskState;
  parsedIntent: ParsedIntent;
  taskContext?: AgentTaskContext | null;
  forcedToolChoice: AgentToolName | null;
  preferredTools: AgentToolName[];
  hasSelectedReferenceMaterials: boolean;
  hasInlineUploads: boolean;
};

function dedupeTools(tools: AgentToolName[]) {
  return Array.from(new Set(tools));
}

function resolveTaskTypeForcedTool(taskType: AgentExecutionTaskType) {
  switch (taskType) {
    case "worksheet":
      return "generate_worksheet" as const;
    case "rubric":
      return "generate_rubric" as const;
    case "lesson_plan":
      return "generate_lesson_plan_workflow" as const;
    case "exam":
      return "generate_ap_exercises_pipeline" as const;
    case "exit_ticket":
      return "generate_exit_ticket" as const;
    case "answer_key":
      return "generate_answer_key" as const;
    case "adapt_difficulty":
      return "adapt_difficulty" as const;
    case "pbl":
      return "generate_pbl_project" as const;
    default:
      return null;
  }
}

function resolveUiLabel(plan: {
  mode: AgentExecutionMode;
  taskType: AgentExecutionTaskType;
}) {
  if (plan.mode === "retrieval_then_document") {
    switch (plan.taskType) {
      case "worksheet":
        return "先检索相关资料，再生成 Worksheet";
      case "rubric":
        return "先检索相关资料，再生成 Rubric";
      case "lesson_plan":
        return "先检索相关资料，再生成教案";
      case "exam":
        return "先检索相关资料，再生成试题";
      default:
        return "先检索相关资料，再生成文档";
    }
  }

  switch (plan.taskType) {
    case "worksheet":
      return "正在直接生成 Worksheet";
    case "rubric":
      return "正在直接生成 Rubric";
    case "lesson_plan":
      return "正在直接生成教案";
    case "exam":
      return "正在直接生成试题";
    case "exit_ticket":
      return "正在直接生成 Exit Ticket";
    case "answer_key":
      return "正在生成答案与解析";
    case "adapt_difficulty":
      return "正在生成难度变体";
    case "retrieval":
      return "正在检索相关内容";
    case "chat_answer":
      return "正在整理资料并直接回答";
    case "pbl":
      return "正在直接生成 PBL 方案";
    default:
      return "正在理解请求并规划执行路径";
  }
}

function toExecutionPlan(params: {
  taskType: AgentExecutionTaskType;
  requiresSearch: boolean;
  useQuestionBank: boolean;
  requiresRecentArtifact: boolean;
  confidence: AgentExecutionConfidence;
  hasSelectedReferenceMaterials: boolean;
  hasInlineUploads: boolean;
  uiLabel?: string;
  secondaryTask?: "none" | "answer_key";
}) : AgentExecutionPlan {
  const documentTool = resolveTaskTypeForcedTool(params.taskType);
  const preferredTools: AgentToolName[] = [];

  if (params.requiresSearch) {
    preferredTools.push("web_search", "read_webpage");
  }

  if (params.useQuestionBank) {
    preferredTools.push("search_question_bank", "assemble_worksheet");
  } else if (documentTool) {
    preferredTools.push(documentTool);
  } else if (params.taskType === "retrieval") {
    preferredTools.push(params.requiresSearch ? "web_search" : "search_question_bank");
    if (params.requiresSearch) {
      preferredTools.push("read_webpage");
    }
  }

  if (
    params.secondaryTask === "answer_key" &&
    params.taskType !== "answer_key" &&
    params.taskType !== "adapt_difficulty"
  ) {
    preferredTools.push("generate_answer_key");
  }

  const dedupedPreferredTools = dedupeTools(preferredTools);
  const primaryToolCount = dedupedPreferredTools.filter((tool) =>
    DOCUMENT_SEQUENCE_TOOL_NAMES.has(tool),
  ).length;
  const forcedToolChoice: AgentToolName | null =
    primaryToolCount === 1 &&
    !params.requiresSearch &&
    !params.useQuestionBank &&
    params.secondaryTask !== "answer_key"
      ? (documentTool ?? null)
      : null;
  const artifactPolicy: AgentTurnArtifactPolicy = {
    maxPrimaryArtifacts: 1,
    allowAuxiliaryArtifacts: params.secondaryTask === "answer_key",
    explicitMultiArtifact: params.secondaryTask === "answer_key",
  };

  let mode: AgentExecutionMode = "chat_answer";
  if (params.taskType === "retrieval") {
    mode = "retrieval_only";
  } else if (params.taskType !== "chat_answer") {
    mode = params.requiresSearch ? "retrieval_then_document" : "document_artifact";
  } else if (params.requiresSearch) {
    mode = "retrieval_only";
  }

  const useSelectedReferenceQaFastPath =
    params.taskType === "chat_answer" &&
    !params.requiresSearch &&
    !params.hasInlineUploads &&
    params.hasSelectedReferenceMaterials;

  return {
    taskType: params.taskType,
    mode,
    confidence: params.confidence,
    forcedToolChoice,
    preferredTools: dedupedPreferredTools,
    artifactPolicy,
    requiresSearch: params.requiresSearch,
    requiresRecentArtifact: params.requiresRecentArtifact,
    useQuestionBank: params.useQuestionBank,
    useSelectedReferenceQaFastPath,
    uiLabel:
      params.uiLabel?.trim() ||
      resolveUiLabel({
        mode,
        taskType: params.taskType,
      }),
  };
}

export function buildFallbackAgentExecutionPlan(
  params: AgentExecutionPlannerInput,
): AgentExecutionPlan {
  const normalizedPrompt = normalizeIntentSurfaceText(params.visiblePrompt);
  const hasSearch = EXTERNAL_SEARCH_HINT_PATTERN.test(normalizedPrompt);
  const useQuestionBank = looksLikeQuestionBankRetrievalRequest(normalizedPrompt);
  const hasWorksheet = WORKSHEET_HINT_PATTERN.test(normalizedPrompt);
  const hasExitTicket = EXIT_TICKET_HINT_PATTERN.test(normalizedPrompt);
  const hasAnswerKey = ANSWER_KEY_HINT_PATTERN.test(normalizedPrompt);
  const hasAdaptDifficulty =
    ADAPT_DIFFICULTY_HINT_PATTERN.test(normalizedPrompt) &&
    PREVIOUS_ARTIFACT_REFERENCE_PATTERN.test(normalizedPrompt);

  if (hasAdaptDifficulty) {
    return toExecutionPlan({
      taskType: "adapt_difficulty",
      requiresSearch: false,
      useQuestionBank: false,
      requiresRecentArtifact: true,
      confidence: "forced",
      hasSelectedReferenceMaterials: params.hasSelectedReferenceMaterials,
      hasInlineUploads: params.hasInlineUploads,
      secondaryTask: hasAnswerKey ? "answer_key" : "none",
    });
  }

  if (hasExitTicket) {
    return toExecutionPlan({
      taskType: "exit_ticket",
      requiresSearch: false,
      useQuestionBank: false,
      requiresRecentArtifact: false,
      confidence: "forced",
      hasSelectedReferenceMaterials: params.hasSelectedReferenceMaterials,
      hasInlineUploads: params.hasInlineUploads,
      secondaryTask: hasAnswerKey ? "answer_key" : "none",
    });
  }

  if (hasAnswerKey && !hasWorksheet && !params.forcedToolChoice) {
    return toExecutionPlan({
      taskType: "answer_key",
      requiresSearch: false,
      useQuestionBank: false,
      requiresRecentArtifact: PREVIOUS_ARTIFACT_REFERENCE_PATTERN.test(normalizedPrompt),
      confidence: "forced",
      hasSelectedReferenceMaterials: params.hasSelectedReferenceMaterials,
      hasInlineUploads: params.hasInlineUploads,
    });
  }

  if (useQuestionBank) {
    return toExecutionPlan({
      taskType: "worksheet",
      requiresSearch: false,
      useQuestionBank: true,
      requiresRecentArtifact: false,
      confidence: "forced",
      hasSelectedReferenceMaterials: params.hasSelectedReferenceMaterials,
      hasInlineUploads: params.hasInlineUploads,
      secondaryTask: hasAnswerKey ? "answer_key" : "none",
    });
  }

  const forcedTaskType = (() => {
    switch (params.forcedToolChoice) {
      case "generate_worksheet":
        return "worksheet" as const;
      case "generate_rubric":
        return "rubric" as const;
      case "generate_lesson_plan_workflow":
        return "lesson_plan" as const;
      case "generate_ap_exercises_pipeline":
      case "assemble_worksheet":
        return "exam" as const;
      case "generate_exit_ticket":
        return "exit_ticket" as const;
      case "generate_answer_key":
        return "answer_key" as const;
      case "adapt_difficulty":
        return "adapt_difficulty" as const;
      case "generate_pbl_project":
        return "pbl" as const;
      default:
        return null;
    }
  })();

  if (forcedTaskType) {
    return toExecutionPlan({
      taskType: forcedTaskType,
      requiresSearch: hasSearch && forcedTaskType !== "answer_key" && forcedTaskType !== "adapt_difficulty",
      useQuestionBank: false,
      requiresRecentArtifact:
        forcedTaskType === "answer_key" || forcedTaskType === "adapt_difficulty",
      confidence: "forced",
      hasSelectedReferenceMaterials: params.hasSelectedReferenceMaterials,
      hasInlineUploads: params.hasInlineUploads,
      secondaryTask:
        hasAnswerKey &&
        forcedTaskType !== "answer_key" &&
        forcedTaskType !== "adapt_difficulty"
          ? "answer_key"
          : "none",
    });
  }

  if (params.promptTaskState.kind === "research" && hasSearch) {
    return toExecutionPlan({
      taskType: "retrieval",
      requiresSearch: true,
      useQuestionBank: false,
      requiresRecentArtifact: false,
      confidence: "high",
      hasSelectedReferenceMaterials: params.hasSelectedReferenceMaterials,
      hasInlineUploads: params.hasInlineUploads,
    });
  }

  return toExecutionPlan({
    taskType: "chat_answer",
    requiresSearch: false,
    useQuestionBank: false,
    requiresRecentArtifact: false,
    confidence: "medium",
    hasSelectedReferenceMaterials: params.hasSelectedReferenceMaterials,
    hasInlineUploads: params.hasInlineUploads,
  });
}

function shouldUseExecutionPlanner(params: AgentExecutionPlannerInput) {
  const normalizedPrompt = normalizeIntentSurfaceText(params.visiblePrompt);
  return (
    DOCUMENT_REQUEST_PATTERN.test(normalizedPrompt) ||
    EXTERNAL_SEARCH_HINT_PATTERN.test(normalizedPrompt) ||
    params.preferredTools.length > 1 ||
    params.promptTaskState.kind === "general"
  );
}

function buildPlannerPrompt(params: AgentExecutionPlannerInput) {
  const normalizedPrompt = normalizeIntentSurfaceText(params.visiblePrompt);
  return [
    "你是教师工作台 Agent 的执行计划器。你的职责不是直接写内容，而是判断用户真正想完成的任务类型与最小工具组合。",
    "",
    "规则：",
    "- 如果用户明确要 worksheet / work sheet / guided notes / handout / 学习单 / 讲义，应判为 worksheet。",
    "- 如果用户同时要求联网搜索和文档生成，应优先判为“先检索再生成文档”，不要误判成资料问答。",
    "- 如果用户明确要 rubric/评分标准，应判为 rubric。",
    "- 如果用户明确要 exit ticket/课末检测，应判为 exit_ticket。",
    "- 如果用户明确要答案解析/answer key，且同时还有主文档任务，则 secondaryTask=answer_key；只有单独要答案解析时才把 taskType 设为 answer_key。",
    "- 如果用户说把刚才那份文档变简单/更难/加 challenge/加支架，应判为 adapt_difficulty。",
    "- 如果只是联网查资料、总结网页、不生成文档，才判为 retrieval 或 chat_answer。",
    "- 不要因为出现 search/搜索/联网 就忽略用户明确提出的 worksheet / rubric / lesson plan / exam 目标。",
    "",
    `用户请求：${normalizedPrompt}`,
    `当前词法动作：${params.parsedIntent.actions.join(", ") || "none"}`,
    `当前任务摘要：${params.promptTaskState.summary}`,
    `当前候选工具：${params.preferredTools.join(", ") || "none"}`,
    params.taskContext
      ? `当前任务上下文：kind=${params.taskContext.kind}, action=${params.taskContext.action}, mode=${params.taskContext.mode}`
      : "当前任务上下文：none",
    `有显式选中资料：${params.hasSelectedReferenceMaterials ? "yes" : "no"}`,
    `有本轮上传文件：${params.hasInlineUploads ? "yes" : "no"}`,
  ].join("\n");
}

function sanitizePlannedExecution(
  raw: z.infer<typeof executionPlannerSchema>,
  fallback: AgentExecutionPlan,
  params: AgentExecutionPlannerInput,
): AgentExecutionPlan {
  const normalizedPrompt = normalizeIntentSurfaceText(params.visiblePrompt);
  const forcedByPrompt =
    WORKSHEET_HINT_PATTERN.test(normalizedPrompt) ||
    EXIT_TICKET_HINT_PATTERN.test(normalizedPrompt) ||
    ANSWER_KEY_HINT_PATTERN.test(normalizedPrompt) ||
    ADAPT_DIFFICULTY_HINT_PATTERN.test(normalizedPrompt);

  const plannerTaskType =
    raw.taskType === "retrieval" && WORKSHEET_HINT_PATTERN.test(normalizedPrompt)
      ? "worksheet"
      : raw.taskType;

  const sanitizedUseQuestionBank =
    raw.useQuestionBank && !looksLikeQuestionBankRetrievalRequest(normalizedPrompt)
      ? false
      : raw.useQuestionBank;

  const candidate = toExecutionPlan({
    taskType: plannerTaskType,
    requiresSearch: raw.requiresSearch,
    useQuestionBank: sanitizedUseQuestionBank,
    requiresRecentArtifact: raw.requiresRecentArtifact,
    confidence: raw.confidence,
    hasSelectedReferenceMaterials: params.hasSelectedReferenceMaterials,
    hasInlineUploads: params.hasInlineUploads,
    uiLabel: raw.uiLabel,
    secondaryTask: raw.secondaryTask,
  });

  if (forcedByPrompt && candidate.taskType === "chat_answer") {
    return fallback;
  }

  if (
    params.forcedToolChoice &&
    fallback.confidence === "forced" &&
    candidate.taskType === "chat_answer"
  ) {
    return fallback;
  }

  return candidate;
}

export async function planAgentExecution(
  params: AgentExecutionPlannerInput,
): Promise<AgentExecutionPlan> {
  const fallbackPlan = buildFallbackAgentExecutionPlan(params);
  if (!shouldUseExecutionPlanner(params)) {
    return fallbackPlan;
  }

  try {
    const plannerModel = getResolvedLanguageModelForTask("intent");
    const output = await generateStructuredObject({
      model: plannerModel,
      schema: executionPlannerSchema,
      systemPrompt:
        "你是教学工作台的执行计划器。请只输出结构化对象，不要输出额外说明。",
      userPrompt: buildPlannerPrompt(params),
      maxTokens: 600,
      temperature: 0,
    });

    return sanitizePlannedExecution(output, fallbackPlan, params);
  } catch (error) {
    console.warn("[agent] execution planner fallback", error);
    return fallbackPlan;
  }
}

export function reconcileExecutionPlanWithRuntime(params: {
  promptPlan: AgentExecutionPlan;
  runtimeTaskState: AgentTaskState;
  runtimeForcedToolChoice: AgentToolName | null;
  runtimePreferredTools: AgentToolName[];
  visiblePrompt: string;
  hasSelectedReferenceMaterials: boolean;
  hasInlineUploads: boolean;
}) {
  const runtimeFallback = buildFallbackAgentExecutionPlan({
    visiblePrompt: params.visiblePrompt,
    promptTaskState: params.runtimeTaskState,
    parsedIntent: params.runtimeTaskState.parsedIntent,
    taskContext: null,
    forcedToolChoice: params.runtimeForcedToolChoice,
    preferredTools: params.runtimePreferredTools,
    hasSelectedReferenceMaterials: params.hasSelectedReferenceMaterials,
    hasInlineUploads: params.hasInlineUploads,
  });

  if (
    params.promptPlan.confidence === "low" &&
    runtimeFallback.taskType !== "chat_answer"
  ) {
    return runtimeFallback;
  }

  if (
    params.promptPlan.taskType === "chat_answer" &&
    runtimeFallback.taskType !== "chat_answer"
  ) {
    return runtimeFallback;
  }

  return {
    ...params.promptPlan,
    artifactPolicy: params.promptPlan.artifactPolicy,
    useSelectedReferenceQaFastPath:
      params.promptPlan.taskType === "chat_answer" &&
      !params.promptPlan.requiresSearch &&
      !params.hasInlineUploads &&
      params.hasSelectedReferenceMaterials,
  };
}
