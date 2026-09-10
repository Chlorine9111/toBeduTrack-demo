import { tool } from "ai";
import { z } from "zod";
import { buildArtifactRenderSnapshot } from "@/lib/agent/artifact-render-snapshot";
import { buildTaskAwareMaterialContext } from "@/lib/agent/material-context";
import { rememberGeneratedArtifact } from "@/lib/agent/tools/source-artifact";
import type { AgentChatToolsParams } from "@/lib/agent/tools/types";
import {
  artifactDeltaResult,
  errorResult,
  successArtifactResult,
} from "@/lib/agent/tools/tool-result";
import { streamGatewayText } from "@/lib/ai/gateway";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import { parseIntentFromText } from "@/lib/chat/intent";

const EXIT_TICKET_SYSTEM_PROMPT = [
  "你是资深课堂教学设计师，负责为老师生成高质量 exit ticket。",
  "exit ticket 是下课前 5 分钟完成的快速课堂检测，不是完整 worksheet，也不是正式考试。",
  "",
  "输出要求：",
  "1. 输出 Markdown，第一行必须是一级标题（# 标题）。",
  "2. 一共只出 3-5 道题，默认 4 题。",
  "3. 题目必须短、小、精准，紧贴当天学习目标和资料内容。",
  "4. 可以混合题型，但优先可在 5 分钟内完成。",
  "5. 不要输出答案，不要输出代码块围栏。",
  "6. 适合直接给学生使用，可打印、可投屏。",
  "",
  "长度控制：",
  "- 必须输出完整内容，不要在中间截断",
].join("\n");

function normalizeCount(rawCount: number | undefined) {
  if (!rawCount || !Number.isFinite(rawCount)) return 4;
  return Math.max(3, Math.min(5, rawCount));
}

function extractTitle(markdown: string) {
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  return titleMatch?.[1]?.trim() || "Exit Ticket";
}

function summarizeMarkdown(markdown: string) {
  return markdown
    .replace(/^#\s+.+$/gm, " ")
    .replace(/[*#>`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export function buildGenerateExitTicketTool(params: AgentChatToolsParams) {
  return tool({
    description:
      "生成 3-5 题的课末快速检测（exit ticket / quick check）。用于「做一个 exit ticket」「课末检测」「下课前小测」「quick check」。直接 AI 生成，不搜题库。",
    inputSchema: z.object({
      teacherRequest: z.string().trim().min(1).max(3000),
      count: z.number().int().min(3).max(5).optional(),
    }),
    execute: async function* ({ teacherRequest, count }) {
      const normalized = (teacherRequest || params.latestUserPrompt || "").trim();
      if (!normalized) {
        yield errorResult(
          "exit_ticket",
          "缺少 exit ticket 需求描述",
          "请说明主题或当天目标，例如：Newton's Third Law 的 exit ticket。",
        );
        return;
      }

      yield { status: "generating", text: "正在生成 Exit Ticket..." };

      try {
        const parsedIntent = parseIntentFromText(normalized);
        const itemCount = normalizeCount(count ?? parsedIntent.count);
        const materialContext = buildTaskAwareMaterialContext({
          materials: params.uploaded.materials,
          taskKind: "exercise",
          query: normalized,
          maxLength: 3000,
        });
        const prompt = [
          `教师请求：\n${normalized}`,
          `请生成 ${itemCount} 道题，确保学生在 5 分钟内完成。`,
          materialContext ? `\n${materialContext}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        const { result } = streamGatewayText({
          model: getResolvedLanguageModelForTask("assistant_exercises"),
          system: EXIT_TICKET_SYSTEM_PROMPT,
          prompt,
          maxOutputTokens: 12000,
          temperature: 0.5,
          timeout: 90_000,
        });

        let markdown = "";
        for await (const delta of result.textStream) {
          if (!delta) continue;
          markdown += delta;
          yield artifactDeltaResult({
            kind: "worksheet",
            artifactRole: "primary",
            artifactVariant: "exit_ticket",
            delta,
            title: "Exit Ticket（生成中）",
            summary: "正在流式生成课堂检测正文。",
            previewText: "正在生成 Exit Ticket...",
          });
        }

        if (!markdown.trim()) {
          yield errorResult("exit_ticket", "Exit Ticket 生成失败", "AI 未返回内容，请重试。");
          return;
        }

        const title = extractTitle(markdown);
        const summaryText = summarizeMarkdown(markdown);
        const summary = summaryText
          ? `已生成 1 份 ${title}，共 ${itemCount} 道快速检测题。`
          : `已生成 1 份 ${title}。`;
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
            "exit_ticket",
            "Exit Ticket 正文未完整生成，本次结果只保留临时预览，请重试。",
            "请重试一次，或把要求写得更短更明确。",
          );
          return;
        }

        const artifactPayload = {
          kind: "worksheet" as const,
          artifactRole: "primary" as const,
          artifactVariant: "exit_ticket" as const,
          title: artifactSnapshot.title,
          summary: artifactSnapshot.summary,
          rawContent: artifactSnapshot.rawContent,
          document: artifactSnapshot.document,
          htmlContent: artifactSnapshot.htmlContent,
          layoutConfig: artifactSnapshot.layoutConfig,
          renderVersion: artifactSnapshot.renderVersion,
          sourceStage: artifactSnapshot.sourceStage,
          integrityStatus: artifactSnapshot.integrityStatus,
          previewText: "Exit Ticket 已生成，正在同步到右侧 Canvas。",
        };
        rememberGeneratedArtifact(params.runtime, "exit_ticket", artifactPayload);

        yield successArtifactResult(
          "exit_ticket",
          title,
          summary,
          itemCount,
          ["可继续生成答案解析", "可继续微调题量或难度"],
          artifactPayload,
          {
            requestedCount: itemCount,
            generationMode: "exit_ticket",
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误";
        yield errorResult("exit_ticket", `Exit Ticket 生成失败: ${message}`, "请重试。");
      }
    },
  });
}
