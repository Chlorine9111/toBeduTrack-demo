"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/core";
import { Loader2, WandSparkles } from "lucide-react";
import { LandingPage } from "@/components/wechat-editor/LandingPage";
import type { AIImportSubmitPayload } from "@/components/wechat-editor/AIImportDialog";
import type { SmartImportSubmitPayload } from "@/components/wechat-editor/SmartImportDialog";
import { copyToClipboard } from "@/lib/wechat-editor/clipboard";
import { appendMarkdownToEditor } from "@/lib/wechat-editor/markdown-to-tiptap";
import { getPaletteById, WECHAT_COLOR_PALETTES } from "@/lib/wechat-editor/color-palettes";
import { filterTemplates, renderOutlineForTiptap, renderOutlineWithTemplate } from "@/lib/wechat-editor/template-renderer";
import { tiptapToWechatHtml } from "@/lib/wechat-editor/tiptap-to-wechat-html";
import { buildTemplateCss } from "@/lib/wechat-editor/themes";
import {
  DEFAULT_EDITOR_CONFIG,
  DEFAULT_LANDING_STATE,
  type ArticleOutline,
  type EditorConfig,
  type EditorStep,
  type ImportMode,
  type LandingState,
  type Template,
} from "@/lib/wechat-editor/types";

const AIChatPanel = dynamic(
  () => import("@/components/wechat-editor/AIChatPanel").then((m) => m.AIChatPanel),
  {
    ssr: false,
    loading: () => (
      <div className="hidden w-[320px] shrink-0 border-r border-[rgba(0,0,0,0.06)] bg-neutral-50 lg:block" />
    ),
  },
);

const AILayoutPanel = dynamic(
  () => import("@/components/wechat-editor/AILayoutPanel").then((m) => m.AILayoutPanel),
  { ssr: false, loading: () => null },
);

const AIImportDialog = dynamic(
  () => import("@/components/wechat-editor/AIImportDialog").then((m) => m.AIImportDialog),
  { ssr: false, loading: () => null },
);

const EditorToolbar = dynamic(
  () => import("@/components/wechat-editor/EditorToolbar").then((m) => m.EditorToolbar),
  {
    ssr: false,
    loading: () => (
      <div className="h-[57px] shrink-0 border-b border-neutral-200 bg-white" />
    ),
  },
);

const OutlineEditor = dynamic(
  () => import("@/components/wechat-editor/OutlineEditor").then((m) => m.OutlineEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
      </div>
    ),
  },
);

const SmartImportDialog = dynamic(
  () => import("@/components/wechat-editor/SmartImportDialog").then((m) => m.SmartImportDialog),
  { ssr: false, loading: () => null },
);

const TiptapEditor = dynamic(
  () => import("@/components/wechat-editor/TiptapEditor").then((m) => m.TiptapEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center bg-neutral-50 p-4">
        <div className="mx-auto w-[375px] rounded-xl border border-neutral-200 bg-white px-6 py-10 text-sm text-neutral-500 shadow-xs">
          正在加载编辑器...
        </div>
      </div>
    ),
  },
);

const TiptapToolbar = dynamic(
  () => import("@/components/wechat-editor/TiptapToolbar").then((m) => m.TiptapToolbar),
  { ssr: false, loading: () => null },
);

const CONFIG_STORAGE_KEY = "wechat-editor-config-v1";

const STEP_ORDER: EditorStep[] = ["landing", "outline-solid", "template", "workspace"];
const STEP_LABELS: Record<EditorStep, string> = {
  landing: "内容导入",
  "outline-solid": "大纲确认",
  template: "模板选择",
  workspace: "编辑发布",
};
const EDITOR_TITLE = "公众号文章编辑器";
const EDITOR_SUBTITLE = "把通知、讲义和活动草稿整理成可发布文章";

interface OutlineSsePayload {
  step?: "parsing" | "generating" | "analyzing" | "done" | "error";
  message?: string;
  progress?: number;
  outline?: ArticleOutline;
  error?: string;
  textDelta?: string;
}

interface OutlineRequestInput {
  mode: ImportMode;
  text: string;
  file?: File | null;
  tone?: string;
  paragraphCount?: number;
}

interface TemplateResponse {
  templates?: Template[];
  categories?: string[];
}

function parseStoredConfig(value: string): EditorConfig | null {
  try {
    const parsed = JSON.parse(value) as Partial<EditorConfig>;
    if (!parsed || typeof parsed !== "object") return null;
    const migratedPrimaryColor =
      parsed.primaryColor === "#1890ff" ? "#1D1D1F" : parsed.primaryColor;
    return {
      ...DEFAULT_EDITOR_CONFIG,
      ...parsed,
      primaryColor: migratedPrimaryColor ?? DEFAULT_EDITOR_CONFIG.primaryColor,
    };
  } catch {
    return null;
  }
}

function buildOutlineForm(input: OutlineRequestInput) {
  const form = new FormData();
  form.append("mode", input.mode);
  if (input.text.trim()) {
    form.append("text", input.text.trim());
  }
  if (input.file) {
    form.append("file", input.file);
  }
  if (input.tone) {
    form.append("tone", input.tone);
  }
  if (typeof input.paragraphCount === "number") {
    form.append("paragraphCount", String(input.paragraphCount));
  }
  return form;
}

export function WeChatEditorPage() {
  const [config, setConfig] = useState<EditorConfig>(DEFAULT_EDITOR_CONFIG);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [showAIPanel, setShowAIPanel] = useState(true);
  const [showLayoutPanel, setShowLayoutPanel] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const [step, setStep] = useState<EditorStep>("landing");
  const [landingState, setLandingState] = useState<LandingState>(DEFAULT_LANDING_STATE);
  const [outline, setOutline] = useState<ArticleOutline | null>(null);
  const [pendingHtml, setPendingHtml] = useState<string | null>(null);

  const [showSmartDialog, setShowSmartDialog] = useState(false);
  const [showAIDialog, setShowAIDialog] = useState(false);

  const [outlineLoading, setOutlineLoading] = useState(false);
  const [outlineProgress, setOutlineProgress] = useState(0);
  const [outlineStatus, setOutlineStatus] = useState("等待生成");
  const [outlineError, setOutlineError] = useState<string | null>(null);
  const [lastOutlineInput, setLastOutlineInput] = useState<OutlineRequestInput | null>(null);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateCategories, setTemplateCategories] = useState<string[]>(["全部"]);
  const [templateKeyword, setTemplateKeyword] = useState("");
  const [templateCategory, setTemplateCategory] = useState("全部");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedPaletteId, setSelectedPaletteId] = useState(WECHAT_COLOR_PALETTES[0]?.id ?? "");
  const [templateLoadError, setTemplateLoadError] = useState<string | null>(null);
  const [templateFetchStarted, setTemplateFetchStarted] = useState(false);

  const [streamingText, setStreamingText] = useState("");

  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!stored) return;
    const parsed = parseStoredConfig(stored);
    if (parsed) {
      setConfig(parsed);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    if (!editor || !pendingHtml) return;
    // 防止在已销毁的 editor 上调用 setContent
    if ("isDestroyed" in editor && editor.isDestroyed) return;
    editor.commands.setContent(pendingHtml);
    setPendingHtml(null);
  }, [editor, pendingHtml]);

  useEffect(() => {
    if (!copyMessage) return;
    const timer = window.setTimeout(() => setCopyMessage(null), 2500);
    return () => window.clearTimeout(timer);
  }, [copyMessage]);

  useEffect(() => {
    if (step === "landing" || templateFetchStarted) return;

    let cancelled = false;
    setTemplateFetchStarted(true);

    const run = async () => {
      try {
        setTemplateLoadError(null);
        const response = await fetch("/api/wechat-editor/templates", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          throw new Error(detail || `加载模板失败（${response.status}）`);
        }

        const payload = (await response.json()) as TemplateResponse;
        if (cancelled) return;

        const nextTemplates = Array.isArray(payload.templates) ? payload.templates : [];
        setTemplates(nextTemplates);
        setSelectedTemplateId((current) => current || nextTemplates[0]?.id || "");

        if (Array.isArray(payload.categories) && payload.categories.length > 0) {
          setTemplateCategories(payload.categories);
        } else {
          setTemplateCategories(["全部"]);
        }
      } catch (error) {
        if (cancelled) return;
        setTemplateLoadError(error instanceof Error ? error.message : "模板库加载失败");
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [step, templateFetchStarted]);

  useEffect(() => {
    if (templates.length === 0) {
      if (selectedTemplateId) {
        setSelectedTemplateId("");
      }
      return;
    }
    if (!templates.some((item) => item.id === selectedTemplateId)) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [selectedTemplateId, templates]);

  const selectedTemplate = useMemo(() => {
    return templates.find((item) => item.id === selectedTemplateId) ?? templates[0];
  }, [selectedTemplateId, templates]);

  const selectedPalette = useMemo(() => getPaletteById(selectedPaletteId), [selectedPaletteId]);

  const templateEditorCss = useMemo(() => {
    if (!selectedTemplate) return null;
    return buildTemplateCss(selectedTemplate, selectedPalette) || null;
  }, [selectedPalette, selectedTemplate]);

  const templateExportCss = useMemo(() => {
    if (!selectedTemplate) return undefined;
    return buildTemplateCss(selectedTemplate, selectedPalette, "#wechat-output") || undefined;
  }, [selectedPalette, selectedTemplate]);

  const handleInsertContent = useCallback(
    (content: string) => {
      if (!editor) return;
      appendMarkdownToEditor(editor, content);
    },
    [editor],
  );

  const handleCopy = useCallback(async () => {
    if (!editor) return;

    try {
      const wechatHtml = tiptapToWechatHtml(editor, config, templateExportCss);
      await copyToClipboard(wechatHtml, editor.getText());
      setCopyMessage("已复制：可直接粘贴到公众号编辑器");
    } catch (error) {
      setCopyMessage(error instanceof Error ? error.message : "复制失败，请重试");
    }
  }, [config, editor, templateExportCss]);

  const handleExportMarkdown = useCallback(() => {
    if (!editor || typeof document === "undefined") return;
    const markdownStorage = editor.storage as {
      markdown?: { getMarkdown?: () => string };
    };
    const markdown = markdownStorage.markdown?.getMarkdown?.() ?? editor.getText();

    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `wechat-article-${Date.now()}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [editor]);

  const handleLayoutComplete = useCallback(
    (html: string) => {
      if (!editor) return;
      editor.commands.setContent(html);
    },
    [editor],
  );

  const generateOutline = useCallback(async (input: OutlineRequestInput) => {
    setOutlineLoading(true);
    setOutlineProgress(10);
    setOutlineStatus("正在准备内容...");
    setOutlineError(null);
    setStreamingText("");
    setLastOutlineInput(input);

    try {
      const response = await fetch("/api/wechat-editor/outline", {
        method: "POST",
        body: buildOutlineForm(input),
      });

      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || `请求失败（${response.status}）`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let generatedOutline: ArticleOutline | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        lines.forEach((line) => {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) return;
          const payloadText = trimmed.replace(/^data:\s*/, "");
          if (!payloadText) return;

          try {
            const payload = JSON.parse(payloadText) as OutlineSsePayload;
            if (typeof payload.progress === "number") {
              setOutlineProgress(payload.progress);
            }
            if (payload.textDelta) {
              setStreamingText((prev) => prev + payload.textDelta);
            }
            if (payload.message) {
              setOutlineStatus(payload.message);
            }
            if (payload.step === "done" && payload.outline) {
              generatedOutline = payload.outline;
            }
            if (payload.step === "error") {
              throw new Error(payload.error || payload.message || "大纲生成失败");
            }
          } catch (error) {
            if (error instanceof Error) {
              throw error;
            }
          }
        });
      }

      if (!generatedOutline) {
        throw new Error("未获取到大纲结果");
      }

      setOutline(generatedOutline);
      setStep("outline-solid");
      setOutlineProgress(100);
      setOutlineStatus("大纲生成完成");
    } catch (error) {
      setOutlineError(error instanceof Error ? error.message : "大纲生成失败");
    } finally {
      setOutlineLoading(false);
    }
  }, []);

  const handleLandingSubmit = useCallback(() => {
    setOutlineError(null);
    if (landingState.mode === "smart") {
      setShowSmartDialog(true);
      return;
    }
    if (landingState.mode === "ai") {
      setShowAIDialog(true);
      return;
    }
    const text = landingState.textInput.trim();
    if (!text) {
      setOutlineError("请输入要生成的主题或目标。");
      return;
    }

    void generateOutline({
      mode: "generate",
      text,
      tone: landingState.tone,
      paragraphCount: landingState.paragraphCount,
    });
  }, [generateOutline, landingState.mode, landingState.paragraphCount, landingState.textInput, landingState.tone]);

  const handleSmartConfirm = useCallback(
    (payload: SmartImportSubmitPayload) => {
      setShowSmartDialog(false);
      setLandingState((current) => ({
        ...current,
        mode: "smart",
        textInput: payload.text,
        docxFile: payload.file,
        images: payload.images,
      }));

      void generateOutline({
        mode: "smart",
        text: payload.text,
        file: payload.file,
      });
    },
    [generateOutline],
  );

  const handleAIConfirm = useCallback(
    (payload: AIImportSubmitPayload) => {
      setShowAIDialog(false);
      const mode: ImportMode = landingState.mode === "generate" ? "generate" : "ai";

      setLandingState((current) => ({
        ...current,
        mode,
        textInput: payload.text,
        docxFile: payload.file,
        tone: payload.tone,
        paragraphCount: payload.paragraphCount,
      }));

      void generateOutline({
        mode,
        text: payload.text,
        file: payload.file,
        tone: payload.tone,
        paragraphCount: payload.paragraphCount,
      });
    },
    [generateOutline, landingState.mode],
  );

  const handleRegenerateOutline = useCallback(() => {
    const input =
      lastOutlineInput ??
      ({
        mode: landingState.mode,
        text: landingState.textInput,
        file: landingState.docxFile,
        tone: landingState.tone,
        paragraphCount: landingState.paragraphCount,
      } as OutlineRequestInput);

    void generateOutline(input);
  }, [generateOutline, landingState, lastOutlineInput]);

  const handleGoWorkspace = useCallback(() => {
    if (!outline) return;
    setStep("template");
  }, [outline]);

  const filteredTemplates = useMemo(() => {
    return filterTemplates({
      templates,
      keyword: templateKeyword,
      category: templateCategory,
      colorFamily: "all",
      hasHero: "all",
    });
  }, [templateCategory, templateKeyword, templates]);

  const templatePreviewHtml = useMemo(() => {
    if (!outline || !selectedTemplate) return "";
    return renderOutlineWithTemplate({
      outline,
      template: selectedTemplate,
      palette: selectedPalette,
    });
  }, [outline, selectedPalette, selectedTemplate]);

  const applyTemplate = useCallback(() => {
    if (!outline || !selectedTemplate) {
      setTemplateLoadError("当前模板库为空，请先在 Supabase 初始化公众号模板数据。");
      return;
    }
    const html = renderOutlineForTiptap({ outline });

    if (editor) {
      editor.commands.setContent(html);
    } else {
      setPendingHtml(html);
    }
  }, [editor, outline, selectedTemplate]);

  const handleEnterWorkspace = useCallback(() => {
    if (!outline || !selectedTemplate) {
      setTemplateLoadError("当前模板库为空，请先在 Supabase 初始化公众号模板数据。");
      return;
    }
    // 使用语义化 HTML（无 section 包装），模板样式通过 CSS 注入
    const html = renderOutlineForTiptap({ outline });
    setPendingHtml(html);
    setStep("workspace");
  }, [outline, selectedTemplate]);

  const handleCreatePreview = useCallback(async () => {
    if (!editor) return;
    setPreviewLoading(true);

    try {
      const html = tiptapToWechatHtml(editor, config, templateExportCss);
      const response = await fetch("/api/wechat-editor/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || `创建预览失败（${response.status}）`);
      }

      const payload = (await response.json()) as { previewUrl?: string };
      if (!payload.previewUrl) {
        throw new Error("未获取到预览链接");
      }

      if (typeof window !== "undefined") {
        window.open(payload.previewUrl, "_blank", "noopener,noreferrer");
      }
      setCopyMessage("已在新窗口打开预览链接");
    } catch (error) {
      setCopyMessage(error instanceof Error ? error.message : "创建预览失败");
    } finally {
      setPreviewLoading(false);
    }
  }, [config, editor, templateExportCss]);

  const currentStepIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-white">
      <div className="flex flex-col gap-3 border-b border-[rgba(0,0,0,0.06)] bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1D1D1F]">
            公众号工作台
          </p>
          <h1
            data-testid="wechat-editor-title"
            className="mt-1 text-base font-semibold text-neutral-800"
          >
            {EDITOR_TITLE}
          </h1>
          <p className="mt-1 text-xs text-[#6B6F76]">{EDITOR_SUBTITLE}</p>
        </div>

        <div className="flex flex-col gap-2 md:items-end">
          <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-1 text-xs text-[#6B6F76] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {STEP_ORDER.map((item, index) => {
              const active = currentStepIndex >= index;
              return (
                <div key={item} className="flex shrink-0 items-center gap-2">
                  <span
                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 ${
                      active ? "bg-[#1D1D1F] text-white" : "bg-[#F7F7F7] text-[#6B6F76]"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className={active ? "text-neutral-700" : "text-[#9B9DA4]"}>
                    {STEP_LABELS[item]}
                  </span>
                  {index < STEP_ORDER.length - 1 ? (
                    <span className="text-neutral-300">/</span>
                  ) : null}
                </div>
              );
            })}
          </div>

          {step !== "landing" ? (
            <button
              type="button"
              onClick={() => {
                setStep("landing");
                setOutline(null);
                setOutlineError(null);
              }}
              className="self-start rounded-lg border border-[rgba(0,0,0,0.06)] px-3 py-1.5 text-xs text-[#6B6F76] hover:bg-neutral-50 md:self-end"
            >
              重新开始
            </button>
          ) : null}
        </div>
      </div>

      {step === "landing" ? (
        <div className="flex flex-1 flex-col overflow-auto">
          <LandingPage
            value={landingState}
            onModeChange={(mode) => setLandingState((current) => ({ ...current, mode }))}
            onTextChange={(text) => setLandingState((current) => ({ ...current, textInput: text }))}
            onSubmit={handleLandingSubmit}
            loading={outlineLoading}
            error={outlineError}
          />

          {outlineLoading && streamingText ? (
            <div className="mx-auto mb-4 w-full max-w-3xl rounded-xl border border-[rgba(0,0,0,0.06)] bg-white p-4 shadow-xs">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[#1D1D1F]">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>AI 正在提取内容并生成大纲...</span>
              </div>
              <div className="h-64 overflow-auto rounded-lg border border-neutral-100 bg-neutral-50 p-3 text-sm leading-relaxed text-neutral-800 whitespace-pre-wrap">
                {streamingText}
                <span className="inline-block animate-pulse text-[#FF7A7A]">|</span>
              </div>
            </div>
          ) : null}

          {outlineLoading || outlineError ? (
            <div className="mx-auto mb-8 w-full max-w-3xl rounded-xl border border-[rgba(0,0,0,0.06)] bg-white px-4 py-3 text-sm">
              {outlineLoading ? (
                <div className="flex items-center gap-3 text-neutral-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{outlineStatus}</span>
                  <span className="text-[#9B9DA4]">{outlineProgress}%</span>
                </div>
              ) : null}
              {outlineError && landingState.mode !== "generate" ? (
                <p className="text-red-500">{outlineError}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {step === "outline-solid" && outline ? (
        <div className="flex flex-1 overflow-auto">
          <OutlineEditor
            outline={outline}
            loading={outlineLoading}
            onBack={() => setStep("landing")}
            onRegenerate={handleRegenerateOutline}
            onChange={setOutline}
            onNext={handleGoWorkspace}
          />
        </div>
      ) : null}

      {step === "template" && outline ? (
        <div className="flex flex-1 overflow-auto">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5">
            <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
              <section className="space-y-3 rounded-xl border border-[rgba(0,0,0,0.06)] bg-white p-4">
                <header className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-neutral-800">选择模板</h2>
                  <div className="flex items-center gap-2">
                    <input
                      value={templateKeyword}
                      onChange={(event) => setTemplateKeyword(event.target.value)}
                      placeholder="搜索模板"
                      className="h-8 rounded border border-[rgba(0,0,0,0.06)] px-2.5 text-xs"
                    />
                    <select
                      value={templateCategory}
                      onChange={(event) => setTemplateCategory(event.target.value)}
                      className="h-8 rounded border border-[rgba(0,0,0,0.06)] px-2 text-xs"
                    >
                      {templateCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>
                </header>

                {templateLoadError ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                    {templateLoadError}
                  </p>
                ) : null}

                {filteredTemplates.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center text-xs text-[#6B6F76]">
                    当前没有可用模板，请在 Supabase `wechat_templates` 表中添加模板后刷新页面。
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                    {filteredTemplates.map((template) => {
                      const selected = template.id === selectedTemplateId;
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => setSelectedTemplateId(template.id)}
                          className={`rounded-lg border p-2 text-left transition ${
                            selected ? "border-[rgba(94,106,210,0.3)] bg-[#F7F7F7]" : "border-[rgba(0,0,0,0.06)] hover:border-neutral-300"
                          }`}
                        >
                          <div className="mb-2 h-24 overflow-hidden rounded-md border border-[rgba(0,0,0,0.06)] bg-[#F7F7F7]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={template.thumbnail} alt={template.name} className="h-full w-full object-cover" />
                          </div>
                          <p className="text-xs font-medium text-neutral-800">{template.name}</p>
                          <p className="mt-1 line-clamp-1 text-[11px] text-[#6B6F76]">{template.categories.join(" / ")}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="space-y-3 rounded-xl border border-[rgba(0,0,0,0.06)] bg-white p-4">
                <h2 className="text-sm font-semibold text-neutral-800">配色方案</h2>
                <div className="grid grid-cols-2 gap-2">
                  {WECHAT_COLOR_PALETTES.map((palette) => {
                    const selected = palette.id === selectedPaletteId;
                    return (
                      <button
                        key={palette.id}
                        type="button"
                        onClick={() => setSelectedPaletteId(palette.id)}
                        className={`rounded-lg border p-2 text-left ${
                          selected ? "border-[rgba(94,106,210,0.3)]" : "border-[rgba(0,0,0,0.06)]"
                        }`}
                      >
                        <div className="mb-2 flex overflow-hidden rounded">
                          {palette.preview.split(",").map((color) => (
                            <span key={`${palette.id}-${color}`} className="h-4 flex-1" style={{ backgroundColor: color }} />
                          ))}
                        </div>
                        <p className="text-xs text-neutral-700">{palette.name}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-lg border border-[rgba(0,0,0,0.06)] bg-neutral-50 p-2">
                  <p className="mb-2 text-xs text-[#6B6F76]">模板预览</p>
                  <div className="max-h-[320px] overflow-auto rounded border border-[rgba(0,0,0,0.06)] bg-white p-3 text-xs">
                    {templatePreviewHtml ? (
                      <div
                        className="wechat-preview-content"
                        dangerouslySetInnerHTML={{ __html: templatePreviewHtml }}
                      />
                    ) : (
                      <p className="text-[#9B9DA4]">请选择模板后查看预览。</p>
                    )}
                  </div>
                </div>
              </section>
            </div>

            <footer className="flex items-center justify-between border-t border-[rgba(0,0,0,0.06)] pt-3">
              <button
                type="button"
                onClick={() => setStep("outline-solid")}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                返回大纲
              </button>

              <button
                type="button"
                onClick={handleEnterWorkspace}
                disabled={!selectedTemplate}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D1D1F] px-4 py-2 text-sm font-medium text-white hover:bg-[#3a3a3c] disabled:cursor-not-allowed disabled:bg-[rgba(0,0,0,0.2)]"
              >
                <WandSparkles className="h-4 w-4" />
                应用模板并进入编辑器
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {step === "workspace" ? (
        <>
          <EditorToolbar
            config={config}
            editor={editor}
            onConfigChange={setConfig}
            onCopy={() => void handleCopy()}
            onExportMarkdown={handleExportMarkdown}
            onOpenLayoutPanel={() => setShowLayoutPanel(true)}
            isAIPanelVisible={showAIPanel}
            onToggleAIPanel={() => setShowAIPanel((previous) => !previous)}
            onCreatePreview={() => void handleCreatePreview()}
            isPreviewLoading={previewLoading}
            onBackToTemplate={() => {
              setEditor(null);
              setStep("template");
            }}
            templateName={selectedTemplate?.name ?? "未选择"}
            onApplyTemplate={applyTemplate}
          />

          <div className="flex min-h-0 flex-1 overflow-hidden">
            {showAIPanel ? (
              <AIChatPanel
                onInsert={handleInsertContent}
                onClose={() => setShowAIPanel(false)}
              />
            ) : null}

            <div className="flex min-w-[300px] flex-1 flex-col">
              <TiptapToolbar editor={editor} />
              <TiptapEditor config={config} templateCss={templateEditorCss} onReady={setEditor} />
            </div>
          </div>

          <AILayoutPanel
            open={showLayoutPanel}
            onClose={() => setShowLayoutPanel(false)}
            onLayoutComplete={handleLayoutComplete}
            templateId={selectedTemplateId}
            paletteId={selectedPaletteId}
          />
        </>
      ) : null}

      <SmartImportDialog
        open={showSmartDialog}
        initialText={landingState.textInput}
        onClose={() => setShowSmartDialog(false)}
        onConfirm={handleSmartConfirm}
      />

      <AIImportDialog
        open={showAIDialog}
        initialText={landingState.textInput}
        onClose={() => setShowAIDialog(false)}
        onConfirm={handleAIConfirm}
      />

      {copyMessage ? (
        <div className="absolute bottom-4 right-4 rounded-lg bg-neutral-900 px-3 py-2 text-xs text-white shadow-lg">
          {copyMessage}
        </div>
      ) : null}
    </div>
  );
}
