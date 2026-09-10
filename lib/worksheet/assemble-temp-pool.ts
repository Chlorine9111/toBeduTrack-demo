import { z } from "zod";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import { generateStructuredObject } from "@/lib/ai/structured-output";
import type { TempPoolQuestion } from "@/lib/agent/temp-question-pool";
import type { ExerciseDifficulty } from "@/types/exercise";

export type TempPoolWorksheetSection = {
  title: string;
  rationale: string;
  questionIds: string[];
};

export type TempPoolWorksheetResult = {
  selectedQuestions: TempPoolQuestion[];
  sections: TempPoolWorksheetSection[];
  summary: string;
  selectionReasons: string[];
};

type AssembleTempPoolInput = {
  questions: TempPoolQuestion[];
  requestText: string;
  count: number;
  type?: "MC" | "FR";
  difficulty?: ExerciseDifficulty;
};

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function buildQuestionCatalog(questions: TempPoolQuestion[]) {
  return questions
    .map((question, index) => {
      const options = question.options
        .map((option) => `${option.key}. ${cleanText(option.content)}`)
        .join(" | ");
      return [
        `${index + 1}. id=${question.id}`,
        `questionNumber=${question.questionNumber}`,
        `type=${question.normalizedType}`,
        `difficulty=${question.difficultyLevel}`,
        question.knowledgePoint ? `knowledge=${question.knowledgePoint}` : "",
        question.sourcePageNumber ? `page=${question.sourcePageNumber}` : "",
        question.sourceFileName ? `source=${question.sourceFileName}` : "",
        `stem=${cleanText(question.stem).slice(0, 180)}`,
        options ? `options=${options.slice(0, 160)}` : "",
      ]
        .filter(Boolean)
        .join(" | ");
    })
    .join("\n");
}

function sanitizeSelectedQuestions(params: {
  selectedIds: string[];
  questions: TempPoolQuestion[];
  count: number;
}) {
  const map = new Map(params.questions.map((question) => [question.id, question]));
  const selected: TempPoolQuestion[] = [];
  const seen = new Set<string>();

  for (const id of params.selectedIds) {
    const question = map.get(id);
    if (!question || seen.has(id)) continue;
    selected.push(question);
    seen.add(id);
    if (selected.length >= params.count) break;
  }

  for (const question of params.questions) {
    if (selected.length >= params.count) break;
    if (seen.has(question.id)) continue;
    selected.push(question);
    seen.add(question.id);
  }

  return selected.slice(0, params.count);
}

function sanitizeSections(params: {
  sections: TempPoolWorksheetSection[];
  selectedQuestions: TempPoolQuestion[];
}) {
  const selectedSet = new Set(params.selectedQuestions.map((question) => question.id));
  const sections = params.sections
    .map((section) => ({
      title: cleanText(section.title) || "题目分组",
      rationale: cleanText(section.rationale) || "按相近考察方式组织。",
      questionIds: Array.from(
        new Set(section.questionIds.filter((id) => selectedSet.has(id))),
      ),
    }))
    .filter((section) => section.questionIds.length > 0);

  const assigned = new Set(sections.flatMap((section) => section.questionIds));
  const unassigned = params.selectedQuestions
    .map((question) => question.id)
    .filter((id) => !assigned.has(id));

  if (unassigned.length > 0) {
    sections.push({
      title: "补充题组",
      rationale: "模型未显式分组的题目，按原始顺序补入。",
      questionIds: unassigned,
    });
  }

  return sections;
}

export function decorateQuestionTextWithFigures(question: TempPoolQuestion) {
  if (question.linkedFigures.length === 0) {
    return question.stem;
  }

  const figureBlocks = question.linkedFigures.map(
    (url, index) => `![题图 ${index + 1}](${url})`,
  );
  return [question.stem, ...figureBlocks].filter(Boolean).join("\n\n");
}

export async function assembleWorksheetFromTempPool(
  params: AssembleTempPoolInput,
) {
  const filteredQuestions = params.questions.filter((question) => {
    if (params.type && question.normalizedType !== params.type) {
      return false;
    }
    if (params.difficulty && question.difficultyLevel !== params.difficulty) {
      return false;
    }
    return true;
  });

  const candidates = filteredQuestions.length > 0 ? filteredQuestions : params.questions;
  if (candidates.length === 0) {
    throw new Error("临时题池里还没有可用题目");
  }

  const schema = z.object({
    summary: z.string().trim().min(8).max(480),
    selectionReasons: z.array(z.string().trim().min(4).max(220)).max(6).default([]),
    selectedIds: z.array(z.string().uuid()).min(1).max(Math.max(1, params.count)),
    sections: z
      .array(
        z.object({
          title: z.string().trim().min(2).max(80),
          rationale: z.string().trim().min(4).max(220),
          questionIds: z.array(z.string().uuid()).min(1).max(Math.max(1, params.count)),
        }),
      )
      .min(1)
      .max(6),
  });

  try {
    const result = await generateStructuredObject({
      model: getResolvedLanguageModelForTask("worksheet_curate"),
      schema,
      systemPrompt: [
        "你是教师组卷助手。",
        "任务：只在给定的临时题池里选题并分组。",
        "优先保证考察内容相近、课堂节奏合理，再兼顾少量难度变化。",
        "不能虚构题目，也不能选出候选集之外的 id。",
      ].join("\n"),
      userPrompt: [
        `老师要求：${params.requestText}`,
        `目标题量：${params.count}`,
        params.type ? `题型约束：${params.type}` : "",
        typeof params.difficulty === "number" ? `难度约束：${params.difficulty}` : "",
        "",
        "候选题列表：",
        buildQuestionCatalog(candidates),
        "",
        "输出要求：",
        "1. selectedIds 只返回你选中的题目 id。",
        "2. sections 要按教学逻辑分组，例如“基础辨析 / 变式应用 / 综合提升”。",
        "3. 如果候选题不够，就选出目前最合适的一组，并在 summary 里明确说明。",
      ]
        .filter(Boolean)
        .join("\n"),
      temperature: 0.2,
      maxTokens: 1000,
      maxRetries: 2,
    });

    const selectedQuestions = sanitizeSelectedQuestions({
      selectedIds: result.selectedIds,
      questions: candidates,
      count: params.count,
    });
    const sections = sanitizeSections({
      sections: result.sections.map((section) => ({
        title: section.title,
        rationale: section.rationale,
        questionIds: section.questionIds,
      })),
      selectedQuestions,
    });

    return {
      selectedQuestions,
      sections,
      summary: cleanText(result.summary) || "已按上传 PDF 里的题目临时组好一套 worksheet。",
      selectionReasons: result.selectionReasons.map((item) => cleanText(item)).filter(Boolean),
    } satisfies TempPoolWorksheetResult;
  } catch {
    const selectedQuestions = candidates.slice(0, Math.min(params.count, candidates.length));
    return {
      selectedQuestions,
      sections: [
        {
          title: "默认题组",
          rationale: "本轮使用保守回退策略，按原始顺序组织题目。",
          questionIds: selectedQuestions.map((question) => question.id),
        },
      ],
      summary:
        selectedQuestions.length < params.count
          ? `当前 PDF 里只找到 ${selectedQuestions.length} 道可用题，已先按原始顺序整理成 worksheet。`
          : "已按原始顺序整理当前 PDF 里的题目。",
      selectionReasons: ["本轮使用保守回退策略，未混入题库题目。"],
    } satisfies TempPoolWorksheetResult;
  }
}
