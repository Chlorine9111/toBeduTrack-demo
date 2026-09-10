import type { UploadedMaterial } from "@/lib/agent/chat-shared";
import {
  getContentLibraryItemDetailsByIds,
  type ContentLibraryClient,
} from "@/lib/content-library/store";
import { searchContentLibrarySemanticHits } from "@/lib/content-library/semantic-index";
import { budgetPromptSections } from "@/lib/ai/prompt-budget";
import type { ContentLibraryDetail } from "@/lib/content-library/types";

const FULLTEXT_THRESHOLD_CHARS = 2_000;
const SEMANTIC_BUDGET_CHARS = 12_000;

type ContentLibraryReferenceSourceItem = {
  id: string;
  title: string;
  contentType: string;
  courseName: string | null;
  unitName: string | null;
};

type ResolveContentLibraryReferenceMaterialsResult = {
  materials: UploadedMaterial[];
  sources: Array<{
    kind: "content_library_references";
    summary: string;
    items: ContentLibraryReferenceSourceItem[];
  }>;
  warnings: string[];
};

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function formatPlacement(item: ContentLibraryDetail) {
  return [item.courseName, item.unitName].filter(Boolean).join(" / ");
}

function buildRubricReferenceText(item: ContentLibraryDetail) {
  if (item.snapshot.kind !== "rubric") return "";
  const rubric = item.snapshot.rubric;
  const dimensionLines = rubric.dimensions.map((dimension) => {
    const levelLines = dimension.levels
      .map((level) => `- Level ${level.level} (${level.score}): ${cleanText(level.description)}`)
      .filter(Boolean)
      .join("\n");
    return [
      `维度：${dimension.name}`,
      cleanText(dimension.description),
      levelLines,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    `标题：${item.displayTitle}`,
    rubric.teacherPrompt ? `生成要求：${cleanText(rubric.teacherPrompt)}` : "",
    dimensionLines.join("\n\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildLessonPlanReferenceText(item: ContentLibraryDetail) {
  if (item.snapshot.kind !== "lesson_plan_document") return "";
  const lessonPlan = item.snapshot.lessonPlan;
  const sectionLines = lessonPlan.sections.map((section) => {
    const blockLines = section.blocks
      .map((block) => {
        const contentText = Object.values(block.content ?? {})
          .filter((value): value is string => typeof value === "string")
          .map((value) => cleanText(value))
          .filter(Boolean)
          .join("；");
        return [
          `- ${block.type}`,
          contentText,
          block.teacherNote ? `教师备注：${cleanText(block.teacherNote)}` : "",
        ]
          .filter(Boolean)
          .join("：");
      })
      .filter(Boolean)
      .join("\n");

    return [
      `章节：${section.title}（${section.durationMinutes} 分钟）`,
      cleanText(section.summary),
      blockLines,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    `标题：${item.displayTitle}`,
    lessonPlan.sourcePrompt ? `原始需求：${cleanText(lessonPlan.sourcePrompt)}` : "",
    lessonPlan.subjectLabel ? `学科：${cleanText(lessonPlan.subjectLabel)}` : "",
    sectionLines.join("\n\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildLessonPlanMarkdownReferenceText(item: ContentLibraryDetail) {
  if (item.snapshot.kind !== "lesson_plan_markdown") return "";
  return [
    `标题：${item.displayTitle}`,
    item.snapshot.markdown.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildExerciseReferenceText(item: ContentLibraryDetail) {
  if (item.snapshot.kind !== "exercise") return "";
  const exercise = item.snapshot.exercise;
  const optionLines = (exercise.options ?? [])
    .map((option) => `${option.label}. ${cleanText(option.text)}`)
    .filter(Boolean)
    .join("\n");

  return [
    `标题：${item.displayTitle}`,
    `题型：${exercise.type}`,
    `难度：${exercise.difficulty}`,
    exercise.questionText ? `题干：${cleanText(exercise.questionText)}` : "",
    optionLines ? `选项：\n${optionLines}` : "",
    exercise.correctAnswer ? `答案：${cleanText(exercise.correctAnswer)}` : "",
    exercise.solutionSteps ? `解析：${cleanText(exercise.solutionSteps)}` : "",
    exercise.knowledgeCluster ? `大类：${cleanText(exercise.knowledgeCluster)}` : "",
    exercise.knowledgeSubskillLabel ? `小类：${cleanText(exercise.knowledgeSubskillLabel)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildPblReferenceText(item: ContentLibraryDetail) {
  if (item.snapshot.kind !== "pbl_project_plan") return "";
  const plan = item.snapshot.pblPlan;
  const stageLines = plan.stages
    .slice(0, 6)
    .map((stage) =>
      [
        `阶段 ${stage.stageNumber}：${stage.name}`,
        `目标：${cleanText(stage.objective)}`,
        stage.coreActivities.length > 0
          ? `活动：${stage.coreActivities.map((activity) => cleanText(activity)).filter(Boolean).join("；")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

  return [
    `标题：${item.displayTitle}`,
    plan.drivingQuestion ? `驱动问题：${cleanText(plan.drivingQuestion)}` : "",
    plan.originalPrompt ? `原始需求：${cleanText(plan.originalPrompt)}` : "",
    stageLines,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildGenericReferenceText(item: ContentLibraryDetail) {
  if (item.snapshot.kind === "html") {
    return [
      `标题：${item.displayTitle}`,
      stripHtml(item.snapshot.html),
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (item.snapshot.kind === "markdown") {
    return [
      `标题：${item.displayTitle}`,
      item.snapshot.markdown.trim(),
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  return [
    `标题：${item.displayTitle}`,
    item.summaryText ? `摘要：${cleanText(item.summaryText)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildReferenceMaterialText(item: ContentLibraryDetail) {
  const placement = formatPlacement(item);
  const body =
    buildRubricReferenceText(item) ||
    buildLessonPlanReferenceText(item) ||
    buildLessonPlanMarkdownReferenceText(item) ||
    buildExerciseReferenceText(item) ||
    buildPblReferenceText(item) ||
    buildGenericReferenceText(item);

  return [
    `引用内容类型：${item.contentType}`,
    placement ? `归类：${placement}` : "",
    body,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function toConversationSourceItem(item: ContentLibraryDetail): ContentLibraryReferenceSourceItem {
  return {
    id: item.id,
    title: item.displayTitle,
    contentType: item.contentType,
    courseName: item.courseName,
    unitName: item.unitName,
  };
}

function applyBudgetToMaterials(
  details: ContentLibraryDetail[],
  budget: number,
): UploadedMaterial[] {
  const rawTexts = details.map((item) => buildReferenceMaterialText(item));
  const totalLength = rawTexts.reduce((sum, text) => sum + text.length, 0);

  if (totalLength <= budget) {
    return details.map((item, i) => ({
      fileName: `引用内容 · ${item.displayTitle}`,
      fileType: `content_library:${item.contentType}`,
      textContent: rawTexts[i],
    }));
  }

  const budgeted = budgetPromptSections(
    details.map((item, i) => ({
      key: item.id,
      text: rawTexts[i],
      weight: 1,
      minTokens: 60,
    })),
    Math.floor(budget / 4),
  );

  return details.map((item) => ({
    fileName: `引用内容 · ${item.displayTitle}`,
    fileType: `content_library:${item.contentType}`,
    textContent: budgeted[item.id] ?? "",
  }));
}

async function buildSemanticFallbackMaterials(params: {
  client: ContentLibraryClient;
  details: ContentLibraryDetail[];
  userQuery: string;
  budget: number;
}): Promise<{ materials: UploadedMaterial[]; usedFallback: boolean }> {
  if (!params.userQuery.trim()) {
    return {
      materials: applyBudgetToMaterials(params.details, params.budget),
      usedFallback: false,
    };
  }

  try {
    const hits = await searchContentLibrarySemanticHits({
      supabase: params.client.supabase,
      teacherId: params.client.teacherId,
      query: params.userQuery,
      limit: 20,
    });

    const selectedItemIds = new Set(params.details.map((d) => d.id));
    const relevantHits = hits.filter((hit) => selectedItemIds.has(hit.itemId));

    if (relevantHits.length === 0) {
      return {
        materials: applyBudgetToMaterials(params.details, params.budget),
        usedFallback: false,
      };
    }

    const hitOrder = new Map(relevantHits.map((hit, i) => [hit.itemId, i]));
    const sorted = [...params.details].sort((a, b) => {
      const aRank = hitOrder.get(a.id) ?? 999;
      const bRank = hitOrder.get(b.id) ?? 999;
      return aRank - bRank;
    });

    return {
      materials: applyBudgetToMaterials(sorted, params.budget),
      usedFallback: true,
    };
  } catch {
    return {
      materials: applyBudgetToMaterials(params.details, params.budget),
      usedFallback: false,
    };
  }
}

export async function resolveContentLibraryReferenceMaterials(params: {
  client: ContentLibraryClient;
  itemIds: string[];
  userQuery?: string;
  budgetChars?: number;
}): Promise<ResolveContentLibraryReferenceMaterialsResult> {
  const uniqueIds = Array.from(new Set(params.itemIds.filter(Boolean))).slice(0, 8);
  if (uniqueIds.length === 0) {
    return {
      materials: [],
      sources: [],
      warnings: [],
    } satisfies ResolveContentLibraryReferenceMaterialsResult;
  }

  const budget = params.budgetChars ?? SEMANTIC_BUDGET_CHARS;
  const details = await getContentLibraryItemDetailsByIds(params.client, uniqueIds);
  const detailIds = new Set(details.map((item) => item.id));
  const missingIds = uniqueIds.filter((itemId) => !detailIds.has(itemId));
  const warnings: string[] = [];

  if (missingIds.length > 0) {
    warnings.push("部分引用内容不存在或无权访问，已自动跳过。");
  }

  const rawTexts = details.map((item) => buildReferenceMaterialText(item));
  const totalLength = rawTexts.reduce((sum, text) => sum + text.length, 0);

  let materials: UploadedMaterial[];

  if (totalLength <= FULLTEXT_THRESHOLD_CHARS) {
    materials = details.map((item, i) => ({
      fileName: `引用内容 · ${item.displayTitle}`,
      fileType: `content_library:${item.contentType}`,
      textContent: rawTexts[i],
    }));
  } else {
    const result = await buildSemanticFallbackMaterials({
      client: params.client,
      details,
      userQuery: params.userQuery ?? "",
      budget,
    });
    materials = result.materials;
    if (result.usedFallback) {
      warnings.push(
        `已从 ${details.length} 份引用中提取最相关的内容片段。`,
      );
    }
  }

  const sourceItems = details.map(toConversationSourceItem);
  const sourceSummary = sourceItems
    .map((item) => {
      const placement = [item.courseName, item.unitName].filter(Boolean).join(" / ");
      return placement ? `${item.title}（${placement}）` : item.title;
    })
    .join("；");

  return {
    materials,
    sources: sourceItems.length > 0
      ? [{
          kind: "content_library_references" as const,
          summary: sourceSummary,
          items: sourceItems,
        }]
      : [],
    warnings,
  } satisfies ResolveContentLibraryReferenceMaterialsResult;
}
