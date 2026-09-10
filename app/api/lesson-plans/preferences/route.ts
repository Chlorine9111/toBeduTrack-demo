import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getLessonPlanContext } from "@/lib/lesson-plan/context";
import {
  getTeacherPreferences,
  upsertTeacherPreferences,
} from "@/lib/lesson-plan/store";
import { lessonPreferencesSchema } from "@/lib/validation/lesson-plan";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";

export async function GET() {
  const contextResult = await getLessonPlanContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  try {
    const preferences = await getTeacherPreferences(contextResult.value);
    return NextResponse.json({ preferences });
  } catch (error) {
    console.error("读取偏好失败", error);
    return jsonError("INTERNAL_ERROR", "读取偏好失败", 500);
  }
}

export async function PUT(request: Request) {
  const contextResult = await getLessonPlanContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  try {
    const body = lessonPreferencesSchema.parse(
      await parseJsonBody<z.infer<typeof lessonPreferencesSchema>>(request),
    );

    const preferences = await upsertTeacherPreferences(contextResult.value, body);
    return NextResponse.json({ preferences });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }

    console.error("保存偏好失败", error);
    return jsonError("INTERNAL_ERROR", "保存偏好失败", 500);
  }
}
