import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getLessonPlanContext } from "@/lib/lesson-plan/context";
import { isAuthBypassEnabled } from "@/lib/auth/bypass";
import { jsonError } from "@/lib/api/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { parseDocxBuffer } from "@/lib/wechat-editor/docx-parser";
import { analyzeImages, type ImageAnalysis } from "@/lib/wechat-editor/image-analyzer";
import {
  fallbackLayout,
  generateLayout,
  layoutToHtml,
  type LayoutInstruction,
} from "@/lib/wechat-editor/layout-engine";
import { getPaletteById } from "@/lib/wechat-editor/color-palettes";
import { renderOutlineWithTemplate } from "@/lib/wechat-editor/template-renderer";
import type { ArticleOutline, OutlineBlock } from "@/lib/wechat-editor/types";
import { getWechatTemplateByIdFromCloud } from "@/lib/wechat-editor/template-repository";

const MAX_DOCX_SIZE = 10 * 1024 * 1024;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGES = 20;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const styleSchema = z.enum(["interleave", "grouped", "hero"]).default("interleave");

function sanitizeFileName(name: string) {
  const basename = name.split(/[/\\]/).pop() || "upload";
  return basename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

function sseEvent(encoder: TextEncoder, payload: unknown) {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function toOutlineBlock(id: string, block: LayoutInstruction["blocks"][number], imageUrls: string[]): OutlineBlock {
  if (block.type === "heading") {
    return {
      id,
      type: "section-title",
      content: block.content ?? "",
      editable: true,
    };
  }

  if (block.type === "paragraph") {
    return {
      id,
      type: "section-content",
      content: block.content ?? "",
      editable: true,
    };
  }

  if (block.type === "image") {
    return {
      id,
      type: "image-placeholder",
      content: block.caption ?? "",
      editable: true,
      imageUrl: block.imageUrl || imageUrls[block.imageIndex ?? -1] || "",
    };
  }

  if (block.type === "blockquote") {
    return {
      id,
      type: "blockquote",
      content: block.content ?? "",
      editable: true,
    };
  }

  if (block.type === "divider") {
    return {
      id,
      type: "divider",
      content: "",
      editable: false,
    };
  }

  if (block.type === "list") {
    return {
      id,
      type: "section-content",
      content: (block.items ?? []).join("；"),
      editable: true,
    };
  }

  return {
    id,
    type: "section-content",
    content: block.content ?? "",
    editable: true,
  };
}

function layoutToOutline(layout: LayoutInstruction, imageUrls: string[]): ArticleOutline {
  const blocks = layout.blocks.map((item) => toOutlineBlock(randomUUID(), item, imageUrls));
  const title =
    blocks.find((item) => item.type === "section-title")?.content ||
    blocks.find((item) => item.type === "section-content")?.content.slice(0, 24) ||
    "未命名文章";

  return {
    title,
    keywords: [],
    blocks: [
      {
        id: randomUUID(),
        type: "article-title",
        content: title,
        editable: true,
      },
      ...blocks,
    ],
  };
}

async function uploadImageAndGetUrl(params: {
  teacherId: string;
  file: File;
  bucket: string;
}): Promise<string> {
  const admin = createAdminSupabaseClient();
  const safeName = sanitizeFileName(params.file.name || `image-${Date.now()}`);
  const storagePath = `wechat-editor/images/${params.teacherId}/${Date.now()}-${randomUUID()}-${safeName}`;
  const fileBuffer = Buffer.from(await params.file.arrayBuffer());

  const { error } = await admin.storage.from(params.bucket).upload(storagePath, fileBuffer, {
    contentType: params.file.type || "application/octet-stream",
    upsert: false,
  });

  if (error) {
    throw new Error(`上传图片失败: ${error.message}`);
  }

  const { data } = admin.storage.from(params.bucket).getPublicUrl(storagePath);
  if (!data.publicUrl) {
    throw new Error("获取图片公开链接失败");
  }

  return data.publicUrl;
}

async function resolveTeacherId(): Promise<{ teacherId: string; useLocalImages: boolean }> {
  if (isAuthBypassEnabled()) {
    const bypassId = process.env.AUTH_BYPASS_USER_ID;
    if (bypassId) {
      const contextResult = await getLessonPlanContext();
      if (contextResult.ok) {
        return { teacherId: contextResult.value.teacherId, useLocalImages: true };
      }
      return { teacherId: bypassId, useLocalImages: true };
    }
  }

  const contextResult = await getLessonPlanContext();
  if (!contextResult.ok) {
    throw new Error(contextResult.error.message);
  }
  return { teacherId: contextResult.value.teacherId, useLocalImages: false };
}

export async function POST(request: NextRequest) {
  let teacherId: string;
  let useLocalImages: boolean;

  try {
    const resolved = await resolveTeacherId();
    teacherId = resolved.teacherId;
    useLocalImages = resolved.useLocalImages;
  } catch {
    return jsonError("UNAUTHORIZED", "未授权访问", 401);
  }

  try {
    const formData = await request.formData();
    const docx = formData.get("docx");

    if (!(docx instanceof File)) {
      return jsonError("VALIDATION_ERROR", "请上传 Word 文档（.docx）", 400);
    }

    if (!docx.name.toLowerCase().endsWith(".docx")) {
      return jsonError("VALIDATION_ERROR", "仅支持 .docx 文件", 400);
    }

    if (docx.size <= 0 || docx.size > MAX_DOCX_SIZE) {
      return jsonError("VALIDATION_ERROR", "Word 文件大小需在 10MB 以内", 400);
    }

    const style = styleSchema.parse(`${formData.get("style") ?? "interleave"}`);
    const templateId = `${formData.get("templateId") ?? ""}`.trim() || null;
    const paletteId = `${formData.get("paletteId") ?? ""}`.trim() || null;

    const imageFiles = formData
      .getAll("images")
      .filter((item): item is File => item instanceof File)
      .slice(0, MAX_IMAGES);

    for (const image of imageFiles) {
      if (!IMAGE_TYPES.has(image.type)) {
        return jsonError("VALIDATION_ERROR", `不支持的图片格式: ${image.name}`, 400);
      }
      if (image.size <= 0 || image.size > MAX_IMAGE_SIZE) {
        return jsonError("VALIDATION_ERROR", `图片超出 5MB 限制: ${image.name}`, 400);
      }
    }

    const bucket = process.env.WECHAT_EDITOR_STORAGE_BUCKET || "pdfs";

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const run = async () => {
          try {
            controller.enqueue(sseEvent(encoder, { step: "parsing", message: "正在解析文稿...", progress: 10 }));
            const parsed = await parseDocxBuffer(Buffer.from(await docx.arrayBuffer()));

            if (parsed.paragraphs.length === 0) {
              throw new Error("文稿未解析到有效段落，请检查 Word 内容后重试");
            }

            const imageUrls: string[] = [];
            const imagesForAnalysis: Array<{ base64: string; mediaType: string }> = [];

            if (imageFiles.length > 0) {
              controller.enqueue(sseEvent(encoder, { step: "ocr", message: "正在上传图片...", progress: 25 }));
              const uploadedImages = await Promise.all(
                imageFiles.map(async (file, index) => {
                  const fileBuffer = Buffer.from(await file.arrayBuffer());
                  const base64 = fileBuffer.toString("base64");
                  const url = useLocalImages
                    ? `data:${file.type};base64,${base64}`
                    : await uploadImageAndGetUrl({ teacherId, file, bucket });
                  return {
                    index,
                    url,
                    base64,
                    mediaType: file.type,
                  };
                }),
              );

              uploadedImages
                .sort((a, b) => a.index - b.index)
                .forEach((item) => {
                  imageUrls.push(item.url);
                  imagesForAnalysis.push({
                    base64: item.base64,
                    mediaType: item.mediaType,
                  });
                });

              controller.enqueue(
                sseEvent(encoder, {
                  step: "ocr",
                  message: `已完成 ${imageFiles.length} 张图片预处理`,
                  progress: 50,
                }),
              );
            }

            let imageAnalyses: ImageAnalysis[] = [];
            if (imagesForAnalysis.length > 0) {
              controller.enqueue(sseEvent(encoder, { step: "ocr", message: "正在识别图片内容...", progress: 55 }));
              try {
                imageAnalyses = await analyzeImages(imagesForAnalysis);
              } catch {
                imageAnalyses = imageUrls.map((_, index) => ({
                  imageIndex: index,
                  description: `图片 ${index + 1}`,
                  category: "photo",
                  keywords: ["图片"],
                  suggestedCaption: `配图 ${index + 1}`,
                  textContent: "",
                }));
              }
            }

            controller.enqueue(sseEvent(encoder, { step: "layout", message: "AI 正在分析图文对应关系...", progress: 75 }));

            let layout: LayoutInstruction;
            try {
              layout = await generateLayout(parsed.paragraphs, imageAnalyses, style);
              console.log("[layout] AI 排版成功，blocks:", layout.blocks.length, "headings:", layout.blocks.filter(b => b.type === "heading").length);
            } catch (layoutError) {
              console.error("[layout] AI 排版失败，使用 fallback:", layoutError instanceof Error ? layoutError.message : layoutError);
              layout = fallbackLayout(parsed.paragraphs, imageUrls);
            }

            let html = layoutToHtml(layout, imageUrls);

            if (templateId) {
              let template = null;
              try {
                template = await getWechatTemplateByIdFromCloud(templateId);
              } catch (templateError) {
                console.error(
                  "[layout] 拉取模板失败，回退为基础排版",
                  templateError instanceof Error ? templateError.message : templateError,
                );
              }
              if (template) {
                const outline = layoutToOutline(layout, imageUrls);
                const palette = getPaletteById(paletteId);
                html = renderOutlineWithTemplate({
                  outline,
                  template,
                  palette,
                });
              }
            }

            controller.enqueue(sseEvent(encoder, { step: "done", message: "排版完成", progress: 100, html }));
            controller.close();
          } catch (error) {
            controller.enqueue(
              sseEvent(encoder, {
                step: "error",
                message: "排版失败",
                error: error instanceof Error ? error.message : "未知错误",
              }),
            );
            controller.close();
          }
        };

        void run();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "排版参数不合法", 400, error.flatten());
    }

    console.error("wechat layout api failed", error);
    return jsonError("INTERNAL_ERROR", "AI 排版失败", 500);
  }
}
