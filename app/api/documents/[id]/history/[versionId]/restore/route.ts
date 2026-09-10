import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { jsonError } from "@/lib/api/response";
import {
  documentVersionParamsSchema,
  mapDocumentRouteError,
  restoreDocumentVersionSchema,
} from "@/lib/documents/api";
import {
  getDocumentDetail,
  restoreDocumentHistoryVersion,
} from "@/lib/documents/store";

async function parseOptionalRestoreBody(request: Request) {
  const raw = await request.text();
  if (!raw.trim()) {
    return restoreDocumentVersionSchema.parse({});
  }

  try {
    return restoreDocumentVersionSchema.parse(JSON.parse(raw));
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw error;
    }
    throw new Error("INVALID_JSON_BODY");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; versionId: string }> },
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
    const params = documentVersionParamsSchema.parse(await context.params);
    const body = await parseOptionalRestoreBody(request);
    const result = await restoreDocumentHistoryVersion(
      {
        teacherId,
        supabase,
      },
      params.id,
      params.versionId,
      body.expectedVersion,
    );
    const document = await getDocumentDetail(
      {
        teacherId,
        supabase,
      },
      params.id,
    );

    if (!document) {
      return jsonError("NOT_FOUND", "文档不存在", 404);
    }

    return NextResponse.json({
      savedAt: result.savedAt,
      version: result.version,
      document,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_JSON_BODY") {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    return mapDocumentRouteError(error, "恢复历史版本失败");
  }
}
