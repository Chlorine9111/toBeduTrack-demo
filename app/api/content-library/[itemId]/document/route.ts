import { z } from "zod";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { ensureContentLibraryDocument } from "@/lib/content-library/store";

const paramsSchema = z.object({
  itemId: z.string().uuid(),
});

function mapItemError(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message === "ITEM_NOT_FOUND") {
    return jsonError("NOT_FOUND", "内容不存在", 404);
  }
  return null;
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ itemId: string }> },
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

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return jsonError("VALIDATION_ERROR", "内容 ID 不合法", 400);
  }

  try {
    const result = await ensureContentLibraryDocument(
      {
        teacherId,
        supabase,
      },
      parsedParams.data.itemId,
    );

    return NextResponse.json(result);
  } catch (error) {
    const mapped = mapItemError(error);
    if (mapped) return mapped;
    console.error("创建内容文档关联失败", error);
    return jsonError("INTERNAL_ERROR", "创建内容文档关联失败", 500);
  }
}
