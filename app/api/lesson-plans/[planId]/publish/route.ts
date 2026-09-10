import { z } from "zod";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { syncLessonPlanContentLibraryItem } from "@/lib/content-library/sync";
import { getLessonPlanContext } from "@/lib/lesson-plan/context";
import { publishLessonPlan } from "@/lib/lesson-plan/store";

const paramsSchema = z.object({
  planId: z.string().uuid(),
});

export async function POST(
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
    const slug = await publishLessonPlan(contextResult.value, parsedParams.data.planId);
    if (!contextResult.value.isMock && contextResult.value.supabase) {
      await syncLessonPlanContentLibraryItem({
        supabase: contextResult.value.supabase,
        teacherId: contextResult.value.teacherId,
        planId: parsedParams.data.planId,
      });
    }
    const url = new URL(request.url);

    return NextResponse.json({
      slug,
      publicUrl: `${url.origin}/lp/${slug}`,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "LESSON_PLAN_NOT_FOUND") {
      return jsonError("NOT_FOUND", "未找到教案", 404);
    }
    if (error instanceof Error && error.message === "LESSON_PLAN_ARCHIVED_PUBLISH_BLOCKED") {
      return jsonError("FORBIDDEN", "归档教案需先恢复为草稿后再发布", 409);
    }
    console.error("发布失败", error);
    return jsonError("INTERNAL_ERROR", "发布失败", 500);
  }
}
