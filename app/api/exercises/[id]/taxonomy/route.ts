import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { requireRouteActorAnyRole } from "@/lib/auth/require-role";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { updateExerciseTaxonomyManually } from "@/lib/exercises/taxonomy";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const patchSchema = z.object({
  clusterLabel: z.string().trim().max(80).nullable().optional(),
  subskillLabel: z.string().trim().max(120).nullable().optional(),
});

function mapTaxonomyError(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message === "EXERCISE_NOT_FOUND") {
    return jsonError("NOT_FOUND", "题目不存在", 404);
  }
  if (error.message === "CLUSTER_REQUIRED") {
    return jsonError("VALIDATION_ERROR", "保存分类时必须提供大类", 400);
  }
  if (error.message === "TAXONOMY_LABEL_INVALID") {
    return jsonError("VALIDATION_ERROR", "分类名称不合法", 400);
  }
  return null;
}

export async function PATCH(
  request: Request,
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
    const body = patchSchema.parse(await parseJsonBody(request));
    const item = await updateExerciseTaxonomyManually({
      supabase,
      teacherId,
      exerciseId: parsedParams.data.id,
      clusterLabel: body.clusterLabel,
      subskillLabel: body.subskillLabel,
    });

    return NextResponse.json({ taxonomy: item });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }
    const mapped = mapTaxonomyError(error);
    if (mapped) return mapped;
    console.error("保存题目 taxonomy 失败", error);
    return jsonError("INTERNAL_ERROR", "保存题目 taxonomy 失败", 500);
  }
}
