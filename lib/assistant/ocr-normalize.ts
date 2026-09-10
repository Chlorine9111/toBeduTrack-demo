function normalizeLine(line: string) {
  return line.replace(/\s+/g, " ").trim();
}

function splitPipeRow(line: string) {
  const trimmed = normalizeLine(line);
  if (!trimmed.includes("|")) return [];

  const normalized = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return normalized.split("|").map((cell) => normalizeLine(cell));
}

function splitWhitespaceRow(line: string) {
  const trimmed = line.trim();
  if (!/(\t+|\s{2,})/.test(trimmed)) return [];

  return trimmed
    .split(/\t+|\s{2,}/)
    .map((cell) => normalizeLine(cell))
    .filter(Boolean);
}

const RUBRIC_HEADER_TOKEN_PATTERN =
  /\b(?:criterion|criteria|dimension|indicator|skill|component|level\s*\d+[a-z+-]*|score\s*\d+[a-z+-]*|band\s*\d+[a-z+-]*|excellent|good|fair|poor|proficient|advanced|developing|emerging|beginning|mastery|meets|approaching|below|exceeds|strong|secure|limited)\b/gi;
const RUBRIC_LABEL_PATTERN =
  /^(?:claim|evidence|reasoning|analysis|explanation|model|calculation|procedure|design|conclusion|communication|organization|structure|mechanics|grammar|vocabulary|context|contextualization|thesis|support|justification|interpretation|reflection|collaboration|presentation|research|application|accuracy|content|creativity|problem(?:\s+solving)?|inquiry|method|data|citation|use\s+of\s+evidence|scientific\s+reasoning|argument)\b/i;
const RUBRIC_DESCRIPTOR_STARTERS = [
  "partly",
  "partial",
  "mostly",
  "some",
  "limited",
  "incomplete",
  "weak",
  "general",
  "basic",
  "developing",
  "emerging",
  "minimal",
  "adequate",
  "simple",
  "vague",
  "unclear",
  "incorrect",
  "few",
  "little",
  "rare",
  "inconsistent",
  "attempts",
  "attempting",
];

function splitRubricHeaderRow(line: string) {
  const normalized = normalizeLine(line);
  if (!normalized) return [];

  const matches = Array.from(normalized.matchAll(RUBRIC_HEADER_TOKEN_PATTERN));
  if (matches.length < 2) return [];

  const cells: string[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const start = current.index ?? 0;
    const end = matches[index + 1]?.index ?? normalized.length;
    const cell = normalized.slice(start, end).trim();
    if (cell) cells.push(cell);
  }

  return cells.length >= 2 ? cells : [];
}

function splitCollapsedRubricRow(line: string, expectedWidth: number) {
  if (expectedWidth !== 3) return [];

  const normalized = normalizeLine(line);
  if (!normalized || !RUBRIC_LABEL_PATTERN.test(normalized)) return [];

  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length < expectedWidth + 2) return [];

  let labelEnd = 1;
  while (labelEnd < Math.min(tokens.length, 5)) {
    const token = tokens[labelEnd];
    if (!token) break;
    if (/^[A-Z][A-Za-z0-9+-]*$/.test(token) || /^(of|and|for|in|on|to|the)$/i.test(token)) {
      labelEnd += 1;
      continue;
    }
    break;
  }

  const label = tokens.slice(0, labelEnd).join(" ").trim();
  if (!label || !RUBRIC_LABEL_PATTERN.test(label)) return [];

  const remainder = tokens.slice(labelEnd);
  if (remainder.length < 4) return [];

  const boundaryIndex = remainder.findIndex(
    (token, index) =>
      index >= 2 &&
      index <= remainder.length - 2 &&
      RUBRIC_DESCRIPTOR_STARTERS.includes(token.toLowerCase()),
  );

  if (boundaryIndex < 0) return [];

  const left = remainder.slice(0, boundaryIndex).join(" ").trim();
  const right = remainder.slice(boundaryIndex).join(" ").trim();
  if (!left || !right) return [];

  return [label, left, right];
}

function splitTableRow(line: string) {
  const pipeCells = splitPipeRow(line).filter(Boolean);
  if (pipeCells.length >= 2) {
    return {
      cells: pipeCells,
      mode: "pipe" as const,
    };
  }

  const whitespaceCells = splitWhitespaceRow(line);
  if (whitespaceCells.length >= 3) {
    return {
      cells: whitespaceCells,
      mode: "spacing" as const,
    };
  }

  const rubricHeaderCells = splitRubricHeaderRow(line);
  if (rubricHeaderCells.length >= 2) {
    return {
      cells: rubricHeaderCells,
      mode: "rubric_header" as const,
    };
  }

  return {
    cells: [] as string[],
    mode: null,
  };
}

function isMarkdownSeparator(line: string) {
  const cells = line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function looksLikePipeTableLine(line: string) {
  if (isMarkdownSeparator(line)) return false;
  return splitPipeRow(line).filter(Boolean).length >= 2;
}

function looksLikeWhitespaceTableLine(line: string) {
  return splitWhitespaceRow(line).length >= 3;
}

function isPipeTableCandidate(line: string) {
  return looksLikePipeTableLine(line) || isMarkdownSeparator(line);
}

function isTableCandidate(line: string) {
  return isPipeTableCandidate(line) || looksLikeWhitespaceTableLine(line);
}

function looksLikeRubricHeaderLine(line: string) {
  return splitRubricHeaderRow(line).length >= 2;
}

function toMarkdownTable(lines: string[]) {
  if (lines.length < 2) return lines;

  const rows = lines
    .filter((line) => !isMarkdownSeparator(line))
    .map((line) => splitTableRow(line))
    .filter((row) => row.cells.length >= 2);

  if (rows.length < 2) return lines;

  const hasSpacingRows = rows.some((row) => row.mode === "spacing");
  const firstWidth = rows[0]?.cells.length ?? 0;
  const compatibleRows = rows.filter(
    (row) => row.cells.length === firstWidth || row.cells.length === firstWidth - 1,
  );
  if (hasSpacingRows && compatibleRows.length < 2) {
    return lines;
  }

  const width = Math.max(...rows.map((row) => row.cells.length));
  const normalizedRows = rows.map((row) => {
    const padded = [...row.cells];
    while (padded.length < width) padded.push("");
    return `| ${padded.join(" | ")} |`;
  });

  const separator = `| ${Array.from({ length: width }, () => "---").join(" | ")} |`;
  return [normalizedRows[0], separator, ...normalizedRows.slice(1)];
}

export function normalizeVisionExtractedText(text: string) {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) return "";

  const lines = normalized.split("\n");
  const result: string[] = [];

  for (let index = 0; index < lines.length; ) {
    const currentRaw = (lines[index] ?? "").trim();
    const current = normalizeLine(currentRaw);
    if (!current) {
      if (result[result.length - 1] !== "") result.push("");
      index += 1;
      continue;
    }

    const nextRaw = (lines[index + 1] ?? "").trim();
    const headerCells = splitRubricHeaderRow(currentRaw);
    if (
      headerCells.length >= 2 &&
      (isTableCandidate(nextRaw) || splitCollapsedRubricRow(nextRaw, headerCells.length).length >= 2)
    ) {
      const block = [currentRaw];
      let cursor = index + 1;
      while (cursor < lines.length) {
        const candidateRaw = (lines[cursor] ?? "").trim();
        const candidate = normalizeLine(candidateRaw);
        if (!candidate || !isTableCandidate(candidateRaw)) break;
        block.push(candidateRaw);
        cursor += 1;
      }

      while (cursor < lines.length) {
        const candidateRaw = (lines[cursor] ?? "").trim();
        const collapsedRow = splitCollapsedRubricRow(candidateRaw, headerCells.length);
        if (collapsedRow.length !== headerCells.length) break;
        block.push(`| ${collapsedRow.join(" | ")} |`);
        cursor += 1;
      }

      if (block.length >= 2) {
        result.push(...toMarkdownTable(block));
        index = cursor;
        continue;
      }
    }

    if (!isTableCandidate(currentRaw)) {
      result.push(currentRaw);
      index += 1;
      continue;
    }

    const block: string[] = [];
    let cursor = index;
    while (cursor < lines.length) {
      const nextRaw = (lines[cursor] ?? "").trim();
      const next = normalizeLine(nextRaw);
      if (!next || !isTableCandidate(nextRaw)) break;
      block.push(nextRaw);
      cursor += 1;
    }

    if (block.length >= 2) {
      result.push(...toMarkdownTable(block));
      index = cursor;
      continue;
    }

    result.push(currentRaw);
    index += 1;
  }

  return result.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
