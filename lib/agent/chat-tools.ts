import { tool } from "ai";
import { getAnthropicProvider } from "@/lib/ai/provider-registry";
import { z } from "zod";
import { runPblWorkflow } from "@/lib/agent/pbl-workflow";
import { fetchWebPageWithJina } from "@/lib/assistant/jina-reader";
import { buildGenerateApExercisesPipelineTool } from "@/lib/agent/tools/generate-ap-exercises-pipeline";
import { buildGenerateAnswerKeyTool } from "@/lib/agent/tools/generate-answer-key";
import { buildGenerateExitTicketTool } from "@/lib/agent/tools/generate-exit-ticket";
import { buildGenerateLessonPlanWorkflowTool } from "@/lib/agent/tools/generate-lesson-plan-workflow";
import { buildGenerateRubricTool } from "@/lib/agent/tools/generate-rubric";
import { buildAssembleWorksheetTool } from "@/lib/agent/tools/assemble-worksheet";
import { buildGenerateWorksheetTool } from "@/lib/agent/tools/generate-worksheet";
import { buildAdaptDifficultyTool } from "@/lib/agent/tools/adapt-difficulty";
import { buildSearchQuestionBankTool } from "@/lib/agent/tools/search-question-bank";
import { errorResult, successResult } from "@/lib/agent/tools/tool-result";
import type { AgentChatToolsParams } from "@/lib/agent/tools/types";

export function createAgentChatTools(params: AgentChatToolsParams) {
  const builders = {
    adapt_difficulty: () => buildAdaptDifficultyTool(params),
    generate_answer_key: () => buildGenerateAnswerKeyTool(params),
    generate_ap_exercises_pipeline: () => buildGenerateApExercisesPipelineTool(params),
    generate_exit_ticket: () => buildGenerateExitTicketTool(params),
    generate_lesson_plan_workflow: () => buildGenerateLessonPlanWorkflowTool(params),
    generate_pbl_project: () => tool({
      description:
        "根据老师描述的学科、年级、主题等需求，自动生成完整的 PBL（项目式学习）方案，包含阶段设计、评分标准和教师指导",
      inputSchema: z.object({
        teacherRequest: z.string().trim().min(1).max(3000),
      }),
      execute: async function* ({ teacherRequest }) {
        const normalized = (teacherRequest || params.latestUserPrompt || "").trim();
        if (!normalized) {
          yield errorResult(
            "pbl",
            "缺少 PBL 项目需求描述",
            "请提供学科、年级和主题，例如：帮我设计一个 AP Chemistry 高一的 PBL 项目，主题是水质检测。",
          );
          return;
        }

        yield { status: "generating", text: "正在生成 PBL 方案..." };

        try {
          const result = await runPblWorkflow({
            teacherRequest: normalized,
          });

          if (!result.ok) {
            yield errorResult("pbl", result.reason, "请补充学科和年级信息后重试。");
            return;
          }

          yield successResult(
            "pbl",
            result.plan.title,
            `已生成 1 份完整 PBL 方案（${result.plan.stages.length} 个阶段），可继续调整阶段设计与评分标准。`,
            1,
            ["继续微调阶段设计", "调整 Rubric 维度", "补充资源与产出要求"],
            {
              plan: {
                id: result.plan.id,
                title: result.plan.title,
                drivingQuestion: result.plan.drivingQuestion,
                overviewText: result.plan.overviewText,
                primarySubject: result.plan.primarySubject,
                grade: result.plan.grade,
                totalPeriods: result.plan.totalPeriods,
                difficulty: result.plan.difficulty,
                stageCount: result.plan.stages.length,
                stages: result.plan.stages.map((stage) => ({
                  name: stage.name,
                  objective: stage.objective,
                  periodStart: stage.periodStart,
                  periodEnd: stage.periodEnd,
                  coreActivities: stage.coreActivities,
                  requiredResources: stage.requiredResources,
                })),
                rubricDimensions: result.plan.rubric.map((rubric) => rubric.dimension),
                materialReferences: result.plan.materialReferences.map((ref) => ({
                  materialId: ref.materialId,
                  title: ref.title,
                  referenceType: ref.referenceType,
                })),
              },
              webResources: result.webResources,
              inputSummary: result.inputSummary,
              overviewCount: result.overviewCount,
              selectedOption: result.selectedOption,
              timings: result.timings,
            },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "未知错误";
          yield errorResult("pbl", message, "请重试");
        }
      },
    }),
    generate_rubric: () => buildGenerateRubricTool(params),
    generate_worksheet: () => buildGenerateWorksheetTool(params),
    assemble_worksheet: () => buildAssembleWorksheetTool(params),
    search_question_bank: () => buildSearchQuestionBankTool(params),
    web_search: () => getAnthropicProvider().tools.webSearch_20250305({
      maxUses: 3,
      userLocation: { type: "approximate", country: "US" },
    }),
    read_webpage: () => tool({
      description: "深度阅读指定网页内容。适用于 web_search 结果需要细看原文时使用",
      inputSchema: z.object({
        url: z.string().url().describe("要阅读的网页 URL"),
      }),
      execute: async function* ({ url }) {
        yield { status: "reading", text: "正在读取网页..." };
        try {
          const content = await fetchWebPageWithJina(url);
          const maxLength = 10_000;
          const truncated = content.length > maxLength;
          yield successResult(
            "webpage",
            url,
            truncated ? `网页内容已截断至 ${maxLength} 字符` : "网页内容已获取",
            1,
            ["基于网页内容回答问题"],
            {
              url,
              truncated,
              content: truncated ? content.slice(0, maxLength) : content,
            },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "未知错误";
          yield errorResult("webpage", `网页读取失败: ${message}`, "换一个网页链接", {
            url,
          });
        }
      },
    }),
  };

  const allowedTools = params.allowedTools?.length
    ? new Set(params.allowedTools)
    : null;

  const entries = Object.entries(builders).filter(([toolName]) =>
    !allowedTools || allowedTools.has(toolName as never),
  );

  return Object.fromEntries(
    entries.map(([toolName, createTool]) => [toolName, createTool()]),
  );
}
