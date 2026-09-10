import { z } from "zod";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { requireRouteActorAnyRole } from "@/lib/auth/require-role";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { restoreWorksheetProjectVersion } from "@/lib/question-bank/worksheet-project-store";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
});

const bodySchema = z.object({
  targetVersionNumber: z.number().int().min(1).max(10_000),
});

function mapWorksheetProjectRestoreError(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message === "ITEM_NOT_FOUND") {
    return jsonError("NOT_FOUND", "组卷工程不存在", 404);
  }
  if (error.message === "VERSION_NOT_FOUND") {
    return jsonError("NOT_FOUND", "目标稳定版本不存在", 404);
  }
  return null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
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

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return jsonError("VALIDATION_ERROR", "组卷工程 ID 不合法", 400);
  }

  try {
    const body = bodySchema.parse(
      await parseJsonBody<z.infer<typeof bodySchema>>(request),
    );
    const payload = await restoreWorksheetProjectVersion(
      {
        teacherId,
        supabase,
      },
      {
        projectId: parsedParams.data.projectId,
        targetVersionNumber: body.targetVersionNumber,
      },
    );

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "恢复参数不合法", 400, error.flatten());
    }
    const mapped = mapWorksheetProjectRestoreError(error);
    if (mapped) return mapped;
    console.error("恢复组卷工程失败", error);
    return jsonError("INTERNAL_ERROR", "恢复组卷工程失败", 500);
  }
}
