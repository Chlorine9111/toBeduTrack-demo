import { z } from "zod";
import type { ImageAnalysis } from "@/lib/wechat-editor/image-analyzer";
import type { ParsedParagraph } from "@/lib/wechat-editor/docx-parser";
import { generateStructuredObjectWithGateway } from "@/lib/ai/gateway";
import { getWechatVisionModel } from "@/lib/wechat-editor/vercel-ai";

export interface LayoutInstruction {
  blocks: Array<{
    type: "heading" | "paragraph" | "image" | "blockquote" | "list" | "divider";
    content?: string;
    level?: number;
    imageIndex?: number;
    imageUrl?: string;
    caption?: string;
    imageSize?: "full" | "medium" | "small";
    items?: string[];
  }>;
}

const compactLayoutBlockSchema = z.object({
  type: z.enum(["heading", "paragraph", "image", "divider"]),
  paragraphIndex: z.number().int().min(0).optional(),
  content: z.string().optional(),
  level: z.number().int().min(1).max(6).optional(),
  imageIndex: z.number().int().min(0).optional(),
  caption: z.string().optional(),
  imageSize: z.enum(["full", "medium", "small"]).optional(),
});

const compactLayoutSchema = z.object({
  blocks: z.array(compactLayoutBlockSchema).min(1),
});

type CompactLayoutResult = z.infer<typeof compactLayoutSchema>;

const LAYOUT_PROMPT = `你是一位资深的微信公众号排版编辑和内容策划。

## 你的任务

将用户提供的文稿和图片素材，排版成一篇优雅的公众号文章。你不仅负责排版，还要为文章**创作合适的标题**。

## 核心规则

1. 正文段落的文字一字不改，用 paragraphIndex 引用
2. 但标题是你创作的——你要理解文章内容后，主动生成合适的标题文字
3. 图片位置由语义决定
4. 排版要有节奏感
5. 每张图片要有图注

## 标题生成规则（最高优先级）

你必须为文章创作标题层级结构。**这是你最重要的职责。**

### 主标题（level 1）
- 你要阅读全文，理解核心主题后，创作一个吸引人的主标题
- 风格：适合微信公众号，简洁有力，≤ 25 字
- 示例：如果文章讲机器人竞赛获奖，可以写"亦中学子征战 Botball 亚洲分会，斩获联队赛冠军"

### 章节标题（level 2）
- 文章中如果已有明显的章节标记（如"1）赛前准备"），保留原文作为标题即可（用 paragraphIndex 引用）
- 如果文章没有章节标记，但内容存在明显的主题转换，你要主动创作章节标题
- 风格：概括本章节核心内容，≤ 20 字

### 小标题（level 3）
- 可选，用于更细粒度的分段

### 判断逻辑
1. 先通读全文，划分内容板块
2. 对每个板块：检查原文是否已有合适的标题短句（字数短、含序号、是总结性语句）
   - 如果有 → 用 paragraphIndex 引用该段落作为 heading
   - 如果没有 → 用 content 字段写一个新标题
3. 最后为整篇文章创作一个主标题（level 1），用 content 字段

## 排版原则

- 每 2-4 段之间考虑插入图片
- 图片均匀分布，不堆叠
- 数据图紧跟描述段落
- 活动照片放在活动描述附近

## 图片尺寸
- full：引题图、海报、全景照
- medium：普通配图、人物照
- small：图标、数据截图

## 输出格式（极其重要）

返回紧凑 JSON：

{
  "blocks": [
    { "type": "heading", "content": "AI 创作的主标题", "level": 1 },
    { "type": "paragraph", "paragraphIndex": 0 },
    { "type": "image", "imageIndex": 0, "caption": "图注", "imageSize": "full" },
    { "type": "heading", "paragraphIndex": 4, "level": 2 },
    { "type": "heading", "content": "AI 创作的章节标题", "level": 2 },
    { "type": "paragraph", "paragraphIndex": 5 },
    { "type": "divider" }
  ]
}

两种 heading 写法：
- 引用原文作标题：{ "type": "heading", "paragraphIndex": 4, "level": 2 }
- AI 创作新标题：{ "type": "heading", "content": "标题文字", "level": 1 }

规则：
- paragraph 必须用 paragraphIndex 引用，不要写 content
- heading 二选一：用 paragraphIndex 引用原文，或用 content 写新标题
- image 包含 imageIndex、caption、imageSize
- blocks 顺序就是文章从上到下的顺序`;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function expandCompactLayout(
  compact: CompactLayoutResult,
  paragraphs: ParsedParagraph[],
): LayoutInstruction {
  const blocks: LayoutInstruction["blocks"] = compact.blocks.map((block) => {
    if (block.type === "heading") {
      // AI 创作的标题：有 content 字段
      if (block.content) {
        return {
          type: "heading" as const,
          level: block.level ?? 2,
          content: block.content,
        };
      }
      // 引用原文的标题：有 paragraphIndex
      const pIdx = block.paragraphIndex ?? -1;
      const paragraph = paragraphs[pIdx];
      return {
        type: "heading" as const,
        level: block.level ?? 2,
        content: paragraph?.text ?? "",
      };
    }

    if (block.type === "paragraph") {
      const pIdx = block.paragraphIndex ?? -1;
      const paragraph = paragraphs[pIdx];
      return {
        type: "paragraph" as const,
        content: paragraph?.text ?? "",
      };
    }

    if (block.type === "image") {
      return {
        type: "image" as const,
        imageIndex: block.imageIndex ?? 0,
        caption: block.caption ?? "",
        imageSize: block.imageSize ?? "medium",
      };
    }

    return { type: "divider" as const };
  });

  return { blocks };
}

export async function generateLayout(
  paragraphs: ParsedParagraph[],
  imageAnalyses: ImageAnalysis[],
  style: "interleave" | "grouped" | "hero",
): Promise<LayoutInstruction> {
  const styleDescriptions = {
    interleave: "图文穿插：图片均匀分布在段落之间",
    grouped: "图片集中：相关图片集中在对应章节",
    hero: "头图突出：首图大图展示，其余图片穿插",
  };

  const userMessage = `## 文稿段落\n\n${paragraphs
    .map((paragraph) => {
      const boldHint = paragraph.bold ? "[加粗]" : "";
      return `[段落${paragraph.index}][${paragraph.type}]${boldHint}(${paragraph.wordCount}字) ${paragraph.text.slice(0, 60)}${paragraph.text.length > 60 ? "..." : ""}`;
    })
    .join("\n")}\n\n## 图片素材\n\n${imageAnalyses
    .map(
      (image) => `[图片${image.imageIndex}] ${image.description} | 分类:${image.category} | 建议图注:${image.suggestedCaption}`,
    )
    .join("\n")}\n\n## 排版风格\n\n${styleDescriptions[style]}\n\n请生成排版指令 JSON。注意：请直接返回纯 JSON 对象，不要用 markdown 代码块包裹。`;

  const resolvedModel = getWechatVisionModel();
  const { modelId } = resolvedModel;

  const { object } = await generateStructuredObjectWithGateway({
    model: resolvedModel,
    schema: compactLayoutSchema,
    schemaName: "wechat_layout_instruction",
    schemaDescription: "公众号排版紧凑结构",
    systemPrompt: LAYOUT_PROMPT,
    userPrompt: userMessage,
    maxTokens: 5120,
    temperature: 0.4,
    maxRetries: 1,
  });
  const result = expandCompactLayout(object, paragraphs);

  const headingCount = result.blocks.filter(b => b.type === "heading").length;
  const paragraphCount = result.blocks.filter(b => b.type === "paragraph").length;
  console.log(
    `[generateLayout] AI 返回 ${result.blocks.length} blocks: ${headingCount} headings, ${paragraphCount} paragraphs (model=${modelId})`,
  );

  return result;
}

function isLikelyHeading(paragraph: ParsedParagraph): { isHeading: boolean; level: number } {
  // 已经是 heading 类型
  if (paragraph.type === "heading") {
    return { isHeading: true, level: paragraph.level ?? 2 };
  }

  const text = paragraph.text.trim();

  // 太长不可能是标题
  if (text.length > 30) return { isHeading: false, level: 0 };

  // 含句号、问号等句末标点的长句不是标题
  if (/[。！？.!?]$/.test(text) && text.length > 15) return { isHeading: false, level: 0 };

  // 序号开头 → 章节标题
  if (/^[一二三四五六七八九十]+[、.．]/.test(text)) return { isHeading: true, level: 2 };
  if (/^[（(][一二三四五六七八九十]+[）)]/.test(text)) return { isHeading: true, level: 2 };
  if (/^\d+[、.．)\s]/.test(text)) return { isHeading: true, level: 2 };
  if (/^第[一二三四五六七八九十\d]+[章节部分]/.test(text)) return { isHeading: true, level: 2 };
  if (/^[A-Z]+\s*[.、:：—–-]?\s*\S/.test(text) && text.length <= 20) return { isHeading: true, level: 2 };

  // 加粗的短句
  if (paragraph.bold && text.length <= 25) return { isHeading: true, level: 2 };

  // 非常短的纯文本（无句号结尾）
  if (text.length <= 15 && !/[。！？.!?]/.test(text)) return { isHeading: true, level: 2 };

  return { isHeading: false, level: 0 };
}

export function fallbackLayout(paragraphs: ParsedParagraph[], imageUrls: string[]): LayoutInstruction {
  const blocks: LayoutInstruction["blocks"] = [];
  let imagePointer = 0;
  let hasMainTitle = false;

  paragraphs.forEach((paragraph, index) => {
    const detection = isLikelyHeading(paragraph);

    if (detection.isHeading) {
      // 第一个检测到的标题作为主标题 (level 1)
      const level = !hasMainTitle ? 1 : detection.level;
      if (!hasMainTitle) hasMainTitle = true;

      blocks.push({
        type: "heading",
        level,
        content: paragraph.text,
      });
    } else {
      blocks.push({
        type: "paragraph",
        content: paragraph.text,
      });
    }

    if (imagePointer < imageUrls.length && index > 0 && index % 3 === 0) {
      blocks.push({
        type: "image",
        imageIndex: imagePointer,
        imageUrl: imageUrls[imagePointer],
        caption: `配图 ${imagePointer + 1}`,
        imageSize: imagePointer === 0 ? "full" : "medium",
      });
      imagePointer += 1;
    }
  });

  while (imagePointer < imageUrls.length) {
    blocks.push({
      type: "image",
      imageIndex: imagePointer,
      imageUrl: imageUrls[imagePointer],
      caption: `配图 ${imagePointer + 1}`,
      imageSize: "medium",
    });
    imagePointer += 1;
  }

  return { blocks };
}

export function layoutToHtml(layout: LayoutInstruction, imageUrls: string[]): string {
  return layout.blocks
    .map((block) => {
      switch (block.type) {
        case "heading": {
          const level = Math.min(6, Math.max(1, block.level ?? 2));
          return `<h${level}>${escapeHtml(block.content ?? "")}</h${level}>`;
        }
        case "paragraph":
          return `<p>${escapeHtml(block.content ?? "")}</p>`;
        case "image": {
          const url = block.imageUrl || imageUrls[block.imageIndex ?? -1] || "";
          if (!url) return "";
          const sizeStyle =
            block.imageSize === "small"
              ? "max-width:50%"
              : block.imageSize === "medium"
                ? "max-width:70%"
                : "max-width:100%";
          const caption = block.caption ? `<figcaption style="color:#888;font-size:0.85em;margin-top:0.5em;">${escapeHtml(block.caption)}</figcaption>` : "";
          return `<figure style="text-align:center;margin:1.5em 0;"><img src="${escapeHtml(url)}" alt="${escapeHtml(
            block.caption ?? "",
          )}" style="${sizeStyle};height:auto;display:block;margin:0 auto;border-radius:6px;"/>${caption}</figure>`;
        }
        case "blockquote":
          return `<blockquote>${escapeHtml(block.content ?? "")}</blockquote>`;
        case "list":
          return `<ul>${(block.items ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
        case "divider":
          return "<hr />";
        default:
          return "";
      }
    })
    .join("\n");
}
