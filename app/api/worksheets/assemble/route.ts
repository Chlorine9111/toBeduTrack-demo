import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { worksheetAssembleSchema } from "@/lib/validation/api";
import { assembleWorksheetFromSemanticSearch } from "@/lib/worksheet/assemble";
import { fromExerciseDifficulty } from "@/types/exercise";

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
    const body = worksheetAssembleSchema.parse(
      await parseJsonBody<z.infer<typeof worksheetAssembleSchema>>(request),
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

    const result = await assembleWorksheetFromSemanticSearch({
      supabase,
      teacherId,
      courseId: body.courseId,
      unitId: body.unitId,
      title: body.title,
      description: body.description,
      query: body.query,
      seedExerciseId: body.seedExerciseId,
      type: body.type,
      difficulty: body.difficulty != null ? fromExerciseDifficulty(body.difficulty) as 1 | 2 | 3 | 4 : undefined,
      knowledgeCluster: body.knowledgeCluster,
      assessmentStyle: body.assessmentStyle,
      clusterNodeId: body.clusterNodeId,
      subskillNodeId: body.subskillNodeId,
      hasFigure: body.hasFigure,
      count: body.count,
      maxCandidates: body.maxCandidates,
      includeSeedExercise: body.includeSeedExercise,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }

    const message = error instanceof Error ? error.message : "自动组卷失败";
    if (
      message.includes("种子题") ||
      message.includes("课程") ||
      message.includes("单元") ||
      message.includes("候选题") ||
      message.includes("可用题目")
    ) {
      return jsonError("VALIDATION_ERROR", message, 400);
    }

    console.error("自动组卷失败", error);
    return jsonError("INTERNAL_ERROR", "自动组卷失败", 500);
  }
}
