import {
  EXERCISE_PIPELINE_MAX_BATCH_COUNT,
  EXERCISE_PIPELINE_MAX_TOTAL_COUNT,
  EXERCISE_PIPELINE_REQUEST_BATCH_TARGET,
} from "@/lib/agent/exercise-pipeline-types";
import type {
  ApExercisePipelineOutput,
  ExerciseBlueprint,
  ExercisePipelineStrategy,
  PipelineExercise,
  RunApExercisePipelineInput,
  TeacherReviewItem,
} from "@/lib/agent/exercise-pipeline-types";
import { toExerciseDifficulty } from "@/types/exercise";

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeTeacherIntent(value: string, maxLength = 320) {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function resolveExerciseType(value: Record<string, unknown>) {
  const raw = value.type ?? value.questionType ?? value.question_type;
  if (raw === "MC" || raw === "MCQ") return "MC";
  if (raw === "FR" || raw === "FRQ") return "FR";
  return "FR";
}

function resolveDifficulty(value: Record<string, unknown>) {
  const raw = value.difficulty;
  return toExerciseDifficulty(typeof raw === "number" || typeof raw === "string" ? raw : null);
}

function resolveSolutionText(value: Record<string, unknown>) {
  const raw =
    value.solutionSteps ??
    value.solution ??
    value.solution_text ??
    value.explanation ??
    value.analysis;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw)) {
    const parts = raw
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    if (parts.length > 0) return parts.join("\n");
  }
  throw new Error("习题解析为空");
}

export function extractChoiceLabel(answer: string) {
  const normalized = answer.trim().toUpperCase();
  if (!normalized) return null;

  const patterns = [
    /^(?:选项|答案|应选|故选|最终答案|FINAL ANSWER|OPTION|CHOICE)?\s*[:：]?\s*\(?([A-D])\)?(?:[\s)）.、：:]|$)/i,
    /(?:答案|选项|应选|故选|选择|正确答案|FINAL ANSWER|OPTION|CHOICE)\s*[:：]?\s*\(?([A-D])\)?/i,
    /\(([A-D])\)/,
    /(?:^|[^A-Z])([A-D])(?:[^A-Z]|$)/,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return match[1] as "A" | "B" | "C" | "D";
    }
  }
  return null;
}

function compactChoiceContent(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[（）()\[\]{}<>《》"'`“”‘’：:，,。.;；!！?？]/g, "");
}

export function inferChoiceLabelFromAnswerText(
  answerText: string,
  options?: Array<{ label: string; text: string }>,
) {
  const directLabel = extractChoiceLabel(answerText);
  if (directLabel) return directLabel;

  const normalizedAnswer = compactChoiceContent(answerText);
  if (!normalizedAnswer || !options?.length) return null;

  for (const option of options) {
    const normalizedOption = compactChoiceContent(option.text);
    if (!normalizedOption) continue;
    if (
      normalizedAnswer === normalizedOption ||
      normalizedAnswer.includes(normalizedOption) ||
      normalizedOption.includes(normalizedAnswer)
    ) {
      return option.label as "A" | "B" | "C" | "D";
    }
  }

  return null;
}

export function normalizeExercise(exercise: Record<string, unknown>): PipelineExercise {
  const type = resolveExerciseType(exercise);
  const questionText = String(
    exercise.questionText ??
      exercise.question ??
      exercise.prompt ??
      exercise.body ??
      exercise.question_text ??
      exercise.stem ??
      "",
  ).trim();
  if (!questionText) {
    throw new Error("习题题干为空");
  }
  const difficulty = resolveDifficulty(exercise);
  const topicId =
    String(exercise.topicId ?? exercise.topic_id ?? "").trim() || undefined;
  const correctAnswer = String(
    exercise.correctAnswer ??
      exercise.correct_answer ??
      exercise.answer ??
      exercise.finalAnswer ??
      "",
  ).trim();

  if (type !== "MC") {
    if (!correctAnswer) {
      throw new Error("非选择题答案为空");
    }
    return {
      questionText,
      type,
      difficulty,
      correctAnswer,
      solutionSteps: resolveSolutionText(exercise),
      commonMistakes: Array.isArray(exercise.commonMistakes)
        ? exercise.commonMistakes.map((item) => String(item))
        : [],
      topicId,
    };
  }

  const rawOptions = Array.isArray(exercise.options)
    ? exercise.options.filter(
        (item): item is { label: string; text: string; isCorrect?: boolean } =>
          typeof item === "object" &&
          item !== null &&
          "text" in item &&
          "label" in item,
      )
    : [];
  const rawOptionTexts = Array.isArray(exercise.options)
    ? exercise.options.filter((item): item is string => typeof item === "string")
    : [];
  const optionMap =
    exercise.options && !Array.isArray(exercise.options)
      ? (exercise.options as Record<string, string>)
      : null;
  const optionLabels = ["A", "B", "C", "D"] as const;
  const normalizedOptions = optionLabels.map((label, index) => {
    const source = rawOptions[index] ?? null;
    return {
      label,
      text:
        source?.text?.trim() ||
        rawOptionTexts[index]?.trim() ||
        (optionMap?.[label] ?? ""),
      isCorrect: false,
    };
  });

  if (normalizedOptions.some((item) => !item.text)) {
    throw new Error("选择题选项不完整");
  }

  const labelFromAnswer = extractChoiceLabel(correctAnswer);
  const correctLabel =
    labelFromAnswer ??
    normalizedOptions.find((item, index) => rawOptions[index]?.isCorrect)?.label ??
    null;

  if (!correctLabel) {
    throw new Error("选择题正确答案缺失");
  }

  return {
    questionText,
    type,
    difficulty,
    options: normalizedOptions.map((item) => ({
      ...item,
      isCorrect: item.label === correctLabel,
    })),
    correctAnswer: correctLabel,
    solutionSteps: resolveSolutionText(exercise),
    commonMistakes: Array.isArray(exercise.commonMistakes)
      ? exercise.commonMistakes.map((item) => String(item))
      : [],
    topicId,
  };
}

export function difficultyBandToLevel(band: ExerciseBlueprint["difficultyBand"]) {
  if (band === "基础巩固") return 1;
  if (band === "高阶分析") return 3;
  return 2;
}

export function buildExercisePipelineStrategy(params: {
  blueprint: ExerciseBlueprint;
  requestedRepairRounds: number;
  hasMaterialContext?: boolean;
}) {
  const difficultyLevel = difficultyBandToLevel(params.blueprint.difficultyBand);
  const requestedCount = clamp(
    params.blueprint.count,
    1,
    EXERCISE_PIPELINE_MAX_BATCH_COUNT,
  );
  const requestedRepairRounds = clamp(params.requestedRepairRounds, 0, 2);
  const hasMaterialContext = Boolean(params.hasMaterialContext);
  const isMc = params.blueprint.exerciseType === "MC";
  const isFr = params.blueprint.exerciseType === "FR";
  const highRiskRequest =
    hasMaterialContext || isFr || difficultyLevel >= 3;

  if (isMc && difficultyLevel <= 1 && !hasMaterialContext) {
    return {
      verificationMode: "rule_only",
      useTeacherReview: false,
      useSolverVerification: false,
      maxRepairRounds: 0,
      verificationConcurrency: Math.min(4, requestedCount),
      reviewAfterRepair: false,
    } satisfies ExercisePipelineStrategy;
  }

  if (
    isMc &&
    difficultyLevel <= 2 &&
    requestedCount <= 3 &&
    !hasMaterialContext
  ) {
    return {
      verificationMode: "teacher_review",
      useTeacherReview: true,
      useSolverVerification: false,
      maxRepairRounds: Math.min(requestedRepairRounds, 1),
      verificationConcurrency: Math.min(3, requestedCount),
      reviewAfterRepair: false,
    } satisfies ExercisePipelineStrategy;
  }

  if (requestedCount <= 3 && highRiskRequest) {
    return {
      verificationMode: "solver_verify",
      useTeacherReview: false,
      useSolverVerification: true,
      maxRepairRounds: Math.min(requestedRepairRounds, 1),
      verificationConcurrency: Math.min(
        isFr || difficultyLevel >= 3 ? 2 : 3,
        requestedCount,
      ),
      reviewAfterRepair: false,
    } satisfies ExercisePipelineStrategy;
  }

  return {
    verificationMode: "teacher_review",
    useTeacherReview: true,
    useSolverVerification: false,
    maxRepairRounds: Math.min(requestedRepairRounds, 1),
    verificationConcurrency: Math.min(3, requestedCount),
    reviewAfterRepair: false,
  } satisfies ExercisePipelineStrategy;
}

export function shouldResolveBlueprintWithAi(
  input: RunApExercisePipelineInput,
) {
  const request = normalizeTeacherIntent(input.teacherRequest, 480);
  const hasUploadedMaterials = (input.uploadedMaterials?.length ?? 0) > 0;
  const hasBaseFields =
    typeof input.count === "number" &&
    Boolean(input.exerciseType) &&
    Boolean(input.language);
  const hasAdvancedIntentSignals =
    /learning objective|真实情境|现实情境|布鲁姆|bloom|认知层级|认知水平|难度层级|need real world/i.test(
      request,
    );

  if (hasUploadedMaterials) return true;
  if (!hasBaseFields) return true;
  if (request.length > 220) return true;
  if (hasAdvancedIntentSignals) return true;
  return false;
}

export function shouldUseSpareCandidate(params: {
  blueprint: ExerciseBlueprint;
  hasMaterialContext: boolean;
}) {
  const requestedCount = clamp(
    params.blueprint.count,
    1,
    EXERCISE_PIPELINE_MAX_BATCH_COUNT,
  );
  if (requestedCount <= 2) return false;
  if (params.hasMaterialContext) return true;
  if (params.blueprint.exerciseType === "FR") return true;
  return difficultyBandToLevel(params.blueprint.difficultyBand) >= 3;
}

export function buildLowLatencyExercisePipelineStrategy(params: {
  blueprint: ExerciseBlueprint;
}) {
  return {
    verificationMode: "rule_only",
    useTeacherReview: false,
    useSolverVerification: false,
    maxRepairRounds: 0,
    verificationConcurrency: Math.min(
      4,
      clamp(params.blueprint.count, 1, EXERCISE_PIPELINE_MAX_BATCH_COUNT),
    ),
    reviewAfterRepair: false,
  } satisfies ExercisePipelineStrategy;
}

export function splitExerciseRequestIntoBatches(totalCount: number) {
  let remaining = clamp(totalCount, 1, EXERCISE_PIPELINE_MAX_TOTAL_COUNT);
  const batches: number[] = [];

  while (remaining > 0) {
    const nextBatch = Math.min(
      EXERCISE_PIPELINE_REQUEST_BATCH_TARGET,
      remaining,
    );
    batches.push(nextBatch);
    remaining -= nextBatch;
  }

  return batches;
}

export async function mapWithConcurrency<TInput, TOutput>(params: {
  items: TInput[];
  concurrency: number;
  run: (item: TInput, index: number) => Promise<TOutput>;
}) {
  const results = new Array<TOutput>(params.items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(params.concurrency, params.items.length || 1)) },
    async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= params.items.length) return;
        results[index] = await params.run(params.items[index], index);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

export function toDifficultyLevel(value: number): 1 | 2 | 3 | 4 {
  if (value <= 1) return 1;
  if (value === 2) return 2;
  if (value === 3) return 3;
  return 4;
}

export function findTeacherReviewForIndex(
  items: TeacherReviewItem[],
  index: number,
) {
  const exact = items.find((item) => item.index === index + 1);
  if (exact) return exact;
  return items[index] ?? null;
}

export function heuristicBlueprint(
  input: RunApExercisePipelineInput,
): ExerciseBlueprint {
  const request = normalizeTeacherIntent(input.teacherRequest, 480);
  const countMatch = request.match(/(\d{1,2})\s*(道|题|个)/);
  const parsedCount = countMatch ? Number(countMatch[1]) : Number.NaN;
  const count = Number.isFinite(parsedCount)
    ? clamp(parsedCount, 1, EXERCISE_PIPELINE_MAX_TOTAL_COUNT)
    : clamp(input.count ?? 3, 1, EXERCISE_PIPELINE_MAX_TOTAL_COUNT);
  const exerciseType =
    input.exerciseType ??
    (/frq|问答|简答|分析题|free\s*response/i.test(request) ? "FR" : "MC");
  const difficultyBand = /高阶|困难|challenging|hard/i.test(request)
    ? "高阶分析"
    : /基础|简单|easy/i.test(request)
      ? "基础巩固"
      : "中等应用";
  const bloomLevel = /分析|evaluate|评价|创造|create/i.test(request)
    ? "分析"
    : /理解|remember|记忆/i.test(request)
      ? "理解"
      : "应用";

  return {
    subject: "AP",
    unit: null,
    learningObjective: null,
    exerciseType,
    count,
    bloomLevel,
    difficultyBand,
    needRealWorldContext: true,
    language: input.language ?? "中文",
    teacherIntent: request || "请生成 AP 习题",
  };
}

export function buildSummary(output: Omit<ApExercisePipelineOutput, "summary">) {
  const lines: string[] = [];
  const verificationModeLabel =
    output.metrics.verificationMode === "mixed"
      ? "mixed（按批次动态分配）"
      : output.metrics.verificationMode;
  lines.push("已完成 AP 习题流水线（意图解析 -> 生成 -> 教师评分/验证 -> 定向修补）。");
  lines.push(`请求 ${output.metrics.requested} 题，最终通过 ${output.metrics.passed} 题，淘汰 ${output.metrics.rejected} 题。`);
  lines.push(`验证策略：${verificationModeLabel}`);
  lines.push(
    `状态分布：已验证 ${output.metrics.verificationStatusCounts.verified} / 快速校验 ${output.metrics.verificationStatusCounts.rule_checked} / 建议复核 ${output.metrics.verificationStatusCounts.manual_review} / 失败 ${output.metrics.verificationStatusCounts.failed}`,
  );
  if (output.fallbackUsed) {
    lines.push(`注意：本次触发降级生成，原因：${output.fallbackReason ?? "上游服务异常"}`);
  }
  lines.push(`蓝图：${output.blueprint.exerciseType} / ${output.blueprint.difficultyBand} / ${output.blueprint.bloomLevel} / ${output.blueprint.language}`);
  if (output.curriculumContext?.courseName || output.curriculumContext?.unitName) {
    lines.push(`课程上下文：${output.curriculumContext.courseName ?? "未识别"} - ${output.curriculumContext.unitName ?? "未识别"}`);
  }
  lines.push(`总模型调用次数：${output.metrics.totalModelCalls}`);
  lines.push(
    `阶段耗时：蓝图 ${output.metrics.timings.blueprintMs}ms / 课程 ${output.metrics.timings.curriculumMs}ms / 生成 ${output.metrics.timings.generationMs}ms / 审核 ${output.metrics.timings.teacherReviewMs}ms / 验证 ${output.metrics.timings.verificationMs}ms / 修补 ${output.metrics.timings.repairMs}ms / 总计 ${output.metrics.timings.totalMs}ms`,
  );
  if (output.rejectedExercises.length > 0) {
    lines.push("淘汰原因：");
    output.rejectedExercises.slice(0, 3).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.reason}`);
    });
  }
  lines.push("建议下一步：可直接选择“采用通过题目”或“仅重做失败题目”。");
  return lines.join("\n");
}
