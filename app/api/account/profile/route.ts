import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { accountProfileFormSchema } from "@/lib/auth/forms";
import { getAuthDisplayName, getAuthInitials, getAuthSchoolName } from "@/lib/auth/profile";
import { clampOnboardingStep } from "@/lib/auth/onboarding";

function buildUnauthorizedMessage(authBypass: boolean, errorMessage?: string, errorStatus?: number) {
  return jsonError(
    "UNAUTHORIZED",
    errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
    errorStatus ?? (authBypass ? 400 : 401),
  );
}

async function fetchTeacherProfileRecord(supabase: Awaited<ReturnType<typeof getTeacherContext>>["supabase"], teacherId: string) {
  const legacySelect =
    "id,full_name,display_name,school_name,avatar_url,created_at,updated_at";
  const currentSelect = `${legacySelect},role_title,teaching_subjects,onboarding_step,onboarding_completed_at`;

  const current = await supabase
    .from("teachers")
    .select(currentSelect)
    .eq("id", teacherId)
    .maybeSingle();

  if (current.error?.code !== "42703") {
    return current;
  }

  return await supabase
    .from("teachers")
    .select(legacySelect)
    .eq("id", teacherId)
    .maybeSingle();
}

type TeacherProfileRecord = Partial<{
  id: string;
  full_name: string | null;
  display_name: string | null;
  school_name: string | null;
  role_title: string | null;
  teaching_subjects: string[];
  onboarding_step: number | null;
  onboarding_completed_at: string | null;
  avatar_url: string | null;
  created_at: string | null;
  updated_at: string | null;
}>;

async function fetchTeacherDisplayNumbers(
  supabase: Awaited<ReturnType<typeof getTeacherContext>>["supabase"],
  teacherId: string,
  teacherRecord: TeacherProfileRecord | null,
) {
  const createdAt = teacherRecord?.created_at;
  if (!createdAt) {
    return {
      globalNumber: null,
      schoolNumber: null,
    };
  }

  const orderingFilter = `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lte.${teacherId})`;

  const globalPromise = supabase
    .from("teachers")
    .select("id", { count: "exact", head: true })
    .or(orderingFilter);

  const schoolName = teacherRecord?.school_name?.trim() || null;
  const schoolPromise = schoolName
    ? supabase
        .from("teachers")
        .select("id", { count: "exact", head: true })
        .eq("school_name", schoolName)
        .or(orderingFilter)
    : Promise.resolve({ count: null, error: null });

  const [globalResult, schoolResult] = await Promise.all([globalPromise, schoolPromise]);

  if (globalResult.error) {
    console.error("读取 global_number 失败", globalResult.error);
  }

  if (schoolResult.error) {
    console.error("读取 school_number 失败", schoolResult.error);
  }

  return {
    globalNumber: globalResult.error ? null : globalResult.count ?? null,
    schoolNumber: schoolResult.error ? null : schoolResult.count ?? null,
  };
}

export async function GET() {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return buildUnauthorizedMessage(authBypass, errorMessage, errorStatus);
  }

  try {
    const [
      {
        data: { user },
      },
      { data: teacher, error: teacherError },
    ] = await Promise.all([
      supabase.auth.getUser(),
      fetchTeacherProfileRecord(supabase, teacherId),
    ]);

    if (teacherError) {
      console.error("读取教师账户资料失败", teacherError);
      return jsonError("INTERNAL_ERROR", "读取教师账户资料失败", 500);
    }
    const teacherRecord = (teacher ?? null) as TeacherProfileRecord | null;

    const displayName =
      teacherRecord?.display_name?.trim() ||
      teacherRecord?.full_name?.trim() ||
      getAuthDisplayName({
        email: user?.email ?? null,
        metadata: user?.user_metadata,
      });

    const schoolName =
      teacherRecord?.school_name?.trim() ||
      getAuthSchoolName(user?.user_metadata) ||
      null;
    const displayNumbers = await fetchTeacherDisplayNumbers(
      supabase,
      teacherId,
      teacherRecord,
    );

    return NextResponse.json({
      profile: {
        id: teacherId,
        fullName: teacherRecord?.full_name?.trim() || displayName,
        displayName,
        schoolName,
        roleTitle: teacherRecord?.role_title?.trim() || null,
        teachingSubjects: Array.isArray(teacherRecord?.teaching_subjects) ? teacherRecord.teaching_subjects : [],
        onboardingStep: clampOnboardingStep(
          teacherRecord?.onboarding_step ?? null,
        ),
        onboardingCompletedAt: teacherRecord?.onboarding_completed_at ?? null,
        avatarUrl: teacherRecord?.avatar_url ?? null,
        email: user?.email ?? null,
        emailConfirmed: Boolean(user?.email_confirmed_at),
        emailConfirmedAt: user?.email_confirmed_at ?? null,
        initials: getAuthInitials(displayName, user?.email ?? null),
        globalNumber: displayNumbers.globalNumber,
        schoolNumber: displayNumbers.schoolNumber,
        createdAt: teacherRecord?.created_at ?? null,
        updatedAt: teacherRecord?.updated_at ?? null,
      },
    });
  } catch (error) {
    console.error("获取账户资料失败", error);
    return jsonError("INTERNAL_ERROR", "获取账户资料失败", 500);
  }
}

export async function PATCH(request: Request) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return buildUnauthorizedMessage(authBypass, errorMessage, errorStatus);
  }

  try {
    const body = accountProfileFormSchema.parse(await parseJsonBody(request));
    const { data, error } = await supabase
      .from("teachers")
      .update({
        full_name: body.fullName,
        display_name: body.fullName,
        school_name: body.schoolName || null,
        role_title: body.roleTitle || null,
        teaching_subjects: body.teachingSubjects,
      })
      .eq("id", teacherId)
      .select("id,full_name,display_name,school_name,role_title,teaching_subjects,onboarding_step,onboarding_completed_at,avatar_url,created_at,updated_at")
      .single();

    if (error) {
      console.error("更新教师资料失败", error);
      return jsonError("DB_WRITE_FAILED", "更新教师资料失败", 500);
    }

    return NextResponse.json({
      profile: {
        id: data.id,
        fullName: data.full_name,
        displayName: data.display_name,
        schoolName: data.school_name,
        roleTitle: data.role_title,
        teachingSubjects: data.teaching_subjects,
        onboardingStep: clampOnboardingStep(data.onboarding_step),
        onboardingCompletedAt: data.onboarding_completed_at,
        avatarUrl: data.avatar_url,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "账户资料参数不合法", 400, error.flatten());
    }
    console.error("账户资料更新失败", error);
    return jsonError("INTERNAL_ERROR", "账户资料更新失败", 500);
  }
}
