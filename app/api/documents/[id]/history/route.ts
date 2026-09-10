import { NextResponse } from "next/server";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { jsonError } from "@/lib/api/response";
import { documentParamsSchema, mapDocumentRouteError } from "@/lib/documents/api";
import { listDocumentHistory } from "@/lib/documents/store";

export async function GET(
  _request: Request,
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
    const items = await listDocumentHistory(
      {
        teacherId,
        supabase,
      },
      params.id,
    );

    return NextResponse.json({ items });
  } catch (error) {
    return mapDocumentRouteError(error, "读取文档历史失败");
  }
}
