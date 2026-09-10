import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { requireRouteActorAnyRole } from "@/lib/auth/require-role";
import { getQuestionBankQuestionDetail } from "@/lib/question-bank/store";

const paramsSchema = z.object({
  questionId: z.string().uuid(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ questionId: string }> },
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
    return jsonError("VALIDATION_ERROR", "题目 ID 不合法", 400);
  }

  try {
    const detail = await getQuestionBankQuestionDetail(
      {
        teacherId,
        supabase,
      },
      parsedParams.data.questionId,
    );

    if (!detail) {
      return jsonError("NOT_FOUND", "题目不存在", 404);
    }

    return NextResponse.json(detail);
  } catch (error) {
    console.error("读取题目详情失败", error);
    return jsonError("INTERNAL_ERROR", "读取题目详情失败", 500);
  }
}
