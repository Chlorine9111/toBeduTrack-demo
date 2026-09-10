import { z } from "zod";
import { buildAgentTaskContext, type AgentTaskContext } from "@/lib/agent/task-context";
import { extractRequestedCount } from "@/lib/text/count-parser";
import { generateStructuredObject } from "@/lib/ai/structured-output";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";

const CLASSIFIER_ACTIONS = [
  "generate_lesson_plan",
  "generate_exercises",
  "create_worksheet",
  "retrieve_question_bank",
  "generate_rubric",
  "generate_pbl",
  "research",
  "general_summary",
  "organize_content",
] as const;

type ClassifierAction = (typeof CLASSIFIER_ACTIONS)[number];

const triageClassifierSchema = z.object({
  decision: z.enum(["apply", "skip"]),
  confidence: z.enum(["high", "medium", "low"]),
  action: z.enum(CLASSIFIER_ACTIONS).optional(),
  curriculum: z.string().trim().max(160).optional().default(""),
  topic: z.string().trim().max(160).optional().default(""),
  count: z.string().trim().max(40).optional().default(""),
  duration: z.string().trim().max(40).optional().default(""),
  scope: z.string().trim().max(120).optional().default(""),
  reason: z.string().trim().max(200).optional().default(""),
});

type TriageClassifierOutput = z.infer<typeof triageClassifierSchema>;

export type AgentTriageClassifierResult = {
  applied: boolean;
  reasonCode: string;
  confidence: "high" | "medium" | "low";
  taskContext?: AgentTaskContext;
  action?: ClassifierAction;
};

export function isAgentTriageClassifierEnabled() {
  const raw = process.env.AGENT_TRIAGE_CLASSIFIER_ENABLED?.trim().toLowerCase();
  if (!raw) return true;
  return !["0", "false", "off", "no"].includes(raw);
}

function sanitizeConversationContext(value: string[]) {
  return value
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((item) => (item.length <= 240 ? item : `${item.slice(0, 237)}...`));
}

function parseDurationHint(input: string) {
  const hit = input.match(/(\d{2,3})\s*(分钟|min|minutes?)/i);
  if (!hit) return "";
  const value = Number(hit[1]);
  if (!Number.isFinite(value) || value < 15 || value > 180) return "";
  return String(Math.floor(value));
}

function normalizeCountHint(input: string, fallbackMessage: string) {
  if (input) return input;
  const extracted = extractRequestedCount(fallbackMessage);
  if (extracted == null) return "";
  return String(Math.max(1, Math.min(20, extracted)));
}

function resolveActionLabel(action: ClassifierAction) {
  if (action === "generate_lesson_plan") return "生成教案";
  if (action === "generate_exercises") return "生成习题";
  if (action === "create_worksheet") return "生成 worksheet";
  if (action === "retrieve_question_bank") return "从题库检索现成题";
  if (action === "generate_rubric") return "生成 rubric";
  if (action === "generate_pbl") return "生成 PBL 项目";
  if (action === "research") return "检索研究";
  if (action === "general_summary") return "总结整理";
  return "内容库整理";
}

function buildClassifierSystemPrompt() {
  return [
    "你是教师 AI 工作台的 triage 分类器。",
    "任务：对输入请求做轻量路由分类，判断是否可以把请求收敛到明确工作流。",
    "输出限制：只输出 JSON，不要解释。",
    "规则：",
    "1) 如果用户意图不明确或信息不足，返回 decision=skip。",
    "2) 只有当 action 足够确定时，返回 decision=apply。",
    "3) 对“继续上一轮/改刚才内容”这类请求，若能看出任务方向可 apply，否则 skip。",
    "4) count/duration/scope 可选；没有就留空。",
    "5) confidence 为你对 action 的把握；不确定时必须给 low 或 skip。",
  ].join("\n");
}

function buildClassifierUserPrompt(params: {
  message: string;
  conversationContext: string[];
  hasAttachments: boolean;
}) {
  return [
    `当前消息：${params.message}`,
    params.conversationContext.length > 0
      ? `最近对话：\n${params.conversationContext.join("\n")}`
      : "",
    `当前轮是否有资料：${params.hasAttachments ? "yes" : "no"}`,
    `允许 action: ${CLASSIFIER_ACTIONS.join(", ")}`,
    "返回字段：decision, confidence, action, curriculum, topic, count, duration, scope, reason",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function resolveAgentTriageClassifierFallback(params: {
  message: string;
  conversationContext: string[];
  hasAttachments: boolean;
  classify?: (input: {
    systemPrompt: string;
    userPrompt: string;
  }) => Promise<TriageClassifierOutput>;
}): Promise<AgentTriageClassifierResult> {
  const message = params.message.trim();
  if (!message) {
    return {
      applied: false,
      reasonCode: "classifier:empty_message",
      confidence: "low",
    };
  }

  const safeConversationContext = sanitizeConversationContext(
    params.conversationContext,
  );
  const classifier =
    params.classify ??
    (async ({ systemPrompt, userPrompt }: { systemPrompt: string; userPrompt: string }) =>
      generateStructuredObject({
        model: getResolvedLanguageModelForTask("intent_classify"),
        schema: triageClassifierSchema,
        systemPrompt,
        userPrompt,
        maxTokens: 420,
        temperature: 0,
        maxRetries: 1,
      }));

  let output: TriageClassifierOutput;
  try {
    output = await classifier({
      systemPrompt: buildClassifierSystemPrompt(),
      userPrompt: buildClassifierUserPrompt({
        message,
        conversationContext: safeConversationContext,
        hasAttachments: params.hasAttachments,
      }),
    });
  } catch (error) {
    console.warn("triage classifier fallback failed", error);
    return {
      applied: false,
      reasonCode: "classifier:error",
      confidence: "low",
    };
  }

  if (output.decision !== "apply" || !output.action) {
    return {
      applied: false,
      reasonCode:
        output.decision === "skip"
          ? "classifier:skip"
          : "classifier:no_action",
      confidence: output.confidence,
    };
  }

  if (output.confidence === "low") {
    return {
      applied: false,
      reasonCode: "classifier:low_confidence",
      confidence: "low",
      action: output.action,
    };
  }

  const normalizedCount = normalizeCountHint(output.count, message);
  const normalizedDuration =
    output.duration || parseDurationHint(message);

  const taskContext = buildAgentTaskContext({
    message,
    action: output.action,
    actionLabel: resolveActionLabel(output.action),
    curriculum: output.curriculum,
    topic: output.topic,
    scope: output.scope,
    count: normalizedCount,
    duration: normalizedDuration,
    attachmentsSummary: params.hasAttachments ? "当前轮附带资料" : "",
    conversationContext: safeConversationContext,
  });

  return {
    applied: true,
    reasonCode: `classifier:applied:${output.action}`,
    confidence: output.confidence,
    action: output.action,
    taskContext,
  };
}
