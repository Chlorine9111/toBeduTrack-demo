import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getLessonPlanContext } from "@/lib/lesson-plan/context";
import { queryLessonPlans } from "@/lib/lesson-plan/store";
import type {
  LessonPlanListOptions,
  LessonPlanListSort,
  LessonPlanListStatus,
  PublicLessonPlanSummary,
} from "@/lib/lesson-plan/types";

const STATUS_VALUES: LessonPlanListStatus[] = [
  "active",
  "draft",
  "published",
  "archived",
  "all",
];
const SORT_VALUES: LessonPlanListSort[] = [
  "updated_desc",
  "created_desc",
  "title_asc",
  "title_desc",
];

function parseStatus(value: string | null): LessonPlanListStatus {
  if (!value) return "active";
  if (STATUS_VALUES.includes(value as LessonPlanListStatus)) {
    return value as LessonPlanListStatus;
  }
  return "active";
}

function parseSort(value: string | null): LessonPlanListSort {
  if (!value) return "updated_desc";
  if (SORT_VALUES.includes(value as LessonPlanListSort)) {
    return value as LessonPlanListSort;
  }
  return "updated_desc";
}

function parsePositiveNumber(value: string | null, fallback: number, max: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

function buildSubjectGroups(plans: PublicLessonPlanSummary[]) {
  const groups = new Map<string, PublicLessonPlanSummary[]>();
  plans.forEach((plan) => {
    const key = plan.subjectLabel || "未分类";
    const list = groups.get(key) ?? [];
    list.push(plan);
    groups.set(key, list);
  });

  return Array.from(groups.entries()).map(([subjectLabel, items]) => ({
    subjectLabel,
    count: items.length,
    planIds: items.map((item) => item.id),
  }));
}

export async function GET(request: Request) {
  const contextResult = await getLessonPlanContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  try {
    const url = new URL(request.url);
    const options: LessonPlanListOptions = {
      status: parseStatus(url.searchParams.get("status")),
      sort: parseSort(url.searchParams.get("sort")),
      query: url.searchParams.get("q") ?? undefined,
      courseId: url.searchParams.get("courseId") ?? undefined,
      limit: parsePositiveNumber(url.searchParams.get("limit"), 20, 100),
      offset: parsePositiveNumber(url.searchParams.get("offset"), 0, 10000),
    };

    const { items, total } = await queryLessonPlans(contextResult.value, options);
    return NextResponse.json({
      lessonPlans: items,
      total,
      limit: options.limit,
      offset: options.offset,
      hasMore: (options.offset ?? 0) + (options.limit ?? 20) < total,
      groups: buildSubjectGroups(items),
    });
  } catch (error) {
    console.error("读取教案列表失败", error);
    return jsonError("INTERNAL_ERROR", "读取教案列表失败", 500);
  }
}
