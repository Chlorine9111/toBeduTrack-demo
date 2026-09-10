import { z } from "zod";
import {
  generateGatewayText,
  generateStructuredObjectWithGateway,
  streamGatewayText,
} from "@/lib/ai/gateway";
import { getWechatArticleModel, resolveMoonshotTemperature } from "@/lib/wechat-editor/vercel-ai";
import type { ArticleOutline, ImportMode, OutlineBlock } from "@/lib/wechat-editor/types";

function sanitizeLine(line: string) {
  return line.replace(/\s+/g, " ").trim();
}

function parseParagraphs(rawText: string) {
  return rawText
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((item) => sanitizeLine(item))
    .filter(Boolean);
}

function block(type: OutlineBlock["type"], content: string, editable = true): OutlineBlock {
  return {
    id: crypto.randomUUID(),
    type,
    content,
    editable,
  };
}

function deriveKeywords(text: string) {
  const merged = text
    .replace(/[\n\r]/g, " ")
    .replace(/[\d.,，。!?！？:：;；\-—()（）【】\[\]"']/g, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);

  const count = new Map<string, number>();
  merged.forEach((word) => {
    count.set(word, (count.get(word) || 0) + 1);
  });

  return Array.from(count.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

/* ---------- Fix 1: AI 结构分析 ---------- */

const structureAnalysisSchema = z.object({
  paragraphs: z.array(
    z.object({
      index: z.number().int().min(0),
      role: z.enum(["article-title", "section-title", "intro", "body"]),
    }),
  ),
  suggestedTitles: z.array(
    z.object({
      afterIndex: z.number().int().min(-1),
      title: z.string(),
    }),
  ).optional().default([]),
});

async function analyzeStructureWithAI(paragraphs: string[]) {
  const resolvedModel = getWechatArticleModel();
  const { modelId } = resolvedModel;

  const { object } = await generateStructuredObjectWithGateway({
    model: resolvedModel,
    schema: structureAnalysisSchema,
    schemaName: "wechat_article_structure_analysis",
    schemaDescription: "公众号文章段落结构分析",
    systemPrompt: `你是文章结构分析专家。你的任务是分析段落角色，并在必要时建议补充标题。

## 角色定义
- article-title：文章主标题（通常只有 1 个，位于开头，简短有力）
- section-title：章节标题/小标题（概括后续内容，通常较短）
- intro：引言段落（概括性描述，通常紧跟标题之后）
- body：正文段落（详细内容、描述、论述）

## 判断要点
- 短句（≤30 字）且无句号结尾 → 大概率是标题
- 含序号（如"一、""1.""（一）""第X章"）→ 章节标题
- 长段落、有完整句子 → 正文

## 标题补充规则（重要）
你不能修改原文内容，但必须检查文章是否缺少必要的结构：
1. 如果没有段落适合作为 article-title，你必须在 suggestedTitles 中建议一个主标题（afterIndex: -1 表示文章开头）
2. 如果文章内容存在明显的主题转换但没有章节标题，你必须在 suggestedTitles 中建议章节标题
3. 建议的标题要基于上下文内容概括，简洁有力，≤20字
4. afterIndex 表示标题应该插入在哪个段落之后（-1 表示最前面）

## 输出格式（纯 JSON，不要代码块标记）
{"paragraphs":[{"index":0,"role":"body"},...], "suggestedTitles":[{"afterIndex":-1,"title":"建议的主标题"},{"afterIndex":3,"title":"第二部分的章节标题"}]}

如果文章结构完整不需要补充标题，suggestedTitles 可以为空数组。`,
    userPrompt: `分析以下 ${paragraphs.length} 个段落的角色：\n\n${paragraphs
      .map((p, i) => `[${i}] ${p.slice(0, 120)}${p.length > 120 ? "..." : ""}`)
      .join("\n")}`,
    temperature: resolveMoonshotTemperature(modelId, 0.2),
    maxTokens: 3072,
    maxRetries: 1,
  });
  return object;
}

async function buildSmartOutlineWithAI(text: string): Promise<ArticleOutline> {
  const paragraphs = parseParagraphs(text);
  if (paragraphs.length === 0) {
    return buildOutlineFromText("未输入内容");
  }

  const analysis = await analyzeStructureWithAI(paragraphs);
  const roleMap = new Map<number, string>();
  for (const item of analysis.paragraphs) {
    roleMap.set(item.index, item.role);
  }

  const titleIndex = analysis.paragraphs.find((p) => p.role === "article-title")?.index;
  const title =
    titleIndex !== undefined
      ? paragraphs[titleIndex].replace(/^#+\s*/, "").slice(0, 48)
      : (paragraphs[0] || "未命名文章").replace(/^#+\s*/, "").slice(0, 48);

  const blocks: OutlineBlock[] = [
    block("article-title", title),
    block("hero-title", title),
    block("hero-subtitle", "公众号推送"),
  ];

  for (let i = 0; i < paragraphs.length; i++) {
    if (i === titleIndex) continue;

    const role = roleMap.get(i) || "body";
    const content = paragraphs[i];

    switch (role) {
      case "article-title":
      case "section-title":
        blocks.push(block("section-title", content.replace(/^#+\s*/, "")));
        break;
      case "intro":
        blocks.push(block("intro", content));
        break;
      default:
        blocks.push(block("section-content", content));
        break;
    }
  }

  // 插入 AI 建议的标题（缺少标题时补充结构）
  const suggestedTitles = analysis.suggestedTitles ?? [];
  if (suggestedTitles.length > 0) {
    // 按 afterIndex 降序处理，避免插入后索引偏移
    const sorted = [...suggestedTitles].sort((a, b) => b.afterIndex - a.afterIndex);
    for (const suggestion of sorted) {
      if (suggestion.afterIndex === -1) {
        // 插入到 hero 块之后（即 blocks[3] 位置）
        const heroEnd = blocks.findIndex(
          (b) => b.type !== "article-title" && b.type !== "hero-title" && b.type !== "hero-subtitle",
        );
        blocks.splice(heroEnd >= 0 ? heroEnd : 3, 0, block("section-title", suggestion.title));
      } else {
        // 找到对应段落在 blocks 中的位置，在其后插入标题
        const targetText = paragraphs[suggestion.afterIndex];
        const blockIndex = blocks.findIndex((b) => b.content === targetText);
        if (blockIndex >= 0) {
          blocks.splice(blockIndex + 1, 0, block("section-title", suggestion.title));
        }
      }
    }

    // 如果 AI 建议了主标题但 paragraphs 中没有 article-title
    if (titleIndex === undefined) {
      const mainTitleSuggestion = suggestedTitles.find((s) => s.afterIndex === -1);
      if (mainTitleSuggestion) {
        const newTitle = mainTitleSuggestion.title.slice(0, 48);
        blocks[0] = block("article-title", newTitle);
        blocks[1] = block("hero-title", newTitle);
      }
    }
  }

  if (!blocks.some((b) => b.type === "section-title")) {
    const insertAt = blocks.findIndex(
      (b) => b.type === "intro" || b.type === "section-content",
    );
    blocks.splice(
      insertAt >= 0 ? insertAt : blocks.length,
      0,
      block("section-title", "核心内容"),
    );
  }

  return {
    title: blocks[0]?.content ?? title,
    blocks,
    keywords: deriveKeywords(text),
  };
}

/* ---------- 基础启发式解析（fallback） ---------- */

function isLikelyTitle(line: string) {
  const plain = line.replace(/^#+\s*/, "");
  if (plain.length <= 24 && !/[。！？.!?]/.test(plain)) return true;
  return /^第[一二三四五六七八九十\d]+[章节]/.test(plain);
}

function shouldPreferHeuristicOutline(text: string) {
  const paragraphs = parseParagraphs(text);
  if (paragraphs.length <= 3) {
    return true;
  }

  const explicitMarkdownHeadings = paragraphs.filter((item) => /^#+\s+/.test(item)).length;
  const naturalTitles = paragraphs.filter((item) => isLikelyTitle(item)).length;
  return explicitMarkdownHeadings >= 2 || naturalTitles >= 2;
}

export function buildOutlineFromText(text: string): ArticleOutline {
  const paragraphs = parseParagraphs(text);
  const first = paragraphs[0] || "未命名文章";
  const title = first.replace(/^#+\s*/, "").slice(0, 48);

  const blocks: OutlineBlock[] = [
    block("article-title", title),
    block("hero-title", title),
    block("hero-subtitle", "公众号推送"),
  ];

  const introSource = paragraphs[1] || paragraphs[0] || "";
  const bodyStartIndex = paragraphs[1] ? 2 : 1;
  if (introSource) {
    blocks.push(block("intro", introSource));
  }

  paragraphs.slice(bodyStartIndex).forEach((paragraph) => {
    if (isLikelyTitle(paragraph)) {
      blocks.push(block("section-title", paragraph.replace(/^#+\s*/, "")));
      return;
    }

    const maybeHeading = paragraph.match(/^#+\s*(.+)$/);
    if (maybeHeading?.[1]) {
      blocks.push(block("section-title", maybeHeading[1]));
      return;
    }

    blocks.push(block("section-content", paragraph));
  });

  if (!blocks.some((item) => item.type === "section-title")) {
    blocks.splice(4, 0, block("section-title", "核心内容"));
  }

  return {
    title,
    blocks,
    keywords: deriveKeywords(text),
  };
}

/* ---------- AI 文本生成 ---------- */

async function callMoonshot(prompt: string) {
  const resolvedModel = getWechatArticleModel();
  const { modelId } = resolvedModel;

  const result = await generateGatewayText({
    model: resolvedModel,
    system: "你是公众号大纲编辑。只输出 Markdown 文本，不要解释。",
    prompt,
    temperature: resolveMoonshotTemperature(modelId, 0.5),
    maxOutputTokens: 3072,
    maxRetries: 1,
  });

  const content = result.text.trim();
  if (!content) throw new Error("AI 未返回有效内容");
  return content;
}

/* ---------- Fix 3: 流式文本生成 ---------- */

export async function streamGenerateText(params: {
  text: string;
  tone: string;
  paragraphCount: number;
  mode: "ai" | "generate";
  onTextChunk: (chunk: string) => void;
}): Promise<string> {
  const resolvedModel = getWechatArticleModel();
  const { modelId } = resolvedModel;

  const paragraphCount = Math.min(12, Math.max(4, params.paragraphCount));
  const prompt =
    params.mode === "generate"
      ? `请围绕主题"${params.text}"生成一篇公众号文章，约 ${paragraphCount} 段，语气为${params.tone}。`
      : `请将以下素材扩写为公众号文章，约 ${paragraphCount} 段，语气为${params.tone}。素材：\n${params.text}`;

  const result = streamGatewayText({
    model: resolvedModel,
    system: "你是公众号大纲编辑。只输出 Markdown 文本，不要解释。",
    prompt,
    temperature: resolveMoonshotTemperature(modelId, 0.5),
    maxOutputTokens: 3072,
    maxRetries: 1,
  });

  let fullText = "";
  for await (const chunk of result.result.textStream) {
    fullText += chunk;
    params.onTextChunk(chunk);
  }

  if (!fullText.trim()) {
    throw new Error("AI 未返回有效内容");
  }

  return fullText;
}

/* ---------- 入口 ---------- */

export async function buildOutlineWithMode(params: {
  mode: ImportMode;
  text: string;
  tone?: string;
  paragraphCount?: number;
}) {
  const trimmed = params.text.trim();
  if (!trimmed) {
    return buildOutlineFromText("未输入内容");
  }

  if (params.mode === "smart") {
    if (shouldPreferHeuristicOutline(trimmed)) {
      return buildOutlineFromText(trimmed);
    }
    try {
      return await buildSmartOutlineWithAI(trimmed);
    } catch (error) {
      console.error(
        "[outline] AI 结构分析失败，回退到启发式:",
        error instanceof Error ? error.message : error,
      );
      return buildOutlineFromText(trimmed);
    }
  }

  const paragraphCount = Math.min(12, Math.max(4, params.paragraphCount ?? 6));
  const tone = params.tone || "常规";

  const prompt =
    params.mode === "generate"
      ? `请围绕主题"${trimmed}"生成一篇公众号文章，约 ${paragraphCount} 段，语气为${tone}。`
      : `请将以下素材扩写为公众号文章，约 ${paragraphCount} 段，语气为${tone}。素材：\n${trimmed}`;

  try {
    const markdown = await callMoonshot(prompt);
    return buildOutlineFromText(markdown);
  } catch {
    return buildOutlineFromText(trimmed);
  }
}
