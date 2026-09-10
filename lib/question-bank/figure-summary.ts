import { z } from "zod";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import { generateStructuredObject } from "@/lib/ai/structured-output";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const MAX_FIGURE_COUNT = 2;
const DEFAULT_TIMEOUT_MS = 8_000;
const QUESTION_IMAGE_BUCKET = process.env.QUESTION_IMAGE_BUCKET ?? "pdfs";

const figureSummarySchema = z.object({
  summary: z.string().trim().min(1).max(400),
  keywords: z.array(z.string().trim().min(1).max(48)).max(8).default([]),
  figureType: z
    .enum(["graph", "diagram", "table", "geometry", "experiment", "mixed", "other"])
    .default("other"),
});

type FigureSummaryResult = {
  summary: string;
  keywords: string[];
  figureType: z.infer<typeof figureSummarySchema>["figureType"];
  imageCount: number;
};

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function resolveFigureUrl(url: string) {
  const normalized = cleanText(url);
  if (!normalized) return normalized;
  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  const baseUrl =
    cleanText(process.env.NEXT_PUBLIC_APP_URL) ||
    cleanText(process.env.APP_BASE_URL) ||
    cleanText(process.env.UX_BASE_URL) ||
    (cleanText(process.env.VERCEL_URL) ? `https://${cleanText(process.env.VERCEL_URL)}` : "") ||
    "http://127.0.0.1:3001";

  return new URL(normalized, baseUrl).toString();
}

function extractStoragePathFromScanImageUrl(url: string) {
  const normalized = cleanText(url);
  if (!normalized) return null;

  try {
    const resolved = /^https?:\/\//i.test(normalized)
      ? new URL(normalized)
      : new URL(normalized, "http://127.0.0.1:3001");
    if (!resolved.pathname.endsWith("/api/pdf/scan-image")) {
      return null;
    }
    const storagePath = cleanText(resolved.searchParams.get("path"));
    return storagePath || null;
  } catch {
    return null;
  }
}

function guessMediaType(url: string, header: string | null) {
  const normalizedHeader = cleanText(header).toLowerCase();
  if (normalizedHeader.startsWith("image/")) {
    return normalizedHeader.split(";")[0];
  }

  const normalizedUrl = url.toLowerCase();
  if (normalizedUrl.endsWith(".png")) return "image/png";
  if (normalizedUrl.endsWith(".webp")) return "image/webp";
  if (normalizedUrl.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

async function fetchFigureBuffer(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const storagePath = extractStoragePathFromScanImageUrl(url);
    if (storagePath) {
      const admin = createAdminSupabaseClient();
      const { data, error } = await admin.storage
        .from(QUESTION_IMAGE_BUCKET)
        .download(storagePath);

      if (error || !data) {
        throw new Error(`STORAGE_${error?.message ?? "NOT_FOUND"}`);
      }

      const buffer = Buffer.from(await data.arrayBuffer());
      if (buffer.length === 0) {
        throw new Error("EMPTY_IMAGE");
      }

      return {
        buffer,
        mediaType: guessMediaType(storagePath, data.type ?? null),
      };
    }

    const resolvedUrl = resolveFigureUrl(url);
    const response = await fetch(resolvedUrl, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`FETCH_${response.status}`);
    }

    const mediaType = guessMediaType(resolvedUrl, response.headers.get("content-type"));
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      throw new Error("EMPTY_IMAGE");
    }

    return {
      buffer,
      mediaType,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function extractImageUrlsFromExerciseContent(input: {
  questionText?: string | null;
  options?: Array<{ text?: string | null }> | null;
}) {
  const markdownImagePattern = /!\[[^\]]*]\(([^)]+)\)/g;
  const values = [
    cleanText(input.questionText),
    ...((input.options ?? []).map((item) => cleanText(item?.text))),
  ];

  const urls: string[] = [];
  for (const value of values) {
    if (!value) continue;
    let match: RegExpExecArray | null;
    while ((match = markdownImagePattern.exec(value))) {
      const url = cleanText(match[1]);
      if (url) {
        urls.push(url);
      }
    }
  }

  return Array.from(new Set(urls)).slice(0, MAX_FIGURE_COUNT);
}

export async function summarizeExerciseFigures(input: {
  questionText?: string | null;
  options?: Array<{ text?: string | null }> | null;
}) {
  const urls = extractImageUrlsFromExerciseContent(input);
  if (urls.length === 0) {
    return null;
  }

  const loaded = await Promise.all(
    urls.map((url) =>
      fetchFigureBuffer(url)
        .then((item) => ({ ...item, url }))
        .catch((error) => {
          console.warn("题图抓取失败，跳过图像摘要", {
            url,
            message: error instanceof Error ? error.message : String(error),
          });
          return null;
        }),
    ),
  );

  const images = loaded.filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (images.length === 0) {
    return {
      summary: `本题包含 ${urls.length} 张附图，当前未能生成稳定图像摘要。`,
      keywords: [],
      figureType: "other" as const,
      imageCount: urls.length,
    } satisfies FigureSummaryResult;
  }

  try {
    const payload = await generateStructuredObject({
      model: getResolvedLanguageModelForTask("question_figure_summary"),
      schema: figureSummarySchema,
      systemPrompt:
        "你是教育题库的题图摘要助手。任务是用极简但稳定的方式描述题图真正表达的内容，服务于相似题检索与自动组卷。只描述图像承载的数学/科学/实验/图表信息，不描述美术风格，不编造未出现的信息。",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "请结合题干和附图，生成一个适合向量检索的简短题图摘要。",
                `题干：${cleanText(input.questionText) || "无题干"}`,
                "要求：",
                "1. 摘要聚焦图像在考什么，不要泛泛而谈。",
                "2. 如果是函数图像、几何图、实验装置、数据图表，要点明对象和关系。",
                "3. 关键词只保留真正有检索价值的词。",
              ].join("\n"),
            },
            ...images.map((image) => ({
              type: "image" as const,
              image: image.buffer,
              mediaType: image.mediaType,
            })),
          ],
        },
      ],
      maxTokens: 500,
      temperature: 0.1,
      maxRetries: 1,
    });

    return {
      summary: cleanText(payload.summary).slice(0, 240),
      keywords: payload.keywords
        .map((keyword) => cleanText(keyword).slice(0, 32))
        .filter(Boolean)
        .slice(0, 6),
      figureType: payload.figureType,
      imageCount: images.length,
    } satisfies FigureSummaryResult;
  } catch (error) {
    console.warn("题图摘要生成失败，回退到简单图像描述", {
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      summary: `本题包含 ${images.length} 张题图，建议按图像语义参与相似题检索。`,
      keywords: [],
      figureType: "other" as const,
      imageCount: images.length,
    } satisfies FigureSummaryResult;
  }
}
