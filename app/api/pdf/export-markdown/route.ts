/**
 * POST /api/pdf/export-markdown
 * 将 Markdown 内容渲染为 PDF 并直接返回二进制流。
 * 使用 Typst 引擎替代 Puppeteer 进行渲染。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api/response";
import { ensureTeacher, EnsureTeacherError } from "@/lib/teachers/ensure-teacher";
import { parseJsonBody, InvalidJsonBodyError } from "@/lib/api/request";
import { isAuthBypassEnabled } from "@/lib/auth/bypass";
import { slugifyTitle } from "@/lib/pdf/pdf-service";
import { compileTypstPdf } from "@/lib/typst/compiler";
import { resolveTypstPaper, toTypstString } from "@/lib/typst/render-shared";

export const maxDuration = 30;

const requestSchema = z.object({
  markdown: z.string().min(1).max(200_000),
  title: z.string().max(200).optional(),
  pageSize: z.enum(["A4", "Letter"]).default("A4"),
});

const INLINE_MATH_RE =
  /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^\n$]+?)\$|\\\(([\s\S]+?)\\\)/g;
const TABLE_SEPARATOR_RE = /^\|?\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+\s*\|?$/;

function stripInlineMarkdownDecorators(text: string) {
  return text
    .replace(/\*\*\*(.*?)\*\*\*/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/(?<!\S)\*([^*\n]+?)\*(?!\S)/g, "$1")
    .replace(/(?<!\S)_([^_\n]+?)_(?!\S)/g, "$1");
}

function stripLeadingDuplicateTitleHeading(markdown: string, title: string) {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) return markdown;

  const lines = markdown.replace(/\r/g, "").split("\n");
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex < 0) return markdown;

  const headingMatch = lines[firstContentIndex]?.trim().match(/^#\s+(.+)$/);
  if (!headingMatch) return markdown;
  if (headingMatch[1].trim() !== normalizedTitle) return markdown;

  const remaining = lines.slice(firstContentIndex + 1);
  while (remaining.length > 0 && !remaining[0]?.trim()) {
    remaining.shift();
  }

  return remaining.join("\n");
}

function renderInlineContentToTypst(text: string) {
  const source = stripInlineMarkdownDecorators(text.replace(/\r/g, "").trim());
  if (!source) {
    return `#(${toTypstString("")})`;
  }

  const fragments: string[] = [];
  let lastIndex = 0;

  for (const match of source.matchAll(INLINE_MATH_RE)) {
    const offset = match.index ?? 0;
    if (offset > lastIndex) {
      fragments.push(`#(${toTypstString(source.slice(lastIndex, offset))})`);
    }

    const latex = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? "").trim();
    if (latex) {
      const displayMode = Boolean(match[1] || match[2]);
      fragments.push(
        displayMode
          ? `#align(center)[#block(inset: (x: 10pt, y: 6pt), radius: 8pt, fill: rgb("#f8fafc"), stroke: rgb("#e2e8f0"))[#text(font: ("New Computer Modern", "Times New Roman", "Songti SC"))[#(${toTypstString(latex)})]]]`
          : `#box(inset: (x: 4pt, y: 2pt), radius: 4pt, fill: rgb("#f8fafc"), stroke: rgb("#e2e8f0"))[#text(font: ("New Computer Modern", "Times New Roman", "Songti SC"))[#(${toTypstString(latex)})]]`,
      );
    }

    lastIndex = offset + match[0].length;
  }

  if (lastIndex < source.length) {
    fragments.push(`#(${toTypstString(source.slice(lastIndex))})`);
  }

  return fragments.length > 0 ? fragments.join(" ") : `#(${toTypstString(source)})`;
}

function renderParagraphLinesToTypst(lines: string[]) {
  const cleaned = lines.map((line) => line.trim()).filter(Boolean);
  if (cleaned.length === 0) return "#parbreak()";

  return `#block(width: 100%)[
${cleaned.map((line, index) => `${renderInlineContentToTypst(line)}${index < cleaned.length - 1 ? "\n#linebreak()" : ""}`).join("\n")}
]`;
}

function splitPipeRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function looksLikeTableHeader(line: string, nextLine: string | undefined) {
  if (!line.includes("|")) return false;
  if (!nextLine) return false;
  return TABLE_SEPARATOR_RE.test(nextLine.trim());
}

function renderPipeTableToTypst(lines: string[]) {
  const rows = lines
    .filter((line) => !TABLE_SEPARATOR_RE.test(line.trim()))
    .map((line) => splitPipeRow(line))
    .filter((cells) => cells.some(Boolean));

  if (rows.length < 2) {
    return renderParagraphLinesToTypst(lines);
  }

  const width = Math.max(...rows.map((cells) => cells.length));
  const normalizedRows = rows.map((cells) => {
    const padded = [...cells];
    while (padded.length < width) padded.push("");
    return padded;
  });

  const cellBlocks = normalizedRows.flatMap((cells) =>
    cells.map((cell, columnIndex) =>
      columnIndex === 0
        ? `[${renderInlineContentToTypst(cell || " ")}]`
        : `[${renderInlineContentToTypst(cell || " ")}]`,
    ),
  );

  return `#table(
  columns: (${Array.from({ length: width }, () => "1fr").join(", ")}),
  inset: 6pt,
  stroke: rgb("#dbe4ee"),
  fill: (x, y) => if y == 0 { rgb("#f8fafc") },
  align: (x, y) => if y == 0 { center + horizon } else { left + horizon },
  ${cellBlocks.join(",\n  ")}
)`;
}

function renderListBlock(lines: string[], ordered: boolean) {
  const items = lines
    .map((line) =>
      ordered
        ? line.replace(/^\d+\.\s+/, "").trim()
        : line.replace(/^[-*+]\s+/, "").trim(),
    )
    .filter(Boolean);

  return items
    .map(
      (item, index) => `#table(
  columns: (auto, 1fr),
  stroke: none,
  column-gutter: 8pt,
  [#(${toTypstString(ordered ? `${index + 1}.` : "•")})],
  [${renderInlineContentToTypst(item)}],
)`,
    )
    .join("\n");
}

function renderQuoteBlock(lines: string[]) {
  const content = lines
    .map((line) => line.replace(/^>\s?/, "").trim())
    .filter(Boolean);

  return `#block(inset: (left: 12pt, x: 10pt, y: 8pt), stroke: (left: 3pt + rgb("#d1d5db")), fill: rgb("#fafaf9"))[
${renderParagraphLinesToTypst(content)}
]`;
}

function renderCodeBlock(lines: string[]) {
  const code = lines.join("\n").trimEnd();
  return `#block(inset: 10pt, radius: 8pt, fill: rgb("#0f172a"))[
#text(font: ("SFMono-Regular", "Menlo", "Monaco"), fill: white, size: 9pt)[#(${toTypstString(code)})]
]`;
}

function renderStandaloneMathBlock(line: string) {
  const match =
    line.match(/^\$\$([\s\S]+)\$\$$/) ??
    line.match(/^\\\[([\s\S]+)\\\]$/);
  const latex = match?.[1]?.trim();
  if (!latex) return null;

  return `#align(center)[#block(inset: (x: 12pt, y: 8pt), radius: 8pt, fill: rgb("#f8fafc"), stroke: rgb("#dbe4ee"))[
#text(font: ("New Computer Modern", "Times New Roman", "Songti SC"), size: 11pt)[#(${toTypstString(latex)})]
]]`;
}

/**
 * 将 Markdown 文本转换为 Typst 源码
 * 针对教师内容导出，保留标题、列表、引用、表格与公式的可读排版。
 */
function markdownToTypst(markdown: string, title: string, pageSize: "A4" | "Letter"): string {
  const paper = resolveTypstPaper(pageSize);
  const normalizedMarkdown = stripLeadingDuplicateTitleHeading(markdown, title);
  const lines: string[] = [
    `#import "/base.typ": setup-document`,
    ``,
    `#setup-document(title: ${toTypstString(title)}, paper: ${toTypstString(paper)}, theme: "academic")`,
    ``,
    `#text(size: 18pt, weight: "bold")[#(${toTypstString(title)})]`,
    `#v(12pt)`,
    ``,
  ];

  const sourceLines = normalizedMarkdown.replace(/\r/g, "").split("\n");
  for (let index = 0; index < sourceLines.length; ) {
    const trimmed = sourceLines[index]?.trim() ?? "";
    if (!trimmed) {
      lines.push("#parbreak()");
      index += 1;
      continue;
    }

    const h1 = trimmed.match(/^#\s+(.+)$/);
    if (h1) {
      lines.push(`#text(size: 18pt, weight: "bold")[#(${toTypstString(h1[1])})]\n#v(8pt)`);
      index += 1;
      continue;
    }
    const h2 = trimmed.match(/^##\s+(.+)$/);
    if (h2) {
      lines.push(`#text(size: 15pt, weight: "bold")[#(${toTypstString(h2[1])})]\n#v(6pt)`);
      index += 1;
      continue;
    }
    const h3 = trimmed.match(/^###\s+(.+)$/);
    if (h3) {
      lines.push(`#text(size: 13pt, weight: "bold")[#(${toTypstString(h3[1])})]\n#v(4pt)`);
      index += 1;
      continue;
    }
    const h4 = trimmed.match(/^####\s+(.+)$/);
    if (h4) {
      lines.push(`#text(size: 11pt, weight: "bold")[#(${toTypstString(h4[1])})]\n#v(4pt)`);
      index += 1;
      continue;
    }

    if (/^-{3,}$|^\*{3,}$/.test(trimmed)) {
      lines.push(`#line(length: 100%, stroke: rgb("#d1d5db"))\n#v(6pt)`);
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      let cursor = index + 1;
      while (cursor < sourceLines.length && !sourceLines[cursor]?.trim().startsWith("```")) {
        codeLines.push(sourceLines[cursor] ?? "");
        cursor += 1;
      }
      lines.push(renderCodeBlock(codeLines));
      index = cursor < sourceLines.length ? cursor + 1 : cursor;
      continue;
    }

    const mathBlock = renderStandaloneMathBlock(trimmed);
    if (mathBlock) {
      lines.push(mathBlock);
      index += 1;
      continue;
    }

    if (looksLikeTableHeader(trimmed, sourceLines[index + 1])) {
      const tableLines: string[] = [];
      let cursor = index;
      while (cursor < sourceLines.length && (sourceLines[cursor] ?? "").includes("|")) {
        tableLines.push(sourceLines[cursor] ?? "");
        cursor += 1;
      }
      lines.push(renderPipeTableToTypst(tableLines));
      index = cursor;
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const listLines: string[] = [];
      let cursor = index;
      while (cursor < sourceLines.length && /^[-*+]\s+/.test(sourceLines[cursor]?.trim() ?? "")) {
        listLines.push(sourceLines[cursor] ?? "");
        cursor += 1;
      }
      lines.push(renderListBlock(listLines, false));
      index = cursor;
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const listLines: string[] = [];
      let cursor = index;
      while (cursor < sourceLines.length && /^\d+\.\s+/.test(sourceLines[cursor]?.trim() ?? "")) {
        listLines.push(sourceLines[cursor] ?? "");
        cursor += 1;
      }
      lines.push(renderListBlock(listLines, true));
      index = cursor;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = [];
      let cursor = index;
      while (cursor < sourceLines.length && /^>\s?/.test(sourceLines[cursor]?.trim() ?? "")) {
        quoteLines.push(sourceLines[cursor] ?? "");
        cursor += 1;
      }
      lines.push(renderQuoteBlock(quoteLines));
      index = cursor;
      continue;
    }

    const paragraphLines: string[] = [];
    let cursor = index;
    while (cursor < sourceLines.length) {
      const current = sourceLines[cursor]?.trim() ?? "";
      if (
        !current ||
        /^#{1,4}\s+/.test(current) ||
        /^[-*+]\s+/.test(current) ||
        /^\d+\.\s+/.test(current) ||
        /^>\s?/.test(current) ||
        /^```/.test(current) ||
        /^-{3,}$|^\*{3,}$/.test(current) ||
        looksLikeTableHeader(current, sourceLines[cursor + 1]) ||
        renderStandaloneMathBlock(current)
      ) {
        break;
      }
      paragraphLines.push(sourceLines[cursor] ?? "");
      cursor += 1;
    }

    lines.push(renderParagraphLinesToTypst(paragraphLines));
    index = cursor;
  }

  return lines.join("\n");
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const authBypass = isAuthBypassEnabled();
  if (!user && !authBypass) {
    return jsonError("UNAUTHORIZED", "未授权访问", 401);
  }

  try {
    await ensureTeacher({ supabase, user, authBypass });
  } catch (error) {
    if (error instanceof EnsureTeacherError) {
      return jsonError("UNAUTHORIZED", error.message, error.status);
    }
    throw error;
  }

  let body: z.infer<typeof requestSchema>;
  try {
    const raw = await parseJsonBody(request);
    body = requestSchema.parse(raw);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError || error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数无效", 400);
    }
    throw error;
  }

  const title = body.title || "导出文档";

  try {
    const typstSource = markdownToTypst(body.markdown, title, body.pageSize);
    const pdfBuffer = await compileTypstPdf({
      mainFileContent: typstSource,
    });

    const fileName = `${slugifyTitle(title)}.pdf`;

    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(pdfBuffer.byteLength),
      },
    });
  } catch (error) {
    console.error("PDF 渲染失败", error);
    return jsonError("PDF_RENDER_FAILED", "PDF 渲染失败，请稍后重试", 500);
  }
}
