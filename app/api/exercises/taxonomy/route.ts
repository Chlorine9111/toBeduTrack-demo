import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { requireRouteActorAnyRole } from "@/lib/auth/require-role";
import { listExerciseTaxonomyNodes } from "@/lib/exercises/taxonomy";

export async function GET() {
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

  try {
    const nodes = await listExerciseTaxonomyNodes({
      supabase,
      teacherId,
    });

    return NextResponse.json({ nodes });
  } catch (error) {
    console.error("读取题目 taxonomy 列表失败", error);
    return jsonError("INTERNAL_ERROR", "读取题目 taxonomy 列表失败", 500);
  }
}
