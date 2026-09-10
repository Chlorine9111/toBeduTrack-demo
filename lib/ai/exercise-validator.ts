/**
 * Exercise validator: re-solve exercises with Kimi and compare answers.
 */
import type { ExerciseAIOutput, ExerciseDifficulty, ExerciseVerificationResult } from "@/types/exercise";
import {
  buildExerciseVerificationPrompt,
  type ExercisePromptInput,
} from "@/lib/ai/prompt-assembler";
import { generateToolInputWithGateway } from "@/lib/ai/gateway";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import { generateExercises } from "@/lib/ai/exercise-generator";

export type VerificationStrategy = {
  shouldVerify: boolean;
  maxRetries: number;
  mode: "rule_only" | "ai_verify";
};

export function getVerificationStrategy(params: {
  difficulty: ExerciseDifficulty;
  skipAll: boolean;
}): VerificationStrategy {
  if (params.skipAll) {
    return { shouldVerify: false, maxRetries: 0, mode: "rule_only" };
  }
  if (params.difficulty === "easy" || params.difficulty === "medium") {
    return { shouldVerify: false, maxRetries: 0, mode: "rule_only" };
  }
  // "hard"
  return { shouldVerify: true, maxRetries: 1, mode: "ai_verify" };
}

export function runLocalExerciseRuleCheck(
  exercise: ExerciseAIOutput["exercises"][number],
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const type = exercise.type ?? "FR";
  const questionText = (exercise.questionText ?? exercise.stem ?? "").trim();
  const correctAnswer = (exercise.correctAnswer ?? exercise.correct_answer ?? "").trim();
  const solutionSteps = (exercise.solutionSteps ?? exercise.solution ?? "").trim();

  if (!questionText) {
    issues.push("题干为空");
  }
  if (!correctAnswer) {
    issues.push("答案为空");
  }
  if (!solutionSteps) {
    issues.push("解析为空");
  }

  if (type === "MC") {
    const options = Array.isArray(exercise.options)
      ? exercise.options
      : exercise.options && typeof exercise.options === "object"
        ? Object.entries(exercise.options).map(([label, text]) => ({
            label,
            text: String(text ?? ""),
            isCorrect: false,
          }))
        : [];
    if (options.length !== 4) {
      issues.push("选择题选项数量不是 4");
    }
    if (!/^[A-D]$/i.test(correctAnswer)) {
      issues.push("选择题 correctAnswer 不是 A-D");
    }
  }

  return { valid: issues.length === 0, issues };
}

export async function verifyExercise(
  exercise: ExerciseAIOutput["exercises"][number],
): Promise<ExerciseVerificationResult> {
  const questionText = exercise.questionText ?? exercise.stem ?? "";
  const exerciseType = exercise.type ?? "FR";

  const prompt = await buildExerciseVerificationPrompt({
    questionText,
    exerciseType,
    options: Array.isArray(exercise.options)
      ? exercise.options.map((option) => ({
          label: option.label,
          text: option.text,
        }))
      : undefined,
  });

  const model = getResolvedLanguageModelForTask("exercise_verify");

  const verificationTool = {
    name: "return_verification",
    description: "Return the solved answer and brief solution.",
    inputSchema: {
      type: "object",
      required: ["answer", "solution"],
      properties: {
        answer: { type: "string" },
        solution: { type: "string" },
      },
    },
  };

  const { input: toolInput } = await generateToolInputWithGateway<{ answer?: string; solution?: string }>({
    model,
    systemPrompt: "",
    userPrompt: prompt,
    tool: verificationTool,
    maxTokens: 2800,
  });
  const verifiedAnswer = `${toolInput.answer ?? ""}`.trim();
  const originalAnswer = exercise.correctAnswer ?? "";

  let isMatch = false;
  if (exercise.type === "MC") {
    const originalLabel = extractChoiceLabel(originalAnswer);
    const verifiedLabel = extractChoiceLabel(verifiedAnswer);
    isMatch = Boolean(originalLabel && verifiedLabel && originalLabel === verifiedLabel);
  } else {
    const equivalence = await checkAnswerEquivalence({
      studentAnswer: verifiedAnswer,
      correctAnswer: originalAnswer,
      questionType: exerciseType,
    });
    isMatch = equivalence.isEquivalent;
  }

  return {
    exercise,
    status: isMatch ? "verified" : "failed",
    originalAnswer,
    verifiedAnswer,
    isMatch,
    attempts: 1,
  };
}

export async function verifyExercisesInBatch(
  exercises: ExerciseAIOutput["exercises"],
): Promise<ExerciseVerificationResult[]> {
  const results = await Promise.allSettled(
    exercises.map((exercise) => verifyExercise(exercise)),
  );

  return results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    console.error("Verification failed", result.reason);
    const exercise = exercises[index];
    return {
      exercise,
      status: "failed",
      originalAnswer: exercise.correctAnswer ?? "",
      verifiedAnswer: "",
      isMatch: false,
      attempts: 1,
    };
  });
}

export async function regenerateOnFailure(
  input: ExercisePromptInput,
  exercises: ExerciseAIOutput["exercises"],
  maxAttempts: number,
): Promise<ExerciseVerificationResult[]> {
  const safeMaxAttempts = Math.max(1, Math.floor(maxAttempts));
  const results = await verifyExercisesInBatch(exercises);
  const attempts = results.map(() => 1);

  let pendingIndexes = results
    .map((result, index) => (result.isMatch ? null : index))
    .filter((value): value is number => value !== null);

  let currentAttempt = 1;
  while (pendingIndexes.length > 0 && currentAttempt < safeMaxAttempts) {
    const regeneration = await generateExercises({
      ...input,
      count: pendingIndexes.length,
    });

    const regeneratedResults = await verifyExercisesInBatch(regeneration.exercises);

    pendingIndexes.forEach((targetIndex, regenerationIndex) => {
      attempts[targetIndex] += 1;
      results[targetIndex] = {
        ...regeneratedResults[regenerationIndex],
        attempts: attempts[targetIndex],
      };
    });

    pendingIndexes = results
      .map((result, index) =>
        result.isMatch || attempts[index] >= safeMaxAttempts ? null : index,
      )
      .filter((value): value is number => value !== null);

    currentAttempt += 1;
  }

  return results.map((result, index) => ({
    ...result,
    status: result.isMatch ? "verified" : "manual_review",
    attempts: attempts[index],
  }));
}

function extractChoiceLabel(answer: string) {
  const match = answer.trim().match(/\b([A-D])\b/i);
  return match ? match[1].toUpperCase() : null;
}

export async function checkAnswerEquivalence(params: {
  studentAnswer: string;
  correctAnswer: string;
  questionType?: string;
}): Promise<{ isEquivalent: boolean; confidence: number; reason: string; mode: "rule" | "ai" }> {
  const localResult = checkAnswerEquivalenceLocally(params.correctAnswer, params.studentAnswer);
  if (localResult.isEquivalent) {
    return {
      isEquivalent: true,
      confidence: 0.96,
      reason: "规则判定等价",
      mode: "rule",
    };
  }

  if (!localResult.shouldFallbackToAi) {
    return {
      isEquivalent: false,
      confidence: 0.92,
      reason: "规则判定不等价",
      mode: "rule",
    };
  }

  const aiEquivalent = await checkAnswerEquivalenceInternal(
    params.correctAnswer,
    params.studentAnswer,
  );

  return {
    isEquivalent: aiEquivalent,
    confidence: aiEquivalent ? 0.82 : 0.68,
    reason: aiEquivalent ? "AI 判定语义等价" : "AI 判定语义不等价",
    mode: "ai",
  };
}

async function checkAnswerEquivalenceInternal(original: string, candidate: string) {
  const localResult = checkAnswerEquivalenceLocally(original, candidate);
  if (localResult.isEquivalent) {
    return true;
  }
  if (!localResult.shouldFallbackToAi) {
    return false;
  }
  let model: ReturnType<typeof getResolvedLanguageModelForTask>;
  try {
    model = getResolvedLanguageModelForTask("exercise_equivalence");
  } catch {
    return false;
  }

  const equivalenceTool = {
    name: "return_equivalence",
    description: "Return whether the two answers are mathematically equivalent.",
    inputSchema: {
      type: "object",
      required: ["isEquivalent"],
      properties: {
        isEquivalent: { type: "boolean" },
      },
    },
  };

  const prompt = [
    "Determine if the two AP Calculus answers are mathematically equivalent.",
    "Be tolerant of equivalent forms (fractions vs decimals, simplified algebra, etc.).",
    "Answer 1:",
    original,
    "",
    "Answer 2:",
    candidate,
    "",
    "Return a boolean via the provided tool.",
  ].join("\n");

  try {
    const { input: toolInput } = await generateToolInputWithGateway<{ isEquivalent?: boolean }>({
      model,
      systemPrompt: "",
      userPrompt: prompt,
      tool: equivalenceTool,
      maxTokens: 800,
    });

    return Boolean(toolInput.isEquivalent);
  } catch {
    return false;
  }
}

function checkAnswerEquivalenceLocally(original: string, candidate: string) {
  const normalizedOriginal = normalizeAnswerText(original);
  const normalizedCandidate = normalizeAnswerText(candidate);

  if (!normalizedOriginal || !normalizedCandidate) {
    return { isEquivalent: false, shouldFallbackToAi: true };
  }

  if (normalizedOriginal === normalizedCandidate) {
    return { isEquivalent: true, shouldFallbackToAi: false };
  }

  const normalizedNumericOriginal = normalizeNumericAnswer(normalizedOriginal);
  const normalizedNumericCandidate = normalizeNumericAnswer(normalizedCandidate);
  if (normalizedNumericOriginal !== null && normalizedNumericCandidate !== null) {
    const diff = Math.abs(normalizedNumericOriginal - normalizedNumericCandidate);
    if (diff < 1e-10) {
      return { isEquivalent: true, shouldFallbackToAi: false };
    }
  }

  const normalizedPolynomialOriginal = normalizePolynomialAnswer(normalizedOriginal);
  const normalizedPolynomialCandidate = normalizePolynomialAnswer(normalizedCandidate);
  if (normalizedPolynomialOriginal && normalizedPolynomialCandidate) {
    return {
      isEquivalent: normalizedPolynomialOriginal === normalizedPolynomialCandidate,
      shouldFallbackToAi: normalizedPolynomialOriginal !== normalizedPolynomialCandidate,
    };
  }

  return { isEquivalent: false, shouldFallbackToAi: true };
}

function normalizeAnswerText(answer: string) {
  return answer
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\$/g, "")
    .replace(/\\left|\\right/g, "")
    .replace(/[{}]/g, "")
    .replace(/[−–]/g, "-")
    .replace(/^\+/, "")
    .trim();
}

function normalizeNumericAnswer(answer: string) {
  const cleaned = answer.replace(/[()]/g, "");
  return parseRational(cleaned);
}

function normalizePolynomialAnswer(answer: string) {
  const normalized = answer
    .replace(/\\cdot/g, "")
    .replace(/\*/g, "")
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/[()]/g, "");

  if (!/^[0-9x^+\-./]+$/.test(normalized)) {
    return null;
  }

  const terms = normalized.replace(/-/g, "+-").split("+").filter(Boolean);
  if (terms.length === 0) {
    return null;
  }

  const coefficients = new Map<number, number>();

  for (const term of terms) {
    const parsed = parsePolynomialTerm(term);
    if (!parsed) {
      return null;
    }
    const nextValue = (coefficients.get(parsed.power) ?? 0) + parsed.coefficient;
    coefficients.set(parsed.power, nextValue);
  }

  const sortedPowers = Array.from(coefficients.keys()).sort((a, b) => b - a);
  const renderedTerms: string[] = [];

  for (const power of sortedPowers) {
    const coefficient = coefficients.get(power) ?? 0;
    if (Math.abs(coefficient) < 1e-10) {
      continue;
    }
    const sign = coefficient < 0 ? "-" : "+";
    const abs = Math.abs(coefficient);
    const coefficientText =
      Math.abs(abs - 1) < 1e-10 && power !== 0 ? "" : trimNumeric(abs);
    const variableText =
      power === 0 ? "" : power === 1 ? "x" : `x^${power}`;
    const termText = `${coefficientText}${variableText}` || "0";

    if (renderedTerms.length === 0) {
      renderedTerms.push(sign === "-" ? `-${termText}` : termText);
    } else {
      renderedTerms.push(`${sign}${termText}`);
    }
  }

  if (renderedTerms.length === 0) {
    return "0";
  }

  return renderedTerms.join("");
}

function parsePolynomialTerm(term: string) {
  if (term.includes("x")) {
    const match = term.match(/^([+-]?[^x]*)x(?:\^([+-]?\d+))?$/);
    if (!match) {
      return null;
    }
    const rawCoefficient = match[1] ?? "";
    const rawPower = match[2];
    const coefficient = parseCoefficient(rawCoefficient);
    if (coefficient === null) {
      return null;
    }
    const power = rawPower ? Number.parseInt(rawPower, 10) : 1;
    if (!Number.isFinite(power) || power < 0 || power > 8) {
      return null;
    }
    return { coefficient, power };
  }

  const constant = parseRational(term);
  if (constant === null) {
    return null;
  }
  return { coefficient: constant, power: 0 };
}

function parseCoefficient(value: string) {
  if (!value || value === "+") return 1;
  if (value === "-") return -1;
  return parseRational(value);
}

function parseRational(value: string) {
  const normalized = value.replace(/^\+/, "");
  if (/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) {
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const fractionMatch = normalized.match(/^([+-]?\d+(?:\.\d+)?)\/([+-]?\d+(?:\.\d+)?)$/);
  if (!fractionMatch) {
    return null;
  }

  const numerator = Number(fractionMatch[1]);
  const denominator = Number(fractionMatch[2]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || Math.abs(denominator) < 1e-12) {
    return null;
  }
  return numerator / denominator;
}

function trimNumeric(value: number) {
  if (Number.isInteger(value)) {
    return `${value}`;
  }
  return value.toFixed(8).replace(/\.?0+$/, "");
}
