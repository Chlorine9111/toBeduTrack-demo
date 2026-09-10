import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { uuidSchema, worksheetExercisesReorderSchema } from "@/lib/validation/api";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";

export async function PUT(
  request: Request,
  context: { params: Promise<{ worksheetId: string }> },
) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  const params = await context.params;
  const idParse = uuidSchema.safeParse(params.worksheetId);
  if (!idParse.success) {
    return jsonError("VALIDATION_ERROR", "练习卷 ID 不合法", 400);
  }

  try {
    const body = worksheetExercisesReorderSchema.parse(
      await parseJsonBody<z.infer<typeof worksheetExercisesReorderSchema>>(request),
    );

    const { data: worksheet } = await supabase
      .from("worksheets")
      .select("id")
      .eq("id", params.worksheetId)
      .eq("teacher_id", teacherId)
      .maybeSingle();

    if (!worksheet) {
      return jsonError("NOT_FOUND", "未找到练习卷", 404);
    }

    const { data: existingRows, error: existingError } = await supabase
      .from("worksheet_exercises")
      .select("exercise_id")
      .eq("worksheet_id", params.worksheetId);

    if (existingError) {
      return jsonError("INTERNAL_ERROR", "读取题目失败", 500);
    }

    const existingIds = new Set(
      (existingRows ?? []).map((row) => row.exercise_id),
    );
    const requestedIds = new Set(body.exerciseIds);

    if (existingIds.size !== requestedIds.size) {
      return jsonError("VALIDATION_ERROR", "排序题目数量不一致", 400);
    }

    for (const id of requestedIds) {
      if (!existingIds.has(id)) {
        return jsonError("VALIDATION_ERROR", "排序列表包含无效题目", 400);
      }
    }

    const rows = body.exerciseIds.map((exerciseId, index) => ({
      worksheet_id: params.worksheetId,
      exercise_id: exerciseId,
      sort_order: index,
    }));

    const { error: upsertError } = await supabase
      .from("worksheet_exercises")
      .upsert(rows, { onConflict: "worksheet_id,exercise_id" });

    if (upsertError) {
      return jsonError("INTERNAL_ERROR", "更新排序失败", 500);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }

    console.error("更新排序失败", error);
    return jsonError("INTERNAL_ERROR", "更新排序失败", 500);
  }
}
