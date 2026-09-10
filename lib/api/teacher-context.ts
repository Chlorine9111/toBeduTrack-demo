import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAuthBypassEnabled } from "@/lib/auth/bypass";
import { ensureTeacher, EnsureTeacherError } from "@/lib/teachers/ensure-teacher";
import type { Database } from "@/types/database";

export interface TeacherContext {
  supabase: SupabaseClient<Database>;
  user: User | null;
  teacherId: string | null;
  authBypass: boolean;
  errorMessage?: string;
  errorStatus?: number;
}

export interface TeacherIdentity {
  teacherId: string | null;
  authBypass: boolean;
  appMetadata?: Record<string, unknown> | null;
  errorMessage?: string;
  errorStatus?: number;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function coerceAppMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export async function getTeacherIdentity(): Promise<TeacherIdentity> {
  const authBypass = isAuthBypassEnabled();

  if (authBypass) {
    const teacherId = `${process.env.AUTH_BYPASS_USER_ID ?? ""}`.trim();
    if (!teacherId) {
      return {
        teacherId: null,
        authBypass: true,
        appMetadata: null,
        errorMessage: "AUTH_BYPASS_USER_ID 未配置",
        errorStatus: 500,
      };
    }

    if (!UUID_REGEX.test(teacherId)) {
      return {
        teacherId: null,
        authBypass: true,
        appMetadata: null,
        errorMessage: "AUTH_BYPASS_USER_ID 格式不合法",
        errorStatus: 500,
      };
    }

    return { teacherId, authBypass: true, appMetadata: null };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { teacherId: null, authBypass: false, appMetadata: null };
    }

    return {
      teacherId: user.id,
      authBypass: false,
      appMetadata: coerceAppMetadata(user.app_metadata),
    };
  }

  if (!claims?.sub || typeof claims.sub !== "string") {
    return { teacherId: null, authBypass: false, appMetadata: null };
  }

  return {
    teacherId: claims.sub,
    authBypass: false,
    appMetadata: coerceAppMetadata(claims.app_metadata),
  };
}

export async function getTeacherContext(): Promise<TeacherContext> {
  const authBypass = isAuthBypassEnabled();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !authBypass) {
    return { supabase, user: null, teacherId: null, authBypass: false };
  }

  try {
    const ensured = await ensureTeacher({
      supabase,
      user,
      authBypass,
    });
    return {
      supabase: ensured.supabase,
      user,
      teacherId: ensured.teacherId,
      authBypass: ensured.isBypass,
    };
  } catch (error) {
    if (error instanceof EnsureTeacherError) {
      return {
        supabase,
        user,
        teacherId: null,
        authBypass,
        errorMessage: error.message,
        errorStatus: error.status,
      };
    }
    throw error;
  }
}
