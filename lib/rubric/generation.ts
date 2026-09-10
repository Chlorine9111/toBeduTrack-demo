import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateRubric } from "@/lib/ai/rubric-generator";
import {
  extractRequestedRubricDimensionCount,
  extractRequestedRubricDimensionNames,
  extractRequestedRubricTitle,
} from "@/lib/ai/prompt-assembler";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import { loadCourse, loadRubricExamples, loadUnitWithTopics } from "@/lib/curriculum/loader";
import { getRubricDetail } from "@/lib/rubric/queries";
import type { Database } from "@/types/database";
import type { Course, Topic, Unit } from "@/types/curriculum";
import type { RubricAIOutput, RubricDetailPayload } from "@/types/rubric";

type AppSupabase = SupabaseClient<Database>;

export class RubricGenerationError extends Error {
  constructor(
    public readonly code:
      | "VALIDATION_ERROR"
      | "NOT_FOUND"
      | "SERVICE_UNAVAILABLE"
      | "DB_WRITE_FAILED",
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RubricGenerationError";
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number) {
  const value = Number(raw ?? "");
  if (!Number.isFinite(value) || value < 1) {
    return fallback;
  }
  return Math.floor(value);
}

export function buildGeneralRubricContext(params: {
  topic?: string;
  subjectCategory?: string;
  gradeLevel?: string;
}) {
  const now = new Date().toISOString();
  const subject = params.subjectCategory?.trim() || "通用学科";
  const topic = params.topic?.trim() || "自定义主题";
  const grade = params.gradeLevel?.trim() || "未指定年级";
  const course: Course = {
    id: `general-${subject.toLowerCase().replace(/\s+/g, "-")}`,
    framework: "AP",
    name: `${subject}（通用轨道）`,
    code: `GENERAL-${subject}`,
    description: `面向 ${grade} 的主题：${topic}`,
    createdAt: now,
    updatedAt: now,
  };
  const unit: Unit = {
    id: `${course.id}-unit-1`,
    courseId: course.id,
    unitNumber: "1",
    title: topic,
    description: `${subject}主题单元`,
    createdAt: now,
    updatedAt: now,
  };
  const topics: Topic[] = [
    {
      id: `${unit.id}-topic-1`,
      unitId: unit.id,
      topicNumber: "1.1",
      title: topic,
      learningObjectives: [
        {
          code: "GEN-LO1",
          description: `围绕主题「${topic}」构建可评估的学习目标`,
        },
      ],
      essentialKnowledge: [
        {
          code: "GEN-EK1",
          description: `明确主题「${topic}」对应的关键知识与能力要求`,
        },
      ],
      mathPractices: [],
      createdAt: now,
      updatedAt: now,
    },
  ];
  return { course, unit, topics };
}

export function isRubricAiConfigured() {
  try {
    getResolvedLanguageModelForTask("rubric_generate");
    return true;
  } catch {
    return false;
  }
}

function looksLikeExerciseDrift(text: string) {
  return /(^|\b)(question\s*\d+|problem\s*\d+|exercise\s*\d+|worksheet|answer\s*key|第\s*\d+\s*题|题目\s*\d+)\b/i.test(
    text,
  );
}

function rubricLooksLikeExerciseSet(rubric: RubricAIOutput) {
  const titleLooksWrong = looksLikeExerciseDrift(rubric.title ?? "");
  const dimensionDriftCount = rubric.dimensions.filter((dimension) => {
    const levelText = [
      dimension.levels.excellent,
      dimension.levels.good,
      dimension.levels.passing,
      dimension.levels.failing,
    ].join(" ");

    return (
      looksLikeExerciseDrift(dimension.name) ||
      /\b[A-D][.)、]\s/.test(levelText) ||
      /correct\s+answer|答案[:：]|解析[:：]/i.test(levelText)
    );
  }).length;

  const totalDims = rubric.dimensions.length;
  const driftThreshold = Math.max(2, Math.ceil(totalDims / 2));
  return titleLooksWrong || dimensionDriftCount >= driftThreshold;
}

function normalizeDimensionName(value: string) {
  return value
    .toLowerCase()
    .replace(/[“”"'「」]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function normalizeRubricTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/[“”"'「」]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPreviousRubricDimensionNames(text: string) {
  const headingMatches = Array.from(
    text.matchAll(/^###\s+(.+)$/gm),
  )
    .map((match) => match[1]?.trim())
    .filter((item): item is string => Boolean(item));

  if (headingMatches.length > 0) {
    return Array.from(new Set(headingMatches));
  }

  const tableRowMatches = Array.from(
    text.matchAll(/^\|\s*([^|]+?)\s*\|/gm),
  )
    .map((match) => match[1]?.trim())
    .filter(
      (item): item is string =>
        Boolean(item) &&
        item.toLowerCase() !== "dimension" &&
        !/^[-:]+$/.test(item),
    );

  return Array.from(new Set(tableRowMatches));
}

function buildRubricConstraintError(
  rubric: RubricAIOutput,
  teacherRequest: string,
) {
  const requestedTitle = extractRequestedRubricTitle(teacherRequest);
  if (
    requestedTitle &&
    normalizeRubricTitle(rubric.title) !== normalizeRubricTitle(requestedTitle)
  ) {
    return `Rubric title mismatch: expected ${requestedTitle}, got ${rubric.title}`;
  }

  const requestedDimensionCount =
    extractRequestedRubricDimensionCount(teacherRequest);
  if (
    requestedDimensionCount &&
    requestedDimensionCount >= 3 &&
    requestedDimensionCount <= 8 &&
    rubric.dimensions.length !== requestedDimensionCount
  ) {
    return `Rubric dimension count mismatch: expected ${requestedDimensionCount}, got ${rubric.dimensions.length}`;
  }

  const requestedDimensionNames =
    extractRequestedRubricDimensionNames(teacherRequest);
  if (requestedDimensionNames.length === 0) {
    return null;
  }

  const normalizedExisting = rubric.dimensions.map((dimension) =>
    normalizeDimensionName(dimension.name),
  );
  const missingNames = requestedDimensionNames.filter((name) => {
    const normalizedRequested = normalizeDimensionName(name);
    return !normalizedExisting.some(
      (existing) =>
        existing === normalizedRequested ||
        existing.includes(normalizedRequested) ||
        normalizedRequested.includes(existing),
    );
  });

  if (missingNames.length > 0) {
    return `Rubric missing requested dimensions: ${missingNames.join(", ")}`;
  }

  return null;
}

function formatRubricMarkdownCell(value: string) {
  return value
    .replace(/\r\n?/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\|/g, "／")
    .replace(/\s+/g, " ")
    .trim();
}

function serializeRubricToMarkdown(rubric: RubricAIOutput) {
  const lines = [
    `# ${rubric.title.trim() || "Rubric"}`,
    "",
    "| Dimension | Excellent | Good | Passing | Failing | Weight |",
    "| --- | --- | --- | --- | --- | --- |",
  ];

  rubric.dimensions.forEach((dimension) => {
    lines.push(
      `| ${formatRubricMarkdownCell(dimension.name)} | ${formatRubricMarkdownCell(
        dimension.levels.excellent,
      )} | ${formatRubricMarkdownCell(
        dimension.levels.good,
      )} | ${formatRubricMarkdownCell(
        dimension.levels.passing,
      )} | ${formatRubricMarkdownCell(
        dimension.levels.failing,
      )} | ${dimension.weight}% |`,
    );
  });

  return lines.join("\n");
}

function buildRubricRetryTeacherRequest(
  teacherRequest: string,
  lastErrorMessage?: string,
  lastRubric?: RubricAIOutput | null,
) {
  const requestedDimensionCount =
    extractRequestedRubricDimensionCount(teacherRequest);
  const requestedDimensionNames =
    extractRequestedRubricDimensionNames(teacherRequest);
  const requestedTitle = extractRequestedRubricTitle(teacherRequest);
  const existingDimensionNames =
    extractPreviousRubricDimensionNames(teacherRequest);
  const strictLines = [
    requestedTitle
      ? `- 最终标题必须严格写成「${requestedTitle}」，不要沿用旧标题。`
      : "",
    requestedDimensionCount
      ? `- 必须严格输出 ${requestedDimensionCount} 个评分维度，不多不少。`
      : "",
    requestedDimensionNames.length > 0
      ? `- 必须包含这些维度：${requestedDimensionNames.join("、")}。`
      : "",
    requestedDimensionNames.length > 0
      ? "- 如果用户用引号明确指定了维度标题，最终输出时这些维度标题必须原样保留，不要翻译、不要改写、不要替换成英文。"
      : "",
    existingDimensionNames.length > 0
      ? `- 上一版现有维度：${existingDimensionNames.join("、")}。若本轮要求更多维度，必须在保留相关维度的前提下补足缺少的维度，不能继续沿用旧的维度数量。`
      : "",
    requestedDimensionCount &&
    existingDimensionNames.length > 0 &&
    existingDimensionNames.length < requestedDimensionCount
      ? `- 上一版只有 ${existingDimensionNames.length} 个维度，但本轮要求 ${requestedDimensionCount} 个；最终输出时必须补足新增维度，少一个都不可以。`
      : "",
    requestedDimensionNames.length > 0
      ? `- 如果上一版里不存在这些指定维度，必须新增：${requestedDimensionNames.join("、")}。`
      : "",
    lastRubric
      ? `- 上一轮实际标题是「${lastRubric.title}」，输出了 ${lastRubric.dimensions.length} 个维度：${lastRubric.dimensions
          .map((dimension) => dimension.name.trim())
          .filter(Boolean)
          .join("、")}。这一轮必须修正。`
      : "",
    "- 输出前先自查维度数量和维度名称是否满足要求；若不满足，必须重写后再输出。",
  ].filter(Boolean);

  if (strictLines.length === 1 && requestedDimensionNames.length === 0 && !requestedDimensionCount) {
    return teacherRequest;
  }

  return [
    teacherRequest.trim(),
    "纠偏要求：上一轮结果没有满足用户的 Rubric 结构要求，这一轮必须先自查再输出。",
    lastErrorMessage ? `上一轮失败原因：${lastErrorMessage}` : "",
    lastRubric
      ? `上一轮错误版 Rubric（供修复参考，不能原样照抄）：\n${serializeRubricToMarkdown(lastRubric)}`
      : "",
    strictLines.join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildRubricRepairTeacherRequest(params: {
  teacherRequest: string;
  lastErrorMessage: string;
  lastRubric: RubricAIOutput;
}) {
  const requestedDimensionCount =
    extractRequestedRubricDimensionCount(params.teacherRequest);
  const requestedDimensionNames =
    extractRequestedRubricDimensionNames(params.teacherRequest);
  const requestedTitle = extractRequestedRubricTitle(params.teacherRequest);
  const currentDimensionNames = params.lastRubric.dimensions
    .map((dimension) => dimension.name.trim())
    .filter(Boolean);

  return [
    params.teacherRequest.trim(),
    "最终修复任务：下面是上一轮未满足要求的完整 Rubric，请在它的基础上输出一份完整修正版。",
    `上一轮失败原因：${params.lastErrorMessage}`,
    requestedTitle
      ? `硬约束：最终标题必须严格写成「${requestedTitle}」。`
      : "",
    requestedDimensionCount
      ? `硬约束：最终必须严格输出 ${requestedDimensionCount} 个维度，不多不少。`
      : "",
    requestedDimensionNames.length > 0
      ? `硬约束：最终必须包含这些维度，并原样保留标题：${requestedDimensionNames.join("、")}。`
      : "",
    currentDimensionNames.length > 0
      ? `上一轮已有维度：${currentDimensionNames.join("、")}。可保留合理维度，但必须补齐缺失维度。`
      : "",
    "输出要求：直接输出完整 Markdown Rubric，包含标题和表格；不要解释、不要 JSON、不要代码块。",
    `上一轮错误版 Rubric：\n${serializeRubricToMarkdown(params.lastRubric)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function generateRubricOrThrow(input: {
  course: Course;
  unit: Unit | null;
  topics: Topic[];
  teacherRequest: string;
  courseId: string;
  unitId?: string;
  track?: "ap" | "general";
  subjectCategory?: string;
  examples: RubricAIOutput[];
  onPreview?: (update: {
    delta: string;
    snapshot: string;
    reset: boolean;
  }) => void | Promise<void>;
}) {
  if (!isRubricAiConfigured()) {
    throw new RubricGenerationError("SERVICE_UNAVAILABLE", 503, "AI 服务未配置");
  }

  const hasExplicitStructureConstraint =
    Boolean(extractRequestedRubricDimensionCount(input.teacherRequest)) ||
    extractRequestedRubricDimensionNames(input.teacherRequest).length > 0;
  const maxAttempts = parsePositiveInt(
    process.env.RUBRIC_GENERATE_ATTEMPTS,
    hasExplicitStructureConstraint ? 2 : 1,
  );
  let lastError: unknown = null;
  let lastGeneratedRubric: RubricAIOutput | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const teacherRequest =
        attempt === 1
          ? input.teacherRequest
          : buildRubricRetryTeacherRequest(
              input.teacherRequest,
              lastError instanceof Error ? lastError.message : undefined,
              lastGeneratedRubric,
            );
      const rubric = await generateRubric({
        courseId: input.courseId,
        unitId: input.unitId,
        teacherRequest,
        track: input.track,
        subjectCategory: input.subjectCategory,
        preloaded: {
          course: input.course,
          unit: input.unit,
          topics: input.topics,
          examples: input.examples,
        },
      }, {
        onPreview: input.onPreview,
      });
      lastGeneratedRubric = rubric;
      if (rubricLooksLikeExerciseSet(rubric)) {
        throw new Error("Rubric output drifted into exercise-style content");
      }
      const constraintError = buildRubricConstraintError(
        rubric,
        input.teacherRequest,
      );
      if (constraintError) {
        throw new Error(constraintError);
      }
      return rubric;
    } catch (error) {
      lastError = error;
      console.warn(`Rubric generation attempt ${attempt}/${maxAttempts} failed`, error);
      if (attempt < maxAttempts && hasExplicitStructureConstraint) {
        await input.onPreview?.({
          delta: "",
          snapshot: "",
          reset: true,
        });
      }
    }
  }

  const lastErrorMessage =
    lastError instanceof Error ? lastError.message : "Rubric generation failed";
  const shouldRunStructureRepair =
    hasExplicitStructureConstraint &&
    lastGeneratedRubric &&
    /^Rubric (dimension count mismatch|missing requested dimensions)/.test(
      lastErrorMessage,
    );

  if (shouldRunStructureRepair && lastGeneratedRubric) {
    try {
      await input.onPreview?.({
        delta: "",
        snapshot: "",
        reset: true,
      });

      const repairedRubric = await generateRubric(
        {
          courseId: input.courseId,
          unitId: input.unitId,
          teacherRequest: buildRubricRepairTeacherRequest({
            teacherRequest: input.teacherRequest,
            lastErrorMessage,
            lastRubric: lastGeneratedRubric,
          }),
          track: input.track,
          subjectCategory: input.subjectCategory,
          preloaded: {
            course: input.course,
            unit: input.unit,
            topics: input.topics,
            examples: input.examples,
          },
        },
        {
          onPreview: input.onPreview,
        },
      );

      if (rubricLooksLikeExerciseSet(repairedRubric)) {
        throw new Error("Rubric output drifted into exercise-style content");
      }

      const repairConstraintError = buildRubricConstraintError(
        repairedRubric,
        input.teacherRequest,
      );
      if (repairConstraintError) {
        throw new Error(repairConstraintError);
      }

      return repairedRubric;
    } catch (repairError) {
      lastError = repairError;
    }
  }

  console.warn("Rubric generation failed after retries", {
    courseId: input.courseId,
    unitId: input.unitId ?? null,
    teacherRequest: input.teacherRequest.slice(0, 120),
    reason: lastError instanceof Error ? lastError.message : "unknown",
  });

  throw new Error(lastError instanceof Error ? lastError.message : "Rubric generation failed");
}

export function buildUnsavedRubricDetail(params: {
  rubric: RubricAIOutput;
  course: Course;
  unit: Unit | null;
  teacherRequest: string;
}): RubricDetailPayload {
  const now = new Date().toISOString();
  const dimensions = params.rubric.dimensions.map((dimension, index) => {
    const dimensionId = randomUUID();
    return {
      id: dimensionId,
      name: dimension.name,
      description: dimension.description,
      weight: dimension.weight,
      sortOrder: index,
      levels: [
        { level: "excellent" as const, score: 4 as const, description: dimension.levels.excellent },
        { level: "good" as const, score: 3 as const, description: dimension.levels.good },
        { level: "passing" as const, score: 2 as const, description: dimension.levels.passing },
        { level: "failing" as const, score: 1 as const, description: dimension.levels.failing },
      ].map((level) => ({
        id: randomUUID(),
        dimensionId,
        level: level.level,
        score: level.score,
        description: level.description,
      })),
    };
  });

  return {
    id: randomUUID(),
    courseId: params.course.id,
    unitId: params.unit?.id ?? null,
    title: params.rubric.title,
    status: "draft",
    teacherPrompt: params.teacherRequest,
    isAiGenerated: true,
    teacherModified: false,
    createdAt: now,
    updatedAt: now,
    course: {
      id: params.course.id,
      name: params.course.name,
      code: params.course.code,
    },
    unit: params.unit
      ? {
          id: params.unit.id,
          unitNumber: params.unit.unitNumber,
          title: params.unit.title,
        }
      : null,
    dimensions,
  };
}

export async function generateRubricDetail(params: {
  supabase: AppSupabase;
  teacherId: string;
  track: "ap" | "general";
  courseId?: string;
  unitId?: string;
  topic?: string;
  subjectCategory?: string;
  gradeLevel?: string;
  teacherRequest: string;
  onPreview?: (update: {
    delta: string;
    snapshot: string;
    reset: boolean;
  }) => void | Promise<void>;
}): Promise<RubricDetailPayload> {
  let course: Course;
  let selectedUnit: Unit | null = null;
  let selectedTopics: Topic[] = [];
  let rubricExamples: RubricAIOutput[] = [];

  if (params.track === "ap") {
    if (!params.courseId) {
      throw new RubricGenerationError(
        "VALIDATION_ERROR",
        400,
        "AP 轨道必须提供 courseId。",
      );
    }

    const loadedCourse = await loadCourse(params.courseId, params.supabase);
    if (!loadedCourse) {
      throw new RubricGenerationError("NOT_FOUND", 404, "Course not found");
    }
    course = loadedCourse;

    if (params.unitId) {
      const { unit, topics } = await loadUnitWithTopics(params.unitId, params.supabase);
      if (!unit || unit.courseId !== params.courseId) {
        throw new RubricGenerationError(
          "VALIDATION_ERROR",
          400,
          "Unit not found for the selected course",
        );
      }
      selectedUnit = unit;
      selectedTopics = topics;
    }

    rubricExamples = await loadRubricExamples(
      params.courseId,
      params.unitId,
      2,
      params.supabase,
    );
  } else {
    if (!params.topic?.trim()) {
      throw new RubricGenerationError(
        "VALIDATION_ERROR",
        400,
        "通用轨道必须提供 topic。",
      );
    }
    const generalContext = buildGeneralRubricContext({
      topic: params.topic,
      subjectCategory: params.subjectCategory,
      gradeLevel: params.gradeLevel,
    });
    course = generalContext.course;
    selectedUnit = generalContext.unit;
    selectedTopics = generalContext.topics;
    rubricExamples = [];
  }

    const rubric = await generateRubricOrThrow({
      course,
      unit: selectedUnit,
      topics: selectedTopics,
      teacherRequest: params.teacherRequest,
      courseId: course.id,
      unitId: selectedUnit?.id ?? undefined,
      track: params.track,
      subjectCategory: params.subjectCategory,
      examples: rubricExamples,
      onPreview: params.onPreview,
    });

  if (params.track === "general") {
    return buildUnsavedRubricDetail({
      rubric,
      course,
      unit: selectedUnit,
      teacherRequest: params.teacherRequest,
    });
  }

  const rubricRpcArgs = {
    p_course_id: params.courseId!,
    p_unit_id: params.unitId ?? null,
    p_title: rubric.title,
    p_teacher_prompt: params.teacherRequest,
    p_dimensions: rubric.dimensions,
    p_teacher_id: params.teacherId,
  } satisfies Record<string, unknown>;
  const rpcClient = params.supabase as typeof params.supabase & {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };
  const { data: rpcData, error: rpcError } = await rpcClient.rpc(
    "create_rubric_from_ai",
    rubricRpcArgs,
  );

  if (rpcError || !rpcData) {
    throw new RubricGenerationError(
      "DB_WRITE_FAILED",
      500,
      "Failed to save rubric",
    );
  }

  const detail = await getRubricDetail(String(rpcData), params.supabase, {
    teacherId: params.teacherId,
  });
  if (!detail) {
    throw new Error("Rubric saved but could not be loaded");
  }

  return detail;
}
