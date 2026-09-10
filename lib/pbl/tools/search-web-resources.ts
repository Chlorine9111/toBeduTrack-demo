export type WebResource = {
  title: string;
  url: string;
  snippet: string;
  type: "video" | "article" | "guide";
};

function classifyResourceType(title: string, url: string, snippet: string): WebResource["type"] {
  const combined = `${title} ${url} ${snippet}`.toLowerCase();
  if (
    combined.includes("youtube.com") ||
    combined.includes("bilibili.com") ||
    combined.includes("视频") ||
    combined.includes("video") ||
    combined.includes("播放")
  ) {
    return "video";
  }
  if (
    combined.includes("指南") ||
    combined.includes("guide") ||
    combined.includes("manual") ||
    combined.includes("手册") ||
    combined.includes("实验操作") ||
    combined.includes("protocol") ||
    combined.includes("步骤")
  ) {
    return "guide";
  }
  return "article";
}

function deduplicateResources(resources: WebResource[]): WebResource[] {
  const seen = new Set<string>();
  return resources.filter((r) => {
    const key = r.url.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractRealUrl(ddgHref: string): string {
  const match = ddgHref.match(/uddg=([^&]+)/);
  if (match) {
    return decodeURIComponent(match[1]);
  }
  const cleaned = ddgHref.replace(/^\/\//, "https://");
  return cleaned;
}

async function searchWithDuckDuckGo(query: string, timeoutMs = 10_000): Promise<WebResource[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return [];
    }

    const html = await response.text();

    const results: WebResource[] = [];
    const resultPattern = /class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)/g;
    const snippetPattern = /class="result__snippet"[^>]*>([^<]*(?:<[^>]*>[^<]*)*)/g;

    const hrefMatches = [...html.matchAll(resultPattern)];
    const snippetMatches = [...html.matchAll(snippetPattern)];

    for (let i = 0; i < Math.min(hrefMatches.length, 5); i++) {
      const href = hrefMatches[i][1];
      const title = hrefMatches[i][2].trim();
      const rawSnippet = snippetMatches[i]?.[1] ?? "";
      const snippet = rawSnippet.replace(/<[^>]*>/g, "").trim().slice(0, 150);
      const realUrl = extractRealUrl(href);

      if (!realUrl || !/^https?:\/\//i.test(realUrl)) continue;

      results.push({
        title: title || "未命名资源",
        url: realUrl,
        snippet,
        type: classifyResourceType(title, realUrl, snippet),
      });
    }

    return results;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function searchWebResources(params: {
  topic: string;
  subject: string;
  grade?: string;
}): Promise<WebResource[]> {
  const { topic, subject, grade } = params;
  const baseQuery = `${topic} ${subject}`;
  const gradeHint = grade ? ` ${grade}` : "";

  const queries = [
    `${baseQuery} 教学视频 实验演示${gradeHint}`,
    `${baseQuery} 教学资源 教案 学习资料${gradeHint}`,
  ];

  const results = await Promise.allSettled(
    queries.map((query) => searchWithDuckDuckGo(query, 10_000)),
  );

  const allResources: WebResource[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allResources.push(...result.value);
    }
  }

  return deduplicateResources(allResources).slice(0, 5);
}
