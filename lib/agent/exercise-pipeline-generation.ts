import { z } from "zod";
import { buildTaskAwareMaterialContext } from "@/lib/agent/material-context";
import {
  generateGatewayText,
  generateStructuredObjectWithGateway,
  generateToolInputWithGateway,
  streamGatewayTextToCompletion,
  type GatewayModelInput,
} from "@/lib/ai/gateway";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  loadCourse,
  loadTopic,
  loadUnitWithTopics,
} from "@/lib/curriculum/loader";
import { buildExercisesDocumentFromMarkdown } from "@/lib/doc-engine/adapters";
import { normalizeExercise, difficultyBandToLevel, heuristicBlueprint, clamp, extractChoiceLabel, toDifficultyLevel } from "@/lib/agent/exercise-pipeline-helpers";
import { toExerciseDifficulty } from "@/types/exercise";
import { parseJsonFromRawText } from "@/lib/agent/exercise-pipeline-parsing";
import type {
  ExerciseBlueprint,
  PipelineExercise,
  PipelineState,
  RunApExercisePipelineInput,
} from "@/lib/agent/exercise-pipeline-types";
import {
  blueprintSchema,
  EXERCISE_PIPELINE_MAX_BATCH_COUNT,
  EXERCISE_PIPELINE_MAX_TOTAL_COUNT,
  exerciseBundleSchema,
} from "@/lib/agent/exercise-pipeline-types";
export type CurriculumContext = Awaited<ReturnType<typeof resolveCurriculumContext>>;

function getGatewayModelId(model: GatewayModelInput) {
  if (typeof model === "string") {
    return model.trim();
  }
  return model.modelId.trim();
}

function shouldPreferToolStructuredFallback(model: GatewayModelInput) {
  const normalized = getGatewayModelId(model).toLowerCase();
  return normalized.includes("claude") || normalized.startsWith("anthropic/");
}

function buildToolFallbackSchema(
  schema: z.ZodTypeAny,
  schemaHint?: string,
): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema) as Record<string, unknown>;
  } catch {
    return {
      type: "object",
      additionalProperties: true,
      description:
        schemaHint ||
        "Return a JSON object that will be validated against the target schema.",
    };
  }
}

function estimateGenerationMaxOutputTokens(params: {
  exerciseType: ExerciseBlueprint["exerciseType"];
  count: number;
  compactOutput: boolean;
}) {
  const normalizedCount = clamp(
    params.count,
    1,
    EXERCISE_PIPELINE_MAX_BATCH_COUNT,
  );
  const base = params.exerciseType === "FR" ? 1_500 : 1_200;
  const perExercise = params.exerciseType === "FR" ? 950 : 700;
  const compactDiscount = params.compactOutput ? 250 : 0;
  return clamp(
    base + normalizedCount * perExercise - compactDiscount,
    2_600,
    params.exerciseType === "FR" ? 7_200 : 6_200,
  );
}

function sanitizeExerciseNarrativeLine(value: string) {
  return value
    .replace(
      /^(?:抱歉|更正(?:一下)?|修正(?:一下)?|我(?:来)?(?:重新|改为|更正|修正)|重新审视(?:后)?|修改(?:后|如下)?|说明)[:：]\s*/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function resolveStreamingExerciseProfile(params: {
  count: number;
  questionType: "mcq" | "frq" | "mixed";
  difficulty: number;
  hasMaterialContext: boolean;
}) {
  const lowLatencyInteractive =
    params.questionType === "mcq" &&
    params.count <= 4 &&
    !params.hasMaterialContext &&
    params.difficulty <= 2;

  const thinkingBudget = lowLatencyInteractive
    ? 1024
    : params.hasMaterialContext
      ? 3072
      : params.count <= 3
        ? 1536
        : 2048;

  const maxOutputTokens = clamp(
    lowLatencyInteractive
      ? 1_400 + params.count * 650
      : 1_800 + params.count * 900,
    2_200,
    params.questionType === "frq" ? 8_000 : 7_000,
  );

  return {
    lowLatencyInteractive,
    thinkingBudget,
    maxOutputTokens,
  };
}

export async function callStructured<TSchema extends z.ZodTypeAny>(params: {
  state: PipelineState;
  model: GatewayModelInput;
  system: string;
  prompt: string;
  schema: TSchema;
  schemaHint?: string;
  temperature?: number;
  maxOutputTokens?: number;
  repairMaxOutputTokens?: number;
  maxAttempts?: number;
  enableRepair?: boolean;
  stopAfterRepairFailure?: boolean;
  transport?: "provider_structured" | "text_json";
}) {
  const maxAttempts = Math.max(1, Math.floor(params.maxAttempts ?? 3));
  const enableRepair = params.enableRepair ?? true;
  const preferToolFallback = shouldPreferToolStructuredFallback(params.model);
  const transport = params.transport ?? "provider_structured";
  let lastError: unknown = null;

  const runTextJsonAttempts = async () => {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      params.state.totalModelCalls += 1;
      const schemaRequirement = params.schemaHint
        ? `目标 JSON 字段：${params.schemaHint}`
        : "";
      const parseHint =
        attempt === 1
          ? [
              "输出要求：你必须只输出一个合法 JSON 对象，不要 Markdown，不要解释。",
              schemaRequirement,
              "不要省略关键字段；如果能确定最终答案或分类结果，就必须显式写出对应字段。",
            ]
              .filter(Boolean)
              .join("\n")
          : [
              `你上一次输出未通过 JSON/Schema 校验，请严格仅输出合法 JSON 对象。重试次数：${attempt}/${maxAttempts}`,
              schemaRequirement,
              "不要只返回布尔值或空对象，必须补齐关键字段。",
            ]
              .filter(Boolean)
              .join("\n");

      let rawText = "";
      try {
        const fallback = await generateGatewayText({
          model: params.model,
          system: [params.system, parseHint].join("\n\n"),
          prompt: params.prompt,
          temperature: params.temperature ?? 0,
          maxOutputTokens: params.maxOutputTokens ?? 3000,
          maxRetries: 1,
        });
        rawText = fallback.text ?? "";
        const parsed = parseJsonFromRawText(rawText);
        return params.schema.parse(parsed) as z.infer<TSchema>;
      } catch (error) {
        console.warn(
          `[exercise-pipeline] text-json attempt ${attempt}/${maxAttempts} failed:`,
          error instanceof Error ? error.message : error,
          rawText ? `(raw length: ${rawText.length})` : "(empty)",
        );
        lastError = error;
      }

      const canRepair =
        enableRepair && rawText.trim().length > 0 && attempt < maxAttempts;
      if (!canRepair) continue;

      params.state.totalModelCalls += 1;
      try {
        const repair = await generateGatewayText({
          model: params.model,
          system: [
            "你是 JSON 修复器。",
            "任务：将给定文本修复为合法 JSON 对象。",
            "禁止输出解释、禁止 Markdown、禁止代码块。",
            "如果原始文本已有正确字段，尽量保留原值。",
          ].join("\n"),
          prompt: [
            params.schemaHint ? `目标结构提示：${params.schemaHint}` : "",
            `上一次错误：${lastError instanceof Error ? lastError.message : String(lastError ?? "unknown")}`,
            "请修复以下原始输出，返回一个合法 JSON 对象：",
            rawText.slice(0, 12000),
          ]
            .filter(Boolean)
            .join("\n\n"),
          temperature: 0,
          maxOutputTokens:
            params.repairMaxOutputTokens ?? params.maxOutputTokens ?? 3000,
          maxRetries: 1,
        });

        const repaired = parseJsonFromRawText(repair.text ?? "");
        return params.schema.parse(repaired) as z.infer<TSchema>;
      } catch (error) {
        lastError = error;
        if (params.stopAfterRepairFailure) break;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("结构化输出失败");
  };

  if (transport === "provider_structured") {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      params.state.totalModelCalls += 1;
      const structuredHint =
        attempt === 1
          ? "严格按照给定 schema 返回结构化结果，不要附加解释。"
          : `上一轮结果未通过校验。请只返回符合 schema 的结构化结果。重试 ${attempt}/${maxAttempts}。`;

      try {
        const structured = await generateStructuredObjectWithGateway({
          model: params.model,
          systemPrompt: [params.system, structuredHint].join("\n\n"),
          userPrompt: params.prompt,
          temperature: params.temperature ?? 0,
          maxTokens: params.maxOutputTokens ?? 3000,
          maxRetries: 1,
          schema: params.schema,
          schemaName: "structured_result",
          schemaDescription: params.schemaHint,
        });

        return structured.object;
      } catch (error) {
        console.warn(
          `[exercise-pipeline] structured attempt ${attempt}/${maxAttempts} failed:`,
          error instanceof Error ? error.message : error,
        );
        lastError = error;
        if (preferToolFallback) {
          break;
        }
      }
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      params.state.totalModelCalls += 1;
      try {
        const toolResult = await generateToolInputWithGateway<z.infer<TSchema>>({
          model: params.model,
          systemPrompt: [
            params.system,
            "你必须调用唯一工具并把最终结果作为工具入参返回。",
            "禁止输出解释文本，禁止返回空对象。",
          ].join("\n\n"),
          userPrompt: params.prompt,
          tool: {
            name: "return_structured_result",
            description:
              params.schemaHint ||
              "Return the final structured result as tool input.",
            inputSchema: buildToolFallbackSchema(params.schema, params.schemaHint),
          },
          maxTokens: params.maxOutputTokens ?? 3000,
          temperature: params.temperature ?? 0,
          maxRetries: 1,
          attemptCount: attempt,
          fallbackUsed: true,
        });
        return params.schema.parse(toolResult.input) as z.infer<TSchema>;
      } catch (error) {
        console.warn(
          `[exercise-pipeline] tool-fallback attempt ${attempt}/${maxAttempts} failed:`,
          error instanceof Error ? error.message : error,
        );
        lastError = error;
      }
    }

    if (!enableRepair) {
      throw lastError instanceof Error ? lastError : new Error("结构化输出失败");
    }
  }

  return runTextJsonAttempts();
}

export async function resolveBlueprint(
  state: PipelineState,
  input: RunApExercisePipelineInput,
) {
  try {
    const materialContext = buildTaskAwareMaterialContext({
      materials: input.uploadedMaterials,
      taskKind: "exercise",
      query: input.teacherRequest,
      maxLength: 1_200,
    });
    return await callStructured({
      state,
      model: input.model,
      system: [
        "你是 AP 课程习题蓝图解析器。",
        "将老师自然语言请求解析为结构化蓝图。",
        "只关注：题型、题数、认知层级、难度层级、语言和目标。",
        "不要输出解释文本。",
      ].join("\n"),
      prompt: [
        `教师请求：${input.teacherRequest.trim()}`,
        materialContext ? `参考材料：\n${materialContext}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: blueprintSchema,
      schemaHint:
        "{ subject, unit, learningObjective, exerciseType:'MC|FR', count:1-20, bloomLevel, difficultyBand, needRealWorldContext, language, teacherIntent }",
      temperature: 0,
      maxOutputTokens: 1100,
      maxAttempts: 1,
      enableRepair: false,
    });
  } catch {
    return heuristicBlueprint(input);
  }
}

export async function resolveCurriculumContext(input: RunApExercisePipelineInput) {
  if (!input.courseId && !input.unitId && !input.topicId) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const course = input.courseId ? await loadCourse(input.courseId, supabase) : null;
  const unitContext = input.unitId
    ? await loadUnitWithTopics(input.unitId, supabase)
    : { unit: null, topics: [] };
  const topic = input.topicId ? await loadTopic(input.topicId, supabase) : null;
  const selectedTopic =
    topic ??
    (input.topicId ? null : unitContext.topics.length > 0 ? unitContext.topics[0] : null);

  const lines: string[] = [];
  if (course) lines.push(`课程：${course.name} (${course.code})`);
  if (unitContext.unit) lines.push(`单元：Unit ${unitContext.unit.unitNumber} - ${unitContext.unit.title}`);
  if (selectedTopic) {
    lines.push(`知识点：${selectedTopic.topicNumber} ${selectedTopic.title}`);
    const lo = selectedTopic.learningObjectives
      .slice(0, 4)
      .map((item) => `${item.code}: ${item.description}`);
    if (lo.length > 0) {
      lines.push("学习目标：");
      lines.push(...lo);
    }
  }

  if (lines.length === 0) return null;

  return {
    courseName: course?.name ?? null,
    unitName: unitContext.unit?.title ?? null,
    topicName: selectedTopic?.title ?? null,
    contextText: lines.join("\n"),
  };
}

export async function generateExerciseBatch(params: {
  state: PipelineState;
  model: GatewayModelInput;
  blueprint: ExerciseBlueprint;
  curriculumContext: Awaited<ReturnType<typeof resolveCurriculumContext>>;
  materialContext?: string;
  count: number;
  existingQuestionTexts: string[];
  fastMode?: boolean;
}) {
  const compactOutput =
    params.fastMode ||
    params.count >= 4 ||
    (params.blueprint.exerciseType === "FR" && params.count >= 2);
  const maxOutputTokens = estimateGenerationMaxOutputTokens({
    exerciseType: params.blueprint.exerciseType,
    count: params.count,
    compactOutput,
  });
  const languageHint =
    params.blueprint.language === "英文" ? "请使用英文出题。" : "请使用中文出题。";
  const duplicationHint =
    params.existingQuestionTexts.length > 0
      ? `禁止与以下题干重复：\n${params.existingQuestionTexts.map((line, idx) => `${idx + 1}. ${line}`).join("\n")}`
      : "保持题目彼此不重复。";

  const prompt = [
    `目标题数：${params.count}`,
    `题型：${params.blueprint.exerciseType}`,
    `认知层级：${params.blueprint.bloomLevel}`,
    `难度层级：${params.blueprint.difficultyBand}（建议难度值 ${difficultyBandToLevel(params.blueprint.difficultyBand)}）`,
    `主题：${params.blueprint.teacherIntent}`,
    `学习目标：${params.blueprint.learningObjective ?? "未提供，按主题自动推断"}`,
    `真实情境：${params.blueprint.needRealWorldContext ? "需要" : "不需要"}`,
    languageHint,
    params.curriculumContext
      ? `课程上下文：\n${params.curriculumContext.contextText}`
      : "课程上下文：未提供结构化课程 ID，请按 AP 通用要求生成。",
    params.materialContext
      ? `参考材料：\n${params.materialContext}\n\n如果提供了参考材料，题目必须优先依据材料中的概念、案例、数据或措辞，不要脱离材料另起主题。`
      : "",
    duplicationHint,
    "输出要求：",
    "1) 必须返回准确数量的 exercises。",
    "2) MC 题必须恰好 4 个选项，且 correctAnswer 为 A-D 之一。",
    "3) solutionSteps 必须可执行，不能只有结论。",
    "4) commonMistakes 提供 2-4 条高频错误点。",
    compactOutput
      ? "5) 性能模式：每题 solutionSteps 控制在 80-140 字；commonMistakes 最多 2 条且每条不超过 18 字；避免冗长背景。MC 题的 options 必须输出为对象格式 {A,B,C,D}，不要数组。"
      : "",
  ].join("\n\n");

  const generated = await callStructured({
    state: params.state,
    model: params.model,
    system: [
      "你是 AP 课程资深命题老师。",
      "你需要严格按蓝图生成高质量题目，并返回结构化结果。",
      "不要输出题外解释。",
    ].join("\n"),
    prompt,
    schema: exerciseBundleSchema,
    schemaHint:
      '{ exercises: [{ questionText|stem, type:\'MC|FR\', difficulty:"easy"|"medium"|"hard", options:{A,B,C,D}(MC 必填), correctAnswer|answer, solutionSteps|solution, commonMistakes, topicId? }] }',
    temperature: compactOutput ? 0.1 : 0.2,
    maxOutputTokens,
    repairMaxOutputTokens: Math.min(maxOutputTokens + 800, 8_000),
    maxAttempts: compactOutput ? 1 : 2,
    enableRepair: false,
    stopAfterRepairFailure: true,
    transport: "provider_structured",
  });

  return generated.exercises.map((item) =>
    normalizeExercise(item as unknown as Record<string, unknown>),
  );
}

export function parseRescueExercisesFromText(params: {
  text: string;
  blueprint: ExerciseBlueprint;
}) {
  const normalizedText = params.text
    .replace(/\r/g, "")
    .replace(/\*\*(QUESTION|ANSWER|SOLUTION|MISTAKES|A|B|C|D)\*\*/gi, "$1")
    .replace(/^\s*[-*]\s*(QUESTION|ANSWER|SOLUTION|MISTAKES|A|B|C|D)\s*[:：]\s*/gim, "$1: ")
    .replace(/^\s*(题目|答案|解析|错误点)\s*[:：]\s*/gim, (match, label) => {
      if (label === "题目") return "QUESTION: ";
      if (label === "答案") return "ANSWER: ";
      if (label === "解析") return "SOLUTION: ";
      return "MISTAKES: ";
    })
    .replace(/^\s*([A-D])[\.\)]\s*/gim, "$1: ")
    .replace(/<<END>>/gi, "");

  const blocksFromTagged = Array.from(
    normalizedText.matchAll(/<<EX\d+>>([\s\S]*?)(?=(?:<<EX\d+>>|$))/gi),
  )
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
  const blocksFromLegacy = normalizedText
    .split(/\[EX\d+\]/i)
    .map((item) => item.trim())
    .filter(Boolean);
  const blocksFromQuestionLines = normalizedText
    .split(/(?=^QUESTION\s*[:=])/im)
    .map((item) => item.trim())
    .filter((item) => /^QUESTION\s*[:=]/i.test(item));
  const blocks =
    blocksFromTagged.length > 0
      ? blocksFromTagged
      : blocksFromLegacy.length > 0
        ? blocksFromLegacy
        : blocksFromQuestionLines;
  const difficulty = toExerciseDifficulty(difficultyBandToLevel(params.blueprint.difficultyBand));
  const results: PipelineExercise[] = [];

  for (const block of blocks) {
    const get = (label: string) =>
      block
        .match(
          new RegExp(
            `^${label}\\s*[:=]\\s*([\\s\\S]*?)(?=^(?:QUESTION|ANSWER|SOLUTION|MISTAKES|[A-D])\\s*[:=]|$)`,
            "im",
          ),
        )?.[1]
        ?.trim() ?? "";
    const questionText = get("QUESTION");
    const solutionSteps = get("SOLUTION");
    const answer = get("ANSWER");
    if (!questionText || !solutionSteps || !answer) continue;

    if (params.blueprint.exerciseType === "MC") {
      const a = get("A");
      const b = get("B");
      const c = get("C");
      const d = get("D");
      if (!a || !b || !c || !d) continue;
      const correctLabel = extractChoiceLabel(answer);
      if (!correctLabel) continue;
      results.push({
        questionText,
        type: "MC",
        difficulty,
        options: [
          { label: "A", text: a, isCorrect: correctLabel === "A" },
          { label: "B", text: b, isCorrect: correctLabel === "B" },
          { label: "C", text: c, isCorrect: correctLabel === "C" },
          { label: "D", text: d, isCorrect: correctLabel === "D" },
        ],
        correctAnswer: correctLabel,
        solutionSteps,
        commonMistakes: get("MISTAKES")
          .split(/[;,，]/)
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 3),
      });
      continue;
    }

    results.push({
      questionText,
      type: "FR",
      difficulty,
      correctAnswer: answer,
      solutionSteps,
      commonMistakes: get("MISTAKES")
        .split(/[;,，]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 3),
    });
  }

  return results.slice(
    0,
    clamp(params.blueprint.count, 1, EXERCISE_PIPELINE_MAX_BATCH_COUNT),
  );
}

function parseMarkdownExercisesFromText(params: {
  text: string;
  count: number;
  difficulty: number;
}) {
  const normalized = params.text.replace(/\r/g, "").trim();
  if (!normalized) return [];

  const sections = normalized
    .split(/\n(?=###\s+第\s*\d+\s*题)/g)
    .map((item) => item.trim())
    .filter((item) => /^###\s+第\s*\d+\s*题/.test(item));

  const exercises: PipelineExercise[] = [];

  for (const section of sections) {
    const lines = section
      .split("\n")
      .map((line) => sanitizeExerciseNarrativeLine(line.trim()))
      .filter(Boolean);
    if (lines.length < 2) continue;

    const stemLines: string[] = [];
    const options: Array<{ label: string; text: string; isCorrect: boolean }> = [];
    let correctAnswer = "";
    let solutionSteps = "";
    let commonMistakes = "";

    lines.slice(1).forEach((line) => {
      const optionMatch = line.match(/^([A-DＡ-Ｄ])[.)、]\s*(.+)$/);
      if (optionMatch) {
        options.push({
          label: optionMatch[1].replace(/[Ａ-Ｄ]/g, (char) =>
            String.fromCharCode(char.charCodeAt(0) - 65248),
          ),
          text: sanitizeExerciseNarrativeLine(optionMatch[2].trim()),
          isCorrect: false,
        });
        return;
      }

      if (line.startsWith("答案：")) {
        correctAnswer = line.replace(/^答案：/, "").trim();
        return;
      }

      if (line.startsWith("解析：")) {
        solutionSteps = line.replace(/^解析：/, "").trim();
        return;
      }

      if (line.startsWith("常见误区：")) {
        commonMistakes = line.replace(/^常见误区：/, "").trim();
        return;
      }

      stemLines.push(line);
    });

    const questionText = stemLines.join("\n").trim();
    if (!questionText || !correctAnswer || !solutionSteps) continue;

    const normalizedAnswer = extractChoiceLabel(correctAnswer) ?? correctAnswer;
    const isMc = options.length === 4;
    exercises.push({
      questionText,
      type: isMc ? "MC" : "FR",
      difficulty: toExerciseDifficulty(clamp(params.difficulty, 1, 4)),
      options: isMc
        ? options.map((option) => ({
            ...option,
            isCorrect: option.label === normalizedAnswer,
          }))
        : undefined,
      correctAnswer: normalizedAnswer,
      solutionSteps: sanitizeExerciseNarrativeLine(solutionSteps),
      commonMistakes: commonMistakes
        .split(/[;,，]/)
        .map((item) => sanitizeExerciseNarrativeLine(item))
        .filter(Boolean)
        .slice(0, 3),
    });
  }

  return exercises.slice(0, clamp(params.count, 1, EXERCISE_PIPELINE_MAX_BATCH_COUNT));
}

function parseExercisesFromPreviewDocument(params: {
  text: string;
  count: number;
  difficulty: number;
}) {
  const document = buildExercisesDocumentFromMarkdown(params.text, "流式习题");
  if (!document) return [];

  const exercises: PipelineExercise[] = [];

  for (const block of document.blocks) {
    if (block.type !== "question") continue;

    const questionText = block.data.stem.trim();
    if (!questionText) continue;

    const questionData = block.data as Record<string, unknown>;
    const questionType =
      typeof questionData.questionType === "string" ? questionData.questionType : "";
    const isMc = questionType === "mc";
    const explanation =
      typeof questionData.explanation === "string" ? questionData.explanation : "";
    const correctAnswer = isMc
      ? (() => {
          const rawAnswer =
            typeof questionData.correctAnswer === "string"
              ? questionData.correctAnswer
              : "";
          return extractChoiceLabel(rawAnswer) ?? rawAnswer;
        })()
      : typeof questionData.sampleAnswer === "string"
        ? questionData.sampleAnswer.trim()
        : "";
    const solutionSteps = explanation.trim();
    if (!correctAnswer || !solutionSteps) continue;

    const mcOptions = Array.isArray(questionData.options)
      ? questionData.options
      : [];

    exercises.push({
      questionText,
      type: isMc ? "MC" : "FR",
      difficulty: toExerciseDifficulty(clamp(params.difficulty, 1, 4)),
      options: isMc
        ? mcOptions.map((option) => {
            const optionRecord =
              option && typeof option === "object"
                ? (option as Record<string, unknown>)
                : null;
            const label =
              typeof optionRecord?.label === "string" ? optionRecord.label : "";
            const text =
              typeof optionRecord?.text === "string" ? optionRecord.text.trim() : "";

            return {
              label,
              text,
              isCorrect: label === correctAnswer,
            };
          }).filter((option) => option.label && option.text)
        : undefined,
      correctAnswer,
      solutionSteps,
      commonMistakes: [],
    });
  }

  return exercises.slice(
    0,
    clamp(params.count, 1, EXERCISE_PIPELINE_MAX_BATCH_COUNT),
  );
}

export async function generateRescueExercises(params: {
  state: PipelineState;
  model: GatewayModelInput;
  blueprint: ExerciseBlueprint;
  curriculumContext: Awaited<ReturnType<typeof resolveCurriculumContext>>;
  materialContext?: string;
}) {
  params.state.totalModelCalls += 1;
  const typeHint = params.blueprint.exerciseType === "MC" ? "选择题" : "问答题";
  const count = clamp(
    params.blueprint.count,
    1,
    EXERCISE_PIPELINE_MAX_BATCH_COUNT,
  );
  const maxOutputTokens = clamp(
    params.blueprint.exerciseType === "MC"
      ? 1200 + count * 420
      : 1500 + count * 460,
    2200,
    5000,
  );
  const formatHint =
    params.blueprint.exerciseType === "MC"
      ? [
          "<<EX1>>",
          "QUESTION=...",
          "A=...",
          "B=...",
          "C=...",
          "D=...",
          "ANSWER=A/B/C/D",
          "SOLUTION=...",
          "MISTAKES=错误1, 错误2",
          "<<END>>",
        ].join("\n")
      : [
          "<<EX1>>",
          "QUESTION=...",
          "ANSWER=...",
          "SOLUTION=...",
          "MISTAKES=错误1, 错误2",
          "<<END>>",
        ].join("\n");

  const prompt = [
    `请生成 ${clamp(params.blueprint.count, 1, EXERCISE_PIPELINE_MAX_TOTAL_COUNT)} 道 AP ${typeHint}，主题：${params.blueprint.teacherIntent}。`,
    `认知层级：${params.blueprint.bloomLevel}；难度：${params.blueprint.difficultyBand}；语言：${params.blueprint.language}。`,
    params.curriculumContext ? `课程上下文：\n${params.curriculumContext.contextText}` : "",
    params.materialContext
      ? `参考材料：\n${params.materialContext}\n\n必须优先基于参考材料出题，不要偏离材料主题。`
      : "",
    "性能要求：题干控制在 1 句；选项尽量短；SOLUTION 只写 2 条极短步骤；MISTAKES 只写 1 条短句。",
    "完整性要求：宁可每题更短，也不要把任何一道题截成半截；每题都必须给全 QUESTION、答案与解析。",
    "每题整体尽量压缩，避免长解释、避免背景铺垫、避免重复表述。",
    "必须严格按以下纯文本协议输出，不要 JSON、不要 Markdown、不要代码块、不要额外解释：",
    formatHint,
    "若生成多题，请继续使用 <<EX2>> <<EX3>> ...，每题都必须以 <<END>> 结束。",
  ]
    .filter(Boolean)
    .join("\n\n");

  const rescue = await generateGatewayText({
    model: params.model,
    system: "你是 AP 命题老师，严格遵循输出协议。",
    prompt,
    temperature: 0,
    maxOutputTokens,
    maxRetries: 1,
  });

  return parseRescueExercisesFromText({
    text: rescue.text ?? "",
    blueprint: params.blueprint,
  });
}

export async function generateExercisesWithThinking(params: {
  state: PipelineState;
  model: GatewayModelInput;
  curriculumContext: string;
  materialContext?: string;
  count: number;
  questionType: "mcq" | "frq" | "mixed";
  difficulty: number;
  cognitiveLevel?: string;
  teacherIntent?: string;
  existingQuestionTexts: string[];
  onTextDelta?: (delta: string) => void | Promise<void>;
  onTextReset?: () => void | Promise<void>;
}): Promise<PipelineExercise[]> {
  params.state.totalModelCalls += 1;

  const typeLabel =
    params.questionType === "mcq"
      ? "MC（选择题）"
      : params.questionType === "frq"
        ? "FR（问答题）"
        : "混合（MC + FR）";
  const typeCode =
    params.questionType === "mcq"
      ? "MC"
      : params.questionType === "frq"
        ? "FR"
        : "MC 和 FR 混合";

  const duplicationHint =
    params.existingQuestionTexts.length > 0
      ? `禁止与以下已有题干重复：\n${params.existingQuestionTexts.map((line, idx) => `${idx + 1}. ${line}`).join("\n")}`
      : "保持题目彼此不重复。";

  const profile = resolveStreamingExerciseProfile({
    count: params.count,
    questionType: params.questionType,
    difficulty: params.difficulty,
    hasMaterialContext: Boolean(params.materialContext),
  });

  const systemPrompt = [
    "你是 AP 课程资深命题老师。",
    "你需要完成以下三步：",
    "1) 根据给定的认知层级和难度，推断最适合的布鲁姆认知层级（如未显式指定）。",
    `2) 生成 ${params.count} 道高质量 ${typeLabel} 题目。`,
    "3) 对每道题自行验证：检查答案正确性、选项无歧义、题干完整。如果发现问题，在输出前自行修正。",
    "4) 所有修正都必须在内部完成，禁止在最终输出里暴露“更正/修正/抱歉/我改为/重新审视”等过程性话语。",
    "",
    "输出要求：",
    "- 只输出 Markdown 正文，不要 JSON、不要代码块、不要额外解释。",
    "- 每道题严格使用以下格式：",
    "  ### 第 1 题",
    "  题干正文",
    "  A. 选项 A",
    "  B. 选项 B",
    "  C. 选项 C",
    "  D. 选项 D",
    "  答案：B",
    "  解析：用 2-4 句写出关键推导过程。",
    "  常见误区：一句短句",
    "- 如果是问答题，则不输出 A-D 选项，答案写完整答案。",
    "- 必须按顺序输出所有题目，编号从 1 开始。",
    "- MC 题必须恰好 4 个选项，答案必须是 A-D 之一。",
    profile.lowLatencyInteractive
      ? "- 当前是交互式低延迟模式：优先保证题干、选项、答案、解析完整，避免背景铺垫和冗长解释。"
      : "",
  ].join("\n");

  const userPrompt = [
    `目标题数：${params.count}`,
    `题型：${typeCode}`,
    `难度值：${params.difficulty}（1=基础, 2=中等, 3=高阶, 4=竞赛）`,
    params.cognitiveLevel ? `认知层级：${params.cognitiveLevel}` : "认知层级：请根据难度自动推断",
    params.teacherIntent ? `教师意图：${params.teacherIntent}` : "",
    params.curriculumContext ? `课程上下文：\n${params.curriculumContext}` : "课程上下文：未提供结构化课程 ID，请按 AP 通用要求生成。",
    params.materialContext
      ? `参考材料：\n${params.materialContext}\n\n如果提供了参考材料，题目必须优先依据材料中的概念、案例、数据或措辞，不要脱离材料另起主题。`
      : "",
    duplicationHint,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await streamGatewayTextToCompletion({
    model: params.model,
    system: systemPrompt,
    prompt: userPrompt,
    thinking: { type: "enabled", budgetTokens: profile.thinkingBudget },
    effort: "low",
    maxOutputTokens: profile.maxOutputTokens,
    maxRetries: 1,
    onTextDelta: params.onTextDelta,
  });

  const rawText = result.text ?? "";
  const markdownParsed = parseMarkdownExercisesFromText({
    text: rawText,
    count: params.count,
    difficulty: params.difficulty,
  });
  if (markdownParsed.length > 0) {
    return markdownParsed;
  }

  const previewDocumentParsed = parseExercisesFromPreviewDocument({
    text: rawText,
    count: params.count,
    difficulty: params.difficulty,
  });
  if (previewDocumentParsed.length > 0) {
    return previewDocumentParsed;
  }

  const parsed = parseJsonFromRawText(rawText);
  const bundle =
    parsed && typeof parsed === "object" && "exercises" in parsed
      ? (parsed as { exercises: unknown[] })
      : { exercises: Array.isArray(parsed) ? parsed : [parsed] };

  if (!Array.isArray(bundle.exercises) || bundle.exercises.length === 0) {
    throw new Error("Extended Thinking 生成未返回有效题目");
  }

  return bundle.exercises.map((item) =>
    normalizeExercise(item as unknown as Record<string, unknown>),
  );
}
