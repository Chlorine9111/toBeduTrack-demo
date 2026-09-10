import {
  createAiRequestId,
  finalizeAiMetadata,
  type AiGatewayMetadata,
} from "@/lib/ai/provider-registry";
import {
  isMultimodalEmbeddingInput,
  type MultimodalEmbeddingInput,
} from "@/lib/ai/embedding-types";

export const DEFAULT_GOOGLE_EMBEDDING_MODEL = "gemini-embedding-2-preview";

const GOOGLE_FILES_UPLOAD_URL = "/upload/v1beta/files";
const GOOGLE_FILES_API_PATH = "/v1beta/files";
const GOOGLE_MULTIMODAL_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
]);
const GOOGLE_MULTIMODAL_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
]);

type GoogleEmbeddingTaskType = "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT" | "SEMANTIC_SIMILARITY";

type GoogleBatchEmbeddingResponse = {
  embeddings?: Array<{
    values?: number[];
  }>;
};

type GoogleUploadedFile = {
  name: string;
  uri: string;
  mimeType: string;
};

type GoogleEmbeddingContentPart =
  | { text: string }
  | { fileData: { mimeType: string; fileUri: string } };

export function resolveGoogleAiApiKey() {
  return (
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_AI_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    ""
  );
}

export function resolveGoogleEmbeddingModel(defaultModel = DEFAULT_GOOGLE_EMBEDDING_MODEL) {
  if (process.env.GOOGLE_DISABLE_EMBEDDINGS === "1") return null;
  if (!resolveGoogleAiApiKey()) return null;
  return process.env.GOOGLE_EMBEDDING_MODEL?.trim() || defaultModel;
}

function resolveGoogleApiBaseUrl() {
  return process.env.GOOGLE_AI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com";
}

function cleanDisplayName(value: string | null | undefined) {
  const trimmed = `${value ?? ""}`.trim();
  if (!trimmed) return "embedding-input";
  return trimmed.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "embedding-input";
}

function normalizeGoogleEmbeddingTaskType(taskType?: string | null): GoogleEmbeddingTaskType {
  if (taskType === "RETRIEVAL_QUERY" || taskType === "RETRIEVAL_DOCUMENT" || taskType === "SEMANTIC_SIMILARITY") {
    return taskType;
  }
  return "RETRIEVAL_DOCUMENT";
}

export function supportsGoogleMultimodalEmbeddings(model?: string | null) {
  const trimmedModel = model?.trim() || "";
  return /^gemini-embedding-2/i.test(trimmedModel);
}

export function canUseGoogleMultimodalEmbeddingForFile(params: {
  model?: string | null;
  mimeType: string | null | undefined;
  pageCount?: number | null;
  durationSeconds?: number | null;
}) {
  if (!supportsGoogleMultimodalEmbeddings(params.model)) {
    return false;
  }

  const mimeType = `${params.mimeType ?? ""}`.trim().toLowerCase();
  if (!mimeType) return false;

  if (mimeType === "application/pdf") {
    return params.pageCount == null || params.pageCount <= 6;
  }

  if (GOOGLE_MULTIMODAL_IMAGE_MIME_TYPES.has(mimeType)) {
    return true;
  }

  if (mimeType.startsWith("audio/")) {
    return true;
  }

  if (GOOGLE_MULTIMODAL_VIDEO_MIME_TYPES.has(mimeType)) {
    return params.durationSeconds == null || params.durationSeconds <= 120;
  }

  return false;
}

async function uploadGoogleFileForEmbedding(params: {
  fileBuffer: Buffer;
  mimeType: string;
  displayName?: string | null;
}) {
  const apiKey = resolveGoogleAiApiKey();
  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY / GOOGLE_AI_API_KEY / GEMINI_API_KEY 未配置");
  }

  const started = await fetch(`${resolveGoogleApiBaseUrl()}${GOOGLE_FILES_UPLOAD_URL}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(params.fileBuffer.byteLength),
      "X-Goog-Upload-Header-Content-Type": params.mimeType,
    },
    body: JSON.stringify({
      file: {
        display_name: cleanDisplayName(params.displayName),
      },
    }),
    cache: "no-store",
  });

  if (!started.ok) {
    const text = await started.text().catch(() => "");
    throw new Error(`Google 文件上传初始化失败: ${started.status} ${text || "请求失败"}`);
  }

  const uploadUrl = started.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new Error("Google 文件上传初始化缺少 x-goog-upload-url");
  }

  const finalized = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(params.fileBuffer.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: new Uint8Array(params.fileBuffer),
    cache: "no-store",
  });

  if (!finalized.ok) {
    const text = await finalized.text().catch(() => "");
    throw new Error(`Google 文件上传失败: ${finalized.status} ${text || "请求失败"}`);
  }

  const payload = (await finalized.json().catch(() => ({}))) as {
    file?: {
      name?: string;
      uri?: string;
      mimeType?: string;
    };
  };

  const name = payload.file?.name?.trim() || "";
  const uri = payload.file?.uri?.trim() || "";
  if (!name || !uri) {
    throw new Error("Google 文件上传成功但未返回可用 file.name / file.uri");
  }

  return {
    name,
    uri,
    mimeType: payload.file?.mimeType?.trim() || params.mimeType,
  } satisfies GoogleUploadedFile;
}

async function deleteGoogleUploadedFile(name: string) {
  const apiKey = resolveGoogleAiApiKey();
  if (!apiKey || !name.trim()) return;
  const fileId = name.replace(/^files\//i, "").trim();
  if (!fileId) return;

  const response = await fetch(
    `${resolveGoogleApiBaseUrl()}${GOOGLE_FILES_API_PATH}/${encodeURIComponent(fileId)}`,
    {
      method: "DELETE",
      headers: {
        "x-goog-api-key": apiKey,
      },
      cache: "no-store",
    },
  ).catch(() => null);

  if (!response || response.ok) return;
  const text = await response.text().catch(() => "");
  console.warn("[ai-gateway] google uploaded file cleanup failed", {
    name,
    status: response.status,
    bodyPreview: text.slice(0, 200),
  });
}

async function buildGoogleEmbeddingParts(
  input: MultimodalEmbeddingInput,
  cleanupNames: string[],
) {
  const parts: GoogleEmbeddingContentPart[] = [];

  for (const part of input.parts) {
    if (part.type === "text") {
      const text = part.text.trim();
      if (text) {
        parts.push({ text });
      }
      continue;
    }

    const uploaded = await uploadGoogleFileForEmbedding({
      fileBuffer: part.fileBuffer,
      mimeType: part.mimeType,
      displayName: part.displayName,
    });
    cleanupNames.push(uploaded.name);
    parts.push({
      fileData: {
        mimeType: uploaded.mimeType,
        fileUri: uploaded.uri,
      },
    });
  }

  if (parts.length === 0) {
    throw new Error("Google 多模态 embedding input 不能为空");
  }

  return parts;
}

export async function callGoogleEmbeddings(params: {
  model: string;
  input: string | string[] | MultimodalEmbeddingInput | MultimodalEmbeddingInput[];
  dimensions?: number;
  taskType?: GoogleEmbeddingTaskType | null;
  titles?: Array<string | null | undefined>;
  requestId?: string;
  attemptCount?: number;
  fallbackUsed?: boolean;
}) {
  const apiKey = resolveGoogleAiApiKey();
  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY / GOOGLE_AI_API_KEY / GEMINI_API_KEY 未配置");
  }

  const modelId = params.model.trim();
  if (!modelId) {
    throw new Error("Google embedding model 不能为空");
  }

  const requestId = params.requestId ?? createAiRequestId("embedding");
  const startedAt = Date.now();
  const rawInputs = Array.isArray(params.input) ? params.input : [params.input];
  const inputs = rawInputs.filter((item) => {
    if (typeof item === "string") {
      return item.trim().length > 0;
    }
    if (!isMultimodalEmbeddingInput(item)) {
      return false;
    }
    return item.parts.some((part) =>
      part.type === "text" ? part.text.trim().length > 0 : part.fileBuffer.byteLength > 0,
    );
  });
  if (inputs.length === 0) {
    throw new Error("Google embedding input 不能为空（所有输入均为空）");
  }
  const taskType = normalizeGoogleEmbeddingTaskType(params.taskType);
  const cleanupNames: string[] = [];

  try {
    const requests = await Promise.all(
      inputs.map(async (input, index) => ({
        model: `models/${modelId}`,
        content: {
          parts:
            typeof input === "string"
              ? [{ text: input }]
              : await buildGoogleEmbeddingParts(input, cleanupNames),
        },
        taskType,
        ...(typeof params.dimensions === "number"
          ? { outputDimensionality: params.dimensions }
          : {}),
        ...(typeof params.titles?.[index] === "string" && params.titles[index]?.trim()
          ? { title: params.titles[index]!.trim() }
          : {}),
      })),
    );

    const response = await fetch(
      `${resolveGoogleApiBaseUrl()}/v1beta/models/${encodeURIComponent(modelId)}:batchEmbedContents`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({ requests }),
        cache: "no-store",
      },
    );

    const metadata = finalizeAiMetadata({
      requestId,
      capability: "embedding",
      provider: "google",
      modelId,
      startedAt,
      attemptCount: params.attemptCount ?? 1,
      fallbackUsed: params.fallbackUsed ?? false,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("[ai-gateway] google embeddings failed", metadata, {
        status: response.status,
        bodyPreview: text.slice(0, 400),
      });
      throw new Error(
        `AI_GATEWAY/google_embeddings_failed(${requestId}): ${response.status} ${text || "请求失败"}`,
      );
    }

    const payload = (await response.json()) as GoogleBatchEmbeddingResponse;
    const embeddings = (payload.embeddings ?? [])
      .map((item) => item.values)
      .filter((item): item is number[] => Array.isArray(item) && item.length > 0);

    if (embeddings.length === 0) {
      console.error("[ai-gateway] google embeddings empty", metadata);
      throw new Error(`AI_GATEWAY/google_embeddings_empty(${requestId}): Google 返回空向量`);
    }

    console.info("[ai-gateway] google embeddings", metadata);
    return {
      embeddings,
      requestId,
      metadata,
      payload,
    };
  } finally {
    if (cleanupNames.length > 0) {
      await Promise.allSettled(cleanupNames.map((name) => deleteGoogleUploadedFile(name)));
    }
  }
}

export type { AiGatewayMetadata, GoogleEmbeddingTaskType };
