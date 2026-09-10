import type { AnswerKeyItem, GradingAnswer, GradingStats, GradingSubmission } from "@/lib/grading/types";

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * p)));
  return sorted[index];
}

function stdDeviation(values: number[]) {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function scoreBucket(score: number, maxScore: number) {
  if (maxScore <= 0) return "0-59";
  const rate = score / maxScore;
  if (rate >= 0.9) return "90-100";
  if (rate >= 0.8) return "80-89";
  if (rate >= 0.7) return "70-79";
  if (rate >= 0.6) return "60-69";
  return "0-59";
}

export function buildSessionStats(params: {
  submissions: GradingSubmission[];
  answersBySubmission: Map<string, GradingAnswer[]>;
  answerKey: AnswerKeyItem[];
}): GradingStats {
  const completed = params.submissions.filter(
    (item) => item.status === "completed" && item.totalScore !== null && item.maxScore !== null,
  );

  const scores = completed.map((item) => item.totalScore ?? 0).sort((a, b) => a - b);
  const maxScore = completed[0]?.maxScore ?? params.answerKey.reduce((sum, item) => sum + item.maxScore, 0);

  const averageScore = scores.length
    ? scores.reduce((sum, value) => sum + value, 0) / scores.length
    : 0;

  const distribution: Record<string, number> = {
    "90-100": 0,
    "80-89": 0,
    "70-79": 0,
    "60-69": 0,
    "0-59": 0,
  };

  completed.forEach((item) => {
    distribution[scoreBucket(item.totalScore ?? 0, item.maxScore ?? 1)] += 1;
  });

  const questionStats = params.answerKey.map((key) => {
    const answerRows = completed.flatMap((submission) => {
      const answers = params.answersBySubmission.get(submission.id) ?? [];
      return answers.filter((item) => item.questionNumber === key.questionNumber);
    });

    const total = answerRows.reduce((sum, answer) => sum + answer.score, 0);
    const fullCount = answerRows.filter((item) => item.score >= item.maxScore - 1e-6).length;

    return {
      questionNumber: key.questionNumber,
      averageScore: answerRows.length ? total / answerRows.length : 0,
      maxScore: key.maxScore,
      correctRate: answerRows.length ? fullCount / answerRows.length : 0,
    };
  });

  const weakKnowledgeMap = new Map<string, number[]>();
  params.answerKey.forEach((key) => {
    const stat = questionStats.find((item) => item.questionNumber === key.questionNumber);
    if (!stat) return;
    (key.knowledgePoints ?? []).forEach((point) => {
      const list = weakKnowledgeMap.get(point) ?? [];
      list.push(stat.correctRate);
      weakKnowledgeMap.set(point, list);
    });
  });

  const weakKnowledgePoints = Array.from(weakKnowledgeMap.entries())
    .map(([point, rates]) => ({
      point,
      averageRate: rates.length ? rates.reduce((sum, v) => sum + v, 0) / rates.length : 0,
    }))
    .sort((a, b) => a.averageRate - b.averageRate)
    .slice(0, 8);

  return {
    averageScore,
    maxScore,
    minScore: scores[0] ?? 0,
    medianScore: percentile(scores, 0.5),
    stdDeviation: stdDeviation(scores),
    distribution,
    questionStats,
    weakKnowledgePoints,
  };
}
