import type { ApExercisePipelineOutput, PassedExerciseResult, PipelineExercise } from "@/lib/agent/exercise-pipeline-types";
import type { ExamTaskConfig, ExamResult, ExamSection, ExamQuestion, ExamQuestionVerificationStatus } from "./types";
import type { ExamAgentContext } from "./agent-context";
import type { ApQuestionBankListItem } from "@/lib/question-bank/ap-types";

function mapVerificationStatus(result: PassedExerciseResult): ExamQuestionVerificationStatus {
  if (result.repaired) return "repaired";
  if (result.verificationStatus === "verified") return "passed";
  return "warning";
}

function estimateQualityScore(result: PassedExerciseResult): number {
  const base = result.verificationStatus === "verified" ? 9.0 : 7.5;
  const repairPenalty = result.repaired ? -0.5 : 0;
  const logPenalty = result.logs.some((l) => l.hasAmbiguity) ? -0.3 : 0;
  return Math.max(0, Math.min(10, base + repairPenalty + logPenalty));
}

export function assembleExamResult(
  config: ExamTaskConfig,
  pipelineOutput: ApExercisePipelineOutput,
): ExamResult {
  const mcResults: PassedExerciseResult[] = [];
  const frResults: PassedExerciseResult[] = [];

  for (const result of pipelineOutput.passedResults) {
    if (result.exercise.type === "MC") {
      mcResults.push(result);
    } else {
      frResults.push(result);
    }
  }

  const sections: ExamSection[] = [];
  let questionIndex = 1;

  if (mcResults.length > 0) {
    const mcPointsEach = 3;
    const mcQuestions: ExamQuestion[] = mcResults.map((r) => {
      const q: ExamQuestion = {
        index: questionIndex++,
        exercise: r.exercise,
        topicId: r.exercise.topicId ?? "",
        topicName: pipelineOutput.curriculumContext?.topicName ?? "",
        bloomLevel: pipelineOutput.blueprint.bloomLevel,
        verificationStatus: mapVerificationStatus(r),
        qualityScore: estimateQualityScore(r),
      };
      return q;
    });
    sections.push({
      title: "Section I: Multiple Choice",
      questionType: "MC",
      pointsPerQuestion: mcPointsEach,
      totalPoints: mcResults.length * mcPointsEach,
      questions: mcQuestions,
    });
  }

  if (frResults.length > 0) {
    const frPointsEach = 8;
    const frQuestions: ExamQuestion[] = frResults.map((r) => {
      const q: ExamQuestion = {
        index: questionIndex++,
        exercise: r.exercise,
        topicId: r.exercise.topicId ?? "",
        topicName: pipelineOutput.curriculumContext?.topicName ?? "",
        bloomLevel: pipelineOutput.blueprint.bloomLevel,
        verificationStatus: mapVerificationStatus(r),
        qualityScore: estimateQualityScore(r),
      };
      return q;
    });
    sections.push({
      title: "Section II: Free Response",
      questionType: "FR",
      pointsPerQuestion: frPointsEach,
      totalPoints: frResults.length * frPointsEach,
      questions: frQuestions,
    });
  }

  const allQuestions = sections.flatMap((s) => s.questions);
  const passedCount = allQuestions.filter((q) => q.verificationStatus === "passed").length;
  const repairedCount = allQuestions.filter((q) => q.verificationStatus === "repaired").length;
  const avgQuality =
    allQuestions.length > 0
      ? allQuestions.reduce((sum, q) => sum + q.qualityScore, 0) / allQuestions.length
      : 0;

  const examName = config.examName ?? `${config.subjectName} ${config.unitNames.join(", ")} Exam`;

  return {
    examName,
    sections,
    stats: {
      totalQuestions: allQuestions.length,
      passedCount,
      repairedCount,
      averageQuality: Math.round(avgQuality * 10) / 10,
      topicCoverage: pipelineOutput.metrics.passed / Math.max(pipelineOutput.metrics.requested, 1),
      totalTimeMs: pipelineOutput.metrics.timings.totalMs,
    },
    pipelineOutput,
  };
}

function isMcQuestion(q: ApQuestionBankListItem): boolean {
  if (!q.choices) return false;
  const keys = Object.keys(q.choices);
  return keys.length >= 4 && !keys.includes("_frq_parts");
}

function tikuToExercise(q: ApQuestionBankListItem): PipelineExercise {
  const mc = isMcQuestion(q);
  const options = mc && q.choices
    ? Object.entries(q.choices)
        .filter(([label]) => /^[A-E]$/.test(label))
        .map(([label, val]) => ({
          label,
          text: typeof val === "string" ? val : (val as { text?: string }).text ?? "",
          isCorrect: label === q.correct_answer,
        }))
    : undefined;

  return {
    questionText: q.stem,
    type: mc ? "MC" : "FR",
    difficulty: q.difficulty as "easy" | "medium" | "hard",
    options,
    correctAnswer: q.correct_answer ?? "",
    solutionSteps: q.explanation ?? "",
    commonMistakes: [],
    topicId: q.topic_code ?? undefined,
  };
}

export function assembleExamFromContext(
  ctx: ExamAgentContext,
  questionOrder?: string[],
): ExamResult {
  const candidateMap = new Map(ctx.candidates.map((q) => [q.id, q]));
  const orderedIds = questionOrder ?? ctx.selectedQuestionIds;

  const dbQuestions: ExamQuestion[] = [];
  let index = 1;

  for (const id of orderedIds) {
    const q = candidateMap.get(id);
    if (!q) continue;
    dbQuestions.push({
      index: index++,
      exercise: tikuToExercise(q),
      topicId: q.topic_code ?? "",
      topicName: `Unit ${q.unit}`,
      bloomLevel: q.cognitive_task ?? "应用",
      verificationStatus: "passed",
      qualityScore: 9.0,
    });
  }

  // Add generated questions
  for (const output of ctx.generatedResults) {
    for (const result of output.passedResults) {
      dbQuestions.push({
        index: index++,
        exercise: result.exercise,
        topicId: result.exercise.topicId ?? "",
        topicName: "",
        bloomLevel: "应用",
        verificationStatus: result.repaired ? "repaired" : "passed",
        qualityScore: estimateQualityScore(result),
      });
    }
  }

  // Build sections
  const mcQuestions = dbQuestions.filter((q) => q.exercise.type === "MC");
  const frQuestions = dbQuestions.filter((q) => q.exercise.type === "FR");
  const sections: ExamSection[] = [];

  if (mcQuestions.length > 0) {
    sections.push({
      title: "Section I: Multiple Choice",
      questionType: "MC",
      pointsPerQuestion: 3,
      totalPoints: mcQuestions.length * 3,
      questions: mcQuestions,
    });
  }

  if (frQuestions.length > 0) {
    sections.push({
      title: "Section II: Free Response",
      questionType: "FR",
      pointsPerQuestion: 8,
      totalPoints: frQuestions.length * 8,
      questions: frQuestions,
    });
  }

  const allQuestions = sections.flatMap((s) => s.questions);
  const avgQuality = allQuestions.length > 0
    ? Math.round(allQuestions.reduce((s, q) => s + q.qualityScore, 0) / allQuestions.length * 10) / 10
    : 0;

  const examName = ctx.config.examName ?? `${ctx.config.subjectName} ${ctx.config.unitNames.join(", ")} Exam`;
  const totalGenerated = ctx.generatedResults.reduce((s, o) => s + o.metrics.passed, 0);

  return {
    examName,
    sections,
    stats: {
      totalQuestions: allQuestions.length,
      passedCount: allQuestions.filter((q) => q.verificationStatus === "passed").length,
      repairedCount: allQuestions.filter((q) => q.verificationStatus === "repaired").length,
      averageQuality: avgQuality,
      topicCoverage: allQuestions.length / Math.max(ctx.config.questionCount, 1),
      totalTimeMs: 0,
    },
    pipelineOutput: ctx.generatedResults[0] ?? {
      summary: `题库 ${ctx.selectedQuestionIds.length} 题 + 生成 ${totalGenerated} 题`,
      fallbackUsed: false,
      fallbackReason: null,
      blueprint: { subject: ctx.config.subjectName, unit: null, learningObjective: null, exerciseType: "MC", count: allQuestions.length, bloomLevel: "应用", difficultyBand: "中等应用", needRealWorldContext: true, language: ctx.config.language === "英文" ? "英文" : "中文", teacherIntent: "" },
      curriculumContext: null,
      passedExercises: [],
      passedResults: [],
      rejectedExercises: [],
      metrics: { requested: ctx.config.questionCount, passed: allQuestions.length, rejected: 0, totalModelCalls: 0, maxRepairRounds: 0, verificationMode: "rule_only" as const, verificationStatusCounts: { pending: 0, rule_checked: 0, verified: allQuestions.length, failed: 0, manual_review: 0 }, timings: { blueprintMs: 0, curriculumMs: 0, generationMs: 0, teacherReviewMs: 0, verificationMs: 0, repairMs: 0, totalMs: 0 } },
      teacherOptions: [],
    },
  };
}
