import { randomUUID } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

// ── 常量 ──────────────────────────────────────────────────

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "docx",
  "doc",
  "pptx",
  "ppt",
  "xlsx",
  "xls",
  "txt",
  "md",
  "png",
  "jpg",
  "jpeg",
  "webp",
]);

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

// ── 验证 ──────────────────────────────────────────────────

function getExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

export type ValidateUploadResult =
  | { valid: true }
  | { valid: false; reason: string };

export function validateUploadFile(
  file: File,
  fileName: string,
): ValidateUploadResult {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, reason: `文件超过 50MB 限制（${(file.size / 1024 / 1024).toFixed(1)}MB）` };
  }

  if (file.size === 0) {
    return { valid: false, reason: "文件内容为空" };
  }

  const ext = getExtension(fileName);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      reason: `不支持的文件格式: .${ext}（支持: ${Array.from(ALLOWED_EXTENSIONS).join(", ")}）`,
    };
  }

  const mime = file.type || "";
  if (mime && !ALLOWED_MIME_TYPES.has(mime)) {
    // 允许空 MIME（浏览器可能不识别），但拒绝已知不合法的 MIME
    const isGenericOctetStream = mime === "application/octet-stream";
    if (!isGenericOctetStream) {
      return { valid: false, reason: `不支持的 MIME 类型: ${mime}` };
    }
  }

  return { valid: true };
}

// ── 路径 ──────────────────────────────────────────────────

export function sanitizeFileName(name: string): string {
  const basename = name.split(/[/\\]/).pop() || "upload";
  return basename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

export function buildStoragePath(teacherId: string, sanitizedFileName: string): string {
  return `${teacherId}/${randomUUID()}/${sanitizedFileName}`;
}

// ── Storage 上传 ──────────────────────────────────────────

export async function uploadToStorage(params: {
  teacherId: string;
  fileBuffer: Buffer;
  sanitizedFileName: string;
  mimeType: string;
}): Promise<{ storagePath: string; storageBucket: string }> {
  const admin = createAdminSupabaseClient();
  const storagePath = buildStoragePath(params.teacherId, params.sanitizedFileName);
  const storageBucket = "content-assets";

  const { error } = await admin.storage.from(storageBucket).upload(storagePath, params.fileBuffer, {
    contentType: params.mimeType || "application/octet-stream",
    upsert: false,
  });

  if (error) {
    throw new Error(`上传文件到 Storage 失败: ${error.message}`);
  }

  return { storagePath, storageBucket };
}

// ── 文件类型判断 ──────────────────────────────────────────

export function isPdfFile(fileName: string): boolean {
  return getExtension(fileName) === "pdf";
}

export function isImageFile(fileName: string): boolean {
  const ext = getExtension(fileName);
  return ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp";
}

export function isDocumentFile(fileName: string): boolean {
  const ext = getExtension(fileName);
  return (
    ext === "docx" ||
    ext === "doc" ||
    ext === "pptx" ||
    ext === "ppt" ||
    ext === "xlsx" ||
    ext === "xls" ||
    ext === "txt" ||
    ext === "md"
  );
}
