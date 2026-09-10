import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { uuidSchema, worksheetExercisePointsSchema } from "@/lib/validation/api";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ worksheetId: string; exerciseId: string }> },
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
  const worksheetParse = uuidSchema.safeParse(params.worksheetId);
  const exerciseParse = uuidSchema.safeParse(params.exerciseId);
  if (!worksheetParse.success || !exerciseParse.success) {
    return jsonError("VALIDATION_ERROR", "请求参数不合法", 400);
  }

  const { data: worksheet } = await supabase
    .from("worksheets")
    .select("id")
    .eq("id", params.worksheetId)
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (!worksheet) {
    return jsonError("NOT_FOUND", "未找到练习卷", 404);
  }

  const { data, error } = await supabase
    .from("worksheet_exercises")
    .delete()
    .eq("worksheet_id", params.worksheetId)
    .eq("exercise_id", params.exerciseId)
    .select("id");

  if (error) {
    return jsonError("INTERNAL_ERROR", "移除题目失败", 500);
  }

  if (!data || data.length === 0) {
    return jsonError("NOT_FOUND", "未找到题目", 404);
  }

  const { data: remainingRows, error: remainingError } = await supabase
    .from("worksheet_exercises")
    .select("exercise_id")
    .eq("worksheet_id", params.worksheetId)
    .order("sort_order", { ascending: true });

  if (remainingError) {
    return jsonError("INTERNAL_ERROR", "重新排序失败", 500);
  }

  if ((remainingRows ?? []).length > 0) {
    const reorderRows = (remainingRows ?? []).map((row, index) => ({
      worksheet_id: params.worksheetId,
      exercise_id: row.exercise_id,
      sort_order: index,
    }));

    const { error: reorderError } = await supabase
      .from("worksheet_exercises")
      .upsert(reorderRows, { onConflict: "worksheet_id,exercise_id" });

    if (reorderError) {
      return jsonError("INTERNAL_ERROR", "重新排序失败", 500);
    }
  }

  return NextResponse.json({ success: true });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ worksheetId: string; exerciseId: string }> },
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
  const worksheetParse = uuidSchema.safeParse(params.worksheetId);
  const exerciseParse = uuidSchema.safeParse(params.exerciseId);
  if (!worksheetParse.success || !exerciseParse.success) {
    return jsonError("VALIDATION_ERROR", "请求参数不合法", 400);
  }

  try {
    const body = worksheetExercisePointsSchema.parse(
      await parseJsonBody<z.infer<typeof worksheetExercisePointsSchema>>(request),
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

    const { data, error } = await supabase
      .from("worksheet_exercises")
      .update({ points: body.points })
      .eq("worksheet_id", params.worksheetId)
      .eq("exercise_id", params.exerciseId)
      .select("id,points")
      .maybeSingle();

    if (error || !data) {
      return jsonError("NOT_FOUND", "未找到题目", 404);
    }

    return NextResponse.json({
      exercise: {
        id: data.id,
        points: data.points,
      },
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }

    console.error("更新分值失败", error);
    return jsonError("INTERNAL_ERROR", "更新分值失败", 500);
  }
}
