import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { getSearchPeek } from "@/lib/search/peek";

const querySchema = z.object({
  type: z.enum([
    "content_library_item",
    "question",
    "lesson_plan",
    "pbl_project",
    "conversation",
  ]),
  id: z.string().uuid(),
});

function readParam(params: URLSearchParams, key: string) {
  const value = params.get(key)?.trim();
  return value ? value : undefined;
}

export async function GET(request: Request) {
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
    const url = new URL(request.url);
    const query = querySchema.parse({
      type: readParam(url.searchParams, "type"),
      id: readParam(url.searchParams, "id"),
    });

    const peek = await getSearchPeek(
      {
        supabase,
        teacherId,
      },
      query,
    );

    if (!peek) {
      return jsonError("NOT_FOUND", "预览内容不存在", 404);
    }

    return NextResponse.json(peek, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "预览参数不合法", 400, error.flatten());
    }

    console.error("读取搜索预览失败", error);
    return jsonError("INTERNAL_ERROR", "读取搜索预览失败", 500);
  }
}
