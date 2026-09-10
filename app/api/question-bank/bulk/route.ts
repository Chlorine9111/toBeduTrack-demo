import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { requireRouteActorAnyRole } from "@/lib/auth/require-role";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { uuidLikeSchema } from "@/lib/api/id-schemas";
import { deleteQuestionBankExercises } from "@/lib/question-bank/delete";

const bulkSchema = z.object({
  action: z.literal("delete"),
  questionIds: z.array(uuidLikeSchema).min(1).max(500),
});

export async function POST(request: Request) {
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
    const body = bulkSchema.parse(await parseJsonBody(request));
    const result = await deleteQuestionBankExercises(
      {
        teacherId,
        supabase,
      },
      body.questionIds,
    );

    return NextResponse.json({
      ...result,
      deletedCount: result.deletedIds.length,
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "批量删除参数不合法", 400, error.flatten());
    }
    console.error("批量删除题目失败", error);
    return jsonError("INTERNAL_ERROR", "批量删除题目失败", 500);
  }
}
