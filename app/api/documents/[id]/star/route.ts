import { NextResponse } from "next/server";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";
import {
  documentParamsSchema,
  mapDocumentRouteError,
  updateDocumentStarSchema,
} from "@/lib/documents/api";
import { updateDocumentStar } from "@/lib/documents/store";

export async function PUT(
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
    const body = updateDocumentStarSchema.parse(await parseJsonBody(request));
    const result = await updateDocumentStar(
      {
        teacherId,
        supabase,
      },
      params.id,
      body.starred,
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return mapDocumentRouteError(error, "更新文档收藏失败");
    }
    return mapDocumentRouteError(error, "更新文档收藏失败");
  }
}
