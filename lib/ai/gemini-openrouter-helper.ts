import {
  defaultSettingsMiddleware,
  generateText,
  wrapLanguageModel,
  type ModelMessage,
} from "ai";
import {
  createAiRequestId,
  finalizeAiMetadata,
  resolveGoogleApiKey,
  resolveLanguageModel,
  resolveModelTemperature,
  resolveOpenRouterApiKey,
  type AiGatewayCapability,
  type AiGatewayMetadata,
} from "@/lib/ai/provider-registry";

type GeminiMessage = ModelMessage;
type WrappedLanguageModelInput = Parameters<typeof wrapLanguageModel>[0]["model"];

export class GeminiOpenRouterError extends Error {
  code: "CONFIG_ERROR" | "UPSTREAM_FAILED" | "INVALID_JSON";
  status?: number;
  requestId: string;
  metadata: AiGatewayMetadata;
  override cause?: unknown;

  constructor(params: {
    code: "CONFIG_ERROR" | "UPSTREAM_FAILED" | "INVALID_JSON";
    message: string;
    requestId: string;
    metadata: AiGatewayMetadata;
    status?: number;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = "GeminiOpenRouterError";
    this.code = params.code;
    this.status = params.status;
    this.requestId = params.requestId;
    this.metadata = params.metadata;
    this.cause = params.cause;
  }
}

export function isGeminiOpenRouterAvailable() {
  return Boolean(resolveGoogleApiKey() || resolveOpenRouterApiKey());
}

export function assertGeminiOpenRouterConfigured() {
  if (!isGeminiOpenRouterAvailable()) {
    throw new Error(
      "GOOGLE_GENERATIVE_AI_API_KEY / GOOGLE_AI_API_KEY / OPENROUTER_API_KEY 未配置",
    );
  }
}

function stripCodeFence(text: string) {
  return text.replace(/^```json\s*/i, "").replace(/^```/, "").replace(/```$/, "").trim();
}

function parseJsonLenient<T>(text: string): T {
  const direct = stripCodeFence(text);
  try {
    return JSON.parse(direct) as T;
  } catch {
    const first = direct.indexOf("{");
    const last = direct.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(direct.slice(first, last + 1)) as T;
    }
    throw new Error(`Gemini JSON 解析失败: ${direct.slice(0, 200)}`);
  }
}

function buildSyntheticMetadata(params: {
  requestId: string;
  capability: AiGatewayCapability;
  model: string;
  provider: "google" | "openrouter";
  startedAt: number;
  attemptCount?: number;
  fallbackUsed?: boolean;
}) {
  return finalizeAiMetadata({
    requestId: params.requestId,
    capability: params.capability,
    provider: params.provider,
    modelId: params.model,
    startedAt: params.startedAt,
    attemptCount: params.attemptCount,
    fallbackUsed: params.fallbackUsed,
  });
}

function normalizeGeminiError(
  error: unknown,
  fallback: {
    requestId: string;
    capability: AiGatewayCapability;
    model: string;
    provider: "google" | "openrouter";
    startedAt: number;
    attemptCount?: number;
    fallbackUsed?: boolean;
  },
) {
  if (error instanceof GeminiOpenRouterError) {
    return error;
  }

  const metadata = buildSyntheticMetadata(fallback);
  const message = error instanceof Error ? error.message : String(error);
  console.error("[ai-gateway] gemini json request failed", metadata, {
    error: message,
  });
  return new GeminiOpenRouterError({
    code: "UPSTREAM_FAILED",
    message: `AI_GATEWAY/gemini_request_failed(${fallback.requestId}): ${message}`,
    requestId: fallback.requestId,
    metadata,
    cause: error,
  });
}

export async function callGeminiOpenRouterJson<T>(params: {
  capability: AiGatewayCapability;
  model: string;
  messages: GeminiMessage[];
  reasoning?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
  requestId?: string;
  attemptCount?: number;
  fallbackUsed?: boolean;
  abortSignal?: AbortSignal;
}) {
  const requestId = params.requestId ?? createAiRequestId(params.capability);
  const startedAt = Date.now();
  const provider = resolveGoogleApiKey() ? "google" : "openrouter";

  try {
    const resolved = resolveLanguageModel(params.model);
    const temperature = resolveModelTemperature(
      resolved.modelId,
      params.temperature ?? 0,
    );
    const model = wrapLanguageModel({
      model: resolved.model as WrappedLanguageModelInput,
      middleware: defaultSettingsMiddleware({
        settings: {
          temperature,
          maxOutputTokens: params.maxTokens ?? 2600,
        },
      }),
    });
    const result = await generateText({
      model,
      messages: params.messages,
      maxRetries: 1,
      abortSignal: params.abortSignal,
    });
    const metadata = finalizeAiMetadata({
      requestId,
      capability: params.capability,
      provider: resolved.provider,
      modelId: resolved.modelId,
      startedAt,
      attemptCount: params.attemptCount ?? 1,
      fallbackUsed: params.fallbackUsed ?? false,
    });

    try {
      return {
        data: parseJsonLenient<T>(result.text),
        requestId,
        metadata,
        rawText: result.text,
      };
    } catch (error) {
      console.error("[ai-gateway] gemini invalid json", metadata, {
        bodyPreview: result.text.slice(0, 400),
      });
      throw new GeminiOpenRouterError({
        code: "INVALID_JSON",
        message: `AI_GATEWAY/gemini_invalid_json(${requestId}): ${error instanceof Error ? error.message : String(error)}`,
        requestId,
        metadata,
        cause: error,
      });
    }
  } catch (error) {
    throw normalizeGeminiError(error, {
      requestId,
      capability: params.capability,
      model: params.model,
      provider,
      startedAt,
      attemptCount: params.attemptCount,
      fallbackUsed: params.fallbackUsed,
    });
  }
}
