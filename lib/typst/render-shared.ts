import path from "node:path";
import type { PdfPageSize } from "@/lib/pdf/pdf-service";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { TypstBinaryAsset } from "@/lib/typst/compiler";
import { renderDisplayTypstMath, renderInlineTypstMath } from "@/lib/typst/math";

const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\((.*?)\)/g;
const INLINE_MATH_RE =
  /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^\n$]+?)\$|\\\(([\s\S]+?)\\\)/g;
const DEFAULT_APP_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://127.0.0.1:3001";
const QUESTION_IMAGE_BUCKET = process.env.QUESTION_IMAGE_BUCKET ?? "pdfs";

export function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

// Unicode ranges covering common emoji blocks
const EMOJI_RE =
  /[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

// Decorative headers that LLMs sometimes prepend to questions
const DECORATIVE_HEADER_RE = /^(?:Question|Problem|题目|问题|Ex(?:ercise)?)\s*\d*[.:：]?\s*/gim;

/**
 * Strip markdown formatting, emoji, and decorative elements from text.
 * Preserves LaTeX math ($...$, $$...$$) and plain content.
 */
export function sanitizeTextForTypst(text: string): string {
  if (!text) return "";

  // 1. Extract and protect LaTeX math segments
  const mathSegments: string[] = [];
  const MATH_HOLDER = "\x00M";
  let result = text.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+?\$/g, (match) => {
    mathSegments.push(match);
    return `${MATH_HOLDER}${mathSegments.length - 1}\x00`;
  });

  // 2. Strip emoji
  result = result.replace(EMOJI_RE, "");

  // 3. Strip decorative headers
  result = result.replace(DECORATIVE_HEADER_RE, "");

  // 4. Strip markdown heading markers (# ## ### etc.)
  result = result.replace(/^#{1,6}\s+/gm, "");

  // 5. Strip bold/italic markers but keep content
  result = result.replace(/\*\*\*(.*?)\*\*\*/g, "$1");
  result = result.replace(/\*\*(.*?)\*\*/g, "$1");
  result = result.replace(/(?<!\S)\*([^*\n]+?)\*(?!\S)/g, "$1");

  // 6. Strip blockquote markers
  result = result.replace(/^>\s*/gm, "");

  // 7. Strip unordered list markers at start of line
  result = result.replace(/^[-*+]\s+/gm, "");

  // 8. Strip horizontal rules
  result = result.replace(/^[-*_]{3,}\s*$/gm, "");

  // 9. Strip inline code backticks (keep content)
  result = result.replace(/`([^`]+)`/g, "$1");

  // 10. Restore LaTeX math segments
  for (let i = 0; i < mathSegments.length; i++) {
    result = result.replace(`${MATH_HOLDER}${i}\x00`, mathSegments[i]);
  }

  // 11. Clean up excessive blank lines
  result = result.replace(/\n{3,}/g, "\n\n");

  return result.trim();
}

export function toTypstString(value: string | null | undefined) {
  return JSON.stringify(`${value ?? ""}`);
}

export function resolveTypstPaper(pageSize: PdfPageSize | "A4" | "Letter" | "A3") {
  if (pageSize === "A4") return "a4";
  if (pageSize === "A3") return "a3";
  return "us-letter";
}

function guessFileExtension(url: string, contentType: string | null) {
  const normalizedType = `${contentType ?? ""}`.toLowerCase();
  if (normalizedType.includes("png")) return "png";
  if (normalizedType.includes("jpeg") || normalizedType.includes("jpg")) return "jpg";
  if (normalizedType.includes("webp")) return "webp";
  if (normalizedType.includes("gif")) return "gif";

  const pathname = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  })();

  const extension = path.extname(pathname).replace(".", "").toLowerCase();
  return extension || "png";
}

function resolveAssetUrl(url: string) {
  const normalized = cleanText(url);
  if (!normalized) return normalized;
  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  return new URL(
    normalized.startsWith("/") ? normalized : `/${normalized}`,
    DEFAULT_APP_BASE_URL,
  ).toString();
}

function extractQuestionImageStoragePath(url: string) {
  try {
    const absolute = new URL(resolveAssetUrl(url));
    if (!/\/api\/pdf\/scan-image$/i.test(absolute.pathname)) {
      return null;
    }

    const pathValue = absolute.searchParams.get("path");
    return cleanText(pathValue) || null;
  } catch {
    return null;
  }
}

async function downloadStoredQuestionImage(storagePath: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.storage.from(QUESTION_IMAGE_BUCKET).download(storagePath);
  if (error || !data) {
    return null;
  }

  return {
    buffer: Buffer.from(await data.arrayBuffer()),
    contentType: data.type ?? null,
  };
}

export class TypstAssetStore {
  private readonly urlToPath = new Map<string, string>();
  private readonly assets: TypstBinaryAsset[] = [];
  private counter = 0;

  constructor(private readonly prefix: string) {}

  async ensureRemoteImage(url: string) {
    const normalizedUrl = resolveAssetUrl(url);
    if (!normalizedUrl) {
      return null;
    }

    const cached = this.urlToPath.get(normalizedUrl);
    if (cached) {
      return cached;
    }

    const storagePath = extractQuestionImageStoragePath(url);
    const downloaded = storagePath
      ? await downloadStoredQuestionImage(storagePath)
      : await (async () => {
          const response = await fetch(normalizedUrl);
          if (!response.ok) {
            throw new Error(`下载图片失败: ${response.status}`);
          }

          return {
            buffer: Buffer.from(await response.arrayBuffer()),
            contentType: response.headers.get("content-type"),
          };
        })();

    if (!downloaded) {
      throw new Error("下载图片失败");
    }

    const extension = guessFileExtension(normalizedUrl, downloaded.contentType);
    const assetPath = `/assets/${this.prefix}-${this.counter}.${extension}`;
    this.counter += 1;
    this.assets.push({ path: assetPath, data: downloaded.buffer });
    this.urlToPath.set(normalizedUrl, assetPath);
    return assetPath;
  }

  registerInlineAsset(assetPath: string, data: Buffer) {
    if (this.urlToPath.has(assetPath)) return;
    this.assets.push({ path: assetPath, data });
    this.urlToPath.set(assetPath, assetPath);
  }

  list() {
    return this.assets;
  }
}

async function appendTextBlocks(text: string, blocks: string[]) {
  const paragraphs = text
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const lines = paragraph
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    lines.forEach((line, lineIndex) => {
      const trimmedLine = line.trim();
      const displayMathMatch =
        trimmedLine.match(/^\$\$([\s\S]+)\$\$$/) ??
        trimmedLine.match(/^\\\[([\s\S]+)\\\]$/);
      if (displayMathMatch?.[1]) {
        blocks.push(renderDisplayTypstMath(displayMathMatch[1]));
      } else {
        const fragments: string[] = [];
        let lastIndex = 0;

        for (const match of trimmedLine.matchAll(INLINE_MATH_RE)) {
          const offset = match.index ?? 0;
          if (offset > lastIndex) {
            fragments.push(`#(${toTypstString(trimmedLine.slice(lastIndex, offset))})`);
          }

          const latex = `${match[1] ?? match[2] ?? match[3] ?? match[4] ?? ""}`.trim();
          if (latex) {
            const isDisplay = Boolean(match[1] || match[2]);
            fragments.push(isDisplay ? renderDisplayTypstMath(latex) : renderInlineTypstMath(latex));
          }

          lastIndex = offset + match[0].length;
        }

        if (lastIndex < trimmedLine.length) {
          fragments.push(`#(${toTypstString(trimmedLine.slice(lastIndex))})`);
        }

        blocks.push(fragments.length > 0 ? fragments.join(" ") : `#(${toTypstString(trimmedLine)})`);
      }
      if (lineIndex < lines.length - 1) {
        blocks.push("#linebreak()");
      }
    });

    if (paragraphIndex < paragraphs.length - 1) {
      blocks.push("#parbreak()");
    }
  });
}

export async function renderMarkdownContentToTypst(
  markdown: string | null | undefined,
  assetStore: TypstAssetStore,
) {
  const source = sanitizeTextForTypst(`${markdown ?? ""}`);
  const blocks: string[] = [];
  let cursor = 0;

  for (const match of source.matchAll(MARKDOWN_IMAGE_RE)) {
    const start = match.index ?? 0;
    const before = source.slice(cursor, start);
    await appendTextBlocks(before, blocks);

    const alt = cleanText(match[1]) || "附图";
    const url = cleanText(match[2]);
    try {
      const assetPath = await assetStore.ensureRemoteImage(url);
      if (assetPath) {
        blocks.push(`#align(center)[#image(${toTypstString(assetPath)}, width: 78%)]`);
        if (alt) {
          blocks.push(
            `#align(center)[#text(size: 8pt, fill: rgb("#6b7280"))[#(${toTypstString(alt)})]]`,
          );
        }
      }
    } catch {
      blocks.push(`#(${toTypstString(`图片加载失败：${alt}`)})`);
    }
    blocks.push("#parbreak()");
    cursor = start + match[0].length;
  }

  await appendTextBlocks(source.slice(cursor), blocks);

  while (blocks[blocks.length - 1] === "#parbreak()") {
    blocks.pop();
  }

  return blocks.length > 0 ? blocks.join("\n") : `#(${toTypstString("（暂无内容）")})`;
}

export async function renderBulletListToTypst(
  items: Array<string | null | undefined>,
  assetStore: TypstAssetStore,
) {
  const cleanItems = items.map((item) => `${item ?? ""}`.trim()).filter(Boolean);
  if (cleanItems.length === 0) {
    return `#(${toTypstString("（暂无内容）")})`;
  }

  const rows: string[] = [];
  for (const item of cleanItems) {
    rows.push(
      `#table(
  columns: (auto, 1fr),
  stroke: none,
  column-gutter: 10pt,
  [#(${toTypstString("•")})],
  [
${await renderMarkdownContentToTypst(item, assetStore)}
  ],
)`,
    );
  }

  return rows.join("\n#v(4pt)\n");
}

export function getRecordString(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const raw = Reflect.get(value, key);
  return typeof raw === "string" ? raw : "";
}

export function getRecordStringArray(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [] as string[];
  }

  const raw = Reflect.get(value, key);
  if (!Array.isArray(raw)) {
    return [] as string[];
  }

  return raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}
