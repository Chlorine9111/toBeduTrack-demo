import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidateContentAssets } from "@/lib/content-assets/bootstrap";
import { invalidateAssetReadCache } from "@/lib/content-assets/store";
import { createReferenceAsset } from "@/lib/content-assets/store";
import { ensureDefaultFolders } from "@/lib/content-assets/folders";
import { normalizeGeneratedContentTitle } from "@/lib/content/title-normalization";
import type { RefEntityType } from "@/lib/content-assets/types";
import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

/**
 * 在 content_assets 中创建/更新一个 reference 记录，指向 AI 生成物。
 * 放到"最近生成"系统文件夹。
 *
 * 调用方式：在 content-library/sync.ts 的各个 sync* 函数中，
 * 成功 upsert content_library_item 后调用此函数。
 *
 * 设计为 fire-and-forget，失败不影响主流程。
 */
export async function syncContentAssetReference(params: {
  supabase: AppSupabase;
  teacherId: string;
  refEntityType: RefEntityType;
  refEntityId: string;
  contentLibraryItemId?: string;
  title: string;
  fileName?: string | null;
  rawText?: string;
  courseId?: string | null;
  unitId?: string | null;
  courseLabel?: string | null;
  unitLabel?: string | null;
}): Promise<void> {
  try {
    const client = { teacherId: params.teacherId, supabase: params.supabase };
    const normalizedTitle = normalizeGeneratedContentTitle(params.title) || params.title.trim() || "未命名引用";
    const canonicalItemId =
      params.contentLibraryItemId?.trim() ||
      (params.refEntityType === "content_library_item" ? params.refEntityId.trim() : "");
    const nextRefEntityType = canonicalItemId
      ? ("content_library_item" as const)
      : params.refEntityType;
    const nextRefEntityId = canonicalItemId || params.refEntityId;
    const nextFileName = `${params.fileName ?? ""}`.trim() || null;
    const searchText = [
      normalizedTitle,
      nextFileName,
      params.courseLabel,
      params.unitLabel,
      params.rawText?.slice(0, 200),
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    let existing: { id: string } | null = null;

    if (canonicalItemId) {
      const { data } = await params.supabase
        .from("content_assets")
        .select("id")
        .eq("teacher_id", params.teacherId)
        .eq("asset_source", "reference")
        .eq("content_library_item_id", canonicalItemId)
        .limit(1)
        .maybeSingle();
      existing = data;
    }

    if (!existing) {
      const { data } = await params.supabase
        .from("content_assets")
        .select("id")
        .eq("teacher_id", params.teacherId)
        .eq("asset_source", "reference")
        .eq("ref_entity_type", params.refEntityType)
        .eq("ref_entity_id", params.refEntityId)
        .limit(1)
        .maybeSingle();
      existing = data;
    }

    if (!existing && canonicalItemId) {
      const { data } = await params.supabase
        .from("content_assets")
        .select("id")
        .eq("teacher_id", params.teacherId)
        .eq("asset_source", "reference")
        .eq("ref_entity_type", "content_library_item")
        .eq("ref_entity_id", canonicalItemId)
        .limit(1)
        .maybeSingle();
      existing = data;
    }

    if (existing) {
      const { error } = await params.supabase
        .from("content_assets")
        .update({
          ref_entity_type: nextRefEntityType,
          ref_entity_id: nextRefEntityId,
          content_library_item_id: canonicalItemId || null,
          storage_path: null,
          storage_bucket: null as unknown as string,
          file_name: nextFileName,
          file_type: null,
          mime_type: null,
          file_size_bytes: null,
          title: normalizedTitle,
          raw_text: params.rawText ?? null,
          course_id: params.courseId ?? null,
          unit_id: params.unitId ?? null,
          course_label: params.courseLabel ?? null,
          unit_label: params.unitLabel ?? null,
          search_text: searchText,
        })
        .eq("id", existing.id)
        .eq("teacher_id", params.teacherId);

      if (error) {
        throw error;
      }

      revalidateContentAssets(params.teacherId);
      invalidateAssetReadCache(params.teacherId);
      return;
    }

    // 获取"最近生成"文件夹
    const defaults = await ensureDefaultFolders(client);

    await createReferenceAsset(client, {
      folderId: defaults.generatedFolder.id,
      refEntityType: nextRefEntityType,
      refEntityId: nextRefEntityId,
      contentLibraryItemId: canonicalItemId || undefined,
      title: normalizedTitle,
      fileName: nextFileName,
      rawText: params.rawText,
      courseId: params.courseId ?? undefined,
      unitId: params.unitId ?? undefined,
      courseLabel: params.courseLabel ?? undefined,
      unitLabel: params.unitLabel ?? undefined,
    });
    invalidateAssetReadCache(params.teacherId);
    revalidateContentAssets(params.teacherId);
  } catch (error) {
    // fire-and-forget：不影响主流程
    console.warn(
      "[content-assets/sync-reference] 创建 reference asset 失败，已忽略",
      {
        refEntityType: params.refEntityType,
        refEntityId: params.refEntityId,
        error: error instanceof Error ? error.message : "unknown",
      },
    );
  }
}
