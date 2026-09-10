"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { Button, Card, Chip, ScrollShadow, Separator, Spinner, Surface, Toolbar } from "@heroui/react";
import LinkButton from "@/components/shells/LinkButton";
import { Check, ChevronDown, Clock3, Download, FileText, Link2, Printer, Save, Sparkles, X } from "lucide-react";
import ExportDropdown from "@/components/shells/ExportDropdown";
import type { ExportFormat, ExportOptions } from "@/components/shells/ExportDropdown";
import ArtifactMarkdownView from "@/components/main/agent/ArtifactMarkdownView";
import type { AgentArtifact } from "@/components/main/agent/artifact-utils";
import { buildFallbackArtifactDocument } from "@/components/main/agent/artifact-utils";
import { getArtifactKindDescription, getArtifactKindLabel } from "@/components/main/agent/artifact-utils";
import {
  DEFAULT_DOCUMENT_LAYOUT,
  type DocumentModel,
} from "@/lib/doc-engine/block-types";
import { getClientRequestErrorMessage } from "@/lib/api/client";
import { serializeDocumentToMarkdown } from "@/lib/doc-engine/adapters";
import { buildDocumentArticleHtml, type DocumentExportMode } from "@/lib/doc-engine/document-article-html";
import { buildContentAssetsRoute } from "@/lib/content-assets/routes";
import { isPblUiEnabled } from "@/lib/pbl/feature";
import { renderRichMarkdown } from "@/components/shared/RichMarkdown";
import { cn } from "@/lib/utils";
import { exportDocumentPdfBlob } from "@/lib/doc-engine/client-pdf-export";
import { ModuleTour } from "@/components/product-tour";

const ArtifactDocumentView = dynamic(
  () => import("@/components/main/agent/ArtifactDocumentView"),
  {
    loading: () => (
      <div className="rounded-[28px] border border-divider bg-white px-6 py-8 text-sm text-muted shadow-xs">
        正在加载 Canvas 正文...
      </div>
    ),
  },
);

const ArtifactPblView = dynamic(
  () => import("@/components/main/agent/ArtifactPblView"),
  { loading: () => <div className="rounded-[28px] border border-divider bg-white px-6 py-8 text-sm text-muted shadow-xs">正在加载内容...</div> },
);

const ArtifactRubricView = dynamic(
  () => import("@/components/main/agent/ArtifactRubricView"),
  { loading: () => <div className="rounded-[28px] border border-divider bg-white px-6 py-8 text-sm text-muted shadow-xs">正在加载评分标准...</div> },
);

const ScanStructuredResult = dynamic(
  () => import("@/components/main/scan/ScanStructuredResult"),
  { loading: () => <div className="rounded-[28px] border border-divider bg-white px-6 py-8 text-sm text-muted shadow-xs">正在加载结构化结果...</div> },
);

type ActivitySummaryItem = {
  id: string;
  title: string;
  status: "running" | "done" | "error";
  durationMs?: number;
  detail?: string;
};

type ArtifactCanvasProps = {
  artifacts: AgentArtifact[];
  openArtifactIds: string[];
  activeArtifactId: string | null;
  onSelect: (artifactId: string) => void;
  onClose: (artifactId: string) => void;
  memoryHighlights: string[];
  activityHighlights: ActivitySummaryItem[];
  activityTotalMs?: number | null;
  conversationId?: string | null;
  isZh?: boolean;
  onArtifactDocumentChange?: (artifactId: string, nextDocument: DocumentModel) => void;
};

function buildDocumentSignature(document: DocumentModel | undefined) {
  if (!document) return "";
  try {
    return JSON.stringify(document);
  } catch {
    return `${document.type}:${document.title}:${document.blocks.length}`;
  }
}

function buildStatusLabel(item: ActivitySummaryItem, isZh: boolean) {
  if (item.status === "done") return isZh ? "已完成" : "Done";
  if (item.status === "error") return isZh ? "失败" : "Failed";
  return isZh ? "进行中" : "Running";
}

function hydrateArtifactForCanvas(params: {
  artifact: AgentArtifact;
  documentOverride?: DocumentModel;
  htmlOverride?: string;
  hasLocalDraft: boolean;
}) {
  const { artifact, documentOverride, htmlOverride, hasLocalDraft } = params;
  const effectiveDocument = documentOverride ?? artifact.document;

  if (htmlOverride) {
    return {
      ...artifact,
      title: effectiveDocument?.title || artifact.title,
      rawContent: documentOverride
        ? serializeDocumentToMarkdown(documentOverride)
        : artifact.rawContent,
      document: effectiveDocument,
      htmlContent: htmlOverride,
    };
  }

  if (documentOverride) {
    return {
      ...artifact,
      title: effectiveDocument?.title || artifact.title,
      rawContent: serializeDocumentToMarkdown(documentOverride),
      document: effectiveDocument,
      htmlContent: buildDocumentArticleHtml(effectiveDocument) ?? artifact.htmlContent,
    };
  }

  if (!hasLocalDraft && artifact.htmlContent) {
    return artifact;
  }

  if (effectiveDocument) {
    const generatedHtml = buildDocumentArticleHtml(effectiveDocument);
    if (generatedHtml) {
      return {
        ...artifact,
        title: effectiveDocument.title || artifact.title,
        document: effectiveDocument,
        htmlContent: generatedHtml,
      };
    }
  }

  if (effectiveDocument && effectiveDocument !== artifact.document) {
    return {
      ...artifact,
      title: effectiveDocument.title || artifact.title,
      document: effectiveDocument,
    };
  }

  return artifact;
}

type ActionStatus = "idle" | "loading" | "done" | "error";

function ArtifactActionBar({
  artifact,
  conversationId,
  isZh,
  resolveOfficialPdfExporter,
}: {
  artifact: AgentArtifact;
  conversationId?: string | null;
  isZh: boolean;
  resolveOfficialPdfExporter?: () => (() => Promise<boolean>) | null;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<ActionStatus>("idle");
  const [saveStatus, setSaveStatus] = useState<ActionStatus>("idle");
  const [errorText, setErrorText] = useState("");
  const exportBtnRef = useRef<HTMLButtonElement>(null);

  const isScanArtifact = Boolean(artifact.scanResult);
  const isPblArtifact = artifact.kind === "pbl";
  const isTiptapDocumentArtifact = Boolean(artifact.htmlContent || artifact.document);
  const fallbackStructuredDocument = artifact.document
    ?? buildFallbackArtifactDocument(artifact.kind, artifact.title, artifact.rawContent);
  const officialPdfExporter = resolveOfficialPdfExporter?.() ?? null;

  // ── PDF 导出（支持 pageSize + mode 参数）──
  // 优先级：live editor/preview HTML → Markdown HTML fallback。
  const exportPdf = useCallback(async (pageSize: "A4" | "Letter", mode: DocumentExportMode = "teacher") => {
    if (exportStatus === "loading") return;
    setExportStatus("loading");
    setErrorText("");

    try {
      if (officialPdfExporter) {
        const completed = await officialPdfExporter();
        if (completed) {
          setExportStatus("done");
          setTimeout(() => setExportStatus("idle"), 2000);
          return;
        }
      }

      // 1. 已接入统一文档时，统一走当前 HTML 导出，确保 PDF 与右侧 Canvas 当前渲染一致。
      if (isTiptapDocumentArtifact) {
        const currentHtml =
          artifact.htmlContent ||
          (fallbackStructuredDocument
            ? (buildDocumentArticleHtml(fallbackStructuredDocument, mode) ?? "")
            : "");
        await exportDocumentPdfBlob({
          html: currentHtml,
          title: artifact.title || (isZh ? "导出文档" : "export"),
          layoutConfig: {
            ...(fallbackStructuredDocument?.layoutConfig ?? DEFAULT_DOCUMENT_LAYOUT),
            pageSize,
          },
        });
        setExportStatus("done");
        setTimeout(() => setExportStatus("idle"), 2000);
        return;
      }

      // 2. 有 rawContent 时走 Chromium + KaTeX（与 Canvas 渲染一致，含水印）
      if (artifact.rawContent?.trim()) {
        const markdownHtml = renderRichMarkdown(artifact.rawContent);
        const wrappedHtml = `<article data-doc-type="markdown">${markdownHtml}</article>`;
        await exportDocumentPdfBlob({
          html: wrappedHtml,
          title: artifact.title || (isZh ? "导出文档" : "export"),
          layoutConfig: {
            ...DEFAULT_DOCUMENT_LAYOUT,
            pageSize,
          },
        });
        setExportStatus("done");
        setTimeout(() => setExportStatus("idle"), 2000);
        return;
      }
      throw new Error(isZh ? "当前画布内容还没有可导出的 HTML 快照" : "No exportable HTML snapshot");
    } catch (error) {
      setErrorText(
        getClientRequestErrorMessage(error, {
          fallbackMessage: isZh ? "导出失败" : "Export failed",
        }),
      );
      setExportStatus("error");
      setTimeout(() => setExportStatus("idle"), 3000);
    }
  }, [
    artifact.document,
    artifact.htmlContent,
    artifact.rawContent,
    artifact.title,
    exportStatus,
    officialPdfExporter,
    isTiptapDocumentArtifact,
    isZh,
    fallbackStructuredDocument,
  ]);

  // ── Markdown 下载 ──
  const downloadMarkdown = useCallback(() => {
    const blob = new Blob([artifact.rawContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${artifact.title || (isZh ? "导出文档" : "export")}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [artifact.rawContent, artifact.title, isZh]);

  // ── 统一导出回调（ExportDropdown → handleExport）──
  const handleExport = useCallback(
    async (format: ExportFormat, options: ExportOptions) => {
      setExportOpen(false);

      if (format === "clipboard") {
        try {
          await navigator.clipboard.writeText(artifact.rawContent);
          setExportStatus("done");
          setTimeout(() => setExportStatus("idle"), 2000);
        } catch {
          setErrorText(isZh ? "复制失败" : "Copy failed");
          setExportStatus("error");
          setTimeout(() => setExportStatus("idle"), 3000);
        }
        return;
      }

      if (format === "print") {
        window.print();
        return;
      }

      if (format === "docx") {
        downloadMarkdown();
        return;
      }

      // format === "pdf"
      const pageSize = options.paper === "letter" ? "Letter" as const : "A4" as const;
      await exportPdf(pageSize, options.version);
    },
    [artifact.rawContent, downloadMarkdown, exportPdf, isZh],
  );

  // ── 保存到内容库 ──
  const handleSaveToLibrary = async () => {
    if (saveStatus === "loading" || saveStatus === "done") return;
    setSaveStatus("loading");
    setErrorText("");

    try {
      const response = await fetch("/api/content-library/save-artifact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artifactKind: artifact.kind,
          title: artifact.title,
          markdown: artifact.rawContent,
          htmlContent: artifact.htmlContent ?? undefined,
          sourceMessageId: artifact.sourceMessageId,
          conversationId: conversationId ?? undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(isZh ? "保存失败" : "Save failed");
      }

      setSaveStatus("done");
    } catch (error) {
      setErrorText(
        getClientRequestErrorMessage(error, {
          fallbackMessage: isZh ? "保存失败" : "Save failed",
        }),
      );
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  return (
    <Toolbar aria-label={isZh ? "工件操作" : "Artifact actions"} className="flex items-center gap-2">
      {errorText ? (
        <span className="text-xs text-red-500">{errorText}</span>
      ) : null}

      {exportStatus === "done" ? (
        <Chip color="success"><Check className="mr-1 inline h-3.5 w-3.5" />
          {isZh ? "已导出" : "Exported"}
        </Chip>
      ) : null}

      {!isScanArtifact ? (
        <>
          {isPblArtifact ? (
            <>
              {/* PBL: Export dropdown + 内容库归档链接 */}
              <div className="relative">
                <Button
                  ref={exportBtnRef}
                  data-testid="agent-artifact-export-trigger"
                  onPress={() => setExportOpen((prev) => !prev)}
                  isDisabled={exportStatus === "loading"}
                  variant="primary"
                  size="sm"
                >
                  Export
                  <ChevronDown className="h-3 w-3" />
                </Button>
                {exportOpen ? (
                  <div className="absolute right-0 mt-2 z-50">
                    <ExportDropdown
                      open={exportOpen}
                      onClose={() => setExportOpen(false)}
                      onExport={(f, o) => void handleExport(f, o)}
                      anchorRef={exportBtnRef}
                    />
                  </div>
                ) : null}
              </div>

              {artifact.pblMetadata?.planId && isPblUiEnabled() ? (
                <LinkButton
                  href={buildContentAssetsRoute({
                    type: "pbl",
                    originEntityId: artifact.pblMetadata.planId,
                  })}
                  variant="secondary"
                  size="sm"
                  className="rounded-full"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  {isZh ? "内容资产归档" : "Assets archive"}
                </LinkButton>
              ) : null}
            </>
          ) : (
            <>
              <div className="relative">
                <Button
                  ref={exportBtnRef}
                  data-testid="agent-artifact-export-trigger"
                  onPress={() => setExportOpen((prev) => !prev)}
                  isDisabled={exportStatus === "loading"}
                  variant="primary"
                  size="sm"
                >
                  Export
                  <ChevronDown className="h-3 w-3" />
                </Button>
                {exportOpen ? (
                  <div className="absolute right-0 mt-2 z-50">
                    <ExportDropdown
                      open={exportOpen}
                      onClose={() => setExportOpen(false)}
                      onExport={(f, o) => void handleExport(f, o)}
                      anchorRef={exportBtnRef}
                    />
                  </div>
                ) : null}
              </div>

              {isTiptapDocumentArtifact ? (
                <Chip color="success"><Check className="mr-1 inline h-3.5 w-3.5" />
                  {isZh ? "自动同步内容库" : "Auto synced to Library"}
                </Chip>
              ) : (
                <Button
                  data-tour-id="canvas-save-to-library"
                  onPress={() => void handleSaveToLibrary()}
                  isDisabled={saveStatus === "loading" || saveStatus === "done"}
                  variant="secondary"
                  size="sm"
                  className="rounded-full"
                >
                  {saveStatus === "loading" ? (
                    <Spinner size="sm" className="h-3.5 w-3.5" />
                  ) : saveStatus === "done" ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  {saveStatus === "done"
                    ? isZh ? "已保存" : "Saved"
                    : isZh ? "保存到内容库" : "Save to Library"}
                </Button>
              )}
            </>
          )}
        </>
      ) : null}
    </Toolbar>
  );
}

export default function ArtifactCanvas({
  artifacts,
  openArtifactIds,
  activeArtifactId,
  onSelect,
  onClose,
  memoryHighlights,
  activityHighlights,
  activityTotalMs,
  conversationId,
  isZh = true,
  onArtifactDocumentChange,
}: ArtifactCanvasProps) {
  const [documentOverrides, setDocumentOverrides] = useState<Record<string, DocumentModel>>({});
  const [htmlOverrides, setHtmlOverrides] = useState<Record<string, string>>({});
  const [dirtyArtifactIds, setDirtyArtifactIds] = useState<Record<string, true>>({});
  const officialPdfExportersRef = useRef<Record<string, (() => Promise<boolean>) | null>>({});

  // ── Phase 5: 标签页交互动画 ──
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [indicatorStyle, setIndicatorStyle] = useState<{ transform: string; width: string }>({
    transform: "translateX(0px)",
    width: "0px",
  });
  const [isTabTransitioning, setIsTabTransitioning] = useState(false);
  const prevActiveIdRef = useRef<string | null>(null);

  const prefersReducedMotion = useRef(false);
  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // 测量激活标签位置，更新指示条
  useLayoutEffect(() => {
    if (!activeArtifactId) return;
    const tabEl = tabRefs.current.get(activeArtifactId);
    const barEl = tabBarRef.current;
    if (!tabEl || !barEl) return;

    const barRect = barEl.getBoundingClientRect();
    const tabRect = tabEl.getBoundingClientRect();
    const left = tabRect.left - barRect.left + barEl.scrollLeft;
    const width = tabRect.width;

    setIndicatorStyle({
      transform: `translateX(${left}px)`,
      width: `${width}px`,
    });

    // 内容区过渡（切换标签时）
    if (prevActiveIdRef.current && prevActiveIdRef.current !== activeArtifactId && !prefersReducedMotion.current) {
      setIsTabTransitioning(true);
      const timer = setTimeout(() => setIsTabTransitioning(false), 200);
      return () => clearTimeout(timer);
    }
    prevActiveIdRef.current = activeArtifactId;
  }, [activeArtifactId, openArtifactIds]);

  const artifactMap = useMemo(
    () => new Map(artifacts.map((artifact) => [artifact.id, artifact])),
    [artifacts],
  );

  const handleDocumentChange = useCallback(
    (artifactId: string, nextDocument: DocumentModel) => {
      const nextSignature = buildDocumentSignature(nextDocument);
      setDocumentOverrides((previous) => {
        const previousDocument = previous[artifactId];
        if (previousDocument === nextDocument) {
          return previous;
        }
        if (buildDocumentSignature(previousDocument) === nextSignature) {
          return previous;
        }
        return {
          ...previous,
          [artifactId]: nextDocument,
        };
      });
      setDirtyArtifactIds((previous) =>
        previous[artifactId] ? previous : { ...previous, [artifactId]: true },
      );
      onArtifactDocumentChange?.(artifactId, nextDocument);
    },
    [onArtifactDocumentChange],
  );

  const handleHtmlContentChange = useCallback(
    (artifactId: string, nextHtml: string) => {
      setHtmlOverrides((previous) => {
        if (previous[artifactId] === nextHtml) return previous;
        return { ...previous, [artifactId]: nextHtml };
      });
      setDirtyArtifactIds((previous) =>
        previous[artifactId] ? previous : { ...previous, [artifactId]: true },
      );
    },
    [],
  );

  const registerOfficialPdfExporter = useCallback(
    (artifactId: string, handler: (() => Promise<boolean>) | null) => {
      officialPdfExportersRef.current[artifactId] = handler;
    },
    [],
  );

  const openArtifacts = useMemo(
    () =>
      openArtifactIds
        .map((artifactId) => artifactMap.get(artifactId))
        .filter((artifact): artifact is AgentArtifact => Boolean(artifact))
        .map((artifact) =>
          hydrateArtifactForCanvas({
            artifact,
            hasLocalDraft: Boolean(dirtyArtifactIds[artifact.id]),
            documentOverride: dirtyArtifactIds[artifact.id]
              ? documentOverrides[artifact.id]
              : undefined,
            htmlOverride: dirtyArtifactIds[artifact.id]
              ? htmlOverrides[artifact.id]
              : undefined,
          }),
        ),
    [artifactMap, dirtyArtifactIds, documentOverrides, htmlOverrides, openArtifactIds],
  );
  const activeArtifact = useMemo(
    () =>
      openArtifacts.find((artifact) => artifact.id === activeArtifactId)
      ?? openArtifacts[openArtifacts.length - 1]
      ?? null,
    [activeArtifactId, openArtifacts],
  );

  return (
    <Surface variant="default" className="flex min-h-[320px] min-w-0 flex-1 flex-col border-t border-divider lg:border-l lg:border-t-0">
      <ModuleTour moduleId="canvas" />
      {openArtifacts.length > 0 ? (
        <>
          <div ref={tabBarRef} className="relative flex items-center gap-1.5 overflow-x-auto border-b border-foreground/6 bg-surface px-4 py-1.5">
            {openArtifacts.map((artifact) => {
              const isActive = artifact.id === activeArtifact?.id;
              return (
                <div
                  key={artifact.id}
                  ref={(el) => {
                    if (el) tabRefs.current.set(artifact.id, el);
                    else tabRefs.current.delete(artifact.id);
                  }}
                  data-testid="agent-canvas-tab"
                  className={cn(
                    "group flex min-w-[160px] max-w-[220px] items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-all duration-150",
                    isActive
                      ? "border-accent/30 bg-white text-foreground shadow-sm"
                      : "border-transparent bg-transparent text-muted hover:bg-white/60",
                  )}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => onSelect(artifact.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-[10px] font-medium text-foreground/40">
                      {getArtifactKindLabel(artifact.kind, isZh)}
                    </p>
                    <p className="truncate text-[12px] font-medium">{artifact.title}</p>
                  </button>
                  <Button
                    isIconOnly
                    variant="ghost"
                    aria-label={isZh ? `关闭 ${artifact.title}` : `Close ${artifact.title}`}
                    onPress={() => onClose(artifact.id)}
                    className="h-6 w-6 min-w-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
            {/* 激活指示条 */}
            <div
              className="pointer-events-none absolute bottom-0 left-0 h-[2px] bg-accent"
              style={{
                transform: indicatorStyle.transform,
                width: indicatorStyle.width,
                transition: prefersReducedMotion.current
                  ? "none"
                  : "transform 200ms cubic-bezier(0.16,1,0.3,1), width 200ms cubic-bezier(0.16,1,0.3,1)",
              }}
            />
          </div>

          {activeArtifact ? (
            <div
              data-testid="agent-artifact-canvas"
              className="flex min-h-0 flex-1 flex-col"
              style={{
                opacity: isTabTransitioning ? 0 : 1,
                transition: prefersReducedMotion.current ? "none" : "opacity 100ms ease",
              }}
            >
              <Toolbar aria-label={isZh ? "工件信息栏" : "Artifact info bar"} className="items-center border-b border-foreground/6 bg-white px-5 py-2 lg:px-6">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Chip size="sm" variant="soft" color="accent" className="shrink-0">
                    {getArtifactKindLabel(activeArtifact.kind, isZh)}
                  </Chip>
                  <h2 data-testid="agent-canvas-title" className="min-w-0 truncate text-[16px] font-semibold tracking-tight text-foreground lg:text-[18px]">
                    {activeArtifact.title}
                  </h2>
                </div>
                <ArtifactActionBar
                  artifact={activeArtifact}
                  conversationId={conversationId}
                  isZh={isZh}
                  resolveOfficialPdfExporter={() =>
                    officialPdfExportersRef.current[activeArtifact.id] ?? null
                  }
                />
              </Toolbar>

              <ScrollShadow className="min-h-0 flex-1 px-4 py-4 lg:px-5 lg:py-5" data-print-content>
                {activeArtifact.scanResult ? (
                  <Card className="rounded-xl border border-divider shadow-xs">
                    <Card.Content className="p-4">
                      <ScanStructuredResult result={activeArtifact.scanResult} />
                    </Card.Content>
                  </Card>
                ) : activeArtifact.htmlContent || activeArtifact.document ? (
                  <ArtifactDocumentView
                    artifact={activeArtifact}
                    conversationId={conversationId}
                    onDocumentChange={(nextDocument) =>
                      handleDocumentChange(activeArtifact.id, nextDocument)
                    }
                    onHtmlChange={(nextHtml) => handleHtmlContentChange(activeArtifact.id, nextHtml)}
                    onExportPdfReady={(handler) =>
                      registerOfficialPdfExporter(activeArtifact.id, handler)
                    }
                  />
                ) : activeArtifact.kind === "pbl" ? (
                  <ArtifactPblView artifact={activeArtifact} isZh={isZh} />
                ) : activeArtifact.kind === "rubric" ? (
                  <ArtifactRubricView
                    artifact={activeArtifact}
                    onDocumentChange={(nextDocument) =>
                      handleDocumentChange(activeArtifact.id, nextDocument)
                    }
                  />
                ) : (
                  <Card className="rounded-xl border border-divider shadow-xs">
                    <Card.Content className="px-6 py-5">
                      <ArtifactMarkdownView content={activeArtifact.rawContent} />
                    </Card.Content>
                  </Card>
                )}
              </ScrollShadow>
            </div>
          ) : null}
        </>
      ) : (
        <div
          data-testid="agent-canvas-empty"
          className="flex min-h-0 flex-1 flex-col justify-between gap-6 px-5 py-5"
        >
          <Card className="rounded-xl border border-dashed border-muted bg-white/80">
          <Card.Content className="px-6 py-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  {isZh ? "Canvas 正文区" : "Canvas"}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {isZh
                    ? "文档型任务开始后，右侧会自动出现 Canvas 预览；完成后可继续切换编辑。"
                    : "Document tasks will open the canvas preview automatically and remain editable after completion."}
                </p>
              </div>
            </div>

            {artifacts.length > 0 ? (
              <div className="mt-6 space-y-3">
                <p className="text-[12px] font-medium text-foreground/40">
                  {isZh ? "本轮生成物" : "Generated Artifacts"}
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  {artifacts.map((artifact) => (
                    <button
                      key={artifact.id}
                      type="button"
                      onClick={() => onSelect(artifact.id)}
                      className="rounded-lg border border-divider bg-surface-secondary px-4 py-3 text-left transition hover:border-muted hover:bg-white"
                    >
                      <p className="text-[11px] font-medium text-foreground/40">
                        {getArtifactKindLabel(artifact.kind, isZh)}
                      </p>
                      <p className="mt-1 truncate text-sm font-medium text-foreground">{artifact.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{artifact.summary}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-divider bg-surface-secondary px-4 py-3 text-sm text-muted">
                {isZh
                  ? "暂时还没有文档型产物。你可以让 Agent 生成 worksheet、rubric、lesson plan、exam 或 PBL。"
                  : "No document artifacts yet. Ask the Agent to create a worksheet, rubric, lesson plan, exam, or PBL plan."}
              </div>
            )}
          </Card.Content>
          </Card>

          <div
            className="grid gap-4 xl:grid-cols-1"
          >
            <Card className="rounded-xl border border-divider">
            <Card.Content className="px-5 py-4">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-muted" />
                <p className="text-sm font-medium text-foreground">
                  {isZh ? "最近执行" : "Recent Activity"}
                  {activityTotalMs != null ? ` · ${(activityTotalMs / 1000).toFixed(1)}s` : ""}
                </p>
              </div>
              <div className="mt-3 space-y-2">
                {activityHighlights.length === 0 ? (
                  <p className="text-sm text-muted">
                    {isZh
                      ? "发起一次请求后，这里会显示关键步骤与工具调用状态。"
                      : "After a request, key steps and tool call status will appear here."}
                  </p>
                ) : (
                  activityHighlights.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-divider bg-surface-secondary px-3 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                        <span className="text-[11px] text-muted">
                          {item.durationMs != null ? `${(item.durationMs / 1000).toFixed(1)}s` : buildStatusLabel(item, isZh)}
                        </span>
                      </div>
                      {item.detail ? <p className="mt-1 text-xs leading-5 text-muted">{item.detail}</p> : null}
                    </div>
                  ))
                )}
              </div>
            </Card.Content>
            </Card>
          </div>
        </div>
      )}
    </Surface>
  );
}
