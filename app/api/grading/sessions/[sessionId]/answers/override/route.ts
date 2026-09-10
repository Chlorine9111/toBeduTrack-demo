import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { getGradingContextOrResponse, invalidIdResponse, uuidParamSchema } from "@/lib/grading/api";
import { overrideAnswerSchema } from "@/lib/validation/grading";
import { getGradingSession, overrideGradingAnswer } from "@/lib/grading/store";

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { context: gradingContext, response } = await getGradingContextOrResponse();
  if (!gradingContext) return response;

  const params = await context.params;
  if (!uuidParamSchema.safeParse(params.sessionId).success) {
    return invalidIdResponse("任务 ID");
  }

  try {
    const body = overrideAnswerSchema.parse(
      await parseJsonBody<z.infer<typeof overrideAnswerSchema>>(request),
    );

    const session = await getGradingSession(gradingContext, params.sessionId);
    if (!session) {
      return jsonError("NOT_FOUND", "未找到判卷任务", 404);
    }

    const answer = await overrideGradingAnswer(gradingContext, body.answerId, {
      score: body.score,
      feedback: body.feedback,
    });

    if (!answer) {
      return jsonError("NOT_FOUND", "未找到判卷明细", 404);
    }

    return NextResponse.json({ answer });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "人工改分参数不合法", 400, error.flatten());
    }
    console.error("人工改分失败", error);
    return jsonError("INTERNAL_ERROR", "人工改分失败", 500);
  }
}
