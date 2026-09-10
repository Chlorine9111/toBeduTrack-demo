import { generateToolInputWithGateway } from "@/lib/ai/gateway";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import { stripEmbeddedArtifactPayload } from "@/lib/agent/artifact-payload";
import type { ContextFragment } from "@/lib/context-engineering/core";
import { readTeacherMemoryView } from "@/lib/teacher-memory/state";
import type { TeacherMemoryRecord } from "@/lib/teacher-memory/types";

type ConversationRole = "user" | "assistant" | "system";

export type AgentConversationMessage = {
  role: ConversationRole;
  content: string;
  createdAt?: string;
  sources?: unknown;
};

export type AgentMemoryPreview = {
  sessions: number;
  favoriteTool: string | null;
  recentTopics: string[];
  activeGoals: string[];
  openLoops: string[];
  closedLoops: string[];
  proceduralMemory: string[];
  semanticMemory: string[];
  episodicMemory: string[];
  lastConversationTitle: string | null;
};

export type AgentConversationContext = {
  olderSummary: string;
  recentMessages: AgentConversationMessage[];
  latestAssistantArtifact: string;
  latestAssistantReply: string;
  recentTranscript: string;
};

export type AgentLongTermMemoryUpdate = {
  conversationSummary: string;
  recentTopics: string[];
  activeGoals: string[];
  openLoops: string[];
  closedLoops: string[];
  stablePreferences: string[];
  knowledgeAnchors: string[];
  proceduralMemory: string[];
  semanticMemory: string[];
  episodicMemory: string[];
  lastArtifactType: string;
  lastArtifactSummary: string;
  coreProfile?: {
    subjects: string[];
    teachingStyle: string;
    notes: string;
  };
};

function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item))
    .filter(Boolean);
}

function buildSourceContextSummary(sources: unknown) {
  if (!Array.isArray(sources)) return "";

  const sourceItems = sources
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
  const uploadedSources = sourceItems.filter((item) => item.kind === "uploaded_materials");
  const contentReferenceSources = sourceItems.filter(
    (item) => item.kind === "content_library_references",
  );

  const segments = uploadedSources.flatMap((item) => {
    const summary = asString(item.summary);
    if (summary) {
      return [`【当前材料摘要】\n${summary}`];
    }
    const files = Array.isArray(item.files)
      ? item.files.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      : [];
    if (files.length === 0) return [];
    return [
      `【当前材料】\n${files
        .map((file) => {
          const fileName = asString(file.fileName) || "未命名材料";
          const preview = asString(file.previewText);
          return preview ? `${fileName}: ${preview}` : fileName;
        })
        .join("\n")}`,
    ];
  });

  segments.push(
    ...contentReferenceSources.flatMap((item) => {
      const summary = asString(item.summary);
      if (summary) {
        return [`【已引用内容】\n${summary}`];
      }
      const references = Array.isArray(item.items)
        ? item.items.filter(
            (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object",
          )
        : [];
      if (references.length === 0) return [];
      return [
        `【已引用内容】\n${references
          .map((reference) => {
            const title = asString(reference.title) || "未命名内容";
            const courseName = asString(reference.courseName);
            const unitName = asString(reference.unitName);
            const placement = [courseName, unitName].filter(Boolean).join(" / ");
            return placement ? `${title}（${placement}）` : title;
          })
          .join("\n")}`,
      ];
    }),
  );

  return segments.join("\n\n").trim();
}

function dedupeStrings(items: string[], limit: number) {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const item of items) {
    const normalized = item.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(normalized);
    if (next.length >= limit) break;
  }

  return next;
}

function trimText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function normalizeLine(line: string) {
  return line.replace(/\s+/g, " ").trim();
}

const LESSON_PLAN_MARKERS = [
  "教学目标",
  "教学重点",
  "教学难点",
  "课堂导入",
  "新课讲授",
  "课堂活动",
  "板书设计",
  "作业布置",
  "课堂总结",
  "时间分配",
  "学情分析",
  "分层任务",
  "课堂结构",
  "全课时间轴",
  "教师备课清单",
  "设计逻辑说明",
];

export function looksLikeLessonPlanArtifact(text: string) {
  const normalized = text.replace(/\r/g, "").trim();
  if (!normalized) return false;

  if (/^#{1,6}\s*.*(教案|lesson\s*plan|mini\s*lesson|micro\s*lesson|微课)/im.test(normalized)) {
    return true;
  }

  const markerHits = LESSON_PLAN_MARKERS.filter((marker) => normalized.includes(marker)).length;
  const minuteBlocks = normalized.match(/\d+\s*分钟/g)?.length ?? 0;
  const timedBlocks = normalized.match(/(?:\d+\s*(?:分钟|min)|\d{1,2}:\d{2})/gi)?.length ?? 0;
  const freeformLessonSignals = [
    /课堂结构[:：]/i,
    /全课时间轴/i,
    /教师备课清单/i,
    /设计逻辑说明/i,
    /exit\s*check/i,
    /teacher\s*moves?/i,
  ].filter((pattern) => pattern.test(normalized)).length;

  return (
    markerHits >= 2 ||
    (markerHits >= 1 && minuteBlocks >= 2) ||
    (freeformLessonSignals >= 2 && timedBlocks >= 3)
  );
}

function compressMessageContent(text: string, maxLength = 420) {
  const normalized = text.replace(/\r/g, "").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;

  const headings = Array.from(normalized.matchAll(/^#{1,6}\s+(.+)$/gm))
    .map((match) => normalizeLine(match[1] ?? ""))
    .filter(Boolean)
    .slice(0, 4);
  const bullets = Array.from(normalized.matchAll(/^[\-\*\d.]+\s+(.+)$/gm))
    .map((match) => normalizeLine(match[1] ?? ""))
    .filter(Boolean)
    .slice(0, 5);
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((item) => normalizeLine(item))
    .filter(Boolean);

  const candidate = dedupeStrings(
    [
      paragraphs[0] ?? "",
      ...headings.map((item) => `标题:${item}`),
      ...bullets.map((item) => `要点:${item}`),
      paragraphs[paragraphs.length - 1] ?? "",
    ],
    8,
  ).join(" | ");

  if (candidate.length >= Math.min(maxLength, 180)) {
    return trimText(candidate, maxLength);
  }

  return trimText(
    `${normalized.slice(0, Math.max(120, maxLength - 80))} ... ${normalized.slice(-60)}`,
    maxLength,
  );
}

function summarizeOlderMessages(messages: AgentConversationMessage[]) {
  if (messages.length === 0) return "";
  const lines = messages
    .map((message, index) => {
      const prefix = message.role === "user" ? "教师" : message.role === "assistant" ? "助手" : "系统";
      return `${index + 1}. ${prefix}: ${compressMessageContent(message.content, 220)}`;
    })
    .slice(0, 12);

  return trimText(lines.join("\n"), 1800);
}

function findLatestAssistantReply(messages: AgentConversationMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index];
    if (item.role === "assistant" && item.content.trim()) {
      return item.content.trim();
    }
  }
  return "";
}

function guessArtifactType(text: string) {
  if (!text) return "response";
  if (looksLikeLessonPlanArtifact(text)) return "lesson_plan";
  if (/worksheet|练习卷|作业单|组卷|套卷|试卷|exam/i.test(text)) return "worksheet";
  if (/评分标准|rubric/i.test(text)) return "rubric";
  if (/pbl|项目式学习|项目制学习|driving question|核心挑战/i.test(text)) return "pbl";
  if (/题目|选择题|FRQ|题单/.test(text)) return "exercises";
  if (/来源|参考链接|https?:\/\//i.test(text)) return "research_summary";
  return "response";
}

function pickTopicCandidates(text: string) {
  const matches =
    text.match(
      /AP\s+[A-Za-z][A-Za-z\s&/-]{2,}|Unit\s*\d+[A-Za-z-]*|[\u4e00-\u9fa5]{2,12}(?:单元|函数|导数|积分|概率|统计|写作|阅读|实验|探究|课堂|教学|复习|备课|题型|评价|微积分|物理|化学|生物|经济|地理|历史)/g,
    ) ?? [];

  return dedupeStrings(
    matches.map((item) => normalizeLine(item)),
    6,
  );
}

function readLayeredMemory(params: {
  summary: Record<string, unknown>;
  preferences?: Record<string, unknown>;
}) {
  const responseStyle = asString(params.preferences?.responseStyle);
  const proceduralFallback = dedupeStrings(
    [
      ...asStringList(params.summary.stablePreferences),
      responseStyle ? `回答风格:${responseStyle}` : "",
    ],
    6,
  );
  const semanticFallback = dedupeStrings(
    [
      ...asStringList(params.summary.knowledgeAnchors),
      ...asStringList(params.summary.recentTopics).map((item) => `主题:${item}`),
    ],
    6,
  );
  const episodicFallback = dedupeStrings(
    [
      ...asStringList(params.summary.activeGoals).map((item) => `当前目标:${item}`),
      ...asStringList(params.summary.openLoops).map((item) => `待跟进:${item}`),
      asString(params.summary.latestConversationSummary)
        ? `上一轮摘要:${compressMessageContent(asString(params.summary.latestConversationSummary), 140)}`
        : "",
      asString(params.summary.lastArtifactSummary)
        ? `上一份产物:${compressMessageContent(asString(params.summary.lastArtifactSummary), 140)}`
        : "",
    ],
    6,
  );

  return {
    proceduralMemory: dedupeStrings(
      [...asStringList(params.summary.proceduralMemory), ...proceduralFallback],
      6,
    ),
    semanticMemory: dedupeStrings(
      [...asStringList(params.summary.semanticMemory), ...semanticFallback],
      6,
    ),
    episodicMemory: dedupeStrings(
      [...asStringList(params.summary.episodicMemory), ...episodicFallback],
      6,
    ),
  };
}

function buildFallbackMemoryUpdate(params: {
  memory: TeacherMemoryRecord;
  latestUserPrompt: string;
  latestAssistantReply: string;
  toolNames: string[];
  conversation: AgentConversationContext;
}): AgentLongTermMemoryUpdate {
  const summary = asObject(params.memory.summary);
  const preferences = asObject(params.memory.preferences);
  const view = readTeacherMemoryView(params.memory);
  const storedTopics = view.recentTopics;
  const storedGoals = view.activeGoals;
  const storedOpenLoops = view.openLoops;
  const storedAnchors = view.knowledgeAnchors;
  const storedPreferences = view.stablePreferences;
  const existingCoreProfile = view.coreProfile;

  const promptTopics = pickTopicCandidates(params.latestUserPrompt);
  const answerTopics = pickTopicCandidates(params.latestAssistantReply);
  const recentTopics = dedupeStrings([...promptTopics, ...answerTopics, ...storedTopics], 6);

  const conversationSummary = compressMessageContent(
    [params.latestUserPrompt, params.conversation.latestAssistantArtifact].filter(Boolean).join("\n"),
    280,
  );

  const activeGoals = dedupeStrings(
    [compressMessageContent(params.latestUserPrompt, 120), ...storedGoals],
    5,
  );

  const openLoops = dedupeStrings(
    [
      ...storedOpenLoops,
      /继续|下一步|再给我|扩展|调整|优化|改成/.test(params.latestUserPrompt)
        ? compressMessageContent(params.latestUserPrompt, 120)
        : "",
    ],
    5,
  );
  const closedLoops = dedupeStrings(
    [
      /完成|已处理|不用了|解决了|关闭|搞定/.test(params.latestUserPrompt)
        ? compressMessageContent(params.latestUserPrompt, 120)
        : "",
      /已完成|已解决|已处理/.test(params.latestAssistantReply)
        ? compressMessageContent(params.latestAssistantReply, 120)
        : "",
    ],
    4,
  );

  const stablePreferences = dedupeStrings(
    [
      ...storedPreferences,
      /结构化|表格|分点|步骤/.test(params.latestUserPrompt) ? "偏好结构化可执行回答" : "",
      params.toolNames.includes("search_teacher_knowledge") ? "优先结合老师私有资料" : "",
      params.toolNames.includes("web_search") ? "需要时效性信息时优先联网核验" : "",
    ],
    5,
  );

  const knowledgeAnchors = dedupeStrings(
    [
      ...storedAnchors,
      params.toolNames.length > 0 ? `本轮工具: ${params.toolNames.join(", ")}` : "",
      recentTopics[0] ? `当前主题: ${recentTopics[0]}` : "",
    ],
    5,
  );

  const proceduralMemory = dedupeStrings(
    [
      ...view.proceduralMemory,
      ...stablePreferences,
      asString(preferences.responseStyle)
        ? `回答风格:${asString(preferences.responseStyle)}`
        : "",
    ],
    6,
  );
  const semanticMemory = dedupeStrings(
    [
      ...view.semanticMemory,
      ...knowledgeAnchors,
      ...recentTopics.map((item) => `主题:${item}`),
    ],
    6,
  );
  const episodicMemory = dedupeStrings(
    [
      ...view.episodicMemory,
      ...activeGoals.map((item) => `当前目标:${item}`),
      ...openLoops.map((item) => `待跟进:${item}`),
      conversationSummary ? `本轮摘要:${conversationSummary}` : "",
      params.latestAssistantReply
        ? `本轮助手输出:${compressMessageContent(params.latestAssistantReply, 140)}`
        : "",
    ],
    6,
  );

  return {
    conversationSummary,
    recentTopics,
    activeGoals,
    openLoops,
    closedLoops,
    stablePreferences,
    knowledgeAnchors,
    proceduralMemory,
    semanticMemory,
    episodicMemory,
    lastArtifactType: guessArtifactType(params.latestAssistantReply),
    lastArtifactSummary: compressMessageContent(params.latestAssistantReply, 260),
    coreProfile:
      existingCoreProfile.subjects.length > 0 ||
      existingCoreProfile.teachingStyle ||
      existingCoreProfile.notes
        ? {
            subjects: existingCoreProfile.subjects,
            teachingStyle: existingCoreProfile.teachingStyle,
            notes: existingCoreProfile.notes,
          }
        : undefined,
  };
}

export function normalizeAgentMemoryPreview(memory: TeacherMemoryRecord): AgentMemoryPreview {
  const summary = asObject(memory.summary);
  const toolUsage = asObject(summary.toolUsage);
  const view = readTeacherMemoryView(memory);

  let favoriteTool: string | null = null;
  let favoriteToolScore = -1;
  for (const [key, value] of Object.entries(toolUsage)) {
    const score = Number(value);
    if (Number.isFinite(score) && score > favoriteToolScore) {
      favoriteTool = key;
      favoriteToolScore = score;
    }
  }

  return {
    sessions: Number(summary.sessions ?? 0) || 0,
    favoriteTool,
    recentTopics: view.recentTopics.slice(0, 4),
    activeGoals: view.activeGoals.slice(0, 4),
    openLoops: view.openLoops.slice(0, 4),
    closedLoops: view.closedLoops.slice(0, 4),
    proceduralMemory: view.proceduralMemory.slice(0, 4),
    semanticMemory: view.semanticMemory.slice(0, 4),
    episodicMemory: view.episodicMemory.slice(0, 4),
    lastConversationTitle: asString(summary.lastConversationTitle) || null,
  };
}

export function buildAgentMemoryFragments(memory: TeacherMemoryRecord): ContextFragment[] {
  const summary = asObject(memory.summary);
  const preferences = asObject(memory.preferences);
  const preview = normalizeAgentMemoryPreview(memory);
  const view = readTeacherMemoryView(memory);
  const responseStyle = asString(preferences.responseStyle);
  const latestConversationSummary = view.latestConversationSummary;
  const lastArtifactSummary = view.lastArtifactSummary;

  const fragments: ContextFragment[] = [];

  const coreSubjects = view.coreProfile.subjects;
  const coreTeachingStyle = view.coreProfile.teachingStyle;
  const coreNotes = view.coreProfile.notes;
  const coreProfileLines: string[] = [];
  if (coreSubjects.length > 0) coreProfileLines.push(`教授科目: ${coreSubjects.join(", ")}`);
  if (coreTeachingStyle) coreProfileLines.push(`教学风格: ${coreTeachingStyle}`);
  if (coreNotes) coreProfileLines.push(coreNotes);
  if (coreProfileLines.length > 0) {
    fragments.push({
      id: "memory-core-profile",
      kind: "memory",
      label: "教师档案",
      content: coreProfileLines.join("\n"),
      priority: 12,
      maxLength: 200,
      sticky: true,
      suppressOnReset: false,
    });
  }

  const proceduralLines = dedupeStrings(
    [
      responseStyle ? `回答风格偏好:${responseStyle}` : "",
      preview.favoriteTool ? `常用工具:${preview.favoriteTool}` : "",
      ...preview.proceduralMemory,
    ],
    6,
  );
  if (proceduralLines.length > 0) {
    fragments.push({
      id: "memory-procedural",
      kind: "memory",
      label: "稳定偏好与习惯",
      content: proceduralLines.join("\n"),
      priority: 10,
      maxLength: 280,
      sticky: true,
      suppressOnReset: false,
    });
  }

  const semanticLines = dedupeStrings(
    [
      ...preview.recentTopics.map((item) => `长期主题:${item}`),
      ...preview.semanticMemory,
    ],
    6,
  );
  if (semanticLines.length > 0) {
    fragments.push({
      id: "memory-semantic",
      kind: "memory",
      label: "稳定事实与知识锚点",
      content: semanticLines.join("\n"),
      priority: 8,
      maxLength: 320,
      suppressOnReset: false,
    });
  }

  const episodicLines = dedupeStrings(
    [
      ...preview.activeGoals.map((item) => `当前目标:${item}`),
      ...preview.openLoops.map((item) => `待跟进:${item}`),
      ...preview.episodicMemory,
      latestConversationSummary
        ? `上一轮对话摘要:${compressMessageContent(latestConversationSummary, 140)}`
        : "",
      lastArtifactSummary
        ? `上一份重要产物:${compressMessageContent(lastArtifactSummary, 140)}`
        : "",
    ],
    6,
  );
  if (episodicLines.length > 0) {
    fragments.push({
      id: "memory-episodic",
      kind: "memory",
      label: "最近任务记忆",
      content: episodicLines.join("\n"),
      priority: 7,
      maxLength: 360,
      suppressOnReset: true,
    });
  }

  return fragments;
}

export function buildAgentMemoryPrompt(memory: TeacherMemoryRecord) {
  const preview = normalizeAgentMemoryPreview(memory);
  const fragments = buildAgentMemoryFragments(memory);
  const lines = [
    preview.sessions > 0 ? `累计使用会话: ${preview.sessions}` : "",
    preview.lastConversationTitle ? `最近对话标题: ${preview.lastConversationTitle}` : "",
    ...fragments.map((fragment) => `【${fragment.label}】\n${fragment.content}`),
  ].filter(Boolean);

  return {
    prompt: lines.join("\n"),
    preview,
    fragments,
  };
}

export function buildAgentConversationContext(messages: AgentConversationMessage[]): AgentConversationContext {
  const recentWindow = 8;
  const normalizedMessages = messages
    .map((item) => ({
      role: item.role,
      content: (() => {
        const visibleContent = stripEmbeddedArtifactPayload(item.content).trim();
        const sourceSummary = buildSourceContextSummary(item.sources);
        if (!sourceSummary) return visibleContent;
        return [visibleContent, sourceSummary].filter(Boolean).join("\n\n").trim();
      })(),
      createdAt: item.createdAt,
    }))
    .filter((item) => item.content);

  const olderMessages =
    normalizedMessages.length > recentWindow
      ? normalizedMessages.slice(0, normalizedMessages.length - recentWindow)
      : [];
  const recentMessages = normalizedMessages
    .slice(-recentWindow)
    .map((item) => ({
      ...item,
      content: compressMessageContent(item.content, item.role === "assistant" ? 520 : 380),
    }));

  const latestAssistantReply = findLatestAssistantReply(normalizedMessages);

  return {
    olderSummary: summarizeOlderMessages(olderMessages),
    recentMessages,
    latestAssistantArtifact: compressMessageContent(latestAssistantReply, 520),
    latestAssistantReply,
    recentTranscript: trimText(
      recentMessages
        .map((item) => `${item.role === "user" ? "教师" : item.role === "assistant" ? "助手" : "系统"}: ${item.content}`)
        .join("\n"),
      2600,
    ),
  };
}

export async function extractAgentLongTermMemoryUpdate(params: {
  memory: TeacherMemoryRecord;
  latestUserPrompt: string;
  latestAssistantReply: string;
  toolNames: string[];
  conversation: AgentConversationContext;
}): Promise<AgentLongTermMemoryUpdate> {
  const fallback = buildFallbackMemoryUpdate(params);
  const timeoutMs = 1800;
  const previousSummary = buildAgentMemoryPrompt(params.memory).prompt;
  const transcript = trimText(
    [
      previousSummary ? `【已有长期记忆】\n${previousSummary}` : "",
      params.conversation.olderSummary ? `【更早对话摘要】\n${params.conversation.olderSummary}` : "",
      params.conversation.recentTranscript ? `【最近对话】\n${params.conversation.recentTranscript}` : "",
      `【本轮教师输入】\n${params.latestUserPrompt}`,
      `【本轮助手输出】\n${trimText(params.latestAssistantReply, 2200)}`,
      params.toolNames.length > 0 ? `【本轮工具】\n${params.toolNames.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    9000,
  );

  try {
    const payload = await Promise.race([
      generateToolInputWithGateway<Partial<AgentLongTermMemoryUpdate>>({
        model: getResolvedLanguageModelForTask("assistant_memory_extract"),
        systemPrompt: [
          "你是老师工作台的长期对话记忆提取器。",
          "只保留对未来多轮追问真正有价值的信息：持续主题、当前目标、未完成事项、稳定偏好、可靠知识锚点、上一份关键产物摘要。",
          "请把记忆显式拆成三层：proceduralMemory=稳定偏好与做事习惯，semanticMemory=稳定事实与长期知识锚点，episodicMemory=最近任务与待跟进事项。",
          "如果本轮明确表示某个待跟进事项已完成、已关闭或不再需要，请把它写入 closedLoops。",
          "另外提取教师档案 coreProfile：subjects=教授的AP科目，teachingStyle=教学风格偏好，notes=其他身份备注。仅在对话明确提及时更新，不要猜测。",
          "不要记录寒暄，不要复制大段原文，不要编造不存在的事实。",
        ].join("\n"),
        userPrompt: transcript,
        tool: {
          name: "return_agent_memory_state",
          description: "返回可写入长期记忆的对话状态",
          inputSchema: {
            type: "object",
            required: [
              "conversationSummary",
              "recentTopics",
              "activeGoals",
              "openLoops",
              "closedLoops",
              "stablePreferences",
              "knowledgeAnchors",
              "proceduralMemory",
              "semanticMemory",
              "episodicMemory",
              "lastArtifactType",
              "lastArtifactSummary",
            ],
            properties: {
              conversationSummary: { type: "string" },
              recentTopics: { type: "array", items: { type: "string" } },
              activeGoals: { type: "array", items: { type: "string" } },
              openLoops: { type: "array", items: { type: "string" } },
              closedLoops: { type: "array", items: { type: "string" } },
              stablePreferences: { type: "array", items: { type: "string" } },
              knowledgeAnchors: { type: "array", items: { type: "string" } },
              proceduralMemory: { type: "array", items: { type: "string" } },
              semanticMemory: { type: "array", items: { type: "string" } },
              episodicMemory: { type: "array", items: { type: "string" } },
              lastArtifactType: { type: "string" },
              lastArtifactSummary: { type: "string" },
              coreProfile: {
                type: "object",
                properties: {
                  subjects: { type: "array", items: { type: "string" } },
                  teachingStyle: { type: "string" },
                  notes: { type: "string" },
                },
              },
            },
          },
        },
        maxTokens: 2400,
        temperature: 0,
      }).then((result) => result.input),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("agent_memory_extract_timeout")), timeoutMs);
      }),
    ]);

    return {
      conversationSummary: asString(payload.conversationSummary) || fallback.conversationSummary,
      recentTopics: dedupeStrings(
        [...asStringList(payload.recentTopics), ...fallback.recentTopics],
        6,
      ),
      activeGoals: dedupeStrings(
        [...asStringList(payload.activeGoals), ...fallback.activeGoals],
        5,
      ),
      openLoops: dedupeStrings(
        [...asStringList(payload.openLoops), ...fallback.openLoops],
        5,
      ),
      closedLoops: dedupeStrings(
        [...asStringList(payload.closedLoops), ...fallback.closedLoops],
        4,
      ),
      stablePreferences: dedupeStrings(
        [...asStringList(payload.stablePreferences), ...fallback.stablePreferences],
        5,
      ),
      knowledgeAnchors: dedupeStrings(
        [...asStringList(payload.knowledgeAnchors), ...fallback.knowledgeAnchors],
        5,
      ),
      proceduralMemory: dedupeStrings(
        [...asStringList(payload.proceduralMemory), ...fallback.proceduralMemory],
        6,
      ),
      semanticMemory: dedupeStrings(
        [...asStringList(payload.semanticMemory), ...fallback.semanticMemory],
        6,
      ),
      episodicMemory: dedupeStrings(
        [...asStringList(payload.episodicMemory), ...fallback.episodicMemory],
        6,
      ),
      lastArtifactType: asString(payload.lastArtifactType) || fallback.lastArtifactType,
      lastArtifactSummary: asString(payload.lastArtifactSummary) || fallback.lastArtifactSummary,
      coreProfile: (() => {
        const rawProfile = asObject(payload.coreProfile);
        const hasProfile = Object.keys(rawProfile).length > 0;
        if (!hasProfile) return fallback.coreProfile;
        return {
          subjects: dedupeStrings(asStringList(rawProfile.subjects), 6),
          teachingStyle: asString(rawProfile.teachingStyle),
          notes: asString(rawProfile.notes),
        };
      })(),
    };
  } catch {
    return fallback;
  }
}
