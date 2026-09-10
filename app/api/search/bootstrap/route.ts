import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { listGlobalSearchBootstrap } from "@/lib/search/global-search";

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
    const items = await listGlobalSearchBootstrap({
      supabase,
      teacherId,
    });

    return NextResponse.json({
      items,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("读取全局搜索索引失败", error);
    return jsonError("INTERNAL_ERROR", "读取全局搜索索引失败", 500);
  }
}
