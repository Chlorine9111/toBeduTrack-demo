import { z } from "zod";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { requireRouteActorAnyRole } from "@/lib/auth/require-role";
import { getWorksheetProject } from "@/lib/question-bank/worksheet-project-store";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
});

function mapWorksheetProjectError(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message === "ITEM_NOT_FOUND") {
    return jsonError("NOT_FOUND", "组卷工程不存在", 404);
  }
  return null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const access = await requireRouteActorAnyRole(["subject_teacher", "admin"], { nextPath: "/main/agent" });
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
    return jsonError("VALIDATION_ERROR", "组卷工程 ID 不合法", 400);
  }

  try {
    const payload = await getWorksheetProject(
      {
        teacherId,
        supabase,
      },
      parsedParams.data.projectId,
    );

    return NextResponse.json(payload);
  } catch (error) {
    const mapped = mapWorksheetProjectError(error);
    if (mapped) return mapped;
    console.error("读取组卷工程失败", error);
    return jsonError("INTERNAL_ERROR", "读取组卷工程失败", 500);
  }
}
