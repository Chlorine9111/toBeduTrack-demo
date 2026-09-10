import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";
import {
  onboardingBasicInfoFormSchema,
  onboardingSubjectsFormSchema,
} from "@/lib/auth/forms";
import {
  clampOnboardingStep,
  resolveOnboardingPath,
} from "@/lib/auth/onboarding";

const onboardingUpdateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("basic_info"),
    data: onboardingBasicInfoFormSchema,
  }),
  z.object({
    action: z.literal("subjects"),
    data: onboardingSubjectsFormSchema,
  }),
  z.object({
    action: z.literal("complete"),
  }),
]);

function buildUnauthorizedMessage(authBypass: boolean, errorMessage?: string, errorStatus?: number) {
  return jsonError(
    "UNAUTHORIZED",
    errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
    errorStatus ?? (authBypass ? 400 : 401),
  );
}

export async function GET() {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return buildUnauthorizedMessage(authBypass, errorMessage, errorStatus);
  }

  try {
    const { data, error } = await supabase
      .from("teachers")
      .select("id,full_name,display_name,school_name,role_title,teaching_subjects,onboarding_step,onboarding_completed_at")
      .eq("id", teacherId)
      .single();

    if (error) {
      console.error("读取 onboarding 状态失败", error);
      return jsonError("INTERNAL_ERROR", "读取 onboarding 状态失败", 500);
    }

    return NextResponse.json({
      profile: {
        id: data.id,
        fullName: data.full_name ?? data.display_name ?? "",
        schoolName: data.school_name ?? "",
        roleTitle: data.role_title ?? "",
        teachingSubjects: data.teaching_subjects ?? [],
        onboardingStep: clampOnboardingStep(data.onboarding_step),
        onboardingCompletedAt: data.onboarding_completed_at,
        nextRoute: resolveOnboardingPath({
          onboardingStep: data.onboarding_step,
          onboardingCompletedAt: data.onboarding_completed_at,
        }),
      },
    });
  } catch (error) {
    console.error("读取 onboarding 状态失败", error);
    return jsonError("INTERNAL_ERROR", "读取 onboarding 状态失败", 500);
  }
}

export async function PATCH(request: Request) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return buildUnauthorizedMessage(authBypass, errorMessage, errorStatus);
  }

  try {
    const body = onboardingUpdateSchema.parse(await parseJsonBody(request));

    const {
      data: current,
      error: currentError,
    } = await supabase
      .from("teachers")
      .select("onboarding_step,onboarding_completed_at")
      .eq("id", teacherId)
      .single();

    if (currentError) {
      console.error("读取当前 onboarding 状态失败", currentError);
      return jsonError("INTERNAL_ERROR", "读取当前 onboarding 状态失败", 500);
    }

    const currentStep = clampOnboardingStep(current.onboarding_step);

    const updatePayload: {
      full_name?: string | null;
      display_name?: string | null;
      school_name?: string | null;
      role_title?: string | null;
      teaching_subjects?: string[];
      onboarding_step?: number;
      onboarding_completed_at?: string | null;
    } = {};

    if (body.action === "basic_info") {
      updatePayload.full_name = body.data.fullName;
      updatePayload.display_name = body.data.fullName;
      updatePayload.school_name = body.data.schoolName || null;
      updatePayload.role_title = body.data.roleTitle || null;
      updatePayload.onboarding_step = Math.max(currentStep, 1);
    }

    if (body.action === "subjects") {
      updatePayload.teaching_subjects = body.data.teachingSubjects;
      updatePayload.onboarding_step = Math.max(currentStep, 2);
    }

    if (body.action === "complete") {
      updatePayload.onboarding_step = 3;
      updatePayload.onboarding_completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("teachers")
      .update(updatePayload)
      .eq("id", teacherId)
      .select("id,full_name,display_name,school_name,role_title,teaching_subjects,onboarding_step,onboarding_completed_at")
      .single();

    if (error) {
      console.error("更新 onboarding 状态失败", error);
      return jsonError("DB_WRITE_FAILED", "更新 onboarding 状态失败", 500);
    }

    return NextResponse.json({
      profile: {
        id: data.id,
        fullName: data.full_name ?? data.display_name ?? "",
        schoolName: data.school_name ?? "",
        roleTitle: data.role_title ?? "",
        teachingSubjects: data.teaching_subjects ?? [],
        onboardingStep: clampOnboardingStep(data.onboarding_step),
        onboardingCompletedAt: data.onboarding_completed_at,
        nextRoute: resolveOnboardingPath({
          onboardingStep: data.onboarding_step,
          onboardingCompletedAt: data.onboarding_completed_at,
        }),
      },
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "onboarding 参数不合法", 400, error.flatten());
    }
    console.error("更新 onboarding 状态失败", error);
    return jsonError("INTERNAL_ERROR", "更新 onboarding 状态失败", 500);
  }
}
