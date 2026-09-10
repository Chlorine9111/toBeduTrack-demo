import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { searchApQuestionBank } from "@/lib/question-bank/ap-question-bank";

const searchSchema = z.object({
  query: z.string().trim().min(1).max(500),
  course: z.string().trim().max(50).optional().default(""),
  unit: z.coerce.number().int().min(1).max(20).optional().nullable(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional().nullable(),
  cognitive_task: z.string().trim().max(50).optional().nullable(),
  topic_code: z.string().trim().max(20).optional().nullable(),
  mode: z.enum(["content", "diagnostic", "auto"]).optional().default("auto"),
  limit: z.coerce.number().int().min(0).max(2000).optional().default(10),
  skip_cache: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = searchSchema.parse(body);

    const result = await searchApQuestionBank(payload);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "题库搜索参数不合法", 400, error.flatten());
    }
    if (error instanceof SyntaxError) {
      return jsonError("VALIDATION_ERROR", "请求体不是合法 JSON", 400);
    }

    console.error("[tiku/search] failed", error);
    return jsonError("INTERNAL_ERROR", "题库搜索失败", 500);
  }
}
