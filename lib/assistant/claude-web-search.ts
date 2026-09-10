import { getAnthropicClient } from "@/lib/ai/anthropic-client";
import {
  resolveClaudeModel,
  stripAnthropicProviderPrefix,
} from "@/lib/ai/provider-registry";
import type { WebSearchResponse, WebSearchResult } from "@/lib/assistant/types";

function normalizeResults(results: WebSearchResult[]): WebSearchResult[] {
  const seen = new Set<string>();
  return results
    .map((item) => ({
      title: item.title.trim() || "未命名来源",
      url: item.url.trim(),
      snippet: item.snippet.trim(),
    }))
    .filter((item) => /^https?:\/\//i.test(item.url))
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .slice(0, 4);
}

function parseFromText(rawText: string): WebSearchResponse {
  const normalizedText = rawText.trim();
  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const urlRegex = /https?:\/\/[\w\-./?%&=#:+~]+/gi;

  const results = normalizeResults(
    lines.flatMap((line, index) => {
      const matchedUrls = Array.from(new Set(line.match(urlRegex) ?? []));
      if (matchedUrls.length === 0) return [];

      return matchedUrls.map((url) => {
        const [beforeUrl, afterUrl = ""] = line.split(url);
        const title = beforeUrl
          .replace(/^[\-\d.\s]+/, "")
          .replace(/[|｜:：-]+$/, "")
          .trim();
        const snippet = afterUrl
          .replace(/^[|｜:：-]+/, "")
          .trim();

        return {
          title: title || `来源 ${index + 1}`,
          url,
          snippet: snippet || normalizedText.slice(0, 180) || "Claude 联网搜索摘要",
        };
      });
    }),
  );

  return {
    summary: normalizedText,
    results,
  };
}

function normalizeAnthropicSdkModelName(modelId: string) {
  const stripped = stripAnthropicProviderPrefix(modelId.trim());
  if (!stripped) {
    return "claude-sonnet-4-6";
  }

  return stripped.replace(
    /^claude-(haiku|sonnet|opus)-(\d+)\.(\d+)(.*)$/i,
    "claude-$1-$2-$3$4",
  );
}

export function resolveClaudeWebSearchModel(requestedModel?: string) {
  const requested =
    requestedModel?.trim() ||
    process.env.ANTHROPIC_SEARCH_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    "claude-sonnet-4-6";

  return normalizeAnthropicSdkModelName(resolveClaudeModel(requested));
}

export async function searchWebWithClaude(
  query: string,
  options?: { timeoutMs?: number; maxUses?: number; abortSignal?: AbortSignal },
): Promise<WebSearchResponse> {
  const client = getAnthropicClient();
  const controller = new AbortController();
  const timeoutMs = Math.max(0, options?.timeoutMs ?? 15_000);
  const relayAbort = () => controller.abort(options?.abortSignal?.reason);
  if (options?.abortSignal) {
    if (options.abortSignal.aborted) {
      relayAbort();
    } else {
      options.abortSignal.addEventListener("abort", relayAbort, { once: true });
    }
  }
  const timeoutId =
    timeoutMs > 0
      ? setTimeout(() => {
          controller.abort();
        }, timeoutMs)
      : null;

  try {
    const response = await client.messages.create(
      {
        model: resolveClaudeWebSearchModel(),
        max_tokens: 1600,
        temperature: 0,
        system: [
          "你是教学研究助手。",
          "必须先使用 web_search 搜索最新且可信的资料，然后再回答。",
          "回答要求：",
          "1. 先给出 2-4 句中文摘要，聚焦课堂可执行做法。",
          "2. 再列出最多 4 条来源，每条单独一行，格式为：标题 | URL | 关键信息。",
          "3. 优先选择官方课程文件、大学/学区资源、可靠教师专业站点。",
          "4. 不要输出 markdown 代码块。",
        ].join("\n"),
        messages: [
          {
            role: "user",
            content: [
              `检索主题：${query}`,
              "请优先寻找近 3 年仍然适用的课堂策略、形成性评估做法、示例活动或官方课程说明。",
            ].join("\n"),
          },
        ],
        tools: [
          {
            name: "web_search",
            type: "web_search_20250305",
            max_uses: Math.max(1, Math.min(2, options?.maxUses ?? 1)),
            user_location: {
              type: "approximate",
              country: "US",
            },
          },
        ],
      },
      {
        signal: controller.signal,
      },
    );

    const text = response.content
      .filter((block): block is Extract<typeof response.content[number], { type: "text"; text: string }> => block.type === "text")
      .map((block) => block.text.trim())
      .filter(Boolean)
      .join("\n\n");

    const parsed = parseFromText(text);
    if (!parsed.summary.trim() && parsed.results.length === 0) {
      throw new Error(`Claude 联网搜索未返回可用结果，stop_reason=${response.stop_reason ?? "unknown"}`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      if (options?.abortSignal?.aborted) {
        throw new Error("Claude 联网搜索已取消");
      }
      throw new Error("Claude 联网搜索超时");
    }
    throw error instanceof Error
      ? error
      : new Error(`Claude 联网搜索失败: ${String(error)}`);
  } finally {
    options?.abortSignal?.removeEventListener("abort", relayAbort);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
