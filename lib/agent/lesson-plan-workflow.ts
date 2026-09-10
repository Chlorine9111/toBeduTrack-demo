import { z } from "zod";
import { searchWebWithClaude } from "@/lib/assistant/claude-web-search";
import { searchTeacherKnowledgeRagDetailed } from "@/lib/assistant/knowledge-rag";
import {
  generateGatewayText,
  generateStructuredObjectWithGateway,
  streamGatewayTextToCompletion,
  type GatewayModelInput,
} from "@/lib/ai/gateway";
import {
  LESSON_PLAN_REFINE_PATTERN,
  trimQueryText,
  trimText,
  type UploadedMaterial,
} from "@/lib/agent/chat-shared";
import { stripModelInternalTags } from "@/lib/agent/artifact-text";
import {
  STREAMING_OUTLINE_PROTOCOL_PROMPT,
  stripStreamingOutlinePrelude,
} from "@/lib/agent/markdown-outline-streaming";
import { buildTaskAwareMaterialContext } from "@/lib/agent/material-context";
import { budgetPromptSections, estimateTokenCount, trimTextToApproxTokens } from "@/lib/ai/prompt-budget";

export type LessonPlanAudit = {
  scores: {
    goalAlignment: number;
    coherence: number;
    actionability: number;
    integration: number;
    engagement: number;
    differentiation: number;
  };
  average: number;
  strengths: string[];
  mustFix: string[];
};

export type LessonPlanAuditMode = "deterministic_fast" | "full_ai";

const auditSchema = z.object({
  scores: z.object({
    goalAlignment: z.number().min(0).max(10),
    coherence: z.number().min(0).max(10),
    actionability: z.number().min(0).max(10),
    integration: z.number().min(0).max(10),
    engagement: z.number().min(0).max(10),
    differentiation: z.number().min(0).max(10),
  }),
  strengths: z.array(z.string()).min(0).max(6),
  mustFix: z.array(z.string()).min(0).max(8),
});

const LESSON_PLAN_WEB_SEARCH_PATTERN =
  /(最新|最近|近期|案例|真实案例|时事|新闻|来源|引用|文献|\breferences?\b|\bsources?\b|latest|recent|case\s*study|current\s+events?)/i;

const LESSON_ACTIVITY_SIGNAL =
  /(活动|讨论|练习|任务|互动|实验|同伴|pair|share|task|activity|practice|discussion)/i;
const LESSON_ASSESSMENT_SIGNAL =
  /(评估|评价|检测|反馈|exit ticket|check for understanding|assessment|quiz|反思|作业)/i;
const LESSON_DIFFERENTIATION_SIGNAL =
  /(分层|差异化|支持|拓展|challenge|support|extension|基础|进阶)/i;
const LESSON_TEACHER_MOVE_SIGNAL =
  /(提问|追问|示范|板书|提示|话术|教师|teacher move|questioning)/i;

function extractKeywords(text: string) {
  const tokens = text
    .toLowerCase()
    .match(/[a-z]{3,}|[\u4e00-\u9fa5]{2,}/g)
    ?.filter((token) => token.length >= 2) ?? [];
  const stopwords = new Set([
    "请基于",
    "生成",
    "完整",
    "教案",
    "课堂",
    "教学",
    "老师",
    "学生",
    "分钟",
    "lesson",
    "plan",
  ]);
  const unique: string[] = [];
  for (const token of tokens) {
    if (stopwords.has(token)) continue;
    if (unique.includes(token)) continue;
    unique.push(token);
    if (unique.length >= 12) break;
  }
  return unique;
}

function filterRelevantWebResults(
  results: Array<{ title: string; url: string; snippet: string }>,
  keywords: string[],
) {
  if (keywords.length === 0) return results.slice(0, 3);
  return results
    .map((item) => {
      const text = `${item.title} ${item.snippet}`.toLowerCase();
      const score = keywords.reduce((count, keyword) => (text.includes(keyword) ? count + 1 : count), 0);
      return { ...item, score };
    })
    .filter((item) => item.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => ({ title: item.title, url: item.url, snippet: item.snippet }));
}

function clampScore(value: number) {
  return Math.max(0, Math.min(10, value));
}

function parseAuditFromText(text: string): LessonPlanAudit | null {
  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```/, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as {
      scores?: Partial<LessonPlanAudit["scores"]>;
      strengths?: string[];
      mustFix?: string[];
    };
    const scores = {
      goalAlignment: clampScore(Number(parsed.scores?.goalAlignment ?? 0)),
      coherence: clampScore(Number(parsed.scores?.coherence ?? 0)),
      actionability: clampScore(Number(parsed.scores?.actionability ?? 0)),
      integration: clampScore(Number(parsed.scores?.integration ?? 0)),
      engagement: clampScore(Number(parsed.scores?.engagement ?? 0)),
      differentiation: clampScore(Number(parsed.scores?.differentiation ?? 0)),
    };
    const values = Object.values(scores);
    return {
      scores,
      average: Number((values.reduce((sum, item) => sum + item, 0) / values.length).toFixed(2)),
      strengths: (parsed.strengths ?? []).map((item) => `${item}`).filter(Boolean).slice(0, 4),
      mustFix: (parsed.mustFix ?? []).map((item) => `${item}`).filter(Boolean).slice(0, 6),
    };
  } catch {
    return null;
  }
}

function scoreFromCoverage(
  covered: number,
  total: number,
  maxScore = 9.4,
  minScore = 7.4,
) {
  const safeTotal = Math.max(1, total);
  const ratio = Math.max(0, Math.min(1, covered / safeTotal));
  return Number((minScore + (maxScore - minScore) * ratio).toFixed(2));
}

function buildDeterministicAudit(markdown: string): LessonPlanAudit {
  const compact = trimText(markdown.replace(/\s+/g, " ").trim(), 20_000);
  const topLevelSections =
    markdown.match(/^##\s+.+$/gm)?.map((line) => line.trim()).filter(Boolean) ?? [];
  const sectionCoverage = topLevelSections.length;
  const hasScheduleMinutes = /(\d{1,3})\s*(分钟|min|mins|minutes)/i.test(compact);
  const hasTeacherMoves = LESSON_TEACHER_MOVE_SIGNAL.test(compact);
  const hasActivity = LESSON_ACTIVITY_SIGNAL.test(compact);
  const hasAssessment = LESSON_ASSESSMENT_SIGNAL.test(compact);
  const hasDifferentiation = LESSON_DIFFERENTIATION_SIGNAL.test(compact);
  const contentLength = compact.length;

  const mustFix = [
    ...(sectionCoverage >= 4 ? [] : ["顶层结构不够清晰，建议至少拆成 4 个可执行环节。"]),
    ...(hasScheduleMinutes ? [] : ["缺少明确时间分配，建议补充关键环节的分钟安排。"]),
    ...(hasAssessment ? [] : ["缺少明确的学习检查或收束设计，建议补一个可执行的评估节点。"]),
    ...(hasActivity ? [] : ["互动或任务设计偏弱，建议补充学生真实参与的活动。"]),
  ].slice(0, 6);

  const goalAlignment = scoreFromCoverage(sectionCoverage, 6, 9.5, 7.8);
  const coherence = scoreFromCoverage(sectionCoverage, 6, 9.3, 7.5);
  const actionability = Number(
    Math.max(
      7.2,
      Math.min(
        9.5,
        scoreFromCoverage(sectionCoverage, 6, 9.2, 7.2) +
          (hasScheduleMinutes ? 0.2 : -0.25) +
          (hasTeacherMoves ? 0.2 : -0.1),
      ),
    ).toFixed(2),
  );
  const integration = Number(
    Math.max(
      7.1,
      Math.min(
        9.4,
        scoreFromCoverage(sectionCoverage, 6, 9.1, 7.1) + (hasActivity ? 0.2 : 0),
      ),
    ).toFixed(2),
  );
  const engagement = Number(
    Math.max(
      7.1,
      Math.min(
        9.4,
        scoreFromCoverage(sectionCoverage, 6, 9.0, 7.1) +
          (hasActivity ? 0.25 : -0.15),
      ),
    ).toFixed(2),
  );
  const differentiation = Number(
    Math.max(
      7.0,
      Math.min(
        9.4,
        scoreFromCoverage(sectionCoverage, 6, 8.9, 7.0) +
          (hasDifferentiation ? 0.35 : -0.25),
      ),
    ).toFixed(2),
  );

  const scores = {
    goalAlignment,
    coherence,
    actionability,
    integration,
    engagement,
    differentiation,
  };
  const average = Number(
    (
      Object.values(scores).reduce((sum, value) => sum + value, 0) /
      Object.values(scores).length
    ).toFixed(2),
  );

  const strengths = [
    sectionCoverage >= 5 ? "顶层结构清晰，课堂推进路径比较完整。" : "",
    hasScheduleMinutes ? "课时安排包含分钟分配，便于教师直接执行。" : "",
    hasActivity ? "包含学生任务或互动设计，有助于课堂参与。" : "",
    hasAssessment ? "包含形成性评价或练习安排，便于课堂即时判断学习效果。" : "",
    hasDifferentiation ? "分层教学策略明确，适合不同层次学生。" : "",
    contentLength >= 900 ? "教案内容完整度较高，已覆盖课堂执行细节。" : "",
  ]
    .filter(Boolean)
    .slice(0, 4);

  return {
    scores,
    average,
    strengths,
    mustFix,
  };
}

async function resolveLessonPlanAudit(params: {
  model: GatewayModelInput;
  teacherRequest: string;
  markdown: string;
  systemPrompt: string;
  finalAudit?: boolean;
}) {
  const auditRaw = await generateStructuredObjectWithGateway({
    model: params.model,
    schema: auditSchema,
    schemaName: "lesson_plan_audit",
    schemaDescription: "教案质量审查结果",
    systemPrompt: params.systemPrompt,
    userPrompt: [
      `教师需求：${params.teacherRequest}`,
      `教案草案：\n${params.markdown}`,
    ].join("\n\n"),
    maxTokens: params.finalAudit ? 700 : 800,
    temperature: 0,
    maxRetries: 1,
  }).catch(() => null);

  if (auditRaw?.object) {
    const scores = {
      goalAlignment: clampScore(auditRaw.object.scores.goalAlignment),
      coherence: clampScore(auditRaw.object.scores.coherence),
      actionability: clampScore(auditRaw.object.scores.actionability),
      integration: clampScore(auditRaw.object.scores.integration),
      engagement: clampScore(auditRaw.object.scores.engagement),
      differentiation: clampScore(auditRaw.object.scores.differentiation),
    };
    const scoreValues = Object.values(scores);
    return {
      scores,
      average: Number((scoreValues.reduce((acc, value) => acc + value, 0) / scoreValues.length).toFixed(2)),
      strengths: auditRaw.object.strengths.slice(0, 4),
      mustFix: auditRaw.object.mustFix.slice(0, 6),
    } satisfies LessonPlanAudit;
  }

  const fallbackAudit = await generateGatewayText({
    model: params.model,
    temperature: 0,
    maxOutputTokens: params.finalAudit ? 700 : 800,
    system:
      "请输出严格 JSON：{\"scores\":{\"goalAlignment\":0-10,\"coherence\":0-10,\"actionability\":0-10,\"integration\":0-10,\"engagement\":0-10,\"differentiation\":0-10},\"strengths\":[],\"mustFix\":[]}",
    prompt: `教师需求：${params.teacherRequest}\n\n教案草案：\n${params.markdown}`,
    maxRetries: 1,
  }).catch(() => null);

  if (fallbackAudit?.text) {
    const parsed = parseAuditFromText(fallbackAudit.text);
    if (parsed) {
      return parsed;
    }
  }

  return buildDeterministicAudit(params.markdown);
}

export async function generateLessonPlanWithWorkflow(params: {
  model: GatewayModelInput;
  teacherId: string;
  teacherRequest: string;
  durationMinutes?: number;
  includeWebSearch?: boolean;
  uploadedMaterials: UploadedMaterial[];
  previousLessonPlan?: string;
  memoryPrompt?: string;
  conversationSummary?: string;
  retrievalHint?: string;
  onTextDelta?: (delta: string) => void | Promise<void>;
  onTextReset?: () => void | Promise<void>;
}) {
  const refineMode = LESSON_PLAN_REFINE_PATTERN.test(params.teacherRequest);
  const shouldUseWebSearch =
    params.includeWebSearch !== false &&
    !refineMode &&
    LESSON_PLAN_WEB_SEARCH_PATTERN.test(params.teacherRequest);
  const startedAt = Date.now();
  const timings: Record<string, number> = {};
  const workflowWarnings: string[] = [];
  const previousPlanContext = trimText(params.previousLessonPlan?.trim() ?? "", 10_000);
  const memoryPrompt = trimText(params.memoryPrompt?.trim() ?? "", 1_200);
  const conversationSummary = trimText(params.conversationSummary?.trim() ?? "", 1_000);
  const retrievalQuery = trimQueryText(
    [params.teacherRequest, params.retrievalHint ?? ""].filter(Boolean).join(" "),
  );

  const knowledgeStartedAt = Date.now();
  const webStartedAt = Date.now();
  const [knowledgeResponse, web] = await Promise.all([
    searchTeacherKnowledgeRagDetailed({
      teacherId: params.teacherId,
      query: retrievalQuery,
      limit: 2,
    }).catch(() => ({
      results: [],
      retrieval: {
        strategy: "fallback" as const,
        confidence: "low" as const,
        corrected: false,
        originalQuery: retrievalQuery,
        finalQuery: retrievalQuery,
        reason: "教师知识库检索失败",
        attempts: [],
      },
    })),
    shouldUseWebSearch
      ? searchWebWithClaude(`${retrievalQuery} 最新案例 教学策略`, { timeoutMs: 5000 }).catch(() => null)
      : Promise.resolve(null),
  ]);
  timings.knowledgeMs = Date.now() - knowledgeStartedAt;
  timings.webMs = Date.now() - webStartedAt;
  const knowledgeHits = knowledgeResponse.results;
  const knowledgeRetrieval = knowledgeResponse.retrieval;

  const keywordText = [
    params.teacherRequest,
    ...params.uploadedMaterials.map((item) => item.fileName),
    ...params.uploadedMaterials.map((item) => trimText(item.textContent, 240)),
  ].join("\n");
  const keywords = extractKeywords(keywordText);
  const webResults = web ? filterRelevantWebResults(web.results, keywords) : [];
  const webSummary = web && webResults.length > 0 ? trimText(web.summary || "", 360) : "";

  const materialContext = buildTaskAwareMaterialContext({
    materials: params.uploadedMaterials,
    taskKind: "lesson_plan",
    query: params.teacherRequest,
    maxLength: 1_400,
  });
  const knowledgeContext = knowledgeHits
    .map((item, index) => `【知识库${index + 1}】${trimText(item.content, 320)}`)
    .join("\n\n");
  if (knowledgeRetrieval?.confidence === "low" && knowledgeHits.length > 0) {
    workflowWarnings.push("教师知识库命中较弱，本轮教案会优先参考上传材料和当前需求。");
  }
  const webContext = webSummary
    ? [
        `【联网检索摘要】\n${webSummary}`,
        "【联网来源】",
        ...webResults.map((item) => `- ${item.title} ${item.url}`),
      ].join("\n")
    : "";

  // Synthesis 步骤已移除：上下文直接拼入 Draft prompt，减少一次 LLM 调用
  const synthesisText = "";
  timings.synthesisMs = 0;

  const generationStartedAt = Date.now();
  const compressedContext = synthesisText
    ? `【教案设计摘要】\n${synthesisText}`
    : [materialContext, knowledgeContext ? `【教师历史资料】\n${knowledgeContext}` : "", webContext]
        .filter(Boolean)
        .join("\n\n");
  const budgetedDraftSections = budgetPromptSections(
    [
      {
        key: "teacherRequest",
        text: params.teacherRequest,
        weight: 2.2,
        minTokens: 180,
        maxTokens: 460,
      },
      {
        key: "memoryPrompt",
        text: memoryPrompt,
        weight: 0.8,
        minTokens: 100,
        maxTokens: 260,
      },
      {
        key: "conversationSummary",
        text: conversationSummary,
        weight: 0.8,
        minTokens: 90,
        maxTokens: 240,
      },
      {
        key: "previousPlanContext",
        text: previousPlanContext,
        weight: refineMode ? 1.8 : 0.4,
        minTokens: refineMode ? 180 : 40,
        maxTokens: refineMode ? 640 : 120,
        preserveTail: refineMode,
      },
      {
        key: "compressedContext",
        text: compressedContext,
        weight: 1.5,
        minTokens: 220,
        maxTokens: 880,
      },
    ],
    refineMode ? 2400 : 1900,
  );
  const preferCompactPrimaryDraft =
    !refineMode &&
    !params.uploadedMaterials.length &&
    !knowledgeContext &&
    !webContext &&
    !previousPlanContext &&
    !memoryPrompt &&
    !conversationSummary;
  const promptTokenEstimate = estimateTokenCount(
    [
      budgetedDraftSections.teacherRequest,
      budgetedDraftSections.memoryPrompt,
      budgetedDraftSections.conversationSummary,
      budgetedDraftSections.previousPlanContext,
      budgetedDraftSections.compressedContext,
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
  const shouldPreferCompactByBudget =
    promptTokenEstimate > 1500 || estimateTokenCount(budgetedDraftSections.compressedContext) > 820;
  const sharedDraftPrompt = [
    `教师需求：${budgetedDraftSections.teacherRequest}`,
    `课时：${params.durationMinutes ?? 45} 分钟`,
    budgetedDraftSections.memoryPrompt
      ? `\n【长期对话记忆】\n${budgetedDraftSections.memoryPrompt}`
      : "",
    budgetedDraftSections.conversationSummary
      ? `\n【历史对话摘要】\n${budgetedDraftSections.conversationSummary}`
      : "",
    refineMode && budgetedDraftSections.previousPlanContext
      ? `\n【上一版教案（请在此基础上改）】\n${budgetedDraftSections.previousPlanContext}`
      : "",
    budgetedDraftSections.compressedContext,
  ]
    .filter(Boolean)
    .join("\n\n");

  const fullDraftSystem = [
    "你是资深 AP 教学设计专家。",
    "目标：输出可直接上课的完整教案，但结构、环节、流程和命名都由你根据任务自主决定，不要机械套固定模板。",
    STREAMING_OUTLINE_PROTOCOL_PROMPT,
    "你决定的 NODE 可以是流程、任务、环节、活动、案例、讲解段、练习段、讨论段、反思段，或任何更适合该课题的组织方式。",
    "如果教师明确点名要某些环节或流程，优先满足；若未明确，就由你自行设计最自然、最可执行的课堂结构。",
    "要求：正式正文中的 ## 顶层标题必须与声明块中的 NODE 一一对应，顺序保持一致；需要细化时可在 ## 下继续使用 ###。",
    "要求：内容必须可执行、时间真实、互动自然；但不要为了凑板块生硬补内容。",
    "要求：总字数控制在 1000-1400 汉字，避免冗长推导。",
    "要求：避免 Markdown 表格，优先使用标题、短段落和项目符号。",
    "禁止在输出中保留内部标签（如【教案设计摘要】【知识库】【联网检索摘要】等），这些仅供你参考。",
    refineMode
      ? "当前任务是“微调上一版教案”。必须保持原学科、原章节、原主题，仅修改用户指定项；禁止换课题。"
      : "当前任务是“生成新教案”。",
    "输出格式：Markdown。",
  ].join("\n");
  const compactDraftSystem = [
    "你是 AP 教学设计专家。",
    "请输出一份紧凑但可直接上课的高质量教案，结构完全由你根据任务决定，不要套固定七段式。",
    STREAMING_OUTLINE_PROTOCOL_PROMPT,
    "NODE 数量和标题都由你决定；如果课题只需要 4 个大环节，就写 4 个；如果需要 6 个，也可以写 6 个。",
    "正文必须按同一顺序展开对应的 ## 顶层标题，优先使用短句、项目符号和可执行步骤，不要使用 Markdown 表格。",
    "除非绝对必要，不要使用长引用、二级嵌套列表或冗长板书模板。",
    "总字数控制在 800-1000 汉字，禁止空话和过长解释。",
    "禁止在输出中保留内部标签（如【教案设计摘要】【知识库】【联网检索摘要】等），这些仅供你参考。",
    refineMode
      ? "这是上一版教案的微调版，必须保持原主题。"
      : "这是可直接交付老师使用的高质量紧凑版教案。",
    "输出 Markdown。",
  ].join("\n");

  const shouldUseCompactPrimaryDraft = preferCompactPrimaryDraft || shouldPreferCompactByBudget;
  const compactDraftPrompt = trimTextToApproxTokens(sharedDraftPrompt, refineMode ? 1900 : 1500, {
    preserveTail: refineMode,
  });

  // 第 1 层：优先使用预算内主链路，保持流式输出并减少长 prompt 拖慢
  let draft = await streamGatewayTextToCompletion({
    model: params.model,
    temperature: shouldUseCompactPrimaryDraft ? 0.1 : 0.2,
    maxOutputTokens: shouldUseCompactPrimaryDraft ? 4000 : refineMode ? 6000 : 8000,
    system: shouldUseCompactPrimaryDraft ? compactDraftSystem : fullDraftSystem,
    prompt: shouldUseCompactPrimaryDraft ? compactDraftPrompt : sharedDraftPrompt,
    maxRetries: 0,
    fallbackUsed: shouldUseCompactPrimaryDraft,
    attemptCount: 1,
    onTextDelta: params.onTextDelta,
  }).catch(() => null);

  // 第 2 层 fallback：不带 thinking，紧凑模式
  if (!draft?.text?.trim()) {
    await params.onTextReset?.();
    draft = await streamGatewayTextToCompletion({
      model: params.model,
      temperature: 0.1,
      maxOutputTokens: 4000,
      system: compactDraftSystem,
      prompt: compactDraftPrompt,
      maxRetries: 0,
      fallbackUsed: true,
      attemptCount: 2,
      onTextDelta: params.onTextDelta,
    }).catch(() => null);
  }
  timings.generationMs = Date.now() - generationStartedAt;

  const draftText = draft?.text?.trim() || "";
  if (!draftText) {
    throw new Error("教案生成超时，质量优先链未返回完整结果，请重试。");
  }

  const finalMarkdown = stripModelInternalTags(
    stripStreamingOutlinePrelude(draftText).replace(/【[^】]{1,20}】/g, ""),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // 仅保留本地规则检查（不花钱），AI 审查和改写循环已移除
  const revisionRounds = 0;
  const auditMode: LessonPlanAuditMode = "deterministic_fast";

  const auditStartedAt = Date.now();
  const qualityAudit = buildDeterministicAudit(finalMarkdown);
  timings.auditMs = Date.now() - auditStartedAt;

  timings.totalMs = Date.now() - startedAt;

  return {
    ok: true,
    markdown: finalMarkdown,
    sources: webResults,
    warnings: workflowWarnings,
    knowledgeCount: knowledgeHits.length,
    materialCount: params.uploadedMaterials.length,
    mode: refineMode ? "refine" : "full",
    revisionRounds,
    qualityAudit,
    auditMode,
    timings,
  };
}
