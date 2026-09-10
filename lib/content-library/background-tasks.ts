import { deleteLessonPlan } from "@/lib/lesson-plan/store";
import { deleteProjectPlan } from "@/lib/pbl/store";
import { revalidateContentAssets } from "@/lib/content-assets/bootstrap";
import { invalidateAssetReadCache } from "@/lib/content-assets/store";
import {
  removeContentLibrarySemanticIndexItems,
  syncContentLibrarySemanticIndexItems,
} from "@/lib/content-library/semantic-index";
import {
  getContentLibraryItemDetailsByIds,
  type ContentLibraryClient,
} from "@/lib/content-library/store";
import type { ContentLibraryOriginEntity } from "@/lib/content-library/types";

export type ContentLibraryProjectionSyncPayload = {
  itemIds: string[];
};

export type ContentLibraryOriginCleanupPayload = {
  items: Array<{
    itemId: string;
    originEntityType: ContentLibraryOriginEntity;
    originEntityId: string | null;
  }>;
};

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function buildSearchText(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => cleanText(part))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

async function syncLinkedContentAssetsForLibraryItem(
  client: ContentLibraryClient,
  item: Awaited<ReturnType<typeof getContentLibraryItemDetailsByIds>>[number],
) {
  const displayTitle = item.displayTitle || item.title;
  const searchText = buildSearchText([
    item.title,
    item.displayTitle,
    item.note,
    item.summaryText,
    item.courseName,
    item.unitName,
    item.sourceConversationTitle,
  ]);

  const { error } = await client.supabase
    .from("content_assets")
    .update({
      title: displayTitle,
      content_library_item_id: item.id,
      course_id: item.courseId,
      unit_id: item.unitId,
      course_label: item.courseName,
      unit_label: item.unitName,
      search_text: searchText,
    })
    .eq("teacher_id", client.teacherId)
    .eq("content_library_item_id", item.id);

  if (error) {
    throw new Error("同步资产引用失败");
  }
}

export async function runContentLibraryProjectionSyncTask(
  client: ContentLibraryClient,
  payload: ContentLibraryProjectionSyncPayload,
) {
  const itemIds = Array.from(new Set(payload.itemIds.filter(Boolean)));
  if (itemIds.length === 0) return;

  const items = await getContentLibraryItemDetailsByIds(client, itemIds);
  if (items.length === 0) return;

  await Promise.all([
    syncContentLibrarySemanticIndexItems({
      supabase: client.supabase,
      teacherId: client.teacherId,
      itemIds: items.map((item) => item.id),
    }),
    ...items.map((item) => syncLinkedContentAssetsForLibraryItem(client, item)),
  ]);

  invalidateAssetReadCache(client.teacherId);
  revalidateContentAssets(client.teacherId);
}

export async function runContentLibraryOriginCleanupTask(
  client: ContentLibraryClient,
  payload: ContentLibraryOriginCleanupPayload,
) {
  const items = payload.items.filter((item) => item.itemId);
  if (items.length === 0) return;

  for (const item of items) {
    if (item.originEntityType === "lesson_plan" && item.originEntityId) {
      await deleteLessonPlan(
        {
          teacherId: client.teacherId,
          supabase: client.supabase,
          isMock: false,
        },
        item.originEntityId,
      );
      continue;
    }

    if (item.originEntityType === "rubric" && item.originEntityId) {
      const { error } = await client.supabase
        .from("rubrics")
        .delete()
        .eq("id", item.originEntityId)
        .eq("teacher_id", client.teacherId);

      if (error) {
        throw new Error("删除 Rubric 失败");
      }
      continue;
    }

    if (item.originEntityType === "pbl_project_plan" && item.originEntityId) {
      await deleteProjectPlan(
        {
          teacherId: client.teacherId,
          supabase: client.supabase,
          isMock: false,
        },
        item.originEntityId,
      );
      continue;
    }

    if (item.originEntityType === "exercise" && item.originEntityId) {
      const { error } = await client.supabase
        .from("exercises")
        .delete()
        .eq("id", item.originEntityId)
        .eq("teacher_id", client.teacherId);

      if (error) {
        throw new Error("删除习题失败");
      }

      continue;
    }

    if (item.originEntityType === "content_asset") {
      continue;
    }
  }

  await removeContentLibrarySemanticIndexItems({
    supabase: client.supabase,
    teacherId: client.teacherId,
    itemIds: items.map((item) => item.itemId),
  });
}
