import { tool } from "ai";
import { z } from "zod";
import { buildArtifactRenderSnapshot } from "@/lib/agent/artifact-render-snapshot";
import { resolveApExerciseCurriculum } from "@/lib/agent/exercise-curriculum";
import {
  extractRequestedRubricDimensionCount,
  extractRequestedRubricDimensionNames,
  extractRequestedRubricTitle,
} from "@/lib/ai/prompt-assembler";
import { parseIntentFromText } from "@/lib/chat/intent";
import { generateRubricDetail } from "@/lib/rubric/generation";
import { buildTaskAwareMaterialContext } from "@/lib/agent/material-context";
import type { AgentChatToolsParams } from "@/lib/agent/tools/types";
import { rememberGeneratedArtifact } from "@/lib/agent/tools/source-artifact";
import {
  artifactDeltaResult,
  errorResult,
  successArtifactResult,
} from "@/lib/agent/tools/tool-result";
import { buildRubricHtml } from "@/lib/doc-engine/html-templates";
import {
  buildRubricDocumentFromDetail,
  serializeDocumentToMarkdown,
} from "@/lib/doc-engine/adapters";

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = `${value ?? ""}`.trim();
    if (normalized) return normalized;
  }
  return "";
}

function buildRubricStreamingScaffold(teacherRequest: string) {
  const requestedTitle = extractRequestedRubricTitle(teacherRequest)?.trim() || "Rubric";
  const requestedDimensionNames = extractRequestedRubricDimensionNames(teacherRequest)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
  const requestedDimensionCount = extractRequestedRubricDimensionCount(teacherRequest);
  const baseDimensionCount = requestedDimensionCount ?? requestedDimensionNames.length;
  const dimensionCount = Math.max(
    3,
    Math.min(6, baseDimensionCount || 4),
  );
  const dimensions =
    requestedDimensionNames.length > 0
      ? requestedDimensionNames
      : Array.from({ length: dimensionCount }, (_, index) => `评分维度 ${index + 1}`);

  return [
    `# ${requestedTitle}`,
    "",
    "> 正在生成评分等级描述，完成后会自动替换为正式 Rubric。",
    "",
    "| 维度 | 4 优秀 | 3 良好 | 2 达标 | 1 待加强 |",
    "| --- | --- | --- | --- | --- |",
    ...dimensions.map(
      (dimension) =>
        `| ${dimension} | 正在生成中... | 正在生成中... | 正在生成中... | 正在生成中... |`,
    ),
  ].join("\n");
}

export function buildGenerateRubricTool(params: AgentChatToolsParams) {
  return tool({
    description:
      "生成评分标准 / rubric / 评分量表。用于「帮我做一个 rubric」「生成评分标准」「设计评分量表」。支持 AP 和通用学科，不需要 courseId，可仅凭学科和主题描述生成。",
    inputSchema: z.object({
      teacherRequest: z
        .string()
        .trim()
        .min(1)
        .max(3000)
        .describe("教师的具体需求描述"),
      track: z
        .enum(["ap", "general"])
        .optional()
        .describe("AP 课程轨道还是通用学科"),
      previousRubric: z
        .string()
        .max(10000)
        .optional()
        .describe("上一版 Rubric 内容（续写/修改时提供）"),
    }),
    execute: async function* ({ teacherRequest, track: inputTrack, previousRubric }) {
      const normalized = (teacherRequest || params.latestUserPrompt || "").trim();
      if (!normalized) {
        yield errorResult("rubric", "缺少 Rubric 需求描述", "请提供需要评分的任务描述，例如：帮我设计一个 AP Chemistry 实验报告的评分标准。");
        return;
      }

      yield { status: "generating", text: "正在生成评分标准..." };
      yield artifactDeltaResult({
        kind: "rubric",
        delta: buildRubricStreamingScaffold(normalized),
        title: `${extractRequestedRubricTitle(normalized)?.trim() || "Rubric"}（生成中）`,
        summary: "正在生成 Rubric 正文。",
        previewText: "正在生成 Rubric 正文...",
      });

      // 注入引用资料上下文
      const materialContext = buildTaskAwareMaterialContext({
        materials: params.uploaded.materials,
        taskKind: "rubric",
        query: normalized,
        maxLength: 2000,
      });
      const materialEnriched = materialContext
        ? `${normalized}\n\n--- 教师选定的参考资料 ---\n${materialContext}\n请基于以上资料设计评分维度和等级描述。`
        : normalized;

      const fullRequest = previousRubric
        ? `以下是上一版 Rubric 内容，请在此基础上按用户要求修改（而非从零重新生成）：\n\n${previousRubric}\n\n${materialEnriched}`
        : materialEnriched;

      try {
        const curriculum = await resolveApExerciseCurriculum({
          supabase: params.supabase,
          promptText: fullRequest,
        });

        const parsedIntent = parseIntentFromText(fullRequest);
        const generalTopic = firstNonEmpty(
          parsedIntent.topic,
          parsedIntent.topicFocus,
          parsedIntent.topicHint,
          normalized,
          "当前作业任务",
        );

        const resolvedTrack =
          inputTrack ??
          (curriculum.courseId &&
          (parsedIntent.track === "ap" ||
            Boolean(parsedIntent.courseHint) ||
            /\bap\b/i.test(fullRequest))
            ? "ap"
            : "general");

        const rubric = await generateRubricDetail({
          supabase: params.supabase,
          teacherId: params.teacherId,
          track: resolvedTrack,
          courseId: resolvedTrack === "ap" ? curriculum.courseId ?? undefined : undefined,
          unitId: resolvedTrack === "ap" ? curriculum.unitId ?? undefined : undefined,
          topic: resolvedTrack === "general" ? generalTopic : undefined,
          subjectCategory:
            resolvedTrack === "general"
              ? firstNonEmpty(parsedIntent.subjectCategory)
              : undefined,
          gradeLevel:
            resolvedTrack === "general" ? firstNonEmpty(parsedIntent.gradeLevel) : undefined,
          teacherRequest: fullRequest,
        });

        const rubricDocument = buildRubricDocumentFromDetail(rubric);
        const rawContent = serializeDocumentToMarkdown(rubricDocument);
        const htmlContent = buildRubricHtml({
          title: rubric.title,
          subtitle: `${rubric.course.name}${rubric.unit?.title ? ` · ${rubric.unit.title}` : ""}`,
          dimensions: rubric.dimensions.map((d) => ({
            name: d.name,
            weight: (d as { weight?: number }).weight ?? null,
            levels: d.levels.map((l) => ({
              label: l.level.charAt(0).toUpperCase() + l.level.slice(1),
              score: l.score,
              description: l.description,
            })),
          })),
        });

        const summary = `已为您生成 ${rubric.dimensions.length} 个评分维度的 Rubric（${rubric.course.name}${rubric.unit?.title ? ` · ${rubric.unit.title}` : ""}），请在右侧 Canvas 查看完整评分表。`;
        const artifactSnapshot = buildArtifactRenderSnapshot({
          kind: "rubric",
          title: rubric.title,
          summary,
          rawContent,
          document: rubricDocument,
          htmlContent,
          sourceStage: "complete",
        });

        if (artifactSnapshot.integrityStatus === "invalid") {
          yield errorResult(
            "rubric",
            "Rubric 正文未完整生成，本次结果只保留临时预览，请重试。",
            "请重试一次，或缩短要求后再生成。",
          );
          return;
        }

        const artifactPayload = {
          kind: "rubric" as const,
          title: artifactSnapshot.title,
          summary: artifactSnapshot.summary,
          rawContent: artifactSnapshot.rawContent,
          document: artifactSnapshot.document,
          htmlContent: artifactSnapshot.htmlContent,
          layoutConfig: artifactSnapshot.layoutConfig,
          renderVersion: artifactSnapshot.renderVersion,
          sourceStage: artifactSnapshot.sourceStage,
          integrityStatus: artifactSnapshot.integrityStatus,
          previewText: "Rubric 已生成，正在同步到右侧 Canvas。",
        };
        rememberGeneratedArtifact(params.runtime, "rubric", artifactPayload);

        yield successArtifactResult(
          "rubric",
          rubric.title,
          summary,
          rubric.dimensions.length,
          ["在右侧 Canvas 查看完整评分表", "可以继续调整评分维度和等级描述"],
          artifactPayload,
          {
            rubricId: rubric.id,
            track: resolvedTrack,
            htmlContent,
            rawContent,
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误";
        yield errorResult("rubric", message, "请补充学科和评分任务描述后重试。");
      }
    },
  });
}
