import { NextResponse } from "next/server";
import { z } from "zod";
import { optionalNullableUuidLikeSchema } from "@/lib/api/id-schemas";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { InvalidJsonBodyError } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";
import { createManualDocumentAsset } from "@/lib/content-assets/manual-document";
import { normalizeDocumentHtml } from "@/lib/doc-engine/editor-html";

const createManualDocumentSchema = z.object({
  title: z.string().trim().max(200).optional().default(""),
  folderId: optionalNullableUuidLikeSchema,
  htmlContent: z.string().max(600_000).optional().default("<p></p>"),
});

async function parseOptionalBody(request: Request) {
  const raw = await request.text();
  if (!raw.trim()) {
    return createManualDocumentSchema.parse({});
  }

  try {
    return createManualDocumentSchema.parse(JSON.parse(raw));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new InvalidJsonBodyError();
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } =
    await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  try {
    const body = await parseOptionalBody(request);
    const result = await createManualDocumentAsset(
      {
        teacherId,
        supabase,
      },
      {
        title: body.title,
        folderId: body.folderId ?? null,
        htmlContent: normalizeDocumentHtml(body.htmlContent),
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }
    console.error("创建空白内容库文档失败", error);
    return jsonError("INTERNAL_ERROR", "创建空白内容库文档失败", 500);
  }
}
