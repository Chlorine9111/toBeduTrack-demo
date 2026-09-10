import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { uuidSchema, worksheetExercisesAddSchema } from "@/lib/validation/api";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";

export async function POST(
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
    const body = worksheetExercisesAddSchema.parse(
      await parseJsonBody<z.infer<typeof worksheetExercisesAddSchema>>(request),
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

    const uniqueIds = Array.from(new Set(body.exerciseIds));

    const { data: existingRows, error: existingError } = await supabase
      .from("worksheet_exercises")
      .select("exercise_id,sort_order")
      .eq("worksheet_id", params.worksheetId)
      .order("sort_order", { ascending: true });

    if (existingError) {
      return jsonError("INTERNAL_ERROR", "读取题目失败", 500);
    }

    const existingSet = new Set((existingRows ?? []).map((row) => row.exercise_id));
    const toAdd = uniqueIds.filter((id) => !existingSet.has(id));
    const skippedIds = uniqueIds.filter((id) => existingSet.has(id));

    if (toAdd.length > 0) {
      const { data: ownedExercises, error: ownedError } = await supabase
        .from("exercises")
        .select("id")
        .in("id", toAdd)
        .eq("teacher_id", teacherId);

      if (ownedError) {
        return jsonError("INTERNAL_ERROR", "校验题目归属失败", 500);
      }

      const ownedSet = new Set((ownedExercises ?? []).map((row) => row.id));
      const invalidIds = toAdd.filter((id) => !ownedSet.has(id));
      if (invalidIds.length > 0) {
        return jsonError("VALIDATION_ERROR", "包含无效题目或无权限访问", 400, {
          invalidExerciseIds: invalidIds,
        });
      }
    }

    const maxOrder = (existingRows ?? []).reduce(
      (max, row) => (row.sort_order > max ? row.sort_order : max),
      -1,
    );

    if (toAdd.length > 0) {
      const rows = toAdd.map((exerciseId, index) => ({
        worksheet_id: params.worksheetId,
        exercise_id: exerciseId,
        sort_order: maxOrder + index + 1,
        points: null,
      }));

      const { error: insertError } = await supabase
        .from("worksheet_exercises")
        .insert(rows);

      if (insertError) {
        return jsonError("INTERNAL_ERROR", "添加题目失败", 500);
      }
    }

    return NextResponse.json({
      addedIds: toAdd,
      skippedIds,
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }

    console.error("添加题目失败", error);
    return jsonError("INTERNAL_ERROR", "添加题目失败", 500);
  }
}
