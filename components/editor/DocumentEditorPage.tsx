"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, FileText, RefreshCw } from "lucide-react";
import { Button, Card, Dropdown, Separator } from "@heroui/react";
import { cn } from "@/lib/utils";
import type {
  EditorDocument,
  EditorDocumentProperty,
  EditorDocumentListItem,
} from "@/lib/documents/types";
import { normalizeDocumentHtml } from "@/lib/doc-engine/editor-html";
import { parseDocumentModel } from "@/lib/doc-engine/document-schema";
import EditorTopNav from "./EditorTopNav";
import EditorTitleBar from "./EditorTitleBar";
import EditorPropertiesPanel, {
  PropertyGroup,
  PropertyInput,
  PropertyActionList,
} from "./EditorPropertiesPanel";
import DocumentSidebar, { type SidebarDocItem } from "./DocumentSidebar";
import DocumentSectionNav from "./DocumentSectionNav";
import { useDocumentAutosave } from "./useDocumentAutosave";

// 动态导入 TiptapDocumentEditor 避免 SSR 问题
const TiptapDocumentEditor = dynamic(
  () => import("@/components/doc-engine/TiptapDocumentEditor"),
  { ssr: false, loading: () => <EditorSkeleton /> },
);

type DocumentEditorPageProps = {
  documentId: string;
  initialDocument?: EditorDocument | null;
  initialRecentDocs?: SidebarDocItem[];
  initialTypeCounts?: Record<string, number>;
};

type LoadState = "loading" | "ready" | "error";

type DocumentDetailResponse = {
  document: EditorDocument;
};

function buildTypeCounts(items: Array<{ documentKind?: string }>) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const kind = item.documentKind ?? "unknown";
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

// 编辑器区域占位骨架
function EditorSkeleton() {
  return (
    <div className="flex flex-1 flex-col items-center px-12 pt-16">
      <div className="w-full max-w-[720px] animate-pulse space-y-4">
        <div className="h-8 w-2/3 rounded bg-default-200" />
        <div className="h-4 w-1/3 rounded bg-default-100" />
        <div className="mt-8 space-y-3">
          <div className="h-4 w-full rounded bg-default-100" />
          <div className="h-4 w-5/6 rounded bg-default-100" />
          <div className="h-4 w-4/6 rounded bg-default-100" />
        </div>
      </div>
    </div>
  );
}

// 全屏加载占位
function FullPageSkeleton() {
  return (
    <div className="flex h-[calc(100vh)] w-full">
      {/* 侧栏骨架 */}
      <div className="hidden w-[240px] shrink-0 animate-pulse border-r border-[#E5E5E5] bg-default-100 p-4 lg:block">
        <div className="mb-4 h-8 w-full rounded-md bg-default-200" />
        <div className="space-y-2">
          <div className="h-4 w-3/4 rounded bg-default-200" />
          <div className="h-4 w-1/2 rounded bg-default-200" />
          <div className="h-4 w-2/3 rounded bg-default-200" />
        </div>
      </div>
      <EditorSkeleton />
    </div>
  );
}

// 错误页面
function ErrorView({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-[calc(100vh)] w-full items-center justify-center">
      <Card className="flex max-w-sm flex-col items-center gap-4 px-8 py-12 text-center">
        <FileText className="h-12 w-12 text-default-200" />
        <p className="text-sm text-default-500">{message}</p>
        <div className="flex items-center gap-3">
          <Button onPress={onRetry}>
            <RefreshCw className="h-4 w-4" />
            重试
          </Button>
          <Link
            href="/main/content-assets"
            prefetch={false}
            className="rounded-md px-4 py-2 text-sm font-medium text-default-500 transition-colors hover:bg-default-100"
          >
            返回内容库
          </Link>
        </div>
      </Card>
    </div>
  );
}

// 更多操作菜单（HeroUI Dropdown）
function EditorMoreMenu({
  onExportPdf,
  onExportDocx,
  onToggleProperties,
}: {
  onExportPdf: () => void;
  onExportDocx: () => void;
  onToggleProperties: () => void;
}) {
  return (
    <Dropdown>
      <Dropdown.Trigger>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label="更多操作"
          className="h-7 w-7 min-w-0"
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
            <circle cx="3" cy="7.5" r="1.2" />
            <circle cx="7.5" cy="7.5" r="1.2" />
            <circle cx="12" cy="7.5" r="1.2" />
          </svg>
        </Button>
      </Dropdown.Trigger>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu
          onAction={(key) => {
            if (key === "export-pdf") onExportPdf();
            if (key === "export-docx") onExportDocx();
            if (key === "properties") onToggleProperties();
          }}
        >
          <Dropdown.Item id="export-pdf" textValue="导出 PDF">
            <Download className="h-3.5 w-3.5 text-default-400" />
            导出 PDF
          </Dropdown.Item>
          <Dropdown.Item id="export-docx" textValue="导出 DOCX">
            <Download className="h-3.5 w-3.5 text-default-400" />
            导出 DOCX
          </Dropdown.Item>
          <Dropdown.Section>
            <Dropdown.Item id="properties" textValue="文档设置">
              <FileText className="h-3.5 w-3.5 text-default-400" />
              文档设置
            </Dropdown.Item>
          </Dropdown.Section>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

export default function DocumentEditorPage({
  documentId,
  initialDocument = null,
  initialRecentDocs = [],
  initialTypeCounts = {},
}: DocumentEditorPageProps) {
  const router = useRouter();
  const initialNormalizedHtml = normalizeDocumentHtml(initialDocument?.htmlContent ?? "");

  // 文档数据
  const [doc, setDoc] = useState<EditorDocument | null>(initialDocument);
  const [loadState, setLoadState] = useState<LoadState>(
    initialDocument ? "ready" : "loading",
  );
  const [loadError, setLoadError] = useState<string>("");

  // 编辑器内部状态
  const [title, setTitle] = useState(initialDocument?.title ?? "");
  const [properties, setProperties] = useState<EditorDocumentProperty[]>(
    initialDocument?.properties ?? [],
  );
  const [showProperties, setShowProperties] = useState(false);
  const titleRef = useRef(initialDocument?.title ?? "");
  const propertiesRef = useRef<EditorDocumentProperty[]>(
    initialDocument?.properties ?? [],
  );
  const htmlContentRef = useRef(initialNormalizedHtml);
  const [editorHtml, setEditorHtml] = useState(initialNormalizedHtml);
  const [sectionNavHtml, setSectionNavHtml] = useState(initialNormalizedHtml);
  const sectionNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const editorScrollRef = useRef<HTMLElement | null>(null);
  const editorContentRef = useRef<HTMLDivElement | null>(null);
  const [editorScrollElement, setEditorScrollElement] = useState<HTMLElement | null>(null);
  const [editorContentElement, setEditorContentElement] = useState<HTMLDivElement | null>(null);
  const exportPdfHandlerRef = useRef<(() => Promise<boolean>) | null>(null);
  const exportDocxHandlerRef = useRef<((options?: { fileName?: string }) => Promise<boolean>) | null>(null);

  // 侧栏数据（简易版，从 list API 获取）
  const [recentDocs, setRecentDocs] = useState<SidebarDocItem[]>(initialRecentDocs);
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>(
    initialTypeCounts,
  );
  const [typeDocuments, setTypeDocuments] = useState<Record<string, SidebarDocItem[]>>(
    {},
  );
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const isReadOnlyDocument = Boolean(doc?.readOnly);

  // 自动保存
  const { save, flush, saveStatus, error: saveError } = useDocumentAutosave({
    documentId,
    version: doc?.version ?? 1,
  });

  // 加载文档
  const fetchDocument = useCallback(async () => {
    setLoadState("loading");
    setLoadError("");

    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("文档不存在或已被删除");
        }
        throw new Error(`加载失败 (${response.status})`);
      }

      const data: DocumentDetailResponse = await response.json();
      const document = data.document;

      if (!document) {
        throw new Error("文档详情返回为空");
      }

      setDoc(document);
      setTitle(document.title);
      titleRef.current = document.title;
      setProperties(document.properties ?? []);
      propertiesRef.current = document.properties ?? [];
      const nextHtml = normalizeDocumentHtml(document.htmlContent ?? "");
      htmlContentRef.current = nextHtml;
      setEditorHtml(nextHtml);
      setSectionNavHtml(nextHtml);
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "加载文档失败");
      setLoadState("error");
    }
  }, [documentId]);

  // 加载侧栏数据
  const fetchSidebarData = useCallback(async () => {
    try {
      const response = await fetch(
        "/api/documents?limit=10&sort=updatedAt&order=desc",
        { cache: "no-store" },
      );
      if (!response.ok) return;

      const data = await response.json();
      const items = data.items ?? [];
      setRecentDocs(
        items.map((item: EditorDocumentListItem) => ({
          id: item.id,
          title: item.title,
          kind: item.documentKind,
          updatedAt: item.updatedAt,
        })),
      );
      setTypeCounts(buildTypeCounts(items));
    } catch {
      // 侧栏数据加载失败不阻塞主流程
    }
  }, []);

  useEffect(() => {
    if (!initialDocument) {
      fetchDocument();
    }
  }, [fetchDocument, initialDocument]);

  useEffect(() => {
    if (initialRecentDocs.length > 0 || Object.keys(initialTypeCounts).length > 0) {
      return;
    }
    void fetchSidebarData();
  }, [fetchSidebarData, initialRecentDocs.length, initialTypeCounts]);

  useEffect(() => {
    setDoc(initialDocument);
    setTitle(initialDocument?.title ?? "");
    titleRef.current = initialDocument?.title ?? "";
    setProperties(initialDocument?.properties ?? []);
    propertiesRef.current = initialDocument?.properties ?? [];
    const nextHtml = normalizeDocumentHtml(initialDocument?.htmlContent ?? "");
    htmlContentRef.current = nextHtml;
    setEditorHtml(nextHtml);
    setSectionNavHtml(nextHtml);
    setLoadError("");
    setLoadState(initialDocument ? "ready" : "loading");
  }, [documentId, initialDocument]);

  useEffect(() => {
    setRecentDocs(initialRecentDocs);
    setTypeCounts(initialTypeCounts);
  }, [initialRecentDocs, initialTypeCounts]);

  useEffect(() => {
    setIsEditorReady(true);
  }, []);

  const handleEditorScrollRef = useCallback((node: HTMLElement | null) => {
    editorScrollRef.current = node;
    setEditorScrollElement(node);
  }, []);

  const handleEditorContentRef = useCallback((node: HTMLDivElement | null) => {
    editorContentRef.current = node;
    setEditorContentElement(node);
  }, []);

  const scheduleSectionNavHtmlUpdate = useCallback((html: string) => {
    if (sectionNavTimerRef.current) {
      clearTimeout(sectionNavTimerRef.current);
    }
    sectionNavTimerRef.current = setTimeout(() => {
      setSectionNavHtml(html);
      sectionNavTimerRef.current = null;
    }, 180);
  }, []);

  // 触发自动保存
  const triggerSave = useCallback((overrides?: Partial<{
    title: string;
    htmlContent: string;
    properties: EditorDocumentProperty[];
  }>) => {
    save({
      title: overrides?.title ?? titleRef.current,
      htmlContent: overrides?.htmlContent ?? htmlContentRef.current,
      properties: overrides?.properties ?? propertiesRef.current,
    });
  }, [save]);

  // 标题变化
  const handleTitleChange = useCallback(
    (newTitle: string) => {
      setTitle(newTitle);
      titleRef.current = newTitle;
      triggerSave({ title: newTitle });
    },
    [triggerSave],
  );

  // 编辑器内容变化
  const handleHtmlChange = useCallback(
    (html: string) => {
      if (html.trim() === htmlContentRef.current.trim()) {
        return;
      }
      htmlContentRef.current = html;
      scheduleSectionNavHtmlUpdate(html);
      triggerSave({ htmlContent: html });
    },
    [scheduleSectionNavHtmlUpdate, triggerSave],
  );

  // 属性变化
  const handlePropertyChange = useCallback(
    (key: string, value: string) => {
      const updated = properties.map((p) =>
        p.key === key ? { ...p, value } : p,
      );
      setProperties(updated);
      propertiesRef.current = updated;
      triggerSave({ properties: updated });
    },
    [properties, triggerSave],
  );

  // 侧栏文档选择
  const handleDocSelect = useCallback(
    (id: string) => {
      if (id !== documentId) {
        router.push(`/main/library/${id}`);
      }
    },
    [documentId, router],
  );

  // 侧栏按类型展开
  const handleExpandType = useCallback(async (kind: string) => {
    setLoadingType(kind);

    try {
      const params = new URLSearchParams({
        kind,
        limit: "50",
        sort: "updatedAt",
        order: "desc",
      });
      const response = await fetch(`/api/documents?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) return;

      const data = (await response.json()) as { items?: EditorDocumentListItem[] };
      const items = data.items ?? [];
      setTypeDocuments((prev) => ({
        ...prev,
        [kind]: items.map((item) => ({
          id: item.id,
          title: item.title,
          kind: item.documentKind,
          updatedAt: item.updatedAt,
        })),
      }));
    } catch {
      setTypeDocuments((prev) => ({
        ...prev,
        [kind]: prev[kind] ?? [],
      }));
    } finally {
      setLoadingType((prev) => (prev === kind ? null : prev));
    }
  }, []);

  const handleExportPdf = useCallback(() => {
    void exportPdfHandlerRef.current?.();
  }, []);

  const handleExportDocx = useCallback(() => {
    void exportDocxHandlerRef.current?.({
      fileName: `${titleRef.current.trim() || "document"}.docx`,
    });
  }, []);

  // 侧栏新建文档
  const handleNewDoc = useCallback(async () => {
    try {
      const response = await fetch("/api/documents", { method: "POST" });
      if (!response.ok) return;
      const data = await response.json();
      if (data.document?.id) {
        router.push(`/main/library/${data.document.id}`);
      }
    } catch {
      // 静默失败
    }
  }, [router]);

  // Cmd+S / Ctrl+S 手动保存
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void flush({
          title: titleRef.current,
          htmlContent: htmlContentRef.current,
          properties: propertiesRef.current,
        });
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [flush]);

  useEffect(() => {
    return () => {
      if (sectionNavTimerRef.current) {
        clearTimeout(sectionNavTimerRef.current);
      }
    };
  }, []);

  // 面包屑
  const breadcrumbs = [
    { label: "内容库", href: "/main/content-assets" },
    ...(doc?.properties?.find((p) => p.key === "course")
      ? [{ label: doc.properties.find((p) => p.key === "course")!.value }]
      : []),
    { label: title || "未命名文档" },
  ];

  // 属性药丸（给 TitleBar 用）
  const propertyPills = properties.map((p) => ({
    key: p.key,
    label: p.label,
    value: p.value,
    color: p.color ?? undefined,
    onChange: (val: string) => handlePropertyChange(p.key, val),
  }));

  // 加载中
  if (loadState === "loading") {
    return <FullPageSkeleton />;
  }

  // 错误
  if (loadState === "error") {
    return <ErrorView message={loadError} onRetry={fetchDocument} />;
  }

  return (
    <div className="flex h-[calc(100vh)] w-full flex-col bg-white">
      {/* ── 极简顶栏 ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 flex h-11 w-full shrink-0 items-center justify-between bg-white/80 px-4 backdrop-blur-md border-b border-divider">
        {/* 左：返回 + 文档标题 */}
        <div className="flex items-center gap-2 overflow-hidden">
          <Link
            href="/main/content-assets"
            prefetch={false}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-default-400 transition-colors hover:bg-default-200 hover:text-foreground"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <span className="truncate text-[13px] font-medium text-foreground">
            {title || "未命名文档"}
          </span>
        </div>

        {/* 右：保存状态 + 更多菜单 */}
        <div className="flex items-center gap-2">
          {/* 保存状态小圆点 */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <div
              className={cn(
                "h-[6px] w-[6px] rounded-full transition-colors",
                saveStatus === "saved" && "bg-[#0F7B6C]",
                saveStatus === "saving" && "bg-[#D9730D] animate-pulse",
                saveStatus === "unsaved" && "bg-[#DFAB01]",
                saveStatus === "error" && "bg-danger",
              )}
            />
            <span className="text-default-400">
              {saveStatus === "saved" ? "已保存" : saveStatus === "saving" ? "保存中" : saveStatus === "error" ? "失败" : ""}
            </span>
          </div>

          {/* 更多操作 */}
          <EditorMoreMenu
            onExportPdf={handleExportPdf}
            onExportDocx={handleExportDocx}
            onToggleProperties={() => setShowProperties((prev) => !prev)}
          />
        </div>
      </header>

      {/* 保存错误提示 */}
      {saveError ? (
        <Card className="mx-4 mt-2 rounded-md bg-danger-50 px-3 py-1.5 text-[12px] text-danger shadow-none">
          {saveError}
        </Card>
      ) : null}

      {/* ── 编辑器主区域 ─────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        <main
          ref={handleEditorScrollRef}
          data-editor-scroll
          data-testid="editor-main-shell"
          className="min-w-0 flex-1 overflow-y-auto px-6 pb-32 pt-10 md:px-12"
        >
          <div ref={handleEditorContentRef} className="mx-auto w-full max-w-[720px]">
            {/* 标题 */}
            <EditorTitleBar
              title={title}
              onTitleChange={handleTitleChange}
              properties={propertyPills}
              placeholder="未命名文档"
              readOnly={isReadOnlyDocument}
            />

            {/* TipTap 编辑器 */}
            {isEditorReady ? (
              <TiptapDocumentEditor
                html={editorHtml}
                onHtmlChange={handleHtmlChange}
                autoFocusBody
                readOnly={isReadOnlyDocument}
                documentModel={parseDocumentModel(doc?.documentModel) ?? null}
                documentMeta={{
                  title,
                  artifactTitle: title || undefined,
                }}
                onExportPdfReady={(handler) => {
                  exportPdfHandlerRef.current = handler;
                }}
                onExportDocxReady={(handler) => {
                  exportDocxHandlerRef.current = handler;
                }}
                className="min-h-[400px]"
              />
            ) : (
              <EditorSkeleton />
            )}
          </div>
        </main>

        {/* 教案大纲导航（仅 lesson-plan） */}
        {doc?.documentKind === "lesson-plan" ? (
          <DocumentSectionNav
            htmlContent={sectionNavHtml}
            editorRoot={editorContentElement}
            scrollContainer={editorScrollElement}
            className="hidden xl:block border-l border-divider bg-white px-3 py-4"
          />
        ) : null}

        {/* 属性面板 */}
        <EditorPropertiesPanel
          open={showProperties}
          title="文档设置"
          onClose={() => setShowProperties(false)}
        >
          <PropertyGroup>
            {doc?.documentKind === "rubric" ? (
              <>
                <PropertyInput
                  label="Total Score"
                  type="number"
                  value={properties.find((p) => p.key === "totalScore")?.value ?? "100"}
                  onChange={(val) => handlePropertyChange("totalScore", val)}
                />
                <PropertyInput
                  label="Scoring Type"
                  type="select"
                  value={properties.find((p) => p.key === "scoringType")?.value ?? "analytic"}
                  onChange={(val) => handlePropertyChange("scoringType", val)}
                  options={[
                    { label: "Analytic", value: "analytic" },
                    { label: "Holistic", value: "holistic" },
                  ]}
                />
              </>
            ) : null}
            <PropertyInput label="文档类型" type="text" value={doc?.documentKind ?? ""} />
          </PropertyGroup>
        </EditorPropertiesPanel>
      </div>
    </div>
  );
}
