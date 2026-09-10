import { NextResponse } from "next/server";
import { z } from "zod";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import { generateStructuredObject } from "@/lib/ai/structured-output";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { inferExplicitDifficultyFromTexts, inferExplicitExerciseTypeFromTexts } from "@/lib/chat/intent";
import { toExerciseDifficulty } from "@/types/exercise";
import { listQuestionBankQuestions } from "@/lib/question-bank/store";
import { extractRequestedCount } from "@/lib/text/count-parser";
import {
  appendExerciseRowsToDraft,
  loadBuilderImportExerciseRows,
  loadWorksheetBuilderDetail,
  mergeWorksheetBuilderDraftIntoLayoutConfig,
} from "@/lib/worksheet/builder-store";
import { uuidSchema } from "@/lib/validation/api";
import type { Json } from "@/types/database";

const builderAiImportRequestSchema = z.object({
  instruction: z.string().trim().min(1).max(1000),
});

const builderAiImportPlanSchema = z.object({
  query: z.string().trim().max(240).default(""),
  count: z.number().int().min(1).max(20).default(4),
  type: z.enum(["all", "MC", "FR", "fill_in"]).default("all"),
  difficulty: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(0),
});

function inferFallbackCount(text: string) {
  const explicit = extractRequestedCount(text);
  if (!explicit) return 4;
  return Math.min(Math.max(explicit, 1), 20);
}

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function normalizePlanQuery(query: string) {
  const normalized = cleanText(query)
    .replace(/[，。！？；]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";
  if (
    /^(请)?(再|继续)?(从题库)?(补|补充|添加|加入|导入|来|找|挑选?)(一些|几道|几题|\d+\s*(道|题)|[零一二两三四五六七八九十]+\s*(道|题))?(题|题目|试题)?$/i.test(
      normalized,
    ) ||
    /^(更多|再来|继续|补充)(题|题目|试题)?$/i.test(normalized)
  ) {
    return "";
  }

  return normalized;
}

function buildDraftThemeQuery(titles: string[]) {
  const normalizedTitles = titles
    .map((title) => cleanText(title))
    .filter(Boolean)
    .slice(0, 4);

  return cleanText(normalizedTitles.join("；")).slice(0, 180);
}

function buildSearchScopeLabel(params: {
  query: string;
  courseName?: string | null;
  unitName?: string | null;
}) {
  if (params.query) return params.query;
  return [params.courseName, params.unitName, "当前题库范围"].filter(Boolean).join(" · ");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ worksheetId: string }> },
) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } =
    await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  const params = await context.params;
  const parsedId = uuidSchema.safeParse(params.worksheetId);
  if (!parsedId.success) {
    return jsonError("VALIDATION_ERROR", "组卷稿 ID 不合法", 400);
  }

  try {
    const body = builderAiImportRequestSchema.parse(
      await parseJsonBody<z.infer<typeof builderAiImportRequestSchema>>(request),
    );

    const detail = await loadWorksheetBuilderDetail({
      supabase,
      teacherId,
      worksheetId: parsedId.data,
    });

    if (!detail) {
      return jsonError("NOT_FOUND", "未找到组卷稿", 404);
    }

    let importPlan: z.infer<typeof builderAiImportPlanSchema>;
    const draftTitles = detail.builderDraft.questionInstances
      .map((instance) => instance.title)
      .filter(Boolean)
      .slice(0, 8);

    try {
      importPlan = await generateStructuredObject({
        model: getResolvedLanguageModelForTask("worksheet_curate"),
        schema: builderAiImportPlanSchema,
        systemPrompt:
          [
            "你是教师题库检索助手。",
            "根据教师指令，把需求压缩成一个简洁的题库检索计划。",
            "如果教师只说“补充十道题”“再来几道选择题”这类泛化指令，要结合当前组卷稿已经存在的题目主题，补出一个简洁的主题 query。",
            "如果当前组卷稿为空，且教师没有给出明确主题，query 可以留空。",
            "count 要尽量反映教师想补充的题量，允许 1 到 20。",
            "type 和 difficulty 尽量明确；拿不准时返回 all 和 0。",
            "query 不要写成整句指令，要压缩成便于题库检索的主题词。",
          ].join(" "),
        userPrompt: [
          `当前课程：${detail.courseName ?? "未设置"}`,
          detail.unitName ? `当前单元：${detail.unitName}` : "",
          `当前已导入题目数：${detail.builderDraft.questionInstances.length}`,
          draftTitles.length > 0 ? `当前组卷主题样本：${draftTitles.join(" | ")}` : "当前组卷主题样本：暂无",
          `教师要求：${body.instruction}`,
        ]
          .filter(Boolean)
          .join("\n"),
        temperature: 0.2,
        maxTokens: 220,
        maxRetries: 2,
        abortSignal: request.signal,
      });
    } catch {
      importPlan = {
        query: "",
        count: inferFallbackCount(body.instruction),
        type: inferExplicitExerciseTypeFromTexts([body.instruction]) ?? "all",
        difficulty: inferExplicitDifficultyFromTexts([body.instruction]) ?? 0,
      };
    }

    const normalizedQuery = normalizePlanQuery(importPlan.query);
    const draftThemeQuery =
      !normalizedQuery && draftTitles.length > 0 ? buildDraftThemeQuery(draftTitles) : "";
    const resolvedQuery = normalizedQuery || draftThemeQuery;
    const searchQueryLabel = buildSearchScopeLabel({
      query: resolvedQuery,
      courseName: detail.courseName,
      unitName: detail.unitName,
    });

    const searchResult = await listQuestionBankQuestions(
      {
        teacherId,
        supabase,
      },
      {
        query: resolvedQuery || undefined,
        courseId: detail.courseId,
        unitId: detail.unitId ?? undefined,
        type: importPlan.type,
        difficulty:
          typeof importPlan.difficulty === "number"
            ? toExerciseDifficulty(importPlan.difficulty)
            : undefined,
        limit: Math.min(Math.max(importPlan.count * 8, 32), 120),
      },
    );

    const existingIds = new Set(
      detail.builderDraft.questionInstances.map((instance) => instance.originExerciseId),
    );
    const candidateIds = searchResult.items
      .map((item) => item.id)
      .filter((id) => !existingIds.has(id))
      .slice(0, importPlan.count);

    if (candidateIds.length === 0) {
      return NextResponse.json({
        worksheetId: detail.id,
        builderDraft: detail.builderDraft,
        addedIds: [] as string[],
        skippedIds: [] as string[],
        searchQuery: searchQueryLabel,
        matchedCount: 0,
      });
    }

    const { data: existingRows, error: existingError } = await supabase
      .from("worksheet_exercises")
      .select("exercise_id,sort_order")
      .eq("worksheet_id", parsedId.data)
      .order("sort_order", { ascending: true });

    if (existingError) {
      return jsonError("INTERNAL_ERROR", "读取组卷题目失败", 500);
    }

    const importRowsResult = await loadBuilderImportExerciseRows({
      supabase,
      teacherId,
      exerciseIds: candidateIds,
    });

    if (importRowsResult.invalidIds.length > 0) {
      return jsonError("VALIDATION_ERROR", "部分题目已不可用", 400, {
        invalidExerciseIds: importRowsResult.invalidIds,
      });
    }

    const nextDraft = appendExerciseRowsToDraft(
      detail.builderDraft,
      importRowsResult.rows,
    );

    const maxOrder = (existingRows ?? []).reduce(
      (max, row) => (row.sort_order > max ? row.sort_order : max),
      -1,
    );

    const insertRows = nextDraft.addedIds.map((exerciseId, index) => ({
      worksheet_id: parsedId.data,
      exercise_id: exerciseId,
      sort_order: maxOrder + index + 1,
      points: null,
    }));

    if (insertRows.length > 0) {
      const { error: insertError } = await supabase
        .from("worksheet_exercises")
        .insert(insertRows);

      if (insertError) {
        return jsonError("INTERNAL_ERROR", "写入组卷题目失败", 500);
      }
    }

    const { error: updateError } = await supabase
      .from("worksheets")
      .update({
        layout_config: mergeWorksheetBuilderDraftIntoLayoutConfig(
          detail.layoutConfig as unknown as Json,
          nextDraft.draft,
        ),
      })
      .eq("id", parsedId.data)
      .eq("teacher_id", teacherId);

    if (updateError) {
      return jsonError("INTERNAL_ERROR", "更新组卷稿失败", 500);
    }

    return NextResponse.json({
      worksheetId: detail.id,
      builderDraft: nextDraft.draft,
      addedIds: nextDraft.addedIds,
      skippedIds: nextDraft.skippedIds,
      searchQuery: searchQueryLabel,
      matchedCount: nextDraft.addedIds.length,
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }

    console.error("AI 补题失败", error);
    return jsonError("INTERNAL_ERROR", "AI 补题失败", 500);
  }
}
