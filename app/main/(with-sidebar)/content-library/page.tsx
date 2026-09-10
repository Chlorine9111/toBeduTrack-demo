import { redirect } from "next/navigation";
import { buildContentAssetsRoute } from "@/lib/content-assets/routes";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readFirst(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }
  return value?.trim() || null;
}

export default async function MainContentLibraryPage({
  searchParams,
}: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  redirect(
    buildContentAssetsRoute({
      assetId: readFirst(resolvedSearchParams?.assetId),
      itemId: readFirst(resolvedSearchParams?.itemId),
      originEntityId: readFirst(resolvedSearchParams?.originEntityId),
      type: readFirst(resolvedSearchParams?.type),
      query: readFirst(resolvedSearchParams?.q),
    }),
  );
}
