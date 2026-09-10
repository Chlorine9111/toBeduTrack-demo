import { redirect } from "next/navigation";
import { buildContentAssetsRoute } from "@/lib/content-assets/routes";

type SearchParamValue = string | string[] | undefined;

function readSingleParam(value: SearchParamValue) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value[0]?.trim();
  return "";
}

export default async function MainLibraryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, SearchParamValue>>;
}) {
  const resolved = (await searchParams) ?? {};
  redirect(
    buildContentAssetsRoute({
      assetId: readSingleParam(resolved.assetId) || null,
      itemId: readSingleParam(resolved.itemId) || null,
      originEntityId: readSingleParam(resolved.originEntityId) || null,
      type: readSingleParam(resolved.type) || readSingleParam(resolved.kind) || null,
      query: readSingleParam(resolved.q) || null,
    }),
  );
}
