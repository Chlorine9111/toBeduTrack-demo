import { z } from "zod";
import { generateToolInputWithGateway } from "@/lib/ai/gateway";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import { normalizeDifficulty } from "@/lib/pbl/defaults";
import {
  PBL_GRADE_OPTIONS,
  PBL_PERIOD_RANGE,
  PBL_SUBJECT_OPTIONS,
  clampPeriods,
  getDefaultSubjectForCurriculum,
  normalizeGradeOption,
  normalizeSubjectForCurriculum,
} from "@/lib/pbl/options";
import { generationInputSchema } from "@/lib/pbl/schemas/generation-input";
import type { PblCurriculumSystem, PblDifficulty, PblGenerationInput } from "@/lib/pbl/types";

export const PBL_ASSISTANT_ACTIONS = [
  "reply_only",
  "update_input",
  "generate_overviews",
  "expand_overview",
  "generate_and_expand",
  "patch_plan",
] as const;

export type PblAssistantAction = (typeof PBL_ASSISTANT_ACTIONS)[number];

export const pblAssistantInputPatchSchema = z.object({
  curriculumSystem: z.enum(["AP", "IB", "CN"]).optional(),
  primarySubject: z.string().trim().min(1).optional(),
  grade: z.string().trim().min(1).optional(),
  totalPeriods: z.number().int().min(2).max(60).optional(),
  topic: z.string().trim().max(200).optional(),
  difficulty: z.enum(["basic", "advanced", "challenge"]).optional(),
  specialRequirements: z.string().trim().max(4000).optional(),
});

export type PblAssistantInputPatch = z.infer<typeof pblAssistantInputPatchSchema>;

export const pblPlanPatchSchema = z.object({
  stageNumber: z.number().int().min(1).optional(),
  field: z.enum([
    "objective",
    "coreActivities",
    "teacherRole",
    "knowledgeEmbedding",
    "scaffolding",
    "deliverables",
    "drivingQuestion",
    "overviewText",
    "finalOutcomeRequirements",
    "name",
    "timeSuggestion",
    "requiredResources",
  ]).optional(),
  instruction: z.string().trim().min(1),
});

export type PblPlanPatch = z.infer<typeof pblPlanPatchSchema>;

const overviewSchema = z.object({
  optionLabel: z.enum(["A", "B", "C"]),
  title: z.string().trim().min(1),
  drivingQuestion: z.string().trim().min(1),
  overview: z.string().trim().min(1),
});

const currentPlanSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1),
  overviewOption: z.enum(["A", "B", "C"]),
  drivingQuestion: z.string().trim().min(1),
  overviewText: z.string().trim().min(1),
  difficulty: z.enum(["basic", "advanced", "challenge"]),
  finalOutcomeForm: z.string().trim().min(1),
});

export const pblAssistantTurnRequestSchema = z.object({
  teacherMessage: z.string().trim().min(1).max(4000),
  currentInput: generationInputSchema,
  hasOverviews: z.boolean().default(false),
  availableOverviews: z.array(overviewSchema).max(3).default([]),
  currentPlan: currentPlanSchema.nullable().default(null),
});

export type PblAssistantTurnRequest = z.infer<typeof pblAssistantTurnRequestSchema>;

export const pblAssistantTurnResponseSchema = z.object({
  reply: z.string().trim().min(1),
  action: z.enum(PBL_ASSISTANT_ACTIONS),
  optionLabel: z.enum(["A", "B", "C"]).optional(),
  inputPatch: pblAssistantInputPatchSchema.default({}),
  planPatch: pblPlanPatchSchema.optional(),
});

export type PblAssistantTurnResponse = z.infer<typeof pblAssistantTurnResponseSchema>;

const PBL_ASSISTANT_TOOL = {
  name: "return_pbl_assistant_action",
  description: "Return the normalized next action for the PBL builder UI.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      reply: { type: "string" },
      action: {
        type: "string",
        enum: [...PBL_ASSISTANT_ACTIONS],
      },
      optionLabel: {
        type: "string",
        enum: ["A", "B", "C"],
      },
      inputPatch: {
        type: "object",
        additionalProperties: false,
        properties: {
          curriculumSystem: { type: "string", enum: ["AP", "IB", "CN"] },
          primarySubject: { type: "string" },
          grade: { type: "string" },
          totalPeriods: { type: "integer", minimum: 2, maximum: 60 },
          topic: { type: "string" },
          difficulty: { type: "string", enum: ["basic", "advanced", "challenge"] },
          specialRequirements: { type: "string" },
        },
      },
      planPatch: {
        type: "object",
        additionalProperties: false,
        properties: {
          stageNumber: { type: "integer", minimum: 1 },
          field: {
            type: "string",
            enum: [
              "objective", "coreActivities", "teacherRole", "knowledgeEmbedding",
              "scaffolding", "deliverables", "drivingQuestion", "overviewText",
              "finalOutcomeRequirements", "name", "timeSuggestion", "requiredResources",
            ],
          },
          instruction: { type: "string" },
        },
        required: ["instruction"],
      },
    },
    required: ["reply", "action", "inputPatch"],
  },
};

function summarizeInput(input: PblGenerationInput) {
  return [
    `课程体系：${input.curriculumSystem}`,
    `主学科：${input.primarySubject}`,
    `年级：${input.grade}`,
    `总课时数：${input.totalPeriods}`,
    `具体题目：${input.topic?.trim() || "未指定"}`,
    `难度：${input.difficulty}`,
    `额外要求：${input.specialRequirements?.trim() || "无"}`,
  ].join("\n");
}

function summarizeOverviews(params: Pick<PblAssistantTurnRequest, "hasOverviews" | "availableOverviews">) {
  if (!params.hasOverviews || params.availableOverviews.length === 0) {
    return "当前还没有候选概览。";
  }

  return params.availableOverviews
    .map(
      (item) =>
        `方案 ${item.optionLabel}\n标题：${item.title}\n驱动问题：${item.drivingQuestion}\n概述：${item.overview}`,
    )
    .join("\n\n");
}

function summarizeCurrentPlan(plan: PblAssistantTurnRequest["currentPlan"]) {
  if (!plan) return "当前还没有已展开的完整方案。";

  return [
    `标题：${plan.title}`,
    `当前展开方案：${plan.overviewOption}`,
    `难度：${plan.difficulty}`,
    `驱动问题：${plan.drivingQuestion}`,
    `成果形式：${plan.finalOutcomeForm}`,
    `概述：${plan.overviewText}`,
  ].join("\n");
}

function buildSubjectCatalog() {
  return Object.entries(PBL_SUBJECT_OPTIONS)
    .map(([system, subjects]) => `${system}：${subjects.join("、")}`)
    .join("\n");
}

function mergeSpecialRequirements(existing: string | undefined, nextRequirement: string | undefined) {
  const trimmedNext = nextRequirement?.trim();
  const trimmedExisting = existing?.trim();

  if (!trimmedNext) return trimmedExisting || undefined;
  if (!trimmedExisting) return trimmedNext;
  if (trimmedExisting.includes(trimmedNext)) return trimmedExisting;
  return `${trimmedExisting}\n${trimmedNext}`;
}

function sanitizeTopicCandidate(input: string | undefined) {
  const trimmed = input?.trim();
  if (!trimmed) return undefined;

  const normalized = trimmed
    .replace(/^[“"'《〈【（(\s]+|[”"'》〉】）)\s]+$/g, "")
    .replace(/^(?:这个|该|当前|围绕|关于|聚焦|主题是|题目是|topic is|focus on)\s*/i, "")
    .replace(
      /(?:的)?(?:基础|进阶|挑战|标准)?(?:难度)?(?:项目|方案|概览|完整方案|pbl|任务|课题|单元|课程)(?:设计)?(?:.*)$/i,
      "",
    )
    .replace(/(?:并|然后|同时|再|并且|而且|给我|帮我|请|希望|想要)(?:.*)$/i, "")
    .replace(/[，。；;,.!！?？]+$/g, "")
    .trim();

  if (normalized.length < 2) return undefined;
  if (/^(?:当前方案|完整方案|基础难度|进阶难度|挑战难度|ap|ib|cn)$/i.test(normalized)) {
    return undefined;
  }

  return normalized;
}

function parseTopic(text: string) {
  const quoted = text.match(/[“"'《〈【]([^”"'》〉】]{2,50})[”"'》〉】]/);
  const quotedTopic = sanitizeTopicCandidate(quoted?.[1]);
  if (quotedTopic) return quotedTopic;

  const patterns = [
    /(?:具体题目|题目|主题|topic|focus on|focused on|聚焦|围绕|关于)\s*(?:是|为|on)?\s*[:：]?\s*([^\n，。；;]{2,80})/i,
    /做(?:一个|个)?[^，。；;\n]*?(?:关于|围绕)\s*([^\n，。；;]{2,80})/i,
    /(?:改成|调整为|重做成)[^，。；;\n]*?(?:关于|围绕)\s*([^\n，。；;]{2,80})/i,
    /([^\s，。；;]{2,30})(?:这个)?(?:主题|题目)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const candidate = sanitizeTopicCandidate(match?.[1]);
    if (candidate) return candidate;
  }

  return undefined;
}

function normalizePatch(
  currentInput: PblGenerationInput,
  patch: PblAssistantInputPatch,
): PblAssistantInputPatch {
  const nextCurriculum = patch.curriculumSystem ?? currentInput.curriculumSystem;
  const normalizedPatch: PblAssistantInputPatch = {};

  if (patch.curriculumSystem) {
    normalizedPatch.curriculumSystem = patch.curriculumSystem;
  }

  if (patch.primarySubject || patch.curriculumSystem) {
    normalizedPatch.primarySubject = normalizeSubjectForCurriculum(
      nextCurriculum,
      patch.primarySubject ?? currentInput.primarySubject,
    );
  }

  if (patch.grade) {
    normalizedPatch.grade = normalizeGradeOption(patch.grade, currentInput.grade as (typeof PBL_GRADE_OPTIONS)[number]);
  }

  if (patch.totalPeriods != null) {
    normalizedPatch.totalPeriods = clampPeriods(patch.totalPeriods);
  }

  if ("topic" in patch) {
    normalizedPatch.topic = patch.topic?.trim() || "";
  }

  if (patch.difficulty) {
    normalizedPatch.difficulty = normalizeDifficulty(patch.difficulty) as PblDifficulty;
  }

  if ("specialRequirements" in patch) {
    normalizedPatch.specialRequirements = patch.specialRequirements?.trim() || "";
  }

  return normalizedPatch;
}

export function applyPblInputPatch(
  currentInput: PblGenerationInput,
  patch: PblAssistantInputPatch,
): PblGenerationInput {
  const normalizedPatch = normalizePatch(currentInput, patch);
  const nextCurriculum = normalizedPatch.curriculumSystem ?? currentInput.curriculumSystem;

  return {
    ...currentInput,
    ...normalizedPatch,
    curriculumSystem: nextCurriculum,
    primarySubject:
      normalizedPatch.primarySubject ??
      normalizeSubjectForCurriculum(nextCurriculum, currentInput.primarySubject),
    grade: normalizedPatch.grade ?? currentInput.grade,
    totalPeriods: normalizedPatch.totalPeriods ?? currentInput.totalPeriods,
    topic: "topic" in patch ? normalizedPatch.topic || undefined : currentInput.topic,
    difficulty: normalizedPatch.difficulty ?? currentInput.difficulty,
    specialRequirements:
      "specialRequirements" in patch
        ? normalizedPatch.specialRequirements
        : currentInput.specialRequirements,
  };
}

function parseOptionLabel(text: string) {
  const explicit =
    text.match(/(?:方案|选项|option)\s*([ABC])/i) ??
    text.match(/([ABC])\s*(?:方案|选项|option)/i);
  if (explicit) {
    return explicit[1].toUpperCase() as "A" | "B" | "C";
  }

  const standalone = text.match(/(?:^|[\s，。、“"'（(])([ABC])(?:$|[\s，。、“"'）)])/i);
  return (standalone?.[1]?.toUpperCase() as "A" | "B" | "C" | undefined) ?? undefined;
}

function parseCurriculumSystem(text: string): PblCurriculumSystem | undefined {
  if (/\bAP\b/i.test(text)) return "AP";
  if (/\bIB\b/i.test(text)) return "IB";
  if (/中国课标|新课标|高中课标|^CN\b|\bCN\b/i.test(text)) return "CN";
  return undefined;
}

function parseDifficulty(text: string): PblDifficulty | undefined {
  if (/基础|简单|入门|降低难度|降级/i.test(text)) return "basic";
  if (/挑战|困难|拔高|高阶|提高难度/i.test(text)) return "challenge";
  if (/进阶|标准|中等/i.test(text)) return "advanced";
  return undefined;
}

function parseGrade(text: string) {
  return PBL_GRADE_OPTIONS.find((item) => text.includes(item));
}

function parsePeriods(text: string): number | undefined {
  // 尝试直接解析用户文本中的课时数字
  const explicitMatch = text.match(/(\d{1,3})\s*(?:课时|节课|节|个课时|periods?)/i);
  if (explicitMatch) return clampPeriods(Number(explicitMatch[1]));

  // 按关键词推断课时数
  if (/1\s*[-~到]\s*2\s*周|微型项目/.test(text)) return 4;
  if (/3\s*[-~到]\s*4\s*周|标准项目/.test(text)) return 8;
  if (/5\s*[-~到]\s*8\s*周|深度项目/.test(text)) return 16;
  if (/学期|长期项目/.test(text)) return 32;

  return undefined;
}

function parseSubject(text: string, curriculumSystem: PblCurriculumSystem) {
  const lower = text.toLowerCase();
  const options = PBL_SUBJECT_OPTIONS[curriculumSystem];

  const sorted = [...options].sort((a, b) => b.length - a.length);
  return (
    sorted.find((item) => {
      const subjectLower = item.toLowerCase();
      return lower.includes(subjectLower) || subjectLower.includes(lower);
    }) ?? undefined
  );
}

function inferFallbackAction(params: {
  message: string;
  hasOverviews: boolean;
  hasPlan: boolean;
  patch: PblAssistantInputPatch;
}) {
  const lower = params.message.toLowerCase();
  const wantsExpand =
    /展开|选\s*[abc]|用\s*[abc]\s*方案|方案\s*[abc]/i.test(params.message) ||
    lower.includes("expand");
  const wantsFullPlan =
    /完整方案|直接出方案|直接生成方案|直接展开|重新生成|重做|改成|调整|优化|补充|增加|删减|降低|提高/.test(
      params.message,
    );
  const wantsGenerate =
    /生成|做一个|来一个|设计一个|创建|帮我出/.test(params.message) || lower.includes("generate");
  const wantsPatch =
    params.hasPlan &&
    /修改.*阶段|阶段.*修改|把第?\s*\d+\s*阶段|改一下.*目标|改一下.*活动|修改.*驱动问题|调整.*阶段/.test(
      params.message,
    );

  if (wantsPatch) return "patch_plan" as const;
  if (wantsExpand && params.hasOverviews) return "expand_overview" as const;
  if (wantsFullPlan || (params.hasPlan && Object.keys(params.patch).length > 0)) {
    return "generate_and_expand" as const;
  }
  if (wantsGenerate) return "generate_overviews" as const;
  if (Object.keys(params.patch).length > 0) return "update_input" as const;
  return "reply_only" as const;
}

function formatPatchSummary(currentInput: PblGenerationInput, patch: PblAssistantInputPatch) {
  const nextInput = applyPblInputPatch(currentInput, patch);
  const changes: string[] = [];

  if (nextInput.curriculumSystem !== currentInput.curriculumSystem) {
    changes.push(`课程体系改为 ${nextInput.curriculumSystem}`);
  }
  if (nextInput.primarySubject !== currentInput.primarySubject) {
    changes.push(`学科改为 ${nextInput.primarySubject}`);
  }
  if (nextInput.grade !== currentInput.grade) {
    changes.push(`年级改为 ${nextInput.grade}`);
  }
  if (nextInput.totalPeriods !== currentInput.totalPeriods) {
    changes.push(`课时数改为 ${nextInput.totalPeriods}`);
  }
  if (nextInput.topic !== currentInput.topic) {
    changes.push(nextInput.topic ? `具体题目改为 ${nextInput.topic}` : "已清空具体题目");
  }
  if (nextInput.difficulty !== currentInput.difficulty) {
    const difficultyLabel =
      nextInput.difficulty === "basic"
        ? "基础"
        : nextInput.difficulty === "challenge"
          ? "挑战"
          : "进阶";
    changes.push(`难度改为 ${difficultyLabel}`);
  }
  if (patch.specialRequirements !== undefined) {
    changes.push("已记录新的额外要求");
  }

  return changes;
}

function buildFallbackReply(
  currentInput: PblGenerationInput,
  action: PblAssistantAction,
  patch: PblAssistantInputPatch,
  optionLabel?: "A" | "B" | "C",
) {
  const changes = formatPatchSummary(currentInput, patch);
  const changePrefix = changes.length > 0 ? `已处理：${changes.join("，")}。` : "";

  if (action === "generate_and_expand") {
    return `${changePrefix}我会直接生成并展开 ${optionLabel ?? "A"} 方案。`.trim();
  }
  if (action === "generate_overviews") {
    return `${changePrefix}我会先生成新的候选概览。`.trim();
  }
  if (action === "expand_overview") {
    return `${changePrefix}我会展开 ${optionLabel ?? "A"} 方案。`.trim();
  }
  if (action === "update_input") {
    return `${changePrefix}参数已更新，你也可以继续说“直接生成”让我往下执行。`.trim();
  }
  return "我已经理解你的要求。你可以直接说“生成概览”“展开 B 方案”或“把当前方案降到基础难度并重做”。";
}

function buildFallbackTurn(params: PblAssistantTurnRequest): PblAssistantTurnResponse {
  const nextCurriculum = parseCurriculumSystem(params.teacherMessage) ?? params.currentInput.curriculumSystem;
  const patch: PblAssistantInputPatch = {};

  const curriculumSystem = parseCurriculumSystem(params.teacherMessage);
  if (curriculumSystem) {
    patch.curriculumSystem = curriculumSystem;
  }

  const subject = parseSubject(params.teacherMessage, nextCurriculum);
  if (subject) {
    patch.primarySubject = subject;
  } else if (curriculumSystem && params.currentInput.curriculumSystem !== curriculumSystem) {
    patch.primarySubject = getDefaultSubjectForCurriculum(curriculumSystem);
  }

  const grade = parseGrade(params.teacherMessage);
  if (grade) patch.grade = grade;

  const periods = parsePeriods(params.teacherMessage);
  if (periods != null) patch.totalPeriods = periods;

  const topic = parseTopic(params.teacherMessage);
  if (topic) patch.topic = topic;

  const difficulty = parseDifficulty(params.teacherMessage);
  if (difficulty) patch.difficulty = difficulty;

  const action = inferFallbackAction({
    message: params.teacherMessage,
    hasOverviews: params.hasOverviews,
    hasPlan: Boolean(params.currentPlan),
    patch,
  });

  const optionLabel =
    parseOptionLabel(params.teacherMessage) ??
    params.currentPlan?.overviewOption ??
    params.availableOverviews[0]?.optionLabel ??
    "A";

  const shouldCarryRequirements =
    action === "generate_and_expand" ||
    /增加|减少|强调|保留|加入|突出|避免|控制|适合|面向|更像|更偏/.test(params.teacherMessage);

  if (shouldCarryRequirements) {
    patch.specialRequirements = mergeSpecialRequirements(
      params.currentInput.specialRequirements,
      params.teacherMessage,
    );
  }

  return {
    reply: buildFallbackReply(params.currentInput, action, patch, optionLabel),
    action,
    optionLabel: action === "expand_overview" || action === "generate_and_expand" ? optionLabel : undefined,
    inputPatch: normalizePatch(params.currentInput, patch),
  };
}

async function resolveTurnWithAI(params: PblAssistantTurnRequest): Promise<PblAssistantTurnResponse> {
  const validSubjects = buildSubjectCatalog();
  const userPrompt = `你是 PBL 创建页里的项目助理。你的任务是把教师自然语言需求解析为页面下一步动作。

## 当前表单参数
${summarizeInput(params.currentInput)}

## 当前候选概览
${summarizeOverviews(params)}

## 当前完整方案
${summarizeCurrentPlan(params.currentPlan)}

## 允许的学科选项
${validSubjects}

## 年级选项
${PBL_GRADE_OPTIONS.join("、")}

## 课时数范围
${PBL_PERIOD_RANGE.min}-${PBL_PERIOD_RANGE.max} 课时（整数）

## 动作定义
- reply_only：只回答，不改参数，不触发生成。
- update_input：只更新表单参数，不自动生成。
- generate_overviews：更新参数后生成 2-3 个候选概览。
- expand_overview：在现有候选概览上展开某个 A/B/C 方案。
- generate_and_expand：按新要求直接生成并展开完整方案；若已有完整方案，则视为”重做/改版”。
- patch_plan：对已有完整方案做局部修改（例如修改某个阶段的目标、活动、产出等），不重新生成整个方案。需要填写 planPatch 对象：stageNumber（可选，不填则修改方案级字段）、field（要修改的字段名）、instruction（修改指示）。

## 解析规则
- 如果教师要求修改已有方案的某个具体字段，例如”把第 2 阶段目标改成……””修改驱动问题””调整第 3 阶段的核心活动”，且已有完整方案，使用 patch_plan。
- 如果教师要求”把当前方案改成……””降低难度””增加某个要求并重做”等涉及全局重做的需求，优先用 generate_and_expand。
- 如果教师要求“展开 B 方案”，且已有候选概览，使用 expand_overview。
- 如果教师只是改字段，例如学科、课时数、难度，而没有要求立刻生成，使用 update_input。
- primarySubject 必须严格取自对应 curriculumSystem 的有效学科选项。
- 如果课程体系变化但教师未指定学科，请自动选择该体系的默认学科。
- 如果教师提到了具体题目/问题，例如“化学电池”“酸碱滴定”“城市热岛”，优先写入 inputPatch.topic。
- inputPatch.topic 必须是简短、可检索、去掉语气词后的题目短语，不要写成长句。
- 不要把 topic 和 specialRequirements 混为一谈。只有执行约束、风格要求、成果限制等内容才进入 specialRequirements。
- 如果教师提出了会影响生成结果的附加要求，请把它总结进 inputPatch.specialRequirements。
- inputPatch.specialRequirements 必须是“下一次生成时应使用的完整要求摘要”，不是零散关键词。
- reply 用中文简短说明你理解了什么以及接下来会做什么。

## 教师最新消息
${params.teacherMessage}`;

  const { input: raw } = await generateToolInputWithGateway<unknown>({
    model: getResolvedLanguageModelForTask("pbl_assistant"),
    systemPrompt:
      "你是资深 PBL 页面助理。必须返回结构化动作，帮助前端安全地更新参数并触发生成。",
    userPrompt,
    tool: PBL_ASSISTANT_TOOL,
    maxTokens: 3800,
    temperature: 0.2,
  });

  return pblAssistantTurnResponseSchema.parse(raw);
}

function normalizeTurn(params: PblAssistantTurnRequest, turn: PblAssistantTurnResponse) {
  const inputPatch = normalizePatch(params.currentInput, turn.inputPatch);
  let action = turn.action;
  let optionLabel = turn.optionLabel;

  if ((action === "expand_overview" || action === "generate_and_expand") && !optionLabel) {
    optionLabel =
      params.currentPlan?.overviewOption ??
      params.availableOverviews[0]?.optionLabel ??
      "A";
  }

  if (action === "expand_overview" && !params.hasOverviews) {
    action = "generate_and_expand";
  }

  return {
    ...turn,
    action,
    optionLabel,
    inputPatch,
  };
}

export async function resolvePblAssistantTurn(
  params: PblAssistantTurnRequest,
): Promise<PblAssistantTurnResponse> {
  try {
    const turn = await resolveTurnWithAI(params);
    return normalizeTurn(params, turn);
  } catch (error) {
    console.warn("PBL assistant 解析失败，降级到规则解析", error);
    return buildFallbackTurn(params);
  }
}
