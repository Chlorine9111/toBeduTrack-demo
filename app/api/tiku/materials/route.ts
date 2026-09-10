import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { listApQuestionBankMaterials } from "@/lib/question-bank/ap-question-bank";

const querySchema = z.object({
  course: z.string().trim().max(50).optional(),
  unit: z.coerce.number().int().min(1).max(20).optional(),
  q: z.string().trim().max(500).optional(),
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
      unit: readParam(url.searchParams, "unit"),
      q: readParam(url.searchParams, "q"),
    });

    const result = await listApQuestionBankMaterials(query);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "题库材料参数不合法", 400, error.flatten());
    }

    console.error("[tiku/materials] failed", error);
    return jsonError("INTERNAL_ERROR", "读取题库材料失败", 500);
  }
}
