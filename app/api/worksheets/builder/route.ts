import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import {
  appendExerciseRowsToDraft,
  createEmptyWorksheetBuilderDraft,
  extractWorksheetBuilderDraft,
  loadBuilderImportExerciseRows,
  mergeWorksheetBuilderDraftIntoLayoutConfig,
  normalizeWorksheetLayoutConfig,
} from "@/lib/worksheet/builder-store";
import { DEFAULT_WORKSHEET_LAYOUT_CONFIG } from "@/lib/worksheet/constants";
import { worksheetBuilderCreateSchema } from "@/lib/validation/api";
import type { Database, Json } from "@/types/database";

type WorksheetInsert = Database["public"]["Tables"]["worksheets"]["Insert"];

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(12),
});

export async function GET(request: Request) {
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
    const url = new URL(request.url);
    const query = listQuerySchema.parse({
      limit: url.searchParams.get("limit"),
    });

    const { data, error } = await supabase
      .from("worksheets")
      .select(
        "id,title,description,course_id,unit_id,layout_config,status,pdf_url,created_at,updated_at,course:courses(name),unit:units(unit_number,title)",
      )
      .eq("teacher_id", teacherId)
      .order("updated_at", { ascending: false })
      .limit(query.limit);

    if (error) {
      return jsonError("INTERNAL_ERROR", "读取组卷稿列表失败", 500);
    }

    return NextResponse.json({
      items: (data ?? []).map((row) => {
        const course = Array.isArray(row.course) ? row.course[0] : row.course;
        const unit = Array.isArray(row.unit) ? row.unit[0] : row.unit;
        const unitName =
          unit && unit.title
            ? unit.unit_number != null
              ? `Unit ${unit.unit_number} · ${unit.title}`
              : unit.title
            : null;

        return {
          id: row.id,
          title: row.title,
          description: row.description,
          courseId: row.course_id,
          unitId: row.unit_id,
          courseName: course?.name ?? null,
          unitName,
          layoutConfig: normalizeWorksheetLayoutConfig(row.layout_config),
          status: row.status,
          pdfUrl: row.pdf_url,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          hasBuilderDraft: Boolean(extractWorksheetBuilderDraft(row.layout_config)),
        };
      }),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }

    console.error("读取组卷稿列表失败", error);
    return jsonError("INTERNAL_ERROR", "读取组卷稿列表失败", 500);
  }
}

export async function POST(request: Request) {
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
    const body = worksheetBuilderCreateSchema.parse(
      await parseJsonBody<z.infer<typeof worksheetBuilderCreateSchema>>(request),
    );

    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("id,name")
      .eq("id", body.courseId)
      .maybeSingle();

    if (courseError) {
      return jsonError("INTERNAL_ERROR", "课程校验失败", 500);
    }
    if (!course) {
      return jsonError("VALIDATION_ERROR", "课程不存在", 400);
    }

    let unitName: string | null = null;
    if (body.unitId) {
      const { data: unit, error: unitError } = await supabase
        .from("units")
        .select("id,course_id,unit_number,title")
        .eq("id", body.unitId)
        .maybeSingle();

      if (unitError) {
        return jsonError("INTERNAL_ERROR", "单元校验失败", 500);
      }
      if (!unit || unit.course_id !== body.courseId) {
        return jsonError("VALIDATION_ERROR", "单元不属于所选课程", 400);
      }

      unitName = unit.unit_number
        ? `Unit ${unit.unit_number} · ${unit.title}`
        : unit.title;
    }

    const importRowsResult = body.exerciseIds?.length
      ? await loadBuilderImportExerciseRows({
          supabase,
          teacherId,
          exerciseIds: body.exerciseIds,
        })
      : { rows: [], invalidIds: [] as string[] };

    if (importRowsResult.invalidIds.length > 0) {
      return jsonError("VALIDATION_ERROR", "包含无效题目或无权限访问", 400, {
        invalidExerciseIds: importRowsResult.invalidIds,
      });
    }

    let builderDraft = createEmptyWorksheetBuilderDraft({
      title: body.title,
      courseName: course.name,
      unitName,
    });

    if (importRowsResult.rows.length > 0) {
      builderDraft = appendExerciseRowsToDraft(builderDraft, importRowsResult.rows).draft;
    }

    const insertPayload: WorksheetInsert = {
      teacher_id: teacherId,
      course_id: body.courseId,
      unit_id: body.unitId ?? null,
      title: body.title,
      description: body.description?.trim() ? body.description.trim() : null,
      status: "draft",
      layout_config: mergeWorksheetBuilderDraftIntoLayoutConfig(
        DEFAULT_WORKSHEET_LAYOUT_CONFIG as unknown as Json,
        builderDraft,
      ),
    };

    const { data: worksheet, error: worksheetError } = await supabase
      .from("worksheets")
      .insert(insertPayload)
      .select(
        "id,teacher_id,course_id,unit_id,title,description,layout_config,status,pdf_url,created_at,updated_at",
      )
      .maybeSingle();

    if (worksheetError || !worksheet) {
      return jsonError("INTERNAL_ERROR", "创建组卷稿失败", 500);
    }

    if (importRowsResult.rows.length > 0) {
      const rows = importRowsResult.rows.map((row, index) => ({
        worksheet_id: worksheet.id,
        exercise_id: row.id,
        sort_order: index,
        points: null,
      }));

      const { error: insertExercisesError } = await supabase
        .from("worksheet_exercises")
        .insert(rows);

      if (insertExercisesError) {
        await supabase.from("worksheets").delete().eq("id", worksheet.id);
        return jsonError("INTERNAL_ERROR", "写入组卷题目失败", 500);
      }
    }

    return NextResponse.json({
      worksheet: {
        id: worksheet.id,
        teacherId: worksheet.teacher_id,
        courseId: worksheet.course_id,
        unitId: worksheet.unit_id,
        courseName: course.name,
        unitName,
        title: worksheet.title,
        description: worksheet.description,
        layoutConfig: normalizeWorksheetLayoutConfig(worksheet.layout_config),
        status: worksheet.status,
        pdfUrl: worksheet.pdf_url,
        createdAt: worksheet.created_at,
        updatedAt: worksheet.updated_at,
      },
      builderDraft,
      importedExerciseIds: importRowsResult.rows.map((row) => row.id),
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }

    console.error("创建组卷稿失败", error);
    return jsonError("INTERNAL_ERROR", "创建组卷稿失败", 500);
  }
}
