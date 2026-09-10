import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import {
  assertLessonPlanAiAvailable,
  generateOutlineWithAi,
  LessonPlanAiError,
} from "@/lib/lesson-plan/ai";
import { getLessonPlanContext } from "@/lib/lesson-plan/context";
import { lessonOutlineRequestSchema } from "@/lib/validation/lesson-plan";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";

export async function POST(request: Request) {
  const contextResult = await getLessonPlanContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  try {
    assertLessonPlanAiAvailable();
    const body = lessonOutlineRequestSchema.parse(
      await parseJsonBody<z.infer<typeof lessonOutlineRequestSchema>>(request),
    );

    const outline = await generateOutlineWithAi({
      sourcePrompt: body.sourcePrompt,
      titleHint: body.titleHint,
      topics: body.confirmation.topics,
      preferences: body.confirmation.preferences,
      courseName: body.confirmation.subject.name,
    });

    return NextResponse.json({ outline });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }
    if (error instanceof LessonPlanAiError) {
      return jsonError(error.code, error.message, error.status);
    }

    console.error("生成大纲失败", error);
    return jsonError("INTERNAL_ERROR", "生成大纲失败", 500);
  }
}
