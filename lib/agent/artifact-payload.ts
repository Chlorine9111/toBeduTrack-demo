import type { WebSearchResult } from "@/lib/pbl/types";
import type {
  DocumentLayoutConfig,
  DocumentModel,
} from "@/lib/doc-engine/block-types";
import type {
  ArtifactIntegrityStatus,
  ArtifactRenderSourceStage,
  ArtifactRenderSnapshotKind,
} from "@/lib/agent/artifact-render-snapshot";
import { parseDocumentModel } from "@/lib/doc-engine/document-schema";

export type EmbeddedArtifactKind = ArtifactRenderSnapshotKind;
export type ArtifactContentMode =
  | "structured-document"
  | "html-article"
  | "markdown-html"
  | "plain-text-fallback";
export type ArtifactRole = "primary" | "auxiliary";
export type ArtifactVariant =
  | "default"
  | "answer_key"
  | "exit_ticket"
  | "difficulty_variant";

export type EmbeddedPblArtifactMetadata = {
  planId?: string;
  primarySubject?: string;
  grade?: string;
  curriculumSystem?: string;
  totalPeriods?: number;
  stageCount?: number;
  referenceCount?: number;
  finalOutcomeForm?: string;
  targetAudience?: string;
  coreChallenge?: string;
  searchResults?: WebSearchResult[];
  version?: number;
  updatedAt?: string;
};

export type EmbeddedArtifactPayload = {
  kind: EmbeddedArtifactKind;
  artifactKey?: string;
  artifactRole?: ArtifactRole;
  artifactVariant?: ArtifactVariant;
  contentMode?: ArtifactContentMode;
  title: string;
  summary: string;
  rawContent: string;
  document?: DocumentModel;
  htmlContent?: string;
  layoutConfig?: DocumentLayoutConfig;
  renderVersion?: number;
  sourceStage?: ArtifactRenderSourceStage;
  integrityStatus?: ArtifactIntegrityStatus;
  metadata?: EmbeddedPblArtifactMetadata;
};

const ARTIFACT_MARKER_PATTERN = /<!--\s*DESKMATE_ARTIFACT:([A-Za-z0-9_-]+)\s*-->/g;

function normalizeArtifactKey(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

export function normalizeArtifactContentMode(value: unknown): ArtifactContentMode | undefined {
  switch (value) {
    case "structured-document":
    case "html-article":
    case "markdown-html":
    case "plain-text-fallback":
      return value;
    default:
      return undefined;
  }
}

export function normalizeArtifactRole(value: unknown): ArtifactRole | undefined {
  switch (value) {
    case "primary":
    case "auxiliary":
      return value;
    default:
      return undefined;
  }
}

export function normalizeArtifactVariant(value: unknown): ArtifactVariant | undefined {
  switch (value) {
    case "default":
    case "answer_key":
    case "exit_ticket":
    case "difficulty_variant":
      return value;
    default:
      return undefined;
  }
}

export function resolveArtifactContentMode(params: {
  document?: unknown;
  htmlContent?: string | null;
  rawContent?: string | null;
}): ArtifactContentMode {
  if (params.document) {
    return "structured-document";
  }

  if (typeof params.htmlContent === "string" && params.htmlContent.trim()) {
    return /<article\b/i.test(params.htmlContent) ? "html-article" : "markdown-html";
  }

  if (typeof params.rawContent === "string" && params.rawContent.trim()) {
    return "plain-text-fallback";
  }

  return "plain-text-fallback";
}

function toBase64Url(text: string) {
  if (typeof window === "undefined" && typeof Buffer !== "undefined") {
    return Buffer.from(text, "utf8").toString("base64url");
  }

  if (typeof Buffer !== "undefined") {
    try {
      return Buffer.from(text, "utf8").toString("base64url");
    } catch {
      // Fall through to the browser-safe encoder below.
    }
  }

  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(encoded: string) {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded =
    normalized.length % 4 === 0 ? normalized : normalized.padEnd(normalized.length + (4 - (normalized.length % 4)), "=");

  if (typeof Buffer !== "undefined") {
    return Buffer.from(padded, "base64").toString("utf8");
  }

  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function embedArtifactPayloads(visibleText: string, payloads: EmbeddedArtifactPayload[]) {
  const markers = payloads
    .filter((payload) => Boolean(payload))
    .map((payload) => `<!-- DESKMATE_ARTIFACT:${toBase64Url(JSON.stringify(payload))} -->`);
  const normalizedVisibleText = visibleText.trim();
  const markerText = markers.join("\n");
  return normalizedVisibleText
    ? markerText
      ? `${normalizedVisibleText}\n\n${markerText}`
      : normalizedVisibleText
    : markerText;
}

export function embedArtifactPayload(visibleText: string, payload: EmbeddedArtifactPayload) {
  return embedArtifactPayloads(visibleText, [payload]);
}

function parseEmbeddedArtifactPayload(encoded: string): EmbeddedArtifactPayload | null {
  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as EmbeddedArtifactPayload;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.kind || !parsed.title || !parsed.rawContent) return null;
    const document = parsed.document ? parseDocumentModel(parsed.document) : null;
    const htmlContent =
      typeof parsed.htmlContent === "string" && parsed.htmlContent.trim()
        ? parsed.htmlContent
        : undefined;
    const layoutConfig =
      parsed.layoutConfig &&
      typeof parsed.layoutConfig === "object" &&
      !Array.isArray(parsed.layoutConfig)
        ? (parsed.layoutConfig as DocumentLayoutConfig)
        : undefined;
    const renderVersion =
      typeof parsed.renderVersion === "number" && Number.isFinite(parsed.renderVersion)
        ? parsed.renderVersion
        : undefined;
    const sourceStage =
      parsed.sourceStage === "streaming" ||
      parsed.sourceStage === "complete" ||
      parsed.sourceStage === "persisted" ||
      parsed.sourceStage === "legacy"
        ? parsed.sourceStage
        : undefined;
    const integrityStatus =
      parsed.integrityStatus === "streaming" ||
      parsed.integrityStatus === "complete" ||
      parsed.integrityStatus === "repaired" ||
      parsed.integrityStatus === "invalid"
        ? parsed.integrityStatus
        : undefined;
    return {
      ...parsed,
      artifactKey: normalizeArtifactKey(parsed.artifactKey),
      artifactRole: normalizeArtifactRole(parsed.artifactRole) ?? "primary",
      artifactVariant: normalizeArtifactVariant(parsed.artifactVariant) ?? "default",
      contentMode:
        normalizeArtifactContentMode(parsed.contentMode) ??
        resolveArtifactContentMode({
          document,
          htmlContent,
          rawContent: parsed.rawContent,
        }),
      document: document ?? undefined,
      htmlContent,
      layoutConfig,
      renderVersion,
      sourceStage,
      integrityStatus,
    };
  } catch {
    return null;
  }
}

export function extractEmbeddedArtifactPayloads(content: string): EmbeddedArtifactPayload[] {
  return Array.from(content.matchAll(ARTIFACT_MARKER_PATTERN))
    .map((match) => parseEmbeddedArtifactPayload(match[1]))
    .filter((payload): payload is EmbeddedArtifactPayload => Boolean(payload));
}

export function extractEmbeddedArtifactPayload(content: string): EmbeddedArtifactPayload | null {
  const payloads = extractEmbeddedArtifactPayloads(content);
  return payloads[payloads.length - 1] ?? null;
}

// 完整闭合的 article 块
const HTML_ARTICLE_CLOSED_PATTERN = /<article\s+data-doc-type="[^"]*"[\s\S]*?<\/article>/gi;
// 未闭合的 article 块（流式输出时标签不完整）
const HTML_ARTICLE_OPEN_PATTERN = /<article\s+data-doc-type="[^"]*"[\s\S]*$/gi;
// 散落的 HTML 标签（tool result 中间态）
const HTML_TAG_HEAVY_PATTERN = /(?:<(?:section|div|table|thead|tbody|tr|th|td|ol)\b[^>]*>[\s\S]*){5,}/gi;

export function stripEmbeddedArtifactPayload(content: string) {
  return content
    .replace(ARTIFACT_MARKER_PATTERN, "")
    .replace(HTML_ARTICLE_CLOSED_PATTERN, "")
    .replace(HTML_ARTICLE_OPEN_PATTERN, "")
    .replace(HTML_TAG_HEAVY_PATTERN, "")
    .trim();
}
