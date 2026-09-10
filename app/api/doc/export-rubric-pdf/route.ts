import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";
import {
  documentModelSchema,
  parseDocumentModel,
} from "@/lib/doc-engine/document-schema";
import { buildDocumentExportSnapshotFromDocument } from "@/lib/doc-engine/export-snapshot";
import { renderDocumentPdf } from "@/lib/doc-engine/export-pdf";

export const maxDuration = 30;

const exportRubricPdfRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  pageSize: z.enum(["A4", "Letter"]).optional(),
  document: documentModelSchema,
});

export async function POST(request: Request) {
  const { teacherId, authBypass, errorMessage, errorStatus } =
    await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  try {
    const body = exportRubricPdfRequestSchema.parse(
      await parseJsonBody<unknown>(request),
    );

    const document = parseDocumentModel(body.document);
    if (!document) {
      return jsonError("VALIDATION_ERROR", "Rubric 文档结构不合法", 400);
    }

    const snapshot = buildDocumentExportSnapshotFromDocument({
      document,
      title: body.title,
      pageSize: body.pageSize ?? document.layoutConfig.pageSize ?? "A4",
      sourceKind: "rubric-visible-download",
    });
    const pdfBuffer = await renderDocumentPdf({
      html: snapshot.html,
      title: snapshot.title,
      layoutConfig: snapshot.layoutConfig,
    });

    const fileName = (snapshot.title || document.title || "rubric")
      .replace(/[/\\?%*:|"<>]/g, "-")
      .trim();

    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName || "rubric")}.pdf"`,
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
        : "Rubric PDF 导出失败",
      500,
    );
  }
}
