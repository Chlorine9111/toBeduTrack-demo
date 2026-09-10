import type { ContentAsset } from "@/lib/content-assets/types";

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.trim();
}

export function buildContentAssetLibraryOriginKey(assetId: string) {
  return `content-asset:${assetId}`;
}

export function isUploadedPdfAsset(
  asset: Pick<ContentAsset, "assetSource" | "fileName" | "fileType" | "mimeType">,
) {
  if (asset.assetSource !== "uploaded") return false;
  const mimeType = cleanText(asset.mimeType).toLowerCase();
  const fileType = cleanText(asset.fileType).toLowerCase();
  const fileName = cleanText(asset.fileName).toLowerCase();
  return (
    mimeType === "application/pdf" ||
    fileType === "application/pdf" ||
    fileName.endsWith(".pdf")
  );
}
