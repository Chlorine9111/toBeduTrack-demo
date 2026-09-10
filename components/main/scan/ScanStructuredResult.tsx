"use client";

import MathText from "@/components/main/chatflow/MathText";
import { cn } from "@/lib/utils";

export type StructuredScanQuestion = {
  questionNumber: number;
  questionType: string;
  stem: string;
  options: Array<{ key: string; content: string }>;
  subQuestions: Array<{ label: string; content: string }>;
  linkedFigures: string[];
  knowledgePoint: string;
  sourceType: string;
  confidence: number;
};

export type StructuredScanFile = {
  uploadId?: string;
  fileName: string;
  contentKind: "question_set" | "material" | "mixed";
  total: number;
  averageConfidence: number;
  lowConfidence: number;
  byTypeText: string;
  analysisReasons: string[];
  previewText: string;
  questions: StructuredScanQuestion[];
  omittedQuestions: number;
  saveStatus?:
    | "saved"
    | "already_saved"
    | "requires_review"
    | "requires_curriculum"
    | "no_questions"
    | "failed";
  savedCount?: number;
  saveMessage?: string;
  saveCourseLabel?: string | null;
  saveUnitLabel?: string | null;
};

export type StructuredScanBatch = {
  totalQuestions: number;
  files: StructuredScanFile[];
};

type RichToken =
  | { type: "text"; value: string }
  | { type: "image"; url: string; alt: string }
  | { type: "table"; value: string };

type ScanStructuredResultProps = {
  result: StructuredScanBatch;
};

const TABULAR_PATTERN = /\\begin\{tabular\}[\s\S]*?\\end\{tabular\}/;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)]\(([^)]+)\)/;
const INCLUDE_GRAPHICS_PATTERN = /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/;
const TABULAR_BEGIN = "\\begin{tabular}";
const TABULAR_END = "\\end{tabular}";
const IMAGE_URL_PATTERN = /^(https?:\/\/|\/)/i;

function normalizeBlockText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toBadgeLabel(kind: StructuredScanFile["contentKind"]) {
  if (kind === "question_set") return "题目集";
  if (kind === "mixed") return "混合内容";
  return "资料模式";
}

function isLikelyUrl(value: string) {
  return IMAGE_URL_PATTERN.test(value.trim());
}

function buildImageAltText(value: string) {
  const normalized = normalizeBlockText(value);
  return normalized || "题目图片";
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
  const content = stripTabularShell(source);
  const rows = splitTopLevel(content, "\\\\")
    .map((row) =>
      splitTopLevel(unwrapMulticolumn(row), "&")
        .map((cell) => normalizeBlockText(cell))
        .filter(
          (cell, index, arr) =>
            cell.length > 0 || arr.some((entry) => entry.length > 0),
        ),
    )
    .filter((row) => row.some((cell) => cell.length > 0));

  return rows;
}

function extractInlineImageUrls(text: string) {
  const urls = new Set<string>();
  const normalized = normalizeBlockText(text);
  if (!normalized) return urls;

  let match: RegExpExecArray | null;
  const markdownRegex = new RegExp(MARKDOWN_IMAGE_PATTERN.source, "g");
  const includeRegex = new RegExp(INCLUDE_GRAPHICS_PATTERN.source, "g");

  while ((match = markdownRegex.exec(normalized)) !== null) {
    const url = normalizeBlockText(match[2] ?? "");
    if (isLikelyUrl(url)) {
      urls.add(url);
    }
  }

  while ((match = includeRegex.exec(normalized)) !== null) {
    const url = normalizeBlockText(match[1] ?? "");
    if (isLikelyUrl(url)) {
      urls.add(url);
    }
  }

  return urls;
}

function ScanImageFigure({
  url,
  alt,
  className,
  imageClassName,
}: {
  url: string;
  alt: string;
  className?: string;
  imageClassName?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={buildImageAltText(alt)}
        data-testid="scan-rich-image"
        loading="eager"
        fetchPriority="high"
        decoding="async"
        referrerPolicy="no-referrer"
        className={cn(
          "max-h-[420px] w-full object-contain bg-white",
          imageClassName,
        )}
      />
      <div className="border-t border-neutral-200 px-3 py-2 text-[11px] text-neutral-500">
        {buildImageAltText(alt)}
      </div>
    </div>
  );
}

function tokenizeRichContent(text: string): RichToken[] {
  const normalized = normalizeBlockText(text);
  if (!normalized) return [];

  const tokens: RichToken[] = [];
  let remaining = normalized;

  while (remaining) {
    const tableMatch = remaining.match(TABULAR_PATTERN);
    const markdownImageMatch = remaining.match(MARKDOWN_IMAGE_PATTERN);
    const includeGraphicsMatch = remaining.match(INCLUDE_GRAPHICS_PATTERN);

    const candidates = [
      tableMatch
        ? {
            type: "table" as const,
            index: tableMatch.index ?? -1,
            match: tableMatch[0],
            extra: "",
          }
        : null,
      markdownImageMatch
        ? {
            type: "image" as const,
            index: markdownImageMatch.index ?? -1,
            match: markdownImageMatch[0],
            extra: markdownImageMatch[2] ?? "",
            alt: markdownImageMatch[1] ?? "",
          }
        : null,
      includeGraphicsMatch
        ? {
            type: "image" as const,
            index: includeGraphicsMatch.index ?? -1,
            match: includeGraphicsMatch[0],
            extra: includeGraphicsMatch[1] ?? "",
            alt: "图像",
          }
        : null,
    ].filter(
      (item): item is NonNullable<typeof item> =>
        item != null && item.index >= 0,
    );

    if (candidates.length === 0) {
      const rest = normalizeBlockText(remaining);
      if (rest) {
        tokens.push({ type: "text", value: rest });
      }
      break;
    }

    const nextToken = candidates.reduce((best, current) =>
      current.index < best.index ? current : best,
    );
    const prefix = normalizeBlockText(remaining.slice(0, nextToken.index));
    if (prefix) {
      tokens.push({ type: "text", value: prefix });
    }

    if (nextToken.type === "table") {
      tokens.push({ type: "table", value: nextToken.match });
    } else {
      const url = normalizeBlockText(nextToken.extra);
      if (url) {
        tokens.push({
          type: "image",
          url,
          alt:
            nextToken.alt && normalizeBlockText(nextToken.alt)
              ? normalizeBlockText(nextToken.alt)
              : "题目图片",
        });
      }
    }

    remaining = remaining.slice(nextToken.index + nextToken.match.length);
  }

  return tokens;
}

function RichScanText({ text }: { text: string }) {
  const tokens = tokenizeRichContent(text);
  if (tokens.length === 0) {
    return (
      <div className="whitespace-pre-wrap wrap-break-word text-sm leading-6 text-neutral-700">
        <MathText text={text} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tokens.map((token, index) => {
        if (token.type === "text") {
          return (
            <div
              key={`${token.type}-${index}`}
              className="whitespace-pre-wrap wrap-break-word text-sm leading-6 text-neutral-700"
            >
              <MathText text={token.value} />
            </div>
          );
        }

        if (token.type === "image") {
          return (
            <ScanImageFigure
              key={`${token.type}-${index}`}
              url={token.url}
              alt={token.alt}
            />
          );
        }

        const rows = parseLatexTable(token.value);
        if (rows.length === 0) {
          return null;
        }

        return (
          <div
            key={`${token.type}-${index}`}
            data-testid="scan-rich-table"
            className="overflow-x-auto rounded-xl border border-neutral-200 bg-white"
          >
            <table className="min-w-full border-collapse text-left text-sm">
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr
                    key={`row-${rowIndex}`}
                    className="border-b border-neutral-200 last:border-b-0"
                  >
                    {row.map((cell, cellIndex) => (
                      <td
                        key={`cell-${rowIndex}-${cellIndex}`}
                        className="min-w-[120px] border-r border-neutral-200 px-3 py-2 align-top last:border-r-0"
                      >
                        <RichScanText text={cell} />
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

export default function ScanStructuredResult({
  result,
}: ScanStructuredResultProps) {
  return (
    <div data-testid="scan-structured-result" className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-neutral-900">文档解析结果</p>
          <p className="text-xs text-neutral-500">
            共 {result.files.length} 个文件，识别 {result.totalQuestions} 道题
          </p>
        </div>
      </div>

      {result.files.map((file, fileIndex) => (
        <section
          key={`${file.fileName}-${fileIndex}`}
          data-testid={`scan-file-${fileIndex}`}
          className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-neutral-900">
                  {file.fileName}
                </h3>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">
                  {toBadgeLabel(file.contentKind)}
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                题数 {file.total} · 平均置信度 {file.averageConfidence} ·
                低置信度 {file.lowConfidence} · 题型分布 {file.byTypeText}
              </p>
            </div>
          </div>

          {file.analysisReasons.length > 0 ? (
            <div className="rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
              判定依据：{file.analysisReasons.join("；")}
            </div>
          ) : null}

          {file.total <= 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-3">
              <p className="mb-2 text-xs font-medium text-neutral-700">
                资料摘要
              </p>
              <RichScanText
                text={file.previewText || "未识别到稳定题号序列。"}
              />
            </div>
          ) : (
            <div className="space-y-4">
              {file.questions.map((question, questionIndex) => {
                const inlineFigureUrls = new Set<string>([
                  ...extractInlineImageUrls(question.stem),
                  ...question.options.flatMap((option) =>
                    Array.from(extractInlineImageUrls(option.content)),
                  ),
                  ...question.subQuestions.flatMap((subQuestion) =>
                    Array.from(extractInlineImageUrls(subQuestion.content)),
                  ),
                ]);
                const linkedFigureUrls = Array.from(
                  new Set(
                    question.linkedFigures.filter((figure) =>
                      isLikelyUrl(figure),
                    ),
                  ),
                );
                const extraFigureUrls = linkedFigureUrls.filter(
                  (url) => !inlineFigureUrls.has(url),
                );
                const figureRefs = question.linkedFigures.filter(
                  (figure) => !isLikelyUrl(figure),
                );

                return (
                  <article
                    key={`${question.questionNumber}-${questionIndex}`}
                    data-testid={`scan-question-${fileIndex}-${questionIndex}`}
                    className="space-y-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-neutral-900 px-2.5 py-0.5 text-[11px] font-medium text-white">
                        第 {question.questionNumber} 题
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-neutral-600">
                        {question.questionType || "未分类"}
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-neutral-500">
                        置信度 {question.confidence}
                      </span>
                      {question.sourceType ? (
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-neutral-500">
                          来源 {question.sourceType}
                        </span>
                      ) : null}
                    </div>

                    <div data-testid="scan-question-stem" className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                        题干
                      </p>
                      <RichScanText text={question.stem} />
                    </div>

                    {question.options.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                          选项
                        </p>
                        <div className="space-y-2">
                          {question.options.map((option) => (
                            <div
                              key={option.key}
                              data-testid={`scan-question-option-${option.key}`}
                              className="rounded-xl border border-neutral-200 bg-white px-3 py-2"
                            >
                              <div className="mb-1 text-xs font-semibold text-neutral-500">
                                {option.key}
                              </div>
                              <RichScanText text={option.content} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {question.subQuestions.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                          子问
                        </p>
                        <div className="space-y-2">
                          {question.subQuestions.map((subQuestion) => (
                            <div
                              key={`${question.questionNumber}-${subQuestion.label}`}
                              className="rounded-xl border border-neutral-200 bg-white px-3 py-2"
                            >
                              <div className="mb-1 text-xs font-semibold text-neutral-500">
                                {subQuestion.label}
                              </div>
                              <RichScanText text={subQuestion.content} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {extraFigureUrls.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                          附加图表
                        </p>
                        <div
                          className={cn(
                            extraFigureUrls.length === 1
                              ? "space-y-3"
                              : "grid gap-3 sm:grid-cols-2 xl:grid-cols-4",
                          )}
                        >
                          {extraFigureUrls.map((url, imageIndex) => (
                            <ScanImageFigure
                              key={`${question.questionNumber}-figure-${imageIndex}`}
                              url={url}
                              alt={`题目图片 ${imageIndex + 1}`}
                              className={extraFigureUrls.length > 1 ? "h-full bg-white" : undefined}
                              imageClassName={
                                extraFigureUrls.length > 1
                                  ? "h-40 w-full object-contain bg-white"
                                  : undefined
                              }
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {figureRefs.length > 0 ? (
                      <div className="text-xs text-neutral-500">
                        图表引用：{figureRefs.join("，")}
                      </div>
                    ) : null}

                    {question.knowledgePoint ? (
                      <div className="text-xs text-neutral-500">
                        知识点：{question.knowledgePoint}
                      </div>
                    ) : null}
                  </article>
                );
              })}

              {file.omittedQuestions > 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-500">
                  其余 {file.omittedQuestions} 道题已折叠，避免页面过长。
                </div>
              ) : null}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
