import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import { generateStructuredObject } from "@/lib/ai/structured-output";
import {
  buildExerciseClassificationQuery,
  formatSimilarExerciseExamples,
  searchSimilarExerciseExamples,
} from "@/lib/question-bank/semantic-classification";
import {
  type ExerciseAssessmentStyle,
  type ExerciseClassificationStatus,
  type ExerciseKnowledgeCluster,
  type ExerciseSubskillMatchMode,
  type ExerciseType,
} from "@/types/exercise";
import {
  getSubskillDefinition,
  getSubskillsForCluster,
  QUESTION_CLUSTER_KEYS,
} from "@/lib/question-bank/subskills";
import {
  type ExerciseTaxonomy,
  ASSESSMENT_STYLE_LABELS,
  classifyExerciseTaxonomy,
  getKnowledgeClusterLabel,
} from "@/lib/question-bank/taxonomy";
import { createLogger } from "@/lib/logger";
import type { Database } from "@/types/database";

const logger = createLogger("taxonomy-ai");

type AppSupabase = SupabaseClient<Database>;

const clusterSchema = z.string().min(1);
const modeSchema = z.enum(["matched_existing", "candidate_new", "needs_review"]);

export type ExerciseTaxonomyWithSubskill = ExerciseTaxonomy & {
  knowledgeSubskillKey: string | null;
  knowledgeSubskillLabel: string | null;
  subskillConfidence: number | null;
  subskillMatchMode: ExerciseSubskillMatchMode | null;
  subskillReasons: string[];
};

type ClassifyExerciseTaxonomyWithAiParams = {
  supabase?: AppSupabase;
  teacherId?: string;
  excludeExerciseIds?: string[];
  questionText: string;
  responseFormat?: ExerciseType | null;
  optionsText?: string | null;
  sourceKnowledgePoint?: string | null;
  subjectHint?: string | null;
  existingTaxonomy?: ExerciseTaxonomy | null;
};

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function normalizeToken(value: string | null | undefined) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((item) => cleanText(item))
        .filter(Boolean),
    ),
  );
}

function capConfidence(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function fallbackDetailedTaxonomy(base: ExerciseTaxonomy, extraReasons: string[] = []): ExerciseTaxonomyWithSubskill {
  return {
    ...base,
    knowledgeSubskillKey: null,
    knowledgeSubskillLabel: null,
    subskillConfidence: null,
    subskillMatchMode: "needs_review",
    subskillReasons: uniqueStrings([
      "当前未拿到稳定细分知识点，先保留大类分类。",
      ...extraReasons,
    ]),
  };
}

function buildSubskillCatalog(cluster: ExerciseKnowledgeCluster) {
  const definitions = getSubskillsForCluster(cluster);
  return definitions
    .map(
      (item) =>
        `- ${item.key} | ${item.label} | ${item.description}`,
    )
    .join("\n");
}

function buildAllClusterCatalog() {
  return QUESTION_CLUSTER_KEYS.map(
    (cluster) =>
      `## ${cluster} | ${getKnowledgeClusterLabel(cluster)}\n${buildSubskillCatalog(cluster)}`,
  ).join("\n\n");
}

function buildFocusedClusterCatalog(clusters: ExerciseKnowledgeCluster[]) {
  return clusters
    .map(
      (cluster) =>
        `## ${cluster} | ${getKnowledgeClusterLabel(cluster)}\n${buildSubskillCatalog(cluster)}`,
    )
    .join("\n\n");
}

function resolveFinalClassificationStatus(params: {
  currentStatus: ExerciseClassificationStatus;
  aiMode: "matched_existing" | "candidate_new" | "needs_review";
  finalConfidence: number;
}) {
  if (params.currentStatus === "teacher_confirmed") {
    return params.currentStatus;
  }
  if (params.aiMode === "matched_existing" && params.finalConfidence >= 82) {
    return "auto_confirmed" as const;
  }
  if (params.aiMode === "candidate_new" || params.aiMode === "needs_review") {
    return "needs_review" as const;
  }
  return params.currentStatus === "auto_confirmed" ? "auto_confirmed" : "needs_review";
}

export async function classifyExerciseTaxonomyWithAi(
  params: ClassifyExerciseTaxonomyWithAiParams,
): Promise<ExerciseTaxonomyWithSubskill> {
  const questionText = cleanText(params.questionText);
  const optionsText = cleanText(params.optionsText);
  const sourceKnowledgePoint = cleanText(params.sourceKnowledgePoint);
  const subjectHint = cleanText(params.subjectHint);

  const base =
    params.existingTaxonomy ??
    await classifyExerciseTaxonomy({
      questionText,
      responseFormat: params.responseFormat ?? null,
      sourceKnowledgePoint,
      subjectHint,
    });

  if (!questionText) {
    return fallbackDetailedTaxonomy(base, ["题干文本为空，暂不做细分知识点分类。"]);
  }

  const fallbackCluster = base.knowledgeCluster ?? "general";
  const candidateClusters = QUESTION_CLUSTER_KEYS;
  const semanticQuery = buildExerciseClassificationQuery({
    questionText,
    optionsText,
    sourceKnowledgePoint,
    subjectHint,
  });
  const similarExamples =
    params.supabase && params.teacherId
      ? await searchSimilarExerciseExamples({
          supabase: params.supabase,
          teacherId: params.teacherId,
          query: semanticQuery,
          excludeExerciseIds: params.excludeExerciseIds,
          limit: 4,
        }).catch((err) => {
          logger.warn("题库语义参考题检索失败，继续使用规则分类", { action: "searchSimilarExerciseExamples" }, err);
          return [];
        })
      : [];
  const focusedClusters = Array.from(
    new Set(
      [
        fallbackCluster !== "general" ? fallbackCluster : null,
        ...similarExamples.map(
          (item) => item.knowledgeCluster as ExerciseKnowledgeCluster | null,
        ),
      ].filter((item): item is ExerciseKnowledgeCluster => Boolean(item)),
    ),
  ).slice(0, 3);
  const preferredCatalog =
    focusedClusters.length > 0
      ? buildFocusedClusterCatalog(focusedClusters)
      : "暂无重点候选簇目录；若题干证据不足，优先返回 needs_review。";

  const schema = z.object({
    resolvedCluster: clusterSchema,
    mode: modeSchema,
    subskillKey: z.string().trim().min(2).max(80).nullable(),
    subskillLabel: z.string().trim().min(2).max(120).nullable(),
    confidence: z.number().int().min(0).max(100),
    reasons: z.array(z.string().trim().min(2).max(160)).min(1).max(5),
    extraKnowledgeTags: z.array(z.string().trim().min(2).max(80)).max(6).default([]),
    extraAssessmentTags: z.array(z.string().trim().min(2).max(80)).max(6).default([]),
  });

  try {
    const result = await generateStructuredObject({
      model: getResolvedLanguageModelForTask("question_taxonomy"),
      schema,
      systemPrompt:
        "你是教师题库自动整理助手。目标是把一道题归到稳定的大类与细分知识点里。你必须优先复用已有小类，不要随意新建；只有当前题明显不适合已有小类时，才返回 candidate_new。输出必须严格遵守 schema，不解释，不扩写，不生成题目。",
      userPrompt: [
        "请根据下面题目做细分知识点归类。",
        `当前规则初判大类：${fallbackCluster} | ${getKnowledgeClusterLabel(fallbackCluster)}`,
        `当前规则知识标签：${base.knowledgeTags.join("、") || "暂无"}`,
        `当前主考察方式：${
          base.assessmentStyle
            ? ASSESSMENT_STYLE_LABELS[base.assessmentStyle as ExerciseAssessmentStyle]
            : "暂无"
        }`,
        `作答形式：${params.responseFormat ?? "未知"}`,
        subjectHint ? `课程与来源提示：${subjectHint}` : "",
        sourceKnowledgePoint ? `拆题知识点提示：${sourceKnowledgePoint}` : "",
        "",
        "题目正文：",
        questionText,
        optionsText ? `\n选项信息：\n${optionsText}` : "",
        "",
        "题库里语义最接近、且已有分类的参考题：",
        formatSimilarExerciseExamples(similarExamples),
        "",
        "使用参考题的规则：",
        "1. 如果当前题和参考题本质在考同一个知识点与考法，优先复用参考题的大类与细分知识点。",
        "2. 如果只是表面词汇相似，但真正考察内容不同，必须按当前题单独判断，不能盲目照抄。",
        "3. 最终输出仍要结合题干本身，不要只因为相似度高就忽略题目真实考点。",
        "",
        "允许使用的大类：",
        candidateClusters.map((cluster) => `${cluster} | ${getKnowledgeClusterLabel(cluster)}`).join("\n"),
        "",
        "优先参考的小类目录：",
        preferredCatalog,
        "",
        "规则：",
        "1. 如果能稳定归到已有小类，mode 返回 matched_existing，并提供 subskillKey/subskillLabel。",
        "2. 如果题目很模糊或证据不足，mode 返回 needs_review。",
        "3. 如果明显需要新细分点，mode 返回 candidate_new，并给出简洁稳定的 subskillLabel；subskillKey 可为空。",
        "4. 只有在当前规则大类明显错误时，才允许改 resolvedCluster。",
      ]
        .filter(Boolean)
        .join("\n"),
      temperature: 0,
      maxTokens: 900,
      maxRetries: 2,
    });

    const resolvedCluster = result.resolvedCluster ?? fallbackCluster;
    const aiConfidence = capConfidence(result.confidence) ?? 0;
    const finalCluster =
      result.resolvedCluster !== fallbackCluster && aiConfidence >= 72
        ? result.resolvedCluster
        : fallbackCluster;

    if (result.mode === "matched_existing") {
      const definition =
        getSubskillDefinition(finalCluster, result.subskillKey) ??
        getSubskillsForCluster(finalCluster).find(
          (item) => item.label === cleanText(result.subskillLabel),
        ) ??
        null;
      if (!definition) {
        // 新类别（如 microeconomics）没有内置 subskill 定义，
        // 用 LLM 输出的 subskillKey/Label 直接作为候选
        if (result.subskillLabel) {
          return {
            knowledgeCluster: finalCluster,
            knowledgeTags: uniqueStrings([
              ...base.knowledgeTags,
              finalCluster,
              result.subskillKey ?? "",
              ...result.extraKnowledgeTags,
            ].filter(Boolean)),
            assessmentStyle: base.assessmentStyle,
            assessmentTags: uniqueStrings([
              ...base.assessmentTags,
              ...result.extraAssessmentTags,
            ]),
            classificationConfidence: Math.max(base.classificationConfidence, aiConfidence),
            classificationStatus: resolveFinalClassificationStatus({
              currentStatus: base.classificationStatus,
              aiMode: "candidate_new",
              finalConfidence: aiConfidence,
            }),
            classificationReasons: uniqueStrings([
              ...base.classificationReasons,
              `新类别「${getKnowledgeClusterLabel(finalCluster)}」，LLM 建议子技能：${result.subskillLabel}`,
              ...result.reasons,
            ]),
            knowledgeSubskillKey: result.subskillKey ?? result.subskillLabel.toLowerCase().replace(/\s+/g, "_"),
            knowledgeSubskillLabel: result.subskillLabel,
            subskillConfidence: aiConfidence,
            subskillMatchMode: "candidate_new",
            subskillReasons: result.reasons,
          };
        }
        return fallbackDetailedTaxonomy(base, [
          "轻量模型未匹配到稳定的小类键，已退回大类分类。",
        ]);
      }

      const finalConfidence = Math.max(
        base.classificationConfidence,
        Math.round((base.classificationConfidence * 0.42) + (aiConfidence * 0.58)),
      );

      return {
        knowledgeCluster: finalCluster,
        knowledgeTags: uniqueStrings([
          ...base.knowledgeTags,
          definition.key,
          ...result.extraKnowledgeTags,
        ]),
        assessmentStyle: base.assessmentStyle,
        assessmentTags: uniqueStrings([
          ...base.assessmentTags,
          ...result.extraAssessmentTags,
        ]),
        classificationConfidence: finalConfidence,
        classificationStatus: resolveFinalClassificationStatus({
          currentStatus: base.classificationStatus,
          aiMode: "matched_existing",
          finalConfidence,
        }),
        classificationReasons: uniqueStrings([
          ...base.classificationReasons,
          finalCluster !== fallbackCluster
            ? `轻量模型将题目从「${getKnowledgeClusterLabel(fallbackCluster)}」修正为「${getKnowledgeClusterLabel(finalCluster)}」。`
            : `轻量模型确认大类仍为「${getKnowledgeClusterLabel(finalCluster)}」。`,
          `轻量模型匹配已有细分知识点：${definition.label}。`,
          ...result.reasons,
        ]),
        knowledgeSubskillKey: definition.key,
        knowledgeSubskillLabel: definition.label,
        subskillConfidence: aiConfidence,
        subskillMatchMode: "matched_existing",
        subskillReasons: uniqueStrings(result.reasons),
      };
    }

    if (result.mode === "candidate_new") {
      const candidateLabel = cleanText(result.subskillLabel);
      const candidateKey = normalizeToken(result.subskillKey || candidateLabel);
      const finalConfidence = Math.max(
        40,
        Math.round((base.classificationConfidence * 0.5) + (aiConfidence * 0.5)),
      );

      // 异步持久化候选节点到 taxonomy 表，不阻塞分类返回
      if (candidateKey && candidateLabel && params.supabase && params.teacherId) {
        persistCandidateNode({
          supabase: params.supabase,
          teacherId: params.teacherId,
          clusterKey: finalCluster,
          canonicalKey: candidateKey,
          canonicalLabel: candidateLabel,
        }).catch(() => null);
      }

      return {
        knowledgeCluster: finalCluster,
        knowledgeTags: uniqueStrings([
          ...base.knowledgeTags,
          ...result.extraKnowledgeTags,
          candidateKey || null,
        ]),
        assessmentStyle: base.assessmentStyle,
        assessmentTags: uniqueStrings([
          ...base.assessmentTags,
          ...result.extraAssessmentTags,
        ]),
        classificationConfidence: finalConfidence,
        classificationStatus: "needs_review",
        classificationReasons: uniqueStrings([
          ...base.classificationReasons,
          `轻量模型提出候选细分知识点：${candidateLabel || "未命名候选类"}，需人工确认后再转成正式分类。`,
          ...result.reasons,
        ]),
        knowledgeSubskillKey: candidateKey || null,
        knowledgeSubskillLabel: candidateLabel || null,
        subskillConfidence: aiConfidence,
        subskillMatchMode: "candidate_new",
        subskillReasons: uniqueStrings(result.reasons),
      };
    }

    return fallbackDetailedTaxonomy(base, [
      ...result.reasons,
      "轻量模型仍无法稳定匹配已有小类，先保留大类并标记待确认。",
    ]);
  } catch (error) {
    console.warn("题库细分知识点分类回退到规则层", error);
    return fallbackDetailedTaxonomy(base, [
      "轻量模型分类暂时不可用，已回退到规则分类结果。",
    ]);
  }
}

async function persistCandidateNode(params: {
  supabase: AppSupabase;
  teacherId: string;
  clusterKey: string;
  canonicalKey: string;
  canonicalLabel: string;
}) {
  // 查找对应 cluster 节点作为 parent
  const { data: clusterNode } = await params.supabase
    .from("question_taxonomy_nodes")
    .select("id")
    .eq("teacher_id", params.teacherId)
    .eq("node_type", "cluster")
    .eq("canonical_key", params.clusterKey)
    .maybeSingle();

  const normalizedLabel = normalizeToken(params.canonicalLabel);
  if (!normalizedLabel) return;

  // 使用 ignoreDuplicates 避免唯一索引冲突
  await params.supabase
    .from("question_taxonomy_nodes")
    .upsert(
      {
        teacher_id: params.teacherId,
        parent_node_id: clusterNode?.id ?? null,
        node_type: "subskill",
        canonical_key: params.canonicalKey,
        canonical_label: params.canonicalLabel,
        normalized_label: normalizedLabel,
        status: "candidate",
        source_count: 1,
        review_count: 0,
      },
      { onConflict: "teacher_id,node_type,canonical_key", ignoreDuplicates: true },
    );
}

export async function classifyExerciseTaxonomyBatchWithAi(
  params: {
    supabase?: AppSupabase;
    teacherId?: string;
    excludeExerciseIds?: string[];
    items: ClassifyExerciseTaxonomyWithAiParams[];
    concurrency?: number;
  },
) {
  const results: ExerciseTaxonomyWithSubskill[] = new Array(params.items.length);
  const concurrency = Math.max(1, Math.min(params.concurrency ?? 3, 6));
  let cursor = 0;

  async function worker() {
    while (cursor < params.items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await classifyExerciseTaxonomyWithAi({
        ...params.items[currentIndex],
        supabase: params.supabase ?? params.items[currentIndex].supabase,
        teacherId: params.teacherId ?? params.items[currentIndex].teacherId,
        excludeExerciseIds:
          params.excludeExerciseIds ?? params.items[currentIndex].excludeExerciseIds,
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, params.items.length) }, () => worker()));
  return results;
}
