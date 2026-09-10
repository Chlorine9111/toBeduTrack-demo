import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { requireRouteActorAnyRole } from "@/lib/auth/require-role";
import { listQuestionBankMaterials } from "@/lib/question-bank/store";

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(300).optional(),
});

function readOptionalParam(params: URLSearchParams, key: string) {
  const value = params.get(key)?.trim();
  return value ? value : undefined;
}

export async function GET(request: Request) {
  const access = await requireRouteActorAnyRole(["subject_teacher", "admin"], {
    nextPath: "/main/agent",
  });
  if (access.response) {
    return access.response;
  }

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

    const items = await listQuestionBankMaterials(
      {
        teacherId,
        supabase,
      },
      {
        query: query.q,
        limit: query.limit,
      },
    );

    return NextResponse.json({
      items,
      total: items.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "资料查询参数不合法", 400, error.flatten());
    }
    console.error("读取题目资料失败", error);
    return jsonError("INTERNAL_ERROR", "读取题目资料失败", 500);
  }
}
