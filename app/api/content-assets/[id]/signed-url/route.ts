import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getTeacherIdentity } from "@/lib/api/teacher-context";
import { getAssetFileSource } from "@/lib/content-assets/store";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

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
    const supabase = createAdminSupabaseClient();
    const asset = await getAssetFileSource({ teacherId, supabase }, id);

    if (!asset) {
      return jsonError("NOT_FOUND", "资产不存在", 404);
    }

    if (asset.assetSource === "reference") {
      return jsonError(
        "ASSET_NOT_FILE_BACKED",
        "该内容是内容库引用，不支持原始文件预览",
        400,
      );
    }

    if (!asset.storageBucket || !asset.storagePath) {
      return jsonError("ASSET_NOT_FILE_BACKED", "该资产没有关联的存储文件", 400);
    }

    const { data, error } = await supabase.storage
      .from(asset.storageBucket)
      .createSignedUrl(asset.storagePath, 3600);

    if (error || !data?.signedUrl) {
      console.error("[content-assets/signed-url] 生成签名 URL 失败", error);
      return jsonError("INTERNAL_ERROR", "生成签名 URL 失败", 500);
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (error) {
    console.error("[content-assets/signed-url] GET 失败", error);
    return jsonError(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "查询失败",
      500,
    );
  }
}
