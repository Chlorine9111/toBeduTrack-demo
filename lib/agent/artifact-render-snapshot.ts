import {
  buildExamDocumentFromMarkdown,
  buildExercisesDocumentFromMarkdown,
  buildLessonPlanDocumentFromMarkdown,
  buildNotesDocumentFromMarkdown,
  buildRubricDocumentFromMock,
  buildWorksheetDocumentFromMarkdown,
  parseRubricMarkdownToMock,
} from "@/lib/doc-engine/adapters";
import type {
  DocumentLayoutConfig,
  DocumentModel,
} from "@/lib/doc-engine/block-types";
import {
  buildDocumentArticleHtml,
  buildMarkdownArticleHtml,
} from "@/lib/doc-engine/document-article-html";
import {
  assessArtifactIntegrity,
  type ArtifactIntegrityStatus,
} from "@/lib/agent/artifact-integrity";
import { normalizeArtifactRenderableContent } from "@/lib/agent/artifact-text";

export type { ArtifactIntegrityStatus } from "@/lib/agent/artifact-integrity";

export type ArtifactRenderSnapshotKind =
  | "lesson-plan"
  | "exam"
  | "worksheet"
  | "rubric"
  | "exercises"
  | "pbl"
  | "research"
  | "scan"
  | "notes";

export type ArtifactRenderSourceStage =
  | "streaming"
  | "complete"
  | "persisted"
  | "legacy";

export const ARTIFACT_RENDER_VERSION = 1;

export type ArtifactRenderSnapshot = {
  kind: ArtifactRenderSnapshotKind;
  title: string;
  summary: string;
  rawContent: string;
  document?: DocumentModel;
  htmlContent?: string;
  layoutConfig?: DocumentLayoutConfig;
  renderVersion: number;
  sourceStage: ArtifactRenderSourceStage;
  sourceMessageId?: string;
  integrityStatus: ArtifactIntegrityStatus;
  integrityIssues?: string[];
};

function normalizeTrimmedText(value: string | null | undefined) {
  return `${value ?? ""}`.trim();
}

function normalizeArtifactRawContent(value: string | null | undefined) {
  return normalizeArtifactRenderableContent(`${value ?? ""}`).content;
}

export function buildLegacyArtifactDocument(
  kind: ArtifactRenderSnapshotKind,
  title: string,
  rawContent: string,
) {
  const normalizedRawContent = normalizeTrimmedText(rawContent);
  const repairedRawContent = normalizeArtifactRawContent(normalizedRawContent);
  if (!repairedRawContent) {
    return null;
  }

  if (kind === "lesson-plan") {
    return buildLessonPlanDocumentFromMarkdown(repairedRawContent);
  }

  if (kind === "rubric") {
    const parsedRubric = parseRubricMarkdownToMock(repairedRawContent);
    return parsedRubric ? buildRubricDocumentFromMock(parsedRubric) : null;
  }

  if (kind === "exercises") {
    return (
      buildExercisesDocumentFromMarkdown(repairedRawContent, title) ??
      buildNotesDocumentFromMarkdown(repairedRawContent, title)
    );
  }

  if (kind === "exam") {
    return (
      buildExamDocumentFromMarkdown(repairedRawContent, title) ??
      buildNotesDocumentFromMarkdown(repairedRawContent, title)
    );
  }

  if (kind === "worksheet") {
    return (
      buildWorksheetDocumentFromMarkdown(repairedRawContent, title) ??
      buildNotesDocumentFromMarkdown(repairedRawContent, title)
    );
  }

  // research, notes, 以及其他 kind 都用通用 markdown 渲染
  return buildNotesDocumentFromMarkdown(repairedRawContent, title);
}

export function buildLegacyArtifactHtmlContent(
  kind: ArtifactRenderSnapshotKind,
  title: string,
  rawContent: string,
) {
  const normalizedRawContent = normalizeTrimmedText(rawContent);
  const repairedRawContent = normalizeArtifactRawContent(normalizedRawContent);
  if (!repairedRawContent) {
    return undefined;
  }

  const legacyDocument = buildLegacyArtifactDocument(kind, title, repairedRawContent);
  if (legacyDocument) {
    return buildDocumentArticleHtml(legacyDocument) ?? undefined;
  }

  if (kind === "pbl") {
    return buildMarkdownArticleHtml({
      documentType: "pbl",
      markdown: repairedRawContent,
      title,
      eyebrow: "PBL Project",
    });
  }

  return undefined;
}

export function buildArtifactRenderSnapshot(params: {
  kind: ArtifactRenderSnapshotKind;
  title: string;
  summary: string;
  rawContent: string;
  document?: DocumentModel | null;
  htmlContent?: string | null;
  layoutConfig?: DocumentLayoutConfig | null;
  renderVersion?: number | null;
  sourceStage: ArtifactRenderSourceStage;
  sourceMessageId?: string;
  allowLegacyFallback?: boolean;
}) {
  const normalizedHtmlContent = normalizeTrimmedText(params.htmlContent);
  const integrity = assessArtifactIntegrity({
    title: params.title,
    rawContent: normalizeArtifactRawContent(params.rawContent),
    sourceStage: params.sourceStage,
    hasStructuredDocument: Boolean(params.document),
  });
  const normalizedTitle = normalizeTrimmedText(integrity.title || params.title);
  const normalizedRawContent = integrity.rawContent;
  const explicitDocument =
    params.document && normalizedTitle && params.document.title !== normalizedTitle
      ? {
          ...params.document,
          title: normalizedTitle,
        }
      : params.document;
  const resolvedDocument =
    explicitDocument ??
    (params.allowLegacyFallback && integrity.status !== "invalid"
      ? buildLegacyArtifactDocument(params.kind, normalizedTitle, normalizedRawContent)
      : null);
  const resolvedHtmlContent =
    normalizedHtmlContent ||
    (resolvedDocument
      ? buildDocumentArticleHtml(resolvedDocument) ?? undefined
      : params.allowLegacyFallback && integrity.status !== "invalid"
        ? buildLegacyArtifactHtmlContent(params.kind, normalizedTitle, normalizedRawContent)
        : undefined);

  return {
    kind: params.kind,
    title: normalizedTitle,
    summary: params.summary,
    rawContent: normalizedRawContent,
    document: resolvedDocument ?? undefined,
    htmlContent: resolvedHtmlContent,
    layoutConfig: resolvedDocument?.layoutConfig ?? params.layoutConfig ?? undefined,
    renderVersion:
      typeof params.renderVersion === "number" && Number.isFinite(params.renderVersion)
        ? params.renderVersion
        : ARTIFACT_RENDER_VERSION,
    sourceStage: params.sourceStage,
    sourceMessageId: params.sourceMessageId,
    integrityStatus: integrity.status,
    integrityIssues: integrity.issues.length > 0 ? integrity.issues : undefined,
  } satisfies ArtifactRenderSnapshot;
}
