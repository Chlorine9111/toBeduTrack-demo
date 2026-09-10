import type { UploadedMaterial } from "@/lib/agent/chat-shared";
import { budgetPromptSections } from "@/lib/ai/prompt-budget";

export type AssetReferenceMaterialRow = {
  id: string;
  title: string;
  file_type: string | null;
};

export type ContentAssetChunkMatchRow = {
  id: string;
  asset_id: string;
  chunk_index: number;
  title: string | null;
  content: string;
  token_count: number;
  page_start: number | null;
  page_end: number | null;
  similarity: number;
};

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function formatChunkPageLabel(
  chunk: Pick<ContentAssetChunkMatchRow, "page_start" | "page_end">,
) {
  if (
    typeof chunk.page_start === "number" &&
    typeof chunk.page_end === "number"
  ) {
    if (chunk.page_start === chunk.page_end) {
      return `第 ${chunk.page_start} 页`;
    }
    return `第 ${chunk.page_start}-${chunk.page_end} 页`;
  }

  if (typeof chunk.page_start === "number") {
    return `第 ${chunk.page_start} 页`;
  }

  if (typeof chunk.page_end === "number") {
    return `第 ${chunk.page_end} 页`;
  }

  return null;
}

function applyBudgetToMaterials(
  materials: UploadedMaterial[],
  budget: number,
): UploadedMaterial[] {
  const totalLength = materials.reduce(
    (sum, item) => sum + item.textContent.length,
    0,
  );

  if (totalLength <= budget) {
    return materials;
  }

  const budgeted = budgetPromptSections(
    materials.map((item, index) => ({
      key: `${item.fileName}:${index}`,
      text: item.textContent,
      weight: 1,
      minTokens: 60,
    })),
    Math.floor(budget / 4),
  );

  return materials.map((item, index) => ({
    ...item,
    textContent: budgeted[`${item.fileName}:${index}`] ?? "",
  }));
}

export function buildChunkBackedAssetMaterials(params: {
  rows: AssetReferenceMaterialRow[];
  chunks: ContentAssetChunkMatchRow[];
  budget: number;
}): UploadedMaterial[] {
  if (params.rows.length === 0 || params.chunks.length === 0) {
    return [];
  }

  const rowsById = new Map(params.rows.map((row) => [row.id, row]));
  const chunksByAssetId = new Map<string, ContentAssetChunkMatchRow[]>();
  const sortedChunks = [...params.chunks].sort((a, b) => {
    if (b.similarity !== a.similarity) {
      return b.similarity - a.similarity;
    }
    return a.chunk_index - b.chunk_index;
  });

  for (const chunk of sortedChunks) {
    if (!rowsById.has(chunk.asset_id)) continue;
    const bucket = chunksByAssetId.get(chunk.asset_id) ?? [];
    bucket.push(chunk);
    chunksByAssetId.set(chunk.asset_id, bucket);
  }

  const materials = params.rows.flatMap((row) => {
    const chunks = chunksByAssetId.get(row.id) ?? [];
    if (chunks.length === 0) {
      return [];
    }

    const textContent = [
      `📎 教师选定资料：《${row.title}》`,
      row.file_type ? `文件类型：${row.file_type}` : "",
      `来源标识：[来源:${row.title}]（回答时请使用此标识引用）`,
      "",
      "以下为与当前提问最相关的资料段落：",
      ...chunks.map((chunk, index) => {
        const labels = [
          `相关段落 ${index + 1}`,
          `分块 #${chunk.chunk_index + 1}`,
          formatChunkPageLabel(chunk),
          cleanText(chunk.title),
        ].filter(Boolean);

        return [`【${labels.join("｜")}】`, chunk.content.trim()]
          .filter(Boolean)
          .join("\n");
      }),
    ]
      .filter(Boolean)
      .join("\n\n");

    return [
      {
        fileName: `引用文件 · ${row.title}`,
        fileType: row.file_type ?? "unknown",
        textContent,
      },
    ];
  });

  return applyBudgetToMaterials(materials, params.budget);
}
