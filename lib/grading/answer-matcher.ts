import { checkAnswerEquivalence } from "@/lib/ai/exercise-validator";
import type { AnswerKeyItem } from "@/lib/grading/types";

type MatchResult = {
  isCorrect: boolean;
  confidence: number;
  reason: string;
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[，。！？；：,.!?;:]/g, "")
    .trim();
}

function mcNormalize(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  let previous = Array.from({ length: shorter.length + 1 }, (_, index) => index);
  let current = new Array<number>(shorter.length + 1).fill(0);

  for (let row = 1; row <= longer.length; row += 1) {
    current[0] = row;
    const longerChar = longer[row - 1];

    for (let col = 1; col <= shorter.length; col += 1) {
      const substitutionCost = longerChar === shorter[col - 1] ? 0 : 1;
      current[col] = Math.min(
        current[col - 1] + 1,
        previous[col] + 1,
        previous[col - 1] + substitutionCost,
      );
    }

    [previous, current] = [current, previous];
  }

  return previous[shorter.length];
}

function contentSimilarity(a: string, b: string) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return Math.max(0, 1 - distance / maxLen);
}

export async function matchAnswer(
  studentAnswer: string,
  answerKey: AnswerKeyItem,
  options?: { disableAi?: boolean },
): Promise<MatchResult> {
  const student = studentAnswer.trim();
  const correct = answerKey.correctAnswer.trim();

  if (!student) {
    return { isCorrect: false, confidence: 0.98, reason: "空白答案" };
  }

  if (answerKey.questionType === "MC") {
    const ok = mcNormalize(student) === mcNormalize(correct);
    return {
      isCorrect: ok,
      confidence: ok ? 0.99 : 0.95,
      reason: ok ? "选择题选项一致" : "选择题选项不一致",
    };
  }

  const normalizedStudent = normalizeText(student);
  const normalizedCorrect = normalizeText(correct);
  if (normalizedStudent === normalizedCorrect) {
    return { isCorrect: true, confidence: 0.97, reason: "文本标准化后一致" };
  }

  const isShortAnswer = normalizedStudent.length < 4 || normalizedCorrect.length < 4;
  if (!isShortAnswer) {
    const similarity = contentSimilarity(normalizedStudent, normalizedCorrect);
    if (similarity >= 0.85) {
      return {
        isCorrect: true,
        confidence: 0.75 + similarity * 0.15,
        reason: `答案内容高度相似（相似度 ${(similarity * 100).toFixed(0)}%）`,
      };
    }
  }

  if (options?.disableAi) {
    return { isCorrect: false, confidence: 0.62, reason: "规则判定不等价" };
  }

  const ai = await checkAnswerEquivalence({
    studentAnswer: student,
    correctAnswer: correct,
    questionType: answerKey.questionType,
  });

  return {
    isCorrect: ai.isEquivalent,
    confidence: ai.confidence,
    reason: ai.reason,
  };
}
