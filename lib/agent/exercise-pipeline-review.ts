import { z } from "zod";
import type { GatewayModelInput } from "@/lib/ai/gateway";
import {
  callStructured,
  type CurriculumContext,
} from "@/lib/agent/exercise-pipeline-generation";
import type {
  ExerciseBlueprint,
  PipelineExercise,
  PipelineState,
  TeacherReviewItem,
} from "@/lib/agent/exercise-pipeline-types";
import {
  EXERCISE_PIPELINE_MAX_BATCH_COUNT,
  teacherReviewItemSchema,
} from "@/lib/agent/exercise-pipeline-types";

const teacherReviewLooseItemSchema = teacherReviewItemSchema.extend({
  issues: z
    .union([
      z.array(z.string().trim().min(1).max(600)).max(8),
      z.string().trim().min(1).max(1_200),
    ])
    .optional()
    .default([]),
  suggestions: z
    .union([
      z.array(z.string().trim().min(1).max(600)).max(8),
      z.string().trim().min(1).max(1_200),
    ])
    .optional()
    .default([]),
});

const teacherReviewFlexibleSchema = z.union([
  z.object({
    items: z
      .array(teacherReviewLooseItemSchema)
      .min(1)
      .max(EXERCISE_PIPELINE_MAX_BATCH_COUNT),
  }),
  z.object({
    reviews: z
      .array(teacherReviewLooseItemSchema)
      .min(1)
      .max(EXERCISE_PIPELINE_MAX_BATCH_COUNT),
  }),
  z
    .array(teacherReviewLooseItemSchema)
    .min(1)
    .max(EXERCISE_PIPELINE_MAX_BATCH_COUNT),
]);

function compactReviewText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 3)}...`
    : normalized;
}

function normalizeReviewList(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean).slice(0, 8);
  }
  if (!value) return [];
  return value
    .split(/[;\n；、]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export async function scoreExercisesAsTeacher(params: {
  state: PipelineState;
  model: GatewayModelInput;
  blueprint: ExerciseBlueprint;
  curriculumContext: CurriculumContext;
  exercises: PipelineExercise[];
}) {
  const compactExercises = params.exercises.map((exercise, idx) => ({
    index: idx + 1,
    type: exercise.type,
    difficulty: exercise.difficulty,
    questionText: compactReviewText(exercise.questionText, 520),
    options:
      exercise.type === "MC"
        ? (exercise.options ?? []).map((item) => ({
            label: item.label,
            text: compactReviewText(item.text, 160),
          }))
        : [],
    correctAnswer: exercise.correctAnswer,
    solutionSteps: compactReviewText(exercise.solutionSteps, 260),
    commonMistakes: exercise.commonMistakes
      .slice(0, 2)
      .map((item) => compactReviewText(item, 60))
      .filter(Boolean),
  }));

  const review = await callStructured({
    state: params.state,
    model: params.model,
    system: [
      "你是资深 AP 命题组长，负责课堂可直接使用的习题质检。",
      "请逐题评分，并严格按四个维度打分（0-10，可保留 1 位小数）。",
      "四个维度：题干精确度、干扰项合理性、认知层次匹配、评分标准可操作性。",
      "必须输出每题具体问题与改进建议。",
      "不要输出题外解释。",
    ].join("\n"),
    prompt: [
      `蓝图：题型=${params.blueprint.exerciseType}，认知层级=${params.blueprint.bloomLevel}，难度=${params.blueprint.difficultyBand}，语言=${params.blueprint.language}`,
      params.curriculumContext
        ? `课程上下文：\n${params.curriculumContext.contextText}`
        : "课程上下文：未提供",
      "题目列表：",
      JSON.stringify(compactExercises, null, 2),
      "评分规则：",
      "1) overall = 四个维度平均值（四舍五入到 1 位小数）。",
      "2) pass=true 的最低标准：overall>=8.8 且四个维度都>=8.5。",
      "3) 若题型为 FR，distractorQuality 维度仍需评分：请理解为“干扰信息控制与误区辨析设计质量”。",
      "4) issues 重点写可导致课堂误用的问题；suggestions 给可执行修改。",
    ].join("\n\n"),
    schema: teacherReviewFlexibleSchema,
    schemaHint:
      "{ items:[{ index, questionPrecision, distractorQuality, cognitiveLevel, rubricOperability, overall, issues, suggestions, pass }] } 或 reviews:[...]",
    temperature: 0,
    maxOutputTokens: 2400,
    maxAttempts: 1,
    enableRepair: false,
    transport: "provider_structured",
  });

  const rawItems = Array.isArray(review)
    ? review
    : "reviews" in review
      ? review.reviews
      : review.items;

  const normalizedItems: TeacherReviewItem[] = rawItems.map((item) => ({
    ...item,
    issues: normalizeReviewList(item.issues),
    suggestions: normalizeReviewList(item.suggestions),
  }));
  return normalizedItems;
}

export function buildTeacherReviewReason(
  review: TeacherReviewItem | null,
  structureIssues: string[],
) {
  if (!review) {
    const reason =
      structureIssues.length > 0
        ? `结构校验未通过：${structureIssues.join("；")}`
        : "缺少教师评分结果";
    return {
      passed: false,
      reason,
      solverAnswer: "",
      hasAmbiguity: true,
    };
  }

  const dimMin = Math.min(
    review.questionPrecision,
    review.distractorQuality,
    review.cognitiveLevel,
    review.rubricOperability,
  );
  const modelPass =
    Boolean(review.pass) || (review.overall >= 8.8 && dimMin >= 8.5);
  const structurePass = structureIssues.length === 0;
  const passed = modelPass && structurePass;
  const issueText = review.issues.slice(0, 2).join("；");
  const reason = passed
    ? `教师评分通过（overall=${review.overall.toFixed(1)}）`
    : [
        `教师评分未达标（overall=${review.overall.toFixed(1)}，最低维度=${dimMin.toFixed(1)}）`,
        issueText ? `问题：${issueText}` : "",
        structureIssues.length > 0
          ? `结构问题：${structureIssues.join("；")}`
          : "",
      ]
        .filter(Boolean)
        .join("；");

  return {
    passed,
    reason,
    solverAnswer: `overall=${review.overall.toFixed(1)}`,
    hasAmbiguity: !passed,
  };
}

export function buildPostRepairQuickReview(params: {
  exercise: PipelineExercise;
  structureIssues: string[];
  previousReview: TeacherReviewItem | null;
}) {
  const quickIssues = [...params.structureIssues];
  if (params.exercise.questionText.trim().length < 12) {
    quickIssues.push("题干过短");
  }
  if (
    params.exercise.solutionSteps.trim().length <
    (params.exercise.type === "FR" ? 20 : 12)
  ) {
    quickIssues.push("解析过短");
  }
  if (params.exercise.type === "MC") {
    const optionTexts = (params.exercise.options ?? [])
      .map((item) => item.text.trim())
      .filter(Boolean);
    if (new Set(optionTexts).size !== optionTexts.length) {
      quickIssues.push("选项内容重复");
    }
  } else if (params.exercise.correctAnswer.trim().length < 3) {
    quickIssues.push("参考答案过短");
  }

  const passed = quickIssues.length === 0;
  const reviewHint = params.previousReview
    ? `原审核分 ${params.previousReview.overall.toFixed(1)}`
    : "无原审核分";
  return {
    passed,
    reason: passed
      ? `已按审核意见修补，并通过快速复检（${reviewHint}），建议教师抽查。`
      : `修补后快速复检未通过：${quickIssues.join("；")}`,
    solverAnswer: reviewHint,
    hasAmbiguity: !passed,
  };
}
