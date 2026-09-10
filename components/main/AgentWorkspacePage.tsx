"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Tooltip } from "@heroui/react";
import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AGENT_CONVERSATION_STORAGE_KEY,
} from "@/lib/agent/workspace";
import type { AgentReferenceSelection } from "@/components/main/content-assets/AssetReferencePicker";
import WorkspaceTransition from "@/components/main/agent/WorkspaceTransition";
import { useAgentWorkspaceFiles } from "@/components/main/agent/use-agent-workspace-files";
import { useAgentWorkspaceHistory } from "@/components/main/agent/use-agent-workspace-history";
import { useAgentWorkspaceLifecycle } from "@/components/main/agent/use-agent-workspace-lifecycle";
import { useAgentWorkspaceStreamState } from "@/components/main/agent/use-agent-workspace-stream-state";
import { useResizablePanel } from "@/components/main/agent/useResizablePanel";
import { useConversationOverlay } from "@/components/main/agent/useConversationOverlay";
import { useWorkspaceShortcuts } from "@/components/main/agent/useWorkspaceShortcuts";
import ConversationOverlayBackdrop from "@/components/main/agent/ConversationOverlayBackdrop";
import DotPulseLoader from "@/components/main/agent/DotPulseLoader";
import {
  type AgentMessage,
  type PendingClarification,
} from "@/components/main/agent/workspace-types";
import {
  buildWelcomeMessage,
  extractRequestError,
  INITIAL_ASSISTANT_MESSAGE,
  nextId,
  parseErrorMessage,
} from "@/components/main/agent/workspace-utils";
import { useAppI18n } from "@/lib/app-i18n/provider";
import {
  getClientRequestErrorMessage,
  isFetchLikeClientError,
} from "@/lib/api/client";

function AgentTopBarLoading() {
  return <div className="h-14 shrink-0 border-b border-divider bg-background" />;
}

const ModuleTour = dynamic(
  () => import("@/components/product-tour").then((mod) => mod.ModuleTour),
  { loading: () => null },
);

const AgentWorkspaceTopBar = dynamic(
  () => import("@/components/main/agent/AgentWorkspaceTopBar"),
  { loading: () => <AgentTopBarLoading /> },
);

const AgentWorkspaceIdleState = dynamic(
  () => import("@/components/main/agent/AgentWorkspaceIdleState"),
);

const AgentWorkspaceActiveState = dynamic(
  () => import("@/components/main/agent/AgentWorkspaceActiveState"),
  {
    loading: () => (
      <div className="flex flex-1 items-center justify-center bg-background">
        <DotPulseLoader className="text-default-300" size="md" />
      </div>
    ),
  },
);

const AgentContextSidebar = dynamic(
  () => import("@/components/main/agent/AgentContextSidebar"),
  { loading: () => null },
);

const PanelModeButtons = dynamic(
  () => import("@/components/main/agent/PanelModeButtons"),
  { loading: () => null },
);

const ArtifactCanvas = dynamic(
  () => import("@/components/main/agent/ArtifactCanvas"),
  {
    loading: () => (
      <section
        data-testid="agent-artifact-canvas-loading"
        className="flex min-h-[320px] min-w-0 flex-1 flex-col border-t border-neutral-200 bg-default-100 lg:border-l lg:border-t-0"
      >
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <DotPulseLoader className="text-default-300" size="md" />
        </div>
      </section>
    ),
  },
);

const ConversationPanel = dynamic(
  () => import("@/components/main/agent/ConversationPanel"),
  { loading: () => null },
);

const ShortcutHelpPanel = dynamic(
  () => import("@/components/main/agent/ShortcutHelpPanel"),
  { loading: () => null },
);

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export default function AgentWorkspacePage() {
  const { isZh } = useAppI18n();
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      ...INITIAL_ASSISTANT_MESSAGE,
      content: buildWelcomeMessage(isZh),
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [restoringConversation, setRestoringConversation] = useState(false);
  const [workspaceBootstrapping, setWorkspaceBootstrapping] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [selectedReferences, setSelectedReferences] = useState<AgentReferenceSelection[]>([]);
  const [referenceUploadState, setReferenceUploadState] = useState<{
    pending: boolean;
    count: number;
    names: string[];
  }>({
    pending: false,
    count: 0,
    names: [],
  });
  const [contextSidebarOpen, setContextSidebarOpen] = useState(false);
  const [contextSidebarUploadToken, setContextSidebarUploadToken] = useState(0);
  const [assetReadyNotification, setAssetReadyNotification] = useState<{
    title: string;
    summary: string;
  } | null>(null);

  const handleAssetReady = useCallback((info: { title: string; summary: string }) => {
    setAssetReadyNotification(info);
  }, []);

  const dismissAssetNotification = useCallback(() => {
    setAssetReadyNotification(null);
  }, []);
  const [conversationId, setConversationId] = useState("");
  const [conversationStorageKey, setConversationStorageKey] = useState(
    AGENT_CONVERSATION_STORAGE_KEY,
  );
  const [workspaceLoadErrorText, setWorkspaceLoadErrorText] = useState("");
  const [conversationWarningText, setConversationWarningText] = useState("");
  const [pendingClarification, setPendingClarification] =
    useState<PendingClarification | null>(null);
  const [artifactCanvasPrefetched, setArtifactCanvasPrefetched] = useState(false);
  const [artifactDocumentViewPrefetched, setArtifactDocumentViewPrefetched] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const suppressAbortNoticeRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);
  const startAgentTaskRef = useRef<
    (rawInput: string, files?: File[]) => Promise<void>
  >(async () => {});
  const restoreConversationRef = useRef<
    (requestedConversationId: string) => Promise<void>
  >(async () => {});
  const resetConversationRef = useRef<() => void>(() => {});
  const conversationIdRef = useRef("");
  const initialPromptRef = useRef("");
  const entrypointHandledRef = useRef(false);
  const conversationRestoreSeqRef = useRef(0);
  const initialIsZhRef = useRef(isZh);
  useEffect(() => {
    if (typeof document === "undefined") return;

    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousHtmlOverscroll = html.style.overscrollBehavior;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;

    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";

    return () => {
      html.style.overflow = previousHtmlOverflow;
      html.style.overscrollBehavior = previousHtmlOverscroll;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
    };
  }, []);
  const createWelcomeAssistantMessage = () => ({
    ...INITIAL_ASSISTANT_MESSAGE,
    id: nextId(),
    content: buildWelcomeMessage(isZh),
  });
  const scrollToBottom = useCallback(() => {
    if (scrollFrameRef.current != null) {
      return;
    }
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      if (!scrollRef.current) return;
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, []);
  useEffect(() => {
    return () => {
      if (scrollFrameRef.current != null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);
  const {
    pendingMaterials,
    setPendingMaterials,
    removeMaterialAt,
  } = useAgentWorkspaceFiles();
  const {
    setTimelineItems,
    timelineTotalMs,
    setTimelineTotalMs,
    openArtifactIds,
    activeArtifactId,
    artifacts,
    artifactByMessageId,
    streamingArtifact,
    streamingAssistantDraft,
    visibleWorkingNotes,
    processSummary,
    setProcessSummary,
    showArtifactCanvas,
    memoryHighlights,
    activityHighlights,
    activeTimelineItem,
    visibleTimelineItems,
    processingHeadline,
    openArtifact,
    closeArtifact,
    updateAssistantMessage,
    updateAssistantDraft,
    clearAssistantDraft,
    appendAssistantQuestionBlock,
    appendTimelineItem,
    patchTimelineItem,
    upsertWorkingNote,
    addMessages,
    resetTimelineState,
    handleArtifactChunk,
    handleArtifactPersisted,
    beginLiveArtifactSession,
    warmArtifactRuntime,
    prepareConversationRestore,
    resetWorkspaceArtifacts,
    resumeLiveArtifactAutoOpen,
  } = useAgentWorkspaceStreamState({
    isZh,
    messages,
    restoringConversation,
    streaming,
    setMessages,
  });
  const {
    notifyConversationsUpdated,
    persistLocalMessages,
    restoreConversation,
  } = useAgentWorkspaceHistory({
    isZh,
    conversationStorageKey,
    conversationIdRef,
    conversationRestoreSeqRef,
    createWelcomeAssistantMessage,
    parseErrorMessage,
    setConversationId,
    setMessages,
    setPendingClarification,
    setConversationWarningText,
    setRestoringConversation,
  });

  const canSend =
    input.trim().length > 0 &&
    !streaming &&
    !referenceUploadState.pending &&
    !restoringConversation;

  const referenceUploadHint = referenceUploadState.pending
    ? isZh
      ? referenceUploadState.count > 1
        ? `正在处理 ${referenceUploadState.count} 份资料，完成后会自动贴入当前对话，再发送生成请求。`
        : `正在处理资料《${referenceUploadState.names[0] ?? "未命名文件"}》，完成后会自动贴入当前对话，再发送生成请求。`
      : referenceUploadState.count > 1
        ? `${referenceUploadState.count} materials are still processing. They will be attached automatically when ready.`
        : `${referenceUploadState.names[0] ?? "Material"} is still processing and will be attached automatically when ready.`
    : "";

  useEffect(() => {
    if (referenceUploadState.pending) return;
    setErrorText((prev) => {
      if (
        prev === "资料仍在处理中，完成后会自动贴入当前对话。请等待侧栏显示处理完成后再发送。" ||
        prev === "Reference material is still processing. Wait until it is attached before sending."
      ) {
        return "";
      }
      return prev;
    });
  }, [referenceUploadState.pending]);

  useEffect(() => {
    if (!restoringConversation) return;
    setSelectedReferences([]);
    setContextSidebarOpen(false);
  }, [restoringConversation]);

  const openReferencePicker = useCallback(() => {
    setContextSidebarOpen(true);
  }, []);

  const openMaterialUpload = useCallback(() => {
    setContextSidebarOpen(true);
    setContextSidebarUploadToken((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (artifactCanvasPrefetched || (artifacts.length === 0 && !streamingArtifact)) return;
    setArtifactCanvasPrefetched(true);
    void import("@/components/main/agent/ArtifactCanvas");
  }, [artifactCanvasPrefetched, artifacts.length, streamingArtifact]);

  useEffect(() => {
    const hasDocumentArtifact = artifacts.some(
      (artifact) => Boolean(artifact.htmlContent || artifact.document),
    );
    if (artifactDocumentViewPrefetched || !hasDocumentArtifact) return;
    setArtifactDocumentViewPrefetched(true);
    void import("@/components/main/agent/ArtifactDocumentView");
  }, [artifactDocumentViewPrefetched, artifacts]);

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length !== 1) return prev;
      const first = prev[0];
      if (
        first.role !== "assistant" ||
        first.includeInModel !== false ||
        first.scanResult ||
        first.clarificationQuestion
      ) {
        return prev;
      }
      return [
        {
          ...first,
          content: buildWelcomeMessage(isZh),
        },
      ];
    });
  }, [isZh]);

  const restoreConversationWithWorkspaceReset = useCallback(
    async (requestedConversationId: string) => {
      if (abortRef.current) {
        suppressAbortNoticeRef.current = true;
        abortRef.current.abort();
      }
      setErrorText("");
      prepareConversationRestore();
      await restoreConversation(requestedConversationId);
    },
    [prepareConversationRestore, restoreConversation],
  );

  restoreConversationRef.current = restoreConversationWithWorkspaceReset;

  const runAgent = async (params: {
    displayInput?: string;
    modelInput: string;
    appendUserMessage?: boolean;
    prefaceAssistantMessage?: AgentMessage;
    inlineFiles?: File[];
  }) => {
    const appendUserMessage = params.appendUserMessage ?? true;
    const trimmedDisplayInput = params.displayInput?.trim() ?? "";
    const modelInput = params.modelInput.trim();
    const materialsForRequest = [
      ...pendingMaterials,
      ...(params.inlineFiles ?? []),
    ];
    const referencesForRequest = [...selectedReferences];
    const hasMaterials = materialsForRequest.length > 0;
    const hasReferences = referencesForRequest.length > 0;
    const effectiveModelInput = modelInput;
    if (!effectiveModelInput) return;
    if (appendUserMessage && !trimmedDisplayInput && !hasMaterials) return;

    resumeLiveArtifactAutoOpen();
    setErrorText("");
    const assistantMessage: AgentMessage = {
      id: nextId(),
      role: "assistant",
      content: "",
    };
    const appendedMessages: AgentMessage[] = [];

    if (appendUserMessage) {
      const detailLines = [
        hasMaterials
          ? `${isZh ? "已上传材料" : "Uploaded materials"}：${materialsForRequest
              .map((file) => file.name)
              .join(isZh ? "、" : ", ")}`
          : "",
        hasReferences
          ? `已引用内容：${referencesForRequest
              .map((item) => item.title)
              .join("、")}`
          : "",
      ].filter(Boolean);
      const displayContent = detailLines.length > 0
        ? `${trimmedDisplayInput || effectiveModelInput}\n\n${detailLines.join("\n")}`
        : trimmedDisplayInput;
      appendedMessages.push({
        id: nextId(),
        role: "user",
        content: displayContent,
      });
    }
    if (params.prefaceAssistantMessage) {
      appendedMessages.push(params.prefaceAssistantMessage);
    }

    // 过滤掉空的欢迎消息，避免在 active 视图中显示为多余的 DotPulseLoader
    const filtered = messages.filter(
      (m) => !(m.id === "assistant_welcome" && !m.content),
    );
    const nextMessages = [...filtered, ...appendedMessages];
    warmArtifactRuntime();
    beginLiveArtifactSession(assistantMessage.id);
    setMessages([...nextMessages, assistantMessage]);
    setInput("");
    setPendingMaterials([]);
    setStreaming(true);
    // 新一轮开始时先保留上一份可展示产物，避免工具 placeholder 到达前 Canvas 闪回默认空态。
    resetTimelineState({ preserveArtifactPreview: true });
    scrollToBottom();

    const controller = new AbortController();
    abortRef.current = controller;
    let shouldRefreshConversations = false;

    try {
      let streamErrorMessage = "";
      let hasRenderableAssistantPayload = false;
      const requestPayload = {
        message: effectiveModelInput,
        displayMessage: trimmedDisplayInput || undefined,
        conversationId: conversationIdRef.current || undefined,
        contentAssetIds: referencesForRequest.map((item) => item.id),
      };

      const createChatRequestInit = () =>
        hasMaterials
          ? {
              method: "POST",
              body: (() => {
                const formData = new FormData();
                formData.append("payload", JSON.stringify(requestPayload));
                for (const file of materialsForRequest) {
                  formData.append("materials", file);
                }
                return formData;
              })(),
              signal: controller.signal,
            }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(requestPayload),
              signal: controller.signal,
            };

      let response: Response;
      try {
        response = await fetch("/api/agent/chat", createChatRequestInit());
      } catch (error) {
        if (
          !controller.signal.aborted &&
          isFetchLikeClientError(error)
        ) {
          await sleep(500);
          response = await fetch("/api/agent/chat", createChatRequestInit());
        } else {
          throw error;
        }
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as unknown;
        throw new Error(
          extractRequestError(
            payload,
            isZh
              ? `请求失败 (${response.status})`
              : `Request failed (${response.status})`,
          ),
        );
      }
      shouldRefreshConversations = true;
      clearAssistantDraft(assistantMessage.id);

      let combined = "";
      const [{ isStructuredAgentStreamResponse, parseAgentStreamEvents }, { createAgentStreamEventHandler }] =
        await Promise.all([
          import("@/lib/api/ui-message-stream"),
          import("@/components/main/agent/stream-runner"),
        ]);

      if (isStructuredAgentStreamResponse(response)) {
        const streamEventHandler = createAgentStreamEventHandler({
          assistantMessageId: assistantMessage.id,
          isZh,
          updateAssistantMessage,
          updateAssistantDraft,
          clearAssistantDraft,
          appendAssistantQuestionBlock,
          appendTimelineItem,
          patchTimelineItem,
          upsertWorkingNote,
          setProcessSummary,
          setTimelineItems,
          setTimelineTotalMs,
          setConversationId: (nextConversationId) => {
            conversationIdRef.current = nextConversationId;
            setConversationId(nextConversationId);
          },
          setErrorText,
          refreshMemoryContext: () => {},
          scrollToBottom,
          onArtifactChunk: handleArtifactChunk,
          onArtifactPersisted: handleArtifactPersisted,
        });

        for await (const event of parseAgentStreamEvents(response)) {
          if (!event || typeof event !== "object") continue;
          streamEventHandler.handleEvent(event);
        }
        combined = streamEventHandler.getCombinedText();
        streamErrorMessage = streamEventHandler.getStreamErrorMessage();
        hasRenderableAssistantPayload =
          streamEventHandler.hasRenderableAssistantPayload();
        streamEventHandler.clearDraft();
      } else {
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error(
            isZh ? "未获取到流式响应" : "Streaming response is unavailable",
          );
        }
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (!chunk) continue;
          combined += chunk;
          updateAssistantDraft({
            messageId: assistantMessage.id,
            content: combined,
          });
          scrollToBottom();
        }
        clearAssistantDraft(assistantMessage.id);
      }

      if (combined.trim()) {
        updateAssistantMessage(assistantMessage.id, () => combined);
      }

        if (
          !combined.trim() &&
          !hasRenderableAssistantPayload
        ) {
          updateAssistantMessage(
            assistantMessage.id,
            () =>
            streamErrorMessage ||
            (isZh
              ? "已完成调用，但模型没有返回有效内容，请重试。"
              : "The request completed, but the model returned no usable content. Try again."),
        );
      }
    } catch (error) {
      const silentlyAborted =
        error instanceof DOMException &&
        error.name === "AbortError" &&
        suppressAbortNoticeRef.current;
      const message =
        silentlyAborted
          ? ""
          : error instanceof DOMException && error.name === "AbortError"
          ? isZh
            ? "已停止本次生成。"
            : "Generation stopped."
          : getClientRequestErrorMessage(error, {
              fallbackMessage: isZh ? "请求失败，请稍后重试。" : "Request failed. Try again shortly.",
            });
      clearAssistantDraft(assistantMessage.id);
      if (silentlyAborted) {
        setMessages((prev) =>
          prev.filter((item) => item.id !== assistantMessage.id),
        );
      }
      if (message) {
        setErrorText(message);
        updateAssistantMessage(assistantMessage.id, (prev) => prev || message);
      }
    } finally {
      abortRef.current = null;
      suppressAbortNoticeRef.current = false;
      clearAssistantDraft(assistantMessage.id);
      setStreaming(false);
      scrollToBottom();
      if (shouldRefreshConversations) {
        notifyConversationsUpdated();
      }
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  const resetConversation = () => {
    if (streaming) {
      if (abortRef.current) {
        suppressAbortNoticeRef.current = true;
        abortRef.current.abort();
      }
    }
    setErrorText("");
    setInput("");
    setPendingMaterials([]);
    setSelectedReferences([]);
    setContextSidebarOpen(false);
    setPendingClarification(null);
    setConversationWarningText("");
    setMessages([createWelcomeAssistantMessage()]);
    resetWorkspaceArtifacts();
    window.localStorage.removeItem(conversationStorageKey);
    window.localStorage.removeItem(AGENT_CONVERSATION_STORAGE_KEY);
    setConversationId("");
  };
  resetConversationRef.current = resetConversation;

  const startAgentTask = async (rawInput: string, files: File[] = []) => {
    const textInput = rawInput.trim();
    setErrorText("");
    setPendingClarification(null);
    const inlineFiles = files;

    if (!textInput) {
      if (inlineFiles.length > 0) {
        setPendingMaterials((prev) => {
          const existingKeys = new Set(
            prev.map((item) => `${item.name}:${item.size}:${item.lastModified}`),
          );
          const appended = inlineFiles.filter((file) => {
            const key = `${file.name}:${file.size}:${file.lastModified}`;
            if (existingKeys.has(key)) {
              return false;
            }
            existingKeys.add(key);
            return true;
          });
          return appended.length > 0 ? [...prev, ...appended] : prev;
        });
        setErrorText(
          isZh
            ? "资料已附加，请输入你的需求后再发送。"
            : "Materials attached. Enter your request before sending.",
        );
        return;
      }
      return;
    }

    if (pendingMaterials.length > 0 && files.length === 0) {
      await runAgent({
        displayInput: textInput,
        modelInput: textInput,
      });
      return;
    }

    const displayInput =
      inlineFiles.length > 0
        ? `${textInput}\n（已附 ${inlineFiles.length} 个资料文件）`
        : textInput;

    await runAgent({
      displayInput,
      modelInput: textInput,
      inlineFiles,
    });
  };

  const handleSend = async () => {
    if (referenceUploadState.pending) {
      setErrorText(
        isZh
          ? "资料仍在处理中，完成后会自动贴入当前对话。请等待侧栏显示处理完成后再发送。"
          : "Reference material is still processing. Wait until it is attached before sending.",
      );
      return;
    }
    if (!canSend) return;
    setPendingClarification(null);
    await startAgentTask(input);
  };
  startAgentTaskRef.current = startAgentTask;

  useAgentWorkspaceLifecycle({
    isZh,
    conversationId,
    conversationStorageKey,
    restoringConversation,
    streaming,
    createWelcomeAssistantMessage,
    restoreConversationRef,
    resetConversationRef,
    startAgentTaskRef,
    conversationIdRef,
    initialPromptRef,
    entrypointHandledRef,
    conversationRestoreSeqRef,
    initialIsZhRef,
    setWorkspaceBootstrapping,
    setWorkspaceLoadErrorText,
    setConversationStorageKey,
    setConversationId,
    setRestoringConversation,
    setInput,
    setMessages,
    setConversationWarningText,
    openArtifact,
    persistLocalMessages,
  });

  const handleOpenArtifact = useCallback(
    (artifactId: string) => {
      if (restoringConversation) return;
      openArtifact(artifactId);
    },
    [openArtifact, restoringConversation],
  );

  const isIdle =
    !workspaceBootstrapping &&
    messages.length <= 1 &&
    !streaming &&
    !restoringConversation;

  const {
    ratio: panelRatio,
    isDragging: isResizing,
    handleRef: resizeHandleRef,
    containerRef: resizeContainerRef,
    chatPanelRef: resizeChatPanelRef,
    toggleFullCanvas,
    presetMode,
    setPresetMode,
    isTransitioning,
    isFullscreenTransitioning,
  } = useResizablePanel({ initialRatio: 0.34, minRatio: 0.2, maxRatio: 0.6 });

  // canvas 全屏时 ratio=0，聊天面板隐藏（过渡期间保持可见以播放退场动画）
  const chatPanelHidden = showArtifactCanvas && panelRatio === 0 && !isFullscreenTransitioning;

  const {
    isOpen: conversationOpen,
    close: closeConversation,
    toggle: toggleConversation,
  } = useConversationOverlay();

  const [showShortcutHelp, setShowShortcutHelp] = useState(false);

  useWorkspaceShortcuts({
    setCanvasMode: showArtifactCanvas ? setPresetMode : undefined,
    toggleHelp: () => setShowShortcutHelp((prev) => !prev),
    closeOverlays: () => {
      if (showShortcutHelp) {
        setShowShortcutHelp(false);
      }
    },
  });

  return (
    <div
      ref={showArtifactCanvas ? resizeContainerRef : undefined}
      className="flex h-full min-h-0 flex-col overflow-hidden bg-background lg:flex-row"
      style={
        showArtifactCanvas
          ? { "--chat-ratio": String(panelRatio) } as React.CSSProperties
          : undefined
      }
    >
      <ModuleTour moduleId="agent" />
      {/* 历史对话面板（通过顶栏按钮触发，不再用左侧热区） */}
      <ConversationOverlayBackdrop open={conversationOpen} onClose={closeConversation} />
      {conversationOpen ? (
        <ConversationPanel open={conversationOpen} onClose={closeConversation} />
      ) : null}

      <div
        ref={showArtifactCanvas ? resizeChatPanelRef : undefined}
        className={cn(
          "flex min-h-0 min-w-0 flex-col overflow-hidden",
          chatPanelHidden && "hidden lg:hidden",
          !showArtifactCanvas && "flex-1 lg:max-w-none",
        )}
        style={
          showArtifactCanvas && !chatPanelHidden
            ? {
                flex: `0 0 calc(var(--chat-ratio, ${panelRatio}) * 100%)`,
                maxWidth: `calc(var(--chat-ratio, ${panelRatio}) * 100%)`,
                ...(isTransitioning && !isResizing
                  ? { transition: "flex-basis 250ms cubic-bezier(0.16,1,0.3,1), max-width 250ms cubic-bezier(0.16,1,0.3,1)" }
                  : {}),
                // Phase 4: 全屏过渡——Chat 面板退场/入场动画
                ...(isFullscreenTransitioning && panelRatio === 0
                  ? { transform: "translateX(-40px)", opacity: 0, transition: "transform 300ms ease-out, opacity 300ms ease-out", pointerEvents: "none" as const }
                  : {}),
                ...(isFullscreenTransitioning && panelRatio > 0
                  ? { transition: "flex-basis 300ms ease-out, max-width 300ms ease-out, transform 300ms ease-out, opacity 300ms ease-out" }
                  : {}),
              }
            : undefined
        }
      >
        <AgentWorkspaceTopBar
          isZh={isZh}
          streaming={streaming}
          onStop={stopStreaming}
          onToggleConversations={toggleConversation}
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
          {workspaceBootstrapping ? (
            <div className="flex flex-1 items-center justify-center">
              <DotPulseLoader className="text-default-300" size="md" />
            </div>
          ) : (
            <WorkspaceTransition
              isIdle={isIdle}
              idleContent={
                <AgentWorkspaceIdleState
                  isZh={isZh}
                  workspaceLoadErrorText={workspaceLoadErrorText}
                  conversationWarningText={conversationWarningText}
                  input={input}
                  canSend={canSend}
                  referenceUploadHint={referenceUploadHint}
                  streaming={streaming}
                  selectedReferences={selectedReferences}
                  composerRef={composerRef}
                  assetReadyNotification={assetReadyNotification}
                  onDismissAssetNotification={dismissAssetNotification}
                  onInputChange={setInput}
                  onSend={handleSend}
                  onOpenMaterialUpload={openMaterialUpload}
                  onOpenReferencePicker={openReferencePicker}
                  onRemoveReference={(id) =>
                    setSelectedReferences((prev) =>
                      prev.filter((item) => item.id !== id),
                    )
                  }
                />
              }
              activeContent={
                <AgentWorkspaceActiveState
                  isZh={isZh}
                  workspaceLoadErrorText={workspaceLoadErrorText}
                  conversationWarningText={conversationWarningText}
                  restoringConversation={restoringConversation}
                  streaming={streaming}
                  processingHeadline={processingHeadline}
                  visibleTimelineItems={visibleTimelineItems}
                  activeTimelineItem={activeTimelineItem}
                  timelineTotalMs={timelineTotalMs}
                  messages={messages}
                  artifactByMessageId={artifactByMessageId}
                  streamingAssistantDraft={streamingAssistantDraft}
                  workingNotes={visibleWorkingNotes}
                  processSummary={processSummary}
                  activeArtifactId={activeArtifactId}
                  errorText={errorText}
                  pendingClarification={null}
                  pendingMaterials={pendingMaterials}
                  selectedReferences={selectedReferences}
                  referenceUploadHint={referenceUploadHint}
                  input={input}
                  canSend={canSend}
                  scrollRef={scrollRef}
                  composerRef={composerRef}
                  assetReadyNotification={assetReadyNotification}
                  onDismissAssetNotification={dismissAssetNotification}
                  onOpenArtifact={handleOpenArtifact}
                  onClarificationComplete={() => {}}
                  onInputChange={setInput}
                  onSend={handleSend}
                  onStop={stopStreaming}
                  onOpenMaterialUpload={openMaterialUpload}
                  onOpenReferencePicker={openReferencePicker}
                  onRemovePendingMaterial={removeMaterialAt}
                  onRemoveReference={(id) =>
                    setSelectedReferences((prev) =>
                      prev.filter((item) => item.id !== id),
                    )
                  }
                  compactChat={showArtifactCanvas && panelRatio <= 0.20}
                />
              }
            />
          )}
        </div>
      </div>

      {/* 分割线区域：正常模式=拖拽手柄，全屏模式=恢复按钮 */}
      {showArtifactCanvas ? (
        chatPanelHidden ? (
          /* 全屏 canvas 时：贴边的小圆形按钮，不占高度，带滑入动画 */
          <div className="hidden lg:flex relative shrink-0 w-0 items-center">
            <Tooltip>
              <button
                type="button"
                onClick={toggleFullCanvas}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-30 flex h-7 w-4 items-center justify-center rounded-r-md bg-default-200 text-default-300 transition-all hover:w-6 hover:bg-default-300 hover:text-foreground animate-[slideInFromLeft_300ms_ease-out_both]"
              >
                <PanelLeft className="h-3 w-3 shrink-0" />
              </button>
              <Tooltip.Content>{isZh ? "显示对话面板" : "Show chat panel"}</Tooltip.Content>
            </Tooltip>
          </div>
        ) : (
          /* 正常分割线 + 拖拽手柄 */
          <div
            ref={resizeHandleRef}
            onDoubleClick={toggleFullCanvas}
            className={cn(
              "hidden lg:flex relative z-20 w-0 shrink-0 cursor-col-resize items-center justify-center",
              "group",
            )}
          >
            {/* PanelModeButtons 移到 Canvas 面板内 */}
            {/* Phase 3a: hover 热区至少 12px */}
            <div className="absolute inset-y-0 -left-[6px] w-[12px]" />
            {/* Phase 3a: 竖条——idle→hover→dragging 三态过渡 */}
            <div
              className={cn(
                "absolute inset-y-0 origin-center",
                isResizing
                  ? "w-[6px] bg-default-400 opacity-100"
                  : "w-[2px] bg-default-200 opacity-0 group-hover:w-[4px] group-hover:bg-default-300 group-hover:opacity-100",
              )}
              style={{
                transition: "transform 150ms ease-out, opacity 150ms ease-out, width 100ms ease-out",
                transformOrigin: "center",
              }}
            />
            <div
              className={cn(
                "absolute top-1/2 -translate-y-1/2 flex flex-col gap-[3px] rounded-full px-[3px] py-2 transition-all duration-150",
                isResizing
                  ? "bg-primary opacity-100"
                  : "bg-default-200 opacity-0 group-hover:opacity-100 group-hover:bg-default-300",
              )}
            >
              <div className={cn("h-[3px] w-[3px] rounded-full", isResizing ? "bg-white" : "bg-black/35")} />
              <div className={cn("h-[3px] w-[3px] rounded-full", isResizing ? "bg-white" : "bg-black/35")} />
              <div className={cn("h-[3px] w-[3px] rounded-full", isResizing ? "bg-white" : "bg-black/35")} />
            </div>
          </div>
        )
      ) : null}

      {showArtifactCanvas ? (
        <div className="flex flex-1 flex-col min-w-0">
          {/* Canvas 面板顶部布局控制 */}
          <div className="hidden lg:flex items-center justify-end px-3 py-1.5 border-b border-divider">
            <PanelModeButtons currentMode={presetMode} onModeChange={setPresetMode} />
          </div>
        <ArtifactCanvas
          artifacts={artifacts}
          openArtifactIds={openArtifactIds}
          activeArtifactId={activeArtifactId}
          onSelect={openArtifact}
          onClose={closeArtifact}
          memoryHighlights={memoryHighlights}
          activityHighlights={activityHighlights}
          activityTotalMs={timelineTotalMs}
          conversationId={conversationId || null}
          isZh={isZh}
        />
        </div>
      ) : null}

      {/* 右侧上下文侧栏 */}
      {contextSidebarOpen ? (
        <AgentContextSidebar
          open={contextSidebarOpen}
          onClose={() => setContextSidebarOpen(false)}
          selectedReferences={selectedReferences}
          onReferencesChange={setSelectedReferences}
          onUploadStateChange={setReferenceUploadState}
          onAssetReady={handleAssetReady}
          isZh={isZh}
          autoOpenUploadToken={contextSidebarUploadToken}
        />
      ) : null}

      {showShortcutHelp ? (
        <ShortcutHelpPanel
          open={showShortcutHelp}
          onClose={() => setShowShortcutHelp(false)}
          isZh={isZh}
        />
      ) : null}
    </div>
  );
}
