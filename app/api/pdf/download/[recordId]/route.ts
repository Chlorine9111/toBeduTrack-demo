/**
 * GET /api/pdf/download/:recordId
 * Streams a teacher-owned PDF back to the browser with Content-Disposition attachment.
 *
 * This avoids exposing Supabase signed URLs to the client and works consistently across dev ports.
 */
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { sanitizePdfFileName } from "@/lib/pdf/templates/exam-template";

function buildContentDisposition(filename: string) {
  const safeName = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  const asciiFilename = safeName
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_")
    .trim() || "download.pdf";
  const encodedFilename = encodeURIComponent(safeName).replace(
    /['()]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ recordId: string }> },
) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } =
    await getTeacherContext();

  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  const { recordId } = await params;
  if (!recordId) {
    return jsonError("VALIDATION_ERROR", "recordId 缺失", 400);
  }

  const { data: record, error: recordError } = await supabase
    .from("pdf_documents")
    .select("id,title,file_path,file_size")
    .eq("id", recordId)
    .eq("teacher_id", teacherId)
    .single();

  if (recordError || !record) {
    return jsonError("NOT_FOUND", "未找到 PDF 记录", 404);
  }

  const { data: blob, error: downloadError } = await supabase.storage
    .from("pdfs")
    .download(record.file_path);

  if (downloadError || !blob) {
    return jsonError("INTERNAL_ERROR", "PDF 下载失败", 500);
  }

  const arrayBuffer = await blob.arrayBuffer();
  const title = sanitizePdfFileName(record.title || "download") || "download";
  const contentDisposition = buildContentDisposition(`${title}.pdf`);

  return new NextResponse(arrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition,
      "Content-Length": String(record.file_size ?? arrayBuffer.byteLength),
      // Prevent caching teacher materials in shared environments.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
