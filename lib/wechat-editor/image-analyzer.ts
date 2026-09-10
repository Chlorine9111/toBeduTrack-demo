import { z } from "zod";
import { sendVisionJsonMessage } from "@/lib/wechat/ai-vision";

export interface ImageAnalysis {
  imageIndex: number;
  description: string;
  category: "photo" | "chart" | "poster" | "screenshot" | "illustration" | "gif";
  keywords: string[];
  suggestedCaption: string;
  textContent: string;
}

const IMAGE_ANALYSIS_PROMPT = `你是一个图片内容分析专家。请分析这张图片并返回 JSON：
{
  "description": "图片内容的简要描述（1-2句话）",
  "category": "photo|chart|poster|screenshot|illustration|gif 之一",
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "suggestedCaption": "建议的图注文字（简洁、适合公众号风格）",
  "textContent": "图片中包含的文字内容（如果有的话，原样提取）"
}

要求：
- description 要具体，不要泛泛而谈
- keywords 提取 3-5 个核心语义词
- suggestedCaption 简洁优雅，适合微信公众号
- 如果是活动照片，描述场景和人物动态
- 如果是数据图表，描述数据含义
- 如果是海报/宣传图，提取核心信息`;

const imageAnalysisSchema = z.object({
  description: z.string().min(1).max(200),
  category: z.enum(["photo", "chart", "poster", "screenshot", "illustration", "gif"]),
  keywords: z.array(z.string().min(1)).min(1).max(8),
  suggestedCaption: z.string().min(1).max(120),
  textContent: z.string().default(""),
});

export async function analyzeImage(imageBase64: string, mediaType: string): Promise<Omit<ImageAnalysis, "imageIndex">> {
  const object = imageAnalysisSchema.parse(
    await sendVisionJsonMessage(
      "请结合图片内容，严格按 schema 返回结构化结果。",
      {
        mediaType,
        data: imageBase64,
      },
      {
        system: IMAGE_ANALYSIS_PROMPT,
        temperature: 0.2,
        maxTokens: 1536,
      },
    ),
  );

  return {
    description: object.description,
    category: object.category,
    keywords: object.keywords,
    suggestedCaption: object.suggestedCaption,
    textContent: object.textContent || "",
  };
}

export async function analyzeImages(
  images: Array<{ base64: string; mediaType: string }>,
): Promise<ImageAnalysis[]> {
  const results = await Promise.all(
    images.map((image, index) =>
      analyzeImage(image.base64, image.mediaType).then((analysis) => ({
        ...analysis,
        imageIndex: index,
      })),
    ),
  );

  return results;
}
