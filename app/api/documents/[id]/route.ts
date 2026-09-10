import { NextResponse } from "next/server";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { jsonError } from "@/lib/api/response";
import { documentParamsSchema, mapDocumentRouteError } from "@/lib/documents/api";
import { deleteDocument, getDocumentDetail } from "@/lib/documents/store";

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

    return NextResponse.json({ document });
  } catch (error) {
    return mapDocumentRouteError(error, "读取文档失败");
  }
}

export async function DELETE(
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
    const deleted = await deleteDocument(
      {
        teacherId,
        supabase,
      },
      params.id,
    );

    if (!deleted) {
      return jsonError("NOT_FOUND", "文档不存在", 404);
    }

    return NextResponse.json({
      id: params.id,
      deleted: true,
      deletedAt: deleted.deletedAt,
    });
  } catch (error) {
    return mapDocumentRouteError(error, "删除文档失败");
  }
}
