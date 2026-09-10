"use client";

import type { StructuredScanBatch } from "@/components/main/scan/ScanStructuredResult";
import type {
  DocumentLayoutConfig,
  DocumentModel,
} from "@/lib/doc-engine/block-types";
import {
  extractEmbeddedArtifactPayloads,
  resolveArtifactContentMode,
  type ArtifactRole,
  type ArtifactVariant,
  type ArtifactContentMode,
  type EmbeddedPblArtifactMetadata,
  stripEmbeddedArtifactPayload,
} from "@/lib/agent/artifact-payload";
import {
  type ArtifactIntegrityStatus,
  buildArtifactRenderSnapshot,
  buildLegacyArtifactDocument,
  buildLegacyArtifactHtmlContent,
  type ArtifactRenderSourceStage,
} from "@/lib/agent/artifact-render-snapshot";
import {
  normalizeArtifactRenderableContent,
  sanitizeArtifactSummaryText,
  stripModelInternalTags,
} from "@/lib/agent/artifact-text";
export type { ArtifactMatchCandidate } from "@/lib/agent/artifact-match";
export { areArtifactsLikelySame } from "@/lib/agent/artifact-match";

export type AgentArtifactKind =
  | "lesson-plan"
  | "exam"
  | "worksheet"
  | "rubric"
  | "exercises"
  | "pbl"
  | "research"
  | "scan"
  | "notes";

export type AgentArtifactSourceMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  scanResult?: StructuredScanBatch;
  clarificationQuestion?: unknown;
  includeInModel?: boolean;
};

export type AgentArtifact = {
  id: string;
  artifactKey: string;
  sourceMessageId: string;
  artifactRole?: ArtifactRole;
  artifactVariant?: ArtifactVariant;
  kind: AgentArtifactKind;
  title: string;
  summary: string;
  previewText: string;
  rawContent: string;
  document?: DocumentModel;
  /** SkillDocumentEngine 渲染的原始 HTML（<article data-doc-type="..."> 格式） */
  htmlContent?: string;
  layoutConfig?: DocumentLayoutConfig;
  renderVersion?: number;
  sourceStage?: ArtifactRenderSourceStage;
  integrityStatus?: ArtifactIntegrityStatus;
  contentMode?: ArtifactContentMode;
  scanResult?: StructuredScanBatch;
  pblMetadata?: EmbeddedPblArtifactMetadata;
  order: number;
};

const PBL_PATTERN = /pbl|项目式学习|项目制学习|驱动问题|驱动性问题|项目阶段|project\s*-?\s*based/i;
const PBL_STAGE_PATTERN = /阶段\s*\d+|第\s*\d+[–-]\d+\s*课时|periodStart|stageNumber/i;
const EXAM_PATTERN =
  /exam|试卷|考试卷|测验卷|模拟卷|期中卷|期末卷|阶段测验|单元测试/i;
const WORKSHEET_PATTERN =
  /worksheet|练习卷|作业单|套卷|试卷|组卷摘要|题目预览|PDF 下载|已从题库组好一套试卷|已根据上传 PDF 临时组好一套试卷/i;
const RUBRIC_PATTERN = /rubric|评分标准|评分量表|评价量表|评价标准|评价维度|评分维度|分级描述/i;
const EXERCISE_PATTERN = /题目|试题|题单|练习|选择题|简答题|问答题|解析|答案|frq/i;
const RESEARCH_PATTERN = /来源|出处|参考资料|参考链接|资料摘要|网页深读|http(s)?:\/\//i;
const TABLE_PATTERN = /\|.+\|/;
const NUMBERED_QUESTION_PATTERN = /(^|\n)(\d+[.)]|第[一二三四五六七八九十\d]+题)/g;
const OPTION_PATTERN = /(^|\n)\s*[A-DＡ-Ｄ][.)、]/g;
const LESSON_PLAN_MARKERS = [
  "教学目标",
  "教学重点",
  "教学难点",
  "课堂导入",
  "新课讲授",
  "课堂活动",
  "板书设计",
  "作业布置",
  "课堂总结",
  "时间分配",
  "学情分析",
  "分层任务",
  "课堂结构",
  "全课时间轴",
  "教师备课清单",
  "设计逻辑说明",
];

function normalizeText(text: string) {
  return normalizeArtifactRenderableContent(text).content;
}

function stripMarkdownDecorators(line: string) {
  return line
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[>*-]\s*/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/^\|+|\|+$/g, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHeading(text: string) {
  const match = text.match(/^#{1,6}\s+(.+)$/m);
  return stripMarkdownDecorators(match?.[1] ?? "");
}

function extractParagraphs(text: string) {
  return normalizeText(text)
    .split(/\n{2,}/)
    .map((paragraph) => stripMarkdownDecorators(paragraph))
    .filter((paragraph) => paragraph.length >= 12);
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}


function getFirstMeaningfulLine(text: string) {
  return normalizeText(text)
    .split("\n")
    .map((line) => stripMarkdownDecorators(line))
    .find((line) => line.length >= 8) ?? "";
}

function countMatches(text: string, pattern: RegExp) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  return Array.from(text.matchAll(regex)).length;
}

function looksLikeLessonPlanArtifact(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) return false;

  if (/^#{1,6}\s*.*(教案|lesson\s*plan|mini\s*lesson|micro\s*lesson|微课)/im.test(normalized)) {
    return true;
  }

  const markerHits = LESSON_PLAN_MARKERS.filter((marker) => normalized.includes(marker)).length;
  const minuteBlocks = normalized.match(/\d+\s*分钟/g)?.length ?? 0;
  const timedBlocks = normalized.match(/(?:\d+\s*(?:分钟|min)|\d{1,2}:\d{2})/gi)?.length ?? 0;
  const freeformLessonSignals = [
    /课堂结构[:：]/i,
    /全课时间轴/i,
    /教师备课清单/i,
    /设计逻辑说明/i,
    /exit\s*check/i,
    /teacher\s*moves?/i,
  ].filter((pattern) => pattern.test(normalized)).length;

  return (
    markerHits >= 2 ||
    (markerHits >= 1 && minuteBlocks >= 2) ||
    (freeformLessonSignals >= 2 && timedBlocks >= 3)
  );
}

function detectArtifactKind(text: string): AgentArtifactKind | null {
  const normalized = normalizeText(text);
  if (!normalized || normalized.length < 120) return null;
  const hasWorksheetSignal =
    /(worksheet|练习卷|作业单|组卷摘要|按题库组好一套|按上传题目组好一套)/i.test(normalized);
  const hasExamSignal =
    /(exam|考试卷|测验卷|模拟卷|期中卷|期末卷|阶段测验|单元测试)/i.test(normalized);

  if (
    hasWorksheetSignal &&
    WORKSHEET_PATTERN.test(normalized) &&
    (normalized.includes("### 分组说明") ||
      normalized.includes("### 题目预览") ||
      normalized.includes("PDF 下载："))
  ) {
    return "worksheet";
  }
  if (
    (hasExamSignal || (!hasWorksheetSignal && EXAM_PATTERN.test(normalized))) &&
    (normalized.includes("### 分组说明") ||
      normalized.includes("### 题目预览") ||
      normalized.includes("Section I") ||
      normalized.includes("Section II") ||
      normalized.includes("PDF 下载："))
  ) {
    return "exam";
  }
  if (
    WORKSHEET_PATTERN.test(normalized) &&
    (normalized.includes("### 分组说明") ||
      normalized.includes("### 题目预览") ||
      normalized.includes("PDF 下载："))
  ) {
    return "worksheet";
  }
  return null;
}

function buildScanArtifactSummary(scanResult: StructuredScanBatch, isZh: boolean) {
  const fileNames = scanResult.files.map((file) => file.fileName).filter(Boolean);
  if (isZh) {
    const fileSummary =
      fileNames.length === 0
        ? "已完成文档解析。"
        : fileNames.length === 1
          ? `已完成《${fileNames[0]}》解析。`
          : `已完成 ${fileNames.length} 个文档解析。`;
    return `${fileSummary} 共识别 ${scanResult.totalQuestions} 道题或结构化内容，可在右侧 Canvas 查看完整拆解结果。`;
  }
  const fileSummary =
    fileNames.length === 0
      ? "Document scan complete."
      : fileNames.length === 1
        ? `Scanned "${fileNames[0]}".`
        : `Scanned ${fileNames.length} documents.`;
  return `${fileSummary} Found ${scanResult.totalQuestions} questions or structured items. View full results in Canvas.`;
}

function buildArtifactTitle(kind: AgentArtifactKind, text: string, index: number) {
  const heading = extractHeading(text);
  const fallbackLine = getFirstMeaningfulLine(text);
  const baseTitle = heading || fallbackLine;

  if (baseTitle) {
    return truncateText(baseTitle, 52);
  }

  const label = getArtifactKindLabel(kind);
  return `${label} ${index + 1}`;
}

function buildArtifactSummary(text: string, title: string) {
  const paragraphs = extractParagraphs(text);
  const summary =
    paragraphs.find((paragraph) => paragraph !== title && paragraph.length >= 20) ??
    paragraphs[0] ??
    title;
  return sanitizeArtifactSummaryText(summary, 140);
}

export function buildFallbackArtifactDocument(
  kind: AgentArtifactKind,
  title: string,
  rawContent: string,
) {
  return buildLegacyArtifactDocument(kind, title, rawContent);
}

export function buildArtifactHtmlContent(
  kind: AgentArtifactKind,
  title: string,
  rawContent: string,
) {
  return buildLegacyArtifactHtmlContent(kind, title, rawContent);
}

export function getArtifactKindLabel(kind: AgentArtifactKind, isZh = true) {
  switch (kind) {
    case "lesson-plan":
      return isZh ? "教案" : "Lesson Plan";
    case "exam":
      return isZh ? "试卷" : "Exam";
    case "worksheet":
      return isZh ? "练习卷" : "Worksheet";
    case "rubric":
      return "Rubric";
    case "exercises":
      return isZh ? "试题" : "Exercises";
    case "pbl":
      return isZh ? "PBL 项目" : "PBL Project";
    case "research":
      return isZh ? "资料摘要" : "Research";
    case "scan":
      return isZh ? "文档解析" : "Document Scan";
    case "notes":
      return isZh ? "结构化产物" : "Structured Notes";
    default:
      return isZh ? "产物" : "Artifact";
  }
}

export function getArtifactKindDescription(kind: AgentArtifactKind, isZh = true) {
  switch (kind) {
    case "lesson-plan":
      return isZh ? "完整教案" : "Full lesson plan";
    case "exam":
      return isZh ? "正式试卷" : "Exam paper";
    case "worksheet":
      return isZh ? "可下载练习卷" : "Downloadable worksheet";
    case "rubric":
      return isZh ? "评分量表" : "Scoring rubric";
    case "exercises":
      return isZh ? "试题与解析" : "Questions & solutions";
    case "pbl":
      return isZh ? "PBL 项目方案" : "PBL project plan";
    case "research":
      return isZh ? "带出处的资料整理" : "Research with sources";
    case "scan":
      return isZh ? "结构化扫描结果" : "Structured scan result";
    case "notes":
      return isZh ? "长文结构化内容" : "Structured content";
    default:
      return isZh ? "AI 生成内容" : "AI-generated content";
  }
}

export function deriveArtifactsFromMessages(messages: AgentArtifactSourceMessage[], isZh = true) {
  const artifacts: AgentArtifact[] = [];

  messages.forEach((message, index) => {
    if (
      message.role !== "assistant" ||
      message.clarificationQuestion ||
      message.includeInModel === false
    ) {
      return;
    }

    if (message.scanResult) {
      const fileLabel =
        message.scanResult.files.length === 1
          ? message.scanResult.files[0]?.fileName
          : isZh
            ? `${message.scanResult.files.length} 个文档`
            : `${message.scanResult.files.length} documents`;
      const scanTitle = isZh
        ? `文档解析 · ${fileLabel || "结果"}`
        : `Document Scan · ${fileLabel || "Result"}`;
      artifacts.push({
        id: message.id,
        artifactKey: message.id,
        sourceMessageId: message.id,
        kind: "scan",
        title: scanTitle,
        summary: buildScanArtifactSummary(message.scanResult, isZh),
        previewText: buildScanArtifactSummary(message.scanResult, isZh),
        rawContent: normalizeText(message.content),
        contentMode: "plain-text-fallback",
        scanResult: message.scanResult,
        order: index,
      });
      return;
    }

    // 先在原始内容上检测 Skill HTML 文档（在 strip 之前，否则 HTML 会被过滤掉）
    const rawArticleMatch = message.content.match(
      /<article\s+data-doc-type="([^"]+)"[\s\S]*<\/article>/i,
    );
    if (rawArticleMatch) {
      const docType = rawArticleMatch[1] as AgentArtifactKind;
      const htmlContent = rawArticleMatch[0];
      const plainText = normalizeText(message.content.replace(rawArticleMatch[0], ""));
      const articleTitle = buildArtifactTitle(
        docType,
        plainText || htmlContent,
        artifacts.length,
      );
      const articleSummary = buildArtifactSummary(
        plainText || htmlContent,
        articleTitle,
      );
      artifacts.push({
        id: message.id,
        artifactKey: message.id,
        sourceMessageId: message.id,
        kind: docType,
        title: articleTitle,
        summary: articleSummary,
        previewText: isZh
          ? `已生成「${articleTitle}」的完整内容，点击引用块在右侧 Canvas 查看正文。`
          : `Generated "${articleTitle}". Click the reference block to view in Canvas.`,
        rawContent: plainText || normalizeText(htmlContent),
        htmlContent,
        sourceStage: "persisted",
        contentMode: "html-article",
        order: index,
      });
      return;
    }

    const embeddedArtifacts = extractEmbeddedArtifactPayloads(message.content);
    const visibleContent = stripEmbeddedArtifactPayload(message.content);
    const normalized = normalizeText(visibleContent);

    if (embeddedArtifacts.length > 0) {
      const dedupedEmbeddedArtifacts = embeddedArtifacts.filter((embeddedArtifact, embeddedIndex) => {
        const artifactKey = embeddedArtifact.artifactKey?.trim();
        if (!artifactKey) return true;
        return embeddedArtifacts.findIndex(
          (candidate) => candidate.artifactKey?.trim() === artifactKey,
        ) === embeddedIndex;
      });

      dedupedEmbeddedArtifacts.forEach((embeddedArtifact, embeddedIndex) => {
        const rawContent = normalizeText(embeddedArtifact.rawContent);
        const artifactKey =
          embeddedArtifact.artifactKey?.trim() || `${message.id}:${embeddedIndex}`;
        const title =
          stripModelInternalTags(embeddedArtifact.title).trim() ||
          buildArtifactTitle(embeddedArtifact.kind, rawContent, artifacts.length);
        const summary =
          sanitizeArtifactSummaryText(embeddedArtifact.summary) ||
          buildArtifactSummary(normalized || rawContent, title);
        const snapshot = buildArtifactRenderSnapshot({
          kind: embeddedArtifact.kind,
          title,
          summary,
          rawContent,
          document: embeddedArtifact.document,
          htmlContent: embeddedArtifact.htmlContent,
          layoutConfig: embeddedArtifact.layoutConfig,
          renderVersion: embeddedArtifact.renderVersion,
          sourceStage: embeddedArtifact.sourceStage ?? "persisted",
          sourceMessageId: message.id,
          allowLegacyFallback: true,
        });
        artifacts.push({
          id: artifactKey,
          artifactKey,
          sourceMessageId: message.id,
          artifactRole: embeddedArtifact.artifactRole ?? "primary",
          artifactVariant: embeddedArtifact.artifactVariant ?? "default",
          kind: embeddedArtifact.kind,
          title: snapshot.title,
          summary: snapshot.summary,
          previewText: isZh
            ? `已生成「${snapshot.title}」的完整内容，点击引用块在右侧 Canvas 查看正文。`
            : `Generated "${snapshot.title}". Click the reference block to view in Canvas.`,
          rawContent: snapshot.rawContent,
          document: snapshot.document,
          htmlContent: snapshot.htmlContent,
          layoutConfig: snapshot.layoutConfig,
          renderVersion: snapshot.renderVersion,
          sourceStage: snapshot.sourceStage,
          integrityStatus: snapshot.integrityStatus,
          contentMode:
            embeddedArtifact.contentMode ??
            resolveArtifactContentMode({
              document: snapshot.document,
              htmlContent: snapshot.htmlContent,
              rawContent: snapshot.rawContent,
            }),
          pblMetadata: embeddedArtifact.kind === "pbl" ? embeddedArtifact.metadata : undefined,
          order: index,
        });
      });
      return;
    }

    // HTML article 检测已在 strip 之前完成（上方）

    const kind = detectArtifactKind(normalized);
    if (!kind) return;

    const title = buildArtifactTitle(kind, normalized, artifacts.length);
    const summary = buildArtifactSummary(normalized, title);
    const snapshot = buildArtifactRenderSnapshot({
      kind,
      title,
      summary,
      rawContent: normalized,
      sourceStage: "legacy",
      sourceMessageId: message.id,
      allowLegacyFallback: true,
    });
    artifacts.push({
      id: message.id,
      artifactKey: message.id,
      sourceMessageId: message.id,
      kind,
      title: snapshot.title,
      summary: snapshot.summary,
      previewText: isZh
        ? `已生成「${snapshot.title}」的完整内容，点击引用块在右侧 Canvas 查看正文。`
        : `Generated "${snapshot.title}". Click the reference block to view in Canvas.`,
      rawContent: snapshot.rawContent,
      document: snapshot.document,
      htmlContent: snapshot.htmlContent,
      layoutConfig: snapshot.layoutConfig,
      renderVersion: snapshot.renderVersion,
      sourceStage: snapshot.sourceStage,
      integrityStatus: snapshot.integrityStatus,
      contentMode: resolveArtifactContentMode({
        document: snapshot.document,
        htmlContent: snapshot.htmlContent,
        rawContent: snapshot.rawContent,
      }),
      order: index,
    });
  });

  return artifacts;
}
