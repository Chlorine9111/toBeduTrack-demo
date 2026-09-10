import type { ContentLibraryListItem } from "@/lib/content-library/types";
import type {
  CurriculumCourseOption as CourseOption,
  CurriculumUnitOption as UnitOption,
} from "@/lib/content-library/metadata-helpers";
import { formatUnitNameFromOption } from "@/lib/content-library/metadata-helpers";
import { toClientRequestError } from "@/lib/api/client";
import type {
  ExerciseTaxonomyMatchMode,
  ExerciseTaxonomyNodeStatus,
} from "@/types/exercise";

export type CurriculumOptionsResponse = {
  courses: CourseOption[];
  units: UnitOption[];
};

export type ContentLibraryListResponse = {
  items: ContentLibraryListItem[];
  total: number;
  hasMore: boolean;
};

export type ContentLibraryDeleteResponse = {
  deletedIds: string[];
  blockedIds: string[];
  missingIds: string[];
};

export type ExerciseTaxonomyNodeSummary = {
  id: string;
  nodeType: "cluster" | "subskill";
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

export type ExerciseTaxonomyListResponse = {
  nodes: ExerciseTaxonomyNodeSummary[];
};

export type DraftExerciseOption = {
  label: string;
  text: string;
  isCorrect: boolean;
};

export type ContentLibraryViewMode = "grid" | "list";

export function extractError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const data = payload as Record<string, unknown>;
  if (typeof data.error === "string") return data.error;
  if (data.error && typeof data.error === "object") {
    const nested = data.error as Record<string, unknown>;
    if (typeof nested.message === "string") return nested.message;
  }
  if (typeof data.message === "string") return data.message;
  return fallback;
}

export async function requestJson<T>(input: RequestInfo, init?: RequestInit) {
  try {
    const response = await fetch(input, {
      cache: "no-store",
      ...init,
    });
    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) {
      throw new Error(extractError(payload, `请求失败（${response.status}）`));
    }
    return payload as T;
  } catch (error) {
    throw toClientRequestError(error);
  }
}

export function createGroupKey(item: ContentLibraryListItem) {
  return `${item.courseName ?? "未分类课程"}__${item.unitName ?? "未分类单元"}`;
}

export function sanitizePreviewText(value: string | null | undefined, imageLabel: string) {
  if (!value) return "";

  return value
    .replace(/!\[[^\]]*]\([^)]*\)/g, imageLabel)
    .replace(/!\[[^\]]*]\([^)]*$/g, imageLabel)
    .replace(/!\[[^\]]*]/g, imageLabel)
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/\/api\/pdf\/scan-image\?[^\s)]+/g, "")
    .replace(/[()]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveCourseNameById(
  courses: CourseOption[],
  courseId: string | null | undefined,
  fallback: string | null | undefined,
) {
  if (fallback) return fallback;
  if (!courseId) return null;
  return courses.find((course) => course.id === courseId)?.name ?? null;
}

export function resolveUnitNameById(
  units: UnitOption[],
  unitId: string | null | undefined,
  fallback: string | null | undefined,
) {
  if (fallback) return fallback;
  if (!unitId) return null;
  const unit = units.find((item) => item.id === unitId) ?? null;
  return formatUnitNameFromOption(unit);
}

export function createEmptyOptions(): DraftExerciseOption[] {
  return ["A", "B", "C", "D"].map((label, index) => ({
    label,
    text: "",
    isCorrect: index === 0,
  }));
}

export function formatTaxonomyStatus(
  status: ExerciseTaxonomyNodeStatus | null | undefined,
  isZh: boolean,
) {
  if (status === "active") return isZh ? "正式" : "Active";
  if (status === "candidate") return isZh ? "候选" : "Candidate";
  if (status === "merged") return isZh ? "已合并" : "Merged";
  if (status === "rejected") return isZh ? "已驳回" : "Rejected";
  return isZh ? "未设置" : "Unassigned";
}

export function formatMatchMode(
  mode: ExerciseTaxonomyMatchMode | null | undefined,
  isZh: boolean,
) {
  if (mode === "matched_existing") return isZh ? "命中现有" : "Matched";
  if (mode === "candidate_new") return isZh ? "候选新类" : "Candidate";
  return isZh ? "待复核" : "Needs review";
}
