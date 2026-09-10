import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRouteActorAnyRole } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ensureTeacher, EnsureTeacherError } from "@/lib/teachers/ensure-teacher";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { isAuthBypassEnabled } from "@/lib/auth/bypass";
import { saveExercises } from "@/lib/exercises/save-service";

export async function POST(request: Request) {
  const access = await requireRouteActorAnyRole(["subject_teacher", "admin"], {
    nextPath: "/main/agent",
  });
  if (access.response) {
    return access.response;
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const authBypass = isAuthBypassEnabled();

  if (!user && !authBypass) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let teacherId = "";
  let db = supabase;
  try {
    const ensured = await ensureTeacher({ supabase, user, authBypass });
    teacherId = ensured.teacherId;
    db = ensured.supabase;
  } catch (error) {
    if (error instanceof EnsureTeacherError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  try {
    const rawBody = await parseJsonBody<Record<string, unknown>>(request);
    const result = await saveExercises({
      supabase: db,
      teacherId,
      request: rawBody,
    });

    return NextResponse.json({ ids: result.ids });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.flatten() },
        { status: 400 },
      );
    }

    console.error("Exercise save failed", error);
    return NextResponse.json(
      { error: "Failed to save exercises" },
      { status: 500 },
    );
  }
}
