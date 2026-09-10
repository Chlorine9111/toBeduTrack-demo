import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { loadCourse, loadUnitWithTopics } from "@/lib/curriculum/loader";
import {
  assertLessonPlanAiAvailable,
  generateOutlineWithAi,
  generateSectionBlocksWithAi,
  LessonPlanAiError,
} from "@/lib/lesson-plan/ai";
import { syncLessonPlanContentLibraryItem } from "@/lib/content-library/sync";
import { autoArchiveGeneratedContent } from "@/lib/content-assets/auto-archive";
import { getLessonPlanContext } from "@/lib/lesson-plan/context";
import { DEFAULT_LESSON_PLAN_PREFERENCES } from "@/lib/lesson-plan/defaults";
import {
  collectEssentialKnowledge,
  collectLearningObjectiveCodes,
} from "@/lib/lesson-plan/intent";
import { buildMaterialDigest } from "@/lib/lesson-plan/material-digest";
import {
  extractUploadedMaterials,
  MAX_MATERIAL_FILES,
} from "@/lib/lesson-plan/material-parser";
import {
  buildAugmentedSourcePrompt,
  buildQuickTopic,
  toCedTopicFromCurriculum,
} from "@/lib/lesson-plan/prompt-builder";
import {
  appendLessonPlanSection,
  createLessonPlanShell,
  getLessonPlanById,
  replaceLessonPlan,
} from "@/lib/lesson-plan/store";
import { buildFallbackSectionBlocks } from "@/lib/lesson-plan/block-factory";
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
import { buildTemplateOutline } from "@/lib/lesson-plan/templates";
import type {
  CedTopicMatch,
  LessonPlanSection,
  LessonPlanStudentLevel,
  LessonPlanTemplateKind,
} from "@/lib/lesson-plan/types";
import { runWebEnrichment } from "@/lib/lesson-plan/web-enrichment";
import { lessonGenerateRequestSchema } from "@/lib/validation/lesson-plan";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export const maxDuration = 120;

const quickLessonGenerateRequestSchema = z
  .object({
    track: z.enum(["ap", "general"]).optional(),
    topic: z.string().trim().min(1).max(300).optional(),
    subjectCategory: z.string().trim().min(1).max(80).optional(),
    gradeLevel: z.string().trim().min(1).max(40).optional(),
    sourcePrompt: z.string().trim().min(1).max(4000).optional(),
    courseId: z.string().trim().min(1).max(120).optional(),
    unitId: z.string().trim().min(1).max(120).optional(),
    duration: z.number().int().min(15).max(180).optional(),
    level: z.enum(["基础", "中等", "进阶", "basic", "medium", "advanced"]).optional(),
    template: z
      .enum([
        "concept",
        "example",
        "sprint",
        "inquiry",
        "概念讲授",
        "例题示范",
        "复习冲刺",
        "探究式",
      ])
      .optional(),
    enableWebSearch: z.boolean().optional().default(false),
  })
  .refine(
    (input) => Boolean(input.sourcePrompt || input.courseId || input.unitId || input.topic),
    "quick 生成至少需要 sourcePrompt/courseId/unitId 之一",
  );

type LessonGenerateBody = z.infer<typeof lessonGenerateRequestSchema>;

type GeneratePayloadParseResult = {
  body: LessonGenerateBody;
  isQuick: boolean;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECTION_CONCURRENCY = (() => {
  const raw = Number(process.env.LESSON_SECTION_CONCURRENCY ?? "3");
  if (!Number.isFinite(raw)) return 3;
  return Math.max(1, Math.min(4, Math.floor(raw)));
})();
const PIPELINE_TIMEOUT_MS = 240_000;
const PIPELINE_TIMEOUT_MESSAGE =
  "教案生成超时（超过 4 分钟），已中止。请缩短材料或简化需求后重试。";

function asUuidOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  return UUID_REGEX.test(value) ? value : null;
}

function normalizeTemplateKind(
  template: z.infer<typeof quickLessonGenerateRequestSchema>["template"],
): LessonPlanTemplateKind {
  if (template === "example" || template === "例题示范") return "example";
  if (template === "sprint" || template === "复习冲刺") return "sprint";
  if (template === "inquiry" || template === "探究式") return "inquiry";
  return "concept";
}

function normalizeStudentLevel(
  level: z.infer<typeof quickLessonGenerateRequestSchema>["level"],
): LessonPlanStudentLevel {
  if (level === "基础" || level === "basic") return "basic";
  if (level === "进阶" || level === "advanced") return "advanced";
  return "medium";
}

function inferUnitNumber(unitId: string | undefined) {
  if (!unitId) return "1";
  const match = unitId.match(/unit[-_]?(\d{1,2})/i);
  return match ? String(Number(match[1])) : "1";
}

function getAbortMessage(signal: AbortSignal): string {
  return typeof signal.reason === "string" && signal.reason.trim().length > 0
    ? signal.reason
    : PIPELINE_TIMEOUT_MESSAGE;
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw new Error(getAbortMessage(signal));
  }
}

async function buildQuickGenerateBodyWithContext(
  input: z.infer<typeof quickLessonGenerateRequestSchema>,
  context: {
    supabase?: SupabaseClient<Database> | null;
  },
): Promise<LessonGenerateBody> {
  const db = context.supabase ?? undefined;
  const unitNumber = inferUnitNumber(input.unitId);
  const templateKind = normalizeTemplateKind(input.template);
  const studentLevel = normalizeStudentLevel(input.level);
  const durationMinutes = input.duration ?? DEFAULT_LESSON_PLAN_PREFERENCES.durationMinutes;

  let resolvedCourseId = input.courseId ?? null;
  let resolvedCourseCode = "COURSE-AUTO";
  let resolvedCourseName = "当前课程";

  let resolvedUnitId = input.unitId ?? null;
  let resolvedUnitNumber = unitNumber;
  let resolvedUnitTitle = input.topic ?? `Unit ${unitNumber} 核心主题`;
  let resolvedTopics: CedTopicMatch[] = [];

  if (input.track === "general") {
    resolvedCourseName = input.subjectCategory ?? "通用学科";
    resolvedCourseCode = "GENERAL";
  }

  if (resolvedUnitId) {
    const { unit, topics } = await loadUnitWithTopics(resolvedUnitId, db);
    if (unit) {
      resolvedUnitId = unit.id;
      resolvedUnitNumber = unit.unitNumber;
      resolvedUnitTitle = unit.title;
      resolvedCourseId = unit.courseId;
      resolvedTopics = topics.slice(0, 3).map(toCedTopicFromCurriculum);
    }
  }

  if (resolvedCourseId) {
    const course = await loadCourse(resolvedCourseId, db);
    if (course) {
      resolvedCourseId = course.id;
      resolvedCourseCode = course.code;
      resolvedCourseName = course.name;
    }
  }

  if (resolvedTopics.length === 0) {
    resolvedTopics =
      input.track === "general"
        ? [
            {
              id: resolvedUnitId
                ? `${resolvedUnitId}-topic-generic`
                : `unit-${resolvedUnitNumber}-topic-generic`,
              topicNumber: "",
              title: input.topic?.trim() || resolvedUnitTitle,
              learningObjectives: [],
              essentialKnowledge: [],
            },
          ]
        : [buildQuickTopic(resolvedUnitNumber, resolvedUnitId ?? undefined)];
  }

  const confirmation = {
    subject: {
      courseId: resolvedCourseId,
      code: resolvedCourseCode,
      name: resolvedCourseName,
    },
    unit: {
      id: resolvedUnitId,
      unitNumber: resolvedUnitNumber,
      title: resolvedUnitTitle,
    },
    topics: resolvedTopics,
    preferences: {
      ...DEFAULT_LESSON_PLAN_PREFERENCES,
      durationMinutes,
      studentLevel,
      templateKind,
    },
  };

  const sourcePrompt =
    input.sourcePrompt ??
    `请生成 ${resolvedCourseName} Unit ${resolvedUnitNumber}《${resolvedUnitTitle}》教案，时长 ${durationMinutes} 分钟。`;
  const outline = buildTemplateOutline({
    templateKind,
    topics: confirmation.topics,
    totalMinutes: durationMinutes,
    titleHint: `${resolvedCourseName} Unit ${resolvedUnitNumber} · ${resolvedUnitTitle} 教案`,
  });

  return {
    sourcePrompt,
    confirmation,
    outline,
    enableWebSearch: input.enableWebSearch ?? false,
    sourceAssetIds: [],
  };
}

async function parseGeneratePayload(
  rawBody: unknown,
  context: {
    supabase?: SupabaseClient<Database> | null;
  },
): Promise<GeneratePayloadParseResult> {
  const normal = lessonGenerateRequestSchema.safeParse(rawBody);
  if (normal.success) {
    return {
      body: normal.data,
      isQuick: false,
    };
  }

  if (rawBody && typeof rawBody === "object") {
    const payload = rawBody as Record<string, unknown>;
    if ("confirmation" in payload || "outline-solid" in payload) {
      throw normal.error;
    }
  }

  const quick = quickLessonGenerateRequestSchema.safeParse(rawBody);
  if (quick.success) {
    return {
      body: await buildQuickGenerateBodyWithContext(quick.data, context),
      isQuick: true,
    };
  }

  throw normal.error;
}

async function parseGenerateInput(
  request: Request,
  context: {
    supabase?: SupabaseClient<Database> | null;
  },
): Promise<{ parsed: GeneratePayloadParseResult; materials: File[] }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const payloadText = `${formData.get("payload") ?? ""}`.trim();
    let payloadObject: unknown = {};
    if (payloadText) {
      try {
        payloadObject = JSON.parse(payloadText);
      } catch {
        throw new InvalidJsonBodyError();
      }
    }

    const parsed = await parseGeneratePayload(payloadObject, context);
    const materials = formData
      .getAll("materials")
      .filter((item): item is File => item instanceof File)
      .slice(0, MAX_MATERIAL_FILES);
    return { parsed, materials };
  }

  const rawBody = await parseJsonBody<unknown>(request);
  const parsed = await parseGeneratePayload(rawBody, context);
  return { parsed, materials: [] };
}

async function maybeRegenerateOutline(params: {
  body: LessonGenerateBody;
  sourcePrompt: string;
  hasUploadedMaterials: boolean;
  titleHint?: string;
  abortSignal?: AbortSignal;
}) {
  if (!params.hasUploadedMaterials) {
    return params.body.outline;
  }

  try {
    const generatedOutline = await generateOutlineWithAi({
      sourcePrompt: params.sourcePrompt,
      titleHint:
        params.titleHint ||
        params.body.outline.title ||
        `${params.body.confirmation.subject.name} Unit ${params.body.confirmation.unit.unitNumber} 教案`,
      topics: params.body.confirmation.topics,
      preferences: params.body.confirmation.preferences,
      courseName: params.body.confirmation.subject.name,
      abortSignal: params.abortSignal,
    });

    if (generatedOutline.sections.length > 0) {
      return generatedOutline;
    }
  } catch (error) {
    if (params.abortSignal?.aborted) {
      throw error;
    }
  }
  return params.body.outline;
}

export async function POST(request: Request) {
  const contextResult = await getLessonPlanContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  let parsed: GeneratePayloadParseResult;
  let materialFiles: File[] = [];
  try {
    const parsedInput = await parseGenerateInput(request, {
      supabase: contextResult.value.supabase,
    });
    parsed = parsedInput.parsed;
    materialFiles = parsedInput.materials;
  } catch (error) {
    if (error instanceof LessonPlanAiError) {
      return jsonError(error.code, error.message, error.status);
    }
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }
    return jsonError("INTERNAL_ERROR", "请求参数解析失败", 500);
  }

  try {
    assertLessonPlanAiAvailable();
  } catch (error) {
    if (error instanceof LessonPlanAiError) {
      return jsonError(error.code, error.message, error.status);
    }
    throw error;
  }

  const quotaAdmission =
    !contextResult.value.isMock && contextResult.value.supabase
      ? await checkQuotaAdmissionSafe(contextResult.value.supabase, {
          teacherId: contextResult.value.teacherId,
          action: "generate_lesson_plan",
        })
      : null;
  if (quotaAdmission && !quotaAdmission.allowed) {
    return jsonError(
      "QUOTA_EXHAUSTED",
      "当前测试期使用量已达上限，请等待下个周期重置后继续。",
      403,
      buildQuotaExhaustedDetails(quotaAdmission),
      buildQuotaHeaders(quotaAdmission, { snapshot: "admission" }),
    );
  }
  const quotaIdempotencyKey =
    !contextResult.value.isMock && contextResult.value.supabase
      ? resolveQuotaIdempotencyKey(
          request,
          `lesson-plan:${contextResult.value.teacherId}`,
        )
      : null;

  const abortController = new AbortController();
  const stream = createUIMessageStream({
    onError: (error) => {
      if (abortController.signal.aborted) {
        return getAbortMessage(abortController.signal);
      }
      return error instanceof Error ? error.message : "教案生成失败";
    },
    execute: async ({ writer }) => {
      const writeData = (
        type: `data-${string}`,
        data: Record<string, unknown>,
        options?: { id?: string; transient?: boolean },
      ) => {
        writer.write({
          type,
          data,
          ...(options?.id ? { id: options.id } : {}),
          ...(options?.transient ? { transient: true } : {}),
        });
      };

      const timeoutId = setTimeout(() => {
        abortController.abort(PIPELINE_TIMEOUT_MESSAGE);
      }, PIPELINE_TIMEOUT_MS);

      const totalStartedAt = Date.now();
      const stage = {
        materialParseMs: 0,
        digestMs: 0,
        webMs: 0,
        outlineMs: 0,
        sectionMs: 0,
        qualityMs: 0,
      };
      let timeoutWarningSent = false;

      try {
        writer.write({ type: "start" });
        const { body } = parsed;
        const signal = abortController.signal;
        const enableWebSearch = body.enableWebSearch ?? false;

        throwIfAborted(signal);
        const materialParseStartedAt = Date.now();
        const extractedMaterialResult = await extractUploadedMaterials(materialFiles);
        const uploadedMaterials = extractedMaterialResult.materials;
        stage.materialParseMs = Date.now() - materialParseStartedAt;

        throwIfAborted(signal);
        const digestStartedAt = Date.now();
        const materialDigestPromise = buildMaterialDigest(uploadedMaterials, body.sourcePrompt, {
          abortSignal: signal,
        })
          .catch((error) => {
            if (signal.aborted) {
              throw error;
            }
            const message =
              error instanceof Error ? error.message : "材料提炼异常，已跳过自动提炼";
            writeData(
              "data-lesson-warning",
              {
                message: `材料提炼失败，已跳过自动提炼：${message}`,
              },
              { transient: true },
            );
            return null;
          })
          .finally(() => {
            stage.digestMs = Date.now() - digestStartedAt;
          });

        const webStartedAt = Date.now();
        const webEnrichmentPromise = enableWebSearch
          ? runWebEnrichment({
              sourcePrompt: body.sourcePrompt,
              confirmation: body.confirmation,
              abortSignal: signal,
            }).finally(() => {
              stage.webMs = Date.now() - webStartedAt;
            })
          : Promise.resolve(null).then((value) => {
              stage.webMs = 0;
              return value;
            });

        const [materialDigest, webEnrichment] = await Promise.all([
          materialDigestPromise,
          webEnrichmentPromise,
        ]);

        throwIfAborted(signal);
        const effectiveSourcePrompt = buildAugmentedSourcePrompt({
          sourcePrompt: body.sourcePrompt,
          materials: uploadedMaterials,
          digest: materialDigest,
          web: webEnrichment,
        });

        const outlineStartedAt = Date.now();
        const effectiveOutline = await maybeRegenerateOutline({
          body,
          sourcePrompt: effectiveSourcePrompt,
          hasUploadedMaterials: uploadedMaterials.length > 0,
          titleHint: materialDigest?.titleHint,
          abortSignal: signal,
        });
        stage.outlineMs = Date.now() - outlineStartedAt;

        const learningObjectiveCodes = collectLearningObjectiveCodes(body.confirmation.topics);
        const essentialKnowledge = collectEssentialKnowledge(body.confirmation.topics);
        const persistedCourseId = asUuidOrNull(body.confirmation.subject.courseId);
        const persistedUnitId = asUuidOrNull(body.confirmation.unit.id);
        const persistedTopicIds = body.confirmation.topics
          .map((item) => asUuidOrNull(item.id))
          .filter((item): item is string => Boolean(item));

        throwIfAborted(signal);
        const planId = await createLessonPlanShell(contextResult.value, {
          title: effectiveOutline.title,
          sourcePrompt: effectiveSourcePrompt,
          subjectLabel: `${body.confirmation.subject.name} · Unit ${body.confirmation.unit.unitNumber}`,
          courseId: persistedCourseId,
          unitId: persistedUnitId,
          topicIds: persistedTopicIds,
          learningObjectiveCodes,
          essentialKnowledge,
          preferences: body.confirmation.preferences,
        });

        writeData("data-lesson-meta", {
          planId,
          title: effectiveOutline.title,
          courseName: body.confirmation.subject.name,
          unitName: `Unit ${body.confirmation.unit.unitNumber} · ${body.confirmation.unit.title}`,
          totalMinutes: body.confirmation.preferences.durationMinutes,
          level:
            body.confirmation.preferences.studentLevel === "basic"
              ? "基础"
              : body.confirmation.preferences.studentLevel === "advanced"
                ? "进阶"
                : "中等",
          materialCount: uploadedMaterials.length,
        });

        effectiveOutline.sections.forEach((section, index) => {
          const draftSection: LessonPlanSection = {
            id: section.id,
            title: section.title,
            summary: section.summary,
            durationMinutes: section.durationMinutes,
            sortOrder: index,
            blocks: buildFallbackSectionBlocks({
              section,
              topic: body.confirmation.topics[0] ?? null,
              courseName: body.confirmation.subject.name,
              sectionIndex: index,
              totalSections: effectiveOutline.sections.length,
              allSections: effectiveOutline.sections,
            }),
          };

          writeData(
            "data-lesson-section",
            {
              section: draftSection,
              progress: 0,
              completedSections: 0,
              totalSections: effectiveOutline.sections.length,
              draft: true,
            },
            { id: section.id },
          );
        });

        if (extractedMaterialResult.warnings.length > 0) {
          writeData(
            "data-lesson-warning",
            {
              message: `部分材料未解析成功：${extractedMaterialResult.warnings.join("；")}`,
            },
            { transient: true },
          );
        }

        const generatedSections: LessonPlanSection[] = [];
        let sectionPersistFailed = false;
        const sectionStartedAt = Date.now();
        let completedSections = 0;
        const generateSection = async (
          section: (typeof effectiveOutline.sections)[number],
          index: number,
        ) => {
          throwIfAborted(signal);

          const sectionWarningIssues: string[] = [];
          const blocks = await generateSectionBlocksWithAi({
            sourcePrompt: effectiveSourcePrompt,
            section,
            topics: body.confirmation.topics,
            preferences: body.confirmation.preferences,
            previousSummary: index > 0 ? effectiveOutline.sections[index - 1].summary : undefined,
            nextSummary:
              index < effectiveOutline.sections.length - 1
                ? effectiveOutline.sections[index + 1].summary
                : undefined,
            sectionIndex: index,
            totalSections: effectiveOutline.sections.length,
            allSections: effectiveOutline.sections,
            courseName: body.confirmation.subject.name,
            abortSignal: signal,
            onDraftBlocks: (draftBlocks) => {
              const draftSection: LessonPlanSection = {
                id: section.id,
                title: section.title,
                summary: section.summary,
                durationMinutes: section.durationMinutes,
                sortOrder: index,
                blocks: draftBlocks,
              };
              writeData(
                "data-lesson-section",
                {
                  section: draftSection,
                  progress: Math.round((completedSections / totalSections) * 100),
                  completedSections,
                  totalSections,
                  draft: true,
                },
                { id: section.id },
              );
            },
            onWarning: (issues) => {
              sectionWarningIssues.splice(0, sectionWarningIssues.length, ...issues);
            },
          });

          const sectionModel: LessonPlanSection = {
            id: section.id,
            title: section.title,
            summary: section.summary,
            durationMinutes: section.durationMinutes,
            sortOrder: index,
            blocks,
          };

          let persistWarning: string | null = null;
          try {
            await appendLessonPlanSection(contextResult.value, planId, sectionModel);
          } catch (persistError) {
            const persistMessage =
              persistError instanceof Error ? persistError.message : "章节写入失败";
            console.error("appendLessonPlanSection failed", {
              planId,
              sectionId: section.id,
              sectionIndex: index,
              message: persistMessage,
            });
            persistWarning = `章节保存失败：${persistMessage}（将于生成结束后重试整体保存）`;
          }

          return {
            index,
            sectionId: section.id,
            sectionModel,
            sectionWarningIssues,
            persistWarning,
          };
        };

        const totalSections = effectiveOutline.sections.length;
        const generatedSectionSlots = Array<LessonPlanSection | null>(totalSections).fill(null);
        const inFlight = new Map<
          number,
          Promise<{
            index: number;
            sectionId: string;
            sectionModel: LessonPlanSection;
            sectionWarningIssues: string[];
            persistWarning: string | null;
          }>
        >();
        let nextSectionIndex = 0;

        const launchSection = (index: number) => {
          const section = effectiveOutline.sections[index];
          if (!section) return;
          const task = generateSection(section, index);
          inFlight.set(index, task);
        };

        while (nextSectionIndex < totalSections && inFlight.size < SECTION_CONCURRENCY) {
          launchSection(nextSectionIndex);
          nextSectionIndex += 1;
        }

        while (inFlight.size > 0) {
          throwIfAborted(signal);
          const result = await Promise.race(inFlight.values());
          inFlight.delete(result.index);
          completedSections += 1;
          generatedSectionSlots[result.index] = result.sectionModel;
          generatedSections.splice(
            0,
            generatedSections.length,
            ...generatedSectionSlots.filter(
              (item): item is LessonPlanSection => Boolean(item),
            ),
          );

          if (result.persistWarning) {
            sectionPersistFailed = true;
            writeData(
              "data-lesson-section-warning",
              {
                sectionIndex: result.index,
                sectionId: result.sectionId,
                issues: [result.persistWarning],
              },
              { transient: true },
            );
          }

          writeData(
            "data-lesson-section",
            {
              section: result.sectionModel,
              progress: Math.round((completedSections / totalSections) * 100),
              completedSections,
              totalSections,
              draft: false,
            },
            { id: result.sectionId },
          );

          if (result.sectionWarningIssues.length > 0) {
            writeData(
              "data-lesson-section-warning",
              {
                sectionIndex: result.index,
                sectionId: result.sectionId,
                issues: result.sectionWarningIssues,
              },
              { transient: true },
            );
          }

          if (nextSectionIndex < totalSections) {
            launchSection(nextSectionIndex);
            nextSectionIndex += 1;
          }
        }
        stage.sectionMs = Date.now() - sectionStartedAt;

        if (sectionPersistFailed) {
          throwIfAborted(signal);
          try {
            await replaceLessonPlan(contextResult.value, planId, {
              title: effectiveOutline.title,
              sourcePrompt: effectiveSourcePrompt,
              subjectLabel: `${body.confirmation.subject.name} · Unit ${body.confirmation.unit.unitNumber}`,
              courseId: persistedCourseId,
              unitId: persistedUnitId,
              topicIds: persistedTopicIds,
              learningObjectiveCodes,
              essentialKnowledge,
              preferences: body.confirmation.preferences,
              sections: generatedSections,
            });
            writeData(
              "data-lesson-warning",
              {
                message: "检测到章节写入异常，已完成一次整体保存修复。",
              },
              { transient: true },
            );
          } catch (repairError) {
            const repairMessage =
              repairError instanceof Error ? repairError.message : "整体保存修复失败";
            console.error("replaceLessonPlan repair failed", {
              planId,
              message: repairMessage,
            });
            writeData(
              "data-lesson-warning",
              {
                message: `教案已生成，但保存出现异常：${repairMessage}。可先使用当前结果，再尝试手动保存。`,
              },
              { transient: true },
            );
          }
        }

        writeData(
          "data-lesson-pipeline",
          {
            materialCount: uploadedMaterials.length,
            webQueryCount: webEnrichment?.queries.length ?? 0,
            webReferenceCount: webEnrichment?.references.length ?? 0,
            timingsMs: {
              ...stage,
              totalMs: Date.now() - totalStartedAt,
            },
          },
          { transient: true },
        );

        throwIfAborted(signal);
        void (async () => {
          try {
            const persistedLessonPlan = await getLessonPlanById(contextResult.value, planId);
            if (persistedLessonPlan && contextResult.value.supabase) {
              await syncLessonPlanContentLibraryItem({
                supabase: contextResult.value.supabase,
                teacherId: contextResult.value.teacherId,
                planId: persistedLessonPlan.id,
              });
            }
          } catch (contentLibraryError) {
            console.error("同步内容库失败（后台）", {
              planId,
              message:
                contentLibraryError instanceof Error
                  ? contentLibraryError.message
                  : "unknown_error",
            });
          }
        })();

        const sourceAssetIds = body.sourceAssetIds ?? [];
        if (sourceAssetIds.length > 0 && contextResult.value.supabase) {
          void autoArchiveGeneratedContent({
            supabase: contextResult.value.supabase,
            teacherId: contextResult.value.teacherId,
            title: effectiveOutline.title || "教案",
            refEntityType: "lesson_plan",
            refEntityId: planId,
            sourceAssetIds,
            courseId: persistedCourseId || undefined,
            unitId: persistedUnitId || undefined,
          }).catch((err) => {
            console.error("教案自动归档失败（后台）", err instanceof Error ? err.message : err);
          });
        }

        throwIfAborted(signal);
        writeData("data-lesson-complete", { planId });

        if (quotaIdempotencyKey && contextResult.value.supabase) {
          await finalizeQuotaSpendSafe(contextResult.value.supabase, {
            teacherId: contextResult.value.teacherId,
            action: "generate_lesson_plan",
            idempotencyKey: quotaIdempotencyKey,
            metadata: {
              route: "/api/lesson-plans/generate",
              quick: parsed.isQuick,
              materialCount: materialFiles.length,
              enableWebSearch: body.enableWebSearch ?? false,
            },
          });
        }

        writer.write({ type: "finish", finishReason: "stop" });
      } catch (error) {
        if (abortController.signal.aborted && !timeoutWarningSent) {
          timeoutWarningSent = true;
          writeData(
            "data-lesson-warning",
            {
              message: getAbortMessage(abortController.signal),
            },
            { transient: true },
          );
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: mergeHeaders(
      {
        "Cache-Control": "no-cache, no-transform",
      },
      buildQuotaHeaders(quotaAdmission, { snapshot: "admission" }),
    ),
  });
}
