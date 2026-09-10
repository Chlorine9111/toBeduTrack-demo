import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { worksheetCreateSchema } from "@/lib/validation/api";
import { DEFAULT_WORKSHEET_LAYOUT_CONFIG } from "@/lib/worksheet/constants";
import type { Database, Json } from "@/types/database";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
type WorksheetRow = Database["public"]["Tables"]["worksheets"]["Row"];

export async function GET(request: Request) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  const url = new URL(request.url);
  const rawPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const rawPageSize = Number.parseInt(
    url.searchParams.get("pageSize") ?? `${DEFAULT_PAGE_SIZE}`,
    10,
  );

  const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, rawPageSize))
    : DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from("worksheets")
    .select("id,title,description,created_at,updated_at", { count: "exact" })
    .eq("teacher_id", teacherId)
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error || !data) {
    return jsonError("INTERNAL_ERROR", "查询练习卷失败", 500);
  }

  const worksheetIds = data.map((row) => row.id);
  const statsMap = new Map<string, { count: number; totalPoints: number }>();

  if (worksheetIds.length > 0) {
    const { data: exerciseRows, error: exerciseError } = await supabase
      .from("worksheet_exercises")
      .select("worksheet_id,points")
      .in("worksheet_id", worksheetIds);

    if (exerciseError) {
      return jsonError("INTERNAL_ERROR", "统计题目失败", 500);
    }

    (exerciseRows ?? []).forEach((row) => {
      const current = statsMap.get(row.worksheet_id) ?? {
        count: 0,
        totalPoints: 0,
      };
      const pointsValue = row.points === null ? 0 : Number(row.points);
      statsMap.set(row.worksheet_id, {
        count: current.count + 1,
        totalPoints:
          current.totalPoints + (Number.isFinite(pointsValue) ? pointsValue : 0),
      });
    });
  }

  const worksheets = data.map((row) => {
    const stats = statsMap.get(row.id) ?? { count: 0, totalPoints: 0 };
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      exerciseCount: stats.count,
      totalPoints: stats.totalPoints,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

  return NextResponse.json({
    worksheets,
    page,
    pageSize,
    total: count ?? worksheets.length,
  });
}

export async function POST(request: Request) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  try {
    const body = worksheetCreateSchema.parse(
      await parseJsonBody<z.infer<typeof worksheetCreateSchema>>(request),
    );

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

    if (body.unitId) {
      const { data: unit, error: unitError } = await supabase
        .from("units")
        .select("id,course_id")
        .eq("id", body.unitId)
        .maybeSingle();

      if (unitError) {
        return jsonError("INTERNAL_ERROR", "单元校验失败", 500);
      }
      if (!unit || unit.course_id !== body.courseId) {
        return jsonError("VALIDATION_ERROR", "单元不属于所选课程", 400);
      }
    }

    const description = body.description?.trim();

    const insertPayload: Database["public"]["Tables"]["worksheets"]["Insert"] = {
      teacher_id: teacherId,
      course_id: body.courseId,
      unit_id: body.unitId ?? null,
      title: body.title,
      description: description ? description : null,
      layout_config: DEFAULT_WORKSHEET_LAYOUT_CONFIG as unknown as Json,
      status: "draft",
    };

    const { data, error } = await supabase
      .from("worksheets")
      .insert(insertPayload)
      .select("*")
      .maybeSingle();

    if (error || !data) {
      return jsonError("INTERNAL_ERROR", "创建练习卷失败", 500);
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

    console.error("创建练习卷失败", error);
    return jsonError("INTERNAL_ERROR", "创建练习卷失败", 500);
  }
}
