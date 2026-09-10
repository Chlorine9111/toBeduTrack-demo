"use client";

import type { AgentTaskContext } from "@/lib/agent/chat-shared";
import type { AgentAttachmentSummary } from "@/lib/agent/preflight";
import type { StructuredScanQuestion } from "@/components/main/scan/ScanStructuredResult";
import {
  MAX_CONTEXT_LENGTH,
  MAX_VISIBLE_QUESTIONS_PER_FILE,
  type InjectScanFileDetail,
  type ScanBatchResult,
  type ScanFileSummary,
  type ScanProcessResponse,
  type ScanSaveFileResponse,
} from "@/components/main/agent/scan-workflow-types";

function truncateText(text: string, max = 120) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function sanitizeQuestionText(text: string | undefined) {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
}

function normalizeStructuredText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toStructuredText(value: unknown): string {
  if (typeof value === "string") return normalizeStructuredText(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value == null) return "";
  if (Array.isArray(value)) {
    return normalizeStructuredText(
      value
        .map((item) => toStructuredText(item))
        .filter(Boolean)
        .join("\n"),
    );
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferred = [
      record.content,
      record.text,
      record.label,
      record.name,
      record.value,
    ]
      .map((item) => toStructuredText(item))
      .filter(Boolean)
      .join("\n");
    if (preferred) return normalizeStructuredText(preferred);
    try {
      return normalizeStructuredText(JSON.stringify(value));
    } catch {
      return "";
    }
  }
  return "";
}

function toSafeText(value: unknown) {
  return sanitizeQuestionText(toStructuredText(value));
}

function toPositiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function scanTextContainsTable(text: string) {
  return /\\begin\{tabular\}|<table[\s>]/i.test(text);
}

export function summarizeOneFile(
  fileName: string,
  response: ScanProcessResponse,
  uploadId?: string,
): ScanFileSummary {
  const questions = response.questions ?? [];
  const stats = response.stats ?? {};
  const total = Number(stats.total ?? questions.length ?? 0);
  const averageConfidence = Math.max(
    0,
    Number(stats.averageConfidence ?? 0) || 0,
  );
  const lowConfidence = Math.max(
    0,
    Number(stats.lowConfidenceCount ?? 0) || 0,
  );
  const byTypeEntries = Object.entries(stats.byType ?? {});
  const byTypeText =
    byTypeEntries.length > 0
      ? byTypeEntries
          .map(([key, value]) => `${key}:${Math.max(0, Number(value) || 0)}`)
          .join(" / ")
      : "未分类";
  const contentKind =
    response.analysis?.contentKind ?? (total > 0 ? "question_set" : "material");
  const analysisReasons =
    response.analysis?.reasons
      ?.map((reason) => toSafeText(reason))
      .filter(Boolean) ?? [];
  const previewText = toStructuredText(response.textPreview);

  if (total <= 0) {
    const preview =
      toSafeText(response.textPreview) ||
      "（未检测到稳定题号，已按资料模式展示）";
    const contextLine = truncateText(preview, 240);
    return {
      uploadId: response.saveResult?.uploadId ?? uploadId,
      fileName,
      contentKind,
      total: 0,
      averageConfidence,
      lowConfidence,
      byTypeText,
      analysisReasons,
      previewText: preview,
      questions: [],
      detailedBlocks: [preview],
      omittedQuestions: 0,
      saveStatus: response.saveResult?.status,
      savedCount: response.saveResult?.savedCount,
      saveMessage: response.saveResult?.message,
      saveCourseLabel: response.saveResult?.courseLabel ?? null,
      saveUnitLabel: response.saveResult?.unitLabel ?? null,
      contextLines: contextLine ? [contextLine] : [],
    };
  }

  const visibleQuestions = questions.slice(0, MAX_VISIBLE_QUESTIONS_PER_FILE);
  const omittedQuestions = Math.max(0, questions.length - visibleQuestions.length);
  const structuredQuestions: StructuredScanQuestion[] = visibleQuestions.map(
    (item, index) => {
      const stem = toStructuredText(item.content) || "（题干为空）";
      const options = item.options
        ? Object.entries(item.options)
            .map(([key, value]) => ({ key, content: toStructuredText(value) }))
            .filter((entry) => Boolean(entry.content))
        : [];
      const subQuestions = item.subQuestions?.length
        ? item.subQuestions
            .map((sub) => ({
              label: toSafeText(sub?.label) || "?",
              content: toStructuredText(sub?.content),
            }))
            .filter((entry) => Boolean(entry.content))
        : [];
      const linkedFigures =
        item.linkedFigures
          ?.map((figure) => toStructuredText(figure))
          .filter(Boolean) ?? [];

      return {
        questionNumber: toPositiveNumber(item.questionNumber, index + 1),
        questionType: toSafeText(item.questionType) || "未分类",
        stem,
        options,
        subQuestions,
        linkedFigures,
        knowledgePoint: toStructuredText(item.knowledgePoint),
        sourceType: toSafeText(item.sourceType),
        confidence: Math.max(0, Number(item.confidence ?? 0) || 0),
      };
    },
  );

  const detailedBlocks = structuredQuestions.map((question) =>
    [
      `【题目 ${question.questionNumber}｜${question.questionType}】`,
      `题干: ${toSafeText(question.stem) || "（题干为空）"}`,
      question.options.length > 0 ? "选项:" : "",
      ...question.options.map(
        (entry) => `  - ${entry.key}. ${toSafeText(entry.content)}`,
      ),
      question.subQuestions.length > 0 ? "子问:" : "",
      ...question.subQuestions.map(
        (entry) => `  - ${entry.label}) ${toSafeText(entry.content)}`,
      ),
      question.linkedFigures.length > 0
        ? `图表: ${question.linkedFigures.join(", ")}`
        : "",
      question.knowledgePoint
        ? `知识点: ${toSafeText(question.knowledgePoint)}`
        : "",
      question.sourceType ? `来源: ${question.sourceType}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  const contextLines = structuredQuestions.map((question) => {
    const content = truncateText(
      toSafeText(question.stem) || "（题干为空）",
      220,
    );
    const options = question.options
      .map(
        (entry) => `${entry.key}. ${truncateText(toSafeText(entry.content), 80)}`,
      )
      .join("；");
    const subQuestions = question.subQuestions
      .map(
        (entry) => `${entry.label}) ${truncateText(toSafeText(entry.content), 80)}`,
      )
      .join("；");
    const figures = question.linkedFigures.join(", ");
    const knowledgeText = question.knowledgePoint
      ? truncateText(toSafeText(question.knowledgePoint), 40)
      : "";

    return [
      `题号 ${question.questionNumber}`,
      `题干: ${content}`,
      options ? `选项: ${options}` : "",
      subQuestions ? `子问: ${subQuestions}` : "",
      figures ? `图表: ${figures}` : "",
      knowledgeText ? `知识点: ${knowledgeText}` : "",
    ]
      .filter(Boolean)
      .join(" | ");
  });

  return {
    uploadId: response.saveResult?.uploadId ?? uploadId,
    fileName,
    contentKind,
    total,
    averageConfidence,
    lowConfidence,
    byTypeText,
    analysisReasons,
    previewText: previewText || detailedBlocks.join("\n"),
    questions: structuredQuestions,
    detailedBlocks,
    omittedQuestions,
    saveStatus: response.saveResult?.status,
    savedCount: response.saveResult?.savedCount,
    saveMessage: response.saveResult?.message,
    saveCourseLabel: response.saveResult?.courseLabel ?? null,
    saveUnitLabel: response.saveResult?.unitLabel ?? null,
    contextLines,
  };
}

export function composeScanBatchResult(
  fileSummaries: ScanFileSummary[],
): ScanBatchResult {
  const totalQuestions = fileSummaries.reduce((sum, item) => sum + item.total, 0);
  const materialFiles = fileSummaries.filter((item) => item.total <= 0).length;
  const autoArchivedQuestions = fileSummaries.reduce((sum, item) => {
    if (item.saveStatus === "saved" || item.saveStatus === "already_saved") {
      return sum + (item.savedCount ?? 0);
    }
    return sum;
  }, 0);
  const displayParts: string[] = [
    `文档解析完成：共 ${fileSummaries.length} 个文件，识别 ${totalQuestions} 道题，资料模式 ${materialFiles} 个文件。`,
  ];
  const summaryParts: string[] = [
    `文档解析完成：共 ${fileSummaries.length} 个文件，识别 ${totalQuestions} 道题，资料模式 ${materialFiles} 个文件。`,
  ];

  if (autoArchivedQuestions > 0) {
    displayParts.push(`已自动归档 ${autoArchivedQuestions} 道题到内容库。`);
    summaryParts.push(`已自动归档 ${autoArchivedQuestions} 道题到内容库。`);
  }

  for (const file of fileSummaries) {
    if (file.total > 0) {
      displayParts.push(
        `【${file.fileName}】题数 ${file.total}，平均置信度 ${file.averageConfidence}，题型分布 ${file.byTypeText}`,
      );
      summaryParts.push(
        `【${file.fileName}】题数 ${file.total}，平均置信度 ${file.averageConfidence}，低置信度 ${file.lowConfidence}，题型分布 ${file.byTypeText}`,
      );
    } else {
      displayParts.push(`【${file.fileName}】未识别到稳定题号，已按资料模式展示。`);
      summaryParts.push(`【${file.fileName}】未识别到稳定题号，按资料模式纳入推理上下文。`);
    }
    if (file.detailedBlocks.length > 0) {
      summaryParts.push(file.total > 0 ? "拆分题目明细：" : "资料摘要：");
      summaryParts.push(...file.detailedBlocks);
      if (file.omittedQuestions > 0) {
        summaryParts.push(
          `... 其余 ${file.omittedQuestions} 道题目已省略（单文件最多展示 ${MAX_VISIBLE_QUESTIONS_PER_FILE} 题）。`,
        );
      }
    }
    if (file.saveStatus === "saved" || file.saveStatus === "already_saved") {
      const placement = [file.saveCourseLabel, file.saveUnitLabel]
        .filter(Boolean)
        .join(" · ");
      const reviewPendingCount = Math.max(0, file.total - (file.savedCount ?? 0));
      const line =
        reviewPendingCount > 0
          ? placement
            ? `【${file.fileName}】已自动归档 ${file.savedCount ?? 0} 道高置信题到内容库（${placement}），其余 ${reviewPendingCount} 道待人工复核。`
            : `【${file.fileName}】已自动归档 ${file.savedCount ?? 0} 道高置信题到内容库，其余 ${reviewPendingCount} 道待人工复核。`
          : placement
            ? `【${file.fileName}】已自动归档 ${file.savedCount ?? 0} 道题到内容库（${placement}）。`
            : `【${file.fileName}】已自动归档 ${file.savedCount ?? 0} 道题到内容库。`;
      displayParts.push(line);
      summaryParts.push(line);
    } else if (file.saveStatus === "requires_review") {
      displayParts.push(
        `【${file.fileName}】拆题已完成，但当前题目结构或置信度不足，建议先人工复核后再归档。`,
      );
      summaryParts.push(
        `【${file.fileName}】拆题已完成，但当前题目结构或置信度不足，建议先人工复核后再归档。`,
      );
    } else if (file.saveStatus === "requires_curriculum") {
      displayParts.push(`【${file.fileName}】已完成拆题，但缺少课程/单元，暂未自动归档。`);
      summaryParts.push(`【${file.fileName}】已完成拆题，但缺少课程/单元，暂未自动归档。`);
    } else if (file.saveStatus === "failed") {
      displayParts.push(`【${file.fileName}】拆题成功，但自动归档失败。`);
      summaryParts.push(`【${file.fileName}】拆题成功，但自动归档失败。`);
    }
    summaryParts.push("");
  }
  displayParts.push("下方已按结构化卡片展示，可继续让我按知识点归类、筛题或生成同类题。");
  summaryParts.push(
    "你可以继续提问，例如：按知识点归类、生成同类题、或抽取某道题详细解析。",
  );

  const contextLines = fileSummaries.flatMap((file) =>
    file.contextLines.map((line) => `[${file.fileName}] ${line}`),
  );
  const contextTextRaw = contextLines.join("\n");
  const contextText =
    contextTextRaw.length > MAX_CONTEXT_LENGTH
      ? `${contextTextRaw.slice(0, MAX_CONTEXT_LENGTH)}\n...（其余题目已截断）`
      : contextTextRaw;

  return {
    displayText: displayParts.join("\n"),
    summaryText: summaryParts.join("\n"),
    contextText,
    totalQuestions,
    files: fileSummaries,
  };
}

export function validateScanFile(file: File) {
  const lowerName = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf");
  const isWord =
    lowerName.endsWith(".doc") ||
    lowerName.endsWith(".docx") ||
    file.type === "application/msword" ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const isSlides = lowerName.endsWith(".ppt") || lowerName.endsWith(".pptx");
  const isText =
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".csv");
  const isSheet = lowerName.endsWith(".xls") || lowerName.endsWith(".xlsx");
  const isImage =
    file.type.startsWith("image/") || /\.(png|jpg|jpeg|webp)$/i.test(lowerName);

  if (!isPdf && !isWord && !isSlides && !isText && !isSheet && !isImage) {
    return "仅支持 PDF/Word/PPT/TXT/表格/图片";
  }
  if (file.size > 20 * 1024 * 1024) {
    return "文件不能超过 20MB";
  }
  return null;
}

export function buildAttachmentSummary(
  scanResult: ScanBatchResult | null,
): AgentAttachmentSummary | null {
  if (!scanResult) return null;

  const fileCount = scanResult.files.length;
  const materialFileCount = scanResult.files.filter((file) => file.total <= 0).length;
  const questionFileCount = scanResult.files.filter((file) => file.total > 0).length;
  const archivedQuestionCount = scanResult.files.reduce((sum, file) => {
    if (file.saveStatus === "saved" || file.saveStatus === "already_saved") {
      return sum + (file.savedCount ?? 0);
    }
    return sum;
  }, 0);
  const hasFigures = scanResult.files.some((file) =>
    file.questions.some((question) => question.linkedFigures.length > 0),
  );
  const hasTables = scanResult.files.some(
    (file) =>
      file.questions.some((question) => {
        if (scanTextContainsTable(question.stem)) return true;
        if (question.options.some((option) => scanTextContainsTable(option.content))) {
          return true;
        }
        return question.subQuestions.some((subQuestion) =>
          scanTextContainsTable(subQuestion.content),
        );
      }) || scanTextContainsTable(file.previewText),
  );

  return {
    fileCount,
    totalQuestions: scanResult.totalQuestions,
    archivedQuestionCount,
    materialFileCount,
    questionFileCount,
    hasFigures,
    hasTables,
    fileNames: scanResult.files.map((file) => file.fileName),
    contentKinds: scanResult.files.map((file) => file.contentKind),
  };
}

export function createFileFromBase64(detail: InjectScanFileDetail) {
  if (!detail.base64 || !detail.fileName) {
    throw new Error("缺少文件内容或文件名");
  }

  const binary = atob(detail.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], detail.fileName, {
    type: detail.mimeType || "application/pdf",
  });
}

export function applySaveResultsToScanBatch(
  scanResult: ScanBatchResult,
  saveFiles: ScanSaveFileResponse[],
) {
  const saveByUploadId = new Map(saveFiles.map((file) => [file.uploadId, file]));
  const updatedFiles = scanResult.files.map((file) => {
    const matched = file.uploadId ? saveByUploadId.get(file.uploadId) : null;
    if (!matched) return file;
    return {
      ...file,
      saveStatus: matched.status,
      savedCount: matched.savedCount,
      saveMessage: matched.message,
      saveCourseLabel: matched.courseLabel,
      saveUnitLabel: matched.unitLabel,
    };
  });

  return composeScanBatchResult(updatedFiles);
}

export function buildAgentModelInput(
  basePrompt: string,
  scanResult: ScanBatchResult | null,
) {
  if (!scanResult?.contextText) {
    return basePrompt;
  }

  return `${basePrompt}

【文档解析摘要】
${scanResult.summaryText}

【题目清单（供推理）】
${scanResult.contextText}`;
}

export function shouldSkipScanArchive(taskContext?: AgentTaskContext) {
  return taskContext?.attachmentMode === "scan_pool_worksheet";
}

export function attachScanContextToTaskContext(
  taskContext: AgentTaskContext | undefined,
  scanResult: ScanBatchResult | null,
): AgentTaskContext | undefined {
  if (!taskContext || !scanResult) return taskContext;

  const attachmentUploadIds = scanResult.files
    .map((file) => file.uploadId)
    .filter((value): value is string => Boolean(value));

  return {
    ...taskContext,
    attachmentUploadIds,
    poolQuestionCount: scanResult.totalQuestions,
  };
}
