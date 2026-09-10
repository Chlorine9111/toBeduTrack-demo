import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";

const moduleTourEntrySchema = z.strictObject({
  completedAt: z.string().optional(),
  neverShow: z.boolean().optional(),
});

const patchTourStateSchema = z.strictObject({
  welcomeAnimationCompletedAt: z.string().nullable().optional(),
  sidebarTourCompletedAt: z.string().nullable().optional(),
  allToursDisabled: z.boolean().optional(),
  moduleTours: z
    .record(
      z.enum([
        "agent",
        "contentAssets",
        "questionBank",
        "builder",
        "split",
        "feedback",
        "canvas",
      ]),
      moduleTourEntrySchema,
    )
    .optional(),
});

export async function GET() {
  const { supabase, teacherId } = await getTeacherContext();
  if (!teacherId) {
    return jsonError("UNAUTHORIZED", "未授权访问", 401);
  }

  try {
    const { data, error } = await supabase
      .from("teachers")
      .select("product_tour_state,onboarding_completed_at")
      .eq("id", teacherId)
      .single();

    if (error) {
      console.error("读取 product tour 状态失败", error);
      return jsonError("INTERNAL_ERROR", "读取 product tour 状态失败", 500);
    }

    return NextResponse.json({
      tourState: data.product_tour_state ?? {},
      onboardingCompletedAt: data.onboarding_completed_at,
    });
  } catch (error) {
    console.error("读取 product tour 状态失败", error);
    return jsonError("INTERNAL_ERROR", "读取 product tour 状态失败", 500);
  }
}

export async function PATCH(request: Request) {
  const { supabase, teacherId } = await getTeacherContext();
  if (!teacherId) {
    return jsonError("UNAUTHORIZED", "未授权访问", 401);
  }

  try {
    const body = patchTourStateSchema.parse(await parseJsonBody(request));

    // 读取当前状态
    const { data: current, error: readError } = await supabase
      .from("teachers")
      .select("product_tour_state")
      .eq("id", teacherId)
      .single();

    if (readError) {
      console.error("读取当前 product tour 状态失败", readError);
      return jsonError(
        "INTERNAL_ERROR",
        "读取当前 product tour 状态失败",
        500,
      );
    }

    const currentState =
      (current.product_tour_state as Record<string, unknown>) ?? {};

    // 浅合并顶层字段 + 深合并 moduleTours
    const existingModuleTours =
      (currentState.moduleTours as Record<string, unknown>) ?? {};
    const incomingModuleTours = body.moduleTours ?? {};

    const mergedModuleTours: Record<string, unknown> = {
      ...existingModuleTours,
    };
    for (const [key, value] of Object.entries(incomingModuleTours)) {
      if (value !== undefined) {
        const existingEntry =
          (existingModuleTours[key] as Record<string, unknown>) ?? {};
        mergedModuleTours[key] = { ...existingEntry, ...value };
      }
    }

    const merged: Record<string, unknown> = {
      ...currentState,
      ...body,
      moduleTours: mergedModuleTours,
    };

    // 如果请求中没有传 moduleTours，且当前状态中也没有，则不写入空对象
    if (
      body.moduleTours === undefined &&
      currentState.moduleTours === undefined
    ) {
      delete merged.moduleTours;
    }

    const { data, error: writeError } = await supabase
      .from("teachers")
      .update({ product_tour_state: merged })
      .eq("id", teacherId)
      .select("product_tour_state,onboarding_completed_at")
      .single();

    if (writeError) {
      console.error("更新 product tour 状态失败", writeError);
      return jsonError("DB_WRITE_FAILED", "更新 product tour 状态失败", 500);
    }

    return NextResponse.json({
      tourState: data.product_tour_state ?? {},
      onboardingCompletedAt: data.onboarding_completed_at,
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError(
        "VALIDATION_ERROR",
        "product tour 参数不合法",
        400,
        error.flatten(),
      );
    }
    console.error("更新 product tour 状态失败", error);
    return jsonError("INTERNAL_ERROR", "更新 product tour 状态失败", 500);
  }
}
