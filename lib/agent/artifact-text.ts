function trimText(text: string, maxLength = 100_000) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

const MODEL_INTERNAL_BLOCK_PATTERN = /<(thinking|think)\b[^>]*>[\s\S]*?<\/\1>/gi;
const MODEL_INTERNAL_TAG_PATTERN = /<\/?(thinking|think)\b[^>]*>/gi;

export type ArtifactRenderMode = "markdown" | "plain-text-fallback";

export type NormalizedArtifactRenderableContent = {
  content: string;
  renderMode: ArtifactRenderMode;
  repairApplied: boolean;
};

export function stripModelInternalTags(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u2003]/g, " ")
    .replace(/&emsp;/g, " ")
    .replace(MODEL_INTERNAL_BLOCK_PATTERN, "\n")
    .replace(MODEL_INTERNAL_TAG_PATTERN, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeArtifactSummaryText(text: string, maxLength = 140) {
  const cleaned = stripModelInternalTags(text).replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "";
  }
  return trimText(cleaned, maxLength);
}

function normalizeRenderableWhitespace(text: string) {
  return stripModelInternalTags(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tryParseQuotedJsonString(text: string) {
  const trimmed = text.trim();
  if (trimmed.length < 2) {
    return null;
  }

  const openingQuote = trimmed[0];
  const closingQuote = trimmed[trimmed.length - 1];
  if ((openingQuote !== `"` && openingQuote !== `'`) || openingQuote !== closingQuote) {
    return null;
  }
  if (!trimmed.includes("\\")) {
    return null;
  }

  try {
    const parsed = JSON.parse(openingQuote === `'` ? `"${trimmed.slice(1, -1).replace(/"/g, '\\"')}"` : trimmed);
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function collectEscapeSignals(text: string) {
  return {
    escapedNewlines: (text.match(/\\[nrt]/g) ?? []).length,
    repeatedBackslashes: (text.match(/\\{4,}/g) ?? []).length,
    escapedMath: (text.match(/\\\\(?:\[|\]|\(|\)|begin\b|end\b|[a-z]{2,}(?=[{\s]))/g) ?? []).length,
    realNewlines: (text.match(/\n/g) ?? []).length,
    doubleEscapedMarkdown: (text.match(/\\\\[#*_~`>|]/g) ?? []).length,
  };
}

function shouldDecodeEscapedPayload(text: string) {
  const signals = collectEscapeSignals(text);
  return (
    (signals.escapedNewlines >= 2 && signals.realNewlines === 0) ||
    signals.repeatedBackslashes >= 1 ||
    signals.escapedMath >= 1 ||
    signals.doubleEscapedMarkdown >= 2
  );
}

function decodeEscapedPayload(text: string) {
  let next = text;

  if (!next.includes("\n") && /\\r\\n|\\n|\\r|\\t/.test(next)) {
    next = next
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\n")
      .replace(/\\t/g, "\t");
  }

  if (/\\\\/.test(next)) {
    let collapsed = next;
    for (let index = 0; index < 10; index += 1) {
      const updated = collapsed.replace(/\\\\(?=[\\[\](){}A-Za-z#*_~`>|\-+!$])/g, "\\");
      if (updated === collapsed) break;
      collapsed = updated;
    }
    next = collapsed;
  }

  return next;
}

function shouldFallbackToPlainText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (!/[A-Za-z0-9\u4e00-\u9fff]/.test(trimmed) && /\\{8,}/.test(trimmed)) {
    return true;
  }
  if (/^[\\\s]{12,}$/.test(trimmed)) {
    return true;
  }

  const nonEmptyLines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (nonEmptyLines.length === 0) {
    return false;
  }

  const slashNoiseLines = nonEmptyLines.filter(
    (line) => line.length >= 12 && /^[\\]+$/.test(line),
  ).length;

  return slashNoiseLines >= Math.max(1, Math.ceil(nonEmptyLines.length * 0.4));
}

function isPureSlashNoise(text: string) {
  const trimmed = text.trim();
  return Boolean(trimmed) && !/[A-Za-z0-9\u4e00-\u9fff]/.test(trimmed) && /\\{8,}/.test(trimmed);
}

export function normalizeArtifactRenderableContent(
  text: string | null | undefined,
): NormalizedArtifactRenderableContent {
  const original = `${text ?? ""}`;
  if (!original.trim()) {
    return {
      content: "",
      renderMode: "markdown",
      repairApplied: false,
    };
  }

  const normalizedOriginal = normalizeRenderableWhitespace(original);
  if (isPureSlashNoise(normalizedOriginal)) {
    return {
      content: normalizedOriginal,
      renderMode: "plain-text-fallback",
      repairApplied: false,
    };
  }

  let working = original;
  let repairApplied = false;

  const parsedJsonString = tryParseQuotedJsonString(working);
  if (parsedJsonString && parsedJsonString.trim()) {
    working = parsedJsonString;
    repairApplied = true;
  }

  if (shouldDecodeEscapedPayload(working)) {
    const decoded = decodeEscapedPayload(working);
    if (decoded !== working && decoded.trim()) {
      working = decoded;
      repairApplied = true;
    }
  }

  const content = normalizeRenderableWhitespace(working);
  return {
    content,
    renderMode: shouldFallbackToPlainText(content) ? "plain-text-fallback" : "markdown",
    repairApplied,
  };
}
