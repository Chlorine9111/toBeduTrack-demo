import { z } from "zod";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";
import { getPblContext } from "@/lib/pbl/context";
import {
  pblAssistantTurnRequestSchema,
  resolvePblAssistantTurn,
} from "@/lib/pbl/assistant";

export async function POST(request: Request) {
  const contextResult = await getPblContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  let rawBody: unknown;
  try {
    rawBody = await parseJsonBody<unknown>(request);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    return jsonError("INTERNAL_ERROR", "请求解析失败", 500);
  }

  try {
    const payload = pblAssistantTurnRequestSchema.parse(rawBody);
    const turn = await resolvePblAssistantTurn(payload);
    return Response.json(turn);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "PBL assistant 参数不合法", 400, error.flatten());
    }
    console.error("PBL assistant 解析失败", error);
    return jsonError("INTERNAL_ERROR", "PBL assistant 解析失败", 500);
  }
}
