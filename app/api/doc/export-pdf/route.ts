import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";
import { normalizeDocumentHtml } from "@/lib/doc-engine/editor-html";
import { renderDocumentPdf } from "@/lib/doc-engine/export-pdf";
import { docExportPdfRequestSchema } from "@/lib/doc-engine/request-schema";

export const maxDuration = 30;

export async function POST(request: Request) {
  const { teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  try {
    const body = docExportPdfRequestSchema.parse(await parseJsonBody<unknown>(request));
    const pdfBuffer = await renderDocumentPdf({
      html: normalizeDocumentHtml(body.html),
      title: body.title,
      layoutConfig: body.layoutConfig,
    });

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(
          (body.title?.trim() || "document").replace(/[/\\?%*:|"<>]/g, "-"),
        )}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是合法 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }
    return jsonError(
      "PDF_RENDER_FAILED",
      error instanceof Error && error.message.trim()
        ? error.message
        : "PDF 导出失败",
      500,
    );
  }
}
