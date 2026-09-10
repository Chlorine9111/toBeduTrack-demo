import type {
  ContentAsset,
  ContentAssetDetail,
  ContentAssetSpreadsheetPreview,
  ContentAssetSummary,
  ContentFolder,
} from "@/lib/content-assets/types";
import {
  apiGet,
  apiPost,
  apiPatch,
  apiDelete,
  ApiError,
} from "@/lib/api/client";

// ── 类型 ─────────────────────────────────────────────────────

type ListAssetsOptions = {
  folderId?: string;
  status?: string;
  query?: string;
  assetSource?: string;
  limit?: number;
  offset?: number;
};

type ListAssetsResponse = {
  items: ContentAsset[];
  total: number;
};

type BootstrapResponse = {
  folders: ContentFolder[];
  assets: ContentAssetSummary[];
};

type SearchAssetSummariesResponse = {
  items: ContentAssetSummary[];
  total: number;
};

type CreateManualDocumentInput = {
  title?: string;
  folderId?: string | null;
  htmlContent?: string;
};

export type CreateManualDocumentResult = {
  asset: ContentAssetSummary;
  detail: ContentAssetDetail;
};

type UpdateAssetInput = {
  title?: string;
  folderId?: string | null;
  courseId?: string | null;
  unitId?: string | null;
  category?: string;
};

type UploadOptions = {
  folderId?: string;
  title?: string;
  onProgress?: (percent: number) => void;
};

type CreateFolderInput = {
  name: string;
  parentId?: string;
};

type UpdateFolderInput = {
  name?: string;
  parentId?: string | null;
};

export type AssetStatusItem = ContentAssetSummary;

// ── Assets ───────────────────────────────────────────────────

export async function listAssets(
  options?: ListAssetsOptions,
): Promise<ListAssetsResponse> {
  const params = new URLSearchParams();
  if (options?.folderId) params.set("folderId", options.folderId);
  if (options?.status) params.set("status", options.status);
  if (options?.query) params.set("query", options.query);
  if (options?.assetSource) params.set("assetSource", options.assetSource);
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));

  const qs = params.toString();
  const path = `/api/content-assets${qs ? `?${qs}` : ""}`;
  return apiGet<ListAssetsResponse>(path);
}

export async function getAsset(id: string): Promise<ContentAsset> {
  const data = await apiGet<ContentAssetDetail>(`/api/content-assets/${id}`);
  return data.asset;
}

export async function getAssetDetail(id: string): Promise<ContentAssetDetail> {
  return apiGet<ContentAssetDetail>(`/api/content-assets/${id}`);
}

export async function updateAsset(
  id: string,
  updates: UpdateAssetInput,
): Promise<ContentAsset> {
  const data = await apiPatch<{ asset: ContentAsset }>(`/api/content-assets/${id}`, updates);
  return data.asset;
}

export async function deleteAsset(id: string): Promise<void> {
  await apiDelete<void>(`/api/content-assets/${id}`);
}

export function uploadFile(
  file: File,
  options?: UploadOptions,
): Promise<ContentAssetSummary> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);
    if (options?.folderId) formData.append("folderId", options.folderId);
    if (options?.title) formData.append("title", options.title);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        options?.onProgress?.(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.asset);
        } catch {
          reject(new Error("响应解析失败"));
        }
      } else {
        let message = `上传失败（${xhr.status}）`;
        try {
          const body = JSON.parse(xhr.responseText);
          if (body?.error?.message) message = body.error.message;
          else if (typeof body?.error === "string") message = body.error;
        } catch {
          // 使用默认消息
        }
        reject(new ApiError(xhr.status, message));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("网络错误")));
    xhr.addEventListener("abort", () => reject(new Error("上传已取消")));

    xhr.open("POST", "/api/content-assets/upload");
    xhr.send(formData);
  });
}

export async function reprocessAsset(id: string): Promise<void> {
  await apiPost<void>(`/api/content-assets/${id}/reprocess`, {});
}

export async function getAssetSignedUrl(id: string): Promise<string> {
  const result = await apiGet<{ url: string }>(
    `/api/content-assets/${id}/signed-url`,
  );
  return result.url;
}

export async function getAssetDocxPreview(id: string): Promise<string> {
  const result = await apiGet<{ html: string }>(
    `/api/content-assets/${id}/docx-preview`,
  );
  return result.html;
}

export async function getAssetSpreadsheetPreview(
  id: string,
): Promise<ContentAssetSpreadsheetPreview> {
  return apiGet<ContentAssetSpreadsheetPreview>(
    `/api/content-assets/${id}/spreadsheet-preview`,
  );
}

export async function fetchContentAssetsBootstrap(): Promise<BootstrapResponse> {
  return apiGet<BootstrapResponse>("/api/content-assets/bootstrap");
}

export async function searchAssetSummaries(
  query: string,
  options?: { limit?: number },
): Promise<SearchAssetSummariesResponse> {
  const params = new URLSearchParams();
  params.set("q", query);
  if (options?.limit) {
    params.set("limit", String(options.limit));
  }

  return apiGet<SearchAssetSummariesResponse>(
    `/api/content-assets/search?${params.toString()}`,
  );
}

export async function createManualDocument(
  input?: CreateManualDocumentInput,
): Promise<CreateManualDocumentResult> {
  return apiPost<CreateManualDocumentResult>(
    "/api/content-assets/documents",
    input ?? {},
  );
}

export async function getAssetStatuses(ids: string[]): Promise<AssetStatusItem[]> {
  return apiPost<AssetStatusItem[]>("/api/content-assets/status", { ids });
}

// ── Folders ──────────────────────────────────────────────────

export async function listFolders(): Promise<ContentFolder[]> {
  const data = await apiGet<{ folders: ContentFolder[] }>("/api/content-assets/folders");
  return data.folders;
}

export async function createFolder(
  params: CreateFolderInput,
): Promise<ContentFolder> {
  const data = await apiPost<{ folder: ContentFolder }>("/api/content-assets/folders", params);
  return data.folder;
}

export async function updateFolder(
  id: string,
  params: UpdateFolderInput,
): Promise<ContentFolder> {
  const data = await apiPatch<{ folder: ContentFolder }>(`/api/content-assets/folders/${id}`, params);
  return data.folder;
}

export async function deleteFolder(id: string): Promise<void> {
  await apiDelete<void>(`/api/content-assets/folders/${id}`);
}

// ── Flashcards ──────────────────────────────────────────────

type GenerateFlashcardsInput = {
  sourceAssetIds: string[];
  count?: number;
  title?: string;
};

type GenerateFlashcardsResult = {
  setId: string;
  cardCount: number;
};

export async function generateFlashcards(
  input: GenerateFlashcardsInput,
): Promise<GenerateFlashcardsResult> {
  return apiPost<GenerateFlashcardsResult>(
    "/api/content-assets/generate/flashcards",
    input,
    { timeoutMs: 90_000 },
  );
}

// ── Graph ───────────────────────────────────────────────────

export type GraphNode = {
  id: string;
  label: string;
  type: string;
  source: string;
  val: number;
  folderId: string | null;
  courseLabel: string | null;
  unitLabel: string | null;
  createdAt: string;
};

export type GraphLink = {
  source: string | GraphNode;
  target: string | GraphNode;
  type: "strong" | "weak";
  edgeType?: string;
  weight: number;
};

export type GraphData = {
  nodes: GraphNode[];
  links: GraphLink[];
};

export async function fetchGraph(): Promise<GraphData> {
  return apiGet<GraphData>("/api/content-assets/graph");
}
