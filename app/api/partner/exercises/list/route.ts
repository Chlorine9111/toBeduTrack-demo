import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";

const querySchema = z.object({
  q: z.string().trim().max(300).optional(),
  exercise_type: z.enum(["MC", "FR", "fill_in"]).optional(),
  difficulty: z.coerce.number().int().min(1).max(4).optional(),
  source_kind: z.enum(["pdf_scan", "knowledge_document", "agent_generated", "manual"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(24),
});

function readParam(params: URLSearchParams, key: string) {
  const value = params.get(key)?.trim();
  return value ? value : undefined;
}

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.trim();
}

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
    const query = querySchema.parse({
      q: readParam(url.searchParams, "q"),
      exercise_type: readParam(url.searchParams, "exercise_type"),
      difficulty: readParam(url.searchParams, "difficulty"),
      source_kind: readParam(url.searchParams, "source_kind"),
      page: readParam(url.searchParams, "page"),
      limit: readParam(url.searchParams, "limit"),
    });

    const offset = (query.page - 1) * query.limit;
    let builder = supabase
      .from("exercises")
      .select(
        "id,teacher_id,exercise_type,difficulty,question_text,options,correct_answer,solution_steps,common_mistakes,knowledge_cluster,knowledge_subskill_label,knowledge_tags,source_kind,source_file_name,source_review_status,is_ai_generated,created_at,course:courses(name),unit:units(unit_number,title)",
        { count: "exact" },
      )
      .eq("teacher_id", teacherId)
      .order("updated_at", { ascending: false })
      .range(offset, offset + query.limit - 1);

    if (query.exercise_type) {
      builder = builder.eq("exercise_type", query.exercise_type);
    }
    if (query.difficulty) {
      builder = builder.eq("difficulty", query.difficulty);
    }
    if (query.source_kind) {
      builder = builder.eq("source_kind", query.source_kind);
    }

    if (query.q) {
      const safe = cleanText(query.q).replace(/,/g, " ").replace(/\./g, " ");
      if (safe) {
        builder = builder.or(
          `question_text.ilike.%${safe}%,source_file_name.ilike.%${safe}%,teacher_prompt.ilike.%${safe}%,knowledge_subskill_label.ilike.%${safe}%`,
        );
      }
    }

    const { data, count, error } = await builder;
    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      items: (data ?? []).map((row) => {
        const course = Array.isArray(row.course) ? row.course[0] : row.course;
        const unit = Array.isArray(row.unit) ? row.unit[0] : row.unit;
        const unitLabel =
          unit && unit.title
            ? unit.unit_number != null
              ? `Unit ${unit.unit_number} · ${unit.title}`
              : unit.title
            : null;
        const reviewFlag =
          row.source_review_status === "review" || row.source_review_status === "critical"
            ? "disputed"
            : null;

        return {
          id: row.id,
          teacher_id: row.teacher_id,
          exercise_type: row.exercise_type,
          difficulty: row.difficulty,
          question_text: row.question_text,
          options: row.options,
          correct_answer: row.correct_answer,
          solution_steps: row.solution_steps,
          common_mistakes: row.common_mistakes,
          tags: [
            row.knowledge_cluster,
            row.knowledge_subskill_label,
            ...(Array.isArray(row.knowledge_tags) ? row.knowledge_tags : []),
            unitLabel,
          ].filter((item): item is string => typeof item === "string" && item.trim().length > 0),
          stage: null,
          subject: course?.name ?? null,
          grade_level: null,
          textbook_version: unitLabel,
          knowledge_points: Array.isArray(row.knowledge_tags) ? row.knowledge_tags : [],
          knowledge_cluster: row.knowledge_cluster,
          source_kind: row.source_kind,
          source_file_name: row.source_file_name,
          review_flag: reviewFlag,
          is_ai_generated: row.is_ai_generated,
          created_at: row.created_at,
        };
      }),
      total: count ?? 0,
      page: query.page,
      limit: query.limit,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "个人题库查询参数不合法", 400, error.flatten());
    }

    console.error("[partner/exercises/list] failed", error);
    return jsonError("INTERNAL_ERROR", "读取个人题库失败", 500);
  }
}
