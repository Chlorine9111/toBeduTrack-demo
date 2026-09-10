import { ocrPdfWithMistral, ocrImageWithMistral } from "@/lib/pdf-scan/mistral-ocr";
import { isSupportedDocument, parseDocument } from "@/lib/wechat/document-parser";
import { isPdfFile, isImageFile, isDocumentFile } from "@/lib/content-assets/upload";
import {
  extractPdfText,
  isExtractedPdfTextLikelyUsable,
} from "@/lib/content-assets/pdf-text";
import type { ParsedDocument } from "@/lib/wechat/document-parser";

// ── 类型 ──────────────────────────────────────────────────

export type ParseAssetResult = {
  rawText: string;
  pageCount: number | null;
  pageTexts: string[] | null;
  provider: "pdfjs-text" | "mistral-ocr" | "gemini-vision" | "document-parser" | "plain-text";
};

// ── 常量 ──────────────────────────────────────────────────

const TOTAL_TIMEOUT_MS = 120_000;
const PDF_PER_PAGE_TIMEOUT_MS = 30_000;

// ── 全文提取 Prompt ──────────────────────────────────────

const PDF_FULL_TEXT_PROMPT = [
  "Extract ALL text content from this PDF page. Preserve the original structure as much as possible.",
  "Output requirements:",
  "1. Use Markdown heading format for titles/headings.",
  "2. Preserve lists as Markdown lists.",
  "3. If the content contains tables, output as Markdown tables.",
  "4. Include ALL visible text — do not summarize or skip anything.",
  "5. Output only the extracted text, no explanations.",
].join("\n");

const IMAGE_OCR_PROMPT = [
  "Extract ALL readable text from this image. Preserve the original structure.",
  "Output requirements:",
  "1. Use Markdown heading format for titles.",
  "2. Preserve lists as Markdown lists.",
  "3. If the content is a table, output as a Markdown table.",
  "4. Output only the extracted text, no explanations.",
].join("\n");

// ── 超时工具 ──────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} 超时（${Math.round(ms / 1000)}s）`));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// ── PDF 解析（文本层优先，OCR 兜底） ───────────────────────

async function parsePdfWithTextLayer(
  fileBuffer: Buffer,
): Promise<ParseAssetResult | null> {
  const extraction = await withTimeout(
    extractPdfText(fileBuffer),
    TOTAL_TIMEOUT_MS,
    "PDF 文本提取",
  );

  if (!isExtractedPdfTextLikelyUsable(extraction)) {
    return null;
  }

  return {
    rawText: extraction.rawText,
    pageCount: extraction.pageCount,
    pageTexts: extraction.pageTexts,
    provider: "pdfjs-text",
  };
}

async function parsePdfWithMistral(
  fileBuffer: Buffer,
  fileName: string,
): Promise<ParseAssetResult> {
  const ocrResult = await withTimeout(
    ocrPdfWithMistral(fileBuffer, fileName),
    TOTAL_TIMEOUT_MS,
    "Mistral OCR 解析",
  );

  const pageTexts = ocrResult.pages.map((page) => page.markdown);
  const rawText = pageTexts.join("\n\n---\n\n").trim();

  if (!rawText) {
    throw new Error("PDF 未提取到可用文本内容");
  }

  return {
    rawText,
    pageCount: ocrResult.pages.length,
    pageTexts,
    provider: "mistral-ocr",
  };
}

async function parsePdfDocument(
  fileBuffer: Buffer,
  fileName: string,
): Promise<ParseAssetResult> {
  try {
    const textLayerResult = await parsePdfWithTextLayer(fileBuffer);
    if (textLayerResult) {
      return textLayerResult;
    }
  } catch (error) {
    console.warn("[content-assets/parse] PDF 文本层提取失败，回退 OCR", {
      fileName,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return parsePdfWithMistral(fileBuffer, fileName);
}

// ── 图片 OCR（Mistral） ───────────────────────────────────

async function parseImageWithMistral(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<ParseAssetResult> {
  const rawText = await withTimeout(
    ocrImageWithMistral(fileBuffer, mimeType || "image/jpeg"),
    TOTAL_TIMEOUT_MS,
    "Mistral 图片 OCR",
  );

  if (!rawText.trim()) {
    throw new Error("图片未识别到可用文本内容");
  }

  return {
    rawText: rawText.trim(),
    pageCount: 1,
    pageTexts: [rawText.trim()],
    provider: "mistral-ocr",
  };
}

// ── 文档解析（DOCX/PPTX/XLSX/TXT/MD） ───────────────────

async function parseDocumentFile(
  fileBuffer: Buffer,
  fileName: string,
): Promise<ParseAssetResult> {
  const parsed: ParsedDocument = await withTimeout(
    parseDocument(fileBuffer, fileName, { truncate: false }),
    TOTAL_TIMEOUT_MS,
    "文档解析",
  );

  const rawText = (parsed.fullTextContent || parsed.textContent || "").trim();
  if (!rawText) {
    throw new Error("文档未提取到可用文本内容");
  }

  return {
    rawText,
    pageCount: parsed.pageTexts?.length ?? null,
    pageTexts: parsed.pageTexts ?? null,
    provider: "document-parser",
  };
}

// ── 纯文本回退 ───────────────────────────────────────────

function parsePlainText(fileBuffer: Buffer): ParseAssetResult {
  const rawText = fileBuffer.toString("utf-8").trim();
  if (!rawText) {
    throw new Error("文件内容为空");
  }

  return {
    rawText,
    pageCount: null,
    pageTexts: null,
    provider: "plain-text",
  };
}

// ── 主入口 ────────────────────────────────────────────────

export async function parseAssetDocument(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<ParseAssetResult> {
  if (isPdfFile(fileName)) {
    return parsePdfDocument(fileBuffer, fileName);
  }

  if (isImageFile(fileName)) {
    return parseImageWithMistral(fileBuffer, mimeType);
  }

  if (isDocumentFile(fileName) || isSupportedDocument(fileName)) {
    return parseDocumentFile(fileBuffer, fileName);
  }

  // 最后尝试纯文本
  return parsePlainText(fileBuffer);
}
