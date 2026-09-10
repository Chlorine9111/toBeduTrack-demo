import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import {
  addConversationMessage,
  createConversation,
  getConversation,
  listConversations,
  summarizeConversationTitle,
} from "@/lib/assistant/store";
import type { Json } from "@/types/database";

const persistMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().trim().min(1).max(20000),
  sources: z.unknown().optional(),
});

const createConversationSchema = z.object({
  conversationId: z.string().uuid().optional(),
  title: z.string().trim().max(120).optional(),
  messages: z.array(persistMessageSchema).max(20).optional(),
});

export async function GET() {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  try {
    const conversations = await listConversations(supabase, teacherId);
    return NextResponse.json({
      conversations,
      total: conversations.length,
    });
  } catch (error) {
    console.error("获取对话列表失败", error);
    return jsonError("INTERNAL_ERROR", "获取对话列表失败", 500);
  }
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
    const body = createConversationSchema.parse(await parseJsonBody(request));

    let conversation = body.conversationId
      ? await getConversation(supabase, teacherId, body.conversationId)
      : null;

    if (!conversation && body.conversationId) {
      return jsonError("NOT_FOUND", "对话不存在", 404);
    }

    if (!conversation) {
      const fallbackTitle =
        body.title ||
        summarizeConversationTitle(body.messages?.[0]?.content ?? "") ||
        "新对话";
      conversation = await createConversation(supabase, teacherId, fallbackTitle);
    }

    const persistedMessages = [];
    for (const message of body.messages ?? []) {
      const persisted = await addConversationMessage(supabase, {
        teacherId,
        conversationId: conversation.id,
        role: message.role,
        content: message.content,
        sources: (message.sources ?? []) as Json,
      });
      persistedMessages.push(persisted);
    }

    return NextResponse.json({
      conversation,
      messages: persistedMessages,
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", error.message, 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }

    console.error("创建或追加对话失败", error);
    return jsonError("INTERNAL_ERROR", "创建或追加对话失败", 500);
  }
}
