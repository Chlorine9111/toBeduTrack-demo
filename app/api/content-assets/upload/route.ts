import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { createUploadedAsset } from "@/lib/content-assets/store";
import { revalidateContentAssets } from "@/lib/content-assets/bootstrap";
import { toContentAssetSummaryFromAsset } from "@/lib/content-assets/summary";
import {
  validateUploadFile,
  sanitizeFileName,
  uploadToStorage,
} from "@/lib/content-assets/upload";
import { enqueueJob } from "@/lib/background-jobs/store";
import { scheduleReliableAfterTask } from "@/lib/runtime/background-task";
import { processJobByKey } from "@/lib/background-jobs/worker";
import "@/lib/background-jobs/handlers";

export async function POST(request: Request) {
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
    const formData = await request.formData();

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return jsonError("VALIDATION_ERROR", "请上传一个文件", 400);
    }

    const safeName = sanitizeFileName(file.name || `upload-${Date.now()}`);

    const validation = validateUploadFile(file, safeName);
    if (!validation.valid) {
      return jsonError("VALIDATION_ERROR", validation.reason, 400);
    }

    const folderId =
      `${formData.get("folderId") ?? ""}`.trim() || undefined;
    const title =
      `${formData.get("title") ?? ""}`.trim() || undefined;

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { storagePath } = await uploadToStorage({
      teacherId,
      fileBuffer,
      sanitizedFileName: safeName,
      mimeType: file.type || "application/octet-stream",
    });

    const asset = await createUploadedAsset(
      { teacherId, supabase },
      {
        folderId,
        fileName: safeName,
        fileType: file.type || "application/octet-stream",
        mimeType: file.type || "application/octet-stream",
        fileSizeBytes: file.size,
        storagePath,
        title,
      },
    );

    await enqueueJob({
      teacherId,
      jobType: "asset_process",
      jobKey: `asset_process:${asset.id}`,
      payload: {
        assetId: asset.id,
        teacherId,
        fileName: safeName,
        mimeType: file.type || "application/octet-stream",
        storagePath,
      },
      priority: 0,
      maxAttempts: 3,
    });

    scheduleReliableAfterTask({
      taskType: "asset_process_kick",
      taskKey: `asset_process:${asset.id}`,
      teacherId,
      payload: {
        assetId: asset.id,
        jobKey: `asset_process:${asset.id}`,
      },
      run: async () => {
        await processJobByKey(`asset_process:${asset.id}`);
      },
    });

    revalidateContentAssets(teacherId);

    return NextResponse.json({
      asset: toContentAssetSummaryFromAsset(asset),
    });
  } catch (error) {
    console.error("[content-assets/upload] 上传失败", error);
    return jsonError(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "上传失败，请稍后重试",
      500,
    );
  }
}
