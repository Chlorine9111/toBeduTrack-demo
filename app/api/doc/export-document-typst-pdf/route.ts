import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";
import {
  documentModelSchema,
  parseDocumentModel,
} from "@/lib/doc-engine/document-schema";
import {
  buildExamPdfDataFromDocument,
  buildWorksheetPdfDataFromDocument,
} from "@/lib/pdf/document-typst-mappers";
import { buildRubricPdfDataFromDocument } from "@/lib/pdf/rubric-document-mapper";
import { renderExamTypstPdf } from "@/lib/typst/render-exam";
import { renderRubricTypstPdf } from "@/lib/typst/render-rubric";
import { renderWorksheetTypstPdf } from "@/lib/typst/render-worksheet";

export const maxDuration = 30;

const requestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  pageSize: z.enum(["A4", "Letter"]).optional(),
  document: documentModelSchema,
});

function resolveFileName(title: string, fallback: string) {
  return (title.trim() || fallback).replace(/[/\\?%*:|"<>]/g, "-").trim() || fallback;
}

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
    const body = requestSchema.parse(await parseJsonBody<unknown>(request));
    const document = parseDocumentModel(body.document);

    if (!document) {
      return jsonError("VALIDATION_ERROR", "文档结构不合法", 400);
    }

    const pageSize = body.pageSize ?? document.layoutConfig.pageSize ?? "A4";
    let pdfBuffer: ArrayBuffer | Buffer;
    let fallbackName = document.type;

    if (document.type === "rubric") {
      pdfBuffer = await renderRubricTypstPdf(
        buildRubricPdfDataFromDocument(document),
        {
          pageSize,
          templateVariant: "table",
        },
      );
      fallbackName = "rubric";
    } else if (document.type === "worksheet" || document.type === "exercises") {
      pdfBuffer = await renderWorksheetTypstPdf(
        buildWorksheetPdfDataFromDocument(document),
        {
          pageSize,
          templateVariant: "academic",
        },
      );
      fallbackName = document.type === "worksheet" ? "worksheet" : "exercises";
    } else if (document.type === "exam" || document.type === "quiz") {
      pdfBuffer = await renderExamTypstPdf(
        buildExamPdfDataFromDocument(document),
        {
          pageSize,
          templateVariant: "classic",
        },
      );
      fallbackName = document.type === "exam" ? "exam" : "quiz";
    } else {
      return jsonError(
        "VALIDATION_ERROR",
        "当前文档类型暂不支持统一 Typst 导出",
        400,
      );
    }

    const fileName = resolveFileName(body.title?.trim() || document.title, fallbackName);

    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}.pdf"`,
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
        : "Typst PDF 导出失败",
      500,
    );
  }
}
