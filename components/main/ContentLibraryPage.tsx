"use client";

import dynamic from "next/dynamic";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpenText,
  Calendar,
  CheckSquare2,
  FileQuestion,
  FileText,
  FolderOpen,
  Lightbulb,
  LayoutGrid,
  Library,
  List,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Save,
  Search,
  Settings,
  StickyNote,
  Table2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button, Card, Chip, Input, ListBox, ScrollShadow, Select, Separator, Spinner, TextArea, TextField } from "@heroui/react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { formatLocaleDateTime } from "@/lib/app-i18n/text";
import {
  buildCardOverrideFromDetail,
  formatUnitNameFromOption,
  mergeListItemWithOverride,
  normalizeMetadataSaveDraft,
} from "@/lib/content-library/metadata-helpers";
import { cn } from "@/lib/utils";
import type {
  ContentLibraryDetail,
  ContentLibraryListItem,
  ContentLibraryType,
} from "@/lib/content-library/types";
import type {
  ContentCardOverride,
  CurriculumCourseOption as CourseOption,
  CurriculumUnitOption as UnitOption,
} from "@/lib/content-library/metadata-helpers";
import { isPblUiEnabled } from "@/lib/pbl/feature";
import {
  type ContentLibraryDeleteResponse,
  type ContentLibraryListResponse,
  type ContentLibraryViewMode,
  type CurriculumOptionsResponse,
  type DraftExerciseOption,
  type ExerciseTaxonomyListResponse,
  type ExerciseTaxonomyNodeSummary,
  createEmptyOptions,
  createGroupKey,
  formatMatchMode,
  formatTaxonomyStatus,
  requestJson,
  resolveCourseNameById,
  resolveUnitNameById,
  sanitizePreviewText,
} from "@/components/main/content-library/content-library-page-utils";

const ContentLibrarySnapshotView = dynamic(
  () =>
    import("@/components/main/content-library/ContentLibraryRenderers").then(
      (module) => module.ContentLibrarySnapshotView,
    ),
  {
    loading: () => (
      <div className="rounded-2xl border border-divider bg-white px-6 py-10">
        <div className="flex items-center gap-3 text-sm text-foreground/60">
          <Spinner size="sm" />
          <span>正在加载内容详情...</span>
        </div>
      </div>
    ),
  },
);


const TYPE_TABS: Array<{
  value: ContentLibraryType | "all";
  label: string;
  icon: typeof Library;
}> = [
  { value: "all", label: "All", icon: Library },
  { value: "rubric", label: "Rubric", icon: Table2 },
  { value: "question", label: "Worksheet", icon: FileText },
  { value: "pbl", label: "Assessment", icon: FileQuestion },
  { value: "lesson_plan", label: "Lesson Plan", icon: BookOpenText },
  { value: "other", label: "Other", icon: FolderOpen },
];

const VISIBLE_TYPE_TABS: Array<{
  value: ContentLibraryType | "all";
  label: string;
  icon: typeof Library;
}> = TYPE_TABS.filter((tab) => (tab.value === "pbl" ? isPblUiEnabled() : true));

const QUESTION_DIFFICULTY_OPTIONS: Array<{ value: "" | "1" | "2" | "3" | "4"; label: string }> = [
  { value: "", label: "全部难度" },
  { value: "1", label: "难度 1" },
  { value: "2", label: "难度 2" },
  { value: "3", label: "难度 3" },
  { value: "4", label: "难度 4" },
];

const QUESTION_ASSESSMENT_STYLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "全部考法" },
  { value: "concept_check", label: "概念辨析" },
  { value: "direct_application", label: "直接应用" },
  { value: "multi_step_problem", label: "多步推理" },
  { value: "graph_interpretation", label: "图像解读" },
  { value: "data_analysis", label: "数据分析" },
  { value: "experiment_analysis", label: "实验分析" },
  { value: "proof_reasoning", label: "证明推理" },
  { value: "error_analysis", label: "纠错分析" },
  { value: "modeling_scenario", label: "建模情境" },
  { value: "text_evidence", label: "文本证据" },
  { value: "translation_expression", label: "表达转换" },
  { value: "mixed", label: "混合" },
];


export default function ContentLibraryPage() {
  const { isZh, locale } = useAppI18n();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedItemId = searchParams.get("itemId")?.trim() ?? "";
  const requestedOriginEntityId = searchParams.get("originEntityId")?.trim() ?? "";
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [activeType, setActiveType] = useState<ContentLibraryType | "all">("all");
  const [courseId, setCourseId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [items, setItems] = useState<ContentLibraryListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detail, setDetail] = useState<ContentLibraryDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [statusText, setStatusText] = useState("");
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [taxonomyNodes, setTaxonomyNodes] = useState<ExerciseTaxonomyNodeSummary[]>([]);
  const [loadingTaxonomy, setLoadingTaxonomy] = useState(false);
  const [questionDifficultyFilter, setQuestionDifficultyFilter] = useState("");
  const [questionAssessmentStyleFilter, setQuestionAssessmentStyleFilter] = useState("");
  const [clusterNodeIdFilter, setClusterNodeIdFilter] = useState("");
  const [subskillNodeIdFilter, setSubskillNodeIdFilter] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [detailCourseId, setDetailCourseId] = useState("");
  const [detailUnitId, setDetailUnitId] = useState("");
  const [draftExerciseType, setDraftExerciseType] = useState<"MC" | "FR">("FR");
  const [draftExerciseDifficulty, setDraftExerciseDifficulty] = useState<1 | 2 | 3 | 4>(2);
  const [draftQuestionText, setDraftQuestionText] = useState("");
  const [draftCorrectAnswer, setDraftCorrectAnswer] = useState("");
  const [draftSolutionSteps, setDraftSolutionSteps] = useState("");
  const [draftCommonMistakesText, setDraftCommonMistakesText] = useState("");
  const [draftExerciseOptions, setDraftExerciseOptions] = useState<DraftExerciseOption[]>(createEmptyOptions);
  const [draftClusterLabel, setDraftClusterLabel] = useState("");
  const [draftSubskillLabel, setDraftSubskillLabel] = useState("");
  const [draftClusterMergeTargetId, setDraftClusterMergeTargetId] = useState("");
  const [draftSubskillMergeTargetId, setDraftSubskillMergeTargetId] = useState("");
  const [batchCourseId, setBatchCourseId] = useState("");
  const [batchUnitId, setBatchUnitId] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [viewMode, setViewMode] = useState<ContentLibraryViewMode>("list");
  const [savedCardOverrides, setSavedCardOverrides] = useState<Record<string, ContentCardOverride>>({});
  const savedCardOverridesRef = useRef<Record<string, ContentCardOverride>>({});
  const autoOpenedLibraryKeyRef = useRef("");
  const suppressRequestedDetailOpenRef = useRef(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [isMutating, startMutation] = useTransition();
  const runMutation = (action: () => Promise<void>) => {
    startMutation(async () => {
      await action();
    });
  };
  const sidebarContentTypes: Array<{
    value: ContentLibraryType | "all";
    label: string;
    icon: typeof Library;
  }> = [
    { value: "all", label: isZh ? "全部" : "All", icon: Library },
    { value: "rubric", label: "Rubric", icon: Table2 },
    { value: "question", label: "Worksheet", icon: FileText },
    { value: "pbl", label: "Assessment", icon: FileQuestion },
    { value: "lesson_plan", label: "Lesson Plan", icon: Calendar },
    { value: "other", label: isZh ? "其他" : "Other", icon: FolderOpen },
  ].filter((tab) => (tab.value === "pbl" ? isPblUiEnabled() : true)) as Array<{
    value: ContentLibraryType | "all";
    label: string;
    icon: typeof Library;
  }>;
  const typeLabels: Record<ContentLibraryType, string> = {
    rubric: isZh ? "评分标准" : "Rubric",
    lesson_plan: isZh ? "教案" : "Lesson Plan",
    question: isZh ? "习题" : "Question",
    pbl: isZh ? "PBL 项目" : "PBL Project",
    other: isZh ? "其他" : "Other",
  };

  const currentListQueryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("type", activeType);
    if (deferredQuery.trim()) {
      params.set("q", deferredQuery.trim());
    }
    if (courseId) {
      params.set("courseId", courseId);
    }
    if (unitId) {
      params.set("unitId", unitId);
    }
    if (activeType === "question" && clusterNodeIdFilter) {
      params.set("clusterNodeId", clusterNodeIdFilter);
    }
    if (activeType === "question" && subskillNodeIdFilter) {
      params.set("subskillNodeId", subskillNodeIdFilter);
    }
    if (activeType === "question" && questionDifficultyFilter) {
      params.set("difficulty", questionDifficultyFilter);
    }
    if (activeType === "question" && questionAssessmentStyleFilter) {
      params.set("assessmentStyle", questionAssessmentStyleFilter);
    }
    return params.toString();
  }, [
    activeType,
    clusterNodeIdFilter,
    courseId,
    deferredQuery,
    questionAssessmentStyleFilter,
    questionDifficultyFilter,
    subskillNodeIdFilter,
    unitId,
  ]);

  const applyListResponse = (payload: ContentLibraryListResponse) => {
    const nextItems = payload.items.map((item) =>
      mergeListItemWithOverride(item, savedCardOverridesRef.current[item.id]),
    );
    setItems(nextItems);
    setTotal(payload.total);
    setSelectedIds((current) => current.filter((id) => nextItems.some((item) => item.id === id)));
    setSelectedItemId((current) => {
      if (current && nextItems.some((item) => item.id === current)) {
        return current;
      }
      return nextItems[0]?.id ?? "";
    });
  };

  const refreshListNow = async () => {
    const payload = await requestJson<ContentLibraryListResponse>(
      `/api/content-library?${currentListQueryString}`,
    );
    applyListResponse(payload);
  };

  useEffect(() => {
    const nextType = searchParams.get("type");
    if (!isPblUiEnabled() && nextType === "pbl") {
      router.replace(pathname || "/main/content-library", { scroll: false });
      setActiveType("all");
      return;
    }
    if (
      nextType &&
      VISIBLE_TYPE_TABS.some((tab) => tab.value === nextType)
    ) {
      setActiveType(nextType as ContentLibraryType | "all");
      return;
    }
    setActiveType("all");
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!items.length) return;
    if (!requestedItemId && !requestedOriginEntityId) {
      autoOpenedLibraryKeyRef.current = "";
      suppressRequestedDetailOpenRef.current = false;
      return;
    }
    if (suppressRequestedDetailOpenRef.current) return;

    const target =
      items.find((item) => item.id === requestedItemId) ??
      items.find((item) => item.originEntityId === requestedOriginEntityId) ??
      null;

    if (!target) return;

    const nextKey = `${target.id}:${requestedItemId}:${requestedOriginEntityId}`;
    if (autoOpenedLibraryKeyRef.current === nextKey && detailOpen && selectedItemId === target.id) {
      return;
    }

    autoOpenedLibraryKeyRef.current = nextKey;
    setSelectedItemId(target.id);
    setDetailOpen(true);
  }, [detailOpen, items, requestedItemId, requestedOriginEntityId, selectedItemId]);

  // 课程选项 — 仅首次加载，不阻塞列表请求
  const curriculumLoadedRef = useRef(false);
  useEffect(() => {
    if (curriculumLoadedRef.current) return;
    let cancelled = false;
    requestJson<CurriculumOptionsResponse>("/api/curriculum/options")
      .then((payload) => {
        if (cancelled) return;
        setCourses(payload.courses);
        setUnits(payload.units);
        curriculumLoadedRef.current = true;
      })
      .catch(() => {
        if (cancelled) return;
        setCourses([]);
        setUnits([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeType !== "question" && !detailOpen) {
      return;
    }

    let cancelled = false;
    setLoadingTaxonomy(true);
    requestJson<ExerciseTaxonomyListResponse>("/api/exercises/taxonomy")
      .then((payload) => {
        if (cancelled) return;
        setTaxonomyNodes(payload.nodes);
      })
      .catch(() => {
        if (cancelled) return;
        setTaxonomyNodes([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingTaxonomy(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeType, detailOpen, reloadToken]);

  useEffect(() => {
    let cancelled = false;

    setLoadingList(true);
    setErrorText("");
    requestJson<ContentLibraryListResponse>(`/api/content-library?${currentListQueryString}`)
      .then((payload) => {
        if (cancelled) return;
        applyListResponse(payload);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setItems([]);
        setTotal(0);
        setSelectedItemId("");
        setErrorText(
          error instanceof Error ? error.message : isZh ? "读取内容库失败" : "Failed to load the content library",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingList(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeType,
    clusterNodeIdFilter,
    courseId,
    deferredQuery,
    isZh,
    questionAssessmentStyleFilter,
    questionDifficultyFilter,
    reloadToken,
    subskillNodeIdFilter,
    unitId,
    currentListQueryString,
  ]);

  useEffect(() => {
    if (!selectedItemId) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setLoadingDetail(true);
    requestJson<ContentLibraryDetail>(
      `/api/content-library/${encodeURIComponent(selectedItemId)}`,
    )
      .then((item) => {
        if (cancelled) return;
        setDetail(item);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setDetail(null);
        setErrorText(
          error instanceof Error ? error.message : isZh ? "读取内容详情失败" : "Failed to load content details",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingDetail(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isZh, reloadToken, selectedItemId]);

  useEffect(() => {
    setDraftTitle(detail?.customTitle ?? "");
    setDraftNote(detail?.note ?? "");
    setDetailCourseId(detail?.courseId ?? "");
    setDetailUnitId(detail?.unitId ?? "");
    const exercise = detail?.snapshot.kind === "exercise" ? detail.snapshot.exercise : null;
    setDraftExerciseType(exercise?.type === "MC" ? "MC" : "FR");
    setDraftExerciseDifficulty((exercise?.difficulty as 1 | 2 | 3 | 4 | undefined) ?? 2);
    setDraftQuestionText(exercise?.questionText ?? "");
    setDraftCorrectAnswer(exercise?.correctAnswer ?? "");
    setDraftSolutionSteps(exercise?.solutionSteps ?? "");
    setDraftCommonMistakesText((exercise?.commonMistakes ?? []).join("\n"));
    setDraftExerciseOptions(
      exercise?.options && Array.isArray(exercise.options) && exercise.options.length > 0
        ? ["A", "B", "C", "D"].map((label, index) => {
            const option = exercise.options?.find((item) => item.label === label) ?? exercise.options?.[index];
            return {
              label,
              text: option?.text ?? "",
              isCorrect: option?.isCorrect ?? index === 0,
            };
          })
        : createEmptyOptions(),
    );
    setDraftClusterLabel(exercise?.knowledgeCluster ?? "");
    setDraftSubskillLabel(exercise?.knowledgeSubskillLabel ?? "");
    setDraftClusterMergeTargetId("");
    setDraftSubskillMergeTargetId("");
  }, [detail]);

  useEffect(() => {
    if (activeType === "question") return;
    setQuestionDifficultyFilter("");
    setQuestionAssessmentStyleFilter("");
    setClusterNodeIdFilter("");
    setSubskillNodeIdFilter("");
  }, [activeType]);

  useEffect(() => {
    if (!courseId) {
      setUnitId("");
      return;
    }
    if (unitId && !units.some((unit) => unit.id === unitId && unit.course_id === courseId)) {
      setUnitId("");
    }
  }, [courseId, unitId, units]);

  useEffect(() => {
    if (!batchCourseId) {
      setBatchUnitId("");
      return;
    }
    if (
      batchUnitId &&
      !units.some((unit) => unit.id === batchUnitId && unit.course_id === batchCourseId)
    ) {
      setBatchUnitId("");
    }
  }, [batchCourseId, batchUnitId, units]);

  useEffect(() => {
    if (!detailCourseId) {
      setDetailUnitId("");
      return;
    }
    if (
      detailUnitId &&
      !units.some((unit) => unit.id === detailUnitId && unit.course_id === detailCourseId)
    ) {
      setDetailUnitId("");
    }
  }, [detailCourseId, detailUnitId, units]);

  useEffect(() => {
    if (!clusterNodeIdFilter) return;
    if (
      subskillNodeIdFilter &&
      !taxonomyNodes.some(
        (node) =>
          node.nodeType === "subskill" &&
          node.id === subskillNodeIdFilter &&
          node.parentNodeId === clusterNodeIdFilter,
      )
    ) {
      setSubskillNodeIdFilter("");
    }
  }, [clusterNodeIdFilter, subskillNodeIdFilter, taxonomyNodes]);

  const groupedItems = useMemo(() => {
    const groups = new Map<
      string,
      { courseName: string; unitName: string; items: ContentLibraryListItem[] }
    >();

    for (const item of items) {
      const courseName = item.courseName ?? (isZh ? "未分类课程" : "Unassigned course");
      const unitName = item.unitName ?? (isZh ? "未分类单元" : "Unassigned unit");
      const key = createGroupKey(item);
      const current = groups.get(key) ?? {
        courseName,
        unitName,
        items: [],
      };
      current.items.push(item);
      groups.set(key, current);
    }

    return Array.from(groups.values());
  }, [isZh, items]);

  const visibleUnits = useMemo(
    () => units.filter((unit) => !courseId || unit.course_id === courseId),
    [courseId, units],
  );

  const visibleBatchUnits = useMemo(
    () => units.filter((unit) => !batchCourseId || unit.course_id === batchCourseId),
    [batchCourseId, units],
  );
  const visibleDetailUnits = useMemo(
    () => units.filter((unit) => !detailCourseId || unit.course_id === detailCourseId),
    [detailCourseId, units],
  );
  const clusterNodes = useMemo(
    () => taxonomyNodes.filter((node) => node.nodeType === "cluster"),
    [taxonomyNodes],
  );
  const subskillNodes = useMemo(
    () => taxonomyNodes.filter((node) => node.nodeType === "subskill"),
    [taxonomyNodes],
  );
  const filteredSubskillNodes = useMemo(
    () =>
      subskillNodes.filter(
        (node) => !clusterNodeIdFilter || node.parentNodeId === clusterNodeIdFilter,
      ),
    [clusterNodeIdFilter, subskillNodes],
  );
  const exerciseDetail = detail?.snapshot.kind === "exercise" ? detail.snapshot.exercise : null;
  const currentClusterNode = useMemo(
    () =>
      clusterNodes.find((node) => node.id === (exerciseDetail?.knowledgeClusterNodeId ?? "")) ?? null,
    [clusterNodes, exerciseDetail?.knowledgeClusterNodeId],
  );
  const currentSubskillNode = useMemo(
    () =>
      subskillNodes.find((node) => node.id === (exerciseDetail?.knowledgeSubskillNodeId ?? "")) ?? null,
    [exerciseDetail?.knowledgeSubskillNodeId, subskillNodes],
  );
  const clusterMergeTargets = useMemo(
    () => clusterNodes.filter((node) => node.id !== currentClusterNode?.id),
    [clusterNodes, currentClusterNode?.id],
  );
  const subskillMergeTargets = useMemo(
    () =>
      subskillNodes.filter(
        (node) =>
          node.id !== currentSubskillNode?.id &&
          (!currentClusterNode?.id || node.parentNodeId === currentClusterNode.id),
      ),
    [currentClusterNode?.id, currentSubskillNode?.id, subskillNodes],
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleSelectedCount = useMemo(
    () => items.filter((item) => selectedSet.has(item.id)).length,
    [items, selectedSet],
  );
  const allVisibleSelected = items.length > 0 && visibleSelectedCount === items.length;
  const searchIsStale = query !== deferredQuery;
  const exerciseEntityId = detail?.originEntityType === "exercise"
    ? detail.originEntityId
    : exerciseDetail?.id ?? null;
  const taxonomyMetaLine = [
    currentClusterNode?.canonicalLabel ?? exerciseDetail?.knowledgeCluster ?? null,
    currentSubskillNode?.canonicalLabel ?? exerciseDetail?.knowledgeSubskillLabel ?? null,
  ]
    .filter(Boolean)
    .join(" · ");

  const toggleSelected = (itemId: string) => {
    setSelectedIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    );
  };

  const enterSelectionMode = () => {
    setSelectionMode(true);
    if (detailOpen) {
      setDetailOpen(false);
    }
  };

  const exitSelectionMode = (clearSelection = true) => {
    setSelectionMode(false);
    if (clearSelection) {
      setSelectedIds([]);
    }
  };

  const replaceDetailParams = (itemId?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (itemId) {
      params.set("itemId", itemId);
    } else {
      params.delete("itemId");
    }
    params.delete("originEntityId");
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    });
  };

  const openDetail = (itemId: string) => {
    suppressRequestedDetailOpenRef.current = false;
    setSelectedItemId(itemId);
    setDetailOpen(true);
    if (requestedItemId !== itemId || requestedOriginEntityId) {
      replaceDetailParams(itemId);
    }
  };

  const closeDetail = () => {
    if (isMutating) return;
    if (requestedItemId || requestedOriginEntityId) {
      suppressRequestedDetailOpenRef.current = true;
      autoOpenedLibraryKeyRef.current = "";
      replaceDetailParams();
    }
    setDetailOpen(false);
  };

  const handleDetailCourseChange = (nextCourseId: string) => {
    setDetailCourseId(nextCourseId);
    setDetailUnitId((currentUnitId) => {
      if (!nextCourseId) return "";
      if (!currentUnitId) return "";
      return units.some((unit) => unit.id === currentUnitId && unit.course_id === nextCourseId)
        ? currentUnitId
        : "";
    });
  };

  const handleDetailUnitChange = (nextUnitId: string) => {
    setDetailUnitId(nextUnitId);
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds((current) => current.filter((id) => !items.some((item) => item.id === id)));
      return;
    }
    setSelectedIds((current) => Array.from(new Set([...current, ...items.map((item) => item.id)])));
  };

  const runRefresh = () => {
    setReloadToken((current) => current + 1);
  };

  const syncListItemFromDetail = (
    nextDetail: ContentLibraryDetail,
    override?: Partial<ContentCardOverride>,
  ) => {
    const nextOverride = {
      ...buildCardOverrideFromDetail(nextDetail),
      ...override,
    };
    setSavedCardOverrides((current) => {
      const next = {
        ...current,
        [nextDetail.id]: nextOverride,
      };
      savedCardOverridesRef.current = next;
      return next;
    });
    setItems((current) =>
      current.map((item) =>
        item.id === nextDetail.id
          ? {
              ...item,
              title: nextDetail.title,
              displayTitle: nextOverride.displayTitle,
              note: nextOverride.note,
              courseId: nextOverride.courseId,
              unitId: nextOverride.unitId,
              courseName: nextOverride.courseName,
              unitName: nextOverride.unitName,
              updatedAt: nextOverride.updatedAt,
              sourceConversationId: nextDetail.sourceConversationId,
              sourceConversationTitle: nextDetail.sourceConversationTitle,
              sourceMessageId: nextDetail.sourceMessageId,
            }
          : item,
      ),
    );
  };

  const detailSnapshotView = useMemo(
    () =>
      detail ? (
        <ContentLibrarySnapshotView
          item={detail}
          onItemChange={(nextDetail) => {
            setDetail(nextDetail);
            syncListItemFromDetail(nextDetail, {
              updatedAt: nextDetail.updatedAt,
            });
          }}
        />
      ) : null,
    [detail],
  );

  const saveMetadata = () => {
    if (!detail) return;
    const normalizedDraft = normalizeMetadataSaveDraft({
      draftTitle,
      draftNote,
      detailCourseId,
      detailUnitId,
      currentCourseId: detail.courseId,
      currentUnitId: detail.unitId,
      courses,
      units,
    });
    const needsListRefreshAfterSave =
      Boolean(deferredQuery.trim()) || Boolean(courseId) || Boolean(unitId);
    if (!normalizedDraft.ok) {
      if (normalizedDraft.error === "course_not_found") {
        setErrorText(isZh ? "所选课程已失效，请重新选择" : "The selected course is no longer valid.");
        return;
      }
      if (normalizedDraft.error === "unit_not_found") {
        setErrorText(isZh ? "所选单元已失效，请重新选择" : "The selected unit is no longer valid.");
        return;
      }
      if (normalizedDraft.error === "unit_course_mismatch") {
        setErrorText(isZh ? "所选单元不属于当前课程，请重新选择" : "The selected unit does not belong to the current course.");
        return;
      }
      if (normalizedDraft.error === "unit_without_course") {
        setErrorText(isZh ? "请选择课程后再保存" : "Select a course before saving");
        return;
      }
      return;
    }
    const {
      normalizedTitle,
      normalizedNote,
      normalizedCourseId,
      normalizedUnitId,
      classificationChanged,
      savedCourse,
      savedUnit,
    } = normalizedDraft;

    runMutation(async () => {
      try {
        const item = await requestJson<ContentLibraryDetail>(
          `/api/content-library/${encodeURIComponent(detail.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              classificationChanged
                ? {
                    title: normalizedTitle,
                    note: normalizedNote,
                    courseId: normalizedCourseId,
                    unitId: normalizedUnitId || null,
                  }
                : {
                    title: normalizedTitle,
                    note: normalizedNote,
                  },
            ),
          },
        );
        setDetail(item);
        syncListItemFromDetail(item, {
          displayTitle: normalizedTitle || item.title,
          note: normalizedNote,
          courseId: normalizedCourseId || null,
          unitId: normalizedUnitId || null,
          courseName: normalizedCourseId ? savedCourse?.name ?? null : null,
          unitName: normalizedUnitId ? formatUnitNameFromOption(savedUnit) : null,
          updatedAt: item.updatedAt,
        });
        setStatusText(isZh ? "内容信息已保存" : "Content metadata saved");
        setErrorText("");
        if (needsListRefreshAfterSave) {
          setLoadingList(true);
          try {
            await refreshListNow();
          } finally {
            setLoadingList(false);
          }
        }
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : isZh ? "保存失败" : "Save failed");
      }
    });
  };

  const updateDraftOption = (index: number, patch: Partial<DraftExerciseOption>) => {
    setDraftExerciseOptions((current) =>
      current.map((option, optionIndex) => {
        if (optionIndex !== index) return option;
        const next = { ...option, ...patch };
        return patch.isCorrect
          ? { ...next, isCorrect: true }
          : next;
      }).map((option, optionIndex) => ({
        ...option,
        isCorrect:
          patch.isCorrect && optionIndex !== index
            ? false
            : option.isCorrect,
      })),
    );
  };

  const saveExerciseContent = () => {
    if (!detail || !exerciseEntityId) return;

    runMutation(async () => {
      try {
        await requestJson(`/api/exercises/${encodeURIComponent(exerciseEntityId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionText: draftQuestionText,
            type: draftExerciseType,
            difficulty: draftExerciseDifficulty,
            options:
              draftExerciseType === "MC"
                ? draftExerciseOptions.map((option) => ({
                    label: option.label,
                    text: option.text,
                    isCorrect: option.isCorrect,
                  }))
                : undefined,
            correctAnswer: draftCorrectAnswer,
            solutionSteps: draftSolutionSteps,
            commonMistakes: draftCommonMistakesText
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean),
          }),
        });
        setStatusText(isZh ? "题目内容已保存" : "Question content saved");
        setErrorText("");
        runRefresh();
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : isZh ? "保存题目失败" : "Failed to save the question");
      }
    });
  };

  const saveExerciseTaxonomy = () => {
    if (!detail || !exerciseEntityId) return;

    runMutation(async () => {
      try {
        await requestJson(`/api/exercises/${encodeURIComponent(exerciseEntityId)}/taxonomy`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clusterLabel: draftClusterLabel || null,
            subskillLabel: draftSubskillLabel || null,
          }),
        });
        setStatusText(isZh ? "题目分类已保存" : "Question taxonomy saved");
        setErrorText("");
        runRefresh();
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : isZh ? "保存分类失败" : "Failed to save taxonomy");
      }
    });
  };

  const reclassifyExerciseWithAi = () => {
    if (!detail || !exerciseEntityId) return;

    runMutation(async () => {
      try {
        await requestJson(`/api/exercises/${encodeURIComponent(exerciseEntityId)}/taxonomy/classify`, {
          method: "POST",
        });
        setStatusText(isZh ? "AI 已重新分析题目分类" : "AI reclassified the question");
        setErrorText("");
        runRefresh();
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : isZh ? "AI 重分类失败" : "AI reclassification failed");
      }
    });
  };

  const updateTaxonomyNode = (nodeId: string, body: Record<string, unknown>, successText: string) => {
    runMutation(async () => {
      try {
        await requestJson(`/api/exercises/taxonomy/${encodeURIComponent(nodeId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        setStatusText(successText);
        setErrorText("");
        runRefresh();
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : isZh ? "更新分类失败" : "Failed to update taxonomy");
      }
    });
  };

  const applyBatchClassification = () => {
    if (selectedIds.length === 0 || !batchCourseId) return;
    runMutation(async () => {
      try {
        await requestJson(`/api/content-library/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "reclassify",
            itemIds: selectedIds,
            courseId: batchCourseId,
            unitId: batchUnitId || null,
          }),
        });
        setStatusText(`已更新 ${selectedIds.length} 条内容的课程/单元归属`);
        setErrorText("");
        runRefresh();
      } catch (error) {
        setErrorText(
          error instanceof Error ? error.message : isZh ? "批量归类失败" : "Bulk reclassification failed",
        );
      }
    });
  };

  const deleteSelected = () => {
    if (selectedIds.length === 0) return;
    if (
      !window.confirm(
        isZh
          ? `确认删除已选中的 ${selectedIds.length} 条内容吗？此操作不可撤销。`
          : `Delete the selected ${selectedIds.length} item(s)? This action cannot be undone.`,
      )
    ) {
      return;
    }

    runMutation(async () => {
      try {
        const result = await requestJson<ContentLibraryDeleteResponse>(`/api/content-library/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "delete",
            itemIds: selectedIds,
          }),
        });
        if (result.blockedIds.length > 0) {
          setErrorText(
            isZh
              ? "部分内容删除失败：已发布教案不能直接删除"
              : "Some items could not be deleted: published lesson plans cannot be removed directly.",
          );
        } else {
          setErrorText("");
        }
        setStatusText(
          isZh ? `已删除 ${result.deletedIds.length} 条内容` : `Deleted ${result.deletedIds.length} item(s)`,
        );
        setSelectedIds([]);
        setSelectionMode(false);
        if (selectedItemId && selectedIds.includes(selectedItemId)) {
          setSelectedItemId("");
        }
        runRefresh();
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : isZh ? "批量删除失败" : "Bulk delete failed");
      }
    });
  };

  const deleteCurrentItem = () => {
    if (!detail) return;
    if (
      !window.confirm(
        isZh
          ? "确认删除当前内容吗？此操作不可撤销。"
          : "Delete the current item? This action cannot be undone.",
      )
    ) {
      return;
    }

    runMutation(async () => {
      try {
        const result = await requestJson<ContentLibraryDeleteResponse>(
          `/api/content-library/${encodeURIComponent(detail.id)}`,
          {
            method: "DELETE",
          },
        );

        if (result.blockedIds.length > 0) {
          setErrorText(
            isZh
              ? "已发布教案不能直接删除，请先取消发布或归档后再试"
              : "Published lesson plans cannot be deleted directly. Unpublish or archive them first.",
          );
          return;
        }

        setStatusText(isZh ? "当前内容已删除" : "Current item deleted");
        setErrorText("");
        setDetail(null);
        setSelectedIds((current) => current.filter((itemId) => itemId !== detail.id));
        setSavedCardOverrides((current) => {
          if (!(detail.id in current)) return current;
          const next = { ...current };
          delete next[detail.id];
          savedCardOverridesRef.current = next;
          return next;
        });
        if (selectedItemId === detail.id) {
          setSelectedItemId("");
        }
        setDetailOpen(false);
        runRefresh();
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : isZh ? "删除失败" : "Delete failed");
      }
    });
  };

  const TYPE_BADGE_STYLES: Record<ContentLibraryType, { bg: string; text: string; icon: typeof Table2 }> = {
    rubric: { bg: "bg-[rgba(234,228,242,0.5)]", text: "text-[#9065B0]", icon: Table2 },
    lesson_plan: { bg: "bg-[rgba(250,235,221,0.5)]", text: "text-[#CC772F]", icon: Calendar },
    question: { bg: "bg-[rgba(221,237,234,0.5)]", text: "text-[#4D7C0F]", icon: FileText },
    pbl: { bg: "bg-[rgba(255,226,221,0.5)]", text: "text-[#DF5452]", icon: FileQuestion },
    other: { bg: "bg-[rgba(238,224,218,0.5)]", text: "text-[#976D57]", icon: FolderOpen },
  };

  const COURSE_COLORS = ["#22C55E", "#3B82F6", "#A855F7", "#F59E0B", "#EF4444", "#06B6D4", "#EC4899"];
  const detailPreviewImageLabel = isZh ? "（附图）" : "(Image)";
  const detailDisplayTitle =
    sanitizePreviewText(detail?.displayTitle ?? detail?.title ?? "", detailPreviewImageLabel) ||
    (isZh ? "未命名内容" : "Untitled content");
  const detailMetaLine = [detail?.courseName, detail?.unitName].filter(Boolean).join(" · ");
  const activateLibraryItem = (itemId: string) => {
    if (selectionMode) {
      toggleSelected(itemId);
      return;
    }
    openDetail(itemId);
  };
  const buildItemPresentation = (item: ContentLibraryListItem) => {
    const isOpenDetailItem =
      detailOpen && detail?.id === item.id && selectedItemId === item.id;
    const savedOverride = savedCardOverrides[item.id] ?? null;
    const badge = TYPE_BADGE_STYLES[item.contentType];
    const BadgeIcon = badge.icon;
    const previewImageLabel = isZh ? "（附图）" : "(Image)";
    const liveCourse =
      isOpenDetailItem && detailCourseId
        ? courses.find((course) => course.id === detailCourseId) ?? null
        : null;
    const liveUnit =
      isOpenDetailItem && detailUnitId
        ? units.find((unit) => unit.id === detailUnitId) ?? null
        : null;
    const effectiveTitle =
      (isOpenDetailItem ? draftTitle.trim() : "") ||
      savedOverride?.displayTitle ||
      item.displayTitle;
    const effectiveNote = isOpenDetailItem
      ? draftNote.trim()
      : savedOverride?.note?.trim() || item.note?.trim() || "";
    const effectiveCourseName = isOpenDetailItem
      ? liveCourse?.name ?? null
      : resolveCourseNameById(
          courses,
          savedOverride?.courseId ?? item.courseId,
          savedOverride?.courseName ?? item.courseName,
        );
    const effectiveUnitName = isOpenDetailItem
      ? formatUnitNameFromOption(liveUnit)
      : resolveUnitNameById(
          units,
          savedOverride?.unitId ?? item.unitId,
          savedOverride?.unitName ?? item.unitName,
        );
    const effectiveUpdatedAt = savedOverride?.updatedAt ?? item.updatedAt;
    return {
      badge,
      BadgeIcon,
      isSelected: selectedSet.has(item.id),
      displayTitle:
        sanitizePreviewText(effectiveTitle, previewImageLabel) ||
        (isZh ? "未命名内容" : "Untitled content"),
      noteText: sanitizePreviewText(effectiveNote, previewImageLabel),
      summaryText: sanitizePreviewText(item.summaryText, previewImageLabel),
      effectiveCourseName,
      effectiveUnitName,
      effectiveUpdatedAt,
    };
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      {/* Top Bar */}
      <div className="flex flex-col gap-3 bg-background px-4 py-6 md:flex-row md:items-center md:justify-between md:px-8">
        <h1 className="hidden shrink-0 whitespace-nowrap text-lg font-semibold tracking-tight text-foreground md:block">
          {isZh ? "内容库" : "Content Library"}
        </h1>
        <div className="flex w-full items-center justify-end gap-2 md:gap-3">
          <TextField
            data-testid="library-search-input"
            aria-label={isZh ? "搜索内容" : "Search content"}
            value={query}
            onChange={(value) => setQuery(value)}
            className="relative min-w-0 flex-1 md:max-w-[460px] md:flex-[0_1_460px]"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-default-400" />
            <Input
              placeholder={isZh ? "搜索内容..." : "Search content..."}
              className="pl-9 pr-8"
            />
            {searchIsStale ? (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Spinner size="sm" />
              </div>
            ) : null}
          </TextField>
          <Button
            variant="ghost"
            onPress={() =>
              selectionMode ? exitSelectionMode() : enterSelectionMode()
            }
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm transition-colors",
              selectionMode
                ? "border-foreground bg-default-100 font-medium text-foreground"
                : "border-divider text-default-500 hover:bg-default-100",
            )}
          >
            <CheckSquare2 className="h-4 w-4" />
            {selectionMode
              ? isZh
                ? "退出多选"
                : "Exit select"
              : isZh
                ? "多选"
                : "Select"}
          </Button>
          <div className="flex overflow-hidden rounded-lg border border-divider">
            <Button
              isIconOnly
              variant="ghost"
              onPress={() => setViewMode("grid")}
              className={cn(
                "flex items-center justify-center px-2.5 py-2 transition-colors",
                viewMode === "grid"
                  ? "bg-default-100 text-foreground"
                  : "bg-white/70 text-default-400 hover:bg-default-100",
              )}
              aria-label={isZh ? "切换到卡片视图" : "Switch to grid view"}
              aria-pressed={viewMode === "grid"}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <div className="w-px bg-default-200" />
            <Button
              isIconOnly
              variant="ghost"
              onPress={() => setViewMode("list")}
              className={cn(
                "flex items-center justify-center px-2.5 py-2 transition-colors",
                viewMode === "list"
                  ? "bg-default-100 text-foreground"
                  : "bg-white/70 text-default-400 hover:bg-default-100",
              )}
              aria-label={isZh ? "切换到列表视图" : "Switch to list view"}
              aria-pressed={viewMode === "list"}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 md:px-8">
        {/* Tab Bar - underline style */}
        <div className="flex items-center gap-8 border-b border-divider">
          {sidebarContentTypes.map((tab) => {
            const active = activeType === tab.value;
            return (
              <Button
                key={tab.value}
                variant="ghost"
                data-testid={`library-tab-${tab.value}`}
                onPress={() => setActiveType(tab.value)}
                className={cn(
                  "pb-3 px-1 text-sm font-medium border-b-2 transition-all whitespace-nowrap",
                  active
                    ? "font-semibold text-primary border-primary"
                    : "text-foreground/60 hover:text-foreground border-transparent",
                )}
              >
                {tab.label}
              </Button>
            );
          })}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-3 mt-4 mb-8 flex-wrap">
          {courseId ? (() => {
            const activeCourse = courses.find((c) => c.id === courseId);
            return activeCourse ? (
              <button
                type="button"
                onClick={() => setCourseId("")}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium transition-colors hover:bg-[rgba(94,106,210,0.12)]"
              >
                {activeCourse.name}
                <X className="h-3 w-3" />
              </button>
            ) : null;
          })() : null}

          {activeType !== "all" ? (
            <button
              type="button"
              onClick={() => setActiveType("all")}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[rgba(227,226,224,0.5)] text-foreground text-xs font-medium transition-colors hover:bg-[rgba(227,226,224,0.8)]"
            >
              {typeLabels[activeType as ContentLibraryType] ?? activeType}
              <X className="h-3 w-3" />
            </button>
          ) : null}

          {activeType === "question" && questionDifficultyFilter ? (
            <button
              type="button"
              onClick={() => setQuestionDifficultyFilter("")}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[rgba(227,226,224,0.5)] text-foreground text-xs font-medium transition-colors hover:bg-[rgba(227,226,224,0.8)]"
            >
              {isZh ? `难度 ${questionDifficultyFilter}` : `Difficulty ${questionDifficultyFilter}`}
              <X className="h-3 w-3" />
            </button>
          ) : null}

          {activeType === "question" && questionAssessmentStyleFilter ? (
            <button
              type="button"
              onClick={() => setQuestionAssessmentStyleFilter("")}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[rgba(227,226,224,0.5)] text-foreground text-xs font-medium transition-colors hover:bg-[rgba(227,226,224,0.8)]"
            >
              {QUESTION_ASSESSMENT_STYLE_OPTIONS.find((o) => o.value === questionAssessmentStyleFilter)?.label ?? questionAssessmentStyleFilter}
              <X className="h-3 w-3" />
            </button>
          ) : null}

          {activeType === "question" && clusterNodeIdFilter ? (
            <button
              type="button"
              onClick={() => setClusterNodeIdFilter("")}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[rgba(227,226,224,0.5)] text-foreground text-xs font-medium transition-colors hover:bg-[rgba(227,226,224,0.8)]"
            >
              {clusterNodes.find((n) => n.id === clusterNodeIdFilter)?.canonicalLabel ?? clusterNodeIdFilter}
              <X className="h-3 w-3" />
            </button>
          ) : null}

          {activeType === "question" && subskillNodeIdFilter ? (
            <button
              type="button"
              onClick={() => setSubskillNodeIdFilter("")}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[rgba(227,226,224,0.5)] text-foreground text-xs font-medium transition-colors hover:bg-[rgba(227,226,224,0.8)]"
            >
              {filteredSubskillNodes.find((n) => n.id === subskillNodeIdFilter)?.canonicalLabel ?? subskillNodeIdFilter}
              <X className="h-3 w-3" />
            </button>
          ) : null}

          {/* Add Filter dropdown triggers */}
          <div className="flex items-center gap-2 flex-wrap">
            {!courseId && courses.length > 0 ? (
              <div className="relative group">
                <button
                  type="button"
                  className="px-3 py-1 rounded-full border border-divider text-foreground/60 text-xs font-medium transition-colors hover:bg-[rgba(227,226,224,0.5)] hover:text-foreground"
                >
                  + {isZh ? "学科" : "Subject"}
                </button>
                <div className="invisible group-hover:visible absolute left-0 top-full z-30 mt-1 min-w-[180px] rounded-lg border border-divider bg-white py-1 shadow-lg">
                  {courses.map((course) => (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => setCourseId(course.id)}
                      className="block w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-default-100 transition-colors"
                    >
                      {course.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {activeType === "question" ? (
              <>
                {!questionDifficultyFilter ? (
                  <div className="relative group">
                    <button
                      type="button"
                      className="px-3 py-1 rounded-full border border-divider text-foreground/60 text-xs font-medium transition-colors hover:bg-[rgba(227,226,224,0.5)] hover:text-foreground"
                    >
                      + {isZh ? "难度" : "Difficulty"}
                    </button>
                    <div className="invisible group-hover:visible absolute left-0 top-full z-30 mt-1 min-w-[120px] rounded-lg border border-divider bg-white py-1 shadow-lg">
                      {QUESTION_DIFFICULTY_OPTIONS.filter((o) => o.value).map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setQuestionDifficultyFilter(option.value)}
                          className="block w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-default-100 transition-colors"
                        >
                          {isZh ? option.label : option.label.replace("难度", "Difficulty ")}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {!questionAssessmentStyleFilter ? (
                  <div className="relative group">
                    <button
                      type="button"
                      className="px-3 py-1 rounded-full border border-divider text-foreground/60 text-xs font-medium transition-colors hover:bg-[rgba(227,226,224,0.5)] hover:text-foreground"
                    >
                      + {isZh ? "考法" : "Style"}
                    </button>
                    <div className="invisible group-hover:visible absolute left-0 top-full z-30 mt-1 min-w-[140px] rounded-lg border border-divider bg-white py-1 shadow-lg max-h-[200px] overflow-y-auto">
                      {QUESTION_ASSESSMENT_STYLE_OPTIONS.filter((o) => o.value).map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setQuestionAssessmentStyleFilter(option.value)}
                          className="block w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-default-100 transition-colors"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {!clusterNodeIdFilter && clusterNodes.length > 0 ? (
                  <div className="relative group">
                    <button
                      type="button"
                      className="px-3 py-1 rounded-full border border-divider text-foreground/60 text-xs font-medium transition-colors hover:bg-[rgba(227,226,224,0.5)] hover:text-foreground"
                    >
                      + {isZh ? "大类" : "Cluster"}
                    </button>
                    <div className="invisible group-hover:visible absolute left-0 top-full z-30 mt-1 min-w-[160px] rounded-lg border border-divider bg-white py-1 shadow-lg max-h-[200px] overflow-y-auto">
                      {clusterNodes.map((node) => (
                        <button
                          key={node.id}
                          type="button"
                          onClick={() => setClusterNodeIdFilter(node.id)}
                          className="block w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-default-100 transition-colors"
                        >
                          {node.canonicalLabel}
                          {node.status === "candidate" ? (isZh ? "（候选）" : " (Candidate)") : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {!subskillNodeIdFilter && filteredSubskillNodes.length > 0 ? (
                  <div className="relative group">
                    <button
                      type="button"
                      className="px-3 py-1 rounded-full border border-divider text-foreground/60 text-xs font-medium transition-colors hover:bg-[rgba(227,226,224,0.5)] hover:text-foreground"
                    >
                      + {isZh ? "小类" : "Subskill"}
                    </button>
                    <div className="invisible group-hover:visible absolute left-0 top-full z-30 mt-1 min-w-[160px] rounded-lg border border-divider bg-white py-1 shadow-lg max-h-[200px] overflow-y-auto">
                      {filteredSubskillNodes.map((node) => (
                        <button
                          key={node.id}
                          type="button"
                          onClick={() => setSubskillNodeIdFilter(node.id)}
                          className="block w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-default-100 transition-colors"
                        >
                          {node.canonicalLabel}
                          {node.status === "candidate" ? (isZh ? "（候选）" : " (Candidate)") : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {loadingTaxonomy ? (
                  <span className="inline-flex items-center gap-1 text-xs text-default-400">
                    <Spinner size="sm" />
                  </span>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        {/* Status bar */}
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <span className="text-sm text-foreground/60">
            {selectionMode
              ? isZh
                ? `已选择 ${selectedIds.length} / ${items.length} 条`
                : `${selectedIds.length} selected / ${items.length}`
              : isZh
                ? `${total} 条内容`
                : `${total} items`}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {selectionMode ? (
              <>
                <Button
                  variant="ghost"
                  onPress={toggleSelectAllVisible}
                  isDisabled={items.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-full border border-divider bg-white px-3 py-1.5 text-xs font-medium text-foreground/60 transition-colors hover:bg-default-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CheckSquare2 className="h-3.5 w-3.5" />
                  {allVisibleSelected
                    ? isZh
                      ? "取消全选当前页"
                      : "Clear visible"
                    : isZh
                      ? "全选当前页"
                      : "Select visible"}
                </Button>
                <Button
                  variant="primary"
                  onPress={deleteSelected}
                  isDisabled={selectedIds.length === 0 || isMutating}
                  className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#484540] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isMutating ? (
                    <Spinner size="sm" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  {isZh ? "批量删除" : "Delete selected"}
                </Button>
                <Button
                  variant="ghost"
                  onPress={() => exitSelectionMode()}
                  isDisabled={isMutating}
                  className="inline-flex items-center gap-1.5 rounded-full border border-divider bg-white px-3 py-1.5 text-xs font-medium text-foreground/60 transition-colors hover:bg-default-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X className="h-3.5 w-3.5" />
                  {isZh ? "取消" : "Cancel"}
                </Button>
              </>
            ) : null}
            {statusText ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                {statusText}
              </span>
            ) : null}
            {errorText ? (
              <span className="rounded-full bg-red-50 px-3 py-1 text-xs text-red-700">
                {errorText}
              </span>
            ) : null}
          </div>
        </div>

        {/* Content List / Grid */}
        {loadingList ? (
          <div className="flex h-64 items-center justify-center text-sm text-foreground/60">
            <Spinner size="sm" />
            {isZh ? "正在加载内容库..." : "Loading the content library..."}
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-divider bg-white text-center">
            <Library className="h-8 w-8 text-foreground/40" />
            <h2 className="mt-4 text-base font-semibold text-foreground">
              {isZh ? "暂时没有匹配内容" : "No matching content"}
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-foreground/60">
              {isZh
                ? "试试切换类型、调整课程筛选，或者先在 Agent 中生成新的教学内容。"
                : "Try switching the type, adjusting the course filter, or generating new teaching content in the Agent first."}
            </p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="columns-1 gap-5 md:columns-2 xl:columns-3">
            {items.map((item) => {
              const {
                badge,
                BadgeIcon,
                isSelected,
                displayTitle,
                noteText,
                summaryText,
                effectiveCourseName,
                effectiveUnitName,
                effectiveUpdatedAt,
              } = buildItemPresentation(item);
              return (
                <div
                  key={item.id}
                  data-testid="library-item-card"
                  data-item-id={item.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectionMode ? selectedSet.has(item.id) : undefined}
                  onClick={() => activateLibraryItem(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      activateLibraryItem(item.id);
                    }
                  }}
                  className={cn(
                    "mb-5 break-inside-avoid overflow-hidden rounded-xl border border-divider bg-white transition-all hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/20",
                    selectionMode && isSelected
                      ? "border-primary ring-2 ring-primary/20"
                      : "",
                    detailOpen && selectedItemId === item.id ? "ring-2 ring-primary/20" : "",
                  )}
                >
                  {/* Card Header */}
                  <div className="flex flex-col gap-3 border-b border-default-100 bg-default-100 px-5 py-4">
                    <div className="flex items-center justify-between">
                      <span className={cn("inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-bold uppercase", badge.bg, badge.text)}>
                        <BadgeIcon className="h-3 w-3" />
                        {typeLabels[item.contentType]}
                      </span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          activateLibraryItem(item.id);
                        }}
                        className="rounded-md p-1 hover:bg-white/50"
                        aria-label={
                          selectionMode
                            ? isZh
                              ? "切换选中状态"
                              : "Toggle selection"
                            : isZh
                              ? "打开内容详情"
                              : "Open content details"
                        }
                      >
                        {selectionMode ? (
                          <div
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded border transition-colors",
                              isSelected
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-foreground/20 bg-white text-foreground/40",
                            )}
                          >
                            <CheckSquare2 className="h-3.5 w-3.5" />
                          </div>
                        ) : (
                          <MoreHorizontal className="h-4 w-4 text-foreground/40" />
                        )}
                      </button>
                    </div>
                    <h3 className="text-base font-semibold tracking-tight text-foreground">
                      {displayTitle}
                    </h3>
                  </div>
                  {/* Card Body */}
                  <div className="flex flex-col gap-3 px-5 py-4">
                    {effectiveCourseName || effectiveUnitName ? (
                      <div className="flex flex-wrap gap-1.5">
                        {effectiveUnitName ? (
                          <span className="rounded-full bg-[rgba(227,226,224,0.5)] px-2.5 py-1 text-[11px] text-foreground/60">
                            {effectiveUnitName}
                          </span>
                        ) : null}
                        {effectiveCourseName ? (
                          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] text-primary">
                            {effectiveCourseName}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {noteText ? (
                      <div className="rounded-lg bg-default-100 px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/40">
                          {isZh ? "教师备注" : "Teacher note"}
                        </p>
                        <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-foreground/60">
                          {noteText}
                        </p>
                      </div>
                    ) : summaryText ? (
                      <p className="line-clamp-2 text-[13px] leading-relaxed text-foreground/40">
                        {summaryText}
                      </p>
                    ) : null}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-foreground/30">
                        {formatLocaleDateTime(locale, effectiveUpdatedAt, {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#F0FDF4] px-2 py-0.5 text-[10px] font-medium text-[#16A34A]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
                        {isZh ? "AI 生成" : "AI Generated"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-default-100 pt-3">
                      <span className="text-xs font-medium text-foreground/60">
                        {isZh ? "点击查看详细内容" : "Click to open details"}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground">
                        {isZh ? "查看详情" : "View details"}
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View - 5 column table */
          <div className="overflow-hidden rounded-xl">
            {/* Table Header */}
            <div className="grid grid-cols-[1fr_120px_140px_140px_80px] px-4 py-2 text-[11px] font-bold text-foreground/40 uppercase tracking-wider">
              <div>Title</div>
              <div>Type</div>
              <div>Subject</div>
              <div>Modified</div>
              <div className="text-right">Actions</div>
            </div>
            {/* Table Rows */}
            {items.map((item) => {
              const {
                badge,
                BadgeIcon,
                isSelected,
                displayTitle,
                effectiveCourseName,
                effectiveUpdatedAt,
              } = buildItemPresentation(item);
              return (
                <div
                  key={item.id}
                  data-testid="library-item-card"
                  data-item-id={item.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectionMode ? isSelected : undefined}
                  onClick={() => activateLibraryItem(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      activateLibraryItem(item.id);
                    }
                  }}
                  className={cn(
                    "group grid grid-cols-[1fr_120px_140px_140px_80px] items-center px-4 py-3.5 rounded-lg transition-all duration-200 cursor-pointer",
                    selectionMode && isSelected
                      ? "bg-primary/5"
                      : "hover:bg-default-100",
                    detailOpen && selectedItemId === item.id ? "bg-default-100" : "",
                  )}
                >
                  {/* Title column */}
                  <div className="flex items-center gap-3 min-w-0">
                    {selectionMode ? (
                      <div
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                          isSelected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-foreground/20 bg-white text-foreground/40",
                        )}
                      >
                        <CheckSquare2 className="h-3.5 w-3.5" />
                      </div>
                    ) : (
                      <BadgeIcon className="h-5 w-5 shrink-0 text-foreground/40" />
                    )}
                    <span className="text-sm font-medium text-foreground truncate">
                      {displayTitle}
                    </span>
                  </div>
                  {/* Type column - colored badge */}
                  <div>
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase", badge.bg, badge.text)}>
                      {typeLabels[item.contentType]}
                    </span>
                  </div>
                  {/* Subject column */}
                  <div className="text-[13px] text-foreground/60 truncate">
                    {effectiveCourseName || (isZh ? "未分类" : "Unassigned")}
                  </div>
                  {/* Modified column */}
                  <div className="text-[13px] text-foreground/60">
                    {formatLocaleDateTime(locale, effectiveUpdatedAt, {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  {/* Actions column - visible on hover */}
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openDetail(item.id);
                      }}
                      className="p-1 rounded hover:bg-white/50 transition-colors"
                      aria-label={isZh ? "编辑" : "Edit"}
                    >
                      <Pencil className="h-[18px] w-[18px] text-foreground/40 hover:text-primary" />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openDetail(item.id);
                      }}
                      className="p-1 rounded hover:bg-white/50 transition-colors"
                      aria-label={isZh ? "更多操作" : "More actions"}
                    >
                      <MoreHorizontal className="h-[18px] w-[18px] text-foreground/40 hover:text-primary" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Recent Workflows - Bento Cards */}
        <section className="mt-16">
          <h2 className="mb-6 text-base font-semibold text-foreground">
            {isZh ? "推荐工作流" : "Recent Workflows"}
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Bento Card - Featured Template (spans 2 cols) */}
            <div className="flex h-[300px] flex-col justify-between rounded-xl bg-default-100 p-8 md:col-span-2">
              <div>
                <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[#C4841D]">
                  {isZh ? "精选模板" : "Featured Template"}
                </span>
                <h3 className="max-w-sm text-2xl font-bold leading-tight text-foreground">
                  {isZh
                    ? "数秒内生成高质量教学评估"
                    : "Curate high-performance assessments in seconds."}
                </h3>
              </div>
              <div className="flex items-center gap-4">
                <Link
                  href="/main/agent"
                  className="rounded-lg bg-foreground px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#484540]"
                >
                  {isZh ? "启动工作台" : "Launch Studio"}
                </Link>
                <p className="text-xs italic text-foreground/40">
                  {isZh ? "本周已有 42 位教师使用" : "Used by 42 teachers this week"}
                </p>
              </div>
            </div>
            {/* Bento Card - AI Grade Assistant */}
            <div className="flex h-[300px] flex-col justify-between rounded-xl bg-default-200 p-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-white/50 backdrop-blur-xs">
                <BarChart3 className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-foreground">
                  {isZh ? "AI 评分助手" : "AI Grade Assistant"}
                </h4>
                <p className="mt-1 text-sm text-foreground/60">
                  {isZh
                    ? "基于评分标准自动批改，准确率高达 98%。"
                    : "Automate grading for structured rubrics with 98% accuracy."}
                </p>
              </div>
              <Link
                href="/main/grading"
                className="group flex items-center gap-1 text-sm font-semibold text-[#C4841D]"
              >
                {isZh ? "探索工具" : "Explore Tool"}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-32 pb-16 border-t border-default-100 pt-8 flex justify-between items-center opacity-40">
          <p className="text-[11px] font-medium tracking-widest uppercase text-foreground">Deskmate Editorial Workspace &copy; 2024</p>
          <div className="flex gap-6">
            <a href="#" className="text-[11px] font-medium tracking-widest uppercase text-foreground/60 hover:text-foreground transition-colors">Documentation</a>
            <a href="#" className="text-[11px] font-medium tracking-widest uppercase text-foreground/60 hover:text-foreground transition-colors">System Status</a>
          </div>
        </footer>
      </div>

      {detailOpen ? (
        <>
          <Button
            variant="ghost"
            aria-label={isZh ? "关闭内容详情遮罩" : "Close content detail overlay"}
            onPress={closeDetail}
            isDisabled={isMutating}
            className="fixed inset-0 z-40 bg-slate-900/36 disabled:cursor-not-allowed"
          />

          <aside
            data-testid="content-library-detail-sheet"
            role="dialog"
            aria-modal="true"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[720px] flex-col border-l border-divider bg-background shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
          >
            <div className="flex items-start justify-between border-b border-divider bg-white px-5 py-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-400">
                  {isZh ? "内容详情" : "Content detail"}
                </p>
                <h2
                  data-testid="content-library-detail-title"
                  className="mt-1 truncate text-lg font-semibold text-foreground"
                >
                  {loadingDetail && !detail ? (isZh ? "正在读取详情..." : "Loading details...") : detailDisplayTitle}
                </h2>
                {detailMetaLine ? (
                  <p className="mt-1 truncate text-sm text-default-500">{detailMetaLine}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={closeDetail}
                disabled={isMutating}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-divider bg-white text-default-500 transition-colors hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={isZh ? "关闭内容详情" : "Close content details"}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
              {loadingDetail && !detail ? (
                <div className="flex h-48 items-center justify-center rounded-2xl border border-divider bg-white text-sm text-default-500">
                  <Spinner size="sm" />
                  {isZh ? "正在加载详细内容..." : "Loading detailed content..."}
                </div>
              ) : null}

              {!loadingDetail && !detail ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-default-500">
                  {errorText || (isZh ? "暂时无法读取内容详情" : "Content details are unavailable")}
                </div>
              ) : null}

              {detail ? (
                <div className="space-y-4">
                  <Card className="rounded-2xl p-4">
                    <div className="grid gap-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <TextField
                          value={draftTitle}
                          onChange={(value) => setDraftTitle(value)}
                        >
                          <span className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
                            <Settings className="h-4 w-4 text-default-400" />
                            {isZh ? "内容标题" : "Title"}
                          </span>
                          <Input
                            placeholder={isZh ? "输入老师更容易识别的标题" : "Add a clearer teacher-facing title"}
                          />
                        </TextField>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <Select
                            aria-label={isZh ? "课程" : "Course"}
                            value={detailCourseId}
                            onChange={(value) => handleDetailCourseChange(value as string)}
                          >
                            <span className="mb-2 block text-sm font-medium text-slate-700">{isZh ? "课程" : "Course"}</span>
                            <Select.Trigger className="w-full rounded-2xl border border-divider px-3.5 py-2.5 text-sm text-slate-700">
                              <Select.Value />
                              <Select.Indicator />
                            </Select.Trigger>
                            <Select.Popover>
                              <ListBox>
                                <ListBox.Item id="" textValue={isZh ? "未分类课程" : "Unassigned course"}>{isZh ? "未分类课程" : "Unassigned course"}</ListBox.Item>
                                {courses.map((course) => (
                                  <ListBox.Item key={course.id} id={course.id} textValue={course.name}>
                                    {course.name}
                                  </ListBox.Item>
                                ))}
                              </ListBox>
                            </Select.Popover>
                          </Select>

                          <Select
                            aria-label={isZh ? "单元" : "Unit"}
                            value={detailUnitId}
                            onChange={(value) => handleDetailUnitChange(value as string)}
                          >
                            <span className="mb-2 block text-sm font-medium text-slate-700">{isZh ? "单元" : "Unit"}</span>
                            <Select.Trigger className="w-full rounded-2xl border border-divider px-3.5 py-2.5 text-sm text-slate-700">
                              <Select.Value />
                              <Select.Indicator />
                            </Select.Trigger>
                            <Select.Popover>
                              <ListBox>
                                <ListBox.Item id="" textValue={isZh ? "未分类单元" : "Unassigned unit"}>{isZh ? "未分类单元" : "Unassigned unit"}</ListBox.Item>
                                {visibleDetailUnits.map((unit) => (
                                  <ListBox.Item key={unit.id} id={unit.id} textValue={unit.title}>
                                    {unit.title}
                                  </ListBox.Item>
                                ))}
                              </ListBox>
                            </Select.Popover>
                          </Select>
                        </div>
                      </div>

                      <TextField
                        value={draftNote}
                        onChange={(value) => setDraftNote(value)}
                      >
                        <span className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
                          <StickyNote className="h-4 w-4 text-default-400" />
                          {isZh ? "教师备注" : "Teacher note"}
                        </span>
                        <TextArea
                          placeholder={isZh ? "补充适用场景、班级信息或后续处理提醒" : "Add context, class notes, or follow-up reminders"}
                          className="min-h-[108px]"
                        />
                      </TextField>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-default-500">
                        <span className="rounded-full bg-slate-50 px-3 py-1">
                          {formatLocaleDateTime(locale, detail.updatedAt, {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {detail.sourceConversationTitle ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1">
                            <MessageSquare className="h-3.5 w-3.5 text-default-400" />
                            {detail.sourceConversationTitle}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="primary"
                          onPress={saveMetadata}
                          isDisabled={isMutating}
                          className="inline-flex items-center gap-2 rounded-2xl bg-foreground px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#484540] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isMutating ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
                          {isZh ? "保存详情信息" : "Save details"}
                        </Button>
                        <Button
                          variant="ghost"
                          onPress={deleteCurrentItem}
                          isDisabled={isMutating}
                          className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 className="h-4 w-4" />
                          {isZh ? "删除当前内容" : "Delete item"}
                        </Button>
                      </div>
                    </div>
                  </Card>

                  {exerciseDetail ? (
                    <>
                      <Card className="rounded-2xl p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-900">
                              {isZh ? "题目内容编辑" : "Question editor"}
                            </h3>
                            <p className="mt-1 text-xs text-default-500">
                              {isZh ? "老师可以直接修正文案、答案与解析。" : "Teachers can directly revise the question, answer, and explanation."}
                            </p>
                          </div>
                          {taxonomyMetaLine ? (
                            <span className="rounded-full bg-slate-50 px-3 py-1 text-xs text-default-500">
                              {taxonomyMetaLine}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-4 grid gap-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <Select
                              aria-label={isZh ? "题型" : "Type"}
                              value={draftExerciseType}
                              onChange={(value) => setDraftExerciseType(value as "MC" | "FR")}
                            >
                              <span className="mb-2 block text-sm font-medium text-slate-700">{isZh ? "题型" : "Type"}</span>
                              <Select.Trigger className="w-full rounded-2xl border border-divider px-3.5 py-2.5 text-sm text-slate-700">
                                <Select.Value />
                                <Select.Indicator />
                              </Select.Trigger>
                              <Select.Popover>
                                <ListBox>
                                  <ListBox.Item id="FR" textValue="FR">FR</ListBox.Item>
                                  <ListBox.Item id="MC" textValue="MC">MC</ListBox.Item>
                                </ListBox>
                              </Select.Popover>
                            </Select>
                            <Select
                              aria-label={isZh ? "难度" : "Difficulty"}
                              value={String(draftExerciseDifficulty)}
                              onChange={(value) => setDraftExerciseDifficulty(Number(value) as 1 | 2 | 3 | 4)}
                            >
                              <span className="mb-2 block text-sm font-medium text-slate-700">{isZh ? "难度" : "Difficulty"}</span>
                              <Select.Trigger className="w-full rounded-2xl border border-divider px-3.5 py-2.5 text-sm text-slate-700">
                                <Select.Value />
                                <Select.Indicator />
                              </Select.Trigger>
                              <Select.Popover>
                                <ListBox>
                                  {[1, 2, 3, 4].map((value) => (
                                    <ListBox.Item key={value} id={String(value)} textValue={isZh ? `难度 ${value}` : `Difficulty ${value}`}>
                                      {isZh ? `难度 ${value}` : `Difficulty ${value}`}
                                    </ListBox.Item>
                                  ))}
                                </ListBox>
                              </Select.Popover>
                            </Select>
                          </div>

                          <TextField
                            value={draftQuestionText}
                            onChange={(value) => setDraftQuestionText(value)}
                          >
                            <span className="mb-2 block text-sm font-medium text-slate-700">{isZh ? "题干" : "Question"}</span>
                            <TextArea className="min-h-[160px]" />
                          </TextField>

                          {draftExerciseType === "MC" ? (
                            <div className="grid gap-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-slate-700">{isZh ? "选项" : "Options"}</span>
                                <span className="text-xs text-default-400">{isZh ? "单选正确答案" : "Single correct option"}</span>
                              </div>
                              {draftExerciseOptions.map((option, index) => (
                                <Card key={option.label} className="flex flex-row items-center gap-3 rounded-2xl px-3 py-2.5 shadow-none">
                                  <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                                    <input
                                      type="radio"
                                      checked={option.isCorrect}
                                      onChange={() => {
                                        setDraftCorrectAnswer(option.label);
                                        updateDraftOption(index, { isCorrect: true });
                                      }}
                                      name="exercise-correct-answer"
                                    />
                                    <span className="font-medium text-slate-700">{option.label}</span>
                                  </label>
                                  <TextField
                                    aria-label={`Option ${option.label}`}
                                    value={option.text}
                                    onChange={(value) => updateDraftOption(index, { text: value })}
                                    className="flex-1"
                                  >
                                    <Input
                                      placeholder={isZh ? `输入 ${option.label} 选项` : `Option ${option.label}`}
                                      className="bg-transparent"
                                    />
                                  </TextField>
                                </Card>
                              ))}
                            </div>
                          ) : null}

                          <div className="grid gap-4 md:grid-cols-2">
                            <TextField
                              value={draftCorrectAnswer}
                              onChange={(value) => setDraftCorrectAnswer(value)}
                            >
                              <span className="mb-2 block text-sm font-medium text-slate-700">{isZh ? "正确答案" : "Correct answer"}</span>
                              <Input />
                            </TextField>
                            <TextField
                              value={draftCommonMistakesText}
                              onChange={(value) => setDraftCommonMistakesText(value)}
                            >
                              <span className="mb-2 block text-sm font-medium text-slate-700">{isZh ? "常见误区" : "Common mistakes"}</span>
                              <TextArea
                                placeholder={isZh ? "每行一条" : "One per line"}
                                className="min-h-[104px]"
                              />
                            </TextField>
                          </div>

                          <TextField
                            value={draftSolutionSteps}
                            onChange={(value) => setDraftSolutionSteps(value)}
                          >
                            <span className="mb-2 block text-sm font-medium text-slate-700">{isZh ? "解析" : "Explanation"}</span>
                            <TextArea className="min-h-[160px]" />
                          </TextField>

                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="primary"
                              onPress={saveExerciseContent}
                              isDisabled={isMutating}
                              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isMutating ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
                              {isZh ? "保存题目内容" : "Save question"}
                            </Button>
                          </div>
                        </div>
                      </Card>

                      <Card className="rounded-2xl p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-900">
                              {isZh ? "AI 分类治理" : "AI taxonomy"}
                            </h3>
                            <p className="mt-1 text-xs text-default-500">
                              {isZh ? "允许老师直接创建、修正、确认或合并大类/小类。" : "Teachers can create, edit, confirm, or merge cluster and subskill labels."}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Chip size="sm" className="bg-slate-50">
                              {formatMatchMode(exerciseDetail.subskillMatchMode, isZh)}
                            </Chip>
                            {exerciseDetail.subskillConfidence !== null && exerciseDetail.subskillConfidence !== undefined ? (
                              <Chip size="sm" className="bg-slate-50">
                                {isZh ? `置信度 ${Math.round(exerciseDetail.subskillConfidence * 100)}%` : `Confidence ${Math.round(exerciseDetail.subskillConfidence * 100)}%`}
                              </Chip>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <TextField
                              value={draftClusterLabel}
                              onChange={(value) => setDraftClusterLabel(value)}
                            >
                              <span className="mb-2 block text-sm font-medium text-slate-700">
                                {isZh ? "大类名称" : "Cluster label"}
                                <Chip size="sm" className="ml-2 bg-slate-50 text-[11px]">
                                  {formatTaxonomyStatus(currentClusterNode?.status, isZh)}
                                </Chip>
                              </span>
                              <Input
                                placeholder={isZh ? "例如：函数与导数、力学、修辞分析" : "e.g. Functions, Mechanics, Rhetoric"}
                              />
                            </TextField>

                            <TextField
                              value={draftSubskillLabel}
                              onChange={(value) => setDraftSubskillLabel(value)}
                            >
                              <span className="mb-2 block text-sm font-medium text-slate-700">
                                {isZh ? "小类名称" : "Subskill label"}
                                <Chip size="sm" className="ml-2 bg-slate-50 text-[11px]">
                                  {formatTaxonomyStatus(currentSubskillNode?.status, isZh)}
                                </Chip>
                              </span>
                              <Input
                                placeholder={isZh ? "例如：导数求极值、牛顿第二定律、论点反驳" : "e.g. Critical points, Newton's second law"}
                              />
                            </TextField>
                          </div>

                          {exerciseDetail.subskillReasons && exerciseDetail.subskillReasons.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {exerciseDetail.subskillReasons.map((reason, index) => (
                                <Chip key={`${reason}-${index}`} size="sm" className="bg-slate-50">
                                  {reason}
                                </Chip>
                              ))}
                            </div>
                          ) : null}

                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="primary"
                              onPress={saveExerciseTaxonomy}
                              isDisabled={isMutating}
                              className="inline-flex items-center gap-2 rounded-2xl bg-foreground px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#484540] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isMutating ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
                              {isZh ? "保存分类" : "Save taxonomy"}
                            </Button>
                            <Button
                              variant="ghost"
                              onPress={reclassifyExerciseWithAi}
                              isDisabled={isMutating}
                              className="inline-flex items-center gap-2 rounded-2xl border border-divider bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <CheckSquare2 className="h-4 w-4" />
                              {isZh ? "AI 重新分类" : "AI reclassify"}
                            </Button>
                            {exerciseDetail.classificationUpdatedByTeacher ? (
                              <Chip size="sm" className="bg-amber-50 text-amber-700">
                                {isZh ? "当前分类由老师确认" : "Teacher-confirmed taxonomy"}
                              </Chip>
                            ) : null}
                          </div>

                          {currentClusterNode ? (
                            <Card className="rounded-2xl bg-slate-50/70 p-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-slate-700">
                                  {isZh ? `大类节点：${currentClusterNode.canonicalLabel}` : `Cluster node: ${currentClusterNode.canonicalLabel}`}
                                </span>
                                <Chip size="sm" className="bg-white">
                                  {formatTaxonomyStatus(currentClusterNode.status, isZh)}
                                </Chip>
                                <Chip size="sm" className="bg-white">
                                  {isZh ? `${currentClusterNode.linkedCount} 道题` : `${currentClusterNode.linkedCount} linked`}
                                </Chip>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onPress={() => updateTaxonomyNode(currentClusterNode.id, { action: "activate" }, isZh ? "已确认大类节点" : "Cluster activated")}
                                  isDisabled={isMutating || currentClusterNode.status === "active"}
                                >
                                  {isZh ? "转为正式" : "Activate"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onPress={() => updateTaxonomyNode(currentClusterNode.id, { action: "rename", label: draftClusterLabel }, isZh ? "已重命名大类节点" : "Cluster renamed")}
                                  isDisabled={isMutating || !draftClusterLabel.trim()}
                                >
                                  {isZh ? "重命名节点" : "Rename node"}
                                </Button>
                                {currentClusterNode.status === "candidate" ? (
                                  <Button
                                    size="sm"
                                    variant="danger-soft"
                                    onPress={() => updateTaxonomyNode(currentClusterNode.id, { action: "reject" }, isZh ? "已驳回大类候选" : "Cluster rejected")}
                                    isDisabled={isMutating}
                                  >
                                    {isZh ? "驳回候选" : "Reject"}
                                  </Button>
                                ) : null}
                              </div>
                              {clusterMergeTargets.length > 0 ? (
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <Select
                                    aria-label={isZh ? "合并大类目标" : "Cluster merge target"}
                                    value={draftClusterMergeTargetId}
                                    onChange={(value) => setDraftClusterMergeTargetId(String(value ?? ""))}
                                    className="w-48"
                                  >
                                    <Select.Trigger>
                                      <Select.Value />
                                      <Select.Indicator />
                                    </Select.Trigger>
                                    <Select.Popover>
                                      <ListBox>
                                        {clusterMergeTargets.map((node) => (
                                          <ListBox.Item key={node.id} id={node.id} textValue={node.canonicalLabel}>
                                            {node.canonicalLabel}
                                          </ListBox.Item>
                                        ))}
                                      </ListBox>
                                    </Select.Popover>
                                  </Select>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onPress={() => updateTaxonomyNode(currentClusterNode.id, { action: "merge", targetNodeId: draftClusterMergeTargetId }, isZh ? "已合并大类节点" : "Cluster merged")}
                                    isDisabled={isMutating || !draftClusterMergeTargetId}
                                  >
                                    {isZh ? "执行合并" : "Merge"}
                                  </Button>
                                </div>
                              ) : null}
                            </Card>
                          ) : null}

                          {currentSubskillNode ? (
                            <Card className="rounded-2xl bg-slate-50/70 p-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-slate-700">
                                  {isZh ? `小类节点：${currentSubskillNode.canonicalLabel}` : `Subskill node: ${currentSubskillNode.canonicalLabel}`}
                                </span>
                                <Chip size="sm" className="bg-white">
                                  {formatTaxonomyStatus(currentSubskillNode.status, isZh)}
                                </Chip>
                                <Chip size="sm" className="bg-white">
                                  {isZh ? `${currentSubskillNode.linkedCount} 道题` : `${currentSubskillNode.linkedCount} linked`}
                                </Chip>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onPress={() => updateTaxonomyNode(currentSubskillNode.id, { action: "activate" }, isZh ? "已确认小类节点" : "Subskill activated")}
                                  isDisabled={isMutating || currentSubskillNode.status === "active"}
                                >
                                  {isZh ? "转为正式" : "Activate"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onPress={() => updateTaxonomyNode(currentSubskillNode.id, { action: "rename", label: draftSubskillLabel }, isZh ? "已重命名小类节点" : "Subskill renamed")}
                                  isDisabled={isMutating || !draftSubskillLabel.trim()}
                                >
                                  {isZh ? "重命名节点" : "Rename node"}
                                </Button>
                                {currentSubskillNode.status === "candidate" ? (
                                  <Button
                                    size="sm"
                                    variant="danger-soft"
                                    onPress={() => updateTaxonomyNode(currentSubskillNode.id, { action: "reject" }, isZh ? "已驳回小类候选" : "Subskill rejected")}
                                    isDisabled={isMutating}
                                  >
                                    {isZh ? "驳回候选" : "Reject"}
                                  </Button>
                                ) : null}
                              </div>
                              {subskillMergeTargets.length > 0 ? (
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <Select
                                    aria-label={isZh ? "合并小类目标" : "Subskill merge target"}
                                    value={draftSubskillMergeTargetId}
                                    onChange={(value) => setDraftSubskillMergeTargetId(String(value ?? ""))}
                                    className="w-48"
                                  >
                                    <Select.Trigger>
                                      <Select.Value />
                                      <Select.Indicator />
                                    </Select.Trigger>
                                    <Select.Popover>
                                      <ListBox>
                                        {subskillMergeTargets.map((node) => (
                                          <ListBox.Item key={node.id} id={node.id} textValue={node.canonicalLabel}>
                                            {node.canonicalLabel}
                                          </ListBox.Item>
                                        ))}
                                      </ListBox>
                                    </Select.Popover>
                                  </Select>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onPress={() => updateTaxonomyNode(currentSubskillNode.id, { action: "merge", targetNodeId: draftSubskillMergeTargetId }, isZh ? "已合并小类节点" : "Subskill merged")}
                                    isDisabled={isMutating || !draftSubskillMergeTargetId}
                                  >
                                    {isZh ? "执行合并" : "Merge"}
                                  </Button>
                                </div>
                              ) : null}
                            </Card>
                          ) : null}
                        </div>
                      </Card>
                    </>
                  ) : null}

                  {detailSnapshotView}
                </div>
              ) : null}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
