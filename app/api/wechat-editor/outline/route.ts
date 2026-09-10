export const maxDuration = 60;

import { NextRequest } from "next/server";
import { z } from "zod";
import { getLessonPlanContext } from "@/lib/lesson-plan/context";
import { jsonError } from "@/lib/api/response";
import { parseDocxBuffer } from "@/lib/wechat-editor/docx-parser";
import {
  buildOutlineFromText,
  buildOutlineWithMode,
  streamGenerateText,
} from "@/lib/wechat-editor/outline-parser";
import type { ImportMode } from "@/lib/wechat-editor/types";

const bodySchema = z.object({
  mode: z.enum(["smart", "ai", "generate"]),
  text: z.string().optional().default(""),
  tone: z.string().optional(),
  paragraphCount: z.number().int().min(4).max(12).optional(),
});

function sseEvent(encoder: TextEncoder, payload: unknown) {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

async function extractTextFromFile(file: File) {
  if (file.name.toLowerCase().endsWith(".docx")) {
    const parsed = await parseDocxBuffer(Buffer.from(await file.arrayBuffer()));
    return parsed.paragraphs.map(p => p.text).join("\n\n");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return buffer.toString("utf-8");
}

async function parseRequest(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const mode = `${formData.get("mode") ?? "smart"}` as ImportMode;
    const text = `${formData.get("text") ?? ""}`;
    const tone = `${formData.get("tone") ?? ""}` || undefined;
    const paragraphCountRaw = Number(formData.get("paragraphCount") ?? 0);
    const paragraphCount = Number.isFinite(paragraphCountRaw) && paragraphCountRaw > 0
      ? paragraphCountRaw
      : undefined;
    const file = formData.get("file");

    const fileText = file instanceof File ? await extractTextFromFile(file) : "";

    return bodySchema.parse({
      mode,
      text: [text, fileText].filter(Boolean).join("\n\n"),
      tone,
      paragraphCount,
    });
  }

  const jsonBody = await request.json().catch(() => ({}));
  return bodySchema.parse(jsonBody);
}

export async function POST(request: NextRequest) {
  const contextResult = await getLessonPlanContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  try {
    const payload = await parseRequest(request);
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const run = async () => {
          try {
            if (payload.mode === "ai" || payload.mode === "generate") {
              controller.enqueue(
                sseEvent(encoder, {
                  step: "generating",
                  message: "AI 正在撰写文章...",
                  progress: 10,
                }),
              );

              const generatedText = await streamGenerateText({
                text: payload.text,
                tone: payload.tone || "常规",
                paragraphCount: payload.paragraphCount ?? 6,
                mode: payload.mode,
                onTextChunk: (chunk) => {
                  controller.enqueue(
                    sseEvent(encoder, { step: "generating", textDelta: chunk }),
                  );
                },
              });

              controller.enqueue(
                sseEvent(encoder, {
                  step: "analyzing",
                  message: "正在分析文章结构...",
                  progress: 90,
                }),
              );

              const outline = buildOutlineFromText(generatedText);

              controller.enqueue(
                sseEvent(encoder, {
                  step: "done",
                  message: "大纲生成完成",
                  progress: 100,
                  outline,
                }),
              );
              controller.close();
              return;
            }

            controller.enqueue(
              sseEvent(encoder, {
                step: "parsing",
                message: "正在解析内容...",
                progress: 20,
              }),
            );

            controller.enqueue(
              sseEvent(encoder, {
                step: "analyzing",
                message: "AI 正在分析文章结构...",
                progress: 40,
              }),
            );

            const outline = await buildOutlineWithMode(payload);

            controller.enqueue(
              sseEvent(encoder, {
                step: "done",
                message: "大纲生成完成",
                progress: 100,
                outline,
              }),
            );
            controller.close();
          } catch (error) {
            controller.enqueue(
              sseEvent(encoder, {
                step: "error",
                message: "大纲生成失败",
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
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }

    console.error("生成大纲失败", error);
    return jsonError("INTERNAL_ERROR", "生成大纲失败", 500);
  }
}
