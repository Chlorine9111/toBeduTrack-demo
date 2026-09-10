import mammoth from "mammoth";
import * as XLSX from "xlsx";
import JSZip from "jszip";

export interface ParsedDocument {
  fileName: string
  fileType: string
  textContent: string
  fullTextContent: string
  pageTexts?: string[]
}

export interface ParseDocumentOptions {
  truncate?: boolean
  maxTextLength?: number
}

const MAX_TEXT_LENGTH = 15000;

function applyTextLimit(text: string, options?: ParseDocumentOptions): string {
  const shouldTruncate = options?.truncate ?? true;
  if (!shouldTruncate) return text;

  const maxLength = options?.maxTextLength ?? MAX_TEXT_LENGTH;
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "\n...(内容已截断)";
}

async function parseDocx(
  buffer: Buffer,
  fileName: string,
  options?: ParseDocumentOptions,
): Promise<ParsedDocument> {
  const result = await mammoth.extractRawText({ buffer });
  const fullTextContent = result.value.trim();
  return {
    fileName,
    fileType: "docx",
    textContent: applyTextLimit(fullTextContent, options),
    fullTextContent,
  };
}

async function parseXlsx(
  buffer: Buffer,
  fileName: string,
  options?: ParseDocumentOptions,
): Promise<ParsedDocument> {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const lines: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    lines.push(`[工作表: ${sheetName}]`);
    const csv = XLSX.utils.sheet_to_csv(sheet);
    lines.push(csv.trim());
    lines.push("");
  }

  const fullTextContent = lines.join("\n").trim();

  return {
    fileName,
    fileType: "xlsx",
    textContent: applyTextLimit(fullTextContent, options),
    fullTextContent,
  };
}

async function parsePptx(
  buffer: Buffer,
  fileName: string,
  options?: ParseDocumentOptions,
): Promise<ParsedDocument> {
  const zip = await JSZip.loadAsync(buffer);
  const slideTexts: string[] = [];

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort();

  for (const slidePath of slideFiles) {
    const xml = await zip.files[slidePath].async("text");
    const texts = xml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
    const slideContent = texts
      .map((t) => t.replace(/<\/?a:t>/g, "").trim())
      .filter(Boolean)
      .join(" ");
    if (slideContent) {
      const slideNum = slidePath.match(/slide(\d+)/)?.[1] || "?";
      slideTexts.push(`[幻灯片 ${slideNum}] ${slideContent}`);
    }
  }

  const fullTextContent = slideTexts.join("\n").trim() || "(未提取到文本内容)";

  return {
    fileName,
    fileType: "pptx",
    textContent: applyTextLimit(fullTextContent, options),
    fullTextContent,
  };
}

function parsePlainText(
  buffer: Buffer,
  fileName: string,
  fileType: string,
  options?: ParseDocumentOptions,
): ParsedDocument {
  const fullTextContent = buffer.toString("utf-8").trim();
  return {
    fileName,
    fileType,
    textContent: applyTextLimit(fullTextContent, options),
    fullTextContent,
  };
}

function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

const SUPPORTED_EXTENSIONS = new Set(["docx", "doc", "xlsx", "xls", "pptx", "ppt", "txt", "md"]);

export function isSupportedDocument(fileName: string): boolean {
  return SUPPORTED_EXTENSIONS.has(getFileExtension(fileName));
}

export async function parseDocument(
  buffer: Buffer,
  fileName: string,
  options?: ParseDocumentOptions,
): Promise<ParsedDocument> {
  const ext = getFileExtension(fileName);

  switch (ext) {
    case "docx":
    case "doc":
      return parseDocx(buffer, fileName, options);
    case "xlsx":
    case "xls":
      return parseXlsx(buffer, fileName, options);
    case "pptx":
    case "ppt":
      return parsePptx(buffer, fileName, options);
    case "txt":
    case "md":
      return parsePlainText(buffer, fileName, ext, options);
    default:
      throw new Error(`不支持的文件格式: ${ext}`);
  }
}

export function formatDocumentsForPrompt(docs: ParsedDocument[]): string {
  if (docs.length === 0) return "";

  const sections = docs.map(
    (doc) => `--- ${doc.fileName} (${doc.fileType}) ---\n${doc.textContent}`
  );

  return `\n\n【参考文档内容】\n${sections.join("\n\n")}`;
}
