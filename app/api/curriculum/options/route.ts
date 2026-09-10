import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ensureTeacher, EnsureTeacherError } from "@/lib/teachers/ensure-teacher";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthBypassEnabled } from "@/lib/auth/bypass";

type CourseRow = {
  id: string;
  name: string;
  code: string;
};

type UnitRow = {
  id: string;
  course_id: string;
  unit_number: string;
  title: string;
};

type OptionsPayload = { courses: CourseRow[]; units: UnitRow[] };

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedOptions: { at: number; payload: OptionsPayload } | null = null;

function filterByCourseId(payload: OptionsPayload, courseId?: string | null): OptionsPayload {
  if (!courseId) return payload;
  return {
    courses: payload.courses,
    units: payload.units.filter((u) => u.course_id === courseId),
  };
}

export async function GET(request: Request) {
  const isE2E = process.env.E2E_TEST === "1";
  let supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  try {
    supabase = await createServerSupabaseClient();
  } catch (error) {
    if (isE2E) {
      console.warn("E2E 环境 Supabase 未就绪，课程选项降级为空数据", error);
      return NextResponse.json(
        {
          courses: [],
          units: [],
          warning: "E2E 环境 Supabase 未配置，已降级为空列表。",
        },
        {
          status: 200,
          headers: { "X-Deskmate-Cache": "empty" },
        },
      );
    }
    throw error;
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const authBypass = isAuthBypassEnabled() || isE2E;

  if (!user && !authBypass) {
    return jsonError("UNAUTHORIZED", "请先登录后再使用该功能。", 401);
  }

  let db = supabase;
  try {
    if (isE2E) {
      // E2E 无登录态时允许读取课程结构，优先使用 admin client 避免 RLS 干扰。
      if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        db = createAdminSupabaseClient();
      }
    } else {
      const ensured = await ensureTeacher({ supabase, user, authBypass });
      db = ensured.supabase;
    }
  } catch (error) {
    if (error instanceof EnsureTeacherError) {
      return jsonError("UNAUTHORIZED", error.message, error.status);
    }
    throw error;
  }

  try {
    const url = new URL(request.url);
    const courseId = url.searchParams.get("courseId");

    // Serve from a small in-memory cache to reduce transient cold-start failures.
    if (cachedOptions && Date.now() - cachedOptions.at < CACHE_TTL_MS) {
      return NextResponse.json(filterByCourseId(cachedOptions.payload, courseId), {
        headers: { "X-Deskmate-Cache": "hit" },
      });
    }

    const queryOptions = async (): Promise<OptionsPayload> => {
      const { data: courses, error: coursesError } = await db
        .from("courses")
        .select("id,name,code")
        .order("name", { ascending: true });

      if (coursesError) {
        throw coursesError;
      }

      const { data: units, error: unitsError } = await db
        .from("units")
        .select("id,course_id,unit_number,title")
        .order("unit_number", { ascending: true });

      if (unitsError) {
        throw unitsError;
      }

      return {
        courses: (courses ?? []) as CourseRow[],
        units: (units ?? []) as UnitRow[],
      };
    };

    let payload: OptionsPayload | null = null;
    try {
      payload = await queryOptions();
    } catch {
      // One quick retry smooths out Supabase cold-start flakiness.
      await new Promise((r) => setTimeout(r, 250));
      try {
        payload = await queryOptions();
      } catch (error) {
        if (cachedOptions) {
          return NextResponse.json(filterByCourseId(cachedOptions.payload, courseId), {
            headers: { "X-Deskmate-Cache": "stale" },
          });
        }
        console.error("读取课程选项失败，降级为空数据", error);
        return NextResponse.json(
          {
            courses: [],
            units: [],
            warning: "课程数据暂时不可用，已降级为空列表。",
          },
          {
            status: 200,
            headers: { "X-Deskmate-Cache": "empty" },
          },
        );
      }
    }

    cachedOptions = { at: Date.now(), payload };
    return NextResponse.json(filterByCourseId(payload, courseId), {
      headers: { "X-Deskmate-Cache": "miss" },
    });
  } catch (error) {
    console.error("读取课程选项失败，降级为空数据", error);
    return NextResponse.json(
      {
        courses: [],
        units: [],
        warning: "课程数据暂时不可用，已降级为空列表。",
      },
      {
        status: 200,
        headers: { "X-Deskmate-Cache": "empty" },
      },
    );
  }
}
