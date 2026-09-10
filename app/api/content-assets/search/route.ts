import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { searchAssetSummaries } from "@/lib/content-assets/search";

const querySchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

function readOptionalParam(params: URLSearchParams, key: string) {
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
      q: readOptionalParam(url.searchParams, "q"),
      limit: readOptionalParam(url.searchParams, "limit"),
    });

    const result = await searchAssetSummaries(
      {
        teacherId,
        supabase,
      },
      {
        query: query.q,
        limit: query.limit,
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "内容搜索参数不合法", 400, error.flatten());
    }

    console.error("[content-assets/search] 搜索失败", error);
    return jsonError("INTERNAL_ERROR", "搜索内容失败", 500);
  }
}
