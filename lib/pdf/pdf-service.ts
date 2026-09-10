export type PdfPageSize = "A3" | "A4" | "Letter";
export type PdfDocumentType = "exam" | "rubric" | "worksheet" | "lesson_plan";

const PDF_MAX_SIZE_BYTES = 20 * 1024 * 1024;
const SIGNED_URL_EXPIRES = 60 * 60;

export function getPdfSizeLimit() {
  return PDF_MAX_SIZE_BYTES;
}

export function getSignedUrlExpireSeconds() {
  return SIGNED_URL_EXPIRES;
}

export function ensurePdfSizeLimit(buffer: Uint8Array) {
  if (buffer.byteLength > PDF_MAX_SIZE_BYTES) {
    const error = new Error("PDF 文件超过 20MB 限制");
    (error as Error & { code?: string }).code = "PDF_TOO_LARGE";
    throw error;
  }
}

export function countPdfPages(buffer: Uint8Array) {
  const content = Buffer.from(buffer).toString("latin1");
  const matches = content.match(/\/Type\s*\/Page(?!s)\b/g);
  return matches ? matches.length : 0;
}

export function slugifyTitle(value: string) {
  const normalized = value.trim().toLowerCase().normalize("NFKD");
  const asciiSafe = normalized.replace(/[^\x00-\x7F]/g, (char) => {
    const codePoint = char.codePointAt(0);
    return codePoint ? `u${codePoint.toString(16)}` : "-";
  });

  const slug = asciiSafe
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "document";
}

export function formatTimestamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function buildPdfStoragePath(
  teacherId: string,
  documentType: PdfDocumentType,
  title: string,
) {
  const timestamp = formatTimestamp();
  const slug = slugifyTitle(title);
  return `user_${teacherId}/${documentType}/${timestamp}-${slug}.pdf`;
}
