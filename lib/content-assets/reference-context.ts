import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateEmbeddings,
  resolveEmbeddingDimension,
} from "@/lib/ai/embeddings";
import type { ContentLibraryOriginEntity } from "@/lib/content-library/types";
import type { Database } from "@/types/database";
import type { UploadedMaterial } from "@/lib/agent/chat-shared";
import { budgetPromptSections } from "@/lib/ai/prompt-budget";
import { serializeEmbedding } from "@/lib/semantic-index/store";
import { resolveContentLibraryReferenceMaterials } from "@/lib/content-library/reference-materials";
import {
  buildChunkBackedAssetMaterials,
  type ContentAssetChunkMatchRow,
  type AssetReferenceMaterialRow,
} from "@/lib/content-assets/reference-context-helpers";
import {
  getContentLibraryItemDetailsByOrigins,
  type ContentLibraryClient,
} from "@/lib/content-library/store";

type AppSupabase = SupabaseClient<Database>;

const FULLTEXT_THRESHOLD_CHARS = 2_000;
const SEMANTIC_BUDGET_CHARS = 12_000;
const CHUNK_MATCH_COUNT = 20;
const CHUNK_MATCH_THRESHOLD = 0.35;
const LIBRARY_ORIGIN_TYPES = new Set([
  "rubric",
  "lesson_plan",
  "exercise",
  "pbl_project_plan",
]);

type AssetRow = {
  id: string;
  title: string;
  file_type: string | null;
  raw_text: string | null;
  summary_text: string | null;
  asset_source: "uploaded" | "reference";
  content_library_item_id: string | null;
  ref_entity_type: string | null;
  ref_entity_id: string | null;
};

type UploadedAssetMaterialRow = AssetReferenceMaterialRow;

type ContentLibraryReferenceSource = {
  kind: "content_library_references";
  summary: string;
  items: Array<{
    id: string;
    title: string;
    contentType: string;
    courseName: string | null;
    unitName: string | null;
  }>;
};

type ResolveContentAssetReferencesResult = {
  materials: UploadedMaterial[];
  sources: ContentLibraryReferenceSource[];
  warnings: string[];
};

function toContentLibraryClient(
  supabase: AppSupabase,
  teacherId: string,
): ContentLibraryClient {
  return { supabase, teacherId };
}

function buildAssetReferenceText(row: AssetRow): string {
  const body = row.raw_text?.trim() || row.summary_text?.trim() || "";
  return [
    `文件标题：${row.title}`,
    row.file_type ? `文件类型：${row.file_type}` : "",
    body,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function applyBudgetToAssets(
  rows: AssetRow[],
  budget: number,
): UploadedMaterial[] {
  const texts = rows.map((row) => buildAssetReferenceText(row));
  const totalLength = texts.reduce((sum, text) => sum + text.length, 0);

  if (totalLength <= budget) {
    return rows.map((row, i) => ({
      fileName: `引用文件 · ${row.title}`,
      fileType: row.file_type ?? "unknown",
      textContent: texts[i],
    }));
  }

  const budgeted = budgetPromptSections(
    rows.map((row, i) => ({
      key: row.id,
      text: texts[i],
      weight: 1,
      minTokens: 60,
    })),
    Math.floor(budget / 4),
  );

  return rows.map((row) => ({
    fileName: `引用文件 · ${row.title}`,
    fileType: row.file_type ?? "unknown",
    textContent: budgeted[row.id] ?? "",
  }));
}

async function resolveUploadedAssetMaterials(params: {
  supabase: AppSupabase;
  teacherId: string;
  rows: AssetRow[];
  userQuery: string;
  budget: number;
}) {
  if (params.rows.length === 0) {
    return [];
  }

  const texts = params.rows.map((row) => buildAssetReferenceText(row));
  const totalLength = texts.reduce((sum, text) => sum + text.length, 0);

  if (totalLength <= FULLTEXT_THRESHOLD_CHARS) {
    return params.rows.map((row, index) => ({
      fileName: `引用文件 · ${row.title}`,
      fileType: row.file_type ?? "unknown",
      textContent: texts[index],
    }));
  }

  const query = params.userQuery.trim();
  if (!query) {
    return applyBudgetToAssets(params.rows, params.budget);
  }

  try {
    const dimensions = resolveEmbeddingDimension();
    const response = await generateEmbeddings({
      input: query,
      kind: "search_query",
      dimensions,
    });
    const queryEmbedding = response.embeddings[0];
    if (!queryEmbedding || queryEmbedding.length === 0) {
      return applyBudgetToAssets(params.rows, params.budget);
    }

    const { data, error } = await (params.supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>)(
      "match_content_asset_chunks",
      {
        p_teacher_id: params.teacherId,
        p_asset_ids: params.rows.map((row) => row.id),
        query_embedding: serializeEmbedding(queryEmbedding),
        match_count: CHUNK_MATCH_COUNT,
        match_threshold: CHUNK_MATCH_THRESHOLD,
      },
    );

    if (error) {
      throw new Error(error.message);
    }

    const chunkMaterials = buildChunkBackedAssetMaterials({
      rows: params.rows,
      chunks: (data ?? []) as ContentAssetChunkMatchRow[],
      budget: params.budget,
    });

    return chunkMaterials.length > 0
      ? chunkMaterials
      : applyBudgetToAssets(params.rows, params.budget);
  } catch {
    return applyBudgetToAssets(params.rows, params.budget);
  }
}

async function resolveReferenceLibraryItemIds(params: {
  supabase: AppSupabase;
  teacherId: string;
  rows: AssetRow[];
}) {
  const directIds = params.rows.flatMap((row) => {
    if (row.content_library_item_id) {
      return [row.content_library_item_id];
    }
    if (row.ref_entity_type === "content_library_item" && row.ref_entity_id) {
      return [row.ref_entity_id];
    }
    return [];
  });

  const originLookups: Array<{
    originEntityType: ContentLibraryOriginEntity;
    originEntityId: string;
  }> = params.rows.flatMap((row) => {
    if (!row.ref_entity_type || !row.ref_entity_id) {
      return [];
    }
    if (!LIBRARY_ORIGIN_TYPES.has(row.ref_entity_type)) {
      return [];
    }
    return [{
      originEntityType: row.ref_entity_type as ContentLibraryOriginEntity,
      originEntityId: row.ref_entity_id,
    }];
  });

  if (originLookups.length === 0) {
    return Array.from(new Set(directIds));
  }

  const fallbackDetails = await getContentLibraryItemDetailsByOrigins(
    toContentLibraryClient(params.supabase, params.teacherId),
    originLookups,
  );

  return Array.from(
    new Set([
      ...directIds,
      ...fallbackDetails.map((item) => item.id),
    ]),
  );
}

export async function resolveContentAssetReferences(params: {
  supabase: AppSupabase;
  teacherId: string;
  assetIds: string[];
  userQuery: string;
  budgetChars?: number;
}): Promise<ResolveContentAssetReferencesResult> {
  const uniqueIds = Array.from(new Set(params.assetIds.filter(Boolean))).slice(0, 8);
  if (uniqueIds.length === 0) {
    return { materials: [], sources: [], warnings: [] };
  }

  const { data, error } = await params.supabase
    .from("content_assets")
    .select([
      "id",
      "title",
      "file_type",
      "raw_text",
      "summary_text",
      "asset_source",
      "content_library_item_id",
      "ref_entity_type",
      "ref_entity_id",
    ].join(", "))
    .eq("teacher_id", params.teacherId)
    .in("id", uniqueIds);

  if (error) {
    return {
      materials: [],
      sources: [],
      warnings: ["读取引用内容失败，已跳过。"],
    };
  }

  const rows = (data ?? []) as unknown as AssetRow[];
  const foundIds = new Set(rows.map((row) => row.id));
  const warnings: string[] = [];

  if (uniqueIds.some((id) => !foundIds.has(id))) {
    warnings.push("部分引用内容不存在或无权访问，已自动跳过。");
  }

  const uploadedRows = rows.filter((row) => row.asset_source !== "reference");
  const referenceRows = rows.filter((row) => row.asset_source === "reference");
  const budget = params.budgetChars ?? SEMANTIC_BUDGET_CHARS;

  const uploadedMaterials = await resolveUploadedAssetMaterials({
    supabase: params.supabase,
    teacherId: params.teacherId,
    rows: uploadedRows,
    userQuery: params.userQuery,
    budget,
  });

  const referenceItemIds = await resolveReferenceLibraryItemIds({
    supabase: params.supabase,
    teacherId: params.teacherId,
    rows: referenceRows,
  });

  const contentLibraryResult = await resolveContentLibraryReferenceMaterials({
    client: toContentLibraryClient(params.supabase, params.teacherId),
    itemIds: referenceItemIds,
    userQuery: params.userQuery,
    budgetChars: budget,
  });

  return {
    materials: [...uploadedMaterials, ...contentLibraryResult.materials],
    sources: contentLibraryResult.sources,
    warnings: [...warnings, ...contentLibraryResult.warnings],
  };
}
