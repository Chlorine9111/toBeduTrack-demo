import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { buildQuotaHeaders } from "@/lib/quota/headers";
import { getQuotaSummarySafe } from "@/lib/quota/service";

export async function GET() {
  const context = await getTeacherContext();
  if (!context.teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      context.errorMessage ??
        (context.authBypass ? "未找到可用教师账号" : "未授权访问"),
      context.errorStatus ?? (context.authBypass ? 400 : 401),
    );
  }

  const summary = await getQuotaSummarySafe(context.supabase, context.teacherId);
  if (!summary) {
    return jsonError("SERVICE_UNAVAILABLE", "测试期使用量暂时不可用", 503);
  }

  return NextResponse.json(
    {
      summary,
    },
    {
      headers: buildQuotaHeaders(summary, { snapshot: "summary" }),
    },
  );
}
