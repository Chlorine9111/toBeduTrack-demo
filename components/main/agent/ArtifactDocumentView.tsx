"use client";

import dynamic from "next/dynamic";
import "katex/dist/katex.min.css";
import "@/lib/doc-engine/academic-print.css";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import LinkButton from "@/components/shells/LinkButton";
import { Check, Eye, ExternalLink, PencilLine } from "lucide-react";
import type { AgentArtifact } from "@/components/main/agent/artifact-utils";
import {
  buildFallbackArtifactDocument,
} from "@/components/main/agent/artifact-utils";
import { areArtifactsLikelySame } from "@/lib/agent/artifact-match";
import type { ConversationDetailResponse } from "@/components/main/agent/workspace-types";
import type { DocumentModel } from "@/lib/doc-engine/block-types";
import { buildDocumentArticleHtml } from "@/lib/doc-engine/document-article-html";
import { normalizeDocumentHtml } from "@/lib/doc-engine/editor-html";
import {
  expandHtmlMathMarkup,
  normalizeMathHtml,
  normalizeMathText,
} from "@/lib/doc-engine/html-math";
import { getClientRequestErrorMessage } from "@/lib/api/client";
import { extractArticleHtml, sanitizeDocHtml } from "@/lib/doc-engine/sanitize";
import RichMarkdown from "@/components/shared/RichMarkdown";
import { extractEmbeddedArtifactPayload } from "@/lib/agent/artifact-payload";
import { parseDocumentModel } from "@/lib/doc-engine/document-schema";
import { useDocumentAutosave } from "@/components/editor/useDocumentAutosave";
import type { EditorDocument, EditorDocumentProperty } from "@/lib/documents/types";
import { DEFAULT_DOCUMENT_LAYOUT } from "@/lib/doc-engine/block-types";
import { exportDocumentPdfBlob } from "@/lib/doc-engine/client-pdf-export";

const DocumentEngine = dynamic(() => import("@/components/doc-engine/DocumentEngine"), {
  ssr: false,
  loading: () => (
    <div className="rounded-[28px] border border-divider bg-white px-6 py-8 text-sm text-muted shadow-xs">
      正在加载文档预览...
    </div>
  ),
});

const TiptapDocumentEditor = dynamic(
  () => import("@/components/doc-engine/TiptapDocumentEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[28px] border border-divider bg-white px-6 py-8 text-sm text-muted shadow-xs">
        正在加载编辑器...
      </div>
    ),
  },
);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ArtifactDocumentViewProps = {
  artifact: AgentArtifact;
  conversationId?: string | null;
  onDocumentChange?: (nextDocument: DocumentModel) => void;
  onHtmlChange?: (html: string) => void;
  onExportPdfReady?: (handler: (() => Promise<boolean>) | null) => void;
};

type DocumentDetailResponse = {
  document: EditorDocument;
};

const artifactDocumentBootstrapRequests = new Map<string, Promise<EditorDocument>>();
const artifactDocumentBootstrapResults = new Map<
  string,
  { document: EditorDocument; expiresAt: number }
>();
const artifactSourceMessageResolutionCache = new Map<string, string | null>();
const readonlyArtifactHtmlPreviewCache = new Map<string, string>();
const ARTIFACT_DOCUMENT_BOOTSTRAP_CACHE_MS = 5 * 60 * 1000;
const TRUSTED_ARTICLE_HTML_PATTERN = /<article\s+data-doc-type=/i;
const UNSAFE_HTML_PATTERN = /<script\b|javascript:|on\w+\s*=/i;
const MATH_MARKUP_PATTERN =
  /<math\b|data-math|data-katex|\\\(|\\\[|\$\$|(?<!\$)\$[^$\n]*?(?:\\[A-Za-z]+|[_^{}])[^$\n]*?\$(?!\$)/i;
const MATH_TEXT_SIGNAL_PATTERN = /\\[A-Za-z]+|[_^{}$]|[∫∑√∞Δ≤≥]/;

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}

function buildPropertiesSignature(
  properties: EditorDocumentProperty[] | null | undefined,
) {
  if (!properties?.length) return "[]";
  try {
    return JSON.stringify(properties);
  } catch {
    return `${properties.length}`;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function resolvePersistedSourceMessageId(
  conversationId: string,
  artifact: AgentArtifact,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(
      `/api/chat/conversations/${encodeURIComponent(conversationId)}`,
      {
        method: "GET",
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`读取对话失败 (${response.status})`);
    }

    const payload = (await response.json()) as ConversationDetailResponse;
    const messages = Array.isArray(payload.messages) ? payload.messages : [];

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role !== "assistant") continue;
      const embedded = extractEmbeddedArtifactPayload(message.content);
      if (!embedded) continue;
      if (
        embedded.artifactKey &&
        artifact.artifactKey &&
        embedded.artifactKey === artifact.artifactKey
      ) {
        if (isUuid(message.id)) {
          return message.id;
        }
        continue;
      }
      if (
        !areArtifactsLikelySame(
          {
            kind: embedded.kind,
            title: embedded.title,
            summary: embedded.summary,
            rawContent: embedded.rawContent,
            sourceStage: embedded.sourceStage,
          },
          artifact,
        )
      ) {
        continue;
      }

      if (isUuid(message.id)) {
        return message.id;
      }
    }

    if (attempt < 2) {
      await sleep(300 * (attempt + 1));
    }
  }

  return null;
}

function buildInitialHtmlContent(artifact: AgentArtifact) {
  return (
    artifact.htmlContent ||
    (artifact.document ? buildDocumentArticleHtml(artifact.document) : null)
  );
}

function buildArtifactDocumentRequestKey(sourceMessageId: string) {
  return `artifact:${sourceMessageId}`;
}

function buildArtifactSourceMessageRequestKey(
  conversationId: string,
  artifact: Pick<AgentArtifact, "artifactKey" | "id">,
) {
  return `${conversationId}:${artifact.artifactKey || artifact.id}`;
}

function readCachedBackedDocument(sourceMessageId: string) {
  const cachedResult = artifactDocumentBootstrapResults.get(
    buildArtifactDocumentRequestKey(sourceMessageId),
  );
  if (!cachedResult || cachedResult.expiresAt <= Date.now()) {
    return null;
  }
  return cachedResult.document;
}

function scheduleIdleTask(task: () => void) {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    const requestId = window.requestIdleCallback(task, { timeout: 1200 });
    return () => window.cancelIdleCallback(requestId);
  }

  const timeoutId = window.setTimeout(task, 120);
  return () => window.clearTimeout(timeoutId);
}

function normalizePreviewMathTextNodes(html: string) {
  if (
    typeof document === "undefined" ||
    !html ||
    !MATH_TEXT_SIGNAL_PATTERN.test(html)
  ) {
    return html;
  }

  const root = document.createElement("div");
  root.innerHTML = html;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    if (!(textNode instanceof Text)) continue;
    const parent = textNode.parentElement;
    const value = textNode.nodeValue ?? "";
    if (!parent || !value.trim()) continue;
    if (
      parent.closest(
        "script,style,code,pre,textarea,kbd,samp,math-inline,math-display,.katex,[data-latex]",
      )
    ) {
      continue;
    }
    if (!MATH_TEXT_SIGNAL_PATTERN.test(value)) continue;
    textNodes.push(textNode);
  }

  for (const textNode of textNodes) {
    const value = textNode.nodeValue ?? "";
    const normalizedValue = normalizeMathText(value);
    if (!normalizedValue || normalizedValue === value) continue;
    const fragmentRoot = document.createElement("span");
    fragmentRoot.innerHTML = normalizedValue;
    textNode.replaceWith(...Array.from(fragmentRoot.childNodes));
  }

  return root.innerHTML;
}

function cacheBackedDocument(sourceMessageId: string, document: EditorDocument) {
  artifactDocumentBootstrapResults.set(
    buildArtifactDocumentRequestKey(sourceMessageId),
    {
      document,
      expiresAt: Date.now() + ARTIFACT_DOCUMENT_BOOTSTRAP_CACHE_MS,
    },
  );
}

async function createOrReadBackedDocument(params: {
  artifact: AgentArtifact;
  htmlContent: string;
  sourceMessageId: string;
  conversationId: string | null;
}) {
  const response = await fetch("/api/documents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: params.artifact.title,
      htmlContent: params.htmlContent,
      properties: [],
      documentKind: params.artifact.kind,
      editorKind: "html",
      sourceType: "artifact",
      sourceId: params.sourceMessageId,
      documentModel: params.artifact.document ?? null,
      metadata: {
        artifactKind: params.artifact.kind,
        artifactSummary: params.artifact.summary,
        artifactRawContent: params.artifact.rawContent,
        sourceConversationId: params.conversationId,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`创建统一文档失败 (${response.status})`);
  }

  const payload = (await response.json()) as DocumentDetailResponse;
  const nextDocument = payload.document;

  if (!nextDocument) {
    throw new Error("统一文档返回为空");
  }

  return nextDocument;
}

async function requestBackedDocument(params: {
  artifact: AgentArtifact;
  htmlContent: string;
  sourceMessageId: string;
  conversationId: string | null;
}) {
  const requestKey = buildArtifactDocumentRequestKey(params.sourceMessageId);
  const cachedResult = artifactDocumentBootstrapResults.get(requestKey);
  if (cachedResult && cachedResult.expiresAt > Date.now()) {
    return cachedResult.document;
  }

  const existingRequest = artifactDocumentBootstrapRequests.get(requestKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = createOrReadBackedDocument(params)
    .then((document) => {
      cacheBackedDocument(params.sourceMessageId, document);
      return document;
    })
    .finally(() => {
      artifactDocumentBootstrapRequests.delete(requestKey);
    });

  artifactDocumentBootstrapRequests.set(requestKey, request);
  return request;
}

function buildPersistenceLabel(
  state: "connecting" | "persistent" | "fallback",
  errorText: string,
) {
  if (state === "connecting") return "正在连接统一文档...";
  if (state === "fallback") {
    return errorText || "当前暂未连接统一文档，先按临时预览打开。";
  }
  return "已连接统一文档";
}

function ReadonlyArtifactHtmlPreview({ html }: { html: string }) {
  const sanitizedHtml = useMemo(() => {
    const normalizedSource = html.trim();
    if (!normalizedSource) return "";

    const cached = readonlyArtifactHtmlPreviewCache.get(normalizedSource);
    if (cached) {
      return cached;
    }

    let nextHtml = "";

    if (
      TRUSTED_ARTICLE_HTML_PATTERN.test(normalizedSource) &&
      !UNSAFE_HTML_PATTERN.test(normalizedSource)
    ) {
      nextHtml = normalizedSource;
    } else {
      const extracted = extractArticleHtml(normalizeDocumentHtml(normalizedSource)).trim();
      if (!extracted) return "";
      nextHtml = sanitizeDocHtml(extracted);
    }

    nextHtml = normalizePreviewMathTextNodes(normalizeMathHtml(nextHtml));

    if (MATH_MARKUP_PATTERN.test(nextHtml)) {
      nextHtml = expandHtmlMathMarkup(nextHtml);
    }

    readonlyArtifactHtmlPreviewCache.set(normalizedSource, nextHtml);
    return nextHtml;
  }, [html]);

  const isRawMarkdown = useMemo(
    () => Boolean(sanitizedHtml) && !/<[a-z][^>]*>/i.test(sanitizedHtml),
    [sanitizedHtml],
  );

  if (!sanitizedHtml) {
    return null;
  }

  if (isRawMarkdown) {
    return (
      <div className="rounded-[28px] border border-divider bg-white px-6 py-6 shadow-xs">
        <RichMarkdown content={html} className="max-w-none text-sm leading-7" />
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-divider bg-white px-6 py-6 shadow-xs">
      <div
        className="deskmate-doc-preview prose prose-slate max-w-none text-sm leading-7"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    </div>
  );
}

export default function ArtifactDocumentView({
  artifact,
  conversationId,
  onDocumentChange,
  onHtmlChange,
  onExportPdfReady,
}: ArtifactDocumentViewProps) {
  const initialHtmlContent = useMemo(
    () => buildInitialHtmlContent(artifact),
    [artifact],
  );
  const deferredPreviewDocument = useDeferredValue(artifact.document ?? null);
  const deferredPreviewHtml = useDeferredValue(initialHtmlContent ?? "");
  const [linkedDocument, setLinkedDocument] = useState<EditorDocument | null>(null);
  const [connectionState, setConnectionState] = useState<
    "connecting" | "persistent" | "fallback"
  >("connecting");
  const [connectionError, setConnectionError] = useState("");
  const [canvasMode, setCanvasMode] = useState<"preview" | "edit">("preview");
  const [isModeTransitioning, setIsModeTransitioning] = useState(false);
  const prevCanvasModeRef = useRef<"preview" | "edit">("preview");

  useEffect(() => {
    if (prevCanvasModeRef.current !== canvasMode) {
      prevCanvasModeRef.current = canvasMode;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reducedMotion) {
        setIsModeTransitioning(true);
        const timer = setTimeout(() => setIsModeTransitioning(false), 150);
        return () => clearTimeout(timer);
      }
    }
  }, [canvasMode]);
  const [editableTitle, setEditableTitle] = useState(artifact.title);
  const [editableHtml, setEditableHtml] = useState(
    initialHtmlContent?.trim() ? normalizeDocumentHtml(initialHtmlContent) : "",
  );
  const canvasEditContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasEditorFocusFrameRef = useRef<number | null>(null);
  const lastEditableArtifactIdRef = useRef(artifact.id);
  const editableTitleRef = useRef(editableTitle);
  const editableHtmlRef = useRef(editableHtml);
  const editablePropertiesRef = useRef<EditorDocumentProperty[]>([]);
  const editablePropertiesSignatureRef = useRef("[]");

  const { save, flush, saveStatus, error: saveError } = useDocumentAutosave({
    documentId: linkedDocument?.id ?? null,
    version: linkedDocument?.version ?? 1,
    debounceMs: 5000,
    onSaved: ({ version, savedAt, data }) => {
      setLinkedDocument((previous) =>
        previous
          ? {
              ...previous,
              title: data.title,
              htmlContent: data.htmlContent,
              properties: data.properties,
              version,
              updatedAt: savedAt,
            }
          : previous,
      );
    },
  });

  useEffect(() => {
    onExportPdfReady?.(null);
    return () => {
      onExportPdfReady?.(null);
    };
  }, [artifact.id, onExportPdfReady]);

  useEffect(() => {
    let cancelled = false;

    async function ensureBackedDocument() {
      const nextInitialHtmlContent = buildInitialHtmlContent(artifact);

      if (!nextInitialHtmlContent) {
        setLinkedDocument(null);
        setConnectionState("fallback");
        setConnectionError("");
        return;
      }

      setConnectionState("connecting");
      setConnectionError("");
      setLinkedDocument(null);

      try {
        let sourceMessageId = isUuid(artifact.sourceMessageId)
          ? artifact.sourceMessageId
          : null;

        const persistedConversationId = isUuid(conversationId)
          ? conversationId
          : null;
        const sourceMessageCacheKey = persistedConversationId
          ? buildArtifactSourceMessageRequestKey(persistedConversationId, artifact)
          : null;

        if (!sourceMessageId && sourceMessageCacheKey) {
          sourceMessageId = artifactSourceMessageResolutionCache.get(sourceMessageCacheKey) ?? null;
        }

        if (!sourceMessageId && persistedConversationId) {
          sourceMessageId = await resolvePersistedSourceMessageId(
            persistedConversationId,
            artifact,
          );
          if (sourceMessageCacheKey) {
            artifactSourceMessageResolutionCache.set(sourceMessageCacheKey, sourceMessageId);
          }
        }

        if (!sourceMessageId) {
          throw new Error("还没有拿到可持久化的会话消息，暂时使用临时预览。");
        }

        const cachedDocument = readCachedBackedDocument(sourceMessageId);
        if (cachedDocument) {
          if (cancelled) return;
          setLinkedDocument(cachedDocument);
          setConnectionState("persistent");
          setConnectionError("");
          return;
        }

        const nextDocument = await requestBackedDocument({
          artifact,
          htmlContent: nextInitialHtmlContent,
          sourceMessageId,
          conversationId: persistedConversationId,
        });

        if (cancelled) return;

        setLinkedDocument(nextDocument);
        cacheBackedDocument(sourceMessageId, nextDocument);
        setConnectionState("persistent");
      } catch (error) {
        if (cancelled) return;
        setLinkedDocument(null);
        setConnectionState("fallback");
        setConnectionError(
          getClientRequestErrorMessage(error, {
            fallbackMessage: "统一文档连接失败",
          }),
        );
      }
    }

    const cancelScheduled = scheduleIdleTask(() => {
      void ensureBackedDocument();
    });

    return () => {
      cancelled = true;
      cancelScheduled();
    };
  }, [
    artifact.id,
    artifact.artifactKey,
    artifact.kind,
    artifact.sourceMessageId,
    conversationId,
  ]);

  useEffect(() => {
    setCanvasMode("preview");
  }, [artifact.id]);

  useEffect(() => {
    const nextTitle = linkedDocument?.title?.trim() || artifact.title;
    const nextHtmlSource = linkedDocument?.htmlContent || initialHtmlContent || "";
    const nextHtml = nextHtmlSource.trim()
      ? normalizeDocumentHtml(nextHtmlSource)
      : "";
    const nextProperties = linkedDocument?.properties ?? [];
    const nextPropertiesSignature = buildPropertiesSignature(nextProperties);
    const artifactChanged = lastEditableArtifactIdRef.current !== artifact.id;
    const titleChanged = editableTitleRef.current !== nextTitle;
    const htmlChanged = editableHtmlRef.current.trim() !== nextHtml.trim();
    const propertiesChanged =
      editablePropertiesSignatureRef.current !== nextPropertiesSignature;

    if (!artifactChanged && !titleChanged && !htmlChanged && !propertiesChanged) {
      return;
    }

    lastEditableArtifactIdRef.current = artifact.id;
    setEditableTitle(nextTitle);
    editableTitleRef.current = nextTitle;
    setEditableHtml(nextHtml);
    editableHtmlRef.current = nextHtml;
    editablePropertiesRef.current = nextProperties;
    editablePropertiesSignatureRef.current = nextPropertiesSignature;
  }, [
    artifact.id,
    artifact.title,
    linkedDocument?.htmlContent,
    linkedDocument?.properties,
    linkedDocument?.title,
    initialHtmlContent,
  ]);

  const handleCanvasTitleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextTitle = event.target.value;
      setEditableTitle(nextTitle);
      editableTitleRef.current = nextTitle;
      if (!linkedDocument) return;

      save({
        title: nextTitle,
        htmlContent: editableHtmlRef.current,
        properties: editablePropertiesRef.current,
      });
    },
    [linkedDocument, save],
  );

  const handleCanvasHtmlChange = useCallback(
    (nextHtml: string) => {
      editableHtmlRef.current = nextHtml;
      // 不立即 setEditableHtml —— 避免 React re-render 把新 html 回灌到
      // TiptapDocumentEditor 导致编辑器回声（尤其会杀死 IME composition）。
      // ref 足够让 autosave 和导出拿到最新值。
      onHtmlChange?.(nextHtml);
      if (!linkedDocument) return;

      save({
        title: editableTitleRef.current,
        htmlContent: nextHtml,
        properties: editablePropertiesRef.current,
      });
    },
    [linkedDocument, onHtmlChange, save],
  );
  const activeDocumentModel = useMemo(
    () =>
      artifact.document ?? parseDocumentModel(linkedDocument?.documentModel) ?? null,
    [artifact.document, linkedDocument?.documentModel],
  );

  useEffect(() => {
    if (!onExportPdfReady) return;

    const handleExportCurrentHtmlPdf = async () => {
      const currentHtml =
        editableHtmlRef.current.trim() ||
        (linkedDocument?.htmlContent?.trim()
          ? normalizeDocumentHtml(linkedDocument.htmlContent)
          : "");
      if (!currentHtml) return false;
      const activeLayoutConfig =
        activeDocumentModel?.layoutConfig ??
        DEFAULT_DOCUMENT_LAYOUT;

      await exportDocumentPdfBlob({
        html: currentHtml,
        title: editableTitle.trim() || artifact.title,
        layoutConfig: activeLayoutConfig,
      });
      return true;
    };

    onExportPdfReady(() => handleExportCurrentHtmlPdf());
    return () => {
      onExportPdfReady(null);
    };
  }, [
    activeDocumentModel,
    artifact.title,
    linkedDocument?.htmlContent,
    editableTitle,
    onExportPdfReady,
  ]);

  const persistedReadonlyHtml = useMemo(
    () =>
      editableHtml.trim() ||
      (initialHtmlContent?.trim() ? normalizeDocumentHtml(initialHtmlContent) : "") ||
      (linkedDocument?.htmlContent?.trim() ? normalizeDocumentHtml(linkedDocument.htmlContent) : ""),
    [linkedDocument?.htmlContent, editableHtml, initialHtmlContent],
  );
  const persistedReadonlyDocument = useMemo(
    () =>
      artifact.document ??
      parseDocumentModel(linkedDocument?.documentModel) ??
      buildFallbackArtifactDocument(artifact.kind, artifact.title, artifact.rawContent),
    [
      artifact.document,
      artifact.kind,
      artifact.rawContent,
      artifact.title,
      linkedDocument?.documentModel,
    ],
  );
  const scheduleCanvasEditorFocus = useCallback(() => {
    if (canvasEditorFocusFrameRef.current != null) {
      cancelAnimationFrame(canvasEditorFocusFrameRef.current);
    }

    let remainingAttempts = 180;
    const focusCanvasEditor = () => {
      const container = canvasEditContainerRef.current;
      const editorBody = container?.querySelector(".ProseMirror") as HTMLElement | null;

      if (container && editorBody?.isConnected) {
        editorBody.focus({ preventScroll: true });
        const activeElement = container.ownerDocument?.activeElement;
        if (
          activeElement instanceof HTMLElement &&
          editorBody.contains(activeElement)
        ) {
          canvasEditorFocusFrameRef.current = null;
          return;
        }
      }

      if (remainingAttempts > 0) {
        remainingAttempts -= 1;
        canvasEditorFocusFrameRef.current = requestAnimationFrame(focusCanvasEditor);
      } else {
        canvasEditorFocusFrameRef.current = null;
      }
    };

    canvasEditorFocusFrameRef.current = requestAnimationFrame(focusCanvasEditor);
  }, []);

  useEffect(() => {
    if (canvasMode !== "edit") {
      if (canvasEditorFocusFrameRef.current != null) {
        cancelAnimationFrame(canvasEditorFocusFrameRef.current);
        canvasEditorFocusFrameRef.current = null;
      }
      return;
    }

    scheduleCanvasEditorFocus();
  }, [artifact.id, canvasMode, scheduleCanvasEditorFocus]);

  useEffect(() => {
    return () => {
      if (canvasEditorFocusFrameRef.current != null) {
        cancelAnimationFrame(canvasEditorFocusFrameRef.current);
      }
    };
  }, []);

  const statusLabel = buildPersistenceLabel(connectionState, connectionError);

  // connecting 状态：还在等后端文档，只显示只读预览
  if (connectionState === "connecting") {
    const hasPreview = Boolean(
      deferredPreviewDocument || deferredPreviewHtml.trim(),
    );

    return (
      <div data-artifact-document-id={artifact.id} className="space-y-3">
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2 text-xs text-sky-700">
          {statusLabel}
        </div>

        {deferredPreviewHtml.trim() ? (
          <ReadonlyArtifactHtmlPreview html={deferredPreviewHtml} />
        ) : deferredPreviewDocument ? (
          <div className="rounded-[28px] border border-divider bg-white p-4 shadow-xs">
            <DocumentEngine document={deferredPreviewDocument} />
          </div>
        ) : (
          <div className="rounded-[28px] border border-divider bg-white px-6 py-8 text-sm text-muted shadow-xs">
            {hasPreview ? "正在整理可预览内容..." : "正在连接统一文档..."}
          </div>
        )}
      </div>
    );
  }

  // persistent 或 fallback 状态都允许编辑
  const showEditControls = connectionState === "persistent";

  return (
    <div data-artifact-document-id={linkedDocument?.id ?? artifact.id} className="space-y-3">
      {showEditControls && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-700">
          {statusLabel}
        </div>
      )}

      {showEditControls && (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-divider bg-white px-4 py-3 shadow-xs">
        <div className="flex items-center gap-2">
          {/* iOS Segmented Control 风格的预览/编辑切换 */}
          <div data-tour-id="canvas-edit-toggle" className="relative grid grid-cols-2 rounded-full bg-surface-tertiary p-0.5">
            {/* 滑动背景 */}
            <div
              className="absolute inset-y-0.5 left-0.5 rounded-full bg-accent"
              style={{
                width: "calc(50% - 2px)",
                transform: canvasMode === "edit" ? "translateX(100%)" : "translateX(0%)",
                transition: "transform 150ms ease-out",
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (editableTitleRef.current !== editableTitle) {
                  setEditableTitle(editableTitleRef.current);
                }
                if (editableHtmlRef.current !== editableHtml) {
                  setEditableHtml(editableHtmlRef.current);
                }
                setCanvasMode("preview");
              }}
              className={`relative z-10 inline-flex h-8 min-w-[76px] items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                canvasMode === "preview"
                  ? "text-white"
                  : "text-muted"
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              预览
            </button>
            <button
              type="button"
              onClick={() => setCanvasMode("edit")}
              className={`relative z-10 inline-flex h-8 min-w-[96px] items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                canvasMode === "edit"
                  ? "text-white"
                  : "text-muted"
              }`}
            >
              <PencilLine className="h-3.5 w-3.5" />
              编辑模式
            </button>
          </div>
          {saveStatus === "saved" ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
              <Check className="h-3.5 w-3.5" />
              已保存
            </span>
          ) : saveStatus === "saving" ? (
            <span className="text-xs text-muted">正在保存...</span>
          ) : saveStatus === "error" ? (
            <span className="text-xs text-red-500">{saveError || "保存失败"}</span>
          ) : null}
        </div>

        {linkedDocument?.id ? (
          <LinkButton
            href={`/main/library/${linkedDocument.id}`}
            variant="secondary"
            size="sm"
            className="rounded-full"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            打开编辑器
          </LinkButton>
        ) : null}
      </div>
      )}

      {showEditControls && canvasMode === "edit" ? (
        <div
          ref={canvasEditContainerRef}
          className="space-y-3"
          style={{
            opacity: isModeTransitioning ? 0.6 : 1,
            transition: "opacity 150ms ease",
          }}
        >
          <div className="rounded-[28px] border border-divider bg-white px-6 py-5 shadow-xs">
            <input
              key={artifact.id}
              defaultValue={editableTitle}
              onChange={handleCanvasTitleChange}
              name="artifact-title"
              placeholder="未命名文档"
              className="w-full border-none bg-transparent text-2xl font-semibold tracking-tight text-foreground outline-hidden placeholder:text-muted"
            />
          </div>
          <TiptapDocumentEditor
            html={editableHtml}
            onHtmlChange={handleCanvasHtmlChange}
            onSave={async (nextHtml) => {
              editableHtmlRef.current = nextHtml;
              setEditableHtml(nextHtml);
              await flush({
                title: editableTitleRef.current,
                htmlContent: nextHtml,
                properties: editablePropertiesRef.current,
              });
            }}
            autoFocusBody
            documentModel={activeDocumentModel}
            documentMeta={{
              title: editableTitle,
              artifactTitle: editableTitle,
            }}
            className="min-h-[520px]"
          />
        </div>
      ) : (
        <div style={{ opacity: isModeTransitioning ? 0.6 : 1, transition: "opacity 150ms ease" }}>
          {persistedReadonlyHtml.trim() ? (
            <ReadonlyArtifactHtmlPreview html={persistedReadonlyHtml} />
          ) : persistedReadonlyDocument ? (
            <div className="rounded-[28px] border border-divider bg-white p-4 shadow-xs">
              <DocumentEngine document={persistedReadonlyDocument} />
            </div>
          ) : (
            <div className="rounded-[28px] border border-divider bg-white px-6 py-8 text-sm text-muted shadow-xs">
              当前产物暂无可显示正文。
            </div>
          )}
        </div>
      )}
    </div>
  );
}
