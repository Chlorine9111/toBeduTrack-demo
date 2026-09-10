import { tool } from "ai";
import { z } from "zod";
import { buildArtifactRenderSnapshot } from "@/lib/agent/artifact-render-snapshot";
import {
  LESSON_PLAN_KEYWORD_PATTERN,
  LESSON_PLAN_REFINE_PATTERN,
} from "@/lib/agent/chat-shared";
import { generateLessonPlanWithWorkflow } from "@/lib/agent/lesson-plan-workflow";
import {
  buildLessonPlanDocumentFromMarkdown,
  serializeDocumentToMarkdown,
} from "@/lib/doc-engine/adapters";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import type { AgentChatToolsParams } from "@/lib/agent/tools/types";
import { rememberGeneratedArtifact } from "@/lib/agent/tools/source-artifact";
import {
  artifactDeltaResult,
  errorResult,
  successArtifactResult,
} from "@/lib/agent/tools/tool-result";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildGenerateLessonPlanWorkflowTool(params: AgentChatToolsParams) {
  return tool({
    description:
      "生成教案 / 课时设计 / lesson plan。用于「帮我备课」「生成教案」「做一个课时设计」「帮我写 Unit 3 的教学设计」。自动整合上传材料和知识库。",
    inputSchema: z.object({
      teacherRequest: z.string().trim().min(1).max(3000).optional(),
      durationMinutes: z.number().int().min(20).max(180).optional(),
      includeWebSearch: z.boolean().optional(),
    }),
    execute: async function* ({ teacherRequest, durationMinutes, includeWebSearch }) {
      const normalized = (teacherRequest || params.latestUserPrompt || "").trim();
      if (!normalized) {
        yield errorResult(
          "lesson_plan",
          "缺少教师需求",
          "请提供教学主题、课型或目标学段，例如：高一函数单调性，45 分钟新授课。",
        );
        return;
      }

      const looksLikeLessonPlan = LESSON_PLAN_KEYWORD_PATTERN.test(normalized);
      const requestText = looksLikeLessonPlan
        ? normalized
        : `请基于以下需求生成完整教案：${normalized}`;

      yield { status: "generating", text: "正在生成教案..." };

      try {
        const deltaQueue: string[] = [];
        let streamFinished = false;

        const workflowPromise = generateLessonPlanWithWorkflow({
          model: getResolvedLanguageModelForTask("assistant_lesson_plan"),
          teacherId: params.teacherId,
          teacherRequest: requestText,
          durationMinutes,
          includeWebSearch,
          uploadedMaterials: params.uploaded.materials,
          previousLessonPlan: LESSON_PLAN_REFINE_PATTERN.test(requestText)
            ? params.latestAssistantPrompt
            : "",
          onTextDelta: async (delta) => {
            if (delta) {
              deltaQueue.push(delta);
            }
          },
        });

        const resultPromise = workflowPromise.finally(() => {
          streamFinished = true;
        });

        while (!streamFinished || deltaQueue.length > 0) {
          while (deltaQueue.length > 0) {
            const delta = deltaQueue.shift();
            if (!delta) continue;
            yield artifactDeltaResult({
              kind: "lesson-plan",
              delta,
              title: "教案（生成中）",
              summary: "正在流式生成教案正文。",
              previewText: "正在生成教案正文...",
            });
          }

          if (!streamFinished) {
            await sleep(32);
          }
        }

        const result = await resultPromise;
        const lessonDocument = buildLessonPlanDocumentFromMarkdown(result.markdown);
        const rawContent =
          result.markdown.trim() ||
          (lessonDocument ? serializeDocumentToMarkdown(lessonDocument) : "");
        const title = lessonDocument?.title?.trim() || "完整教案";
        const summary =
          result.markdown
            .split(/\n+/)
            .map((line) => line.replace(/^#+\s*/, "").trim())
            .find((line) => line && !line.startsWith(">"))
            ?.slice(0, 140) ||
          "教案已生成，请在右侧 Canvas 查看完整正文。";
        const artifactSnapshot = buildArtifactRenderSnapshot({
          kind: "lesson-plan",
          title,
          summary,
          rawContent,
          document: lessonDocument,
          sourceStage: "complete",
        });

        if (artifactSnapshot.integrityStatus === "invalid") {
          yield errorResult(
            "lesson_plan",
            "教案正文未完整生成，本次结果只保留临时预览，请重试。",
            "请重试一次，或缩短要求后再生成。",
            {
              materialCount: params.uploaded.materials.length,
              warnings: params.uploaded.warnings,
            },
          );
          return;
        }

        const artifactPayload = {
          kind: "lesson-plan" as const,
          title: artifactSnapshot.title,
          summary: artifactSnapshot.summary,
          rawContent: artifactSnapshot.rawContent,
          document: artifactSnapshot.document,
          htmlContent: artifactSnapshot.htmlContent,
          layoutConfig: artifactSnapshot.layoutConfig,
          renderVersion: artifactSnapshot.renderVersion,
          sourceStage: artifactSnapshot.sourceStage,
          integrityStatus: artifactSnapshot.integrityStatus,
          previewText: "教案已生成，正在同步到右侧 Canvas。",
        };
        rememberGeneratedArtifact(params.runtime, "lesson_plan", artifactPayload);

        yield successArtifactResult(
          "lesson_plan",
          title,
          `已生成「${title}」，右侧 Canvas 可查看完整教案。`,
          1,
          ["可以继续细化课时结构或导出 PDF"],
          artifactPayload,
          {
            warnings: [...params.uploaded.warnings, ...(result.warnings ?? [])],
            knowledgeCount: result.knowledgeCount,
            materialCount: result.materialCount,
            mode: result.mode,
            revisionRounds: result.revisionRounds,
            qualityAudit: result.qualityAudit,
            auditMode: result.auditMode,
            timings: result.timings,
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误";
        yield errorResult("lesson_plan", message, "请重试", {
          materialCount: params.uploaded.materials.length,
          warnings: params.uploaded.warnings,
        });
      }
    },
  });
}
