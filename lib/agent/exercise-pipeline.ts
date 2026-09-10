import {
  buildExercisePipelineStrategy,
  buildSummary,
  clamp,
  difficultyBandToLevel,
  heuristicBlueprint,
  normalizeTeacherIntent,
  splitExerciseRequestIntoBatches,
} from "@/lib/agent/exercise-pipeline-helpers";
import {
  generateExercisesWithThinking,
  generateRescueExercises,
  resolveCurriculumContext,
} from "@/lib/agent/exercise-pipeline-generation";
import { timeoutAfter } from "@/lib/agent/exercise-pipeline-parsing";
import { runLocalStructureCheck } from "@/lib/agent/exercise-pipeline-verification";
import { buildTaskAwareMaterialContext } from "@/lib/agent/material-context";
import type { ExerciseVerificationStatus } from "@/types/exercise";

export type {
  ApExercisePipelineOutput,
  ExerciseBlueprint,
  ExercisePipelineStrategy,
  ExercisePipelineVerificationMode,
  ExerciseProcessingResult,
  ExerciseVerificationLog,
  PassedExerciseResult,
  PipelineExercise,
  PipelineState,
  RunApExercisePipelineInput,
  TeacherReviewItem,
} from "@/lib/agent/exercise-pipeline-types";

import {
  EXERCISE_PIPELINE_MAX_BATCH_COUNT,
  EXERCISE_PIPELINE_MAX_TOTAL_COUNT,
} from "@/lib/agent/exercise-pipeline-types";
import type {
  ApExercisePipelineOutput,
  ExerciseBlueprint,
  ExercisePipelineVerificationMode,
  PipelineExercise,
  PipelineState,
  RunApExercisePipelineInput,
} from "@/lib/agent/exercise-pipeline-types";

export { buildExercisePipelineStrategy } from "@/lib/agent/exercise-pipeline-helpers";

export async function runApExercisePipeline(
  input: RunApExercisePipelineInput,
): Promise<ApExercisePipelineOutput> {
  const pipelineStartedAt = Date.now();
  const state: PipelineState = { totalModelCalls: 0 };
  const requestedRepairRounds = clamp(input.maxRepairRounds ?? 2, 1, 2);
  const timings = {
    blueprintMs: 0,
    curriculumMs: 0,
    generationMs: 0,
    teacherReviewMs: 0,
    verificationMs: 0,
    repairMs: 0,
    totalMs: 0,
  };
  const materialContext =
    input.materialContextOverride ??
    buildTaskAwareMaterialContext({
      materials: input.uploadedMaterials,
      taskKind: "exercise",
      query: input.teacherRequest,
      maxLength: 2_400,
    });

  const seedBlueprint: ExerciseBlueprint =
    input.blueprintOverride ?? heuristicBlueprint(input);

  const normalizedBlueprint: ExerciseBlueprint = {
    ...seedBlueprint,
    teacherIntent: normalizeTeacherIntent(
      seedBlueprint.teacherIntent || input.teacherRequest.trim(),
    ),
    exerciseType: input.exerciseType ?? seedBlueprint.exerciseType,
    count: clamp(
      input.count ?? seedBlueprint.count,
      1,
      EXERCISE_PIPELINE_MAX_TOTAL_COUNT,
    ),
    language: input.language ?? seedBlueprint.language,
  };
  const curriculumContext =
    input.curriculumContextOverride ??
    (await (async () => {
      const curriculumStartedAt = Date.now();
      const resolved = await resolveCurriculumContext(input);
      timings.curriculumMs = Math.max(0, Date.now() - curriculumStartedAt);
      return resolved;
    })());

  if (
    !input.batchParent &&
    normalizedBlueprint.count > EXERCISE_PIPELINE_MAX_BATCH_COUNT
  ) {
    const batchCounts = splitExerciseRequestIntoBatches(normalizedBlueprint.count);
    const batchOutputs: ApExercisePipelineOutput[] = [];

    for (const batchCount of batchCounts) {
      const batchBlueprint: ExerciseBlueprint = {
        ...normalizedBlueprint,
        count: batchCount,
      };
      const batchOutput = await runApExercisePipeline({
        ...input,
        count: batchCount,
        blueprintOverride: batchBlueprint,
        curriculumContextOverride: curriculumContext,
        materialContextOverride: materialContext,
        skipAiBlueprintResolve: true,
        batchParent: true,
      });
      batchOutputs.push(batchOutput);
    }

    const verificationModeSet = new Set<ExercisePipelineVerificationMode>(
      batchOutputs.map((item) => item.metrics.verificationMode),
    );
    const verificationStatusCounts = {
      pending: 0,
      rule_checked: 0,
      verified: 0,
      failed: 0,
      manual_review: 0,
    } satisfies Record<ExerciseVerificationStatus, number>;
    const aggregatedTimings = {
      blueprintMs: timings.blueprintMs,
      curriculumMs: timings.curriculumMs,
      generationMs: 0,
      teacherReviewMs: 0,
      verificationMs: 0,
      repairMs: 0,
      totalMs: 0,
    };

    const fallbackReasons = new Set<string>();
    const passedResults = batchOutputs.flatMap((item) => item.passedResults);
    const rejectedExercises = batchOutputs.flatMap(
      (item) => item.rejectedExercises,
    );

    for (const batchOutput of batchOutputs) {
      if (batchOutput.fallbackReason) {
        fallbackReasons.add(batchOutput.fallbackReason);
      }
      aggregatedTimings.blueprintMs += batchOutput.metrics.timings.blueprintMs;
      aggregatedTimings.curriculumMs += batchOutput.metrics.timings.curriculumMs;
      aggregatedTimings.generationMs += batchOutput.metrics.timings.generationMs;
      aggregatedTimings.teacherReviewMs +=
        batchOutput.metrics.timings.teacherReviewMs;
      aggregatedTimings.verificationMs +=
        batchOutput.metrics.timings.verificationMs;
      aggregatedTimings.repairMs += batchOutput.metrics.timings.repairMs;
      verificationStatusCounts.pending +=
        batchOutput.metrics.verificationStatusCounts.pending;
      verificationStatusCounts.rule_checked +=
        batchOutput.metrics.verificationStatusCounts.rule_checked;
      verificationStatusCounts.verified +=
        batchOutput.metrics.verificationStatusCounts.verified;
      verificationStatusCounts.failed +=
        batchOutput.metrics.verificationStatusCounts.failed;
      verificationStatusCounts.manual_review +=
        batchOutput.metrics.verificationStatusCounts.manual_review;
    }

    aggregatedTimings.totalMs = Math.max(0, Date.now() - pipelineStartedAt);

    const outputWithoutSummary: Omit<ApExercisePipelineOutput, "summary"> = {
      fallbackUsed: batchOutputs.some((item) => item.fallbackUsed),
      fallbackReason:
        fallbackReasons.size > 0
          ? Array.from(fallbackReasons).join("；")
          : null,
      blueprint: normalizedBlueprint,
      curriculumContext,
      passedExercises: passedResults.map((item) => item.exercise),
      passedResults,
      rejectedExercises,
      metrics: {
        requested: normalizedBlueprint.count,
        passed: passedResults.length,
        rejected: rejectedExercises.length,
        totalModelCalls:
          state.totalModelCalls +
          batchOutputs.reduce(
            (sum, item) => sum + item.metrics.totalModelCalls,
            0,
          ),
        maxRepairRounds: Math.max(
          0,
          ...batchOutputs.map((item) => item.metrics.maxRepairRounds),
        ),
        verificationMode:
          verificationModeSet.size === 1
            ? batchOutputs[0]?.metrics.verificationMode ?? "teacher_review"
            : "mixed",
        verificationStatusCounts,
        timings: aggregatedTimings,
      },
      teacherOptions: [
        { label: "采用通过题目", value: "accept_passed" },
        { label: "仅重做失败题目", value: "retry_failed_only" },
        { label: "按同蓝图再生成一版", value: "regenerate_same_blueprint" },
      ],
    };

    return {
      ...outputWithoutSummary,
      summary: buildSummary(outputWithoutSummary),
    };
  }

  const strategy = {
    ...buildExercisePipelineStrategy({
      blueprint: normalizedBlueprint,
      requestedRepairRounds,
      hasMaterialContext: Boolean(materialContext),
    }),
    verificationMode: "rule_only" as const,
    maxRepairRounds: 0,
    useTeacherReview: false,
    useSolverVerification: false,
  };

  let fallbackUsed = false;
  let fallbackReason: string | null = null;
  let baseExercises: PipelineExercise[] = [];

  const questionTypeMap: Record<string, "mcq" | "frq" | "mixed"> = {
    MC: "mcq",
    FR: "frq",
  };

  try {
    const candidateExercises: PipelineExercise[] = [];
    let batchAttempts = 0;
    const generationStartedAt = Date.now();
    const candidateTarget = Math.min(
      normalizedBlueprint.count,
      EXERCISE_PIPELINE_MAX_BATCH_COUNT,
    );
    while (
      candidateExercises.length < candidateTarget &&
      batchAttempts < 2
    ) {
      const remain = candidateTarget - candidateExercises.length;
      const generated = await generateExercisesWithThinking({
        state,
        model: input.model,
        curriculumContext: curriculumContext?.contextText ?? "",
        materialContext,
        count: remain,
        questionType: questionTypeMap[normalizedBlueprint.exerciseType] ?? "mcq",
        difficulty: difficultyBandToLevel(normalizedBlueprint.difficultyBand),
        cognitiveLevel: normalizedBlueprint.bloomLevel,
        teacherIntent: normalizedBlueprint.teacherIntent,
        existingQuestionTexts: candidateExercises.map(
          (item) => item.questionText,
        ),
        onTextDelta: input.onTextDelta,
        onTextReset: input.onTextReset,
      });
      const existing = new Set(
        candidateExercises.map((item) => item.questionText.trim()),
      );
      generated.forEach((item) => {
        const key = item.questionText.trim();
        if (!existing.has(key)) {
          existing.add(key);
          candidateExercises.push(item);
        }
      });
      batchAttempts += 1;
    }
    timings.generationMs += Math.max(0, Date.now() - generationStartedAt);
    baseExercises = candidateExercises.slice(0, candidateTarget);
    if (baseExercises.length === 0) {
      throw new Error("上游模型未返回可用题目");
    }
  } catch (error) {
    fallbackReason =
      error instanceof Error ? error.message : "上游模型服务异常";
    let rescuedExercises: PipelineExercise[] = [];
    try {
      const rescueStartedAt = Date.now();
      rescuedExercises = await Promise.race([
        generateRescueExercises({
          state,
          model: input.model,
          blueprint: normalizedBlueprint,
          curriculumContext,
          materialContext,
        }),
        timeoutAfter<PipelineExercise[]>(12_000, "习题 rescue 生成"),
      ]);
      timings.generationMs += Math.max(0, Date.now() - rescueStartedAt);
    } catch (rescueError) {
      console.warn("rescue generation failed", rescueError);
    }
    const validRescuedExercises = rescuedExercises.filter((exercise) =>
      runLocalStructureCheck(exercise).passed,
    );
    if (validRescuedExercises.length === 0) {
      throw new Error(`AP 习题流水线失败：${fallbackReason}`);
    }
    fallbackUsed = true;
    baseExercises = validRescuedExercises.slice(0, normalizedBlueprint.count);
  }

  const passedResults: ApExercisePipelineOutput["passedResults"] = [];
  const rejectedExercises: ApExercisePipelineOutput["rejectedExercises"] = [];

  const verificationStartedAt = Date.now();
  for (const exercise of baseExercises) {
    const structureCheck = runLocalStructureCheck(exercise);
    if (structureCheck.passed) {
      passedResults.push({
        exercise,
        verificationStatus: "rule_checked",
        qualityNote: "结构校验通过（简化流水线）",
        logs: [
          {
            round: 1,
            passed: true,
            reason: "结构校验通过",
            solverAnswer: "",
            hasAmbiguity: false,
          },
        ],
        repaired: false,
      });
    } else {
      rejectedExercises.push({
        exercise,
        reason: `结构校验未通过：${structureCheck.issues.join("；")}`,
        attempts: 1,
        logs: [
          {
            round: 1,
            passed: false,
            reason: `结构校验未通过：${structureCheck.issues.join("；")}`,
            solverAnswer: "",
            hasAmbiguity: true,
          },
        ],
      });
    }
  }
  timings.verificationMs = Math.max(0, Date.now() - verificationStartedAt);

  const finalPassedResults = passedResults.slice(0, normalizedBlueprint.count);

  timings.totalMs = Math.max(0, Date.now() - pipelineStartedAt);
  const verificationStatusCounts = {
    pending: 0,
    rule_checked: 0,
    verified: 0,
    failed: 0,
    manual_review: 0,
  } satisfies Record<ExerciseVerificationStatus, number>;
  finalPassedResults.forEach((item) => {
    verificationStatusCounts[item.verificationStatus] += 1;
  });
  verificationStatusCounts.failed = rejectedExercises.length;

  const outputWithoutSummary: Omit<ApExercisePipelineOutput, "summary"> = {
    fallbackUsed,
    fallbackReason,
    blueprint: normalizedBlueprint,
    curriculumContext,
    passedExercises: finalPassedResults.map((item) => item.exercise),
    passedResults: finalPassedResults,
    rejectedExercises,
    metrics: {
      requested: normalizedBlueprint.count,
      passed: finalPassedResults.length,
      rejected: rejectedExercises.length,
      totalModelCalls: state.totalModelCalls,
      maxRepairRounds: strategy.maxRepairRounds,
      verificationMode: strategy.verificationMode,
      verificationStatusCounts,
      timings,
    },
    teacherOptions: [
      { label: "采用通过题目", value: "accept_passed" },
      { label: "仅重做失败题目", value: "retry_failed_only" },
      { label: "按同蓝图再生成一版", value: "regenerate_same_blueprint" },
    ],
  };

  return {
    ...outputWithoutSummary,
    summary: buildSummary(outputWithoutSummary),
  };
}
