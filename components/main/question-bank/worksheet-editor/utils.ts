import type { QuestionBasketItem } from "@/lib/question-bank/basket";
import type { PartnerExerciseType } from "@/lib/partner/types";
import { buildMarkdownContentHtml } from "@/lib/doc-engine/document-article-html";
import type {
  WorksheetEditorDraft,
  WorksheetEditorQuestion,
  WorksheetEditorSection,
  WorksheetQuestionBankItem,
  WorksheetSearchFilters,
} from "@/components/main/question-bank/worksheet-editor/types";

export const QUESTION_BANK_WORKSHEET_EDITOR_STORAGE_KEY =
  "question-bank:worksheet-editor-draft:v1";

export const QUESTION_BANK_WORKSHEET_SOURCE_KIND_OPTIONS = [
  { value: "all", label: "全部来源" },
  { value: "pdf_scan", label: "PDF 拆题" },
  { value: "manual", label: "手动录入" },
  { value: "ai", label: "AI 生成" },
] as const;

export const QUESTION_BANK_WORKSHEET_TYPE_OPTIONS = [
  { value: "all", label: "全部题型" },
  { value: "MC", label: "选择题" },
  { value: "FR", label: "解答题" },
  { value: "fill_in", label: "填空题" },
] as const;

const CHINESE_NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

let sectionCounter = 0;
let questionCounter = 0;
const DEFAULT_WORKSHEET_SECTION_SPECS: Array<{
  id: string;
  order: number;
  type: PartnerExerciseType;
}> = [
  {
    id: "question-bank-default-section-mc",
    order: 0,
    type: "MC",
  },
  {
    id: "question-bank-default-section-fr",
    order: 1,
    type: "FR",
  },
  {
    id: "question-bank-default-section-fill-in",
    order: 2,
    type: "fill_in",
  },
];

export function sanitizeText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

export function nextWorksheetSectionId() {
  sectionCounter += 1;
  return `question-bank-section-${Date.now()}-${sectionCounter}`;
}

export function nextWorksheetQuestionId() {
  questionCounter += 1;
  return `question-bank-worksheet-question-${Date.now()}-${questionCounter}`;
}

export function normalizeTagList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[、,，\n]/)
        .map((item) => sanitizeText(item))
        .filter(Boolean),
    ),
  ).slice(0, 20);
}

export function getQuestionTypeLabel(
  type: PartnerExerciseType,
  isZh = true,
) {
  switch (type) {
    case "MC":
      return isZh ? "选择题" : "Multiple Choice";
    case "fill_in":
      return isZh ? "填空题" : "Fill in the Blank";
    case "TF":
      return isZh ? "判断题" : "True / False";
    case "experiment":
      return isZh ? "实验题" : "Experiment";
    case "proof":
      return isZh ? "证明题" : "Proof";
    case "drawing":
      return isZh ? "作图题" : "Drawing";
    default:
      return isZh ? "解答题" : "Free Response";
  }
}

export function getDifficultyLabel(value: number, isZh = true) {
  if (value <= 1) return isZh ? "基础" : "Basic";
  if (value === 2) return isZh ? "常规" : "Standard";
  if (value === 3) return isZh ? "进阶" : "Advanced";
  return isZh ? "提高" : "Challenge";
}

export function defaultPointsForQuestionType(type: PartnerExerciseType) {
  if (type === "MC") return 4;
  if (type === "fill_in") return 5;
  return 10;
}

export function createEmptySearchFilters(): WorksheetSearchFilters {
  return {
    query: "",
    course: "",
    unit: "",
    difficulty: "",
    cognitiveTask: "",
    exerciseType: "all",
    sourceScope: "all",
  };
}

export function createDefaultSections(isZh = true): WorksheetEditorSection[] {
  return DEFAULT_WORKSHEET_SECTION_SPECS.map((section) => ({
    id: section.id,
    title: buildSectionTitle(section.order, section.type, isZh),
    order: section.order,
  }));
}

export function inferSectionTypeFromTitle(title: string) {
  const normalized = sanitizeText(title).toLowerCase();
  if (normalized.includes("选择") || normalized.includes("multiple choice")) return "MC";
  if (normalized.includes("填空") || normalized.includes("fill in")) return "fill_in";
  return "FR";
}

export function buildSectionTitle(
  index: number,
  type: PartnerExerciseType,
  isZh = true,
) {
  const numeral = CHINESE_NUMERALS[index] ?? `${index + 1}`;
  if (isZh) {
    return `${numeral}、${getQuestionTypeLabel(type, true)}`;
  }
  return `Part ${index + 1}. ${getQuestionTypeLabel(type, false)}`;
}

export function findSectionForQuestionType(
  sections: WorksheetEditorSection[],
  type: PartnerExerciseType,
) {
  const expectedType =
    type === "MC" ? "MC" : type === "fill_in" ? "fill_in" : "FR";
  return (
    sections.find(
      (section) => inferSectionTypeFromTitle(section.title) === expectedType,
    ) ?? null
  );
}

export function ensureSectionForQuestionType(
  sections: WorksheetEditorSection[],
  type: PartnerExerciseType,
) {
  const existing = findSectionForQuestionType(sections, type);
  if (existing) {
    return {
      sectionId: existing.id,
      sections,
    };
  }

  const nextSection: WorksheetEditorSection = {
    id: nextWorksheetSectionId(),
    title: buildSectionTitle(sections.length, type),
    order: sections.length,
  };

  return {
    sectionId: nextSection.id,
    sections: [...sections, nextSection],
  };
}

export function createBlankBlock(
  sectionId: string,
  order: number,
): WorksheetEditorQuestion {
  return {
    id: nextWorksheetQuestionId(),
    exerciseId: `blank-block-${Date.now()}`,
    sectionId,
    order,
    points: 0,
    questionText: "",
    options: null,
    correctAnswer: "",
    solutionSteps: "",
    knowledgePoints: [],
    difficulty: 1,
    questionType: "FR",
    tags: [],
    isModified: false,
    isAiGenerated: false,
    showSolution: false,
    isBlankBlock: true,
    blankContent: "",
    blankHeight: 300,
  };
}

export function createWorksheetQuestionFromItem(
  item: WorksheetQuestionBankItem | QuestionBasketItem,
  sectionId: string,
  order: number,
): WorksheetEditorQuestion {
  return {
    id: nextWorksheetQuestionId(),
    exerciseId: item.id,
    sectionId,
    order,
    points: defaultPointsForQuestionType(item.exerciseType),
    questionText: item.questionText,
    options:
      item.options?.map((option) => ({
        label: option.label,
        text: option.text,
        isCorrect: option.isCorrect ?? false,
      })) ?? null,
    correctAnswer: sanitizeText(item.correctAnswer),
    solutionSteps: sanitizeText(item.solutionSteps),
    knowledgePoints: [...(item.knowledgePoints ?? [])],
    difficulty: Math.max(1, Math.min(4, Math.round(item.difficulty || 2))) as
      | 1
      | 2
      | 3
      | 4,
    questionType: item.exerciseType,
    tags: "tags" in item ? [...(item.tags ?? [])] : [],
    stage: item.stage ?? null,
    subject: item.subject ?? null,
    gradeLevel: item.gradeLevel ?? null,
    textbookVersion: item.textbookVersion ?? null,
    sourceKind: item.sourceKind ?? null,
    isModified: false,
    isAiGenerated:
      "isAiGenerated" in item
        ? Boolean(item.isAiGenerated)
        : item.sourceKind === "manual" && sanitizeText(item.correctAnswer).length === 0,
    showSolution: Boolean(sanitizeText(item.solutionSteps)),
    createdAt: item.createdAt ?? null,
    stimulusImageUrl:
      "stimulusImageUrl" in item ? (item.stimulusImageUrl ?? null) : null,
    stimulusImageScale:
      "stimulusImageUrl" in item && item.stimulusImageUrl ? 0.5 : undefined,
  };
}

export function sortSections(sections: WorksheetEditorSection[]) {
  return [...sections].sort((left, right) => left.order - right.order);
}

export function sortQuestionsForCanvas(
  questions: WorksheetEditorQuestion[],
  sections: WorksheetEditorSection[],
) {
  const sectionOrderMap = new Map(
    sortSections(sections).map((section) => [section.id, section.order]),
  );
  return [...questions].sort((left, right) => {
    const leftSectionOrder = sectionOrderMap.get(left.sectionId) ?? 999;
    const rightSectionOrder = sectionOrderMap.get(right.sectionId) ?? 999;
    if (leftSectionOrder !== rightSectionOrder) {
      return leftSectionOrder - rightSectionOrder;
    }
    return left.order - right.order;
  });
}

export function resequenceQuestions(
  questions: WorksheetEditorQuestion[],
  sections: WorksheetEditorSection[],
) {
  const next = sortQuestionsForCanvas(questions, sections);
  const counters = new Map<string, number>();

  return next.map((question) => {
    const current = counters.get(question.sectionId) ?? 0;
    counters.set(question.sectionId, current + 1);
    return {
      ...question,
      order: current,
    };
  });
}

export function buildWorksheetStats(
  questions: WorksheetEditorQuestion[],
) {
  return questions.reduce(
    (accumulator, question) => {
      // 空白块不计入统计
      if (question.isBlankBlock) return accumulator;
      accumulator.questionCount += 1;
      accumulator.totalPoints += Number(question.points) || 0;
      accumulator.countsByType[question.questionType] =
        (accumulator.countsByType[question.questionType] ?? 0) + 1;
      return accumulator;
    },
    {
      questionCount: 0,
      totalPoints: 0,
      countsByType: {},
    } as {
      questionCount: number;
      totalPoints: number;
      countsByType: Record<string, number>;
    },
  );
}

export function slugifyFilename(value: string) {
  const normalized = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "question-bank-worksheet";
}

export function buildWorksheetMarkdown(params: {
  title: string;
  description: string;
  duration: number;
  sections: WorksheetEditorSection[];
  questions: WorksheetEditorQuestion[];
}) {
  const lines: string[] = [];
  lines.push(`# ${params.title || "组卷稿"}`);
  lines.push("");
  if (sanitizeText(params.description)) {
    lines.push(params.description.trim());
    lines.push("");
  }
  if (params.duration > 0) {
    lines.push(`建议时长：${params.duration} 分钟`);
    lines.push("");
  }

  sortSections(params.sections).forEach((section) => {
    const sectionQuestions = sortQuestionsForCanvas(
      params.questions.filter((question) => question.sectionId === section.id),
      [section],
    );
    if (sectionQuestions.length === 0) return;

    lines.push(`## ${section.title}`);
    lines.push("");

    let questionNumber = 0;
    sectionQuestions.forEach((question) => {
      // 空白块特殊处理
      if (question.isBlankBlock) {
        lines.push(`### 【空白区域】`);
        lines.push("");
        if (sanitizeText(question.blankContent)) {
          lines.push(question.blankContent ?? "");
          lines.push("");
        }
        return;
      }

      questionNumber += 1;
      lines.push(`### 第 ${questionNumber} 题（${question.points} 分）`);
      lines.push("");
      lines.push(question.questionText);
      lines.push("");

      if (question.options && question.options.length > 0) {
        question.options.forEach((option) => {
          lines.push(`- ${option.label}. ${option.text}`);
        });
        lines.push("");
      }

      lines.push(`- 题型：${getQuestionTypeLabel(question.questionType)}`);
      lines.push(`- 难度：${question.difficulty}`);
      if (question.knowledgePoints.length > 0) {
        lines.push(`- 知识点：${question.knowledgePoints.join("、")}`);
      }
      if (sanitizeText(question.correctAnswer)) {
        lines.push(`- 答案：${question.correctAnswer}`);
      }
      if (sanitizeText(question.solutionSteps)) {
        lines.push(`- 解析：${question.solutionSteps}`);
      }
      lines.push("");
    });
  });

  return lines.join("\n");
}

export function buildWorksheetWordHtml(params: {
  title: string;
  description: string;
  duration: number;
  sections: WorksheetEditorSection[];
  questions: WorksheetEditorQuestion[];
  includeAnswerKey?: boolean;
}) {
  const showAnswers = params.includeAnswerKey !== false;
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const sectionHtml = sortSections(params.sections)
    .map((section) => {
      const sectionQuestions = sortQuestionsForCanvas(
        params.questions.filter((question) => question.sectionId === section.id),
        [section],
      );
      if (sectionQuestions.length === 0) return "";

      let questionNumber = 0;
      const questionHtml = sectionQuestions
        .map((question) => {
          // 空白块特殊处理
          if (question.isBlankBlock) {
            const blankText = question.blankContent
              ? `<p>${escapeHtml(question.blankContent)}</p>`
              : `<div style="min-height: ${question.blankHeight ?? 80}mm;">&nbsp;</div>`;
            return `
            <div style="margin: 0 0 20px 0; page-break-inside: avoid;">
              ${blankText}
            </div>
          `;
          }

          questionNumber += 1;
          const optionsHtml = question.options?.length
            ? `<ul>${question.options
                .map(
                  (option) =>
                    `<li>${escapeHtml(option.label)}. ${escapeHtml(option.text)}</li>`,
                )
                .join("")}</ul>`
            : "";

          const knowledgeText = question.knowledgePoints.length
            ? `<p><strong>知识点：</strong>${escapeHtml(
                question.knowledgePoints.join("、"),
              )}</p>`
            : "";

          return `
            <div style="margin: 0 0 20px 0;">
              <p><strong>第 ${questionNumber} 题（${question.points} 分）</strong></p>
              <p>${escapeHtml(question.questionText)}</p>
              ${optionsHtml}
              ${showAnswers ? `<p><strong>答案：</strong>${escapeHtml(question.correctAnswer || "")}</p>` : ""}
              ${showAnswers ? `<p><strong>解析：</strong>${escapeHtml(question.solutionSteps || "")}</p>` : ""}
              ${showAnswers ? knowledgeText : ""}
            </div>
          `;
        })
        .join("");

      return `<section><h2>${escapeHtml(section.title)}</h2>${questionHtml}</section>`;
    })
    .join("");

  return `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(params.title)}</title>
      </head>
      <body style="font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; line-height: 1.7; color: #222;">
        <h1>${escapeHtml(params.title)}</h1>
        ${
          sanitizeText(params.description)
            ? `<p>${escapeHtml(params.description)}</p>`
            : ""
        }
        ${params.duration > 0 ? `<p>建议时长：${params.duration} 分钟</p>` : ""}
        ${sectionHtml}
      </body>
    </html>
  `;
}

function escapeWorksheetHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSafeWorksheetImageUrl(url: string) {
  return (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("/api/") ||
    url.startsWith("data:image/")
  );
}

function buildWorksheetImageHtml(url: string, alt: string) {
  const trimmed = url.trim();
  if (!trimmed || !isSafeWorksheetImageUrl(trimmed)) return "";
  return [
    '<figure class="qb-image-figure">',
    `<img src="${escapeWorksheetHtml(trimmed)}" alt="${escapeWorksheetHtml(alt)}" />`,
    "</figure>",
  ].join("");
}

type WorksheetDrawingStroke = {
  points: Array<{ x: number; y: number }>;
  color: string;
  lineWidth: number;
};

function buildWorksheetDrawingDataUrl(drawingData: string, blankHeight?: number) {
  try {
    const strokes = JSON.parse(drawingData) as WorksheetDrawingStroke[];
    const canvasHeight = Math.max(200, blankHeight ?? 120);
    const paths = strokes
      .filter((stroke) => stroke.color !== "eraser" && stroke.points.length >= 2)
      .map((stroke) => {
        const d = stroke.points
          .map((point, index) => `${index === 0 ? "M" : "L"}${(point.x * 760).toFixed(1)},${point.y.toFixed(1)}`)
          .join(" ");
        return `<path d="${d}" stroke="${escapeWorksheetHtml(stroke.color)}" stroke-width="${stroke.lineWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
      });

    if (paths.length === 0) return null;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 ${canvasHeight}" preserveAspectRatio="xMidYMid meet">${paths.join("")}</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch {
    return null;
  }
}

function resolveWorksheetAnswerSpace(blankHeight?: number) {
  const normalized = Math.max(blankHeight ?? 0, 0);
  if (normalized >= 320) return "large";
  if (normalized >= 180) return "medium";
  return "small";
}

function buildWorksheetLabeledHtml(label: string, markdown: string) {
  const contentHtml = buildMarkdownContentHtml(markdown);
  if (!contentHtml) return "";

  return [
    `<div data-worksheet-meta="${escapeWorksheetHtml(label)}">`,
    `<p><strong>${escapeWorksheetHtml(label)}：</strong></p>`,
    contentHtml,
    "</div>",
  ].join("");
}

function mapWorksheetDifficulty(value: WorksheetEditorQuestion["difficulty"]) {
  if (value <= 1) return "easy";
  if (value >= 3) return "hard";
  return "medium";
}

export function buildWorksheetPdfHtml(params: {
  title: string;
  description: string;
  duration: number;
  sections: WorksheetEditorSection[];
  questions: WorksheetEditorQuestion[];
  includeAnswerKey?: boolean;
  includeExplanations?: boolean;
}) {
  const showAnswers = params.includeAnswerKey !== false;
  const showExplanations = params.includeExplanations !== false;

  let questionNumber = 0;

  const headerHtml = [
    '<section data-section="header">',
    `<h1>${escapeWorksheetHtml(params.title || "组卷稿")}</h1>`,
    sanitizeText(params.description) ? buildMarkdownContentHtml(params.description) : "",
    params.duration > 0 ? `<p>建议时长：${escapeWorksheetHtml(String(params.duration))} 分钟</p>` : "",
    "</section>",
  ]
    .filter(Boolean)
    .join("");

  const sectionsHtml = sortSections(params.sections)
    .map((section, sectionIndex) => {
      const sectionQuestions = sortQuestionsForCanvas(
        params.questions.filter((question) => question.sectionId === section.id),
        [section],
      );
      if (sectionQuestions.length === 0) return "";

      const sectionBody = sectionQuestions
        .map((question) => {
          if (question.isBlankBlock) {
            const drawingImageUrl = question.drawingData
              ? buildWorksheetDrawingDataUrl(question.drawingData, question.blankHeight)
              : null;

            return [
              `<section data-section="blank-${escapeWorksheetHtml(question.id)}">`,
              `<div data-question="blank-${sectionIndex + 1}" data-question-type="blank">`,
              sanitizeText(question.blankContent)
                ? buildMarkdownContentHtml(question.blankContent ?? "")
                : "",
              drawingImageUrl
                ? buildWorksheetImageHtml(drawingImageUrl, "空白区域作图")
                : "",
              `<div data-answer-space="${resolveWorksheetAnswerSpace(question.blankHeight)}" style="min-height: ${Math.max(question.blankHeight ?? 120, 120)}px;"></div>`,
              "</div>",
              "</section>",
            ]
              .filter(Boolean)
              .join("");
          }

          questionNumber += 1;
          const stemHtml = buildMarkdownContentHtml(question.questionText);
          const stimulusImageHtml = question.stimulusImageUrl
            ? buildWorksheetImageHtml(question.stimulusImageUrl, `题目图片 ${questionNumber}`)
            : "";
          const optionsHtml =
            question.questionType === "MC" && question.options?.length
              ? `<ol data-options="true" type="A">${question.options
                  .map((option) => `<li>${buildMarkdownContentHtml(option.text) || `<p>${escapeWorksheetHtml(option.text)}</p>`}</li>`)
                  .join("")}</ol>`
              : "";
          const answerSpaceHtml =
            question.questionType === "FR"
              ? `<div data-answer-space="${resolveWorksheetAnswerSpace(question.blankHeight)}"></div>`
              : "";
          const answerHtml =
            showAnswers && sanitizeText(question.correctAnswer)
              ? buildWorksheetLabeledHtml("答案", question.correctAnswer || "")
              : "";
          const explanationHtml =
            showExplanations && sanitizeText(question.solutionSteps)
              ? `<blockquote>${buildMarkdownContentHtml(question.solutionSteps || "")}</blockquote>`
              : "";

          return [
            `<section data-section="question-${escapeWorksheetHtml(question.id)}">`,
            `<div data-question="${questionNumber}" data-points="${Number(question.points) || 0}" data-difficulty="${mapWorksheetDifficulty(question.difficulty)}" data-question-type="${escapeWorksheetHtml(question.questionType.toLowerCase())}">`,
            `<div class="qb-question-stem"><p><strong>${questionNumber}.</strong></p>${stemHtml}${stimulusImageHtml}</div>`,
            optionsHtml,
            answerSpaceHtml,
            answerHtml,
            explanationHtml,
            "</div>",
            "</section>",
          ]
            .filter(Boolean)
            .join("");
        })
        .join("");

      return [
        `<section data-section="worksheet-section-${sectionIndex + 1}">`,
        `<h2>${escapeWorksheetHtml(section.title)}</h2>`,
        "</section>",
        sectionBody,
      ].join("");
    })
    .join("");

  return `<article data-doc-type="worksheet">${headerHtml}${sectionsHtml}</article>`;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function mergeBasketIntoDraft(
  draft: WorksheetEditorDraft,
  basketItems: QuestionBasketItem[],
) {
  if (basketItems.length === 0) return draft;

  let nextSections = [...draft.sections];
  const existingExerciseIds = new Set(draft.questions.map((question) => question.exerciseId));
  const additions: WorksheetEditorQuestion[] = [];

  basketItems.forEach((item) => {
    if (existingExerciseIds.has(item.id)) return;
    const ensured = ensureSectionForQuestionType(nextSections, item.exerciseType);
    nextSections = ensured.sections;
    const sectionQuestions = draft.questions
      .concat(additions)
      .filter((question) => question.sectionId === ensured.sectionId);
    additions.push(
      createWorksheetQuestionFromItem(
        item,
        ensured.sectionId,
        sectionQuestions.length,
      ),
    );
    existingExerciseIds.add(item.id);
  });

  return {
    ...draft,
    sections: sortSections(nextSections).map((section, index) => ({
      ...section,
      order: index,
    })),
    questions: resequenceQuestions(
      [...draft.questions, ...additions],
      nextSections,
    ),
  };
}

export function createEmptyWorksheetDraft(isZh = true): WorksheetEditorDraft {
  return {
    title: isZh ? "组卷稿" : "Worksheet draft",
    description: "",
    duration: 90,
    sections: createDefaultSections(isZh),
    questions: [],
  };
}

export function buildWorksheetQuestionsForPdf(
  questions: WorksheetEditorQuestion[],
  sections: WorksheetEditorSection[],
) {
  const sorted = sortQuestionsForCanvas(questions, sections);
  let lastSectionId = "";

  return sorted.map((question) => {
    // 如果 section 变了，标记 sectionTitle
    let sectionTitle: string | undefined;
    if (question.sectionId !== lastSectionId) {
      const section = sections.find((s) => s.id === question.sectionId);
      if (section?.title) {
        sectionTitle = section.title;
      }
      lastSectionId = question.sectionId;
    }

    const difficultyLabel =
      question.difficulty <= 1 ? "easy" : question.difficulty >= 3 ? "hard" : "medium";

    return ({
    type:
      question.questionType === "MC" || question.questionType === "fill_in"
        ? question.questionType
        : "FR",
    difficulty: difficultyLabel,
    questionText: question.questionText,
    options:
      question.questionType === "MC"
        ? question.options?.map((option) => ({
            label: option.label,
            text: option.text,
            isCorrect: option.isCorrect ?? false,
          }))
        : undefined,
    correctAnswer: question.correctAnswer || undefined,
    solutionSteps: question.solutionSteps || undefined,
    totalPoints: question.points,
    ...(question.isBlankBlock
      ? {
          isBlankBlock: true,
          blankContent: question.blankContent ?? "",
          blankHeight: question.blankHeight ?? 80,
          drawingData: question.drawingData,
        }
      : {}),
    ...(question.stimulusImageUrl
      ? {
          stimulusImageUrl: question.stimulusImageUrl,
          stimulusImageScale: question.stimulusImageScale ?? 0.5,
        }
      : {}),
    ...(sectionTitle ? { sectionTitle } : {}),
  });
  });
}

/** 中文数字 → 阿拉伯数字（支持"十"到"五十"范围） */
function chineseNumberToArabic(text: string): string {
  const digitMap: Record<string, number> = {
    零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
    六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  };
  // "十五" → 15, "二十" → 20, "二十三" → 23, "十" → 10, "三" → 3
  return text.replace(
    /([一二两三四五六七八九]?十[一二三四五六七八九]?|[一二两三四五六七八九])/g,
    (match) => {
      if (match.length === 1) return String(digitMap[match] ?? match);
      if (match === "十") return "10";
      if (match.startsWith("十")) return String(10 + (digitMap[match[1]] ?? 0));
      if (match.endsWith("十")) return String((digitMap[match[0]] ?? 1) * 10);
      // "二十三" 格式
      return String((digitMap[match[0]] ?? 1) * 10 + (digitMap[match[2]] ?? 0));
    },
  );
}

export function parseAiAssembleRequests(prompt: string) {
  // 先将中文数字转为阿拉伯数字
  const normalized = chineseNumberToArabic(sanitizeText(prompt));
  const results: Array<{ type: PartnerExerciseType | "all"; count: number }> = [];
  const patterns: Array<{ regex: RegExp; type: PartnerExerciseType }> = [
    { regex: /(\d+)\s*(?:道|题).{0,6}(?:选择题|MC)/gi, type: "MC" },
    { regex: /(\d+)\s*(?:道|题).{0,6}(?:解答题|简答题|FR)/gi, type: "FR" },
    { regex: /(\d+)\s*(?:道|题).{0,6}(?:填空题|fill[_ -]?in)/gi, type: "fill_in" },
  ];

  patterns.forEach(({ regex, type }) => {
    for (const match of normalized.matchAll(regex)) {
      const count = Number(match[1] ?? 0);
      if (count > 0) {
        results.push({
          type,
          count: Math.min(count, 50),
        });
      }
    }
  });

  if (results.length > 0) {
    return results;
  }

  const genericCountMatch = normalized.match(/(\d+)\s*(?:道|题)/);
  const genericCount = Math.min(Math.max(Number(genericCountMatch?.[1] ?? 10), 1), 50);
  return [{ type: "all", count: genericCount }];
}

export function buildAiRelatedInstruction(params: {
  prompt: string;
  questionText?: string;
  knowledgePoints?: string[];
  questionType?: PartnerExerciseType;
  difficulty?: number;
}) {
  const pieces = [
    sanitizeText(params.prompt),
    params.questionType ? `题型：${getQuestionTypeLabel(params.questionType)}` : "",
    params.difficulty ? `难度：${params.difficulty}` : "",
    params.knowledgePoints?.length
      ? `知识点：${params.knowledgePoints.join("、")}`
      : "",
    params.questionText ? `参考题：${sanitizeText(params.questionText).slice(0, 160)}` : "",
  ].filter(Boolean);

  return pieces.join("\n");
}
