import type {
  AnswerSpaceBlock,
  DocumentBlock,
  DocumentModel,
  HeaderBlock,
  InstructionBlock,
  LessonStepBlock,
  QuestionBlock,
  QuestionContentLeaf,
  SectionTitleBlock,
  TableBlock,
} from "@/lib/doc-engine/block-types";
import type { LessonPlanBlock } from "@/lib/lesson-plan/types";
import {
  normalizeMathHtml,
  normalizeMathText,
  repairBrokenInlineMathDelimiters,
  restoreMathTagMarkupToLatex,
} from "@/lib/doc-engine/math-core";
import { buildRubricHtmlFromDocument } from "@/lib/doc-engine/rubric-html";

export type DocumentExportMode = "teacher" | "student" | "classroom";

const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g;

type MarkdownContentToken =
  | { type: "text"; value: string }
  | { type: "image"; alt: string; src: string };

const HORIZONTAL_RULE_PATTERN = /^(?:-{3,}|\*{3,}|_{3,})$/;
const ORDERED_LIST_PATTERN = /^\d+[.)]\s+/;
const BLOCKQUOTE_PATTERN = /^>\s?(.*)$/;
const HEADING_PATTERN = /^(#{1,4})\s+(.+)$/;
const UNORDERED_LIST_PATTERN = /^[-*•]\s+/;
const TABLE_SEPARATOR_PATTERN = /^\|?\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+\s*\|?$/;
const DISPLAY_MATH_LINE_PATTERN = /^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])$/;
const INLINE_MATH_PATTERN =
  /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^\n$]+?)\$|\\\(([\s\S]+?)\\\)/g;
const INLINE_MATH_TAG_PATTERN =
  /<math-(?:inline|display)\b[^>]*data-latex=(['"])[\s\S]*?\1[^>]*>(?:[\s\S]*?<\/math-(?:inline|display)>)?/gi;
const ESCAPED_INLINE_MATH_PATTERN = /\\\$([^\n$]+?)\\\$/g;
const INLINE_BARE_LATEX_PATTERN = new RegExp(
  String.raw`\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\}` +
    "|" +
    String.raw`\\(?:frac|sqrt|binom|text|mathrm|mathbf|mathit|mathbb|mathcal|overline|underline|hat|bar|vec|dot|ddot|tilde|widetilde|widehat|overset|underset|stackrel)(?:\{[^}]*\})+(?:[_^](?:\{[^}]*\}|[a-zA-Z0-9]))*` +
    "|" +
    String.raw`\\(?:int|iint|iiint|oint|sum|prod|lim|sup|inf|max|min|log|ln|sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|partial)(?:[_^](?:\{[^}]*\}|[a-zA-Z0-9]))*` +
    "|" +
    String.raw`\\(?:alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|infty|cdots|ldots|ddots|vdots|quad|qquad|pm|mp|times|div|cdot|leq|geq|neq|approx|equiv|sim|propto|perp|parallel|bullet|circ|star|dagger|angle|triangle|square|diamond|forall|exists|in|notin|subset|supset|cup|cap|neg|lor|land|to|mapsto|rightarrow|leftarrow|Rightarrow|Leftarrow|leftrightarrow|Leftrightarrow|uparrow|downarrow|nabla|ell|hbar|emptyset)\b`,
  "g",
);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ESCAPED_MARKDOWN_CHAR_PATTERN = /\\([\\`*_{}\[\]()#+\-.!|])/g;
const ESCAPED_MARKDOWN_TOKEN_PATTERN = /@@DMESC(\d+)@@/g;

function protectEscapedMarkdownCharacters(value: string) {
  const replacements: string[] = [];

  const protectedText = value.replace(
    ESCAPED_MARKDOWN_CHAR_PATTERN,
    (_match, escapedChar: string) => {
      const token = `@@DMESC${replacements.length}@@`;
      replacements.push(escapeHtml(escapedChar));
      return token;
    },
  );

  return { protectedText, replacements };
}

function restoreEscapedMarkdownCharacters(value: string, replacements: string[]) {
  return value.replace(ESCAPED_MARKDOWN_TOKEN_PATTERN, (_match, rawIndex: string) => {
    const index = Number.parseInt(rawIndex, 10);
    return replacements[index] ?? "";
  });
}

function toKebabCase(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-\u4e00-\u9fa5]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const UNSAFE_URL_PROTOCOL_PATTERN = /^\s*(?:javascript|data|vbscript):/i;

function isSafeUrl(escapedUrl: string) {
  const decoded = escapedUrl
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return !UNSAFE_URL_PROTOCOL_PATTERN.test(decoded);
}

function applyInlineFormatting(value: string) {
  const { protectedText, replacements } = protectEscapedMarkdownCharacters(value);

  const formatted = escapeHtml(protectedText)
    .replace(/&amp;nbsp;/g, "&nbsp;")
    .replace(/&amp;emsp;/g, " ")
    .replace(/`([^`]+?)`/g, "<code>$1</code>")
    .replace(
      /\[([^\]]+?)\]\(([^)]+?)\)/g,
      (_match: string, text: string, url: string) =>
        isSafeUrl(url)
          ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`
          : text,
    )
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>");

  return restoreEscapedMarkdownCharacters(formatted, replacements);
}

function renderMathTag(latex: string, displayMode: boolean) {
  const escapedLatex = escapeHtml(latex.trim());
  return displayMode
    ? `<math-display data-latex="${escapedLatex}"></math-display>`
    : `<math-inline data-latex="${escapedLatex}"></math-inline>`;
}

function wrapBareLatexPreviewMath(value: string) {
  if (!value) return value;

  return value.replace(INLINE_BARE_LATEX_PATTERN, (match, offset: number, source: string) => {
    const before = source[offset - 1] ?? "";
    const after = source[offset + match.length] ?? "";

    if (before === "\\" || before === "$" || after === "$") {
      return match;
    }

    return renderMathTag(match, false);
  });
}

function convertExplicitPreviewMathToTags(value: string) {
  return value
    .replace(ESCAPED_INLINE_MATH_PATTERN, (_match, latex: string) => renderMathTag(latex, false))
    .replace(/\$\$([\s\S]+?)\$\$/g, (_match, latex: string) => renderMathTag(latex, true))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_match, latex: string) => renderMathTag(latex, true))
    .replace(/(?<!\$)\$([^\n$]+?)\$(?!\$)/g, (_match, latex: string) => renderMathTag(latex, false))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_match, latex: string) => renderMathTag(latex, false));
}

function normalizeInlineMathPreservingTags(value: string) {
  const restored = repairBrokenInlineMathDelimiters(
    restoreMathTagMarkupToLatex(value),
  );
  const protectedSegments: string[] = [];
  const protect = (source: string, pattern: RegExp) =>
    source.replace(pattern, (match) => {
      const token = `@@DMATHSEG${protectedSegments.length}@@`;
      protectedSegments.push(match);
      return token;
    });

  const protectedValue = protect(restored, INLINE_MATH_TAG_PATTERN);
  const withExplicitTags = convertExplicitPreviewMathToTags(protectedValue);
  const withProtectedMathTags = protect(withExplicitTags, INLINE_MATH_TAG_PATTERN);
  const wrappedBareLatex = wrapBareLatexPreviewMath(withProtectedMathTags).replace(
    /@@DMATHSEG(\d+)@@/g,
    (_match, rawIndex: string) =>
      protectedSegments[Number.parseInt(rawIndex, 10)] ?? "",
  );
  return normalizeMathText(wrappedBareLatex);
}

function applyInlineFormattingPreservingMathTags(value: string) {
  const mathPlaceholders: string[] = [];
  const withPlaceholders = value.replace(INLINE_MATH_TAG_PATTERN, (match) => {
    const token = `@@DMFMT${mathPlaceholders.length}@@`;
    mathPlaceholders.push(match);
    return token;
  });

  const formatted = applyInlineFormatting(withPlaceholders);

  return formatted.replace(/@@DMFMT(\d+)@@/g, (_match, rawIndex: string) => {
    const index = Number.parseInt(rawIndex, 10);
    return mathPlaceholders[index] ?? "";
  });
}

function renderInlineText(value: string) {
  const normalizedMath = normalizeInlineMathPreservingTags(value);
  const parts: string[] = [];
  let lastIndex = 0;

  for (const match of normalizedMath.matchAll(INLINE_MATH_TAG_PATTERN)) {
    const start = match.index ?? -1;
    if (start < 0) continue;

    if (start > lastIndex) {
      parts.push(
        applyInlineFormattingPreservingMathTags(
          normalizedMath.slice(lastIndex, start),
        ),
      );
    }

    parts.push(match[0]);
    lastIndex = start + match[0].length;
  }

  if (lastIndex < normalizedMath.length) {
    parts.push(
      applyInlineFormattingPreservingMathTags(normalizedMath.slice(lastIndex)),
    );
  }

  return parts.join("");
}

function tokenizeMarkdownContent(value: string): MarkdownContentToken[] {
  const tokens: MarkdownContentToken[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(MARKDOWN_IMAGE_PATTERN)) {
    const matchIndex = match.index ?? -1;
    if (matchIndex < 0) continue;

    const prefix = value.slice(lastIndex, matchIndex);
    if (prefix.trim()) {
      tokens.push({ type: "text", value: prefix });
    }

    const src = `${match[2] ?? ""}`.trim();
    if (src) {
      tokens.push({
        type: "image",
        alt: `${match[1] ?? ""}`.trim(),
        src,
      });
    }

    lastIndex = matchIndex + match[0].length;
  }

  const suffix = value.slice(lastIndex);
  if (suffix.trim()) {
    tokens.push({ type: "text", value: suffix });
  }

  return tokens;
}

function renderParagraphHtml(value: string) {
  return renderMarkdownBlocks(value);
}

function splitTableCells(line: string) {
  const normalized = line.trim().replace(/^\|/, "").replace(/\|$/, "");

  if (!normalized.includes("$") && !normalized.includes("\\(") && !normalized.includes("\\[")) {
    return normalized.split("|").map((cell) => cell.trim());
  }

  const cells: string[] = [];
  let current = "";
  let i = 0;

  while (i < normalized.length) {
    if (normalized[i] === "\\" && i + 1 < normalized.length) {
      const next = normalized[i + 1];
      if (next === "(" || next === "[") {
        const closeSeq = next === "(" ? "\\)" : "\\]";
        const closeIndex = normalized.indexOf(closeSeq, i + 2);
        if (closeIndex >= 0) {
          current += normalized.slice(i, closeIndex + 2);
          i = closeIndex + 2;
          continue;
        }
      }
      current += normalized.slice(i, i + 2);
      i += 2;
      continue;
    }

    if (normalized[i] === "$" && normalized[i + 1] === "$") {
      const closeIndex = normalized.indexOf("$$", i + 2);
      if (closeIndex >= 0) {
        current += normalized.slice(i, closeIndex + 2);
        i = closeIndex + 2;
        continue;
      }
    }

    if (normalized[i] === "$" && normalized[i + 1] !== "$") {
      const closeIndex = normalized.indexOf("$", i + 1);
      if (closeIndex >= 0) {
        current += normalized.slice(i, closeIndex + 1);
        i = closeIndex + 1;
        continue;
      }
    }

    if (normalized[i] === "|") {
      cells.push(current.trim());
      current = "";
      i += 1;
      continue;
    }

    current += normalized[i];
    i += 1;
  }

  cells.push(current.trim());
  return cells;
}

function isTableBlockStart(lines: string[], index: number) {
  const current = lines[index]?.trim() ?? "";
  const next = lines[index + 1]?.trim() ?? "";
  if (!current || !next) return false;
  return current.includes("|") && TABLE_SEPARATOR_PATTERN.test(next);
}

function renderTableBlockFromLines(lines: string[]) {
  const [headerLine, , ...rowLines] = lines;
  const headers = splitTableCells(headerLine ?? "");
  const rows = rowLines
    .map((line) => splitTableCells(line))
    .filter((row) => row.some((cell) => cell.length > 0));

  if (headers.length === 0) {
    return `<p>${lines.map(renderInlineText).join("<br />")}</p>`;
  }

  const columnCount = Math.max(headers.length, ...rows.map((row) => row.length));
  const normalizedHeaders = Array.from({ length: columnCount }, (_, index) => headers[index] ?? "");
  const normalizedRows = rows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index] ?? ""),
  );

  return [
    "<table>",
    `<thead><tr>${normalizedHeaders
      .map((header) => `<th>${renderInlineText(header)}</th>`)
      .join("")}</tr></thead>`,
    `<tbody>${normalizedRows
      .map(
        (row) =>
          `<tr>${row.map((cell) => `<td>${renderInlineText(cell) || "—"}</td>`).join("")}</tr>`,
      )
      .join("")}</tbody>`,
    "</table>",
  ].join("");
}

function renderParagraphBlock(lines: string[]) {
  const normalizedLines = lines
    .map((line) => line.trim())
    .filter(Boolean);

  if (normalizedLines.length === 0) return "";

  if (normalizedLines.length === 1 && HORIZONTAL_RULE_PATTERN.test(normalizedLines[0])) {
    return "<hr />";
  }

  const displayMathMatch =
    normalizedLines.length === 1
      ? normalizedLines[0].match(DISPLAY_MATH_LINE_PATTERN)
      : null;
  if (displayMathMatch) {
    return renderMathTag(displayMathMatch[1] ?? displayMathMatch[2] ?? "", true);
  }

  const headingMatch =
    normalizedLines.length === 1 ? normalizedLines[0].match(HEADING_PATTERN) : null;
  if (headingMatch) {
    const level = Math.min(4, headingMatch[1]?.length ?? 1);
    return `<h${level}>${renderInlineText(headingMatch[2] ?? "")}</h${level}>`;
  }

  const bulletLines = normalizedLines.filter((line) => UNORDERED_LIST_PATTERN.test(line));
  if (bulletLines.length === normalizedLines.length) {
    return `<ul>${bulletLines
      .map((line) => `<li>${renderInlineText(line.replace(UNORDERED_LIST_PATTERN, ""))}</li>`)
      .join("")}</ul>`;
  }

  const orderedLines = normalizedLines.filter((line) => ORDERED_LIST_PATTERN.test(line));
  if (orderedLines.length === normalizedLines.length) {
    return `<ol>${orderedLines
      .map((line) => `<li>${renderInlineText(line.replace(ORDERED_LIST_PATTERN, ""))}</li>`)
      .join("")}</ol>`;
  }

  const quoteLines = normalizedLines
    .map((line) => line.match(BLOCKQUOTE_PATTERN)?.[1] ?? null);
  if (quoteLines.every((line) => line != null)) {
    const quoteText = quoteLines.join("\n").trim();
    return `<blockquote>${renderParagraphHtml(quoteText)}</blockquote>`;
  }

  return `<p>${normalizedLines.map(renderInlineText).join("<br />")}</p>`;
}

function renderMarkdownBlocks(value: string) {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";

  const lines = normalized.split("\n");
  const parts: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const current = lines[index]?.trim() ?? "";
    if (!current) {
      index += 1;
      continue;
    }

    if (current.startsWith("```")) {
      const lang = current.slice(3).trim();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*`{3,}\s*$/.test(lines[index] ?? "")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      const escaped = escapeHtml(codeLines.join("\n"));
      parts.push(
        lang
          ? `<pre><code class="language-${escapeHtml(lang)}">${escaped}</code></pre>`
          : `<pre><code>${escaped}</code></pre>`,
      );
      continue;
    }

    if (isTableBlockStart(lines, index)) {
      const tableLines = [lines[index] ?? "", lines[index + 1] ?? ""];
      let cursor = index + 2;
      while (cursor < lines.length) {
        const next = lines[cursor]?.trim() ?? "";
        if (!next || !next.includes("|")) break;
        tableLines.push(lines[cursor] ?? "");
        cursor += 1;
      }
      parts.push(renderTableBlockFromLines(tableLines));
      index = cursor;
      continue;
    }

    if (HORIZONTAL_RULE_PATTERN.test(current)) {
      parts.push("<hr />");
      index += 1;
      continue;
    }

    const displayMathMatch = current.match(DISPLAY_MATH_LINE_PATTERN);
    if (displayMathMatch) {
      parts.push(renderMathTag(displayMathMatch[1] ?? displayMathMatch[2] ?? "", true));
      index += 1;
      continue;
    }

    if (HEADING_PATTERN.test(current)) {
      parts.push(renderParagraphBlock([lines[index] ?? ""]));
      index += 1;
      continue;
    }

    if (BLOCKQUOTE_PATTERN.test(current)) {
      const quoteLines: string[] = [];
      let cursor = index;
      while (cursor < lines.length) {
        const next = lines[cursor]?.trim() ?? "";
        const quoteMatch = next.match(BLOCKQUOTE_PATTERN);
        if (!quoteMatch) break;
        quoteLines.push(quoteMatch[1] ?? "");
        cursor += 1;
      }
      parts.push(`<blockquote>${renderMarkdownBlocks(quoteLines.join("\n"))}</blockquote>`);
      index = cursor;
      continue;
    }

    if (UNORDERED_LIST_PATTERN.test(current)) {
      const listLines: string[] = [];
      let cursor = index;
      while (cursor < lines.length) {
        const next = lines[cursor]?.trim() ?? "";
        if (!UNORDERED_LIST_PATTERN.test(next)) break;
        listLines.push(next);
        cursor += 1;
      }
      parts.push(renderParagraphBlock(listLines));
      index = cursor;
      continue;
    }

    if (ORDERED_LIST_PATTERN.test(current)) {
      const listLines: string[] = [];
      let cursor = index;
      while (cursor < lines.length) {
        const next = lines[cursor]?.trim() ?? "";
        if (!ORDERED_LIST_PATTERN.test(next)) break;
        listLines.push(next);
        cursor += 1;
      }
      parts.push(renderParagraphBlock(listLines));
      index = cursor;
      continue;
    }

    const paragraphLines: string[] = [];
    let cursor = index;
    while (cursor < lines.length) {
      const next = lines[cursor]?.trim() ?? "";
      if (!next) break;
      if (
        next.startsWith("```") ||
        isTableBlockStart(lines, cursor) ||
        HORIZONTAL_RULE_PATTERN.test(next) ||
        DISPLAY_MATH_LINE_PATTERN.test(next) ||
        HEADING_PATTERN.test(next) ||
        BLOCKQUOTE_PATTERN.test(next) ||
        UNORDERED_LIST_PATTERN.test(next) ||
        ORDERED_LIST_PATTERN.test(next)
      ) {
        break;
      }
      paragraphLines.push(next);
      cursor += 1;
    }

    if (paragraphLines.length > 0) {
      parts.push(renderParagraphBlock(paragraphLines));
      index = cursor;
      continue;
    }

    index += 1;
  }

  return parts.join("");
}

function injectPrefixIntoFirstParagraph(html: string, prefixHtml: string) {
  if (!html.trim()) {
    return `<p>${prefixHtml}</p>`;
  }

  if (html.startsWith("<p>")) {
    return html.replace("<p>", `<p>${prefixHtml}`);
  }

  return `<p>${prefixHtml}</p>${html}`;
}

function renderImageBlock(alt: string, src: string) {
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt || "题目图片")}" />`;
}

function renderContentLeaves(
  blocks: QuestionContentLeaf[] | null | undefined,
  options?: {
    prefixHtml?: string;
  },
) {
  const normalized = (blocks ?? []).filter(Boolean);
  if (normalized.length === 0) {
    return "";
  }

  let didRenderPrefix = false;
  const parts = normalized
    .map((block) => {
      if (block.kind === "text") {
        const html = renderParagraphHtml(block.text);
        if (!html) return "";
        if (!didRenderPrefix && options?.prefixHtml) {
          didRenderPrefix = true;
          return injectPrefixIntoFirstParagraph(html, options.prefixHtml);
        }
        didRenderPrefix = true;
        return html;
      }

      const imageHtml = renderImageBlock(block.alt ?? "", block.src);
      if (!didRenderPrefix && options?.prefixHtml) {
        didRenderPrefix = true;
        return `<p>${options.prefixHtml}</p>${imageHtml}`;
      }
      didRenderPrefix = true;
      return imageHtml;
    })
    .filter(Boolean);

  if (!didRenderPrefix && options?.prefixHtml) {
    parts.unshift(`<p>${options.prefixHtml}</p>`);
  }

  return parts.join("");
}

function renderContentBlock(
  value: string,
  options?: {
    prefixHtml?: string;
  },
) {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized) {
    return options?.prefixHtml ? `<p>${options.prefixHtml}</p>` : "";
  }

  const tokens = tokenizeMarkdownContent(normalized);
  if (tokens.length === 0) {
    const html = renderParagraphHtml(normalized);
    return options?.prefixHtml
      ? injectPrefixIntoFirstParagraph(html, options.prefixHtml)
      : html;
  }

  let didRenderPrefix = false;
  const parts = tokens
    .map((token) => {
      if (token.type === "text") {
        const html = renderParagraphHtml(token.value);
        if (!html) return "";
        if (!didRenderPrefix && options?.prefixHtml) {
          didRenderPrefix = true;
          return injectPrefixIntoFirstParagraph(html, options.prefixHtml);
        }
        didRenderPrefix = true;
        return html;
      }

      const imageHtml = renderImageBlock(token.alt, token.src);
      if (!didRenderPrefix && options?.prefixHtml) {
        didRenderPrefix = true;
        return `<p>${options.prefixHtml}</p>${imageHtml}`;
      }
      didRenderPrefix = true;
      return imageHtml;
    })
    .filter(Boolean);

  if (!didRenderPrefix && options?.prefixHtml) {
    parts.unshift(`<p>${options.prefixHtml}</p>`);
  }

  return parts.join("");
}

function renderHeaderBlock(block: HeaderBlock) {
  const subtitle = block.data.subtitle?.trim();
  const eyebrow = block.data.eyebrow?.trim();
  return [
    '<section data-section="header">',
    eyebrow ? `<p>${renderInlineText(eyebrow)}</p>` : "",
    `<h1>${renderInlineText(block.data.title)}</h1>`,
    subtitle ? renderContentBlock(subtitle) : "",
    "</section>",
  ]
    .filter(Boolean)
    .join("");
}

function renderSectionTitleBlock(block: SectionTitleBlock) {
  const numbering = block.data.numbering?.trim();
  const subtitle = block.data.subtitle?.trim();
  return [
    `<section data-section="${toKebabCase(block.id || block.data.title || "section")}">`,
    numbering
      ? `<h2><strong>${renderInlineText(numbering)}</strong> ${renderInlineText(block.data.title)}</h2>`
      : `<h2>${renderInlineText(block.data.title)}</h2>`,
    subtitle ? renderContentBlock(subtitle) : "",
    "</section>",
  ]
    .filter(Boolean)
    .join("");
}

function renderInstructionBlock(block: InstructionBlock) {
  return [
    `<section data-section="${toKebabCase(block.id || "instruction")}">`,
    renderContentBlock(block.data.text),
    "</section>",
  ].join("");
}

function renderQuestionBlock(block: QuestionBlock) {
  const points =
    typeof block.data.points === "number" && Number.isFinite(block.data.points)
      ? ` data-points="${block.data.points}"`
      : "";
  const difficulty = block.data.difficulty
    ? ` data-difficulty="${escapeHtml(block.data.difficulty)}"`
    : "";
  const instanceId = block.data.instanceId?.trim()
    ? ` data-instance-id="${escapeHtml(block.data.instanceId)}"`
    : "";
  const sourceExerciseId = block.data.sourceExerciseId?.trim()
    ? ` data-source-exercise-id="${escapeHtml(block.data.sourceExerciseId)}"`
    : "";
  const questionType = block.data.questionType
    ? ` data-question-type="${escapeHtml(block.data.questionType)}"`
    : "";
  const number = block.data.number ?? block.id;
  const stem = renderContentLeaves(block.data.stemBlocks, {
    prefixHtml: `<strong>${renderInlineText(`${number}.`)}</strong> `,
  }) || renderContentBlock(block.data.stem, {
    prefixHtml: `<strong>${renderInlineText(`${number}.`)}</strong> `,
  });
  const options =
    block.data.questionType === "mc" && block.data.options.length > 0
      ? `<ol data-options="true" type="A">${block.data.options
          .map((option) => `<li>${renderContentLeaves(option.blocks) || renderContentBlock(option.text)}</li>`)
          .join("")}</ol>`
      : "";
  const answerSpace =
    block.data.questionType === "frq" && block.data.answerSpace
      ? `<div data-answer-space="${escapeHtml(block.data.answerSpace)}"></div>`
      : "";
  const answer =
    "correctAnswer" in block.data &&
    (block.data.answerBlocks?.length || block.data.correctAnswer)
      ? renderContentLeaves(block.data.answerBlocks, {
          prefixHtml: `<strong>答案：</strong>`,
        }) ||
        `<p><strong>答案：</strong>${renderInlineText(
          typeof block.data.correctAnswer === "boolean"
            ? block.data.correctAnswer
              ? "True"
              : "False"
            : block.data.correctAnswer ?? "",
        )}</p>`
      : "";
  const sampleAnswer =
    "sampleAnswer" in block.data &&
    (block.data.sampleAnswerBlocks?.length || block.data.sampleAnswer)
      ? renderContentLeaves(block.data.sampleAnswerBlocks, {
          prefixHtml: `<strong>参考答案：</strong>`,
        }) ||
        `<p><strong>参考答案：</strong>${renderInlineText(block.data.sampleAnswer ?? "")}</p>`
      : "";
  const explanation = block.data.explanationBlocks?.length || block.data.explanation?.trim()
    ? `<blockquote>${
        renderContentLeaves(block.data.explanationBlocks) ||
        renderContentBlock(block.data.explanation ?? "")
      }</blockquote>`
    : "";

  return [
    `<section data-section="${toKebabCase(block.id || `question-${number}`)}">`,
    `<div data-question="${escapeHtml(String(number))}"${points}${difficulty}${instanceId}${sourceExerciseId}${questionType}>`,
    stem,
    options,
    answerSpace,
    answer,
    sampleAnswer,
    explanation,
    "</div>",
    "</section>",
  ]
    .filter(Boolean)
    .join("");
}

function renderAnswerSpaceBlock(block: AnswerSpaceBlock) {
  return `<div data-answer-space="${escapeHtml(block.data.size)}"></div>`;
}

function renderTableBlock(block: TableBlock) {
  const caption = block.data.caption?.trim();
  return [
    `<section data-section="${toKebabCase(block.id || "table")}">`,
    caption ? `<h3>${renderInlineText(caption)}</h3>` : "",
    "<table>",
    block.data.headers.length > 0
      ? `<thead><tr>${block.data.headers
          .map((header) => `<th>${renderInlineText(header)}</th>`)
          .join("")}</tr></thead>`
      : "",
    `<tbody>${block.data.rows
      .map(
        (row) =>
          `<tr>${row
            .map((cell) => `<td>${renderContentBlock(cell) || "<p>—</p>"}</td>`)
            .join("")}</tr>`,
      )
      .join("")}</tbody>`,
    "</table>",
    "</section>",
  ]
    .filter(Boolean)
    .join("");
}

function renderLessonPlanInlineRecordText(value: unknown) {
  return renderInlineText(`${value ?? ""}`);
}

function renderLessonPlanTextBlock(value: unknown) {
  const normalized = `${value ?? ""}`.trim();
  return normalized ? renderContentBlock(normalized) : "";
}

function renderLessonPlanList(items: unknown, ordered = false) {
  if (!Array.isArray(items) || items.length === 0) return "";
  const tag = ordered ? "ol" : "ul";
  return `<${tag}>${items
    .map((item) => `<li>${renderLessonPlanInlineRecordText(item)}</li>`)
    .join("")}</${tag}>`;
}

function renderLessonPlanChoiceList(options: unknown) {
  if (!Array.isArray(options) || options.length === 0) return "";

  return `<ol data-options="true" type="A">${options
    .map((option) => {
      const record =
        option && typeof option === "object"
          ? (option as Record<string, unknown>)
          : {};
      const optionId = `${record.id ?? record.label ?? ""}`.trim();
      const optionText = `${record.text ?? ""}`.trim();
      const labelPrefix = optionId ? `<strong>${renderInlineText(optionId)}.</strong> ` : "";
      return `<li>${labelPrefix}${renderLessonPlanInlineRecordText(optionText)}</li>`;
    })
    .join("")}</ol>`;
}

function renderLessonPlanNestedBlock(block: LessonPlanBlock, mode: DocumentExportMode = "teacher") {
  const content =
    block.content && typeof block.content === "object"
      ? (block.content as Record<string, unknown>)
      : {};

  const showTeacherContent = mode === "teacher";
  const teacherNote = showTeacherContent && block.teacherNote?.trim()
    ? `<blockquote>${renderContentBlock(block.teacherNote)}</blockquote>`
    : "";

  let body = "";
  switch (block.type) {
    case "heading": {
      const level = `${content.level ?? "h3"}`.toLowerCase();
      const tag = level === "h1" || level === "h2" ? level : level === "h4" ? "h4" : "h3";
      body = `<${tag}>${renderLessonPlanInlineRecordText(content.text)}</${tag}>`;
      break;
    }
    case "paragraph":
      body = renderLessonPlanTextBlock(content.text);
      break;
    case "math": {
      const latex = `${content.latex ?? ""}`.trim();
      body = latex ? renderMathTag(latex, Boolean(content.displayMode ?? true)) : "";
      break;
    }
    case "image": {
      const src = `${content.url ?? ""}`.trim();
      if (!src) break;
      const alt = `${content.alt ?? ""}`.trim();
      const caption = `${content.caption ?? alt}`.trim();
      body = [
        "<figure>",
        `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" />`,
        caption ? `<figcaption>${renderInlineText(caption)}</figcaption>` : "",
        "</figure>",
      ]
        .filter(Boolean)
        .join("");
      break;
    }
    case "callout":
      body = [
        "<blockquote>",
        content.title ? `<p><strong>${renderLessonPlanInlineRecordText(content.title)}</strong></p>` : "",
        renderLessonPlanTextBlock(content.text),
        "</blockquote>",
      ]
        .filter(Boolean)
        .join("");
      break;
    case "divider":
      body = "<hr />";
      break;
    case "definition":
      body = [
        "<section>",
        content.term ? `<h3>${renderLessonPlanInlineRecordText(content.term)}</h3>` : "",
        renderLessonPlanTextBlock(content.explanation),
        "</section>",
      ]
        .filter(Boolean)
        .join("");
      break;
    case "example":
      body = [
        "<section>",
        content.prompt ? renderLessonPlanTextBlock(content.prompt) : "",
        renderLessonPlanList(content.steps, true),
        "</section>",
      ]
        .filter(Boolean)
        .join("");
      break;
    case "steps":
      body = [
        "<section>",
        content.title ? `<h3>${renderLessonPlanInlineRecordText(content.title)}</h3>` : "",
        renderLessonPlanList(content.items, true),
        "</section>",
      ]
        .filter(Boolean)
        .join("");
      break;
    case "quiz":
    case "poll":
      body = [
        "<section>",
        content.question ? renderLessonPlanTextBlock(content.question) : "",
        renderLessonPlanChoiceList(content.options),
        showTeacherContent && content.explanation ? `<blockquote>${renderLessonPlanTextBlock(content.explanation)}</blockquote>` : "",
        "</section>",
      ]
        .filter(Boolean)
        .join("");
      break;
    default:
      body = "";
  }

  if (!body && !teacherNote) {
    return "";
  }

  return [
    `<div data-lesson-block-type="${escapeHtml(block.type)}">`,
    body,
    teacherNote,
    "</div>",
  ]
    .filter(Boolean)
    .join("");
}

function renderLessonStepBlock(block: LessonStepBlock, mode: DocumentExportMode = "teacher") {
  const showTeacherContent = mode === "teacher";
  const sortedBlocks = [...(block.data.blocks ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const objectives = block.data.objectives?.length
    ? `<ul>${block.data.objectives
        .map((item) => `<li>${renderInlineText(item)}</li>`)
        .join("")}</ul>`
    : "";
  const activities = block.data.activities?.length
    ? `<ul>${block.data.activities
        .map((item) => `<li>${renderInlineText(item)}</li>`)
        .join("")}</ul>`
    : "";
  const materials = block.data.materials?.length
    ? `<p><strong>材料：</strong>${renderInlineText(block.data.materials.join(" · "))}</p>`
    : "";

  return [
    `<section data-section="${toKebabCase(block.id || block.data.title || "lesson-step")}">`,
    `<h2>${renderInlineText(block.data.title)}${
      typeof block.data.duration === "number" && block.data.duration > 0
        ? ` (${block.data.duration} min)`
        : ""
    }</h2>`,
    block.data.phase?.trim()
      ? `<p><strong>阶段：</strong>${renderInlineText(block.data.phase)}</p>`
      : "",
    block.data.summary?.trim() ? renderContentBlock(block.data.summary) : "",
    objectives,
    activities,
    materials,
    sortedBlocks.map((item) => renderLessonPlanNestedBlock(item, mode)).filter(Boolean).join(""),
    showTeacherContent && block.data.teacherNotes?.trim()
      ? `<blockquote>${renderContentBlock(block.data.teacherNotes)}</blockquote>`
      : "",
    "</section>",
  ]
    .filter(Boolean)
    .join("");
}

function renderBlock(block: DocumentBlock, mode: DocumentExportMode = "teacher") {
  switch (block.type) {
    case "header":
      return renderHeaderBlock(block);
    case "section-title":
      return renderSectionTitleBlock(block);
    case "instruction":
      return renderInstructionBlock(block);
    case "question":
      return renderQuestionBlock(block);
    case "lesson-step":
      return renderLessonStepBlock(block, mode);
    case "table":
      return renderTableBlock(block);
    case "answer-space":
      return renderAnswerSpaceBlock(block);
    case "divider":
      return "<hr />";
    case "page-break":
      return '<hr data-page-break="true" />';
    case "rubric-row":
      return "";
    default:
      return "";
  }
}

export function buildDocumentArticleHtml(document: DocumentModel, mode: DocumentExportMode = "teacher") {
  if (document.type === "rubric") {
    return buildRubricHtmlFromDocument(document);
  }

  const body = document.blocks.map((block) => renderBlock(block, mode)).filter(Boolean).join("");
  return normalizeMathHtml(
    `<article data-doc-type="${escapeHtml(document.type)}">${body}</article>`,
  );
}

export function buildMarkdownContentHtml(markdown: string) {
  const normalized = markdown.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";
  return normalizeMathHtml(renderContentBlock(normalized));
}

export function buildMarkdownArticleHtml(params: {
  documentType: DocumentModel["type"] | string;
  markdown: string;
  title?: string;
  eyebrow?: string;
  subtitle?: string;
}) {
  const normalized = params.markdown.replace(/\r\n?/g, "\n").trim();
  const lines = normalized ? normalized.split("\n") : [];
  while (lines.length > 0) {
    const firstLine = lines[0]?.trim() ?? "";
    if (!firstLine || HORIZONTAL_RULE_PATTERN.test(firstLine)) {
      lines.shift();
      continue;
    }
    break;
  }
  const leadingTitleMatch = lines[0]?.match(/^#\s+(.+)$/);
  const markdownTitle = leadingTitleMatch?.[1]?.trim() ?? "";
  const resolvedTitle = params.title?.trim() || markdownTitle;
  const bodyLines = leadingTitleMatch ? lines.slice(1) : lines;
  while (bodyLines.length > 0 && !bodyLines[0]?.trim()) {
    bodyLines.shift();
  }
  const bodyMarkdown = bodyLines.join("\n").trim();
  const bodyHtml = bodyMarkdown
    ? renderContentBlock(bodyMarkdown)
    : !resolvedTitle && normalized
      ? renderContentBlock(normalized)
      : "";

  const headerHtml =
    params.eyebrow?.trim() || resolvedTitle || params.subtitle?.trim()
      ? [
          '<section data-section="header">',
          params.eyebrow?.trim() ? `<p>${renderInlineText(params.eyebrow)}</p>` : "",
          resolvedTitle ? `<h1>${renderInlineText(resolvedTitle)}</h1>` : "",
          params.subtitle?.trim() ? renderContentBlock(params.subtitle) : "",
          "</section>",
        ]
          .filter(Boolean)
          .join("")
      : "";

  return normalizeMathHtml(
    `<article data-doc-type="${escapeHtml(params.documentType)}">${headerHtml}${bodyHtml}</article>`,
  );
}

export function extractArticleDocumentType(html: string) {
  const match = html.match(/<article\s+data-doc-type="([^"]+)"/i);
  return match?.[1]?.trim() || "notes";
}

export function extractArticleBodyHtml(html: string) {
  const match = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  return match?.[1]?.trim() || html.trim();
}
