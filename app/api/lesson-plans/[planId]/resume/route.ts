import { z } from "zod";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { jsonError } from "@/lib/api/response";
import { syncLessonPlanContentLibraryItem } from "@/lib/content-library/sync";
import {
  assertLessonPlanAiAvailable,
  generateSectionBlocksWithAi,
  LessonPlanAiError,
} from "@/lib/lesson-plan/ai";
import { getLessonPlanContext } from "@/lib/lesson-plan/context";
import {
  appendLessonPlanSection,
  getLessonPlanById,
} from "@/lib/lesson-plan/store";
import type { LessonPlanSection } from "@/lib/lesson-plan/types";
import { lessonGenerateRequestSchema } from "@/lib/validation/lesson-plan";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";


const paramsSchema = z.object({
  planId: z.string().uuid(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ planId: string }> },
) {
  const contextResult = await getLessonPlanContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return jsonError("VALIDATION_ERROR", "教案 ID 不合法", 400);
  }

  let body: z.infer<typeof lessonGenerateRequestSchema>;
  try {
    body = lessonGenerateRequestSchema.parse(
      await parseJsonBody<z.infer<typeof lessonGenerateRequestSchema>>(request),
    );
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }
    return jsonError("INTERNAL_ERROR", "请求参数解析失败", 500);
  }

  const existingPlan = await getLessonPlanById(contextResult.value, parsedParams.data.planId);
  if (!existingPlan) {
    return jsonError("NOT_FOUND", "未找到教案", 404);
  }

  try {
    assertLessonPlanAiAvailable();
  } catch (error) {
    if (error instanceof LessonPlanAiError) {
      return jsonError(error.code, error.message, error.status);
    }
    throw error;
  }

  const stream = createUIMessageStream({
    onError: (error) => (error instanceof Error ? error.message : "继续生成失败"),
    execute: async ({ writer }) => {
      const writeData = (type: `data-${string}`, data: Record<string, unknown>) => {
        writer.write({ type, data });
      };

      writer.write({ type: "start" });
      try {
        const existingSectionIds = new Set(existingPlan.sections.map((section) => section.id));
        const currentSections = [...existingPlan.sections].sort(
          (a, b) => a.sortOrder - b.sortOrder,
        );
        const pendingSections = body.outline.sections.filter(
          (section) => !existingSectionIds.has(section.id),
        );

        writeData("data-lesson-meta", {
          planId: existingPlan.id,
          title: existingPlan.title,
          totalSections: body.outline.sections.length,
          completedSections: existingSectionIds.size,
        });

        if (pendingSections.length === 0) {
          writeData("data-lesson-complete", { planId: existingPlan.id });
          writer.write({ type: "finish", finishReason: "stop" });
          return;
        }

        for (let index = 0; index < pendingSections.length; index += 1) {
          const section = pendingSections[index];
          const sectionOutlineIndex = body.outline.sections.findIndex((item) => item.id === section.id);
          const sectionWarningIssues: string[] = [];

          const blocks = await generateSectionBlocksWithAi({
            sourcePrompt: body.sourcePrompt,
            section,
            topics: body.confirmation.topics,
            preferences: body.confirmation.preferences,
            previousSummary:
              sectionOutlineIndex > 0
                ? body.outline.sections[sectionOutlineIndex - 1].summary
                : undefined,
            nextSummary:
              sectionOutlineIndex < body.outline.sections.length - 1
                ? body.outline.sections[sectionOutlineIndex + 1].summary
                : undefined,
            sectionIndex: sectionOutlineIndex < 0 ? index : sectionOutlineIndex,
            totalSections: body.outline.sections.length,
            allSections: body.outline.sections,
            onWarning: (issues) => {
              sectionWarningIssues.splice(0, sectionWarningIssues.length, ...issues);
            },
          });

          const sectionModel: LessonPlanSection = {
            id: section.id,
            title: section.title,
            summary: section.summary,
            durationMinutes: section.durationMinutes,
            sortOrder: sectionOutlineIndex < 0 ? index : sectionOutlineIndex,
            blocks,
          };

          await appendLessonPlanSection(contextResult.value, existingPlan.id, sectionModel);
          currentSections.push(sectionModel);
          currentSections.sort((a, b) => a.sortOrder - b.sortOrder);

          const completedCount = existingSectionIds.size + index + 1;
          writeData("data-lesson-section", {
            section: sectionModel,
            progress: Math.round((completedCount / body.outline.sections.length) * 100),
            completedSections: completedCount,
            totalSections: body.outline.sections.length,
          });
          if (sectionWarningIssues.length > 0) {
            writeData("data-lesson-section-warning", {
              sectionIndex: sectionOutlineIndex < 0 ? index : sectionOutlineIndex,
              sectionId: section.id,
              issues: sectionWarningIssues,
            });
          }
        }

        if (!contextResult.value.isMock && contextResult.value.supabase) {
          await syncLessonPlanContentLibraryItem({
            supabase: contextResult.value.supabase,
            teacherId: contextResult.value.teacherId,
            planId: existingPlan.id,
          });
        }

        writeData("data-lesson-complete", { planId: existingPlan.id });
        writer.write({ type: "finish", finishReason: "stop" });
      } catch (error) {
        writer.write({
          type: "error",
          errorText: error instanceof Error ? error.message : "继续生成失败",
        });
        writer.write({ type: "finish", finishReason: "error" });
      }
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: {
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
