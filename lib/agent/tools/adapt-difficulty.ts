import { tool } from "ai";
import { z } from "zod";
import { buildArtifactRenderSnapshot } from "@/lib/agent/artifact-render-snapshot";
import { buildTaskAwareMaterialContext } from "@/lib/agent/material-context";
import {
  rememberGeneratedArtifact,
  resolveSourceArtifact,
} from "@/lib/agent/tools/source-artifact";
import type { AgentChatToolsParams } from "@/lib/agent/tools/types";
import {
  artifactDeltaResult,
  errorResult,
  successArtifactResult,
} from "@/lib/agent/tools/tool-result";
import { streamGatewayText } from "@/lib/ai/gateway";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import type { ArtifactRole } from "@/lib/agent/artifact-payload";

type DifficultyAdaptMode =
  | "easier"
  | "harder"
  | "challenge"
  | "scaffold";

const DIFFICULTY_HINTS: Record<
  DifficultyAdaptMode,
  { label: string; instruction: string }
> = {
  easier: {
    label: "降一档",
    instruction:
      "把任务难度降一档，保留相同学习目标，但降低认知负荷，减少隐含跳步，增加必要引导。",
  },
  harder: {
    label: "提高一档",
    instruction:
      "把任务难度提高一档，保留相同学习目标，但提升推理深度、综合度和迁移要求。",
  },
  challenge: {
    label: "Challenge 版",
    instruction:
      "面向 honors/challenge 学生，加入更高阶思维要求、延伸题或更严格表现门槛。",
  },
  scaffold: {
    label: "支架强化版",
    instruction:
      "增加脚手架和分步提示，使学生更容易完成，但不改变核心目标。",
  },
};

const RUBRIC_ADAPT_SYSTEM_PROMPT = [
  "你是教师 Rubric 调优助手。",
  "你的任务是在保留原 Rubric 核心目标和结构的前提下，调整难度梯度与表现描述。",
  "输出必须是 Markdown 表格，且能直接渲染成 Rubric。",
  "表头至少包含：维度 | 权重 | 优秀 | 良好 | 达标 | 待提升。",
  "不要输出代码块围栏。",
].join("\n");

const DOCUMENT_ADAPT_SYSTEM_PROMPT = [
  "你是教师文档改写助手。",
  "你的任务是在保留原教学目标与大结构的前提下，对现有 worksheet / exam / exercises 做难度梯度变体。",
  "输出必须是 Markdown，第一行必须是一级标题（# 标题）。",
  "你可以调整脚手架、提问方式、题量细节和 challenge 项，但不要偏离原主题。",
  "",
  "长度控制：",
  "- 质量优先于数量，但不要人为缩短内容",
  "- 必须输出完整文档，不要在中间截断",
  "",
  "不要输出代码块围栏。",
].join("\n");

function resolveAdaptMode(prompt: string): DifficultyAdaptMode {
  if (/(challenge|honors|拔高|挑战|提升思维|高阶)/i.test(prompt)) {
    return "challenge";
  }
  if (/(支架|分步提示|scaffold|更容易上手|降低门槛)/i.test(prompt)) {
    return "scaffold";
  }
  if (/(更难|提高一档|提难|harder|advanced|更高阶)/i.test(prompt)) {
    return "harder";
  }
  return "easier";
}

function extractTitle(markdown: string, fallback: string) {
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  return titleMatch?.[1]?.trim() || fallback;
}

export function buildAdaptDifficultyTool(params: AgentChatToolsParams) {
  return tool({
    description:
      "基于已有文档调整难度梯度。用于「降一档」「更简单」「加 challenge 版」「honors 版」「增强支架」。必须有之前生成的文档作为源。",
    inputSchema: z.object({
      teacherRequest: z.string().trim().min(1).max(12_000),
    }),
    execute: async function* ({ teacherRequest }) {
      const normalized = (teacherRequest || params.latestUserPrompt || "").trim();
      if (!normalized) {
        yield errorResult("difficulty_variant", "缺少难度调节需求", "请说明要把哪份文档调难或调易。");
        return;
      }

      yield { status: "generating", text: "正在调整文档难度..." };

      try {
        const sourceArtifact = resolveSourceArtifact(params.runtime, [
          "worksheet",
          "exam",
          "exercises",
          "rubric",
        ]);

        if (!sourceArtifact) {
          yield errorResult(
            "difficulty_variant",
            "当前对话里没有可调节难度的 worksheet / exam / rubric。",
            "请先生成一份文档型产物，再要求降一档或加 challenge。",
          );
          return;
        }

        const adaptMode = resolveAdaptMode(normalized);
        const difficultyHint = DIFFICULTY_HINTS[adaptMode];
        const outputKind = sourceArtifact.artifact.kind;
        const artifactRole: ArtifactRole =
          sourceArtifact.source === "current_turn" ? "auxiliary" : "primary";
        const materialContext =
          params.uploaded.materials.length > 0
            ? buildTaskAwareMaterialContext({
                materials: params.uploaded.materials,
                taskKind: outputKind === "rubric" ? "rubric" : "exercise",
                query: normalized,
                maxLength: 2500,
              })
            : "";
        const prompt = [
          `教师请求：\n${normalized}`,
          `调整目标：${difficultyHint.instruction}`,
          `原文档标题：${sourceArtifact.artifact.title}`,
          `原文档正文：\n${sourceArtifact.artifact.rawContent}`,
          materialContext ? `\n参考资料：\n${materialContext}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        const { result } = streamGatewayText({
          model: getResolvedLanguageModelForTask(
            outputKind === "rubric" ? "assistant_lesson_plan" : "assistant_exercises",
          ),
          system:
            outputKind === "rubric"
              ? RUBRIC_ADAPT_SYSTEM_PROMPT
              : DOCUMENT_ADAPT_SYSTEM_PROMPT,
          prompt,
          maxOutputTokens: 16000,
          temperature: 0.5,
          timeout: 90_000,
        });

        let markdown = "";
        for await (const delta of result.textStream) {
          if (!delta) continue;
          markdown += delta;
          yield artifactDeltaResult({
            kind: outputKind,
            artifactRole,
            artifactVariant: "difficulty_variant",
            delta,
            title: `${difficultyHint.label}（生成中）`,
            summary: "正在流式生成难度变体。",
            previewText: "正在生成难度调节版本...",
          });
        }

        if (!markdown.trim()) {
          yield errorResult("difficulty_variant", "难度变体生成失败", "AI 未返回内容，请重试。");
          return;
        }

        const fallbackTitle = `${difficultyHint.label} · ${sourceArtifact.artifact.title}`;
        const title = extractTitle(markdown, fallbackTitle);
        const summary = `已基于「${sourceArtifact.artifact.title}」生成${difficultyHint.label}版本。`;
        const artifactSnapshot = buildArtifactRenderSnapshot({
          kind: outputKind,
          title,
          summary,
          rawContent: markdown,
          sourceStage: "complete",
          allowLegacyFallback: true,
        });

        if (artifactSnapshot.integrityStatus === "invalid") {
          yield errorResult(
            "difficulty_variant",
            "难度变体正文未完整生成，本次结果只保留临时预览，请重试。",
            "请重试一次，或把调整要求写得更具体。",
          );
          return;
        }

        const artifactPayload = {
          kind: outputKind,
          artifactRole,
          artifactVariant: "difficulty_variant" as const,
          title: artifactSnapshot.title,
          summary: artifactSnapshot.summary,
          rawContent: artifactSnapshot.rawContent,
          document: artifactSnapshot.document,
          htmlContent: artifactSnapshot.htmlContent,
          layoutConfig: artifactSnapshot.layoutConfig,
          renderVersion: artifactSnapshot.renderVersion,
          sourceStage: artifactSnapshot.sourceStage,
          integrityStatus: artifactSnapshot.integrityStatus,
          previewText: `${difficultyHint.label}版本已生成，正在同步到右侧 Canvas。`,
        };
        rememberGeneratedArtifact(params.runtime, "difficulty_variant", artifactPayload);

        yield successArtifactResult(
          "difficulty_variant",
          title,
          summary,
          1,
          ["可继续再降一档", "可继续生成配套答案解析"],
          artifactPayload,
          {
            sourceTitle: sourceArtifact.artifact.title,
            sourceKind: outputKind,
            adaptMode,
            sourceOrigin: sourceArtifact.source,
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误";
        yield errorResult("difficulty_variant", `难度变体生成失败: ${message}`, "请重试。");
      }
    },
  });
}
