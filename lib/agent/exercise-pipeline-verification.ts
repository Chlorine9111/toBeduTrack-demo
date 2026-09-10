import type { GatewayModelInput } from "@/lib/ai/gateway";
import {
  callStructured,
  type CurriculumContext,
} from "@/lib/agent/exercise-pipeline-generation";
import {
  extractChoiceLabel,
  inferChoiceLabelFromAnswerText,
} from "@/lib/agent/exercise-pipeline-helpers";
import {
  buildPostRepairQuickReview,
  buildTeacherReviewReason,
  scoreExercisesAsTeacher,
} from "@/lib/agent/exercise-pipeline-review";
import type {
  ExerciseBlueprint,
  ExercisePipelineStrategy,
  ExerciseProcessingResult,
  PipelineExercise,
  PipelineState,
  TeacherReviewItem,
} from "@/lib/agent/exercise-pipeline-types";
import {
  equivalenceSchema,
  exerciseRawSchema,
  normalizeEquivalenceResult,
  normalizeSolverResult,
  solverSchema,
} from "@/lib/agent/exercise-pipeline-types";

export function runLocalStructureCheck(exercise: PipelineExercise) {
  const issues: string[] = [];
  if (!exercise.questionText.trim()) {
    issues.push("题干为空");
  }
  if (!exercise.solutionSteps.trim()) {
    issues.push("解析为空");
  }
  if (!exercise.correctAnswer.trim()) {
    issues.push("答案为空");
  }
  if (exercise.type === "MC") {
    const options = exercise.options ?? [];
    if (options.length !== 4) {
      issues.push("选择题选项数量不是 4");
    }
    const labels = options.map((item) => item.label);
    if (new Set(labels).size !== labels.length) {
      issues.push("选择题选项标签重复");
    }
    const correctCount = options.filter((item) => item.isCorrect).length;
    if (correctCount !== 1) {
      issues.push("选择题未保证唯一正确答案");
    }
    if (!/^[A-D]$/i.test(exercise.correctAnswer.trim())) {
      issues.push("correctAnswer 不是 A-D");
    }
  }
  return {
    passed: issues.length === 0,
    issues,
  };
}

function isStructureOnlyFailureReason(reason: string) {
  return /^结构校验未通过[:：]/.test(reason.trim());
}

function buildLocalRecheckResult(params: {
  structure: ReturnType<typeof runLocalStructureCheck>;
  repaired: boolean;
}) {
  return {
    passed: params.structure.passed,
    reason: params.structure.passed
      ? params.repaired
        ? "结构问题已修补并通过本地复检"
        : "结构校验通过"
      : `${params.repaired ? "修补后" : ""}结构校验未通过：${params.structure.issues.join("；")}`,
    solverAnswer: "",
    hasAmbiguity: !params.structure.passed,
  };
}

export async function verifyExercise(params: {
  state: PipelineState;
  model: GatewayModelInput;
  equivalenceModel?: GatewayModelInput;
  blueprint: ExerciseBlueprint;
  exercise: PipelineExercise;
}) {
  const solverPrompt = [
    `题型：${params.exercise.type}`,
    `题目：${params.exercise.questionText}`,
    params.exercise.type === "MC" && params.exercise.options
      ? `选项：\n${params.exercise.options
          .map((item) => `${item.label}. ${item.text}`)
          .join("\n")}`
      : "选项：无",
    "请独立完成作答，并判断题目是否存在歧义、缺失条件或多解风险。",
  ].join("\n\n");

  const solvedRaw = await callStructured({
    state: params.state,
    model: params.model,
    system: [
      "你是 AP 课程学生解题器。",
      "请尝试独立解题，并判断题目是否有歧义或缺失信息。",
      "不要引用标准答案进行抄写。",
      "如果题型是选择题，必须明确返回 selectedOption=A-D 之一；answerText 里也要写出最终答案。",
      "如果题目无歧义，禁止只返回 hasAmbiguity=false 这类空结果。",
    ].join("\n"),
    prompt: solverPrompt,
    schema: solverSchema,
    schemaHint:
      "{ answerText, selectedOption?('A'|'B'|'C'|'D'), hasAmbiguity:boolean, ambiguityReason? }",
    temperature: 0,
    maxOutputTokens: 900,
    maxAttempts: 1,
    enableRepair: false,
    transport: "text_json",
  });
  const solved = normalizeSolverResult(solvedRaw);

  if (params.exercise.type === "MC") {
    const solvedLabel =
      solved.selectedOption ??
      inferChoiceLabelFromAnswerText(
        solved.answerText,
        params.exercise.options?.map((item) => ({
          label: item.label,
          text: item.text,
        })),
      ) ??
      extractChoiceLabel(solved.answerText);
    const expectedLabel = extractChoiceLabel(params.exercise.correctAnswer);
    const answerMatch = Boolean(
      solvedLabel && expectedLabel && solvedLabel === expectedLabel,
    );
    const passed = answerMatch && !solved.hasAmbiguity;
    const reason = passed
      ? "可解性验证通过"
      : solved.hasAmbiguity
        ? `题目存在歧义：${solved.ambiguityReason || "未提供"}`
        : `模型求解答案为 ${solvedLabel ?? "无法提取"}，与标准答案 ${
            expectedLabel ?? "未知"
          } 不一致`;
    return {
      passed,
      reason,
      solverAnswer: solved.selectedOption ?? solved.answerText,
      hasAmbiguity: solved.hasAmbiguity,
    };
  }

  const equivalenceRaw = await callStructured({
    state: params.state,
    model: params.equivalenceModel ?? params.model,
    system: [
      "你是答案等价性判定器。",
      "只判断学生答案是否与标准答案在数学/学科意义上等价。",
      "不要引入额外题设。",
    ].join("\n"),
    prompt: [
      `题目：${params.exercise.questionText}`,
      `标准答案：${params.exercise.correctAnswer}`,
      `学生答案：${solved.answerText}`,
      "请判断是否等价。",
    ].join("\n\n"),
    schema: equivalenceSchema,
    schemaHint: "{ isEquivalent:boolean, reason?:string }",
    temperature: 0,
    maxOutputTokens: 520,
    maxAttempts: 1,
    enableRepair: false,
    transport: "text_json",
  });
  const equivalence = normalizeEquivalenceResult(equivalenceRaw);

  const passed = equivalence.isEquivalent && !solved.hasAmbiguity;
  const reason = passed
    ? "可解性验证通过"
    : solved.hasAmbiguity
      ? `题目存在歧义：${solved.ambiguityReason || "未提供"}`
      : `答案不等价：${equivalence.reason || "未通过等价判定"}`;

  return {
    passed,
    reason,
    solverAnswer: solved.answerText,
    hasAmbiguity: solved.hasAmbiguity,
  };
}

export async function repairExercise(params: {
  state: PipelineState;
  model: GatewayModelInput;
  blueprint: ExerciseBlueprint;
  curriculumContext: CurriculumContext;
  materialContext?: string;
  exercise: PipelineExercise;
  failureReason: string;
}) {
  const prompt = [
    "以下题目验证失败，请只修补必要字段，不要改变题目目标：",
    JSON.stringify(params.exercise, null, 2),
    `失败原因：${params.failureReason}`,
    `题型：${params.blueprint.exerciseType}`,
    `认知层级：${params.blueprint.bloomLevel}`,
    `难度层级：${params.blueprint.difficultyBand}`,
    params.curriculumContext
      ? `课程上下文：\n${params.curriculumContext.contextText}`
      : "",
    params.materialContext ? `参考材料：\n${params.materialContext}` : "",
    "修补要求：",
    "1) 保持题目主题不变。",
    "2) 仅修改导致失败的部分。",
    "3) 若为 MC，仍需 4 个选项且唯一正确答案。",
  ]
    .filter(Boolean)
    .join("\n\n");

  const repaired = await callStructured({
    state: params.state,
    model: params.model,
    system: "你是 AP 命题修补器，只返回修补后的题目对象。",
    prompt,
    schema: exerciseRawSchema,
    schemaHint:
      '{ questionText|stem, type:\'MC|FR\', difficulty:"easy"|"medium"|"hard", options:{A,B,C,D}或选项数组(MC 必填), correctAnswer|answer, solutionSteps|solution, commonMistakes, topicId? }',
    temperature: 0.1,
    maxOutputTokens: 2600,
    maxAttempts: 1,
    enableRepair: false,
    transport: "text_json",
  });

  return repaired as unknown as Record<string, unknown>;
}

export async function processExerciseCandidate(params: {
  state: PipelineState;
  model: GatewayModelInput;
  verificationModel?: GatewayModelInput;
  equivalenceModel?: GatewayModelInput;
  reviewModel?: GatewayModelInput;
  blueprint: ExerciseBlueprint;
  curriculumContext: CurriculumContext;
  materialContext?: string;
  exercise: PipelineExercise;
  teacherReview: TeacherReviewItem | null;
  strategy: ExercisePipelineStrategy;
  normalizeExercise: (exercise: Record<string, unknown>) => PipelineExercise;
}) {
  let currentExercise = params.exercise;
  const logs = [];
  let currentTeacherReview = params.teacherReview;
  let verificationMs = 0;
  let repairMs = 0;
  let enforceLocalOnlyNextRound = false;
  let teacherReviewRefreshedAfterRepair = false;

  for (let round = 0; round <= params.strategy.maxRepairRounds; round += 1) {
    let verification: {
      passed: boolean;
      reason: string;
      solverAnswer: string;
      hasAmbiguity: boolean;
    } | null = null;

    const structure = runLocalStructureCheck(currentExercise);
    const verificationStartedAt = Date.now();
    if (enforceLocalOnlyNextRound) {
      verification = buildLocalRecheckResult({
        structure,
        repaired: round > 0,
      });
      enforceLocalOnlyNextRound = false;
    } else if (params.strategy.useSolverVerification) {
      try {
        verification = await verifyExercise({
          state: params.state,
          model: params.verificationModel ?? params.model,
          equivalenceModel:
            params.equivalenceModel ?? params.verificationModel ?? params.model,
          blueprint: params.blueprint,
          exercise: currentExercise,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "验证调用失败";
        verification = {
          passed: false,
          reason: `验证调用失败：${message}`,
          solverAnswer: "",
          hasAmbiguity: true,
        };
      }
    } else if (params.strategy.useTeacherReview) {
      if (
        round === 0 ||
        params.strategy.reviewAfterRepair ||
        teacherReviewRefreshedAfterRepair
      ) {
        if (currentTeacherReview) {
          verification = buildTeacherReviewReason(
            currentTeacherReview,
            structure.issues,
          );
        } else if (!structure.passed) {
          verification = {
            passed: false,
            reason: `结构校验未通过：${structure.issues.join("；")}`,
            solverAnswer: "",
            hasAmbiguity: true,
          };
        } else {
          try {
            const solverVerification = await verifyExercise({
              state: params.state,
              model: params.verificationModel ?? params.model,
              equivalenceModel:
                params.equivalenceModel ??
                params.verificationModel ??
                params.model,
              blueprint: params.blueprint,
              exercise: currentExercise,
            });
            verification = {
              ...solverVerification,
              reason: solverVerification.passed
                ? `教师评分暂不可用，已改用可解性校验通过：${solverVerification.reason}`
                : `教师评分暂不可用，且可解性校验未通过：${solverVerification.reason}`,
            };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "教师评分与可解性校验均失败";
            verification = {
              passed: false,
              reason: `教师评分暂不可用，且可解性校验失败：${message}`,
              solverAnswer: "",
              hasAmbiguity: true,
            };
          }
        }
      } else {
        verification = buildPostRepairQuickReview({
          exercise: currentExercise,
          structureIssues: structure.issues,
          previousReview: currentTeacherReview,
        });
      }
      teacherReviewRefreshedAfterRepair = false;
    } else {
      verification = {
        passed: structure.passed,
        reason: structure.passed
          ? "结构校验通过（快速模式）"
          : `结构校验未通过：${structure.issues.join("；")}`,
        solverAnswer: "",
        hasAmbiguity: !structure.passed,
      };
    }
    verificationMs += Math.max(0, Date.now() - verificationStartedAt);

    logs.push({
      round: round + 1,
      passed: verification.passed,
      reason: verification.reason,
      solverAnswer: verification.solverAnswer,
      hasAmbiguity: verification.hasAmbiguity,
    });

    if (verification.passed) {
      return {
        passedResult: {
          exercise: currentExercise,
          verificationStatus:
            params.strategy.verificationMode === "rule_only"
              ? "rule_checked"
              : round === 0
                ? "verified"
                : "manual_review",
          qualityNote: verification.reason,
          logs,
          repaired: round > 0,
        },
        verificationMs,
        repairMs,
      } satisfies ExerciseProcessingResult;
    }

    if (round >= params.strategy.maxRepairRounds) {
      break;
    }

    const repairStartedAt = Date.now();
    try {
      const structureOnlyFailure = isStructureOnlyFailureReason(
        verification.reason,
      );
      const repairedExercise = await repairExercise({
        state: params.state,
        model: params.model,
        blueprint: params.blueprint,
        curriculumContext: params.curriculumContext,
        materialContext: params.materialContext,
        exercise: currentExercise,
        failureReason: verification.reason,
      });
      currentExercise = params.normalizeExercise(repairedExercise);
      repairMs += Math.max(0, Date.now() - repairStartedAt);
      enforceLocalOnlyNextRound = structureOnlyFailure;
      if (
        params.strategy.useTeacherReview &&
        !structureOnlyFailure
      ) {
        const reviewStartedAt = Date.now();
        try {
          const repairedReview = await scoreExercisesAsTeacher({
            state: params.state,
            model: params.reviewModel ?? params.verificationModel ?? params.model,
            blueprint: params.blueprint,
            curriculumContext: params.curriculumContext,
            exercises: [currentExercise],
          });
          currentTeacherReview = repairedReview[0] ?? null;
          teacherReviewRefreshedAfterRepair = Boolean(currentTeacherReview);
        } catch (error) {
          console.warn(
            "repair teacher review failed, keep local-only check",
            error,
          );
          currentTeacherReview = null;
          teacherReviewRefreshedAfterRepair = false;
        }
        verificationMs += Math.max(0, Date.now() - reviewStartedAt);
      }
    } catch (error) {
      repairMs += Math.max(0, Date.now() - repairStartedAt);
      const message = error instanceof Error ? error.message : "修补调用失败";
      logs.push({
        round: round + 1,
        passed: false,
        reason: `修补失败：${message}`,
        solverAnswer: "",
        hasAmbiguity: true,
      });
      break;
    }
  }

  const finalReason = logs[logs.length - 1]?.reason ?? "验证阶段异常中断";
  return {
    rejectedExercise: {
      exercise: currentExercise,
      reason: finalReason,
      attempts: logs.length,
      logs,
    },
    verificationMs,
    repairMs,
  } satisfies ExerciseProcessingResult;
}
