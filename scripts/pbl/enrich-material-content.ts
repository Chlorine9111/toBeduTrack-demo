import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

type MaterialType = "competition" | "pbl_case" | "driving_question" | "curriculum_map";

type MaterialSeed = {
  id: string;
  title: string;
  source: string;
  year: number;
  link: string;
  type: MaterialType;
  tags: string[];
  content?: string;
  originalContent?: string;
};

type ExtractedPage = {
  pageTitle: string;
  description: string;
  paragraphs: string[];
};

type EnrichResult = {
  material: MaterialSeed;
  status: "fetched" | "fallback";
  reason?: string;
};

const USER_AGENT =
  "Mozilla/5.0 (compatible; DeskmatePBLCollector/1.0; +https://github.com/tya123233/toBeduTrack)";

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#x27;/g, "'");
}

function normalizeText(input: string) {
  return decodeHtmlEntities(input)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickMetaContent(html: string, key: string) {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*name=["']${key}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*property=["']${key}["'][^>]*>`, "i"),
  ];

  for (const pattern of patterns) {
    const matched = html.match(pattern);
    if (matched?.[1]) {
      const text = normalizeText(matched[1]);
      if (text) return text;
    }
  }

  return "";
}

function extractParagraphs(html: string) {
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const cleaned = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ");

  const paragraphs = Array.from(cleaned.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
    .map((item) => normalizeText(item[1] ?? ""))
    .filter((text) => text.length >= 50)
    .slice(0, 4);

  if (paragraphs.length > 0) return paragraphs;

  const fallback = normalizeText(cleaned);
  if (!fallback) return [];

  return fallback
    .split(/(?<=[。！？.!?])\s+/)
    .map((text) => text.trim())
    .filter((text) => text.length >= 50)
    .slice(0, 4);
}

async function fetchPage(url: string): Promise<ExtractedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new Error(`Unsupported content-type: ${contentType}`);
    }

    const html = await response.text();

    const pageTitle = normalizeText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const description =
      pickMetaContent(html, "description") ||
      pickMetaContent(html, "og:description") ||
      pickMetaContent(html, "twitter:description");

    const paragraphs = extractParagraphs(html);

    if (!pageTitle && !description && paragraphs.length === 0) {
      throw new Error("No readable text extracted");
    }

    return {
      pageTitle,
      description,
      paragraphs,
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildUsageHint(material: MaterialSeed) {
  const tagsText = material.tags.join("、");

  if (material.type === "competition") {
    return `该资源适合作为项目挑战任务的题源。可优先用于“问题定义 + 评价标准”阶段，结合标签（${tagsText}）引导学生拆解任务要求并制定证据收集计划。`;
  }

  if (material.type === "pbl_case") {
    return `该资源适合作为项目案例库。可用于教师示例讲解与学生项目对标，重点提炼项目结构、交付形式与评估方式，并映射到标签（${tagsText}）相关课堂目标。`;
  }

  if (material.type === "curriculum_map") {
    return `该资源适合作为课标对齐依据。可用于确认项目中的知识点覆盖与评价边界，将标签（${tagsText}）相关能力目标与阶段任务逐条绑定。`;
  }

  return `该资源适合作为驱动性问题与背景证据来源。可结合标签（${tagsText}）提取真实世界情境数据，支撑学生完成问题建模、论证与方案迭代。`;
}

function truncate(text: string, max = 1600) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function buildFetchedContent(material: MaterialSeed, extracted: ExtractedPage) {
  const pageSummary = [extracted.description, ...extracted.paragraphs]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const chunks = [
    `素材标题：${material.title}`,
    `来源机构：${material.source}`,
    `发布时间：${material.year}`,
    `资源类型：${material.type}`,
    `标签：${material.tags.join("、")}`,
    `原始链接：${material.link}`,
    extracted.pageTitle ? `页面标题：${extracted.pageTitle}` : "",
    "页面摘要：",
    pageSummary || "（页面可访问，但未提取到稳定正文，建议人工补充摘要）",
    "教学使用建议：",
    buildUsageHint(material),
  ].filter(Boolean);

  return truncate(chunks.join("\n\n"), 2200);
}

function buildFallbackContent(material: MaterialSeed, reason: string) {
  const chunks = [
    `素材标题：${material.title}`,
    `来源机构：${material.source}`,
    `发布时间：${material.year}`,
    `资源类型：${material.type}`,
    `标签：${material.tags.join("、")}`,
    `原始链接：${material.link}`,
    "页面摘要：",
    `自动抓取失败（${reason}）。当前摘要基于公开目录信息与资源标题整理：该资源与“${material.tags.join(" / ")}”高度相关，可作为项目生成时的背景来源或任务约束参考。建议在后续人工抽样时补录页面正文要点。`,
    "教学使用建议：",
    buildUsageHint(material),
  ];

  return truncate(chunks.join("\n\n"), 2200);
}

async function enrichOne(material: MaterialSeed): Promise<EnrichResult> {
  try {
    const extracted = await fetchPage(material.link);
    const content = buildFetchedContent(material, extracted);
    return {
      material: { ...material, content, originalContent: content },
      status: "fetched",
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const existing = material.originalContent?.trim() || material.content?.trim();

    if (existing && existing.length >= 180) {
      return {
        material: { ...material, content: existing, originalContent: existing },
        status: "fallback",
        reason: `kept-existing-content; ${reason}`,
      };
    }

    const content = buildFallbackContent(material, reason);
    return {
      material: { ...material, content, originalContent: content },
      status: "fallback",
      reason,
    };
  }
}

async function runBatch(materials: MaterialSeed[], concurrency = 6) {
  const queue = [...materials];
  const results: EnrichResult[] = [];

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) return;
      const result = await enrichOne(item);
      results.push(result);
      const marker = result.status === "fetched" ? "✓" : "!";
      console.log(`${marker} ${item.id} ${item.title}`);
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
  await Promise.all(workers);
  return results.sort((a, b) => a.material.id.localeCompare(b.material.id));
}

function writeReport(results: EnrichResult[]) {
  const fetched = results.filter((item) => item.status === "fetched");
  const fallback = results.filter((item) => item.status === "fallback");

  const rows = fallback
    .map((item) => `| ${item.material.id} | ${item.material.title} | ${item.reason ?? "未知"} | ${item.material.link} |`)
    .join("\n");

  const report = `# PBL 素材正文抓取报告\n\n- 总数：${results.length}\n- 成功抓取：${fetched.length}\n- 回退摘要：${fallback.length}\n\n${
    fallback.length > 0
      ? `## 抓取失败清单（建议人工抽样复核）\n\n| 编号 | 标题 | 失败原因 | 链接 |\n|---|---|---|---|\n${rows}\n`
      : "## 抓取失败清单\n\n无\n"
  }`;

  const reportPath = resolve(process.cwd(), "docs", "pbl", "materials-content-enrich-report.md");
  mkdirSync(resolve(process.cwd(), "docs", "pbl"), { recursive: true });
  writeFileSync(reportPath, report);
}

async function main() {
  const dataPath = resolve(process.cwd(), "data", "pbl", "materials.collected.json");
  const materials = JSON.parse(readFileSync(dataPath, "utf-8")) as MaterialSeed[];

  const results = await runBatch(materials, 6);

  const output = results.map((item) => item.material);
  writeFileSync(dataPath, JSON.stringify(output, null, 2));
  writeReport(results);

  const fetched = results.filter((item) => item.status === "fetched").length;
  const fallback = results.length - fetched;

  console.log(
    JSON.stringify(
      {
        ok: true,
        total: results.length,
        fetched,
        fallback,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
