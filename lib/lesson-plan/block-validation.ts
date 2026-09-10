import { randomUUID } from "crypto";
import { z } from "zod";
import { createBlock } from "@/lib/lesson-plan/block-factory";
import type { LessonPlanBlock, LessonPlanPreferences } from "@/lib/lesson-plan/types";
import { BANNED_VAGUE_WORDS } from "@/lib/lesson-plan/prompt-rules";

export const lessonPlanOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});

export const lessonPlanCalloutSubtypeSchema = z.enum(["warning", "think", "misconception", "connection"]);

export const headingBlockContentSchema = z.object({
  level: z.enum(["h2", "h3"]),
  text: z.string().min(1),
});

export const paragraphBlockContentSchema = z.object({
  text: z.string().min(1),
});

export const mathBlockContentSchema = z.object({
  latex: z.string().min(1),
  displayMode: z.boolean().default(true),
});

export const imageBlockContentSchema = z.object({
  url: z.string(),
  alt: z.string(),
});

export const calloutBlockContentSchema = z.object({
  title: z.string().default("提示"),
  text: z.string().min(1),
});

export const dividerBlockContentSchema = z.object({}).default({});

export const definitionBlockContentSchema = z.object({
  term: z.string().min(1),
  explanation: z.string().min(1),
});

export const exampleBlockContentSchema = z.object({
  prompt: z.string().min(1),
  steps: z.array(z.string().min(1)).min(1),
});

export const stepsBlockContentSchema = z.object({
  title: z.string(),
  items: z.array(z.string().min(1)).min(1),
});

export const quizBlockContentSchema = z.object({
  question: z.string().min(1),
  options: z.array(lessonPlanOptionSchema).min(2),
  correctOptionId: z.string().min(1),
  explanation: z.string().min(1),
});

export const pollBlockContentSchema = z.object({
  question: z.string().min(1),
  options: z.array(lessonPlanOptionSchema).min(2),
  presetDistribution: z
    .array(
      z.object({
        optionId: z.string().min(1),
        percent: z.number(),
      }),
    )
    .optional(),
});

export const lessonPlanBlockVariantSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("heading"),
    content: headingBlockContentSchema,
    cedCodes: z.array(z.string()).default([]),
    teacherNote: z.string().optional(),
  }),
  z.object({
    type: z.literal("paragraph"),
    content: paragraphBlockContentSchema,
    cedCodes: z.array(z.string()).default([]),
    teacherNote: z.string().optional(),
  }),
  z.object({
    type: z.literal("math"),
    content: mathBlockContentSchema,
    cedCodes: z.array(z.string()).default([]),
    teacherNote: z.string().optional(),
  }),
  z.object({
    type: z.literal("image"),
    content: imageBlockContentSchema,
    cedCodes: z.array(z.string()).default([]),
    teacherNote: z.string().optional(),
  }),
  z.object({
    type: z.literal("callout"),
    subtype: lessonPlanCalloutSubtypeSchema.optional(),
    content: calloutBlockContentSchema,
    cedCodes: z.array(z.string()).default([]),
    teacherNote: z.string().optional(),
  }),
  z.object({
    type: z.literal("divider"),
    content: dividerBlockContentSchema,
    cedCodes: z.array(z.string()).default([]),
    teacherNote: z.string().optional(),
  }),
  z.object({
    type: z.literal("definition"),
    content: definitionBlockContentSchema,
    cedCodes: z.array(z.string()).default([]),
    teacherNote: z.string().optional(),
  }),
  z.object({
    type: z.literal("example"),
    content: exampleBlockContentSchema,
    cedCodes: z.array(z.string()).default([]),
    teacherNote: z.string().optional(),
  }),
  z.object({
    type: z.literal("steps"),
    content: stepsBlockContentSchema,
    cedCodes: z.array(z.string()).default([]),
    teacherNote: z.string().optional(),
  }),
  z.object({
    type: z.literal("quiz"),
    content: quizBlockContentSchema,
    cedCodes: z.array(z.string()).default([]),
    teacherNote: z.string().optional(),
  }),
  z.object({
    type: z.literal("poll"),
    content: pollBlockContentSchema,
    cedCodes: z.array(z.string()).default([]),
    teacherNote: z.string().optional(),
  }),
]);

const blockArrayContainerSchema = z.object({
  blocks: z.array(z.unknown()).min(2).max(15),
});

type BlockVariant = z.infer<typeof lessonPlanBlockVariantSchema>;

function isKnownBlockType(type: unknown): type is LessonPlanBlock["type"] {
  return (
    type === "heading" ||
    type === "paragraph" ||
    type === "math" ||
    type === "image" ||
    type === "callout" ||
    type === "divider" ||
    type === "definition" ||
    type === "example" ||
    type === "steps" ||
    type === "quiz" ||
    type === "poll"
  );
}

function fallbackBlock(type: LessonPlanBlock["type"], index: number): LessonPlanBlock {
  return createBlock(type, index);
}

function containsTimeTag(text: string) {
  return /(\[|\(|（)?\s*\d+\s*(分钟|min|mins|秒)\s*(\]|\)|）)?/i.test(text);
}

function containsMathCue(text: string) {
  return /(\d|=|\+|-|\*|\/|\^|lim|f\(x\)|导数|积分|概率|方程)/i.test(text);
}

function countKeyword(text: string, keyword: string) {
  if (!text) return 0;
  const pattern = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return (text.match(pattern) ?? []).length;
}

function coerceBlockContainer(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }
  const candidate = { ...(input as Record<string, unknown>) };
  if (typeof candidate.blocks === "string") {
    try {
      const parsed = JSON.parse(candidate.blocks);
      if (Array.isArray(parsed)) {
        candidate.blocks = parsed;
      }
    } catch {
      /* keep original value */
    }
  }
  return candidate;
}

export function parseLessonBlocksWithFallback(input: unknown) {
  const container = blockArrayContainerSchema.safeParse(coerceBlockContainer(input));
  if (!container.success) {
    return {
      blocks: [] as LessonPlanBlock[],
      issues: ["blocks 容器结构不合法。"],
    };
  }

  const issues: string[] = [];
  const parsedBlocks: LessonPlanBlock[] = container.data.blocks.map((raw, index) => {
    const parsed = lessonPlanBlockVariantSchema.safeParse(raw);
    if (parsed.success) {
      const normalized = parsed.data as BlockVariant;
      return {
        id: randomUUID(),
        type: normalized.type,
        subtype: normalized.type === "callout" ? normalized.subtype : undefined,
        sortOrder: index,
        content: normalized.content as Record<string, unknown>,
        cedCodes: normalized.cedCodes ?? [],
        teacherNote: normalized.teacherNote ?? null,
      };
    }

    const rawType =
      raw && typeof raw === "object" && isKnownBlockType((raw as Record<string, unknown>).type)
        ? ((raw as Record<string, unknown>).type as LessonPlanBlock["type"])
        : "paragraph";
    issues.push(`第 ${index + 1} 个 block 结构不合法，已替换为默认 ${rawType}。`);
    return fallbackBlock(rawType, index);
  });

  return { blocks: parsedBlocks, issues };
}

export function validateSectionBlocks(params: {
  blocks: LessonPlanBlock[];
  sectionTitle: string;
  preferences: LessonPlanPreferences;
  parseIssues?: string[];
}) {
  const issues: string[] = [...(params.parseIssues ?? [])];

  if (params.blocks.length < 2) {
    issues.push("block 数量不足 2。");
  }

  const hasCed = params.blocks.some((block) => Array.isArray(block.cedCodes) && block.cedCodes.length > 0);
  if (!hasCed) {
    issues.push("至少需要 1 个带 cedCodes 的 block。");
  }

  const shouldContainInteractive =
    params.preferences.quizDensity !== "low" &&
    /(检验|quiz|模拟|测验|评估)/i.test(params.sectionTitle);
  if (shouldContainInteractive) {
    const hasInteractive = params.blocks.some((block) => block.type === "quiz" || block.type === "poll");
    if (!hasInteractive) {
      issues.push("当前章节需要 quiz/poll block。");
    }
  }

  if (params.preferences.includeTeacherNotes) {
    const hasTeacherNote = params.blocks.some(
      (block) => typeof block.teacherNote === "string" && block.teacherNote.trim().length > 0,
    );
    if (!hasTeacherNote) {
      issues.push("教师备注已开启，但未生成 teacherNote。");
    }
  }

  const exampleBlocks = params.blocks.filter((block) => block.type === "example");
  if (exampleBlocks.length === 0) {
    issues.push("当前章节缺少 example block。");
  } else {
    const hasConcreteExample = exampleBlocks.some((block) => {
      const prompt = String((block.content as Record<string, unknown>).prompt ?? "");
      return containsMathCue(prompt);
    });
    if (!hasConcreteExample) {
      issues.push("example 题干缺少具体数字或数学表达式。");
    }

    const hasDetailedSteps = exampleBlocks.some((block) => {
      const steps = (block.content as Record<string, unknown>).steps;
      return Array.isArray(steps) && steps.length >= 5;
    });
    if (!hasDetailedSteps) {
      issues.push("example 推导步骤不足（建议至少 5 步）。");
    }
  }

  // misconception callout 不再强制每个 section 都有，
  // 改为文档级别建议（整份教案 1-2 个即可）。

  const headingTexts = params.blocks
    .filter((block) => block.type === "heading")
    .map((block) => String((block.content as Record<string, unknown>).text ?? ""));
  const hasHeadingTime = containsTimeTag(params.sectionTitle) || headingTexts.some(containsTimeTag);
  if (!hasHeadingTime) {
    issues.push("章节标题未标注时间（如“（8 分钟）”）。");
  }

  const stepsItems = params.blocks
    .filter((block) => block.type === "steps")
    .flatMap((block) => {
      const items = (block.content as Record<string, unknown>).items;
      return Array.isArray(items) ? items.map((item) => String(item ?? "")) : [];
    });
  if (stepsItems.length > 0 && stepsItems.every((item) => !containsTimeTag(item))) {
    issues.push("steps.items 缺少时间标签（如“[2 分钟]”）。");
  }

  const plainText = params.blocks
    .filter((block) => block.type === "paragraph" || block.type === "heading")
    .map((block) => Object.values(block.content ?? {}).join(" "))
    .join(" ");
  const vagueHits = BANNED_VAGUE_WORDS.reduce((sum, word) => sum + countKeyword(plainText, word), 0);
  if (vagueHits > 10) {
    issues.push(`泛化表述过多（${vagueHits} 次），应替换为具体教学动作。`);
  }

  if (params.preferences.studentLevel === "basic") {
    const hasDefinition = params.blocks.some((block) => block.type === "definition");
    if (!hasDefinition) {
      issues.push("基础层章节必须包含 definition block。");
    }
  }

  const shortParagraphs = params.blocks.filter((block) => {
    if (block.type !== "paragraph") return false;
    const text = String((block.content as Record<string, unknown>).text ?? "");
    return text.length < 80;
  });
  if (shortParagraphs.length > 0) {
    issues.push(`${shortParagraphs.length} 个 paragraph 内容过短（< 80 字），应包含完整的教学脚本。`);
  }

  const shortDefinitions = params.blocks.filter((block) => {
    if (block.type !== "definition") return false;
    const explanation = String((block.content as Record<string, unknown>).explanation ?? "");
    return explanation.length < 100;
  });
  if (shortDefinitions.length > 0) {
    issues.push(`${shortDefinitions.length} 个 definition 解释过短（< 100 字），应覆盖定义 + 直觉解释 + 验证。`);
  }

  const shortStepsItems = params.blocks.filter((block) => {
    if (block.type !== "steps") return false;
    const items = (block.content as Record<string, unknown>).items;
    if (!Array.isArray(items)) return false;
    return items.some((item) => String(item ?? "").length < 40);
  });
  if (shortStepsItems.length > 0) {
    issues.push(`${shortStepsItems.length} 个 steps block 含有过短条目（< 40 字），应写清教师动作 + 学生反应。`);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
