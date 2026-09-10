import type {
  ContentLibraryDetail,
  ContentLibraryListItem,
  ContentLibraryOriginEntity,
} from "@/lib/content-library/types";
import {
  getContentLibraryItemDetail,
  getContentLibraryItemDetailsByOrigins,
  getContentLibraryListItemsByIds,
  getContentLibraryListItemsByOrigins,
  listContentLibraryItems,
  type ContentLibraryClient,
} from "@/lib/content-library/store";
import {
  toContentAssetSummary,
} from "@/lib/content-assets/summary";
import type {
  AssetStoreClient,
  ContentAsset,
  ContentAssetDetail,
  ContentAssetSummary,
} from "@/lib/content-assets/types";

type AssetLinkedLibraryOriginEntity = Extract<
  ContentLibraryOriginEntity,
  NonNullable<ContentAsset["refEntityType"]>
>;

function toContentLibraryClient(client: AssetStoreClient): ContentLibraryClient {
  return {
    teacherId: client.teacherId,
    supabase: client.supabase,
  };
}

function isAssetLinkedLibraryOriginEntity(
  value: ContentAsset["refEntityType"] | ContentLibraryOriginEntity | null,
): value is AssetLinkedLibraryOriginEntity {
  return (
    value === "rubric" ||
    value === "lesson_plan" ||
    value === "exercise" ||
    value === "pbl_project_plan"
  );
}

function mergeSummaryWithLibrary(
  summary: ContentAssetSummary,
  item: ContentLibraryListItem | null,
) {
  if (!item) {
    return summary;
  }

  return toContentAssetSummary({
    ...summary,
    contentLibraryItemId: item.id,
    title: item.displayTitle || summary.title,
    note: item.note,
    summaryText: item.summaryText ?? summary.summaryText,
    rendererType: item.rendererType,
    originEntityType: item.originEntityType,
    originEntityId: item.originEntityId,
    courseId: item.courseId,
    unitId: item.unitId,
    courseName: item.courseName,
    unitName: item.unitName,
    sourceConversationId: item.sourceConversationId,
    sourceConversationTitle: item.sourceConversationTitle,
  });
}

async function resolveReferenceListItems(
  client: AssetStoreClient,
  summaries: ContentAssetSummary[],
) {
  const contentLibraryClient = toContentLibraryClient(client);
  const contentLibraryItemIds = Array.from(
    new Set(
      summaries
        .map((summary) => summary.contentLibraryItemId)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const directItems = await getContentLibraryListItemsByIds(
    contentLibraryClient,
    contentLibraryItemIds,
  );
  const itemById = new Map(directItems.map((item) => [item.id, item]));

  const fallbackOrigins = summaries.flatMap((summary) => {
    if (
      summary.contentLibraryItemId ||
      !isAssetLinkedLibraryOriginEntity(summary.refEntityType) ||
      typeof summary.refEntityId !== "string" ||
      !summary.refEntityId.trim()
    ) {
      return [];
    }

    return [
      {
        originEntityType: summary.refEntityType,
        originEntityId: summary.refEntityId.trim(),
      },
    ];
  });

  const fallbackItems = await getContentLibraryListItemsByOrigins(
    contentLibraryClient,
    fallbackOrigins,
  );
  const itemByOrigin = new Map(
    fallbackItems
      .filter((item) => Boolean(item.originEntityId))
      .map((item) => [`${item.originEntityType}:${item.originEntityId}`, item]),
  );

  return { itemById, itemByOrigin };
}

export async function enrichAssetSummariesWithLibrary(
  client: AssetStoreClient,
  summaries: ContentAssetSummary[],
) {
  const referenceSummaries = summaries.filter(
    (summary) => summary.assetSource === "reference",
  );

  if (referenceSummaries.length === 0) {
    return summaries;
  }

  const { itemById, itemByOrigin } = await resolveReferenceListItems(
    client,
    referenceSummaries,
  );

  return summaries.map((summary) => {
    if (summary.assetSource !== "reference") {
      return summary;
    }

    const directItem = summary.contentLibraryItemId
      ? itemById.get(summary.contentLibraryItemId) ?? null
      : null;

    if (directItem) {
      return mergeSummaryWithLibrary(summary, directItem);
    }

    if (
      isAssetLinkedLibraryOriginEntity(summary.refEntityType) &&
      typeof summary.refEntityId === "string" &&
      summary.refEntityId.trim()
    ) {
      return mergeSummaryWithLibrary(
        summary,
        itemByOrigin.get(`${summary.refEntityType}:${summary.refEntityId.trim()}`) ?? null,
      );
    }

    return summary;
  });
}

async function resolveReferenceLibraryItem(
  client: AssetStoreClient,
  asset: ContentAsset,
) {
  const contentLibraryClient = toContentLibraryClient(client);

  if (asset.contentLibraryItemId) {
    return getContentLibraryItemDetail(contentLibraryClient, asset.contentLibraryItemId);
  }

  if (
    isAssetLinkedLibraryOriginEntity(asset.refEntityType) &&
    typeof asset.refEntityId === "string" &&
    asset.refEntityId.trim()
  ) {
    const items = await getContentLibraryItemDetailsByOrigins(contentLibraryClient, [
      {
        originEntityType: asset.refEntityType,
        originEntityId: asset.refEntityId.trim(),
      },
    ]);
    return items[0] ?? null;
  }

  if (
    asset.refEntityType === "content_library_item" &&
    typeof asset.refEntityId === "string" &&
    asset.refEntityId.trim()
  ) {
    return getContentLibraryItemDetail(contentLibraryClient, asset.refEntityId.trim());
  }

  return null;
}

export async function buildContentAssetDetail(
  client: AssetStoreClient,
  asset: ContentAsset,
): Promise<ContentAssetDetail> {
  if (asset.assetSource !== "reference") {
    return {
      detailKind: "uploaded",
      referenceStatus: null,
      asset: {
        ...asset,
        contentLibraryItemId: null,
      },
      contentLibraryItem: null,
    };
  }

  const contentLibraryItem = await resolveReferenceLibraryItem(client, asset);
  const mergedAsset = contentLibraryItem
    ? mergeReferenceAssetFromLibraryItem(asset, contentLibraryItem)
    : asset;

  return {
    detailKind: "reference",
    referenceStatus: contentLibraryItem ? "resolved" : "orphan",
    asset: mergedAsset,
    contentLibraryItem,
  };
}

export function mergeReferenceAssetFromLibraryItem(
  asset: ContentAsset,
  item: ContentLibraryDetail,
) {
  return {
    ...asset,
    contentLibraryItemId: item.id,
    title: item.displayTitle || asset.title,
    summaryText: item.summaryText ?? asset.summaryText,
    courseId: item.courseId,
    unitId: item.unitId,
    courseLabel: item.courseName,
    unitLabel: item.unitName,
  };
}

export function mergeReferenceAssetSummaryFromLibraryItem(
  summary: ContentAssetSummary,
  item: ContentLibraryDetail,
) {
  return toContentAssetSummary({
    ...summary,
    contentLibraryItemId: item.id,
    title: item.displayTitle || summary.title,
    note: item.note,
    summaryText: item.summaryText ?? summary.summaryText,
    rendererType: item.rendererType,
    originEntityType: item.originEntityType,
    originEntityId: item.originEntityId,
    courseId: item.courseId,
    unitId: item.unitId,
    courseName: item.courseName,
    unitName: item.unitName,
    sourceConversationId: item.sourceConversationId,
    sourceConversationTitle: item.sourceConversationTitle,
  });
}

function buildLibrarySearchText(item: ContentLibraryListItem) {
  return [
    item.displayTitle,
    item.title,
    item.note,
    item.courseName,
    item.unitName,
    item.sourceConversationTitle,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function listAllContentLibraryItems(client: ContentLibraryClient) {
  const items: ContentLibraryListItem[] = [];
  const pageSize = 200;
  let offset = 0;

  while (true) {
    const page = await listContentLibraryItems(client, {
      type: "all",
      limit: pageSize,
      offset,
    });
    items.push(...page.items);

    if (page.items.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return items;
}

export async function backfillMissingContentLibraryReferenceAssets(
  client: AssetStoreClient,
  existingSummaries: ContentAssetSummary[],
) {
  const { ensureDefaultFolders } = await import("@/lib/content-assets/folders");
  const contentLibraryClient = toContentLibraryClient(client);
  const libraryItems = await listAllContentLibraryItems(contentLibraryClient);

  if (libraryItems.length === 0) {
    return false;
  }

  const byContentLibraryItemId = new Set(
    existingSummaries
      .map((summary) => summary.contentLibraryItemId)
      .filter((value): value is string => Boolean(value)),
  );
  const byCanonicalRefId = new Set(
    existingSummaries
      .filter(
        (summary) =>
          summary.refEntityType === "content_library_item" &&
          typeof summary.refEntityId === "string" &&
          summary.refEntityId.trim(),
      )
      .map((summary) => summary.refEntityId!.trim()),
  );
  const byLegacyOrigin = new Set(
    existingSummaries
      .filter(
        (summary) =>
          isAssetLinkedLibraryOriginEntity(summary.refEntityType) &&
          typeof summary.refEntityId === "string" &&
          summary.refEntityId.trim(),
      )
      .map((summary) => `${summary.refEntityType}:${summary.refEntityId!.trim()}`),
  );

  const missingItems = libraryItems.filter((item) => {
    if (byContentLibraryItemId.has(item.id)) {
      return false;
    }
    if (byCanonicalRefId.has(item.id)) {
      return false;
    }
    if (
      isAssetLinkedLibraryOriginEntity(item.originEntityType) &&
      item.originEntityId &&
      byLegacyOrigin.has(`${item.originEntityType}:${item.originEntityId}`)
    ) {
      return false;
    }
    return true;
  });

  if (missingItems.length === 0) {
    return false;
  }

  const defaults = await ensureDefaultFolders(client);
  const rows = missingItems.map((item) => ({
    teacher_id: client.teacherId,
    folder_id: defaults.generatedFolder.id,
    asset_source: "reference" as const,
    ref_entity_type: "content_library_item" as const,
    ref_entity_id: item.id,
    content_library_item_id: item.id,
    title: item.displayTitle || item.title || "未命名引用",
    raw_text: null,
    search_text: buildLibrarySearchText(item),
    course_id: item.courseId,
    unit_id: item.unitId,
    course_label: item.courseName,
    unit_label: item.unitName,
    processing_status: "ready" as const,
    chunk_count: 0,
    tags: [],
    metadata: {},
  }));

  for (let index = 0; index < rows.length; index += 100) {
    const chunk = rows.slice(index, index + 100);
    const { error } = await client.supabase.from("content_assets").insert(chunk);
    if (error) {
      throw new Error("回填内容库资产索引失败");
    }
  }

  return true;
}
