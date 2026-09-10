import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { RefEntityType } from "@/lib/content-assets/types";
import { ensureDefaultFolders } from "@/lib/content-assets/folders";

type AppSupabase = SupabaseClient<Database>;

type AutoArchiveParams = {
  supabase: AppSupabase;
  teacherId: string;
  title: string;
  refEntityType: RefEntityType;
  refEntityId: string;
  sourceAssetIds: string[];
  rawText?: string;
  courseId?: string;
  unitId?: string;
  courseLabel?: string;
  unitLabel?: string;
};

type AutoArchiveResult = {
  assetId: string;
  edgeCount: number;
};

async function resolveTargetFolderId(
  supabase: AppSupabase,
  teacherId: string,
  sourceAssetIds: string[],
): Promise<string> {
  if (sourceAssetIds.length > 0) {
    const { data } = await supabase
      .from("content_assets")
      .select("folder_id")
      .eq("teacher_id", teacherId)
      .in("id", sourceAssetIds.slice(0, 8))
      .not("folder_id", "is", null)
      .limit(1);

    const folderId = data?.[0]?.folder_id;
    if (folderId) return folderId as string;
  }

  const defaults = await ensureDefaultFolders({
    supabase,
    teacherId,
  });
  return defaults.generatedFolder.id;
}

function buildSearchText(parts: Array<string | null | undefined>): string {
  return parts
    .filter(Boolean)
    .map((part) => (part ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
}

export async function autoArchiveGeneratedContent(
  params: AutoArchiveParams,
): Promise<AutoArchiveResult> {
  const {
    supabase,
    teacherId,
    title,
    refEntityType,
    refEntityId,
    sourceAssetIds,
    rawText,
    courseId,
    unitId,
    courseLabel,
    unitLabel,
  } = params;

  const uniqueSourceIds = Array.from(new Set(sourceAssetIds.filter(Boolean))).slice(0, 8);

  const folderId = await resolveTargetFolderId(supabase, teacherId, uniqueSourceIds);

  const { data: assetData, error: assetError } = await supabase
    .from("content_assets")
    .insert({
      teacher_id: teacherId,
      folder_id: folderId,
      asset_source: "reference",
      ref_entity_type: refEntityType,
      ref_entity_id: refEntityId,
      title: title.trim() || "未命名生成内容",
      raw_text: rawText ?? null,
      search_text: buildSearchText([title, courseLabel, unitLabel, rawText?.slice(0, 200)]),
      source_asset_ids: uniqueSourceIds,
      course_id: courseId ?? null,
      unit_id: unitId ?? null,
      course_label: courseLabel ?? null,
      unit_label: unitLabel ?? null,
      processing_status: "ready",
      chunk_count: 0,
      tags: [],
      metadata: {},
    })
    .select("id")
    .single();

  if (assetError || !assetData) {
    throw new Error(`自动归档失败: ${assetError?.message ?? "unknown"}`);
  }

  const targetAssetId = assetData.id as string;
  let edgeCount = 0;

  if (uniqueSourceIds.length > 0) {
    const edges = uniqueSourceIds.map((sourceId) => ({
      source_asset_id: sourceId,
      target_asset_id: targetAssetId,
      edge_type: "generated_from",
      weight: 1.0,
      created_by: "system",
    }));

    // content_asset_edges is a new table not yet in generated DB types
    const edgeTable = (supabase.from as unknown as (table: string) => ReturnType<AppSupabase["from"]>)(
      "content_asset_edges",
    );
    const { error: edgeError } = await edgeTable.insert(edges as never);

    if (!edgeError) {
      edgeCount = edges.length;
    }
  }

  return { assetId: targetAssetId, edgeCount };
}
