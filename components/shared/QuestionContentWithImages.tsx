"use client";

import { memo, type ReactNode, useMemo } from "react";
import { buildMarkdownContentHtml } from "@/lib/doc-engine/document-article-html";
import {
  expandHtmlMathMarkup,
  restoreMathTagMarkupToLatex,
} from "@/lib/doc-engine/math-core";
import { cn } from "@/lib/utils";
import QuestionImagePreview from "@/components/shared/QuestionImagePreview";

const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g;
const TABULAR_BEGIN = "\\begin{tabular}";
const TABULAR_END = "\\end{tabular}";
const MARKDOWN_TABLE_LINE_PATTERN = /^\s*\|.*\|\s*$/;
const CONTENT_BLOCK_CACHE_LIMIT = 400;
const RENDERED_HTML_CACHE_LIMIT = 800;
const SHORT_FRAGMENT_LINE_PATTERN =
  /^[\p{L}\p{N}\p{M}+\-−=<>≤≥°%μΩΔ().,/_^{}\\[\]]+$/u;
const OPTION_MARKER_ONLY_PATTERN = /^\(?[A-Ea-e]\)?[.)、．:：]?$/u;
const QUESTION_NUMBER_ONLY_PATTERN = /^\d+[.)、．:：]?$/u;

type MarkdownImageRef = {
  alt: string;
  url: string;
};

const contentBlockCache = new Map<string, ContentBlock[]>();
const renderedHtmlCache = new Map<string, string>();

type QuestionContentWithImagesProps = {
  content: string;
  className?: string;
  textClassName?: string;
  galleryClassName?: string;
  figureClassName?: string;
  imageClassName?: string;
  enableImagePreview?: boolean;
};

export function stripMarkdownImages(content: string) {
  if (!content) return "";
  return restoreMathTagMarkupToLatex(
    content
    .replace(MARKDOWN_IMAGE_PATTERN, (_full, alt, url) => {
      // 可渲染的图片引用移除（会在 gallery 中展示）
      if (isRenderableImageUrl(url?.trim() ?? "")) return "";
      // 不可渲染的保留 alt 文本作为占位提示
      const altText = `${alt ?? ""}`.trim();
      return altText ? `[${altText}]` : "[图片]";
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim(),
  );
}

function preloadBlockRender(block: ContentBlock) {
  if (block.type === "text") {
    getRenderedTextHtml(block.value);
    return;
  }

  const rows =
    block.type === "latex-table"
      ? parseLatexTable(block.value)
      : parseMarkdownPipeTable(block.value);

  rows.forEach((row) => {
    row.forEach((cell) => {
      getRenderedTextHtml(cell);
    });
  });
}

export function preloadQuestionContentRender(content: string) {
  const text = stripMarkdownImages(content);
  if (!text) return;

  getContentBlocks(text).forEach(preloadBlockRender);
}

function normalizeBlockText(text: string) {
  return collapseSuspiciousFragmentRuns(
    text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n"),
  ).trim();
}

function isSuspiciousShortFragmentLine(line: string) {
  const compact = line.trim().replace(/\s+/g, "");
  if (!compact) return false;
  if (compact.length > 8) return false;
  if (OPTION_MARKER_ONLY_PATTERN.test(compact)) return false;
  if (QUESTION_NUMBER_ONLY_PATTERN.test(compact)) return false;
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
  if (OPTION_MARKER_ONLY_PATTERN.test(trimmed)) return false;
  if (QUESTION_NUMBER_ONLY_PATTERN.test(trimmed)) return false;
  if (/^(?:\\begin\{tabular\}|\\end\{tabular\}|\\hline\b)/.test(trimmed)) {
    return false;
  }
  return true;
}

function collapseSuspiciousFragmentRuns(text: string) {
  const lines = text.split("\n");
  const merged: string[] = [];

  for (let index = 0; index < lines.length; ) {
    const current = lines[index];
    if (!isSuspiciousShortFragmentLine(current)) {
      merged.push(current);
      index += 1;
      continue;
    }

    const fragments: string[] = [];
    let cursor = index;
    while (
      cursor < lines.length &&
      isSuspiciousShortFragmentLine(lines[cursor])
    ) {
      fragments.push(lines[cursor].trim().replace(/\s+/g, ""));
      cursor += 1;
    }

    if (fragments.length < 2) {
      merged.push(current);
      index += 1;
      continue;
    }

    const compact = dedupeRepeatedFragmentText(fragments.join(""));
    const prevIndex = merged.length - 1;
    const previous = prevIndex >= 0 ? merged[prevIndex] : "";
    if (previous && previous.trim() && !/[|&]$/.test(previous.trim())) {
      let nextValue = `${previous.replace(/[ \t]+$/g, "")} ${compact}`.replace(
        /\s{2,}/g,
        " ",
      );
      if (shouldInlineMergeContinuationLine(lines[cursor] ?? "")) {
        nextValue = `${nextValue} ${lines[cursor].trim()}`.replace(
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

  return merged.join("\n").replace(/\n{3,}/g, "\n\n");
}

function splitTopLevel(content: string, separator: "&" | "\\\\") {
  const result: string[] = [];
  let buffer = "";
  let braceDepth = 0;
  let tabularDepth = 0;

  for (let index = 0; index < content.length; index += 1) {
    if (content.startsWith(TABULAR_BEGIN, index)) {
      tabularDepth += 1;
      buffer += TABULAR_BEGIN;
      index += TABULAR_BEGIN.length - 1;
      continue;
    }

    if (content.startsWith(TABULAR_END, index)) {
      tabularDepth = Math.max(0, tabularDepth - 1);
      buffer += TABULAR_END;
      index += TABULAR_END.length - 1;
      continue;
    }

    if (
      separator === "\\\\" &&
      content.startsWith("\\\\", index) &&
      braceDepth === 0 &&
      tabularDepth === 0
    ) {
      result.push(buffer.trim());
      buffer = "";
      index += 1;
      continue;
    }

    const char = content[index];
    if (
      separator === "&" &&
      char === "&" &&
      braceDepth === 0 &&
      tabularDepth === 0
    ) {
      result.push(buffer.trim());
      buffer = "";
      continue;
    }

    if (char === "{") {
      braceDepth += 1;
    } else if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
    }

    buffer += char;
  }

  result.push(buffer.trim());
  return result;
}

function stripTabularShell(source: string) {
  return source
    .replace(/^\\begin\{tabular\}\{[^}]*\}/, "")
    .replace(/\\end\{tabular\}$/, "")
    .replace(/\\hline/g, "")
    .trim();
}

function unwrapMulticolumn(cell: string) {
  return cell.replace(/\\multicolumn\{\d+\}\{[^}]*\}\{([\s\S]*?)\}/g, "$1");
}

function parseLatexTable(source: string) {
  return splitTopLevel(stripTabularShell(source), "\\\\")
    .map((row) =>
      splitTopLevel(unwrapMulticolumn(row), "&")
        .map((cell) => normalizeBlockText(cell))
        .filter(
          (cell, index, arr) =>
            cell.length > 0 || arr.some((entry) => entry.length > 0),
        ),
    )
    .filter((row) => row.some((cell) => cell.length > 0));
}

function splitMarkdownTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => normalizeBlockText(cell));
}

function isMarkdownTableDividerRow(row: string[]) {
  return (
    row.length > 1 &&
    row.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s+/g, "")))
  );
}

function parseMarkdownPipeTable(lines: string[]) {
  const rows = lines
    .map(splitMarkdownTableRow)
    .filter(
      (row) => row.length > 1 && row.some((cell) => cell.length > 0),
    );

  if (rows.length < 2) return [];

  const bodyRows =
    rows.length >= 2 && isMarkdownTableDividerRow(rows[1])
      ? [rows[0], ...rows.slice(2)]
      : rows;

  return bodyRows.filter(
    (row) => row.length > 1 && row.some((cell) => cell.length > 0),
  );
}

type ContentBlock =
  | { type: "text"; value: string }
  | { type: "latex-table"; value: string }
  | { type: "markdown-table"; value: string[] };

function splitContentBlocks(content: string): ContentBlock[] {
  const normalized = normalizeBlockText(content);
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const blocks: ContentBlock[] = [];
  let textBuffer: string[] = [];

  function flushText() {
    if (textBuffer.length === 0) return;
    const value = normalizeBlockText(textBuffer.join("\n"));
    textBuffer = [];
    if (value) {
      blocks.push({ type: "text", value });
    }
  }

  for (let index = 0; index < lines.length; ) {
    const current = lines[index];

    if (current.includes(TABULAR_BEGIN)) {
      flushText();
      const tableLines = [current];
      index += 1;
      while (index < lines.length) {
        tableLines.push(lines[index]);
        if (lines[index].includes(TABULAR_END)) {
          index += 1;
          break;
        }
        index += 1;
      }
      blocks.push({
        type: "latex-table",
        value: tableLines.join("\n"),
      });
      continue;
    }

    if (MARKDOWN_TABLE_LINE_PATTERN.test(current)) {
      const tableLines = [current];
      let cursor = index + 1;
      while (
        cursor < lines.length &&
        MARKDOWN_TABLE_LINE_PATTERN.test(lines[cursor])
      ) {
        tableLines.push(lines[cursor]);
        cursor += 1;
      }

      if (parseMarkdownPipeTable(tableLines).length > 0) {
        flushText();
        blocks.push({
          type: "markdown-table",
          value: tableLines,
        });
        index = cursor;
        continue;
      }
    }

    textBuffer.push(current);
    index += 1;
  }

  flushText();
  return blocks;
}

function readCacheValue<T>(cache: Map<string, T>, key: string) {
  const cached = cache.get(key);
  if (cached === undefined) return null;
  cache.delete(key);
  cache.set(key, cached);
  return cached;
}

function writeCacheValue<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  limit: number,
) {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);

  if (cache.size > limit) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }

  return value;
}

function getContentBlocks(content: string) {
  const normalized = normalizeBlockText(content);
  if (!normalized) return [];

  const cached = readCacheValue(contentBlockCache, normalized);
  if (cached) {
    return cached;
  }

  return writeCacheValue(
    contentBlockCache,
    normalized,
    splitContentBlocks(normalized),
    CONTENT_BLOCK_CACHE_LIMIT,
  );
}

function getRenderedTextHtml(text: string) {
  const normalized = normalizeBlockText(text);
  if (!normalized) return "";

  const cached = readCacheValue(renderedHtmlCache, normalized);
  if (cached !== null) {
    return cached;
  }

  return writeCacheValue(
    renderedHtmlCache,
    normalized,
    expandHtmlMathMarkup(buildMarkdownContentHtml(normalized)),
    RENDERED_HTML_CACHE_LIMIT,
  );
}

function renderTextWithTables(text: string, textClassName?: string): ReactNode {
  const blocks = getContentBlocks(text);
  if (blocks.length === 0) return null;

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        if (block.type === "text") {
          const html = getRenderedTextHtml(block.value);
          if (!html) return null;

          return (
            <div
              key={`${block.type}-${index}`}
              className={cn(
                "break-words [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-200 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_ol]:my-2 [&_ol]:pl-5 [&_p]:my-0 [&_p+p]:mt-3 [&_table]:w-full [&_td]:align-top [&_th]:align-top [&_ul]:my-2 [&_ul]:pl-5",
                textClassName,
              )}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        }

        const rows =
          block.type === "latex-table"
            ? parseLatexTable(block.value)
            : parseMarkdownPipeTable(block.value);
        if (rows.length === 0) return null;

        return (
          <div
            key={`${block.type}-${index}`}
            className="overflow-x-auto rounded-xl border border-slate-200 bg-white"
          >
            <table className="min-w-full border-collapse text-left text-sm">
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr
                    key={`row-${rowIndex}`}
                    className="border-b border-slate-200 last:border-b-0"
                  >
                    {row.map((cell, cellIndex) => (
                      <td
                        key={`cell-${rowIndex}-${cellIndex}`}
                        className="min-w-[120px] border-r border-slate-200 px-3 py-2 align-top last:border-r-0"
                      >
                        {renderTextWithTables(cell, textClassName)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function isRenderableImageUrl(url: string) {
  if (!url) return false;
  if (url.startsWith("http://") || url.startsWith("https://")) return true;
  if (url.startsWith("/api/")) return true;
  if (url.startsWith("data:image/")) return true;
  return false;
}

export function extractMarkdownImages(content: string): MarkdownImageRef[] {
  if (!content) return [];
  const seen = new Set<string>();
  const images: MarkdownImageRef[] = [];

  for (const match of content.matchAll(MARKDOWN_IMAGE_PATTERN)) {
    const alt = `${match[1] ?? ""}`.trim();
    const url = `${match[2] ?? ""}`.trim();
    if (!url || seen.has(url)) continue;
    if (!isRenderableImageUrl(url)) continue;
    seen.add(url);
    images.push({
      alt,
      url,
    });
  }

  return images;
}

function QuestionContentWithImages(props: QuestionContentWithImagesProps) {
  const content = props.content ?? "";
  const parsed = useMemo(
    () => ({
      text: stripMarkdownImages(content),
      images: extractMarkdownImages(content),
    }),
    [content],
  );

  if (!parsed.text && parsed.images.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-3", props.className)}>
      {parsed.text ? (
        renderTextWithTables(parsed.text, props.textClassName)
      ) : null}

      {parsed.images.length > 0 ? (
        <div
          className={cn(
            parsed.images.length === 1
              ? "space-y-3"
              : "grid gap-3 sm:grid-cols-2 xl:grid-cols-4",
            props.galleryClassName,
          )}
        >
          {parsed.images.map((image, index) => (
            <div
              key={`${image.url}-${index}`}
              className={cn(
                "overflow-hidden rounded-xl border border-slate-200 bg-slate-50",
                props.figureClassName,
              )}
            >
              {props.enableImagePreview ? (
                <QuestionImagePreview
                  src={image.url}
                  alt={image.alt || `题目图片 ${index + 1}`}
                  buttonClassName="w-full"
                  className={cn(
                    "w-full bg-white object-contain",
                    props.imageClassName,
                  )}
                />
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={image.alt || `题目图片 ${index + 1}`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className={cn(
                      "w-full bg-white object-contain",
                      props.imageClassName,
                    )}
                  />
                </>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default memo(QuestionContentWithImages);
