import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { deleteConversation, getConversation, listConversationMessages, updateConversationTitle } from "@/lib/assistant/store";
import { parseJsonBody, InvalidJsonBodyError } from "@/lib/api/request";
import { uuidSchema } from "@/lib/validation/api";

const patchBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  const params = await context.params;
  if (!uuidSchema.safeParse(params.id).success) {
    return jsonError("VALIDATION_ERROR", "对话 ID 不合法", 400);
  }

  try {
    const [conversation, messages] = await Promise.all([
      getConversation(supabase, teacherId, params.id),
      listConversationMessages(supabase, teacherId, params.id),
    ]);
    if (!conversation) {
      return jsonError("NOT_FOUND", "对话不存在", 404);
    }

    return NextResponse.json({ conversation, messages });
  } catch (error) {
    console.error("读取对话详情失败", error);
    return jsonError("INTERNAL_ERROR", "读取对话详情失败", 500);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  const params = await context.params;
  if (!uuidSchema.safeParse(params.id).success) {
    return jsonError("VALIDATION_ERROR", "对话 ID 不合法", 400);
  }

  try {
    const body = patchBodySchema.parse(await parseJsonBody<unknown>(request));
    const normalized = await updateConversationTitle(supabase, teacherId, params.id, body.title);
    return NextResponse.json({ success: true, title: normalized });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是合法 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "标题不合法", 400);
    }
    console.error("重命名对话失败", error);
    return jsonError("INTERNAL_ERROR", "重命名对话失败", 500);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  const params = await context.params;
  if (!uuidSchema.safeParse(params.id).success) {
    return jsonError("VALIDATION_ERROR", "对话 ID 不合法", 400);
  }

  try {
    const deleted = await deleteConversation(supabase, teacherId, params.id);
    if (!deleted) {
      return jsonError("NOT_FOUND", "对话不存在", 404);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除对话失败", error);
    return jsonError("INTERNAL_ERROR", "删除对话失败", 500);
  }
}
