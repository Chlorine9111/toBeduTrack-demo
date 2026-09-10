import {
  GeminiOpenRouterError,
  assertGeminiOpenRouterConfigured,
  callGeminiOpenRouterJson,
  isGeminiOpenRouterAvailable,
} from "@/lib/ai/gemini-openrouter-helper";
import { normalizeOpenRouterModel } from "@/lib/ai/provider-registry";

type GeminiReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

type CallGeminiJsonParams = {
  userPrompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  effort?: GeminiReasoningEffort;
  model?: string;
  abortSignal?: AbortSignal;
};

const DEFAULT_GEMINI_PRIMARY_MODEL = "gemini-3.1-pro-preview";
const DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-3-flash-preview";

function splitModelList(value?: string | null) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueModels(models: string[]) {
  return Array.from(new Set(models.map((item) => item.trim()).filter(Boolean)));
}

export function resolveGeminiModelCandidates(override?: string) {
  const primary =
    override ||
    process.env.GEMINI_SCORING_MODEL ||
    process.env.OPENROUTER_OCR_MODEL ||
    process.env.GRADING_OCR_GEMINI_MODEL ||
    DEFAULT_GEMINI_PRIMARY_MODEL;

  const configuredFallbacks = splitModelList(process.env.GEMINI_MODEL_FALLBACKS);
  return uniqueModels([primary, ...configuredFallbacks, DEFAULT_GEMINI_FALLBACK_MODEL]).map((model) =>
    normalizeOpenRouterModel(model),
  );
}

export function isGeminiOpenRouterConfigured() {
  return isGeminiOpenRouterAvailable();
}

export async function callGeminiJson<T = unknown>(params: CallGeminiJsonParams): Promise<T> {
  assertGeminiOpenRouterConfigured();

  const models = resolveGeminiModelCandidates(params.model);
  let lastError: unknown = null;
  let fallbackUsed = false;
  for (const [modelIndex, model] of models.entries()) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const userPrompt =
        attempt === 0
          ? params.userPrompt
          : `${params.userPrompt}\n\n注意：只输出最短 JSON，不要输出解释，不要输出前后缀文本。`;

      try {
        const { data } = await callGeminiOpenRouterJson<T>({
          capability: "structured",
          model,
          reasoning: {
            effort: params.effort ?? "xhigh",
          },
          messages: [
            ...(params.systemPrompt
              ? [
                  {
                    role: "system" as const,
                    content: params.systemPrompt,
                  },
                ]
              : []),
            {
              role: "user" as const,
              content: userPrompt,
            },
          ],
          temperature: params.temperature ?? 0,
          maxTokens: params.maxTokens ?? 2600,
          attemptCount: attempt + 1,
          fallbackUsed: fallbackUsed || modelIndex > 0,
          abortSignal: params.abortSignal,
        });
        return data;
      } catch (error) {
        if (error instanceof GeminiOpenRouterError && (error.status === 401 || error.status === 403)) {
          throw error;
        }
        lastError = error;
        fallbackUsed = fallbackUsed || modelIndex > 0 || attempt > 0;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini JSON 解析失败");
}
