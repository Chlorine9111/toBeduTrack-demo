"use client";

import dynamic from "next/dynamic";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ChevronRight, FileDown, Save, Sparkles, X } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api/client";
import type { WorksheetProjectPayload } from "@/lib/question-bank/worksheet-project-types";
import type { TikuSearchResultRow, TikuSearchResponse } from "@/lib/tiku/types";
import type {
  WorksheetMaterialDetail,
  WorksheetMaterialExercise,
  WorksheetMaterialListResponse,
  WorksheetEditorDraft,
  WorksheetEditorQuestion,
  WorksheetEditorSection,
  WorksheetQuestionBankItem,
  WorksheetSearchFilters,
  WorksheetSidebarTab,
} from "@/components/main/question-bank/worksheet-editor/types";
import {
  buildSectionTitle,
  buildAiRelatedInstruction,
  buildWorksheetPdfHtml,
  buildWorksheetStats,
  buildWorksheetWordHtml,
  createBlankBlock,
  createEmptySearchFilters,
  createEmptyWorksheetDraft,
  createWorksheetQuestionFromItem,
  downloadBlob,
  ensureSectionForQuestionType,
  mergeBasketIntoDraft,
  nextWorksheetSectionId,
  parseAiAssembleRequests,
  resequenceQuestions,
  sanitizeText,
  slugifyFilename,
  sortQuestionsForCanvas,
  sortSections,
} from "@/components/main/question-bank/worksheet-editor/utils";
import { requestDocumentPdfBlob } from "@/lib/doc-engine/client-pdf-export";
import { DEFAULT_DOCUMENT_LAYOUT } from "@/lib/doc-engine/block-types";
import {
  WORKSHEET_BUILDER_NAVIGATION_GUARD_EVENT,
  type WorksheetBuilderNavigationRequestDetail,
} from "@/lib/question-bank/builder-navigation-guard";
import {
  QUESTION_BASKET_UPDATED_EVENT,
  readQuestionBasket,
} from "@/lib/question-bank/basket";
import { DragDropProvider, DragOverlay } from "@dnd-kit/react";
import type { Draggable } from "@dnd-kit/dom";
import { cn } from "@/lib/utils";

function BuilderSidebarLoading() {
  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-[24px] border border-[rgba(55,53,47,0.08)] bg-[#fbfbf8] p-4">
      <div className="flex w-full flex-col gap-3">
        <div className="h-10 rounded-xl bg-[#f0efe8]" />
        <div className="h-24 rounded-2xl bg-[#f7f6f0]" />
        <div className="h-24 rounded-2xl bg-[#f7f6f0]" />
        <div className="h-24 rounded-2xl bg-[#f7f6f0]" />
      </div>
    </div>
  );
}

function BuilderHeaderLoading() {
  return (
    <div className="space-y-3 border-b border-[rgba(55,53,47,0.08)] px-6 py-5">
      <div className="h-8 w-1/3 rounded-xl bg-[#f2f1eb]" />
      <div className="h-5 w-2/3 rounded-lg bg-[#f7f6f0]" />
    </div>
  );
}

function BuilderEditorLoading() {
  return (
    <div className="min-h-0 flex-1 overflow-hidden bg-[#f7f6f3] px-4 py-5 md:px-6 xl:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <div className="h-40 rounded-[28px] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.04)]" />
        <div className="h-40 rounded-[28px] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.04)]" />
      </div>
    </div>
  );
}

const ModuleTour = dynamic(
  () => import("@/components/product-tour").then((mod) => mod.ModuleTour),
  { loading: () => null },
);

const QuestionBankSearchSidebar = dynamic(
  () => import("@/components/main/question-bank/worksheet-editor/QuestionBankSearchSidebar"),
  { loading: () => <BuilderSidebarLoading /> },
);

const WorksheetHeader = dynamic(
  () => import("@/components/main/question-bank/worksheet-editor/WorksheetHeader"),
  { loading: () => <BuilderHeaderLoading /> },
);

const PaginatedEditor = dynamic(
  () => import("@/components/main/question-bank/worksheet-editor/PaginatedEditor"),
  { loading: () => <BuilderEditorLoading /> },
);

const AiAssemblePanel = dynamic(
  () => import("@/components/main/question-bank/worksheet-editor/AiAssemblePanel"),
  {
    loading: () => (
      <div className="flex min-h-[200px] items-center justify-center px-4 py-8 text-sm text-[#6B6F76]">
        正在加载 AI 组卷助手...
      </div>
    ),
  },
);

const TIKU_SEARCH_DEBOUNCE_MS = 300;
const QUESTION_BANK_BUILDER_SIDEBAR_WIDTH_KEY = "question-bank:builder-sidebar-width";
const QUESTION_BANK_BUILDER_SIDEBAR_COLLAPSED_KEY = "question-bank:builder-sidebar-collapsed";
const QUESTION_BANK_BUILDER_SIDEBAR_MIN = 420;
const QUESTION_BANK_BUILDER_SIDEBAR_DEFAULT = 420;
const QUESTION_BANK_BUILDER_SIDEBAR_MAX_RATIO = 0.5;
const QUESTION_BANK_BUILDER_SIDEBAR_COLLAPSE_THRESHOLD = 240;
const QUESTION_BANK_BUILDER_PENDING_SAVE_KEY_PREFIX = "question-bank:builder-pending-save:";
const CHINESE_NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

/** 从数组中随机抽取 n 个元素（Fisher-Yates 洗牌） */
function shuffleSample<T>(array: T[], n: number): T[] {
  const pool = [...array];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

function resolveQuestionBankBuilderSidebarMax(viewportWidth: number) {
  return Math.max(
    QUESTION_BANK_BUILDER_SIDEBAR_MIN,
    Math.floor(viewportWidth * QUESTION_BANK_BUILDER_SIDEBAR_MAX_RATIO),
  );
}

function clampQuestionBankBuilderSidebarWidth(width: number, viewportWidth: number) {
  return Math.min(
    resolveQuestionBankBuilderSidebarMax(viewportWidth),
    Math.max(QUESTION_BANK_BUILDER_SIDEBAR_MIN, width),
  );
}

function formatTimestamp(date = new Date(), isZh = true) {
  return date.toLocaleString(isZh ? "zh-CN" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDefaultDraftTitle(isZh: boolean) {
  return isZh ? "组卷稿" : "Worksheet draft";
}

function getFallbackSectionTitle(isZh: boolean) {
  return isZh ? "未分组" : "Ungrouped";
}

function getNewSectionTitle(index: number, isZh: boolean) {
  const numeral = CHINESE_NUMERALS[index] ?? `${index + 1}`;
  return isZh ? `${numeral}、新分组` : `Part ${index + 1}. New Section`;
}

function localizeSystemSectionTitle(title: string, isZh: boolean) {
  const normalized = sanitizeText(title);
  if (!normalized) return title;

  if (normalized === "未分组" || normalized === "Ungrouped") {
    return getFallbackSectionTitle(isZh);
  }

  const chineseMatch = normalized.match(
    /^([一二三四五六七八九十]+)、(选择题|解答题|填空题|新分组)$/,
  );
  if (chineseMatch) {
    const index = CHINESE_NUMERALS.indexOf(chineseMatch[1]);
    if (index < 0) return title;
    if (chineseMatch[2] === "新分组") {
      return getNewSectionTitle(index, isZh);
    }
    const type =
      chineseMatch[2] === "选择题"
        ? "MC"
        : chineseMatch[2] === "填空题"
          ? "fill_in"
          : "FR";
    return buildSectionTitle(index, type, isZh);
  }

  const englishMatch = normalized.match(
    /^Part\s+(\d+)\.\s+(Multiple Choice|Free Response|Fill in the Blank|New Section)$/i,
  );
  if (englishMatch) {
    const index = Math.max(0, Number(englishMatch[1]) - 1);
    const label = englishMatch[2].toLowerCase();
    if (label === "new section") {
      return getNewSectionTitle(index, isZh);
    }
    const type =
      label === "multiple choice"
        ? "MC"
        : label === "fill in the blank"
          ? "fill_in"
          : "FR";
    return buildSectionTitle(index, type, isZh);
  }

  return title;
}

function localizeBuilderDraft(
  draft: WorksheetEditorDraft,
  isZh: boolean,
): WorksheetEditorDraft {
  const nextTitle = (() => {
    const normalized = sanitizeText(draft.title);
    if (normalized === "组卷稿" || normalized === "Worksheet draft") {
      return getDefaultDraftTitle(isZh);
    }
    return draft.title;
  })();

  const nextSections = draft.sections.map((section) => ({
    ...section,
    title: localizeSystemSectionTitle(section.title, isZh),
  }));

  const changed =
    nextTitle !== draft.title ||
    nextSections.some((section, index) => section.title !== draft.sections[index]?.title);

  if (!changed) {
    return draft;
  }

  return {
    ...draft,
    title: nextTitle,
    sections: nextSections,
  };
}

function normalizeBuilderDraft(draft: WorksheetEditorDraft) {
  const sections = sortSections(draft.sections).map((section, index) => ({
    ...section,
    order: index,
  }));
  return {
    ...draft,
    sections,
    questions: resequenceQuestions(draft.questions, sections),
  };
}

function createFreshBuilderDraft(isZh = true) {
  return normalizeBuilderDraft(
    mergeBasketIntoDraft(createEmptyWorksheetDraft(isZh), readQuestionBasket()),
  );
}

function computeDraftSignature(draft: WorksheetEditorDraft) {
  return JSON.stringify(draft);
}

type WorksheetProjectPendingSaveMarker = {
  projectId: string;
  previousStableVersionNumber: number;
  startedAt: string;
};

function buildPendingSaveStorageKey(projectId: string) {
  return `${QUESTION_BANK_BUILDER_PENDING_SAVE_KEY_PREFIX}${projectId}`;
}

function readPendingSaveMarker(projectId: string): WorksheetProjectPendingSaveMarker | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(buildPendingSaveStorageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorksheetProjectPendingSaveMarker;
    if (
      typeof parsed?.projectId === "string" &&
      parsed.projectId === projectId &&
      Number.isFinite(parsed.previousStableVersionNumber)
    ) {
      return {
        projectId,
        previousStableVersionNumber: Math.max(
          1,
          Math.round(parsed.previousStableVersionNumber),
        ),
        startedAt:
          typeof parsed.startedAt === "string"
            ? parsed.startedAt
            : new Date().toISOString(),
      };
    }
  } catch {
    return null;
  }
  return null;
}

function writePendingSaveMarker(marker: WorksheetProjectPendingSaveMarker) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      buildPendingSaveStorageKey(marker.projectId),
      JSON.stringify(marker),
    );
  } catch {
    // ignore storage errors
  }
}

function clearPendingSaveMarker(projectId: string | null | undefined) {
  if (typeof window === "undefined") return;
  const normalized = `${projectId ?? ""}`.trim();
  if (!normalized) return;
  try {
    window.localStorage.removeItem(buildPendingSaveStorageKey(normalized));
  } catch {
    // ignore storage errors
  }
}

async function extractResponseError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof payload?.message === "string" && payload.message.trim()) {
      return payload.message;
    }
    if (typeof payload?.error === "string" && payload.error.trim()) {
      return payload.error;
    }
    if (
      payload?.error &&
      typeof payload.error === "object" &&
      typeof payload.error.message === "string" &&
      payload.error.message.trim()
    ) {
      return payload.error.message;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

type PendingNavigation = { kind: "href"; href: string };

function createQuestionBankItemFromTikuResult(
  row: TikuSearchResultRow,
): WorksheetQuestionBankItem {
  // 将 tiku choices { A: { text, misconception } } 转为 foundation options [{ label, text, isCorrect }]
  const choiceEntries = Object.entries(row.choices ?? {}).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  const options = choiceEntries.map(([label, choice]) => ({
    label,
    text: choice.text,
    isCorrect: label === row.correct_answer,
    ...(choice.image_url ? { imageUrl: choice.image_url } : {}),
  }));

  // 难度映射：easy=1, medium=2, hard=3
  const difficultyMap: Record<string, number> = { easy: 1, medium: 2, hard: 3 };
  const difficulty = difficultyMap[row.difficulty] ?? 2;

  return {
    id: row.id,
    questionText: row.stem,
    exerciseType: "MC",
    difficulty,
    options: options.length > 0 ? options : null,
    correctAnswer: row.correct_answer ?? null,
    solutionSteps: row.explanation ?? null,
    stage: null,
    subject: row.course ?? null,
    gradeLevel: null,
    textbookVersion: null,
    knowledgePoints: row.key_concepts ?? [],
    sourceKind: "global_ap",
    isAiGenerated: false,
    createdAt: null,
    tags: [row.topic_code ?? "", `Unit ${row.unit}`].filter(Boolean),
    course: row.course ?? null,
    unit: row.unit ?? null,
    cognitive_task: row.cognitive_task ?? null,
    stimulusImageUrl: (() => {
      if (row.stimulus_image_url) return row.stimulus_image_url;
      const raw = (row as unknown as { stimulus?: unknown }).stimulus;
      if (!raw) return null;
      const resolved = Array.isArray(raw) ? raw[0] : raw;
      return (resolved as { image_url?: string | null })?.image_url ?? null;
    })(),
  };
}

function createQuestionBankItemFromMaterialExercise(
  exercise: WorksheetMaterialExercise,
): WorksheetQuestionBankItem {
  return {
    id: exercise.id,
    questionText: exercise.questionText,
    exerciseType: exercise.exerciseType,
    difficulty: exercise.difficulty,
    options: exercise.options ?? null,
    correctAnswer: exercise.correctAnswer ?? null,
    solutionSteps: exercise.solutionSteps ?? null,
    stage: exercise.stage ?? null,
    subject: exercise.subject ?? null,
    gradeLevel: exercise.gradeLevel ?? null,
    textbookVersion: exercise.textbookVersion ?? null,
    knowledgePoints: exercise.knowledgePoints ?? [],
    sourceKind: "pdf_scan",
    isAiGenerated: false,
    createdAt: exercise.createdAt ?? null,
    tags: exercise.tags ?? [],
  };
}

// Partner exercises 表行数据类型（从 API 返回的 snake_case 字段）
type PartnerExerciseRow = {
  id: string;
  teacher_id: string;
  exercise_type: string;
  difficulty: number;
  question_text: string;
  options: Array<{ label: string; text: string; isCorrect?: boolean }> | null;
  correct_answer: string | null;
  solution_steps: string | null;
  common_mistakes: string[] | null;
  tags: string[] | null;
  stage: string | null;
  subject: string | null;
  grade_level: string | null;
  textbook_version: string | null;
  knowledge_points: string[] | null;
  knowledge_cluster: string | null;
  source_kind: string | null;
  source_file_name: string | null;
  review_flag: string | null;
  is_ai_generated: boolean;
  created_at: string;
};

function createQuestionBankItemFromPartnerExercise(
  row: PartnerExerciseRow,
): WorksheetQuestionBankItem {
  return {
    id: row.id,
    questionText: row.question_text,
    exerciseType: (row.exercise_type ?? "FR") as WorksheetQuestionBankItem["exerciseType"],
    difficulty: row.difficulty ?? 2,
    options: row.options ?? null,
    correctAnswer: row.correct_answer ?? null,
    solutionSteps: row.solution_steps ?? null,
    stage: row.stage ?? null,
    subject: row.subject ?? null,
    gradeLevel: row.grade_level ?? null,
    textbookVersion: row.textbook_version ?? null,
    knowledgePoints: row.knowledge_points ?? [],
    sourceKind: row.source_kind ?? "pdf_scan",
    isAiGenerated: row.is_ai_generated ?? false,
    createdAt: row.created_at ?? null,
    tags: row.tags ?? [],
  };
}

export default function QuestionBankBuilderPage({
  initialProjectId = null,
}: {
  initialProjectId?: string | null;
}) {
  const { isZh } = useAppI18n();
  const router = useRouter();
  const isZhRef = useRef(isZh);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const initialLocaleIsZhRef = useRef(isZh);
  const leaveFallbackHrefRef = useRef("/main/question-bank");
  const sidebarPaneRef = useRef<HTMLDivElement | null>(null);
  const sidebarResizeGuideRef = useRef<HTMLDivElement | null>(null);
  const resizeStateRef = useRef({
    startX: 0,
    startWidth: QUESTION_BANK_BUILDER_SIDEBAR_DEFAULT,
  });
  const lastExpandedSidebarWidthRef = useRef(QUESTION_BANK_BUILDER_SIDEBAR_DEFAULT);
  const liveSidebarWidthRef = useRef(QUESTION_BANK_BUILDER_SIDEBAR_DEFAULT);
  const sidebarPreviewWidthRef = useRef(QUESTION_BANK_BUILDER_SIDEBAR_DEFAULT);
  const sidebarPreviewCollapsedRef = useRef(false);
  const isSidebarCollapsedRef = useRef(false);
  const resizeGuideFrameRef = useRef<number | null>(null);

  const [draft, setDraft] = useState<WorksheetEditorDraft>(() =>
    createEmptyWorksheetDraft(isZh),
  );
  const [filters, setFilters] = useState<WorksheetSearchFilters>(createEmptySearchFilters());
  const deferredQuery = useDeferredValue(filters.query);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarTab, setSidebarTab] = useState<WorksheetSidebarTab>("search");
  const [materialQuery, setMaterialQuery] = useState("");
  const deferredMaterialQuery = useDeferredValue(materialQuery);
  const [materialCourse, setMaterialCourse] = useState("");
  const [materialUnit, setMaterialUnit] = useState("");

  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<WorksheetQuestionBankItem[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(true);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const SEARCH_PAGE_SIZE = 30;
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchErrorText, setSearchErrorText] = useState("");
  const [materials, setMaterials] = useState<WorksheetMaterialListResponse["items"]>([]);
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materialErrorText, setMaterialErrorText] = useState("");
  const [materialSourceScope, setMaterialSourceScope] = useState<"all" | "global" | "personal">("all");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [materialDetail, setMaterialDetail] = useState<WorksheetMaterialDetail | null>(null);
  const [materialDetailLoading, setMaterialDetailLoading] = useState(false);
  const [materialDetailErrorText, setMaterialDetailErrorText] = useState("");

  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");
  /** 当前正在拖拽的搜索结果题目（用于 DragOverlay 展示） */
  const [draggedItem, setDraggedItem] = useState<WorksheetQuestionBankItem | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [projectId, setProjectId] = useState(initialProjectId?.trim() || "");
  const [stableVersionNumber, setStableVersionNumber] = useState(0);
  const [initializingDraft, setInitializingDraft] = useState(true);
  const [lastSavedSignature, setLastSavedSignature] = useState("");
  const [showLeavePrompt, setShowLeavePrompt] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportMode, setExportMode] = useState<"teacher" | "student">("teacher");
  const [draggingQuestionId, setDraggingQuestionId] = useState<string | null>(null);
  const [draftPageCount, setDraftPageCount] = useState(1);

  const [assemblePrompt, setAssemblePrompt] = useState("");
  const [assembleLoading, setAssembleLoading] = useState(false);
  const [assembleStatusText, setAssembleStatusText] = useState("");
  const [assembleErrorText, setAssembleErrorText] = useState("");
  const [assembleResults, setAssembleResults] = useState<WorksheetQuestionBankItem[]>([]);
  const [assembleSelectedIds, setAssembleSelectedIds] = useState<Set<string>>(new Set());

  const [relatedQuery, setRelatedQuery] = useState("");
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedStatusText, setRelatedStatusText] = useState("");
  const [relatedErrorText, setRelatedErrorText] = useState("");
  const [relatedResults, setRelatedResults] = useState<WorksheetQuestionBankItem[]>([]);

  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiPanelWidth, setAiPanelWidth] = useState(360);
  const aiPanelResizeRef = useRef({ startX: 0, startWidth: 360 });
  const [sidebarWidth, setSidebarWidth] = useState(QUESTION_BANK_BUILDER_SIDEBAR_DEFAULT);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // 侧边栏始终展开，不允许收缩
  useEffect(() => {
    if (isSidebarCollapsed) setIsSidebarCollapsed(false);
  }, [isSidebarCollapsed]);
  useEffect(() => {
    isZhRef.current = isZh;
  }, [isZh]);
  useEffect(() => {
    setDraft((current) => localizeBuilderDraft(current, isZh));
  }, [isZh]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const rawReferrer = document.referrer?.trim();
    if (!rawReferrer) return;

    try {
      const referrerUrl = new URL(rawReferrer, window.location.href);
      if (referrerUrl.origin !== window.location.origin) return;
      const nextHref = `${referrerUrl.pathname}${referrerUrl.search}${referrerUrl.hash}`;
      if (!nextHref || nextHref.startsWith("/main/question-bank/builder")) return;
      leaveFallbackHrefRef.current = nextHref;
    } catch {
      return;
    }
  }, []);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [importTargetSectionId, setImportTargetSectionId] = useState("auto");


  const sortedSections = useMemo(() => sortSections(draft.sections), [draft.sections]);
  const sortedQuestions = useMemo(
    () => sortQuestionsForCanvas(draft.questions, draft.sections),
    [draft.questions, draft.sections],
  );
  const activeQuestion = useMemo(
    () => draft.questions.find((question) => question.id === activeQuestionId) ?? null,
    [activeQuestionId, draft.questions],
  );
  const importedExerciseIds = useMemo(
    () => new Set(draft.questions.map((question) => question.exerciseId)),
    [draft.questions],
  );
  const stats = useMemo(() => buildWorksheetStats(draft.questions), [draft.questions]);
  const draftSignature = useMemo(() => computeDraftSignature(draft), [draft]);
  const isDirty = !initializingDraft && draftSignature !== lastSavedSignature;
  const queuePendingNavigation = useCallback((next: PendingNavigation) => {
    setPendingNavigation(next);
    setShowLeavePrompt(true);
  }, []);
  const dismissLeavePrompt = useCallback(() => {
    setShowLeavePrompt(false);
    setPendingNavigation(null);
  }, []);
  const materialScopeLabel = useMemo(() => {
    if (!selectedMaterialId) return "";
    // materialDetail 可能有 sourceAssessment
    if (materialDetail?.material?.sourceAssessment) {
      return materialDetail.material.sourceAssessment;
    }
    // 从 selectedMaterialId（格式 "COURSE|Source Assessment Name"）提取
    const parts = selectedMaterialId.split("|");
    if (parts.length >= 2) return parts[1];
    // fallback
    return materialDetail?.material?.label ?? selectedMaterialId;
  }, [materialDetail, selectedMaterialId]);
  const scopedMaterialResults = useMemo(
    () =>
      (materialDetail?.questions ?? materialDetail?.exercises ?? []).map((row) =>
        "stem" in row && typeof row.stem === "string"
          ? createQuestionBankItemFromTikuResult(row as TikuSearchResultRow)
          : createQuestionBankItemFromMaterialExercise(row as WorksheetMaterialExercise),
      ),
    [materialDetail],
  );
  const effectiveSearchResults = useMemo(() => {
    if (!selectedMaterialId) {
      return searchResults;
    }

    const normalizedQuery = filters.query.trim().toLowerCase();

    return scopedMaterialResults.filter((item) => {
      if (filters.course && item.course !== filters.course) return false;
      if (filters.unit && item.unit != null && String(item.unit) !== filters.unit) return false;
      if (filters.exerciseType !== "all" && item.exerciseType !== filters.exerciseType) return false;
      if (!normalizedQuery) return true;

      const haystack = [
        item.questionText,
        item.course ?? "",
        ...(item.knowledgePoints ?? []),
        ...(item.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [filters, scopedMaterialResults, searchResults, selectedMaterialId]);
  const effectiveSearchLoading = selectedMaterialId ? materialDetailLoading : searchLoading;
  const effectiveSearchErrorText = selectedMaterialId ? materialDetailErrorText : searchErrorText;

  function applySidebarWidth(width: number) {
    sidebarPaneRef.current?.style.setProperty(
      "--question-bank-builder-sidebar-width",
      `${width}px`,
    );
  }

  function applySidebarResizeGuide(width: number) {
    if (!sidebarResizeGuideRef.current) return;
    sidebarResizeGuideRef.current.style.left = `${Math.max(0, width)}px`;
  }

  function flushResizeGuideFrame() {
    if (resizeGuideFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeGuideFrameRef.current);
      resizeGuideFrameRef.current = null;
    }
  }

  function scheduleSidebarResizeGuide(width: number) {
    sidebarPreviewWidthRef.current = width;
    if (resizeGuideFrameRef.current !== null) {
      return;
    }
    resizeGuideFrameRef.current = window.requestAnimationFrame(() => {
      resizeGuideFrameRef.current = null;
      applySidebarResizeGuide(sidebarPreviewWidthRef.current);
    });
  }

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(QUESTION_BANK_BUILDER_SIDEBAR_WIDTH_KEY);
      const parsed = Number(raw);
      const nextWidth = Number.isFinite(parsed)
        ? clampQuestionBankBuilderSidebarWidth(parsed, window.innerWidth)
        : QUESTION_BANK_BUILDER_SIDEBAR_DEFAULT;
      lastExpandedSidebarWidthRef.current = nextWidth;
      liveSidebarWidthRef.current = nextWidth;
      sidebarPreviewWidthRef.current = nextWidth;
      setSidebarWidth(nextWidth);
      const nextCollapsed =
        window.localStorage.getItem(QUESTION_BANK_BUILDER_SIDEBAR_COLLAPSED_KEY) === "true";
      isSidebarCollapsedRef.current = nextCollapsed;
      setIsSidebarCollapsed(nextCollapsed);
    } catch {
      // ignore invalid persisted width
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setSidebarWidth((current) => {
        const baseWidth = liveSidebarWidthRef.current || current;
        const nextWidth = clampQuestionBankBuilderSidebarWidth(baseWidth, window.innerWidth);
        lastExpandedSidebarWidthRef.current = nextWidth;
        liveSidebarWidthRef.current = nextWidth;
        sidebarPreviewWidthRef.current = nextWidth;
        applySidebarWidth(nextWidth);
        applySidebarResizeGuide(nextWidth);
        return nextWidth;
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      setInitializingDraft(true);
      setStatusText("");
      setErrorText("");

      if (initialProjectId?.trim()) {
        try {
          let payload = await apiGet<WorksheetProjectPayload>(
            `/api/question-bank/builder/projects/${encodeURIComponent(initialProjectId)}`,
          );
          let recoveredFromInterruptedSave = false;
          let recoveryErrorText = "";
          const pendingSaveMarker = readPendingSaveMarker(payload.projectId);
          if (pendingSaveMarker) {
            try {
              if (
                payload.stableVersionNumber >
                pendingSaveMarker.previousStableVersionNumber
              ) {
                try {
                  payload = await apiPost<WorksheetProjectPayload>(
                    `/api/question-bank/builder/projects/${encodeURIComponent(payload.projectId)}/restore`,
                    {
                      targetVersionNumber:
                        pendingSaveMarker.previousStableVersionNumber,
                    },
                  );
                  recoveredFromInterruptedSave = true;
                } catch (recoveryError) {
                  recoveryErrorText =
                    recoveryError instanceof Error
                      ? recoveryError.message
                      : initialLocaleIsZhRef.current
                        ? "检测到保存中断，但恢复上一个稳定版本失败。"
                        : "An interrupted save was detected, but restoring the previous stable version failed.";
                }
              }
            } finally {
              clearPendingSaveMarker(payload.projectId);
            }
          }
          if (cancelled) return;
          const nextDraft = localizeBuilderDraft(
            normalizeBuilderDraft(payload.draft),
            initialLocaleIsZhRef.current,
          );
          const signature = computeDraftSignature(nextDraft);
          setDraft(nextDraft);
          setProjectId(payload.projectId);
          setStableVersionNumber(payload.stableVersionNumber);
          setLastSavedSignature(signature);
          setActiveQuestionId(nextDraft.questions[0]?.id ?? null);
          setExpandedQuestionId(null);
          setStatusText(
            recoveredFromInterruptedSave
              ? initialLocaleIsZhRef.current
                ? "检测到上次保存中断，已恢复到上一个稳定版本。"
                : "An interrupted save was detected. The project was restored to the previous stable version."
              : initialLocaleIsZhRef.current
                ? `已从内容库打开（${formatTimestamp(new Date(payload.savedAt), true)}）。`
                : `Opened from library (${formatTimestamp(new Date(payload.savedAt), false)}).`,
          );
          setErrorText(recoveryErrorText);
          const url = new URL(window.location.href);
          url.searchParams.set("projectId", payload.projectId);
          window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
        } catch (error) {
          if (cancelled) return;
          const nextDraft = createFreshBuilderDraft(initialLocaleIsZhRef.current);
          setDraft(nextDraft);
          setProjectId("");
          setStableVersionNumber(0);
          setLastSavedSignature(computeDraftSignature(nextDraft));
          setActiveQuestionId(nextDraft.questions[0]?.id ?? null);
          setExpandedQuestionId(null);
          setErrorText(
            error instanceof Error
              ? error.message
              : initialLocaleIsZhRef.current
                ? "读取组卷工程失败"
                : "Failed to load worksheet project",
          );
        } finally {
          if (!cancelled) {
            setInitializingDraft(false);
          }
        }
        return;
      }

      const nextDraft = createFreshBuilderDraft(initialLocaleIsZhRef.current);
      if (cancelled) return;
      setDraft(nextDraft);
      setProjectId("");
      setStableVersionNumber(0);
      setLastSavedSignature(computeDraftSignature(nextDraft));
      setActiveQuestionId(nextDraft.questions[0]?.id ?? null);
      setExpandedQuestionId(null);
      setInitializingDraft(false);
    };

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [initialProjectId]);

  useEffect(() => {
    window.localStorage.setItem(
      QUESTION_BANK_BUILDER_SIDEBAR_WIDTH_KEY,
      String(sidebarWidth),
    );
    lastExpandedSidebarWidthRef.current = sidebarWidth;
    liveSidebarWidthRef.current = sidebarWidth;
    sidebarPreviewWidthRef.current = sidebarWidth;
    applySidebarWidth(sidebarWidth);
    applySidebarResizeGuide(sidebarWidth);
  }, [sidebarWidth]);

  useEffect(() => {
    window.localStorage.setItem(
      QUESTION_BANK_BUILDER_SIDEBAR_COLLAPSED_KEY,
      String(isSidebarCollapsed),
    );
    isSidebarCollapsedRef.current = isSidebarCollapsed;
  }, [isSidebarCollapsed]);

  useEffect(() => {
    const syncFromBasket = () => {
      if (projectId) return;
      setDraft((current) => mergeBasketIntoDraft(current, readQuestionBasket()));
    };
    window.addEventListener(QUESTION_BASKET_UPDATED_EVENT, syncFromBasket);
    return () =>
      window.removeEventListener(QUESTION_BASKET_UPDATED_EVENT, syncFromBasket);
  }, [projectId]);

  useEffect(() => {
    if (draft.questions.length === 0) {
      setActiveQuestionId(null);
      setExpandedQuestionId(null);
    } else if (
      activeQuestionId &&
      !draft.questions.some((question) => question.id === activeQuestionId)
    ) {
      setActiveQuestionId(draft.questions[0]?.id ?? null);
    }
    if (
      expandedQuestionId &&
      !draft.questions.some((question) => question.id === expandedQuestionId)
    ) {
      setExpandedQuestionId(null);
    }
  }, [draft.questions, activeQuestionId, expandedQuestionId]);

  useEffect(() => {
    if (sortedSections.length === 0) {
      setActiveSectionId(null);
      return;
    }

    if (!sortedSections.some((section) => section.id === activeSectionId)) {
      setActiveSectionId(sortedSections[0]?.id ?? null);
    }
  }, [sortedSections, activeSectionId]);

  useEffect(() => {
    if (
      importTargetSectionId !== "auto" &&
      !sortedSections.some((section) => section.id === importTargetSectionId)
    ) {
      setImportTargetSectionId("auto");
    }
  }, [importTargetSectionId, sortedSections]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || !workspaceRef.current?.contains(target)) {
        return;
      }
      if (
        target.closest("[data-worksheet-question-card]") ||
        target.closest("[data-floating-edit-panel]")
      ) {
        return;
      }
      setActiveQuestionId(null);
      setExpandedQuestionId(null);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!isResizingSidebar) return;

    const handlePointerMove = (event: PointerEvent) => {
      const delta = event.clientX - resizeStateRef.current.startX;
      const nextRawWidth = resizeStateRef.current.startWidth + delta;
      if (nextRawWidth <= QUESTION_BANK_BUILDER_SIDEBAR_COLLAPSE_THRESHOLD) {
        sidebarPreviewCollapsedRef.current = true;
        scheduleSidebarResizeGuide(0);
        return;
      }

      const nextWidth = clampQuestionBankBuilderSidebarWidth(
        nextRawWidth,
        window.innerWidth,
      );
      lastExpandedSidebarWidthRef.current = nextWidth;
      sidebarPreviewCollapsedRef.current = false;
      scheduleSidebarResizeGuide(nextWidth);
    };

    const handlePointerEnd = () => {
      flushResizeGuideFrame();
      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      if (sidebarPreviewCollapsedRef.current) {
        if (!isSidebarCollapsedRef.current) {
          setIsSidebarCollapsed(true);
        }
        isSidebarCollapsedRef.current = true;
      } else {
        const nextWidth = clampQuestionBankBuilderSidebarWidth(
          sidebarPreviewWidthRef.current,
          window.innerWidth,
        );
        liveSidebarWidthRef.current = nextWidth;
        if (isSidebarCollapsedRef.current) {
          setIsSidebarCollapsed(false);
        }
        isSidebarCollapsedRef.current = false;
        setSidebarWidth((current) => (current === nextWidth ? current : nextWidth));
      }
      setIsResizingSidebar(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
      flushResizeGuideFrame();
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizingSidebar]);

  useEffect(() => {
    if (!isDirty && !savingDraft) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty, savingDraft]);

  useEffect(() => {
    if (!isDirty) return;

    const handleDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const nextUrl = new URL(anchor.href, window.location.href);
      if (nextUrl.origin !== window.location.origin) return;
      const nextHref = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextHref === currentHref) return;

      event.preventDefault();
      queuePendingNavigation({ kind: "href", href: nextHref });
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [isDirty, queuePendingNavigation]);

  useEffect(() => {
    if (!isDirty) return;

    const handleNavigationRequest = (event: Event) => {
      const customEvent = event as CustomEvent<WorksheetBuilderNavigationRequestDetail>;
      const nextHref = customEvent.detail?.href?.trim();
      if (!nextHref) return;

      const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextHref === currentHref) return;

      customEvent.detail.allowNavigation = false;
      queuePendingNavigation({ kind: "href", href: nextHref });
    };

    window.addEventListener(
      WORKSHEET_BUILDER_NAVIGATION_GUARD_EVENT,
      handleNavigationRequest as EventListener,
    );

    return () =>
      window.removeEventListener(
        WORKSHEET_BUILDER_NAVIGATION_GUARD_EVENT,
        handleNavigationRequest as EventListener,
      );
  }, [isDirty, queuePendingNavigation]);

  useEffect(() => {
    if (!isDirty) return;

    const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.history.pushState({ __worksheetBuilderGuard: true }, "", currentHref);

    const handlePopState = () => {
      window.history.pushState({ __worksheetBuilderGuard: true }, "", currentHref);
      queuePendingNavigation({
        kind: "href",
        href: leaveFallbackHrefRef.current || "/main/question-bank",
      });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isDirty, queuePendingNavigation]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(deferredQuery);
    }, TIKU_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [deferredQuery]);

  useEffect(() => {
    if (selectedMaterialId) {
      setSearchLoading(false);
      setSearchErrorText("");
      return;
    }

    const controller = new AbortController();
    const trimmedQuery = searchQuery.trim();

    setSearchLoading(true);
    setSearchErrorText("");

    // 重置分页
    setSearchPage(1);
    setSearchHasMore(true);

    let searchPromise: Promise<void>;

    if (filters.sourceScope === "personal") {
      // 个人题库 → Partner API
      const params = new URLSearchParams({ limit: String(SEARCH_PAGE_SIZE), page: "1" });
      if (trimmedQuery) params.set("q", trimmedQuery);
      searchPromise = apiGet<{ items: PartnerExerciseRow[]; total: number }>(
        `/api/partner/exercises/list?${params.toString()}`,
        { signal: controller.signal },
      ).then((response) => {
        if (controller.signal.aborted) return;
        const items = response.items.map((row) => createQuestionBankItemFromPartnerExercise(row));
        setSearchResults(items);
        setSearchHasMore(items.length < response.total);
      });
    } else if (trimmedQuery) {
      // 有搜索词 → 语义搜索（全局 AP）
      searchPromise = apiPost<TikuSearchResponse>(
        "/api/tiku/search",
        {
          query: trimmedQuery,
          limit: SEARCH_PAGE_SIZE,
          ...(filters.course ? { course: filters.course } : {}),
          ...(filters.unit ? { unit: Number(filters.unit) } : {}),
          ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
          ...(filters.cognitiveTask ? { cognitive_task: filters.cognitiveTask } : {}),
        },
        { signal: controller.signal },
      ).then((response) => {
        if (controller.signal.aborted) return;
        const items = response.data.map((row) => createQuestionBankItemFromTikuResult(row));
        setSearchResults(items);
        setSearchHasMore(items.length >= SEARCH_PAGE_SIZE);
      });
    } else {
      // 无搜索词 → 浏览模式（全局 AP）
      const params = new URLSearchParams({ limit: String(SEARCH_PAGE_SIZE), page: "1" });
      if (filters.course) params.set("course", filters.course);
      if (filters.unit) params.set("unit", filters.unit);
      if (filters.difficulty) params.set("difficulty", filters.difficulty);
      if (filters.cognitiveTask) params.set("cognitive_task", filters.cognitiveTask);
      searchPromise = apiGet<{ items: TikuSearchResultRow[]; total: number }>(`/api/tiku/list?${params.toString()}`, {
        signal: controller.signal,
      }).then((response) => {
        if (controller.signal.aborted) return;
        const items = response.items.map((row) => createQuestionBankItemFromTikuResult(row));
        setSearchResults(items);
        setSearchHasMore(items.length < response.total);
      });
    }

    searchPromise
      .catch((error) => {
        if (controller.signal.aborted) return;
        setSearchResults([]);
        setSearchErrorText(
          error instanceof Error
            ? error.message
            : isZhRef.current
              ? "读取题库失败"
              : "Failed to load question bank",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSearchLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    selectedMaterialId,
    searchQuery,
    filters.course,
    filters.unit,
    filters.difficulty,
    filters.cognitiveTask,
    filters.exerciseType,
    filters.sourceScope,
  ]);

  const loadMoreSearchResults = useCallback(async () => {
    if (searchLoadingMore || !searchHasMore) return;
    // 语义搜索模式不支持分页加载更多（仅限浏览模式和个人题库）
    if (searchQuery.trim() && filters.sourceScope !== "personal") return;
    setSearchLoadingMore(true);
    const nextPage = searchPage + 1;
    try {
      let newItems: WorksheetQuestionBankItem[] = [];
      let total = 0;

      if (filters.sourceScope === "personal") {
        const params = new URLSearchParams({ limit: String(SEARCH_PAGE_SIZE), page: String(nextPage) });
        const trimmedQuery = searchQuery.trim();
        if (trimmedQuery) params.set("q", trimmedQuery);
        const response = await apiGet<{ items: PartnerExerciseRow[]; total: number }>(`/api/partner/exercises/list?${params.toString()}`);
        newItems = response.items.map((row) => createQuestionBankItemFromPartnerExercise(row));
        total = response.total;
      } else {
        const params = new URLSearchParams({ limit: String(SEARCH_PAGE_SIZE), page: String(nextPage) });
        if (filters.course) params.set("course", filters.course);
        if (filters.unit) params.set("unit", filters.unit);
        if (filters.difficulty) params.set("difficulty", filters.difficulty);
        if (filters.cognitiveTask) params.set("cognitive_task", filters.cognitiveTask);
        const response = await apiGet<{ items: TikuSearchResultRow[]; total: number }>(`/api/tiku/list?${params.toString()}`);
        newItems = response.items.map((row) => createQuestionBankItemFromTikuResult(row));
        total = response.total;
      }

      setSearchResults((prev) => {
        const existingIds = new Set(prev.map((item) => item.id));
        const deduped = newItems.filter((item) => !existingIds.has(item.id));
        return [...prev, ...deduped];
      });
      setSearchPage(nextPage);
      setSearchHasMore(searchResults.length + newItems.length < total);
    } catch {
      // 忽略加载更多的错误
    } finally {
      setSearchLoadingMore(false);
    }
  }, [searchLoadingMore, searchHasMore, searchQuery, searchPage, filters, searchResults.length]);

  useEffect(() => {
    if (sidebarTab !== "materials") {
      return;
    }

    const controller = new AbortController();

    setMaterialLoading(true);
    setMaterialErrorText("");

    let loadPromise: Promise<void>;

    if (materialSourceScope === "personal") {
      // 个人文件：从 Partner exercises 按 source_file_name 聚合
      const params = new URLSearchParams({ limit: "200", page: "1" });
      if (deferredMaterialQuery.trim()) params.set("q", deferredMaterialQuery.trim());
      loadPromise = apiGet<{ items: PartnerExerciseRow[]; total: number }>(
        `/api/partner/exercises/list?${params.toString()}`,
        { signal: controller.signal },
      ).then((response) => {
        if (controller.signal.aborted) return;
        // 按 source_file_name 聚合
        const fileMap = new Map<string, { count: number; createdAt: string }>();
        for (const row of response.items) {
          const fileName = row.source_file_name || "Unknown";
          const existing = fileMap.get(fileName);
          if (existing) {
            existing.count += 1;
          } else {
            fileMap.set(fileName, { count: 1, createdAt: row.created_at });
          }
        }
        const nextItems: WorksheetMaterialListResponse["items"] = Array.from(fileMap.entries()).map(
          ([fileName, info]) => ({
            id: `personal:${fileName}`,
            label: fileName,
            fileName,
            questionCount: info.count,
            createdAt: info.createdAt,
          }),
        );
        setMaterials(nextItems);
        setSelectedMaterialId((current) =>
          current && nextItems.some((item) => item.id === current) ? current : "",
        );
      });
    } else {
      // 全局 AP 文件
      const params = new URLSearchParams({ limit: "24" });
      if (deferredMaterialQuery.trim()) params.set("q", deferredMaterialQuery.trim());
      if (materialCourse) params.set("course", materialCourse);
      if (materialUnit) params.set("unit", materialUnit);
      loadPromise = apiGet<WorksheetMaterialListResponse>(`/api/tiku/materials?${params.toString()}`, {
        signal: controller.signal,
      }).then((response) => {
        if (controller.signal.aborted) return;
        const nextItems = response.items ?? [];
        setMaterials(nextItems);
        setSelectedMaterialId((current) =>
          current && nextItems.some((item) => item.id === current) ? current : "",
        );
      });
    }

    loadPromise
      .catch((error) => {
        if (controller.signal.aborted) return;
        setMaterials([]);
        setMaterialErrorText(
          error instanceof Error
            ? error.message
            : isZhRef.current
              ? "读取文件失败"
              : "Failed to load file",
        );
        setSelectedMaterialId("");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setMaterialLoading(false);
        }
      });

    return () => controller.abort();
  }, [deferredMaterialQuery, materialCourse, materialUnit, sidebarTab, materialSourceScope]);

  useEffect(() => {
    if (!selectedMaterialId) {
      setMaterialDetail(null);
      setMaterialDetailErrorText("");
      setMaterialDetailLoading(false);
      return;
    }

    const controller = new AbortController();
    setMaterialDetailLoading(true);
    setMaterialDetailErrorText("");

    apiGet<WorksheetMaterialDetail>(
      `/api/tiku/materials/detail?course=${encodeURIComponent(selectedMaterialId.split("|")[0] ?? "")}&sourceAssessment=${encodeURIComponent(selectedMaterialId.split("|")[1] ?? "")}`,
      {
        signal: controller.signal,
      },
    )
      .then((response) => {
        if (controller.signal.aborted) return;
        setMaterialDetail(response);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setMaterialDetail(null);
        setMaterialDetailErrorText(
          error instanceof Error
            ? error.message
            : isZhRef.current
              ? "读取文件内容失败"
              : "Failed to load file content",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setMaterialDetailLoading(false);
        }
      });

    return () => controller.abort();
  }, [selectedMaterialId]);

  function updateDraft(updater: (draft: WorksheetEditorDraft) => WorksheetEditorDraft) {
    setDraft((current) => updater(current));
  }

  function updateQuestion(
    questionId: string,
    updater: (question: WorksheetEditorQuestion) => WorksheetEditorQuestion,
  ) {
    updateDraft((current) => ({
      ...current,
      questions: resequenceQuestions(
        current.questions.map((question) =>
          question.id === questionId ? updater(question) : question,
        ),
        current.sections,
      ),
    }));
  }

  /** dnd-kit 拖拽结束回调：从搜索结果拖到编辑器 drop zone 时添加题目 */
  function handleDragEnd(event: Parameters<NonNullable<React.ComponentProps<typeof DragDropProvider>["onDragEnd"]>>[0]) {
    setDraggedItem(null);

    const source = event.operation.source as Draggable | null;
    const target = event.operation.target;
    if (!source || !target) return;

    const sourceData = source.data as { item?: WorksheetQuestionBankItem } | undefined;
    const targetData = target.data as { dropZoneId?: string; sectionId?: string; beforeQuestionId?: string; afterQuestionId?: string } | undefined;
    if (!sourceData?.item || !targetData?.dropZoneId) return;

    // Determine insert position: if afterQuestionId is set, find the next question's ID
    let insertBeforeId = targetData.beforeQuestionId;
    if (!insertBeforeId && targetData.afterQuestionId) {
      const allQuestions = draft.questions.filter((q) => q.sectionId === (targetData.sectionId ?? ""));
      const afterIdx = allQuestions.findIndex((q) => q.id === targetData.afterQuestionId);
      if (afterIdx >= 0 && afterIdx + 1 < allQuestions.length) {
        insertBeforeId = allQuestions[afterIdx + 1].id;
      }
      // else: afterQuestionId is last in section → insertBeforeId stays undefined → append
    }

    addResultToWorksheet(sourceData.item, targetData.sectionId ?? importTargetSectionId, insertBeforeId);
  }

  function addResultToWorksheet(
    item: WorksheetQuestionBankItem,
    targetSectionId = "auto",
    beforeQuestionId?: string,
  ) {
    let nextQuestionId = "";
    let existingQuestionId = "";
    let targetSectionTitle = "";
    updateDraft((current) => {
      const existing = current.questions.find((question) => question.exerciseId === item.id);
      if (existing) {
        existingQuestionId = existing.id;
        return current;
      }
      const selectedSection =
        targetSectionId !== "auto"
          ? current.sections.find((section) => section.id === targetSectionId) ?? null
          : null;
      const ensured = selectedSection
        ? {
            sectionId: selectedSection.id,
            sections: current.sections,
          }
        : ensureSectionForQuestionType(current.sections, item.exerciseType);
      targetSectionTitle =
        ensured.sections.find((section) => section.id === ensured.sectionId)?.title ?? "";
      const sectionQuestions = current.questions.filter(
        (question) => question.sectionId === ensured.sectionId,
      );
      const nextQuestion = createWorksheetQuestionFromItem(
        item,
        ensured.sectionId,
        sectionQuestions.length,
      );
      nextQuestionId = nextQuestion.id;

      const sectionOrderMap = new Map(
        sortSections(ensured.sections).map((section) => [section.id, section.order]),
      );
      const updatedQuestions = sortQuestionsForCanvas(current.questions, ensured.sections);
      if (beforeQuestionId) {
        const insertIndex = updatedQuestions.findIndex((question) => question.id === beforeQuestionId);
        if (insertIndex >= 0) {
          updatedQuestions.splice(insertIndex, 0, nextQuestion);
        } else {
          updatedQuestions.push(nextQuestion);
        }
      } else {
        const targetQuestions = updatedQuestions.filter(
          (question) => question.sectionId === ensured.sectionId,
        );
        if (targetQuestions.length === 0) {
          const targetSectionOrder = sectionOrderMap.get(ensured.sectionId) ?? 999;
          const sectionStartIndex = updatedQuestions.findIndex(
            (question) =>
              (sectionOrderMap.get(question.sectionId) ?? 999) > targetSectionOrder,
          );
          if (sectionStartIndex >= 0) {
            updatedQuestions.splice(sectionStartIndex, 0, nextQuestion);
          } else {
            updatedQuestions.push(nextQuestion);
          }
        } else {
          const lastTarget = targetQuestions[targetQuestions.length - 1];
          const insertIndex = updatedQuestions.findIndex(
            (question) => question.id === lastTarget.id,
          );
          updatedQuestions.splice(insertIndex + 1, 0, nextQuestion);
        }
      }

      const nextOrders = new Map<string, number>();

      return {
        ...current,
        sections: ensured.sections.map((section, index) => ({
          ...section,
          order: index,
        })),
        questions: updatedQuestions.map((question) => {
          const nextOrder = nextOrders.get(question.sectionId) ?? 0;
          nextOrders.set(question.sectionId, nextOrder + 1);
          return {
            ...question,
            order: nextOrder,
          };
        }),
      };
    });
    if (existingQuestionId) {
      setActiveQuestionId(existingQuestionId);
      setStatusText(
        isZh
          ? "这道题已经在当前试卷里。"
          : "This question is already in the current worksheet.",
      );
      return;
    }
    if (nextQuestionId) {
      setActiveQuestionId(nextQuestionId);
    }
    setStatusText(
      targetSectionTitle
        ? isZh
          ? `题目已添加到「${targetSectionTitle}」。`
          : `Question added to "${targetSectionTitle}".`
        : isZh
          ? "题目已添加到当前试卷。"
          : "Question added to the current worksheet.",
    );
  }

  function addManyResultsToWorksheet(
    items: WorksheetQuestionBankItem[],
    targetSectionId = "auto",
  ) {
    if (items.length === 0) return;
    let addedCount = 0;
    let targetSectionTitle = "";
    startTransition(() => {
      updateDraft((current) => {
        let nextSections = [...current.sections];
        const nextQuestions = [...current.questions];

        items.forEach((item) => {
          if (nextQuestions.some((question) => question.exerciseId === item.id)) {
            return;
          }
          const selectedSection =
            targetSectionId !== "auto"
              ? nextSections.find((section) => section.id === targetSectionId) ?? null
              : null;
          const ensured = selectedSection
            ? {
                sectionId: selectedSection.id,
                sections: nextSections,
              }
            : ensureSectionForQuestionType(nextSections, item.exerciseType);
          nextSections = ensured.sections;
          targetSectionTitle =
            targetSectionTitle ||
            nextSections.find((section) => section.id === ensured.sectionId)?.title ||
            "";
          const sectionQuestions = nextQuestions.filter(
            (question) => question.sectionId === ensured.sectionId,
          );
          nextQuestions.push(
            createWorksheetQuestionFromItem(
              item,
              ensured.sectionId,
              sectionQuestions.length,
            ),
          );
          addedCount += 1;
        });

        return {
          ...current,
          sections: nextSections.map((section, index) => ({
            ...section,
            order: index,
          })),
          questions: resequenceQuestions(nextQuestions, nextSections),
        };
      });
    });
    setStatusText(
      addedCount > 0
        ? targetSectionTitle
          ? isZh
            ? `已批量加入 ${addedCount} 道题到「${targetSectionTitle}」。`
            : `Added ${addedCount} questions to "${targetSectionTitle}".`
          : isZh
            ? `已批量加入 ${addedCount} 道题。`
            : `Added ${addedCount} questions.`
        : isZh
          ? "候选题都已在当前试卷里。"
          : "All suggested questions are already in the current worksheet.",
    );
  }

  function handleSelectMaterial(materialId: string) {
    setSelectedMaterialId((current) => {
      const nextMaterialId = current === materialId ? "" : materialId;
      if (nextMaterialId) {
        startTransition(() => {
          setSidebarTab("search");
        });
      }
      return nextMaterialId;
    });
  }

  function replaceQuestionWithItem(questionId: string, item: WorksheetQuestionBankItem) {
    updateDraft((current) => ({
      ...current,
      questions: resequenceQuestions(
        current.questions.map((question) =>
          question.id === questionId
            ? {
                ...createWorksheetQuestionFromItem(
                  item,
                  question.sectionId,
                  question.order,
                ),
                id: question.id,
                sectionId: question.sectionId,
                order: question.order,
                points: question.points,
                isModified: true,
              }
            : question,
        ),
        current.sections,
      ),
    }));
    setStatusText(isZh ? "已替换当前题。" : "Current question replaced.");
  }

  function addSection(afterSectionId?: string) {
    updateDraft((current) => {
      const nextSections = sortSections(current.sections);
      const insertIndex = afterSectionId
        ? nextSections.findIndex((section) => section.id === afterSectionId) + 1
        : nextSections.length;
      nextSections.splice(insertIndex, 0, {
        id: nextWorksheetSectionId(),
        title: getNewSectionTitle(insertIndex, isZh),
        order: insertIndex,
      });
      return {
        ...current,
        sections: nextSections.map((section, index) => ({
          ...section,
          order: index,
        })),
      };
    });
  }

  function renameSection(sectionId: string, title: string) {
    updateDraft((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              title: title || section.title,
            }
          : section,
      ),
    }));
  }

  function deleteSection(sectionId: string) {
    updateDraft((current) => {
      const remainingSections = current.sections.filter((section) => section.id !== sectionId);
      // 删除该分组下的所有题目
      const remainingQuestions = current.questions.filter(
        (question) => question.sectionId !== sectionId,
      );

      let nextSections = remainingSections;
      if (nextSections.length === 0) {
        nextSections = [
          {
            id: nextWorksheetSectionId(),
            title: getFallbackSectionTitle(isZh),
            order: 0,
          } satisfies WorksheetEditorSection,
        ];
      }

      return {
        ...current,
        sections: nextSections.map((section, index) => ({
          ...section,
          order: index,
        })),
        questions: resequenceQuestions(remainingQuestions, nextSections),
      };
    });
  }

  function removeQuestion(questionId: string) {
    updateDraft((current) => ({
      ...current,
      questions: resequenceQuestions(
        current.questions.filter((question) => question.id !== questionId),
        current.sections,
      ),
    }));
    setExpandedQuestionId((current) => (current === questionId ? null : current));
    setStatusText(
      isZh
        ? "题目已从当前试卷移除。"
        : "Question removed from the current worksheet.",
    );
  }

  function addBlankAfterQuestion(questionId: string) {
    let nextBlockId = "";
    updateDraft((current) => {
      const targetQuestion = current.questions.find((q) => q.id === questionId);
      if (!targetQuestion) return current;

      const blankBlock = createBlankBlock(
        targetQuestion.sectionId,
        targetQuestion.order + 1,
      );
      nextBlockId = blankBlock.id;

      return {
        ...current,
        questions: resequenceQuestions(
          [...current.questions, blankBlock],
          current.sections,
        ),
      };
    });
    if (nextBlockId) {
      setActiveQuestionId(nextBlockId);
    }
    setStatusText(isZh ? "已添加空白区域。" : "Blank area added.");
  }

  function moveQuestion(
    questionId: string,
    targetSectionId: string,
    beforeQuestionId?: string,
  ) {
    updateDraft((current) => {
      const moving = current.questions.find((question) => question.id === questionId);
      if (!moving) return current;

      const sectionOrderMap = new Map(
        sortSections(current.sections).map((section) => [section.id, section.order]),
      );
      const remaining = sortQuestionsForCanvas(
        current.questions.filter((question) => question.id !== questionId),
        current.sections,
      );
      const nextQuestion = {
        ...moving,
        sectionId: targetSectionId,
      };

      if (beforeQuestionId) {
        const targetIndex = remaining.findIndex(
          (question) => question.id === beforeQuestionId,
        );
        if (targetIndex >= 0) {
          remaining.splice(targetIndex, 0, nextQuestion);
        } else {
          remaining.push(nextQuestion);
        }
      } else {
        const targetQuestions = remaining.filter(
          (question) => question.sectionId === targetSectionId,
        );
        if (targetQuestions.length === 0) {
          const targetSectionOrder = sectionOrderMap.get(targetSectionId) ?? 999;
          const sectionStartIndex = remaining.findIndex(
            (question) =>
              (sectionOrderMap.get(question.sectionId) ?? 999) > targetSectionOrder,
          );
          if (sectionStartIndex >= 0) {
            remaining.splice(sectionStartIndex, 0, nextQuestion);
          } else {
            remaining.push(nextQuestion);
          }
        } else {
          const lastTarget = targetQuestions[targetQuestions.length - 1];
          const insertIndex = remaining.findIndex(
            (question) => question.id === lastTarget.id,
          );
          remaining.splice(insertIndex + 1, 0, nextQuestion);
        }
      }

      const nextOrders = new Map<string, number>();
      return {
        ...current,
        questions: remaining.map((question) => {
          const nextOrder = nextOrders.get(question.sectionId) ?? 0;
          nextOrders.set(question.sectionId, nextOrder + 1);
          return {
            ...question,
            order: nextOrder,
          };
        }),
      };
    });
  }

  function escapeSelectorValue(value: string) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(value);
    }
    return value.replace(/["\\]/g, "\\$&");
  }

  function scrollWorkspaceTarget(
    kind: "question" | "section",
    targetId: string,
    block: ScrollLogicalPosition = "center",
  ) {
    const root = workspaceRef.current;
    if (!root) return;
    const scrollContainer = root.querySelector<HTMLElement>("[data-paginated-scroll]");
    if (!scrollContainer) return;

    const selector =
      kind === "question"
        ? `[data-pages-container] [data-question-id="${escapeSelectorValue(targetId)}"]`
        : `[data-pages-container] [data-section-id="${escapeSelectorValue(targetId)}"]`;

    const scroll = () => {
      const target = root.querySelector<HTMLElement>(selector);
      if (!target) return;

      const containerRect = scrollContainer.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const targetTop =
        scrollContainer.scrollTop + (targetRect.top - containerRect.top);
      const targetBottom =
        scrollContainer.scrollTop + (targetRect.bottom - containerRect.top);
      const startOffset = 20;
      const centeredOffset = Math.max(
        0,
        (scrollContainer.clientHeight - targetRect.height) / 2,
      );
      const endOffset = Math.max(24, scrollContainer.clientHeight - 48);
      const nextTop =
        block === "start"
          ? targetTop - startOffset
          : block === "end"
            ? targetBottom - endOffset
            : targetTop - centeredOffset;
      const maxScrollTop = Math.max(
        0,
        scrollContainer.scrollHeight - scrollContainer.clientHeight,
      );

      scrollContainer.scrollTo({
        top: Math.min(Math.max(0, nextTop), maxScrollTop),
        behavior: "smooth",
      });
    };

    scroll();
    window.requestAnimationFrame(scroll);
  }

  function navigateQuestion(questionId: string) {
    const question = draft.questions.find((item) => item.id === questionId) ?? null;
    setActiveQuestionId(questionId);
    setActiveSectionId(question?.sectionId ?? null);
    scrollWorkspaceTarget("question", questionId, "end");
  }

  function navigateSection(sectionId: string) {
    setActiveSectionId(sectionId);
    setActiveQuestionId(null);
    scrollWorkspaceTarget("section", sectionId, "start");
    setExpandedQuestionId(null);
  }

  const handleFocusQuestion = useCallback(
    (questionId: string) => {
      const question = draft.questions.find((item) => item.id === questionId) ?? null;
      setActiveQuestionId(questionId);
      setActiveSectionId(question?.sectionId ?? null);
    },
    [draft.questions],
  );

  const handleExpandQuestion = useCallback(
    (questionId: string | null) => {
      setExpandedQuestionId(questionId);
      if (!questionId) return;

      const question = draft.questions.find((item) => item.id === questionId) ?? null;
      setActiveQuestionId(questionId);
      setActiveSectionId(question?.sectionId ?? null);
    },
    [draft.questions],
  );

  // PaginatedEditor 需要的回调封装
  /** 搜索可替换当前题的候选题（供 FloatingEditPanel 调用） */
  const handleSearchReplacements = useCallback(
    async (questionId: string): Promise<WorksheetQuestionBankItem[]> => {
      const question = draft.questions.find((q) => q.id === questionId);
      if (!question) return [];

      const instruction = `找与这道题相似的题目：${question.questionText.slice(0, 120)}`;

      const [tikuItems, personalItems] = await Promise.all([
        apiPost<TikuSearchResponse>("/api/tiku/search", {
          query: instruction,
          limit: 15,
          skip_cache: true,
        }).then((r) => (r.data ?? []).map(createQuestionBankItemFromTikuResult)),
        apiGet<{ items: PartnerExerciseRow[]; total: number }>(
          `/api/partner/exercises/list?q=${encodeURIComponent(question.questionText.slice(0, 80))}&limit=10`,
        )
          .then((r) => r.items.map(createQuestionBankItemFromPartnerExercise))
          .catch(() => [] as WorksheetQuestionBankItem[]),
      ]);

      // 合并去重，排除当前题和已导入的题
      return Array.from(
        new Map(
          [...tikuItems, ...personalItems].map((item) => [item.id, item]),
        ).values(),
      ).filter(
        (item) => item.id !== question.exerciseId && !importedExerciseIds.has(item.id),
      ).slice(0, 10);
    },
    [draft.questions, importedExerciseIds],
  );

  /** 确认用候选题替换当前题 */
  const handleConfirmReplace = useCallback(
    (questionId: string, item: WorksheetQuestionBankItem) => {
      replaceQuestionWithItem(questionId, item);
    },
    [],
  );

  const handleMoveUp = useCallback(
    (questionId: string) => {
      const question = draft.questions.find((q) => q.id === questionId);
      if (!question) return;
      const sectionQuestions = sortedQuestions.filter(
        (q) => q.sectionId === question.sectionId,
      );
      const idx = sectionQuestions.findIndex((q) => q.id === questionId);
      if (idx <= 0) return;
      moveQuestion(questionId, question.sectionId, sectionQuestions[idx - 1].id);
    },
    [draft.questions, sortedQuestions],
  );

  const handleMoveDown = useCallback(
    (questionId: string) => {
      const question = draft.questions.find((q) => q.id === questionId);
      if (!question) return;
      const sectionQuestions = sortedQuestions.filter(
        (q) => q.sectionId === question.sectionId,
      );
      const idx = sectionQuestions.findIndex((q) => q.id === questionId);
      if (idx < 0 || idx >= sectionQuestions.length - 1) return;
      const beforeQuestionId = sectionQuestions[idx + 2]?.id;
      moveQuestion(questionId, question.sectionId, beforeQuestionId);
    },
    [draft.questions, sortedQuestions],
  );

  const handleDragStart = useCallback(
    (id: string) => setDraggingQuestionId(id),
    [],
  );

  const handleDragOver = useCallback(
    (id: string) => setActiveQuestionId(id),
    [],
  );

  const handleDropBefore = useCallback(
    (id: string) => {
      const question = draft.questions.find((q) => q.id === id);
      if (draggingQuestionId && draggingQuestionId !== id && question) {
        moveQuestion(draggingQuestionId, question.sectionId, id);
      }
      setDraggingQuestionId(null);
    },
    [draggingQuestionId, draft.questions],
  );

  const checkCanMoveUp = useCallback(
    (questionId: string) => {
      const question = draft.questions.find((q) => q.id === questionId);
      if (!question) return false;
      const sectionQuestions = sortedQuestions.filter(
        (q) => q.sectionId === question.sectionId,
      );
      const idx = sectionQuestions.findIndex((q) => q.id === questionId);
      return idx > 0;
    },
    [draft.questions, sortedQuestions],
  );

  const checkCanMoveDown = useCallback(
    (questionId: string) => {
      const question = draft.questions.find((q) => q.id === questionId);
      if (!question) return false;
      const sectionQuestions = sortedQuestions.filter(
        (q) => q.sectionId === question.sectionId,
      );
      const idx = sectionQuestions.findIndex((q) => q.id === questionId);
      return idx >= 0 && idx < sectionQuestions.length - 1;
    },
    [draft.questions, sortedQuestions],
  );

  async function runAiAssemble() {
    const prompt = sanitizeText(assemblePrompt);
    if (!prompt) return;

    setAssembleLoading(true);
    setAssembleErrorText("");
    setAssembleStatusText("");
    setAssembleResults([]);
    setAssembleSelectedIds(new Set());

    try {
      // 从当前草稿推断课程（取第一道题的 subject）
      const course = draft.questions[0]?.subject ?? "";

      // 调用 v2 蓝图驱动的组卷 API
      const response = await apiPost<{
        blueprint: {
          intent: string;
          totalQuestions: number;
          difficultyDistribution: { easy: number; medium: number; hard: number };
          slots: Array<{
            topicCode: string;
            topicLabel: string;
            difficulty: string;
            count: number;
            searchHint: string;
          }>;
        };
        questions: Array<{
          id: string;
          course: string;
          unit: number;
          stem: string;
          choices: Record<string, { text: string; misconception: string | null }>;
          correct_answer: string;
          explanation: string | null;
          difficulty: string;
          cognitive_task: string | null;
          topic_code: string | null;
          key_concepts: string[];
          source_assessment: string;
          question_number: number;
          standalone_usable: boolean;
        }>;
        sections: Array<{ title: string; rationale: string; questionIds: string[] }>;
        summary: string;
      }>("/api/worksheets/assemble-v2", {
        prompt,
        course,
        questionCount: 15,
      });

      if (response.questions.length === 0) {
        setAssembleStatusText(isZh ? "AI 没有找到匹配的题目。" : "No matching questions found.");
        return;
      }

      // 将 v2 题目转换为 WorksheetQuestionBankItem 格式
      const difficultyMap: Record<string, number> = { easy: 1, medium: 2, hard: 3 };

      const allItems: WorksheetQuestionBankItem[] = response.questions.map((q) => {
        const options = Object.entries(q.choices ?? {})
          .filter(([, v]) => v != null)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([label, choice]) => ({
            label,
            text: choice.text,
            isCorrect: label === q.correct_answer,
          }));

        return {
          id: q.id,
          exerciseType: "MC" as const,
          difficulty: difficultyMap[q.difficulty] ?? 2,
          questionText: q.stem,
          options: options.length > 0 ? options : null,
          correctAnswer: q.correct_answer ?? null,
          solutionSteps: q.explanation ?? null,
          knowledgePoints: q.key_concepts ?? [],
          sourceKind: "global_ap",
          isAiGenerated: false,
          createdAt: null,
          tags: [q.topic_code, q.cognitive_task].filter(Boolean) as string[],
          course: q.course ?? null,
          unit: q.unit ?? null,
          cognitive_task: q.cognitive_task ?? null,
          stimulusImageUrl: null,
        } satisfies WorksheetQuestionBankItem;
      });

      setAssembleResults(allItems);
      // 默认全部选中
      setAssembleSelectedIds(new Set(allItems.map((item) => item.id)));

      const { difficultyDistribution: dist } = response.blueprint;
      setAssembleStatusText(
        isZh
          ? `AI 已推荐 ${allItems.length} 道题（${dist.easy}易/${dist.medium}中/${dist.hard}难）。默认全部选中，可取消。`
          : `AI recommended ${allItems.length} questions (${dist.easy} easy / ${dist.medium} medium / ${dist.hard} hard). All are selected by default.`,
      );
    } catch (error) {
      setAssembleErrorText(
        error instanceof Error ? error.message : (isZh ? "AI 组卷失败" : "AI assembly failed"),
      );
    } finally {
      setAssembleLoading(false);
    }
  }

  function handleToggleAssembleSelect(id: string) {
    setAssembleSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleImportAssembleSelected() {
    const selectedItems = assembleResults.filter((item) => assembleSelectedIds.has(item.id));
    if (selectedItems.length === 0) return;
    addManyResultsToWorksheet(selectedItems);
    setAssembleSelectedIds(new Set());
    setAiPanelOpen(false);
  }

  async function runRelatedSearch(nextInstruction?: string) {
    const prompt = sanitizeText(nextInstruction || relatedQuery);
    const instruction = buildAiRelatedInstruction({
      prompt,
      questionText: activeQuestion?.questionText,
      knowledgePoints: activeQuestion?.knowledgePoints,
      questionType: activeQuestion?.questionType,
      difficulty: activeQuestion?.difficulty,
    });

    if (!instruction.trim()) {
      setRelatedErrorText(
        isZh
          ? "请先输入检索条件，或先在试卷中选中一道题。"
          : "Enter a search condition first, or select a question in the worksheet.",
      );
      return;
    }

    setRelatedLoading(true);
    setRelatedErrorText("");
    setRelatedStatusText("");

    try {
      // 同时搜索全局 AP 题库 + 个人题库
      const [tikuItems, personalItems] = await Promise.all([
        apiPost<TikuSearchResponse>("/api/tiku/search", {
          query: instruction,
          limit: 10,
        }).then((response) => (response.data ?? []).map(createQuestionBankItemFromTikuResult)),
        apiGet<{ items: PartnerExerciseRow[]; total: number }>(
          `/api/partner/exercises/list?q=${encodeURIComponent(instruction)}&limit=10`,
        )
          .then((response) => response.items.map(createQuestionBankItemFromPartnerExercise))
          .catch(() => [] as WorksheetQuestionBankItem[]),
      ]);

      // 合并去重
      const allItems = Array.from(
        new Map(
          [...tikuItems, ...personalItems].map((item) => [item.id, item]),
        ).values(),
      );

      const nextResults = allItems.filter(
        (item) =>
          !importedExerciseIds.has(item.id) ||
          item.id === activeQuestion?.exerciseId,
      );
      setRelatedResults(nextResults);
      setRelatedStatusText(
        nextResults.length > 0
          ? isZh
            ? `AI 已找到 ${nextResults.length} 道相关题。`
            : `AI found ${nextResults.length} related questions.`
          : isZh
            ? "没有找到新的相关题。"
            : "No new related questions found.",
      );
    } catch (error) {
      setRelatedErrorText(
        error instanceof Error
          ? error.message
          : isZh
            ? "AI 检索失败"
            : "AI search failed",
      );
    } finally {
      setRelatedLoading(false);
    }
  }

  async function saveProject() {
    setSavingDraft(true);
    setErrorText("");
    const currentProjectId = projectId.trim() || null;
    if (currentProjectId && stableVersionNumber > 0) {
      writePendingSaveMarker({
        projectId: currentProjectId,
        previousStableVersionNumber: stableVersionNumber,
        startedAt: new Date().toISOString(),
      });
    }
    try {
      const payload = await apiPost<WorksheetProjectPayload>(
        "/api/question-bank/builder/projects",
        {
          projectId: projectId || null,
          draft,
          pageCount: draftPageCount,
        },
      );
      const nextDraft = normalizeBuilderDraft(payload.draft);
      const nextSignature = computeDraftSignature(nextDraft);
      setDraft(nextDraft);
      setProjectId(payload.projectId);
      setStableVersionNumber(payload.stableVersionNumber);
      setLastSavedSignature(nextSignature);
      setStatusText(
        isZh
          ? `已保存到内容库（${formatTimestamp(new Date(payload.savedAt), true)}）。`
          : `Saved to library (${formatTimestamp(new Date(payload.savedAt), false)}).`,
      );
      clearPendingSaveMarker(currentProjectId);
      clearPendingSaveMarker(payload.projectId);

      const url = new URL(window.location.href);
      url.searchParams.set("projectId", payload.projectId);
      window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);

      return payload;
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : isZh
            ? "保存组卷工程失败"
            : "Failed to save worksheet project",
      );
      return null;
    } finally {
      setSavingDraft(false);
    }
  }

  const requestNavigate = useCallback(
    (href: string) => {
      if (savingDraft) return;
      if (isDirty) {
        queuePendingNavigation({ kind: "href", href });
        return;
      }
      router.push(href);
    },
    [isDirty, queuePendingNavigation, router, savingDraft],
  );

  const continuePendingNavigation = useCallback(
    (nextNavigation: PendingNavigation | null) => {
      if (!nextNavigation) return;
      router.push(nextNavigation.href);
    },
    [router],
  );

  const handleLeaveWithoutSave = useCallback(() => {
    const nextNavigation = pendingNavigation;
    dismissLeavePrompt();
    continuePendingNavigation(nextNavigation);
  }, [continuePendingNavigation, dismissLeavePrompt, pendingNavigation]);

  async function handleSaveBeforeLeave() {
    const nextNavigation = pendingNavigation;
    const saved = await saveProject();
    if (!saved) return;
    dismissLeavePrompt();
    continuePendingNavigation(nextNavigation);
  }

  async function exportPdf() {
    if (draft.questions.length === 0 || exportingPdf) return;
    setExportingPdf(true);
    setErrorText("");
    try {
      const html = buildWorksheetPdfHtml({
        title: draft.title.trim() || getDefaultDraftTitle(isZh),
        description: draft.description.trim(),
        duration: draft.duration,
        sections: draft.sections,
        questions: draft.questions,
        includeAnswerKey: exportMode === "teacher",
        includeExplanations: exportMode === "teacher",
      });
      const blob = await requestDocumentPdfBlob({
        html,
        title: draft.title.trim() || getDefaultDraftTitle(isZh),
        layoutConfig: {
          ...DEFAULT_DOCUMENT_LAYOUT,
          pageSize: "A4",
          columns: 1,
          margins: {
            top: 18,
            right: 18,
            bottom: 18,
            left: 18,
          },
        },
      });
      downloadBlob(blob, `${slugifyFilename(draft.title)}.pdf`);
      setStatusText(isZh ? "PDF 已导出。" : "PDF exported.");
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : isZh
            ? "导出 PDF 失败"
            : "Failed to export PDF",
      );
    } finally {
      setExportingPdf(false);
    }
  }

  async function exportWord() {
    if (draft.questions.length === 0 || exportingWord) return;
    setExportingWord(true);
    try {
      const html = buildWorksheetWordHtml({
        title: draft.title,
        description: draft.description,
        duration: draft.duration,
        sections: draft.sections,
        questions: draft.questions,
        includeAnswerKey: exportMode === "teacher",
      });
      const blob = new Blob([html], {
        type: "application/msword;charset=utf-8",
      });
      downloadBlob(blob, `${slugifyFilename(draft.title)}.doc`);
      setStatusText(isZh ? "Word 文稿已导出。" : "Word document exported.");
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : isZh
            ? "导出 Word 失败"
            : "Failed to export Word document",
      );
    } finally {
      setExportingWord(false);
    }
  }

  function beginSidebarResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (window.innerWidth < 1280) return;
    event.preventDefault();
    resizeStateRef.current = {
      startX: event.clientX,
      startWidth: sidebarWidth,
    };
    sidebarPreviewCollapsedRef.current = false;
    sidebarPreviewWidthRef.current = sidebarWidth;
    applySidebarResizeGuide(sidebarWidth);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    setIsResizingSidebar(true);
  }

  function openSidebar() {
    const nextWidth = clampQuestionBankBuilderSidebarWidth(
      lastExpandedSidebarWidthRef.current || QUESTION_BANK_BUILDER_SIDEBAR_DEFAULT,
      window.innerWidth,
    );
    liveSidebarWidthRef.current = nextWidth;
    sidebarPreviewWidthRef.current = nextWidth;
    setSidebarWidth(nextWidth);
    setIsSidebarCollapsed(false);
  }

  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
    <ModuleTour moduleId="builder" />
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#f3f4f1]">
      <div className="flex h-full w-full min-h-0 flex-1 flex-col overflow-hidden">
        <section className="shrink-0 border-b border-[rgba(55,53,47,0.08)] bg-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-[#37352F]">
                {isZh ? "组卷编辑台" : "Worksheet Builder"}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#37352F]/52">
                <span>
                  {draft.title.trim() || (isZh ? "未命名试卷" : "Untitled worksheet")}
                </span>
                <span>
                  {isZh ? `${stats.questionCount} 题` : `${stats.questionCount} questions`}
                </span>
                <span>
                  {isZh ? `总分 ${stats.totalPoints} 分` : `Total ${stats.totalPoints} pts`}
                </span>
                {isDirty ? <span className="text-amber-700">{isZh ? "未保存修改" : "Unsaved changes"}</span> : null}
                {savingDraft ? <span className="text-[#5E6AD2]">{isZh ? "保存中..." : "Saving..."}</span> : null}
                {statusText ? <span className="text-emerald-700">{statusText}</span> : null}
                {errorText ? <span className="text-rose-700">{errorText}</span> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => requestNavigate("/main/question-bank")}
                className="inline-flex items-center gap-2 rounded-xl border border-[rgba(55,53,47,0.1)] bg-white px-3 py-2 text-sm text-[#37352F]/72 transition hover:bg-[#faf8f3]"
              >
                <X className="h-4 w-4" />
                {isZh ? "返回题库" : "Back to bank"}
              </button>
              {/* AI Assembly button moved to right edge tab */}
              <button
                type="button"
                onClick={() => void saveProject()}
                disabled={savingDraft || initializingDraft}
                className="inline-flex items-center gap-2 rounded-xl border border-[rgba(55,53,47,0.1)] bg-white px-3 py-2 text-sm text-[#37352F]/72 transition hover:bg-[#faf8f3] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {savingDraft
                  ? isZh
                    ? "保存中..."
                    : "Saving..."
                  : isZh
                    ? "保存到内容库"
                    : "Save to library"}
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowExportMenu((v) => !v)}
                  disabled={draft.questions.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#37352F] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#37352F]/90 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <FileDown className="h-4 w-4" />
                  {isZh ? "导出" : "Export"}
                </button>

                {showExportMenu ? (
                  <div className="absolute right-0 top-full z-30 mt-2 w-[280px] rounded-[12px] border border-[rgba(55,53,47,0.16)] bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
                    <p className="text-xs font-medium text-[#37352F]/50 uppercase tracking-wider">
                      {isZh ? "导出模式" : "Export mode"}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setExportMode("teacher")}
                        className={cn(
                          "flex-1 rounded-[8px] border px-3 py-2.5 text-sm font-medium transition",
                          exportMode === "teacher"
                            ? "border-[#37352F] bg-[#37352F] text-white"
                            : "border-[rgba(55,53,47,0.16)] bg-white text-[#37352F]/72 hover:bg-[#f7f6f3]",
                        )}
                      >
                        {isZh ? "教师版" : "Teacher"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportMode("student")}
                        className={cn(
                          "flex-1 rounded-[8px] border px-3 py-2.5 text-sm font-medium transition",
                          exportMode === "student"
                            ? "border-[#37352F] bg-[#37352F] text-white"
                            : "border-[rgba(55,53,47,0.16)] bg-white text-[#37352F]/72 hover:bg-[#f7f6f3]",
                        )}
                      >
                        {isZh ? "学生版" : "Student"}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-[#37352F]/40">
                      {exportMode === "teacher"
                        ? (isZh ? "包含答案和解析" : "Includes answers & explanations")
                        : (isZh ? "仅题目，不含答案和解析" : "Questions only, no answers")}
                    </p>

                    <div className="mt-4 flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => { void exportPdf(); }}
                        disabled={exportingPdf}
                        className="inline-flex items-center justify-center gap-2 rounded-[8px] bg-[#37352F] px-3 py-2.5 text-sm font-medium text-white transition hover:bg-[#37352F]/90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <FileDown className="h-4 w-4" />
                        {exportingPdf
                          ? (isZh ? "导出中..." : "Exporting...")
                          : (isZh ? `导出 PDF（${exportMode === "teacher" ? "教师版" : "学生版"}）` : `Export PDF (${exportMode === "teacher" ? "Teacher" : "Student"})`)}
                      </button>
                      <button
                        type="button"
                        onClick={() => { void exportWord(); }}
                        disabled={exportingWord}
                        className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[rgba(55,53,47,0.16)] px-3 py-2.5 text-sm font-medium text-[#37352F]/72 transition hover:bg-[#f7f6f3] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <FileDown className="h-4 w-4" />
                        {exportingWord
                          ? (isZh ? "导出中..." : "Exporting...")
                          : (isZh ? `导出 Word（${exportMode === "teacher" ? "教师版" : "学生版"}）` : `Export Word (${exportMode === "teacher" ? "Teacher" : "Student"})`)}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <div className="min-h-0 flex-1 overflow-hidden px-4 py-4">
          <div
            ref={workspaceRef}
            className="relative flex h-full min-h-0 flex-col gap-4 overflow-hidden xl:flex-row"
          >
            <div
              ref={sidebarResizeGuideRef}
              className={cn(
                "pointer-events-none absolute inset-y-4 z-30 hidden xl:block transition-opacity duration-150",
                isResizingSidebar ? "opacity-100" : "opacity-0",
              )}
              style={{ left: sidebarWidth }}
            >
              <div className="absolute inset-y-1 left-0 w-px bg-[rgba(37,99,235,0.28)]" />
              <div className="absolute inset-y-6 -left-[3px] w-[7px] rounded-full border border-[rgba(37,99,235,0.18)] bg-white shadow-[0_8px_20px_rgba(37,99,235,0.16)]" />
            </div>
            {isSidebarCollapsed ? (
              <button
                type="button"
                onClick={openSidebar}
                aria-label={isZh ? "展开左侧题库与大纲" : "Expand left bank and outline"}
                title={isZh ? "展开左侧题库与大纲" : "Expand left bank and outline"}
                className="absolute left-0 top-6 z-20 hidden h-14 w-10 items-center justify-center rounded-r-2xl border border-[rgba(55,53,47,0.12)] bg-white/96 text-[#37352F]/60 shadow-[0_16px_36px_rgba(15,23,42,0.12)] backdrop-blur transition hover:border-[rgba(55,53,47,0.2)] hover:text-[#37352F] xl:inline-flex"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : null}
            <div
              ref={sidebarPaneRef}
              className={cn(
                "relative flex min-h-0 self-stretch xl:h-full xl:shrink-0 xl:transition-[width] xl:duration-200",
                isSidebarCollapsed ? "xl:w-0" : "xl:w-[var(--question-bank-builder-sidebar-width)]",
              )}
              style={
                {
                  "--question-bank-builder-sidebar-width": `${sidebarWidth}px`,
                } as CSSProperties
              }
            >
              <div
                data-tour-id="builder-sidebar"
                className={cn(
                  "flex h-full min-h-0 overflow-hidden rounded-[24px] border border-[rgba(55,53,47,0.08)] bg-[#fbfbf8] xl:w-full xl:transition-[opacity,transform] xl:duration-200",
                  isSidebarCollapsed
                    ? "xl:pointer-events-none xl:-translate-x-8 xl:opacity-0"
                    : "xl:translate-x-0 xl:opacity-100",
                )}
              >
                <QuestionBankSearchSidebar
                  tab={sidebarTab}
                  filters={filters}
                  results={effectiveSearchResults}
                  loading={effectiveSearchLoading}
                  errorText={effectiveSearchErrorText}
                  importedExerciseIds={importedExerciseIds}
                  materials={materials}
                  materialQuery={materialQuery}
                  materialLoading={materialLoading}
                  materialErrorText={materialErrorText}
                  selectedMaterialId={selectedMaterialId}
                  selectedMaterialLabel={materialScopeLabel}
                  sections={sortedSections}
                  questions={sortedQuestions}
                  activeQuestionId={activeQuestionId}
                  activeSectionId={activeSectionId}
                  importTargetSectionId={importTargetSectionId}
                  onChangeTab={setSidebarTab}
                  onChangeFilters={(patch) =>
                    setFilters((current) => ({
                      ...current,
                      ...patch,
                    }))
                  }
                  onChangeMaterialQuery={setMaterialQuery}
                  materialSourceScope={materialSourceScope}
                  onChangeMaterialSourceScope={setMaterialSourceScope}
                  materialCourse={materialCourse}
                  materialUnit={materialUnit}
                  onChangeMaterialCourse={(value) => {
                    setMaterialCourse(value);
                    setMaterialUnit("");
                  }}
                  onChangeMaterialUnit={setMaterialUnit}
                  onSelectMaterial={handleSelectMaterial}
                  onChangeImportTargetSectionId={setImportTargetSectionId}
                  onAddResult={(item) =>
                    addResultToWorksheet(item, importTargetSectionId)
                  }
                  onAddResults={(items) =>
                    addManyResultsToWorksheet(items, importTargetSectionId)
                  }
                  onNavigateQuestion={navigateQuestion}
                  onNavigateSection={navigateSection}
                  onAddSection={() => addSection()}
                  onRenameSection={renameSection}
                  onDeleteSection={deleteSection}
                  hasMore={searchHasMore}
                  loadingMore={searchLoadingMore}
                  onLoadMore={loadMoreSearchResults}
                  onDragStartItem={setDraggedItem}
                  />
              </div>
              {!isSidebarCollapsed ? (
                <div
                  role="separator"
                  aria-orientation="vertical"
                  onPointerDown={beginSidebarResize}
                  className={cn(
                    "absolute inset-y-0 right-[-10px] hidden w-5 cursor-col-resize xl:block",
                    isResizingSidebar ? "bg-transparent" : "bg-transparent",
                  )}
                >
                  <div
                    className={cn(
                      "absolute inset-y-6 left-1/2 w-2 -translate-x-1/2 rounded-full border border-[rgba(55,53,47,0.08)] bg-[#f6f6f2] transition",
                      isResizingSidebar
                        ? "opacity-0"
                        : "opacity-100 hover:bg-[#ecebe5]",
                    )}
                  />
                </div>
              ) : null}
            </div>

            <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-[rgba(55,53,47,0.08)] bg-white">
              <div className="shrink-0 bg-white">
                <WorksheetHeader
                  title={draft.title}
                  description={draft.description}
                  duration={draft.duration}
                  onTitleChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      title: value,
                    }))
                  }
                  onDescriptionChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      description: value,
                    }))
                  }
                  onDurationChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      duration: value,
                    }))
                  }
                />
              </div>
              <div
                data-paginated-scroll
                data-tour-id="builder-editor"
                className="min-h-0 flex-1 overflow-x-visible overflow-y-auto bg-[#f7f6f3] px-4 py-5 md:px-6 xl:px-8"
              >
                <PaginatedEditor
                  questions={draft.questions}
                  sections={draft.sections}
                  title={draft.title}
                  onPageCountChange={setDraftPageCount}
                  activeQuestionId={activeQuestionId}
                  activeSectionId={activeSectionId}
                  expandedQuestionId={expandedQuestionId}
                  onFocusQuestion={handleFocusQuestion}
                  onExpandQuestion={handleExpandQuestion}
                  onUpdateQuestion={updateQuestion}
                  onRemoveQuestion={removeQuestion}
                  onSearchReplacements={handleSearchReplacements}
                  onConfirmReplace={handleConfirmReplace}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDropBefore={handleDropBefore}
                  onMoveQuestion={moveQuestion}
                  canMoveUp={checkCanMoveUp}
                  canMoveDown={checkCanMoveDown}
                  onAddBlankAfter={addBlankAfterQuestion}
                  onAddSection={addSection}
                  onRenameSection={renameSection}
                  onDeleteSection={deleteSection}
                  externalDropActive={Boolean(draggedItem)}
                />
              </div>
            </section>

            {/* AI edge tab — right side trigger (visible when panel closed) */}
            {!aiPanelOpen ? (
              <button
                type="button"
                onClick={() => setAiPanelOpen(true)}
                className="hidden xl:flex absolute right-0 top-1/2 -translate-y-1/2 z-20 flex-col items-center gap-1.5 rounded-l-[6px] border-[0.5px] border-r-0 border-[rgba(0,0,0,0.08)] bg-white px-1.5 py-4 shadow-[-2px_0_8px_rgba(0,0,0,0.04)] transition-all duration-[120ms] hover:bg-[#5E6AD2] hover:text-white hover:shadow-[-2px_0_12px_rgba(94,106,210,0.2)] text-[#5E6AD2] group"
              >
                <Sparkles className="h-4 w-4" />
                <span className="text-[10px] font-medium tracking-wide [writing-mode:vertical-lr]">AI</span>
              </button>
            ) : null}

            {/* AI Panel — push layout, not overlay (xl+ only) */}
            <div
              className={cn(
                "hidden xl:flex min-h-0 self-stretch shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden",
                aiPanelOpen ? "w-[380px]" : "w-0",
              )}
            >
              <div className={cn(
                "flex h-full w-[380px] min-w-[380px] flex-col rounded-[6px] border-[0.5px] border-[rgba(0,0,0,0.08)] bg-white transition-opacity duration-200",
                aiPanelOpen ? "opacity-100" : "opacity-0",
              )}>
                {/* Panel header */}
                <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
                  <div>
                    <h2 className="text-[13px] font-medium text-[#1D1D1F]">
                      {isZh ? "AI 组卷助手" : "AI Worksheet Assistant"}
                    </h2>
                    <p className="mt-0.5 text-[12px] text-[#9B9DA4]">
                      {isZh ? "搜索题目并导入到编辑台" : "Search and import questions"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAiPanelOpen(false)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[4px] text-[#9B9DA4] transition-colors duration-[120ms] hover:bg-[#F7F7F7] hover:text-[#1D1D1F]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {/* Panel body */}
                <div className="flex min-h-0 flex-1 flex-col">
                  {aiPanelOpen ? (
                    <AiAssemblePanel
                      embedded
                      assemblePrompt={assemblePrompt}
                      assembleLoading={assembleLoading}
                      assembleStatusText={assembleStatusText}
                      assembleErrorText={assembleErrorText}
                      assembleResults={assembleResults}
                      selectedIds={assembleSelectedIds}
                      onAssemblePromptChange={setAssemblePrompt}
                      onRunAssemble={() => void runAiAssemble()}
                      onToggleSelect={handleToggleAssembleSelect}
                      onImportSelected={handleImportAssembleSelected}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile AI Panel — overlay for small screens */}
      {aiPanelOpen ? (
        <div className="pointer-events-none fixed inset-y-0 right-0 z-40 flex w-full justify-end p-4 xl:hidden">
          <div
            className="pointer-events-auto relative flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-[rgba(55,53,47,0.08)] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.16)]"
            style={{ width: aiPanelWidth, minWidth: 320, maxWidth: "90vw" }}
          >
            {/* 左边缘拖拽把手 */}
            <div
              className="absolute inset-y-0 left-[-6px] z-10 w-3 cursor-col-resize"
              onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
                event.preventDefault();
                aiPanelResizeRef.current = { startX: event.clientX, startWidth: aiPanelWidth };
                const onMove = (moveEvent: PointerEvent) => {
                  const delta = aiPanelResizeRef.current.startX - moveEvent.clientX;
                  const next = Math.max(320, Math.min(aiPanelResizeRef.current.startWidth + delta, window.innerWidth * 0.9));
                  setAiPanelWidth(next);
                };
                const onUp = () => {
                  document.removeEventListener("pointermove", onMove);
                  document.removeEventListener("pointerup", onUp);
                  document.body.style.userSelect = "";
                };
                document.body.style.userSelect = "none";
                document.addEventListener("pointermove", onMove);
                document.addEventListener("pointerup", onUp);
              }}
            >
              <div className="absolute inset-y-6 left-1/2 w-1.5 -translate-x-1/2 rounded-full bg-[#37352F]/10 opacity-0 transition hover:opacity-100" />
            </div>
            <div className="flex items-center justify-between border-b border-[rgba(55,53,47,0.08)] px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-[#37352F]">
                  {isZh ? "AI 组卷助手" : "AI Worksheet Assistant"}
                </h2>
                <p className="mt-0.5 text-xs text-[#37352F]/50">
                  {isZh ? "搜索题目，勾选后导入到编辑台。" : "Search questions and import the ones you select."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAiPanelOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(55,53,47,0.1)] bg-white text-[#37352F]/65 transition hover:bg-[#faf8f3]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <AiAssemblePanel
                embedded
                assemblePrompt={assemblePrompt}
                assembleLoading={assembleLoading}
                assembleStatusText={assembleStatusText}
                assembleErrorText={assembleErrorText}
                assembleResults={assembleResults}
                selectedIds={assembleSelectedIds}
                onAssemblePromptChange={setAssemblePrompt}
                onRunAssemble={() => void runAiAssemble()}
                onToggleSelect={handleToggleAssembleSelect}
                onImportSelected={handleImportAssembleSelected}
              />
            </div>
          </div>
        </div>
      ) : null}

      {showLeavePrompt ? (
        <div
          data-testid="worksheet-leave-prompt"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(17,24,39,0.32)] px-4"
        >
          <div className="w-full max-w-[440px] rounded-[24px] border border-[rgba(55,53,47,0.08)] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
            <h2 className="text-lg font-semibold text-[#37352F]">
              {isZh ? "当前组卷内容尚未保存" : "This worksheet has unsaved changes"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#37352F]/68">
              {isZh
                ? "如果现在离开编辑台，当前修改可能会丢失。你可以先保存到内容库，或选择不保存直接离开。"
                : "If you leave the builder now, your current edits may be lost. Save to the library first, or leave without saving."}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                data-testid="worksheet-leave-prompt-exit"
                onClick={dismissLeavePrompt}
                disabled={savingDraft}
                className="inline-flex items-center justify-center rounded-xl border border-[rgba(55,53,47,0.12)] bg-white px-4 py-2 text-sm text-[#37352F]/70 transition hover:bg-[#faf8f3] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isZh ? "取消" : "Cancel"}
              </button>
              <button
                type="button"
                data-testid="worksheet-leave-prompt-discard"
                onClick={handleLeaveWithoutSave}
                disabled={savingDraft}
                className="inline-flex items-center justify-center rounded-xl border border-[rgba(55,53,47,0.12)] bg-white px-4 py-2 text-sm text-[#37352F]/70 transition hover:bg-[#faf8f3] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isZh ? "不保存" : "Don't save"}
              </button>
              <button
                type="button"
                data-testid="worksheet-leave-prompt-save"
                onClick={() => void handleSaveBeforeLeave()}
                disabled={savingDraft}
                className="inline-flex items-center justify-center rounded-xl bg-[#37352F] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#37352F]/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingDraft
                  ? isZh
                    ? "保存中..."
                    : "Saving..."
                  : isZh
                    ? "保存"
                    : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 拖拽浮层 */}
      <DragOverlay>
        {draggedItem ? (
          <div className="w-[300px] rounded-[6px] border-[0.5px] border-[#5E6AD2] bg-white p-3 shadow-[0_8px_24px_rgba(94,106,210,0.2)] opacity-90">
            <p className="line-clamp-2 text-[13px] font-medium text-[#1D1D1F]">
              {draggedItem.questionText?.replace(/<[^>]*>/g, "").slice(0, 100)}
            </p>
            <div className="mt-1.5 flex gap-1.5 text-[11px]">
              <span className="rounded-full bg-[#5E6AD2]/10 px-2 py-0.5 text-[#5E6AD2]">
                {draggedItem.exerciseType}
              </span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </div>
    </DragDropProvider>
  );
}
