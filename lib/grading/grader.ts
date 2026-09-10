import { z } from "zod";
import { generateStructuredObjectWithGateway } from "@/lib/ai/gateway";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import { matchAnswer } from "@/lib/grading/answer-matcher";
import { buildQuestionScoringGuidance } from "@/lib/grading/strategy-router";
import type { AnswerKeyItem, GradingAnswer, OcrResult, ScoringBreakdownItem } from "@/lib/grading/types";

const SCORING_CHUNK_SIZE = 8;

const scoringBreakdownSchema = z.object({
  dimension: z.string().min(1).max(120),
  score: z.coerce.number().min(0).max(20),
  maxScore: z.coerce.number().min(0).max(20),
  reason: z.string().min(1).max(400),
});

const scoringChunkSchema = z.object({
  scores: z
    .array(
      z.object({
        questionNumber: z.coerce.number().int().min(1),
        score: z.coerce.number().min(0).max(20),
        feedback: z.string().min(1).max(240).optional().default(""),
        breakdown: z.array(scoringBreakdownSchema).max(6).optional().default([]),
      }),
    )
    .max(SCORING_CHUNK_SIZE)
    .optional()
    .default([]),
});

function flattenOcrAnswers(ocr: OcrResult) {
  return ocr.pages.flatMap((page) => page.questions.map((q) => ({ ...q, pageNumber: page.pageNumber })));
}

function splitIntoChunks<T>(items: T[], size: number) {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function buildQuestionPromptPayload(question: AnswerKeyItem) {
  const { responseMode, guidance } = buildQuestionScoringGuidance(question);
  return {
    questionNumber: question.questionNumber,
    questionText: question.questionText,
    questionType: question.questionType,
    responseMode,
    subjectHint: question.subjectHint ?? null,
    languageHint: question.languageHint ?? null,
    knowledgePoints: question.knowledgePoints ?? [],
    correctAnswer: question.correctAnswer,
    solutionOutline: question.solutionOutline ?? null,
    maxScore: question.maxScore,
    rubricDimensions: question.rubricDimensions ?? [],
    guidance,
  };
}

export async function extractAnswersFromOCR(
  ocr: OcrResult,
  answerKey: AnswerKeyItem[],
  options?: { abortSignal?: AbortSignal },
): Promise<Array<{ questionNumber: number; studentAnswer: string; confidence: number }>> {
  const indexed = new Map<number, { text: string; confidence: number }>();
  flattenOcrAnswers(ocr).forEach((item) => {
    const current = indexed.get(item.questionNumber);
    if (!current || item.confidence > current.confidence) {
      indexed.set(item.questionNumber, {
        text: item.studentAnswer,
        confidence: item.confidence,
      });
    }
  });

  // OCR 漏掉的题目直接标空 + confidence 0，由 needsReview 机制强制人工复核。
  // 不再用 AI 猜测学生答案——猜出来的答案不可靠且会干扰判分。

  return answerKey.map((item) => {
    const hit = indexed.get(item.questionNumber);
    return {
      questionNumber: item.questionNumber,
      studentAnswer: hit?.text ?? "",
      confidence: hit?.confidence ?? 0,
    };
  });
}

function normalizeBreakdown(items: unknown, questionMaxScore: number): ScoringBreakdownItem[] {
  if (!Array.isArray(items)) return [];
  const cleaned = items
    .map((entry) => entry as Partial<ScoringBreakdownItem>)
    .map((entry, index) => {
      const maxScore = Math.max(0, Math.min(questionMaxScore, Number(entry.maxScore ?? 0)));
      const score = Math.max(0, Math.min(maxScore, Number(entry.score ?? 0)));
      const dimension = `${entry.dimension ?? ""}`.trim() || `维度${index + 1}`;
      const reason = `${entry.reason ?? ""}`.trim() || "未提供理由";
      return {
        dimension,
        score,
        maxScore,
        reason,
      } satisfies ScoringBreakdownItem;
    })
    .filter((entry) => Number.isFinite(entry.score) && Number.isFinite(entry.maxScore));

  if (!cleaned.length) return [];

  const sum = cleaned.reduce((total, item) => total + item.score, 0);
  if (sum <= questionMaxScore) return cleaned;

  const scale = questionMaxScore / sum;
  return cleaned.map((item) => ({
    ...item,
    score: Number((item.score * scale).toFixed(2)),
  }));
}

async function scoreAllWithAi(
  questions: Array<{
    question: AnswerKeyItem;
    studentAnswer: string;
    fallbackScore: number;
  }>,
  options?: { abortSignal?: AbortSignal },
) {
  const scoreModel = getResolvedLanguageModelForTask("grading_score");
  const scoreMap = new Map<number, {
    score: number;
    feedback: string;
    breakdown: ScoringBreakdownItem[];
  }>();

  for (const chunk of splitIntoChunks(questions, SCORING_CHUNK_SIZE)) {
    const prompt = [
      "请对以下全部题目进行严格判分，必须只基于题干、标准答案、评分维度与学生答案。",
      "通用规则：",
      "1) 每题分数必须在 0 到该题 maxScore 之间。",
      "2) 学生答案为空时，直接给 0 分并说明缺失作答。",
      "3) 主观题必须严格按照 rubricDimensions 的每个评分点逐条判分，每个维度独立给分。",
      "4) feedback 每题不超过 80 个中文字符。",
      "5) breakdown 按 rubricDimensions 逐条返回，最多 6 个维度。",
      "6) math 题要检查公式、符号、等价表达和关键步骤，不能只看最终数值。",
      "7) text 题要检查术语、论点、证据和是否直接回应题目。",
      "8) diagram 题如果学生图示信息无法可靠恢复，应保守判分，并在 feedback 中提示建议复核。",
      "9) mixed 题要同时检查文字解释与公式/图示的一致性。",
      "输出 JSON：",
      "{ scores: [{ questionNumber, score, feedback, breakdown: [{ dimension, score, maxScore, reason }] }] }",
      "题目数据(JSON):",
      JSON.stringify(
        chunk.map((item) => ({
          ...buildQuestionPromptPayload(item.question),
          studentAnswer: item.studentAnswer || "(空白)",
        })),
      ),
    ].join("\n");

    try {
      const { object } = await generateStructuredObjectWithGateway({
        capability: "structured",
        model: scoreModel,
        schema: scoringChunkSchema,
        systemPrompt: [
          "你是高标准阅卷老师，首要目标是评分准确、公平、可复核。",
          "禁止臆断学生未写出的内容。",
          "你的输出会直接用于成绩入库，必须严格遵守分值边界。",
          "请保持输出简洁，避免冗长文本。",
          "对图示类或识别不清的内容，宁可保守并建议复核，也不要编造学生答案。",
          "对数学与理科题，允许等价公式或符号写法，不要因格式差异误判。",
          "主观题判分策略：",
          "1) 如果题目有 solutionOutline（解题要点），先将学生答案与要点逐步比对，确认哪些步骤完成、哪些缺失。",
          "2) 如果题目有 rubricDimensions（评分点），必须按每个评分点独立给分，在 breakdown 中逐条输出。",
          "3) 学生过程正确但最终答案算错，仍应给出过程对应的评分点分数（AP 风格逐点给分）。",
        ].join("\n"),
        userPrompt: prompt,
        maxTokens: Math.max(900, chunk.length * 220),
        temperature: 0,
        maxRetries: 0,
        abortSignal: options?.abortSignal,
      });

      for (const row of object.scores ?? []) {
        const questionNumber = Number(row.questionNumber ?? 0);
        const question = chunk.find((item) => item.question.questionNumber === questionNumber);
        if (!question) continue;
        const score = Math.max(
          0,
          Math.min(question.question.maxScore, Number(row.score ?? question.fallbackScore)),
        );
        scoreMap.set(questionNumber, {
          score,
          feedback: `${row.feedback ?? ""}`.trim() || "已完成 AI 判卷。",
          breakdown: normalizeBreakdown(row.breakdown, question.question.maxScore),
        });
      }
    } catch (error) {
      console.error(
        `Gemini 分组判分失败，已回退到规则评分（题号: ${chunk.map((item) => item.question.questionNumber).join(",")}）`,
        error,
      );
    }
  }

  return scoreMap;
}

export async function gradeSubmissionByAI(
  answerKey: AnswerKeyItem[],
  ocr: OcrResult,
  options?: { abortSignal?: AbortSignal },
): Promise<{
  answers: Omit<GradingAnswer, "id" | "createdAt" | "submissionId">[];
  totalScore: number;
  maxScore: number;
  extractedAnswers: Array<{
    questionNumber: number;
    studentAnswer: string;
    confidence: number;
  }>;
}> {
  const extracted = await extractAnswersFromOCR(ocr, answerKey, {
    abortSignal: options?.abortSignal,
  });
  const ruleOnlyMode = process.env.E2E_TEST === "1";
  const scoredInput = await Promise.all(
    answerKey.map(async (question) => {
      const student = extracted.find((item) => item.questionNumber === question.questionNumber);
      const studentAnswer = student?.studentAnswer ?? "";
      const match = await matchAnswer(studentAnswer, question, { disableAi: true });
      const fallbackScore = match.isCorrect ? question.maxScore : 0;
      return {
        question,
        studentAnswer,
        confidence: student?.confidence ?? 0,
        fallbackScore,
      };
    }),
  );

  let scoreMap = new Map<number, {
    score: number;
    feedback: string;
    breakdown: ScoringBreakdownItem[];
  }>();
  if (!ruleOnlyMode) {
    try {
      scoreMap = await scoreAllWithAi(scoredInput.map((item) => ({
        question: item.question,
        studentAnswer: item.studentAnswer,
        fallbackScore: item.fallbackScore,
      })), {
        abortSignal: options?.abortSignal,
      });
    } catch (error) {
      console.error("Gemini 判分回退为规则评分", error);
      scoreMap = new Map();
    }
  }

  const answers = scoredInput.map((row) => {
    const { responseMode } = buildQuestionScoringGuidance(row.question);
    const aiScore = ruleOnlyMode
      ? {
          score: row.fallbackScore,
          feedback: "AI 未配置，已按规则评分，请教师抽样复核。",
          breakdown: [] as ScoringBreakdownItem[],
        }
      : scoreMap.get(row.question.questionNumber) ?? {
          score: row.fallbackScore,
          feedback: "按规则评分，建议人工复核。",
          breakdown: [] as ScoringBreakdownItem[],
        };

    return {
      questionNumber: row.question.questionNumber,
      studentAnswer: row.studentAnswer,
      correctAnswer: row.question.correctAnswer,
      score: aiScore.score,
      maxScore: row.question.maxScore,
      aiFeedback: aiScore.feedback,
      confidence: row.confidence,
      questionType: row.question.questionType,
      scoringBreakdown: aiScore.breakdown,
      needsReview:
        row.confidence < 0.6 ||
        Boolean(row.question.reviewRecommended) ||
        (row.question.inferenceConfidence ?? 1) < 0.72 ||
        responseMode === "diagram" ||
        (responseMode === "mixed" && row.confidence < 0.75) ||
        (ruleOnlyMode && row.question.questionType !== "MC") ||
        (row.question.questionType === "MC" &&
          Math.abs(aiScore.score - row.fallbackScore) > row.question.maxScore * 0.5),
      teacherOverrideScore: null,
      teacherOverrideFeedback: null,
    };
  });

  const totalScore = answers.reduce((sum, item) => sum + item.score, 0);
  const maxScore = answers.reduce((sum, item) => sum + item.maxScore, 0);

  return { answers, totalScore, maxScore, extractedAnswers: extracted };
}
