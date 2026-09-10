import type {
  ArtifactRenderSnapshotKind,
  ArtifactRenderSourceStage,
} from "@/lib/agent/artifact-render-snapshot";
import { stripModelInternalTags } from "@/lib/agent/artifact-text";

export type ArtifactMatchCandidate = {
  kind: ArtifactRenderSnapshotKind;
  title: string;
  summary: string;
  rawContent: string;
  sourceStage?: ArtifactRenderSourceStage;
};

function normalizeText(text: string) {
  return stripModelInternalTags(text)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u2003]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildArtifactMatchText(text: string | undefined) {
  return normalizeText(text ?? "").slice(0, 4000);
}

function normalizeArtifactTitleForMatch(title: string | undefined) {
  return buildArtifactMatchText(
    `${title ?? ""}`
      .replace(/[（(]\s*生成中\s*[）)]/gi, "")
      .replace(/[（(]\s*streaming\s*[）)]/gi, "")
      .replace(/\bartifact\s*\(\s*streaming\s*\)/gi, "")
      .replace(/\bdocument\s*\(\s*streaming\s*\)/gi, ""),
  );
}

function isPlaceholderArtifactTitle(title: string | undefined) {
  const normalized = buildArtifactMatchText(title);
  if (!normalized) return false;
  return (
    /生成中/.test(normalized) ||
    /\bstreaming\b/i.test(normalized) ||
    normalized === "产物" ||
    normalized === "artifact" ||
    normalized === "document"
  );
}

export function areArtifactsLikelySame(
  persistedArtifact: ArtifactMatchCandidate,
  candidateArtifact: ArtifactMatchCandidate,
) {
  if (persistedArtifact.kind !== candidateArtifact.kind) return false;

  const persistedRaw = buildArtifactMatchText(persistedArtifact.rawContent);
  const candidateRaw = buildArtifactMatchText(candidateArtifact.rawContent);
  if (persistedRaw && candidateRaw) {
    if (persistedRaw === candidateRaw) {
      return true;
    }

    const comparableLength = Math.min(persistedRaw.length, candidateRaw.length);
    if (
      comparableLength >= 80 &&
      (persistedRaw.startsWith(candidateRaw) || candidateRaw.startsWith(persistedRaw))
    ) {
      return true;
    }
  }

  const persistedTitle = normalizeArtifactTitleForMatch(persistedArtifact.title);
  const candidateTitle = normalizeArtifactTitleForMatch(candidateArtifact.title);
  const titleMatches =
    Boolean(persistedTitle) &&
    Boolean(candidateTitle) &&
    persistedTitle === candidateTitle;
  const persistedSummary = buildArtifactMatchText(persistedArtifact.summary);
  const candidateSummary = buildArtifactMatchText(candidateArtifact.summary);
  const summaryMatches =
    Boolean(persistedSummary) &&
    Boolean(candidateSummary) &&
    persistedSummary === candidateSummary;

  if (titleMatches && summaryMatches) {
    return true;
  }

  const persistedPlaceholder = isPlaceholderArtifactTitle(persistedArtifact.title);
  const candidatePlaceholder = isPlaceholderArtifactTitle(candidateArtifact.title);
  const hasShortPartialRaw =
    (persistedRaw.length > 0 && persistedRaw.length < 48) ||
    (candidateRaw.length > 0 && candidateRaw.length < 48);

  if (summaryMatches && (persistedPlaceholder || candidatePlaceholder || hasShortPartialRaw)) {
    return true;
  }

  return false;
}
