import { NextResponse } from "next/server";
import { z } from "zod";
import { optionalUuidLikeSchema } from "@/lib/api/id-schemas";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { requireRouteActorAnyRole } from "@/lib/auth/require-role";
import { listQuestionBankQuestions } from "@/lib/question-bank/store";
import { toExerciseDifficulty } from "@/types/exercise";

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  courseId: optionalUuidLikeSchema,
  unitId: optionalUuidLikeSchema,
  type: z.enum(["all", "MC", "FR", "fill_in"]).optional(),
  difficulty: z.coerce.number().int().min(1).max(4).optional(),
  knowledgeCluster: z
    .enum([
      "all",
      "derivatives",
      "integrals",
      "limits",
      "functions_modeling",
      "algebra_equations",
      "geometry_trigonometry",
      "probability_statistics",
      "mechanics",
      "electricity_magnetism",
      "waves_thermo",
      "chemical_reactions",
      "equilibrium_acid_base",
      "organic_chemistry",
      "cell_energy",
      "genetics_evolution",
      "ecology_systems",
      "reading_writing",
      "language_usage",
      "general",
    ])
    .optional(),
  assessmentStyle: z
    .enum([
      "all",
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
  knowledgeTag: z.string().trim().max(100).optional(),
  assessmentTag: z.string().trim().max(100).optional(),
  sourceKind: z
    .enum(["all", "pdf_scan", "knowledge_document", "agent_generated", "manual"])
    .optional(),
  reviewStatus: z
    .enum(["all", "ready", "review", "critical", "unreviewed"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).max(10000).optional(),
});

function readOptionalParam(params: URLSearchParams, key: string) {
  const value = params.get(key)?.trim();
  return value ? value : undefined;
}

export async function GET(request: Request) {
  const access = await requireRouteActorAnyRole(["subject_teacher", "admin"], {
    nextPath: "/main/agent",
  });
  if (access.response) {
    return access.response;
  }

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
      q: readOptionalParam(url.searchParams, "q"),
      courseId: readOptionalParam(url.searchParams, "courseId"),
      unitId: readOptionalParam(url.searchParams, "unitId"),
      type: readOptionalParam(url.searchParams, "type"),
      difficulty: readOptionalParam(url.searchParams, "difficulty"),
      knowledgeCluster: readOptionalParam(url.searchParams, "knowledgeCluster"),
      assessmentStyle: readOptionalParam(url.searchParams, "assessmentStyle"),
      knowledgeTag: readOptionalParam(url.searchParams, "knowledgeTag"),
      assessmentTag: readOptionalParam(url.searchParams, "assessmentTag"),
      sourceKind: readOptionalParam(url.searchParams, "sourceKind"),
      reviewStatus: readOptionalParam(url.searchParams, "reviewStatus"),
      limit: readOptionalParam(url.searchParams, "limit"),
      offset: readOptionalParam(url.searchParams, "offset"),
    });

    const result = await listQuestionBankQuestions(
      {
        teacherId,
        supabase,
      },
      {
        query: query.q,
        courseId: query.courseId,
        unitId: query.unitId,
        type: query.type,
        difficulty: query.difficulty != null ? toExerciseDifficulty(query.difficulty) : undefined,
        knowledgeCluster: query.knowledgeCluster,
        assessmentStyle: query.assessmentStyle,
        knowledgeTag: query.knowledgeTag,
        assessmentTag: query.assessmentTag,
        sourceKind: query.sourceKind,
        reviewStatus: query.reviewStatus,
        limit: query.limit,
        offset: query.offset,
      },
    );

    return NextResponse.json({
      items: result.items,
      total: result.total,
      hasMore: (query.offset ?? 0) + (query.limit ?? 100) < result.total,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "题库查询参数不合法", 400, error.flatten());
    }
    console.error("读取题库列表失败", error);
    return jsonError("INTERNAL_ERROR", "读取题库列表失败", 500);
  }
}
