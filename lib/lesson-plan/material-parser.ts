import { isSupportedDocument, parseDocument } from "@/lib/wechat/document-parser";
import { runScanPipeline } from "@/lib/pdf-scan/pipeline";

export interface UploadedMaterial {
  fileName: string;
  fileType: string;
  textContent: string;
}

export const MAX_MATERIAL_TEXT = 8000;
export const MAX_MATERIAL_FILES = 5;

export function sanitizeFileName(name: string): string {
  const baseName = name.split(/[/\\]/).pop() || "upload";
  return baseName.replace(/[^\w\u4e00-\u9fff._-]/g, "_").slice(0, 200);
}

export function trimText(text: string, max = MAX_MATERIAL_TEXT): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n...(内容已截断)`;
}

export async function parseMaterialFile(file: File): Promise<UploadedMaterial> {
  const safeName = sanitizeFileName(file.name || `upload-${Date.now()}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  const isPdf = file.type === "application/pdf" || safeName.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    const scanned = await runScanPipeline({
      fileBuffer: buffer,
      fileName: safeName,
      mimeType: file.type || undefined,
      useVision: false,
    });
    const extractedText =
      scanned.textPreview ||
      scanned.questions
        .map((question) => `${question.questionNumber ?? "?"}. ${question.content}`.trim())
        .filter(Boolean)
        .join("\n\n");
    const textContent = trimText(extractedText.trim());
    if (!textContent) {
      throw new Error(`${safeName} 未识别到可用文本`);
    }
    return {
      fileName: safeName,
      fileType: "pdf",
      textContent,
    };
  }

  if (isSupportedDocument(safeName)) {
    const parsed = await parseDocument(buffer, safeName);
    return {
      fileName: parsed.fileName,
      fileType: parsed.fileType,
      textContent: trimText(parsed.textContent),
    };
  }

  const text = trimText(buffer.toString("utf-8").replace(/\u0000/g, " ").trim());
  if (!text) {
    throw new Error(`${safeName} 未识别到可用文本`);
  }

  return {
    fileName: safeName,
    fileType: file.type || "text",
    textContent: text,
  };
}

export async function extractUploadedMaterials(files: File[]): Promise<{
  materials: UploadedMaterial[];
  warnings: string[];
}> {
  const warnings: string[] = [];
  const materials: UploadedMaterial[] = [];

  for (const file of files.slice(0, MAX_MATERIAL_FILES)) {
    try {
      const parsed = await parseMaterialFile(file);
      materials.push(parsed);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `${file.name} 解析失败`);
    }
  }

  return { materials, warnings };
}
