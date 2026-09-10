/**
 * POST /api/ai/exercises/verify
 * Re-verifies existing exercises.
 */
import { NextResponse } from "next/server";
import { exerciseVerifyRequestSchema } from "@/lib/validation/api";
import type { ExerciseVerificationResult } from "@/types/exercise";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { verifyExercisesInBatch } from "@/lib/ai/exercise-validator";
import { ensureTeacher, EnsureTeacherError } from "@/lib/teachers/ensure-teacher";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { isAuthBypassEnabled } from "@/lib/auth/bypass";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";

function isExerciseAiConfigured() {
  try {
    getResolvedLanguageModelForTask("exercise_verify");
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  type RequestBody = z.infer<typeof exerciseVerifyRequestSchema>;
  type ResponseBody = { results: ExerciseVerificationResult[] };

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
    const normalizedBody = normalizeExerciseVerifyRequest(rawBody);
    const body = exerciseVerifyRequestSchema.parse(
      normalizedBody,
    ) as RequestBody;

    const requestedIds = body.exerciseIds;
    const uniqueIds = Array.from(new Set(requestedIds));
    if (uniqueIds.length !== requestedIds.length) {
      return NextResponse.json(
        { error: "Duplicate exercise IDs are not allowed" },
        { status: 400 },
      );
    }

    const { data: exercises, error } = await db
      .from("exercises")
      .select("*")
      .in("id", uniqueIds)
      .eq("teacher_id", teacherId);

    if (error) {
      console.error("Failed to load exercises", error);
      return NextResponse.json(
        { error: "Failed to load exercises" },
        { status: 500 },
      );
    }

    if (!exercises || exercises.length === 0) {
      return NextResponse.json(
        { error: "No exercises found for verification" },
        { status: 404 },
      );
    }

    const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
    const missingIds = requestedIds.filter((id) => !exerciseById.has(id));
    if (missingIds.length > 0) {
      return NextResponse.json(
        { error: "Exercises not found", missingIds },
        { status: 404 },
      );
    }

    const orderedExercises = requestedIds.map((id) => exerciseById.get(id)!);
    const mappedExercises =
      orderedExercises.map((exercise) => ({
        questionText: exercise.question_text,
        type: exercise.exercise_type,
        difficulty: exercise.difficulty,
        topicId: exercise.topic_id ?? "",
        options: exercise.options ?? undefined,
        correctAnswer: exercise.correct_answer,
        solutionSteps: exercise.solution_steps,
        commonMistakes: exercise.common_mistakes ?? [],
      })) ?? [];

    if (!isExerciseAiConfigured()) {
      return NextResponse.json({ error: "AI 服务未配置" }, { status: 503 });
    }

    const verificationResults = await verifyExercisesInBatch(mappedExercises);

    const updateResults = await Promise.all(
      verificationResults.map((result, index) => {
        const exercise = orderedExercises[index];
        const updatedStatus = result.isMatch ? "verified" : "manual_review";
        const updatedAttempts = (exercise.verification_attempts ?? 0) + 1;

        return db
          .from("exercises")
          .update({
            verification_status: updatedStatus,
            verification_attempts: updatedAttempts,
          })
          .eq("id", exercise.id)
          .eq("teacher_id", teacherId);
      }),
    );

    const updateError = updateResults.find((result) => result.error);
    if (updateError?.error) {
      console.error("Failed to update verification status", updateError.error);
      return NextResponse.json(
        { error: "Failed to update verification status" },
        { status: 500 },
      );
    }

    const response: ResponseBody = { results: verificationResults };
    return NextResponse.json(response);
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

    console.error("Exercise verification failed", error);
    return NextResponse.json(
      { error: "Failed to verify exercises" },
      { status: 500 },
    );
  }
}

function normalizeExerciseVerifyRequest(body: Record<string, unknown>) {
  return {
    exerciseIds: body.exerciseIds ?? body.exercise_ids,
  };
}
