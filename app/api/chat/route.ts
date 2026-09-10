import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { isStructuredAgentStreamResponse } from "@/lib/api/ui-message-stream";
import { createLegacyAssistantSseStream } from "@/lib/assistant/chat-compat-stream";
import { POST as handleAgentChatPost } from "@/app/api/agent/chat/route";

export const maxDuration = 60;

const requestSchema = z.object({
  message: z.string().trim().min(1).max(12000),
  conversationId: z.string().uuid().optional(),
});

function buildPassthroughResponseHeaders(headers: Headers) {
  const forwarded: Record<string, string> = {};
  for (const [name, value] of headers.entries()) {
    const normalized = name.toLowerCase();
    if (normalized === "server-timing" || normalized.startsWith("x-quota-")) {
      forwarded[name] = value;
    }
  }
  return forwarded;
}

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await parseJsonBody(request));
    const upstream = await handleAgentChatPost(
      new Request(new URL("/api/agent/chat", request.url), {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: body.message,
          displayMessage: body.message,
          conversationId: body.conversationId,
        }),
      }),
    );

    if (!upstream.ok || !isStructuredAgentStreamResponse(upstream)) {
      return new NextResponse(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type":
            upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
          ...buildPassthroughResponseHeaders(upstream.headers),
        },
      });
    }

    const legacySseStream = createLegacyAssistantSseStream({
      upstreamResponse: upstream,
      fallbackConversationId: body.conversationId,
    });

    return new NextResponse(legacySseStream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        ...buildPassthroughResponseHeaders(upstream.headers),
      },
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }

    console.error("对话请求失败", error);
    return jsonError("INTERNAL_ERROR", "对话请求失败", 500);
  }
}
