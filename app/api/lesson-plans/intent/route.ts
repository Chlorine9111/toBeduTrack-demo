import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getLessonPlanContext } from "@/lib/lesson-plan/context";
import { parseLessonIntent } from "@/lib/lesson-plan/intent";
import { getTeacherPreferences } from "@/lib/lesson-plan/store";
import { lessonIntentRequestSchema } from "@/lib/validation/lesson-plan";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";

export async function POST(request: Request) {
  const contextResult = await getLessonPlanContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  try {
    const body = lessonIntentRequestSchema.parse(
      await parseJsonBody<z.infer<typeof lessonIntentRequestSchema>>(request),
    );

    const basePreferences = await getTeacherPreferences(contextResult.value);

    const parsedIntent = await parseLessonIntent({
      message: body.message,
      supabase: contextResult.value.supabase ?? undefined,
      preferenceOverride: {
        ...basePreferences,
        ...body.preferenceOverride,
      },
    });

    return NextResponse.json({
      intent: parsedIntent,
      basePreferences,
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }
    if (error instanceof Error && error.message.includes("课程目录")) {
      return jsonError("SERVICE_UNAVAILABLE", error.message, 503);
    }

    console.error("解析意图失败", error);
    return jsonError("INTERNAL_ERROR", "解析意图失败", 500);
  }
}
