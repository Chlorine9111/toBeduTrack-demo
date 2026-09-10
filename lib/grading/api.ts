import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getLessonPlanContext } from "@/lib/lesson-plan/context";

export const uuidParamSchema = z.string().uuid();

export async function getGradingContextOrResponse() {
  const contextResult = await getLessonPlanContext();
  if (!contextResult.ok) {
    return {
      context: null,
      response: jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status),
    };
  }
  return { context: contextResult.value, response: null };
}

export function invalidIdResponse(label: string) {
  return jsonError("VALIDATION_ERROR", `${label} 不合法`, 400);
}
