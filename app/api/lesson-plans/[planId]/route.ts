import { z } from "zod";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getLessonPlanContext } from "@/lib/lesson-plan/context";
import {
  deleteLessonPlan,
  getLessonPlanById,
  replaceLessonPlan,
} from "@/lib/lesson-plan/store";
import {
  removeLessonPlanContentLibraryItem,
  syncLessonPlanContentLibraryItem,
} from "@/lib/content-library/sync";
import { lessonPlanSaveSchema } from "@/lib/validation/lesson-plan";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";

const paramsSchema = z.object({
  planId: z.string().uuid(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ planId: string }> },
) {
  const contextResult = await getLessonPlanContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return jsonError("VALIDATION_ERROR", "教案 ID 不合法", 400);
  }

  try {
    const lessonPlan = await getLessonPlanById(contextResult.value, parsedParams.data.planId);
    if (!lessonPlan) {
      return jsonError("NOT_FOUND", "未找到教案", 404);
    }

    return NextResponse.json({ lessonPlan });
  } catch (error) {
    console.error("读取教案失败", error);
    return jsonError("INTERNAL_ERROR", "读取教案失败", 500);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ planId: string }> },
) {
  const contextResult = await getLessonPlanContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return jsonError("VALIDATION_ERROR", "教案 ID 不合法", 400);
  }

  try {
    const body = lessonPlanSaveSchema.parse(
      await parseJsonBody<z.infer<typeof lessonPlanSaveSchema>>(request),
    );

    await replaceLessonPlan(contextResult.value, parsedParams.data.planId, {
      title: body.title,
      sourcePrompt: body.sourcePrompt,
      subjectLabel: body.subjectLabel,
      courseId: body.courseId,
      unitId: body.unitId,
      topicIds: body.topicIds,
      learningObjectiveCodes: body.learningObjectiveCodes,
      essentialKnowledge: body.essentialKnowledge,
      preferences: body.preferences,
      sections: body.sections,
    });

    const lessonPlan = await getLessonPlanById(contextResult.value, parsedParams.data.planId);
    if (!lessonPlan) {
      return jsonError("NOT_FOUND", "未找到教案", 404);
    }
    if (contextResult.value.supabase) {
      await syncLessonPlanContentLibraryItem({
        supabase: contextResult.value.supabase,
        teacherId: contextResult.value.teacherId,
        planId: lessonPlan.id,
      });
    }
    return NextResponse.json({ lessonPlan });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }
    if (error instanceof Error && error.message === "LESSON_PLAN_NOT_FOUND") {
      return jsonError("NOT_FOUND", "未找到教案", 404);
    }

    console.error("更新教案失败", error);
    return jsonError("INTERNAL_ERROR", "更新教案失败", 500);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ planId: string }> },
) {
  const contextResult = await getLessonPlanContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return jsonError("VALIDATION_ERROR", "教案 ID 不合法", 400);
  }

  try {
    await deleteLessonPlan(contextResult.value, parsedParams.data.planId);
    if (contextResult.value.supabase) {
      await removeLessonPlanContentLibraryItem({
        supabase: contextResult.value.supabase,
        teacherId: contextResult.value.teacherId,
        planId: parsedParams.data.planId,
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "LESSON_PLAN_NOT_FOUND") {
      return jsonError("NOT_FOUND", "未找到教案", 404);
    }
    if (error instanceof Error && error.message === "LESSON_PLAN_PUBLISHED_DELETE_BLOCKED") {
      return jsonError("FORBIDDEN", "已发布教案需先取消发布后再删除", 409);
    }
    console.error("删除教案失败", error);
    return jsonError("INTERNAL_ERROR", "删除教案失败", 500);
  }
}
