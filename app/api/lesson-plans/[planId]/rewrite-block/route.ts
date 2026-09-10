import { z } from "zod";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { syncLessonPlanContentLibraryItem } from "@/lib/content-library/sync";
import {
  assertLessonPlanAiAvailable,
  LessonPlanAiError,
  rewriteBlockWithAi,
} from "@/lib/lesson-plan/ai";
import { getLessonPlanContext } from "@/lib/lesson-plan/context";
import { replaceLessonPlan, getLessonPlanById } from "@/lib/lesson-plan/store";
import { lessonRewriteBlockSchema } from "@/lib/validation/lesson-plan";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";

const paramsSchema = z.object({
  planId: z.string().uuid(),
});

const DEFAULT_SECTION_REWRITE_INSTRUCTION =
  "请在保持教学目标与时长不变的前提下，整体优化该教学环节内容，使课堂动作更具体、可执行、层次更清晰。";

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

  try {
    assertLessonPlanAiAvailable();
    const body = lessonRewriteBlockSchema.parse(
      await parseJsonBody<z.infer<typeof lessonRewriteBlockSchema>>(request),
    );

    const lessonPlan = await getLessonPlanById(contextResult.value, parsedParams.data.planId);
    if (!lessonPlan) {
      return jsonError("NOT_FOUND", "未找到教案", 404);
    }

    const instruction = body.instruction?.trim() || DEFAULT_SECTION_REWRITE_INSTRUCTION;
    const courseName = lessonPlan.subjectLabel.split("·")[0]?.trim() ?? "";

    if (body.sectionId) {
      const section = lessonPlan.sections.find((item) => item.id === body.sectionId);
      if (!section) {
        return jsonError("NOT_FOUND", "未找到目标章节", 404);
      }

      const rewrittenBlocks: typeof section.blocks = [];
      for (let index = 0; index < section.blocks.length; index += 1) {
        const currentBlock = section.blocks[index];
        const rewrittenBlock = await rewriteBlockWithAi({
          sourcePrompt: lessonPlan.sourcePrompt,
          instruction,
          block: currentBlock,
          previousBlock: rewrittenBlocks[index - 1] ?? (index > 0 ? section.blocks[index - 1] : null),
          nextBlock: index < section.blocks.length - 1 ? section.blocks[index + 1] : null,
          topics: [],
          preferences: lessonPlan.preferences,
          courseName,
        });
        rewrittenBlocks.push(rewrittenBlock);
      }

      const rewrittenSection = {
        ...section,
        blocks: rewrittenBlocks,
      };
      const nextSections = lessonPlan.sections.map((item) =>
        item.id === section.id ? rewrittenSection : item,
      );

      await replaceLessonPlan(contextResult.value, lessonPlan.id, {
        title: lessonPlan.title,
        sourcePrompt: lessonPlan.sourcePrompt,
        subjectLabel: lessonPlan.subjectLabel,
        courseId: lessonPlan.courseId,
        unitId: lessonPlan.unitId,
        topicIds: lessonPlan.topicIds,
        learningObjectiveCodes: lessonPlan.learningObjectiveCodes,
        essentialKnowledge: lessonPlan.essentialKnowledge,
        preferences: lessonPlan.preferences,
        sections: nextSections,
      });

      const refreshed = await getLessonPlanById(contextResult.value, lessonPlan.id);
      if (!contextResult.value.isMock && contextResult.value.supabase) {
        await syncLessonPlanContentLibraryItem({
          supabase: contextResult.value.supabase,
          teacherId: contextResult.value.teacherId,
          planId: lessonPlan.id,
        });
      }
      return NextResponse.json({
        section: rewrittenSection,
        lessonPlan: refreshed,
      });
    }

    const blockId = body.blockId;
    if (!blockId) {
      return jsonError("VALIDATION_ERROR", "缺少 blockId", 400);
    }

    const sectionIndex = lessonPlan.sections.findIndex((section) =>
      section.blocks.some((block) => block.id === blockId),
    );

    if (sectionIndex < 0) {
      return jsonError("NOT_FOUND", "未找到目标内容块", 404);
    }

    const section = lessonPlan.sections[sectionIndex];
    const blockIndex = section.blocks.findIndex((block) => block.id === blockId);
    const block = section.blocks[blockIndex];

    const rewritten = await rewriteBlockWithAi({
      sourcePrompt: lessonPlan.sourcePrompt,
      instruction,
      block,
      previousBlock: blockIndex > 0 ? section.blocks[blockIndex - 1] : null,
      nextBlock: blockIndex < section.blocks.length - 1 ? section.blocks[blockIndex + 1] : null,
      topics: [],
      preferences: lessonPlan.preferences,
      courseName,
    });

    const nextSections = lessonPlan.sections.map((currentSection) => {
      if (currentSection.id !== section.id) {
        return currentSection;
      }
      return {
        ...currentSection,
        blocks: currentSection.blocks.map((item) =>
          item.id === rewritten.id ? rewritten : item,
        ),
      };
    });

    await replaceLessonPlan(contextResult.value, lessonPlan.id, {
      title: lessonPlan.title,
      sourcePrompt: lessonPlan.sourcePrompt,
      subjectLabel: lessonPlan.subjectLabel,
      courseId: lessonPlan.courseId,
      unitId: lessonPlan.unitId,
      topicIds: lessonPlan.topicIds,
      learningObjectiveCodes: lessonPlan.learningObjectiveCodes,
      essentialKnowledge: lessonPlan.essentialKnowledge,
      preferences: lessonPlan.preferences,
      sections: nextSections,
    });

    const refreshed = await getLessonPlanById(contextResult.value, lessonPlan.id);
    if (!contextResult.value.isMock && contextResult.value.supabase) {
      await syncLessonPlanContentLibraryItem({
        supabase: contextResult.value.supabase,
        teacherId: contextResult.value.teacherId,
        planId: lessonPlan.id,
      });
    }

    return NextResponse.json({
      block: rewritten,
      lessonPlan: refreshed,
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }
    if (error instanceof LessonPlanAiError) {
      return jsonError(error.code, error.message, error.status);
    }

    console.error("重写内容块失败", error);
    return jsonError("INTERNAL_ERROR", "重写内容块失败", 500);
  }
}
