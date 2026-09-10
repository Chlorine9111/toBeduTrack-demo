import { invalidateAssetReadCache } from "@/lib/content-assets/store";
import type { AssetStoreClient } from "@/lib/content-assets/types";
import {
  buildContentAssetLibraryOriginKey,
} from "@/lib/content-assets/pdf-library-sync-helpers";
import {
  deleteContentLibraryItemByOriginKey,
  getContentLibraryItemDetail,
  getContentLibraryItemDetailsByOrigins,
} from "@/lib/content-library/store";
import { deleteDocument } from "@/lib/documents/store";

type ContentAssetPdfLibrarySyncPayload = {
  assetId: string;
};

type ContentAssetPdfLibraryCleanupPayload = {
  assetId: string;
  contentLibraryItemId?: string | null;
};

function toContentLibraryClient(client: AssetStoreClient) {
  return {
    teacherId: client.teacherId,
    supabase: client.supabase,
  };
}

export async function runContentAssetPdfLibrarySyncTask(
  _client: AssetStoreClient,
  _payload: ContentAssetPdfLibrarySyncPayload,
) {
  // Sidebar 上传的 PDF 现在只作为资料素材，不再自动同步进内容库/文档库。
  // 这里保留空实现，仅用于兼容历史已落库的后台重放任务。
  return null;
}

export async function runContentAssetPdfLibraryCleanupTask(
  client: AssetStoreClient,
  payload: ContentAssetPdfLibraryCleanupPayload,
) {
  const contentLibraryClient = toContentLibraryClient(client);
  const item =
    (payload.contentLibraryItemId
      ? await getContentLibraryItemDetail(contentLibraryClient, payload.contentLibraryItemId)
      : null) ??
    (await getContentLibraryItemDetailsByOrigins(contentLibraryClient, [
      {
        originEntityType: "content_asset",
        originEntityId: payload.assetId,
      },
    ]))[0] ??
    null;

  if (!item) {
    return null;
  }

  if (item.documentId) {
    await deleteDocument(
      {
        teacherId: client.teacherId,
        supabase: client.supabase,
      },
      item.documentId,
    );
  }

  await deleteContentLibraryItemByOriginKey(
    contentLibraryClient,
    buildContentAssetLibraryOriginKey(payload.assetId),
  );

  invalidateAssetReadCache(client.teacherId);

  return {
    assetId: payload.assetId,
    contentLibraryItemId: item.id,
    documentId: item.documentId,
  };
}
