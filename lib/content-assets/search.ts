import { generateEmbeddings } from "@/lib/ai/embeddings";
import { enrichAssetSummariesWithLibrary } from "@/lib/content-assets/content-library-bridge";
import { listAssets, listAssetSummaries } from "@/lib/content-assets/store";
import type {
  AssetStoreClient,
  ContentAssetSummary,
} from "@/lib/content-assets/types";
import { listContentLibraryItems, type ContentLibraryClient } from "@/lib/content-library/store";
import type { ContentLibraryListItem } from "@/lib/content-library/types";

type SearchAssetSummariesOptions = {
  query: string;
  limit?: number;
};

type SearchAssetSummariesResult = {
  items: ContentAssetSummary[];
  total: number;
};

function toContentLibraryClient(client: AssetStoreClient): ContentLibraryClient {
  return {
    teacherId: client.teacherId,
    supabase: client.supabase,
  };
}

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function buildLocalHaystack(summary: ContentAssetSummary) {
  return [
    summary.title,
    summary.fileName,
    summary.note,
    summary.courseName,
    summary.unitName,
    summary.sourceConversationTitle,
    summary.rendererType,
    summary.originEntityType,
    summary.summaryText,
  ]
    .map((part) => cleanText(part))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreLocalMatch(summary: ContentAssetSummary, normalizedQuery: string) {
  let score = 0;

  const title = cleanText(summary.title).toLowerCase();
  const fileName = cleanText(summary.fileName).toLowerCase();
  const note = cleanText(summary.note).toLowerCase();
  const courseName = cleanText(summary.courseName).toLowerCase();
  const unitName = cleanText(summary.unitName).toLowerCase();
  const sourceConversationTitle = cleanText(summary.sourceConversationTitle).toLowerCase();
  const haystack = buildLocalHaystack(summary);

  if (!haystack.includes(normalizedQuery)) {
    return 0;
  }

  score += 20;

  if (title === normalizedQuery) {
    score += 120;
  } else if (title.startsWith(normalizedQuery)) {
    score += 70;
  } else if (title.includes(normalizedQuery)) {
    score += 45;
  }

  if (fileName.startsWith(normalizedQuery)) {
    score += 35;
  } else if (fileName.includes(normalizedQuery)) {
    score += 20;
  }

  if (note.includes(normalizedQuery)) {
    score += 20;
  }
  if (courseName.includes(normalizedQuery)) {
    score += 12;
  }
  if (unitName.includes(normalizedQuery)) {
    score += 12;
  }
  if (sourceConversationTitle.includes(normalizedQuery)) {
    score += 10;
  }

  return score;
}

function upsertScore(
  ranking: Map<string, number>,
  assetId: string,
  score: number,
) {
  if (!assetId || score <= 0) return;
  const previous = ranking.get(assetId) ?? 0;
  if (score > previous) {
    ranking.set(assetId, score);
  }
}

function buildOriginKeys(
  summary: ContentAssetSummary,
) {
  const keys = new Set<string>();

  if (summary.contentLibraryItemId) {
    keys.add(`item:${summary.contentLibraryItemId}`);
  }

  if (summary.originEntityType && summary.originEntityId) {
    keys.add(`origin:${summary.originEntityType}:${summary.originEntityId}`);
  }

  if (summary.refEntityType && summary.refEntityId) {
    keys.add(`origin:${summary.refEntityType}:${summary.refEntityId}`);
  }

  return Array.from(keys);
}

function matchAssetForLibraryItem(
  item: ContentLibraryListItem,
  assetLookup: Map<string, ContentAssetSummary>,
) {
  const direct = assetLookup.get(`item:${item.id}`);
  if (direct) {
    return direct;
  }

  if (item.originEntityId) {
    return assetLookup.get(`origin:${item.originEntityType}:${item.originEntityId}`) ?? null;
  }

  return null;
}

async function semanticSearch(
  client: AssetStoreClient,
  queryText: string,
  limit: number,
): Promise<Array<{ assetId: string; similarity: number }>> {
  if (queryText.length < 4) return [];

  try {
    const { embeddings } = await generateEmbeddings({
      input: queryText,
      kind: "search_query",
    });
    if (!embeddings[0]) return [];

    const { data, error } = await (client.supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>)(
      "match_content_asset_chunks",
      {
        p_teacher_id: client.teacherId,
        query_embedding: `[${embeddings[0].join(",")}]`,
        match_count: limit,
        match_threshold: 0.35,
      },
    );
    if (error || !data) return [];

    const byAsset = new Map<string, number>();
    for (const row of (data as Array<{ asset_id: string; similarity: number }>)) {
      const prev = byAsset.get(row.asset_id) ?? 0;
      if (row.similarity > prev) byAsset.set(row.asset_id, row.similarity);
    }
    return Array.from(byAsset, ([assetId, similarity]) => ({ assetId, similarity }));
  } catch {
    return [];
  }
}

export async function searchAssetSummaries(
  client: AssetStoreClient,
  options: SearchAssetSummariesOptions,
): Promise<SearchAssetSummariesResult> {
  const queryText = cleanText(options.query);
  const normalizedQuery = queryText.toLowerCase();
  const limit = Math.min(Math.max(options.limit ?? 120, 1), 200);

  const summaries = await listAssetSummaries(client);
  const enrichedSummaries = await enrichAssetSummariesWithLibrary(client, summaries);

  if (!normalizedQuery) {
    return {
      items: enrichedSummaries.slice(0, limit),
      total: enrichedSummaries.length,
    };
  }

  const assetById = new Map(enrichedSummaries.map((summary) => [summary.id, summary]));
  const assetLookup = new Map<string, ContentAssetSummary>();

  for (const summary of enrichedSummaries) {
    for (const key of buildOriginKeys(summary)) {
      if (!assetLookup.has(key)) {
        assetLookup.set(key, summary);
      }
    }
  }

  const [assetMatches, libraryMatches, semanticMatches] = await Promise.all([
    listAssets(client, {
      query: queryText,
      limit: 200,
      offset: 0,
    }).catch(() => ({ items: [], total: 0 })),
    listContentLibraryItems(toContentLibraryClient(client), {
      query: queryText,
      limit: 120,
      offset: 0,
    }).catch(() => ({ items: [], total: 0 })),
    semanticSearch(client, queryText, 20),
  ]);

  const ranking = new Map<string, number>();

  enrichedSummaries.forEach((summary) => {
    upsertScore(ranking, summary.id, scoreLocalMatch(summary, normalizedQuery));
  });

  assetMatches.items.forEach((asset, index) => {
    upsertScore(ranking, asset.id, 150 - index);
  });

  libraryMatches.items.forEach((item, index) => {
    const matchedAsset = matchAssetForLibraryItem(item, assetLookup);
    if (!matchedAsset) {
      return;
    }
    upsertScore(ranking, matchedAsset.id, 220 - index);
  });

  semanticMatches.forEach(({ assetId, similarity }) => {
    const score = Math.round(70 + (similarity - 0.35) * 200);
    upsertScore(ranking, assetId, score);
  });

  const items = Array.from(ranking.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }

      const left = assetById.get(a[0]);
      const right = assetById.get(b[0]);
      return (right?.updatedAt ?? "").localeCompare(left?.updatedAt ?? "");
    })
    .slice(0, limit)
    .map(([assetId]) => assetById.get(assetId))
    .filter((summary): summary is ContentAssetSummary => summary != null);

  return {
    items,
    total: ranking.size,
  };
}
