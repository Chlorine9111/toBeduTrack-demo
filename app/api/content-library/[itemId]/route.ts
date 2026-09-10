import { z } from "zod";
import { NextResponse } from "next/server";
import { optionalNullableUuidLikeSchema } from "@/lib/api/id-schemas";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import {
  runContentLibraryOriginCleanupTask,
  runContentLibraryProjectionSyncTask,
} from "@/lib/content-library/background-tasks";
import {
  deleteContentLibraryItems,
  getContentLibraryItemDetail,
  updateContentLibraryItem,
} from "@/lib/content-library/store";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { normalizeDocumentHtml } from "@/lib/doc-engine/editor-html";
import { scheduleReliableAfterTask } from "@/lib/runtime/background-task";

const paramsSchema = z.object({
  itemId: z.string().uuid(),
});

const optionalTextField = z.preprocess((value) => {
  if (value === "") return null;
  return value;
}, z.string().trim().max(1000).nullable().optional());

const optionalTitleField = z.preprocess((value) => {
  if (value === "") return null;
  return value;
}, z.string().trim().max(160).nullable().optional());

const patchSchema = z.object({
  title: optionalTitleField,
  note: optionalTextField,
  courseId: optionalNullableUuidLikeSchema,
  unitId: optionalNullableUuidLikeSchema,
  documentHtml: z.string().trim().max(600_000).optional(),
});

function mapItemError(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message === "ITEM_NOT_FOUND") {
    return jsonError("NOT_FOUND", "内容不存在", 404);
  }
  if (error.message === "COURSE_REQUIRED") {
    return jsonError("VALIDATION_ERROR", "必须提供课程", 400);
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

export async function GET(
  _request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return jsonError("VALIDATION_ERROR", "内容 ID 不合法", 400);
  }

  try {
    const detail = await getContentLibraryItemDetail(
      {
        teacherId,
        supabase,
      },
      parsedParams.data.itemId,
    );
    if (!detail) {
      return jsonError("NOT_FOUND", "内容不存在", 404);
    }
    return NextResponse.json(detail);
  } catch (error) {
    console.error("读取内容详情失败", error);
    return jsonError("INTERNAL_ERROR", "读取内容详情失败", 500);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return jsonError("VALIDATION_ERROR", "内容 ID 不合法", 400);
  }

  try {
    const body = patchSchema.parse(
      await parseJsonBody<z.infer<typeof patchSchema>>(request),
    );

    const result = await updateContentLibraryItem(
      {
        teacherId,
        supabase,
      },
      parsedParams.data.itemId,
      {
        title: body.title,
        note: body.note,
        courseId: body.courseId ?? undefined,
        unitId: body.unitId ?? undefined,
        documentHtml: body.documentHtml ? normalizeDocumentHtml(body.documentHtml) : body.documentHtml,
      },
    );

    if (result.projectionSyncPayload) {
      scheduleReliableAfterTask({
        taskType: "content_library_projection_sync",
        taskKey: result.projectionSyncPayload.itemIds.join(","),
        teacherId,
        payload: result.projectionSyncPayload,
        run: async () => {
          await runContentLibraryProjectionSyncTask(
            { teacherId, supabase },
            result.projectionSyncPayload!,
          );
        },
      });
    }

    return NextResponse.json(result.item);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }
    const mapped = mapItemError(error);
    if (mapped) return mapped;
    console.error("更新内容失败", error);
    return jsonError("INTERNAL_ERROR", "更新内容失败", 500);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return jsonError("VALIDATION_ERROR", "内容 ID 不合法", 400);
  }

  try {
    const result = await deleteContentLibraryItems(
      {
        teacherId,
        supabase,
      },
      [parsedParams.data.itemId],
    );

    if (result.missingIds.length > 0) {
      return jsonError("NOT_FOUND", "内容不存在", 404);
    }
    if (result.blockedIds.length > 0) {
      return jsonError("CONFLICT", "已发布教案不能删除", 409);
    }
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
  } catch (error) {
    const mapped = mapItemError(error);
    if (mapped) return mapped;
    console.error("删除内容失败", error);
    return jsonError("INTERNAL_ERROR", "删除内容失败", 500);
  }
}
