import { randomUUID } from "node:crypto";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

const DEFAULT_MOONSHOT_BASE_URL = "https://api.moonshot.cn/v1";
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
const DEFAULT_GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";
export const CURRENT_PRIMARY_MODEL_ID = "qwen-plus";

const PRIMARY_MODEL_ALIASES: Record<string, string> = {
  "qwen-plus": CURRENT_PRIMARY_MODEL_ID,
  "qwen3-plus": CURRENT_PRIMARY_MODEL_ID,
  "qwen-3.6-plus": CURRENT_PRIMARY_MODEL_ID,
  "qwen-3-6-plus": CURRENT_PRIMARY_MODEL_ID,
};

let cachedMoonshotProvider: ReturnType<typeof createOpenAICompatible> | null = null;
let cachedOpenRouterProvider: ReturnType<typeof createOpenRouter> | null = null;
let cachedAnthropicProvider: ReturnType<typeof createAnthropic> | null = null;
let cachedGoogleProvider: ReturnType<typeof createGoogleGenerativeAI> | null = null;
let cachedQwenProvider: ReturnType<typeof createOpenAICompatible> | null = null;

export type AiGatewayCapability =
  | "text"
  | "stream"
  | "structured"
  | "tool"
  | "vision"
  | "ocr"
  | "search"
  | "embedding";

export type AiGatewayProvider = "moonshot" | "openrouter" | "anthropic" | "google" | "qwen";

export type AiGatewayMetadata = {
  requestId: string;
  capability: AiGatewayCapability;
  provider: AiGatewayProvider;
  modelId: string;
  durationMs: number;
  attemptCount: number;
  fallbackUsed: boolean;
};

export type ResolvedLanguageModel = {
  model: LanguageModel;
  modelId: string;
  provider: AiGatewayProvider;
};

export type ResolvedClaudeLanguageModel = {
  model: LanguageModel;
  modelId: string;
  provider: "anthropic";
};

export function createAiRequestId(capability: AiGatewayCapability) {
  return `ai_${capability}_${randomUUID()}`;
}

export function finalizeAiMetadata(params: {
  requestId: string;
  capability: AiGatewayCapability;
  provider: AiGatewayProvider;
  modelId: string;
  startedAt: number;
  attemptCount?: number;
  fallbackUsed?: boolean;
}): AiGatewayMetadata {
  return {
    requestId: params.requestId,
    capability: params.capability,
    provider: params.provider,
    modelId: params.modelId,
    durationMs: Math.max(0, Date.now() - params.startedAt),
    attemptCount: params.attemptCount ?? 1,
    fallbackUsed: params.fallbackUsed ?? false,
  };
}

export function firstNonEmptyEnv(keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

export function buildSystemPromptText(systemPrompt: string | Array<{ type: string; text: string }>) {
  if (typeof systemPrompt === "string") return systemPrompt;
  return systemPrompt
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");
}

export function isMoonshotModel(modelId: string) {
  return modelId.startsWith("kimi-") || modelId.startsWith("moonshot-");
}

export function isQwenModel(modelId: string) {
  return modelId.startsWith("qwen");
}

export function normalizePrimaryModelId(modelId: string | null | undefined) {
  const normalized = `${modelId ?? ""}`
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

  if (!normalized) {
    return CURRENT_PRIMARY_MODEL_ID;
  }

  return PRIMARY_MODEL_ALIASES[normalized] ?? normalized;
}

export function isGeminiModel(modelId: string) {
  const trimmed = modelId.trim();
  return trimmed.startsWith("google/gemini-") || trimmed.startsWith("gemini-");
}

const GOOGLE_MODEL_ALIASES: Record<string, string> = {
  "gemini-3-pro-preview": "gemini-3.1-pro-preview",
  "gemini-3.1-flash-preview": "gemini-3.1-flash-lite-preview",
};

export function stripGoogleProviderPrefix(modelId: string) {
  return modelId.startsWith("google/") ? modelId.slice("google/".length) : modelId;
}

export function normalizeGoogleModel(modelId: string) {
  const stripped = stripGoogleProviderPrefix(modelId.trim());
  return GOOGLE_MODEL_ALIASES[stripped] ?? stripped;
}

export function normalizeOpenRouterModel(modelId: string) {
  const trimmed = modelId.trim();
  if (!trimmed) {
    throw new Error("modelId 不能为空");
  }
  if (isGeminiModel(trimmed)) {
    return trimmed.startsWith("google/") ? trimmed : `google/${trimmed}`;
  }
  if (trimmed.startsWith("anthropic/")) {
    return trimmed;
  }
  if (trimmed.toLowerCase().startsWith("claude")) {
    return `anthropic/${trimmed}`;
  }
  return trimmed;
}

export function normalizeClaudeModelName(modelId: string) {
  return normalizeOpenRouterModel(modelId);
}

export function stripAnthropicProviderPrefix(modelId: string) {
  return modelId.startsWith("anthropic/") ? modelId.slice("anthropic/".length) : modelId;
}

export function isClaudeModel(modelId: string) {
  const lower = modelId.toLowerCase();
  return lower.includes("claude") || lower.startsWith("anthropic/");
}

export function resolveOpenRouterApiKey() {
  return process.env.OPENROUTER_API_KEY?.trim() || "";
}

export function resolveOpenRouterBaseURL() {
  return process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL;
}

export function resolveOpenRouterHeaders() {
  return {
    ...(process.env.OPENROUTER_HTTP_REFERER?.trim()
      ? { "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER.trim() }
      : {}),
    ...(process.env.OPENROUTER_APP_NAME?.trim()
      ? { "X-Title": process.env.OPENROUTER_APP_NAME.trim() }
      : {}),
  };
}

export function resolveMoonshotBaseUrl() {
  return firstNonEmptyEnv(["MOONSHOT_API_BASE", "MOONSHOT_BASE_URL"]) || DEFAULT_MOONSHOT_BASE_URL;
}

export function resolveAnthropicApiKey() {
  return resolveDirectAnthropicApiKey();
}

export function resolveGoogleApiKey() {
  return firstNonEmptyEnv([
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GOOGLE_AI_API_KEY",
    "GEMINI_API_KEY",
  ]) || "";
}

export function resolveGoogleBaseUrl() {
  return (
    firstNonEmptyEnv(["GOOGLE_GENERATIVE_AI_BASE_URL", "GOOGLE_AI_BASE_URL"]) ||
    DEFAULT_GOOGLE_BASE_URL
  );
}

export function resolveDirectAnthropicApiKey() {
  return firstNonEmptyEnv(["ANTHROPIC_API_KEY"]) || "";
}

export function resolveAnthropicBaseUrl() {
  return firstNonEmptyEnv(["ANTHROPIC_BASE_URL", "ANTHROPIC_SDK_BASE_URL"]) || DEFAULT_ANTHROPIC_BASE_URL;
}

export const resolveAnthropicBaseURL = resolveAnthropicBaseUrl;

export function resolveClaudeModel(requestedModel: string) {
  const requested = normalizeClaudeModelName(requestedModel);
  if (requested.toLowerCase().includes("claude")) {
    return requested;
  }

  const configured =
    process.env.ANTHROPIC_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL_CORE?.trim() ||
    process.env.ANTHROPIC_MODEL_AUX?.trim() ||
    "";

  return normalizeClaudeModelName(configured) || DEFAULT_CLAUDE_MODEL;
}

export function resolveClaudeLanguageModel(requestedModel: string): ResolvedClaudeLanguageModel {
  const normalizedModelId = resolveClaudeModel(requestedModel);
  const anthropicApiKey = resolveDirectAnthropicApiKey();
  if (anthropicApiKey) {
    const anthropicModelId = stripAnthropicProviderPrefix(normalizedModelId);
    const provider = getAnthropicProvider();
    return {
      model: provider(anthropicModelId as Parameters<typeof provider>[0]),
      modelId: anthropicModelId,
      provider: "anthropic",
    };
  }

  throw new Error("未找到可用于 Claude 的原生 Anthropic 配置（请设置 ANTHROPIC_API_KEY）");
}

export function getMoonshotProvider() {
  if (cachedMoonshotProvider) return cachedMoonshotProvider;

  const apiKey = firstNonEmptyEnv(["MOONSHOT_API_KEY"]);
  if (!apiKey) {
    throw new Error("MOONSHOT_API_KEY 未配置");
  }

  cachedMoonshotProvider = createOpenAICompatible({
    name: "moonshot",
    apiKey,
    baseURL: resolveMoonshotBaseUrl(),
  });

  return cachedMoonshotProvider;
}

export function getQwenProvider() {
  if (cachedQwenProvider) return cachedQwenProvider;

  const apiKey = firstNonEmptyEnv(["DASHSCOPE_API_KEY"]);
  if (!apiKey) {
    throw new Error("DASHSCOPE_API_KEY 未配置");
  }

  cachedQwenProvider = createOpenAICompatible({
    name: "qwen",
    apiKey,
    baseURL: process.env.DASHSCOPE_BASE_URL?.trim() || DEFAULT_DASHSCOPE_BASE_URL,
  });

  return cachedQwenProvider;
}

export function resolveQwenLanguageModel(modelId: string = "qwen-plus"): ResolvedLanguageModel {
  const normalizedModelId = normalizePrimaryModelId(modelId);
  return {
    model: getQwenProvider().languageModel(normalizedModelId),
    modelId: normalizedModelId,
    provider: "qwen",
  };
}

export function getOpenRouterProvider() {
  if (cachedOpenRouterProvider) return cachedOpenRouterProvider;

  const apiKey = resolveOpenRouterApiKey();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY 未配置");
  }

  cachedOpenRouterProvider = createOpenRouter({
    apiKey,
    baseURL: resolveOpenRouterBaseURL(),
    headers: resolveOpenRouterHeaders(),
  });

  return cachedOpenRouterProvider;
}

export function getAnthropicProvider() {
  if (cachedAnthropicProvider) return cachedAnthropicProvider;

  const apiKey = resolveDirectAnthropicApiKey();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY 未配置");
  }

  const customBaseUrl = firstNonEmptyEnv(["ANTHROPIC_BASE_URL", "ANTHROPIC_SDK_BASE_URL"]);
  cachedAnthropicProvider = createAnthropic({
    apiKey,
    ...(customBaseUrl ? { baseURL: customBaseUrl } : {}),
  });

  return cachedAnthropicProvider;
}

export function getGoogleProvider() {
  if (cachedGoogleProvider) return cachedGoogleProvider;

  const apiKey = resolveGoogleApiKey();
  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY / GOOGLE_AI_API_KEY 未配置");
  }

  cachedGoogleProvider = createGoogleGenerativeAI({
    apiKey,
    baseURL: resolveGoogleBaseUrl(),
  });

  return cachedGoogleProvider;
}

export function resolveModelTemperature(modelId: string, fallback: number) {
  if (modelId.startsWith("kimi-k2")) {
    return 1;
  }
  return fallback;
}

export function resolveLanguageModel(modelId: string): ResolvedLanguageModel {
  const trimmed = normalizePrimaryModelId(modelId);
  if (!trimmed) {
    throw new Error("未配置结构化生成模型");
  }

  const googleApiKey = resolveGoogleApiKey();
  if (isGeminiModel(trimmed) && googleApiKey) {
    const googleModelId = normalizeGoogleModel(trimmed);
    return {
      model: getGoogleProvider()(googleModelId),
      modelId: googleModelId,
      provider: "google",
    };
  }

  const moonshotApiKey = firstNonEmptyEnv(["MOONSHOT_API_KEY"]);
  if (isMoonshotModel(trimmed) && moonshotApiKey) {
    return {
      model: getMoonshotProvider().chatModel(trimmed),
      modelId: trimmed,
      provider: "moonshot",
    };
  }

  const qwenApiKey = firstNonEmptyEnv(["DASHSCOPE_API_KEY"]);
  if (isQwenModel(trimmed) && qwenApiKey) {
    return {
      model: getQwenProvider().languageModel(trimmed),
      modelId: trimmed,
      provider: "qwen",
    };
  }

  const anthropicApiKey = resolveDirectAnthropicApiKey();
  if (isClaudeModel(trimmed)) {
    if (anthropicApiKey) {
      const anthropicModelId = stripAnthropicProviderPrefix(trimmed);
      const provider = getAnthropicProvider();
      return {
        model: provider(anthropicModelId as Parameters<typeof provider>[0]),
        modelId: anthropicModelId,
        provider: "anthropic",
      };
    }

    throw new Error("Claude 模型仅支持原生 Anthropic API，请设置 ANTHROPIC_API_KEY");
  }

  const openRouterApiKey = resolveOpenRouterApiKey();
  if (openRouterApiKey) {
    const normalizedModelId = normalizeOpenRouterModel(trimmed);
    return {
      model: getOpenRouterProvider()(normalizedModelId),
      modelId: normalizedModelId,
      provider: "openrouter",
    };
  }

  if (moonshotApiKey) {
    return {
      model: getMoonshotProvider().chatModel(trimmed),
      modelId: trimmed,
      provider: "moonshot",
    };
  }

  throw new Error("未找到可用于 AI SDK 的 provider 配置");
}
