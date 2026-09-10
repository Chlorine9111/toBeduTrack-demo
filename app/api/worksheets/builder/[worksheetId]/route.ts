import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import {
  createEmptyWorksheetBuilderDraft,
  extractWorksheetBuilderDraft,
  loadWorksheetBuilderDetail,
  mergeWorksheetBuilderDraftIntoLayoutConfig,
  normalizeWorksheetLayoutConfig,
} from "@/lib/worksheet/builder-store";
import { synchronizeWorksheetBuilderDraftFromHtml } from "@/lib/worksheet/builder-sync";
import type { WorksheetBuilderDraft } from "@/lib/worksheet/builder-types";
import { uuidSchema, worksheetBuilderUpdateSchema } from "@/lib/validation/api";
import type { Json } from "@/types/database";

export async function GET(
  _request: Request,
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
    const detail = await loadWorksheetBuilderDetail({
      supabase,
      teacherId,
      worksheetId: parsed.data,
    });

    if (!detail) {
      return jsonError("NOT_FOUND", "未找到组卷稿", 404);
    }

    return NextResponse.json(detail);
  } catch (error) {
    console.error("读取组卷稿失败", error);
    return jsonError("INTERNAL_ERROR", "读取组卷稿失败", 500);
  }
}

export async function PATCH(
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
    const body = worksheetBuilderUpdateSchema.parse(
      await parseJsonBody<z.infer<typeof worksheetBuilderUpdateSchema>>(request),
    );

    const { data: worksheet, error: worksheetError } = await supabase
      .from("worksheets")
      .select(
        "id,teacher_id,course_id,unit_id,title,description,layout_config,status,pdf_url,created_at,updated_at,course:courses(name),unit:units(unit_number,title)",
      )
      .eq("id", parsed.data)
      .eq("teacher_id", teacherId)
      .maybeSingle();

    if (worksheetError) {
      return jsonError("INTERNAL_ERROR", "读取组卷稿失败", 500);
    }
    if (!worksheet) {
      return jsonError("NOT_FOUND", "未找到组卷稿", 404);
    }

    const course = Array.isArray(worksheet.course) ? worksheet.course[0] : worksheet.course;
    const unit = Array.isArray(worksheet.unit) ? worksheet.unit[0] : worksheet.unit;
    const unitName =
      unit && unit.title
        ? unit.unit_number != null
          ? `Unit ${unit.unit_number} · ${unit.title}`
          : unit.title
        : null;

    const nextTitle = body.title ?? worksheet.title;
    const existingDraft =
      extractWorksheetBuilderDraft(worksheet.layout_config) ??
      createEmptyWorksheetBuilderDraft({
        title: worksheet.title,
        courseName: course?.name ?? null,
        unitName,
      });

    const nextDraft: WorksheetBuilderDraft =
      body.documentHtml !== undefined
        ? synchronizeWorksheetBuilderDraftFromHtml({
            currentDraft: existingDraft,
            html: body.documentHtml,
            title: nextTitle,
            courseName: course?.name ?? null,
            unitName,
          })
        : {
            ...existingDraft,
            document:
              body.document && typeof body.document === "object"
                ? (body.document as typeof existingDraft.document)
                : body.title && existingDraft.document
                  ? {
                      ...existingDraft.document,
                      title: body.title,
                    }
                  : existingDraft.document,
            updatedAt: new Date().toISOString(),
          };

    const { data, error } = await supabase
      .from("worksheets")
      .update({
        title: nextTitle,
        description:
          body.description !== undefined
            ? body.description?.trim() || null
            : worksheet.description,
        layout_config: mergeWorksheetBuilderDraftIntoLayoutConfig(
          worksheet.layout_config as Json,
          nextDraft,
        ),
      })
      .eq("id", parsed.data)
      .eq("teacher_id", teacherId)
      .select(
        "id,teacher_id,course_id,unit_id,title,description,layout_config,status,pdf_url,created_at,updated_at",
      )
      .maybeSingle();

    if (error || !data) {
      return jsonError("INTERNAL_ERROR", "保存组卷稿失败", 500);
    }

    return NextResponse.json({
      worksheet: {
        id: data.id,
        teacherId: data.teacher_id,
        courseId: data.course_id,
        unitId: data.unit_id,
        courseName: course?.name ?? null,
        unitName,
        title: data.title,
        description: data.description,
        layoutConfig: normalizeWorksheetLayoutConfig(data.layout_config),
        status: data.status,
        pdfUrl: data.pdf_url,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
      builderDraft: nextDraft,
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }

    console.error("保存组卷稿失败", error);
    return jsonError("INTERNAL_ERROR", "保存组卷稿失败", 500);
  }
}
