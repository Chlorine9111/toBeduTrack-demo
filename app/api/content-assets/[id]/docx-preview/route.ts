import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { jsonError } from "@/lib/api/response";
import { getTeacherIdentity } from "@/lib/api/teacher-context";
import { getAssetFileSource } from "@/lib/content-assets/store";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { parseDocxBuffer } from "@/lib/wechat-editor/docx-parser";

type RouteContext = { params: Promise<{ id: string }> };

async function loadDocxPreview(teacherId: string, assetId: string) {
  const supabase = createAdminSupabaseClient();
  const asset = await getAssetFileSource({ teacherId, supabase }, assetId);

  if (!asset) {
    throw new Error("NOT_FOUND");
  }

  if (asset.assetSource === "reference") {
    throw new Error("ASSET_NOT_FILE_BACKED");
  }

  if (!asset.storageBucket || !asset.storagePath) {
    throw new Error("ASSET_NOT_FILE_BACKED");
  }

  const { data, error } = await supabase.storage
    .from(asset.storageBucket)
    .download(asset.storagePath);

  if (error || !data) {
    throw new Error("DOWNLOAD_FAILED");
  }

  const parsed = await parseDocxBuffer(Buffer.from(await data.arrayBuffer()));
  return { html: parsed.html };
}

function getCachedDocxPreview(teacherId: string, assetId: string) {
  return unstable_cache(
    async () => loadDocxPreview(teacherId, assetId),
    ["content-assets-docx-preview", teacherId, assetId],
    {
      tags: [`content-assets:${teacherId}`],
      revalidate: 60 * 15,
    },
  )();
}

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  const { teacherId, authBypass, errorMessage, errorStatus } =
    await getTeacherIdentity();

  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  try {
    const { id } = await context.params;
    const preview = await getCachedDocxPreview(teacherId, id);
    return NextResponse.json(preview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return jsonError("NOT_FOUND", "资产不存在", 404);
    }

    if (error instanceof Error && error.message === "ASSET_NOT_FILE_BACKED") {
      return jsonError(
        "ASSET_NOT_FILE_BACKED",
        "该内容不是可下载的 Word 原件",
        400,
      );
    }

    console.error("[content-assets/docx-preview] GET 失败", error);
    return jsonError(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "读取 Word 预览失败",
      500,
    );
  }
}
