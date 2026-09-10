import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { rubricUpdateSchema, uuidSchema } from "@/lib/validation/api";
import { getRubricDetail } from "@/lib/rubric/queries";
import {
  removeRubricContentLibraryItem,
  syncRubricContentLibraryItem,
} from "@/lib/content-library/sync";
import { ensureTeacher, EnsureTeacherError } from "@/lib/teachers/ensure-teacher";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { isAuthBypassEnabled } from "@/lib/auth/bypass";

export async function PUT(
  request: Request,
  context: { params: Promise<{ rubricId: string }> },
) {
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

  const params = await context.params;
  const idParse = uuidSchema.safeParse(params.rubricId);
  if (!idParse.success) {
    return NextResponse.json({ error: "Invalid rubric id" }, { status: 400 });
  }

  let requestBody: z.infer<typeof rubricUpdateSchema>;
  try {
    requestBody = await parseJsonBody<z.infer<typeof rubricUpdateSchema>>(request);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    throw error;
  }

  const bodyParse = rubricUpdateSchema.safeParse(requestBody);

  if (!bodyParse.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: bodyParse.error.flatten() },
      { status: 400 },
    );
  }

  const { title, status, dimensions } = bodyParse.data;

  const { data: rpcData, error: rpcError } = await db.rpc(
    "update_rubric_with_dimensions",
    {
      p_rubric_id: params.rubricId,
      p_title: title ?? null,
      p_status: status ?? null,
      p_dimensions: dimensions ?? null,
      p_teacher_id: teacherId,
    },
  );

  if (rpcError || !rpcData) {
    if (rpcError?.message?.includes("rubric_not_found")) {
      return NextResponse.json({ error: "Rubric not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to update rubric" },
      { status: 500 },
    );
  }

  const detail = await getRubricDetail(params.rubricId, db, { teacherId });
  if (!detail) {
    return NextResponse.json(
      { error: "Rubric updated but could not be loaded" },
      { status: 500 },
    );
  }

  await syncRubricContentLibraryItem({
    supabase: db,
    teacherId,
    rubricId: detail.id,
  });

  return NextResponse.json({ rubric: detail });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ rubricId: string }> },
) {
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

  const params = await context.params;
  const idParse = uuidSchema.safeParse(params.rubricId);
  if (!idParse.success) {
    return NextResponse.json({ error: "Invalid rubric id" }, { status: 400 });
  }

  const { data, error } = await db
    .from("rubrics")
    .delete()
    .eq("id", params.rubricId)
    .eq("teacher_id", teacherId)
    .select("id");

  if (error) {
    return NextResponse.json(
      { error: "Failed to delete rubric" },
      { status: 500 },
    );
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Rubric not found" }, { status: 404 });
  }

  await removeRubricContentLibraryItem({
    supabase: db,
    teacherId,
    rubricId: params.rubricId,
  });

  return NextResponse.json({ success: true });
}
