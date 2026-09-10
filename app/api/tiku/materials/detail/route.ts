import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getApQuestionBankMaterialDetail } from "@/lib/question-bank/ap-question-bank";

const querySchema = z.object({
  course: z.string().trim().min(1).max(50),
  sourceAssessment: z.string().trim().min(1).max(300),
});

function readParam(params: URLSearchParams, key: string) {
  const value = params.get(key)?.trim();
  return value ? value : undefined;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = querySchema.parse({
      course: readParam(url.searchParams, "course"),
      sourceAssessment: readParam(url.searchParams, "sourceAssessment"),
    });

    const result = await getApQuestionBankMaterialDetail(query);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "题库材料详情参数不合法", 400, error.flatten());
    }

    console.error("[tiku/materials/detail] failed", error);
    return jsonError("INTERNAL_ERROR", "读取题库材料详情失败", 500);
  }
}
