"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileDown, FileText, Loader2, Plus, Sparkles } from "lucide-react";
import BuilderSearchPanel from "@/components/main/question-bank/builder/BuilderSearchPanel";
import {
  formatUnitOptionLabel,
  requestJson,
  type CourseOption,
  type CurriculumOptionsResponse,
  type UnitOption,
} from "@/components/main/question-bank/helpers";
import { documentHtmlToMarkdown } from "@/lib/worksheet/builder-export";
import { buildDocExportLayoutConfig } from "@/lib/worksheet/builder-store";
import { synchronizeWorksheetBuilderDraftFromHtml } from "@/lib/worksheet/builder-sync";
import type {
  WorksheetBuilderDetail,
  WorksheetBuilderDraft,
} from "@/lib/worksheet/builder-types";
import { cn } from "@/lib/utils";
import { useAppI18n } from "@/lib/app-i18n/provider";

const BuilderAiComposer = dynamic(
  () => import("@/components/main/question-bank/builder/BuilderAiComposer"),
  { loading: () => null },
);

const BuilderExportDialog = dynamic(
  () => import("@/components/main/question-bank/builder/BuilderExportDialog"),
  { loading: () => null },
);

const BuilderAiImportDialog = dynamic(
  () => import("@/components/main/question-bank/builder/BuilderAiImportDialog"),
  { loading: () => null },
);

const TiptapDocumentEditor = dynamic(
  () => import("@/components/doc-engine/TiptapDocumentEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-10 text-sm text-slate-500 shadow-xs">
        正在加载文档编辑器...
      </div>
    ),
  },
);

type WorksheetBuilderPageProps = {
  worksheetId?: string | null;
  initialCourseId?: string | null;
  initialUnitId?: string | null;
};

type BuilderListItem = {
  id: string;
  title: string;
  description: string | null;
  courseName: string | null;
  unitName: string | null;
  updatedAt: string;
};

type BuilderCreateResponse = {
  worksheet: {
    id: string;
  };
};

type BuilderImportResponse = {
  builderDraft: WorksheetBuilderDraft;
  addedIds: string[];
  skippedIds: string[];
};

type BuilderAiImportResponse = BuilderImportResponse & {
  searchQuery: string;
  matchedCount: number;
};

type BuilderExportFormat = "pdf" | "markdown" | "docx";
type DocxExportHandler = (options?: { fileName?: string }) => Promise<boolean>;

type BuilderSaveResponse = {
  worksheet: {
    id: string;
    title: string;
    description: string | null;
  };
  builderDraft: WorksheetBuilderDraft;
};

function extractError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const data = payload as Record<string, unknown>;
  if (typeof data.message === "string") return data.message;
  if (typeof data.error === "string") return data.error;
  if (data.error && typeof data.error === "object") {
    const nested = data.error as Record<string, unknown>;
    if (typeof nested.message === "string") return nested.message;
  }
  return fallback;
}

function slugifyFilename(value: string) {
  const normalized = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "worksheet-builder";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function buildWorksheetExportHtml(params: {
  html: string;
  title: string;
  description: string;
}) {
  const parser = new DOMParser();
  const document = parser.parseFromString(params.html, "text/html");
  const article =
    document.querySelector("article") ??
    (() => {
      const nextArticle = document.createElement("article");
      nextArticle.setAttribute("data-doc-type", "worksheet");
      nextArticle.innerHTML = document.body.innerHTML;
      document.body.innerHTML = "";
      document.body.appendChild(nextArticle);
      return nextArticle;
    })();

  if (!article.getAttribute("data-doc-type")) {
    article.setAttribute("data-doc-type", "worksheet");
  }

  let headerSection = article.querySelector('section[data-section="header"]');
  if (!(headerSection instanceof HTMLElement)) {
    headerSection = document.createElement("section");
    headerSection.setAttribute("data-section", "header");
    article.prepend(headerSection);
  }

  let heading = headerSection.querySelector("h1");
  if (!(heading instanceof HTMLElement)) {
    heading = document.createElement("h1");
    headerSection.appendChild(heading);
  }
  heading.textContent = params.title.trim() || "未命名组卷稿";

  const noteSelector = 'section[data-builder-export-note="true"]';
  const existingNote = article.querySelector(noteSelector);
  const nextDescription = params.description.trim();

  if (nextDescription) {
    const noteSection =
      existingNote instanceof HTMLElement ? existingNote : document.createElement("section");
    noteSection.setAttribute("data-builder-export-note", "true");
    noteSection.innerHTML = "";
    const paragraph = document.createElement("p");
    paragraph.textContent = nextDescription;
    noteSection.appendChild(paragraph);
    if (!(existingNote instanceof HTMLElement)) {
      if (headerSection.nextSibling) {
        article.insertBefore(noteSection, headerSection.nextSibling);
      } else {
        article.appendChild(noteSection);
      }
    }
  } else if (existingNote instanceof HTMLElement) {
    existingNote.remove();
  }

  return article.outerHTML;
}

function waitForEditorPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

export default function WorksheetBuilderPage({
  worksheetId,
  initialCourseId,
  initialUnitId,
}: WorksheetBuilderPageProps) {
  const { isZh } = useAppI18n();
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [recentItems, setRecentItems] = useState<BuilderListItem[]>([]);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(Boolean(worksheetId));
  const [detailReloadNonce, setDetailReloadNonce] = useState(0);
  const [detail, setDetail] = useState<WorksheetBuilderDetail | null>(null);
  const [builderTitle, setBuilderTitle] = useState("未命名组卷稿");
  const [builderDescription, setBuilderDescription] = useState("");
  const [currentHtml, setCurrentHtml] = useState("");
  const [saveState, setSaveState] =
    useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorText, setErrorText] = useState("");
  const [statusText, setStatusText] = useState("");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "markdown" | "docx" | null>(null);
  const [exportDocxHandler, setExportDocxHandler] =
    useState<DocxExportHandler | null>(null);
  const [exportDialogFormat, setExportDialogFormat] = useState<BuilderExportFormat | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportDialogTitle, setExportDialogTitle] = useState("未命名组卷稿");
  const [exportDialogFileName, setExportDialogFileName] = useState("worksheet-builder");
  const [exportDialogDescription, setExportDialogDescription] = useState("");
  const [aiComposerOpen, setAiComposerOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiImportOpen, setAiImportOpen] = useState(false);
  const [aiImportInstruction, setAiImportInstruction] = useState("");
  const [aiImportLoading, setAiImportLoading] = useState(false);

  const [createTitle, setCreateTitle] = useState("新建组卷稿");
  const [createDescription, setCreateDescription] = useState("");
  const [createCourseId, setCreateCourseId] = useState(initialCourseId ?? "");
  const [createUnitId, setCreateUnitId] = useState(initialUnitId ?? "");

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      requestJson<CurriculumOptionsResponse>("/api/curriculum/options", {
        retry: 2,
      }),
      requestJson<{ items: BuilderListItem[] }>("/api/worksheets/builder?limit=8", {
        retry: 2,
      }),
    ])
      .then(([curriculum, list]) => {
        if (cancelled) return;
        setCourses(curriculum.courses);
        setUnits(curriculum.units);
        setRecentItems(list.items);
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorText(error instanceof Error ? error.message : "加载 builder 入口失败");
      })
      .finally(() => {
        if (!cancelled) setLoadingBootstrap(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!worksheetId) return;

    let cancelled = false;
    setLoadingDetail(true);
    setErrorText("");

    requestJson<WorksheetBuilderDetail>(
      `/api/worksheets/builder/${encodeURIComponent(worksheetId)}`,
      {
        retry: 2,
      },
    )
      .then((payload) => {
        if (cancelled) return;
        setDetail(payload);
        setBuilderTitle(payload.title);
        setBuilderDescription(payload.description ?? "");
        setCurrentHtml(payload.builderDraft.html);
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorText(error instanceof Error ? error.message : "读取组卷稿失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detailReloadNonce, worksheetId]);

  const createFilteredUnits = useMemo(
    () => units.filter((unit) => !createCourseId || unit.course_id === createCourseId),
    [createCourseId, units],
  );

  useEffect(() => {
    if (createUnitId && !createFilteredUnits.some((unit) => unit.id === createUnitId)) {
      setCreateUnitId("");
    }
  }, [createFilteredUnits, createUnitId]);

  const buildWorkingDraft = useCallback(() => {
    if (!detail) return null;
    if (
      currentHtml === detail.builderDraft.html &&
      builderTitle.trim() === detail.title &&
      builderDescription.trim() === (detail.description ?? "")
    ) {
      return detail.builderDraft;
    }

    return synchronizeWorksheetBuilderDraftFromHtml({
      currentDraft: detail.builderDraft,
      html: currentHtml,
      title: builderTitle.trim() || detail.title,
      courseName: detail.courseName,
      unitName: detail.unitName,
    });
  }, [builderDescription, builderTitle, currentHtml, detail]);

  const workingDraft = useMemo(
    () => buildWorkingDraft(),
    [buildWorkingDraft],
  );
  const displayedQuestionInstances = useMemo(
    () => workingDraft?.questionInstances ?? [],
    [workingDraft],
  );

  const importedExerciseIds = useMemo(
    () => displayedQuestionInstances.map((instance) => instance.originExerciseId),
    [displayedQuestionInstances],
  );

  const persistDraft = async (
    nextHtml: string,
    overrides?: {
      title?: string;
      description?: string;
    },
  ) => {
    if (!detail) return null;
    const nextTitle = overrides?.title?.trim() || builderTitle.trim();
    const nextDescription = overrides?.description?.trim() || null;

    const response = await fetch(
      `/api/worksheets/builder/${encodeURIComponent(detail.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: nextTitle,
          description: nextDescription,
          documentHtml: nextHtml,
        }),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as unknown;

    if (!response.ok) {
      throw new Error(extractError(payload, "保存组卷稿失败"));
    }

    const data = payload as BuilderSaveResponse;
    setCurrentHtml(data.builderDraft.html);
    setBuilderTitle(data.worksheet.title);
    setBuilderDescription(data.worksheet.description ?? "");
    setDetail((current) =>
      current
        ? {
            ...current,
            title: data.worksheet.title,
            description: data.worksheet.description,
            builderDraft: data.builderDraft,
          }
        : current,
    );
    return data;
  };

  const openExportDialog = (format: BuilderExportFormat) => {
    const nextTitle = builderTitle.trim() || detail?.title || "未命名组卷稿";
    setExportDialogFormat(format);
    setExportDialogTitle(nextTitle);
    setExportDialogFileName(slugifyFilename(nextTitle));
    setExportDialogDescription(builderDescription);
    setExportDialogOpen(true);
  };

  const closeExportDialog = () => {
    setExportDialogOpen(false);
    setExportDialogFormat(null);
  };

  const handleExportDocxReady = useCallback((handler: DocxExportHandler | null) => {
    setExportDocxHandler(() => handler);
  }, []);

  const handleCreate = async () => {
    if (!createCourseId || !createTitle.trim() || creating) return;

    setCreating(true);
    setErrorText("");
    try {
      const payload = await requestJson<BuilderCreateResponse>("/api/worksheets/builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: createTitle.trim(),
          description: createDescription.trim() || undefined,
          courseId: createCourseId,
          unitId: createUnitId || undefined,
        }),
      });

      window.location.href = `/main/question-bank/builder/${encodeURIComponent(payload.worksheet.id)}`;
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "创建组卷稿失败");
      setCreating(false);
    }
  };

  const handleImportExercises = async (exerciseIds: string[]) => {
    if (!detail || importing) return;
    setImporting(true);
    setErrorText("");
    setStatusText("");

    try {
      const titleChanged = builderTitle.trim() !== detail.title;
      const descriptionChanged = builderDescription.trim() !== (detail.description ?? "");
      const htmlChanged = currentHtml !== detail.builderDraft.html;

      if (titleChanged || descriptionChanged || htmlChanged) {
        await persistDraft(currentHtml);
      }

      const payload = await requestJson<BuilderImportResponse>(
        `/api/worksheets/builder/${encodeURIComponent(detail.id)}/import-exercises`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exerciseIds }),
        },
      );

      const nextDetail = {
        ...detail,
        builderDraft: payload.builderDraft,
      };
      setDetail(nextDetail);
      setCurrentHtml(payload.builderDraft.html);
      setStatusText(
        payload.skippedIds.length > 0
          ? `已导入 ${payload.addedIds.length} 道题，跳过 ${payload.skippedIds.length} 道重复题。`
          : `已导入 ${payload.addedIds.length} 道题。`,
      );
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "导入题目失败");
    } finally {
      setImporting(false);
    }
  };

  const handleSave = async (nextHtml: string) => {
    if (!detail) return;
    setSaveState("saving");
    setErrorText("");
    setStatusText("");

    try {
      await persistDraft(nextHtml);
      setSaveState("saved");
      setStatusText("组卷稿已保存。");
      window.setTimeout(() => setSaveState("idle"), 1600);
    } catch (error) {
      setSaveState("error");
      setErrorText(error instanceof Error ? error.message : "保存组卷稿失败");
      window.setTimeout(() => setSaveState("idle"), 2200);
    }
  };

  const handleSubmitExportDialog = async () => {
    if (!detail || !exportDialogFormat || exporting) return;

    const nextTitle = exportDialogTitle.trim() || builderTitle.trim() || detail.title;
    const nextDescription = exportDialogDescription.trim();
    const fileStem = slugifyFilename(exportDialogFileName || nextTitle).replace(
      /\.(pdf|docx|md|markdown)$/i,
      "",
    );
    const nextFileName = `${fileStem}.${exportDialogFormat === "markdown" ? "md" : exportDialogFormat}`;
    const exportHtml = buildWorksheetExportHtml({
      html: currentHtml,
      title: nextTitle,
      description: nextDescription,
    });

    setExporting(exportDialogFormat);
    setErrorText("");
    setStatusText("");

    try {
      const titleChanged = nextTitle !== detail.title;
      const descriptionChanged = nextDescription !== (detail.description ?? "");
      const htmlChanged = currentHtml !== detail.builderDraft.html;

      if (titleChanged || descriptionChanged || htmlChanged) {
        await persistDraft(currentHtml, {
          title: nextTitle,
          description: nextDescription,
        });
      }

      if (exportDialogFormat === "pdf") {
        const response = await fetch("/api/doc/export-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            html: exportHtml,
            title: nextTitle,
            layoutConfig: buildDocExportLayoutConfig(detail.layoutConfig),
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as unknown;
          throw new Error(extractError(payload, "导出 PDF 失败"));
        }

        const blob = await response.blob();
        downloadBlob(blob, nextFileName);
      } else if (exportDialogFormat === "markdown") {
        const markdown = documentHtmlToMarkdown(exportHtml);
        downloadBlob(
          new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
          nextFileName,
        );
      } else {
        if (!exportDocxHandler) {
          throw new Error("Word 导出仍在初始化，请稍后重试。");
        }

        const originalHtml = currentHtml;
        let exported = false;
        try {
          setCurrentHtml(exportHtml);
          await waitForEditorPaint();
          exported = await exportDocxHandler({
            fileName: nextFileName,
          });
        } finally {
          setCurrentHtml(originalHtml);
          await waitForEditorPaint();
        }

        if (!exported) {
          throw new Error("Word 导出失败，请稍后重试。");
        }
      }

      setBuilderTitle(nextTitle);
      setBuilderDescription(nextDescription);
      closeExportDialog();
      setStatusText(`已导出 ${exportDialogFormat === "docx" ? "Word" : exportDialogFormat.toUpperCase()}。`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "导出失败");
    } finally {
      setExporting(null);
    }
  };

  const handleApplyAiEdit = async () => {
    if (!detail || aiLoading || !aiInstruction.trim()) return;

    setAiLoading(true);
    setSaveState("saving");
    setErrorText("");
    setStatusText("");

    try {
      const response = await fetch("/api/doc/edit-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editMode: "structure_edit",
          selectedHtml: currentHtml,
          instruction: aiInstruction.trim(),
          documentType: "worksheet",
          contextTag: "article",
          targetContainerTag: "article",
          targetContainerHtml: currentHtml,
          fullDocumentHtml: currentHtml,
          documentMeta: {
            artifactKind: "worksheet_builder",
            artifactTitle: builderTitle.trim() || detail.title,
            artifactSummary: builderDescription.trim() || detail.description || "",
            courseName: detail.courseName || "",
            unitName: detail.unitName || "",
          },
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as unknown;

      if (!response.ok) {
        throw new Error(extractError(payload, "AI 修改组卷稿失败"));
      }

      const payloadRecord = payload as Record<string, unknown>;
      const htmlCandidate =
        typeof payloadRecord.modifiedHtml === "string"
          ? payloadRecord.modifiedHtml
          : typeof payloadRecord.html === "string"
            ? payloadRecord.html
            : "";
      const nextHtml = htmlCandidate.trim().startsWith("<article")
        ? htmlCandidate.trim()
        : `<article data-doc-type="worksheet">${htmlCandidate.trim()}</article>`;

      if (!nextHtml.trim()) {
        throw new Error("AI 未返回有效内容。");
      }

      setCurrentHtml(nextHtml);
      await persistDraft(nextHtml);
      setAiComposerOpen(false);
      setAiInstruction("");
      setSaveState("saved");
      setStatusText("AI 已更新当前组卷稿。");
      window.setTimeout(() => setSaveState("idle"), 1600);
    } catch (error) {
      setSaveState("error");
      setErrorText(error instanceof Error ? error.message : "AI 修改组卷稿失败");
      window.setTimeout(() => setSaveState("idle"), 2200);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiImport = async () => {
    if (!detail || aiImportLoading || !aiImportInstruction.trim()) return;

    setAiImportLoading(true);
    setErrorText("");
    setStatusText("");

    try {
      const titleChanged = builderTitle.trim() !== detail.title;
      const descriptionChanged = builderDescription.trim() !== (detail.description ?? "");
      const htmlChanged = currentHtml !== detail.builderDraft.html;

      if (titleChanged || descriptionChanged || htmlChanged) {
        await persistDraft(currentHtml);
      }

      const payload = await requestJson<BuilderAiImportResponse>(
        `/api/worksheets/builder/${encodeURIComponent(detail.id)}/ai-import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instruction: aiImportInstruction.trim(),
          }),
        },
      );

      setDetail((current) =>
        current
          ? {
              ...current,
              builderDraft: payload.builderDraft,
            }
          : current,
      );
      setCurrentHtml(payload.builderDraft.html);
      setAiImportOpen(false);
      setAiImportInstruction("");
      setStatusText(
        payload.addedIds.length > 0
          ? `AI 已从题库导入 ${payload.addedIds.length} 道题。`
          : `AI 未找到可新增的题目。检索词：${payload.searchQuery}`,
      );
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "AI 从题库补题失败");
    } finally {
      setAiImportLoading(false);
    }
  };

  if (!worksheetId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-[#f7f5ef]">
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 py-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                Question Bank Builder
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900">{isZh ? "组卷编辑台" : "Worksheet Builder"}</h1>
              <p className="mt-2 text-sm text-slate-500">
                {isZh ? "先创建一份组卷稿，再从左侧题库持续导题、编辑和导出。" : "Create a worksheet draft, then import questions from the bank, edit, and export."}
              </p>
            </div>
            <Link
              href="/main/question-bank"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              {isZh ? "返回题库" : "Back to bank"}
            </Link>
          </div>

          {errorText ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {errorText}
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-xs">
              <h2 className="text-lg font-semibold text-slate-900">新建组卷稿</h2>
              <p className="mt-2 text-sm text-slate-500">
                第一版会在现有 worksheet 实体上保存 builder 草稿，后续可继续增强为结构化题目节点。
              </p>

              <div className="mt-6 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">标题</span>
                  <input
                    value={createTitle}
                    onChange={(event) => setCreateTitle(event.target.value)}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-hidden ring-0 placeholder:text-slate-400"
                    placeholder="例如：Unit 3 Quiz Draft"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">描述</span>
                  <textarea
                    value={createDescription}
                    onChange={(event) => setCreateDescription(event.target.value)}
                    rows={4}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-hidden placeholder:text-slate-400"
                    placeholder="可选。描述本次组卷目标、班级或用途。"
                  />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-slate-700">课程</span>
                    <select
                      value={createCourseId}
                      onChange={(event) => setCreateCourseId(event.target.value)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-hidden"
                    >
                      <option value="">请选择课程</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-slate-700">单元</span>
                    <select
                      value={createUnitId}
                      onChange={(event) => setCreateUnitId(event.target.value)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-hidden"
                    >
                      <option value="">全部单元</option>
                      {createFilteredUnits.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {formatUnitOptionLabel(unit)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={creating || !createTitle.trim() || !createCourseId}
                className={cn(
                  "mt-6 inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition",
                  creating || !createTitle.trim() || !createCourseId
                    ? "cursor-not-allowed bg-slate-200 text-slate-500"
                    : "bg-slate-900 text-white hover:bg-slate-800",
                )}
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                创建并进入编辑台
              </button>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-xs">
              <h2 className="text-lg font-semibold text-slate-900">最近草稿</h2>
              <p className="mt-2 text-sm text-slate-500">继续上次未完成的组卷稿。</p>

              <div className="mt-5 space-y-3">
                {loadingBootstrap ? (
                  <div className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在读取最近草稿...
                  </div>
                ) : recentItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    还没有组卷稿，先新建一份。
                  </div>
                ) : (
                  recentItems.map((item) => (
                    <Link
                      key={item.id}
                      href={`/main/question-bank/builder/${encodeURIComponent(item.id)}`}
                      className="block rounded-2xl border border-slate-200 px-4 py-4 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <p className="text-sm font-medium text-slate-900">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {[item.courseName, item.unitName].filter(Boolean).join(" · ") || "未设置课程信息"}
                      </p>
                      {item.description ? (
                        <p className="mt-3 line-clamp-2 text-sm text-slate-600">{item.description}</p>
                      ) : null}
                      <p className="mt-3 text-xs text-slate-400">最近更新：{item.updatedAt}</p>
                    </Link>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  if (loadingDetail) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[#f7f5ef]">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600 shadow-xs">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载组卷稿...
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[#f7f5ef] px-5">
        <div className="max-w-md rounded-[28px] border border-rose-200 bg-white px-6 py-6 text-center shadow-xs">
          <h2 className="text-lg font-semibold text-slate-900">{isZh ? "组卷稿不可用" : "Worksheet unavailable"}</h2>
          <p className="mt-2 text-sm text-slate-500">
            {errorText || (isZh ? "未能读取当前组卷稿，请返回题库重新创建。" : "Could not load the worksheet draft. Please go back and create a new one.")}
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setErrorText("");
                setLoadingDetail(true);
                setDetailReloadNonce((value) => value + 1);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
            >
              <Loader2 className="h-4 w-4" />
              重新加载
            </button>
            <Link
              href="/main/question-bank"
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm text-white transition hover:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
              {isZh ? "返回题库" : "Back to bank"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f7f5ef]">
      <div className="border-b border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/main/question-bank"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            {isZh ? "返回题库" : "Back to bank"}
          </Link>

          <div className="min-w-0 flex-1">
            <input
              value={builderTitle}
              onChange={(event) => setBuilderTitle(event.target.value)}
              className="w-full bg-transparent text-lg font-semibold text-slate-900 outline-hidden placeholder:text-slate-400"
              placeholder="输入组卷稿标题"
            />
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
              <span>{detail.courseName || "未设置课程"}</span>
              {detail.unitName ? <span>{detail.unitName}</span> : null}
              <span>{displayedQuestionInstances.length} 道已导入题目</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setAiComposerOpen(true)}
            disabled={aiLoading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            AI 修改整卷
          </button>

          <button
            type="button"
            onClick={() => setAiImportOpen(true)}
            disabled={aiImportLoading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {aiImportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            AI 从题库补题
          </button>

          <button
            type="button"
            onClick={() => openExportDialog("pdf")}
            disabled={exporting !== null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting === "pdf" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            导出 PDF
          </button>

          <button
            type="button"
            onClick={() => openExportDialog("docx")}
            disabled={exporting !== null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting === "docx" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            导出 Word
          </button>

          <button
            type="button"
            onClick={() => openExportDialog("markdown")}
            disabled={exporting !== null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting === "markdown" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            导出 Markdown
          </button>
        </div>

        {statusText ? (
          <p className="mt-2 text-sm text-emerald-600">{statusText}</p>
        ) : null}
        {errorText ? <p className="mt-2 text-sm text-rose-600">{errorText}</p> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="grid h-full grid-cols-1 overflow-hidden xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-hidden">
            <BuilderSearchPanel
              courses={courses}
              units={units}
              initialCourseId={detail.courseId}
              initialUnitId={detail.unitId}
              importedExerciseIds={importedExerciseIds}
              onImport={handleImportExercises}
              importing={importing}
            />
          </div>

          <div className="min-h-0 overflow-auto px-5 py-5">
            <TiptapDocumentEditor
              html={currentHtml}
              onHtmlChange={setCurrentHtml}
              onSave={handleSave}
              saveState={saveState}
              className="min-h-full"
              onExportDocxReady={handleExportDocxReady}
              documentMeta={{
                artifactKind: "worksheet_builder",
                artifactTitle: builderTitle,
                artifactSummary: builderDescription || undefined,
              }}
            />
          </div>
        </div>
      </div>

      {aiComposerOpen ? (
        <BuilderAiComposer
          open={aiComposerOpen}
          instruction={aiInstruction}
          loading={aiLoading}
          onInstructionChange={setAiInstruction}
          onClose={() => {
            if (aiLoading) return;
            setAiComposerOpen(false);
          }}
          onSubmit={handleApplyAiEdit}
        />
      ) : null}
      {aiImportOpen ? (
        <BuilderAiImportDialog
          open={aiImportOpen}
          instruction={aiImportInstruction}
          loading={aiImportLoading}
          onInstructionChange={setAiImportInstruction}
          onClose={() => {
            if (aiImportLoading) return;
            setAiImportOpen(false);
          }}
          onSubmit={handleAiImport}
        />
      ) : null}
      {exportDialogOpen ? (
        <BuilderExportDialog
          open={exportDialogOpen}
          format={exportDialogFormat}
          title={exportDialogTitle}
          fileName={exportDialogFileName}
          description={exportDialogDescription}
          loading={exporting !== null}
          onTitleChange={(value) => {
            setExportDialogFileName((current) => {
              const currentSlug = slugifyFilename(exportDialogTitle);
              return !current.trim() || current === currentSlug
                ? slugifyFilename(value)
                : current;
            });
            setExportDialogTitle(value);
          }}
          onFileNameChange={setExportDialogFileName}
          onDescriptionChange={setExportDialogDescription}
          onClose={closeExportDialog}
          onSubmit={handleSubmitExportDialog}
        />
      ) : null}
    </div>
  );
}
