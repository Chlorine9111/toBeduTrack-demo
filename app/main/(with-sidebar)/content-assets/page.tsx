import ContentAssetsPage from "@/components/main/content-assets/ContentAssetsPage";
import { getTeacherIdentity } from "@/lib/api/teacher-context";
import { requireActorAnyRole } from "@/lib/auth/require-role";
import { getContentAssetsBootstrap } from "@/lib/content-assets/bootstrap";
import { resolveInitialContentAssetId } from "@/lib/content-assets/routes";

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

export default async function Page({ searchParams }: PageProps) {
  await requireActorAnyRole(["subject_teacher", "admin"], "/main/content-assets");
  const identity = await getTeacherIdentity();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialSearchQuery = readFirst(resolvedSearchParams?.q);
  const directAssetId = readFirst(resolvedSearchParams?.assetId);
  const itemId = readFirst(resolvedSearchParams?.itemId);
  const originEntityId = readFirst(resolvedSearchParams?.originEntityId);
  const entityType = readFirst(resolvedSearchParams?.type);
  const shouldPrefetchBootstrap = Boolean(
    initialSearchQuery || directAssetId || itemId || originEntityId || entityType,
  );
  let initialData = null;
  let initialSelectedAssetId: string | null = null;

  if (identity.teacherId && shouldPrefetchBootstrap) {
    try {
      initialData = await getContentAssetsBootstrap(identity.teacherId);
      initialSelectedAssetId = resolveInitialContentAssetId(initialData.assets, {
        assetId: directAssetId,
        itemId,
        originEntityId,
        type: entityType,
      });
    } catch (error) {
      console.error("[content-assets/page] 首屏预取失败", error);
    }
  }

  return (
    <ContentAssetsPage
      initialData={initialData}
      initialSelectedAssetId={initialSelectedAssetId}
      initialSearchQuery={initialSearchQuery}
    />
  );
}
