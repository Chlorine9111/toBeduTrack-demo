"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckSquare2, Loader2, Plus, Search, SlidersHorizontal } from "lucide-react";
import {
  QUESTION_TYPE_OPTIONS,
  formatUnitOptionLabel,
  requestJson,
  type CourseOption,
  type QuestionBankListResponse,
  type QuestionBankQuestionListItem,
  type UnitOption,
} from "@/components/main/question-bank/helpers";
import QuestionContentWithImages from "@/components/shared/QuestionContentWithImages";
import { cn } from "@/lib/utils";

type BuilderSearchPanelProps = {
  courses: CourseOption[];
  units: UnitOption[];
  initialCourseId?: string | null;
  initialUnitId?: string | null;
  importedExerciseIds?: string[];
  onImport: (exerciseIds: string[]) => Promise<void> | void;
  importing?: boolean;
};

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

function formatQuestionPreview(content: string) {
  return content
    .replace(/\s+\(([A-E])\)(?=\s|[A-Za-z\u4e00-\u9fa5$\\])/g, "\n($1)")
    .replace(/\s+([A-E])[.)、．:：](?=\s|[A-Za-z\u4e00-\u9fa5$\\])/g, "\n$1.")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function summarizeFilters(params: {
  courseId: string;
  unitId: string;
  typeFilter: (typeof QUESTION_TYPE_OPTIONS)[number]["value"];
  courses: CourseOption[];
  units: UnitOption[];
}) {
  const labels: string[] = [];
  const courseName = params.courses.find((course) => course.id === params.courseId)?.name;
  const unitLabel = params.units.find((unit) => unit.id === params.unitId);
  const typeLabel = QUESTION_TYPE_OPTIONS.find((option) => option.value === params.typeFilter)?.label;

  if (courseName) labels.push(courseName);
  if (unitLabel) labels.push(formatUnitOptionLabel(unitLabel));
  if (typeLabel && params.typeFilter !== "all") labels.push(typeLabel);

  return labels;
}

export default function BuilderSearchPanel({
  courses,
  units,
  initialCourseId,
  initialUnitId,
  importedExerciseIds = [],
  onImport,
  importing = false,
}: BuilderSearchPanelProps) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [courseId, setCourseId] = useState(initialCourseId ?? "");
  const [unitId, setUnitId] = useState(initialUnitId ?? "");
  const [typeFilter, setTypeFilter] =
    useState<(typeof QUESTION_TYPE_OPTIONS)[number]["value"]>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [items, setItems] = useState<QuestionBankQuestionListItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    setCourseId(initialCourseId ?? "");
  }, [initialCourseId]);

  useEffect(() => {
    setUnitId(initialUnitId ?? "");
  }, [initialUnitId]);

  const filteredUnits = useMemo(
    () => units.filter((unit) => !courseId || unit.course_id === courseId),
    [courseId, units],
  );

  const importedIdSet = useMemo(
    () => new Set(importedExerciseIds),
    [importedExerciseIds],
  );
  const filterSummary = useMemo(
    () =>
      summarizeFilters({
        courseId,
        unitId,
        typeFilter,
        courses,
        units: filteredUnits,
      }),
    [courseId, courses, filteredUnits, typeFilter, unitId],
  );
  const activeFilterCount = filterSummary.length;

  useEffect(() => {
    if (unitId && !filteredUnits.some((unit) => unit.id === unitId)) {
      setUnitId("");
    }
  }, [filteredUnits, unitId]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set("limit", "80");
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    if (courseId) params.set("courseId", courseId);
    if (unitId) params.set("unitId", unitId);
    if (typeFilter !== "all") params.set("type", typeFilter);

    setLoading(true);
    setErrorText("");

    requestJson<QuestionBankListResponse>(`/api/question-bank?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setItems(payload.items);
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!controller.signal.aborted) {
          setItems([]);
          setErrorText(error instanceof Error ? error.message : "读取题库失败");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [courseId, debouncedQuery, typeFilter, unitId]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => items.some((item) => item.id === id)));
  }, [items]);

  const allVisibleSelected =
    items.length > 0 && items.every((item) => selectedIds.includes(item.id));

  const toggleSelected = (exerciseId: string) => {
    setSelectedIds((current) =>
      current.includes(exerciseId)
        ? current.filter((id) => id !== exerciseId)
        : [...current, exerciseId],
    );
  };

  const handleImportSelection = async () => {
    if (selectedIds.length === 0 || importing) return;
    await onImport(selectedIds);
    setSelectedIds([]);
  };

  return (
    <aside className="flex h-full w-full flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
          Builder Search
        </p>
        <h2 className="mt-1 text-base font-semibold text-slate-900">题库搜索</h2>
        <p className="mt-1 text-sm text-slate-500">搜索老师已上传题目并导入当前组卷稿。</p>
      </div>

      <div className="space-y-3 border-b border-slate-200 px-4 py-4">
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜题干、来源、知识点"
            className="w-full bg-transparent text-sm text-slate-800 outline-hidden placeholder:text-slate-400"
          />
        </label>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen((current) => !current)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
            >
              <SlidersHorizontal className="h-4 w-4" />
              筛选条件
              {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>

            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setCourseId("");
                  setUnitId("");
                  setTypeFilter("all");
                }}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-500 transition hover:bg-slate-50"
              >
                清空
              </button>
            ) : null}
          </div>

          <p className="text-xs text-slate-500">
            {filterSummary.length > 0 ? filterSummary.join(" · ") : "当前为全部课程 / 单元 / 题型"}
          </p>

          {filtersOpen ? (
            <div className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <select
                value={courseId}
                onChange={(event) => setCourseId(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-hidden"
              >
                <option value="">全部课程</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>

              <select
                value={unitId}
                onChange={(event) => setUnitId(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-hidden"
              >
                <option value="">全部单元</option>
                {filteredUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {formatUnitOptionLabel(unit)}
                  </option>
                ))}
              </select>

              {/* 题型筛选暂时隐藏 — 当前仅有选择题，后续扩展题型时恢复 */}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setSelectedIds(
                allVisibleSelected ? [] : items.map((item) => item.id),
              )
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
          >
            <CheckSquare2 className="h-4 w-4" />
            {allVisibleSelected ? "取消全选" : "全选当前结果"}
          </button>

          <button
            type="button"
            onClick={() => void handleImportSelection()}
            disabled={selectedIds.length === 0 || importing}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition",
              selectedIds.length === 0 || importing
                ? "cursor-not-allowed bg-slate-200 text-slate-500"
                : "bg-slate-900 text-white hover:bg-slate-800",
            )}
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            导入所选
            {selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在读取题库...
          </div>
        ) : errorText ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-600">
            {errorText}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            当前筛选下没有可导入题目。
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const selected = selectedIds.includes(item.id);
              const alreadyImported = importedIdSet.has(item.id);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleSelected(item.id)}
                  className={cn(
                    "w-full rounded-2xl border px-4 py-4 text-left transition",
                    selected
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
                            selected
                              ? "bg-white/10 text-white"
                              : "bg-slate-100 text-slate-700",
                          )}
                        >
                          {item.type}
                        </span>
                        <span
                          className={cn(
                            "text-xs",
                            selected ? "text-slate-200" : "text-slate-500",
                          )}
                        >
                          难度 {item.difficulty}
                        </span>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm font-medium">{item.title}</p>
                      <div
                        className={cn(
                          "mt-2 flex flex-wrap gap-2 text-xs",
                          selected ? "text-slate-200" : "text-slate-500",
                        )}
                      >
                        {item.courseName ? <span>{item.courseName}</span> : null}
                        {item.unitName ? <span>{item.unitName}</span> : null}
                      </div>
                    </div>
                    {alreadyImported ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-1 text-[11px] font-medium",
                          selected
                            ? "bg-white/10 text-white"
                            : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
                        )}
                      >
                        已导入
                      </span>
                    ) : null}
                  </div>

                  <div
                    className={cn(
                      "relative mt-3 overflow-hidden rounded-2xl border p-3",
                      selected
                        ? "border-white/15 bg-white/5"
                        : "border-slate-200 bg-slate-50/70",
                    )}
                  >
                    <p
                      className={cn(
                        "mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]",
                        selected ? "text-slate-300" : "text-slate-400",
                      )}
                    >
                      Question Preview
                    </p>
                    <div className="max-h-48 overflow-hidden">
                      <QuestionContentWithImages
                        content={formatQuestionPreview(item.questionText)}
                        className={cn(
                          "space-y-3 text-sm leading-6",
                          selected ? "text-slate-100" : "text-slate-700",
                        )}
                        textClassName={selected ? "text-slate-100" : "text-slate-700"}
                        galleryClassName="grid gap-2"
                        figureClassName={cn(
                          "overflow-hidden rounded-xl border",
                          selected ? "border-white/10 bg-white/5" : "border-slate-200 bg-white",
                        )}
                        imageClassName="block max-h-40 w-auto max-w-[50%] object-contain bg-transparent"
                      />
                    </div>
                    <div
                      className={cn(
                        "pointer-events-none absolute inset-x-0 bottom-0 h-14",
                        selected
                          ? "bg-linear-to-t from-slate-900 via-slate-900/90 to-transparent"
                          : "bg-linear-to-t from-white via-white/90 to-transparent",
                      )}
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className={selected ? "text-slate-200" : "text-slate-500"}>
                      {item.sourceFileName || "无来源文件"}
                    </span>
                    <span className={selected ? "text-slate-100" : "text-slate-700"}>
                      {selected ? "已选择" : "点击选择"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
