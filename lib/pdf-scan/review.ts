import type { QuestionConfidenceSignals } from "./types";

export type ScanQuestionReviewTier = "ready" | "review" | "critical";

type OptionRecord = Record<string, string | undefined>;
type OptionArray = Array<{ key?: string; content?: string }>;

export type ReviewableScannedQuestion = {
  questionNumber?: number | string | null;
  content?: string | null;
  options?: OptionRecord | OptionArray | null;
  questionType?: string | null;
  confidence?: number | null;
  confidenceSignals?: Partial<QuestionConfidenceSignals> | null;
  linkedFigures?: string[] | null;
};

export type ScanQuestionReviewAssessment = {
  questionNumber: number;
  confidence: number;
  optionCount: number;
  reviewTier: ScanQuestionReviewTier;
  shouldAutoArchive: boolean;
  reasons: string[];
};

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function normalizeQuestionNumber(
  value: number | string | null | undefined,
  fallback: number,
) {
  const numeric =
    typeof value === "number" ? value : Number.parseInt(`${value ?? ""}`, 10);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.floor(numeric);
  }
  return fallback;
}

function normalizeOptionCount(
  options: OptionRecord | OptionArray | null | undefined,
): number {
  if (!options) return 0;
  if (Array.isArray(options)) {
    return options.filter((option) => cleanText(option.content).length > 0).length;
  }
  return Object.values(options).filter((value) => cleanText(value).length > 0).length;
}

function getSignalReasons(
  signals: Partial<QuestionConfidenceSignals> | null | undefined,
  key: keyof QuestionConfidenceSignals,
  threshold: number,
  fallbackReason: string,
) {
  const signal = signals?.[key];
  if (!signal) return [];
  const score = Number.isFinite(signal.score) ? Number(signal.score) : 0;
  if (score >= threshold) return [];
  const reasons = Array.isArray(signal.reasons)
    ? signal.reasons.map((item) => cleanText(item)).filter(Boolean)
    : [];
  return reasons.length > 0 ? reasons : [fallbackReason];
}

export function assessScannedQuestionForReview(
  question: ReviewableScannedQuestion,
  fallbackNumber: number,
): ScanQuestionReviewAssessment {
  const questionNumber = normalizeQuestionNumber(question.questionNumber, fallbackNumber);
  const content = cleanText(question.content);
  const confidence = Number.isFinite(question.confidence) ? Number(question.confidence) : 0;
  const optionCount = normalizeOptionCount(question.options);
  const isChoice = cleanText(question.questionType).toLowerCase() === "choice" || optionCount >= 2;
  const reasons = new Set<string>();

  if (content.length < 18) {
    reasons.add("题干过短，建议先确认是否有截断");
  }
  if (confidence < 72) {
    reasons.add("整体置信度偏低");
  }
  if (isChoice && optionCount < 4) {
    reasons.add("选择题选项不完整");
  }
  if (!isChoice && content.length < 30) {
    reasons.add("题干信息不足，建议人工补全");
  }

  for (const reason of getSignalReasons(
    question.confidenceSignals,
    "questionNumbering",
    58,
    "题号识别不稳定，可能切错题目边界",
  )) {
    reasons.add(reason);
  }
  for (const reason of getSignalReasons(
    question.confidenceSignals,
    "contentCompleteness",
    60,
    "题干完整度不足，可能有内容缺失",
  )) {
    reasons.add(reason);
  }
  if (isChoice) {
    for (const reason of getSignalReasons(
      question.confidenceSignals,
      "optionIntegrity",
      72,
      "选项完整度不足，建议人工复核",
    )) {
      reasons.add(reason);
    }
  }
  for (const reason of getSignalReasons(
    question.confidenceSignals,
    "visionAgreement",
    60,
    "Vision 与文本识别结果差异较大",
  )) {
    reasons.add(reason);
  }

  const normalizedReasons = Array.from(reasons);
  const critical = confidence < 60 || normalizedReasons.length >= 3 || (isChoice && optionCount < 3);
  const shouldAutoArchive = normalizedReasons.length === 0;

  return {
    questionNumber,
    confidence,
    optionCount,
    reviewTier: shouldAutoArchive ? "ready" : critical ? "critical" : "review",
    shouldAutoArchive,
    reasons: normalizedReasons,
  };
}
