import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { listAssetSummariesByIds } from "@/lib/content-assets/store";

export async function POST(request: Request) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } =
    await getTeacherContext();

  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body?.ids)
      ? body.ids.map((id: unknown) => `${id}`.trim()).filter(Boolean)
      : [];

    if (ids.length === 0) {
      return jsonError("VALIDATION_ERROR", "请提供需要查询的资产 ID", 400);
    }

    const items = await listAssetSummariesByIds({ teacherId, supabase }, ids);
    return Response.json(items, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[content-assets/status] POST 失败", error);
    return jsonError(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "读取资产状态失败",
      500,
    );
  }
}
