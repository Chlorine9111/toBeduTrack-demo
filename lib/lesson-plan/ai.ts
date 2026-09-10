import { randomUUID } from "crypto";
import { z } from "zod";
import { generateToolInputWithGateway } from "@/lib/ai/gateway";
import {
  generateStructuredObject,
  streamStructuredObject,
} from "@/lib/ai/structured-output";
import {
  getModelForTask,
  getResolvedLanguageModelForTask,
} from "@/lib/ai/model-router";
import {
  buildLessonOutlinePrompt,
  buildLessonRewritePrompt,
  buildLessonSectionPrompt,
} from "@/lib/ai/prompt-assembler";
import { buildFallbackSectionBlocks } from "@/lib/lesson-plan/block-factory";
import { buildTemplateOutline } from "@/lib/lesson-plan/templates";
import {
  calloutBlockContentSchema,
  definitionBlockContentSchema,
  dividerBlockContentSchema,
  exampleBlockContentSchema,
  headingBlockContentSchema,
  imageBlockContentSchema,
  lessonPlanBlockVariantSchema,
  lessonPlanCalloutSubtypeSchema,
  mathBlockContentSchema,
  paragraphBlockContentSchema,
  parseLessonBlocksWithFallback,
  pollBlockContentSchema,
  quizBlockContentSchema,
  stepsBlockContentSchema,
  validateSectionBlocks,
} from "@/lib/lesson-plan/block-validation";
import { reviewLessonSectionRule } from "@/lib/ai/quality-review";
import type {
  CedTopicMatch,
  LessonPlanBlock,
  LessonPlanPreferences,
  OutlineResult,
  OutlineSection,
} from "@/lib/lesson-plan/types";

export class LessonPlanAiError extends Error {
  status: number;
  code: "SERVICE_UNAVAILABLE" | "INTERNAL_ERROR";

  constructor(
    message: string,
    status = 500,
    code: "SERVICE_UNAVAILABLE" | "INTERNAL_ERROR" = status === 503
      ? "SERVICE_UNAVAILABLE"
      : "INTERNAL_ERROR",
  ) {
    super(message);
    this.name = "LessonPlanAiError";
    this.status = status;
    this.code = code;
  }
}

type RetrySeverity = "high" | "medium" | "low";

type RetryIssue = {
  severity: RetrySeverity;
  message: string;
};

const outlineSchema = z.object({
  title: z.string().min(1),
  sections: z
    .array(
      z.object({
        title: z.string().min(1),
        summary: z.string().min(1),
        durationMinutes: z.number().int().min(1).max(90),
        keyPoints: z.array(z.string()).max(12),
      }),
    )
    .min(3)
    .max(8),
});

function getOutlineModel() {
  return getModelForTask("lesson_outline");
}

function getSectionModel() {
  return getModelForTask("lesson_section");
}

function getRewriteModel() {
  return getModelForTask("lesson_rewrite");
}

function isAiDisabled() {
  const allowAiInE2E = process.env.E2E_LESSON_USE_AI === "1";
  const aiProviderReady = (() => {
    try {
      getResolvedLanguageModelForTask("lesson_outline");
      getResolvedLanguageModelForTask("lesson_section");
      getResolvedLanguageModelForTask("lesson_rewrite");
      return true;
    } catch {
      return false;
    }
  })();
  if (process.env.E2E_TEST === "1" && !allowAiInE2E) {
    return true;
  }
  return !aiProviderReady;
}

export function assertLessonPlanAiAvailable() {
  if (!isAiDisabled()) return;
  throw new LessonPlanAiError("教案 AI 服务未配置或当前环境禁止调用真实模型。", 503);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function readEnvInt(name: string, fallback: number, min: number, max: number) {
  const raw = Number(process.env[name] ?? "");
  if (!Number.isFinite(raw)) return fallback;
  return clampNumber(Math.floor(raw), min, max);
}

function readEnvFloat(name: string, fallback: number, min: number, max: number) {
  const raw = Number(process.env[name] ?? "");
  if (!Number.isFinite(raw)) return fallback;
  return clampNumber(raw, min, max);
}

const LESSON_MAX_TOKENS_UPPER_BOUND = 6500;
const OUTLINE_MAX_TOKENS = readEnvInt("LESSON_OUTLINE_MAX_TOKENS", 1800, 1200, LESSON_MAX_TOKENS_UPPER_BOUND);
const SECTION_MAX_TOKENS = readEnvInt("LESSON_SECTION_MAX_TOKENS", 4200, 1800, LESSON_MAX_TOKENS_UPPER_BOUND);
const REWRITE_MAX_TOKENS = readEnvInt("LESSON_REWRITE_MAX_TOKENS", 2400, 1200, LESSON_MAX_TOKENS_UPPER_BOUND);
const SECTION_TEMPERATURE = readEnvFloat("LESSON_SECTION_TEMPERATURE", 0.6, 0.2, 0.8);
const SECTION_EFFORT: "low" | "medium" = "low";

const sectionBlocksSchema = z.object({
  blocks: z.array(lessonPlanBlockVariantSchema).min(2).max(10),
});

const LESSON_PLAN_BLOCK_TYPE_VALUES = [
  "heading",
  "paragraph",
  "math",
  "image",
  "callout",
  "divider",
  "definition",
  "example",
  "steps",
  "quiz",
  "poll",
] as const;

const LESSON_PLAN_CALLOUT_SUBTYPE_VALUES = ["warning", "think", "misconception", "connection"] as const;

const lessonPlanOptionInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "text"],
  properties: {
    id: { type: "string" },
    text: { type: "string" },
  },
} as const;

function buildContentInputSchema(blockType: (typeof LESSON_PLAN_BLOCK_TYPE_VALUES)[number]) {
  switch (blockType) {
    case "heading":
      return {
        type: "object",
        additionalProperties: false,
        required: ["level", "text"],
        properties: {
          level: { type: "string", enum: ["h2", "h3"] },
          text: { type: "string" },
        },
      } as const;
    case "paragraph":
      return {
        type: "object",
        additionalProperties: false,
        required: ["text"],
        properties: {
          text: { type: "string" },
        },
      } as const;
    case "math":
      return {
        type: "object",
        additionalProperties: false,
        required: ["latex"],
        properties: {
          latex: { type: "string" },
          displayMode: { type: "boolean" },
        },
      } as const;
    case "image":
      return {
        type: "object",
        additionalProperties: false,
        required: ["url", "alt"],
        properties: {
          url: { type: "string" },
          alt: { type: "string" },
        },
      } as const;
    case "callout":
      return {
        type: "object",
        additionalProperties: false,
        required: ["text"],
        properties: {
          title: { type: "string" },
          text: { type: "string" },
        },
      } as const;
    case "divider":
      return {
        type: "object",
        additionalProperties: false,
        properties: {},
      } as const;
    case "definition":
      return {
        type: "object",
        additionalProperties: false,
        required: ["term", "explanation"],
        properties: {
          term: { type: "string" },
          explanation: { type: "string" },
        },
      } as const;
    case "example":
      return {
        type: "object",
        additionalProperties: false,
        required: ["prompt", "steps"],
        properties: {
          prompt: { type: "string" },
          steps: {
            type: "array",
            minItems: 1,
            items: { type: "string" },
          },
        },
      } as const;
    case "steps":
      return {
        type: "object",
        additionalProperties: false,
        required: ["title", "items"],
        properties: {
          title: { type: "string" },
          items: {
            type: "array",
            minItems: 1,
            items: { type: "string" },
          },
        },
      } as const;
    case "quiz":
      return {
        type: "object",
        additionalProperties: false,
        required: ["question", "options", "correctOptionId", "explanation"],
        properties: {
          question: { type: "string" },
          options: {
            type: "array",
            minItems: 2,
            items: lessonPlanOptionInputSchema,
          },
          correctOptionId: { type: "string" },
          explanation: { type: "string" },
        },
      } as const;
    case "poll":
      return {
        type: "object",
        additionalProperties: false,
        required: ["question", "options"],
        properties: {
          question: { type: "string" },
          options: {
            type: "array",
            minItems: 2,
            items: lessonPlanOptionInputSchema,
          },
          presetDistribution: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["optionId", "percent"],
              properties: {
                optionId: { type: "string" },
                percent: { type: "number" },
              },
            },
          },
        },
      } as const;
  }
}

function buildSectionBlockItemInputSchema(blockType: (typeof LESSON_PLAN_BLOCK_TYPE_VALUES)[number]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "content"],
    properties: {
      type: { type: "string", enum: [blockType] },
      ...(blockType === "callout"
        ? {
            subtype: {
              type: "string",
              enum: [...LESSON_PLAN_CALLOUT_SUBTYPE_VALUES],
            },
          }
        : {}),
      content: buildContentInputSchema(blockType),
      cedCodes: {
        type: "array",
        items: { type: "string" },
      },
      teacherNote: { type: "string" },
    },
  } as const;
}

const sectionBlockItemInputSchema = {
  oneOf: LESSON_PLAN_BLOCK_TYPE_VALUES.map((blockType) => buildSectionBlockItemInputSchema(blockType)),
} as const;

function buildRewriteMutableInputSchema(blockType: LessonPlanBlock["type"]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["content"],
    properties: {
      ...(blockType === "callout"
        ? {
            subtype: {
              type: "string",
              enum: [...LESSON_PLAN_CALLOUT_SUBTYPE_VALUES],
            },
          }
        : {}),
      content: buildContentInputSchema(blockType),
      cedCodes: {
        type: "array",
        items: { type: "string" },
      },
      teacherNote: { type: "string" },
    },
  } as const;
}

function classifyRetryIssue(message: string): RetrySeverity {
  const normalized = message.toLowerCase();
  if (
    /(high|严重|不达标|缺少|错误|重复|未通过|必须|fatal|invalid|fallback)/i.test(normalized)
  ) {
    return "high";
  }
  if (/(medium|建议|不足|偏弱|可改进|一般|warn|warning)/i.test(normalized)) {
    return "medium";
  }
  return "low";
}

function toRetryIssues(issues: string[]): RetryIssue[] {
  return issues
    .map((message) => message.trim())
    .filter((message) => message.length > 0)
    .map((message) => ({
      severity: classifyRetryIssue(message),
      message,
    }));
}

function formatRetryInstructions(params: {
  score: number;
  issues: RetryIssue[];
}) {
  if (params.issues.length === 0) return "";
  const grouped = {
    high: params.issues.filter((item) => item.severity === "high"),
    medium: params.issues.filter((item) => item.severity === "medium"),
    low: params.issues.filter((item) => item.severity === "low"),
  };
  const section = (title: string, issues: RetryIssue[]) => {
    if (issues.length === 0) return "";
    return [title, ...issues.slice(0, 6).map((item) => `- ${item.message}`)].join("\n");
  };
  return [
    `【重要】上一次生成未通过质量审核（评分 ${params.score} 分），存在以下问题：`,
    section("高优先级修复（必须解决）：", grouped.high),
    section("中优先级改进（建议解决）：", grouped.medium),
    section("低优先级优化（可选）：", grouped.low),
    "请在第二次生成时：",
    "1. 先解决所有高优先级问题，再处理中优先级问题。",
    "2. 每个 block 必须包含具体内容（数值、公式、案例），禁止空泛表述。",
    "3. 不要使用“讲解、理解、巩固、总结”等泛化词汇。",
    "4. 每个 example 必须有至少 5 个推导步骤，且说明为什么这样做。",
    "5. 同一 section 内不同 block 的文本不能复用同一套句式。",
  ]
    .filter(Boolean)
    .join("\n");
}

function hasTimeTag(text: string) {
  return /(\(|（)?\s*\d+\s*(分钟|min|mins|秒)\s*(\)|）)?/i.test(text);
}

function isPlaceholderHeadingText(text: string) {
  const normalized = text.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "新标题" ||
    normalized === "title" ||
    normalized === "new title" ||
    normalized === "heading" ||
    /^h[1-6]$/.test(normalized)
  );
}

function primaryCedCode(topics: CedTopicMatch[]) {
  return topics[0]?.learningObjectives[0]?.code ?? "LO-1";
}

function cloneFallbackBlock(block: LessonPlanBlock, sortOrder: number): LessonPlanBlock {
  return {
    ...block,
    id: randomUUID(),
    sortOrder,
    cedCodes: Array.isArray(block.cedCodes) ? block.cedCodes : [],
  };
}

function sanitizeGeneratedBlocks(params: {
  blocks: LessonPlanBlock[];
  section: OutlineSection;
  topics: CedTopicMatch[];
  preferences: LessonPlanPreferences;
  courseName?: string;
  sectionIndex?: number;
  totalSections?: number;
  allSections?: OutlineSection[];
}) {
  const defaultCedCode = primaryCedCode(params.topics);
  const fallbackPool = buildFallbackSectionBlocks({
    section: params.section,
    topic: params.topics[0] ?? null,
    courseName: params.courseName,
    sectionIndex: params.sectionIndex,
    totalSections: params.totalSections,
    allSections: params.allSections,
  });

  const normalized: LessonPlanBlock[] = params.blocks.map((block, index) => {
    const headingText =
      block.type === "heading" &&
      block.content &&
      typeof block.content === "object" &&
      typeof (block.content as Record<string, unknown>).text === "string"
        ? String((block.content as Record<string, unknown>).text)
        : "";
    const normalizedHeading =
      block.type === "heading" && isPlaceholderHeadingText(headingText)
        ? (hasTimeTag(params.section.title)
            ? params.section.title
            : `${params.section.title}（${params.section.durationMinutes} 分钟）`)
        : headingText;
    const nextContent =
      block.type === "heading" &&
      block.content &&
      typeof block.content === "object" &&
      typeof (block.content as Record<string, unknown>).text === "string" &&
      !hasTimeTag(normalizedHeading)
        ? {
            ...(block.content as Record<string, unknown>),
            text: `${normalizedHeading}（${params.section.durationMinutes} 分钟）`,
          }
        : block.type === "heading" &&
            block.content &&
            typeof block.content === "object" &&
            typeof (block.content as Record<string, unknown>).text === "string"
          ? {
              ...(block.content as Record<string, unknown>),
              text: normalizedHeading,
            }
        : block.content;

    return {
      ...block,
      id: block.id || randomUUID(),
      sortOrder: index,
      content: nextContent as Record<string, unknown>,
      cedCodes: Array.isArray(block.cedCodes) && block.cedCodes.length > 0 ? block.cedCodes : [defaultCedCode],
      teacherNote: block.teacherNote ?? null,
    };
  });

  const addFallbackTypeIfMissing = (type: LessonPlanBlock["type"], predicate?: (block: LessonPlanBlock) => boolean) => {
    const matched = fallbackPool.find((item) => item.type === type && (!predicate || predicate(item)));
    if (!matched) return;
    normalized.push(cloneFallbackBlock(matched, normalized.length));
  };

  if (!normalized.some((block) => block.type === "example")) {
    addFallbackTypeIfMissing("example");
  }

  // misconception callout 不再自动补充到每个 section，
  // 由 AI 根据章节内容自行决定是否需要。

  const sectionNeedsInteractive =
    params.preferences.quizDensity !== "low" &&
    /(检验|quiz|模拟|测验|评估)/i.test(params.section.title);
  if (sectionNeedsInteractive && !normalized.some((block) => block.type === "quiz" || block.type === "poll")) {
    addFallbackTypeIfMissing("quiz");
  }

  if (params.preferences.includeTeacherNotes) {
    const hasTeacherNote = normalized.some(
      (block) => typeof block.teacherNote === "string" && block.teacherNote.trim().length > 0,
    );
    if (!hasTeacherNote && normalized.length > 0) {
      normalized[0] = {
        ...normalized[0],
        teacherNote: "Fallback 修复：建议先核对学生先备知识，再决定讲授节奏。",
      };
    }
  }

  return normalized.map((block, index) => ({
    ...block,
    sortOrder: index,
  }));
}

function getRewriteMutableSchema(blockType: LessonPlanBlock["type"]) {
  const baseFields = {
    cedCodes: z.array(z.string()).optional(),
    teacherNote: z.string().optional(),
  };

  switch (blockType) {
    case "heading":
      return z.object({ content: headingBlockContentSchema, ...baseFields });
    case "paragraph":
      return z.object({ content: paragraphBlockContentSchema, ...baseFields });
    case "math":
      return z.object({ content: mathBlockContentSchema, ...baseFields });
    case "image":
      return z.object({ content: imageBlockContentSchema, ...baseFields });
    case "callout":
      return z.object({
        content: calloutBlockContentSchema,
        subtype: lessonPlanCalloutSubtypeSchema.optional(),
        ...baseFields,
      });
    case "divider":
      return z.object({ content: dividerBlockContentSchema, ...baseFields });
    case "definition":
      return z.object({ content: definitionBlockContentSchema, ...baseFields });
    case "example":
      return z.object({ content: exampleBlockContentSchema, ...baseFields });
    case "steps":
      return z.object({ content: stepsBlockContentSchema, ...baseFields });
    case "quiz":
      return z.object({ content: quizBlockContentSchema, ...baseFields });
    case "poll":
      return z.object({ content: pollBlockContentSchema, ...baseFields });
    default:
      return z.object({ content: z.record(z.string(), z.unknown()), ...baseFields });
  }
}

type RewriteMutableResult = {
  content: Record<string, unknown>;
  subtype?: LessonPlanBlock["subtype"];
  cedCodes?: string[];
  teacherNote?: string;
};

function createDraftLessonBlock(params: {
  type: LessonPlanBlock["type"];
  sortOrder: number;
  content: Record<string, unknown>;
  subtype?: LessonPlanBlock["subtype"];
  cedCodes?: string[];
}): LessonPlanBlock {
  return {
    id: randomUUID(),
    type: params.type,
    subtype: params.subtype,
    sortOrder: params.sortOrder,
    content: params.content,
    cedCodes: params.cedCodes ?? [],
  };
}

function trimJoinedLines(lines: string[]) {
  return lines
    .map((line) => `${line ?? ""}`.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function takeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => `${item ?? ""}`.trim()).filter(Boolean);
}

function buildDraftSectionBlocksFromPartial(params: {
  partialObject: Partial<z.infer<typeof sectionBlocksSchema>>;
  section: OutlineSection;
  topics: CedTopicMatch[];
}) {
  const defaultCedCode = primaryCedCode(params.topics);
  const rawBlocks = Array.isArray(params.partialObject.blocks)
    ? params.partialObject.blocks
    : [];
  const draftBlocks: LessonPlanBlock[] = [];
  const headingText = hasTimeTag(params.section.title)
    ? params.section.title
    : `${params.section.title}（${params.section.durationMinutes} 分钟）`;
  let nextSortOrder = 0;

  draftBlocks.push(
    createDraftLessonBlock({
      type: "heading",
      sortOrder: nextSortOrder,
      content: { level: "h2", text: headingText },
      cedCodes: [defaultCedCode],
    }),
  );
  nextSortOrder += 1;

  const appendParagraphIfNeeded = (text: string) => {
    const normalized = text.trim();
    if (!normalized) return;
    const previous = draftBlocks[draftBlocks.length - 1];
    if (
      previous?.type === "paragraph" &&
      typeof previous.content?.text === "string" &&
      previous.content.text === normalized
    ) {
      return;
    }
    draftBlocks.push(
      createDraftLessonBlock({
        type: "paragraph",
        sortOrder: nextSortOrder,
        content: { text: normalized },
        cedCodes: [defaultCedCode],
      }),
    );
    nextSortOrder += 1;
  };

  for (const rawBlock of rawBlocks) {
    if (!rawBlock || typeof rawBlock !== "object" || Array.isArray(rawBlock)) continue;
    const candidate = rawBlock as Record<string, unknown>;
    const type =
      typeof candidate.type === "string" ? candidate.type : "";
    const rawContent =
      candidate.content && typeof candidate.content === "object" && !Array.isArray(candidate.content)
        ? (candidate.content as Record<string, unknown>)
        : {};

    if (type === "heading") {
      const text = `${rawContent.text ?? ""}`.trim();
      if (text && text !== headingText) {
        appendParagraphIfNeeded(text);
      }
      continue;
    }

    if (type === "paragraph") {
      appendParagraphIfNeeded(`${rawContent.text ?? ""}`);
      continue;
    }

    if (type === "definition") {
      const term = `${rawContent.term ?? ""}`.trim();
      const explanation = `${rawContent.explanation ?? ""}`.trim();
      if (term || explanation) {
        draftBlocks.push(
          createDraftLessonBlock({
            type: "definition",
            sortOrder: nextSortOrder,
            content: {
              term: term || "核心概念",
              explanation: explanation || "正在生成定义说明...",
            },
            cedCodes: [defaultCedCode],
          }),
        );
        nextSortOrder += 1;
      }
      continue;
    }

    if (type === "example") {
      const prompt = `${rawContent.prompt ?? ""}`.trim();
      const steps = takeStringList(rawContent.steps);
      if (prompt || steps.length > 0) {
        draftBlocks.push(
          createDraftLessonBlock({
            type: "example",
            sortOrder: nextSortOrder,
            content: {
              prompt: prompt || "正在生成示例...",
              steps: steps.length > 0 ? steps : ["正在生成解题步骤..."],
            },
            cedCodes: [defaultCedCode],
          }),
        );
        nextSortOrder += 1;
      }
      continue;
    }

    if (type === "steps") {
      const title = `${rawContent.title ?? ""}`.trim();
      const items = takeStringList(rawContent.items);
      if (title || items.length > 0) {
        draftBlocks.push(
          createDraftLessonBlock({
            type: "steps",
            sortOrder: nextSortOrder,
            content: {
              title: title || "课堂步骤",
              items: items.length > 0 ? items : ["正在生成课堂步骤..."],
            },
            cedCodes: [defaultCedCode],
          }),
        );
        nextSortOrder += 1;
      }
      continue;
    }

    if (type === "callout") {
      const title = `${rawContent.title ?? ""}`.trim();
      const text = `${rawContent.text ?? ""}`.trim();
      if (title || text) {
        draftBlocks.push(
          createDraftLessonBlock({
            type: "callout",
            sortOrder: nextSortOrder,
            subtype:
              candidate.subtype === "warning" ||
              candidate.subtype === "think" ||
              candidate.subtype === "misconception" ||
              candidate.subtype === "connection"
                ? candidate.subtype
                : "think",
            content: {
              title: title || "想一想",
              text: text || "正在生成提示内容...",
            },
            cedCodes: [defaultCedCode],
          }),
        );
        nextSortOrder += 1;
      }
      continue;
    }

    if (type === "quiz") {
      const question = `${rawContent.question ?? ""}`.trim();
      const options = Array.isArray(rawContent.options)
        ? (rawContent.options as Array<Record<string, unknown>>)
            .map((option, index) => {
              const optionId = `${option?.id ?? String.fromCharCode(65 + index)}`.trim();
              const optionText = `${option?.text ?? ""}`.trim();
              if (!optionText) return null;
              return { id: optionId || String.fromCharCode(65 + index), text: optionText };
            })
            .filter((option): option is { id: string; text: string } => Boolean(option))
        : [];
      const explanation = `${rawContent.explanation ?? ""}`.trim();
      if (question || options.length >= 2 || explanation) {
        draftBlocks.push(
          createDraftLessonBlock({
            type: "quiz",
            sortOrder: nextSortOrder,
            content: {
              question: question || "正在生成检验题...",
              options:
                options.length >= 2
                  ? options
                  : [
                      { id: "A", text: "正在生成选项 A..." },
                      { id: "B", text: "正在生成选项 B..." },
                    ],
              correctOptionId:
                typeof rawContent.correctOptionId === "string" && rawContent.correctOptionId.trim()
                  ? rawContent.correctOptionId.trim()
                  : "A",
              explanation: explanation || "正在生成解析...",
            },
            cedCodes: [defaultCedCode],
          }),
        );
        nextSortOrder += 1;
      }
      continue;
    }

    if (type === "math") {
      const latex = `${rawContent.latex ?? ""}`.trim();
      if (latex) {
        draftBlocks.push(
          createDraftLessonBlock({
            type: "math",
            sortOrder: nextSortOrder,
            content: {
              latex,
              displayMode: rawContent.displayMode !== false,
            },
            cedCodes: [defaultCedCode],
          }),
        );
        nextSortOrder += 1;
      }
      continue;
    }

    const fallbackText = trimJoinedLines(
      Object.values(rawContent).flatMap((value) => {
        if (typeof value === "string") return [value];
        if (Array.isArray(value)) return value.map((item) => `${item ?? ""}`);
        return [];
      }),
    );
    appendParagraphIfNeeded(fallbackText);
  }

  if (draftBlocks.length === 1) {
    return null;
  }

  return draftBlocks.map((block, index) => ({
    ...block,
    sortOrder: index,
  }));
}

export async function generateOutlineWithAi(params: {
  sourcePrompt: string;
  titleHint: string;
  topics: CedTopicMatch[];
  preferences: LessonPlanPreferences;
  courseName?: string;
  abortSignal?: AbortSignal;
}): Promise<OutlineResult> {
  assertLessonPlanAiAvailable();

  const shouldUseTemplateOutline =
    params.courseName?.trim() === "通用" ||
    params.topics.every(
      (topic) =>
        topic.learningObjectives.length === 0 &&
        topic.essentialKnowledge.length === 0,
    );
  if (shouldUseTemplateOutline) {
    return buildTemplateOutline({
      templateKind: params.preferences.templateKind,
      topics: params.topics,
      totalMinutes: params.preferences.durationMinutes,
      titleHint: params.titleHint,
    });
  }

  const model = getOutlineModel();

  const tool = {
    name: "return_outline",
    description: "Return a structured lesson plan outline-solid",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "sections"],
      properties: {
        title: { type: "string" },
        sections: {
          type: "array",
          minItems: 3,
          maxItems: 8,
          items: {
            type: "object",
            required: ["title", "summary", "durationMinutes", "keyPoints"],
            properties: {
              title: { type: "string" },
              summary: { type: "string" },
              durationMinutes: { type: "integer", minimum: 1, maximum: 90 },
              keyPoints: {
                type: "array",
                items: { type: "string" },
                maxItems: 12,
              },
            },
          },
        },
      },
    },
  };

  const { systemPrompt, userPrompt } = await buildLessonOutlinePrompt({
    sourcePrompt: params.sourcePrompt,
    titleHint: params.titleHint,
    topics: params.topics,
    preferences: params.preferences,
    courseName: params.courseName,
  });

  const toOutlineResult = (parsed: z.infer<typeof outlineSchema>): OutlineResult => {
    const sections: OutlineSection[] = parsed.sections.map((section) => ({
      id: randomUUID(),
      title: section.title,
      summary: section.summary,
      durationMinutes: section.durationMinutes,
      keyPoints: section.keyPoints,
    }));
    return { title: parsed.title, sections };
  };

  // 主路径：Vercel AI SDK 结构化输出
  try {
    const parsed = await generateStructuredObject({
      model,
      schema: outlineSchema,
      systemPrompt,
      userPrompt,
      maxTokens: OUTLINE_MAX_TOKENS,
      temperature: 0.2,
      effort: "medium",
      abortSignal: params.abortSignal,
    });
    return toOutlineResult(parsed);
  } catch (primaryErr) {
    console.warn("generateStructuredObject failed for outline, falling back to gateway tool call:", primaryErr);
  }

  // Fallback：统一 gateway tool calling
  try {
    const { input: raw } = await generateToolInputWithGateway<Record<string, unknown>>({
      model,
      maxTokens: OUTLINE_MAX_TOKENS,
      temperature: 0.2,
      effort: "medium",
      systemPrompt,
      userPrompt,
      tool,
      abortSignal: params.abortSignal,
    });

    return toOutlineResult(outlineSchema.parse(raw));
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知异常";
    console.warn("教案大纲生成失败，回退到模板大纲：", message);
    return buildTemplateOutline({
      templateKind: params.preferences.templateKind,
      topics: params.topics,
      totalMinutes: params.preferences.durationMinutes,
      titleHint: params.titleHint,
    });
  }
}

export async function generateSectionBlocksWithAi(params: {
  sourcePrompt: string;
  section: OutlineSection;
  topics: CedTopicMatch[];
  preferences: LessonPlanPreferences;
  previousSummary?: string;
  nextSummary?: string;
  sectionIndex?: number;
  totalSections?: number;
  allSections?: OutlineSection[];
  onWarning?: (issues: string[]) => void;
  onDraftBlocks?: (blocks: LessonPlanBlock[]) => void;
  courseName?: string;
  abortSignal?: AbortSignal;
}): Promise<LessonPlanBlock[]> {
  assertLessonPlanAiAvailable();

  const shouldUseTemplateBlocks =
    params.courseName?.trim() === "通用" ||
    params.topics.every(
      (topic) =>
        topic.learningObjectives.length === 0 &&
        topic.essentialKnowledge.length === 0,
    );
  if (shouldUseTemplateBlocks) {
    return buildFallbackSectionBlocks({
      section: params.section,
      topic: params.topics[0] ?? null,
      courseName: params.courseName,
      sectionIndex: params.sectionIndex,
      totalSections: params.totalSections,
      allSections: params.allSections,
    });
  }

  const model = getSectionModel();

  const tool = {
    name: "return_section_blocks",
    description: "Return blocks for one lesson section",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["blocks"],
      properties: {
        blocks: {
          type: "array",
          minItems: 2,
          maxItems: 10,
          items: sectionBlockItemInputSchema,
        },
      },
    },
  };

  const generateOnce = async (retryPayload?: { score: number; issues: RetryIssue[] }) => {
    const { systemPrompt, userPrompt } = await buildLessonSectionPrompt({
      sourcePrompt: params.sourcePrompt,
      section: params.section,
      topics: params.topics,
      preferences: params.preferences,
      previousSummary: params.previousSummary,
      nextSummary: params.nextSummary,
      courseName: params.courseName,
      retryInstructions:
        retryPayload && retryPayload.issues.length > 0
          ? formatRetryInstructions({
              score: retryPayload.score,
              issues: retryPayload.issues,
            })
          : undefined,
    });

    let raw: Record<string, unknown> | null = null;
    try {
      let lastDraftSerialized = "";
      const streamed = await streamStructuredObject({
        model,
        schema: sectionBlocksSchema,
        systemPrompt,
        userPrompt,
        maxTokens: SECTION_MAX_TOKENS,
        temperature: SECTION_TEMPERATURE,
        effort: SECTION_EFFORT,
        abortSignal: params.abortSignal,
        onPartialObject: (partialObject) => {
          if (!params.onDraftBlocks) return;
          const draftBlocks = buildDraftSectionBlocksFromPartial({
            partialObject,
            section: params.section,
            topics: params.topics,
          });
          if (!draftBlocks) return;
          const serialized = JSON.stringify(
            draftBlocks.map((block) => ({
              type: block.type,
              subtype: block.subtype ?? null,
              content: block.content,
            })),
          );
          if (serialized === lastDraftSerialized) return;
          lastDraftSerialized = serialized;
          params.onDraftBlocks(draftBlocks);
        },
      });
      raw = streamed as Record<string, unknown>;
    } catch (primaryErr) {
      console.warn("streamStructuredObject failed for sectionBlocks, falling back to tool-use:", primaryErr);
    }

    if (!raw) {
      const toolResult = await generateToolInputWithGateway<Record<string, unknown>>({
        model,
        systemPrompt,
        userPrompt,
        maxTokens: SECTION_MAX_TOKENS,
        temperature: SECTION_TEMPERATURE,
        effort: SECTION_EFFORT,
        tool,
        abortSignal: params.abortSignal,
      });
      raw = toolResult.input;
    }

    if (!raw) {
      raw = await generateStructuredObject({
        model,
        schema: sectionBlocksSchema,
        systemPrompt,
        userPrompt,
        maxTokens: SECTION_MAX_TOKENS,
        temperature: SECTION_TEMPERATURE,
        effort: SECTION_EFFORT,
        abortSignal: params.abortSignal,
      });
    }
    const parsed = parseLessonBlocksWithFallback(raw);
    const sanitizedBlocks = sanitizeGeneratedBlocks({
      blocks: parsed.blocks,
      section: params.section,
      topics: params.topics,
      preferences: params.preferences,
      courseName: params.courseName,
      sectionIndex: params.sectionIndex,
      totalSections: params.totalSections,
      allSections: params.allSections,
    });
    const checked = validateSectionBlocks({
      blocks: sanitizedBlocks,
      sectionTitle: params.section.title,
      preferences: params.preferences,
      parseIssues: [],
    });
    const sectionReview = reviewLessonSectionRule({
      sourcePrompt: params.sourcePrompt,
      section: {
        id: params.section.id,
        title: params.section.title,
        summary: params.section.summary,
        durationMinutes: params.section.durationMinutes,
        sortOrder: 0,
        blocks: sanitizedBlocks,
      },
      preferences: params.preferences,
      topics: params.topics,
    });
    const sectionIssues = sectionReview.issues.map((issue) => ({
      severity: issue.severity,
      message: `${issue.message} 建议：${issue.suggestion}`,
    }));
    const highSeverityIssueCount = sectionReview.issues.filter(
      (issue) => issue.severity === "high",
    ).length;
    const parseIssueHeavy =
      parsed.issues.length >= 2 &&
      parsed.issues.length > Math.floor(Math.max(1, sanitizedBlocks.length / 3));
    const combinedIssues = [
      ...toRetryIssues(parsed.issues),
      ...toRetryIssues(checked.issues),
      ...sectionIssues,
    ];
    return {
      blocks: sanitizedBlocks,
      issues: combinedIssues,
      valid:
        checked.valid &&
        !parseIssueHeavy &&
        sectionReview.score >= 50 &&
        highSeverityIssueCount <= 1,
      parseIssueHeavy,
      score: sectionReview.score,
    };
  };

  try {
    const firstAttempt = await generateOnce();
    if (firstAttempt.valid) {
      return firstAttempt.blocks;
    }

    // 放宽条件：第一次生成虽未完全通过但可用，标记警告后返回
    const canUseFirstAttemptWithWarning =
      !firstAttempt.parseIssueHeavy &&
      firstAttempt.blocks.length >= 3 &&
      firstAttempt.score >= 45;
    if (canUseFirstAttemptWithWarning) {
      params.onWarning?.([
        ...firstAttempt.issues.map((item) => item.message),
        `章节评分 ${firstAttempt.score} 分，已保留首轮可用内容并标记为需人工复核。`,
      ]);
      return firstAttempt.blocks;
    }

    // 第一次不可用，直接回退到 fallback blocks（不再做第二次重试）
    const fallbackBlocks = buildFallbackSectionBlocks({
      section: params.section,
      topic: params.topics[0] ?? null,
      courseName: params.courseName,
      sectionIndex: params.sectionIndex,
      totalSections: params.totalSections,
      allSections: params.allSections,
    });
    params.onWarning?.([
      ...firstAttempt.issues.map((item) => item.message),
      `章节评分 ${firstAttempt.score} 分，已回退到兜底模板。`,
    ]);
    return fallbackBlocks;
  } catch (error) {
    if (params.abortSignal?.aborted) {
      throw error;
    }
    if (error instanceof LessonPlanAiError && error.code === "SERVICE_UNAVAILABLE") {
      throw error;
    }
    const message = error instanceof Error ? error.message : "未知异常";
    const fallbackBlocks = buildFallbackSectionBlocks({
      section: params.section,
      topic: params.topics[0] ?? null,
      courseName: params.courseName,
      sectionIndex: params.sectionIndex,
      totalSections: params.totalSections,
      allSections: params.allSections,
    });
    params.onWarning?.([`章节生成异常：${message}，已回退到兜底模板。`]);
    return fallbackBlocks;
  }
}

export async function rewriteBlockWithAi(params: {
  sourcePrompt: string;
  instruction: string;
  block: LessonPlanBlock;
  previousBlock: LessonPlanBlock | null;
  nextBlock: LessonPlanBlock | null;
  topics: CedTopicMatch[];
  preferences: LessonPlanPreferences;
  courseName?: string;
}): Promise<LessonPlanBlock> {
  assertLessonPlanAiAvailable();

  const model = getRewriteModel();

  const rewriteMutableSchema = getRewriteMutableSchema(params.block.type);

  const tool = {
    name: "return_rewritten_block",
    description: "Return one rewritten lesson block",
    inputSchema: buildRewriteMutableInputSchema(params.block.type),
  };

  const { systemPrompt, userPrompt } = await buildLessonRewritePrompt({
    sourcePrompt: params.sourcePrompt,
    instruction: params.instruction,
    block: params.block,
    previousBlock: params.previousBlock,
    nextBlock: params.nextBlock,
    topics: params.topics,
    preferences: params.preferences,
    courseName: params.courseName,
  });

  const mergeRewriteResult = (mutable: RewriteMutableResult): LessonPlanBlock => {
    const nextSubtype =
      params.block.type === "callout"
        ? (mutable.subtype ?? params.block.subtype)
        : undefined;
    return {
      ...params.block,
      type: params.block.type,
      subtype: nextSubtype,
      content: mutable.content,
      cedCodes: mutable.cedCodes ?? params.block.cedCodes,
      teacherNote: mutable.teacherNote ?? params.block.teacherNote,
    };
  };

  // 主路径：Vercel AI SDK 结构化输出（缩窄输出面）
  try {
    const mutableRaw = await generateStructuredObject({
      model,
      schema: rewriteMutableSchema,
      systemPrompt,
      userPrompt,
      maxTokens: REWRITE_MAX_TOKENS,
      temperature: 0.35,
    });
    return mergeRewriteResult({
      content: mutableRaw.content as Record<string, unknown>,
      subtype: ("subtype" in mutableRaw ? mutableRaw.subtype : undefined) as RewriteMutableResult["subtype"],
      cedCodes: mutableRaw.cedCodes,
      teacherNote: mutableRaw.teacherNote,
    });
  } catch (primaryErr) {
    console.warn("generateStructuredObject failed for rewrite, falling back to gateway tool call:", primaryErr);
  }

  // Fallback：统一 gateway tool calling
  try {
    const { input: raw } = await generateToolInputWithGateway<Record<string, unknown>>({
      model,
      maxTokens: REWRITE_MAX_TOKENS,
      temperature: 0.35,
      systemPrompt,
      userPrompt,
      tool,
    });

    const mutableRaw = rewriteMutableSchema.parse(raw);

    return mergeRewriteResult({
      content: mutableRaw.content as Record<string, unknown>,
      subtype: ("subtype" in mutableRaw ? mutableRaw.subtype : undefined) as RewriteMutableResult["subtype"],
      cedCodes: mutableRaw.cedCodes,
      teacherNote: mutableRaw.teacherNote,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知异常";
    throw new LessonPlanAiError(`教案内容块改写失败：${message}`, 502);
  }
}
