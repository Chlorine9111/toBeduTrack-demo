import { z } from "zod";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { syncLessonPlanContentLibraryItem } from "@/lib/content-library/sync";
import { getLessonPlanContext } from "@/lib/lesson-plan/context";
import { restoreLessonPlan } from "@/lib/lesson-plan/store";

const paramsSchema = z.object({
  planId: z.string().uuid(),
});

export async function POST(
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
    await restoreLessonPlan(contextResult.value, parsedParams.data.planId);
    if (!contextResult.value.isMock && contextResult.value.supabase) {
      await syncLessonPlanContentLibraryItem({
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
    console.error("恢复教案失败", error);
    return jsonError("INTERNAL_ERROR", "恢复教案失败", 500);
  }
}
