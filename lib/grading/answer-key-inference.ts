import { z } from "zod";
import { generateStructuredObjectWithGateway, type GatewayResolvedModel } from "@/lib/ai/gateway";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import {
  getOpenRouterProvider,
  resolveOpenRouterApiKey,
} from "@/lib/ai/provider-registry";
import {
  inferLanguageHintFromText,
  inferQuestionResponseMode,
} from "@/lib/grading/strategy-router";
import type { AnswerKeyItem, GradingQuestionType, GradingResponseMode } from "@/lib/grading/types";
import type { GradingQualityGate } from "@/lib/grading/quality-gates";
import { evaluateAnswerKeyQuality } from "@/lib/grading/quality-gates";
import { runScanPipeline } from "@/lib/pdf-scan/pipeline";
import type { DifficultyLevel, QuestionType, ScannedQuestion } from "@/lib/pdf-scan/types";
import { createTimeoutError, toAppError, type AppErrorCode } from "@/lib/runtime/app-error";
import { runWithDeadline } from "@/lib/runtime/deadline";

const inferredRubricDimensionSchema = z.object({
  name: z.string().min(1).max(60),
  weight: z.coerce.number().min(0).max(100),
  description: z.string().min(1).max(200),
});

const inferredAnswerKeyItemSchema = z.object({
  questionNumber: z.coerce.number().int().min(1),
  questionType: z.enum(["MC", "FR", "essay", "calculation"]),
  correctAnswer: z.string().min(1).max(2400).optional().default(""),
  solutionOutline: z.string().max(600).optional().default(""),
  responseMode: z.enum(["text", "math", "diagram", "mixed"]).optional(),
  rubricDimensions: z.array(inferredRubricDimensionSchema).max(6).optional().default([]),
  maxScore: z.coerce.number().min(0).max(20),
  inferenceConfidence: z.coerce.number().min(0).max(1).optional().default(0.75),
  reviewRecommended: z.boolean().optional().default(false),
  reviewReason: z.string().max(1600).nullable().optional().default(""),
});

const inferredAnswerKeyChunkSchema = z.object({
  answerKey: z.array(inferredAnswerKeyItemSchema).min(1).max(20),
});

type InferredAnswerKeyChunk = z.infer<typeof inferredAnswerKeyChunkSchema>;

export type AnswerKeyInferenceStep = "scan_question_paper" | "generate_provisional_answer_key";

export type AnswerKeyInferenceStepEvent = {
  step: AnswerKeyInferenceStep;
  status: "running" | "completed" | "failed";
  durationMs?: number;
  metadata?: Record<string, unknown>;
  error?: unknown;
};

type AnswerKeyInferenceStepHook = (
  event: AnswerKeyInferenceStepEvent,
) => Promise<void> | void;

export type AnswerKeyInferenceAnalysis = {
  totalQuestions: number;
  totalMaxScore: number;
  byType: Record<GradingQuestionType, number>;
  byDifficulty: Record<DifficultyLevel, number>;
  detectedSubjects: string[];
  knowledgePoints: string[];
  reviewRecommendedCount: number;
  lowConfidenceCount: number;
  extractionMode: string;
  contentKind: "question_set" | "material" | "mixed";
  sourceQuestionCount: number;
  sourceAverageConfidence: number;
  notes: string[];
  modelId: string;
  qualityGate: GradingQualityGate;
};

type NormalizedInferenceItem = AnswerKeyItem;

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function clamp01(value: number, fallback = 0.5) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function uniqueStrings(values: Array<string | null | undefined>, limit = 12) {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const value of values) {
    const normalized = cleanText(value);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    results.push(normalized);
    if (results.length >= limit) break;
  }
  return results;
}

function countQuestionOptions(question: ScannedQuestion) {
  return Object.keys(question.options ?? {}).length;
}

function normalizeQuestionType(raw: string | null | undefined, fallback: GradingQuestionType): GradingQuestionType {
  const normalized = cleanText(raw).toLowerCase();
  if (normalized === "mc") return "MC";
  if (normalized === "fr") return "FR";
  if (normalized === "essay") return "essay";
  if (normalized === "calculation") return "calculation";
  return fallback;
}

export function mapScanQuestionTypeToGradingType(rawType: QuestionType): GradingQuestionType {
  switch (rawType) {
    case "choice":
      return "MC";
    case "calculation":
      return "calculation";
    case "essay":
      return "essay";
    case "fill":
    case "proof":
    case "short_answer":
    default:
      return "FR";
  }
}

export function defaultMaxScoreForQuestion(type: GradingQuestionType, difficulty: DifficultyLevel): number {
  if (type === "MC") return 1;
  if (type === "calculation") {
    if (difficulty === "hard") return 6;
    return 4;
  }
  if (type === "essay") {
    if (difficulty === "hard") return 6;
    return 4;
  }
  if (difficulty === "hard") return 4;
  return 3;
}

function normalizeMaxScore(rawScore: number | null | undefined, type: GradingQuestionType, difficulty: DifficultyLevel) {
  const fallback = defaultMaxScoreForQuestion(type, difficulty);
  if (!Number.isFinite(rawScore)) return fallback;
  const bounded = Math.max(0, Math.min(20, Math.round(rawScore ?? fallback)));
  return bounded > 0 ? bounded : fallback;
}

function normalizeWeights(weights: number[]) {
  const bounded = weights.map((item) => Math.max(0, item));
  const total = bounded.reduce((sum, item) => sum + item, 0);
  if (total <= 0) return null;

  const normalized = bounded.map((item) => Math.round((item / total) * 100));
  const delta = 100 - normalized.reduce((sum, item) => sum + item, 0);
  normalized[normalized.length - 1] = Math.max(0, normalized[normalized.length - 1] + delta);
  return normalized;
}

function buildDefaultRubricDimensions(type: GradingQuestionType) {
  if (type === "essay") {
    return [
      { name: "核心观点", weight: 50, description: "是否准确回应题目要求并覆盖关键概念。" },
      { name: "证据与表达", weight: 50, description: "是否提供充分依据，表达是否清晰可复核。" },
    ];
  }

  return [
    { name: "结果准确性", weight: 60, description: "答案结果是否正确，是否满足题目要求。" },
    { name: "方法与过程", weight: 40, description: "推理、步骤或关键依据是否完整清晰。" },
  ];
}

function normalizeRubricDimensions(
  dimensions:
    | Array<{ name?: string; dimension?: string; weight?: number; description?: string }>
    | undefined,
  type: GradingQuestionType,
) {
  if (type === "MC") return undefined;

  const cleaned = (dimensions ?? [])
    .map((item) => ({
      name: cleanText(item.name ?? item.dimension),
      weight: Number(item.weight ?? 0),
      description: cleanText(item.description),
    }))
    .filter((item) => item.name && item.description)
    .slice(0, 6);

  if (cleaned.length === 0) {
    return buildDefaultRubricDimensions(type);
  }

  const normalizedWeights = normalizeWeights(cleaned.map((item) => item.weight));
  if (!normalizedWeights) {
    return buildDefaultRubricDimensions(type);
  }

  return cleaned.map((item, index) => ({
    name: item.name,
    weight: normalizedWeights[index] ?? 0,
    description: item.description,
  }));
}

function resolveChoiceAnswerLabel(answer: string, sourceQuestion: ScannedQuestion) {
  const normalizedAnswer = cleanText(answer);
  const directLabel = normalizedAnswer.match(/\b([A-E])\b/i)?.[1]?.toUpperCase();
  if (directLabel && sourceQuestion.options?.[directLabel]) {
    return directLabel;
  }

  const normalizedText = normalizedAnswer
    .toLowerCase()
    .replace(
      /^(the correct answer is|correct answer is|the answer is|answer is|正确答案是|答案是|选项是)\s*/i,
      "",
    )
    .replace(/^\(?[a-e]\)?[\s.．:：、)\]-]+/i, "")
    .replace(/\s+/g, "")
    .trim();
  for (const [label, text] of Object.entries(sourceQuestion.options ?? {})) {
    const candidate = cleanText(text).toLowerCase().replace(/\s+/g, "");
    if (!candidate) continue;
    if (normalizedText === candidate) {
      return label.toUpperCase();
    }
  }

  return null;
}

function buildFallbackCorrectAnswer(type: GradingQuestionType) {
  if (type === "MC") return "待教师复核";
  if (type === "calculation") return "请教师补充标准答案或关键步骤。";
  return "请教师补充参考答案。";
}

export function summarizeAnswerKey(answerKey: AnswerKeyItem[], params: {
  sourceQuestions: ScannedQuestion[];
  extractionMode: string;
  contentKind: "question_set" | "material" | "mixed";
  notes?: string[];
  modelId: string;
  qualityGate: GradingQualityGate;
}): AnswerKeyInferenceAnalysis {
  const byType: Record<GradingQuestionType, number> = {
    MC: 0,
    FR: 0,
    essay: 0,
    calculation: 0,
  };
  const byDifficulty: Record<DifficultyLevel, number> = {
    easy: 0,
    medium: 0,
    hard: 0,
  };

  const sourceByNumber = new Map(params.sourceQuestions.map((question) => [question.questionNumber, question]));
  for (const item of answerKey) {
    byType[item.questionType] += 1;
    const source = sourceByNumber.get(item.questionNumber);
    if (source) {
      byDifficulty[source.difficulty] += 1;
    }
  }

  const sourceAverageConfidence = params.sourceQuestions.length > 0
    ? params.sourceQuestions.reduce((sum, question) => sum + Math.max(0, Math.min(100, question.confidence)), 0) / params.sourceQuestions.length
    : 0;

  const reviewRecommendedCount = answerKey.filter((item) => item.reviewRecommended).length;
  const lowConfidenceCount = answerKey.filter((item) => (item.inferenceConfidence ?? 1) < 0.7).length;

  return {
    totalQuestions: answerKey.length,
    totalMaxScore: answerKey.reduce((sum, item) => sum + item.maxScore, 0),
    byType,
    byDifficulty,
    detectedSubjects: uniqueStrings(params.sourceQuestions.map((item) => item.subject)),
    knowledgePoints: uniqueStrings(
      [
        ...answerKey.flatMap((item) => item.knowledgePoints ?? []),
        ...params.sourceQuestions.map((item) => item.knowledgePoint),
      ],
      16,
    ),
    reviewRecommendedCount,
    lowConfidenceCount,
    extractionMode: params.extractionMode,
    contentKind: params.contentKind,
    sourceQuestionCount: params.sourceQuestions.length,
    sourceAverageConfidence,
    notes: params.notes ?? [],
    modelId: params.modelId,
    qualityGate: params.qualityGate,
  };
}

function buildModelInputQuestion(question: ScannedQuestion) {
  return {
    questionNumber: question.questionNumber,
    content: cleanText(question.content),
    questionTypeHint: question.questionType,
    mappedGradingType: mapScanQuestionTypeToGradingType(question.questionType),
    difficultyHint: question.difficulty,
    subjectHint: cleanText(question.subject),
    knowledgePointHint: cleanText(question.knowledgePoint),
    options: question.options ?? {},
    confidence: Math.max(0, Math.min(100, question.confidence)),
    hasSubQuestions: Boolean(question.subQuestions?.length),
    optionCount: countQuestionOptions(question),
  };
}

function buildInferenceSystemPrompt() {
  return [
    "你是资深教师出题与阅卷专家，负责根据题目卷自动生成可用于判卷的 provisional answer key。",
    "请严格输出结构化对象，不要输出解释或 Markdown。",
    "规则：",
    "1. 必须保留每题的 questionNumber，不要跳号、不要改号。",
    "2. questionType 只能是 MC / FR / essay / calculation。",
    "3. 选择题的 correctAnswer 只能填写 A-E 中的一个字母，rubricDimensions 留空。",
    "4. 主观题/计算题的 correctAnswer 写简洁参考答案或关键结论。",
    "5. 主观题/计算题必须提供 solutionOutline：用编号列出解题关键步骤（每步一句话），供判分时逐步核对。",
    "6. 主观题/计算题必须提供 rubricDimensions：把解题步骤拆成独立评分点（AP 风格逐点给分），每个评分点有 name、weight（百分比，总和 100）、description（该评分点的给分标准）。评分点数量 2-6 个。",
    "7. 每题必须提供 responseMode：text（纯文字）、math（含公式符号）、diagram（含图示）、mixed（文字+公式/图示混合）。根据题目实际要求的回答方式判断，不要猜。",
    "8. 如果题目不完整、OCR 含糊或无法稳定推出标准答案，也要给出最合理的 provisional answer，但 reviewRecommended 必须为 true，并写明 reviewReason。",
    "9. maxScore 使用整数；若卷面未提供分值，优先依据题型与难度给合理默认值。",
    "10. inferenceConfidence 表示你对本题答案键的把握，范围 0-1。",
  ].join("\n");
}

function buildInferenceUserPrompt(params: {
  sessionTitle: string;
  extractionMode: string;
  contentKind: "question_set" | "material" | "mixed";
  sourceQuestions: ScannedQuestion[];
}) {
  return [
    `判卷任务：${params.sessionTitle || "未命名判卷任务"}`,
    `识别模式：${params.extractionMode}`,
    `内容判断：${params.contentKind}`,
    "以下是已经从题目卷中提取出的结构化题目，请逐题生成最小可用答案键：",
    JSON.stringify(params.sourceQuestions.map(buildModelInputQuestion), null, 2),
    "如果某题存在 OCR 残缺，请优先依据现有选项、知识点提示和常见命题方式推断；没有把握时明确标记建议复核。",
  ].join("\n\n");
}

function chunkQuestions(questions: ScannedQuestion[], chunkSize: number) {
  const chunks: ScannedQuestion[][] = [];
  for (let index = 0; index < questions.length; index += chunkSize) {
    chunks.push(questions.slice(index, index + chunkSize));
  }
  return chunks;
}

async function emitAnswerKeyInferenceStep(
  onStep: AnswerKeyInferenceStepHook | undefined,
  event: AnswerKeyInferenceStepEvent,
) {
  if (!onStep) return;
  await onStep(event);
}

async function runAnswerKeyInferenceStep<T>(params: {
  step: AnswerKeyInferenceStep;
  metadata?: Record<string, unknown>;
  onStep?: AnswerKeyInferenceStepHook;
  action: () => Promise<T>;
}) {
  await emitAnswerKeyInferenceStep(params.onStep, {
    step: params.step,
    status: "running",
    metadata: params.metadata,
  });

  const startedAt = Date.now();
  try {
    const result = await params.action();
    await emitAnswerKeyInferenceStep(params.onStep, {
      step: params.step,
      status: "completed",
      durationMs: Date.now() - startedAt,
      metadata: params.metadata,
    });
    return result;
  } catch (error) {
    await emitAnswerKeyInferenceStep(params.onStep, {
      step: params.step,
      status: "failed",
      durationMs: Date.now() - startedAt,
      metadata: params.metadata,
      error,
    });
    throw error;
  }
}

function buildAnswerKeyInferenceModels(): GatewayResolvedModel[] {
  const primary = getResolvedLanguageModelForTask("grading_extract_answer");
  const models: GatewayResolvedModel[] = [primary];
  const openRouterKey = resolveOpenRouterApiKey();
  if (openRouterKey) {
    const openRouterModelId = "google/gemini-3.1-flash-lite-preview";
    models.push({
      model: getOpenRouterProvider()(openRouterModelId),
      modelId: openRouterModelId,
      provider: "openrouter",
    });
  }
  const seen = new Set<string>();

  return models.filter((item) => {
    const signature = `${item.provider}:${item.modelId}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function shouldFallbackAnswerKeyModel(error: unknown) {
  const appError = toAppError(error, {
    message: error instanceof Error ? error.message : "答案键推断失败",
    source: "grading_extract_answer",
  });
  const fallbackCodes = new Set<AppErrorCode>([
    "TIMEOUT",
    "RATE_LIMITED",
    "UPSTREAM_UNAVAILABLE",
  ]);
  return fallbackCodes.has(appError.code);
}

function resolveAnswerKeyChunkMaxTokens(chunkSize: number) {
  // 每题输出更多内容（solutionOutline + rubricDimensions），提高 per-question token 预算
  return Math.max(900, Math.min(2800, chunkSize * 280));
}

function resolveAnswerKeyModelTimeoutMs(attemptIndex: number) {
  return attemptIndex === 0 ? 8_000 : 12_000;
}

async function inferAnswerKeyChunk(params: {
  chunk: ScannedQuestion[];
  chunkIndex: number;
  chunkCount: number;
  sessionTitle: string;
  extractionMode: string;
  contentKind: "question_set" | "material" | "mixed";
  abortSignal?: AbortSignal;
}): Promise<{
  object: InferredAnswerKeyChunk;
  modelId: string;
  provider: string;
  fallbackUsed: boolean;
}> {
  const models = buildAnswerKeyInferenceModels();
  const maxTokens = resolveAnswerKeyChunkMaxTokens(params.chunk.length);
  const errors: unknown[] = [];

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    try {
      const { object } = await runWithDeadline({
        timeoutMs: resolveAnswerKeyModelTimeoutMs(index),
        parentSignal: params.abortSignal,
        reason: `grading_extract_answer>${model.provider}:${model.modelId}`,
        onTimeout: () =>
          createTimeoutError(
            `答案键推断模型 ${model.modelId} 超时（>${resolveAnswerKeyModelTimeoutMs(index)}ms）`,
            "grading_extract_answer",
          ),
        action: (signal) =>
          generateStructuredObjectWithGateway({
            capability: "structured",
            model,
            schema: inferredAnswerKeyChunkSchema,
            systemPrompt: buildInferenceSystemPrompt(),
            userPrompt: buildInferenceUserPrompt({
              sessionTitle: params.sessionTitle,
              extractionMode: params.extractionMode,
              contentKind: params.contentKind,
              sourceQuestions: params.chunk,
            }),
            maxTokens,
            temperature: 0,
            maxRetries: 0,
            abortSignal: signal,
            fallbackUsed: index > 0,
            attemptCount: index + 1,
          }),
      });

      return {
        object,
        modelId: model.modelId,
        provider: model.provider,
        fallbackUsed: index > 0,
      };
    } catch (error) {
      errors.push(error);
      if (index >= models.length - 1 || !shouldFallbackAnswerKeyModel(error)) {
        throw error;
      }
    }
  }

  throw errors[errors.length - 1] ?? new Error("答案键推断失败");
}

export function normalizeInferenceItem(
  sourceQuestion: ScannedQuestion,
  inferred: InferredAnswerKeyChunk["answerKey"][number] | undefined,
): NormalizedInferenceItem {
  const mappedType = mapScanQuestionTypeToGradingType(sourceQuestion.questionType);
  const questionType = normalizeQuestionType(inferred?.questionType, mappedType);
  const maxScore = normalizeMaxScore(inferred?.maxScore, questionType, sourceQuestion.difficulty);
  const rawAnswer = cleanText(inferred?.correctAnswer);
  const resolvedChoiceLabel =
    questionType === "MC" && rawAnswer
      ? resolveChoiceAnswerLabel(rawAnswer, sourceQuestion)
      : null;
  const correctAnswer = questionType === "MC"
    ? resolvedChoiceLabel ?? buildFallbackCorrectAnswer(questionType)
    : rawAnswer || buildFallbackCorrectAnswer(questionType);
  const sourceConfidence = Math.max(0, Math.min(1, sourceQuestion.confidence / 100));
  const inferredConfidence = clamp01(inferred?.inferenceConfidence ?? 0.72, 0.72);
  const combinedConfidence = clamp01(inferredConfidence * 0.7 + sourceConfidence * 0.3, inferredConfidence);
  const reviewReason = cleanText(inferred?.reviewReason);
  const reviewRecommended =
    Boolean(inferred?.reviewRecommended) ||
    combinedConfidence < 0.72 ||
    !rawAnswer ||
    (questionType === "MC" && !resolvedChoiceLabel);
  const knowledgePoints = uniqueStrings([sourceQuestion.knowledgePoint], 4);
  const subjectHint = cleanText(sourceQuestion.subject) || null;
  const sourceQuestionType = cleanText(sourceQuestion.questionType) || null;
  const languageHint = inferLanguageHintFromText([
    sourceQuestion.subject,
    sourceQuestion.content,
    sourceQuestion.knowledgePoint,
    inferred?.correctAnswer,
    ...knowledgePoints,
  ]);
  // 优先使用 AI 推断的 responseMode，关键词推断作为 fallback
  const responseMode =
    (inferred as Record<string, unknown> | undefined)?.responseMode as GradingResponseMode | undefined ??
    inferQuestionResponseMode({
      questionType,
      questionText: cleanText(sourceQuestion.content),
      subjectHint,
      knowledgePoints,
      sourceQuestionType,
    });
  // 优先使用 AI 生成的逐点评分标准，fallback 到默认两维度
  const aiRubricDimensions =
    (inferred as Record<string, unknown> | undefined)?.rubricDimensions as
      Array<{ name?: string; dimension?: string; weight?: number; description?: string }> | undefined;

  return {
    questionNumber: sourceQuestion.questionNumber,
    questionText: cleanText(sourceQuestion.content),
    questionType,
    correctAnswer,
    maxScore,
    responseMode,
    subjectHint,
    languageHint,
    sourceQuestionType,
    solutionOutline: cleanText((inferred as Record<string, unknown> | undefined)?.solutionOutline as string) || null,
    rubricDimensions: normalizeRubricDimensions(
      aiRubricDimensions && aiRubricDimensions.length > 0 ? aiRubricDimensions : undefined,
      questionType,
    ),
    knowledgePoints,
    inferenceConfidence: combinedConfidence,
    reviewRecommended,
    reviewReason:
      reviewRecommended
        ? reviewReason ||
          (questionType === "MC" && !resolvedChoiceLabel
            ? "未能稳定推断选择题标准选项。"
            : "题目或答案推断置信度偏低，建议教师复核。")
        : null,
  };
}

export async function inferAnswerKeyFromQuestionPaper(params: {
  fileBuffer: Buffer;
  fileName: string;
  sessionTitle: string;
  abortSignal?: AbortSignal;
  onStep?: AnswerKeyInferenceStepHook;
}) {
  const preferVision = !/\.(png|jpe?g|webp)$/i.test(params.fileName);
  let pipelineResult = await runAnswerKeyInferenceStep({
    step: "scan_question_paper",
    onStep: params.onStep,
    metadata: {
      fileName: params.fileName,
      preferVision,
    },
    action: async () =>
      runScanPipeline({
        fileBuffer: params.fileBuffer,
        fileName: params.fileName,
        useVision: preferVision,
      }),
  });

  let sourceQuestions = pipelineResult.questions
    .filter((question) => cleanText(question.content) || countQuestionOptions(question) >= 2)
    .sort((a, b) => a.questionNumber - b.questionNumber);

  if (sourceQuestions.length === 0 && !preferVision) {
    pipelineResult = await runAnswerKeyInferenceStep({
      step: "scan_question_paper",
      onStep: params.onStep,
      metadata: {
        fileName: params.fileName,
        preferVision: true,
        retryMode: "vision_fallback",
      },
      action: async () =>
        runScanPipeline({
          fileBuffer: params.fileBuffer,
          fileName: params.fileName,
          useVision: true,
        }),
    });
    sourceQuestions = pipelineResult.questions
      .filter((question) => cleanText(question.content) || countQuestionOptions(question) >= 2)
      .sort((a, b) => a.questionNumber - b.questionNumber);
  }

  if (sourceQuestions.length === 0) {
    throw new Error("题目卷未识别出可用题目，暂时无法自动生成答案键。");
  }

  const chunkSize = sourceQuestions.length > 18 ? 8 : 10;
  const chunks = chunkQuestions(sourceQuestions, chunkSize);
  const inferredAnswerKey: AnswerKeyItem[] = [];
  const notes = [...(pipelineResult.analysis.reasons ?? [])];
  const usedModelIds = new Set<string>();
  let fallbackChunkCount = 0;

  for (const [index, chunk] of chunks.entries()) {
    const inference = await runAnswerKeyInferenceStep({
      step: "generate_provisional_answer_key",
      onStep: params.onStep,
      metadata: {
        fileName: params.fileName,
        chunkIndex: index + 1,
        chunkCount: chunks.length,
        questionCount: chunk.length,
      },
      action: async () =>
        inferAnswerKeyChunk({
          chunk,
          chunkIndex: index + 1,
          chunkCount: chunks.length,
          sessionTitle: params.sessionTitle,
          extractionMode: pipelineResult.extractionMode,
          contentKind: pipelineResult.analysis.contentKind,
          abortSignal: params.abortSignal,
        }),
    });

    usedModelIds.add(inference.modelId);
    if (inference.fallbackUsed) {
      fallbackChunkCount += 1;
    }

    const inferredMap = new Map(inference.object.answerKey.map((item) => [item.questionNumber, item]));
    chunk.forEach((question, index) => {
      const inferred =
        inferredMap.get(question.questionNumber) ?? inference.object.answerKey[index];
      inferredAnswerKey.push(normalizeInferenceItem(question, inferred));
    });
  }

  const reviewCount = inferredAnswerKey.filter((item) => item.reviewRecommended).length;
  if (reviewCount > 0) {
    notes.push(`共有 ${reviewCount} 题为低置信度 provisional answer key，建议教师先复核后再批量判卷。`);
  }
  if (fallbackChunkCount > 0) {
    notes.push(`答案键推断有 ${fallbackChunkCount} 个分片回退到了备用模型，以避免上游高负载导致整条链失败。`);
  }
  const qualityGate = evaluateAnswerKeyQuality({
    answerKey: inferredAnswerKey,
    sourceQuestionNumbers: sourceQuestions.map((question) => question.questionNumber),
  });
  if (qualityGate.reasons.length > 0) {
    notes.push(...qualityGate.reasons);
  }

  const analysis = summarizeAnswerKey(inferredAnswerKey, {
    sourceQuestions,
    extractionMode: pipelineResult.extractionMode,
    contentKind: pipelineResult.analysis.contentKind,
    notes,
    modelId: Array.from(usedModelIds).join(" -> "),
    qualityGate,
  });

  return {
    answerKey: inferredAnswerKey,
    analysis,
    qualityGate,
    sourceQuestions,
    pipelineResult,
  };
}
