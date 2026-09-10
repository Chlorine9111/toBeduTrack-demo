import { tool } from "ai";
import { z } from "zod";
import { buildArtifactRenderSnapshot } from "@/lib/agent/artifact-render-snapshot";
import { runApExercisePipeline } from "@/lib/agent/exercise-pipeline";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import type { AgentChatToolsParams } from "@/lib/agent/tools/types";
import { rememberGeneratedArtifact } from "@/lib/agent/tools/source-artifact";
import {
  buildExercisesDocumentFromAgentQuestions,
  serializeDocumentToMarkdown,
} from "@/lib/doc-engine/adapters";
import type { AgentQuestionBlock } from "@/lib/agent/chat-stream-types";
import {
  artifactDeltaResult,
  errorResult,
  successArtifactResult,
} from "@/lib/agent/tools/tool-result";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildGenerateApExercisesPipelineTool(params: AgentChatToolsParams) {
  return tool({
    description:
      "AI 生成 AP 练习题（选择题 MCQ / 自由回答 FRQ / 填空等）。用于「出 5 道选择题」「生成练习题」「出一套 AP 习题」「帮我出题」。这是 AI 原创出题，不从题库抽取。不要用于 worksheet/讲义/rubric/教案。",
    inputSchema: z.object({
      teacherRequest: z.string().trim().min(1).max(2000),
      count: z.number().int().min(1).max(20).optional(),
      exerciseType: z.enum(["MC", "FR"]).optional(),
      language: z.enum(["中文", "英文"]).optional(),
      courseId: z.string().uuid().optional(),
      unitId: z.string().uuid().optional(),
      topicId: z.string().uuid().optional(),
    }),
    execute: async function* ({
      teacherRequest,
      count,
      exerciseType,
      language,
      courseId,
      unitId,
      topicId,
    }) {
      yield { status: "generating", text: "正在生成习题..." };

      try {
        const deltaQueue: string[] = [];
        let streamFinished = false;

        const outputPromise = runApExercisePipeline({
          model: getResolvedLanguageModelForTask("assistant_exercises"),
          teacherRequest,
          count,
          exerciseType,
          language,
          courseId,
          unitId,
          topicId,
          uploadedMaterials: params.uploaded.materials,
          maxRepairRounds: 2,
          onTextDelta: async (delta) => {
            if (delta) {
              deltaQueue.push(delta);
            }
          },
        });
        const resultPromise = outputPromise.finally(() => {
          streamFinished = true;
        });

        while (!streamFinished || deltaQueue.length > 0) {
          while (deltaQueue.length > 0) {
            const delta = deltaQueue.shift();
            if (!delta) continue;
            yield artifactDeltaResult({
              kind: "exercises",
              delta,
              title: "试题（生成中）",
              summary: "正在流式生成试题正文。",
              previewText: "正在生成试题正文...",
            });
          }

          if (!streamFinished) {
            await sleep(32);
          }
        }

        const output = await resultPromise;

        const artifactQuestions: AgentQuestionBlock[] = output.passedResults.map((item, index) => {
          const exercise = item.exercise;
          return {
            id: `exercise-${index + 1}`,
            questionNumber: index + 1,
            questionType: exercise.type ?? undefined,
            title: `第 ${index + 1} 题`,
            stem: exercise.questionText,
            options:
              exercise.options?.map((option) => ({
                key: option.label,
                content: option.text,
              })) ?? [],
            answer: exercise.correctAnswer ?? undefined,
            solution: exercise.solutionSteps ?? undefined,
            knowledgePoint: exercise.topicId ?? undefined,
          };
        });

        const artifactTopic =
          output.curriculumContext?.topicName?.trim() ||
          output.curriculumContext?.unitName?.trim() ||
          output.blueprint.learningObjective?.trim() ||
          output.blueprint.subject?.trim() ||
          "";
        const artifactTitle = artifactTopic
          ? `${artifactTopic} 练习`
          : "AI 生成试题";
        const artifactDocument = buildExercisesDocumentFromAgentQuestions({
          title: artifactTitle,
          questions: artifactQuestions,
        });
        const artifactRawContent = serializeDocumentToMarkdown(artifactDocument);
        const artifactSummary =
          output.summary?.trim() ||
          `已生成 ${artifactQuestions.length} 道试题，可在右侧 Canvas 查看完整正文。`;
        const artifactSnapshot = buildArtifactRenderSnapshot({
          kind: "exercises",
          title: artifactTitle,
          summary: artifactSummary,
          rawContent: artifactRawContent,
          document: artifactDocument,
          sourceStage: "complete",
        });

        if (artifactSnapshot.integrityStatus === "invalid") {
          yield errorResult(
            "exercises",
            "试题正文未完整生成，本次结果只保留临时预览，请重试。",
            "请重试一次，或减少题数后再生成。",
            {
              blueprint: output.blueprint,
              metrics: output.metrics,
            },
          );
          return;
        }

        const artifactPayload = {
          kind: "exercises" as const,
          title: artifactSnapshot.title,
          summary: artifactSnapshot.summary,
          rawContent: artifactSnapshot.rawContent,
          document: artifactSnapshot.document,
          htmlContent: artifactSnapshot.htmlContent,
          layoutConfig: artifactSnapshot.layoutConfig,
          renderVersion: artifactSnapshot.renderVersion,
          sourceStage: artifactSnapshot.sourceStage,
          integrityStatus: artifactSnapshot.integrityStatus,
          previewText: "试题已生成，正在同步到右侧 Canvas。",
        };
        rememberGeneratedArtifact(params.runtime, "exercises", artifactPayload);

        yield successArtifactResult(
          "exercises",
          artifactTitle,
          artifactSummary,
          artifactQuestions.length,
          ["可以继续微调题型、难度或导出 PDF"],
          artifactPayload,
          {
            fallbackUsed: output.fallbackUsed,
            fallbackReason: output.fallbackReason,
            blueprint: output.blueprint,
            metrics: output.metrics,
            teacherOptions: output.teacherOptions,
            passedExercises: output.passedResults.map((item) => ({
              ...item.exercise,
              verificationStatus: item.verificationStatus,
              qualityNote: item.qualityNote,
            })),
            rejectedExercises: output.rejectedExercises.map((item) => ({
              reason: item.reason,
              attempts: item.attempts,
              logs: item.logs,
              questionText: item.exercise.questionText,
            })),
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误";
        yield errorResult(
          "exercises",
          `AP 习题流水线执行失败：${message}`,
          ["稍后重试同一蓝图", "减少题数后重试"],
          {
            teacherOptions: [
              { label: "稍后重试同一蓝图", value: "retry_same_blueprint" },
              { label: "减少题数后重试", value: "retry_with_less_count" },
            ],
          },
        );
      }
    },
  });
}
