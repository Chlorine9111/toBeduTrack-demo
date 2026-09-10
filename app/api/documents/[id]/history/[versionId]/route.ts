import { NextResponse } from "next/server";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { jsonError } from "@/lib/api/response";
import {
  documentVersionParamsSchema,
  mapDocumentRouteError,
} from "@/lib/documents/api";
import { getDocumentHistoryVersion } from "@/lib/documents/store";

export async function GET(
  _request: Request,
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
    const version = await getDocumentHistoryVersion(
      {
        teacherId,
        supabase,
      },
      params.id,
      params.versionId,
    );

    if (!version) {
      return jsonError("NOT_FOUND", "历史版本不存在", 404);
    }

    return NextResponse.json({ version });
  } catch (error) {
    return mapDocumentRouteError(error, "读取历史版本失败");
  }
}
