import mammoth from "mammoth";

export interface ParsedParagraph {
  index: number;
  type: "heading" | "paragraph" | "list-item";
  level?: number;
  text: string;
  wordCount: number;
  bold?: boolean;
}

export interface ParsedDocument {
  html: string;
  plainText: string;
  paragraphs: ParsedParagraph[];
  embeddedImages: Array<{
    index: number;
    base64: string;
    contentType: string;
  }>;
}

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractText(input: string) {
  return decodeHtmlEntities(input.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

export async function parseDocx(file: File): Promise<ParsedDocument> {
  const arrayBuffer = await file.arrayBuffer();
  return parseDocxBuffer(Buffer.from(arrayBuffer));
}

export async function parseDocxBuffer(buffer: Buffer): Promise<ParsedDocument> {
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.imgElement((image) => {
        return image.read("base64").then((data) => ({
          src: `data:${image.contentType};base64,${data}`,
        }));
      }),
    },
  );

  const html = result.value;
  const paragraphs: ParsedParagraph[] = [];
  const blockRegex = /<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const text = extractText(match[2]);
    if (!text) continue;

    if (/^h[1-6]$/.test(tag)) {
      paragraphs.push({
        index: paragraphs.length,
        type: "heading",
        level: Number(tag[1]),
        text,
        wordCount: text.length,
      });
      continue;
    }

    const innerHtml = match[2];
    const isBold = tag === "p" && /^<strong>[\s\S]*<\/strong>$/.test(innerHtml.trim());

    paragraphs.push({
      index: paragraphs.length,
      type: tag === "li" ? "list-item" : "paragraph",
      text,
      wordCount: text.length,
      ...(isBold ? { bold: true } : {}),
    });
  }

  const embeddedImages = Array.from(
    html.matchAll(/<img[^>]+src=["']data:([^;]+);base64,([^"']+)["'][^>]*>/gi),
  ).map((item, index) => ({
    index,
    contentType: item[1],
    base64: item[2],
  }));

  const plainText = extractText(html);

  return {
    html,
    plainText,
    paragraphs,
    embeddedImages,
  };
}
