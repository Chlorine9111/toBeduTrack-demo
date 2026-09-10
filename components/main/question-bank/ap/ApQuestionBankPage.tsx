"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Filter,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { requestJson } from "@/components/main/question-bank/helpers";
import type {
  ApQuestionBankDifficulty,
  ApQuestionBankListResponse,
  ApQuestionBankMaterialDetailResponse,
  ApQuestionBankMaterialItem,
  ApQuestionBankMaterialsResponse,
  ApQuestionBankSearchMode,
  ApQuestionBankSearchResponse,
  ApQuestionBankSearchResultRow,
} from "@/lib/question-bank/ap-types";
import { cn } from "@/lib/utils";
import ApQuestionCard, { apCourseLabel } from "./ApQuestionCard";
import ApQuestionDetailModal from "./ApQuestionDetailModal";

const PAGE_SIZE = 18;
const MATERIALS_PAGE_SIZE = 18;
const DEBOUNCE_MS = 300;

const COURSE_UNIT_MAP: Record<string, { label: string; unitStart: number; unitEnd: number }> = {
  APES: { label: "AP Environmental Science", unitStart: 1, unitEnd: 9 },
  AP_BIO: { label: "AP Biology", unitStart: 1, unitEnd: 8 },
  AP_CHEM: { label: "AP Chemistry", unitStart: 1, unitEnd: 9 },
  AP_CALC_AB: { label: "AP Calculus AB", unitStart: 1, unitEnd: 8 },
  AP_CALC_BC: { label: "AP Calculus BC", unitStart: 1, unitEnd: 10 },
  AP_PRECALC: { label: "AP Precalculus", unitStart: 1, unitEnd: 4 },
  AP_STATS: { label: "AP Statistics", unitStart: 1, unitEnd: 9 },
  AP_MACRO: { label: "AP Macroeconomics", unitStart: 1, unitEnd: 6 },
  AP_MICRO: { label: "AP Microeconomics", unitStart: 1, unitEnd: 6 },
  AP_CSA: { label: "AP Computer Science A", unitStart: 1, unitEnd: 10 },
  AP_CSP: { label: "AP Computer Science Principles", unitStart: 1, unitEnd: 5 },
  AP_PHYSICS_1: { label: "AP Physics 1", unitStart: 1, unitEnd: 8 },
  AP_PHYSICS_2: { label: "AP Physics 2", unitStart: 9, unitEnd: 15 },
  AP_PHYSICS_C_MECH: { label: "AP Physics C Mechanics", unitStart: 1, unitEnd: 7 },
  AP_PHYSICS_C_EM: { label: "AP Physics C E&M", unitStart: 8, unitEnd: 13 },
};

const DIFFICULTY_OPTIONS: Array<{ value: "" | ApQuestionBankDifficulty; label: string }> = [
  { value: "", label: "All difficulties" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

const COGNITIVE_TASK_OPTIONS = [
  { value: "", label: "All tasks" },
  { value: "recall", label: "Recall" },
  { value: "diagram_reading", label: "Diagram Reading" },
  { value: "calculation", label: "Calculation" },
  { value: "causal_prediction", label: "Causal Prediction" },
  { value: "comparison", label: "Comparison" },
  { value: "scenario_application", label: "Scenario Application" },
  { value: "evidence_evaluation", label: "Evidence Evaluation" },
] as const;

type ViewMode = "questions" | "materials";

function toSearchRow(
  item: ApQuestionBankListResponse["items"][number] | ApQuestionBankMaterialDetailResponse["questions"][number],
): ApQuestionBankSearchResultRow {
  const stimulus =
    "stimulus" in item
      ? Array.isArray(item.stimulus)
        ? item.stimulus[0] ?? null
        : item.stimulus ?? null
      : null;

  return {
    id: item.id,
    course: item.course,
    unit: item.unit,
    topic_code: item.topic_code,
    difficulty: item.difficulty,
    cognitive_task: item.cognitive_task,
    transfer_distance: null,
    source_assessment: item.source_assessment,
    question_number: item.question_number,
    stem: item.stem,
    choices: item.choices,
    correct_answer: item.correct_answer,
    explanation: item.explanation,
    key_concepts: item.key_concepts ?? [],
    stimulus_id: "stimulus_id" in item ? item.stimulus_id : null,
    standalone_usable: item.standalone_usable,
    similarity: 0,
    stimulus_content_type: stimulus?.content_type ?? null,
    stimulus_description: stimulus?.description ?? null,
    stimulus_image_url: stimulus?.image_url ?? null,
  };
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

function PaginationBar({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (nextPage: number) => void;
}) {
  const [jumpInput, setJumpInput] = useState("");
  const pageNumbers = useMemo(() => {
    const maxVisible = 7;
    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const pages: Array<number | "ellipsis"> = [1];
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);

    if (start > 2) pages.push("ellipsis");
    for (let cursor = start; cursor <= end; cursor += 1) pages.push(cursor);
    if (end < totalPages - 1) pages.push("ellipsis");
    pages.push(totalPages);

    return pages;
  }, [page, totalPages]);

  const handleJump = () => {
    const num = parseInt(jumpInput, 10);
    if (Number.isNaN(num) || jumpInput.trim() === "") return;
    const clamped = Math.max(1, Math.min(num, totalPages));
    onPageChange(clamped);
    setJumpInput("");
  };

  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-col items-center gap-2 pb-4 pt-2">
      <nav className="flex items-center justify-center gap-1" title="Shift+← / Shift+→ to navigate pages">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[#37352F]/50 transition hover:bg-[#f7f6f3] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pageNumbers.map((item, index) =>
          item === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              className="inline-flex h-9 w-9 items-center justify-center text-sm text-[#37352F]/40"
            >
              ...
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              className={cn(
                "inline-flex h-9 min-w-[36px] items-center justify-center rounded-xl px-2 text-sm font-medium transition",
                item === page
                  ? "bg-[#37352F] text-white"
                  : "text-[#37352F]/72 hover:bg-[#f7f6f3]",
              )}
            >
              {item}
            </button>
          ),
        )}

        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[#37352F]/50 transition hover:bg-[#f7f6f3] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </nav>

      <div className="flex items-center gap-2 text-sm text-[#37352F]/60">
        <span>跳转到</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={jumpInput}
          onChange={(e) => setJumpInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleJump(); }}
          placeholder={String(page)}
          className="h-8 w-14 rounded-lg border border-[rgba(55,53,47,0.16)] bg-white px-2 text-center text-sm text-[#37352F] outline-none transition placeholder:text-[#37352F]/30 focus:border-[#37352F]/40 focus:placeholder:text-transparent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span>页</span>
        <button
          type="button"
          onClick={handleJump}
          disabled={jumpInput.trim() === ""}
          className="inline-flex h-8 items-center rounded-lg bg-[#f7f6f3] px-3 text-sm font-medium text-[#37352F]/60 transition hover:bg-[#EDECE9] hover:text-[#37352F] disabled:opacity-30"
        >
          Go
        </button>
      </div>
    </div>
  );
}

function MaterialDetailDrawer({
  material,
  onClose,
}: {
  material: ApQuestionBankMaterialItem;
  onClose: () => void;
}) {
  const [questions, setQuestions] = useState<ApQuestionBankSearchResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [selectedItem, setSelectedItem] = useState<ApQuestionBankSearchResultRow | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setErrorText("");

      try {
        const params = new URLSearchParams({
          course: material.course,
          sourceAssessment: material.sourceAssessment,
        });
        const response = await requestJson<ApQuestionBankMaterialDetailResponse>(
          `/api/question-bank/ap/materials/detail?${params.toString()}`,
          { signal: controller.signal },
        );
        setQuestions(response.questions.map((item) => toSearchRow(item)));
      } catch (error) {
        if (controller.signal.aborted) return;
        setErrorText(error instanceof Error ? error.message : "Failed to load material");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [material.course, material.sourceAssessment]);

  return (
    <>
      <div className="fixed inset-y-0 right-0 z-30 flex w-full max-w-xl animate-[slideInRight_0.3s_ease-out_both] border-l border-[rgba(55,53,47,0.16)]">
        <div className="flex w-full flex-col overflow-hidden bg-white shadow-[-8px_0_24px_rgba(15,23,42,0.08)]">
          <div className="flex items-start justify-between border-b border-[rgba(55,53,47,0.16)] px-6 py-5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded-[8px] bg-[#f7f6f3] px-2.5 py-1 text-xs font-medium text-[#37352F]/60">
                  {apCourseLabel(material.course)}
                </span>
                <span className="rounded-[8px] bg-[#f7f6f3] px-2.5 py-1 text-xs font-medium text-[#37352F]/60">
                  Unit {material.unit}
                </span>
                <span className="rounded-[8px] bg-[#f7f6f3] px-2.5 py-1 text-xs font-medium text-[#37352F]/60">
                  {material.questionCount} questions
                </span>
              </div>
              <h2 className="mt-2 line-clamp-2 break-all text-lg font-semibold text-[#37352F]">
                {material.sourceAssessment}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ml-4 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[#37352F]/50 transition hover:bg-[#f7f6f3] hover:text-[#37352F]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {loading ? (
              <div className="flex min-h-[200px] items-center justify-center text-[#37352F]/50">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading questions...
              </div>
            ) : errorText ? (
              <div className="rounded-[12px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
                {errorText}
              </div>
            ) : questions.length === 0 ? (
              <div className="rounded-[12px] border border-dashed border-[rgba(55,53,47,0.16)] bg-[#f7f6f3] px-5 py-10 text-center text-sm text-[#37352F]/50">
                No questions in this material.
              </div>
            ) : (
              <div className="space-y-4">
                {questions.map((question, index) => (
                  <div
                    key={question.id}
                    className="animate-[fadeSlideIn_0.3s_ease-out_both]"
                    style={{ animationDelay: `${index * 40}ms` }}
                  >
                    <ApQuestionCard
                      item={question}
                      onSelectItem={setSelectedItem}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedItem ? (
        <ApQuestionDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      ) : null}
    </>
  );
}

export default function ApQuestionBankPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("questions");
  const [queryInput, setQueryInput] = useState("");
  const query = useDebouncedValue(queryInput, DEBOUNCE_MS).trim();
  const [course, setCourse] = useState("");
  const [unit, setUnit] = useState("");
  const [difficulty, setDifficulty] = useState<"" | ApQuestionBankDifficulty>("");
  const [cognitiveTask, setCognitiveTask] = useState("");
  const [mode, setMode] = useState<ApQuestionBankSearchMode>("content");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ApQuestionBankSearchResultRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [selectedItem, setSelectedItem] = useState<ApQuestionBankSearchResultRow | null>(null);
  const [materials, setMaterials] = useState<ApQuestionBankMaterialItem[]>([]);
  const [materialsTotal, setMaterialsTotal] = useState(0);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState("");
  const [materialsPage, setMaterialsPage] = useState(1);
  const [selectedMaterial, setSelectedMaterial] = useState<ApQuestionBankMaterialItem | null>(null);

  const isSearchMode = query.length > 0;

  const unitOptions = useMemo(() => {
    if (!course) return [];
    const info = COURSE_UNIT_MAP[course];
    if (!info) return [];
    return Array.from(
      { length: info.unitEnd - info.unitStart + 1 },
      (_, index) => info.unitStart + index,
    );
  }, [course]);

  const pagedMaterials = useMemo(() => {
    const start = (materialsPage - 1) * MATERIALS_PAGE_SIZE;
    return materials.slice(start, start + MATERIALS_PAGE_SIZE);
  }, [materials, materialsPage]);

  useEffect(() => {
    setPage(1);
    setMaterialsPage(1);
  }, [query, course, unit, difficulty, cognitiveTask, mode]);

  useEffect(() => {
    setUnit("");
  }, [course]);

  useEffect(() => {
    if (viewMode !== "questions") {
      setSelectedItem(null);
    }
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== "questions") return;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setErrorText("");

      try {
        if (isSearchMode) {
          const response = await requestJson<ApQuestionBankSearchResponse>(
            "/api/question-bank/ap/search",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({
                query,
                course: course || undefined,
                unit: unit ? Number.parseInt(unit, 10) : undefined,
                difficulty: difficulty || undefined,
                cognitive_task: cognitiveTask || undefined,
                mode,
                limit: 0,
              }),
            },
          );

          setItems(response.data);
          setTotal(response.total);
          return;
        }

        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
        });
        if (course) params.set("course", course);
        if (unit) params.set("unit", unit);
        if (difficulty) params.set("difficulty", difficulty);
        if (cognitiveTask) params.set("cognitiveTask", cognitiveTask);

        const response = await requestJson<ApQuestionBankListResponse>(
          `/api/question-bank/ap/list?${params.toString()}`,
          { signal: controller.signal },
        );

        setItems(response.items.map((item) => toSearchRow(item)));
        setTotal(response.total);
      } catch (error) {
        if (controller.signal.aborted) return;
        setErrorText(error instanceof Error ? error.message : "Failed to load AP archive");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [query, course, unit, difficulty, cognitiveTask, mode, page, isSearchMode, viewMode]);

  useEffect(() => {
    if (viewMode !== "materials") return;
    const controller = new AbortController();

    async function load() {
      setMaterialsLoading(true);
      setMaterialsError("");

      try {
        const params = new URLSearchParams();
        if (course) params.set("course", course);
        if (unit) params.set("unit", unit);
        if (query) params.set("q", query);

        const response = await requestJson<ApQuestionBankMaterialsResponse>(
          `/api/question-bank/ap/materials?${params.toString()}`,
          { signal: controller.signal },
        );
        setMaterials(response.items);
        setMaterialsTotal(response.total);
      } catch (error) {
        if (controller.signal.aborted) return;
        setMaterialsError(error instanceof Error ? error.message : "Failed to load materials");
      } finally {
        if (!controller.signal.aborted) {
          setMaterialsLoading(false);
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [query, course, unit, viewMode]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const totalMaterialPages = Math.max(1, Math.ceil(materialsTotal / MATERIALS_PAGE_SIZE));

  const handleQueryChange = useCallback((value: string) => {
    setQueryInput(value);
  }, []);

  // Shift+ArrowLeft/Right 快捷键翻页（加载中时忽略，防止连按卡死）
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!event.shiftKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

      const tag = (event.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // 当前视图正在加载时忽略翻页
      if (viewMode === "questions" && loading) return;
      if (viewMode === "materials" && materialsLoading) return;

      event.preventDefault();

      if (viewMode === "questions" && !isSearchMode) {
        if (event.key === "ArrowLeft" && page > 1) {
          setPage((p) => p - 1);
        } else if (event.key === "ArrowRight" && page < totalPages) {
          setPage((p) => p + 1);
        }
      } else if (viewMode === "materials") {
        if (event.key === "ArrowLeft" && materialsPage > 1) {
          setMaterialsPage((p) => p - 1);
        } else if (event.key === "ArrowRight" && materialsPage < totalMaterialPages) {
          setMaterialsPage((p) => p + 1);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewMode, isSearchMode, page, totalPages, materialsPage, totalMaterialPages, loading, materialsLoading]);

  return (
    <div className="h-full overflow-y-auto bg-[#f7f6f3]">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 md:px-8 lg:px-12">
        <section className="rounded-[24px] border border-[rgba(55,53,47,0.12)] bg-white p-6 shadow-[0_16px_48px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <Link
                href="/main/question-bank"
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
              >
                <ChevronLeft className="h-4 w-4" />
                Back to Question Bank
              </Link>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                  AP Archive
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#37352F]">
                  Global AP question retrieval
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">
                  Browse the merged AP archive directly from the formal question-bank domain.
                  Use semantic search for intent-driven retrieval, or switch to materials when
                  you want to inspect paper-level coverage first.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("questions")}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium transition",
                    viewMode === "questions"
                      ? "bg-[#37352F] text-white"
                      : "text-slate-500 hover:text-slate-900",
                  )}
                >
                  Questions
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("materials")}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium transition",
                    viewMode === "materials"
                      ? "bg-[#37352F] text-white"
                      : "text-slate-500 hover:text-slate-900",
                  )}
                >
                  Materials
                </button>
              </div>

              <div className="rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700">
                {viewMode === "questions" ? `${total} results` : `${materialsTotal} materials`}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-4 rounded-[20px] border border-slate-200 bg-[#fcfcfb] p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <label className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={queryInput}
                  onChange={(event) => handleQueryChange(event.target.value)}
                  placeholder={
                    viewMode === "questions"
                      ? "Search AP questions by concept, misconception, or skill..."
                      : "Search source assessments..."
                  }
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-900 outline-hidden transition focus:border-slate-300"
                />
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={course}
                  onChange={(event) => setCourse(event.target.value)}
                  className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-hidden"
                >
                  <option value="">All courses</option>
                  {Object.entries(COURSE_UNIT_MAP).map(([value, meta]) => (
                    <option key={value} value={value}>
                      {meta.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setShowFilters((current) => !current)}
                  className={cn(
                    "inline-flex h-12 items-center gap-2 rounded-2xl border px-4 text-sm font-medium transition",
                    showFilters
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:text-slate-900",
                  )}
                >
                  <Filter className="h-4 w-4" />
                  Filters
                </button>
              </div>
            </div>

            {showFilters ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <select
                  value={unit}
                  onChange={(event) => setUnit(event.target.value)}
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-hidden"
                >
                  <option value="">All units</option>
                  {unitOptions.map((value) => (
                    <option key={value} value={value}>
                      Unit {value}
                    </option>
                  ))}
                </select>

                <select
                  value={difficulty}
                  onChange={(event) =>
                    setDifficulty(event.target.value as "" | ApQuestionBankDifficulty)
                  }
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-hidden"
                >
                  {DIFFICULTY_OPTIONS.map((option) => (
                    <option key={option.label} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <select
                  value={cognitiveTask}
                  onChange={(event) => setCognitiveTask(event.target.value)}
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-hidden"
                >
                  {COGNITIVE_TASK_OPTIONS.map((option) => (
                    <option key={option.value || option.label} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <select
                  value={mode}
                  onChange={(event) => setMode(event.target.value as ApQuestionBankSearchMode)}
                  disabled={!query}
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="content">Content search</option>
                  <option value="diagnostic">Diagnostic search</option>
                  <option value="auto">Auto detect</option>
                </select>
              </div>
            ) : null}
          </div>
        </section>

        {viewMode === "questions" ? (
          <>
            {loading ? (
              <div className="flex min-h-[320px] items-center justify-center rounded-[24px] border border-slate-200 bg-white text-slate-500 shadow-[0_16px_48px_rgba(15,23,42,0.05)]">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading AP archive...
              </div>
            ) : errorText ? (
              <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
                {errorText}
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
                No questions matched the current filters.
              </div>
            ) : (
              <>
                <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
                  {items.map((item) => (
                    <ApQuestionCard
                      key={item.id}
                      item={item}
                      onSelectItem={setSelectedItem}
                    />
                  ))}
                </div>
                {!isSearchMode && (
                  <PaginationBar
                    page={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                  />
                )}
              </>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between px-1 text-sm text-slate-500">
              <span>{materialsTotal} archived source assessments</span>
              {totalMaterialPages > 1 ? (
                <span>
                  Page {materialsPage}/{totalMaterialPages}
                </span>
              ) : null}
            </div>

            {materialsLoading ? (
              <div className="flex min-h-[320px] items-center justify-center rounded-[24px] border border-slate-200 bg-white text-slate-500 shadow-[0_16px_48px_rgba(15,23,42,0.05)]">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading materials...
              </div>
            ) : materialsError ? (
              <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
                {materialsError}
              </div>
            ) : materials.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
                No materials matched the current filters.
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {pagedMaterials.map((material) => (
                    <button
                      key={`${material.course}-${material.sourceAssessment}`}
                      type="button"
                      onClick={() => setSelectedMaterial(material)}
                      className="rounded-[24px] border border-slate-200 bg-white p-5 text-left shadow-[0_12px_32px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
                    >
                      <div className="flex items-center gap-2 text-xs">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                          {apCourseLabel(material.course)}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                          Unit {material.unit}
                        </span>
                      </div>
                      <div className="mt-4 flex items-start justify-between gap-3">
                        <div>
                          <h2 className="line-clamp-2 text-lg font-semibold text-[#37352F]">
                            {material.sourceAssessment}
                          </h2>
                          <p className="mt-2 text-sm leading-7 text-slate-500">
                            Open the assessment bundle and review its indexed questions.
                          </p>
                        </div>
                        <FileText className="mt-1 h-5 w-5 shrink-0 text-slate-300" />
                      </div>
                      <div className="mt-5 rounded-2xl bg-[#f7f6f3] px-4 py-3 text-sm font-medium text-slate-600">
                        {material.questionCount} questions
                      </div>
                    </button>
                  ))}
                </div>

                <PaginationBar
                  page={materialsPage}
                  totalPages={totalMaterialPages}
                  onPageChange={setMaterialsPage}
                />
              </>
            )}
          </>
        )}
      </div>

      {selectedItem ? (
        <ApQuestionDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      ) : null}

      {selectedMaterial ? (
        <MaterialDetailDrawer
          material={selectedMaterial}
          onClose={() => setSelectedMaterial(null)}
        />
      ) : null}
    </div>
  );
}
