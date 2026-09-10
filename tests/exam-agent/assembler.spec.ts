import { describe, it, expect } from "vitest";
import { assembleExamResult } from "@/lib/exam-agent/assembler";
import type { ExamTaskConfig } from "@/lib/exam-agent/types";
import type { ApExercisePipelineOutput, PassedExerciseResult, PipelineExercise } from "@/lib/agent/exercise-pipeline-types";

function makeMcExercise(i: number): PipelineExercise {
  return {
    questionText: `MC Question ${i}`,
    type: "MC",
    difficulty: "medium",
    options: [
      { label: "A", text: "Option A", isCorrect: false },
      { label: "B", text: "Option B", isCorrect: true },
      { label: "C", text: "Option C", isCorrect: false },
      { label: "D", text: "Option D", isCorrect: false },
    ],
    correctAnswer: "B",
    solutionSteps: "Step 1: ...",
    commonMistakes: ["Mistake 1"],
  };
}

function makePassedResult(ex: PipelineExercise, repaired = false): PassedExerciseResult {
  return {
    exercise: ex,
    verificationStatus: "verified",
    qualityNote: "Good",
    logs: [],
    repaired,
  };
}

const config: ExamTaskConfig = {
  subject: "ap-statistics",
  subjectName: "AP Statistics",
  units: ["unit-4"],
  unitNames: ["Unit 4"],
  questionCount: 3,
  questionTypes: ["MC"],
  difficultyPreference: "balanced",
  language: "英文",
};

const pipelineOutput: ApExercisePipelineOutput = {
  summary: "Generated 3 questions",
  fallbackUsed: false,
  fallbackReason: null,
  blueprint: { subject: "AP Statistics", unit: "Unit 4", learningObjective: null, exerciseType: "MC", count: 3, bloomLevel: "应用", difficultyBand: "中等应用", needRealWorldContext: true, language: "英文", teacherIntent: "test" },
  curriculumContext: { courseName: "AP Statistics", unitName: "Unit 4", topicName: "Probability", contextText: "" },
  passedExercises: [makeMcExercise(1), makeMcExercise(2), makeMcExercise(3)],
  passedResults: [
    makePassedResult(makeMcExercise(1)),
    makePassedResult(makeMcExercise(2)),
    makePassedResult(makeMcExercise(3), true),
  ],
  rejectedExercises: [],
  metrics: {
    requested: 3, passed: 3, rejected: 0, totalModelCalls: 2, maxRepairRounds: 2,
    verificationMode: "rule_only",
    verificationStatusCounts: { pending: 0, rule_checked: 3, verified: 3, failed: 0, manual_review: 0 },
    timings: { blueprintMs: 100, curriculumMs: 200, generationMs: 3000, teacherReviewMs: 0, verificationMs: 500, repairMs: 200, totalMs: 4000 },
  },
  teacherOptions: [],
};

describe("assembleExamResult", () => {
  it("creates sections by question type", () => {
    const result = assembleExamResult(config, pipelineOutput);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].questionType).toBe("MC");
    expect(result.sections[0].questions).toHaveLength(3);
  });

  it("assigns sequential indices", () => {
    const result = assembleExamResult(config, pipelineOutput);
    const indices = result.sections[0].questions.map((q) => q.index);
    expect(indices).toEqual([1, 2, 3]);
  });

  it("marks repaired questions correctly", () => {
    const result = assembleExamResult(config, pipelineOutput);
    const statuses = result.sections[0].questions.map((q) => q.verificationStatus);
    expect(statuses).toEqual(["passed", "passed", "repaired"]);
  });

  it("computes stats correctly", () => {
    const result = assembleExamResult(config, pipelineOutput);
    expect(result.stats.totalQuestions).toBe(3);
    expect(result.stats.passedCount).toBe(2);
    expect(result.stats.repairedCount).toBe(1);
    expect(result.stats.topicCoverage).toBe(1);
  });

  it("uses config.examName when provided", () => {
    const withName = { ...config, examName: "Custom Name" };
    const result = assembleExamResult(withName, pipelineOutput);
    expect(result.examName).toBe("Custom Name");
  });

  it("auto-generates exam name when not provided", () => {
    const result = assembleExamResult(config, pipelineOutput);
    expect(result.examName).toBe("AP Statistics Unit 4 Exam");
  });
});
