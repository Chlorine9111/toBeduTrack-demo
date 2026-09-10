import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { getAsset, updateProcessingStatus } from "@/lib/content-assets/store";
import { enqueueJob } from "@/lib/background-jobs/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  _request: Request,
  context: RouteContext,
) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } =
    await getTeacherContext();

  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  try {
    const { id } = await context.params;
    const asset = await getAsset({ teacherId, supabase }, id);

    if (!asset) {
      return jsonError("NOT_FOUND", "资产不存在", 404);
    }

    if (asset.assetSource === "reference") {
      return jsonError(
        "VALIDATION_ERROR",
        "引用类型资产不支持重新处理",
        400,
      );
    }

    if (!asset.storagePath) {
      return jsonError(
        "VALIDATION_ERROR",
        "资产缺少存储文件，无法重新处理",
        400,
      );
    }

    // 重置状态为 pending
    await updateProcessingStatus(id, "pending", {
      error: undefined,
    });

    // 重新入队
    await enqueueJob({
      teacherId,
      jobType: "asset_process",
      jobKey: `asset_process:${id}`,
      payload: {
        assetId: id,
        teacherId,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        storagePath: asset.storagePath,
      },
      priority: 1, // 重新处理优先级略高
      maxAttempts: 3,
    });

    return NextResponse.json({
      asset: {
        id: asset.id,
        processingStatus: "pending",
      },
    });
  } catch (error) {
    console.error("[content-assets/[id]/reprocess] POST 失败", error);
    return jsonError(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "重新处理失败",
      500,
    );
  }
}
