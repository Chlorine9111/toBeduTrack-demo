import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { searchTeacherKnowledgeRagDetailed } from "@/lib/assistant/knowledge-rag";

const requestSchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(20).optional(),
});

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
    const body = requestSchema.parse(await parseJsonBody(request));
    const response = await searchTeacherKnowledgeRagDetailed({
      teacherId,
      query: body.query,
      limit: body.limit,
      db: supabase,
    });

    return NextResponse.json({
      query: body.query,
      results: response.results,
      retrieval: response.retrieval,
      total: response.results.length,
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }

    console.error("知识库检索失败", error);
    return jsonError("INTERNAL_ERROR", "知识库检索失败", 500);
  }
}
