import { AGENT_GENERATED_SOURCE_LABEL } from "@/lib/question-bank/constants";
import { toClientRequestError } from "@/lib/api/client";
import {
  ASSESSMENT_STYLE_LABELS,
  KNOWLEDGE_CLUSTER_LABELS,
} from "@/lib/question-bank/taxonomy-labels";
import type {
  QuestionBankMaterialItem,
  QuestionBankQuestionDetail,
  QuestionBankQuestionListItem,
} from "@/lib/question-bank/types";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type CourseOption = {
  id: string;
  name: string;
  code: string;
};

export type UnitOption = {
  id: string;
  course_id: string;
  unit_number: number;
  title: string;
};

export type CurriculumOptionsResponse = {
  courses: CourseOption[];
  units: UnitOption[];
};

export type QuestionBankListResponse = {
  items: QuestionBankQuestionListItem[];
  total: number;
  hasMore: boolean;
};

export type QuestionBankMaterialsResponse = {
  items: QuestionBankMaterialItem[];
  total: number;
};

export type SidebarFilter = {
  type: "all" | "cluster" | "unit" | "topic";
  clusterKey?: string;
  unitKey?: string;
  topicLabel?: string;
};

export type { QuestionBankQuestionListItem, QuestionBankQuestionDetail, QuestionBankMaterialItem };

// ---------------------------------------------------------------------------
// Filter option arrays
// ---------------------------------------------------------------------------

export const QUESTION_TYPE_OPTIONS = [
  { value: "all", label: "全部题型" },
  { value: "MC", label: "选择题" },
  { value: "FR", label: "问答题" },
  { value: "fill_in", label: "填空题" },
] as const;

export const SOURCE_KIND_OPTIONS = [
  { value: "all", label: "全部来源" },
  { value: "pdf_scan", label: "PDF 拆题" },
  { value: "knowledge_document", label: "资料库文档" },
  { value: "agent_generated", label: AGENT_GENERATED_SOURCE_LABEL },
  { value: "manual", label: "手动录入" },
] as const;

export const KNOWLEDGE_CLUSTER_OPTIONS = [
  { value: "all", label: "全部知识簇" },
  ...Object.entries(KNOWLEDGE_CLUSTER_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
] as const;

export const ASSESSMENT_STYLE_OPTIONS = [
  { value: "all", label: "全部考察方式" },
  ...Object.entries(ASSESSMENT_STYLE_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
] as const;

export const REVIEW_STATUS_OPTIONS = [
  { value: "all", label: "全部状态" },
  { value: "ready", label: "已验证" },
  { value: "review", label: "建议审核" },
  { value: "critical", label: "需审核" },
  { value: "unreviewed", label: "未标记" },
] as const;

// ---------------------------------------------------------------------------
// Network helper
// ---------------------------------------------------------------------------

function extractError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const data = payload as Record<string, unknown>;
  if (typeof data.error === "string") return data.error;
  if (typeof data.message === "string") return data.message;
  if (data.error && typeof data.error === "object") {
    const nested = data.error as Record<string, unknown>;
    if (typeof nested.message === "string") return nested.message;
  }
  return fallback;
}

export async function requestJson<T>(
  input: RequestInfo,
  init?: RequestInit & { timeoutMs?: number; retry?: number; retryDelayMs?: number },
) {
  const {
    timeoutMs = 30_000,
    retry = 0,
    retryDelayMs = 400,
    signal: externalSignal,
    ...restInit
  } = init ?? {};

  let lastError: unknown;

  for (let attempt = 0; attempt <= retry; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const abortListener = () => controller.abort();

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener("abort", abortListener, { once: true });
      }
    }

    try {
      const response = await fetch(input, {
        cache: "no-store",
        ...restInit,
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        throw new Error(extractError(payload, `请求失败（${response.status}）`));
      }
      return payload as T;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const retryable =
        error instanceof TypeError ||
        message === "Failed to fetch" ||
        message === "fetch failed" ||
        message === "Load failed" ||
        message.includes("network") ||
        message.includes("Network") ||
        message.includes("aborted");

      if (attempt >= retry || !retryable) {
        throw toClientRequestError(error);
      }

      await new Promise((resolve) =>
        setTimeout(resolve, retryDelayMs * (attempt + 1)),
      );
    } finally {
      clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener("abort", abortListener);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("请求失败");
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

export function formatUnitOptionLabel(unit: UnitOption) {
  return `Unit ${unit.unit_number} · ${unit.title}`;
}

export function sourceKindLabel(
  kind:
    | QuestionBankQuestionListItem["sourceKind"]
    | QuestionBankMaterialItem["materialType"],
) {
  switch (kind) {
    case "pdf_scan":
    case "pdf_scan_upload":
      return "PDF 拆题";
    case "knowledge_document":
      return "资料库文档";
    case "agent_generated_batch":
    case "agent_generated":
      return AGENT_GENERATED_SOURCE_LABEL;
    case "manual":
      return "手动录入";
    default:
      return "未知来源";
  }
}

export function mapMaterialTypeToSourceKind(
  materialType: QuestionBankMaterialItem["materialType"],
): (typeof SOURCE_KIND_OPTIONS)[number]["value"] {
  switch (materialType) {
    case "pdf_scan_upload":
      return "pdf_scan";
    case "knowledge_document":
      return "knowledge_document";
    case "agent_generated_batch":
      return "agent_generated";
    default:
      return "all";
  }
}

export function typeBadgeStyle(type: string) {
  switch (type) {
    case "MC":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "FR":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "fill_in":
      return "bg-violet-50 text-violet-700 border-violet-200";
    default:
      return "bg-slate-50 text-slate-600 border-slate-200";
  }
}

export function typeLabel(type: string) {
  switch (type) {
    case "MC":
      return "选择";
    case "FR":
      return "问答";
    case "fill_in":
      return "填空";
    default:
      return type;
  }
}

export function difficultyDots(level: number) {
  return Array.from({ length: 4 }, (_, i) => i < level);
}

export function reviewTone(status: string | null | undefined) {
  if (status === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "critical") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "review") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

export function reviewLabel(status: string | null | undefined) {
  if (status === "ready") return "已验证";
  if (status === "critical") return "需审核";
  if (status === "review") return "建议审核";
  return "未标记";
}

export function classificationTone(status: string | null | undefined) {
  if (status === "auto_confirmed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "teacher_confirmed") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "needs_review") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

export function classificationLabel(status: string | null | undefined) {
  if (status === "auto_confirmed") return "自动归类稳定";
  if (status === "teacher_confirmed") return "已人工确认";
  if (status === "needs_review") return "分类待确认";
  return "未归类";
}

export function materialQuestionBankTone(status: string | null | undefined) {
  if (status === "saved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "requires_review" || status === "requires_curriculum") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (status === "failed") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "processing" || status === "queued") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  return "border-slate-200 bg-slate-100 text-slate-600";
}

export function materialQuestionBankLabel(status: string | null | undefined) {
  if (status === "saved") return "已自动入题库";
  if (status === "requires_review") return "部分待审核";
  if (status === "requires_curriculum") return "待补充课程";
  if (status === "processing") return "正在自动抽题";
  if (status === "queued") return "已加入抽题队列";
  if (status === "failed") return "自动抽题失败";
  if (status === "no_questions") return "未识别到稳定题目";
  if (status === "skipped") return "保留为资料";
  return "未进入抽题";
}

export function buildMaterialSelectionKey(item: QuestionBankMaterialItem) {
  return `${item.materialType}:${item.id}`;
}

// ---------------------------------------------------------------------------
// Knowledge tree building
// ---------------------------------------------------------------------------

export type KnowledgeTreeTopic = {
  label: string;
  count: number;
};

export type KnowledgeTreeUnit = {
  key: string;
  label: string;
  count: number;
  topics: KnowledgeTreeTopic[];
};

export type KnowledgeTreeNode = {
  clusterKey: string;
  label: string;
  count: number;
  units: KnowledgeTreeUnit[];
  /** Flat subskills for backward compat (items without unit) */
  subskills: KnowledgeTreeTopic[];
};

export function buildKnowledgeTree(
  questions: QuestionBankQuestionListItem[],
): KnowledgeTreeNode[] {
  const clusters = new Map<
    string,
    {
      label: string;
      count: number;
      units: Map<string, { label: string; count: number; topics: Map<string, number> }>;
      orphanTopics: Map<string, number>;
    }
  >();

  for (const q of questions) {
    const key = q.knowledgeCluster || "general";
    const label = q.knowledgeClusterLabel || "综合知识";

    if (!clusters.has(key)) {
      clusters.set(key, { label, count: 0, units: new Map(), orphanTopics: new Map() });
    }
    const node = clusters.get(key)!;
    node.count++;

    const unitKey = q.knowledgeSubskillKey;
    const topicLabel = q.knowledgeSubskillLabel;

    if (unitKey) {
      if (!node.units.has(unitKey)) {
        node.units.set(unitKey, {
          label: humanizeKey(unitKey),
          count: 0,
          topics: new Map(),
        });
      }
      const unitNode = node.units.get(unitKey)!;
      unitNode.count++;
      if (topicLabel) {
        const tc = unitNode.topics.get(topicLabel) ?? 0;
        unitNode.topics.set(topicLabel, tc + 1);
      }
    } else if (topicLabel) {
      const tc = node.orphanTopics.get(topicLabel) ?? 0;
      node.orphanTopics.set(topicLabel, tc + 1);
    }
  }

  return Array.from(clusters.entries())
    .map(([clusterKey, data]) => ({
      clusterKey,
      label: data.label,
      count: data.count,
      units: Array.from(data.units.entries())
        .map(([unitKey, u]) => ({
          key: unitKey,
          label: u.label,
          count: u.count,
          topics: Array.from(u.topics.entries())
            .map(([tLabel, tCount]) => ({ label: tLabel, count: tCount }))
            .sort((a, b) => b.count - a.count),
        }))
        .sort((a, b) => b.count - a.count),
      subskills: Array.from(data.orphanTopics.entries())
        .map(([tLabel, tCount]) => ({ label: tLabel, count: tCount }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.count - a.count);
}

function humanizeKey(key: string): string {
  // unit_1_basic_economic_concepts → "Unit 1: Basic Economic Concepts"
  const unitMatch = key.match(/^unit_(\d+)_(.+)$/);
  if (unitMatch) {
    const unitNum = unitMatch[1];
    const rest = unitMatch[2]
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return `Unit ${unitNum}: ${rest}`;
  }
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
