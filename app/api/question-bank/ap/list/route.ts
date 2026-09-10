import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { requireRouteActorAnyRole } from "@/lib/auth/require-role";
import { listApQuestionBankQuestions } from "@/lib/question-bank/ap-question-bank";

const querySchema = z.object({
  course: z.string().trim().max(50).optional(),
  unit: z.coerce.number().int().min(1).max(20).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  cognitiveTask: z.string().trim().max(50).optional(),
  q: z.string().trim().max(500).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

function readParam(params: URLSearchParams, key: string) {
  const value = params.get(key)?.trim();
  return value ? value : undefined;
}

export async function GET(request: Request) {
  try {
    const access = await requireRouteActorAnyRole(["subject_teacher", "admin"], {
      nextPath: "/main/agent",
    });
    if ("response" in access) {
      return access.response;
    }

    const url = new URL(request.url);
    const query = querySchema.parse({
      course: readParam(url.searchParams, "course"),
      unit: readParam(url.searchParams, "unit"),
      difficulty: readParam(url.searchParams, "difficulty"),
      cognitiveTask: readParam(url.searchParams, "cognitiveTask")
        ?? readParam(url.searchParams, "cognitive_task"),
      q: readParam(url.searchParams, "q"),
      page: readParam(url.searchParams, "page"),
      limit: readParam(url.searchParams, "limit"),
    });

    const result = await listApQuestionBankQuestions({
      course: query.course,
      unit: query.unit,
      difficulty: query.difficulty,
      cognitiveTask: query.cognitiveTask,
      q: query.q,
      page: query.page,
      limit: query.limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "AP 题库列表参数不合法", 400, error.flatten());
    }

    console.error("读取 AP 题库列表失败", error);
    return jsonError("INTERNAL_ERROR", "读取 AP 题库列表失败", 500);
  }
}
