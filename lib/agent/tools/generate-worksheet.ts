import { tool } from "ai";
import { z } from "zod";
import { buildArtifactRenderSnapshot } from "@/lib/agent/artifact-render-snapshot";
import { buildTaskAwareMaterialContext } from "@/lib/agent/material-context";
import { streamGatewayText } from "@/lib/ai/gateway";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import type { AgentChatToolsParams } from "@/lib/agent/tools/types";
import { rememberGeneratedArtifact } from "@/lib/agent/tools/source-artifact";
import {
  buildWorksheetContinuationPrompt,
  shouldContinueWorksheetGeneration,
} from "@/lib/agent/tools/generate-worksheet-shared";
import {
  artifactDeltaResult,
  errorResult,
  successArtifactResult,
} from "@/lib/agent/tools/tool-result";
import {
  inferWorksheetDocumentMode,
  WORKSHEET_TYPE_STRUCTURE_HINTS,
} from "@/lib/agent/workflows/worksheet-document";

function buildWorksheetSystemPrompt(teacherRequest: string) {
  const mode = inferWorksheetDocumentMode(teacherRequest);
  const structureHint = WORKSHEET_TYPE_STRUCTURE_HINTS[mode] ?? WORKSHEET_TYPE_STRUCTURE_HINTS.student_handout;
  return [
    "你是经验丰富的教学设计师，擅长将知识点编排成结构清晰、适合课堂使用的 Worksheet。",
    "",
    "设计原则：",
    "1. 形态适配：选择最适合当前需求的 worksheet 形态（guided notes / activity sheet / reading sheet / vocabulary sheet / study guide / student handout）。",
    "2. 学科适配：结构应匹配学科特点——理科侧重公式推导与数据记录，文科侧重文本分析与论证，语言类侧重语境与运用。",
    "3. 可用性：学生拿到就能用，指令清晰、布局可打印、留有书写空间。",
    "4. 认知递进：从低阶认知自然过渡到高阶认知，而非机械罗列。",
    "5. 克制出题：可包含 1-3 个 quick check，但不能退化成刷题卷。",
    "",
    `当前判断的 worksheet 类型为「${mode}」，参考结构：`,
    structureHint,
    "以上仅为参考，应根据学科内容和教师需求灵活调整，不要生搬硬套。",
    "",
    "长度控制：",
    "- 质量优先于数量，但不要人为缩短内容",
    "- 每个 section 按需展开，确保完整覆盖知识点",
    "- 必须输出完整文档，不要在中间截断",
    "",
    "格式要求：",
    "- 第 1 行必须是一级标题（# 标题）",
    "- 输出 Markdown 格式，可直接渲染",
    "- 面向学生语气，清晰易读",
    "- 不要输出代码块围栏",
  ].join("\n");
}

export function buildGenerateWorksheetTool(params: AgentChatToolsParams) {
  return tool({
    description:
      "AI 全新生成课堂材料：worksheet、study guide、guided notes、activity sheet、reading sheet、vocabulary sheet、讲义、学习单、复习单、复习提纲。用于「帮我做一份 worksheet」「生成 study guide」「做 guided notes」「做讲义」「做复习单」等请求。这是 AI 原创生成，不从题库抽题。如果用户没有说「题库」「现成题」，就用这个工具。",
    inputSchema: z.object({
      teacherRequest: z
        .string()
        .trim()
        .min(1)
        .max(3000)
        .describe("教师的 worksheet 生成需求"),
    }),
    execute: async function* ({ teacherRequest }) {
      const normalized = (teacherRequest || params.latestUserPrompt || "").trim();
      if (!normalized) {
        yield errorResult(
          "worksheet",
          "缺少 worksheet 需求描述",
          "请描述您需要什么类型的 worksheet，如「AP Calculus Unit 3 guided notes」",
        );
        return;
      }

      yield { status: "generating", text: "正在生成 Worksheet..." };

      try {
        const materialContext = buildTaskAwareMaterialContext({
          materials: params.uploaded?.materials ?? [],
          taskKind: "general",
          query: normalized,
          maxLength: 4_000,
        });

        const prompt = [
          `教师请求：\n${normalized}`,
          materialContext ? `\n${materialContext}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        const worksheetModel = getResolvedLanguageModelForTask("assistant_lesson_plan");
        const streamMarkdown = async function* (inputPrompt: string) {
          const { result } = streamGatewayText({
            model: worksheetModel,
            system: buildWorksheetSystemPrompt(normalized),
            prompt: inputPrompt,
            maxOutputTokens: 16000,
            temperature: 0.5,
            timeout: 90_000,
          });
          let streamedMarkdown = "";
          for await (const delta of result.textStream) {
            if (!delta) continue;
            streamedMarkdown += delta;
            yield artifactDeltaResult({
              kind: "worksheet",
              delta,
              title: "Worksheet（生成中）",
              summary: "正在流式生成课堂 worksheet 正文。",
              previewText: "正在生成课堂 worksheet...",
            });
          }

          const [finalText, finishReason] = await Promise.all([
            result.text,
            result.finishReason,
          ]);

          return {
            markdown: finalText || streamedMarkdown,
            finishReason,
          };
        };

        const firstPassIterator = streamMarkdown(prompt)[Symbol.asyncIterator]();
        let firstPass: {
          markdown: string;
          finishReason?: string;
        } = {
          markdown: "",
          finishReason: undefined,
        };
        while (true) {
          const next = await firstPassIterator.next();
          if (next.done) {
            firstPass = next.value;
            break;
          }
          yield next.value;
        }
        let markdown = firstPass.markdown;
        let finishReason = firstPass.finishReason;

        if (!markdown.trim()) {
          yield errorResult("worksheet", "Worksheet 生成失败", "AI 未返回内容，请重试");
          return;
        }

        // 提取标题
        const titleMatch = markdown.match(/^#\s+(.+)/m);
        const title = titleMatch?.[1]?.trim() || "Worksheet";
        const summary = markdown.slice(0, 200).replace(/\n/g, " ");

        const artifactSnapshot = buildArtifactRenderSnapshot({
          kind: "worksheet",
          title,
          summary,
          rawContent: markdown,
          sourceStage: "complete",
          allowLegacyFallback: true,
        });

        let finalSnapshot = artifactSnapshot;
        const MAX_CONTINUATIONS = 2;
        for (let attempt = 0; attempt < MAX_CONTINUATIONS; attempt++) {
          if (
            !shouldContinueWorksheetGeneration({
              finishReason,
              integrityStatus: finalSnapshot.integrityStatus,
              markdown,
            })
          ) {
            break;
          }
          const continuationIterator = streamMarkdown(
            buildWorksheetContinuationPrompt({
              teacherRequest: normalized,
              partialMarkdown: markdown,
            }),
          )[Symbol.asyncIterator]();
          let continuation: {
            markdown: string;
            finishReason?: string;
          } = {
            markdown: "",
            finishReason: undefined,
          };
          while (true) {
            const next = await continuationIterator.next();
            if (next.done) {
              continuation = next.value;
              break;
            }
            yield next.value;
          }
          const normalizedContinuation = continuation.markdown.trimStart();
          if (!normalizedContinuation) break;
          markdown = `${markdown.trimEnd()}${markdown.endsWith("\n") ? "" : "\n"}${normalizedContinuation}`;
          finishReason = continuation.finishReason;
          const retriedTitleMatch = markdown.match(/^#\s+(.+)/m);
          const retriedTitle = retriedTitleMatch?.[1]?.trim() || title;
          const retriedSummary = markdown.slice(0, 200).replace(/\n/g, " ");
          finalSnapshot = buildArtifactRenderSnapshot({
            kind: "worksheet",
            title: retriedTitle,
            summary: retriedSummary,
            rawContent: markdown,
            sourceStage: "complete",
            allowLegacyFallback: true,
          });
        }

        if (finalSnapshot.integrityStatus === "invalid" && markdown.trim().length < 200) {
          yield errorResult(
            "worksheet",
            "Worksheet 正文未完整生成，本次结果只保留临时预览，请重试。",
            "请重试一次，或缩短要求后再生成。",
          );
          return;
        }
        if (finalSnapshot.integrityStatus === "invalid") {
          finalSnapshot = {
            ...finalSnapshot,
            integrityStatus: "repaired",
          };
        }

        const artifactPayload = {
          kind: "worksheet" as const,
          title: finalSnapshot.title,
          summary: finalSnapshot.summary,
          rawContent: finalSnapshot.rawContent,
          document: finalSnapshot.document,
          htmlContent: finalSnapshot.htmlContent,
          layoutConfig: finalSnapshot.layoutConfig,
          renderVersion: finalSnapshot.renderVersion,
          sourceStage: finalSnapshot.sourceStage,
          integrityStatus: finalSnapshot.integrityStatus,
          previewText: "课堂 worksheet 已生成，正在同步到右侧 Canvas。",
        };
        rememberGeneratedArtifact(params.runtime, "worksheet", artifactPayload);

        yield successArtifactResult(
          "worksheet",
          finalSnapshot.title,
          `已生成「${finalSnapshot.title}」，右侧 Canvas 可查看完整课堂 worksheet。`,
          1,
          ["可以继续修改或导出为 PDF"],
          artifactPayload,
          {
            worksheetTitle: finalSnapshot.title,
            worksheetSummary: finalSnapshot.summary,
            generationMode: "ai_generate",
            finishReason: finishReason || "unknown",
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误";
        yield errorResult("worksheet", `Worksheet 生成失败: ${message}`, "请重试");
      }
    },
  });
}
