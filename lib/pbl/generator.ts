import { z } from "zod";
import { generateGatewayText, streamGatewayTextToCompletion } from "@/lib/ai/gateway";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import { clampPeriods, getDefaultSubjectForCurriculum, normalizeGradeOption, normalizeSubjectForCurriculum } from "@/lib/pbl/options";
import { normalizeDifficulty } from "@/lib/pbl/defaults";
import { PBL_SYSTEM_PROMPT, buildChatIteratePrompt } from "@/lib/pbl/prompts/generate";
import type {
  PblAssessment,
  PblChatMessage,
  PblCurriculumAlignment,
  PblCurriculumSystem,
  PblInferredParams,
  PblMaterialReference,
  PblPlan,
  PblProjectBrief,
  PblRubricItem,
  PblSimpleInput,
  PblStage,
  WebSearchResult,
} from "@/lib/pbl/types";
import { qualityCheckWithOptions } from "@/lib/pbl/tools/quality-check";
import { searchForPbl } from "@/lib/pbl/web-search";
import { parseJsonFromRawText } from "@/lib/agent/exercise-pipeline-parsing";

// ---------------------------------------------------------------------------
// Timeout helper
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Heuristic parameter inference (no LLM, pure regex)
// ---------------------------------------------------------------------------

function detectCurriculum(prompt: string): PblCurriculumSystem {
  if (/\bIB\b/i.test(prompt)) return "IB";
  if (/\bAP\b/i.test(prompt)) return "AP";
  return "CN";
}

function detectSubject(prompt: string, curriculumSystem: PblCurriculumSystem) {
  const patterns: Array<[RegExp, string]> = [
    [/(化学|chemistry)/i, curriculumSystem === "AP" ? "AP Chemistry" : curriculumSystem === "IB" ? "IB Chemistry HL" : "高中化学"],
    [/(物理|physics)/i, curriculumSystem === "AP" ? "AP Physics 1: Algebra-Based" : curriculumSystem === "IB" ? "IB Physics HL" : "高中物理"],
    [/(生物|biology)/i, curriculumSystem === "AP" ? "AP Biology" : curriculumSystem === "IB" ? "IB Biology HL" : "高中生物"],
    [/(数学|calculus|statistics|math)/i, curriculumSystem === "AP" ? "AP Calculus AB" : curriculumSystem === "IB" ? "IB Mathematics: Analysis and Approaches HL" : "高中数学"],
    [/(历史|history)/i, curriculumSystem === "AP" ? "AP World History: Modern" : curriculumSystem === "IB" ? "IB History HL" : "高中历史"],
    [/(英语|english)/i, curriculumSystem === "AP" ? "AP English Language and Composition" : curriculumSystem === "IB" ? "IB English A: Language and Literature HL" : "高中英语"],
    [/(经济|economics)/i, curriculumSystem === "AP" ? "AP Microeconomics" : curriculumSystem === "IB" ? "IB Economics HL" : "高中思想政治"],
    [/(计算机|computer|编程|cs)/i, curriculumSystem === "AP" ? "AP Computer Science A" : curriculumSystem === "IB" ? "IB Computer Science HL" : "高中信息技术"],
  ];
  for (const [pattern, subject] of patterns) {
    if (pattern.test(prompt)) return subject;
  }
  return getDefaultSubjectForCurriculum(curriculumSystem);
}

function detectGrade(prompt: string) {
  const match =
    prompt.match(/(高[一二三]|初[一二三]|[一二三四五六七八九十]年级)/i) ??
    prompt.match(/grade\s*(\d{1,2})/i);
  return match?.[0]?.trim() ?? "高一";
}

function detectTotalPeriods(prompt: string) {
  const match = prompt.match(/(\d{1,2})\s*(?:课时|节|periods?)/i);
  return match ? clampPeriods(Number(match[1])) : 12;
}

function detectTopic(prompt: string) {
  const candidates = [
    prompt.match(/(?:以|围绕)\s*[""]?(.{2,40}?)[""]?\s*(?:为主题|这个主题|开展)/),
    prompt.match(/(?:主题|topic)\s*[:：]?\s*[""]?(.{2,40}?)[""]?(?:[，。,.\n]|$)/i),
    prompt.match(/(?:关于|聚焦)\s*[""]?(.{2,40}?)[""]?(?:的|项目|问题|主题|[，。,.\n]|$)/),
  ];
  for (const candidate of candidates) {
    const topic = candidate?.[1]?.trim();
    if (topic) return topic;
  }
  return prompt.trim().slice(0, 40);
}

function inferParamsHeuristically(input: PblSimpleInput): PblInferredParams {
  const curriculumSystem = input.curriculumSystem ?? detectCurriculum(input.prompt);
  const primarySubject = normalizeSubjectForCurriculum(
    curriculumSystem,
    input.subject ?? detectSubject(input.prompt, curriculumSystem),
  );
  const grade = normalizeGradeOption(input.grade ?? detectGrade(input.prompt));
  const totalPeriods = clampPeriods(input.totalPeriods ?? detectTotalPeriods(input.prompt));
  const difficulty = normalizeDifficulty(
    /(基础|入门|basic)/i.test(input.prompt) ? "basic"
      : /(挑战|竞赛|研究性|challenge)/i.test(input.prompt) ? "challenge"
      : "advanced",
  );
  return {
    curriculumSystem,
    primarySubject,
    grade,
    totalPeriods,
    difficulty,
    topic: detectTopic(input.prompt),
    knowledgePoints: [],
  };
}

// ---------------------------------------------------------------------------
// Schemas for the two parallel LLM calls
// ---------------------------------------------------------------------------

// Call 1: Core plan (stages + overview)
const corePlanSchema = z.object({
  title: z.string(),
  drivingQuestion: z.string(),
  overviewText: z.string(),
  finalOutcomeForm: z.string(),
  finalOutcomeRequirements: z.string(),
  targetAudience: z.string(),
  crossSubjects: z.array(z.string()),
  projectBrief: z.object({
    realWorldContext: z.string(),
    coreChallenge: z.string(),
    researchBoundary: z.string(),
    stakeholders: z.array(z.string()),
    successCriteria: z.array(z.string()),
    recommendedEvidence: z.array(z.string()),
  }),
  stages: z.array(z.object({
    stageNumber: z.number(),
    name: z.string(),
    stageType: z.enum(["explore", "execute", "synthesize"]),
    periodStart: z.number(),
    periodEnd: z.number(),
    objective: z.string(),
    realWorldProblem: z.string(),
    implementationSteps: z.array(z.string()),
    coreActivities: z.array(z.string()),
    teacherRole: z.string(),
    teacherMoves: z.array(z.string()),
    knowledgeEmbedding: z.string(),
    scaffolding: z.array(z.string()),
    checklist: z.array(z.string()),
    feedbackFocus: z.array(z.string()),
    commonPitfalls: z.array(z.string()),
    evidenceRequirements: z.array(z.string()),
    deliverables: z.array(z.string()),
    deliverableCriteria: z.array(z.string()),
    timeSuggestion: z.string(),
    requiredResources: z.array(z.string()),
  })),
  curriculumAlignment: z.array(z.object({
    knowledgePointCode: z.string(),
    coverageType: z.enum(["core", "supporting"]),
    relatedStage: z.number(),
  })),
});

type CorePlanOutput = z.infer<typeof corePlanSchema>;

// Call 2: Supplementary content (rubric + assessments + guidance)
const supplementarySchema = z.object({
  rubric: z.array(z.object({
    dimension: z.enum(["contextualize", "method", "evidence", "analysis", "argument", "reflection"]),
    score5: z.string(),
    score4: z.string(),
    score3: z.string(),
    score2: z.string(),
    score1: z.string(),
    studentVersion: z.string(),
  })),
  assessments: z.array(z.object({
    type: z.enum(["formative", "summative"]),
    checkpoint: z.string(),
    method: z.string(),
    content: z.string(),
    weightPercentage: z.number(),
  })),
  teacherGuidance: z.object({
    commonDifficulties: z.array(z.string()),
    differentiation: z.array(z.string()),
    timeManagement: z.array(z.string()),
    crossDisciplineCollab: z.array(z.string()),
  }),
});

type SupplementaryOutput = z.infer<typeof supplementarySchema>;

// ---------------------------------------------------------------------------
// Search context formatting
// ---------------------------------------------------------------------------

function formatSearchContext(searchResults: WebSearchResult[]) {
  if (searchResults.length === 0) {
    return "（未搜索到相关资料，请基于你的专业知识生成，但仍需保持具体与可实施。）";
  }
  return searchResults
    .slice(0, 5)
    .map((item, i) => `[来源${i + 1}] ${item.title}\n链接：${item.url}\n摘要：${item.snippet}\n类型：${item.type}`)
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Call 1: Core plan generation (Sonnet)
// ---------------------------------------------------------------------------

function buildCorePlanPrompt(
  originalPrompt: string,
  params: PblInferredParams,
  searchResults: WebSearchResult[],
) {
  return `## 教师需求

${originalPrompt}

## 已识别的教学参数

- 课程体系：${params.curriculumSystem}
- 学科：${params.primarySubject}
- 年级：${params.grade}
- 总课时：${params.totalPeriods} 课时
- 难度：${params.difficulty}
- 主题：${params.topic}
- 涉及知识点：${params.knowledgePoints.join("、") || "由你根据主题自行确定"}

## 搜索到的真实参考资料

请务必在方案中引用以下资料中的具体信息。

${formatSearchContext(searchResults)}

## 输出要求

只输出合法 JSON，不要代码块和解释。字段：title, drivingQuestion(开放式疑问句), overviewText(200-400字), finalOutcomeForm, finalOutcomeRequirements, targetAudience, crossSubjects[], projectBrief{realWorldContext, coreChallenge, researchBoundary, stakeholders[], successCriteria[], recommendedEvidence[]}, stages[], curriculumAlignment[{knowledgePointCode, coverageType:"core"|"supporting", relatedStage}]。

每个 stage 包含：stageNumber, name, stageType("explore"|"execute"|"synthesize"), periodStart, periodEnd, objective, realWorldProblem, implementationSteps[≥3], coreActivities[≥2], teacherRole, teacherMoves[≥2], knowledgeEmbedding, scaffolding[≥1], checklist[≥3], feedbackFocus[≥2], commonPitfalls[≥2], evidenceRequirements[≥2], deliverables[≥2], deliverableCriteria[≥2], timeSuggestion, requiredResources[≥1]。

规则：stages 3-4个（不要超过4个），第一个explore，最后一个synthesize，中间execute。引用搜索结果中的真实案例。所有内容具体可操作。`;
}

async function callStreamJson<T>(params: {
  model: string;
  system: string;
  prompt: string;
  maxOutputTokens: number;
  temperature: number;
  schema: z.ZodType<T>;
  label: string;
}): Promise<T> {
  const result = await streamGatewayTextToCompletion({
    model: getResolvedLanguageModelForTask(params.model as Parameters<typeof getResolvedLanguageModelForTask>[0]),
    system: params.system,
    prompt: params.prompt,
    maxOutputTokens: params.maxOutputTokens,
    temperature: params.temperature,
    maxRetries: 1,
  });

  const parsed = parseJsonFromRawText(result.text ?? "");
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${params.label}: JSON 解析失败`);
  }
  return params.schema.parse(parsed);
}

async function generateCorePlan(
  input: PblSimpleInput,
  params: PblInferredParams,
  searchResults: WebSearchResult[],
): Promise<CorePlanOutput> {
  return callStreamJson({
    model: "pbl_generate_full",
    system: [PBL_SYSTEM_PROMPT, "", "只输出合法 JSON，不要代码块，不要解释。"].join("\n"),
    prompt: buildCorePlanPrompt(input.prompt, params, searchResults),
    maxOutputTokens: 16_000,
    temperature: 0.4,
    schema: corePlanSchema,
    label: "pbl_core_plan",
  });
}

// ---------------------------------------------------------------------------
// Call 2: Supplementary content generation (Haiku, parallel)
// ---------------------------------------------------------------------------

function buildSupplementaryPrompt(params: PblInferredParams) {
  return `为以下 PBL 项目生成评价量规、评估方案和教师指导。

项目信息：
- 课程体系：${params.curriculumSystem}
- 学科：${params.primarySubject}
- 年级：${params.grade}
- 总课时：${params.totalPeriods} 课时
- 难度：${params.difficulty}
- 主题：${params.topic}

只输出一个合法 JSON 对象（不要代码块，不要解释），包含以下字段：

{
  "rubric": [
    {
      "dimension": "contextualize|method|evidence|analysis|argument|reflection",
      "score5": "5分描述（必须结合项目主题'${params.topic}'具体化，不要泛泛而谈）",
      "score4": "4分描述",
      "score3": "3分描述",
      "score2": "2分描述",
      "score1": "1分描述",
      "studentVersion": "学生友好版描述"
    }
  ],
  "assessments": [
    {
      "type": "formative|summative",
      "checkpoint": "评估节点",
      "method": "评估方法",
      "content": "评估内容",
      "weightPercentage": 20
    }
  ],
  "teacherGuidance": {
    "commonDifficulties": ["常见困难与应对（≥3条，结合'${params.topic}'主题）"],
    "differentiation": ["分层教学建议（≥2条）"],
    "timeManagement": ["时间管理建议（≥2条，按${params.totalPeriods}课时规划）"],
    "crossDisciplineCollab": ["跨学科协作建议"]
  }
}

规则：
1. rubric 恰好 6 个维度：contextualize, method, evidence, analysis, argument, reflection
2. assessments 的 weightPercentage 总和必须等于 100
3. 所有描述必须结合"${params.topic}"主题具体化`;
}

async function generateSupplementary(params: PblInferredParams): Promise<SupplementaryOutput> {
  return callStreamJson({
    model: "pbl_infer_params",
    system: "你是 PBL 评估设计专家。只输出合法 JSON，不要代码块，不要解释。",
    prompt: buildSupplementaryPrompt(params),
    maxOutputTokens: 8_000,
    temperature: 0.3,
    schema: supplementarySchema,
    label: "pbl_supplementary",
  });
}

function buildFallbackSupplementary(params: PblInferredParams): SupplementaryOutput {
  const topicLabel = params.topic || params.primarySubject;
  const rubricDimensions: SupplementaryOutput["rubric"][number]["dimension"][] = [
    "contextualize",
    "method",
    "evidence",
    "analysis",
    "argument",
    "reflection",
  ];

  const rubric = rubricDimensions.map((dimension) => ({
    dimension,
    score5: `能够把 ${topicLabel} 放进真实问题情境中，证据完整、方法清晰，且产出可直接支持项目决策。`,
    score4: `能够围绕 ${topicLabel} 建立较完整的研究与实施链路，证据与方法基本匹配。`,
    score3: `能够说明 ${topicLabel} 的核心内容，但证据、方法或应用场景还不够具体。`,
    score2: `对 ${topicLabel} 的理解停留在概念层面，项目证据与实施步骤明显不足。`,
    score1: `无法把 ${topicLabel} 与项目任务建立稳定关联，成果缺少基本依据。`,
    studentVersion: `我能把 ${topicLabel} 讲清楚，并用合适证据支持我的项目方案。`,
  }));

  return {
    rubric,
    assessments: [
      {
        type: "formative",
        checkpoint: "项目启动与问题界定",
        method: "教师观察 + 小组提案检查",
        content: `检查学生是否准确界定 ${topicLabel} 的核心问题、限制条件与研究方向。`,
        weightPercentage: 20,
      },
      {
        type: "formative",
        checkpoint: "中期方案评审",
        method: "阶段汇报 + 同伴反馈",
        content: `检查学生是否用证据支撑 ${topicLabel} 相关方案，并根据反馈迭代。`,
        weightPercentage: 30,
      },
      {
        type: "summative",
        checkpoint: "最终成果与答辩",
        method: "作品展示 + 口头答辩",
        content: `综合评价学生对 ${topicLabel} 的理解、项目实施质量与反思能力。`,
        weightPercentage: 50,
      },
    ],
    teacherGuidance: {
      commonDifficulties: [
        `学生容易把 ${topicLabel} 停留在口号式描述，缺少可验证证据。`,
        "学生在阶段推进时可能忽略任务边界，导致研究范围过大。",
        "小组协作中常出现分工失衡，需要教师定期检查角色与交付物。",
      ],
      differentiation: [
        "为基础薄弱学生提供模板化研究记录单与阶段检查清单。",
        "为进阶学生增加真实数据分析、跨学科拓展或答辩追问任务。",
      ],
      timeManagement: [
        `将 ${params.totalPeriods} 课时拆成启动、执行、整合三段，每段结束必须有可见产物。`,
        "把资料搜集与成果制作分开验收，避免最后一周集中堆积。",
      ],
      crossDisciplineCollab: [
        "与相邻学科老师对齐评价标准，保证学生的研究、表达和产出使用同一套成功标准。",
      ],
    },
  };
}

async function generateSupplementaryStable(
  params: PblInferredParams,
): Promise<SupplementaryOutput> {
  try {
    return await withTimeout(generateSupplementary(params), 120_000, "pbl_supplementary");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[pbl] supplementary generation fallback: ${message}`);
    return buildFallbackSupplementary(params);
  }
}

// ---------------------------------------------------------------------------
// Render structured plan to Markdown (for display)
// ---------------------------------------------------------------------------

function renderPblMarkdown(
  core: CorePlanOutput,
  supplementary: SupplementaryOutput,
  params: PblInferredParams,
  searchResults: WebSearchResult[],
) {
  const lines: string[] = [];

  lines.push(`# ${core.title}`);
  lines.push("");
  lines.push(`> **驱动问题**：${core.drivingQuestion}`);
  lines.push("");
  lines.push("## 项目概述");
  lines.push("");
  lines.push(core.overviewText);
  lines.push("");
  lines.push(`- **课程体系**：${params.curriculumSystem} · ${params.primarySubject}`);
  lines.push(`- **年级**：${params.grade}`);
  lines.push(`- **总课时**：${params.totalPeriods} 课时`);
  lines.push(`- **难度**：${params.difficulty}`);
  lines.push(`- **最终成果**：${core.finalOutcomeForm}`);
  if (core.crossSubjects.length > 0) {
    lines.push(`- **跨学科**：${core.crossSubjects.join("、")}`);
  }
  lines.push("");

  lines.push("## 项目安排");
  lines.push("");
  for (const stage of core.stages) {
    lines.push(`### 阶段${stage.stageNumber}：${stage.name}（${stage.periodStart}-${stage.periodEnd}课时）`);
    lines.push(`**阶段目标：** ${stage.objective}`);
    lines.push("");
    lines.push("#### 本阶段要解决的真实问题");
    lines.push(stage.realWorldProblem);
    lines.push("");
    lines.push("#### 学生推进步骤");
    for (const step of stage.implementationSteps) lines.push(`- ${step}`);
    lines.push("");
    lines.push("#### 核心活动");
    for (const act of stage.coreActivities) lines.push(`- ${act}`);
    lines.push("");
    lines.push("#### 教师动作");
    for (const move of stage.teacherMoves) lines.push(`- ${move}`);
    lines.push("");
    lines.push("#### 检查清单");
    for (const item of stage.checklist) lines.push(`- ${item}`);
    lines.push("");
    lines.push("#### 反馈重点");
    for (const item of stage.feedbackFocus) lines.push(`- ${item}`);
    lines.push("");
    lines.push("#### 常见偏差与纠偏");
    for (const item of stage.commonPitfalls) lines.push(`- ${item}`);
    lines.push("");
    lines.push("#### 证据要求");
    for (const item of stage.evidenceRequirements) lines.push(`- ${item}`);
    lines.push("");
    lines.push("#### 阶段产出");
    for (const item of stage.deliverables) lines.push(`- ${item}`);
    lines.push("");
    lines.push("#### 达标标准");
    for (const item of stage.deliverableCriteria) lines.push(`- ${item}`);
    lines.push("");
    lines.push("#### 所需资源");
    for (const item of stage.requiredResources) lines.push(`- ${item}`);
    lines.push("");
  }

  lines.push("## 学习支架与资源");
  lines.push("");
  for (const stage of core.stages) {
    if (stage.scaffolding.length > 0) {
      lines.push(`**${stage.name}**：${stage.scaffolding.join("；")}`);
    }
  }
  lines.push("");

  lines.push("## 评估方案");
  lines.push("");
  lines.push("| 类型 | 节点 | 方法 | 内容 | 权重 |");
  lines.push("|------|------|------|------|------|");
  for (const a of supplementary.assessments) {
    lines.push(`| ${a.type === "formative" ? "形成性" : "总结性"} | ${a.checkpoint} | ${a.method} | ${a.content} | ${a.weightPercentage}% |`);
  }
  lines.push("");

  lines.push("## 评价量规");
  lines.push("");
  const dimLabels: Record<string, string> = {
    contextualize: "情境建构", method: "方法运用", evidence: "证据链",
    analysis: "分析深度", argument: "论证表达", reflection: "反思迭代",
  };
  for (const r of supplementary.rubric) {
    lines.push(`### ${dimLabels[r.dimension] ?? r.dimension}`);
    lines.push("| 等级 | 描述 |");
    lines.push("|------|------|");
    lines.push(`| 5分 | ${r.score5} |`);
    lines.push(`| 4分 | ${r.score4} |`);
    lines.push(`| 3分 | ${r.score3} |`);
    lines.push(`| 2分 | ${r.score2} |`);
    lines.push(`| 1分 | ${r.score1} |`);
    lines.push("");
  }

  lines.push("## 教师指导要点");
  lines.push("");
  lines.push("### 常见困难");
  for (const item of supplementary.teacherGuidance.commonDifficulties) lines.push(`- ${item}`);
  lines.push("");
  lines.push("### 分层教学");
  for (const item of supplementary.teacherGuidance.differentiation) lines.push(`- ${item}`);
  lines.push("");
  lines.push("### 时间管理");
  for (const item of supplementary.teacherGuidance.timeManagement) lines.push(`- ${item}`);
  lines.push("");

  if (searchResults.length > 0) {
    lines.push("## 参考资料与链接");
    lines.push("");
    for (const [i, item] of searchResults.slice(0, 8).entries()) {
      lines.push(`${i + 1}. [${item.title}](${item.url})`);
      if (item.snippet) lines.push(`   - 摘要：${item.snippet}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

// ---------------------------------------------------------------------------
// Build full PblPlan object from parallel outputs
// ---------------------------------------------------------------------------

function buildPlanFromOutputs(params: {
  core: CorePlanOutput;
  supplementary: SupplementaryOutput;
  originalPrompt: string;
  inferred: PblInferredParams;
  markdownContent: string;
  searchResults: WebSearchResult[];
}): Omit<PblPlan, "id" | "createdAt" | "updatedAt"> {
  const { core, supplementary, inferred, searchResults } = params;
  return {
    title: core.title,
    originalPrompt: params.originalPrompt,
    inferredParams: inferred,
    markdownContent: params.markdownContent,
    drivingQuestion: core.drivingQuestion,
    primarySubject: inferred.primarySubject,
    curriculumSystem: inferred.curriculumSystem,
    grade: inferred.grade,
    searchResults,
    chatHistory: [],
    status: "draft",
    version: 1,
    requestId: null,
    overviewOption: null,
    overviewText: core.overviewText,
    totalPeriods: inferred.totalPeriods,
    difficulty: inferred.difficulty,
    crossSubjects: core.crossSubjects,
    suggestedGroupSize: 4,
    suggestedGroupCount: 8,
    finalOutcomeForm: core.finalOutcomeForm,
    finalOutcomeRequirements: core.finalOutcomeRequirements,
    projectBrief: core.projectBrief,
    targetAudience: core.targetAudience,
    presentationFormat: "课堂展示 / 答辩",
    stages: core.stages,
    curriculumAlignment: core.curriculumAlignment,
    rubric: supplementary.rubric,
    assessments: supplementary.assessments,
    materialReferences: searchResults.slice(0, 8).map((item, i) => ({
      materialId: `WEB-${i + 1}`,
      title: item.title,
      referenceType: i === 0 ? "driving_question" as const : i <= 2 ? "stage_design" as const : "background_info" as const,
    })),
    teacherGuidance: supplementary.teacherGuidance,
    studentVersionMarkdown: params.markdownContent,
    qualityCheck: [],
  };
}

// ---------------------------------------------------------------------------
// Public API: kept identical signatures for backward compatibility
// ---------------------------------------------------------------------------

export async function inferParams(input: PblSimpleInput): Promise<PblInferredParams> {
  return inferParamsHeuristically(input);
}

export async function searchContext(params: PblInferredParams): Promise<WebSearchResult[]> {
  return searchForPbl({
    topic: params.topic,
    subject: params.primarySubject,
    grade: params.grade,
    curriculumSystem: params.curriculumSystem,
  });
}

export async function generateFullPlan(
  input: PblSimpleInput,
  params: PblInferredParams,
  searchResults: WebSearchResult[],
): Promise<string> {
  const [core, supplementary] = await Promise.all([
    generateCorePlan(input, params, searchResults),
    generateSupplementaryStable(params),
  ]);
  return renderPblMarkdown(core, supplementary, params, searchResults);
}

export async function generateChatIteration(params: {
  markdownContent: string;
  chatHistory: PblChatMessage[];
  message: string;
}) {
  const { text } = await withTimeout(
    generateGatewayText({
      model: getResolvedLanguageModelForTask("pbl_chat_iterate"),
      system: PBL_SYSTEM_PROMPT,
      prompt: buildChatIteratePrompt(params.markdownContent, params.chatHistory, params.message),
      maxOutputTokens: 6800,
      temperature: 0.4,
      timeout: { totalMs: 55_000 },
    }),
    60_000,
    "pbl_chat_iterate",
  );

  const cleaned = text?.trim()
    .replace(/^```(?:markdown)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  if (!cleaned) {
    throw new Error("PBL 方案迭代结果为空");
  }
  return cleaned;
}

export async function generatePblProject(input: PblSimpleInput): Promise<{
  plan: Omit<PblPlan, "id" | "createdAt" | "updatedAt">;
  searchResults: WebSearchResult[];
  timings: Record<string, number>;
}> {
  const timings: Record<string, number> = {};

  const inferStartedAt = Date.now();
  const inferred = inferParamsHeuristically(input);
  timings.inferMs = Date.now() - inferStartedAt;

  const searchStartedAt = Date.now();
  const searchResults = await searchContext(inferred).catch(() => []);
  timings.searchMs = Date.now() - searchStartedAt;

  // Two parallel LLM calls: core plan (Sonnet) + supplementary (Haiku)
  const generateStartedAt = Date.now();
  const [core, supplementary] = await Promise.all([
    withTimeout(generateCorePlan(input, inferred, searchResults), 300_000, "pbl_core"),
    generateSupplementaryStable(inferred),
  ]);
  timings.generateMs = Date.now() - generateStartedAt;
  timings.totalMs = Object.values(timings).reduce((sum, v) => sum + v, 0);

  const markdownContent = renderPblMarkdown(core, supplementary, inferred, searchResults);

  const plan = buildPlanFromOutputs({
    core,
    supplementary,
    originalPrompt: input.prompt,
    inferred,
    markdownContent,
    searchResults,
  });

  const qualityCheck = await qualityCheckWithOptions(
    plan as PblPlan,
    { preferAi: false },
  );

  return {
    plan: { ...plan, qualityCheck },
    searchResults,
    timings,
  };
}
