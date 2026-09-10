"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  PencilLine,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import QuestionContentWithImages, { stripMarkdownImages } from "@/components/shared/QuestionContentWithImages";
import type {
  WorksheetEditorQuestion,
  WorksheetEditorSection,
  WorksheetMaterialListItem,
  WorksheetQuestionBankItem,
  WorksheetSearchFilters,
  WorksheetSidebarTab,
} from "@/components/main/question-bank/worksheet-editor/types";
import {
  QUESTION_BANK_WORKSHEET_TYPE_OPTIONS,
  getDifficultyLabel,
  getQuestionTypeLabel,
} from "@/components/main/question-bank/worksheet-editor/utils";
import { cn } from "@/lib/utils";
import { useAppI18n } from "@/lib/app-i18n/provider";
import DraggableSearchResult from "./DraggableSearchResult";
import {
  tikuDifficultyLabel,
  tikuDifficultyColors,
  tikuCourseLabel,
} from "@/components/main/question-bank/tiku/TikuQuestionCard";

const COURSE_UNIT_MAP: Record<string, { label: string; labelEn: string; units: number }> = {
  APES: { label: "AP 环境科学", labelEn: "AP Environmental Science", units: 9 },
  AP_CHEM: { label: "AP 化学", labelEn: "AP Chemistry", units: 9 },
  AP_CSA: { label: "AP 计算机 A", labelEn: "AP Computer Science A", units: 10 },
  AP_MICRO: { label: "AP 微观经济", labelEn: "AP Microeconomics", units: 6 },
  AP_STATS: { label: "AP 统计", labelEn: "AP Statistics", units: 9 },
  AP_PHYSICS_1: { label: "AP 物理 1", labelEn: "AP Physics 1", units: 8 },
  AP_PHYSICS_2: { label: "AP 物理 2", labelEn: "AP Physics 2", units: 6 },
  AP_PHYSICS_C_MECH: { label: "AP 物理 C 力学", labelEn: "AP Physics C Mech", units: 7 },
  AP_PHYSICS_C_EM: { label: "AP 物理 C 电磁", labelEn: "AP Physics C E&M", units: 6 },
};

const COGNITIVE_TASKS = [
  { value: "recall", label: "Recall" },
  { value: "diagram_reading", label: "Diagram reading" },
  { value: "calculation", label: "Calculation" },
  { value: "causal_prediction", label: "Causal prediction" },
  { value: "comparison", label: "Comparison" },
  { value: "scenario_application", label: "Scenario application" },
  { value: "evidence_evaluation", label: "Evidence evaluation" },
];

const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

function getDifficultyBadgeClasses(difficulty: number) {
  if (difficulty <= 1) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (difficulty === 2) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (difficulty === 3) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-red-200 bg-red-50 text-red-700";
}

function SidebarStateCard({
  children,
  tone = "neutral",
  compact = false,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "error";
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "w-full rounded-xl border px-4 text-sm",
        compact ? "py-3" : "py-8 text-center",
        tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-dashed border-[rgba(55,53,47,0.12)] bg-white text-[#37352F]/45",
      )}
    >
      {children}
    </div>
  );
}

function SectionManager({
  sections,
  questions,
  activeQuestionId,
  activeSectionId,
  onNavigateQuestion,
  onNavigateSection,
  onAddSection,
  onRenameSection,
  onDeleteSection,
}: {
  sections: WorksheetEditorSection[];
  questions: WorksheetEditorQuestion[];
  activeQuestionId: string | null;
  activeSectionId: string | null;
  onNavigateQuestion: (questionId: string) => void;
  onNavigateSection: (sectionId: string) => void;
  onAddSection: () => void;
  onRenameSection: (sectionId: string, title: string) => void;
  onDeleteSection: (sectionId: string) => void;
}) {
  const { isZh } = useAppI18n();
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  function beginRename(section: WorksheetEditorSection) {
    setEditingSectionId(section.id);
    setDraftTitle(section.title);
  }

  function commitRename(section: WorksheetEditorSection) {
    const nextTitle = draftTitle.trim();
    if (nextTitle && nextTitle !== section.title) {
      onRenameSection(section.id, nextTitle);
    }
    setEditingSectionId(null);
    setDraftTitle("");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#37352F]/34">
            {isZh ? "试卷大纲" : "Worksheet Outline"}
          </p>
          <p className="mt-1 text-[13px] text-[#37352F]/46">
            {isZh ? "按分组和题号定位到中间纸面。" : "Navigate to questions by section and number."}
          </p>
        </div>
        <button
          type="button"
          onClick={onAddSection}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(55,53,47,0.1)] bg-white text-[#37352F]/68 transition hover:bg-[#faf8f3]"
            aria-label={isZh ? "新增分组" : "Add section"}
          >
            <Plus className="h-4 w-4" />
        </button>
      </div>

      {sections.map((section, sectionIndex) => {
        const sectionQuestions = questions
          .filter((question) => question.sectionId === section.id)
          .sort((left, right) => left.order - right.order);
        const isSectionActive =
          activeSectionId === section.id ||
          sectionQuestions.some((question) => question.id === activeQuestionId);

        return (
          <section
            key={section.id}
            className={cn(
              "group space-y-2 border-l pl-2.5 transition-colors",
              isSectionActive
                ? "border-[#1f1f1f]/22"
                : "border-[rgba(55,53,47,0.08)]",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-[0.12em] text-[#37352F]/30">
                  {isZh ? `第 ${sectionIndex + 1} 分组` : `Section ${sectionIndex + 1}`}
                </p>
                {editingSectionId === section.id ? (
                  <input
                    autoFocus
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    onBlur={() => commitRename(section)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitRename(section);
                      }
                      if (event.key === "Escape") {
                        setEditingSectionId(null);
                        setDraftTitle("");
                      }
                    }}
                    className="mt-1 w-full rounded-xl border border-[rgba(55,53,47,0.1)] bg-white px-2.5 py-2 text-sm font-semibold text-[#37352F] outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    data-outline-section-id={section.id}
                    onClick={() => onNavigateSection(section.id)}
                    onDoubleClick={() => beginRename(section)}
                    className={cn(
                      "mt-1 rounded-md px-1 py-0.5 text-left text-[13px] font-semibold transition",
                      isSectionActive
                        ? "bg-white text-[#111827] shadow-[inset_2px_0_0_#1f1f1f]"
                        : "text-[#37352F] hover:bg-white hover:text-[#111827]",
                    )}
                  >
                    {section.title}
                  </button>
                )}
                <p className="mt-1 text-[11px] text-[#37352F]/40">
                  {isZh ? `${sectionQuestions.length} 题` : `${sectionQuestions.length} questions`}
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => beginRename(section)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#37352F]/50 transition hover:bg-white hover:text-[#111827]"
                  aria-label={isZh ? "重命名分组" : "Rename section"}
                >
                  <PencilLine className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteSection(section.id)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-rose-600 transition hover:bg-rose-50"
                  aria-label={isZh ? "删除分组" : "Delete section"}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="space-y-1">
              {sectionQuestions.length === 0 ? (
                <div className="rounded-lg px-2 py-2 text-xs text-[#37352F]/35">
                  {isZh ? "这个分组还没有题目。" : "No questions in this section."}
                </div>
              ) : (
                sectionQuestions.map((question, index) => (
                  <button
                    key={question.id}
                    type="button"
                    data-outline-question-id={question.id}
                    onClick={() => onNavigateQuestion(question.id)}
                    className={cn(
                      "w-full rounded-lg border border-transparent px-2 py-2 text-left transition-colors",
                      activeQuestionId === question.id
                        ? "bg-white shadow-[inset_2px_0_0_#1f1f1f]"
                        : "hover:bg-white",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          "mt-0.5 shrink-0 text-[11px] font-semibold",
                          activeQuestionId === question.id
                            ? "text-[#1f1f1f]"
                            : "text-[#37352F]/40",
                        )}
                      >
                        {index + 1}.
                      </span>
                      <div className="min-w-0 flex-1">
                        <QuestionContentWithImages
                          content={question.questionText}
                          className="space-y-0"
                          textClassName={cn(
                            "line-clamp-2 text-[12px] leading-5",
                            activeQuestionId === question.id
                              ? "font-medium text-[#1f1f1f]"
                              : "text-[#37352F]/62",
                          )}
                          galleryClassName="hidden"
                        />
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default function QuestionBankSearchSidebar({
  tab,
  filters,
  results,
  loading,
  errorText,
  importedExerciseIds,
  materials,
  materialQuery,
  materialSourceScope,
  onChangeMaterialSourceScope,
  materialCourse,
  materialUnit,
  materialLoading,
  materialErrorText,
  selectedMaterialId,
  selectedMaterialLabel,
  sections,
  questions,
  activeQuestionId,
  activeSectionId,
  importTargetSectionId,
  onChangeTab,
  onChangeFilters,
  onChangeMaterialQuery,
  onChangeMaterialCourse,
  onChangeMaterialUnit,
  onSelectMaterial,
  onChangeImportTargetSectionId,
  onAddResult,
  onAddResults,
  onNavigateQuestion,
  onNavigateSection,
  onAddSection,
  onRenameSection,
  onDeleteSection,
  hasMore,
  loadingMore,
  onLoadMore,
  onDragStartItem,
}: {
  tab: WorksheetSidebarTab;
  filters: WorksheetSearchFilters;
  results: WorksheetQuestionBankItem[];
  loading: boolean;
  errorText: string;
  importedExerciseIds: Set<string>;
  materials: WorksheetMaterialListItem[];
  materialQuery: string;
  materialSourceScope: "all" | "global" | "personal";
  onChangeMaterialSourceScope: (scope: "all" | "global" | "personal") => void;
  materialCourse: string;
  materialUnit: string;
  materialLoading: boolean;
  materialErrorText: string;
  selectedMaterialId: string;
  selectedMaterialLabel: string;
  sections: WorksheetEditorSection[];
  questions: WorksheetEditorQuestion[];
  activeQuestionId: string | null;
  activeSectionId: string | null;
  importTargetSectionId: string;
  onChangeTab: (tab: WorksheetSidebarTab) => void;
  onChangeFilters: (patch: Partial<WorksheetSearchFilters>) => void;
  onChangeMaterialQuery: (value: string) => void;
  onChangeMaterialCourse: (value: string) => void;
  onChangeMaterialUnit: (value: string) => void;
  onSelectMaterial: (materialId: string) => void;
  onChangeImportTargetSectionId: (sectionId: string) => void;
  onAddResult: (item: WorksheetQuestionBankItem) => void;
  onAddResults: (items: WorksheetQuestionBankItem[]) => void;
  onNavigateQuestion: (questionId: string) => void;
  onNavigateSection: (sectionId: string) => void;
  onAddSection: () => void;
  onRenameSection: (sectionId: string, title: string) => void;
  onDeleteSection: (sectionId: string) => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onDragStartItem?: (item: WorksheetQuestionBankItem) => void;
}) {
  const { isZh } = useAppI18n();
  const [showFilters, setShowFilters] = useState(false);
  const [multiSelectMode, setMultiSelectMode] = useState(true);
  const [selectedResultIds, setSelectedResultIds] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(20);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 根据当前 tab 决定使用哪组数据（稳定引用，避免 useEffect 无限循环）
  const activeResults = useMemo(
    () => results,
    [results],
  );
  const activeHasMore = hasMore;
  const activeLoadingMore = loadingMore;
  const activeOnLoadMore = onLoadMore;

  // 排序：未导入的在前，已导入的在后
  const sortedResults = useMemo(() => {
    const notImported = activeResults.filter((item) => !importedExerciseIds.has(item.id));
    const imported = activeResults.filter((item) => importedExerciseIds.has(item.id));
    return [...notImported, ...imported];
  }, [activeResults, importedExerciseIds]);

  // 截取可见数量
  const visibleResults = useMemo(
    () => sortedResults.slice(0, visibleCount),
    [sortedResults, visibleCount],
  );

  // 结果完全替换时重置可见数量（追加时不重置）
  const prevResultsLengthRef = useRef(0);
  useEffect(() => {
    const prevLen = prevResultsLengthRef.current;
    const currLen = activeResults.length;
    // 追加：新长度 > 旧长度且旧长度 > 0 → 不重置
    if (currLen > prevLen && prevLen > 0) {
      // 追加了新数据，扩大可见范围以包含新内容
      setVisibleCount((prev) => Math.max(prev, currLen));
    } else {
      // 全新结果（筛选变更、来源切换等）
      setVisibleCount(20);
    }
    prevResultsLengthRef.current = currLen;
  }, [activeResults]);

  // 滚到底部加载更多（本地分页 + 远程加载）
  const loadThrottleRef = useRef(false);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    function handleScroll() {
      if (!container || loadThrottleRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight - scrollTop - clientHeight < 200) {
        // 本地还有未显示的 → 增加 visibleCount
        if (visibleCount < sortedResults.length) {
          setVisibleCount((prev) => Math.min(prev + 20, sortedResults.length));
        }
        // 本地已全部显示且远程还有 → 请求加载更多（防抖 1 秒）
        else if (activeHasMore && activeOnLoadMore && !activeLoadingMore) {
          loadThrottleRef.current = true;
          setTimeout(() => { loadThrottleRef.current = false; }, 1000);
          // 异步调用，避免在渲染期间 setState
          setTimeout(() => activeOnLoadMore(), 0);
        }
      }
    }

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [sortedResults.length, activeHasMore, activeOnLoadMore, activeLoadingMore, visibleCount]);
  const selectedCourseInfo = filters.course
    ? COURSE_UNIT_MAP[filters.course]
    : null;
  const unitOptions = selectedCourseInfo
    ? Array.from({ length: selectedCourseInfo.units }, (_, i) => i + 1)
    : [];
  const selectedCount = selectedResultIds.length;

  useEffect(() => {
    setSelectedResultIds((current) => {
      const next = current.filter(
        (itemId) =>
          activeResults.some((item) => item.id === itemId) && !importedExerciseIds.has(itemId),
      );
      if (next.length === current.length && next.every((id, i) => id === current[i])) {
        return current;
      }
      return next;
    });
  }, [activeResults, importedExerciseIds]);

  useEffect(() => {
    if (tab !== "search") {
      setSelectedResultIds([]);
    }
  }, [tab]);

  function toggleMultiSelectMode() {
    setMultiSelectMode((current) => !current);
  }

  function toggleResultSelection(itemId: string) {
    setSelectedResultIds((current) =>
      current.includes(itemId)
        ? current.filter((currentId) => currentId !== itemId)
        : [...current, itemId],
    );
  }

  function importSelectedResults() {
    const selectedItems = activeResults.filter(
      (item) =>
        selectedResultIds.includes(item.id) && !importedExerciseIds.has(item.id),
    );
    if (selectedItems.length === 0) {
      return;
    }
    onAddResults(selectedItems);
    setSelectedResultIds([]);
    setMultiSelectMode(false);
  }

  return (
    <aside className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden border-r border-[rgba(55,53,47,0.08)] bg-[#fbfbf8]">
      <div className="border-b border-[rgba(55,53,47,0.08)] px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex rounded-xl bg-[#f5f5f1] p-1">
            <button
              type="button"
              onClick={() => onChangeTab("materials")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                tab === "materials" ? "bg-white text-[#37352F]" : "text-[#37352F]/55",
              )}
            >
              {isZh ? "文件" : "Files"}
            </button>
            <button
              type="button"
              onClick={() => onChangeTab("search")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                tab === "search" ? "bg-white text-[#37352F]" : "text-[#37352F]/55",
              )}
            >
              {isZh ? "题库" : "Bank"}
            </button>
            <button
              type="button"
              onClick={() => onChangeTab("outline")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                tab === "outline" ? "bg-white text-[#37352F]" : "text-[#37352F]/55",
              )}
            >
              {isZh ? "大纲" : "Outline"}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {tab === "search" ? (
              <>
                <label className="inline-flex h-9 max-w-[148px] items-center rounded-lg border border-[rgba(55,53,47,0.1)] bg-white pl-2.5 pr-2 text-xs text-[#37352F]/62">
                  <span className="mr-1 shrink-0">{isZh ? "导入到" : "Import to"}</span>
                  <select
                    value={importTargetSectionId}
                    onChange={(event) => onChangeImportTargetSectionId(event.target.value)}
                    className="w-full bg-transparent text-xs font-medium text-[#37352F] outline-none"
                    aria-label={isZh ? "选择导入分组" : "Select import section"}
                  >
                    <option value="auto">{isZh ? "自动分组" : "Auto"}</option>
                    {sections.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.title}
                      </option>
                    ))}
                  </select>
                  </label>
                {selectedCount > 0 ? (
                  <button
                    type="button"
                    onClick={importSelectedResults}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#37352F] px-3 text-xs font-medium text-white transition hover:bg-[#27241f]"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {isZh ? `导入 ${selectedCount} 题` : `Import ${selectedCount}`}
                  </button>
                ) : (
                  <span className="inline-flex h-9 items-center px-2 text-[11px] text-[#37352F]/40">
                    {isZh ? "点击题目选中" : "Click to select"}
                  </span>
                )}
              </>
            ) : null}
            {tab === "outline" ? (
              <button
                type="button"
                onClick={onAddSection}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(55,53,47,0.1)] text-[#37352F]/65 transition hover:bg-[#faf8f3]"
                aria-label={isZh ? "新增分组" : "Add section"}
              >
                <Plus className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-h-0 min-w-0 w-full flex-1 overflow-hidden px-3 py-3">
        {tab === "outline" ? (
          <div className="h-full min-w-0 w-full overflow-y-auto pr-1">
            <SectionManager
              sections={sections}
              questions={questions}
              activeQuestionId={activeQuestionId}
              activeSectionId={activeSectionId}
              onNavigateQuestion={onNavigateQuestion}
              onNavigateSection={onNavigateSection}
              onAddSection={onAddSection}
              onRenameSection={onRenameSection}
              onDeleteSection={onDeleteSection}
            />
          </div>
        ) : tab === "materials" ? (
          <div className="flex h-full min-h-0 min-w-0 w-full flex-col gap-3">
            <div className="min-w-0 w-full shrink-0 space-y-3">
              <div className="w-full rounded-xl border border-[rgba(55,53,47,0.08)] bg-white px-3 py-3 text-xs leading-5 text-[#37352F]/58">
                {isZh ? "先选一份文件，题库页就会切换成这份文件里的题目。再次点击已选文件可取消范围。" : "Select a file to filter questions. Click again to deselect."}
              </div>
              {/* 来源筛选标签 */}
              <div className="inline-flex rounded-xl bg-[#f5f5f1] p-1">
                <button
                  type="button"
                  onClick={() => onChangeMaterialSourceScope("all")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                    materialSourceScope === "all" ? "bg-white text-[#37352F]" : "text-[#37352F]/55",
                  )}
                >
                  {isZh ? "全部" : "All"}
                </button>
                <button
                  type="button"
                  onClick={() => onChangeMaterialSourceScope("global")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                    materialSourceScope === "global" ? "bg-white text-[#37352F]" : "text-[#37352F]/55",
                  )}
                >
                  {isZh ? "AP 全局" : "AP Global"}
                </button>
                <button
                  type="button"
                  onClick={() => onChangeMaterialSourceScope("personal")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                    materialSourceScope === "personal" ? "bg-white text-[#37352F]" : "text-[#37352F]/55",
                  )}
                >
                  {isZh ? "个人上传" : "Personal"}
                </button>
              </div>
              {materialSourceScope !== "personal" ? (
              <div className="grid w-full grid-cols-2 gap-2">
                <select
                  value={materialCourse}
                  onChange={(event) => onChangeMaterialCourse(event.target.value)}
                  className="rounded-xl border border-[rgba(55,53,47,0.08)] bg-white px-3 py-2.5 text-sm text-[#37352F] outline-none"
                >
                  <option value="">{isZh ? "全部课程" : "All courses"}</option>
                  {Object.entries(COURSE_UNIT_MAP).map(([key, info]) => (
                    <option key={key} value={key}>
                      {isZh ? info.label : info.labelEn}
                    </option>
                  ))}
                </select>
                <select
                  value={materialUnit}
                  onChange={(event) => onChangeMaterialUnit(event.target.value)}
                  disabled={!materialCourse}
                  className="rounded-xl border border-[rgba(55,53,47,0.08)] bg-white px-3 py-2.5 text-sm text-[#37352F] outline-none disabled:opacity-50"
                >
                  <option value="">{isZh ? "全部单元" : "All units"}</option>
                  {materialCourse && COURSE_UNIT_MAP[materialCourse]
                    ? Array.from(
                        { length: COURSE_UNIT_MAP[materialCourse].units },
                        (_, i) => i + 1,
                      ).map((unitNum) => (
                        <option key={unitNum} value={String(unitNum)}>
                          Unit {unitNum}
                        </option>
                      ))
                    : null}
                </select>
              </div>
              ) : null}
              <label className="flex w-full items-center gap-2 rounded-xl border border-[rgba(55,53,47,0.08)] bg-white px-3 py-2.5">
                <Search className="h-4 w-4 text-[#8c7e68]" />
                <input
                  value={materialQuery}
                  onChange={(event) => onChangeMaterialQuery(event.target.value)}
                  className="w-full bg-transparent text-sm text-[#37352F] outline-none placeholder:text-[#8c7e68]"
                  placeholder={materialSourceScope === "personal"
                    ? (isZh ? "搜索个人文件..." : "Search personal files...")
                    : (isZh ? "搜索文件名称" : "Search files")}
                />
              </label>
            </div>

            <div className="min-h-0 min-w-0 w-full flex-1 overflow-y-auto pr-1">
              {materialLoading ? (
                <SidebarStateCard>
                  {isZh ? "正在读取文件..." : "Loading files..."}
                </SidebarStateCard>
              ) : materialErrorText ? (
                <SidebarStateCard tone="error" compact>
                  {materialErrorText}
                </SidebarStateCard>
              ) : materials.length === 0 ? (
                <SidebarStateCard>
                  {isZh ? "还没有可用文件。" : "No files available."}
                </SidebarStateCard>
              ) : (
                <div className="w-full space-y-2">
                  {materials.map((item) => {
                    const materialKey = item.id ?? `${item.course ?? ""}|${item.sourceAssessment ?? item.label ?? ""}`;
                    return (
                      <button
                        key={materialKey}
                        type="button"
                        onClick={() => onSelectMaterial(materialKey)}
                        className={cn(
                          "w-full rounded-2xl border px-4 py-3 text-left transition-colors",
                          selectedMaterialId === materialKey
                            ? "border-[#37352F] bg-[#37352F] text-white"
                            : "border-[rgba(55,53,47,0.08)] bg-white text-[#37352F]/72 hover:bg-[#faf8f3]",
                        )}
                      >
                        <p className="truncate text-sm font-medium">
                          {item.sourceAssessment ?? item.label ?? (isZh ? "未命名文件" : "Untitled file")}
                        </p>
                        <p className="mt-1 text-xs opacity-80">
                          {isZh ? `${item.questionCount} 题` : `${item.questionCount} questions`}
                          {item.course ? ` · ${item.course}` : ""}
                          {item.unit ? ` · Unit ${item.unit}` : ""}
                        </p>
                        {selectedMaterialId === materialKey ? (
                          <p className="mt-2 text-[11px] opacity-80">{isZh ? "已选中，再点一次可取消" : "Selected. Click again to deselect."}</p>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-0 min-w-0 w-full flex-col gap-3">
            <div className="min-w-0 w-full shrink-0 space-y-3">
              {tab === "search" && selectedMaterialId ? (
                <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-[rgba(55,53,47,0.08)] bg-white px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-[#37352F]/34">
                      {isZh ? "当前文件范围" : "Current file scope"}
                    </p>
                    <p className="truncate text-sm font-medium text-[#37352F]">
                      {selectedMaterialLabel || (isZh ? "已选文件" : "Selected file")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectMaterial(selectedMaterialId)}
                    className="shrink-0 rounded-lg border border-[rgba(55,53,47,0.1)] px-2.5 py-1.5 text-xs text-[#37352F]/68 transition hover:bg-[#faf8f3]"
                  >
                    {isZh ? "取消" : "Cancel"}
                  </button>
                </div>
              ) : null}
              {/* 来源筛选标签 */}
              <div className="inline-flex rounded-xl bg-[#f5f5f1] p-1">
                <button
                  type="button"
                  onClick={() => onChangeFilters({ sourceScope: "all" })}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                    filters.sourceScope === "all" ? "bg-white text-[#37352F]" : "text-[#37352F]/55",
                  )}
                >
                  {isZh ? "全部" : "All"}
                </button>
                <button
                  type="button"
                  onClick={() => onChangeFilters({ sourceScope: "global" })}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                    filters.sourceScope === "global" ? "bg-white text-[#37352F]" : "text-[#37352F]/55",
                  )}
                >
                  {isZh ? "AP 全局" : "AP Global"}
                </button>
                <button
                  type="button"
                  onClick={() => onChangeFilters({ sourceScope: "personal" })}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                    filters.sourceScope === "personal" ? "bg-white text-[#37352F]" : "text-[#37352F]/55",
                  )}
                >
                  {isZh ? "个人上传" : "Personal"}
                </button>
              </div>

              <label className="flex w-full items-center gap-2 rounded-xl border border-[rgba(55,53,47,0.08)] bg-white px-3 py-2.5">
                <Search className="h-4 w-4 text-[#8c7e68]" />
                <input
                  value={filters.query}
                  onChange={(event) => onChangeFilters({ query: event.target.value })}
                  className="w-full bg-transparent text-sm text-[#37352F] outline-none placeholder:text-[#8c7e68]"
                  placeholder={filters.sourceScope === "personal"
                    ? (isZh ? "搜索个人题库..." : "Search personal questions...")
                    : selectedMaterialId
                      ? (isZh ? "搜索这份文件里的题目" : "Search within this file")
                      : (isZh ? "用自然语言搜索 AP 题目..." : "Search AP questions...")}
                />
              </label>

              {tab === "search" ? (
                <button
                  type="button"
                  onClick={() => setShowFilters((current) => !current)}
                  className="inline-flex w-full items-center justify-between rounded-xl border border-[rgba(55,53,47,0.08)] bg-white px-3 py-2.5 text-sm text-[#37352F]/72 transition hover:bg-[#faf8f3]"
                >
                  <span className="inline-flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4" />
                    {isZh ? "筛选" : "Filter"}
                  </span>
                  <ChevronDown
                    className={cn("h-4 w-4 transition-transform", showFilters ? "rotate-180" : "")}
                  />
                </button>
              ) : null}

              {tab === "search" && showFilters ? (
                <div className="grid w-full gap-2 rounded-xl border border-[rgba(55,53,47,0.08)] bg-white p-3">
                  <select
                    value={filters.course}
                    onChange={(event) =>
                      onChangeFilters({
                        course: event.target.value,
                        unit: "",
                      })
                    }
                    className="rounded-xl border border-[rgba(55,53,47,0.08)] bg-[#fbfbf8] px-3 py-2.5 text-sm text-[#37352F] outline-none"
                  >
                    <option value="">{isZh ? "全部课程" : "All courses"}</option>
                    {Object.entries(COURSE_UNIT_MAP).map(([key, info]) => (
                      <option key={key} value={key}>
                        {isZh ? info.label : info.labelEn}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filters.unit}
                    onChange={(event) => onChangeFilters({ unit: event.target.value })}
                    disabled={unitOptions.length === 0}
                    className="rounded-xl border border-[rgba(55,53,47,0.08)] bg-[#fbfbf8] px-3 py-2.5 text-sm text-[#37352F] outline-none disabled:opacity-50"
                  >
                    <option value="">{isZh ? "全部单元" : "All units"}</option>
                    {unitOptions.map((unitNum) => (
                      <option key={unitNum} value={String(unitNum)}>
                        Unit {unitNum}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filters.difficulty}
                    onChange={(event) =>
                      onChangeFilters({ difficulty: event.target.value })
                    }
                    className="rounded-xl border border-[rgba(55,53,47,0.08)] bg-[#fbfbf8] px-3 py-2.5 text-sm text-[#37352F] outline-none"
                  >
                    <option value="">{isZh ? "全部难度" : "All difficulties"}</option>
                    {DIFFICULTY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filters.cognitiveTask}
                    onChange={(event) =>
                      onChangeFilters({ cognitiveTask: event.target.value })
                    }
                    className="rounded-xl border border-[rgba(55,53,47,0.08)] bg-[#fbfbf8] px-3 py-2.5 text-sm text-[#37352F] outline-none"
                  >
                    <option value="">{isZh ? "全部认知任务" : "All cognitive tasks"}</option>
                    {COGNITIVE_TASKS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filters.exerciseType}
                    onChange={(event) =>
                      onChangeFilters({
                        exerciseType: event.target.value as WorksheetSearchFilters["exerciseType"],
                      })
                    }
                    className="rounded-xl border border-[rgba(55,53,47,0.08)] bg-[#fbfbf8] px-3 py-2.5 text-sm text-[#37352F] outline-none"
                  >
                    {QUESTION_BANK_WORKSHEET_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.value === "all"
                          ? isZh
                            ? "全部题型"
                            : "All types"
                          : getQuestionTypeLabel(option.value, isZh)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            <div ref={scrollContainerRef} className="min-h-0 min-w-0 w-full flex-1 overflow-y-auto pr-1">
              {loading ? (
                <SidebarStateCard>
                  {filters.sourceScope === "personal"
                    ? (isZh ? "正在搜索个人题库..." : "Searching personal questions...")
                    : (isZh ? "正在搜索题库..." : "Searching question bank...")}
                </SidebarStateCard>
              ) : errorText ? (
                <SidebarStateCard tone="error" compact>
                  {errorText}
                </SidebarStateCard>
              ) : sortedResults.length === 0 ? (
                <SidebarStateCard>
                  {filters.sourceScope === "personal"
                    ? (isZh ? "还没有上传题目，去拆题模式上传试卷吧" : "No personal questions yet.")
                    : selectedMaterialId
                      ? (isZh ? "这份文件下没有匹配题目。" : "No matching questions in this file.")
                      : (isZh ? "当前筛选条件下没有匹配题目。" : "No questions match the current filters.")}
                </SidebarStateCard>
              ) : (
                <div className="w-full space-y-3">
                  {visibleResults.map((item) => (
                    <DraggableSearchResult
                      key={item.id}
                      item={item}
                      disabled={importedExerciseIds.has(item.id)}
                      onDragStart={onDragStartItem}
                    >
                    <article
                      onClick={() => {
                        if (!importedExerciseIds.has(item.id)) {
                          toggleResultSelection(item.id);
                        }
                      }}
                      className={cn(
                        "cursor-pointer rounded-xl border px-3 py-3 transition-all",
                        importedExerciseIds.has(item.id)
                          ? "cursor-not-allowed border-[rgba(55,53,47,0.06)] bg-[#f5f4f0] opacity-50"
                          : selectedResultIds.includes(item.id)
                            ? "border-[#37352F] bg-[#37352F]/[0.03] shadow-[0_0_0_1px_#37352F]"
                            : "border-[rgba(55,53,47,0.08)] bg-white hover:border-[rgba(55,53,47,0.2)] hover:shadow-[0_2px_8px_rgba(55,53,47,0.06)]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap gap-2 text-[11px]">
                          <span className="rounded-full bg-[#f6efe2] px-2 py-1 font-medium text-[#37352F]/68">
                            {getQuestionTypeLabel(item.exerciseType, isZh)}
                          </span>
                          {item.course ? (
                            <span className="rounded-full bg-indigo-50 px-2 py-1 font-medium text-indigo-700">
                              {tikuCourseLabel(item.course)}
                            </span>
                          ) : null}
                          {item.unit != null ? (
                            <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600">
                              U{item.unit}
                            </span>
                          ) : null}
                          <span
                            className={cn(
                              "rounded-full border px-2 py-1 font-medium",
                              getDifficultyBadgeClasses(item.difficulty),
                            )}
                          >
                            {getDifficultyLabel(item.difficulty, isZh)}
                          </span>
                          {item.cognitive_task ? (
                            <span className="rounded-full bg-[#f6efe2] px-2 py-1 font-medium text-[#37352F]/68">
                              {item.cognitive_task}
                            </span>
                          ) : null}
                        </div>
                        {selectedResultIds.includes(item.id) ? (
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#37352F] text-white">
                            <Check className="h-3 w-3" />
                          </span>
                        ) : importedExerciseIds.has(item.id) ? (
                          <span className="shrink-0 text-[10px] text-[#37352F]/40">
                            {isZh ? "已导入" : "Added"}
                          </span>
                        ) : null}
                      </div>

                      {item.stimulusImageUrl ? (
                        <div className="mt-2.5">
                          <img
                            src={item.stimulusImageUrl}
                            alt="Stimulus"
                            referrerPolicy="no-referrer"
                            className="block max-h-[120px] w-auto max-w-[50%] rounded-lg border border-[rgba(55,53,47,0.08)] object-scale-down bg-[#fafaf8]"
                          />
                        </div>
                      ) : null}

                      <div className="mt-2.5">
                        {item.stimulusImageUrl ? (
                          <QuestionContentWithImages
                            content={stripMarkdownImages(item.questionText)}
                            className="space-y-0"
                            textClassName="line-clamp-4 text-[13px] leading-6 text-[#37352F]"
                            galleryClassName="hidden"
                          />
                        ) : (
                          <QuestionContentWithImages
                            content={item.questionText}
                            className="space-y-0"
                            textClassName="line-clamp-4 text-[13px] leading-6 text-[#37352F]"
                            galleryClassName="mt-2 grid gap-2"
                            figureClassName="bg-[#fafaf8]"
                            imageClassName="block max-h-[120px] w-auto max-w-[50%] object-scale-down"
                          />
                        )}
                      </div>

                      {item.options && item.options.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {item.options.map((option) => (
                            <div
                              key={option.label}
                              className="flex items-start gap-1.5 text-[12px] leading-5 text-[#37352F]/68"
                            >
                              <span className="shrink-0 font-medium text-[#37352F]/46">
                                {option.label}.
                              </span>
                              {option.imageUrl ? (
                                <img
                                  src={option.imageUrl}
                                  alt={`Choice ${option.label}`}
                                  className="h-8 rounded border border-slate-200 bg-white object-contain"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="min-w-0">
                                  <QuestionContentWithImages
                                    content={option.text}
                                    className="space-y-1"
                                    textClassName="line-clamp-1 text-[12px] leading-5"
                                    galleryClassName="mt-1"
                                    figureClassName="bg-[#fafaf8]"
                                    imageClassName="max-h-[60px] w-auto object-contain"
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : null}

                    </article>
                    </DraggableSearchResult>
                  ))}
                  {visibleCount < sortedResults.length || activeHasMore ? (
                    <div className="py-4 text-center text-[11px] text-[#37352F]/30">
                      {activeLoadingMore
                        ? (isZh ? "加载中..." : "Loading...")
                        : isZh
                          ? "继续下滑加载更多"
                          : "Scroll for more"}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-[rgba(55,53,47,0.08)] px-3 py-3 text-xs text-[#37352F]/45">
        {tab === "search"
          ? (isZh
              ? `${results.length} 条候选题${filters.sourceScope === "personal" ? "（个人）" : filters.sourceScope === "global" ? "（全局）" : ""}${selectedMaterialId ? ` / 范围：${selectedMaterialLabel || "已选文件"}` : ""}${multiSelectMode ? ` / 已勾选 ${selectedCount} 题` : ""}${importTargetSectionId !== "auto" ? ` / 导入到 ${sections.find((section) => section.id === importTargetSectionId)?.title ?? "所选分组"}` : ""}`
              : `${results.length} candidates${filters.sourceScope === "personal" ? " (personal)" : filters.sourceScope === "global" ? " (global)" : ""}${selectedMaterialId ? ` / Scope: ${selectedMaterialLabel || "Selected file"}` : ""}${multiSelectMode ? ` / ${selectedCount} selected` : ""}${importTargetSectionId !== "auto" ? ` / Import to ${sections.find((section) => section.id === importTargetSectionId)?.title ?? "selected section"}` : ""}`)
          : tab === "outline"
            ? (isZh ? `${sections.length} 个分组 / ${questions.length} 道题` : `${sections.length} sections / ${questions.length} questions`)
            : (isZh
                ? `${materials.length} 份文件${selectedMaterialId ? ` / 已选：${selectedMaterialLabel || "当前文件"}` : ""}`
                : `${materials.length} files${selectedMaterialId ? ` / Selected: ${selectedMaterialLabel || "current file"}` : ""}`)}
      </div>
    </aside>
  );
}
