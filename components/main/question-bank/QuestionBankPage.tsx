"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownUp,
  Bell,
  CheckSquare2,
  HelpCircle,
  PlusCircle,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { Button, Chip, Input, ListBox, Select, Separator, Spinner, TextField } from "@heroui/react";
import { cn } from "@/lib/utils";
import type {
  CourseOption,
  CurriculumOptionsResponse,
  QuestionBankListResponse,
  QuestionBankMaterialItem,
  QuestionBankMaterialsResponse,
  QuestionBankQuestionListItem,
  SidebarFilter,
  UnitOption,
} from "./helpers";
import {
  ASSESSMENT_STYLE_OPTIONS,
  buildMaterialSelectionKey,
  cleanText,
  formatUnitOptionLabel,
  KNOWLEDGE_CLUSTER_OPTIONS,
  mapMaterialTypeToSourceKind,
  QUESTION_TYPE_OPTIONS,
  requestJson,
  REVIEW_STATUS_OPTIONS,
  SOURCE_KIND_OPTIONS,
} from "./helpers";
// Debounce hook for search input
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

import { useUploadQueue } from "./useUploadQueue";

function QuestionPaneLoading() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-white">
      <div className="flex items-center gap-2 text-sm text-default-400">
        <Spinner size="sm" />
        <span>正在加载题库...</span>
      </div>
    </div>
  );
}

function MaterialsPaneLoading() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-white">
      <div className="flex items-center gap-2 text-sm text-default-400">
        <Spinner size="sm" />
        <span>正在加载资料...</span>
      </div>
    </div>
  );
}

const KnowledgeSidebar = dynamic(() => import("./KnowledgeSidebar"), {
  loading: () => (
    <div className="hidden w-[280px] shrink-0 border-r border-divider bg-white lg:block" />
  ),
});

const QuestionList = dynamic(() => import("./QuestionList"), {
  loading: () => <QuestionPaneLoading />,
});

const MaterialsGrid = dynamic(() => import("./MaterialsGrid"), {
  loading: () => <MaterialsPaneLoading />,
});

const UploadPanel = dynamic(() => import("./UploadPanel"), {
  loading: () => <QuestionPaneLoading />,
});

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function QuestionBankPage(props: {
  initialTab?: "questions" | "materials";
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab =
    props.initialTab === "materials" ? "materials" : "questions";
  const requestedQuestionId = searchParams.get("questionId")?.trim() ?? "";

  // Filter state — 从 URL searchParams 初始化
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const debouncedQuery = useDebounce(query, 300);
  const [courseId, setCourseId] = useState(searchParams.get("course") ?? "");
  const [unitId, setUnitId] = useState(searchParams.get("unit") ?? "");
  const [typeFilter, setTypeFilter] =
    useState<(typeof QUESTION_TYPE_OPTIONS)[number]["value"]>(
      (searchParams.get("type") as (typeof QUESTION_TYPE_OPTIONS)[number]["value"]) ?? "all",
    );
  const [knowledgeCluster, setKnowledgeCluster] =
    useState<(typeof KNOWLEDGE_CLUSTER_OPTIONS)[number]["value"]>(
      (searchParams.get("cluster") as (typeof KNOWLEDGE_CLUSTER_OPTIONS)[number]["value"]) ?? "all",
    );
  const [assessmentStyle, setAssessmentStyle] =
    useState<(typeof ASSESSMENT_STYLE_OPTIONS)[number]["value"]>(
      (searchParams.get("assessment") as (typeof ASSESSMENT_STYLE_OPTIONS)[number]["value"]) ?? "all",
    );
  const [sourceKind, setSourceKind] =
    useState<(typeof SOURCE_KIND_OPTIONS)[number]["value"]>(
      (searchParams.get("source") as (typeof SOURCE_KIND_OPTIONS)[number]["value"]) ?? "all",
    );
  const [reviewStatus, setReviewStatus] =
    useState<(typeof REVIEW_STATUS_OPTIONS)[number]["value"]>(
      (searchParams.get("review") as (typeof REVIEW_STATUS_OPTIONS)[number]["value"]) ?? "all",
    );
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // 同步 filter 状态到 URL（仅写入，不双向绑定）
  const syncUrl = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value && value !== "all") params.set(key, value);
        else params.delete(key);
      }
      const qs = params.toString();
      router.replace(pathname + (qs ? "?" + qs : ""), { scroll: false });
    },
    [searchParams, pathname, router],
  );

  // Sidebar filter (knowledge tree selection)
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>({
    type: "all",
  });

  // Data state
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [questions, setQuestions] = useState<QuestionBankQuestionListItem[]>([]);
  const [questionTotal, setQuestionTotal] = useState(0);
  const [materials, setMaterials] = useState<QuestionBankMaterialItem[]>([]);

  // UI state
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [statusText, setStatusText] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedMaterialKeys, setSelectedMaterialKeys] = useState<string[]>(
    [],
  );
  const [isDeletingSelection, setIsDeletingSelection] = useState(false);
  const [isCreatingBuilder, setIsCreatingBuilder] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // Upload queue for PDF drag-and-drop
  const uploadQueue = useUploadQueue({
    onJobComplete: () => setReloadToken((c) => (c + 1) % 10000),
  });

  const selectedIdsRef = useRef<string[]>([]);
  const selectedMaterialKeysRef = useRef<string[]>([]);

  // Derived
  const filteredUnits = useMemo(
    () => units.filter((u) => !courseId || u.course_id === courseId),
    [units, courseId],
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedMaterialKeySet = useMemo(
    () => new Set(selectedMaterialKeys),
    [selectedMaterialKeys],
  );

  const visibleMaterials = useMemo(() => {
    const selectedCourseName = cleanText(
      courses.find((c) => c.id === courseId)?.name,
    );
    const selectedUnit = filteredUnits.find((u) => u.id === unitId);
    const selectedUnitName = cleanText(
      selectedUnit ? formatUnitOptionLabel(selectedUnit) : "",
    );

    return materials.filter((item) => {
      if (courseId && cleanText(item.subject) !== selectedCourseName) return false;
      if (unitId && cleanText(item.unit) !== selectedUnitName) return false;
      if (
        sourceKind !== "all" &&
        mapMaterialTypeToSourceKind(item.materialType) !== sourceKind
      )
        return false;
      return true;
    });
  }, [materials, courses, courseId, filteredUnits, unitId, sourceKind]);

  const allVisibleMaterialsSelected =
    visibleMaterials.length > 0 &&
    visibleMaterials.every((item) =>
      selectedMaterialKeySet.has(buildMaterialSelectionKey(item)),
    );

  // Active advanced filter tags
  const activeAdvancedFilters = useMemo(() => {
    const tags: { key: string; label: string; onClear: () => void }[] = [];
    if (unitId) {
      const unit = filteredUnits.find((u) => u.id === unitId);
      tags.push({
        key: "unit",
        label: `单元: ${unit ? formatUnitOptionLabel(unit) : unitId}`,
        onClear: () => { setUnitId(""); syncUrl({ unit: "" }); },
      });
    }
    if (activeTab === "questions" && knowledgeCluster !== "all") {
      const opt = KNOWLEDGE_CLUSTER_OPTIONS.find(
        (o) => o.value === knowledgeCluster,
      );
      tags.push({
        key: "kc",
        label: `知识簇: ${opt?.label ?? knowledgeCluster}`,
        onClear: () => { setKnowledgeCluster("all"); syncUrl({ cluster: "" }); },
      });
    }
    if (activeTab === "questions" && assessmentStyle !== "all") {
      const opt = ASSESSMENT_STYLE_OPTIONS.find(
        (o) => o.value === assessmentStyle,
      );
      tags.push({
        key: "as",
        label: `考察: ${opt?.label ?? assessmentStyle}`,
        onClear: () => { setAssessmentStyle("all"); syncUrl({ assessment: "" }); },
      });
    }
    if (sourceKind !== "all") {
      const opt = SOURCE_KIND_OPTIONS.find((o) => o.value === sourceKind);
      tags.push({
        key: "sk",
        label: `来源: ${opt?.label ?? sourceKind}`,
        onClear: () => { setSourceKind("all"); syncUrl({ source: "" }); },
      });
    }
    if (activeTab === "questions" && reviewStatus !== "all") {
      const opt = REVIEW_STATUS_OPTIONS.find(
        (o) => o.value === reviewStatus,
      );
      tags.push({
        key: "rs",
        label: `状态: ${opt?.label ?? reviewStatus}`,
        onClear: () => { setReviewStatus("all"); syncUrl({ review: "" }); },
      });
    }
    return tags;
  }, [
    activeTab,
    unitId,
    filteredUnits,
    knowledgeCluster,
    assessmentStyle,
    sourceKind,
    reviewStatus,
    syncUrl,
  ]);

  const clearAllAdvancedFilters = () => {
    setUnitId("");
    setSourceKind("all");
    if (activeTab === "questions") {
      setKnowledgeCluster("all");
      setAssessmentStyle("all");
      setReviewStatus("all");
    }
    syncUrl({
      unit: "",
      source: "",
      cluster: "",
      assessment: "",
      review: "",
    });
  };

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  // 课程选项 — 仅首次加载，不阻塞列表请求
  const curriculumLoadedRef = useRef(false);
  useEffect(() => {
    if (curriculumLoadedRef.current) return;
    let cancelled = false;
    requestJson<CurriculumOptionsResponse>("/api/curriculum/options")
      .then((data) => {
        if (!cancelled) {
          setCourses(data.courses);
          setUnits(data.units);
          curriculumLoadedRef.current = true;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCourses([]);
          setUnits([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (unitId && !filteredUnits.some((u) => u.id === unitId)) {
      setUnitId("");
    }
  }, [filteredUnits, unitId]);

  // Fetch questions — 与课程选项并行加载，不等待课程数据
  useEffect(() => {
    if (activeTab !== "questions") return;
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    if (courseId) params.set("courseId", courseId);
    if (unitId) params.set("unitId", unitId);
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (knowledgeCluster !== "all")
      params.set("knowledgeCluster", knowledgeCluster);
    if (assessmentStyle !== "all")
      params.set("assessmentStyle", assessmentStyle);
    if (sourceKind !== "all") params.set("sourceKind", sourceKind);
    if (reviewStatus !== "all") params.set("reviewStatus", reviewStatus);
    params.set("limit", "200");

    setLoadingList(true);
    setErrorText("");
    setStatusText("");

    requestJson<QuestionBankListResponse>(
      `/api/question-bank?${params.toString()}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setQuestions(data.items);
          setQuestionTotal(data.total);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!controller.signal.aborted) {
          setQuestions([]);
          setQuestionTotal(0);
          setErrorText(err instanceof Error ? err.message : "读取题库失败");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingList(false);
      });
    return () => {
      controller.abort();
    };
  }, [
    activeTab,
    debouncedQuery,
    courseId,
    unitId,
    typeFilter,
    knowledgeCluster,
    assessmentStyle,
    sourceKind,
    reviewStatus,
    reloadToken,
  ]);

  // Fetch materials（使用 AbortController 避免竞态条件）
  useEffect(() => {
    if (activeTab !== "materials") return;
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    params.set("limit", "150");
    setLoadingMaterials(true);
    setErrorText("");

    requestJson<QuestionBankMaterialsResponse>(
      `/api/question-bank/materials?${params.toString()}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) setMaterials(data.items);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!controller.signal.aborted) {
          setMaterials([]);
          setErrorText(err instanceof Error ? err.message : "读取资料失败");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingMaterials(false);
      });
    return () => {
      controller.abort();
    };
  }, [activeTab, debouncedQuery, reloadToken]);

  // Sync selections on data change
  useEffect(() => {
    setSelectedIds((current) => {
      const next = current.filter((id) =>
        questions.some((q) => q.id === id),
      );
      selectedIdsRef.current = next;
      return next;
    });
  }, [questions]);

  useEffect(() => {
    setSelectedMaterialKeys((current) => {
      const next = current.filter((key) =>
        visibleMaterials.some(
          (item) => buildMaterialSelectionKey(item) === key,
        ),
      );
      selectedMaterialKeysRef.current = next;
      return next;
    });
  }, [visibleMaterials]);

  useEffect(() => {
    setSelectionMode(false);
    setSelectedIds([]);
    selectedIdsRef.current = [];
    setSelectedMaterialKeys([]);
    selectedMaterialKeysRef.current = [];
  }, [activeTab]);

  // ---------------------------------------------------------------------------
  // Selection handlers
  // ---------------------------------------------------------------------------

  const enterSelectionMode = () => {
    setSelectionMode(true);
    setSelectedIds([]);
    selectedIdsRef.current = [];
    setSelectedMaterialKeys([]);
    selectedMaterialKeysRef.current = [];
    setStatusText("");
    setErrorText("");
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds([]);
    selectedIdsRef.current = [];
    setSelectedMaterialKeys([]);
    selectedMaterialKeysRef.current = [];
  };

  const toggleQuestionSelection = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];
      selectedIdsRef.current = next;
      return next;
    });
  }, []);

  const toggleSelectAllVisibleQuestions = useCallback(
    (visibleIds: string[], allVisibleSelected: boolean) => {
      if (visibleIds.length === 0) return;
      setSelectedIds((current) => {
        const next = allVisibleSelected
          ? current.filter((id) => !visibleIds.includes(id))
          : Array.from(new Set([...current, ...visibleIds]));
        selectedIdsRef.current = next;
        return next;
      });
    },
    [],
  );

  const toggleMaterialSelection = useCallback((key: string) => {
    setSelectedMaterialKeys((current) => {
      const next = current.includes(key)
        ? current.filter((x) => x !== key)
        : [...current, key];
      selectedMaterialKeysRef.current = next;
      return next;
    });
  }, []);

  const toggleSelectAllVisibleMaterials = useCallback(() => {
    if (visibleMaterials.length === 0) return;
    const visibleKeys = visibleMaterials.map((item) =>
      buildMaterialSelectionKey(item),
    );
    setSelectedMaterialKeys((current) => {
      const next = allVisibleMaterialsSelected
        ? current.filter((k) => !visibleKeys.includes(k))
        : Array.from(new Set([...current, ...visibleKeys]));
      selectedMaterialKeysRef.current = next;
      return next;
    });
  }, [visibleMaterials, allVisibleMaterialsSelected]);

  // ---------------------------------------------------------------------------
  // Delete handlers
  // ---------------------------------------------------------------------------

  const handleDeleteSingleQuestion = useCallback(
    async (questionId: string) => {
      const confirmed = window.confirm("确认删除这道题吗？此操作不可恢复。");
      if (!confirmed) return;

      try {
        const result = await requestJson<{
          deletedIds: string[];
          deletedCount: number;
          removedWorksheetLinkCount: number;
        }>("/api/question-bank/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", questionIds: [questionId] }),
        });

        const deletedSet = new Set(result.deletedIds);
        setQuestions((current) =>
          current.filter((q) => !deletedSet.has(q.id)),
        );
        setQuestionTotal((current) =>
          Math.max(0, current - result.deletedCount),
        );
        setStatusText(`已删除 ${result.deletedCount} 道题。`);
      } catch (err) {
        setErrorText(err instanceof Error ? err.message : "删除失败");
      }
    },
    [],
  );

  const handleBulkDeleteQuestions = useCallback(async () => {
    const idsToDelete = Array.from(new Set(selectedIdsRef.current));
    if (idsToDelete.length === 0 || isDeletingSelection) return;

    const confirmed = window.confirm(
      `确认删除选中的 ${idsToDelete.length} 道题吗？此操作不可恢复。`,
    );
    if (!confirmed) return;

    setIsDeletingSelection(true);
    setErrorText("");
    setStatusText("");

    try {
      const result = await requestJson<{
        deletedIds: string[];
        deletedCount: number;
        removedWorksheetLinkCount: number;
      }>("/api/question-bank/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", questionIds: idsToDelete }),
      });

      const deletedSet = new Set(result.deletedIds);
      setQuestions((current) =>
        current.filter((q) => !deletedSet.has(q.id)),
      );
      setQuestionTotal((current) =>
        Math.max(0, current - result.deletedCount),
      );
      setSelectedIds([]);
      selectedIdsRef.current = [];
      setSelectionMode(false);
      setStatusText(
        result.removedWorksheetLinkCount > 0
          ? `已删除 ${result.deletedCount} 道题，清理 ${result.removedWorksheetLinkCount} 条组卷引用。`
          : `已删除 ${result.deletedCount} 道题。`,
      );
      setReloadToken((c) => (c + 1) % 10000);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "批量删除失败");
    } finally {
      setIsDeletingSelection(false);
    }
  }, [isDeletingSelection]);

  const handleBulkDeleteMaterials = useCallback(async () => {
    const keysToDelete = Array.from(new Set(selectedMaterialKeysRef.current));
    if (keysToDelete.length === 0 || isDeletingSelection) return;

    const materialsToDelete = visibleMaterials.filter((item) =>
      keysToDelete.includes(buildMaterialSelectionKey(item)),
    );
    if (materialsToDelete.length === 0) return;

    const confirmed = window.confirm(
      `确认删除选中的 ${materialsToDelete.length} 份资料吗？此操作不可恢复。`,
    );
    if (!confirmed) return;

    setIsDeletingSelection(true);
    setErrorText("");
    setStatusText("");

    try {
      const result = await requestJson<{
        deletedMaterialKeys: string[];
        deletedCount: number;
        linkedUploadIds: string[];
        deletedExerciseCount: number;
        removedWorksheetLinkCount: number;
      }>("/api/question-bank/materials/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          materials: materialsToDelete.map((item) => ({
            id: item.id,
            materialType: item.materialType,
          })),
        }),
      });

      const deletedKeySet = new Set(result.deletedMaterialKeys);
      setMaterials((current) =>
        current.filter(
          (item) => !deletedKeySet.has(buildMaterialSelectionKey(item)),
        ),
      );
      setSelectedMaterialKeys([]);
      selectedMaterialKeysRef.current = [];
      setSelectionMode(false);
      setStatusText(
        result.deletedExerciseCount > 0
          ? `已删除 ${result.deletedCount} 份资料，联动清理 ${result.deletedExerciseCount} 道题。`
          : `已删除 ${result.deletedCount} 份资料。`,
      );
      setReloadToken((c) => (c + 1) % 10000);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "批量删除资料失败");
    } finally {
      setIsDeletingSelection(false);
    }
  }, [isDeletingSelection, visibleMaterials]);

  const handleOpenBuilder = useCallback(async () => {
    if (activeTab !== "questions") {
      router.push("/main/question-bank/builder");
      return;
    }

    const selectedQuestions = questions.filter((question) =>
      selectedIdsRef.current.includes(question.id),
    );

    if (selectedQuestions.length === 0) {
      const params = new URLSearchParams();
      if (courseId) params.set("courseId", courseId);
      if (unitId) params.set("unitId", unitId);
      router.push(
        `/main/question-bank/builder${params.toString() ? `?${params.toString()}` : ""}`,
      );
      return;
    }

    const selectedCourseIds = Array.from(
      new Set(selectedQuestions.map((question) => question.courseId).filter(Boolean)),
    );
    if (selectedCourseIds.length !== 1) {
      setErrorText("开始组卷前，请只选择同一课程下的题目。");
      setStatusText("");
      return;
    }

    if (isCreatingBuilder) return;

    setIsCreatingBuilder(true);
    setErrorText("");
    setStatusText("");

    try {
      const resolvedUnitIds = Array.from(
        new Set(selectedQuestions.map((question) => question.unitId).filter(Boolean)),
      );
      const payload = await requestJson<{ worksheet: { id: string } }>(
        "/api/worksheets/builder",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `${selectedQuestions[0]?.courseName ?? "题库"} 组卷稿`,
            description: `从题库导入 ${selectedQuestions.length} 道题创建的组卷草稿`,
            courseId: selectedCourseIds[0],
            unitId: resolvedUnitIds.length === 1 ? resolvedUnitIds[0] : undefined,
            exerciseIds: selectedQuestions.map((question) => question.id),
          }),
        },
      );

      router.push(`/main/question-bank/builder/${encodeURIComponent(payload.worksheet.id)}`);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "创建组卷稿失败");
    } finally {
      setIsCreatingBuilder(false);
    }
  }, [activeTab, courseId, isCreatingBuilder, questions, router, unitId]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const questionTabHref = pathname;
  const materialsTabHref = `${pathname}?tab=materials`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-content1">
      {/* ===== TopAppBar ===== */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-divider bg-white px-5">
        {/* 左侧: 标题 + 分隔线 + Tabs */}
        <div className="flex items-center gap-4">
          <h1 className="text-[1rem] font-semibold text-foreground">
            Question Bank
          </h1>
          <Separator orientation="vertical" className="h-4" />
          {/* Tab 下划线样式 */}
          <nav className="flex items-center gap-1">
            <Link
              href={questionTabHref}
              className={cn(
                "px-3 py-1 text-[13px] font-medium transition-colors",
                activeTab === "questions"
                  ? "text-primary border-b-2 border-primary pb-0.5"
                  : "text-foreground/60 hover:text-foreground",
              )}
            >
              Explore
            </Link>
            <Link
              href={materialsTabHref}
              className={cn(
                "px-3 py-1 text-[13px] font-medium transition-colors",
                activeTab === "materials"
                  ? "text-primary border-b-2 border-primary pb-0.5"
                  : "text-foreground/60 hover:text-foreground",
              )}
            >
              Materials
            </Link>
          </nav>
        </div>

        {/* 右侧: 搜索框 + 功能按钮 */}
        <div className="flex items-center gap-2">
          {/* 搜索框 */}
          <TextField
            aria-label="搜索"
            value={query}
            onChange={(value) => {
              setQuery(value);
              syncUrl({ q: value });
            }}
            className="relative w-64"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40" />
            <Input
              placeholder={
                activeTab === "questions"
                  ? "Search questions..."
                  : "Search materials..."
              }
              className="pl-9"
            />
          </TextField>

          {/* Selection mode toggle */}
          <Button
            variant={selectionMode ? "danger-soft" : "outline"}
            size="sm"
            onPress={() =>
              selectionMode ? exitSelectionMode() : enterSelectionMode()
            }
          >
            <CheckSquare2 className="h-3.5 w-3.5" />
            {selectionMode ? "Exit" : "Select"}
          </Button>

          {/* Builder button */}
          <Button
            variant="outline"
            size="sm"
            onPress={() => void handleOpenBuilder()}
            isDisabled={isCreatingBuilder}
            isPending={isCreatingBuilder}
          >
            {({ isPending }) => (
              <>
                {isPending ? <Spinner color="current" size="sm" /> : null}
                {selectedIds.length > 0 && activeTab === "questions"
                  ? `Build (${selectedIds.length})`
                  : "Builder"}
              </>
            )}
          </Button>

          <Link
            href="/main/question-bank/ap"
            className="inline-flex items-center gap-1.5 rounded-md border border-default-200 bg-default-100 px-3 py-1.5 text-sm text-default-600 transition-colors hover:bg-default-200"
          >
            <Search className="h-3.5 w-3.5" />
            AP Archive
          </Link>

          <Link
            href="/main/question-bank/split"
            className="inline-flex items-center gap-1.5 rounded-md border border-default-200 bg-default-100 px-3 py-1.5 text-sm text-default-600 transition-colors hover:bg-default-200"
          >
            <ArrowDownUp className="h-3.5 w-3.5" />
            Split
          </Link>

          {/* Bulk delete */}
          {selectionMode && activeTab === "questions" && selectedIds.length > 0 ? (
            <Button
              variant="danger-soft"
              size="sm"
              onPress={handleBulkDeleteQuestions}
              isDisabled={isDeletingSelection}
              isPending={isDeletingSelection}
            >
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Delete ({selectedIds.length})
                </>
              )}
            </Button>
          ) : null}

          {/* 通知/帮助按钮 */}
          <Button isIconOnly variant="ghost" size="sm">
            <Bell className="h-4 w-4" />
          </Button>
          <Button isIconOnly variant="ghost" size="sm">
            <HelpCircle className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ===== Filter Bar (在主内容区顶部) ===== */}
      {activeTab === "questions" ? (
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-divider bg-white px-5">
          {/* 左侧: 筛选信息 */}
          <div className="flex items-center gap-3">
            {/* Course selector */}
            <Select
              aria-label="Course"
              value={courseId}
              onChange={(value) => {
                const v = String(value ?? "");
                setCourseId(v);
                syncUrl({ course: v });
              }}
              className="w-[180px]"
            >
              <Select.Trigger className="rounded-lg border border-divider bg-default-100 px-3 py-1.5 text-[13px] text-foreground font-medium">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="" textValue="All Courses">All Courses</ListBox.Item>
                  {courses.map((c) => (
                    <ListBox.Item key={c.id} id={c.id} textValue={c.name}>
                      {c.name}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>

            {/* Question count */}
            <span className="text-[13px] text-foreground/40">
              {questionTotal} questions
            </span>

            {/* Active filter tags */}
            {activeAdvancedFilters.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {activeAdvancedFilters.map((tag) => (
                  <Chip
                    key={tag.key}
                    size="sm"
                   
                    className="gap-1 text-[11px] text-foreground/70"
                  >
                    {tag.label}
                    <button
                      type="button"
                      onClick={tag.onClear}
                      className="ml-0.5 text-foreground/40 hover:text-foreground/70"
                      aria-label={`Remove ${tag.label}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Chip>
                ))}
              </div>
            ) : null}
          </div>

          {/* 右侧: 难度 pills + Filters + Sort */}
          <div className="flex items-center gap-2">
            {/* Type filter */}
            <Select
              aria-label="Question type"
              value={typeFilter}
              onChange={(value) => {
                const v = String(value ?? "");
                setTypeFilter(v as typeof typeFilter);
                syncUrl({ type: v });
              }}
              className="w-[140px]"
            >
              <Select.Trigger className="rounded-lg border border-divider bg-white px-3 py-1.5 text-[13px] text-foreground/60">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {QUESTION_TYPE_OPTIONS.map((o) => (
                    <ListBox.Item key={o.value} id={o.value} textValue={o.label}>
                      {o.label}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>

            {/* Filters 按钮 */}
            <Button
              variant={showAdvancedFilters ? "secondary" : "outline"}
              size="sm"
              onPress={() => setShowAdvancedFilters((prev) => !prev)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
              {activeAdvancedFilters.length > 0 ? (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-white">
                  {activeAdvancedFilters.length}
                </span>
              ) : null}
            </Button>

            {/* Sort 按钮 */}
            <Button variant="outline" size="sm">
              <ArrowDownUp className="h-3.5 w-3.5" />
              Sort
            </Button>
          </div>
        </div>
      ) : null}

      {/* Advanced filters panel */}
      {showAdvancedFilters && activeTab === "questions" ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-divider bg-default-100/50 px-5 py-3">
          <Select
            aria-label="Unit"
            value={unitId}
            onChange={(value) => {
              const v = String(value ?? "");
              setUnitId(v);
              syncUrl({ unit: v });
            }}
            className="w-[160px]"
          >
            <Select.Trigger className="rounded-lg border border-divider bg-white px-2.5 py-1.5 text-[13px] text-foreground/60">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="" textValue="全部单元">全部单元</ListBox.Item>
                {filteredUnits.map((u) => (
                  <ListBox.Item key={u.id} id={u.id} textValue={formatUnitOptionLabel(u)}>
                    {formatUnitOptionLabel(u)}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <Select
            aria-label="Knowledge cluster"
            value={knowledgeCluster}
            onChange={(value) => {
              const v = String(value ?? "");
              setKnowledgeCluster(v as typeof knowledgeCluster);
              syncUrl({ cluster: v });
            }}
            className="w-[140px]"
          >
            <Select.Trigger className="rounded-lg border border-divider bg-white px-2.5 py-1.5 text-[13px] text-foreground/60">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {KNOWLEDGE_CLUSTER_OPTIONS.map((o) => (
                  <ListBox.Item key={o.value} id={o.value} textValue={o.label}>
                    {o.label}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <Select
            aria-label="Assessment style"
            value={assessmentStyle}
            onChange={(value) => {
              const v = String(value ?? "");
              setAssessmentStyle(v as typeof assessmentStyle);
              syncUrl({ assessment: v });
            }}
            className="w-[140px]"
          >
            <Select.Trigger className="rounded-lg border border-divider bg-white px-2.5 py-1.5 text-[13px] text-foreground/60">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {ASSESSMENT_STYLE_OPTIONS.map((o) => (
                  <ListBox.Item key={o.value} id={o.value} textValue={o.label}>
                    {o.label}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <Select
            aria-label="Source kind"
            value={sourceKind}
            onChange={(value) => {
              const v = String(value ?? "");
              setSourceKind(v as typeof sourceKind);
              syncUrl({ source: v });
            }}
            className="w-[140px]"
          >
            <Select.Trigger className="rounded-lg border border-divider bg-white px-2.5 py-1.5 text-[13px] text-foreground/60">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {SOURCE_KIND_OPTIONS.map((o) => (
                  <ListBox.Item key={o.value} id={o.value} textValue={o.label}>
                    {o.label}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <Select
            aria-label="Review status"
            value={reviewStatus}
            onChange={(value) => {
              const v = String(value ?? "");
              setReviewStatus(v as typeof reviewStatus);
              syncUrl({ review: v });
            }}
            className="w-[140px]"
          >
            <Select.Trigger className="rounded-lg border border-divider bg-white px-2.5 py-1.5 text-[13px] text-foreground/60">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {REVIEW_STATUS_OPTIONS.map((o) => (
                  <ListBox.Item key={o.value} id={o.value} textValue={o.label}>
                    {o.label}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          {activeAdvancedFilters.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onPress={clearAllAdvancedFilters}
            >
              Clear all
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Error / Status banners */}
      {errorText ? (
        <div className="mx-5 mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
          {errorText}
        </div>
      ) : null}
      {statusText ? (
        <div className="mx-5 mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">
          {statusText}
        </div>
      ) : null}

      {/* Main content area */}
      {activeTab === "questions" ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Knowledge sidebar */}
          <KnowledgeSidebar
            questions={questions}
            activeFilter={sidebarFilter}
            onFilterChange={setSidebarFilter}
          />

          {/* Question list + upload panel */}
          <UploadPanel
            jobs={uploadQueue.jobs}
            isProcessing={uploadQueue.isProcessing}
            hasJobs={uploadQueue.hasJobs}
            onAddFiles={uploadQueue.addFiles}
            onRemoveJob={uploadQueue.removeJob}
            onClearDone={uploadQueue.clearDone}
            onViewResults={(fileName) => setQuery(fileName)}
          >
            <QuestionList
              questions={questions}
              loading={loadingList}
              total={questionTotal}
              sidebarFilter={sidebarFilter}
              requestedQuestionId={requestedQuestionId}
              selectionMode={selectionMode}
              selectedIds={selectedIdSet}
              onToggleSelect={toggleQuestionSelection}
              onToggleSelectAll={toggleSelectAllVisibleQuestions}
              onDeleteSingle={handleDeleteSingleQuestion}
              searchQuery={debouncedQuery}
            />
          </UploadPanel>
        </div>
      ) : (
        <MaterialsGrid
          materials={visibleMaterials}
          loading={loadingMaterials}
          selectionMode={selectionMode}
          selectedKeys={selectedMaterialKeySet}
          isDeletingSelection={isDeletingSelection}
          onToggleSelect={toggleMaterialSelection}
          onToggleSelectAll={toggleSelectAllVisibleMaterials}
          onBulkDelete={handleBulkDeleteMaterials}
          allVisibleSelected={allVisibleMaterialsSelected}
        />
      )}

      {/* FAB 按钮 */}
      <div className="fixed bottom-8 right-8 z-50">
        <Button className="rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-all duration-300 pl-4 pr-6 py-3">
          <PlusCircle className="h-5 w-5" />
          <span className="text-sm font-medium tracking-wide">New Question</span>
        </Button>
      </div>
    </div>
  );
}
