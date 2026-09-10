"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import type {
  LessonIntentResult,
  LessonPlanListSort,
  LessonPlanListStatus,
  LessonPlanDocument,
  LessonPlanPreferences,
  LessonPlanSection,
  OutlineResult,
  PublicLessonPlanSummary,
} from "@/lib/lesson-plan/types";
import { parseLessonUiParts } from "@/lib/api/ui-message-stream";
import { buildLessonPlanDocumentFromStructured } from "@/lib/doc-engine/adapters";
import { buildDocumentArticleHtml } from "@/lib/doc-engine/document-article-html";
import { exportDocumentPdfBlob } from "@/lib/doc-engine/client-pdf-export";
import {
  StudioHeader,
  StudioSidebar,
  PlansDrawer,
  SettingsDrawer,
  ChatPanel,
  IntentConfirmCard,
  OutlinePanel,
  SectionEditor,
} from "./studio";
import type { LessonPlanExportOptions } from "./studio/StudioHeader";
import { Button } from "@heroui/react";

type SaveState = "idle" | "saving" | "saved" | "error";

type ChatEntry = {
  role: "assistant" | "teacher";
  text: string;
};

const DEFAULT_PREFERENCES: LessonPlanPreferences = {
  durationMinutes: 45,
  studentLevel: "medium",
  languagePref: "follow",
  templateKind: "concept",
  quizDensity: "medium",
  explanationDepth: "standard",
  includeExtension: false,
  showCedCodes: true,
  includeTeacherNotes: false,
};

function extractError(payload: unknown, fallback: string) {
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

async function getJson<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) {
    throw new Error(extractError(payload, `请求失败（${response.status}）`));
  }
  return payload as T;
}

async function sendJson<T>(url: string, method: "POST" | "PUT" | "DELETE", body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) {
    throw new Error(extractError(payload, `请求失败（${response.status}）`));
  }
  return payload as T;
}

async function extractResponseError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({}))) as unknown;
  return extractError(payload, fallback);
}

function readStreamPartData(part: unknown) {
  const candidate =
    part && typeof part === "object" && "data" in part
      ? (part as { data?: unknown }).data
      : undefined;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? (candidate as Record<string, unknown>)
    : {};
}

function upsertLessonSection(
  currentSections: LessonPlanSection[],
  section: LessonPlanSection,
) {
  const exists = currentSections.some((item) => item.id === section.id);
  const nextSections = exists
    ? currentSections.map((item) => (item.id === section.id ? section : item))
    : [...currentSections, section];
  return nextSections.sort((a, b) => a.sortOrder - b.sortOrder);
}

type LessonPlanStudioProps = {
  embedded?: boolean;
  initialPrompt?: string;
  onInitialPromptConsumed?: () => void;
};

export default function LessonPlanStudio({
  embedded = false,
  initialPrompt = "",
  onInitialPromptConsumed,
}: LessonPlanStudioProps) {
  const searchParams = useSearchParams();
  const requestedPlanId = searchParams.get("planId")?.trim() ?? "";
  const [plans, setPlans] = useState<PublicLessonPlanSummary[]>([]);
  const [planQuery, setPlanQuery] = useState("");
  const [planStatus, setPlanStatus] = useState<LessonPlanListStatus>("active");
  const [planSort, setPlanSort] = useState<LessonPlanListSort>("updated_desc");
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const [isBulkOperating, setIsBulkOperating] = useState(false);
  const [lessonPlan, setLessonPlan] = useState<LessonPlanDocument | null>(null);
  const [preferences, setPreferences] = useState<LessonPlanPreferences>(DEFAULT_PREFERENCES);
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [chat, setChat] = useState<ChatEntry[]>([
    { role: "assistant", text: "请输入一句话教学需求，我会先做 CED 匹配确认，再生成大纲和完整教案。" },
  ]);
  const [intent, setIntent] = useState<LessonIntentResult | null>(null);
  const [outline, setOutline] = useState<OutlineResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [rewriteInstruction, setRewriteInstruction] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [plansDrawerOpen, setPlansDrawerOpen] = useState(false);

  const skipAutoSaveRef = useRef(false);
  const dirtyTickRef = useRef(0);
  const autoOpenedPlanIdRef = useRef("");
  const [dirtyTick, setDirtyTick] = useState(0);

  const addAssistant = useCallback((text: string) => {
    setChat((prev) => [...prev, { role: "assistant", text }]);
  }, []);

  const addTeacher = useCallback((text: string) => {
    setChat((prev) => [...prev, { role: "teacher", text }]);
  }, []);

  const activeSection = useMemo(() => {
    if (!lessonPlan) return null;
    if (!selectedSectionId) return lessonPlan.sections[0] ?? null;
    return lessonPlan.sections.find((s) => s.id === selectedSectionId) ?? null;
  }, [lessonPlan, selectedSectionId]);

  const refreshPlans = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("status", planStatus);
      if (planQuery.trim()) {
        params.set("q", planQuery.trim());
      }
      params.set("limit", "200");
      params.set("offset", "0");
      params.set("sort", planSort);

      const data = await getJson<{ lessonPlans: PublicLessonPlanSummary[] }>(
        `/api/lesson-plans?${params.toString()}`,
      );
      setPlans(data.lessonPlans);
    } catch {
      /* ignore */
    }
  }, [planQuery, planSort, planStatus]);

  const refreshPreferences = useCallback(async () => {
    try {
      const data = await getJson<{ preferences: LessonPlanPreferences }>("/api/lesson-plans/preferences");
      setPreferences(data.preferences);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshPlans();
    void refreshPreferences();
  }, [refreshPlans, refreshPreferences]);

  useEffect(() => {
    setSelectedPlanIds((current) =>
      current.filter((id) => plans.some((plan) => plan.id === id)),
    );
  }, [plans]);

  const markDirty = useCallback(() => {
    dirtyTickRef.current += 1;
    setDirtyTick(dirtyTickRef.current);
  }, []);

  const mutateLessonPlan = useCallback(
    (updater: (current: LessonPlanDocument) => LessonPlanDocument) => {
      setLessonPlan((prev) => {
        if (!prev) return prev;
        return { ...updater(prev), updatedAt: new Date().toISOString() };
      });
      markDirty();
    },
    [markDirty],
  );

  const persistLessonPlan = useCallback(async () => {
    if (!lessonPlan) return;
    setSaveState("saving");
    try {
      const data = await sendJson<{ lessonPlan: LessonPlanDocument }>(
        `/api/lesson-plans/${lessonPlan.id}`,
        "PUT",
        {
          title: lessonPlan.title,
          sourcePrompt: lessonPlan.sourcePrompt,
          subjectLabel: lessonPlan.subjectLabel,
          courseId: lessonPlan.courseId,
          unitId: lessonPlan.unitId,
          topicIds: lessonPlan.topicIds,
          learningObjectiveCodes: lessonPlan.learningObjectiveCodes,
          essentialKnowledge: lessonPlan.essentialKnowledge,
          preferences: lessonPlan.preferences,
          sections: lessonPlan.sections,
        },
      );
      skipAutoSaveRef.current = true;
      setLessonPlan(data.lessonPlan);
      setSaveState("saved");
      await refreshPlans();
    } catch {
      setSaveState("error");
    }
  }, [lessonPlan, refreshPlans]);

  useEffect(() => {
    if (!lessonPlan) return;
    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
      return;
    }
    if (dirtyTick === 0) return;
    const timer = setTimeout(() => void persistLessonPlan(), 900);
    return () => clearTimeout(timer);
  }, [dirtyTick, lessonPlan, persistLessonPlan]);

  useEffect(() => {
    if (!lessonPlan || saveState !== "error") return;
    const retryTimer = setTimeout(() => {
      void persistLessonPlan();
    }, 2500);
    return () => clearTimeout(retryTimer);
  }, [lessonPlan, saveState, persistLessonPlan]);

  useEffect(() => {
    if (!lessonPlan) return;
    const shouldWarn = saveState === "saving" || saveState === "error";
    if (!shouldWarn) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [lessonPlan, saveState]);

  const openPlan = useCallback(
    async (planId: string) => {
      setIsLoading(true);
      try {
        const data = await getJson<{ lessonPlan: LessonPlanDocument }>(
          `/api/lesson-plans/${planId}`,
        );
        skipAutoSaveRef.current = true;
        setLessonPlan(data.lessonPlan);
        setSelectedSectionId(data.lessonPlan.sections[0]?.id ?? null);
        setOutline({
          title: data.lessonPlan.title,
          sections: data.lessonPlan.sections.map((s) => ({
            id: s.id,
            title: s.title,
            summary: s.summary,
            durationMinutes: s.durationMinutes,
            keyPoints: [],
          })),
        });
        setIntent(null);
        setSelectedPlanIds([]);
        addAssistant(`已打开教案：${data.lessonPlan.title}`);
      } catch (error) {
        addAssistant(error instanceof Error ? error.message : "打开教案失败");
      } finally {
        setIsLoading(false);
      }
    },
    [addAssistant],
  );

  useEffect(() => {
    if (!requestedPlanId) {
      autoOpenedPlanIdRef.current = "";
      return;
    }
    if (lessonPlan?.id === requestedPlanId) {
      autoOpenedPlanIdRef.current = requestedPlanId;
      return;
    }
    if (autoOpenedPlanIdRef.current === requestedPlanId) return;

    autoOpenedPlanIdRef.current = requestedPlanId;
    void openPlan(requestedPlanId);
  }, [lessonPlan?.id, openPlan, requestedPlanId]);

  const handleIntent = useCallback(async () => {
    const text = prompt.trim();
    if (!text) return;
    setIsLoading(true);
    addTeacher(text);
    try {
      const data = await sendJson<{
        intent: LessonIntentResult;
        basePreferences: LessonPlanPreferences;
      }>("/api/lesson-plans/intent", "POST", { message: text });
      setIntent(data.intent);
      setPreferences(data.basePreferences);
      setPrompt("");
      if (data.intent.needsClarification) {
        addAssistant(data.intent.questions.join("\n"));
      } else {
        const topicNames = data.intent.confirmation.topics.map((t) => t.title).join(" / ");
        addAssistant(
          `已匹配：${data.intent.confirmation.subject.name} Unit ${data.intent.confirmation.unit.unitNumber} · ${topicNames}`,
        );
      }
    } catch (error) {
      addAssistant(error instanceof Error ? error.message : "解析失败");
    } finally {
      setIsLoading(false);
    }
  }, [addAssistant, addTeacher, prompt]);

  const initialPromptConsumedRef = useRef(false);

  useEffect(() => {
    if (!initialPrompt || initialPromptConsumedRef.current) return;
    initialPromptConsumedRef.current = true;
    onInitialPromptConsumed?.();
    void handleIntent();
  }, [initialPrompt, handleIntent, onInitialPromptConsumed]);

  const handleGenerateOutline = useCallback(async () => {
    if (!intent || intent.needsClarification) {
      addAssistant("请先完成意图确认。");
      return;
    }
    setIsLoading(true);
    try {
      const titleHint = `${intent.confirmation.subject.name} Unit ${intent.confirmation.unit.unitNumber} · ${intent.confirmation.topics[0]?.title ?? "Lesson"}`;
      const data = await sendJson<{ outline: OutlineResult }>(
        "/api/lesson-plans/outline",
        "POST",
        {
          sourcePrompt:
            chat.filter((c) => c.role === "teacher").slice(-1)[0]?.text ?? "",
          titleHint,
          confirmation: { ...intent.confirmation, preferences },
        },
      );
      setOutline(data.outline);
      addAssistant("大纲已生成，你可以先微调标题和顺序，再开始内容填充。");
    } catch (error) {
      addAssistant(error instanceof Error ? error.message : "大纲生成失败");
    } finally {
      setIsLoading(false);
    }
  }, [addAssistant, chat, intent, preferences]);

  const handleGenerateContent = useCallback(async () => {
    if (!intent || intent.needsClarification || !outline) {
      addAssistant("请先完成意图确认并生成大纲。");
      return;
    }
    setIsGenerating(true);
    try {
      const response = await fetch("/api/lesson-plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePrompt:
            chat.filter((c) => c.role === "teacher").slice(-1)[0]?.text ?? "",
          confirmation: { ...intent.confirmation, preferences },
          outline,
          enableWebSearch,
        }),
      });
      if (!response.ok || !response.body) {
        throw new Error(await extractResponseError(response, "流式生成启动失败"));
      }

      let currentPlanId: string | null = null;
      let currentSections: LessonPlanSection[] = [];
      let generationCompleted = false;
      let generationFailed = false;
      for await (const part of parseLessonUiParts(response)) {
        const data = readStreamPartData(part);
        if (part.type === "data-lesson-meta") {
          currentPlanId = typeof data.planId === "string" ? data.planId : null;
          currentSections = [];
          skipAutoSaveRef.current = true;
          setLessonPlan({
            id: currentPlanId ?? `pending-${Date.now()}`,
            title: typeof data.title === "string" ? data.title : outline.title,
            sourcePrompt: chat.filter((c) => c.role === "teacher").slice(-1)[0]?.text ?? "",
            subjectLabel: `${intent.confirmation.subject.name} · Unit ${intent.confirmation.unit.unitNumber}`,
            courseId: intent.confirmation.subject.courseId,
            unitId: intent.confirmation.unit.id,
            topicIds: intent.confirmation.topics.map((t) => t.id),
            learningObjectiveCodes: intent.confirmation.topics.flatMap((t) =>
              t.learningObjectives.map((o) => o.code),
            ),
            essentialKnowledge: intent.confirmation.topics.flatMap((t) => t.essentialKnowledge),
            preferences,
            status: "draft",
            publishedSlug: null,
            publishedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sections: [],
          });
          setSelectedSectionId(null);
        }

        if (part.type === "data-lesson-section") {
          const section = data.section as LessonPlanSection;
          const progress = typeof data.progress === "number" ? data.progress : 0;
          const isDraft = data.draft === true;
          currentSections = upsertLessonSection(currentSections, section);
          skipAutoSaveRef.current = true;
          setLessonPlan((prev) => (prev ? { ...prev, sections: currentSections } : prev));
          setSelectedSectionId((current) => current ?? section.id);
          if (!isDraft) {
            addAssistant(`已生成章节：${section.title}（${progress}%）`);
          }
        }

        if (part.type === "data-lesson-warning" && typeof data.message === "string") {
          addAssistant(data.message);
        }

        if (part.type === "data-lesson-complete") {
          generationCompleted = true;
          addAssistant("完整教案已生成，已进入草稿编辑状态。");
          if (currentPlanId) void refreshPlans();
        }

        if (part.type === "error") {
          generationFailed = true;
          addAssistant(`生成失败：${part.errorText}`);
        }
      }

      if (currentPlanId) {
        const latest = await getJson<{ lessonPlan: LessonPlanDocument }>(
          `/api/lesson-plans/${currentPlanId}`,
        );
        skipAutoSaveRef.current = true;
        setLessonPlan(latest.lessonPlan);
        setSelectedSectionId(
          (c) => c ?? latest.lessonPlan.sections[0]?.id ?? null,
        );
        await refreshPlans();

        if (!generationCompleted && outline.sections.length > latest.lessonPlan.sections.length) {
          const done = latest.lessonPlan.sections.length;
          const total = outline.sections.length;
          addAssistant(`生成中断：已完成 ${done}/${total} 个章节，可点击“继续生成”接续。`);
        } else if (generationFailed && outline.sections.length > latest.lessonPlan.sections.length) {
          addAssistant("生成中断：你可以直接编辑已完成内容，或点击“继续生成”补全剩余章节。");
        }
      }
    } catch (error) {
      addAssistant(error instanceof Error ? error.message : "生成失败");
    } finally {
      setIsGenerating(false);
    }
  }, [addAssistant, chat, enableWebSearch, intent, outline, preferences, refreshPlans]);

  const handleResumeGenerate = useCallback(async () => {
    if (!lessonPlan || !intent || intent.needsClarification || !outline) {
      addAssistant("当前没有可继续的生成任务。");
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch(`/api/lesson-plans/${lessonPlan.id}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePrompt: lessonPlan.sourcePrompt,
          confirmation: { ...intent.confirmation, preferences },
          outline,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(await extractResponseError(response, "继续生成启动失败"));
      }

      let currentSections = [...lessonPlan.sections];
      for await (const part of parseLessonUiParts(response)) {
        const data = readStreamPartData(part);
        if (part.type === "data-lesson-meta") {
          addAssistant(
            `继续生成：已完成 ${data.completedSections}/${data.totalSections}，正在补全剩余章节。`,
          );
        }

        if (part.type === "data-lesson-section") {
          const section = data.section as LessonPlanSection;
          const exists = currentSections.some((item) => item.id === section.id);
          currentSections = exists
            ? currentSections.map((item) => (item.id === section.id ? section : item))
            : [...currentSections, section];
          currentSections = currentSections.sort((a, b) => a.sortOrder - b.sortOrder);
          skipAutoSaveRef.current = true;
          setLessonPlan((prev) => (prev ? { ...prev, sections: currentSections } : prev));
          setSelectedSectionId((current) => current ?? section.id);
          addAssistant(
            `已补全章节：${section.title}（${data.completedSections}/${data.totalSections}）`,
          );
        }

        if (part.type === "data-lesson-warning" && typeof data.message === "string") {
          addAssistant(data.message);
        }

        if (part.type === "data-lesson-complete") {
          addAssistant("继续生成完成，教案已补全。");
        }

        if (part.type === "error") {
          addAssistant(`继续生成失败：${part.errorText}`);
        }
      }

      const latest = await getJson<{ lessonPlan: LessonPlanDocument }>(
        `/api/lesson-plans/${lessonPlan.id}`,
      );
      skipAutoSaveRef.current = true;
      setLessonPlan(latest.lessonPlan);
      setSelectedSectionId((current) => current ?? latest.lessonPlan.sections[0]?.id ?? null);
      await refreshPlans();
    } catch (error) {
      addAssistant(error instanceof Error ? error.message : "继续生成失败");
    } finally {
      setIsGenerating(false);
    }
  }, [addAssistant, intent, lessonPlan, outline, preferences, refreshPlans]);

  const handlePreview = useCallback(() => {
    if (!lessonPlan) return;
    if (!lessonPlan.publishedSlug) {
      addAssistant("草稿暂不支持公开预览，请先发布。");
      return;
    }
    window.open(`/lp/${lessonPlan.publishedSlug}`, "_blank", "noopener,noreferrer");
  }, [addAssistant, lessonPlan]);

  const handleCopy = useCallback(async () => {
    if (!lessonPlan) return;
    try {
      const data = await sendJson<{ lessonPlan: LessonPlanDocument }>(
        `/api/lesson-plans/${lessonPlan.id}/copy`,
        "POST",
      );
      skipAutoSaveRef.current = true;
      setLessonPlan(data.lessonPlan);
      setOutline({
        title: data.lessonPlan.title,
        sections: data.lessonPlan.sections.map((s) => ({
          id: s.id,
          title: s.title,
          summary: s.summary,
          durationMinutes: s.durationMinutes,
          keyPoints: [],
        })),
      });
      setSelectedSectionId(data.lessonPlan.sections[0]?.id ?? null);
      setIntent(null);
      addAssistant(`已复制教案：${data.lessonPlan.title}`);
      await refreshPlans();
    } catch (error) {
      addAssistant(error instanceof Error ? error.message : "复制失败");
    }
  }, [addAssistant, lessonPlan, refreshPlans]);

  const handleExportPdf = useCallback(
    async (options: LessonPlanExportOptions) => {
      if (!lessonPlan) return;
      setIsExportingPdf(true);
      try {
        const lessonPlanDocument = buildLessonPlanDocumentFromStructured(lessonPlan);
        const exportHtml = buildDocumentArticleHtml(lessonPlanDocument, options.mode) || "";
        await exportDocumentPdfBlob({
          html: exportHtml,
          title: lessonPlan.title || "lesson-plan",
          layoutConfig: {
            ...lessonPlanDocument.layoutConfig,
            pageSize: options.pageSize,
          },
        });
        addAssistant("教案 PDF 导出成功，已开始下载。");
      } catch (error) {
        addAssistant(error instanceof Error ? error.message : "教案 PDF 导出失败");
      } finally {
        setIsExportingPdf(false);
      }
    },
    [addAssistant, lessonPlan],
  );

  const handleArchive = useCallback(async () => {
    if (!lessonPlan) return;
    try {
      await sendJson<{ success: boolean }>(`/api/lesson-plans/${lessonPlan.id}/archive`, "POST");
      skipAutoSaveRef.current = true;
      setLessonPlan((prev) =>
        prev
          ? { ...prev, status: "archived", publishedSlug: null, publishedAt: null }
          : prev,
      );
      addAssistant("教案已归档。");
      await refreshPlans();
    } catch (error) {
      addAssistant(error instanceof Error ? error.message : "归档失败");
    }
  }, [addAssistant, lessonPlan, refreshPlans]);

  const handleRestore = useCallback(async () => {
    if (!lessonPlan) return;
    try {
      await sendJson<{ success: boolean }>(`/api/lesson-plans/${lessonPlan.id}/restore`, "POST");
      skipAutoSaveRef.current = true;
      setLessonPlan((prev) =>
        prev
          ? { ...prev, status: "draft", publishedSlug: null, publishedAt: null }
          : prev,
      );
      addAssistant("教案已恢复为草稿。");
      await refreshPlans();
    } catch (error) {
      addAssistant(error instanceof Error ? error.message : "恢复失败");
    }
  }, [addAssistant, lessonPlan, refreshPlans]);

  const togglePlanSelection = useCallback((planId: string) => {
    setSelectedPlanIds((current) =>
      current.includes(planId)
        ? current.filter((id) => id !== planId)
        : [...current, planId],
    );
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedPlanIds((current) => {
      const allVisibleSelected = plans.length > 0 && plans.every((plan) => current.includes(plan.id));
      if (allVisibleSelected) {
        return current.filter((id) => !plans.some((plan) => plan.id === id));
      }
      const next = new Set(current);
      plans.forEach((plan) => next.add(plan.id));
      return Array.from(next);
    });
  }, [plans]);

  const clearSelection = useCallback(() => {
    setSelectedPlanIds([]);
  }, []);

  const handleBulkAction = useCallback(
    async (action: "archive" | "restore" | "delete") => {
      if (selectedPlanIds.length === 0) return;
      if (action === "delete" && !window.confirm(`确认删除 ${selectedPlanIds.length} 份教案吗？`)) {
        return;
      }

      setIsBulkOperating(true);
      try {
        const result = await sendJson<
          | { archivedIds: string[]; missingIds: string[] }
          | { restoredIds: string[]; missingIds: string[] }
          | { deletedIds: string[]; blockedPublishedIds: string[]; missingIds: string[] }
        >("/api/lesson-plans/bulk", "POST", {
          action,
          planIds: selectedPlanIds,
        });

        if (action === "archive") {
          const data = result as { archivedIds: string[]; missingIds: string[] };
          addAssistant(`批量归档完成：成功 ${data.archivedIds.length}，未找到 ${data.missingIds.length}。`);
        } else if (action === "restore") {
          const data = result as { restoredIds: string[]; missingIds: string[] };
          addAssistant(`批量恢复完成：成功 ${data.restoredIds.length}，未找到 ${data.missingIds.length}。`);
        } else {
          const data = result as {
            deletedIds: string[];
            blockedPublishedIds: string[];
            missingIds: string[];
          };
          addAssistant(
            `批量删除完成：删除 ${data.deletedIds.length}，已发布未删 ${data.blockedPublishedIds.length}，未找到 ${data.missingIds.length}。`,
          );
          if (lessonPlan && data.deletedIds.includes(lessonPlan.id)) {
            setLessonPlan(null);
            setOutline(null);
            setIntent(null);
            setSelectedSectionId(null);
          }
        }

        setSelectedPlanIds([]);
        await refreshPlans();
      } catch (error) {
        addAssistant(error instanceof Error ? error.message : "批量操作失败");
      } finally {
        setIsBulkOperating(false);
      }
    },
    [addAssistant, lessonPlan, refreshPlans, selectedPlanIds],
  );

  const handlePublish = useCallback(async () => {
    if (!lessonPlan) return;
    try {
      const data = await sendJson<{ slug: string; publicUrl: string }>(
        `/api/lesson-plans/${lessonPlan.id}/publish`,
        "POST",
      );
      skipAutoSaveRef.current = true;
      setLessonPlan((prev) =>
        prev
          ? { ...prev, status: "published", publishedSlug: data.slug, publishedAt: new Date().toISOString() }
          : prev,
      );
      addAssistant(`发布成功：${data.publicUrl}`);
      await refreshPlans();
    } catch (error) {
      addAssistant(error instanceof Error ? error.message : "发布失败");
    }
  }, [addAssistant, lessonPlan, refreshPlans]);

  const handleUnpublish = useCallback(async () => {
    if (!lessonPlan) return;
    try {
      await sendJson<{ success: boolean }>(
        `/api/lesson-plans/${lessonPlan.id}/unpublish`,
        "POST",
      );
      skipAutoSaveRef.current = true;
      setLessonPlan((prev) =>
        prev ? { ...prev, status: "draft", publishedSlug: null, publishedAt: null } : prev,
      );
      addAssistant("已取消发布。");
      await refreshPlans();
    } catch (error) {
      addAssistant(error instanceof Error ? error.message : "取消发布失败");
    }
  }, [addAssistant, lessonPlan, refreshPlans]);

  const handleDelete = useCallback(async () => {
    if (!lessonPlan) return;
    if (!window.confirm("确定删除这份教案吗？")) return;
    try {
      await sendJson<{ success: boolean }>(`/api/lesson-plans/${lessonPlan.id}`, "DELETE");
      setLessonPlan(null);
      setOutline(null);
      setIntent(null);
      setSelectedSectionId(null);
      addAssistant("教案已删除。");
      await refreshPlans();
    } catch (error) {
      addAssistant(error instanceof Error ? error.message : "删除失败");
    }
  }, [addAssistant, lessonPlan, refreshPlans]);

  const handleSinglePlanAction = useCallback(
    async (planId: string, action: "archive" | "restore" | "delete") => {
      if (action === "delete" && !window.confirm("确定删除这份教案吗？")) {
        return;
      }

      try {
        if (action === "archive") {
          await sendJson<{ success: boolean }>(`/api/lesson-plans/${planId}/archive`, "POST");
          if (lessonPlan?.id === planId) {
            skipAutoSaveRef.current = true;
            setLessonPlan((prev) =>
              prev
                ? { ...prev, status: "archived", publishedSlug: null, publishedAt: null }
                : prev,
            );
          }
          addAssistant("教案已归档。");
        }

        if (action === "restore") {
          await sendJson<{ success: boolean }>(`/api/lesson-plans/${planId}/restore`, "POST");
          if (lessonPlan?.id === planId) {
            skipAutoSaveRef.current = true;
            setLessonPlan((prev) =>
              prev
                ? { ...prev, status: "draft", publishedSlug: null, publishedAt: null }
                : prev,
            );
          }
          addAssistant("教案已恢复为草稿。");
        }

        if (action === "delete") {
          await sendJson<{ success: boolean }>(`/api/lesson-plans/${planId}`, "DELETE");
          if (lessonPlan?.id === planId) {
            setLessonPlan(null);
            setOutline(null);
            setIntent(null);
            setSelectedSectionId(null);
          }
          setSelectedPlanIds((current) => current.filter((id) => id !== planId));
          addAssistant("教案已删除。");
        }

        await refreshPlans();
      } catch (error) {
        addAssistant(error instanceof Error ? error.message : "教案操作失败");
      }
    },
    [addAssistant, lessonPlan?.id, refreshPlans],
  );

  const handleRewriteBlock = useCallback(
    async (blockId: string) => {
      if (!lessonPlan) return;
      const instruction = rewriteInstruction.trim();
      if (!instruction) {
        addAssistant("请先输入重写指令。");
        return;
      }
      try {
        const data = await sendJson<{ lessonPlan: LessonPlanDocument | null }>(
          `/api/lesson-plans/${lessonPlan.id}/rewrite-block`,
          "POST",
          { blockId, instruction },
        );
        if (data.lessonPlan) {
          skipAutoSaveRef.current = true;
          setLessonPlan(data.lessonPlan);
          setRewriteInstruction("");
          addAssistant("指定内容块已重写。");
        }
      } catch (error) {
        addAssistant(error instanceof Error ? error.message : "重写失败");
      }
    },
    [addAssistant, lessonPlan, rewriteInstruction],
  );

  const updateSection = useCallback(
    (sectionId: string, updater: (s: LessonPlanSection) => LessonPlanSection) => {
      mutateLessonPlan((current) => ({
        ...current,
        sections: current.sections.map((s) => (s.id === sectionId ? updater(s) : s)),
      }));
    },
    [mutateLessonPlan],
  );

  const moveSection = useCallback(
    (sectionId: string, direction: -1 | 1) => {
      mutateLessonPlan((current) => {
        const sections = [...current.sections].sort((a, b) => a.sortOrder - b.sortOrder);
        const index = sections.findIndex((s) => s.id === sectionId);
        if (index < 0) return current;
        const target = index + direction;
        if (target < 0 || target >= sections.length) return current;
        const temp = sections[index];
        sections[index] = sections[target];
        sections[target] = temp;
        return {
          ...current,
          sections: sections.map((s, i) => ({ ...s, sortOrder: i })),
        };
      });
    },
    [mutateLessonPlan],
  );

  const addSection = useCallback(() => {
    mutateLessonPlan((current) => ({
      ...current,
      sections: [
        ...current.sections,
        {
          id: crypto.randomUUID(),
          title: "新章节",
          summary: "",
          durationMinutes: 8,
          sortOrder: current.sections.length,
          blocks: [],
        },
      ],
    }));
  }, [mutateLessonPlan]);

  const handleNewPlan = useCallback(() => {
    setLessonPlan(null);
    setOutline(null);
    setIntent(null);
    setSelectedSectionId(null);
    setSelectedPlanIds([]);
    setPrompt("");
    setChat([
      { role: "assistant", text: "请输入一句话教学需求，我会先做 CED 匹配确认，再生成大纲和完整教案。" },
    ]);
  }, []);

  const hasConfirmedIntent = Boolean(intent && !intent.needsClarification);
  const hasOutline = Boolean(outline && outline.sections.length > 0);
  const canResumeGeneration = Boolean(
    lessonPlan &&
      intent &&
      !intent.needsClarification &&
      outline &&
      lessonPlan.sections.length < outline.sections.length,
  );

  return (
    <div className={`flex flex-col bg-default-100 dark:bg-slate-950 ${embedded ? "h-full" : "h-[calc(100vh-4rem)]"}`}>
      {/* Header */}
      <StudioHeader
        lessonPlan={lessonPlan}
        saveState={saveState}
        isGenerating={isGenerating}
        isExportingPdf={isExportingPdf}
        embedded={embedded}
        onPreview={handlePreview}
        onExportPdf={handleExportPdf}
        onCopy={() => void handleCopy()}
        onArchive={() => void handleArchive()}
        onRestore={() => void handleRestore()}
        onPublish={() => void handlePublish()}
        onUnpublish={() => void handleUnpublish()}
        onDelete={() => void handleDelete()}
        onOpenPlans={() => setPlansDrawerOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onTitleChange={(title) =>
          mutateLessonPlan((current) => ({ ...current, title }))
        }
      />

      {/* Main layout */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <StudioSidebar
          plans={plans}
          sections={lessonPlan?.sections ?? []}
          selectedSectionId={selectedSectionId}
          lessonPlanId={lessonPlan?.id ?? null}
          planQuery={planQuery}
          planStatus={planStatus}
          selectedPlanIds={selectedPlanIds}
          isBulkOperating={isBulkOperating}
          onSelectSection={setSelectedSectionId}
          onPlanQueryChange={setPlanQuery}
          onPlanStatusChange={setPlanStatus}
          onTogglePlanSelection={togglePlanSelection}
          onToggleSelectAllVisible={toggleSelectAllVisible}
          onClearSelection={clearSelection}
          onBulkAction={(action) => void handleBulkAction(action)}
          onOpenPlan={(id) => void openPlan(id)}
          onAddSection={addSection}
          onMoveSection={moveSection}
          onNewPlan={handleNewPlan}
          isLoading={isLoading}
        />

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-4xl space-y-6">
            {/* Chat Panel */}
            <ChatPanel
              chat={chat}
              prompt={prompt}
              onPromptChange={setPrompt}
              isLoading={isLoading}
              isGenerating={isGenerating}
              hasConfirmedIntent={hasConfirmedIntent}
              hasOutline={hasOutline}
              onSubmitIntent={() => void handleIntent()}
              onGenerateOutline={() => void handleGenerateOutline()}
              onGenerateContent={() => void handleGenerateContent()}
            />

            {canResumeGeneration && (
              <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/20">
                <span className="text-amber-700 dark:text-amber-300">
                  教案尚未完整生成，当前已完成 {lessonPlan?.sections.length ?? 0}/
                  {outline?.sections.length ?? 0} 个章节。
                </span>
                <Button
                  size="sm"
                  onPress={() => void handleResumeGenerate()}
                  isDisabled={isGenerating}
                  className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700"
                >
                  继续生成
                </Button>
              </div>
            )}

            {/* Intent Confirmation Card */}
            {intent && !intent.needsClarification && (
              <IntentConfirmCard
                intent={intent}
                outline={outline}
                preferences={preferences}
                onTitleChange={(title) =>
                  setOutline((current) =>
                    current
                      ? { ...current, title }
                      : { title, sections: [] },
                  )
                }
                onPreferencesChange={(partial) =>
                  setPreferences((prev) => ({ ...prev, ...partial }))
                }
              />
            )}

            {/* Outline Panel */}
            {outline && outline.sections.length > 0 && !lessonPlan && (
              <OutlinePanel outline={outline} onOutlineChange={setOutline} />
            )}

            {/* Section Editor */}
            {lessonPlan && activeSection && (
              <div className="rounded-2xl border border-divider bg-white p-5 shadow-xs dark:border-slate-700 dark:bg-slate-800">
                <SectionEditor
                  section={activeSection}
                  onUpdateSection={(updater) =>
                    updateSection(activeSection.id, updater)
                  }
                  onRewriteBlock={(blockId) => void handleRewriteBlock(blockId)}
                  rewriteInstruction={rewriteInstruction}
                  onRewriteInstructionChange={setRewriteInstruction}
                />
              </div>
            )}

            {lessonPlan && !activeSection && (
              <div className="rounded-2xl border-2 border-dashed border-divider p-12 text-center dark:border-slate-700">
                <p className="text-sm text-default-500 dark:text-default-400">
                  当前暂无章节，请先生成或在左侧添加新章节。
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Settings Drawer */}
      <SettingsDrawer
        open={settingsOpen}
        preferences={preferences}
        enableWebSearch={enableWebSearch}
        onChange={setPreferences}
        onEnableWebSearchChange={setEnableWebSearch}
        onClose={() => setSettingsOpen(false)}
      />

      <PlansDrawer
        open={plansDrawerOpen}
        plans={plans}
        lessonPlanId={lessonPlan?.id ?? null}
        isLoading={isLoading}
        planQuery={planQuery}
        planStatus={planStatus}
        planSort={planSort}
        selectedPlanIds={selectedPlanIds}
        isBulkOperating={isBulkOperating}
        onClose={() => setPlansDrawerOpen(false)}
        onOpenPlan={(id) => {
          setPlansDrawerOpen(false);
          void openPlan(id);
        }}
        onPlanQueryChange={setPlanQuery}
        onPlanStatusChange={setPlanStatus}
        onPlanSortChange={setPlanSort}
        onTogglePlanSelection={togglePlanSelection}
        onToggleSelectAllVisible={toggleSelectAllVisible}
        onClearSelection={clearSelection}
        onBulkAction={(action) => void handleBulkAction(action)}
        onSingleAction={(id, action) => void handleSinglePlanAction(id, action)}
        onNewPlan={() => {
          setPlansDrawerOpen(false);
          handleNewPlan();
        }}
      />
    </div>
  );
}
