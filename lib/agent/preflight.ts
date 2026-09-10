/**
 * Agent Preflight: 用户输入 → Haiku 理解意图 → ready 或追问
 *
 * 整个意图识别、参数提取、追问生成由一次 Haiku 调用完成。
 * 不再使用正则匹配、中文数字映射、bypass 规则等手写逻辑。
 */
import { z } from "zod";
import { getAnthropicProvider } from "@/lib/ai/provider-registry";
import { buildAgentTaskContext, type AgentTaskContext } from "@/lib/agent/task-context";
import type { AppLocale } from "@/lib/app-i18n/types";
import { inferExerciseSavePreference } from "@/lib/agent/exercise-save-preference";
import { parseJsonFromRawText } from "@/lib/agent/exercise-pipeline-parsing";
import { parseIntentFromText } from "@/lib/chat/intent";
import { extractRequestedCount } from "@/lib/text/count-parser";

// ---------------------------------------------------------------------------
// Request / Response types (kept for backward compatibility)
// ---------------------------------------------------------------------------

const PREFLIGHT_CONTEXT_LINE_MAX = 600;
const MAX_CLARIFY_ROUNDS = 1;
const NON_BLOCKING_CLARIFY_FIELDS = new Set(["count", "duration", "scope"]);
const CURRICULUM_SIGNAL_PATTERN =
  /(ap\s+[a-z]+|ib\s+[a-z]+|a-?level|unit\s*\d+|第\s*\d+\s*单元|课程|单元)/i;
const GREETING_ONLY_PATTERN = /^(hi|hello|hey|你好|您好|嗨|哈喽|在吗|在么|在不)\s*[!！?.。]*$/i;
const FRESH_RESET_PATTERN = /(全新|新的|新一轮|重新|另做|换一个|新做|全新的)/i;
const CONTINUATION_PATTERN =
  /(再来|继续|接着|延续|沿用|基于上面|刚才|上一轮|同样|换成|保存到题库|入库|保存一下)/i;
const RESEARCH_REQUEST_PATTERN =
  /(最新|最近|趋势|出处|来源|检索|搜索|联网|查找|对比|资料来源|引用|news|latest|search|source|reference)/i;
const SUMMARY_REQUEST_PATTERN = /(总结|摘要|梳理|概述|总结一下|summary|summarize|outline)/i;
const AP_CURRICULUM_PATTERN =
  /\b(AP\s+[A-Za-z][A-Za-z/&-]*(?:\s+[A-Za-z][A-Za-z/&-]*)*(?:\s+(?:AB|BC))?)(?:\s+Unit\s+(\d+(?:\.\d+)?))?\b/i;
const IB_CURRICULUM_PATTERN =
  /\b(IB\s+[A-Za-z][A-Za-z/&-]*(?:\s+[A-Za-z][A-Za-z/&-]*)*)(?:\s+Unit\s+(\d+(?:\.\d+)?))?\b/i;
const GENERIC_TOPIC_PATTERN =
  /^(语文|数学|英语|物理|化学|生物|历史|地理|政治|科学|教案|教学设计|当前章节重点|课堂小测重点|本章重点|本节重点|这个单元|该单元|这个主题|该主题)$/i;

function sanitizeConversationContextInput(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.replace(/\s+/g, " ").trim() : ""))
    .filter(Boolean)
    .slice(0, 8)
    .map((item) =>
      item.length > PREFLIGHT_CONTEXT_LINE_MAX
        ? `${item.slice(0, PREFLIGHT_CONTEXT_LINE_MAX - 3)}...`
        : item,
    );
}

export const agentAttachmentSummarySchema = z.object({
  fileCount: z.number().int().min(0).max(20),
  totalQuestions: z.number().int().min(0).max(500),
  archivedQuestionCount: z.number().int().min(0).max(500).optional().default(0),
  materialFileCount: z.number().int().min(0).max(20).optional().default(0),
  questionFileCount: z.number().int().min(0).max(20).optional().default(0),
  hasFigures: z.boolean().optional().default(false),
  hasTables: z.boolean().optional().default(false),
  fileNames: z.array(z.string().trim().min(1).max(240)).max(20).optional().default([]),
  contentKinds: z.array(z.enum(["question_set", "material", "mixed"])).max(20).optional().default([]),
});

export const agentPreflightAnswersSchema = z.record(z.string(), z.string().trim().min(1).max(400));

export const agentPreflightRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  attachments: agentAttachmentSummarySchema.nullable().optional().default(null),
  answers: agentPreflightAnswersSchema.optional().default({}),
  sessionDefaults: agentPreflightAnswersSchema.optional().default({}),
  conversationContext: z.preprocess(
    sanitizeConversationContextInput,
    z.array(z.string().trim().min(1).max(PREFLIGHT_CONTEXT_LINE_MAX)).max(8),
  ).optional().default([]),
  locale: z.enum(["zh", "en"]).optional().default("zh"),
  clarifyRound: z.number().int().min(0).max(5).default(0),
});

export type AgentAttachmentSummary = z.infer<typeof agentAttachmentSummarySchema>;
export type AgentPreflightAnswers = z.infer<typeof agentPreflightAnswersSchema>;
export type AgentPreflightRequest = z.infer<typeof agentPreflightRequestSchema>;

export type AgentClarificationChoice = {
  key: string;
  label: string;
  value: string;
  field: string;
  isOther: boolean;
  description?: string;
};

export type AgentClarificationQuestion = {
  id: string;
  question: string;
  field: string;
  questionType: "required" | "preference";
  placeholder?: string;
  options: AgentClarificationChoice[];
};

export type AgentPreflightResponse =
  | {
      status: "needs_info";
      summary: string;
      collectedAnswers: AgentPreflightAnswers;
      question: AgentClarificationQuestion;
      questions?: AgentClarificationQuestion[];
      taskContext?: AgentTaskContext;
    }
  | {
      status: "ready";
      summary: string;
      collectedAnswers: AgentPreflightAnswers;
      enrichedPrompt: string;
      taskContext: AgentTaskContext;
    };

// ---------------------------------------------------------------------------
// Haiku output schema
// ---------------------------------------------------------------------------

const ACTIONS = [
  "scan_split", "scan_classify", "scan_explain", "scan_variant",
  "scan_lesson", "scan_summary", "lesson_plan", "generate_exercises",
  "save_exercises", "create_worksheet", "retrieve_question_bank",
  "generate_rubric", "generate_pbl", "organize_content", "research", "general_summary", "custom",
] as const;

const haikuOutputSchema = z.object({
  decision: z.enum(["ready", "clarify"]),
  action: z.string(),
  summary: z.string(),
  answers: z.object({
    curriculum: z.string().optional().default(""),
    topic: z.string().optional().default(""),
    count: z.string().optional().default(""),
    duration: z.string().optional().default(""),
    scope: z.string().optional().default(""),
    knowledgeCluster: z.string().optional().default(""),
    subskill: z.string().optional().default(""),
  }),
  question: z.object({
    field: z.string(),
    text: z.string(),
    placeholder: z.string().optional().default(""),
    options: z.array(z.object({
      label: z.string(),
      value: z.string(),
      description: z.string().optional().default(""),
      isOther: z.boolean().optional().default(false),
    })).optional().default([]),
  }).optional(),
});

type HaikuOutput = z.infer<typeof haikuOutputSchema>;

// ---------------------------------------------------------------------------
// System prompt for Haiku
// ---------------------------------------------------------------------------

function buildSystemPrompt(locale: AppLocale, clarifyRound: number) {
  const isEn = locale === "en";
  const maxRounds = MAX_CLARIFY_ROUNDS;
  const remainingRounds = Math.max(0, maxRounds - clarifyRound);

  return [
    isEn
      ? "You are the intent planner for a teacher AI workspace."
      : "你是教师 AI 工作台的意图规划器。",
    "",
    isEn ? "Your job:" : "你的任务：",
    isEn
      ? "1. Understand what the teacher wants to do"
      : "1. 理解老师想做什么",
    isEn
      ? "2. Extract all parameters you can from the message + context + answers"
      : "2. 从消息、上下文、已有答案中尽可能提取所有参数",
    isEn
      ? "3. Decide: ready or clarify. If clarify, ask the ONE question that most improves output quality."
      : "3. 决策：ready 或 clarify。如果 clarify，问一个对生成质量提升最大的问题。",
    "",
    isEn ? "Parameters:" : "参数：",
    isEn
      ? "- action: what to do (required)"
      : "- action：要做什么（必需）",
    isEn
      ? "- curriculum: course/unit, e.g. 'AP Chemistry Unit 9' (strongly improves quality)"
      : "- curriculum：课程/单元，如 'AP Chemistry Unit 9'（显著提升质量）",
    isEn
      ? "- topic: narrower focus, e.g. 'electrochemistry', 'chain rule' (improves relevance)"
      : "- topic：更窄的主题，如 'electrochemistry'、'chain rule'（提升相关性）",
    isEn
      ? "- count: number of items (default: 5, don't ask)"
      : "- count：数量（默认5，不用追问）",
    isEn
      ? "- duration: time in minutes (default: 45, don't ask)"
      : "- duration：时长分钟（默认45，不用追问）",
    isEn
      ? "- scope: which items to process (default: all)"
      : "- scope：处理范围（默认全部）",
    isEn
      ? "- knowledgeCluster: knowledge domain for filtering (e.g. 'derivatives', 'mechanics', 'genetics_evolution'). Extract when user mentions a specific topic."
      : "- knowledgeCluster：知识领域（如 derivatives, mechanics, genetics_evolution）。用户提到具体考点时提取。",
    isEn
      ? "- subskill: narrower skill within cluster (e.g. 'chain_rule', 'integration_by_parts'). Extract when user is specific."
      : "- subskill：更细的子技能（如 chain_rule, integration_by_parts）。用户明确时提取。",
    "",
    isEn ? "Clarification strategy:" : "追问策略：",
    isEn
      ? `- You have ${remainingRounds} clarification round(s) left (max ${maxRounds} total).`
      : `- 剩余追问机会：${remainingRounds} 次（最多 ${maxRounds} 次）。`,
    remainingRounds === 0
      ? (isEn
          ? "- NO MORE QUESTIONS ALLOWED. You MUST return decision=ready now."
          : "- 追问次数已用完，必须返回 decision=ready。")
      : "",
    isEn
      ? "- Only ask if the answer would MEANINGFULLY improve the output."
      : "- 只在答案能显著提升生成质量时才追问。",
    isEn
      ? "- Priority: action (if unknown) > curriculum (if vague) > topic (for lesson/PBL)."
      : "- 追问优先级：action（不知道要做什么）> curriculum（课程模糊）> topic（教案/PBL需要具体主题）。",
    isEn
      ? "- DON'T ask: count, duration, scope (have defaults). DON'T re-ask answered fields."
      : "- 不追问：count、duration、scope（有默认值）。不重复问已回答的字段。",
    isEn
      ? "- If the user gives enough context (e.g. 'AP Calculus BC Unit 10 习题'), go ready immediately."
      : "- 如果用户给了足够上下文（如 'AP Calculus BC Unit 10 习题'），直接 ready。",
    isEn
      ? "- If continuing a previous task ('再来几道', 'switch to FRQ'), reuse context, go ready."
      : "- 延续任务（'再来几道'、'换成FRQ'）时复用上下文，直接 ready。",
    isEn
      ? "- 'Just make questions' with NO subject/topic at all → MUST clarify topic."
      : "- 完全没有学科和主题的泛化请求 → 必须追问。",
    isEn
      ? "- For lesson_plan/PBL without concrete topic → clarify topic."
      : "- 教案/PBL 没有具体主题 → 追问 topic。",
    isEn
      ? "- If conversation history mentions uploaded materials/files (【当前材料摘要】), the user saying 'based on that file/PDF/material' → go ready immediately, infer subject from material context."
      : "- 如果对话历史提到了上传材料（【当前材料摘要】），用户说'根据刚才的资料/参考PDF/基于文件'→ 直接 ready，从材料内容推断学科。",
    isEn
      ? "- NEVER ask 'which course/unit' when the user already uploaded materials — infer from the material content."
      : "- 用户已上传材料时，绝对不追问'哪门课程/哪个单元'——从材料内容推断。",
    "",
    isEn
      ? "Quality-boosting questions (ask these when the basic intent is clear but output quality would benefit):"
      : "质量提升型追问（当基本意图已明确但追问能显著提升生成质量时）：",
    isEn
      ? "- Exercise: 'MC or FRQ?' / 'Which unit?' can help generate more targeted questions."
      : "- 习题：'选择题还是问答题？'、'哪个 Unit？' 能让生成的题目更精准。",
    isEn
      ? "- Lesson plan: 'What's the specific lesson focus?' makes the plan actionable vs generic."
      : "- 教案：'具体讲哪个知识点？' 让教案可操作而非泛泛而谈。",
    isEn
      ? "- Rubric: 'What assignment is this for?' tailors the rubric dimensions."
      : "- Rubric：'这是针对什么作业？' 让评分维度更贴切。",
    isEn
      ? "- BUT if the user seems to want speed ('快帮我出', 'just do it'), prefer ready over asking."
      : "- 但如果用户显然想要速度（'快帮我出'、'直接做'），优先 ready 不追问。",
    "",
    isEn ? "Available actions:" : "可用 action 值：",
    ACTIONS.join(", "),
    "",
    isEn ? "Output: JSON only, no explanation." : "输出：只输出 JSON，不要解释。",
    '{"decision":"ready|clarify","action":"...","summary":"一句话说明","answers":{"curriculum":"","topic":"","count":"","duration":"","scope":"","knowledgeCluster":"","subskill":""},"question":{"field":"action|curriculum|topic|count|scope","text":"追问文案","placeholder":"提示","options":[{"label":"选项","value":"值","description":"说明","isOther":false}]}}',
  ].filter(Boolean).join("\n");
}

function buildUserPrompt(input: AgentPreflightRequest) {
  const lines = [
    `用户消息：${input.message}`,
  ];
  if (input.conversationContext.length > 0) {
    lines.push(`最近对话：\n${input.conversationContext.join("\n")}`);
  }
  if (Object.keys(input.answers).length > 0) {
    lines.push(`已收集答案：${JSON.stringify(input.answers)}`);
  }
  if (input.attachments) {
    lines.push(`附件：${JSON.stringify(input.attachments)}`);
  }
  if (Object.keys(input.sessionDefaults).length > 0) {
    lines.push(`会话默认值（最低优先级）：${JSON.stringify(input.sessionDefaults)}`);
  }
  return lines.join("\n\n");
}

// ---------------------------------------------------------------------------
// Call Haiku
// ---------------------------------------------------------------------------

async function callHaikuPreflight(input: AgentPreflightRequest): Promise<HaikuOutput | null> {
  try {
    const { streamText } = await import("ai");
    const anthropic = getAnthropicProvider();
    const stream = streamText({
      model: anthropic("claude-haiku-4-5-20251001"),
      system: buildSystemPrompt(input.locale ?? "zh", input.clarifyRound ?? 0),
      prompt: buildUserPrompt(input),
      maxOutputTokens: 600,
      temperature: 0.1,
      maxRetries: 1,
    });
    const result = { text: await stream.text };

    const parsed = parseJsonFromRawText(result.text ?? "");
    if (!parsed || typeof parsed !== "object") return null;
    return haikuOutputSchema.parse(parsed);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Build response from Haiku output
// ---------------------------------------------------------------------------

function normalizeAction(raw: string): string {
  const lower = raw.toLowerCase().trim();
  const found = ACTIONS.find((a) => a === lower);
  return found ?? "custom";
}

function normalizeFieldValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatCourseHintLabel(courseHint: string) {
  const labels: Record<string, string> = {
    environmental_science: "AP Environmental Science",
    calculus: "AP Calculus",
    physics: "AP Physics",
    statistics: "AP Statistics",
    chemistry: "AP Chemistry",
    biology: "AP Biology",
    english: "AP English",
    history: "AP History",
  };
  return labels[courseHint] ?? courseHint.replace(/_/g, " ").trim();
}

function composeCurriculumFromParsedIntent(parsedIntent: ReturnType<typeof parseIntentFromText>) {
  const courseLabel = normalizeFieldValue(parsedIntent.courseHint)
    ? formatCourseHintLabel(parsedIntent.courseHint!)
    : "";
  if (!courseLabel) return "";
  return [courseLabel, parsedIntent.unitHint ? `Unit ${parsedIntent.unitHint}` : ""]
    .filter(Boolean)
    .join(" ");
}

function normalizeTopicCandidate(value: string) {
  return value
    .replace(/^[：:\s,，。.!！?？-]+/, "")
    .replace(/^(?:主题|topic|聚焦|围绕|关于)\s*(?:是|为)?\s*/i, "")
    .replace(/^是(?=[\u4e00-\u9fa5A-Za-z])/u, "")
    .trim();
}

function isConcreteTopicValue(value: string) {
  const normalized = normalizeTopicCandidate(value);
  if (!normalized) return false;
  return !GENERIC_TOPIC_PATTERN.test(normalized);
}

function extractExplicitCurriculum(texts: string[]) {
  for (const text of texts) {
    const normalized = text.trim();
    if (!normalized) continue;
    const withUnitMatch =
      normalized.match(/\b(AP\s+.+?)\s+Unit\s+(\d+(?:\.\d+)?)/i) ??
      normalized.match(/\b(IB\s+.+?)\s+Unit\s+(\d+(?:\.\d+)?)/i);
    if (withUnitMatch) {
      const course = normalizeFieldValue(withUnitMatch[1]).replace(/\s+$/g, "");
      const unit = normalizeFieldValue(withUnitMatch[2]);
      if (course && unit) return `${course} Unit ${unit}`;
    }
    const match = normalized.match(AP_CURRICULUM_PATTERN) ?? normalized.match(IB_CURRICULUM_PATTERN);
    if (!match) continue;
    const course = normalizeFieldValue(match[1]);
    const unit = normalizeFieldValue(match[2]);
    if (!course) continue;
    return unit ? `${course} Unit ${unit}` : course;
  }
  return "";
}

function extractFallbackTopic(texts: string[]) {
  for (const text of texts) {
    const parsedIntent = parseIntentFromText(text);
    const topic = normalizeTopicCandidate(
      normalizeFieldValue(
        parsedIntent.topic ?? parsedIntent.topicFocus ?? parsedIntent.topicHint,
      ),
    );
    if (topic) return topic;
  }
  return "";
}

function extractFallbackCount(texts: string[]) {
  for (const text of texts) {
    const count = extractRequestedCount(text);
    if (typeof count === "number" && Number.isFinite(count) && count > 0) {
      return String(count);
    }
  }
  return "";
}

function extractExplicitDuration(text: string) {
  const match = text.match(/(\d{1,3})\s*(?:分钟|min|minutes?)/i);
  return match ? normalizeFieldValue(match[1]) : "";
}

function resolveMessageAction(input: AgentPreflightRequest) {
  const parsedIntent = parseIntentFromText(input.message);
  if (parsedIntent.actions.includes("organize_content")) return "organize_content";
  if (parsedIntent.actions.includes("generate_pbl")) return "generate_pbl";
  if (parsedIntent.actions.includes("generate_lesson_plan")) return "lesson_plan";
  if (parsedIntent.actions.includes("generate_rubric")) return "generate_rubric";
  if (parsedIntent.actions.includes("create_worksheet")) return "create_worksheet";
  if (parsedIntent.actions.includes("generate_exercises")) return "generate_exercises";
  if (parsedIntent.actions.includes("save_exercises")) return "save_exercises";
  if (RESEARCH_REQUEST_PATTERN.test(input.message)) return "research";
  if (SUMMARY_REQUEST_PATTERN.test(input.message)) return "general_summary";
  if (GREETING_ONLY_PATTERN.test(input.message)) return "";
  return null;
}

function shouldUseConversationCarry(input: AgentPreflightRequest, action: string) {
  if (FRESH_RESET_PATTERN.test(input.message)) return false;
  if (CONTINUATION_PATTERN.test(input.message)) return true;
  if (action === "save_exercises") return true;
  return false;
}

function shouldUseSessionDefaults(input: AgentPreflightRequest, action: string) {
  if (FRESH_RESET_PATTERN.test(input.message)) return false;
  if (action !== "generate_exercises") return false;
  const sessionAction = normalizeAction(normalizeFieldValue(input.sessionDefaults.action));
  if (sessionAction && sessionAction !== "custom" && sessionAction !== action) {
    return false;
  }
  return true;
}

function resolveFallbackAction(input: AgentPreflightRequest) {
  const explicitAction = normalizeAction(normalizeFieldValue(input.answers.action));
  if (explicitAction !== "custom") return explicitAction;

  const messageAction = resolveMessageAction(input);
  if (messageAction) return messageAction;

  const sessionAction = normalizeAction(normalizeFieldValue(input.sessionDefaults.action));
  if (sessionAction !== "custom") return sessionAction;

  const hasCurriculumAnchor =
    CURRICULUM_SIGNAL_PATTERN.test(input.message) ||
    Boolean(normalizeFieldValue(input.answers.curriculum));
  if (hasCurriculumAnchor) return "";

  return input.message.trim().length >= 6 ? "custom" : "";
}

function shouldPreferSessionDefaults(input: AgentPreflightRequest, action: string) {
  if (FRESH_RESET_PATTERN.test(input.message)) return false;
  const sessionAction = normalizeAction(normalizeFieldValue(input.sessionDefaults.action));
  if (!sessionAction || sessionAction === "custom") return false;
  return sessionAction === action;
}

function shouldLockSessionField(params: {
  input: AgentPreflightRequest;
  action: string;
  field: "curriculum" | "topic";
}) {
  const sessionValue = normalizeFieldValue(params.input.sessionDefaults[params.field]);
  if (!sessionValue) return false;

  const explicitAnswer = normalizeFieldValue(params.input.answers[params.field]);
  if (explicitAnswer) return false;

  const parsedIntent = parseIntentFromText(params.input.message);

  if (params.field === "curriculum") {
    const explicitCurriculum =
      extractExplicitCurriculum([params.input.message]) ||
      composeCurriculumFromParsedIntent(parsedIntent);
    if (explicitCurriculum) return false;
  }

  if (params.field === "topic") {
    const explicitTopic = normalizeTopicCandidate(
      normalizeFieldValue(
        parsedIntent.topic ?? parsedIntent.topicFocus ?? parsedIntent.topicHint,
      ),
    );
    if (isConcreteTopicValue(explicitTopic)) return false;
  }

  return shouldPreferSessionDefaults(params.input, params.action);
}

function applySessionDefaultGuards(params: {
  input: AgentPreflightRequest;
  action: string;
  answers: AgentPreflightAnswers;
}) {
  const guardedAnswers: AgentPreflightAnswers = { ...params.answers };

  if (
    shouldLockSessionField({
      input: params.input,
      action: params.action,
      field: "curriculum",
    })
  ) {
    guardedAnswers.curriculum = normalizeFieldValue(
      params.input.sessionDefaults.curriculum,
    );
  }

  if (
    shouldLockSessionField({
      input: params.input,
      action: params.action,
      field: "topic",
    })
  ) {
    guardedAnswers.topic = normalizeTopicCandidate(
      normalizeFieldValue(params.input.sessionDefaults.topic),
    );
  }

  return guardedAnswers;
}

function buildClarificationQuestionForFallback(params: {
  locale: AppLocale;
  field: "action" | "topic";
  attachments: AgentAttachmentSummary | null;
  action?: string;
}): AgentClarificationQuestion {
  if (params.field === "topic") {
    const lessonTopicOptions =
      params.action === "lesson_plan"
        ? [
            {
              key: "topic-0",
              label: params.locale === "en" ? "Poetry analysis" : "古诗词鉴赏",
              value: params.locale === "en" ? "poetry analysis" : "古诗词鉴赏",
              field: "topic",
              isOther: false,
            },
            {
              key: "topic-1",
              label: params.locale === "en" ? "Reading comprehension" : "记叙文阅读",
              value: params.locale === "en" ? "reading comprehension" : "记叙文阅读",
              field: "topic",
              isOther: false,
            },
            {
              key: "topic-2",
              label: params.locale === "en" ? "Classical Chinese reading" : "文言文阅读",
              value: params.locale === "en" ? "classical Chinese reading" : "文言文阅读",
              field: "topic",
              isOther: false,
            },
          ]
        : [];

    return {
      id: "agent-topic",
      field: "topic",
      questionType: "required",
      question:
        params.locale === "en"
          ? "Which specific topic should I focus on?"
          : params.action === "generate_pbl"
            ? "这个 PBL 想围绕哪个具体主题或真实问题展开？"
            : "这次想聚焦哪个具体知识点或主题？",
      placeholder:
        params.locale === "en"
          ? "For example: chain rule / electrochemistry / population growth"
          : "例如：chain rule / electrochemistry / population growth",
      options: lessonTopicOptions,
    };
  }

  const options = params.attachments?.totalQuestions
    ? [
        {
          key: "action-0",
          label: params.locale === "en" ? "Split questions" : "拆分题目",
          value: "scan_split",
          field: "action",
          isOther: false,
          description:
            params.locale === "en"
              ? "Extract a structured question list from the file."
              : "先把文件里的题结构化拆出来。",
        },
        {
          key: "action-1",
          label: params.locale === "en" ? "Make worksheet" : "组一套卷子",
          value: "create_worksheet",
          field: "action",
          isOther: false,
          description:
            params.locale === "en"
              ? "Use the uploaded questions directly to build a worksheet."
              : "直接基于上传题目组一套 worksheet。",
        },
      ]
    : [
        {
          key: "action-0",
          label: params.locale === "en" ? "Lesson plan" : "生成教案",
          value: "lesson_plan",
          field: "action",
          isOther: false,
          description:
            params.locale === "en"
              ? "Create a lesson plan around the topic."
              : "围绕主题生成可执行教案。",
        },
        {
          key: "action-1",
          label: params.locale === "en" ? "Exercises" : "生成习题",
          value: "generate_exercises",
          field: "action",
          isOther: false,
          description:
            params.locale === "en"
              ? "Generate new practice questions."
              : "生成新的练习题。",
        },
        {
          key: "action-2",
          label: params.locale === "en" ? "Research" : "资料整理",
          value: "research",
          field: "action",
          isOther: false,
          description:
            params.locale === "en"
              ? "Collect references and summarize them."
              : "整理资料并给出处。",
        },
      ];

  return {
    id: "agent-action",
    field: "action",
    questionType: "required",
    question:
      params.locale === "en"
        ? "What do you want me to do with this?"
        : "这次你想让我具体做什么？",
    placeholder:
      params.locale === "en"
        ? "For example: make a lesson plan / generate questions / summarize"
        : "例如：生成教案 / 出题 / 资料整理",
    options,
  };
}

function resolveDeterministicPreflightFallback(
  input: AgentPreflightRequest,
): AgentPreflightResponse {
  const locale = input.locale ?? "zh";
  const parsedIntent = parseIntentFromText(input.message);
  const action = resolveFallbackAction(input);
  const useConversationCarry = shouldUseConversationCarry(input, action);
  const useSessionDefaults = shouldUseSessionDefaults(input, action);

  const messageCurriculum =
    extractExplicitCurriculum([input.message]) ||
    composeCurriculumFromParsedIntent(parsedIntent);
  const carriedCurriculum = useConversationCarry
    ? extractExplicitCurriculum(input.conversationContext)
    : "";
  const curriculum =
    normalizeFieldValue(input.answers.curriculum) ||
    messageCurriculum ||
    carriedCurriculum ||
    (useSessionDefaults
      ? normalizeFieldValue(input.sessionDefaults.curriculum)
      : "");

  const messageTopic = extractFallbackTopic([input.message]);
  const carriedTopic = useConversationCarry
    ? extractFallbackTopic(input.conversationContext)
    : "";
  const topicCandidate =
    normalizeTopicCandidate(normalizeFieldValue(input.answers.topic)) ||
    messageTopic ||
    carriedTopic ||
    (useSessionDefaults
      ? normalizeTopicCandidate(normalizeFieldValue(input.sessionDefaults.topic))
      : "");
  const topic = isConcreteTopicValue(topicCandidate) ? topicCandidate : "";

  const explicitCount =
    normalizeFieldValue(input.answers.count) ||
    extractFallbackCount([input.message]) ||
    (useConversationCarry ? extractFallbackCount(input.conversationContext) : "") ||
    (useSessionDefaults
      ? normalizeFieldValue(input.sessionDefaults.count)
      : "");

  const explicitDuration =
    normalizeFieldValue(input.answers.duration) ||
    extractExplicitDuration(input.message) ||
    (useSessionDefaults
      ? normalizeFieldValue(input.sessionDefaults.duration)
      : "");

  const mergedAnswers: AgentPreflightAnswers = {
    ...input.answers,
    ...(curriculum ? { curriculum } : {}),
    ...(topic ? { topic } : {}),
    ...(action ? { action } : {}),
  };

  if (!action) {
    return {
      status: "needs_info",
      summary:
        locale === "en"
          ? "I can continue once the goal is clear."
          : "先确认目标，我再继续执行。",
      collectedAnswers: mergedAnswers,
      question: buildClarificationQuestionForFallback({
        locale,
        field: "action",
        attachments: input.attachments ?? null,
      }),
      taskContext: buildTaskContext(
        input.message,
        "custom",
        mergedAnswers,
        input.attachments ?? null,
        locale,
        input.conversationContext ?? [],
      ),
    };
  }

  const needsPblTopic =
    action === "generate_pbl" && !isConcreteTopicValue(normalizeFieldValue(mergedAnswers.topic));
  const needsLessonTopic =
    action === "lesson_plan" &&
    !normalizeFieldValue(mergedAnswers.curriculum) &&
    !isConcreteTopicValue(normalizeFieldValue(mergedAnswers.topic));

  if (needsPblTopic || needsLessonTopic) {
    return {
      status: "needs_info",
      summary:
        locale === "en"
          ? "I have the task type, but I still need the specific topic."
          : "任务类型已明确，但还需要具体主题。",
      collectedAnswers: mergedAnswers,
      question: buildClarificationQuestionForFallback({
        locale,
        field: "topic",
        attachments: input.attachments ?? null,
        action,
      }),
      taskContext: buildTaskContext(
        input.message,
        action,
        mergedAnswers,
        input.attachments ?? null,
        locale,
        input.conversationContext ?? [],
      ),
    };
  }

  if (
    action === "generate_exercises" &&
    !normalizeFieldValue(mergedAnswers.curriculum) &&
    !isConcreteTopicValue(normalizeFieldValue(mergedAnswers.topic)) &&
    !(input.attachments && input.attachments.fileCount > 0)
  ) {
    return {
      status: "needs_info",
      summary:
        locale === "en"
          ? "I can generate questions once I know the topic."
          : "先给我一个明确的主题或知识点，我再开始出题。",
      collectedAnswers: mergedAnswers,
      question: buildClarificationQuestionForFallback({
        locale,
        field: "topic",
        attachments: input.attachments ?? null,
        action,
      }),
      taskContext: buildTaskContext(
        input.message,
        action,
        mergedAnswers,
        input.attachments ?? null,
        locale,
        input.conversationContext ?? [],
      ),
    };
  }

  const defaultNotes: string[] = [];
  if (action === "generate_exercises") {
    const resolvedCount = explicitCount || "5";
    mergedAnswers.count = resolvedCount;
    if (!explicitCount) {
      defaultNotes.push(locale === "en" ? "count 5" : "数量 5 道");
    }
  } else if (
    action === "lesson_plan" ||
    action === "generate_pbl" ||
    action === "scan_lesson"
  ) {
    const resolvedDuration = explicitDuration || "45";
    mergedAnswers.duration = resolvedDuration;
    if (!explicitDuration) {
      defaultNotes.push(locale === "en" ? "duration 45 min" : "时长 45 分钟");
    }
  }

  return {
    status: "ready",
    summary: buildReadySummary(locale, "", input.clarifyRound ?? 0, defaultNotes),
    collectedAnswers: mergedAnswers,
    enrichedPrompt: buildEnrichedPrompt(input.message, action, mergedAnswers, locale),
    taskContext: buildTaskContext(
      input.message,
      action,
      mergedAnswers,
      input.attachments ?? null,
      locale,
      input.conversationContext ?? [],
    ),
  };
}

function buildClarifyGuardContext(
  input: AgentPreflightRequest,
  mergedAnswers: AgentPreflightAnswers,
) {
  const combinedText = [
    input.message,
    ...input.conversationContext,
    ...Object.values(input.answers),
    normalizeFieldValue(mergedAnswers.curriculum),
    normalizeFieldValue(mergedAnswers.topic),
  ]
    .map((item) => normalizeFieldValue(item))
    .filter(Boolean)
    .join("\n");
  const parsedIntent = parseIntentFromText(combinedText || input.message);
  const hasCurriculumAnchor = Boolean(
    normalizeFieldValue(mergedAnswers.curriculum) ||
      parsedIntent.courseHint ||
      parsedIntent.unitHint ||
      CURRICULUM_SIGNAL_PATTERN.test(combinedText || input.message),
  );
  const hasTopicAnchor = Boolean(
    normalizeFieldValue(mergedAnswers.topic) ||
      parsedIntent.topic ||
      parsedIntent.topicFocus ||
      parsedIntent.topicHint,
  );

  return {
    combinedText,
    parsedIntent,
    hasCurriculumAnchor,
    hasTopicAnchor,
  };
}

function shouldForceReadyFromClarify(params: {
  input: AgentPreflightRequest;
  action: string;
  mergedAnswers: AgentPreflightAnswers;
  questionField: string;
}) {
  const questionField = params.questionField.trim();
  if (!questionField) return true;
  if (NON_BLOCKING_CLARIFY_FIELDS.has(questionField)) return true;
  if (params.input.clarifyRound >= MAX_CLARIFY_ROUNDS) return true;

  const explicitAnswer = normalizeFieldValue(params.input.answers[questionField]);
  if (explicitAnswer) {
    return true;
  }

  if (questionField === "action" && params.action !== "custom") {
    return true;
  }

  const currentFieldValue = normalizeFieldValue(params.mergedAnswers[questionField]);
  if (questionField !== "action" && currentFieldValue) {
    return true;
  }

  if (params.action !== "generate_exercises") {
    return false;
  }

  const guardContext = buildClarifyGuardContext(params.input, params.mergedAnswers);
  if (questionField === "topic") {
    return guardContext.hasCurriculumAnchor || guardContext.hasTopicAnchor;
  }
  if (questionField === "curriculum") {
    return guardContext.hasTopicAnchor;
  }
  return false;
}

function buildReadySummary(
  locale: AppLocale,
  fallback: string,
  clarifyRound: number,
  defaultNotes: string[] = [],
) {
  const trimmedFallback = fallback.trim();
  const defaultSummary =
    defaultNotes.length > 0
      ? locale === "en"
        ? ` Defaults applied: ${defaultNotes.join(", ")}.`
        : ` 已补入默认值：${defaultNotes.join("、")}。`
      : "";
  if (trimmedFallback && !/clarify|追问/i.test(trimmedFallback)) {
    return `${trimmedFallback}${defaultSummary}`;
  }
  if (clarifyRound > 0) {
    return locale === "en"
      ? `I have enough information. Starting now.${defaultSummary}`
      : `已拿到关键信息，开始执行。${defaultSummary}`;
  }
  return locale === "en"
    ? `I already have enough information. Starting now.${defaultSummary}`
    : `已有足够信息，开始执行。${defaultSummary}`;
}

const ACTION_HINTS: Record<string, string> = {
  scan_split: "请优先输出结构化题目清单，保留题号、题型、图片/表格引用与关键公式。",
  scan_classify: "请按知识点或题型归类，并给出每一类对应的题号、难度特征与可直接用于教学的结论。",
  scan_explain: "请逐题给出思路、关键步骤、易错点与最终结论。",
  scan_variant: "请先提炼原题考点，再生成贴近原题难度的变式题。",
  scan_lesson: "请生成可直接上课的教案，包含教学目标、流程、时间分配、提问点和板书/活动建议。",
  lesson_plan: "请生成可直接上课的教案，包含教学目标、流程、时间分配、提问点和板书/活动建议。",
  generate_exercises: "请按指定数量生成题目，保持难度与题型清晰，附简要答案或解题提示。",
  create_worksheet: "请直接整理成一套卷子。",
  retrieve_question_bank: "请优先从老师题库里调取现成题，不要直接新出题。",
  generate_rubric: "请输出结构清晰、可直接评估学生表现的 Rubric。",
  generate_pbl: "请围绕主题生成完整 PBL 方案。",
  research: "请优先给出可核验来源，并把结论和出处一一对应。",
  scan_summary: "请输出重点摘要、结构化结论和下一步建议。",
  general_summary: "请输出重点摘要、结构化结论和下一步建议。",
  custom: "请严格围绕目标执行。",
};

function buildEnrichedPrompt(
  message: string,
  action: string,
  answers: Record<string, string>,
  locale: AppLocale,
) {
  const isEn = locale === "en";
  const lines = [message.trim()];
  lines.push("", isEn ? "[Clarified Requirements]" : "【前置补充说明】");
  lines.push(isEn ? `- Goal: ${action}` : `- 任务目标：${action}`);

  if (answers.curriculum) lines.push(isEn ? `- Course: ${answers.curriculum}` : `- 课程/单元：${answers.curriculum}`);
  if (answers.topic) lines.push(isEn ? `- Topic: ${answers.topic}` : `- 主题：${answers.topic}`);
  if (answers.count) lines.push(isEn ? `- Quantity: ${answers.count}` : `- 数量：${answers.count} 道`);
  if (answers.duration) lines.push(isEn ? `- Duration: ${answers.duration} min` : `- 时长：${answers.duration} 分钟`);
  if (answers.scope) lines.push(isEn ? `- Scope: ${answers.scope}` : `- 范围：${answers.scope}`);

  const hint = ACTION_HINTS[action];
  if (hint) lines.push(`- ${hint}`);
  if (action === "generate_pbl") {
    lines.push(
      isEn
        ? "- Output must include milestones, a checklist, and reference links."
        : "- 输出必须包含里程碑、检查清单、参考资料链接。",
    );
  }

  return lines.join("\n");
}

function buildTaskContext(
  message: string,
  action: string,
  answers: Record<string, string>,
  attachments: AgentAttachmentSummary | null,
  locale: AppLocale,
  conversationContext: string[],
) {
  const normalizedAction = normalizeAction(action);
  const hasQuestionPoolSignal = Boolean(
    attachments &&
      (
        attachments.totalQuestions > 0 ||
        attachments.questionFileCount > 0 ||
        attachments.contentKinds.includes("question_set") ||
        attachments.contentKinds.includes("mixed")
      ),
  );
  const attachmentMode: AgentTaskContext["attachmentMode"] =
    !attachments ? "none"
      : normalizedAction === "create_worksheet" && hasQuestionPoolSignal
        ? "scan_pool_worksheet"
      : normalizedAction.startsWith("scan_") && hasQuestionPoolSignal
        ? "scan_pool"
      : "material_reference";

  const savePreference: AgentTaskContext["savePreference"] =
    attachmentMode === "scan_pool_worksheet" ? "temp_only"
      : normalizedAction === "save_exercises" ? "default"
      : normalizedAction === "generate_exercises" ? inferExerciseSavePreference(message)
      : "save_after_confirm";

  return buildAgentTaskContext({
    message,
    action: normalizedAction,
    actionLabel: normalizedAction,
    curriculum: answers.curriculum,
    topic: answers.topic,
    scope: answers.scope,
    count: answers.count,
    duration: answers.duration,
    attachmentsSummary: attachments
      ? `${attachments.fileCount} 文件, ${attachments.totalQuestions} 题`
      : undefined,
    attachmentMode,
    poolQuestionCount: attachments?.totalQuestions ?? undefined,
    savePreference,
    conversationContext,
  });
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function resolveAgentPreflight(
  input: Omit<AgentPreflightRequest, "clarifyRound"> & { clarifyRound?: number },
): Promise<AgentPreflightResponse> {
  const locale = input.locale ?? "zh";
  const fullInput = { ...input, clarifyRound: input.clarifyRound ?? 0 } as AgentPreflightRequest;
  const deterministicFallback = resolveDeterministicPreflightFallback(fullInput);
  const explicitAction = normalizeAction(
    normalizeFieldValue(input.answers.action || input.sessionDefaults.action),
  );
  const messageAction = resolveMessageAction(fullInput) ?? "";
  const hasAttachments = (input.attachments?.fileCount ?? 0) > 0;
  const hasCarryoverSignal = shouldUseConversationCarry(fullInput, explicitAction || messageAction);
  const shouldUseDeterministicFastPath =
    fullInput.clarifyRound >= MAX_CLARIFY_ROUNDS ||
    GREETING_ONLY_PATTERN.test(fullInput.message) ||
    hasAttachments ||
    hasCarryoverSignal ||
    explicitAction !== "custom" ||
    Boolean(messageAction) ||
    (deterministicFallback.status === "ready" &&
      deterministicFallback.taskContext.action !== "custom");

  if (shouldUseDeterministicFastPath) {
    return deterministicFallback;
  }

  const haiku = await callHaikuPreflight(fullInput);

  if (!haiku) {
    return deterministicFallback;
  }

  const action = normalizeAction(haiku.action);
  const mergedAnswers = applySessionDefaultGuards({
    input: fullInput,
    action,
    answers: {
      ...input.sessionDefaults,
      ...input.answers,
      ...Object.fromEntries(
        Object.entries(haiku.answers).filter(([, v]) => v),
      ),
      action,
    },
  });

  if (haiku.decision === "clarify" && haiku.question?.text) {
    if (
      shouldForceReadyFromClarify({
        input: fullInput,
        action,
        mergedAnswers,
        questionField: haiku.question.field,
      })
    ) {
      return {
        status: "ready",
        summary: buildReadySummary(locale, haiku.summary, fullInput.clarifyRound),
        collectedAnswers: mergedAnswers,
        enrichedPrompt: buildEnrichedPrompt(input.message, action, mergedAnswers, locale),
        taskContext: buildTaskContext(
          input.message,
          action,
          mergedAnswers,
          input.attachments ?? null,
          locale,
          input.conversationContext ?? [],
        ),
      };
    }

    const q = haiku.question;
    const question: AgentClarificationQuestion = {
      id: `agent-${q.field}`,
      question: q.text,
      field: q.field,
      questionType: "required",
      placeholder: q.placeholder || undefined,
      options: q.options.map((opt, i) => ({
        key: `${q.field}-${i}`,
        label: opt.label,
        value: opt.value,
        field: q.field,
        isOther: opt.isOther ?? false,
        description: opt.description || undefined,
      })),
    };

    return {
      status: "needs_info",
      summary: haiku.summary,
      collectedAnswers: mergedAnswers,
      question,
      taskContext: buildTaskContext(
        input.message, action, mergedAnswers,
        input.attachments ?? null, locale,
        input.conversationContext ?? [],
      ),
    };
  }

  return {
    status: "ready",
    summary: haiku.summary,
    collectedAnswers: mergedAnswers,
    enrichedPrompt: buildEnrichedPrompt(input.message, action, mergedAnswers, locale),
    taskContext: buildTaskContext(
      input.message, action, mergedAnswers,
      input.attachments ?? null, locale,
      input.conversationContext ?? [],
    ),
  };
}

// Keep backward compatibility export
export async function resolveAgentPreflightFallback(
  input: Omit<AgentPreflightRequest, "clarifyRound"> & { clarifyRound?: number },
): Promise<AgentPreflightResponse> {
  return resolveDeterministicPreflightFallback({
    ...input,
    clarifyRound: input.clarifyRound ?? 0,
  } as AgentPreflightRequest);
}
