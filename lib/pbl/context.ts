import type { SupabaseClient } from "@supabase/supabase-js";
import { getTeacherContext } from "@/lib/api/teacher-context";
import type { Database } from "@/types/database";

export type PblContext = {
  teacherId: string;
  supabase: SupabaseClient<Database> | null;
  isMock: boolean;
};

export type PblContextError = {
  status: number;
  message: string;
};

const E2E_TEACHER_ID = "00000000-0000-4000-8000-000000000001";

export async function getPblContext(): Promise<
  | { ok: true; value: PblContext }
  | { ok: false; error: PblContextError }
> {
  if (process.env.E2E_TEST === "1") {
    return {
      ok: true,
      value: {
        teacherId: E2E_TEACHER_ID,
        supabase: null,
        isMock: true,
      },
    };
  }

  const context = await getTeacherContext();

  if (!context.teacherId) {
    return {
      ok: false,
      error: {
        status: context.errorStatus ?? (context.authBypass ? 400 : 401),
        message: context.errorMessage ?? (context.authBypass ? "未找到可用教师账号" : "未授权访问"),
      },
    };
  }

  return {
    ok: true,
    value: {
      teacherId: context.teacherId,
      supabase: context.supabase,
      isMock: false,
    },
  };
}
