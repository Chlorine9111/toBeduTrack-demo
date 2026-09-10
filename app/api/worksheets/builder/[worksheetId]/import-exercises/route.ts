import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import {
  appendExerciseRowsToDraft,
  loadBuilderImportExerciseRows,
  loadWorksheetBuilderDetail,
  mergeWorksheetBuilderDraftIntoLayoutConfig,
} from "@/lib/worksheet/builder-store";
import { uuidSchema, worksheetExercisesAddSchema } from "@/lib/validation/api";
import type { Json } from "@/types/database";

export async function POST(
  request: Request,
  context: { params: Promise<{ worksheetId: string }> },
) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } =
    await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  const params = await context.params;
  const parsed = uuidSchema.safeParse(params.worksheetId);
  if (!parsed.success) {
    return jsonError("VALIDATION_ERROR", "组卷稿 ID 不合法", 400);
  }

  try {
    const body = worksheetExercisesAddSchema.parse(
      await parseJsonBody<z.infer<typeof worksheetExercisesAddSchema>>(request),
    );

    const detail = await loadWorksheetBuilderDetail({
      supabase,
      teacherId,
      worksheetId: parsed.data,
    });

    if (!detail) {
      return jsonError("NOT_FOUND", "未找到组卷稿", 404);
    }

    const uniqueIds = Array.from(new Set(body.exerciseIds));
    const { data: existingRows, error: existingError } = await supabase
      .from("worksheet_exercises")
      .select("exercise_id,sort_order")
      .eq("worksheet_id", parsed.data)
      .order("sort_order", { ascending: true });

    if (existingError) {
      return jsonError("INTERNAL_ERROR", "读取组卷题目失败", 500);
    }

    const existingSet = new Set((existingRows ?? []).map((row) => row.exercise_id));
    const toAdd = uniqueIds.filter((id) => !existingSet.has(id));
    const skippedIds = uniqueIds.filter((id) => existingSet.has(id));

    const importRowsResult = await loadBuilderImportExerciseRows({
      supabase,
      teacherId,
      exerciseIds: toAdd,
    });

    if (importRowsResult.invalidIds.length > 0) {
      return jsonError("VALIDATION_ERROR", "包含无效题目或无权限访问", 400, {
        invalidExerciseIds: importRowsResult.invalidIds,
      });
    }

    const nextDraft = appendExerciseRowsToDraft(
      detail.builderDraft,
      importRowsResult.rows,
    );
    const maxOrder = (existingRows ?? []).reduce(
      (max, row) => (row.sort_order > max ? row.sort_order : max),
      -1,
    );

    if (toAdd.length > 0) {
      const insertRows = toAdd.map((exerciseId, index) => ({
        worksheet_id: parsed.data,
        exercise_id: exerciseId,
        sort_order: maxOrder + index + 1,
        points: null,
      }));

      const { error: insertError } = await supabase
        .from("worksheet_exercises")
        .insert(insertRows);

      if (insertError) {
        return jsonError("INTERNAL_ERROR", "添加题目失败", 500);
      }
    }

    const { error: updateError } = await supabase
      .from("worksheets")
      .update({
        layout_config: mergeWorksheetBuilderDraftIntoLayoutConfig(
          detail.layoutConfig as unknown as Json,
          nextDraft.draft,
        ),
      })
      .eq("id", parsed.data)
      .eq("teacher_id", teacherId);

    if (updateError) {
      return jsonError("INTERNAL_ERROR", "更新组卷稿失败", 500);
    }

    return NextResponse.json({
      worksheetId: detail.id,
      builderDraft: nextDraft.draft,
      addedIds: nextDraft.addedIds,
      skippedIds: Array.from(new Set([...skippedIds, ...nextDraft.skippedIds])),
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }

    console.error("导入题目失败", error);
    return jsonError("INTERNAL_ERROR", "导入题目失败", 500);
  }
}
