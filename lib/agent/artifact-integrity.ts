export type ArtifactIntegrityStatus =
  | "streaming"
  | "complete"
  | "repaired"
  | "invalid";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[`*_~#()[\]{}<>.,:;!?'"“”‘’/\\-]+/g, "")
    .trim();
}

function dedupeTrailingWord(value: string) {
  const tokens = value.trim().split(/\s+/);
  if (tokens.length < 2) return value.trim();
  const last = normalizeToken(tokens[tokens.length - 1] ?? "");
  const previous = normalizeToken(tokens[tokens.length - 2] ?? "");
  if (!last || !previous || last !== previous) {
    return value.trim();
  }
  return tokens.slice(0, -1).join(" ").trim();
}

function stripDanglingMarkdownSuffix(value: string) {
  let next = value.trimEnd();
  const danglingSuffixes = [
    /\*\*$/,
    /__$/,
    /~~$/,
    /[*_`~]$/,
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of danglingSuffixes) {
      if (pattern.test(next)) {
        next = next.replace(pattern, "").trimEnd();
        changed = true;
      }
    }
  }

  return next;
}

export function sanitizeArtifactTitle(title: string) {
  const normalized = `${title ?? ""}`.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";
  const stripped = normalized
    .replace(/^[#>*\-\d.)\s]+/, "")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .replace(/[*_`~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return dedupeTrailingWord(stripped);
}

export function repairArtifactMarkdown(markdown: string) {
  const normalized = `${markdown ?? ""}`.replace(/\r\n?/g, "\n");
  if (!normalized.trim()) {
    return {
      content: "",
      repaired: false,
      issues: [] as string[],
    };
  }

  let repaired = false;
  const issues: string[] = [];

  const lines = normalized.split("\n");
  const nextLines = lines.map((line) => {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (!headingMatch) {
      return line;
    }
    const cleanedHeading = sanitizeArtifactTitle(headingMatch[2] ?? "");
    if (cleanedHeading !== (headingMatch[2] ?? "").trim()) {
      repaired = true;
      issues.push("heading_cleanup");
    }
    return `${headingMatch[1]} ${cleanedHeading}`.trimEnd();
  });

  let content = nextLines.join("\n").trimEnd();
  const cleanedSuffix = stripDanglingMarkdownSuffix(content);
  if (cleanedSuffix !== content) {
    repaired = true;
    issues.push("dangling_suffix");
    content = cleanedSuffix;
  }

  return {
    content,
    repaired,
    issues,
  };
}

function hasOddMarkdownFenceCount(content: string) {
  const fenceMatches = content.match(/```/g)?.length ?? 0;
  return fenceMatches % 2 === 1;
}

function hasOddDisplayMathFenceCount(content: string) {
  const mathFenceMatches = content.match(/\$\$/g)?.length ?? 0;
  return mathFenceMatches % 2 === 1;
}

function looksLikeTruncatedTail(content: string) {
  const lastLine = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .pop();

  if (!lastLine) return true;

  if (/[#*_`~|(-]$/.test(lastLine)) {
    return true;
  }

  if (/^#{1,6}\s+\S+\s+\S+$/.test(lastLine)) {
    return false;
  }

  if (lastLine.length <= 4) {
    return true;
  }

  return false;
}

export function assessArtifactIntegrity(params: {
  title: string;
  rawContent: string;
  sourceStage: "streaming" | "complete" | "persisted" | "legacy";
  hasStructuredDocument: boolean;
}) {
  const repairedTitle = sanitizeArtifactTitle(params.title);
  const repairedMarkdown = repairArtifactMarkdown(params.rawContent);

  if (params.sourceStage === "streaming") {
    return {
      title: repairedTitle || params.title.trim(),
      rawContent: repairedMarkdown.content,
      status: "streaming" as ArtifactIntegrityStatus,
      issues: repairedMarkdown.issues,
    };
  }

  const issues = [...repairedMarkdown.issues];
  if (hasOddMarkdownFenceCount(repairedMarkdown.content)) {
    issues.push("unclosed_code_fence");
  }
  if (hasOddDisplayMathFenceCount(repairedMarkdown.content)) {
    issues.push("unclosed_math_fence");
  }

  const invalid =
    repairedMarkdown.content.trim().length === 0 ||
    issues.includes("unclosed_code_fence") ||
    issues.includes("unclosed_math_fence") ||
    (!params.hasStructuredDocument && looksLikeTruncatedTail(repairedMarkdown.content));

  return {
    title: repairedTitle || params.title.trim(),
    rawContent: repairedMarkdown.content,
    status: invalid
      ? ("invalid" as ArtifactIntegrityStatus)
      : repairedMarkdown.repaired
        ? ("repaired" as ArtifactIntegrityStatus)
        : ("complete" as ArtifactIntegrityStatus),
    issues,
  };
}
