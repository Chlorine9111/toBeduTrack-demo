import { NextResponse } from "next/server";
import { z } from "zod";
import {
  optionalNullableUuidLikeSchema,
  optionalUuidLikeSchema,
} from "@/lib/api/id-schemas";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { runContentLibraryOriginCleanupTask } from "@/lib/content-library/background-tasks";
import {
  deleteContentLibraryItems,
  reclassifyContentLibraryItems,
} from "@/lib/content-library/store";
import { scheduleReliableAfterTask } from "@/lib/runtime/background-task";

const bulkSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("delete"),
    itemIds: z.array(z.string().uuid()).min(1).max(100),
  }),
  z.object({
    action: z.literal("reclassify"),
    itemIds: z.array(z.string().uuid()).min(1).max(100),
    courseId: optionalUuidLikeSchema,
    unitId: optionalNullableUuidLikeSchema,
  }),
]);

function mapBulkError(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message === "COURSE_REQUIRED") {
    return jsonError("VALIDATION_ERROR", "批量重分类时必须提供课程", 400);
  }
  if (error.message === "COURSE_NOT_FOUND") {
    return jsonError("VALIDATION_ERROR", "课程不存在", 400);
  }
  if (error.message === "UNIT_NOT_FOUND") {
    return jsonError("VALIDATION_ERROR", "单元不存在", 400);
  }
  if (error.message === "UNIT_COURSE_MISMATCH") {
    return jsonError("VALIDATION_ERROR", "单元不属于所选课程", 400);
  }
  return null;
}

export async function POST(request: Request) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  try {
    const body = bulkSchema.parse(await parseJsonBody(request));

    if (body.action === "delete") {
      const result = await deleteContentLibraryItems(
        {
          teacherId,
          supabase,
        },
        body.itemIds,
      );
      if (result.originCleanupPayload) {
        scheduleReliableAfterTask({
          taskType: "content_library_origin_cleanup",
          taskKey: result.deletedIds.join(","),
          teacherId,
          payload: result.originCleanupPayload,
          run: async () => {
            await runContentLibraryOriginCleanupTask(
              { teacherId, supabase },
              result.originCleanupPayload!,
            );
          },
        });
      }
      return NextResponse.json(result);
    }

    const result = await reclassifyContentLibraryItems(
      {
        teacherId,
        supabase,
      },
      body.itemIds,
      {
        courseId: body.courseId,
        unitId: body.unitId,
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "批量操作参数不合法", 400, error.flatten());
    }
    const mapped = mapBulkError(error);
    if (mapped) return mapped;
    console.error("批量内容库操作失败", error);
    return jsonError("INTERNAL_ERROR", "批量内容库操作失败", 500);
  }
}
