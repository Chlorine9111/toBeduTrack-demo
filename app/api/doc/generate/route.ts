import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/response";
import { generateDocumentModel } from "@/lib/doc-engine/generate";
import { docGenerateRequestSchema } from "@/lib/doc-engine/request-schema";

export const maxDuration = 30;

function sendLine(controller: ReadableStreamDefaultController<Uint8Array>, payload: unknown) {
  controller.enqueue(new TextEncoder().encode(`${JSON.stringify(payload)}\n`));
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  try {
    const rawBody = await parseJsonBody<unknown>(request);
    const body = docGenerateRequestSchema.parse(rawBody);

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          sendLine(controller, {
            type: "meta",
            document: {
              id: "",
              type: body.documentType,
              title: body.sourcePrompt.slice(0, 48),
              meta: {},
              layoutConfig: {
                pageSize: body.preferences?.pageSize ?? "A4",
                columns: body.preferences?.columns ?? 1,
              },
            },
          });

          const document = await generateDocumentModel({
            request: body,
            supabase,
          });

          sendLine(controller, {
            type: "meta",
            document: {
              id: document.id,
              type: document.type,
              title: document.title,
              meta: document.meta,
              layoutConfig: document.layoutConfig,
            },
          });

          const total = document.blocks.length;
          for (const [index, block] of document.blocks.entries()) {
            sendLine(controller, {
              type: "block",
              block,
            });
            sendLine(controller, {
              type: "progress",
              blocksGenerated: index + 1,
              estimatedTotal: total,
            });
            if (total > 1) {
              await sleep(24);
            }
          }

          sendLine(controller, {
            type: "complete",
            documentId: document.id,
          });
        } catch (error) {
          sendLine(controller, {
            type: "error",
            message:
              error instanceof Error && error.message.trim()
                ? error.message
                : "文档生成失败",
            partial: false,
          });
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是合法 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }
    return jsonErrorFromUnknown(error, "文档生成失败", 500);
  }
}
