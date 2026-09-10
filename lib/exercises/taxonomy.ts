import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import { generateStructuredObject } from "@/lib/ai/structured-output";
import {
  buildExerciseClassificationQuery,
  formatSimilarExerciseExamples,
  searchSimilarExerciseExamples,
} from "@/lib/question-bank/semantic-classification";
import { syncExerciseSemanticIndexRows } from "@/lib/question-bank/semantic-index";
import type { Database } from "@/types/database";
import type {
  ExerciseClassificationStatus,
  ExerciseTaxonomyMatchMode,
  ExerciseTaxonomyNodeStatus,
} from "@/types/exercise";

type AppSupabase = SupabaseClient<Database>;
type TaxonomyNodeType = "cluster" | "subskill";
type TaxonomyNodeRow = Database["public"]["Tables"]["question_taxonomy_nodes"]["Row"];
type TaxonomyAliasRow = Database["public"]["Tables"]["question_taxonomy_aliases"]["Row"];
type ExerciseTaxonomyLinkInsert =
  Database["public"]["Tables"]["exercise_taxonomy_links"]["Insert"];

const TAXONOMY_NODE_SELECT = [
  "id",
  "teacher_id",
  "parent_node_id",
  "merged_into_node_id",
  "node_type",
  "canonical_key",
  "canonical_label",
  "normalized_label",
  "status",
  "created_by",
  "source_count",
  "review_count",
  "metadata",
  "last_suggested_at",
  "created_at",
  "updated_at",
].join(",");

const TAXONOMY_ALIAS_SELECT = [
  "id",
  "teacher_id",
  "node_id",
  "alias_label",
  "normalized_label",
  "created_at",
].join(",");

type ExerciseTaxonomyCatalog = {
  nodes: TaxonomyNodeRow[];
  aliases: TaxonomyAliasRow[];
};

type ExerciseTaxonomyAiInput = {
  exerciseId: string;
  questionText: string;
  correctAnswer: string;
  solutionSteps: string;
  type: string;
  difficulty: number;
  teacherPrompt?: string | null;
  courseLabel?: string | null;
  unitLabel?: string | null;
};

type ExerciseTaxonomyAiResult = {
  exerciseIndex: number;
  clusterLabel: string | null;
  subskillLabel: string | null;
  matchMode: ExerciseTaxonomyMatchMode;
  confidence: number;
  reasons: string[];
};

export type ExerciseTaxonomyNodeSummary = {
  id: string;
  nodeType: TaxonomyNodeType;
  parentNodeId: string | null;
  canonicalKey: string;
  canonicalLabel: string;
  normalizedLabel: string;
  status: ExerciseTaxonomyNodeStatus;
  createdBy: "system" | "teacher";
  linkedCount: number;
  reviewCount: number;
  updatedAt: string;
};

export type PersistedExerciseTaxonomy = {
  exerciseId: string;
  clusterNodeId: string | null;
  clusterLabel: string | null;
  clusterStatus: ExerciseTaxonomyNodeStatus | null;
  subskillNodeId: string | null;
  subskillKey: string | null;
  subskillLabel: string | null;
  subskillStatus: ExerciseTaxonomyNodeStatus | null;
  matchMode: ExerciseTaxonomyMatchMode;
  confidence: number | null;
  reasons: string[];
  classificationUpdatedByTeacher: boolean;
};

type ExerciseTaxonomyManageAction =
  | { action: "activate" }
  | { action: "reject" }
  | { action: "rename"; label: string }
  | { action: "merge"; targetNodeId: string };

const ACTIVE_NODE_STATUSES = ["active", "candidate"] as const;
const AUTO_PROMOTE_THRESHOLD = 3;

const aiClassificationSchema = z.object({
  results: z
    .array(
      z.object({
        exerciseIndex: z.number().int().min(0),
        clusterLabel: z.string().trim().max(80).nullable().optional(),
        subskillLabel: z.string().trim().max(120).nullable().optional(),
        matchMode: z
          .enum(["matched_existing", "candidate_new", "needs_review"])
          .default("needs_review"),
        confidence: z.number().min(0).max(1).default(0),
        reasons: z.array(z.string().trim().max(240)).max(3).default([]),
      }),
    )
    .default([]),
});

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function normalizeTaxonomyLabel(value: string | null | undefined) {
  return cleanText(value)
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[()（）[\]【】]/g, " ")
    .replace(/[\/_,+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTaxonomyKey(value: string | null | undefined) {
  return normalizeTaxonomyLabel(value).replace(/\s+/g, "-");
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => cleanText(value))
        .filter(Boolean),
    ),
  );
}

function clampConfidence(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}

function toBigrams(value: string) {
  const normalized = value.replace(/\s+/g, "");
  if (normalized.length <= 1) return normalized ? [normalized] : [];

  const result: string[] = [];
  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.push(normalized.slice(index, index + 2));
  }
  return result;
}

function diceCoefficient(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftBigrams = toBigrams(left);
  const rightBigrams = toBigrams(right);
  if (leftBigrams.length === 0 || rightBigrams.length === 0) return 0;

  const rightCounts = new Map<string, number>();
  for (const gram of rightBigrams) {
    rightCounts.set(gram, (rightCounts.get(gram) ?? 0) + 1);
  }

  let overlap = 0;
  for (const gram of leftBigrams) {
    const count = rightCounts.get(gram) ?? 0;
    if (count > 0) {
      overlap += 1;
      rightCounts.set(gram, count - 1);
    }
  }

  return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
}

function buildCatalogPrompt(catalog: ExerciseTaxonomyCatalog) {
  const aliasByNodeId = new Map<string, string[]>();
  for (const alias of catalog.aliases) {
    const values = aliasByNodeId.get(alias.node_id) ?? [];
    values.push(alias.alias_label);
    aliasByNodeId.set(alias.node_id, values);
  }

  const clusters = catalog.nodes
    .filter((node) => node.node_type === "cluster")
    .map((cluster) => {
      const subskills = catalog.nodes
        .filter((node) => node.node_type === "subskill" && node.parent_node_id === cluster.id)
        .map((subskill) => ({
          label: subskill.canonical_label,
          status: subskill.status,
          aliases: aliasByNodeId.get(subskill.id) ?? [],
        }));

      return {
        label: cluster.canonical_label,
        status: cluster.status,
        aliases: aliasByNodeId.get(cluster.id) ?? [],
        subskills,
      };
    });

  return JSON.stringify({ clusters }, null, 2);
}

async function loadTeacherTaxonomyCatalog(params: {
  supabase: AppSupabase;
  teacherId: string;
}) {
  const [nodesResult, aliasesResult] = await Promise.all([
    params.supabase
      .from("question_taxonomy_nodes")
      .select(TAXONOMY_NODE_SELECT)
      .eq("teacher_id", params.teacherId)
      .in("status", [...ACTIVE_NODE_STATUSES]),
    params.supabase
      .from("question_taxonomy_aliases")
      .select(TAXONOMY_ALIAS_SELECT)
      .eq("teacher_id", params.teacherId),
  ]);

  if (nodesResult.error) {
    throw new Error("读取 taxonomy 节点失败");
  }
  if (aliasesResult.error) {
    throw new Error("读取 taxonomy 别名失败");
  }

  return {
    nodes: (nodesResult.data ?? []) as unknown as TaxonomyNodeRow[],
    aliases: (aliasesResult.data ?? []) as unknown as TaxonomyAliasRow[],
  } satisfies ExerciseTaxonomyCatalog;
}

function findMatchingNode(params: {
  catalog: ExerciseTaxonomyCatalog;
  nodeType: TaxonomyNodeType;
  label: string;
  parentNodeId?: string | null;
}) {
  const normalizedLabel = normalizeTaxonomyLabel(params.label);
  if (!normalizedLabel) return null;

  const candidates = params.catalog.nodes.filter((node) => {
    if (node.node_type !== params.nodeType) return false;
    if (params.nodeType === "cluster") return node.parent_node_id === null;
    return node.parent_node_id === (params.parentNodeId ?? null);
  });

  const aliasByNodeId = new Map<string, string[]>();
  for (const alias of params.catalog.aliases) {
    const values = aliasByNodeId.get(alias.node_id) ?? [];
    values.push(alias.normalized_label);
    aliasByNodeId.set(alias.node_id, values);
  }

  for (const node of candidates) {
    if (
      node.normalized_label === normalizedLabel ||
      node.canonical_key === buildTaxonomyKey(params.label)
    ) {
      return node;
    }

    const aliases = aliasByNodeId.get(node.id) ?? [];
    if (aliases.includes(normalizedLabel)) {
      return node;
    }
  }

  let bestScore = 0;
  let bestNode: TaxonomyNodeRow | null = null;
  for (const node of candidates) {
    const aliases = aliasByNodeId.get(node.id) ?? [];
    const score = Math.max(
      diceCoefficient(node.normalized_label, normalizedLabel),
      ...aliases.map((alias) => diceCoefficient(alias, normalizedLabel)),
    );

    if (score > bestScore) {
      bestScore = score;
      bestNode = node;
    }
  }

  if (bestScore >= 0.84) {
    return bestNode;
  }

  return null;
}

async function insertTaxonomyNode(params: {
  supabase: AppSupabase;
  teacherId: string;
  nodeType: TaxonomyNodeType;
  label: string;
  status: ExerciseTaxonomyNodeStatus;
  createdBy: "system" | "teacher";
  parentNodeId?: string | null;
}): Promise<TaxonomyNodeRow> {
  const canonicalLabel = cleanText(params.label);
  const canonicalKey = buildTaxonomyKey(canonicalLabel);
  const normalizedLabel = normalizeTaxonomyLabel(canonicalLabel);
  if (!canonicalLabel || !canonicalKey || !normalizedLabel) {
    throw new Error("TAXONOMY_LABEL_INVALID");
  }

  const existing = await loadTeacherTaxonomyCatalog({
    supabase: params.supabase,
    teacherId: params.teacherId,
  });
  const matched = findMatchingNode({
    catalog: existing,
    nodeType: params.nodeType,
    label: canonicalLabel,
    parentNodeId: params.parentNodeId ?? null,
  });
  if (matched) {
    return matched;
  }

  const parentNode =
    params.nodeType === "subskill"
      ? existing.nodes.find((node) => node.id === (params.parentNodeId ?? "")) ?? null
      : null;
  const parentKey =
    params.nodeType === "subskill"
      ? parentNode?.canonical_key ?? null
      : null;
  if (params.nodeType === "subskill" && !params.parentNodeId) {
    throw new Error("SUBSKILL_PARENT_REQUIRED");
  }
  if (params.nodeType === "subskill" && !parentKey) {
    throw new Error("SUBSKILL_PARENT_NOT_FOUND");
  }

  const { data, error } = await params.supabase
    .from("question_taxonomy_nodes")
    .insert({
      teacher_id: params.teacherId,
      parent_node_id: params.nodeType === "subskill" ? params.parentNodeId ?? null : null,
      node_type: params.nodeType,
      canonical_key: canonicalKey,
      canonical_label: canonicalLabel,
      normalized_label: normalizedLabel,
      status: params.status,
      created_by: params.createdBy,
    })
    .select(TAXONOMY_NODE_SELECT)
    .maybeSingle();

  if (error || !data) {
    throw new Error("创建 taxonomy 节点失败");
  }

  return data as unknown as TaxonomyNodeRow;
}

async function upsertNodeAliases(params: {
  supabase: AppSupabase;
  teacherId: string;
  node: TaxonomyNodeRow;
  labels: string[];
}) {
  const rows = uniqueStrings(params.labels)
    .map((label) => ({
      teacher_id: params.teacherId,
      node_id: params.node.id,
      alias_label: label,
      normalized_label: normalizeTaxonomyLabel(label),
    }))
    .filter((row) => row.alias_label && row.normalized_label);

  if (rows.length === 0) return;

  const { error } = await params.supabase
    .from("question_taxonomy_aliases")
    .upsert(rows, { onConflict: "node_id,normalized_label", ignoreDuplicates: true });

  if (error) {
    throw new Error("写入 taxonomy 别名失败");
  }
}

function buildFallbackClassification(
  exerciseId: string,
): PersistedExerciseTaxonomy {
  return {
    exerciseId,
    clusterNodeId: null,
    clusterLabel: null,
    clusterStatus: null,
    subskillNodeId: null,
    subskillKey: null,
    subskillLabel: null,
    subskillStatus: null,
    matchMode: "needs_review",
    confidence: null,
    reasons: [],
    classificationUpdatedByTeacher: false,
  };
}

function resolveClassificationSnapshot(
  item: PersistedExerciseTaxonomy,
): {
  confidence: number;
  status: ExerciseClassificationStatus;
  reasons: string[];
} {
  const confidence = Math.max(
    0,
    Math.min(100, Math.round((item.confidence ?? 0) * 100)),
  );
  if (item.classificationUpdatedByTeacher) {
    return {
      confidence: confidence || 100,
      status: "teacher_confirmed",
      reasons: uniqueStrings(item.reasons.length > 0 ? item.reasons : ["teacher_override"]),
    };
  }
  if (item.matchMode === "matched_existing" && confidence >= 82) {
    return {
      confidence,
      status: "auto_confirmed",
      reasons: uniqueStrings(item.reasons),
    };
  }
  return {
    confidence,
    status: "needs_review",
    reasons: uniqueStrings(
      item.reasons.length > 0 ? item.reasons : ["taxonomy_needs_review"],
    ),
  };
}

async function classifyExercisesWithAi(params: {
  supabase: AppSupabase;
  teacherId: string;
  catalog: ExerciseTaxonomyCatalog;
  exercises: ExerciseTaxonomyAiInput[];
}) {
  const semanticExamples = await Promise.all(
    params.exercises.map((exercise) =>
      searchSimilarExerciseExamples({
        supabase: params.supabase,
        teacherId: params.teacherId,
        query: buildExerciseClassificationQuery({
          questionText: exercise.questionText,
          subjectHint: exercise.teacherPrompt,
        }),
        excludeExerciseIds: [exercise.exerciseId],
        limit: 3,
      }).catch((error) => {
        console.warn("taxonomy 语义参考题检索失败，继续使用 catalog 分类", error);
        return [];
      }),
    ),
  );

  const userPrompt = JSON.stringify(
    {
      catalog: buildCatalogPrompt(params.catalog),
      exercises: params.exercises.map((exercise, index) => ({
        exerciseIndex: index,
        type: exercise.type,
        difficulty: exercise.difficulty,
        courseLabel: exercise.courseLabel ?? null,
        unitLabel: exercise.unitLabel ?? null,
        teacherPrompt: cleanText(exercise.teacherPrompt),
        questionText: cleanText(exercise.questionText),
        correctAnswer: cleanText(exercise.correctAnswer),
        solutionSteps: cleanText(exercise.solutionSteps).slice(0, 800),
        semanticExamples: formatSimilarExerciseExamples(semanticExamples[index] ?? []),
      })),
    },
    null,
    2,
  );

  const model = getResolvedLanguageModelForTask("question_taxonomy");
  const result = await generateStructuredObject({
    model,
    schema: aiClassificationSchema,
    systemPrompt: [
      "你是一名教师私有题库的 taxonomy 分类器。",
      "任务：对每道题输出一个大类 clusterLabel 和一个更细的小类 subskillLabel。",
      "先参考每道题附带的 semanticExamples，它们是老师题库里语义最接近的已分类题。",
      "如果当前题与参考题本质考察内容一致，优先沿用参考题的 clusterLabel / subskillLabel。",
      "如果只是表面措辞相似但真正考点不同，必须按当前题单独判断，不能盲从参考题。",
      "如果现有 taxonomy 已有语义相同的类，请沿用现有叫法。",
      "如果现有 taxonomy 不合适，但题目主题清晰，可以提出 candidate_new。",
      "如果题目太模糊，允许 needs_review，此时 subskillLabel 可以为空。",
      "clusterLabel 与 subskillLabel 应尽量简短、稳定、可复用，不要写成长句。",
      "输出必须是结构化 JSON，不要额外解释。",
    ].join("\n"),
    userPrompt,
    maxTokens: 3000,
    temperature: 0,
  });

  return result.results;
}

async function resolveAiNode(params: {
  supabase: AppSupabase;
  teacherId: string;
  catalog: ExerciseTaxonomyCatalog;
  nodeType: TaxonomyNodeType;
  label: string | null;
  parentNodeId?: string | null;
  matchMode: ExerciseTaxonomyMatchMode;
}): Promise<TaxonomyNodeRow | null> {
  const label = cleanText(params.label);
  if (!label) return null;

  const matched = findMatchingNode({
    catalog: params.catalog,
    nodeType: params.nodeType,
    label,
    parentNodeId: params.parentNodeId ?? null,
  });
  if (matched) {
    return matched;
  }

  if (params.matchMode === "needs_review") {
    return null;
  }

  const created = await insertTaxonomyNode({
    supabase: params.supabase,
    teacherId: params.teacherId,
    nodeType: params.nodeType,
    label,
    status: "candidate",
    createdBy: "system",
    parentNodeId: params.parentNodeId ?? null,
  });

  params.catalog.nodes.push(created);
  return created;
}

async function recomputeNodeSourceCounts(params: {
  supabase: AppSupabase;
  teacherId: string;
  nodeIds: string[];
}) {
  const uniqueNodeIds = Array.from(new Set(params.nodeIds.filter(Boolean)));
  if (uniqueNodeIds.length === 0) return new Map<string, number>();

  const { data, error } = await params.supabase
    .from("exercise_taxonomy_links")
    .select("cluster_node_id,subskill_node_id")
    .eq("teacher_id", params.teacherId);

  if (error) {
    throw new Error("读取 taxonomy 关联失败");
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    if (row.cluster_node_id) {
      counts.set(row.cluster_node_id, (counts.get(row.cluster_node_id) ?? 0) + 1);
    }
    if (row.subskill_node_id) {
      counts.set(row.subskill_node_id, (counts.get(row.subskill_node_id) ?? 0) + 1);
    }
  }

  for (const nodeId of uniqueNodeIds) {
    const { error: updateError } = await params.supabase
      .from("question_taxonomy_nodes")
      .update({ source_count: counts.get(nodeId) ?? 0 })
      .eq("id", nodeId)
      .eq("teacher_id", params.teacherId);

    if (updateError) {
      throw new Error("更新 taxonomy 统计失败");
    }
  }

  return counts;
}

async function maybePromoteCandidateNodes(params: {
  supabase: AppSupabase;
  teacherId: string;
  nodeIds: string[];
}) {
  const uniqueNodeIds = Array.from(new Set(params.nodeIds.filter(Boolean)));
  if (uniqueNodeIds.length === 0) return;

  const counts = await recomputeNodeSourceCounts(params);
  for (const nodeId of uniqueNodeIds) {
    const count = counts.get(nodeId) ?? 0;
    if (count < AUTO_PROMOTE_THRESHOLD) continue;

    const { error } = await params.supabase
      .from("question_taxonomy_nodes")
      .update({
        status: "active",
        review_count: count,
      })
      .eq("id", nodeId)
      .eq("teacher_id", params.teacherId)
      .eq("status", "candidate");

    if (error) {
      throw new Error("自动晋升 taxonomy 候选失败");
    }
  }
}

async function writeExerciseTaxonomy(params: {
  supabase: AppSupabase;
  teacherId: string;
  items: PersistedExerciseTaxonomy[];
}) {
  if (params.items.length === 0) return;

  const linkRows: ExerciseTaxonomyLinkInsert[] = [];
  for (const item of params.items) {
    const classificationSnapshot = resolveClassificationSnapshot(item);
    const { error } = await params.supabase
      .from("exercises")
      .update({
        knowledge_cluster: item.clusterLabel,
        knowledge_cluster_node_id: item.clusterNodeId,
        knowledge_subskill_key: item.subskillKey,
        knowledge_subskill_label: item.subskillLabel,
        knowledge_subskill_node_id: item.subskillNodeId,
        classification_confidence: classificationSnapshot.confidence,
        classification_status: classificationSnapshot.status,
        classification_reasons: classificationSnapshot.reasons,
        subskill_match_mode: item.matchMode,
        subskill_confidence: item.confidence ?? 0,
        subskill_reasons: item.reasons,
        classification_updated_by_teacher: item.classificationUpdatedByTeacher,
      })
      .eq("id", item.exerciseId)
      .eq("teacher_id", params.teacherId);

    if (error) {
      throw new Error("更新题目 taxonomy 快照失败");
    }

    linkRows.push({
      exercise_id: item.exerciseId,
      teacher_id: params.teacherId,
      cluster_node_id: item.clusterNodeId,
      subskill_node_id: item.subskillNodeId,
      match_mode: item.matchMode,
      confidence: item.confidence,
      reasons: item.reasons,
      raw_cluster_label: item.clusterLabel,
      raw_subskill_label: item.subskillLabel,
    });
  }

  const { error } = await params.supabase
    .from("exercise_taxonomy_links")
    .upsert(linkRows, { onConflict: "exercise_id" });

  if (error) {
    throw new Error("更新题目 taxonomy 关联失败");
  }

  const nodeIds = params.items.flatMap((item) => [
    item.clusterNodeId,
    item.subskillNodeId,
  ]);
  await maybePromoteCandidateNodes({
    supabase: params.supabase,
    teacherId: params.teacherId,
    nodeIds: nodeIds.filter((nodeId): nodeId is string => Boolean(nodeId)),
  });
}

async function syncExerciseSnapshots(params: {
  supabase: AppSupabase;
  teacherId: string;
  exerciseIds: string[];
}) {
  await syncExerciseSemanticIndexRows({
    supabase: params.supabase,
    teacherId: params.teacherId,
    exerciseIds: params.exerciseIds,
  });
}

export async function classifyAndPersistExerciseTaxonomy(params: {
  supabase: AppSupabase;
  teacherId: string;
  exercises: ExerciseTaxonomyAiInput[];
  syncContentLibrary?: boolean;
}) {
  if (params.exercises.length === 0) return [];

  const catalog = await loadTeacherTaxonomyCatalog({
    supabase: params.supabase,
    teacherId: params.teacherId,
  });

  let aiResults: ExerciseTaxonomyAiResult[] = [];
  try {
    aiResults = (
      (await classifyExercisesWithAi({
        supabase: params.supabase,
        teacherId: params.teacherId,
        catalog,
        exercises: params.exercises,
      })).map((item) => ({
        exerciseIndex: item.exerciseIndex,
        clusterLabel: cleanText(item.clusterLabel) || null,
        subskillLabel: cleanText(item.subskillLabel) || null,
        matchMode: item.matchMode,
        confidence: clampConfidence(item.confidence) ?? 0,
        reasons: uniqueStrings(item.reasons),
      })) as ExerciseTaxonomyAiResult[]
    ).filter((item) => item.exerciseIndex >= 0 && item.exerciseIndex < params.exercises.length);
  } catch (error) {
    console.error("题目 taxonomy AI 分类失败，回退为 needs_review", error);
  }

  const classifications: PersistedExerciseTaxonomy[] = [];
  for (let index = 0; index < params.exercises.length; index += 1) {
    const exercise = params.exercises[index];
    const ai = aiResults.find((item) => item.exerciseIndex === index);
    if (!ai) {
      classifications.push(buildFallbackClassification(exercise.exerciseId));
      continue;
    }

    const clusterNode = await resolveAiNode({
      supabase: params.supabase,
      teacherId: params.teacherId,
      catalog,
      nodeType: "cluster",
      label: ai.clusterLabel,
      matchMode: ai.matchMode,
    });

    const subskillNode = await resolveAiNode({
      supabase: params.supabase,
      teacherId: params.teacherId,
      catalog,
      nodeType: "subskill",
      label: ai.subskillLabel,
      parentNodeId: clusterNode?.id ?? null,
      matchMode: ai.matchMode,
    });

    const effectiveMatchMode: ExerciseTaxonomyMatchMode =
      subskillNode || clusterNode
        ? subskillNode?.status === "candidate" || clusterNode?.status === "candidate"
          ? "candidate_new"
          : "matched_existing"
        : "needs_review";

    classifications.push({
      exerciseId: exercise.exerciseId,
      clusterNodeId: clusterNode?.id ?? null,
      clusterLabel: clusterNode?.canonical_label ?? ai.clusterLabel ?? null,
      clusterStatus: (clusterNode?.status as ExerciseTaxonomyNodeStatus | undefined) ?? null,
      subskillNodeId: subskillNode?.id ?? null,
      subskillKey: subskillNode?.canonical_key ?? null,
      subskillLabel: subskillNode?.canonical_label ?? ai.subskillLabel ?? null,
      subskillStatus:
        (subskillNode?.status as ExerciseTaxonomyNodeStatus | undefined) ?? null,
      matchMode: effectiveMatchMode,
      confidence: clampConfidence(ai.confidence),
      reasons: ai.reasons,
      classificationUpdatedByTeacher: false,
    });
  }

  await writeExerciseTaxonomy({
    supabase: params.supabase,
    teacherId: params.teacherId,
    items: classifications,
  });
  if (params.syncContentLibrary !== false) {
    await syncExerciseSnapshots({
      supabase: params.supabase,
      teacherId: params.teacherId,
      exerciseIds: classifications.map((item) => item.exerciseId),
    });
  }

  return classifications;
}

async function readExerciseTaxonomyContext(params: {
  supabase: AppSupabase;
  teacherId: string;
  exerciseId: string;
}) {
  const { data, error } = await params.supabase
    .from("exercises")
    .select(
      `
        id,
        teacher_id,
        question_text,
        correct_answer,
        solution_steps,
        exercise_type,
        difficulty,
        teacher_prompt,
        knowledge_cluster,
        knowledge_cluster_node_id,
        knowledge_subskill_label,
        knowledge_subskill_node_id,
        course:courses(name),
        unit:units(title,unit_number)
      `,
    )
    .eq("id", params.exerciseId)
    .eq("teacher_id", params.teacherId)
    .maybeSingle();

  if (error) {
    throw new Error("读取题目 taxonomy 上下文失败");
  }
  if (!data) {
    throw new Error("EXERCISE_NOT_FOUND");
  }

  const course = Array.isArray(data.course) ? data.course[0] : data.course;
  const unit = Array.isArray(data.unit) ? data.unit[0] : data.unit;

  return {
    exerciseId: data.id,
    questionText: data.question_text,
    correctAnswer: data.correct_answer,
    solutionSteps: data.solution_steps,
    type: data.exercise_type,
    difficulty: data.difficulty,
    teacherPrompt: data.teacher_prompt,
    courseLabel: course?.name ?? null,
    unitLabel: unit ? `Unit ${unit.unit_number} · ${unit.title}` : null,
    currentClusterLabel: data.knowledge_cluster,
    currentClusterNodeId: data.knowledge_cluster_node_id,
    currentSubskillLabel: data.knowledge_subskill_label,
    currentSubskillNodeId: data.knowledge_subskill_node_id,
  };
}

async function activateNode(params: {
  supabase: AppSupabase;
  teacherId: string;
  nodeId: string;
}): Promise<TaxonomyNodeRow> {
  const { data, error } = await params.supabase
    .from("question_taxonomy_nodes")
    .update({ status: "active", review_count: 1 })
    .eq("id", params.nodeId)
    .eq("teacher_id", params.teacherId)
    .select(TAXONOMY_NODE_SELECT)
    .maybeSingle();

  if (error || !data) {
    throw new Error("激活 taxonomy 节点失败");
  }

  return data as unknown as TaxonomyNodeRow;
}

async function resolveManualNode(params: {
  supabase: AppSupabase;
  teacherId: string;
  catalog: ExerciseTaxonomyCatalog;
  nodeType: TaxonomyNodeType;
  label: string | null;
  parentNodeId?: string | null;
}): Promise<TaxonomyNodeRow | null> {
  const label = cleanText(params.label);
  if (!label) return null;

  const matched = findMatchingNode({
    catalog: params.catalog,
    nodeType: params.nodeType,
    label,
    parentNodeId: params.parentNodeId ?? null,
  });

  if (matched) {
    if (matched.status === "candidate") {
      const activated = await activateNode({
        supabase: params.supabase,
        teacherId: params.teacherId,
        nodeId: matched.id,
      });
      const index = params.catalog.nodes.findIndex((node) => node.id === activated.id);
      if (index >= 0) {
        params.catalog.nodes[index] = activated;
      }
      return activated;
    }
    return matched;
  }

  const created = await insertTaxonomyNode({
    supabase: params.supabase,
    teacherId: params.teacherId,
    nodeType: params.nodeType,
    label,
    status: "active",
    createdBy: "teacher",
    parentNodeId: params.parentNodeId ?? null,
  });
  params.catalog.nodes.push(created);
  return created;
}

export async function updateExerciseTaxonomyManually(params: {
  supabase: AppSupabase;
  teacherId: string;
  exerciseId: string;
  clusterLabel?: string | null;
  subskillLabel?: string | null;
}) {
  const context = await readExerciseTaxonomyContext(params);
  const catalog = await loadTeacherTaxonomyCatalog({
    supabase: params.supabase,
    teacherId: params.teacherId,
  });

  const requestedClusterLabel = cleanText(params.clusterLabel) || context.currentClusterLabel;
  const requestedSubskillLabel = cleanText(params.subskillLabel);

  if (!requestedClusterLabel) {
    throw new Error("CLUSTER_REQUIRED");
  }

  const clusterNode = await resolveManualNode({
    supabase: params.supabase,
    teacherId: params.teacherId,
    catalog,
    nodeType: "cluster",
    label: requestedClusterLabel,
  });

  const subskillNode = requestedSubskillLabel
    ? await resolveManualNode({
        supabase: params.supabase,
        teacherId: params.teacherId,
        catalog,
        nodeType: "subskill",
        label: requestedSubskillLabel,
        parentNodeId: clusterNode?.id ?? null,
      })
    : null;

  const item: PersistedExerciseTaxonomy = {
    exerciseId: params.exerciseId,
    clusterNodeId: clusterNode?.id ?? null,
    clusterLabel: clusterNode?.canonical_label ?? requestedClusterLabel,
    clusterStatus: (clusterNode?.status as ExerciseTaxonomyNodeStatus | undefined) ?? null,
    subskillNodeId: subskillNode?.id ?? null,
    subskillKey: subskillNode?.canonical_key ?? null,
    subskillLabel: subskillNode?.canonical_label ?? null,
    subskillStatus:
      (subskillNode?.status as ExerciseTaxonomyNodeStatus | undefined) ?? null,
    matchMode: subskillNode ? "matched_existing" : "needs_review",
    confidence: 1,
    reasons: ["teacher_override"],
    classificationUpdatedByTeacher: true,
  };

  await writeExerciseTaxonomy({
    supabase: params.supabase,
    teacherId: params.teacherId,
    items: [item],
  });
  await syncExerciseSnapshots({
    supabase: params.supabase,
    teacherId: params.teacherId,
    exerciseIds: [params.exerciseId],
  });

  return item;
}

export async function reclassifyExerciseTaxonomyWithAi(params: {
  supabase: AppSupabase;
  teacherId: string;
  exerciseId: string;
}) {
  const context = await readExerciseTaxonomyContext(params);
  const [classification] = await classifyAndPersistExerciseTaxonomy({
    supabase: params.supabase,
    teacherId: params.teacherId,
    exercises: [context],
  });

  return classification ?? buildFallbackClassification(params.exerciseId);
}

async function readTaxonomyNode(params: {
  supabase: AppSupabase;
  teacherId: string;
  nodeId: string;
}): Promise<TaxonomyNodeRow> {
  const { data, error } = await params.supabase
    .from("question_taxonomy_nodes")
    .select(TAXONOMY_NODE_SELECT)
    .eq("id", params.nodeId)
    .eq("teacher_id", params.teacherId)
    .maybeSingle();

  if (error) {
    throw new Error("读取 taxonomy 节点失败");
  }
  if (!data) {
    throw new Error("NODE_NOT_FOUND");
  }

  return data as unknown as TaxonomyNodeRow;
}

async function getNodeAliases(params: {
  supabase: AppSupabase;
  teacherId: string;
  nodeId: string;
}) {
  const { data, error } = await params.supabase
    .from("question_taxonomy_aliases")
    .select(TAXONOMY_ALIAS_SELECT)
    .eq("teacher_id", params.teacherId)
    .eq("node_id", params.nodeId);

  if (error) {
    throw new Error("读取 taxonomy 别名失败");
  }

  return (data ?? []) as unknown as TaxonomyAliasRow[];
}

async function getAffectedExerciseIds(params: {
  supabase: AppSupabase;
  teacherId: string;
  nodeType: TaxonomyNodeType;
  nodeId: string;
}) {
  const column = params.nodeType === "cluster" ? "cluster_node_id" : "subskill_node_id";
  const { data, error } = await params.supabase
    .from("exercise_taxonomy_links")
    .select("exercise_id")
    .eq("teacher_id", params.teacherId)
    .eq(column, params.nodeId);

  if (error) {
    throw new Error("读取 taxonomy 影响范围失败");
  }

  return (data ?? []).map((row) => row.exercise_id);
}

async function renameNodeAndPropagate(params: {
  supabase: AppSupabase;
  teacherId: string;
  node: TaxonomyNodeRow;
  nextLabel: string;
}) {
  const canonicalLabel = cleanText(params.nextLabel);
  const canonicalKey = buildTaxonomyKey(canonicalLabel);
  const normalizedLabel = normalizeTaxonomyLabel(canonicalLabel);
  if (!canonicalLabel || !canonicalKey || !normalizedLabel) {
    throw new Error("TAXONOMY_LABEL_INVALID");
  }

  await upsertNodeAliases({
    supabase: params.supabase,
    teacherId: params.teacherId,
    node: params.node,
    labels: [params.node.canonical_label],
  });

  const { error } = await params.supabase
    .from("question_taxonomy_nodes")
    .update({
      canonical_label: canonicalLabel,
      canonical_key: canonicalKey,
      normalized_label: normalizedLabel,
      status: params.node.status === "candidate" ? "active" : params.node.status,
    })
    .eq("id", params.node.id)
    .eq("teacher_id", params.teacherId);

  if (error) {
    throw new Error("重命名 taxonomy 节点失败");
  }

  if (params.node.node_type === "cluster") {
    const { error: exerciseError } = await params.supabase
      .from("exercises")
      .update({
        knowledge_cluster: canonicalLabel,
      })
      .eq("teacher_id", params.teacherId)
      .eq("knowledge_cluster_node_id", params.node.id);

    if (exerciseError) {
      throw new Error("同步题目大类失败");
    }
  } else {
    const { error: exerciseError } = await params.supabase
      .from("exercises")
      .update({
        knowledge_subskill_key: canonicalKey,
        knowledge_subskill_label: canonicalLabel,
      })
      .eq("teacher_id", params.teacherId)
      .eq("knowledge_subskill_node_id", params.node.id);

    if (exerciseError) {
      throw new Error("同步题目小类失败");
    }
  }
}

async function mergeSubskillNode(params: {
  supabase: AppSupabase;
  teacherId: string;
  source: TaxonomyNodeRow;
  target: TaxonomyNodeRow;
}) {
  const aliases = await getNodeAliases({
    supabase: params.supabase,
    teacherId: params.teacherId,
    nodeId: params.source.id,
  });

  await upsertNodeAliases({
    supabase: params.supabase,
    teacherId: params.teacherId,
    node: params.target,
    labels: [params.source.canonical_label, ...aliases.map((alias) => alias.alias_label)],
  });

  const { error: linkError } = await params.supabase
    .from("exercise_taxonomy_links")
    .update({
      subskill_node_id: params.target.id,
      cluster_node_id: params.target.parent_node_id,
      match_mode: "matched_existing",
    })
    .eq("teacher_id", params.teacherId)
    .eq("subskill_node_id", params.source.id);

  if (linkError) {
    throw new Error("合并 taxonomy 小类关联失败");
  }

  const { error: exerciseError } = await params.supabase
    .from("exercises")
    .update({
      knowledge_cluster_node_id: params.target.parent_node_id,
      knowledge_subskill_node_id: params.target.id,
      knowledge_subskill_key: params.target.canonical_key,
      knowledge_subskill_label: params.target.canonical_label,
    })
    .eq("teacher_id", params.teacherId)
    .eq("knowledge_subskill_node_id", params.source.id);

  if (exerciseError) {
    throw new Error("合并 taxonomy 小类快照失败");
  }
}

async function mergeClusterNode(params: {
  supabase: AppSupabase;
  teacherId: string;
  source: TaxonomyNodeRow;
  target: TaxonomyNodeRow;
}) {
  const sourceChildrenResult = await params.supabase
    .from("question_taxonomy_nodes")
    .select(TAXONOMY_NODE_SELECT)
    .eq("teacher_id", params.teacherId)
    .eq("node_type", "subskill")
    .eq("parent_node_id", params.source.id)
    .in("status", [...ACTIVE_NODE_STATUSES]);

  const targetChildrenResult = await params.supabase
    .from("question_taxonomy_nodes")
    .select(TAXONOMY_NODE_SELECT)
    .eq("teacher_id", params.teacherId)
    .eq("node_type", "subskill")
    .eq("parent_node_id", params.target.id)
    .in("status", [...ACTIVE_NODE_STATUSES]);

  if (sourceChildrenResult.error || targetChildrenResult.error) {
    throw new Error("读取 cluster 子节点失败");
  }

  const targetByNormalized = new Map(
    ((targetChildrenResult.data ?? []) as unknown as TaxonomyNodeRow[]).map((node) => [
      node.normalized_label,
      node,
    ]),
  );

  for (const child of (sourceChildrenResult.data ?? []) as unknown as TaxonomyNodeRow[]) {
    const duplicated = targetByNormalized.get(child.normalized_label);
    if (duplicated) {
      await mergeSubskillNode({
        supabase: params.supabase,
        teacherId: params.teacherId,
        source: child,
        target: duplicated,
      });
      await params.supabase
        .from("question_taxonomy_nodes")
        .update({
          status: "merged",
          merged_into_node_id: duplicated.id,
        })
        .eq("id", child.id)
        .eq("teacher_id", params.teacherId);
      continue;
    }

    await params.supabase
      .from("question_taxonomy_nodes")
      .update({ parent_node_id: params.target.id })
      .eq("id", child.id)
      .eq("teacher_id", params.teacherId);
  }

  const { error: linkError } = await params.supabase
    .from("exercise_taxonomy_links")
    .update({
      cluster_node_id: params.target.id,
      match_mode: "matched_existing",
    })
    .eq("teacher_id", params.teacherId)
    .eq("cluster_node_id", params.source.id);

  if (linkError) {
    throw new Error("合并 taxonomy 大类关联失败");
  }

  const { error: exerciseError } = await params.supabase
    .from("exercises")
    .update({
      knowledge_cluster_node_id: params.target.id,
      knowledge_cluster: params.target.canonical_label,
    })
    .eq("teacher_id", params.teacherId)
    .eq("knowledge_cluster_node_id", params.source.id);

  if (exerciseError) {
    throw new Error("合并 taxonomy 大类快照失败");
  }
}

async function rejectNode(params: {
  supabase: AppSupabase;
  teacherId: string;
  node: TaxonomyNodeRow;
}) {
  if (params.node.status !== "candidate") {
    throw new Error("ONLY_CANDIDATE_CAN_REJECT");
  }

  if (params.node.node_type === "cluster") {
    const { error: linkError } = await params.supabase
      .from("exercise_taxonomy_links")
      .update({
        cluster_node_id: null,
        subskill_node_id: null,
        match_mode: "needs_review",
        confidence: null,
        reasons: ["candidate_rejected"],
      })
      .eq("teacher_id", params.teacherId)
      .eq("cluster_node_id", params.node.id);

    if (linkError) {
      throw new Error("驳回 cluster 候选失败");
    }

    const { error: exerciseError } = await params.supabase
      .from("exercises")
      .update({
        knowledge_cluster: null,
        knowledge_cluster_node_id: null,
        knowledge_subskill_key: null,
        knowledge_subskill_label: null,
        knowledge_subskill_node_id: null,
        classification_confidence: 0,
        classification_status: "needs_review",
        classification_reasons: ["candidate_rejected"],
        subskill_match_mode: "needs_review",
        subskill_confidence: 0,
        subskill_reasons: ["candidate_rejected"],
      })
      .eq("teacher_id", params.teacherId)
      .eq("knowledge_cluster_node_id", params.node.id);

    if (exerciseError) {
      throw new Error("驳回 cluster 候选快照失败");
    }
  } else {
    const { error: linkError } = await params.supabase
      .from("exercise_taxonomy_links")
      .update({
        subskill_node_id: null,
        match_mode: "needs_review",
        confidence: null,
        reasons: ["candidate_rejected"],
      })
      .eq("teacher_id", params.teacherId)
      .eq("subskill_node_id", params.node.id);

    if (linkError) {
      throw new Error("驳回 subskill 候选失败");
    }

    const { error: exerciseError } = await params.supabase
      .from("exercises")
      .update({
        knowledge_subskill_key: null,
        knowledge_subskill_label: null,
        knowledge_subskill_node_id: null,
        classification_confidence: 0,
        classification_status: "needs_review",
        classification_reasons: ["candidate_rejected"],
        subskill_match_mode: "needs_review",
        subskill_confidence: 0,
        subskill_reasons: ["candidate_rejected"],
      })
      .eq("teacher_id", params.teacherId)
      .eq("knowledge_subskill_node_id", params.node.id);

    if (exerciseError) {
      throw new Error("驳回 subskill 候选快照失败");
    }
  }

  const { error } = await params.supabase
    .from("question_taxonomy_nodes")
    .update({
      status: "rejected",
      merged_into_node_id: null,
    })
    .eq("id", params.node.id)
    .eq("teacher_id", params.teacherId);

  if (error) {
    throw new Error("驳回 taxonomy 候选失败");
  }
}

export async function manageExerciseTaxonomyNode(params: {
  supabase: AppSupabase;
  teacherId: string;
  nodeId: string;
  input: ExerciseTaxonomyManageAction;
}) {
  const source = await readTaxonomyNode(params);
  let affectedExerciseIds = await getAffectedExerciseIds({
    supabase: params.supabase,
    teacherId: params.teacherId,
    nodeType: source.node_type as TaxonomyNodeType,
    nodeId: source.id,
  });

  if (params.input.action === "activate") {
    await activateNode({
      supabase: params.supabase,
      teacherId: params.teacherId,
      nodeId: source.id,
    });
  } else if (params.input.action === "reject") {
    await rejectNode({
      supabase: params.supabase,
      teacherId: params.teacherId,
      node: source,
    });
  } else if (params.input.action === "rename") {
    await renameNodeAndPropagate({
      supabase: params.supabase,
      teacherId: params.teacherId,
      node: source,
      nextLabel: params.input.label,
    });
  } else {
    const target = await readTaxonomyNode({
      supabase: params.supabase,
      teacherId: params.teacherId,
      nodeId: params.input.targetNodeId,
    });

    if (source.id === target.id) {
      throw new Error("NODE_MERGE_SELF");
    }
    if (source.node_type !== target.node_type) {
      throw new Error("NODE_TYPE_MISMATCH");
    }

    if (source.node_type === "cluster") {
      await mergeClusterNode({
        supabase: params.supabase,
        teacherId: params.teacherId,
        source,
        target,
      });
    } else {
      await mergeSubskillNode({
        supabase: params.supabase,
        teacherId: params.teacherId,
        source,
        target,
      });
    }

    const aliases = await getNodeAliases({
      supabase: params.supabase,
      teacherId: params.teacherId,
      nodeId: source.id,
    });
    await upsertNodeAliases({
      supabase: params.supabase,
      teacherId: params.teacherId,
      node: target,
      labels: [source.canonical_label, ...aliases.map((alias) => alias.alias_label)],
    });

    await params.supabase
      .from("question_taxonomy_nodes")
      .update({
        status: "merged",
        merged_into_node_id: target.id,
      })
      .eq("id", source.id)
      .eq("teacher_id", params.teacherId);

    affectedExerciseIds = Array.from(
      new Set([
        ...affectedExerciseIds,
        ...(await getAffectedExerciseIds({
          supabase: params.supabase,
          teacherId: params.teacherId,
          nodeType: target.node_type as TaxonomyNodeType,
          nodeId: target.id,
        })),
      ]),
    );
  }

  await recomputeNodeSourceCounts({
    supabase: params.supabase,
    teacherId: params.teacherId,
    nodeIds: [source.id],
  });
  await syncExerciseSnapshots({
    supabase: params.supabase,
    teacherId: params.teacherId,
    exerciseIds: affectedExerciseIds,
  });
}

export async function listExerciseTaxonomyNodes(params: {
  supabase: AppSupabase;
  teacherId: string;
}) {
  const [nodesResult, linksResult] = await Promise.all([
    params.supabase
      .from("question_taxonomy_nodes")
      .select(TAXONOMY_NODE_SELECT)
      .eq("teacher_id", params.teacherId)
      .in("status", ["active", "candidate"]),
    params.supabase
      .from("exercise_taxonomy_links")
      .select("cluster_node_id,subskill_node_id")
      .eq("teacher_id", params.teacherId),
  ]);

  if (nodesResult.error) {
    throw new Error("读取 taxonomy 节点失败");
  }
  if (linksResult.error) {
    throw new Error("读取 taxonomy 关联失败");
  }

  const counts = new Map<string, number>();
  for (const row of linksResult.data ?? []) {
    if (row.cluster_node_id) {
      counts.set(row.cluster_node_id, (counts.get(row.cluster_node_id) ?? 0) + 1);
    }
    if (row.subskill_node_id) {
      counts.set(row.subskill_node_id, (counts.get(row.subskill_node_id) ?? 0) + 1);
    }
  }

  return ((nodesResult.data ?? []) as unknown as TaxonomyNodeRow[])
    .map((node) => ({
      id: node.id,
      nodeType: node.node_type as TaxonomyNodeType,
      parentNodeId: node.parent_node_id,
      canonicalKey: node.canonical_key,
      canonicalLabel: node.canonical_label,
      normalizedLabel: node.normalized_label,
      status: node.status as ExerciseTaxonomyNodeStatus,
      createdBy: node.created_by as "system" | "teacher",
      linkedCount: counts.get(node.id) ?? 0,
      reviewCount: node.review_count,
      updatedAt: node.updated_at,
    }))
    .sort((left, right) => {
      if (left.nodeType !== right.nodeType) {
        return left.nodeType === "cluster" ? -1 : 1;
      }
      if (left.status !== right.status) {
        return left.status === "active" ? -1 : 1;
      }
      if (left.linkedCount !== right.linkedCount) {
        return right.linkedCount - left.linkedCount;
      }
      return left.canonicalLabel.localeCompare(right.canonicalLabel, "zh-Hans-CN");
    });
}
