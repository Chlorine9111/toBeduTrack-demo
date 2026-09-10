import {
  QUESTION_EDITOR_EXERCISE_TYPE_OPTIONS,
  QUESTION_EDITOR_LOW_CONFIDENCE_THRESHOLD,
} from "@/lib/question-bank/editor-constants";
import { preserveMultilineScanText } from "@/lib/pdf-scan/scanned-question-normalizer";
import type {
  QuestionBankAiSearchResult,
  QuestionBankOutlineSection,
  QuestionBankSplitDocument,
  QuestionBankSplitQuestion,
  PersistedQuestionBankSplitDocument,
} from "@/components/main/question-bank/split-editor/types";

export const QUESTION_BANK_SPLIT_EDITOR_STORAGE_KEY =
  "question-bank-split-editor-v3";

let documentCounter = 0;
let questionCounter = 0;

export function sanitizeText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

export function sanitizeMultilineText(value: string | null | undefined) {
  return preserveMultilineScanText(value);
}

export function nextDocumentId() {
  documentCounter += 1;
  return `question-bank-doc-${Date.now()}-${documentCounter}`;
}

export function nextQuestionId() {
  questionCounter += 1;
  return `question-bank-question-${Date.now()}-${questionCounter}`;
}

export function getQuestionTypeLabel(type: QuestionBankSplitQuestion["exerciseType"]) {
  return (
    QUESTION_EDITOR_EXERCISE_TYPE_OPTIONS.find((option) => option.value === type)?.label ??
    "解答题"
  );
}

export function getDifficultyLabel(value: number) {
  if (value <= 1) return "基础";
  if (value === 2) return "常规";
  if (value === 3) return "进阶";
  return "提高";
}

export function buildQuestionPreview(question: Pick<QuestionBankSplitQuestion, "questionText">) {
  const normalized = sanitizeText(question.questionText);
  return normalized.length > 42 ? `${normalized.slice(0, 42)}...` : normalized;
}

export function createQueuedDocument(file: File): QuestionBankSplitDocument {
  return {
    id: nextDocumentId(),
    file,
    sourceFilePath: null,
    fileName: file.name,
    label: file.name.replace(/\.[^.]+$/, ""),
    courseId: "",
    unitId: "",
    curriculumHint: "",
    stage: "",
    subject: "",
    gradeLevel: "",
    textbookVersion: "",
    visibility: "school",
    status: "queued",
    progress: 0,
    progressLabel: "等待处理",
    errorText: "",
    questionCount: 0,
    extractionMode: "",
    analysis: null,
    questions: [],
    fileType: "",
    rejectedCount: 0,
    activeQuestionId: null,
    importBatchId: null,
    importedAt: null,
    lastSavedAt: null,
  };
}

export function normalizeSplitQuestion(
  question: Partial<QuestionBankSplitQuestion>,
): QuestionBankSplitQuestion {
  return {
    id: question.id && question.id.trim() ? question.id : nextQuestionId(),
    exerciseType: question.exerciseType ?? "FR",
    difficulty: Math.min(Math.max(Number(question.difficulty) || 2, 1), 4),
    questionText: sanitizeMultilineText(question.questionText),
    options:
      question.options?.map((option) => ({
        label: option.label,
        text: sanitizeMultilineText(option.text),
        isCorrect: option.isCorrect ?? false,
      })) ?? null,
    correctAnswer: sanitizeMultilineText(question.correctAnswer),
    solutionSteps: sanitizeMultilineText(question.solutionSteps),
    commonMistakes: question.commonMistakes ?? [],
    visibility: question.visibility ?? "school",
    tags: question.tags ?? [],
    stage: question.stage ?? null,
    subject: question.subject ?? null,
    gradeLevel: question.gradeLevel ?? null,
    textbookVersion: question.textbookVersion ?? null,
    knowledgePoints: question.knowledgePoints ?? [],
    reviewFlag: question.reviewFlag ?? null,
    reviewFlagReason: question.reviewFlagReason ?? null,
    sourceKind: question.sourceKind ?? "pdf_scan",
    sourceFileName: question.sourceFileName ?? null,
    sourcePageStart: question.sourcePageStart ?? null,
    sourcePageEnd: question.sourcePageEnd ?? null,
    sourceConfidence: question.sourceConfidence ?? null,
    isLowConfidence:
      question.isLowConfidence ??
      (typeof question.sourceConfidence === "number" &&
      question.sourceConfidence < QUESTION_EDITOR_LOW_CONFIDENCE_THRESHOLD
        ? true
        : false),
    isAiGenerated: question.isAiGenerated ?? false,
    sectionTitle: question.sectionTitle ?? null,
    showSolution: question.showSolution ?? Boolean(sanitizeText(question.solutionSteps)),
  };
}

export function resolveDocumentDefaultsFromQuestions(
  questions: QuestionBankSplitQuestion[],
) {
  return {
    stage: sanitizeText(questions.find((item) => sanitizeText(item.stage))?.stage),
    subject: sanitizeText(questions.find((item) => sanitizeText(item.subject))?.subject),
    gradeLevel: sanitizeText(
      questions.find((item) => sanitizeText(item.gradeLevel))?.gradeLevel,
    ),
    textbookVersion: sanitizeText(
      questions.find((item) => sanitizeText(item.textbookVersion))?.textbookVersion,
    ),
  };
}

export function buildOutlineSections(
  questions: QuestionBankSplitQuestion[],
): QuestionBankOutlineSection[] {
  const grouped = new Map<string, QuestionBankOutlineSection>();

  questions.forEach((question, index) => {
    const pageLabel =
      sanitizeText(question.sectionTitle) ||
      (question.sourcePageStart ? `第 ${question.sourcePageStart} 页` : "题目目录");

    const section = grouped.get(pageLabel) ?? {
      id: pageLabel,
      label: pageLabel,
      items: [],
    };

    section.items.push({
      questionId: question.id,
      title: `第 ${index + 1} 题`,
      content: question.questionText || buildQuestionPreview(question) || "未命名题目",
    });
    grouped.set(pageLabel, section);
  });

  return Array.from(grouped.values());
}

export function toPersistedDocuments(
  documents: QuestionBankSplitDocument[],
): PersistedQuestionBankSplitDocument[] {
  return documents.map(({ file: _file, ...document }) => ({
    ...document,
    file: null,
    status:
      document.status === "completed" || document.status === "failed"
        ? document.status
        : "failed",
    progress:
      document.status === "completed"
        ? document.progress
        : 0,
    progressLabel:
      document.status === "completed"
        ? document.progressLabel
        : "页面刷新后请重新上传原始文档",
    errorText:
      document.status === "completed"
        ? document.errorText
        : "暂存已恢复，但浏览器不会保留原始 PDF。如需重新入库，请重新上传原始文件。",
  }));
}

export function fromPersistedDocuments(
  payload: PersistedQuestionBankSplitDocument[],
) {
  return payload.map((document) => ({
    ...document,
    file: null,
    questions: document.questions.map((question) => normalizeSplitQuestion(question)),
  }));
}

export function normalizeTagList(input: string) {
  return Array.from(
    new Set(
      input
        .split(/[、,，\n]/)
        .map((item) => sanitizeText(item))
        .filter(Boolean),
    ),
  ).slice(0, 20);
}

export function mapAiResultToSplitQuestion(
  item: QuestionBankAiSearchResult,
): QuestionBankSplitQuestion {
  return normalizeSplitQuestion({
    id: nextQuestionId(),
    exerciseType: item.exerciseType,
    difficulty: item.difficulty,
    questionText: item.questionText,
    options: item.options ?? null,
    correctAnswer: item.correctAnswer ?? "",
    solutionSteps: item.solutionSteps ?? "",
    tags: item.tags ?? [],
    stage: item.stage ?? null,
    subject: item.subject ?? null,
    gradeLevel: item.gradeLevel ?? null,
    textbookVersion: item.textbookVersion ?? null,
    knowledgePoints: item.knowledgePoints ?? [],
    reviewFlag: null,
    reviewFlagReason: null,
    sourceKind: item.sourceKind ?? "manual",
    sourceFileName: null,
    sourcePageStart: null,
    sourcePageEnd: null,
    sourceConfidence: null,
    isLowConfidence: false,
    isAiGenerated: true,
  });
}

export function buildDefaultRewriteInstruction(question: QuestionBankSplitQuestion) {
  const knowledgeText =
    question.knowledgePoints && question.knowledgePoints.length > 0
      ? question.knowledgePoints.join("、")
      : "当前知识点";

  return [
    "请保持原学科和核心考点，修正题干与选项表达。",
    `题型保持为${getQuestionTypeLabel(question.exerciseType)}，难度保持在 ${question.difficulty}。`,
    `请补全正确答案和解析，优先围绕 ${knowledgeText}。`,
  ].join("");
}

export function buildReplaceInstruction(question: QuestionBankSplitQuestion) {
  const tags = question.knowledgePoints?.length
    ? `知识点：${question.knowledgePoints.join("、")}。`
    : "";
  return [
    "请找一道可以替换当前题的新题。",
    `参考题型：${getQuestionTypeLabel(question.exerciseType)}。`,
    `参考难度：${question.difficulty}。`,
    tags,
    `参考题干：${sanitizeText(question.questionText).slice(0, 160)}。`,
  ]
    .filter(Boolean)
    .join("");
}

export function buildExportMarkdown(document: QuestionBankSplitDocument) {
  const lines: string[] = [];
  lines.push(`# ${document.label || document.fileName}`);
  lines.push("");
  lines.push(
    [
      document.curriculumHint ? `课程范围：${document.curriculumHint}` : "",
      document.courseId ? `课程ID：${document.courseId}` : "",
      document.unitId ? `单元ID：${document.unitId}` : "",
    ]
      .filter(Boolean)
      .join(" | "),
  );
  lines.push("");

  document.questions.forEach((question, index) => {
    lines.push(`## 第 ${index + 1} 题`);
    lines.push("");
    lines.push(question.questionText || "未填写题干");
    lines.push("");

    if (question.options && question.options.length > 0) {
      question.options.forEach((option) => {
        lines.push(
          `- ${option.label}. ${option.text}${option.isCorrect ? " [正确]" : ""}`,
        );
      });
      lines.push("");
    }

    lines.push(`- 题型：${getQuestionTypeLabel(question.exerciseType)}`);
    lines.push(`- 难度：${question.difficulty}`);
    if (question.knowledgePoints && question.knowledgePoints.length > 0) {
      lines.push(`- 知识点：${question.knowledgePoints.join("、")}`);
    }
    if (sanitizeText(question.correctAnswer)) {
      lines.push(`- 正确答案：${question.correctAnswer}`);
    }
    if (sanitizeText(question.solutionSteps)) {
      lines.push(`- 解析：${question.solutionSteps}`);
    }
    lines.push("");
  });

  return lines.join("\n");
}

export function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function normalizeQuestionForCommit(question: QuestionBankSplitQuestion) {
  const reviewReasons = Array.from(
    new Set(
      [
        question.reviewFlagReason,
        ...(question.isLowConfidence ? ["识别结果需人工复核"] : []),
      ]
        .map((item) => sanitizeText(item))
        .filter(Boolean),
    ),
  );

  return {
    id: question.id,
    questionNumber: Math.max(1, Number(question.sourcePageStart) || 1),
    exerciseType: question.exerciseType,
    difficulty: Math.min(Math.max(Number(question.difficulty) || 2, 1), 4),
    questionText: sanitizeMultilineText(question.questionText),
    options:
      question.exerciseType === "MC"
        ? question.options?.map((option) => ({
            label: option.label,
            text: sanitizeMultilineText(option.text),
            isCorrect: option.isCorrect ?? false,
          })) ?? null
        : null,
    correctAnswer: sanitizeMultilineText(question.correctAnswer),
    solutionSteps: sanitizeMultilineText(question.solutionSteps),
    subject: question.subject ?? null,
    knowledgePoint: question.knowledgePoints?.[0] ?? null,
    confidence: Math.max(
      0,
      Math.min(
        100,
        typeof question.sourceConfidence === "number"
          ? question.sourceConfidence
          : question.isLowConfidence
            ? 68
            : 92,
      ),
    ),
    reviewTier:
      question.reviewFlag === "disputed" || question.isLowConfidence ? "review" : "ready",
    reviewReasons,
    isLowConfidence: question.isLowConfidence,
    sourcePageNumber: question.sourcePageStart ?? null,
    sourceType: "pdf",
    rawQuestionNumber: null,
    linkedFigures: [],
    confidenceSignals: null,
    originalQuestionType: question.exerciseType,
  };
}
