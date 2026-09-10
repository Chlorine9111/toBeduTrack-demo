import Anthropic from "@anthropic-ai/sdk";
import {
  normalizeClaudeModelName,
  resolveAnthropicApiKey,
  resolveAnthropicBaseUrl,
  resolveClaudeModel,
} from "@/lib/ai/provider-registry";

let cachedClient: Anthropic | null = null;

export { normalizeClaudeModelName, resolveAnthropicApiKey, resolveClaudeModel };
export const resolveAnthropicBaseURL = resolveAnthropicBaseUrl;

export function getAnthropicClient() {
  if (cachedClient) return cachedClient;

  const apiKey = resolveAnthropicApiKey();
  if (!apiKey) {
    throw new Error("未配置 Claude API Key");
  }

  cachedClient = new Anthropic({
    apiKey,
    baseURL: resolveAnthropicBaseUrl(),
    maxRetries: 2,
    timeout: 60_000,
  });

  return cachedClient;
}
