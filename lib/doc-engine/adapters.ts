import type { AgentQuestionBlock } from "@/lib/agent/chat-stream-types";
import type { AssembleWorksheetResult, AssembledWorksheetExercise } from "@/lib/worksheet/assemble";
import type { ExerciseOption } from "@/types/exercise";
import { toExerciseDifficulty } from "@/types/exercise";
import type { LessonPlanDocument } from "@/lib/lesson-plan/types";
import type { LessonPlanPdfInput } from "@/lib/pdf/templates/lesson-plan-template";
import type { MockRubric } from "@/types/chatflow";
import type { RubricDetailPayload } from "@/types/rubric";
import {
  DEFAULT_DOCUMENT_LAYOUT,
  type DocumentBlock,
  type DocumentModel,
  type LessonStepBlock,
  type QuestionBlock,
  type QuestionOption,
  type RubricRowBlock,
} from "@/lib/doc-engine/block-types";
import { parseDocumentModel } from "@/lib/doc-engine/document-schema";

function normalizeText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\r\n?/g, "\n").replace(/[\u00a0\u2003]/g, " ").trim();
}

function slugId(prefix: string, value: string, index: number) {
  const normalized = value
    .toLowerCase()
    .replace(/[\s/]+/g, "-")
    .replace(/[^a-z0-9-\u4e00-\u9fa5]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${prefix}-${normalized || index + 1}`;
}

function splitSections(markdown: string) {
  const normalized = normalizeText(markdown);
  if (!normalized) return [];

  const matches = Array.from(normalized.matchAll(/^##\s+(.+)$/gm));
  if (matches.length === 0) {
    return [
      {
        title: "正文",
        body: normalized,
      },
    ];
  }

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const bodyStart = start + match[0].length;
    const end = matches[index + 1]?.index ?? normalized.length;
    return {
      title: match[1].trim(),
      body: normalized.slice(bodyStart, end).trim(),
    };
  });
}

function parseBulletLines(body: string) {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^[-*•]\s+/.test(line))
    .map((line) => line.replace(/^[-*•]\s+/, "").trim());
}

const NOTES_TABLE_SEPARATOR_PATTERN =
  /^\|?(?:\s*:?-{3,}:?\s*\|)+(?:\s*:?-{3,}:?\s*\|?)$/;

function splitMarkdownTableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownTableBlockStart(lines: string[], index: number) {
  const current = lines[index]?.trim() ?? "";
  const next = lines[index + 1]?.trim() ?? "";
  if (!current || !next) return false;
  return current.includes("|") && NOTES_TABLE_SEPARATOR_PATTERN.test(next);
}

function appendNotesBodyBlocks(params: {
  blocks: DocumentBlock[];
  body: string;
  idPrefix: string;
}) {
  const lines = params.body.split("\n");
  let currentInstructionLines: string[] = [];
  let blockIndex = 0;

  const flushInstruction = () => {
    const text = currentInstructionLines.join("\n").trim();
    currentInstructionLines = [];
    if (!text) return;
    params.blocks.push({
      id: `${params.idPrefix}-body-${blockIndex + 1}`,
      type: "instruction",
      data: {
        text,
      },
    });
    blockIndex += 1;
  };

  let cursor = 0;
  while (cursor < lines.length) {
    if (isMarkdownTableBlockStart(lines, cursor)) {
      flushInstruction();
      const tableLines = [lines[cursor] ?? "", lines[cursor + 1] ?? ""];
      cursor += 2;
      while (cursor < lines.length) {
        const nextLine = lines[cursor] ?? "";
        if (!nextLine.trim() || !nextLine.includes("|")) {
          break;
        }
        tableLines.push(nextLine);
        cursor += 1;
      }

      const [headerLine, , ...rowLines] = tableLines;
      const headers = splitMarkdownTableCells(headerLine ?? "");
      const rows = rowLines
        .map((line) => splitMarkdownTableCells(line))
        .filter((row) => row.some((cell) => cell.length > 0));

      if (headers.length > 0 && rows.length > 0) {
        params.blocks.push({
          id: `${params.idPrefix}-table-${blockIndex + 1}`,
          type: "table",
          data: {
            headers,
            rows,
          },
        });
        blockIndex += 1;
      } else {
        currentInstructionLines.push(...tableLines);
      }

      while (cursor < lines.length && !(lines[cursor]?.trim())) {
        cursor += 1;
      }
      continue;
    }

    currentInstructionLines.push(lines[cursor] ?? "");
    cursor += 1;

    if (cursor < lines.length && !(lines[cursor]?.trim())) {
      flushInstruction();
      while (cursor < lines.length && !(lines[cursor]?.trim())) {
        cursor += 1;
      }
    }
  }

  flushInstruction();
}

function createHeaderBlock(title: string, subtitle?: string, eyebrow?: string): DocumentBlock {
  return {
    id: "header",
    type: "header",
    data: {
      title: title.trim(),
      subtitle: subtitle?.trim() || undefined,
      eyebrow: eyebrow?.trim() || undefined,
    },
  };
}

function toQuestionOptions(
  options: Array<{ label?: string | null; text?: string | null; isCorrect?: boolean }> | ExerciseOption[] | null | undefined,
): QuestionOption[] {
  return (options ?? [])
    .map((option) => ({
      label: `${option.label ?? ""}`.trim(),
      text: `${option.text ?? ""}`.trim(),
      isCorrect: Boolean(option.isCorrect),
    }))
    .filter((option) => option.label && option.text);
}

function inferAnswerSpace(questionText: string) {
  const compact = normalizeText(questionText);
  if (compact.length >= 260) return "large" as const;
  if (compact.length >= 140) return "medium" as const;
  return "small" as const;
}

function createQuestionBlocks(
  exercises: Array<{
    id?: string | null;
    exerciseType?: string | null;
    difficulty?: string | number | null;
    questionText: string;
    options?: ExerciseOption[] | Array<{ label?: string | null; text?: string | null; isCorrect?: boolean }> | null;
    correctAnswer?: string | null;
    solutionSteps?: string | null;
    sourceLabel?: string | null;
  }>,
  startNumber = 1,
) {
  const blocks: DocumentBlock[] = [];

  exercises.forEach((exercise, index) => {
    const questionNumber = startNumber + index;
    const normalizedType = `${exercise.exerciseType ?? ""}`.toUpperCase();
    const options = toQuestionOptions(exercise.options);
    const isFillQuestion =
      normalizedType === "FILL_IN" || normalizedType === "FILL";
    const difficultyText: string | null =
      exercise.difficulty == null
        ? null
        : typeof exercise.difficulty === "number"
          ? toExerciseDifficulty(exercise.difficulty)
          : exercise.difficulty;

    const questionBlock: QuestionBlock =
      normalizedType === "MC" && options.length > 0
        ? {
            id: exercise.id?.trim() || `question-${questionNumber}`,
            type: "question",
            data: {
              number: questionNumber,
              stem: normalizeText(exercise.questionText),
              questionType: "mc",
              difficulty: difficultyText,
              options,
              correctAnswer: exercise.correctAnswer ?? null,
              explanation: exercise.solutionSteps ?? null,
              sourceLabel: exercise.sourceLabel ?? null,
            },
          }
        : isFillQuestion
          ? {
              id: exercise.id?.trim() || `question-${questionNumber}`,
              type: "question",
              data: {
                number: questionNumber,
                stem: normalizeText(exercise.questionText),
                questionType: "fill",
                difficulty: difficultyText,
                blanks: [],
                explanation: exercise.solutionSteps ?? null,
                sourceLabel: exercise.sourceLabel ?? null,
              },
            }
        : {
            id: exercise.id?.trim() || `question-${questionNumber}`,
            type: "question",
            data: {
              number: questionNumber,
              stem: normalizeText(exercise.questionText),
              questionType: "frq",
              difficulty: difficultyText,
              answerSpace: inferAnswerSpace(exercise.questionText),
              sampleAnswer: exercise.correctAnswer ?? null,
              explanation: exercise.solutionSteps ?? null,
              sourceLabel: exercise.sourceLabel ?? null,
            },
          };

    blocks.push(questionBlock);

    if (questionBlock.data.questionType === "frq") {
      blocks.push({
        id: `${questionBlock.id}-answer-space`,
        type: "answer-space",
        data: {
          size: questionBlock.data.answerSpace ?? "medium",
          lines:
            questionBlock.data.answerSpace === "large"
              ? 8
              : questionBlock.data.answerSpace === "medium"
                ? 5
                : 3,
        },
      });
    }
  });

  return blocks;
}

function buildWorksheetQuestionSourceLabel(exercise: AssembledWorksheetExercise) {
  return [exercise.sourceFileName, exercise.knowledgeSubskillLabel]
    .filter(Boolean)
    .join(" · ");
}

export function buildWorksheetDocument(params: {
  worksheet: AssembleWorksheetResult["worksheet"];
  exercises: AssembleWorksheetResult["exercises"];
  sections: AssembleWorksheetResult["sections"];
  courseName?: string | null;
  unitName?: string | null;
  includeAnswerKey?: boolean;
  downloadUrl?: string | null;
}): DocumentModel {
  return buildWorksheetDocumentFromRenderInput({
    id: params.worksheet.id,
    title: params.worksheet.title,
    courseName: params.courseName,
    unitName: params.unitName,
    downloadUrl: params.downloadUrl,
    sections: params.sections,
    exercises: params.exercises.map((exercise) => ({
      id: exercise.id,
      exerciseType: exercise.exerciseType,
      difficulty: exercise.difficulty,
      questionText: exercise.questionText,
      options: exercise.options,
      correctAnswer: exercise.correctAnswer,
      solutionSteps: exercise.solutionSteps,
      sourceLabel: buildWorksheetQuestionSourceLabel(exercise),
    })),
  });
}

function buildAssessmentDocumentFromRenderInput(params: {
  documentType: "worksheet" | "exam";
  id: string;
  title: string;
  courseName?: string | null;
  unitName?: string | null;
  downloadUrl?: string | null;
  sections: Array<{ title: string; rationale?: string | null; exerciseIds: string[] }>;
  exercises: Array<{
    id: string;
    exerciseType?: string | null;
    difficulty?: string | number | null;
    questionText: string;
    options?: ExerciseOption[] | Array<{ label?: string | null; text?: string | null; isCorrect?: boolean }> | null;
    correctAnswer?: string | null;
    solutionSteps?: string | null;
    sourceLabel?: string | null;
  }>;
}): DocumentModel {
  const isExam = params.documentType === "exam";
  const blocks: DocumentBlock[] = [
    createHeaderBlock(
      params.title,
      [params.courseName, params.unitName].filter(Boolean).join(" · ") || undefined,
      isExam ? "Exam" : "Worksheet",
    ),
  ];

  let questionNumber = 1;

  params.sections.forEach((section, sectionIndex) => {
    blocks.push({
      id: slugId("section", section.title, sectionIndex),
      type: "section-title",
      data: {
        title: section.title,
        numbering: isExam
          ? `Section ${sectionIndex + 1}`
          : `Part ${String.fromCharCode(65 + sectionIndex)}`,
        subtitle: section.rationale ?? undefined,
      },
    });

    const sectionExercises = section.exerciseIds
      .map((exerciseId) => params.exercises.find((exercise) => exercise.id === exerciseId))
      .filter((exercise): exercise is (typeof params.exercises)[number] => Boolean(exercise));

    blocks.push(...createQuestionBlocks(sectionExercises, questionNumber));
    questionNumber += sectionExercises.length;
  });

  if (params.sections.length === 0) {
    blocks.push(...createQuestionBlocks(params.exercises, 1));
  }

  return {
    id: params.id,
    type: params.documentType,
    title: params.title,
    meta: {
      courseName: params.courseName ?? null,
      unitName: params.unitName ?? null,
      totalPoints: params.exercises.length,
      downloadUrl: params.downloadUrl ?? null,
    },
    blocks,
    layoutConfig: {
      ...DEFAULT_DOCUMENT_LAYOUT,
      showPageNumbers: isExam,
    },
  };
}

export function buildWorksheetDocumentFromRenderInput(params: {
  id: string;
  title: string;
  courseName?: string | null;
  unitName?: string | null;
  downloadUrl?: string | null;
  sections: Array<{ title: string; rationale?: string | null; exerciseIds: string[] }>;
  exercises: Array<{
    id: string;
    exerciseType?: string | null;
    difficulty?: string | number | null;
    questionText: string;
    options?: ExerciseOption[] | Array<{ label?: string | null; text?: string | null; isCorrect?: boolean }> | null;
    correctAnswer?: string | null;
    solutionSteps?: string | null;
    sourceLabel?: string | null;
  }>;
}): DocumentModel {
  return buildAssessmentDocumentFromRenderInput({
    ...params,
    documentType: "worksheet",
  });
}

export function buildExamDocumentFromRenderInput(params: {
  id: string;
  title: string;
  courseName?: string | null;
  unitName?: string | null;
  downloadUrl?: string | null;
  sections: Array<{ title: string; rationale?: string | null; exerciseIds: string[] }>;
  exercises: Array<{
    id: string;
    exerciseType?: string | null;
    difficulty?: string | number | null;
    questionText: string;
    options?: ExerciseOption[] | Array<{ label?: string | null; text?: string | null; isCorrect?: boolean }> | null;
    correctAnswer?: string | null;
    solutionSteps?: string | null;
    sourceLabel?: string | null;
  }>;
}): DocumentModel {
  return buildAssessmentDocumentFromRenderInput({
    ...params,
    documentType: "exam",
  });
}

export function buildWorksheetDocumentFromMarkdown(
  markdown: string,
  title?: string,
): DocumentModel | null {
  const baseDocument = buildExercisesDocumentFromMarkdown(markdown, title);
  if (!baseDocument) return null;

  return {
    ...baseDocument,
    id: slugId("worksheet", title || baseDocument.title, 0),
    type: "worksheet",
    blocks: baseDocument.blocks.map((block, index) =>
      block.type === "header" && index === 0
        ? {
            ...block,
            data: {
              ...block.data,
              eyebrow: "Worksheet",
            },
          }
        : block,
    ),
  };
}

export function buildExamDocumentFromMarkdown(
  markdown: string,
  title?: string,
): DocumentModel | null {
  const baseDocument = buildExercisesDocumentFromMarkdown(markdown, title);
  if (!baseDocument) return null;

  return {
    ...baseDocument,
    id: slugId("exam", title || baseDocument.title, 0),
    type: "exam",
    blocks: baseDocument.blocks.map((block, index) =>
      block.type === "header" && index === 0
        ? {
            ...block,
            data: {
              ...block.data,
              eyebrow: "Exam",
            },
          }
        : block,
    ),
    layoutConfig: {
      ...baseDocument.layoutConfig,
      showPageNumbers: true,
    },
  };
}

export function buildExercisesDocument(params: {
  title: string;
  courseName?: string | null;
  unitName?: string | null;
  questions: Array<{
    id?: string | null;
    exerciseType?: string | null;
    difficulty?: string | number | null;
    questionText: string;
    options?: ExerciseOption[] | Array<{ label?: string | null; text?: string | null; isCorrect?: boolean }> | null;
    correctAnswer?: string | null;
    solutionSteps?: string | null;
    sourceLabel?: string | null;
  }>;
}): DocumentModel {
  return {
    id: slugId("exercises", params.title, 0),
    type: "exercises",
    title: params.title,
    meta: {
      courseName: params.courseName ?? null,
      unitName: params.unitName ?? null,
      totalPoints: params.questions.length,
    },
    blocks: [
      createHeaderBlock(
        params.title,
        [params.courseName, params.unitName].filter(Boolean).join(" · ") || undefined,
        "Exercises",
      ),
      ...createQuestionBlocks(params.questions, 1),
    ],
    layoutConfig: DEFAULT_DOCUMENT_LAYOUT,
  };
}

export function buildExercisesDocumentFromAgentQuestions(params: {
  title: string;
  questions: AgentQuestionBlock[];
}) {
  return buildExercisesDocument({
    title: params.title,
    questions: params.questions.map((question) => ({
      id: question.id,
      exerciseType: question.questionType,
      difficulty: null,
      questionText: question.stem,
      options: question.options?.map((option) => ({
        label: option.key,
        text: option.content,
      })),
      correctAnswer: question.answer ?? null,
      solutionSteps: question.solution ?? null,
      sourceLabel: question.sourceLabel ?? null,
    })),
  });
}

const RUBRIC_LEVEL_FALLBACK = ["优秀", "良好", "达标", "待提升"];

export function buildRubricDocumentFromMock(rubric: MockRubric): DocumentModel {
  const blocks: DocumentBlock[] = [
    createHeaderBlock(rubric.title, undefined, "Rubric"),
  ];

  rubric.dimensions.forEach((dimension, index) => {
    const block: RubricRowBlock = {
      id: dimension.id || `rubric-row-${index + 1}`,
      type: "rubric-row",
      data: {
        dimension: dimension.name,
        description: dimension.description,
        weight: dimension.weight,
        levels: [
          {
            label: rubric.columnLabels?.excellent || RUBRIC_LEVEL_FALLBACK[0],
            score: 4,
            description: dimension.levels.excellent,
          },
          {
            label: rubric.columnLabels?.good || RUBRIC_LEVEL_FALLBACK[1],
            score: 3,
            description: dimension.levels.good,
          },
          {
            label: rubric.columnLabels?.passing || RUBRIC_LEVEL_FALLBACK[2],
            score: 2,
            description: dimension.levels.passing,
          },
          {
            label: rubric.columnLabels?.failing || RUBRIC_LEVEL_FALLBACK[3],
            score: 1,
            description: dimension.levels.failing,
          },
        ].filter((level) => normalizeText(level.description)),
      },
    };
    blocks.push(block);
  });

  return {
    id: rubric.id,
    type: "rubric",
    title: rubric.title,
    meta: {},
    blocks,
    layoutConfig: DEFAULT_DOCUMENT_LAYOUT,
  };
}

export function buildRubricDocumentFromDetail(rubric: RubricDetailPayload): DocumentModel {
  return {
    id: rubric.id,
    type: "rubric",
    title: rubric.title,
    meta: {
      courseName: rubric.course?.name ?? null,
      unitName: rubric.unit ? `Unit ${rubric.unit.unitNumber} · ${rubric.unit.title}` : null,
    },
    blocks: [
      createHeaderBlock(
        rubric.title,
        [rubric.course?.name, rubric.unit ? `Unit ${rubric.unit.unitNumber} · ${rubric.unit.title}` : ""]
          .filter(Boolean)
          .join(" · ") || undefined,
        "Rubric",
      ),
      ...rubric.dimensions.map<RubricRowBlock>((dimension) => ({
        id: dimension.id,
        type: "rubric-row",
        data: {
          dimension: dimension.name,
          description: dimension.description,
          weight: dimension.weight,
          levels: dimension.levels
            .sort((a, b) => b.score - a.score)
            .map((level) => ({
              label: level.level,
              score: level.score,
              description: level.description,
            })),
        },
      })),
    ],
    layoutConfig: DEFAULT_DOCUMENT_LAYOUT,
  };
}

function parseMarkdownTableBlock(lines: string[]) {
  const trimmed = lines.map((line) => line.trim()).filter(Boolean);
  if (trimmed.length < 3) return null;
  if (!trimmed.every((line) => line.startsWith("|") && line.endsWith("|"))) return null;

  const splitRow = (line: string) =>
    line
      .split("|")
      .map((item) => item.trim())
      .filter((_, index, array) => index > 0 && index < array.length - 1);

  const headers = splitRow(trimmed[0]);
  const rows = trimmed.slice(2).map(splitRow);
  if (headers.length === 0 || rows.length === 0) return null;
  return { headers, rows };
}

export function parseRubricMarkdownToMock(rawContent: string): MockRubric | null {
  const lines = normalizeText(rawContent).split("\n");
  const tables: Array<{ headers: string[]; rows: string[][] }> = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      current.push(trimmed);
      continue;
    }
    if (current.length > 0) {
      const parsed = parseMarkdownTableBlock(current);
      if (parsed) tables.push(parsed);
      current = [];
    }
  }
  if (current.length > 0) {
    const parsed = parseMarkdownTableBlock(current);
    if (parsed) tables.push(parsed);
  }

  const table = tables[0];
  if (!table) return null;

  const headers = table.headers.map((header) => header.toLowerCase());
  const dimensionIndex = headers.findIndex((header) => /dimension|维度|criteria|评分/.test(header));
  const weightIndex = headers.findIndex((header) => /weight|权重|分值|points/.test(header));
  const levelIndexes = [
    { key: "excellent", match: /(excellent|优秀|4分|4 分|exemplary)/ },
    { key: "good", match: /(good|良好|3分|3 分|proficient)/ },
    { key: "passing", match: /(passing|达标|及格|2分|2 分|basic|developing)/ },
    { key: "failing", match: /(failing|待提升|不及格|1分|1 分|beginning)/ },
  ].map((item) => ({
    key: item.key,
    index: headers.findIndex((header) => item.match.test(header)),
  }));

  if (dimensionIndex < 0) return null;

  const dimensions = table.rows
    .map((row, index) => ({
      id: `rubric-dimension-${index + 1}`,
      name: row[dimensionIndex]?.trim() || "",
      description: "",
      weight: Number(row[weightIndex]?.replace(/[^0-9.]/g, "") || "0") || 0,
      levels: {
        excellent: row[levelIndexes.find((item) => item.key === "excellent")?.index ?? -1]?.trim() || "",
        good: row[levelIndexes.find((item) => item.key === "good")?.index ?? -1]?.trim() || "",
        passing: row[levelIndexes.find((item) => item.key === "passing")?.index ?? -1]?.trim() || "",
        failing: row[levelIndexes.find((item) => item.key === "failing")?.index ?? -1]?.trim() || "",
      },
    }))
    .filter((dimension) => dimension.name);

  if (dimensions.length === 0) return null;

  const titleMatch = normalizeText(rawContent).match(/^#{1,3}\s+(.+)$/m);
  return {
    id: "rubric-markdown",
    title: titleMatch?.[1]?.trim() || "Rubric",
    dimensions,
    columnLabels: {
      dimension: table.headers[dimensionIndex] || "维度",
      excellent: table.headers[levelIndexes.find((item) => item.key === "excellent")?.index ?? -1] || "优秀",
      good: table.headers[levelIndexes.find((item) => item.key === "good")?.index ?? -1] || "良好",
      passing: table.headers[levelIndexes.find((item) => item.key === "passing")?.index ?? -1] || "达标",
      failing: table.headers[levelIndexes.find((item) => item.key === "failing")?.index ?? -1] || "待提升",
      weight: weightIndex >= 0 ? table.headers[weightIndex] : "分值",
    },
  };
}

export function buildLessonPlanDocumentFromStructured(plan: LessonPlanDocument): DocumentModel {
  const blocks: DocumentBlock[] = [
    createHeaderBlock(
      plan.title,
      [plan.subjectLabel, plan.preferences.durationMinutes ? `${plan.preferences.durationMinutes} 分钟` : ""]
        .filter(Boolean)
        .join(" · ") || undefined,
      "Lesson Plan",
    ),
  ];

  plan.sections.forEach((section) => {
    const stepBlock: LessonStepBlock = {
      id: section.id,
      type: "lesson-step",
      data: {
        title: section.title,
        duration: section.durationMinutes,
        summary: section.summary,
        blocks: section.blocks,
      },
    };
    blocks.push(stepBlock);
  });

  return {
    id: plan.id,
    type: "lesson-plan",
    title: plan.title,
    meta: {
      courseName: plan.subjectLabel,
      duration: plan.preferences.durationMinutes,
    },
    blocks,
    layoutConfig: DEFAULT_DOCUMENT_LAYOUT,
  };
}

export function buildLessonPlanDocumentFromPdfInput(params: {
  id: string;
  lessonPlan: LessonPlanPdfInput;
}): DocumentModel {
  const subtitle = [params.lessonPlan.courseName, params.lessonPlan.unitName]
    .filter(Boolean)
    .join(" · ");
  const durationLabel = params.lessonPlan.totalMinutes
    ? `${params.lessonPlan.totalMinutes} 分钟`
    : "";
  const blocks: DocumentBlock[] = [
    createHeaderBlock(
      params.lessonPlan.title,
      [subtitle, durationLabel].filter(Boolean).join(" · ") || undefined,
      "Lesson Plan",
    ),
  ];

  params.lessonPlan.sections.forEach((section) => {
    const stepBlock: LessonStepBlock = {
      id: section.id,
      type: "lesson-step",
      data: {
        title: section.title,
        duration: section.durationMinutes,
        summary: section.summary,
        blocks: section.blocks,
      },
    };
    blocks.push(stepBlock);
  });

  return {
    id: params.id,
    type: "lesson-plan",
    title: params.lessonPlan.title,
    meta: {
      courseName: params.lessonPlan.courseName ?? null,
      unitName: params.lessonPlan.unitName ?? null,
      duration: params.lessonPlan.totalMinutes ?? null,
    },
    blocks,
    layoutConfig: DEFAULT_DOCUMENT_LAYOUT,
  };
}

const LESSON_PHASE_MAP: Array<{ pattern: RegExp; phase: string }> = [
  { pattern: /目标|objective/i, phase: "goals" },
  { pattern: /导入|warm|hook/i, phase: "warm-up" },
  { pattern: /讲解|核心|instruction|explain/i, phase: "instruction" },
  { pattern: /互动|讨论|practice|activity/i, phase: "practice" },
  { pattern: /评估|总结|closure|assessment/i, phase: "summary" },
  { pattern: /分层|拓展|extension/i, phase: "extension" },
];

export function buildLessonPlanDocumentFromMarkdown(markdown: string): DocumentModel | null {
  const normalized = normalizeText(markdown);
  if (!normalized) return null;

  const titleMatch = normalized.match(/^#\s+(.+)$/m);
  const title = titleMatch?.[1]?.trim() || "教案";
  const blocks: DocumentBlock[] = [createHeaderBlock(title, undefined, "Lesson Plan")];
  const sections = splitSections(normalized);

  sections.forEach((section, index) => {
    const bulletLines = parseBulletLines(section.body);
    const plainBody = section.body
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^[-*•]\s+/.test(line))
      .join("\n");
    const phase = LESSON_PHASE_MAP.find((item) => item.pattern.test(section.title))?.phase;

    if (phase && (bulletLines.length > 0 || plainBody)) {
      blocks.push({
        id: slugId("lesson-step", section.title, index),
        type: "lesson-step",
        data: {
          phase,
          title: section.title,
          summary: plainBody || undefined,
          activities: bulletLines,
        },
      });
      return;
    }

    blocks.push({
      id: slugId("section", section.title, index),
      type: "section-title",
      data: {
        title: section.title,
      },
    });

    if (section.body) {
      blocks.push({
        id: `${slugId("section", section.title, index)}-body`,
        type: "instruction",
        data: {
          text: section.body,
        },
      });
    }
  });

  return {
    id: slugId("lesson-plan", title, 0),
    type: "lesson-plan",
    title,
    meta: {},
    blocks,
    layoutConfig: DEFAULT_DOCUMENT_LAYOUT,
  };
}

export function buildExercisesDocumentFromMarkdown(markdown: string, title?: string) {
  const normalized = normalizeText(markdown);
  if (!normalized) return null;
  const sections = normalized.split(/\n(?=###\s+第\s*\d+\s*题)/g).map((item) => item.trim()).filter(Boolean);
  const questionSections = sections.filter((section) => /^###\s+第\s*\d+\s*题/.test(section));
  if (questionSections.length === 0) return null;

  const summarySection = sections.find((section) => !/^###\s+第\s*\d+\s*题/.test(section)) || "";
  const docTitle = title || summarySection.split("\n")[0]?.trim() || "习题";

  const questions = questionSections.map((section, index) => {
    const lines = section.split("\n").map((line) => line.trim()).filter(Boolean);
    const stemLines: string[] = [];
    const options: QuestionOption[] = [];
    let correctAnswer = "";
    let explanation = "";
    let commonMistakes = "";

    lines.slice(1).forEach((line) => {
      if (/^[A-DＡ-Ｄ][.)、]\s*/.test(line)) {
        const optionMatch = line.match(/^([A-DＡ-Ｄ])[.)、]\s*(.+)$/);
        if (optionMatch) {
          options.push({
            label: optionMatch[1],
            text: optionMatch[2],
          });
        }
        return;
      }
      if (line.startsWith("答案：")) {
        correctAnswer = line.replace(/^答案：/, "").trim();
        return;
      }
      if (line.startsWith("解析：")) {
        explanation = line.replace(/^解析：/, "").trim();
        return;
      }
      if (line.startsWith("常见误区：")) {
        commonMistakes = line.replace(/^常见误区：/, "").trim();
        return;
      }
      stemLines.push(line);
    });

    return {
      id: `markdown-question-${index + 1}`,
      exerciseType: options.length > 0 ? "MC" : "FR",
      questionText: stemLines.join("\n").trim(),
      options,
      correctAnswer: correctAnswer || null,
      solutionSteps: [explanation, commonMistakes ? `常见误区：${commonMistakes}` : ""]
        .filter(Boolean)
        .join("\n"),
      difficulty: null,
    };
  });

  return buildExercisesDocument({
    title: docTitle,
    questions,
  });
}

export function buildNotesDocumentFromMarkdown(
  markdown: string,
  title?: string,
): DocumentModel | null {
  const normalized = normalizeText(markdown);
  if (!normalized) return null;

  const titleMatch = normalized.match(/^#\s+(.+)$/m);
  const resolvedTitle = titleMatch?.[1]?.trim() || title?.trim() || "文档";
  const bodyWithoutTitle = titleMatch
    ? normalized.replace(/^#\s+.+$/m, "").trim()
    : normalized;
  const sections = splitSections(bodyWithoutTitle);
  const blocks: DocumentBlock[] = [createHeaderBlock(resolvedTitle, undefined, "Document")];

  if (sections.length === 0) {
    appendNotesBodyBlocks({
      blocks,
      body: bodyWithoutTitle || normalized,
      idPrefix: slugId("notes", resolvedTitle, 0),
    });
  } else {
    sections.forEach((section, index) => {
      const sectionId = slugId("notes-section", section.title, index);
      blocks.push({
        id: sectionId,
        type: "section-title",
        data: {
          title: section.title,
        },
      });

      if (section.body.trim()) {
        appendNotesBodyBlocks({
          blocks,
          body: section.body.trim(),
          idPrefix: sectionId,
        });
      }
    });
  }

  return {
    id: slugId("notes", resolvedTitle, 0),
    type: "notes",
    title: resolvedTitle,
    meta: {},
    blocks,
    layoutConfig: DEFAULT_DOCUMENT_LAYOUT,
  };
}

export function serializeDocumentToMarkdown(document: DocumentModel) {
  const blocks = document.blocks.map((block) => {
    switch (block.type) {
      case "header":
        return [`# ${block.data.title}`, block.data.subtitle || ""].filter(Boolean).join("\n\n");
      case "section-title":
        return [`## ${block.data.title}`, block.data.subtitle || ""].filter(Boolean).join("\n\n");
      case "instruction":
        return block.data.text.trim();
      case "question":
        if (block.data.questionType === "mc") {
          return [
            `### 第 ${block.data.number ?? ""} 题`.trim(),
            block.data.stem,
            ...block.data.options.map((option) => `${option.label}. ${option.text}`),
            block.data.correctAnswer ? `答案：${block.data.correctAnswer}` : "",
            block.data.explanation ? `解析：${block.data.explanation}` : "",
          ]
            .filter(Boolean)
            .join("\n");
        }
        if (block.data.questionType === "frq") {
          return [
            `### 第 ${block.data.number ?? ""} 题`.trim(),
            block.data.stem,
            block.data.sampleAnswer ? `答案：${block.data.sampleAnswer}` : "",
            block.data.explanation ? `解析：${block.data.explanation}` : "",
          ]
            .filter(Boolean)
            .join("\n");
        }
        return [
          `### 第 ${block.data.number ?? ""} 题`.trim(),
          block.data.stem,
          block.data.questionType === "tf" && block.data.correctAnswer != null
            ? `答案：${block.data.correctAnswer ? "True" : "False"}`
            : "",
          block.data.explanation ? `解析：${block.data.explanation}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      case "rubric-row":
        return [
          `### ${block.data.dimension}`,
          block.data.description || "",
          ...block.data.levels.map((level) =>
            `- ${level.label}${level.score != null ? `（${level.score}）` : ""}：${level.description}`,
          ),
        ]
          .filter(Boolean)
          .join("\n");
      case "lesson-step":
        return [
          `### ${block.data.title}`,
          block.data.summary || "",
          ...(block.data.activities ?? []).map((activity) => `- ${activity}`),
          ...(block.data.materials ?? []).map((material) => `- 材料：${material}`),
          block.data.teacherNotes ? `教师提示：${block.data.teacherNotes}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      case "divider":
        return "---";
      case "answer-space":
        return "";
      case "table":
        return [
          block.data.caption ? `### ${block.data.caption}` : "",
          `| ${block.data.headers.join(" | ")} |`,
          `| ${block.data.headers.map(() => "---").join(" | ")} |`,
          ...block.data.rows.map((row) => `| ${row.join(" | ")} |`),
        ]
          .filter(Boolean)
          .join("\n");
      case "page-break":
        return "<!-- page-break -->";
      default:
        return "";
    }
  });

  return blocks.filter(Boolean).join("\n\n").trim();
}

export function coerceDocumentModel(value: unknown): DocumentModel | null {
  return parseDocumentModel(value);
}
