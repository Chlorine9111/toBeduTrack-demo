import {
  buildTaskContextTeacherPrompt,
  stripPreflightClarificationBlock,
  type AgentTaskContext,
  type StoredConversationMessage,
} from "@/lib/agent/chat-shared";
import type {
  WorksheetExercise,
  WorksheetTemplateVariant,
} from "@/lib/pdf/templates/worksheet-template";
import type { AssembleWorksheetResult } from "@/lib/worksheet/assemble";
import { decorateQuestionTextWithFigures } from "@/lib/worksheet/assemble-temp-pool";
import type { TempPoolQuestion } from "@/lib/agent/temp-question-pool";
import { type ExerciseDifficulty, fromExerciseDifficulty, toExerciseDifficulty } from "@/types/exercise";
import type { ParsedIntent } from "@/lib/chat/intent";
import { extractRequestedCount } from "@/lib/text/count-parser";

export type AssessmentArtifactKind = "worksheet" | "exam";

const WORKSHEET_FRIENDLY_PATTERN = /(friendly|轻松|友好|活泼)/i;
const EXAM_OUTPUT_PATTERN =
  /(exam|试卷|考试卷|测验卷|模拟卷|期中卷|期末卷|单元测试|assessment paper)/i;
const PAPER_A4_PATTERN = /(a4|纵向a4)/i;
const PAPER_LETTER_PATTERN = /(letter|美式信纸|us\s*letter)/i;
const CONTINUATION_PATTERN =
  /(继续|接着|沿用|按刚才|按上次|按上一版|基于上次|延续|同一套|save|保存|补充|继续出|再来|刚才那份|刚才那版|上一版|上一份|上轮|刚生成|把刚才|把上次|把上一版|same|continue|follow up|keep the same|revise|rewrite|refine)/i;
const DONT_CARRY_PATTERN =
  /(不要(?:沿用|参考)|不基于上次|忽略(?:前文|上文|之前|上一轮|上次)|重新开始|从头开始|全新)/i;

export function shouldCarryWorksheetConversation(currentPrompt: string) {
  const normalized = currentPrompt.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  if (DONT_CARRY_PATTERN.test(normalized)) return false;
  return CONTINUATION_PATTERN.test(normalized);
}

export function buildExerciseTeacherRequest(
  currentPrompt: string,
  previousMessages: StoredConversationMessage[],
  allowCarryover = shouldCarryWorksheetConversation(currentPrompt),
  taskContext?: Pick<
    AgentTaskContext,
    "curriculum" | "topic" | "count" | "duration" | "scope"
  > | null,
) {
  const normalizedCurrentPrompt = buildTaskContextTeacherPrompt({
    rawPrompt: currentPrompt,
    taskContext,
    includeFields: ["curriculum", "topic", "count", "duration", "scope"],
  });
  const recentUserMessages = allowCarryover
    ? previousMessages
        .filter((item) => item.role === "user")
        .slice(-3)
        .map((item) => stripPreflightClarificationBlock(item.content))
        .filter(Boolean)
    : [];

  return Array.from(
    new Set([...recentUserMessages, normalizedCurrentPrompt].filter(Boolean)),
  ).join("\n");
}

export function inferWorksheetCount(texts: string[]) {
  for (const text of texts) {
    const value = extractRequestedCount(text);
    if (typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 24) {
      return Math.max(2, Math.min(12, value));
    }
  }
  return 4;
}

export function inferWorksheetTemplateVariant(
  texts: string[],
  parsedIntent: ParsedIntent,
): WorksheetTemplateVariant {
  if (parsedIntent.exportParams?.worksheetTemplate === "worksheet-friendly") {
    return "friendly";
  }
  return texts.some((text) => WORKSHEET_FRIENDLY_PATTERN.test(text))
    ? "friendly"
    : "academic";
}

export function inferWorksheetPageSize(texts: string[]) {
  if (texts.some((text) => PAPER_A4_PATTERN.test(text))) return "A4" as const;
  if (texts.some((text) => PAPER_LETTER_PATTERN.test(text))) return "Letter" as const;
  return "A4" as const;
}

export function resolveAssessmentArtifactKind(
  texts: string[],
  parsedIntent: ParsedIntent,
): AssessmentArtifactKind {
  if (parsedIntent.actions.includes("export_exam_pdf")) {
    return "exam";
  }
  return texts.some((text) => EXAM_OUTPUT_PATTERN.test(text))
    ? "exam"
    : "worksheet";
}

export function getAssessmentArtifactPresentation(kind: AssessmentArtifactKind) {
  if (kind === "exam") {
    return {
      kind,
      titleSuffix: "Exam",
      labelZh: "试卷",
      labelEn: "Exam",
      exportToolName: "export_exam_pdf",
      pdfPhaseLabel: "渲染 Exam PDF",
      arrangingPreviewText: "正在流式整理试卷正文，右侧 Canvas 会先显示排版预览。",
      generatingPreviewText: "正在流式生成试卷正文，右侧 Canvas 会直接渲染排版内容。",
      completedPreviewText: "试卷已完成，正在写入当前会话。",
    } as const;
  }

  return {
    kind,
    titleSuffix: "Worksheet",
    labelZh: "练习卷",
    labelEn: "Worksheet",
    exportToolName: "export_worksheet_pdf",
    pdfPhaseLabel: "渲染 Worksheet PDF",
    arrangingPreviewText: "正在流式整理 Worksheet 正文，右侧 Canvas 会先显示排版预览。",
    generatingPreviewText: "正在流式生成 Worksheet 正文，右侧 Canvas 会直接渲染排版内容。",
    completedPreviewText: "Worksheet 已完成，正在写入当前会话。",
  } as const;
}

function clampWorksheetDifficulty(value: string | number | null | undefined): ExerciseDifficulty {
  if (typeof value === "string" && (value === "easy" || value === "medium" || value === "hard")) {
    return value;
  }
  return toExerciseDifficulty(value);
}

export function mapAssembledExercisesToWorksheetExercises(
  exercises: AssembleWorksheetResult["exercises"],
): WorksheetExercise[] {
  return exercises.map((exercise) => ({
    type:
      exercise.exerciseType === "FR" || exercise.exerciseType === "fill_in"
        ? exercise.exerciseType
        : "MC",
    difficulty: clampWorksheetDifficulty(exercise.difficulty),
    questionText: exercise.questionText,
    options: exercise.options ?? undefined,
    correctAnswer: exercise.correctAnswer ?? undefined,
    solutionSteps: exercise.solutionSteps ?? undefined,
  }));
}

export function buildWorksheetAssistantText(params: {
  worksheet: AssembleWorksheetResult["worksheet"];
  exercises: AssembleWorksheetResult["exercises"];
  sections: AssembleWorksheetResult["sections"];
  summary: string;
  semanticQuery: string;
  courseName: string | null;
  unitLabel: string | null;
  downloadUrl: string;
  fileSize: number;
  pageCount: number;
  includeAnswerKey: boolean;
  outputKind?: AssessmentArtifactKind;
  titleOverride?: string | null;
}) {
  const presentation = getAssessmentArtifactPresentation(
    params.outputKind ?? "worksheet",
  );
  const exercisePreviewLines = params.exercises.slice(0, 6).map((exercise, index) => {
    const preview = exercise.questionText.replace(/\s+/g, " ").trim().slice(0, 72);
    const sourceLabel = exercise.sourceFileName ? ` | 来源：${exercise.sourceFileName}` : "";
    return `${index + 1}. ${preview}${preview.length >= 72 ? "…" : ""}${sourceLabel}`;
  });

  const sectionLines =
    params.sections.length > 0
      ? params.sections.map(
          (section, index) =>
            `${index + 1}. ${section.title}（${section.exerciseIds.length} 题）- ${section.rationale}`,
        )
      : ["1. 默认练习区（按语义最接近题排序）"];

  return [
    `## 已从题库组好一套${presentation.labelZh}`,
    "",
    `- 标题：${params.titleOverride?.trim() || params.worksheet.title}`,
    params.courseName ? `- 课程：${params.courseName}` : "",
    params.unitLabel ? `- 单元：${params.unitLabel}` : "",
    `- 题目数：${params.exercises.length}`,
    `- 分组数：${params.sections.length || 1}`,
    `- PDF 页数：${params.pageCount}`,
    `- 文件大小：${(params.fileSize / 1024).toFixed(1)} KB`,
    params.includeAnswerKey ? "- 已附答案页：是" : "- 已附答案页：否",
    "",
    "### 分组说明",
    ...sectionLines,
    "",
    "### 题目预览",
    ...exercisePreviewLines,
    "",
    `### 组卷摘要\n${params.summary}`,
    "",
    `### 检索语义\n${params.semanticQuery}`,
    "",
    "### 导出说明",
    `- PDF 已生成并写入当前会话记录；请在右侧 Canvas 中使用“导出 PDF”获取与当前排版一致的版本。`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function mapTempPoolQuestionsToWorksheetExercises(
  questions: TempPoolQuestion[],
): WorksheetExercise[] {
  return questions.map((question) => ({
    type: question.normalizedType,
    difficulty: clampWorksheetDifficulty(fromExerciseDifficulty(question.difficultyLevel)),
    questionText: decorateQuestionTextWithFigures(question),
    options:
      question.normalizedType === "MC" && question.options.length > 0
        ? question.options.map((option) => ({
            label: option.key,
            text: option.content,
          }))
        : undefined,
  }));
}

export function buildTempPoolQuestionBlock(question: TempPoolQuestion) {
  return {
    id: question.id,
    questionNumber: question.questionNumber,
    questionType: question.questionType,
    title: `第 ${question.questionNumber} 题`,
    stem: question.stem,
    options: question.options,
    knowledgePoint: question.knowledgePoint || undefined,
    sourceLabel: [question.sourceFileName, question.sourcePageNumber ? `第 ${question.sourcePageNumber} 页` : ""]
      .filter(Boolean)
      .join(" · "),
    linkedFigures: question.linkedFigures,
  };
}

export function buildTempPoolWorksheetAssistantText(params: {
  poolLabel: string;
  sourceFileNames: string[];
  selectedQuestions: TempPoolQuestion[];
  sections: Array<{ title: string; rationale: string; questionIds: string[] }>;
  summary: string;
  selectionReasons: string[];
  downloadUrl: string;
  fileSize: number;
  pageCount: number;
  includeAnswerKey: boolean;
  allowedBankFallback: boolean;
  outputKind?: AssessmentArtifactKind;
  titleOverride?: string | null;
}) {
  const presentation = getAssessmentArtifactPresentation(
    params.outputKind ?? "worksheet",
  );
  const previewLines = params.selectedQuestions.map((question, index) => {
    const preview = question.stem.replace(/\s+/g, " ").trim().slice(0, 72);
    const sourceBits = [question.sourceFileName];
    if (question.sourcePageNumber) {
      sourceBits.push(`第 ${question.sourcePageNumber} 页`);
    }
    return `${index + 1}. ${preview}${preview.length >= 72 ? "…" : ""}${sourceBits.length > 0 ? ` | 来源：${sourceBits.join(" · ")}` : ""}`;
  });

  return [
    `## 已根据上传 PDF 临时组好一套${presentation.labelZh}`,
    "",
    params.titleOverride ? `- 标题：${params.titleOverride}` : "",
    `- 临时题池：${params.poolLabel}`,
    params.sourceFileNames.length > 0
      ? `- 来源文件：${params.sourceFileNames.join("、")}`
      : "",
    `- 题目数：${params.selectedQuestions.length}`,
    `- 分组数：${params.sections.length || 1}`,
    `- PDF 页数：${params.pageCount}`,
    `- 文件大小：${(params.fileSize / 1024).toFixed(1)} KB`,
    params.includeAnswerKey ? "- 已附答案页：是" : "- 已附答案页：否",
    params.allowedBankFallback
      ? "- 补题策略：当前允许题库补题"
      : "- 补题策略：仅使用当前 PDF 里的题，不混入题库",
    "",
    "### 分组说明",
    ...(params.sections.length > 0
      ? params.sections.map(
          (section, index) =>
            `${index + 1}. ${section.title}（${section.questionIds.length} 题）- ${section.rationale}`,
        )
      : ["1. 默认题组（按当前 PDF 原始顺序组织）"]),
    "",
    "### 题目预览",
    ...previewLines,
    params.selectionReasons.length > 0 ? "" : "",
    params.selectionReasons.length > 0 ? "### 选题理由" : "",
    ...params.selectionReasons.map((item, index) => `${index + 1}. ${item}`),
    "",
    `### 组卷摘要\n${params.summary}`,
    "",
    "### 导出说明",
    `- PDF 已生成并写入当前会话记录；请在右侧 Canvas 中使用“导出 PDF”获取与当前排版一致的版本。`,
  ]
    .filter(Boolean)
    .join("\n");
}
