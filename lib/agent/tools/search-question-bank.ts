import { tool } from "ai";
import { z } from "zod";
import {
  inferExplicitDifficultyFromTexts,
  inferExplicitExerciseTypeFromTexts,
  parseIntentFromText,
} from "@/lib/chat/intent";
import { listQuestionBankQuestions } from "@/lib/question-bank/store";
import type { AgentChatToolsParams } from "@/lib/agent/tools/types";
import { errorResult, successResult } from "@/lib/agent/tools/tool-result";
import { toExerciseDifficulty } from "@/types/exercise";

type QuestionBankSearchItem = Awaited<
  ReturnType<typeof listQuestionBankQuestions>
>["items"][number];

function normalizeLookupText(value: string | null | undefined) {
  return `${value ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactWhitespace(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function buildQuestionBankSearchQuery(input: string) {
  return compactWhitespace(input)
    .replace(
      /(请|帮我|麻烦|可以|能不能|直接|优先|从|在|把|一下|一套|几道|几题|几份|不要重新生成|别重新生成|不需要新生成|帮我找|给我找|调取|调用|拿出|筛出|找出|question\s*bank|existing\s+questions?|uploaded\s+questions?)/gi,
      " ",
    )
    .replace(/(题库|现成题|已有题|已有习题|我上传的题|我的题|上传的题|历年题册)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildQuestionBankTokens(input: string) {
  return Array.from(
    new Set(
      buildQuestionBankSearchQuery(input)
        .split(/\s+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2),
    ),
  );
}

function scoreReviewStatus(status: string | null) {
  switch (status) {
    case "ready":
      return 18;
    case "review":
      return 10;
    case "unreviewed":
      return 4;
    case "critical":
      return -12;
    default:
      return 0;
  }
}

function rankQuestionBankItems(params: {
  items: QuestionBankSearchItem[];
  query: string;
  requestedType?: "MC" | "FR" | "fill_in" | "all";
  requestedSourceKind?: "all" | "pdf_scan" | "knowledge_document" | "agent_generated" | "manual";
}) {
  const parsedIntent = parseIntentFromText(params.query);
  const normalizedCourseHint = normalizeLookupText(parsedIntent.courseHint ?? "");
  const unitHint = compactWhitespace(parsedIntent.unitHint ?? "");
  const normalizedTopic = normalizeLookupText(
    parsedIntent.topic ?? parsedIntent.topicFocus ?? "",
  );
  const queryTokens = buildQuestionBankTokens(params.query);

  return params.items
    .map((item) => {
      let score = 0;
      const combined = normalizeLookupText(
        [
          item.title,
          item.questionText,
          item.knowledgeClusterLabel,
          item.knowledgeSubskillLabel,
          item.knowledgeTags.join(" "),
          item.assessmentStyleLabel,
          item.assessmentTags.join(" "),
          item.courseName,
          item.unitName,
          item.sourceFileName,
          item.importBatchLabel,
        ].join(" "),
      );

      if (params.requestedType && params.requestedType !== "all" && item.type === params.requestedType) {
        score += 28;
      }
      if (
        params.requestedSourceKind &&
        params.requestedSourceKind !== "all" &&
        item.sourceKind === params.requestedSourceKind
      ) {
        score += 18;
      }
      if (normalizedCourseHint && normalizeLookupText(item.courseName).includes(normalizedCourseHint)) {
        score += 26;
      }
      if (unitHint && normalizeLookupText(item.unitName).includes(`unit ${unitHint.toLowerCase()}`)) {
        score += 24;
      }
      if (normalizedTopic && combined.includes(normalizedTopic)) {
        score += 18;
      }
      for (const token of queryTokens) {
        if (combined.includes(normalizeLookupText(token))) {
          score += 6;
        }
      }
      score += scoreReviewStatus(item.sourceReviewStatus);
      return { item, score };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return right.item.updatedAt.localeCompare(left.item.updatedAt);
    });
}

export function buildSearchQuestionBankTool(params: AgentChatToolsParams) {
  return tool({
    description:
      "从题库搜索/调取现有题目。仅当用户明确要求「从题库找题」「搜索现成题」「找我上传过的题」时使用。不要在生成任务前主动搜索题库——用户没要求就不要搜。只检索不生成。",
    inputSchema: z.object({
      query: z.string().trim().min(1).max(300),
      limit: z.number().int().min(1).max(12).optional(),
      type: z.enum(["all", "MC", "FR", "fill_in"]).optional(),
      difficulty: z.number().int().min(1).max(4).optional(),
      sourceKind: z
        .enum(["all", "pdf_scan", "knowledge_document", "agent_generated", "manual"])
        .optional(),
    }),
    execute: async function* ({ query, limit, type, difficulty, sourceKind }) {
      yield { status: "searching", text: "正在检索题库..." };

      try {
        const requestedLimit = Math.min(Math.max(limit ?? 6, 1), 10);
        const inferredType = inferExplicitExerciseTypeFromTexts([query]);
        const inferredDifficulty = inferExplicitDifficultyFromTexts([query]);
        const requestedType = type ?? (inferredType ? inferredType : "all");
        const rawDifficulty = difficulty ?? inferredDifficulty ?? undefined;
        const requestedDifficulty = rawDifficulty != null
          ? toExerciseDifficulty(rawDifficulty)
          : undefined;
        const preferredSourceKind =
          sourceKind ??
          (/(上传的题|我上传|题册|pdf|历年题册)/i.test(query)
            ? "knowledge_document"
            : "all");
        const searchQuery = buildQuestionBankSearchQuery(query);

        const [directMatches, fallbackPool] = await Promise.all([
          listQuestionBankQuestions(
            {
              teacherId: params.teacherId,
              supabase: params.supabase,
            },
            {
              query: searchQuery || undefined,
              type: requestedType,
              difficulty: requestedDifficulty,
              sourceKind: preferredSourceKind,
              limit: 120,
            },
          ),
          listQuestionBankQuestions(
            {
              teacherId: params.teacherId,
              supabase: params.supabase,
            },
            {
              type: requestedType,
              difficulty: requestedDifficulty,
              sourceKind: preferredSourceKind,
              limit: 120,
            },
          ),
        ]);

        const merged = new Map<string, QuestionBankSearchItem>();
        [...directMatches.items, ...fallbackPool.items].forEach((item) => {
          merged.set(item.id, item);
        });

        const rankedItems = rankQuestionBankItems({
          items: Array.from(merged.values()),
          query,
          requestedType,
          requestedSourceKind: preferredSourceKind,
        });

        const visibleItems = rankedItems
          .filter((entry) => entry.item.sourceReviewStatus !== "critical")
          .slice(0, requestedLimit);
        const finalItems =
          visibleItems.length > 0 ? visibleItems : rankedItems.slice(0, requestedLimit);

        yield successResult(
          "search",
          `题库检索：${query}`,
          finalItems.length > 0
            ? `找到 ${finalItems.length} 道匹配题目（共 ${merged.size} 道候选）`
            : "题库暂无匹配题目，建议改用 AI 生成",
          finalItems.length,
          finalItems.length > 0
            ? ["选用这些题目组卷", "补充条件继续搜索", "改为 AI 生成新题"]
            : ["放宽搜索条件", "改为 AI 生成新题"],
          {
            query,
            totalCandidates: merged.size,
            filters: {
              type: requestedType,
              difficulty: requestedDifficulty ?? null,
              sourceKind: preferredSourceKind,
            },
            items: finalItems.map(({ item, score }) => ({
              id: item.id,
              title: item.title,
              questionTextPreview:
                item.questionText.length > 180
                  ? `${item.questionText.slice(0, 180)}…`
                  : item.questionText,
              type: item.type,
              difficulty: item.difficulty,
              knowledgeCluster: item.knowledgeClusterLabel,
              courseName: item.courseName,
              unitName: item.unitName,
              score,
            })),
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误";
        yield errorResult("search", `题库检索失败: ${message}`, ["请重试", "改为 AI 生成新题"], {
          query,
        });
      }
    },
  });
}
