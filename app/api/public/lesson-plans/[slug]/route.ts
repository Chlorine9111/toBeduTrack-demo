import { z } from "zod";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getPublicLessonPlanBySlug } from "@/lib/lesson-plan/store";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const paramsSchema = z.object({
  slug: z.string().min(4).max(64),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return jsonError("VALIDATION_ERROR", "链接参数不合法", 400);
  }

  try {
    const isMock = process.env.E2E_TEST === "1";
    const supabase = isMock ? null : await createServerSupabaseClient();

    const lessonPlan = await getPublicLessonPlanBySlug(
      { isMock, supabase },
      parsedParams.data.slug,
    );

    if (!lessonPlan) {
      return jsonError("NOT_FOUND", "教案不存在或未发布", 404);
    }

    return NextResponse.json({ lessonPlan });
  } catch (error) {
    console.error("读取公开教案失败", error);
    return jsonError("INTERNAL_ERROR", "读取公开教案失败", 500);
  }
}
