import { tool } from "ai";
import { z } from "zod";
import { buildArtifactRenderSnapshot } from "@/lib/agent/artifact-render-snapshot";
import { buildTaskAwareMaterialContext } from "@/lib/agent/material-context";
import {
  artifactCanGenerateAnswerKey,
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

const ANSWER_KEY_SYSTEM_PROMPT = [
  "你是教师答案与解析助手。",
  "你的任务是基于现有题目生成教师用 answer key。",
  "",
  "输出要求：",
  "1. 输出 Markdown，第一行必须是一级标题（# 标题）。",
  "2. 每道题都必须有明确答案。",
  "3. 每道题都必须有简洁但可教学使用的解析。",
  "4. 对 guided notes / activity sheet / discussion prompts / quick check 这类 worksheet，也要生成教师版参考答案、示例回答或实施提示。",
  "5. 选择题要说明正确选项与理由；开放题要给评分点或关键解法；无唯一答案的活动题要给出可接受答案示例与教师提示。",
  "6. 尽量沿用原题/原活动结构，不要随意删题。",
  "",
  "长度控制：",
  "- 必须输出完整答案文档，不要在中间截断",
  "- 每道题的解析保持简洁但完整",
  "",
  "7. 不要输出代码块围栏。",
].join("\n");

function looksLikeQuestionPrompt(prompt: string) {
  return /(^|\n)(?:\d+[.)]|第[一二三四五六七八九十\d]+题|Q\d+[:：])|(?:\n|\r)\s*[A-DＡ-Ｄ][.)、]|答案[:：]|解析[:：]/i.test(
    prompt,
  );
}

function extractTitle(markdown: string, fallback: string) {
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  return titleMatch?.[1]?.trim() || fallback;
}

export function buildGenerateAnswerKeyTool(params: AgentChatToolsParams) {
  return tool({
    description:
      "给已有的 worksheet / 试卷 / 习题生成答案与解析页。用于「附答案解析」「生成 answer key」「配详细解析」。通常在主文档（worksheet/exercises）生成之后调用。",
    inputSchema: z.object({
      teacherRequest: z.string().trim().min(1).max(20_000),
      sourceContent: z.string().trim().max(60_000).optional(),
      sourceTitle: z.string().trim().max(500).optional(),
    }),
    execute: async function* ({ teacherRequest, sourceContent, sourceTitle }) {
      const normalized = (teacherRequest || params.latestUserPrompt || "").trim();
      if (!normalized) {
        yield errorResult("answer_key", "缺少答案生成需求", "请说明要为哪份题目生成答案和解析。");
        return;
      }

      yield { status: "generating", text: "正在生成答案与解析..." };

      try {
        const sourceArtifact = resolveSourceArtifact(params.runtime, [
          "worksheet",
          "exam",
          "exercises",
        ]);
        const artifactRole: ArtifactRole =
          sourceArtifact?.source === "current_turn" ? "auxiliary" : "primary";
        const fallbackSourceContent =
          sourceArtifact?.artifact.rawContent?.trim() ||
          (looksLikeQuestionPrompt(normalized) ? normalized : "");
        const baseSourceContent = (sourceContent || fallbackSourceContent).trim();
        const baseSourceTitle =
          sourceTitle?.trim() ||
          sourceArtifact?.artifact.title?.trim() ||
          "当前题目";

        if (!baseSourceContent) {
          yield errorResult(
            "answer_key",
            "当前对话里没有可用于生成答案的题目内容。",
            "请先生成一份题目，或把题目文本直接粘贴过来。",
          );
          return;
        }

        if (
          sourceArtifact?.artifact &&
          !artifactCanGenerateAnswerKey(sourceArtifact.artifact)
        ) {
          yield errorResult(
            "answer_key",
            "当前文档缺少可回答的题目或活动内容，不能直接生成答案。",
            "请先生成包含问题/活动的 worksheet / exam，或直接粘贴题目文本。",
          );
          return;
        }

        const materialContext =
          !sourceArtifact && params.uploaded.materials.length > 0
            ? buildTaskAwareMaterialContext({
                materials: params.uploaded.materials,
                taskKind: "exercise",
                query: normalized,
                maxLength: 2500,
              })
            : "";
        const prompt = [
          `教师请求：\n${normalized}`,
          `题目标题：${baseSourceTitle}`,
          `题目正文：\n${baseSourceContent}`,
          materialContext ? `\n参考资料：\n${materialContext}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        const { result } = streamGatewayText({
          model: getResolvedLanguageModelForTask("assistant_exercises"),
          system: ANSWER_KEY_SYSTEM_PROMPT,
          prompt,
          maxOutputTokens: 16000,
          temperature: 0.3,
          timeout: 90_000,
        });

        let markdown = "";
        for await (const delta of result.textStream) {
          if (!delta) continue;
          markdown += delta;
          yield artifactDeltaResult({
            kind: "worksheet",
            artifactRole,
            artifactVariant: "answer_key",
            delta,
            title: "Answer Key（生成中）",
            summary: "正在流式生成答案与解析。",
            previewText: "正在生成 Answer Key...",
          });
        }

        if (!markdown.trim()) {
          yield errorResult("answer_key", "答案与解析生成失败", "AI 未返回内容，请重试。");
          return;
        }

        const fallbackTitle = `Answer Key · ${baseSourceTitle}`;
        const title = extractTitle(markdown, fallbackTitle);
        const summary = `已为「${baseSourceTitle}」生成独立答案与解析文档。`;
        const artifactSnapshot = buildArtifactRenderSnapshot({
          kind: "worksheet",
          title,
          summary,
          rawContent: markdown,
          sourceStage: "complete",
          allowLegacyFallback: true,
        });

        if (artifactSnapshot.integrityStatus === "invalid") {
          yield errorResult(
            "answer_key",
            "答案文档未完整生成，本次结果只保留临时预览，请重试。",
            "请重试一次，或减少题量后再生成答案。",
          );
          return;
        }

        const artifactPayload = {
          kind: "worksheet" as const,
          artifactRole,
          artifactVariant: "answer_key" as const,
          title: artifactSnapshot.title,
          summary: artifactSnapshot.summary,
          rawContent: artifactSnapshot.rawContent,
          document: artifactSnapshot.document,
          htmlContent: artifactSnapshot.htmlContent,
          layoutConfig: artifactSnapshot.layoutConfig,
          renderVersion: artifactSnapshot.renderVersion,
          sourceStage: artifactSnapshot.sourceStage,
          integrityStatus: artifactSnapshot.integrityStatus,
          previewText: "答案与解析已生成，正在同步到右侧 Canvas。",
        };
        rememberGeneratedArtifact(params.runtime, "answer_key", artifactPayload);

        yield successArtifactResult(
          "answer_key",
          title,
          summary,
          1,
          ["可继续精简解析", "可继续改成教师版/学生版"],
          artifactPayload,
          {
            sourceTitle: baseSourceTitle,
            sourceArtifactKind: sourceArtifact?.artifact.kind,
            sourceOrigin: sourceArtifact?.source ?? (sourceContent ? "inline" : "prompt"),
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误";
        yield errorResult("answer_key", `答案与解析生成失败: ${message}`, "请重试。");
      }
    },
  });
}
