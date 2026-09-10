import type { WebSearchResult } from "@/lib/pbl/types";

const OFFICIAL_DOMAIN_PATTERNS = [
  /(^|\.)collegeboard\.org$/i,
  /(^|\.)apcentral\.collegeboard\.org$/i,
  /(^|\.)edu\.cn$/i,
  /(^|\.)edu$/i,
  /(^|\.)gov$/i,
  /(^|\.)gov\.cn$/i,
  /(^|\.)ac\.uk$/i,
  /(^|\.)org$/i,
];

const LOW_QUALITY_DOMAIN_PATTERNS = [
  /(^|\.)zhihu\.com$/i,
  /(^|\.)doc88\.com$/i,
  /(^|\.)wenku\.baidu\.com$/i,
  /(^|\.)baidu\.com$/i,
  /(^|\.)sohu\.com$/i,
  /(^|\.)toutiao\.com$/i,
  /(^|\.)163\.com$/i,
];

function classifyResourceType(
  queryIndex: number,
  title: string,
  url: string,
  snippet: string,
): WebSearchResult["type"] {
  const combined = `${title} ${url} ${snippet}`.toLowerCase();
  if (
    combined.includes("youtube.com") ||
    combined.includes("bilibili.com") ||
    combined.includes("视频") ||
    combined.includes("video")
  ) {
    return "video";
  }
  if (
    combined.includes("pbl") ||
    combined.includes("项目式学习") ||
    combined.includes("project based learning")
  ) {
    return "pbl_reference";
  }
  if (queryIndex === 0 || /事故|案例|演练|safety|incident|fire|explosion/.test(combined)) {
    return "case";
  }
  if (
    queryIndex === 1 ||
    queryIndex === 2 ||
    /course and exam description|syllabus|curriculum|课程标准|考纲|guide|collegeboard|ibo\.org/.test(combined)
  ) {
    return "regulation";
  }
  return "article";
}

function deduplicateResults(results: WebSearchResult[]) {
  const seen = new Set<string>();
  return results.filter((item) => {
    const key = item.url.replace(/\/$/, "").toLowerCase();
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
  return ddgHref.replace(/^\/\//, "https://");
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isOfficialDomain(hostname: string) {
  return OFFICIAL_DOMAIN_PATTERNS.some((pattern) => pattern.test(hostname));
}

function isLowQualityDomain(hostname: string) {
  return LOW_QUALITY_DOMAIN_PATTERNS.some((pattern) => pattern.test(hostname));
}

function scoreResult(result: WebSearchResult) {
  const hostname = getHostname(result.url);
  const combined = `${result.title} ${result.url} ${result.snippet}`.toLowerCase();
  let score = 0;

  if (result.type === "regulation") score += 28;
  if (result.type === "case") score += 24;
  if (result.type === "pbl_reference") score += 18;
  if (isOfficialDomain(hostname)) score += 20;
  if (/collegeboard|apcentral|education|safety|university|school|academy/i.test(combined)) {
    score += 10;
  }
  if (result.snippet.length >= 40) score += 4;
  if (/\.edu(\.|$)|\.gov(\.|$)|collegeboard\.org/.test(hostname)) score += 6;
  if (/ap chemistry|ib chemistry|高中化学|electrochem|电化学/.test(combined)) score += 6;
  if (/index\/|list|目录|汇总/.test(result.url) && result.snippet.length < 40) score -= 10;
  if (isLowQualityDomain(hostname)) score -= 18;

  return score;
}

function rankAndFilterResults(results: WebSearchResult[]) {
  const ranked = results
    .map((item) => ({ item, score: scoreResult(item) }))
    .sort((left, right) => right.score - left.score);

  const strongResults = ranked.filter(({ item, score }) => {
    const hostname = getHostname(item.url);
    if (score >= 18) return true;
    return !isLowQualityDomain(hostname) && score >= 8;
  });

  const sourcePool = strongResults.length >= 6 ? strongResults : ranked;
  const selected: Array<(typeof sourcePool)[number]> = [];

  function includeFirst(predicate: (entry: (typeof sourcePool)[number]) => boolean) {
    const match = sourcePool.find(predicate);
    if (!match) return;
    if (selected.some((entry) => entry.item.url === match.item.url)) return;
    selected.push(match);
  }

  includeFirst(({ item }) => item.type === "case");
  includeFirst(({ item }) => item.type === "regulation" && isOfficialDomain(getHostname(item.url)));
  includeFirst(({ item }) => item.type === "pbl_reference");

  for (const entry of sourcePool) {
    if (selected.some((item) => item.item.url === entry.item.url)) continue;
    selected.push(entry);
    if (selected.length >= 10) break;
  }

  return selected.map(({ item }) => item);
}

function buildOfficialCurriculumFallback(params: {
  curriculumSystem?: string;
  subject: string;
}): WebSearchResult | null {
  const subject = params.subject.trim();
  if (params.curriculumSystem === "AP") {
    const apMap: Record<string, { title: string; url: string }> = {
      "AP Chemistry": {
        title: "AP Chemistry Course - AP Central | College Board",
        url: "https://apcentral.collegeboard.org/courses/ap-chemistry",
      },
      "AP Biology": {
        title: "AP Biology Course - AP Central | College Board",
        url: "https://apcentral.collegeboard.org/courses/ap-biology",
      },
      "AP Physics 1: Algebra-Based": {
        title: "AP Physics 1: Algebra-Based Course - AP Central | College Board",
        url: "https://apcentral.collegeboard.org/courses/ap-physics-1",
      },
      "AP Calculus AB": {
        title: "AP Calculus AB Course - AP Central | College Board",
        url: "https://apcentral.collegeboard.org/courses/ap-calculus-ab",
      },
      "AP English Language and Composition": {
        title: "AP English Language and Composition Course - AP Central | College Board",
        url: "https://apcentral.collegeboard.org/courses/ap-english-language-and-composition",
      },
    };

    const match = apMap[subject];
    if (match) {
      return {
        ...match,
        snippet: "College Board 官方课程页面，包含课程框架、考纲与考试要求。",
        type: "regulation",
      };
    }
  }

  if (params.curriculumSystem === "IB" && /chemistry/i.test(subject)) {
    return {
      title: "Chemistry - International Baccalaureate®",
      url: "https://www.ibo.org/programmes/diploma-programme/curriculum/sciences/chemistry/",
      snippet: "IB 官方课程页面，包含课程目标、结构与评估方式。",
      type: "regulation",
    };
  }

  return null;
}

async function searchWithDuckDuckGo(
  query: string,
  queryIndex: number,
  timeoutMs = 15_000,
): Promise<WebSearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
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
    const titlePattern = /class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)/g;
    const snippetPattern = /class="result__snippet"[^>]*>([^<]*(?:<[^>]*>[^<]*)*)/g;
    const titleMatches = [...html.matchAll(titlePattern)];
    const snippetMatches = [...html.matchAll(snippetPattern)];

    const items: WebSearchResult[] = [];
    for (let index = 0; index < Math.min(titleMatches.length, 5); index += 1) {
      const href = titleMatches[index]?.[1] ?? "";
      const title = titleMatches[index]?.[2]?.trim() ?? "";
      const rawSnippet = snippetMatches[index]?.[1] ?? "";
      const snippet = rawSnippet.replace(/<[^>]*>/g, "").trim().slice(0, 200);
      const url = extractRealUrl(href);

      if (!url || !/^https?:\/\//i.test(url)) continue;
      if (/duckduckgo\.com\/y\.js/i.test(url)) continue;
      if (/amazon\.com|study\.com|ad_provider=|bing\.com\/aclick/i.test(url)) continue;

      items.push({
        title: title || "未命名资源",
        url,
        snippet,
        type: classifyResourceType(queryIndex, title, url, snippet),
      });
    }

    return items;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function searchForPbl(params: {
  topic: string;
  subject: string;
  grade?: string;
  curriculumSystem?: string;
}): Promise<WebSearchResult[]> {
  const topic = params.topic.trim();
  const subject = params.subject.trim();
  const grade = params.grade?.trim() ?? "";
  const curriculum = params.curriculumSystem?.trim() ?? "";
  const year = new Date().getFullYear();

  const officialCurriculumQuery =
    curriculum === "AP"
      ? `site:apcentral.collegeboard.org "${subject}" course and exam description ${topic}`
      : curriculum === "IB"
        ? `site:ibo.org "${subject}" guide syllabus ${topic}`
        : `${subject} ${grade} 教育部 课程标准 ${topic}`;

  const queries = [
    `${topic} 真实案例 事故 新闻事件 ${year}`,
    officialCurriculumQuery,
    `${subject} ${grade} ${curriculum} 课程标准 知识点 教学要求`,
    `${topic} PBL 项目式学习 教学设计 活动方案`,
  ].map((item) => item.replace(/\s+/g, " ").trim());

  const settled = await Promise.allSettled(
    queries.map((query, queryIndex) => searchWithDuckDuckGo(query, queryIndex)),
  );

  const merged: WebSearchResult[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      merged.push(...result.value);
    }
  }

  const ranked = rankAndFilterResults(deduplicateResults(merged));
  const hasOfficialRegulation = ranked.some(
    (item) => item.type === "regulation" && isOfficialDomain(getHostname(item.url)),
  );

  if (hasOfficialRegulation) {
    return ranked;
  }

  const officialFallback = buildOfficialCurriculumFallback({
    curriculumSystem: params.curriculumSystem,
    subject: params.subject,
  });
  if (!officialFallback) {
    return ranked;
  }

  return deduplicateResults([officialFallback, ...ranked]).slice(0, 10);
}
