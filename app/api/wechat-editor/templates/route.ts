import { NextResponse } from "next/server";
import { getLessonPlanContext } from "@/lib/lesson-plan/context";
import { jsonError } from "@/lib/api/response";
import { listWechatTemplatesFromCloud } from "@/lib/wechat-editor/template-repository";

export async function GET(request: Request) {
  const contextResult = await getLessonPlanContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  const url = new URL(request.url);
  const keyword = url.searchParams.get("keyword");
  const category = url.searchParams.get("category");
  const colorFamily = url.searchParams.get("colorFamily");
  const hasHero = (url.searchParams.get("hasHero") as "all" | "yes" | "no" | null) ?? "all";

  try {
    const { templates, categories } = await listWechatTemplatesFromCloud({
      keyword,
      category,
      colorFamily,
      hasHero,
    });

    return NextResponse.json({
      templates,
      categories,
    });
  } catch (error) {
    console.error("加载公众号模板失败", error);
    return jsonError("INTERNAL_ERROR", "加载模板库失败，请检查 Supabase 模板配置", 500);
  }
}
