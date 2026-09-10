import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { listKnowledgeDocuments } from "@/lib/assistant/store";

export async function GET(request: Request) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  try {
    const url = new URL(request.url);
    const subject = url.searchParams.get("subject") ?? undefined;
    const unit = url.searchParams.get("unit") ?? undefined;
    const tag = url.searchParams.get("tag") ?? undefined;
    const query = url.searchParams.get("q") ?? undefined;

    const documents = await listKnowledgeDocuments(supabase, {
      teacherId,
      subject,
      unit,
      tag,
      query,
    });

    return NextResponse.json({
      documents,
      total: documents.length,
    });
  } catch (error) {
    console.error("获取知识库文档失败", error);
    return jsonError("INTERNAL_ERROR", "获取知识库文档失败", 500);
  }
}
