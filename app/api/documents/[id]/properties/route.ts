import { NextResponse } from "next/server";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";
import {
  documentParamsSchema,
  mapDocumentRouteError,
  updatePropertiesSchema,
} from "@/lib/documents/api";
import {
  getDocumentProperties,
  updateDocumentProperties,
} from "@/lib/documents/store";

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
    const result = await getDocumentProperties(
      {
        teacherId,
        supabase,
      },
      params.id,
    );

    return NextResponse.json(result);
  } catch (error) {
    return mapDocumentRouteError(error, "读取文档属性失败");
  }
}

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
    const body = updatePropertiesSchema.parse(await parseJsonBody(request));
    const result = await updateDocumentProperties(
      {
        teacherId,
        supabase,
      },
      params.id,
      body,
    );

    return NextResponse.json({
      properties: body.properties,
      savedAt: result.savedAt,
      version: result.version,
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return mapDocumentRouteError(error, "更新文档属性失败");
    }
    return mapDocumentRouteError(error, "更新文档属性失败");
  }
}
