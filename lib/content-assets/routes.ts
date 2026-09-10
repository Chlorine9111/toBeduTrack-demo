import type {
  ContentAssetSummary,
  RefEntityType,
} from "@/lib/content-assets/types";

type ContentAssetsRouteParams = {
  assetId?: string | null;
  itemId?: string | null;
  originEntityId?: string | null;
  type?: string | null;
  query?: string | null;
};

const QUERY_TO_REF_ENTITY_TYPE: Partial<Record<string, RefEntityType>> = {
  exercise: "exercise",
  lesson_plan: "lesson_plan",
  pbl: "pbl_project_plan",
  rubric: "rubric",
};

function clean(value: string | null | undefined) {
  const normalized = `${value ?? ""}`.trim();
  return normalized || null;
}

export function buildContentAssetsRoute(params: ContentAssetsRouteParams = {}) {
  const searchParams = new URLSearchParams();

  const assetId = clean(params.assetId);
  const itemId = clean(params.itemId);
  const originEntityId = clean(params.originEntityId);
  const type = clean(params.type);
  const query = clean(params.query);

  if (assetId) searchParams.set("assetId", assetId);
  if (itemId) searchParams.set("itemId", itemId);
  if (originEntityId) searchParams.set("originEntityId", originEntityId);
  if (type) searchParams.set("type", type);
  if (query) searchParams.set("q", query);

  const queryString = searchParams.toString();
  return queryString
    ? `/main/content-assets?${queryString}`
    : "/main/content-assets";
}

export function resolveInitialContentAssetId(
  assets: ContentAssetSummary[],
  params: ContentAssetsRouteParams = {},
) {
  const assetId = clean(params.assetId);
  if (assetId && assets.some((asset) => asset.id === assetId)) {
    return assetId;
  }

  const itemId = clean(params.itemId);
  if (itemId) {
    const matchedByItem = assets.find(
      (asset) =>
        asset.contentLibraryItemId === itemId ||
        (asset.refEntityType === "content_library_item" && asset.refEntityId === itemId),
    );
    if (matchedByItem) {
      return matchedByItem.id;
    }
  }

  const originEntityId = clean(params.originEntityId);
  const type = clean(params.type);
  const refEntityType = type ? QUERY_TO_REF_ENTITY_TYPE[type] ?? null : null;

  if (!originEntityId) {
    return null;
  }

  const matchedByOrigin = assets.find((asset) => {
    if (asset.originEntityId !== originEntityId) {
      return false;
    }
    return refEntityType ? asset.originEntityType === refEntityType : true;
  });
  if (matchedByOrigin) {
    return matchedByOrigin.id;
  }

  const matchedByLegacyRef = assets.find((asset) => {
    if (asset.refEntityId !== originEntityId) {
      return false;
    }
    return refEntityType ? asset.refEntityType === refEntityType : true;
  });

  return matchedByLegacyRef?.id ?? null;
}
