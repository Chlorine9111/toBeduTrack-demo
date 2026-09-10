import { tool } from "ai";
import { z } from "zod";
import { buildArtifactRenderSnapshot } from "@/lib/agent/artifact-render-snapshot";
import { resolveApExerciseCurriculum } from "@/lib/agent/exercise-curriculum";
import {
  inferExplicitDifficultyFromTexts,
  inferExplicitExerciseTypeFromTexts,
} from "@/lib/chat/intent";
import { buildTaskAwareMaterialContext } from "@/lib/agent/material-context";
import { assembleWorksheetFromSemanticSearch } from "@/lib/worksheet/assemble";
import type { AgentChatToolsParams } from "@/lib/agent/tools/types";
import { rememberGeneratedArtifact } from "@/lib/agent/tools/source-artifact";
import { buildWorksheetDocument, serializeDocumentToMarkdown } from "@/lib/doc-engine/adapters";
import {
  errorResult,
  successArtifactResult,
} from "@/lib/agent/tools/tool-result";

export function buildAssembleWorksheetTool(params: AgentChatToolsParams) {
  return tool({
    description:
      "从**题库**调取现有真题组装成试卷。仅当用户明确说「题库」「现成题」「抽题」「从已有题里组卷」时使用。如果用户只说「帮我做 worksheet」而没有提到题库，不要用这个工具，应该用 generate_worksheet。",
    inputSchema: z.object({
      query: z
        .string()
        .trim()
        .min(1)
        .max(500)
        .describe("组卷需求描述（如 'Unit 2 供需相关的10道选择题'）"),
      count: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .describe("期望题目数量"),
      type: z
        .enum(["MC", "FR", "fill_in"])
        .optional()
        .describe("题型筛选"),
      difficulty: z
        .number()
        .int()
        .min(1)
        .max(4)
        .optional()
        .describe("难度筛选（1=简单, 4=困难）"),
    }),
    execute: async function* ({ query, count, type, difficulty }) {
      const rawQuery = (query || params.latestUserPrompt || "").trim();
      if (!rawQuery) {
        yield errorResult("worksheet", "缺少组卷需求描述", "请提供学科/单元/知识点，例如：AP Calculus BC Unit 3 的 10 道选择题。");
        return;
      }

      yield { status: "generating", text: "正在从题库组卷..." };

      // 注入引用资料上下文到查询中，帮助学科识别
      const materialContext = buildTaskAwareMaterialContext({
        materials: params.uploaded.materials,
        taskKind: "exercise",
        query: rawQuery,
        maxLength: 1500,
      });
      const normalized = materialContext
        ? `${rawQuery}\n\n参考资料摘要：${materialContext}`
        : rawQuery;

      try {
        const curriculum = await resolveApExerciseCurriculum({
          supabase: params.supabase,
          promptText: normalized,
        });

        yield { status: "searching", text: "正在匹配题库题目..." };

        const worksheetCount = Math.min(Math.max(count ?? 6, 1), 30);
        const inferredType =
          type ?? inferExplicitExerciseTypeFromTexts([normalized]) ?? undefined;
        const inferredDifficulty =
          difficulty ??
          inferExplicitDifficultyFromTexts([normalized]) ??
          undefined;
        const worksheetTitle = `${curriculum.courseName ?? "题库"}${
          curriculum.unitLabel ? ` · ${curriculum.unitLabel}` : ""
        } Worksheet`;

        const assembled = await assembleWorksheetFromSemanticSearch({
          supabase: params.supabase,
          teacherId: params.teacherId,
          courseId: curriculum.courseId || undefined,
          unitId: curriculum.unitId ?? undefined,
          title: worksheetTitle,
          description: normalized,
          query: normalized,
          type: inferredType,
          difficulty: inferredDifficulty as 1 | 2 | 3 | 4 | undefined,
          count: worksheetCount,
          maxCandidates: Math.min(Math.max(worksheetCount * 3, 12), 18),
          includeSeedExercise: false,
        });

        const nextSteps = assembled.exercises.length > 0
          ? ["可以在 Canvas 中查看和编辑", "导出 PDF", "调整题目顺序或替换"]
          : ["题库匹配题不足，建议放宽条件", "或先生成新题再组卷"];

        const worksheetDocument = buildWorksheetDocument({
          worksheet: assembled.worksheet,
          exercises: assembled.exercises,
          sections: assembled.sections,
          courseName: curriculum.courseName,
          unitName: curriculum.unitLabel,
        });
        const rawContent = serializeDocumentToMarkdown(worksheetDocument);
        const summary =
          `已从题库选取 ${assembled.exercises.length} 道题组成 Worksheet（候选 ${assembled.candidateCount} 道）`;
        const artifactSnapshot = buildArtifactRenderSnapshot({
          kind: "worksheet",
          title: worksheetTitle,
          summary,
          rawContent,
          document: worksheetDocument,
          sourceStage: "complete",
        });

        if (artifactSnapshot.integrityStatus === "invalid") {
          yield errorResult(
            "worksheet",
            "题库组卷正文未完整生成，本次结果只保留临时预览，请重试。",
            "请重试一次，或放宽条件后再组卷。",
          );
          return;
        }

        const artifactPayload = {
          kind: "worksheet" as const,
          title: artifactSnapshot.title,
          summary: artifactSnapshot.summary,
          rawContent: artifactSnapshot.rawContent,
          document: artifactSnapshot.document,
          htmlContent: artifactSnapshot.htmlContent,
          layoutConfig: artifactSnapshot.layoutConfig,
          renderVersion: artifactSnapshot.renderVersion,
          sourceStage: artifactSnapshot.sourceStage,
          integrityStatus: artifactSnapshot.integrityStatus,
          previewText: "题库组卷已完成，正在同步到右侧 Canvas。",
        };
        rememberGeneratedArtifact(params.runtime, "worksheet", artifactPayload);

        yield successArtifactResult(
          "worksheet",
          worksheetTitle,
          summary,
          assembled.exercises.length,
          nextSteps,
          artifactPayload,
          {
            worksheetId: assembled.worksheet.id,
            sectionCount: assembled.sections.length,
            candidateCount: assembled.candidateCount,
            courseName: curriculum.courseName,
            unitLabel: curriculum.unitLabel,
            exercises: assembled.exercises.slice(0, 20).map((item, index) => ({
              questionNumber: index + 1,
              type: item.exerciseType,
              preview: item.questionText.length > 200
                ? `${item.questionText.slice(0, 200)}...`
                : item.questionText,
            })),
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误";
        yield errorResult("worksheet", message, "请补充课程和知识领域后重试。");
      }
    },
  });
}
