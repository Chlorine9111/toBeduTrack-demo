/**
 * POST /api/ai/exercises/generate
 * Generates exercises via Kimi tool-use.
 */
import { NextResponse } from "next/server";
import { exerciseGenerateRequestSchema } from "@/lib/validation/api";
import type { ExerciseAIOutput, ExerciseDifficulty, ExerciseVerificationResult } from "@/types/exercise";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateExercises } from "@/lib/ai/exercise-generator";
import {
  getVerificationStrategy,
  regenerateOnFailure,
  runLocalExerciseRuleCheck,
} from "@/lib/ai/exercise-validator";
import {
  loadCourse,
  loadExerciseExamples,
  loadTopic,
  loadUnitWithTopics,
} from "@/lib/curriculum/loader";
import { ensureTeacher, EnsureTeacherError } from "@/lib/teachers/ensure-teacher";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";
import { buildRateLimitHeaders, consumeRateLimit } from "@/lib/api/rate-limit";
import { isAuthBypassEnabled } from "@/lib/auth/bypass";
import { autoArchiveGeneratedContent } from "@/lib/content-assets/auto-archive";
import { buildExercisePrompt, renderSystemPrompt } from "@/lib/ai/prompt-assembler";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import {
  buildQuotaExhaustedDetails,
  buildQuotaHeaders,
  mergeHeaders,
} from "@/lib/quota/headers";
import {
  checkQuotaAdmissionSafe,
  finalizeQuotaSpendSafe,
  resolveQuotaIdempotencyKey,
} from "@/lib/quota/service";

type GeneratedExercise = ExerciseAIOutput["exercises"][number] & {
  verificationStatus: ExerciseVerificationResult["status"];
  verificationAttempts: number;
};

type ExerciseGenerateResponseBody = {
  exercises: GeneratedExercise[];
};

function isExerciseAiConfigured() {
  try {
    getResolvedLanguageModelForTask("exercise_generate");
    return true;
  } catch {
    return false;
  }
}

function sendLine(controller: ReadableStreamDefaultController<Uint8Array>, payload: unknown) {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function applyRuleCheckStatus(
  exercise: ExerciseAIOutput["exercises"][number],
): GeneratedExercise {
  const checked = runLocalExerciseRuleCheck(exercise);
  return {
    ...exercise,
    verificationStatus: checked.valid ? "rule_checked" : "failed",
    verificationAttempts: 0,
  };
}

function createExerciseStreamResponse(
  exercises: GeneratedExercise[],
  headers?: HeadersInit,
) {
  const total = exercises.length;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        sendLine(controller, { type: "meta", total });
        for (const [index, exercise] of exercises.entries()) {
          sendLine(controller, {
            type: "exercise",
            index: index + 1,
            total,
            exercise,
          });
          // 让前端可感知逐题到达，而不是一次性渲染全部。
          if (total > 1) {
            await sleep(40);
          }
        }
        sendLine(controller, {
          type: "complete",
          total,
          exercises,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      ...(headers ?? {}),
    },
  });
}

function isStreamRequested(request: Request, body: Record<string, unknown>) {
  const streamValue = body.stream;
  if (streamValue === true || streamValue === "true") {
    return true;
  }
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("application/x-ndjson");
}

function resolveExerciseSystemTaskType(
  exerciseType: "MC" | "FR" | "MIXED" | "fill_in",
): "mc_exercise" | "fr_exercise" {
  return exerciseType === "MC" ? "mc_exercise" : "fr_exercise";
}

function buildGeneralExerciseContext(params: {
  topic?: string;
  subjectCategory?: string;
  gradeLevel?: string;
}) {
  const now = new Date().toISOString();
  const subject = params.subjectCategory?.trim() || "通用学科";
  const topicText = params.topic?.trim() || "自定义主题";
  const grade = params.gradeLevel?.trim() || "未指定年级";
  const courseId = `general-${subject.toLowerCase().replace(/\s+/g, "-")}`;
  const unitId = `${courseId}-unit-1`;
  const topicId = `${unitId}-topic-1`;
  return {
    course: {
      id: courseId,
      framework: "AP" as const,
      name: `${subject}（通用轨道）`,
      code: `GENERAL-${subject}`,
      description: `面向 ${grade} 的 ${topicText}`,
      createdAt: now,
      updatedAt: now,
    },
    unit: {
      id: unitId,
      courseId,
      unitNumber: "1",
      title: topicText,
      description: `${subject}主题单元`,
      createdAt: now,
      updatedAt: now,
    },
    topics: [
      {
        id: topicId,
        unitId,
        topicNumber: "1.1",
        title: topicText,
        learningObjectives: [
          {
            code: "GEN-LO1",
            description: `理解并应用主题「${topicText}」的核心概念`,
          },
        ],
        essentialKnowledge: [
          {
            code: "GEN-EK1",
            description: `能够围绕「${topicText}」完成基础分析与表达`,
          },
        ],
        mathPractices: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
    topicId,
  };
}

/**
 * Progressive streaming: launch N parallel single-exercise generations.
 * Each exercise is sent to the frontend immediately as it completes.
 * User sees first exercise in ~7s instead of waiting ~20s for all.
 */
function createProgressiveStreamResponse(
  generationInput: Omit<Parameters<typeof generateExercises>[0], "count">,
  count: number,
  headers?: HeadersInit,
  options?: {
    onComplete?: (payload: {
      exercises: GeneratedExercise[];
    }) => Promise<void> | void;
  },
) {
  const MAX_PARALLEL = 5;
  const verificationStrategy = getVerificationStrategy({
    difficulty: generationInput.difficulty,
    skipAll: process.env.EXERCISE_SKIP_VERIFY === "true",
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const completed: GeneratedExercise[] = [];
      let sentCount = 0;
      let prebuiltPrompt: { prompt: string; systemPrompt: string } | undefined;

      try {
        sendLine(controller, {
          type: "meta",
          total: count,
          verificationMode: verificationStrategy.mode,
        });

        try {
          const built = await buildExercisePrompt({
            ...generationInput,
            count: 1,
            requestCountHint: count,
          });
          const systemPrompt = await renderSystemPrompt(
            built.systemContext,
            resolveExerciseSystemTaskType(generationInput.exerciseType),
            {
              track: generationInput.track,
              subjectCategory: generationInput.subjectCategory,
            },
          );
          prebuiltPrompt = {
            prompt: built.prompt,
            systemPrompt,
          };
        } catch (error) {
          console.warn("Failed to prebuild exercise prompt for progressive stream", error);
        }

        for (let batchStart = 0; batchStart < count; batchStart += MAX_PARALLEL) {
          const batchSize = Math.min(MAX_PARALLEL, count - batchStart);

          const batchPromises = Array.from({ length: batchSize }, () =>
            Promise.resolve()
              .then(() =>
                generateExercises({
                  ...generationInput,
                  count: 1,
                  requestCountHint: count,
                  prebuiltPrompt,
                }),
              )
              .then((result) => {
                const exercise = result.exercises[0];
                if (!exercise) return;
                sentCount++;
                const generated: GeneratedExercise = verificationStrategy.shouldVerify
                  ? {
                      ...exercise,
                      verificationStatus: "pending",
                      verificationAttempts: 0,
                    }
                  : applyRuleCheckStatus(exercise);
                completed.push(generated);
                sendLine(controller, {
                  type: "exercise",
                  index: sentCount,
                  total: count,
                  exercise: generated,
                });
              })
              .catch((error) => {
                console.error("Progressive exercise generation failed", error);
              }),
          );

          await Promise.allSettled(batchPromises);
        }

        // Supplement: if some parallel calls failed, try one batch call for missing
        const missingCount = count - completed.length;
        if (missingCount > 0) {
          try {
            const supplement = await generateExercises({
              ...generationInput,
              count: missingCount,
              requestCountHint: count,
              prebuiltPrompt,
            });
            for (const exercise of supplement.exercises.slice(0, missingCount)) {
              sentCount++;
              const generated: GeneratedExercise = verificationStrategy.shouldVerify
                ? {
                    ...exercise,
                    verificationStatus: "pending",
                    verificationAttempts: 0,
                  }
                : applyRuleCheckStatus(exercise);
              completed.push(generated);
              sendLine(controller, {
                type: "exercise",
                index: sentCount,
                total: count,
                exercise: generated,
              });
            }
          } catch (supplementError) {
            console.error("Supplement exercise generation failed", supplementError);
          }
        }

        sendLine(controller, {
          type: "complete",
          total: completed.length,
          exercises: completed,
        });
        if (options?.onComplete) {
          try {
            await options.onComplete({ exercises: completed });
          } catch (error) {
            console.error("Exercise stream completion hook failed", error);
          }
        }
      } catch (error) {
        sendLine(controller, {
          type: "error",
          message: error instanceof Error ? error.message : "习题生成失败",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      ...(headers ?? {}),
    },
  });
}

export async function POST(request: Request) {
  type RequestBody = z.infer<typeof exerciseGenerateRequestSchema>;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const authBypass = isAuthBypassEnabled() || process.env.E2E_TEST === "1";

  if (!user && !authBypass) {
    return jsonError("UNAUTHORIZED", "Unauthorized", 401);
  }

  const rateLimit = consumeRateLimit({
    request,
    key: "ai-exercises-generate",
    // 正常已登录用户给足够高吞吐，不影响生产节奏；匿名/旁路环境收紧。
    limit: user && !authBypass ? 120 : 60,
    windowMs: 60_000,
    identifier: user?.id ?? undefined,
  });
  if (!rateLimit.allowed) {
    return jsonError(
      "RATE_LIMITED",
      "生成请求过于频繁，请稍后再试。",
      429,
      { retryAfterSec: rateLimit.retryAfterSec },
      buildRateLimitHeaders(rateLimit),
    );
  }

  const isE2E = process.env.E2E_TEST === "1";
  let db = supabase;
  let teacherId: string | null = user?.id ?? null;
  try {
    if (!isE2E) {
      const ensured = await ensureTeacher({ supabase, user, authBypass });
      db = ensured.supabase;
      teacherId = ensured.teacherId;
    }
  } catch (error) {
    if (error instanceof EnsureTeacherError) {
      return jsonError("UNAUTHORIZED", error.message, error.status, undefined, buildRateLimitHeaders(rateLimit));
    }
    throw error;
  }

  let rawBody: Record<string, unknown>;
  try {
    rawBody = await parseJsonBody<Record<string, unknown>>(request);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError(
        "VALIDATION_ERROR",
        "Invalid request body",
        400,
        undefined,
        buildRateLimitHeaders(rateLimit),
      );
    }
    throw error;
  }

  const streamRequested = isStreamRequested(request, rawBody);
  const normalizedBody = normalizeExerciseGenerateRequest(rawBody);
  const bodyParse = exerciseGenerateRequestSchema.safeParse(normalizedBody);
  if (!bodyParse.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid request",
      400,
      bodyParse.error.flatten(),
      buildRateLimitHeaders(rateLimit),
    );
  }
  const body = bodyParse.data as RequestBody;

  const quotaAdmission =
    !isE2E && teacherId
      ? await checkQuotaAdmissionSafe(db, {
          teacherId,
          action: "generate_exercises",
        })
      : null;
  if (quotaAdmission && !quotaAdmission.allowed) {
    return jsonError(
      "QUOTA_EXHAUSTED",
      "当前测试期使用量已达上限，请等待下个周期重置后继续。",
      403,
      buildQuotaExhaustedDetails(quotaAdmission),
      mergeHeaders(
        buildRateLimitHeaders(rateLimit),
        buildQuotaHeaders(quotaAdmission, { snapshot: "admission" }),
      ),
    );
  }
  const quotaIdempotencyKey =
    !isE2E && teacherId
      ? resolveQuotaIdempotencyKey(request, `exercise:${teacherId}`)
      : null;

  try {
    const track = body.track ?? "ap";
    const curriculumClient = isE2E ? undefined : db;

    let course: Awaited<ReturnType<typeof loadCourse>> = null;
    let unit: Awaited<ReturnType<typeof loadUnitWithTopics>>["unit"] = null;
    let topics: Awaited<ReturnType<typeof loadUnitWithTopics>>["topics"] = [];
    let selectedTopic: Awaited<ReturnType<typeof loadTopic>> = null;
    let generationCourseId = body.courseId ?? "";
    let generationUnitId = body.unitId ?? "";
    let generationTopicId = body.topicId;

    if (track === "ap") {
      const [courseResult, unitResult, topicResult] = await Promise.all([
        loadCourse(body.courseId!, curriculumClient),
        loadUnitWithTopics(body.unitId!, curriculumClient),
        body.topicId ? loadTopic(body.topicId, curriculumClient) : Promise.resolve(null),
      ]);

      course = courseResult;
      if (!course) {
        return jsonError("NOT_FOUND", "Course not found", 404, undefined, buildRateLimitHeaders(rateLimit));
      }

      unit = unitResult.unit;
      topics = unitResult.topics;
      if (!unit) {
        return jsonError("NOT_FOUND", "Unit not found", 404, undefined, buildRateLimitHeaders(rateLimit));
      }
      if (unit.courseId !== body.courseId) {
        return jsonError(
          "VALIDATION_ERROR",
          "Unit does not belong to course",
          400,
          undefined,
          buildRateLimitHeaders(rateLimit),
        );
      }

      if (body.topicId) {
        if (!topicResult || topicResult.unitId !== body.unitId) {
          return jsonError(
            "VALIDATION_ERROR",
            "Topic does not belong to unit",
            400,
            undefined,
            buildRateLimitHeaders(rateLimit),
          );
        }
        selectedTopic = topicResult;
      }
    } else {
      const general = buildGeneralExerciseContext({
        topic: body.topic,
        subjectCategory: body.subjectCategory,
        gradeLevel: body.gradeLevel,
      });
      course = general.course;
      unit = general.unit;
      topics = general.topics;
      selectedTopic = general.topics[0] ?? null;
      generationCourseId = general.course.id;
      generationUnitId = general.unit.id;
      generationTopicId = general.topicId;
    }

    if (!course || !unit) {
      return jsonError("VALIDATION_ERROR", "缺少课程或单元上下文", 400, undefined, buildRateLimitHeaders(rateLimit));
    }

    if (isE2E) {
      const mockExercises = buildMockExercises({
        count: body.count,
        exerciseType: body.exerciseType,
        difficulty: body.difficulty,
        topicId: generationTopicId ?? generationUnitId,
      });

      if (streamRequested) {
        return createExerciseStreamResponse(
          mockExercises,
          buildRateLimitHeaders(rateLimit),
        );
      }
      return NextResponse.json(
        { exercises: mockExercises },
        { headers: buildRateLimitHeaders(rateLimit) },
      );
    }

    if (!isExerciseAiConfigured()) {
      return jsonError("SERVICE_UNAVAILABLE", "AI 服务未配置", 503, undefined, buildRateLimitHeaders(rateLimit));
    }

    const scopedTopics = selectedTopic ? [selectedTopic] : topics;
    const exerciseExamples = track === "ap"
      ? await loadExerciseExamples(
          body.courseId!,
          body.exerciseType,
          body.difficulty,
          2,
          curriculumClient,
          {
            courseName: course.name,
            subjectCategory: body.subjectCategory,
          },
        )
      : [];

    const generationInput = {
      track,
      subjectCategory: body.subjectCategory,
      courseId: generationCourseId,
      unitId: generationUnitId,
      topicId: generationTopicId,
      exerciseType: body.exerciseType,
      difficulty: body.difficulty,
      requestCountHint: body.count,
      teacherRequest: [
        body.teacherRequest,
        track === "general" && body.topic ? `Topic: ${body.topic}` : "",
        track === "general" && body.subjectCategory ? `Subject: ${body.subjectCategory}` : "",
        track === "general" && body.gradeLevel ? `Grade: ${body.gradeLevel}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      preloaded: {
        course,
        unit,
        topics: scopedTopics,
        selectedTopic,
        examples: exerciseExamples,
      },
    };

    // Progressive streaming: parallel single-exercise generation
    if (streamRequested) {
      return createProgressiveStreamResponse(
        generationInput,
        body.count,
        mergeHeaders(
          buildRateLimitHeaders(rateLimit),
          buildQuotaHeaders(quotaAdmission, { snapshot: "admission" }),
        ),
        {
          onComplete: async () => {
            if (!quotaIdempotencyKey || !teacherId) return;
            await finalizeQuotaSpendSafe(db, {
              teacherId,
              action: "generate_exercises",
              idempotencyKey: quotaIdempotencyKey,
              metadata: {
                route: "/api/ai/exercises/generate",
                stream: true,
                count: body.count,
                track,
              },
            });
            if (teacherId && body.sourceAssetIds && body.sourceAssetIds.length > 0) {
              void autoArchiveGeneratedContent({
                supabase: db,
                teacherId,
                title: `${course?.name ?? "习题"} · ${body.count} 道`,
                refEntityType: "exercise",
                refEntityId: teacherId,
                sourceAssetIds: body.sourceAssetIds,
                courseId: generationCourseId || undefined,
                unitId: generationUnitId || undefined,
                courseLabel: course?.name,
                unitLabel: unit?.title,
              }).catch((err) => {
                console.error("习题自动归档失败（后台）", err instanceof Error ? err.message : err);
              });
            }
          },
        },
      );
    }

    const generation = await generateExercises({
      ...generationInput,
      count: body.count,
    });

    const baseExercises = generation.exercises.slice(0, body.count);
    const missingCount = Math.max(0, body.count - baseExercises.length);
    const supplementPromise =
      missingCount > 0
        ? generateExercises({
            ...generationInput,
            count: missingCount,
          })
            .then((result) => result.exercises)
            .catch((error) => {
              console.error("Exercise supplement generation failed", error);
              return [];
            })
        : Promise.resolve<ExerciseAIOutput["exercises"]>([]);

    const verificationStrategy = getVerificationStrategy({
      difficulty: body.difficulty,
      skipAll: process.env.EXERCISE_SKIP_VERIFY === "true",
    });

    const supplementExercises = (await supplementPromise).slice(0, missingCount);
    const allExercises = [...baseExercises, ...supplementExercises].slice(0, body.count);

    let generatedExercises: GeneratedExercise[] = [];
    if (!verificationStrategy.shouldVerify) {
      generatedExercises = allExercises.map((exercise) => applyRuleCheckStatus(exercise));
    } else {
      const configuredAttempts = getMaxVerificationAttempts();
      const allowedAttempts = Math.max(
        1,
        Math.min(configuredAttempts, verificationStrategy.maxRetries + 1),
      );
      const primaryVerificationPromise = regenerateOnFailure(
        {
          ...generationInput,
          count: baseExercises.length,
        },
        baseExercises,
        allowedAttempts,
      );
      const supplementVerificationPromise =
        supplementExercises.length > 0
          ? regenerateOnFailure(
              {
                ...generationInput,
                count: supplementExercises.length,
              },
              supplementExercises,
              allowedAttempts,
            )
          : Promise.resolve<ExerciseVerificationResult[]>([]);

      const [primaryVerificationResults, supplementVerificationResults] =
        await Promise.all([primaryVerificationPromise, supplementVerificationPromise]);
      const verificationResults = [...primaryVerificationResults, ...supplementVerificationResults].slice(
        0,
        body.count,
      );
      generatedExercises = verificationResults.map((result) => ({
        ...result.exercise,
        verificationStatus: result.status,
        verificationAttempts: result.attempts,
      }));
    }

    const response: ExerciseGenerateResponseBody = {
      exercises: generatedExercises,
    };

    const quotaFinalize =
      quotaIdempotencyKey && teacherId
        ? await finalizeQuotaSpendSafe(db, {
            teacherId,
            action: "generate_exercises",
            idempotencyKey: quotaIdempotencyKey,
            metadata: {
              route: "/api/ai/exercises/generate",
              stream: false,
              count: body.count,
              track,
            },
          })
        : null;

    if (teacherId && body.sourceAssetIds && body.sourceAssetIds.length > 0) {
      void autoArchiveGeneratedContent({
        supabase: db,
        teacherId,
        title: `${course?.name ?? "习题"} · ${body.count} 道`,
        refEntityType: "exercise",
        refEntityId: teacherId,
        sourceAssetIds: body.sourceAssetIds,
        courseId: generationCourseId || undefined,
        unitId: generationUnitId || undefined,
        courseLabel: course?.name,
        unitLabel: unit?.title,
      }).catch((err) => {
        console.error("习题自动归档失败（后台）", err instanceof Error ? err.message : err);
      });
    }

    return NextResponse.json(
      response,
      {
        headers: mergeHeaders(
          buildRateLimitHeaders(rateLimit),
          buildQuotaHeaders(quotaFinalize ?? quotaAdmission, {
            snapshot: quotaFinalize ? "final" : "admission",
            charged: quotaFinalize?.charged ?? null,
          }),
        ),
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Exercise generation internal schema error", error.flatten());
      return jsonError(
        "INTERNAL_ERROR",
        "Exercise generation produced invalid structured output",
        502,
        undefined,
        buildRateLimitHeaders(rateLimit),
      );
    }

    console.error("Exercise generation failed", error);
    return jsonError(
      "INTERNAL_ERROR",
      "Failed to generate exercises",
      500,
      undefined,
      buildRateLimitHeaders(rateLimit),
    );
  }
}

function buildMockExercises({
  count,
  exerciseType,
  difficulty,
  topicId,
}: {
  count: number;
  exerciseType: "MC" | "FR";
  difficulty: ExerciseDifficulty;
  topicId: string;
}): Array<
  ExerciseAIOutput["exercises"][number] & {
    verificationStatus: ExerciseVerificationResult["status"];
    verificationAttempts: number;
  }
> {
  const exercises = Array.from({ length: count }).map((_, index) => {
    const questionText =
      exerciseType === "MC"
        ? `求函数 $f(x) = x^2 + ${index + 1}x$ 的导数。`
        : `已知 $f(x) = x^2 + ${index + 1}x$，求 $f'(x)$ 并说明步骤。`;

    const options =
      exerciseType === "MC"
        ? [
            { label: "A", text: "$2x + 1$", isCorrect: true },
            { label: "B", text: "$x^2 + 1$", isCorrect: false },
            { label: "C", text: "$2x$", isCorrect: false },
            { label: "D", text: "$x + 1$", isCorrect: false },
          ]
        : undefined;

    return {
      questionText,
      type: exerciseType,
      difficulty,
      topicId,
      options,
      correctAnswer: exerciseType === "MC" ? "A" : "$2x + 1$",
      solutionSteps:
        "对 $f(x)$ 求导：$f'(x) = 2x + 1$，因此答案为 $2x + 1$。",
      commonMistakes: [
        "忘记对 $x^2$ 求导。",
        "把 $x$ 的导数写成 $x$。",
      ],
      verificationStatus: "verified" as ExerciseVerificationResult["status"],
      verificationAttempts: 1,
    };
  });

  return exercises;
}

function normalizeExerciseGenerateRequest(body: Record<string, unknown>) {
  return {
    track: body.track,
    courseId: body.courseId ?? body.course_id,
    unitId: body.unitId ?? body.unit_id,
    topicId: body.topicId ?? body.topic_id,
    topic: body.topic ?? body.topic_name,
    subjectCategory: body.subjectCategory ?? body.subject_category,
    gradeLevel: body.gradeLevel ?? body.grade_level,
    exerciseType:
      body.exerciseType ??
      body.questionType ??
      body.question_type ??
      body.exercise_type,
    difficulty: normalizeNumber(body.difficulty),
    count: normalizeNumber(body.count),
    rubricId: body.rubricId ?? body.rubric_id,
    teacherRequest:
      body.teacherRequest ?? body.teacher_requirements ?? body.teacher_request,
  };
}

function normalizeNumber(value: unknown) {
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }
  return value;
}

function getMaxVerificationAttempts() {
  const raw = Number(process.env.EXERCISE_VERIFY_MAX_ATTEMPTS ?? "2");
  if (!Number.isFinite(raw)) {
    return 2;
  }
  const normalized = Math.floor(raw);
  if (normalized <= 1) {
    return 1;
  }
  return 2;
}
