import type { AnswerKeyItem } from "@/lib/grading/types";

export type GradingQualityStatus =
  | "completed"
  | "partial_result"
  | "manual_review_required";

export type GradingQualityGate = {
  status: GradingQualityStatus;
  blocked: boolean;
  reasons: string[];
  missingQuestionNumbers: number[];
  extraQuestionNumbers: number[];
  incompleteQuestionNumbers: number[];
  lowConfidenceQuestionNumbers: number[];
  reviewRecommendedQuestionNumbers: number[];
};

function sortNumbers(values: number[]) {
  return [...values].sort((left, right) => left - right);
}

function uniqueNumbers(values: number[]) {
  return sortNumbers(Array.from(new Set(values.filter((value) => Number.isFinite(value)))));
}

function looksLikeFallbackAnswer(answer: string, questionType: AnswerKeyItem["questionType"]) {
  const normalized = answer.trim();
  if (!normalized) return true;
  if (questionType === "MC") {
    return !/^[A-E]$/i.test(normalized);
  }
  return (
    normalized.includes("请教师补充") ||
    normalized.includes("待教师复核") ||
    normalized.includes("请先补充")
  );
}

export function evaluateAnswerKeyQuality(params: {
  answerKey: AnswerKeyItem[];
  sourceQuestionNumbers?: number[];
}) {
  const answerKeyNumbers = uniqueNumbers(
    params.answerKey.map((item) => item.questionNumber),
  );
  const sourceQuestionNumbers = uniqueNumbers(params.sourceQuestionNumbers ?? []);
  const answerKeyNumberSet = new Set(answerKeyNumbers);
  const sourceNumberSet = new Set(sourceQuestionNumbers);

  const missingQuestionNumbers =
    sourceQuestionNumbers.length > 0
      ? sourceQuestionNumbers.filter((questionNumber) => !answerKeyNumberSet.has(questionNumber))
      : [];
  const extraQuestionNumbers =
    sourceQuestionNumbers.length > 0
      ? answerKeyNumbers.filter((questionNumber) => !sourceNumberSet.has(questionNumber))
      : [];
  const incompleteQuestionNumbers = uniqueNumbers(
    params.answerKey
      .filter((item) => looksLikeFallbackAnswer(item.correctAnswer, item.questionType))
      .map((item) => item.questionNumber),
  );
  const lowConfidenceQuestionNumbers = uniqueNumbers(
    params.answerKey
      .filter((item) => (item.inferenceConfidence ?? 1) < 0.7)
      .map((item) => item.questionNumber),
  );
  const reviewRecommendedQuestionNumbers = uniqueNumbers(
    params.answerKey
      .filter((item) => item.reviewRecommended)
      .map((item) => item.questionNumber),
  );

  const reasons: string[] = [];
  let status: GradingQualityStatus = "completed";
  let blocked = false;

  if (missingQuestionNumbers.length > 0 || extraQuestionNumbers.length > 0) {
    status = "partial_result";
    blocked = true;
    reasons.push(
      `题号映射不一致：缺失 ${missingQuestionNumbers.length} 题，额外 ${extraQuestionNumbers.length} 题。`,
    );
  }

  if (incompleteQuestionNumbers.length > 0) {
    if (status === "completed") {
      status = "manual_review_required";
    }
    blocked = true;
    reasons.push(
      `有 ${incompleteQuestionNumbers.length} 题仍是占位答案，需先补齐标准答案后再自动判卷。`,
    );
  }

  if (reviewRecommendedQuestionNumbers.length > 0) {
    if (status === "completed") {
      status = "manual_review_required";
    }
    reasons.push(
      `有 ${reviewRecommendedQuestionNumbers.length} 题被标记为建议复核。`,
    );
  }

  if (lowConfidenceQuestionNumbers.length > 0) {
    if (status === "completed") {
      status = "manual_review_required";
    }
    reasons.push(`有 ${lowConfidenceQuestionNumbers.length} 题推断置信度偏低。`);
  }

  return {
    status,
    blocked,
    reasons,
    missingQuestionNumbers,
    extraQuestionNumbers,
    incompleteQuestionNumbers,
    lowConfidenceQuestionNumbers,
    reviewRecommendedQuestionNumbers,
  } satisfies GradingQualityGate;
}

export function evaluateSubmissionQuality(params: {
  answerKey: AnswerKeyItem[];
  extractedAnswers: Array<{
    questionNumber: number;
    studentAnswer: string;
    confidence: number;
  }>;
  gradedAnswers: Array<{
    questionNumber: number;
    needsReview: boolean;
  }>;
}) {
  const answerKeyGate = evaluateAnswerKeyQuality({
    answerKey: params.answerKey,
  });
  const extractedMap = new Map(
    params.extractedAnswers.map((item) => [item.questionNumber, item]),
  );
  const missingOcrQuestionNumbers = uniqueNumbers(
    params.answerKey
      .filter((item) => !(extractedMap.get(item.questionNumber)?.studentAnswer ?? "").trim())
      .map((item) => item.questionNumber),
  );
  const reviewAnswerQuestionNumbers = uniqueNumbers(
    params.gradedAnswers
      .filter((item) => item.needsReview)
      .map((item) => item.questionNumber),
  );

  const reasons = [...answerKeyGate.reasons];
  let status: GradingQualityStatus = answerKeyGate.status;

  if (missingOcrQuestionNumbers.length > 0) {
    status = "partial_result";
    reasons.push(`OCR 仍有 ${missingOcrQuestionNumbers.length} 题未识别出有效作答。`);
  }

  if (reviewAnswerQuestionNumbers.length > 0 && status === "completed") {
    status = "manual_review_required";
    reasons.push(`有 ${reviewAnswerQuestionNumbers.length} 题在判分后仍建议人工复核。`);
  } else if (reviewAnswerQuestionNumbers.length > 0) {
    reasons.push(`有 ${reviewAnswerQuestionNumbers.length} 题在判分后仍建议人工复核。`);
  }

  return {
    status,
    blocked: answerKeyGate.blocked,
    reasons,
    missingQuestionNumbers: answerKeyGate.missingQuestionNumbers,
    extraQuestionNumbers: answerKeyGate.extraQuestionNumbers,
    incompleteQuestionNumbers: answerKeyGate.incompleteQuestionNumbers,
    lowConfidenceQuestionNumbers: answerKeyGate.lowConfidenceQuestionNumbers,
    reviewRecommendedQuestionNumbers: uniqueNumbers([
      ...answerKeyGate.reviewRecommendedQuestionNumbers,
      ...reviewAnswerQuestionNumbers,
    ]),
    missingOcrQuestionNumbers,
  };
}
