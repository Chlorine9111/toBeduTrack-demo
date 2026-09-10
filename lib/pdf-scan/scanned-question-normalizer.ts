import { extractOptions, stripExtractedOptionsFromContent } from "@/lib/pdf-scan/question-parser";
import type { QuestionOptions } from "@/lib/pdf-scan/types";

const OPTION_LINE_PATTERN =
  /^\s*\|?\s*(?:\(([A-Ea-e])\)|([A-Ea-e])[.、．:：)\]])\s*(.*?)\s*\|?\s*$/;
const TABLE_DIVIDER_PATTERN = /^\s*\|?\s*:?-{2,}:?(?:\s*\|\s*:?-{2,}:?)+\s*\|?\s*$/;
const PIPE_TABLE_ROW_PATTERN = /^\s*\|.+\|\s*$/;
const BARE_PIPE_LINE_PATTERN = /^\s*\|+\s*$/;
const TRAILING_NUMBER_PATTERN = /\n+\s*\d+\s*$/;
const QUESTION_INTRO_PATTERN =
  /^(?:\d+[.)、．:：]\s+|(?:Which|What|When|Where|Why|How|A |An |The |If |In |At |From |During |Consider|Suppose|Assume|Let )[\s\S]{12,}|(?:下列|已知|若|如图|如表|根据|阅读|回答|计算|判断|证明))/i;
const NEXT_QUESTION_INLINE_PATTERN =
  /\s+\d+[.)、．:：]\s+(?=(?:Which|What|When|Where|Why|How|Consider|Suppose|Assume|Let|A |An |The |If |In |At |From |During|下列|已知|若|如图|如表|根据|阅读|回答|计算|判断|证明|\S))/i;
const LEADING_QUESTION_NUMBER_PATTERN = /^\d+[.)、．:：]\s*/;
const MARKDOWN_IMAGE_AT_END_PATTERN = /(?:\n\s*)?(!\[[^\]]*]\([^)]+\))\s*$/;
const STANDALONE_OPTION_MARKER_PATTERN = /^\s*\(?[A-Ea-e]\)?[.、．:：)\]]?\s*$/;
const SHORT_FRAGMENT_LINE_PATTERN =
  /^[\p{L}\p{N}\p{M}+\-−=<>≤≥°%μΩΔ→∞().,/_^{}\\[\]]+$/u;
const QUESTION_NUMBER_ONLY_PATTERN = /^[1-9]\d+[.)、．:：]?$/u;
const INLINE_MATH_REPEAT_PATTERN =
  /((?=[A-Za-z0-9+\-−=<>≤≥°%μΩΔ→∞\\^_{}()[\]\/]*[+\-−=<>≤≥°%μΩΔ→∞0-9\\^_{}()[\]\/])[A-Za-z0-9+\-−=<>≤≥°%μΩΔ→∞\\^_{}()[\]\/]{2,16})\1(?=(?:[\s,.;:!?，。；：！？)]|$))/g;
const ADMINISTRATIVE_LINE_PATTERNS = [
  /^DIVISION\s+\d+(?:\s+STUDENTS?)?$/i,
  /^STUDENTS?$/i,
  /^CONTINUE$/i,
  /^START HERE$/i,
  /^STOP HERE$/i,
  /^Answer questions\s*#?\d+(?:\s*through\s*#?\d+)?\.?$/i,
  /^through\s*#?\d+\.?$/i,
  /^Numbers\s+\d+\s*[–-]\s*\d+\s+on your answer sheet.*$/i,
  /^Numbers\s+\d+\s*-\s*\d+\s+should remain blank.*$/i,
  /^Your first answer should be for\s*#?\d+.*$/i,
  /^Your last answer should be for\s*#?\d+.*$/i,
  /^Treat\s+\$?g\s*=?.*$/i,
];
const INLINE_ADMINISTRATIVE_MARKERS = [
  /\s+#*\s*DIVISION\s+\d+(?:\s+STUDENTS?)?/i,
  /\s+#*\s*STOP HERE\b/i,
  /\s+#*\s*CONTINUE\b/i,
  /\s+Your last answer should be for\b/i,
  /\s+Your first answer should be for\b/i,
  /\s+Numbers\s+\d+\s*-\s*\d+\s+should remain blank\b/i,
  /\s+Numbers\s+\d+\s*[–-]\s*\d+\s+should remain blank\b/i,
  /\s+Answer questions\s*#?\d+(?:\s*through\s*#?\d+)?/i,
  /\s+Treat\s+\$?g\b/i,
];

function stripTableCellShell(value: string) {
  return value.replace(/^\|\s*/, "").replace(/\s*\|$/, "").trim();
}

function parsePipeTableCells(value: string) {
  if (!PIPE_TABLE_ROW_PATTERN.test(value)) return null;
  const cells = stripTableCellShell(value)
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);

  return cells.length >= 2 ? cells : null;
}

function stripAdministrativeLines(value: string) {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      kept.push("");
      continue;
    }
    if (ADMINISTRATIVE_LINE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
      continue;
    }
    kept.push(trimmed);
  }

  return kept.join("\n");
}

function stripInlineAdministrativeSegments(value: string) {
  const lines = value.split("\n");
  const kept: string[] = [];

  for (const line of lines) {
    let nextLine = line;
    let shouldStop = false;

    for (const pattern of INLINE_ADMINISTRATIVE_MARKERS) {
      const match = nextLine.match(pattern);
      if (!match || typeof match.index !== "number") continue;
      if (match.index > 0) {
        const prefix = nextLine.slice(0, match.index).trim();
        const prefixIsAdministrative =
          !prefix ||
          ADMINISTRATIVE_LINE_PATTERNS.some((adminPattern) =>
            adminPattern.test(prefix),
          );
        if (prefixIsAdministrative) {
          continue;
        }
        nextLine = nextLine.slice(0, match.index).replace(/\s+\d+\s*$/, "");
        shouldStop = true;
      }
    }

    kept.push(nextLine);
    if (shouldStop) {
      break;
    }
  }

  return kept.join("\n");
}

function isSuspiciousShortFragmentLine(line: string) {
  const compact = line.trim().replace(/\s+/g, "");
  if (!compact) return false;
  if (compact.length > 8) return false;
  if (/[\p{Script=Han}]/u.test(compact)) return false;
  if (STANDALONE_OPTION_MARKER_PATTERN.test(compact)) return false;
  if (QUESTION_NUMBER_ONLY_PATTERN.test(compact)) return false;
  if (OPTION_LINE_PATTERN.test(line.trim())) return false;
  const hasMathishToken = /[+\-−=<>≤≥°%μΩΔ→∞0-9\\^_{}[\]()/]/.test(compact);
  if (!hasMathishToken && compact.length > 1) return false;
  return SHORT_FRAGMENT_LINE_PATTERN.test(compact);
}

function dedupeRepeatedFragmentText(value: string) {
  if (value.length >= 2 && value.length % 2 === 0) {
    const half = value.length / 2;
    const left = value.slice(0, half);
    const right = value.slice(half);
    if (left === right) {
      return left;
    }
  }
  return value;
}

function shouldInlineMergeContinuationLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (STANDALONE_OPTION_MARKER_PATTERN.test(trimmed)) return false;
  if (QUESTION_NUMBER_ONLY_PATTERN.test(trimmed)) return false;
  if (/^(?:\\begin\{tabular\}|\\end\{tabular\}|\\hline\b)/.test(trimmed)) {
    return false;
  }
  return true;
}

function collapseSuspiciousFragmentRuns(value: string) {
  const lines = value.split("\n");
  const merged: string[] = [];

  for (let index = 0; index < lines.length; ) {
    const current = lines[index] ?? "";
    if (!isSuspiciousShortFragmentLine(current)) {
      merged.push(current);
      index += 1;
      continue;
    }

    const fragments: string[] = [];
    let cursor = index;
    while (
      cursor < lines.length &&
      isSuspiciousShortFragmentLine(lines[cursor] ?? "")
    ) {
      fragments.push((lines[cursor] ?? "").trim().replace(/\s+/g, ""));
      cursor += 1;
    }

    if (fragments.length < 2) {
      merged.push(current);
      index += 1;
      continue;
    }

    const compact = dedupeRepeatedFragmentText(fragments.join(""));
    const prevIndex = merged.length - 1;
    const previous = prevIndex >= 0 ? merged[prevIndex] ?? "" : "";

    if (previous && previous.trim() && !/[|&]$/.test(previous.trim())) {
      let nextValue = `${previous.replace(/[ \t]+$/g, "")} ${compact}`.replace(
        /\s{2,}/g,
        " ",
      );
      if (shouldInlineMergeContinuationLine(lines[cursor] ?? "")) {
        nextValue = `${nextValue} ${(lines[cursor] ?? "").trim()}`.replace(
          /\s{2,}/g,
          " ",
        );
        cursor += 1;
      }
      merged[prevIndex] = nextValue;
    } else {
      merged.push(compact);
    }

    index = cursor;
  }

  return merged.join("\n");
}

function stripStandaloneOptionMarkerRuns(value: string) {
  const lines = value.split("\n");
  const kept: string[] = [];

  for (let index = 0; index < lines.length; ) {
    const line = lines[index] ?? "";
    if (!STANDALONE_OPTION_MARKER_PATTERN.test(line.trim())) {
      kept.push(line);
      index += 1;
      continue;
    }

    let cursor = index;
    let markerCount = 0;
    while (
      cursor < lines.length &&
      (!lines[cursor]?.trim() ||
        STANDALONE_OPTION_MARKER_PATTERN.test((lines[cursor] ?? "").trim()))
    ) {
      if (STANDALONE_OPTION_MARKER_PATTERN.test((lines[cursor] ?? "").trim())) {
        markerCount += 1;
      }
      cursor += 1;
    }

    if (markerCount < 2) {
      kept.push(...lines.slice(index, cursor));
    }
    index = cursor;
  }

  return kept.join("\n");
}

function stripLeadingIsolatedNumberLine(value: string) {
  const lines = value.split("\n");
  const firstMeaningfulIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstMeaningfulIndex < 0) return value;

  const firstLine = lines[firstMeaningfulIndex]?.trim() ?? "";
  if (!/^\d+$/.test(firstLine)) {
    return value;
  }

  const remaining = lines.slice(firstMeaningfulIndex + 1).join("\n");
  return hasQuestionStructure(remaining) ? remaining : value;
}

function normalizeStemPresentation(value: string) {
  return preserveMultilineScanText(
    stripStandaloneOptionMarkerRuns(
      value
        .split("\n")
        .map((line) => {
          if (BARE_PIPE_LINE_PATTERN.test(line)) {
            return "";
          }
          const cells = parsePipeTableCells(line);
          if (!cells) return line;
          if (cells.some((cell) => OPTION_LINE_PATTERN.test(cell))) {
            return line;
          }
          return cells.join(" / ");
        })
        .join("\n"),
    ),
  );
}

function formatTableOptionText(optionText: string, headers: string[] | null) {
  if (!headers || !optionText.includes("|")) {
    return optionText;
  }

  const cells = optionText
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);

  if (cells.length < 2 || headers.length < 2) {
    return optionText;
  }

  return headers
    .slice(0, cells.length)
    .map((header, index) => `${header}: ${cells[index]}`)
    .join("；");
}

function normalizeOptionText(value: string, label?: string, headers?: string[] | null) {
  let normalized = preserveMultilineScanText(value).replace(/\n\s*\|+\s*/g, "\n").trim();
  if (!normalized) return "";

  if (headers && normalized.includes("|")) {
    const cells = normalized
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean);

    if (cells.length >= 2) {
      normalized = headers
        .slice(0, cells.length)
        .map((header, index) => `${header}: ${cells[index]}`)
        .join("；");
    }
  }

  if (!label) {
    return normalized;
  }

  return normalized
    .replace(new RegExp(`^\\(?${label}\\)?[.、．:：)\\]]\\s*`, "i"), "")
    .trim();
}

function extractTableHeaders(content: string) {
  for (const line of content.split("\n")) {
    const cells = parsePipeTableCells(line.trim());
    if (!cells) continue;
    if (cells.some((cell) => OPTION_LINE_PATTERN.test(cell))) {
      continue;
    }
    return cells;
  }
  return null;
}

function extractHeadersFromNormalizedStem(stem: string) {
  for (const line of stem.split("\n")) {
    if (!line.includes("/")) continue;
    const headers = line
      .split("/")
      .map((cell) => cell.trim())
      .filter(Boolean);
    if (headers.length >= 2) {
      return headers;
    }
  }
  return null;
}

export function preserveMultilineScanText(value: string | null | undefined) {
  return stripLeadingIsolatedNumberLine(
    stripStandaloneOptionMarkerRuns(
      stripAdministrativeLines(
        collapseSuspiciousFragmentRuns(
          stripInlineAdministrativeSegments(
            `${value ?? ""}`
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u2003]/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n"),
          ),
        )
      ),
    ),
  )
    .replace(/\n{3,}/g, "\n\n")
    .replace(TRAILING_NUMBER_PATTERN, "")
    .replace(/[ \t]+([,.;:!?，。；：！？])/g, "$1")
    .replace(INLINE_MATH_REPEAT_PATTERN, "$1")
    .trim();
}

function normalizeQuestionOptions(
  options: QuestionOptions | null | undefined,
  headers?: string[] | null,
): QuestionOptions | null {
  if (!options) return null;

  const entries = Object.entries(options)
    .map(([label, text]) => {
      const normalizedLabel = label.trim().toUpperCase();
      const optionText = normalizeOptionText(`${text ?? ""}`, normalizedLabel, headers ?? null);
      return [normalizedLabel, optionText] as const;
    })
    .filter(([, text]) => text.length > 0);

  if (entries.length < 2) return null;

  return Object.fromEntries(entries);
}

function extractLooseOptionBlock(content: string): {
  stem: string;
  options: QuestionOptions | null;
} | null {
  const lines = content.split("\n");
  const stemLines: string[] = [];
  const options: Record<string, string> = {};
  const labelsSeen = new Set<string>();
  let currentLabel: string | null = null;
  let foundOptions = false;
  let tableHeaders: string[] | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();

    if (!foundOptions) {
      if (!trimmed) {
        stemLines.push("");
        continue;
      }
      if (TABLE_DIVIDER_PATTERN.test(trimmed)) {
        continue;
      }

      const headerCells = parsePipeTableCells(trimmed);
      if (headerCells && !OPTION_LINE_PATTERN.test(trimmed)) {
        tableHeaders = headerCells;
        stemLines.push(headerCells.join(" / "));
        continue;
      }

      const match = rawLine.match(OPTION_LINE_PATTERN);
      if (match) {
        const label = (match[1] || match[2] || "").toUpperCase();
        const firstText = normalizeOptionText(
          formatTableOptionText(stripTableCellShell(match[3] || ""), tableHeaders),
          label,
          tableHeaders,
        );
        if (!label) continue;
        currentLabel = label;
        labelsSeen.add(label);
        options[label] = firstText;
        foundOptions = true;
        continue;
      }

      stemLines.push(rawLine);
      continue;
    }

    if (!trimmed) {
      if (currentLabel && options[currentLabel]) {
        options[currentLabel] = `${options[currentLabel]}\n`;
      }
      continue;
    }

    if (TABLE_DIVIDER_PATTERN.test(trimmed)) {
      continue;
    }

    const match = rawLine.match(OPTION_LINE_PATTERN);
    if (match) {
      const label = (match[1] || match[2] || "").toUpperCase();
      const firstText = normalizeOptionText(
        formatTableOptionText(stripTableCellShell(match[3] || ""), tableHeaders),
        label,
        tableHeaders,
      );
      if (!label) continue;
      currentLabel = label;
      labelsSeen.add(label);
      options[label] = firstText;
      continue;
    }

    if (labelsSeen.size >= 4 && (QUESTION_INTRO_PATTERN.test(trimmed) || /^\d+\s*$/.test(trimmed))) {
      break;
    }

    if (!currentLabel) {
      break;
    }

    const continuation = normalizeOptionText(
      formatTableOptionText(stripTableCellShell(rawLine), tableHeaders),
      currentLabel,
      tableHeaders,
    );
    if (!continuation) continue;
    options[currentLabel] = options[currentLabel]
      ? `${options[currentLabel]}\n${continuation}`
      : continuation;
  }

  const normalizedOptions = normalizeQuestionOptions(options, tableHeaders);
  if (!normalizedOptions) return null;

  return {
    stem: normalizeStemPresentation(stemLines.join("\n")),
    options: normalizedOptions,
  };
}

function extractCompactSequentialOptionBlock(content: string): {
  stem: string;
  options: QuestionOptions | null;
  overflowContent: string;
} | null {
  const labels = ["A", "B", "C", "D", "E"] as const;
  const aMarkerPattern = /\(?A\)?[.、．:：)\]]/gi;
  let startMatch: RegExpExecArray | null;

  while ((startMatch = aMarkerPattern.exec(content)) !== null) {
    const startIndex = startMatch.index ?? -1;
    if (startIndex < 0) continue;

    const previousChar = startIndex > 0 ? content[startIndex - 1] : "";
    if (previousChar && !/[\s\n?？]/.test(previousChar)) {
      continue;
    }

    const sequence: Array<{ label: string; start: number; end: number }> = [
      {
        label: "A",
        start: startIndex,
        end: startIndex + startMatch[0].length,
      },
    ];
    let searchFrom = startIndex + startMatch[0].length;

    for (let labelIndex = 1; labelIndex < labels.length; labelIndex += 1) {
      const label = labels[labelIndex];
      const markerPattern = new RegExp(`\\(?${label}\\)?[.、．:：)\\]]`, "i");
      const slice = content.slice(searchFrom);
      const match = slice.match(markerPattern);
      if (!match || typeof match.index !== "number") {
        break;
      }

      const markerStart = searchFrom + match.index;
      const markerEnd = markerStart + match[0].length;
      sequence.push({
        label,
        start: markerStart,
        end: markerEnd,
      });
      searchFrom = markerEnd;
    }

    if (sequence.length < 4) continue;

    const totalSpan = sequence[sequence.length - 1].start - sequence[0].start;
    if (totalSpan > 140) continue;

    const stem = preserveMultilineScanText(content.slice(0, sequence[0].start));
    if (!stem || stem.length < 16) continue;

    const options: QuestionOptions = {};
    let overflowContent = "";

    for (let index = 0; index < sequence.length; index += 1) {
      const current = sequence[index];
      const next = sequence[index + 1];
      const rawSegment = content.slice(current.end, next ? next.start : content.length);

      if (!rawSegment.trim()) continue;

      if (!next) {
        const overflowMatch = rawSegment.match(NEXT_QUESTION_INLINE_PATTERN);
        if (overflowMatch && typeof overflowMatch.index === "number") {
          const optionText = rawSegment.slice(0, overflowMatch.index);
          overflowContent = rawSegment.slice(overflowMatch.index).trim();
          options[current.label as keyof QuestionOptions] = preserveMultilineScanText(optionText);
          continue;
        }
      }

      options[current.label as keyof QuestionOptions] = preserveMultilineScanText(rawSegment);
    }

    const normalizedOptions = normalizeQuestionOptions(options);
    if (!normalizedOptions) continue;

    return {
      stem: normalizeStemPresentation(stem),
      options: normalizedOptions,
      overflowContent: preserveMultilineScanText(overflowContent),
    };
  }

  return null;
}

function hasQuestionStructure(content: string) {
  if (!content) return false;
  if (QUESTION_INTRO_PATTERN.test(content)) return true;
  if (/[?？]/.test(content) && content.trim().length >= 24) return true;
  if ((content.match(/(?:^|\n)\s*(?:\([A-Ea-e]\)|[A-Ea-e][.、．:：)\]])\s+\S/gm) || []).length >= 2) {
    return true;
  }
  if (content.split("\n").some((line) => TABLE_DIVIDER_PATTERN.test(line.trim()))) {
    return true;
  }
  return false;
}

function stripLeadingCarriedOptionBlock(content: string) {
  const lines = content.split("\n");
  let index = 0;

  while (index < lines.length && !lines[index]?.trim()) {
    index += 1;
  }

  const optionLines: string[] = [];
  let cursor = index;
  while (cursor < lines.length) {
    const line = lines[cursor];
    const trimmed = line.trim();

    if (!trimmed) {
      if (optionLines.length > 0) {
        cursor += 1;
        break;
      }
      cursor += 1;
      continue;
    }

    if (!OPTION_LINE_PATTERN.test(line)) {
      break;
    }

    optionLines.push(line);
    cursor += 1;
  }

  if (optionLines.length < 4) {
    return content;
  }

  const remaining = preserveMultilineScanText(lines.slice(cursor).join("\n"));
  if (!remaining) {
    return content;
  }

  if (remaining.length >= 24) {
    return remaining;
  }

  return hasQuestionStructure(remaining) ? remaining : content;
}

function normalizeImagePlacement(params: {
  stem: string;
  options: QuestionOptions | null;
}) {
  const options = params.options ? { ...params.options } : null;
  if (!options) {
    return {
      stem: params.stem,
      options,
    };
  }

  const stemHasImage = /!\[[^\]]*]\([^)]+\)/.test(params.stem);
  if (stemHasImage) {
    return {
      stem: params.stem,
      options,
    };
  }

  const optionEntries = Object.entries(options);
  const matchedEntries = optionEntries
    .map(([label, text]) => ({
      label,
      text,
      match: typeof text === "string" ? text.match(MARKDOWN_IMAGE_AT_END_PATTERN) : null,
    }))
    .filter((item) => item.match);

  if (matchedEntries.length !== 1) {
    return {
      stem: params.stem,
      options,
    };
  }

  const [{ label, text, match }] = matchedEntries;
  if (!match) {
    return {
      stem: params.stem,
      options,
    };
  }

  const imageMarkdown = match[1];
  const nextStem = preserveMultilineScanText(`${params.stem}\n${imageMarkdown}`);
  const optionText = typeof text === "string" ? text : "";
  options[label] = preserveMultilineScanText(
    optionText.replace(MARKDOWN_IMAGE_AT_END_PATTERN, ""),
  );

  return {
    stem: nextStem,
    options: normalizeQuestionOptions(options),
  };
}

export function normalizeScannedQuestionTextAndOptions(params: {
  content?: string | null;
  options?: QuestionOptions | null;
  questionType?: string | null;
}) {
  const normalizedContent = stripLeadingCarriedOptionBlock(
    preserveMultilineScanText(params.content),
  );
  const tableHeaders = extractTableHeaders(normalizedContent);
  const directOptions = normalizeQuestionOptions(params.options, tableHeaders);
  const compactBlock = extractCompactSequentialOptionBlock(normalizedContent);
  const looseBlock = extractLooseOptionBlock(normalizedContent);
  const extractedOptions = normalizeQuestionOptions(
    extractOptions(normalizedContent),
    tableHeaders,
  );
  const contentDerivedOptions =
    compactBlock?.options ?? looseBlock?.options ?? extractedOptions ?? null;
  const options = contentDerivedOptions ?? directOptions ?? null;

  let stem = normalizedContent;
  let overflowQuestion:
    | {
        content: string;
        options: QuestionOptions | null;
        isChoiceLike: boolean;
      }
    | undefined;

  if (compactBlock?.options) {
    stem = compactBlock.stem;
    if (compactBlock.overflowContent) {
      overflowQuestion = {
        content: compactBlock.overflowContent.replace(LEADING_QUESTION_NUMBER_PATTERN, "").trim(),
        options: directOptions,
        isChoiceLike: Boolean(directOptions),
      };
    }
  } else if (looseBlock?.options) {
    stem = looseBlock.stem;
  } else if (options) {
    stem = normalizeStemPresentation(
      stripExtractedOptionsFromContent(normalizedContent, options),
    );
  }

  const imagePlacement = normalizeImagePlacement({
    stem: normalizeStemPresentation(stem || normalizedContent),
    options,
  });
  const readableOptions =
    normalizeQuestionOptions(
      imagePlacement.options,
      extractHeadersFromNormalizedStem(imagePlacement.stem),
    ) ?? imagePlacement.options;

  return {
    content: imagePlacement.stem,
    options: readableOptions,
    overflowQuestion,
    isChoiceLike:
      (params.questionType ?? "").toLowerCase() === "choice" || Boolean(readableOptions),
  };
}
