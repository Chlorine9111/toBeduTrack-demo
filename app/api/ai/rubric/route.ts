/**
 * POST /api/ai/rubric
 * Generates a rubric via Kimi tool-use.
 */
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { rubricGenerateRequestSchema } from "@/lib/validation/api";
import type { Course, Topic, Unit } from "@/types/curriculum";
import type { RubricAIOutput, RubricDetailPayload } from "@/types/rubric";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { syncRubricContentLibraryItem } from "@/lib/content-library/sync";
import { autoArchiveGeneratedContent } from "@/lib/content-assets/auto-archive";
import { ensureTeacher, EnsureTeacherError } from "@/lib/teachers/ensure-teacher";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";
import { buildRateLimitHeaders, consumeRateLimit } from "@/lib/api/rate-limit";
import { isAuthBypassEnabled } from "@/lib/auth/bypass";
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
import {
  buildGeneralRubricContext,
  buildUnsavedRubricDetail,
  generateRubricDetail,
  RubricGenerationError,
} from "@/lib/rubric/generation";

const E2E_RUBRIC_TEACHER_ID = "00000000-0000-4000-8000-000000000003";

function sendLine(controller: ReadableStreamDefaultController<Uint8Array>, payload: unknown) {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function createRubricStreamResponse(params: {
  headers?: HeadersInit;
  run: (
    emit: (payload: Record<string, unknown>) => void,
  ) => Promise<RubricDetailPayload>;
}) {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        sendLine(controller, { type: "meta", stage: "rubric" });
        const rubric = await params.run((payload) => {
          sendLine(controller, payload);
        });
        const dimensions = Array.isArray(rubric.dimensions) ? rubric.dimensions : [];
        const total = dimensions.length;
        let emittedDimensionCount = 0;

        for (const [index, dimension] of dimensions.entries()) {
          const levels = (dimension.levels ?? []).reduce<Record<string, string>>(
            (acc, item) => {
              acc[item.level] = item.description;
              return acc;
            },
            {},
          );

          sendLine(controller, {
            type: "dimension",
            index: index + 1,
            total,
            dimension: {
              id: dimension.id,
              name: dimension.name,
              description: dimension.description,
              weight: dimension.weight,
              levels: {
                excellent: levels.excellent ?? "",
                good: levels.good ?? "",
                passing: levels.passing ?? "",
                failing: levels.failing ?? "",
              },
            },
          });
          emittedDimensionCount += 1;
          if (total > 1) {
            await sleep(20);
          }
        }
        sendLine(controller, { type: "complete", rubric, total: emittedDimensionCount });
      } catch (error) {
        sendLine(controller, {
          type: "error",
          message:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : "Rubric generation failed",
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
      ...(params.headers ?? {}),
    },
  });
}

function buildRubricFallback(params: {
  course: Course;
  unit: Unit | null;
  topics: Topic[];
  teacherRequest: string;
}): RubricAIOutput {
  const unitLabel = params.unit
    ? `Unit ${params.unit.unitNumber} · ${params.unit.title}`
    : params.course.name;
  const topicFocus = params.topics
    .slice(0, 3)
    .map((topic) => `${topic.topicNumber}. ${topic.title}`)
    .join("; ");
  const focusText = topicFocus ? `重点覆盖：${topicFocus}。` : "";

  return {
    title: `${unitLabel} 任务评分量规`,
    dimensions: [
      {
        name: "Conceptual Understanding",
        description: `是否准确掌握并迁移本单元核心概念。${focusText}`.trim(),
        weight: 30,
        levels: {
          excellent: "核心概念准确且可迁移到新情境，解释完整并能主动纠错。",
          good: "核心概念基本准确，能完成常规迁移，解释较完整。",
          passing: "能复述基础概念并完成部分任务，但迁移与解释不稳定。",
          failing: "概念混淆明显，无法支撑任务完成。",
        },
      },
      {
        name: "Reasoning and Evidence",
        description: "论证链条是否完整，是否使用了可核查证据或关键中间步骤。",
        weight: 25,
        levels: {
          excellent: "推理链条完整，关键结论均有证据支撑，能解释为何不是其他结论。",
          good: "推理总体连贯，关键步骤有依据，个别环节展开不足。",
          passing: "存在主要推理路径，但证据薄弱或步骤跳跃较多。",
          failing: "缺少有效推理或证据，结论主要依赖猜测。",
        },
      },
      {
        name: "Method Accuracy",
        description: "方法选择、执行过程与结果准确性。",
        weight: 25,
        levels: {
          excellent: "方法选择匹配任务，执行准确且结果可靠，关键细节处理到位。",
          good: "方法基本正确，结果总体可用，存在少量非关键误差。",
          passing: "能尝试正确方法，但执行不稳定，错误影响部分结果。",
          failing: "方法选择或执行错误导致结果不可用。",
        },
      },
      {
        name: "Communication and Structure",
        description: "表达是否清晰、结构是否可读，能否让他人复现过程。",
        weight: 20,
        levels: {
          excellent: "表达清晰、结构严谨，读者可按文档独立复现完整过程。",
          good: "表达基本清楚，结构较完整，复现时仅需少量补充。",
          passing: "表达可理解但结构松散，复现需要较多推断。",
          failing: "表达混乱或关键信息缺失，无法复现。",
        },
      },
    ],
  };
}

function isStreamRequested(request: Request, body: Record<string, unknown>) {
  const streamValue = body.stream;
  if (streamValue === true || streamValue === "true") {
    return true;
  }
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("application/x-ndjson");
}

function buildE2ERubric(params: {
  courseId: string;
  unitId?: string;
  teacherRequest: string;
}): RubricDetailPayload {
  const now = new Date().toISOString();
  const levelConfig = [
    { level: "excellent" as const, score: 4 as const, description: "概念理解完整，推理严谨，表达清晰。" },
    { level: "good" as const, score: 3 as const, description: "概念基本准确，步骤较完整，存在少量疏漏。" },
    { level: "passing" as const, score: 2 as const, description: "能完成基础任务，但关键步骤与解释不充分。" },
    { level: "failing" as const, score: 1 as const, description: "概念与方法掌握不足，无法独立完成核心任务。" },
  ];

  const dimensions = [
    { name: "Conceptual Understanding", description: "对核心概念与定理的理解深度", weight: 30 },
    { name: "Computational Accuracy", description: "计算过程与结果准确性", weight: 25 },
    { name: "Problem Solving", description: "策略选择与解题完整性", weight: 25 },
    { name: "Mathematical Communication", description: "数学表述与论证清晰度", weight: 20 },
  ].map((item, index) => {
    const dimensionId = randomUUID();
    return {
      id: dimensionId,
      name: item.name,
      description: item.description,
      weight: item.weight,
      sortOrder: index,
      levels: levelConfig.map((level) => ({
        id: randomUUID(),
        dimensionId,
        level: level.level,
        score: level.score,
        description: level.description,
      })),
    };
  });

  return {
    id: randomUUID(),
    courseId: params.courseId,
    unitId: params.unitId ?? null,
    title: "AP Calculus Unit Assessment Rubric",
    status: "draft",
    teacherPrompt: params.teacherRequest,
    isAiGenerated: true,
    teacherModified: false,
    createdAt: now,
    updatedAt: now,
    course: {
      id: params.courseId,
      name: "AP Calculus AB",
      code: "AP-CALC-AB",
    },
    unit: params.unitId
      ? {
          id: params.unitId,
          unitNumber: "1",
          title: "Limits and Continuity",
        }
      : null,
    dimensions,
  };
}

export async function POST(request: Request) {
  type ResponseBody = { rubric: RubricDetailPayload };

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isE2E = process.env.E2E_TEST === "1";
  const authBypass = isAuthBypassEnabled() || isE2E;

  if (!user && !authBypass) {
    return jsonError("UNAUTHORIZED", "Unauthorized", 401);
  }

  const rateLimit = consumeRateLimit({
    request,
    key: "ai-rubric-generate",
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

  let teacherId = isE2E ? E2E_RUBRIC_TEACHER_ID : "";
  let db = supabase;
  if (!isE2E) {
    try {
      const ensured = await ensureTeacher({ supabase, user, authBypass });
      teacherId = ensured.teacherId;
      db = ensured.supabase;
    } catch (error) {
      if (error instanceof EnsureTeacherError) {
        return jsonError("UNAUTHORIZED", error.message, error.status, undefined, buildRateLimitHeaders(rateLimit));
      }
      throw error;
    }
  }

  let rawRequestBody: Record<string, unknown>;
  try {
    rawRequestBody = await parseJsonBody<Record<string, unknown>>(request);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "Invalid request body", 400, undefined, buildRateLimitHeaders(rateLimit));
    }
    throw error;
  }
  const streamRequested = isStreamRequested(request, rawRequestBody);

  const bodyParse = rubricGenerateRequestSchema.safeParse(rawRequestBody);

  if (!bodyParse.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid request body",
      400,
      bodyParse.error.flatten(),
      buildRateLimitHeaders(rateLimit),
    );
  }

  const {
    track = "ap",
    courseId,
    unitId,
    topic,
    subjectCategory,
    gradeLevel,
    teacherRequest,
    sourceAssetIds = [],
  } = bodyParse.data;

  const generalContext = track === "general"
    ? buildGeneralRubricContext({
        topic,
        subjectCategory,
        gradeLevel,
      })
    : null;

  const quotaAdmission = !isE2E
    ? await checkQuotaAdmissionSafe(db, {
        teacherId,
        action: "generate_rubric",
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

  const quotaIdempotencyKey = !isE2E
    ? resolveQuotaIdempotencyKey(request, `rubric:${teacherId}`)
    : null;

  if (isE2E) {
    const rubric = track === "ap"
      ? buildE2ERubric({ courseId: courseId!, unitId, teacherRequest })
      : buildUnsavedRubricDetail({
          rubric: buildRubricFallback({
            course: generalContext!.course,
            unit: generalContext!.unit,
            topics: generalContext!.topics,
            teacherRequest,
          }),
          course: generalContext!.course,
          unit: generalContext!.unit,
          teacherRequest,
        });
    if (streamRequested) {
      return createRubricStreamResponse({
        headers: mergeHeaders(
          buildRateLimitHeaders(rateLimit),
          buildQuotaHeaders(quotaAdmission, { snapshot: "admission" }),
        ),
        run: async (emit) => {
          const previewText = [
            `# ${rubric.title}`,
            ...rubric.dimensions.map((dimension) => `## ${dimension.name}\n说明：${dimension.description}`),
          ].join("\n\n");
          emit({ type: "text_delta", delta: previewText, snapshot: previewText });
          return rubric;
        },
      });
    }
    return NextResponse.json(
      { rubric } as ResponseBody,
      { headers: buildRateLimitHeaders(rateLimit) },
    );
  }

  try {
    if (streamRequested) {
      return createRubricStreamResponse({
        headers: mergeHeaders(
          buildRateLimitHeaders(rateLimit),
          buildQuotaHeaders(quotaAdmission, { snapshot: "admission" }),
        ),
        run: async (emit) => {
          const detail = await generateRubricDetail({
            supabase: db,
            teacherId,
            track,
            courseId: courseId ?? undefined,
            unitId,
            topic,
            subjectCategory,
            gradeLevel,
            teacherRequest,
            onPreview: async (update) => {
              emit(
                update.reset
                  ? {
                      type: "text_snapshot",
                      snapshot: update.snapshot,
                    }
                  : {
                      type: "text_delta",
                      delta: update.delta,
                      snapshot: update.snapshot,
                    },
              );
            },
          });

          if (quotaIdempotencyKey) {
            await finalizeQuotaSpendSafe(db, {
              teacherId,
              action: "generate_rubric",
              idempotencyKey: quotaIdempotencyKey,
              metadata: {
                route: "/api/ai/rubric",
                track,
                stream: true,
                courseId: courseId ?? null,
                unitId: unitId ?? null,
              },
            });
          }

          if (track !== "general") {
            void syncRubricContentLibraryItem({
              supabase: db,
              teacherId,
              rubricId: detail.id,
            }).catch((error) => {
              console.error(
                "Rubric 内容库同步失败（后台）",
                error instanceof Error ? error.message : error,
              );
            });
          }

          if (sourceAssetIds.length > 0) {
            void autoArchiveGeneratedContent({
              supabase: db,
              teacherId,
              title: detail.title || "Rubric",
              refEntityType: "rubric",
              refEntityId: detail.id,
              sourceAssetIds,
              courseId: courseId ?? undefined,
              unitId: unitId ?? undefined,
            }).catch((err) => {
              console.error("Rubric 自动归档失败（后台）", err instanceof Error ? err.message : err);
            });
          }

          return detail;
        },
      });
    }

    const detail = await generateRubricDetail({
      supabase: db,
      teacherId,
      track,
      courseId: courseId ?? undefined,
      unitId,
      topic,
      subjectCategory,
      gradeLevel,
      teacherRequest,
    });
    const quotaFinalize = quotaIdempotencyKey
      ? await finalizeQuotaSpendSafe(db, {
          teacherId,
          action: "generate_rubric",
          idempotencyKey: quotaIdempotencyKey,
          metadata: {
            route: "/api/ai/rubric",
            track,
            stream: false,
            courseId: courseId ?? null,
            unitId: unitId ?? null,
          },
        })
      : null;

    if (track === "general") {
      return NextResponse.json(
        { rubric: detail } as ResponseBody,
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
    }

    void syncRubricContentLibraryItem({
      supabase: db,
      teacherId,
      rubricId: detail.id,
    }).catch((error) => {
      console.error(
        "Rubric 内容库同步失败（后台）",
        error instanceof Error ? error.message : error,
      );
    });

    if (sourceAssetIds.length > 0) {
      void autoArchiveGeneratedContent({
        supabase: db,
        teacherId,
        title: detail.title || "Rubric",
        refEntityType: "rubric",
        refEntityId: detail.id,
        sourceAssetIds,
        courseId: courseId ?? undefined,
        unitId: unitId ?? undefined,
      }).catch((err) => {
        console.error("Rubric 自动归档失败（后台）", err instanceof Error ? err.message : err);
      });
    }

    return NextResponse.json(
      { rubric: detail } as ResponseBody,
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
    if (error instanceof RubricGenerationError) {
      return jsonError(
        error.code,
        error.message,
        error.status,
        undefined,
        buildRateLimitHeaders(rateLimit),
      );
    }
    console.error("Rubric generation failed", error);
    return jsonError("INTERNAL_ERROR", "Rubric generation failed", 500, undefined, buildRateLimitHeaders(rateLimit));
  }
}
