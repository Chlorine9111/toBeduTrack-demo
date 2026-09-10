import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRouteActorAnyRole } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildExerciseContentFromLegacy,
  deriveLegacyExerciseFieldsFromContent,
  normalizeExerciseContent,
  normalizeExerciseContentForStorage,
} from "@/lib/exercises/content";
import { exerciseUpdateSchema, uuidSchema } from "@/lib/validation/api";
import { ensureTeacher, EnsureTeacherError } from "@/lib/teachers/ensure-teacher";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { isAuthBypassEnabled } from "@/lib/auth/bypass";
import {
  syncExerciseSemanticIndexRows,
} from "@/lib/question-bank/semantic-index";
import { deleteQuestionBankExercises } from "@/lib/question-bank/delete";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
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

  const params = await context.params;
  const idParse = uuidSchema.safeParse(params.id);
  if (!idParse.success) {
    return NextResponse.json({ error: "Invalid exercise id" }, { status: 400 });
  }

  try {
    const rawBody = await parseJsonBody<Record<string, unknown>>(request);
    const normalizedBody = normalizeExerciseUpdateRequest(rawBody);
    const body = exerciseUpdateSchema.parse(normalizedBody);
    const content = normalizeExerciseContentForStorage(normalizeExerciseContent(
      body.content ??
        buildExerciseContentFromLegacy({
          type: body.type,
          questionText: body.questionText ?? "",
          options: body.options ?? null,
          correctAnswer: body.correctAnswer ?? null,
          solutionSteps: body.solutionSteps ?? null,
          commonMistakes: body.commonMistakes ?? [],
        }),
    ));
    const derived = deriveLegacyExerciseFieldsFromContent(content);

    const { data, error } = await db
      .from("exercises")
      .update({
        content_json: content,
        question_text: derived.questionText,
        exercise_type: body.type,
        difficulty: body.difficulty,
        options: body.type === "MC" ? (derived.options ?? null) : null,
        correct_answer: derived.correctAnswer,
        solution_steps: derived.solutionSteps,
        common_mistakes: derived.commonMistakes,
        teacher_modified: true,
      })
      .eq("id", params.id)
      .eq("teacher_id", teacherId)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("Failed to update exercise", error);
      return NextResponse.json(
        { error: "Failed to update exercise" },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
    }

    await syncExerciseSemanticIndexRows({
      supabase: db,
      teacherId,
      exerciseIds: [data.id],
    });

    return NextResponse.json({ exercise: data });
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

    console.error("Exercise update failed", error);
    return NextResponse.json(
      { error: "Failed to update exercise" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
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

  const params = await context.params;
  const idParse = uuidSchema.safeParse(params.id);
  if (!idParse.success) {
    return NextResponse.json({ error: "Invalid exercise id" }, { status: 400 });
  }

  try {
    const result = await deleteQuestionBankExercises(
      {
        teacherId,
        supabase: db,
      },
      [params.id],
    );

    if (result.deletedIds.length === 0) {
      return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Exercise delete failed", error);
    return NextResponse.json(
      { error: "Failed to delete exercise" },
      { status: 500 },
    );
  }
}

function normalizeExerciseUpdateRequest(body: Record<string, unknown>) {
  return {
    questionText: body.questionText ?? body.question_text,
    type:
      body.type ??
      body.exerciseType ??
      body.exercise_type ??
      body.question_type,
    difficulty: body.difficulty,
    content: body.content ?? body.content_json ?? body.contentJson,
    options: body.options,
    correctAnswer: body.correctAnswer ?? body.correct_answer,
    solutionSteps: body.solutionSteps ?? body.solution_steps,
    commonMistakes: body.commonMistakes ?? body.common_mistakes,
  };
}
