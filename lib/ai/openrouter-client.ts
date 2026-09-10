import {
  createAiRequestId,
  finalizeAiMetadata,
  normalizeOpenRouterModel,
  resolveOpenRouterApiKey,
  resolveOpenRouterBaseURL,
  resolveOpenRouterHeaders,
  type AiGatewayCapability,
  type AiGatewayMetadata,
} from "@/lib/ai/provider-registry";

type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: unknown;
};

type OpenRouterChatCompletionResponse = {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

type OpenRouterEmbeddingsResponse = {
  data?: Array<{
    embedding?: number[];
    index?: number;
  }>;
  model?: string;
};

export class OpenRouterGatewayError extends Error {
  status?: number;
  requestId: string;
  metadata: AiGatewayMetadata;

  constructor(params: {
    message: string;
    requestId: string;
    metadata: AiGatewayMetadata;
    status?: number;
  }) {
    super(params.message);
    this.name = "OpenRouterGatewayError";
    this.status = params.status;
    this.requestId = params.requestId;
    this.metadata = params.metadata;
  }
}

function normalizeTextContent(content: string | Array<{ type?: string; text?: string }> | undefined) {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((item) => (typeof item?.text === "string" ? item.text : ""))
    .join("\n")
    .trim();
}

export async function callOpenRouterChatCompletion(params: {
  capability: AiGatewayCapability;
  model: string;
  messages: OpenRouterMessage[];
  responseFormat?: { type: "json_object" };
  reasoning?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
  requestId?: string;
  attemptCount?: number;
  fallbackUsed?: boolean;
}) {
  const apiKey = resolveOpenRouterApiKey();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY 未配置");
  }

  const modelId = normalizeOpenRouterModel(params.model);
  const requestId = params.requestId ?? createAiRequestId(params.capability);
  const startedAt = Date.now();

  const response = await fetch(`${resolveOpenRouterBaseURL()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...resolveOpenRouterHeaders(),
    },
    body: JSON.stringify({
      model: modelId,
      response_format: params.responseFormat,
      reasoning: params.reasoning,
      messages: params.messages,
      temperature: params.temperature ?? 0,
      max_tokens: params.maxTokens ?? 2600,
    }),
  });

  const metadata = finalizeAiMetadata({
    requestId,
    capability: params.capability,
    provider: "openrouter",
    modelId,
    startedAt,
    attemptCount: params.attemptCount ?? 1,
    fallbackUsed: params.fallbackUsed ?? false,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("[ai-gateway] openrouter request failed", metadata, {
      status: response.status,
      bodyPreview: text.slice(0, 400),
    });
    throw new OpenRouterGatewayError({
      message: `AI_GATEWAY/openrouter_failed(${requestId}): ${response.status} ${text || "请求失败"}`,
      requestId,
      metadata,
      status: response.status,
    });
  }

  const payload = (await response.json()) as OpenRouterChatCompletionResponse;
  const content = normalizeTextContent(payload.choices?.[0]?.message?.content);
  if (!content) {
    console.error("[ai-gateway] openrouter empty content", metadata);
    throw new OpenRouterGatewayError({
      message: `AI_GATEWAY/openrouter_empty(${requestId}): OpenRouter 返回空结果`,
      requestId,
      metadata,
    });
  }

  console.info("[ai-gateway] openrouter request", metadata);
  return {
    content,
    requestId,
    metadata,
    payload,
  };
}

export async function callOpenRouterEmbeddings(params: {
  model: string;
  input: string | string[];
  dimensions?: number;
  requestId?: string;
  attemptCount?: number;
  fallbackUsed?: boolean;
}) {
  const apiKey = resolveOpenRouterApiKey();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY 未配置");
  }

  const modelId = normalizeOpenRouterModel(params.model);
  const requestId = params.requestId ?? createAiRequestId("embedding");
  const startedAt = Date.now();

  const response = await fetch(`${resolveOpenRouterBaseURL()}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...resolveOpenRouterHeaders(),
    },
    body: JSON.stringify({
      model: modelId,
      input: params.input,
      encoding_format: "float",
      ...(typeof params.dimensions === "number" ? { dimensions: params.dimensions } : {}),
    }),
  });

  const metadata = finalizeAiMetadata({
    requestId,
    capability: "embedding",
    provider: "openrouter",
    modelId,
    startedAt,
    attemptCount: params.attemptCount ?? 1,
    fallbackUsed: params.fallbackUsed ?? false,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("[ai-gateway] openrouter embeddings failed", metadata, {
      status: response.status,
      bodyPreview: text.slice(0, 400),
    });
    throw new OpenRouterGatewayError({
      message: `AI_GATEWAY/openrouter_embeddings_failed(${requestId}): ${response.status} ${text || "请求失败"}`,
      requestId,
      metadata,
      status: response.status,
    });
  }

  const payload = (await response.json()) as OpenRouterEmbeddingsResponse;
  const embeddings = (payload.data ?? [])
    .slice()
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .map((item) => item.embedding)
    .filter((item): item is number[] => Array.isArray(item) && item.length > 0);

  if (embeddings.length === 0) {
    console.error("[ai-gateway] openrouter embeddings empty", metadata);
    throw new OpenRouterGatewayError({
      message: `AI_GATEWAY/openrouter_embeddings_empty(${requestId}): OpenRouter 返回空向量`,
      requestId,
      metadata,
    });
  }

  console.info("[ai-gateway] openrouter embeddings", metadata);
  return {
    embeddings,
    requestId,
    metadata,
    payload,
  };
}
