import assert from "node:assert/strict";
import {
  buildExercisePipelineStrategy,
  type ExerciseBlueprint,
} from "@/lib/agent/exercise-pipeline";

function makeBlueprint(overrides: Partial<ExerciseBlueprint> = {}): ExerciseBlueprint {
  return {
    subject: "AP",
    unit: null,
    learningObjective: null,
    exerciseType: "MC",
    count: 3,
    bloomLevel: "应用",
    difficultyBand: "中等应用",
    needRealWorldContext: true,
    language: "中文",
    teacherIntent: "请生成 AP 习题",
    ...overrides,
  };
}

function runRuleOnlyCase() {
  const strategy = buildExercisePipelineStrategy({
    blueprint: makeBlueprint({
      difficultyBand: "基础巩固",
      count: 5,
    }),
    requestedRepairRounds: 2,
  });

  assert.equal(strategy.verificationMode, "rule_only");
  assert.equal(strategy.useTeacherReview, false);
  assert.equal(strategy.useSolverVerification, false);
  assert.equal(strategy.maxRepairRounds, 0);
}

function runTeacherReviewCase() {
  const strategy = buildExercisePipelineStrategy({
    blueprint: makeBlueprint({
      difficultyBand: "中等应用",
      count: 3,
    }),
    requestedRepairRounds: 2,
  });

  assert.equal(strategy.verificationMode, "teacher_review");
  assert.equal(strategy.useTeacherReview, true);
  assert.equal(strategy.useSolverVerification, false);
  assert.equal(strategy.maxRepairRounds, 1);
  assert.equal(strategy.reviewAfterRepair, false);
}

function runMidCountTeacherReviewCase() {
  const strategy = buildExercisePipelineStrategy({
    blueprint: makeBlueprint({
      difficultyBand: "中等应用",
      count: 4,
    }),
    requestedRepairRounds: 2,
  });

  assert.equal(strategy.verificationMode, "teacher_review");
  assert.equal(strategy.useTeacherReview, true);
  assert.equal(strategy.useSolverVerification, false);
}

function runSolverCase() {
  const strategy = buildExercisePipelineStrategy({
    blueprint: makeBlueprint({
      difficultyBand: "高阶分析",
      count: 2,
      exerciseType: "FR",
    }),
    requestedRepairRounds: 2,
  });

  assert.equal(strategy.verificationMode, "solver_verify");
  assert.equal(strategy.useTeacherReview, false);
  assert.equal(strategy.useSolverVerification, true);
  assert.equal(strategy.maxRepairRounds, 1);
}

function runHighCountHighDifficultyCase() {
  const strategy = buildExercisePipelineStrategy({
    blueprint: makeBlueprint({
      difficultyBand: "高阶分析",
      count: 5,
      exerciseType: "FR",
    }),
    requestedRepairRounds: 2,
  });

  assert.equal(strategy.verificationMode, "teacher_review");
  assert.equal(strategy.useTeacherReview, true);
  assert.equal(strategy.useSolverVerification, false);
}

function main() {
  runRuleOnlyCase();
  runTeacherReviewCase();
  runMidCountTeacherReviewCase();
  runSolverCase();
  runHighCountHighDifficultyCase();
  console.log("exercise-pipeline regression: PASS");
}

main();
