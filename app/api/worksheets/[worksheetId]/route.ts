import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { uuidSchema, worksheetUpdateSchema } from "@/lib/validation/api";
import type { ExerciseOption } from "@/types/exercise";
import type { Database } from "@/types/database";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";

type WorksheetRow = Database["public"]["Tables"]["worksheets"]["Row"];

export async function GET(
  _request: Request,
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

  const { data: worksheet, error } = await supabase
    .from("worksheets")
    .select(
      "id,teacher_id,course_id,unit_id,title,description,layout_config,status,pdf_url,created_at,updated_at",
    )
    .eq("id", params.worksheetId)
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (error || !worksheet) {
    return jsonError("NOT_FOUND", "未找到练习卷", 404);
  }

  const { data: exerciseRows, error: exerciseError } = await supabase
    .from("worksheet_exercises")
    .select(
      "id,worksheet_id,exercise_id,sort_order,points,exercise:exercises(id,teacher_id,exercise_type,difficulty,question_text,options,correct_answer,solution_steps,common_mistakes,topic:topics(id,title,learning_objectives,essential_knowledge))",
    )
    .eq("worksheet_id", params.worksheetId)
    .order("sort_order", { ascending: true });

  if (exerciseError) {
    return jsonError("INTERNAL_ERROR", "加载练习题失败", 500);
  }

  const exercises = (exerciseRows ?? []).map((row) => {
    const exercise = Array.isArray(row.exercise) ? row.exercise[0] : row.exercise;
    if (exercise && exercise.teacher_id !== teacherId) {
      return {
        id: row.id,
        worksheetId: row.worksheet_id,
        exerciseId: row.exercise_id,
        sortOrder: row.sort_order,
        points: row.points,
        exercise: null,
      };
    }

    const topic = Array.isArray(exercise?.topic) ? exercise?.topic[0] : exercise?.topic;

    return {
      id: row.id,
      worksheetId: row.worksheet_id,
      exerciseId: row.exercise_id,
      sortOrder: row.sort_order,
      points: row.points,
      exercise: exercise
        ? {
            id: exercise.id,
            exerciseType: exercise.exercise_type,
            difficulty: exercise.difficulty,
            questionText: exercise.question_text,
            options: Array.isArray(exercise.options)
              ? (exercise.options as ExerciseOption[])
              : null,
            correctAnswer: exercise.correct_answer,
            solutionSteps: exercise.solution_steps,
            commonMistakes: exercise.common_mistakes ?? [],
            topic: topic
              ? {
                  id: topic.id,
                  title: topic.title,
                  learningObjectives: topic.learning_objectives ?? [],
                  essentialKnowledge: topic.essential_knowledge ?? [],
                }
              : null,
          }
        : null,
    };
  });

  return NextResponse.json({
    worksheet: {
      id: worksheet.id,
      teacherId: worksheet.teacher_id,
      courseId: worksheet.course_id,
      unitId: worksheet.unit_id,
      title: worksheet.title,
      description: worksheet.description,
      layoutConfig: worksheet.layout_config,
      status: worksheet.status,
      pdfUrl: worksheet.pdf_url,
      createdAt: worksheet.created_at,
      updatedAt: worksheet.updated_at,
    },
    exercises,
  });
}

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
    const body = worksheetUpdateSchema.parse(
      await parseJsonBody<z.infer<typeof worksheetUpdateSchema>>(request),
    );

    const { data: currentWorksheet, error: currentWorksheetError } = await supabase
      .from("worksheets")
      .select("id,course_id")
      .eq("id", params.worksheetId)
      .eq("teacher_id", teacherId)
      .maybeSingle();

    if (currentWorksheetError) {
      return jsonError("INTERNAL_ERROR", "读取练习卷失败", 500);
    }
    if (!currentWorksheet) {
      return jsonError("NOT_FOUND", "未找到练习卷", 404);
    }

    const nextCourseId = body.courseId ?? currentWorksheet.course_id;

    if (body.courseId !== undefined) {
      const { data: course, error: courseError } = await supabase
        .from("courses")
        .select("id")
        .eq("id", body.courseId)
        .maybeSingle();

      if (courseError) {
        return jsonError("INTERNAL_ERROR", "课程校验失败", 500);
      }
      if (!course) {
        return jsonError("VALIDATION_ERROR", "课程不存在", 400);
      }
    }

    if (body.unitId !== undefined && body.unitId !== null) {
      const { data: unit, error: unitError } = await supabase
        .from("units")
        .select("id,course_id")
        .eq("id", body.unitId)
        .maybeSingle();

      if (unitError) {
        return jsonError("INTERNAL_ERROR", "单元校验失败", 500);
      }
      if (!unit || unit.course_id !== nextCourseId) {
        return jsonError("VALIDATION_ERROR", "单元不属于当前课程", 400);
      }
    }

    const updatePayload: Database["public"]["Tables"]["worksheets"]["Update"] = {};
    if (body.title !== undefined) updatePayload.title = body.title;
    if (body.description !== undefined) {
      const value = body.description?.trim();
      updatePayload.description = value ? value : null;
    }
    if (body.courseId !== undefined) updatePayload.course_id = body.courseId;
    if (body.unitId !== undefined) updatePayload.unit_id = body.unitId ?? null;

    const { data, error } = await supabase
      .from("worksheets")
      .update(updatePayload)
      .eq("id", params.worksheetId)
      .eq("teacher_id", teacherId)
      .select("*")
      .maybeSingle();

    if (error || !data) {
      return jsonError("NOT_FOUND", "未找到练习卷", 404);
    }
    const worksheetRow = data as WorksheetRow;

    return NextResponse.json({
      worksheet: {
        id: worksheetRow.id,
        teacherId: worksheetRow.teacher_id,
        courseId: worksheetRow.course_id,
        unitId: worksheetRow.unit_id,
        title: worksheetRow.title,
        description: worksheetRow.description,
        layoutConfig: worksheetRow.layout_config,
        status: worksheetRow.status,
        pdfUrl: worksheetRow.pdf_url,
        createdAt: worksheetRow.created_at,
        updatedAt: worksheetRow.updated_at,
      },
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }

    console.error("更新练习卷失败", error);
    return jsonError("INTERNAL_ERROR", "更新练习卷失败", 500);
  }
}

export async function DELETE(
  _request: Request,
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

  const { data, error } = await supabase
    .from("worksheets")
    .delete()
    .eq("id", params.worksheetId)
    .eq("teacher_id", teacherId)
    .select("id");

  if (error) {
    return jsonError("INTERNAL_ERROR", "删除练习卷失败", 500);
  }

  if (!data || data.length === 0) {
    return jsonError("NOT_FOUND", "未找到练习卷", 404);
  }

  return NextResponse.json({ success: true });
}
