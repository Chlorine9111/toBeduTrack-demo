import { NextResponse } from "next/server";
import { z } from "zod";
import { optionalUuidLikeSchema } from "@/lib/api/id-schemas";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { listContentLibraryItems } from "@/lib/content-library/store";
import type { ExerciseDifficulty } from "@/types/exercise";

const querySchema = z.object({
  type: z.enum(["all", "rubric", "lesson_plan", "question", "pbl", "other"]).optional(),
  q: z.string().trim().max(200).optional(),
  courseId: optionalUuidLikeSchema,
  unitId: optionalUuidLikeSchema,
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  assessmentStyle: z
    .enum([
      "concept_check",
      "direct_application",
      "multi_step_problem",
      "graph_interpretation",
      "data_analysis",
      "experiment_analysis",
      "proof_reasoning",
      "error_analysis",
      "modeling_scenario",
      "text_evidence",
      "translation_expression",
      "mixed",
    ])
    .optional(),
  clusterNodeId: z.string().uuid().optional(),
  subskillNodeId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).max(10000).optional(),
});

function readOptionalParam(params: URLSearchParams, key: string) {
  const value = params.get(key)?.trim();
  return value ? value : undefined;
}

export async function GET(request: Request) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
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
      type: readOptionalParam(url.searchParams, "type"),
      q: readOptionalParam(url.searchParams, "q"),
      courseId: readOptionalParam(url.searchParams, "courseId"),
      unitId: readOptionalParam(url.searchParams, "unitId"),
      difficulty: readOptionalParam(url.searchParams, "difficulty"),
      assessmentStyle: readOptionalParam(url.searchParams, "assessmentStyle"),
      clusterNodeId: readOptionalParam(url.searchParams, "clusterNodeId"),
      subskillNodeId: readOptionalParam(url.searchParams, "subskillNodeId"),
      limit: readOptionalParam(url.searchParams, "limit"),
      offset: readOptionalParam(url.searchParams, "offset"),
    });

    const result = await listContentLibraryItems(
      {
        teacherId,
        supabase,
      },
      {
        type: query.type,
        query: query.q,
        courseId: query.courseId,
        unitId: query.unitId,
        difficulty: query.difficulty,
        assessmentStyle: query.assessmentStyle,
        clusterNodeId: query.clusterNodeId,
        subskillNodeId: query.subskillNodeId,
        limit: query.limit,
        offset: query.offset,
      },
    );

    return NextResponse.json({
      items: result.items,
      total: result.total,
      hasMore: (query.offset ?? 0) + (query.limit ?? 120) < result.total,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "内容库查询参数不合法", 400, error.flatten());
    }
    console.error("读取内容库列表失败", error);
    return jsonError("INTERNAL_ERROR", "读取内容库列表失败", 500);
  }
}
