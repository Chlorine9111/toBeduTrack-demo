import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";
import { enrichAssetSummariesWithLibrary } from "@/lib/content-assets/content-library-bridge";
import { listFolders, ensureDefaultFolders } from "@/lib/content-assets/folders";
import { listAssetSummaries } from "@/lib/content-assets/store";
import type { ContentAssetsBootstrapData } from "@/lib/content-assets/types";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const CONTENT_ASSETS_BOOTSTRAP_CACHE_KEY = "content-assets-bootstrap";
const CONTENT_ASSETS_BOOTSTRAP_REVALIDATE_SECONDS = 15;
const CONTENT_ASSETS_TAG_PREFIX = "content-assets";

function getContentAssetsCacheTag(teacherId: string) {
  return `${CONTENT_ASSETS_TAG_PREFIX}:${teacherId}`;
}

async function loadContentAssetsBootstrap(
  teacherId: string,
): Promise<ContentAssetsBootstrapData> {
  const supabase = createAdminSupabaseClient();
  const client = { teacherId, supabase };

  const [initialFolders, initialAssets] = await Promise.all([
    listFolders(client),
    listAssetSummaries(client),
  ]);
  let folders = initialFolders;
  const enrichedAssets = await enrichAssetSummariesWithLibrary(client, initialAssets);

  if (folders.length === 0) {
    await ensureDefaultFolders(client);
    folders = await listFolders(client);
  }

  return { folders, assets: enrichedAssets };
}

export async function getContentAssetsBootstrap(
  teacherId: string,
): Promise<ContentAssetsBootstrapData> {
  return unstable_cache(
    async () => loadContentAssetsBootstrap(teacherId),
    [CONTENT_ASSETS_BOOTSTRAP_CACHE_KEY, teacherId],
    {
      tags: [getContentAssetsCacheTag(teacherId)],
      revalidate: CONTENT_ASSETS_BOOTSTRAP_REVALIDATE_SECONDS,
    },
  )();
}

export function revalidateContentAssets(teacherId: string) {
  revalidateTag(getContentAssetsCacheTag(teacherId));
}
