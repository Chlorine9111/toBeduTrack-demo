"use client";

import type { Dispatch, SetStateAction } from "react";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentQuestionBlock } from "@/lib/agent/chat-stream-types";
import type { AgentArtifact } from "@/components/main/agent/artifact-utils";
import type {
  ProcessSummary,
  StreamingArtifact,
  StreamingAssistantDraft,
  TimelineItem,
  WorkingNote,
} from "@/components/main/agent/stream-runner";
import type { AgentMessage } from "@/components/main/agent/workspace-types";
import {
  formatTimelineDuration,
  humanizeTimelineTitle,
} from "@/components/main/agent/workspace-utils";

type StreamArtifactRuntimeModule = typeof import("./stream-artifact-runtime");

type Params = {
  isZh: boolean;
  messages: AgentMessage[];
  restoringConversation: boolean;
  streaming: boolean;
  setMessages: Dispatch<SetStateAction<AgentMessage[]>>;
};

const STREAMING_ARTIFACT_PREVIEW_COMMIT_MS = 96;
type ArtifactAutoOpenMode = "latest" | "none";

function getAgentArtifactKey(artifact: Pick<AgentArtifact, "artifactKey" | "id">) {
  return artifact.artifactKey || artifact.id;
}

function getStreamingArtifactKey(artifact: Pick<StreamingArtifact, "artifactKey" | "toolCallId">) {
  return artifact.artifactKey || artifact.toolCallId;
}

function buildStreamingArtifactPreviews(
  runtime: StreamArtifactRuntimeModule,
  artifacts: StreamingArtifact[],
  isZh: boolean,
) {
  return artifacts
    .map((artifact) => runtime.buildStreamingArtifactPreview(artifact, isZh))
    .filter((artifact): artifact is AgentArtifact => Boolean(artifact));
}

function getArtifactStageRank(artifact: Pick<AgentArtifact, "sourceStage">) {
  switch (artifact.sourceStage) {
    case "persisted":
      return 4;
    case "complete":
      return 3;
    case "streaming":
      return 2;
    case "legacy":
      return 1;
    default:
      return 0;
  }
}

function mergeCanonicalArtifact(
  currentArtifact: AgentArtifact | undefined,
  incomingArtifact: AgentArtifact,
) {
  if (!currentArtifact) {
    return incomingArtifact;
  }

  const currentRank = getArtifactStageRank(currentArtifact);
  const incomingRank = getArtifactStageRank(incomingArtifact);
  const preferredArtifact =
    incomingRank >= currentRank ? incomingArtifact : currentArtifact;
  const fallbackArtifact =
    preferredArtifact === incomingArtifact ? currentArtifact : incomingArtifact;
  const artifactKey = getAgentArtifactKey(preferredArtifact);

  return {
    ...fallbackArtifact,
    ...preferredArtifact,
    id: artifactKey,
    artifactKey,
    sourceMessageId:
      preferredArtifact.sourceMessageId || fallbackArtifact.sourceMessageId,
    artifactRole: preferredArtifact.artifactRole ?? fallbackArtifact.artifactRole,
    artifactVariant:
      preferredArtifact.artifactVariant ?? fallbackArtifact.artifactVariant,
    order: Math.min(currentArtifact.order, incomingArtifact.order),
  } satisfies AgentArtifact;
}

function upsertArtifactByKey(
  artifacts: AgentArtifact[],
  artifact: AgentArtifact,
) {
  const artifactKey = getAgentArtifactKey(artifact);
  const existingIndex = artifacts.findIndex(
    (existingArtifact) => getAgentArtifactKey(existingArtifact) === artifactKey,
  );
  if (existingIndex < 0) {
    return [...artifacts, artifact];
  }
  const existingArtifact = artifacts[existingIndex];
  const mergedArtifact: AgentArtifact = {
    ...existingArtifact,
    ...artifact,
    id: artifactKey,
    artifactKey,
    sourceMessageId: artifact.sourceMessageId || existingArtifact.sourceMessageId,
    order: existingArtifact.order,
  };
  if (
    mergedArtifact.title === existingArtifact.title &&
    mergedArtifact.summary === existingArtifact.summary &&
    mergedArtifact.previewText === existingArtifact.previewText &&
    mergedArtifact.rawContent === existingArtifact.rawContent &&
    mergedArtifact.sourceStage === existingArtifact.sourceStage &&
    mergedArtifact.integrityStatus === existingArtifact.integrityStatus &&
    mergedArtifact.contentMode === existingArtifact.contentMode &&
    mergedArtifact.sourceMessageId === existingArtifact.sourceMessageId &&
    mergedArtifact.document === existingArtifact.document &&
    mergedArtifact.htmlContent === existingArtifact.htmlContent &&
    mergedArtifact.layoutConfig === existingArtifact.layoutConfig &&
    mergedArtifact.renderVersion === existingArtifact.renderVersion
  ) {
    return artifacts;
  }
  const nextArtifacts = [...artifacts];
  nextArtifacts[existingIndex] = mergedArtifact;
  return nextArtifacts;
}

export function useAgentWorkspaceStreamState(params: Params) {
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [timelineTotalMs, setTimelineTotalMs] = useState<number | null>(null);
  const [openArtifactIds, setOpenArtifactIds] = useState<string[]>([]);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [artifactAutoOpenMode, setArtifactAutoOpenMode] =
    useState<ArtifactAutoOpenMode>("latest");
  const [streamingArtifacts, setStreamingArtifacts] = useState<StreamingArtifact[]>([]);
  const [streamingAssistantDraft, setStreamingAssistantDraft] =
    useState<StreamingAssistantDraft | null>(null);
  const [workingNotes, setWorkingNotes] = useState<WorkingNote[]>([]);
  const [processSummary, setProcessSummary] = useState<ProcessSummary | null>(null);
  const [persistedArtifacts, setPersistedArtifacts] = useState<AgentArtifact[]>([]);
  const [sessionArtifacts, setSessionArtifacts] = useState<AgentArtifact[]>([]);
  const [streamingArtifactPreviews, setStreamingArtifactPreviews] = useState<AgentArtifact[]>([]);
  const [suppressedArtifactMessageIds, setSuppressedArtifactMessageIds] = useState<string[]>([]);
  const artifactCleanupTimersRef = useRef<Map<string, ReturnType<typeof globalThis.setTimeout>>>(
    new Map(),
  );
  const artifactRuntimeModuleRef = useRef<StreamArtifactRuntimeModule | null>(null);
  const artifactRuntimeRef = useRef<Promise<StreamArtifactRuntimeModule> | null>(null);
  const streamingArtifactsRef = useRef<StreamingArtifact[]>([]);
  const streamingPreviewRefreshTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(
    null,
  );
  const focusedStreamingArtifactIdRef = useRef<string | null>(null);
  const manuallyClosedArtifactIdsRef = useRef<Set<string>>(new Set());
  const activeLiveAssistantMessageIdRef = useRef<string | null>(null);

  const loadArtifactRuntime = useCallback(() => {
    if (artifactRuntimeModuleRef.current) {
      return Promise.resolve(artifactRuntimeModuleRef.current);
    }
    if (!artifactRuntimeRef.current) {
      artifactRuntimeRef.current = import("./stream-artifact-runtime")
        .then((runtime) => {
          artifactRuntimeModuleRef.current = runtime;
          return runtime;
        })
        .catch((error) => {
          artifactRuntimeRef.current = null;
          throw error;
        });
    }
    return artifactRuntimeRef.current;
  }, []);

  const warmArtifactRuntime = useCallback(() => {
    void loadArtifactRuntime().catch(() => {});
  }, [loadArtifactRuntime]);

  const clearArtifactCleanupTimer = useCallback((artifactId: string) => {
    const existingTimer = artifactCleanupTimersRef.current.get(artifactId);
    if (existingTimer != null) {
      globalThis.clearTimeout(existingTimer);
      artifactCleanupTimersRef.current.delete(artifactId);
    }
  }, []);

  const clearAllArtifactCleanupTimers = useCallback(() => {
    artifactCleanupTimersRef.current.forEach((timer) => {
      globalThis.clearTimeout(timer);
    });
    artifactCleanupTimersRef.current.clear();
  }, []);

  const clearStreamingPreviewRefreshTimer = useCallback(() => {
    const existingTimer = streamingPreviewRefreshTimerRef.current;
    if (existingTimer != null) {
      globalThis.clearTimeout(existingTimer);
      streamingPreviewRefreshTimerRef.current = null;
    }
  }, []);

  const commitStreamingArtifactPreviewRefresh = useCallback(
    (runtime: StreamArtifactRuntimeModule) => {
      const nextPreviews = buildStreamingArtifactPreviews(
        runtime,
        streamingArtifactsRef.current,
        params.isZh,
      );
      startTransition(() => {
        setStreamingArtifactPreviews(nextPreviews);
      });
    },
    [params.isZh],
  );

  const scheduleStreamingArtifactPreviewRefresh = useCallback(() => {
    if (streamingArtifactsRef.current.length === 0) {
      clearStreamingPreviewRefreshTimer();
      startTransition(() => {
        setStreamingArtifactPreviews((prev) => (prev.length === 0 ? prev : []));
      });
      return;
    }

    const scheduleWithRuntime = (runtime: StreamArtifactRuntimeModule) => {
      if (streamingPreviewRefreshTimerRef.current != null) {
        return;
      }
      streamingPreviewRefreshTimerRef.current = globalThis.setTimeout(() => {
        streamingPreviewRefreshTimerRef.current = null;
        commitStreamingArtifactPreviewRefresh(runtime);
      }, STREAMING_ARTIFACT_PREVIEW_COMMIT_MS);
    };

    if (artifactRuntimeModuleRef.current) {
      scheduleWithRuntime(artifactRuntimeModuleRef.current);
      return;
    }

    void loadArtifactRuntime()
      .then((runtime) => {
        scheduleWithRuntime(runtime);
      })
      .catch((error) => {
        console.warn("推导主工作台流式产物预览失败", error);
      });
  }, [
    clearStreamingPreviewRefreshTimer,
    commitStreamingArtifactPreviewRefresh,
    loadArtifactRuntime,
  ]);

  const handleArtifactChunk = useCallback((artifact: StreamingArtifact) => {
    const artifactKey = getStreamingArtifactKey(artifact);
    const sourceMessageId =
      activeLiveAssistantMessageIdRef.current ?? artifact.sourceMessageId;
    const nextArtifact =
      sourceMessageId && artifact.sourceMessageId !== sourceMessageId
        ? {
            ...artifact,
            sourceMessageId,
          }
        : artifact;
    warmArtifactRuntime();
    clearArtifactCleanupTimer(artifactKey);
    startTransition(() => {
      setArtifactAutoOpenMode((prev) => (prev === "latest" ? prev : "latest"));
      manuallyClosedArtifactIdsRef.current.delete(artifactKey);
      setStreamingArtifacts((prev) => {
        const existingIndex = prev.findIndex(
          (item) => getStreamingArtifactKey(item) === artifactKey,
        );
        if (existingIndex < 0) {
          return [...prev, nextArtifact];
        }
        const next = [...prev];
        next[existingIndex] = nextArtifact;
        return next;
      });
      setOpenArtifactIds((prev) =>
        prev.includes(artifactKey) ? prev : [...prev, artifactKey],
      );
      setActiveArtifactId((prev) => {
        if (!focusedStreamingArtifactIdRef.current) {
          focusedStreamingArtifactIdRef.current = artifactKey;
          return artifactKey;
        }
        return prev ?? artifactKey;
      });
    });
  }, [clearArtifactCleanupTimer, warmArtifactRuntime]);

  const stableArtifactMessages = useMemo(
    () =>
      params.messages.filter(
        (message) => !suppressedArtifactMessageIds.includes(message.id),
      ),
    [params.messages, suppressedArtifactMessageIds],
  );
  const shouldDerivePersistedArtifacts = useMemo(
    () =>
      stableArtifactMessages.some(
        (message) =>
          Boolean(message.scanResult) ||
          (message.role === "assistant" && Boolean(message.content.trim())),
      ),
    [stableArtifactMessages],
  );

  useEffect(() => {
    if (!shouldDerivePersistedArtifacts) {
      setPersistedArtifacts([]);
      return;
    }

    let cancelled = false;
    void loadArtifactRuntime()
      .then((runtime) => {
        if (cancelled) return;
        const nextArtifacts = runtime.deriveArtifactsFromMessages(stableArtifactMessages, params.isZh);
        if (cancelled) return;
        startTransition(() => {
          setPersistedArtifacts(nextArtifacts);
        });
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("推导主工作台持久化产物失败", error);
      });

    return () => {
      cancelled = true;
    };
  }, [loadArtifactRuntime, params.isZh, shouldDerivePersistedArtifacts, stableArtifactMessages]);

  const streamingArtifact = useMemo(
    () => streamingArtifacts[streamingArtifacts.length - 1] ?? null,
    [streamingArtifacts],
  );

  useEffect(() => {
    streamingArtifactsRef.current = streamingArtifacts;
    scheduleStreamingArtifactPreviewRefresh();
  }, [scheduleStreamingArtifactPreviewRefresh, streamingArtifacts]);

  const streamingArtifactPreview = useMemo(
    () => streamingArtifactPreviews[streamingArtifactPreviews.length - 1] ?? null,
    [streamingArtifactPreviews],
  );
  const resolveMessageOrder = useCallback(
    (messageId: string) => {
      const messageIndex = params.messages.findIndex((message) => message.id === messageId);
      return messageIndex >= 0 ? messageIndex : Number.MAX_SAFE_INTEGER;
    },
    [params.messages],
  );
  useEffect(() => {
    const promotableArtifacts = streamingArtifactPreviews.filter(
      (artifact) =>
        artifact.sourceStage === "complete" || artifact.integrityStatus === "invalid",
    );
    if (promotableArtifacts.length === 0) {
      return;
    }

    const promotedKeys = new Set(
      promotableArtifacts.map((artifact) => getAgentArtifactKey(artifact)),
    );
    startTransition(() => {
      setSessionArtifacts((prev) =>
        promotableArtifacts.reduce((currentArtifacts, artifact) => {
          const sourceMessageId =
            artifact.sourceMessageId || activeLiveAssistantMessageIdRef.current;
          const nextArtifact = sourceMessageId
            ? {
                ...artifact,
                sourceMessageId,
                order: resolveMessageOrder(sourceMessageId),
              }
            : artifact;
          return upsertArtifactByKey(currentArtifacts, nextArtifact);
        }, prev),
      );
      setStreamingArtifacts((currentArtifacts) =>
        currentArtifacts.filter(
          (artifact) => !promotedKeys.has(getStreamingArtifactKey(artifact)),
        ),
      );
    });
    promotedKeys.forEach((artifactKey) => {
      clearArtifactCleanupTimer(artifactKey);
    });
  }, [clearArtifactCleanupTimer, resolveMessageOrder, streamingArtifactPreviews]);
  const artifacts = useMemo(() => {
    const canonicalArtifacts = new Map<string, AgentArtifact>();
    const applyArtifact = (artifact: AgentArtifact) => {
      const artifactKey = getAgentArtifactKey(artifact);
      canonicalArtifacts.set(
        artifactKey,
        mergeCanonicalArtifact(canonicalArtifacts.get(artifactKey), artifact),
      );
    };

    persistedArtifacts.forEach(applyArtifact);
    sessionArtifacts.forEach(applyArtifact);
    streamingArtifactPreviews.forEach(applyArtifact);

    return Array.from(canonicalArtifacts.values()).sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order;
      }
      return left.title.localeCompare(right.title, params.isZh ? "zh-CN" : "en-US");
    });
  }, [params.isZh, persistedArtifacts, sessionArtifacts, streamingArtifactPreviews]);
  const artifactByMessageId = useMemo(() => {
    const next = new Map<string, AgentArtifact[]>();
    const appendArtifact = (messageId: string, artifact: AgentArtifact) => {
      const existing = next.get(messageId);
      if (!existing) {
        next.set(messageId, [artifact]);
        return;
      }
      if (
        existing.some(
          (item) =>
            getAgentArtifactKey(item) === getAgentArtifactKey(artifact),
        )
      ) {
        return;
      }
      existing.push(artifact);
    };

    artifacts.forEach((artifact) => {
      if (!artifact.sourceMessageId) return;
      appendArtifact(artifact.sourceMessageId, artifact);
    });
    return next;
  }, [artifacts]);
  const latestExportableArtifact = useMemo(
    () =>
      [...artifacts].reverse().find((artifact) => !artifact.scanResult) ?? null,
    [artifacts],
  );
  const showArtifactCanvas = useMemo(() => {
    if (openArtifactIds.length === 0) return false;
    // streaming 期间只要有 openArtifactIds 就保持 Canvas 显示
    if (params.streaming) return true;
    const validIds = new Set(artifacts.map((artifact) => artifact.id));
    return openArtifactIds.some((artifactId) => validIds.has(artifactId));
  }, [artifacts, openArtifactIds, params.streaming]);
  const memoryHighlights = useMemo(() => [], []);
  const activityHighlights = useMemo(
    () =>
      timelineItems
        .slice(-4)
        .reverse()
        .map((item) => ({
          id: item.id,
          title: item.title,
          status: item.status,
          durationMs: item.durationMs,
          detail: item.detail ?? item.outputPreview ?? item.inputPreview,
        })),
    [timelineItems],
  );
  const latestAssistantMarkdown = useMemo(() => {
    for (let index = params.messages.length - 1; index >= 0; index -= 1) {
      const message = params.messages[index];
      if (
        message.role === "assistant" &&
        message.content.trim() &&
        !message.scanResult &&
        !message.clarificationQuestion &&
        message.includeInModel !== false
      ) {
        return message.content.trim();
      }
    }
    return "";
  }, [params.messages]);
  const activeTimelineItem = useMemo(
    () =>
      [...timelineItems].reverse().find((item) => item.status === "running") ??
      null,
    [timelineItems],
  );
  const visibleTimelineItems = useMemo(
    () => [...timelineItems].reverse().slice(0, 3),
    [timelineItems],
  );
  const visibleWorkingNotes = useMemo(
    () =>
      [...workingNotes]
        .sort((a, b) => b.at - a.at)
        .slice(0, 4),
    [workingNotes],
  );
  const processingHeadline = useMemo(() => {
    if (params.restoringConversation) {
      return params.isZh
        ? "正在恢复上次对话。"
        : "Restoring your last conversation.";
    }
    const activeWorkingNote = [...workingNotes].reverse().find(
      (note) => note.status === "running",
    );
    if (activeWorkingNote) {
      return activeWorkingNote.title;
    }
    if (activeTimelineItem) {
      return `${params.isZh ? "正在处理：" : "Working on: "}${humanizeTimelineTitle(activeTimelineItem.title, params.isZh)}`;
    }
    if (params.streaming) {
      return params.isZh
        ? "正在整理答案并持续更新回复。"
        : "Preparing the answer and streaming updates.";
    }
    if (timelineTotalMs) {
      return params.isZh
        ? `本轮处理完成，用时 ${formatTimelineDuration(timelineTotalMs, params.isZh)}。`
        : `Completed in ${formatTimelineDuration(timelineTotalMs, params.isZh)}.`;
    }
    return "";
  }, [
    activeTimelineItem,
    params.isZh,
    params.restoringConversation,
    params.streaming,
    workingNotes,
    timelineTotalMs,
  ]);
  const showProgressPanel =
    params.restoringConversation ||
    params.streaming ||
    timelineItems.length > 0;

  const newestArtifactId = useMemo(
    () => artifacts[artifacts.length - 1]?.id ?? null,
    [artifacts],
  );

  // streaming 期间不清理 openArtifactIds — 避免 artifact 刷新时 Canvas 闪烁消失
  useEffect(() => {
    if (params.streaming) return;

    const shouldAutoOpenLatestArtifact = artifactAutoOpenMode === "latest";
    const validIds = new Set(artifacts.map((artifact) => artifact.id));
    const nextOpenIds = openArtifactIds.filter((artifactId) =>
      validIds.has(artifactId),
    );
    const fallbackArtifactId =
      nextOpenIds[nextOpenIds.length - 1] ??
      (shouldAutoOpenLatestArtifact ? newestArtifactId : null);
    const nextActiveId =
      activeArtifactId && nextOpenIds.includes(activeArtifactId)
        ? activeArtifactId
        : fallbackArtifactId ?? null;

    if (
      nextOpenIds.length !== openArtifactIds.length ||
      (shouldAutoOpenLatestArtifact && nextOpenIds.length === 0 && newestArtifactId)
    ) {
      setOpenArtifactIds(
        nextOpenIds.length > 0 || !shouldAutoOpenLatestArtifact || !newestArtifactId
          ? nextOpenIds
          : [newestArtifactId],
      );
    }
    if (nextActiveId !== activeArtifactId) {
      setActiveArtifactId(nextActiveId);
    }
  }, [
    activeArtifactId,
    artifactAutoOpenMode,
    artifacts,
    newestArtifactId,
    openArtifactIds,
    params.streaming,
  ]);

  useEffect(() => {
    if (artifactAutoOpenMode !== "latest") return;
    if (!newestArtifactId) return;
    if (params.streaming && streamingArtifactPreviews.length > 0) return;
    if (manuallyClosedArtifactIdsRef.current.has(newestArtifactId)) return;
    if (openArtifactIds.includes(newestArtifactId) && activeArtifactId === newestArtifactId) {
      return;
    }

    startTransition(() => {
      setOpenArtifactIds((prev) =>
        prev.includes(newestArtifactId) ? prev : [...prev, newestArtifactId],
      );
      setActiveArtifactId((prev) => prev ?? newestArtifactId);
    });
  }, [
    activeArtifactId,
    artifactAutoOpenMode,
    newestArtifactId,
    openArtifactIds,
    params.streaming,
    streamingArtifactPreviews.length,
  ]);

  const prepareConversationRestore = useCallback(() => {
    clearAllArtifactCleanupTimers();
    clearStreamingPreviewRefreshTimer();
    focusedStreamingArtifactIdRef.current = null;
    manuallyClosedArtifactIdsRef.current.clear();
    activeLiveAssistantMessageIdRef.current = null;

    startTransition(() => {
      setArtifactAutoOpenMode("none");
      setOpenArtifactIds([]);
      setActiveArtifactId(null);
      setStreamingArtifacts([]);
      setStreamingArtifactPreviews([]);
      setSessionArtifacts([]);
      setPersistedArtifacts([]);
      setSuppressedArtifactMessageIds([]);
      setStreamingAssistantDraft(null);
      setTimelineItems([]);
      setTimelineTotalMs(null);
      setWorkingNotes([]);
      setProcessSummary(null);
    });
  }, [clearAllArtifactCleanupTimers, clearStreamingPreviewRefreshTimer]);

  const resetWorkspaceArtifacts = useCallback(() => {
    clearAllArtifactCleanupTimers();
    clearStreamingPreviewRefreshTimer();
    focusedStreamingArtifactIdRef.current = null;
    manuallyClosedArtifactIdsRef.current.clear();
    activeLiveAssistantMessageIdRef.current = null;

    startTransition(() => {
      setArtifactAutoOpenMode("latest");
      setOpenArtifactIds([]);
      setActiveArtifactId(null);
      setStreamingArtifacts([]);
      setStreamingArtifactPreviews([]);
      setPersistedArtifacts([]);
      setSessionArtifacts([]);
      setSuppressedArtifactMessageIds([]);
      setStreamingAssistantDraft(null);
      setTimelineItems([]);
      setTimelineTotalMs(null);
      setWorkingNotes([]);
      setProcessSummary(null);
    });
  }, [clearAllArtifactCleanupTimers, clearStreamingPreviewRefreshTimer]);

  const resumeLiveArtifactAutoOpen = useCallback(() => {
    startTransition(() => {
      setArtifactAutoOpenMode("latest");
    });
  }, []);

  const beginLiveArtifactSession = useCallback((messageId: string) => {
    activeLiveAssistantMessageIdRef.current = messageId;
    startTransition(() => {
      setSuppressedArtifactMessageIds((prev) =>
        prev.includes(messageId) ? prev : [...prev, messageId],
      );
    });
  }, []);

  const handleArtifactPersisted = useCallback((payload: {
    artifactKey: string;
    assistantMessageId?: string;
    conversationId?: string;
  }) => {
    const artifactKey = payload.artifactKey.trim();
    if (!artifactKey) {
      return;
    }

    clearArtifactCleanupTimer(artifactKey);
    startTransition(() => {
      setSessionArtifacts((prev) =>
        prev.map((artifact) =>
          getAgentArtifactKey(artifact) === artifactKey
            ? {
                ...artifact,
                sourceStage: "persisted",
              }
            : artifact,
        ),
      );
      setStreamingArtifacts((prev) =>
        prev.filter((artifact) => getStreamingArtifactKey(artifact) !== artifactKey),
      );
    });
  }, [clearArtifactCleanupTimer]);

  useEffect(() => {
    return () => {
      clearAllArtifactCleanupTimers();
    };
  }, [clearAllArtifactCleanupTimers]);

  useEffect(() => {
    return () => {
      clearStreamingPreviewRefreshTimer();
    };
  }, [clearStreamingPreviewRefreshTimer]);

  const openArtifact = useCallback((artifactId: string) => {
    manuallyClosedArtifactIdsRef.current.delete(artifactId);
    setOpenArtifactIds((prev) =>
      prev.includes(artifactId) ? prev : [...prev, artifactId],
    );
    setActiveArtifactId(artifactId);
  }, []);

  const closeArtifact = useCallback(
    (artifactId: string) => {
      manuallyClosedArtifactIdsRef.current.add(artifactId);
      const currentIndex = openArtifactIds.indexOf(artifactId);
      const nextIds = openArtifactIds.filter((id) => id !== artifactId);
      setOpenArtifactIds(nextIds);
      if (activeArtifactId === artifactId) {
        const fallbackIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
        setActiveArtifactId(
          nextIds[fallbackIndex] ?? nextIds[nextIds.length - 1] ?? null,
        );
      }
    },
    [activeArtifactId, openArtifactIds],
  );

  const updateAssistantMessage = useCallback(
    (messageId: string, updater: (prev: string) => string) => {
      startTransition(() => {
        params.setMessages((prev) =>
          prev.map((item) => {
            if (item.id !== messageId) return item;
            return { ...item, content: updater(item.content) };
          }),
        );
      });
    },
    [params],
  );

  const updateAssistantDraft = useCallback((draft: StreamingAssistantDraft) => {
    startTransition(() => {
      setStreamingAssistantDraft((prev) => {
        if (
          prev?.messageId === draft.messageId &&
          prev.content === draft.content
        ) {
          return prev;
        }
        return draft;
      });
    });
  }, []);

  const clearAssistantDraft = useCallback((messageId?: string) => {
    startTransition(() => {
      setStreamingAssistantDraft((prev) => {
        if (!prev) return null;
        if (messageId && prev.messageId !== messageId) {
          return prev;
        }
        return null;
      });
    });
  }, []);

  const appendAssistantQuestionBlock = useCallback(
    (messageId: string, question: AgentQuestionBlock) => {
      startTransition(() => {
        params.setMessages((prev) =>
          prev.map((item) => {
            if (item.id !== messageId) return item;
            const existing = item.questionBlocks ?? [];
            if (existing.some((block) => block.id === question.id)) {
              return item;
            }
            return {
              ...item,
              questionBlocks: [...existing, question],
            };
          }),
        );
      });
    },
    [params],
  );

  const appendTimelineItem = useCallback((item: TimelineItem) => {
    setTimelineItems((prev) => {
      if (prev.some((existing) => existing.id === item.id)) return prev;
      return [...prev, item];
    });
  }, []);

  const patchTimelineItem = useCallback(
    (id: string, updater: (prev: TimelineItem) => TimelineItem) => {
      setTimelineItems((prev) =>
        prev.map((item) => (item.id === id ? updater(item) : item)),
      );
    },
    [],
  );

  const upsertWorkingNote = useCallback((note: WorkingNote) => {
    setWorkingNotes((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === note.id);
      if (existingIndex < 0) {
        return [...prev, note];
      }
      return prev.map((item, index) => (index === existingIndex ? { ...item, ...note } : item));
    });
  }, []);

  const addMessages = useCallback(
    (appended: AgentMessage[]) => {
      params.setMessages((prev) => [...prev, ...appended]);
    },
    [params],
  );

  const resetTimelineState = useCallback((options?: { preserveArtifactPreview?: boolean }) => {
    setTimelineItems([]);
    setTimelineTotalMs(null);
    setWorkingNotes([]);
    setProcessSummary(null);
    clearAllArtifactCleanupTimers();
    focusedStreamingArtifactIdRef.current = null;
    if (!options?.preserveArtifactPreview) {
      setStreamingArtifacts([]);
    }
    setStreamingAssistantDraft(null);
  }, [clearAllArtifactCleanupTimers]);

  return {
    timelineItems,
    setTimelineItems,
    timelineTotalMs,
    setTimelineTotalMs,
    openArtifactIds,
    setOpenArtifactIds,
    activeArtifactId,
    setActiveArtifactId,
    artifacts,
    artifactByMessageId,
    latestExportableArtifact,
    showArtifactCanvas,
    memoryHighlights,
    activityHighlights,
    latestAssistantMarkdown,
    streamingAssistantDraft,
    streamingArtifactPreview,
    workingNotes,
    visibleWorkingNotes,
    processSummary,
    setProcessSummary,
    activeTimelineItem,
    visibleTimelineItems,
    processingHeadline,
    showProgressPanel,
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
    streamingArtifact,
    beginLiveArtifactSession,
    handleArtifactChunk,
    handleArtifactPersisted,
    warmArtifactRuntime,
    prepareConversationRestore,
    resetWorkspaceArtifacts,
    resumeLiveArtifactAutoOpen,
  };
}
