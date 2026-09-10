import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { requireRouteActorAnyRole } from "@/lib/auth/require-role";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { reclassifyExerciseTaxonomyWithAi } from "@/lib/exercises/taxonomy";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

function mapTaxonomyError(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message === "EXERCISE_NOT_FOUND") {
    return jsonError("NOT_FOUND", "题目不存在", 404);
  }
  return null;
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireRouteActorAnyRole(["subject_teacher", "admin"], {
    nextPath: "/main/agent",
  });
  if (access.response) {
    return access.response;
  }

  const { supabase, teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return jsonError("VALIDATION_ERROR", "题目 ID 不合法", 400);
  }

  try {
    const item = await reclassifyExerciseTaxonomyWithAi({
      supabase,
      teacherId,
      exerciseId: parsedParams.data.id,
    });

    return NextResponse.json({ taxonomy: item });
  } catch (error) {
    const mapped = mapTaxonomyError(error);
    if (mapped) return mapped;
    console.error("AI 重分类失败", error);
    return jsonError("INTERNAL_ERROR", "AI 重分类失败", 500);
  }
}
