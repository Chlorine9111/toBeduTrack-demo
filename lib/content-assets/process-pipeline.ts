import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { parseAssetDocument } from "@/lib/content-assets/parse";
import { buildAssetChunks, indexAssetChunks } from "@/lib/content-assets/chunk";
import { generateAssetSummary } from "@/lib/content-assets/summarize";
import { updateProcessingStatus } from "@/lib/content-assets/store";
import type { ProcessingStatus } from "@/lib/content-assets/types";

// ── 常量 ──────────────────────────────────────────────────

const PIPELINE_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟

// ── 超时工具 ──────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} 超时（${Math.round(ms / 1000)}s）`));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// ── 状态更新辅助 ──────────────────────────────────────────

async function transitionStatus(
  assetId: string,
  status: ProcessingStatus,
  extra?: Parameters<typeof updateProcessingStatus>[2],
) {
  try {
    await updateProcessingStatus(assetId, status, extra);
  } catch (error) {
    console.error(`[process-pipeline] 更新状态到 ${status} 失败`, error);
    throw error;
  }
}

async function failAsset(assetId: string, errorMessage: string) {
  try {
    await updateProcessingStatus(assetId, "failed", { error: errorMessage });
  } catch (updateError) {
    console.error("[process-pipeline] 标记失败状态时出错", updateError);
  }
}

function inferMimeType(fileName: string, mimeType: string) {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized) return normalized;

  const lowered = fileName.toLowerCase();
  if (lowered.endsWith(".pdf")) return "application/pdf";
  if (lowered.endsWith(".png")) return "image/png";
  if (lowered.endsWith(".jpg") || lowered.endsWith(".jpeg")) return "image/jpeg";
  if (lowered.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

// ── 主管道 ────────────────────────────────────────────────

export async function processAsset(assetId: string): Promise<void> {
  const pipeline = async () => {
    const admin = createAdminSupabaseClient();

    // 读取资产信息
    const { data: asset, error: readError } = await admin
      .from("content_assets")
      .select("id, teacher_id, file_name, file_type, mime_type, storage_path, storage_bucket, asset_source")
      .eq("id", assetId)
      .single();

    if (readError || !asset) {
      throw new Error(`资产 ${assetId} 不存在`);
    }

    const teacherId = asset.teacher_id as string;
    const fileName = (asset.file_name as string) || "unknown";
    const fileType = (asset.file_type as string) || "";
    const mimeType = (asset.mime_type as string) || "";
    const storagePath = asset.storage_path as string | null;
    const storageBucket = (asset.storage_bucket as string) || "content-assets";

    // 引用类型资产不需要处理管道
    if (asset.asset_source === "reference") {
      await transitionStatus(assetId, "ready");
      return;
    }

    if (!storagePath) {
      throw new Error("资产缺少 storage_path，无法处理");
    }

    // ── Step 1: parsing ──────────────────────────────────
    await transitionStatus(assetId, "parsing");

    const { data: fileData, error: downloadError } = await admin.storage
      .from(storageBucket)
      .download(storagePath);

    if (downloadError || !fileData) {
      throw new Error(`下载文件失败: ${downloadError?.message ?? "文件不存在"}`);
    }

    const fileBuffer = Buffer.from(await fileData.arrayBuffer());

    const parseResult = await parseAssetDocument(fileBuffer, fileName, mimeType);

    await transitionStatus(assetId, "chunking", {
      rawText: parseResult.rawText,
      pageCount: parseResult.pageCount ?? undefined,
    });

    // ── Step 2: chunking ─────────────────────────────────
    const chunks = buildAssetChunks({
      assetId,
      fileName,
      rawText: parseResult.rawText,
      pageTexts: parseResult.pageTexts ?? undefined,
    });

    await transitionStatus(assetId, "embedding");

    // ── Step 3: embedding ────────────────────────────────
    let chunkCount = 0;

    try {
      const indexResult = await indexAssetChunks({
        teacherId,
        assetId,
        chunks,
        multimodalSource: {
          fileBuffer,
          mimeType: inferMimeType(fileName, mimeType),
          fileName,
          pageCount: parseResult.pageCount,
        },
      });
      chunkCount = indexResult.chunkCount;
    } catch (error) {
      // embedding 失败可降级，仍然继续 summarize
      console.warn("[process-pipeline] embedding 失败，降级继续", error);
      chunkCount = chunks.length;
    }

    await transitionStatus(assetId, "summarizing", {
      chunkCount,
    });

    // ── Step 4: summarizing ──────────────────────────────
    const summaryResult = await generateAssetSummary({
      rawText: parseResult.rawText,
      fileName,
      fileType,
    });

    // 构建最终 searchText
    const searchParts = [
      fileName,
      summaryResult.summary,
      ...summaryResult.tags,
    ].filter(Boolean);
    const searchText = searchParts.join(" ").toLowerCase();

    // ── Step 5: ready ────────────────────────────────────
    await transitionStatus(assetId, "ready", {
      summaryText: summaryResult.summary || undefined,
      tags: summaryResult.tags.length > 0 ? summaryResult.tags : undefined,
      category: summaryResult.category !== "uncategorized" ? summaryResult.category : undefined,
      chunkCount,
      searchText: searchText || undefined,
    });

  };

  try {
    await withTimeout(pipeline(), PIPELINE_TIMEOUT_MS, "资产处理管道");
  } catch (error) {
    const message = error instanceof Error ? error.message : "处理失败";
    console.error(`[process-pipeline] 资产 ${assetId} 处理失败:`, message);
    await failAsset(assetId, message);
    throw error;
  }
}
