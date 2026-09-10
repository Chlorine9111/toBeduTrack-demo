import { z } from "zod";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import {
  removeLessonPlanContentLibraryItem,
  syncLessonPlanContentLibraryItem,
} from "@/lib/content-library/sync";
import { getLessonPlanContext } from "@/lib/lesson-plan/context";
import {
  bulkArchiveLessonPlans,
  bulkDeleteLessonPlans,
  bulkRestoreLessonPlans,
} from "@/lib/lesson-plan/store";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";

const bulkActionSchema = z.object({
  action: z.enum(["archive", "restore", "delete"]),
  planIds: z.array(z.string().uuid()).min(1).max(100),
});

export async function POST(request: Request) {
  const contextResult = await getLessonPlanContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  try {
    const body = bulkActionSchema.parse(
      await parseJsonBody<z.infer<typeof bulkActionSchema>>(request),
    );

    if (body.action === "archive") {
      const result = await bulkArchiveLessonPlans(contextResult.value, body.planIds);
      if (!contextResult.value.isMock && contextResult.value.supabase) {
        await Promise.all(
          result.archivedIds.map((planId) =>
            syncLessonPlanContentLibraryItem({
              supabase: contextResult.value.supabase!,
              teacherId: contextResult.value.teacherId,
              planId,
            }),
          ),
        );
      }
      return NextResponse.json(result);
    }

    if (body.action === "restore") {
      const result = await bulkRestoreLessonPlans(contextResult.value, body.planIds);
      if (!contextResult.value.isMock && contextResult.value.supabase) {
        await Promise.all(
          result.restoredIds.map((planId) =>
            syncLessonPlanContentLibraryItem({
              supabase: contextResult.value.supabase!,
              teacherId: contextResult.value.teacherId,
              planId,
            }),
          ),
        );
      }
      return NextResponse.json(result);
    }

    const result = await bulkDeleteLessonPlans(contextResult.value, body.planIds);
    if (!contextResult.value.isMock && contextResult.value.supabase) {
      await Promise.all(
        result.deletedIds.map((planId) =>
          removeLessonPlanContentLibraryItem({
            supabase: contextResult.value.supabase!,
            teacherId: contextResult.value.teacherId,
            planId,
          }),
        ),
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }
    console.error("批量操作失败", error);
    return jsonError("INTERNAL_ERROR", "批量操作失败", 500);
  }
}
