import { NextResponse } from "next/server";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { InvalidJsonBodyError } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";
import {
  documentParamsSchema,
  duplicateDocumentSchema,
  mapDocumentRouteError,
} from "@/lib/documents/api";
import { duplicateDocument } from "@/lib/documents/store";

async function parseOptionalDuplicateBody(request: Request) {
  const raw = await request.text();
  if (!raw.trim()) {
    return duplicateDocumentSchema.parse({});
  }

  try {
    return duplicateDocumentSchema.parse(JSON.parse(raw));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new InvalidJsonBodyError();
    }
    throw error;
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
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

  try {
    const params = documentParamsSchema.parse(await context.params);
    const body = await parseOptionalDuplicateBody(request);
    const document = await duplicateDocument(
      {
        teacherId,
        supabase,
      },
      params.id,
      body.title,
    );

    return NextResponse.json({ document });
  } catch (error) {
    return mapDocumentRouteError(error, "复制文档失败");
  }
}
