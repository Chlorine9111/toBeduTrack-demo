import { NextResponse } from "next/server";
import { getLessonPlanContext } from "@/lib/lesson-plan/context";
import { jsonError } from "@/lib/api/response";
import { getWechatTemplateByIdFromCloud } from "@/lib/wechat-editor/template-repository";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const contextResult = await getLessonPlanContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  const params = await context.params;
  try {
    const template = await getWechatTemplateByIdFromCloud(params.id);
    if (!template) {
      return jsonError("NOT_FOUND", "模板不存在", 404);
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error("加载模板详情失败", error);
    return jsonError("INTERNAL_ERROR", "加载模板详情失败", 500);
  }
}
