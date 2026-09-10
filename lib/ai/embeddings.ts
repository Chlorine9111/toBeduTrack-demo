import { callOpenRouterEmbeddings } from "@/lib/ai/openrouter-client";
import {
  canUseGoogleMultimodalEmbeddingForFile,
  callGoogleEmbeddings,
  DEFAULT_GOOGLE_EMBEDDING_MODEL,
  resolveGoogleEmbeddingModel,
} from "@/lib/ai/google-embeddings";
import {
  extractEmbeddingTextFallback,
  type MultimodalEmbeddingInput,
} from "@/lib/ai/embedding-types";
import { resolveOpenRouterApiKey } from "@/lib/ai/provider-registry";

export const DEFAULT_OPENROUTER_EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const DEFAULT_EMBEDDING_DIMENSION = 1536;

export type EmbeddingKind = "search_query" | "search_document" | "memory_capsule";
export type MultimodalEmbeddingStrategy = "multimodal" | "text_fallback";

type ResolvedEmbeddingProvider = {
  provider: "google" | "openrouter";
  model: string;
};

export function resolveOpenRouterEmbeddingModel(defaultModel = DEFAULT_OPENROUTER_EMBEDDING_MODEL) {
  if (process.env.OPENROUTER_DISABLE_EMBEDDINGS === "1") return null;
  if (!resolveOpenRouterApiKey()) return null;
  return process.env.OPENROUTER_EMBEDDING_MODEL?.trim() || defaultModel;
}

export function resolveEmbeddingDimension(defaultDimension = DEFAULT_EMBEDDING_DIMENSION) {
  const raw = Number.parseInt(process.env.GOOGLE_EMBEDDING_DIMENSION?.trim() || "", 10);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return defaultDimension;
}

export function resolveEmbeddingModel() {
  return (
    resolveGoogleEmbeddingModel(DEFAULT_GOOGLE_EMBEDDING_MODEL) ??
    resolveOpenRouterEmbeddingModel(DEFAULT_OPENROUTER_EMBEDDING_MODEL)
  );
}

function resolveEmbeddingProvider(model?: string | null): ResolvedEmbeddingProvider | null {
  const trimmedModel = model?.trim();
  if (trimmedModel) {
    if (trimmedModel.startsWith("openai/") || trimmedModel.includes("/")) {
      const openRouterModel = resolveOpenRouterEmbeddingModel(trimmedModel);
      return openRouterModel ? { provider: "openrouter", model: openRouterModel } : null;
    }
    const googleModel = resolveGoogleEmbeddingModel(trimmedModel);
    return googleModel ? { provider: "google", model: googleModel } : null;
  }

  const googleModel = resolveGoogleEmbeddingModel(DEFAULT_GOOGLE_EMBEDDING_MODEL);
  if (googleModel) {
    return {
      provider: "google",
      model: googleModel,
    };
  }

  const openRouterModel = resolveOpenRouterEmbeddingModel(DEFAULT_OPENROUTER_EMBEDDING_MODEL);
  if (!openRouterModel) return null;
  return {
    provider: "openrouter",
    model: openRouterModel,
  };
}

function normalizeEmbedding(values: number[]) {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm <= 0) {
    return values;
  }
  return values.map((value) => Number((value / norm).toFixed(12)));
}

function mapEmbeddingKindToGoogleTaskType(kind: EmbeddingKind) {
  if (kind === "search_query") return "RETRIEVAL_QUERY";
  if (kind === "search_document" || kind === "memory_capsule") return "RETRIEVAL_DOCUMENT";
  return "RETRIEVAL_DOCUMENT";
}

export async function generateOpenRouterEmbeddings(params: {
  input: string | string[];
  model?: string | null;
  dimensions?: number;
}) {
  const model = params.model ?? resolveOpenRouterEmbeddingModel();
  if (!model) {
    return {
      model: null,
      embeddings: [] as number[][],
    };
  }

  const response = await callOpenRouterEmbeddings({
    model,
    input: params.input,
    dimensions: params.dimensions,
  });

  return {
    model,
    embeddings: response.embeddings,
  };
}

export async function generateEmbeddings(params: {
  input: string | string[];
  kind?: EmbeddingKind;
  model?: string | null;
  dimensions?: number;
  titles?: Array<string | null | undefined>;
}) {
  const resolved = resolveEmbeddingProvider(params.model);
  if (!resolved) {
    return {
      provider: null,
      model: null,
      embeddings: [] as number[][],
      dimensions: params.dimensions ?? resolveEmbeddingDimension(),
    };
  }

  const dimensions = params.dimensions ?? resolveEmbeddingDimension();
  if (resolved.provider === "google") {
    const response = await callGoogleEmbeddings({
      model: resolved.model,
      input: params.input,
      dimensions,
      taskType: mapEmbeddingKindToGoogleTaskType(params.kind ?? "search_document"),
      titles: params.titles,
    });

    return {
      provider: resolved.provider,
      model: resolved.model,
      dimensions,
      embeddings: response.embeddings.map(normalizeEmbedding),
    };
  }

  const response = await callOpenRouterEmbeddings({
    model: resolved.model,
    input: params.input,
    dimensions,
  });

  return {
    provider: resolved.provider,
    model: resolved.model,
    dimensions,
    embeddings: response.embeddings.map(normalizeEmbedding),
  };
}

export function canUseMultimodalEmbeddingForFile(params: {
  mimeType: string | null | undefined;
  pageCount?: number | null;
  durationSeconds?: number | null;
  model?: string | null;
}) {
  const resolved = resolveEmbeddingProvider(params.model);
  if (!resolved || resolved.provider !== "google") {
    return false;
  }

  return canUseGoogleMultimodalEmbeddingForFile({
    model: resolved.model,
    mimeType: params.mimeType,
    pageCount: params.pageCount,
    durationSeconds: params.durationSeconds,
  });
}

function extractTextFallbacks(input: MultimodalEmbeddingInput | MultimodalEmbeddingInput[]) {
  const items = Array.isArray(input) ? input : [input];
  const texts = items.map((item) => extractEmbeddingTextFallback(item));
  if (texts.some((text) => !text.trim())) {
    throw new Error("多模态 embedding 缺少可回退的文本内容");
  }
  return texts;
}

export async function generateMultimodalEmbeddings(params: {
  input: MultimodalEmbeddingInput | MultimodalEmbeddingInput[];
  kind?: EmbeddingKind;
  model?: string | null;
  dimensions?: number;
  titles?: Array<string | null | undefined>;
}) {
  const resolved = resolveEmbeddingProvider(params.model);
  const dimensions = params.dimensions ?? resolveEmbeddingDimension();

  if (resolved?.provider === "google") {
    try {
      const response = await callGoogleEmbeddings({
        model: resolved.model,
        input: params.input,
        dimensions,
        taskType: mapEmbeddingKindToGoogleTaskType(params.kind ?? "search_document"),
        titles: params.titles,
      });

      return {
        provider: resolved.provider,
        model: resolved.model,
        dimensions,
        strategy: "multimodal" as const satisfies MultimodalEmbeddingStrategy,
        embeddings: response.embeddings.map(normalizeEmbedding),
      };
    } catch (error) {
      console.warn("[embeddings] google multimodal embedding 失败，回退文本 embedding", error);
    }
  }

  const textFallbacks = extractTextFallbacks(params.input);
  const fallback = await generateEmbeddings({
    input: textFallbacks,
    kind: params.kind,
    model: params.model,
    dimensions,
    titles: params.titles,
  });

  return {
    provider: fallback.provider,
    model: fallback.model,
    dimensions,
    strategy: "text_fallback" as const satisfies MultimodalEmbeddingStrategy,
    embeddings: fallback.embeddings,
  };
}
