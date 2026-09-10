import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { createServerTimingRecorder, withServerTiming } from "@/lib/api/server-timing";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { revalidateContentAssets } from "@/lib/content-assets/bootstrap";
import {
  buildContentAssetDetail,
  mergeReferenceAssetFromLibraryItem,
} from "@/lib/content-assets/content-library-bridge";
import {
  runContentAssetPdfLibraryCleanupTask,
} from "@/lib/content-assets/pdf-library-sync";
import {
  getAsset,
  runContentAssetCleanupTask,
  updateAsset,
  deleteAsset,
} from "@/lib/content-assets/store";
import {
  runContentLibraryOriginCleanupTask,
  runContentLibraryProjectionSyncTask,
} from "@/lib/content-library/background-tasks";
import {
  deleteContentLibraryItems,
  updateContentLibraryItem,
} from "@/lib/content-library/store";
import { scheduleReliableAfterTask } from "@/lib/runtime/background-task";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  const serverTiming = createServerTimingRecorder();
  const routeStartedAt = performance.now();
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } =
    await getTeacherContext();

  if (!teacherId) {
    serverTiming.measure("response_ready", routeStartedAt, "鉴权失败");
    return withServerTiming(jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    ), serverTiming);
  }

  try {
    const { id } = await context.params;
    const lookupStartedAt = performance.now();
    const asset = await getAsset({ teacherId, supabase }, id);
    serverTiming.measure("lookup", lookupStartedAt, "资产详情查询");

    if (!asset) {
      serverTiming.measure("response_ready", routeStartedAt, "资产不存在");
      return withServerTiming(jsonError("NOT_FOUND", "资产不存在", 404), serverTiming);
    }

    const detailStartedAt = performance.now();
    const detail = await buildContentAssetDetail({ teacherId, supabase }, asset);
    serverTiming.measure("detail", detailStartedAt, "资产详情组装");
    serverTiming.measure("response_ready", routeStartedAt, "资产详情响应就绪");

    return withServerTiming(NextResponse.json(detail), serverTiming);
  } catch (error) {
    console.error("[content-assets/[id]] GET 失败", error);
    serverTiming.measure("response_ready", routeStartedAt, "资产详情失败");
    return withServerTiming(jsonError(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "查询失败",
      500,
    ), serverTiming);
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  const serverTiming = createServerTimingRecorder();
  const routeStartedAt = performance.now();
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } =
    await getTeacherContext();

  if (!teacherId) {
    serverTiming.measure("response_ready", routeStartedAt, "鉴权失败");
    return withServerTiming(jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    ), serverTiming);
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const lookupStartedAt = performance.now();
    const current = await getAsset({ teacherId, supabase }, id);
    serverTiming.measure("lookup", lookupStartedAt, "资产查询");

    if (!current) {
      serverTiming.measure("response_ready", routeStartedAt, "资产不存在");
      return withServerTiming(jsonError("NOT_FOUND", "资产不存在", 404), serverTiming);
    }

    const updateStartedAt = performance.now();
    const currentDetail =
      current.assetSource === "reference"
        ? await buildContentAssetDetail({ teacherId, supabase }, current)
        : null;
    const isWorksheetProjectReference =
      currentDetail?.contentLibraryItem?.rendererType === "worksheet_project";
    let updatedReferenceItem = currentDetail?.contentLibraryItem ?? null;
    const contentLibraryItemId =
      current.contentLibraryItemId ?? currentDetail?.contentLibraryItem?.id ?? null;

    const updates: Record<string, unknown> = {};
    if (typeof body.title === "string") updates.title = body.title;
    if (body.folderId !== undefined) updates.folderId = body.folderId;
    if (body.courseId !== undefined) updates.courseId = body.courseId;
    if (body.unitId !== undefined) updates.unitId = body.unitId;
    if (typeof body.category === "string") updates.category = body.category;

    if (
      current.assetSource === "reference" &&
      contentLibraryItemId &&
      (updates.title !== undefined ||
        updates.courseId !== undefined ||
        updates.unitId !== undefined)
    ) {
      const contentLibraryResult = await updateContentLibraryItem(
        { teacherId, supabase },
        contentLibraryItemId,
        {
          title: typeof updates.title === "string" ? updates.title : undefined,
          courseId:
            Object.prototype.hasOwnProperty.call(updates, "courseId")
              ? ((updates.courseId ?? undefined) as string | undefined)
              : undefined,
          unitId:
            Object.prototype.hasOwnProperty.call(updates, "unitId")
              ? (updates.unitId as string | null)
              : undefined,
        },
      );
      updatedReferenceItem = contentLibraryResult.item;

      if (contentLibraryResult.projectionSyncPayload) {
        scheduleReliableAfterTask({
          taskType: "content_library_projection_sync",
          taskKey: contentLibraryResult.projectionSyncPayload.itemIds.join(","),
          teacherId,
          payload: contentLibraryResult.projectionSyncPayload,
          run: async () => {
            await runContentLibraryProjectionSyncTask(
              { teacherId, supabase },
              contentLibraryResult.projectionSyncPayload!,
            );
          },
        });
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(updates, "folderId") ||
      Object.prototype.hasOwnProperty.call(updates, "category") ||
      (isWorksheetProjectReference &&
        Object.prototype.hasOwnProperty.call(updates, "title")) ||
      (current.assetSource !== "reference" &&
        (Object.prototype.hasOwnProperty.call(updates, "title") ||
          Object.prototype.hasOwnProperty.call(updates, "courseId") ||
          Object.prototype.hasOwnProperty.call(updates, "unitId")))
    ) {
      await updateAsset(
        { teacherId, supabase },
        id,
        {
          title:
            (current.assetSource !== "reference" || isWorksheetProjectReference) &&
            Object.prototype.hasOwnProperty.call(updates, "title")
              ? ((updatedReferenceItem?.displayTitle ||
                  updatedReferenceItem?.title ||
                  updates.title) as string)
              : undefined,
          fileName:
            isWorksheetProjectReference &&
            Object.prototype.hasOwnProperty.call(updates, "title")
              ? (updatedReferenceItem?.displayTitle ||
                  updatedReferenceItem?.title ||
                  (updates.title as string))
              : undefined,
          folderId:
            Object.prototype.hasOwnProperty.call(updates, "folderId")
              ? (updates.folderId as string | null)
              : undefined,
          courseId:
            current.assetSource !== "reference" &&
            Object.prototype.hasOwnProperty.call(updates, "courseId")
              ? (updates.courseId as string | null)
              : undefined,
          unitId:
            current.assetSource !== "reference" &&
            Object.prototype.hasOwnProperty.call(updates, "unitId")
              ? (updates.unitId as string | null)
              : undefined,
          category: typeof updates.category === "string" ? updates.category : undefined,
        },
      );
    }

    serverTiming.measure("update", updateStartedAt, "资产更新");

    const reloadStartedAt = performance.now();
    const asset = await getAsset({ teacherId, supabase }, id);
    serverTiming.measure("reload", reloadStartedAt, "更新后回读");
    if (!asset) {
      serverTiming.measure("response_ready", routeStartedAt, "更新后资产缺失");
      return withServerTiming(jsonError("NOT_FOUND", "资产不存在", 404), serverTiming);
    }

    const mergedAsset =
      current.assetSource === "reference" && updatedReferenceItem
        ? mergeReferenceAssetFromLibraryItem(asset, updatedReferenceItem)
        : asset;

    if (current.assetSource !== "reference") {
      revalidateContentAssets(teacherId);
    }

    serverTiming.measure("response_ready", routeStartedAt, "资产更新响应就绪");
    return withServerTiming(NextResponse.json({ asset: mergedAsset }), serverTiming);
  } catch (error) {
    if (error instanceof Error && error.message === "ASSET_NOT_FOUND") {
      serverTiming.measure("response_ready", routeStartedAt, "资产不存在");
      return withServerTiming(jsonError("NOT_FOUND", "资产不存在", 404), serverTiming);
    }
    console.error("[content-assets/[id]] PATCH 失败", error);
    serverTiming.measure("response_ready", routeStartedAt, "资产更新失败");
    return withServerTiming(jsonError(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "更新失败",
      500,
    ), serverTiming);
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
) {
  const serverTiming = createServerTimingRecorder();
  const routeStartedAt = performance.now();
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } =
    await getTeacherContext();

  if (!teacherId) {
    serverTiming.measure("response_ready", routeStartedAt, "鉴权失败");
    return withServerTiming(jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    ), serverTiming);
  }

  try {
    const { id } = await context.params;
    const lookupStartedAt = performance.now();
    const current = await getAsset({ teacherId, supabase }, id);
    serverTiming.measure("lookup", lookupStartedAt, "资产查询");

    if (!current) {
      revalidateContentAssets(teacherId);
      serverTiming.measure("response_ready", routeStartedAt, "资产已不存在");
      return withServerTiming(
        NextResponse.json({ success: true, alreadyDeleted: true }),
        serverTiming,
      );
    }

    const deleteStartedAt = performance.now();
    const currentDetail =
      current.assetSource === "reference"
        ? await buildContentAssetDetail({ teacherId, supabase }, current)
        : null;
    const contentLibraryItemId =
      current.contentLibraryItemId ?? currentDetail?.contentLibraryItem?.id ?? null;

    if (current.assetSource === "reference" && contentLibraryItemId) {
      const result = await deleteContentLibraryItems({ teacherId, supabase }, [contentLibraryItemId]);
      if (result.blockedIds.length > 0) {
        serverTiming.measure("delete", deleteStartedAt, "引用删除校验");
        serverTiming.measure("response_ready", routeStartedAt, "引用删除被阻止");
        return withServerTiming(jsonError("CONFLICT", "已发布教案不能删除", 409), serverTiming);
      }
      if (result.deletedIds.length === 0 && result.missingIds.includes(contentLibraryItemId)) {
        const deleted = await deleteAsset({ teacherId, supabase }, id);
        scheduleReliableAfterTask({
          taskType: "content_asset_cleanup",
          taskKey: deleted.assetId,
          teacherId,
          payload: deleted,
          run: async () => {
            await runContentAssetCleanupTask({
              client: { teacherId, supabase },
              assetId: deleted.assetId,
              storageBucket: deleted.storageBucket,
              storagePath: deleted.storagePath,
            });
          },
        });
        revalidateContentAssets(teacherId);
        serverTiming.measure("delete", deleteStartedAt, "孤儿引用资产删除");
        serverTiming.measure("response_ready", routeStartedAt, "孤儿引用删除响应就绪");
        return withServerTiming(
          NextResponse.json({ success: true, deletedOrphanReference: true }),
          serverTiming,
        );
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
      serverTiming.measure("delete", deleteStartedAt, "引用资产快删除");
      serverTiming.measure("response_ready", routeStartedAt, "引用删除响应就绪");
      return withServerTiming(NextResponse.json({ success: true }), serverTiming);
    }

    const deleted = await deleteAsset({ teacherId, supabase }, id);
    scheduleReliableAfterTask({
      taskType: "content_asset_cleanup",
      taskKey: deleted.assetId,
      teacherId,
      payload: deleted,
      run: async () => {
        await runContentAssetCleanupTask({
          client: { teacherId, supabase },
          assetId: deleted.assetId,
          storageBucket: deleted.storageBucket,
          storagePath: deleted.storagePath,
        });
      },
    });
    if (current.assetSource !== "reference") {
      scheduleReliableAfterTask({
        taskType: "content_asset_pdf_library_cleanup",
        taskKey: id,
        teacherId,
        payload: {
          assetId: id,
          contentLibraryItemId: current.contentLibraryItemId,
        },
        run: async () => {
          await runContentAssetPdfLibraryCleanupTask(
            { teacherId, supabase },
            {
              assetId: id,
              contentLibraryItemId: current.contentLibraryItemId,
            },
          );
        },
      });
    }
    revalidateContentAssets(teacherId);

    serverTiming.measure("delete", deleteStartedAt, "上传资产快删除");
    serverTiming.measure("response_ready", routeStartedAt, "删除响应就绪");
    return withServerTiming(NextResponse.json({ success: true }), serverTiming);
  } catch (error) {
    if (error instanceof Error && error.message === "ASSET_NOT_FOUND") {
      revalidateContentAssets(teacherId);
      serverTiming.measure("response_ready", routeStartedAt, "资产已不存在");
      return withServerTiming(
        NextResponse.json({ success: true, alreadyDeleted: true }),
        serverTiming,
      );
    }
    console.error("[content-assets/[id]] DELETE 失败", error);
    serverTiming.measure("response_ready", routeStartedAt, "资产删除失败");
    return withServerTiming(jsonError(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "删除失败",
      500,
    ), serverTiming);
  }
}
