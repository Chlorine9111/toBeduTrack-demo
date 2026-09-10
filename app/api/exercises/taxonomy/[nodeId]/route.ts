import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { requireRouteActorAnyRole } from "@/lib/auth/require-role";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { manageExerciseTaxonomyNode } from "@/lib/exercises/taxonomy";

const paramsSchema = z.object({
  nodeId: z.string().uuid(),
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("activate"),
  }),
  z.object({
    action: z.literal("reject"),
  }),
  z.object({
    action: z.literal("rename"),
    label: z.string().trim().min(1).max(120),
  }),
  z.object({
    action: z.literal("merge"),
    targetNodeId: z.string().uuid(),
  }),
]);

function mapNodeError(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message === "NODE_NOT_FOUND") {
    return jsonError("NOT_FOUND", "分类节点不存在", 404);
  }
  if (error.message === "NODE_TYPE_MISMATCH") {
    return jsonError("VALIDATION_ERROR", "只能合并同类型节点", 400);
  }
  if (error.message === "NODE_MERGE_SELF") {
    return jsonError("VALIDATION_ERROR", "不能把节点合并到自己", 400);
  }
  if (error.message === "ONLY_CANDIDATE_CAN_REJECT") {
    return jsonError("VALIDATION_ERROR", "只有候选节点可以驳回", 400);
  }
  if (error.message === "TAXONOMY_LABEL_INVALID") {
    return jsonError("VALIDATION_ERROR", "分类名称不合法", 400);
  }
  return null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ nodeId: string }> },
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
    return jsonError("VALIDATION_ERROR", "分类节点 ID 不合法", 400);
  }

  try {
    const body = patchSchema.parse(await parseJsonBody(request));
    await manageExerciseTaxonomyNode({
      supabase,
      teacherId,
      nodeId: parsedParams.data.nodeId,
      input: body,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }
    const mapped = mapNodeError(error);
    if (mapped) return mapped;
    console.error("更新 taxonomy 节点失败", error);
    return jsonError("INTERNAL_ERROR", "更新 taxonomy 节点失败", 500);
  }
}
