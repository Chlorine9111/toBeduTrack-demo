"use client";

import {
  buildFallbackArtifactDocument,
  deriveArtifactsFromMessages,
  type AgentArtifact,
} from "@/components/main/agent/artifact-utils";
import type { StreamingArtifact } from "@/components/main/agent/stream-runner";
import { buildMarkdownOutlineProjectorDocument, buildMarkdownOutlineProjectorMarkdown } from "@/lib/agent/markdown-outline-streaming";
import { buildArtifactRenderSnapshot } from "@/lib/agent/artifact-render-snapshot";
import { resolveArtifactContentMode } from "@/lib/agent/artifact-payload";
import {
  normalizeArtifactRenderableContent,
  sanitizeArtifactSummaryText,
  stripModelInternalTags,
} from "@/lib/agent/artifact-text";
import {
  DEFAULT_DOCUMENT_LAYOUT,
  type DocumentKind,
  type DocumentModel,
} from "@/lib/doc-engine/block-types";
import { parseDocumentModel } from "@/lib/doc-engine/document-schema";

function readRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeText(text: string) {
  return normalizeArtifactRenderableContent(text).content;
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function extractStreamingTextChunks(artifact: StreamingArtifact) {
  const chunks: string[] = [];
  if (artifact.rawContent?.trim()) {
    chunks.push(normalizeText(artifact.rawContent));
  }

  const metaRecord = readRecord(artifact.meta);
  const metaText = firstNonEmptyString(
    metaRecord?.rawContent,
    metaRecord?.markdown,
    metaRecord?.content,
    metaRecord?.text,
  );
  if (metaText) {
    chunks.push(normalizeText(metaText));
  }

  artifact.items.forEach((item) => {
    if (typeof item === "string" && item.trim()) {
      chunks.push(normalizeText(item));
      return;
    }

    const itemRecord = readRecord(item);
    if (!itemRecord) return;
    const itemText = firstNonEmptyString(
      itemRecord.rawContent,
      itemRecord.markdown,
      itemRecord.content,
      itemRecord.text,
    );
    if (itemText) {
      chunks.push(normalizeText(itemText));
    }
  });

  return normalizeText(chunks.join("\n\n"));
}

function resolveStreamingDocumentType(
  artifact: StreamingArtifact,
  documentRecord: Record<string, unknown> | null,
): DocumentKind {
  const candidate = firstNonEmptyString(
    documentRecord?.type,
    documentRecord?.documentType,
    artifact.artifactKind,
  ).toLowerCase();

  switch (candidate) {
    case "worksheet":
    case "exam":
    case "rubric":
    case "lesson-plan":
    case "quiz":
    case "exercises":
    case "notes":
      return candidate;
    case "document":
      return "notes";
    default:
      if (candidate.includes("worksheet")) return "worksheet";
      if (candidate.includes("rubric")) return "rubric";
      if (candidate.includes("lesson")) return "lesson-plan";
      if (candidate.includes("exam")) return "exam";
      if (candidate.includes("quiz")) return "quiz";
      if (candidate.includes("exercise")) return "exercises";
      return "notes";
  }
}

function resolveStreamingDocument(artifact: StreamingArtifact) {
  const directDocument =
    parseDocumentModel(artifact.document) ??
    parseDocumentModel(readRecord(artifact.meta)?.document);
  if (directDocument) return directDocument;

  for (let index = artifact.items.length - 1; index >= 0; index -= 1) {
    const item = artifact.items[index];
    const itemRecord = readRecord(item);
    const parsedDocument =
      parseDocumentModel(itemRecord?.document) ?? parseDocumentModel(item);
    if (parsedDocument) {
      return parsedDocument;
    }
  }

  const metaRecord = readRecord(artifact.meta);
  const documentRecord = readRecord(metaRecord?.document);
  const rawBlocks = artifact.items
    .map((item) => {
      const itemRecord = readRecord(item);
      const blockCandidate = itemRecord?.block ?? item;
      const blockRecord = readRecord(blockCandidate);
      if (!blockRecord) return null;
      if (typeof blockRecord.id !== "string" || typeof blockRecord.type !== "string") {
        return null;
      }
      return blockCandidate;
    })
    .filter((block): block is Exclude<typeof block, null> => Boolean(block));

  if (rawBlocks.length === 0) {
    return null;
  }

  const layoutRecord = readRecord(documentRecord?.layoutConfig);
  const marginRecord = readRecord(layoutRecord?.margins);
  const candidate: DocumentModel = {
    id: firstNonEmptyString(documentRecord?.id, metaRecord?.documentId, artifact.toolCallId),
    type: resolveStreamingDocumentType(artifact, documentRecord),
    title: firstNonEmptyString(documentRecord?.title, artifact.title),
    meta: ((readRecord(documentRecord?.meta) as DocumentModel["meta"] | null) ?? {}),
    blocks: rawBlocks as DocumentModel["blocks"],
    layoutConfig: {
      ...DEFAULT_DOCUMENT_LAYOUT,
      ...layoutRecord,
      margins: {
        ...DEFAULT_DOCUMENT_LAYOUT.margins,
        ...(marginRecord ?? {}),
      },
    },
  };

  return parseDocumentModel(candidate);
}

function resolveStreamingArtifactKind(
  artifact: StreamingArtifact,
  document: DocumentModel | null,
): AgentArtifact["kind"] {
  const candidate = firstNonEmptyString(document?.type, artifact.artifactKind).toLowerCase();
  if (candidate.includes("worksheet")) return "worksheet";
  if (candidate.includes("exam")) return "exam";
  if (candidate.includes("rubric")) return "rubric";
  if (candidate.includes("lesson")) return "lesson-plan";
  if (candidate.includes("exercise") || candidate.includes("quiz")) {
    return "exercises";
  }
  if (candidate.includes("pbl")) return "pbl";
  if (candidate.includes("research")) return "research";
  return "notes";
}

export function buildStreamingArtifactPreview(
  artifact: StreamingArtifact,
  isZh: boolean,
): AgentArtifact | null {
  const projectorMarkdown =
    artifact.projector?.kind === "markdown-outline"
      ? normalizeText(buildMarkdownOutlineProjectorMarkdown(artifact.projector))
      : "";
  const rawContent = projectorMarkdown || extractStreamingTextChunks(artifact);
  const projectorDocumentType = resolveStreamingDocumentType(artifact, null);
  const explicitDocument =
    artifact.projector?.kind === "markdown-outline"
      ? buildMarkdownOutlineProjectorDocument(artifact.projector, {
          documentType: projectorDocumentType,
        }) ?? resolveStreamingDocument(artifact)
      : resolveStreamingDocument(artifact);
  const metaRecord = readRecord(artifact.meta);
  const provisionalKind = resolveStreamingArtifactKind(artifact, explicitDocument);
  const title = firstNonEmptyString(
    artifact.projector?.title,
    metaRecord?.title,
    explicitDocument?.title,
    artifact.title,
  );
  const cleanedTitle = stripModelInternalTags(title).trim();
  const fallbackDocument =
    !explicitDocument && rawContent
      ? buildFallbackArtifactDocument(
          provisionalKind,
          cleanedTitle || (isZh ? "产物（生成中）" : "Artifact (streaming)"),
          rawContent,
        )
      : null;
  const document = explicitDocument ?? fallbackDocument;
  const kind = resolveStreamingArtifactKind(artifact, document);
  const summary =
    sanitizeArtifactSummaryText(
      firstNonEmptyString(
        artifact.projector?.summary,
        metaRecord?.summary,
        artifact.summary,
      ),
    ) ||
    (rawContent
      ? sanitizeArtifactSummaryText(
          truncateText(rawContent.split(/\n{2,}/)[0] || rawContent, 140),
          140,
        )
      : isZh
        ? "正在流式生成，当前为临时预览，正式产物落盘后会自动接管。"
        : "Streaming preview. The persisted artifact will take over when ready.");
  const previewText =
    firstNonEmptyString(
      artifact.projector?.previewText,
      metaRecord?.previewText,
      artifact.previewText,
    ) ||
    (artifact.isComplete
      ? isZh
        ? "流式产物已完成，等待正式 artifact 持久化。"
        : "Streaming artifact complete. Waiting for the persisted artifact."
      : isZh
        ? "正在流式生成，右侧内容为临时预览。"
        : "Streaming in progress. The right-side content is a temporary preview.");
  const snapshot = buildArtifactRenderSnapshot({
    kind,
    title: cleanedTitle || (isZh ? "产物（生成中）" : "Artifact (streaming)"),
    summary,
    rawContent,
    document,
    htmlContent: artifact.htmlContent,
    sourceStage: artifact.isComplete ? "complete" : "streaming",
    sourceMessageId: artifact.artifactKey,
    allowLegacyFallback: true,
  });
  const contentMode =
    artifact.contentMode ??
    resolveArtifactContentMode({
      document: snapshot.document,
      htmlContent: snapshot.htmlContent,
      rawContent: snapshot.rawContent,
    });

  return {
    id: artifact.artifactKey,
    artifactKey: artifact.artifactKey,
    sourceMessageId: artifact.sourceMessageId ?? artifact.artifactKey,
    artifactRole: artifact.artifactRole ?? "primary",
    artifactVariant: artifact.artifactVariant ?? "default",
    kind,
    title: snapshot.title,
    summary: snapshot.summary,
    previewText,
    rawContent: snapshot.rawContent,
    document: snapshot.document,
    htmlContent: snapshot.htmlContent,
    layoutConfig: snapshot.layoutConfig,
    renderVersion: snapshot.renderVersion,
    sourceStage: snapshot.sourceStage,
    integrityStatus: snapshot.integrityStatus,
    contentMode,
    order: Number.MAX_SAFE_INTEGER,
  };
}

export { deriveArtifactsFromMessages };
