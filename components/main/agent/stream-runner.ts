"use client";

import { startTransition, type Dispatch, type SetStateAction } from "react";
import type {
  AgentQuestionBlock,
  AgentStreamEvent,
  ArtifactChunkEvent,
} from "@/lib/agent/chat-stream-types";
import type { ArtifactIntegrityStatus } from "@/lib/agent/artifact-integrity";
import {
  normalizeArtifactRole,
  normalizeArtifactVariant,
  normalizeArtifactContentMode,
  resolveArtifactContentMode,
  type ArtifactContentMode,
  type ArtifactRole,
  type ArtifactVariant,
} from "@/lib/agent/artifact-payload";
import { normalizeArtifactRenderableContent } from "@/lib/agent/artifact-text";
import {
  mergeMarkdownOutlineProjectorState,
  type MarkdownOutlineProjectorState,
  type StreamingOutlineNode,
  type StreamingOutlineNodeStatus,
} from "@/lib/agent/markdown-outline-streaming";

export type TimelineItem = {
  id: string;
  kind: "step" | "tool";
  title: string;
  status: "running" | "done" | "error";
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  detail?: string;
  inputPreview?: string;
  outputPreview?: string;
};

export type StreamingAssistantDraft = {
  messageId: string;
  content: string;
};

export type WorkingNote = {
  id: string;
  runId: string;
  section:
    | "understanding"
    | "materials"
    | "planning"
    | "tooling"
    | "generation"
    | "validation"
    | "handoff";
  status: "running" | "done" | "error";
  title: string;
  markdown: string;
  importance: "high" | "normal" | "low";
  transient: boolean;
  at: number;
};

export type ProcessSummary = {
  runId: string;
  title: string;
  markdown: string;
  totalMs?: number;
  at: number;
};

function previewUnknown(value: unknown, maxLength = 260) {
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    if (!text) return "";
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  } catch {
    return String(value ?? "");
  }
}

export type StreamingArtifact = {
  toolCallId: string;
  artifactKey: string;
  sourceMessageId?: string;
  artifactRole?: ArtifactRole;
  artifactVariant?: ArtifactVariant;
  artifactKind: ArtifactChunkEvent["artifactKind"];
  contentMode?: ArtifactContentMode;
  title: string;
  summary?: string;
  previewText?: string;
  rawContent?: string;
  document?: unknown;
  htmlContent?: string;
  integrityStatus?: ArtifactIntegrityStatus;
  items: unknown[];
  isComplete: boolean;
  meta: unknown;
  projector?: MarkdownOutlineProjectorState;
};

const ARTIFACT_REVEAL_TICK_MS = 72;

function readArtifactChunkRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readArtifactChunkText(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return normalizeArtifactRenderableContent(value).content;
  }
  return "";
}

function extractArtifactChunkFields(value: unknown) {
  const record = readArtifactChunkRecord(value);
  const directText = readArtifactChunkText(value);
  if (!record) {
    return {
      rawContent: directText || undefined,
    };
  }

  const title =
    typeof record.title === "string" && record.title.trim()
      ? normalizeArtifactRenderableContent(record.title).content
      : undefined;
  const summary =
    typeof record.summary === "string" && record.summary.trim()
      ? normalizeArtifactRenderableContent(record.summary).content
      : undefined;
  const previewText =
    typeof record.previewText === "string" && record.previewText.trim()
      ? normalizeArtifactRenderableContent(record.previewText).content
      : undefined;
  const rawContentSource =
    typeof record.rawContent === "string" && record.rawContent.trim()
      ? record.rawContent.trim()
      : typeof record.markdown === "string" && record.markdown.trim()
        ? record.markdown.trim()
        : typeof record.content === "string" && record.content.trim()
          ? record.content.trim()
          : typeof record.text === "string" && record.text.trim()
            ? record.text.trim()
            : directText || undefined;
  const rawContent = rawContentSource
    ? normalizeArtifactRenderableContent(rawContentSource).content || rawContentSource
    : undefined;
  const htmlContent =
    typeof record.htmlContent === "string" && record.htmlContent.trim()
      ? record.htmlContent.trim()
      : undefined;
  const contentMode =
    normalizeArtifactContentMode(record.contentMode) ??
    resolveArtifactContentMode({
      document:
        "document" in record && record.document
          ? (record.document as Record<string, unknown>)
          : readArtifactChunkRecord(value)?.blocks && readArtifactChunkRecord(value)?.layoutConfig
            ? (value as Record<string, unknown>)
            : undefined,
      htmlContent,
      rawContent,
    });
  const integrityStatus =
    record.integrityStatus === "streaming" ||
    record.integrityStatus === "complete" ||
    record.integrityStatus === "repaired" ||
    record.integrityStatus === "invalid"
      ? (record.integrityStatus as ArtifactIntegrityStatus)
      : undefined;
  const document =
    "document" in record && record.document
      ? record.document
      : readArtifactChunkRecord(value)?.blocks && readArtifactChunkRecord(value)?.layoutConfig
        ? value
        : undefined;

  return {
    title,
    summary,
    previewText,
    rawContent,
    document,
    htmlContent,
    artifactRole: normalizeArtifactRole(record.artifactRole) ?? undefined,
    artifactVariant: normalizeArtifactVariant(record.artifactVariant) ?? undefined,
    contentMode,
    integrityStatus,
  };
}

function fallbackArtifactTitle(kind: ArtifactChunkEvent["artifactKind"], isZh: boolean) {
  const normalized = `${kind || ""}`.toLowerCase();
  if (normalized.includes("exam")) return isZh ? "试卷（生成中）" : "Exam (streaming)";
  if (normalized.includes("worksheet")) return isZh ? "练习卷（生成中）" : "Worksheet (streaming)";
  if (normalized.includes("rubric")) return isZh ? "Rubric（生成中）" : "Rubric (streaming)";
  if (normalized.includes("lesson")) return isZh ? "教案（生成中）" : "Lesson Plan (streaming)";
  if (normalized.includes("exercise")) return isZh ? "试题（生成中）" : "Exercises (streaming)";
  if (normalized.includes("pbl")) return isZh ? "PBL 项目（生成中）" : "PBL Project (streaming)";
  if (normalized.includes("document")) return isZh ? "文档（生成中）" : "Document (streaming)";
  return isZh ? "产物（生成中）" : "Artifact (streaming)";
}

function resolveToolCallArtifactKind(toolName: string): ArtifactChunkEvent["artifactKind"] | null {
  switch (toolName) {
    case "generate_answer_key":
    case "generate_exit_ticket":
      return "worksheet";
    case "generate_rubric":
      return "rubric";
    case "generate_lesson_plan_workflow":
      return "lesson-plan";
    case "generate_worksheet":
    case "assemble_worksheet":
      return "worksheet";
    case "generate_ap_exercises_pipeline":
      return "exam";
    case "generate_pbl_project":
      return "pbl";
    default:
      return null;
  }
}

function buildToolCallArtifactPlaceholder(params: {
  toolCallId: string;
  toolName: string;
  isZh: boolean;
}): StreamingArtifact | null {
  const artifactKind = resolveToolCallArtifactKind(params.toolName);
  if (!artifactKind) {
    return null;
  }

  return {
    toolCallId: params.toolCallId,
    artifactKey: params.toolCallId,
    artifactKind,
    contentMode: "plain-text-fallback",
    title: fallbackArtifactTitle(artifactKind, params.isZh),
    summary: params.isZh
      ? "正在初始化右侧 Canvas，正文会随着工具输出持续补全。"
      : "Initializing the right-side canvas. Content will stream in as the tool runs.",
    previewText: params.isZh
      ? "已进入文档生成阶段。"
      : "Document generation has started.",
    rawContent: "",
    items: [],
    isComplete: false,
    meta: {
      toolName: params.toolName,
      sourceStage: "streaming",
      integrityStatus: "streaming",
    },
  };
}

function readOutlineNodePatches(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<
      Partial<StreamingOutlineNode> & Pick<StreamingOutlineNode, "id">
    >;
  }

  return value.flatMap((node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return [];
    const record = node as Record<string, unknown>;
    if (typeof record.id !== "string" || !record.id.trim()) {
      return [];
    }

    return [
      {
        id: record.id.trim(),
        title: typeof record.title === "string" ? record.title : undefined,
        status: readOutlineNodeStatus(record.status),
        content: typeof record.content === "string" ? record.content : undefined,
        nodeKind:
          typeof record.nodeKind === "string" ? record.nodeKind : undefined,
      },
    ];
  });
}

function readOutlineNodeStatus(
  value: unknown,
): StreamingOutlineNodeStatus | undefined {
  if (value === "pending" || value === "streaming" || value === "complete") {
    return value;
  }
  return undefined;
}

export function createAgentStreamEventHandler(params: {
  assistantMessageId: string;
  isZh: boolean;
  updateAssistantMessage: (messageId: string, updater: (prev: string) => string) => void;
  updateAssistantDraft: (draft: StreamingAssistantDraft) => void;
  clearAssistantDraft: (messageId?: string) => void;
  appendAssistantQuestionBlock: (
    messageId: string,
    question: AgentQuestionBlock,
  ) => void;
  appendTimelineItem: (item: TimelineItem) => void;
  patchTimelineItem: (
    id: string,
    updater: (prev: TimelineItem) => TimelineItem,
  ) => void;
  upsertWorkingNote: (note: WorkingNote) => void;
  setProcessSummary: Dispatch<SetStateAction<ProcessSummary | null>>;
  setTimelineItems: Dispatch<SetStateAction<TimelineItem[]>>;
  setTimelineTotalMs: Dispatch<SetStateAction<number | null>>;
  setConversationId: (conversationId: string) => void;
  setErrorText: (message: string) => void;
  refreshMemoryContext: () => void;
  scrollToBottom: () => void;
  onArtifactChunk?: (artifact: StreamingArtifact) => void;
  onArtifactPersisted?: (payload: {
    artifactKey: string;
    assistantMessageId?: string;
    conversationId?: string;
  }) => void;
}) {
  let combined = "";
  let streamErrorMessage = "";
  let hasRenderableAssistantPayload = false;
  const streamingArtifacts = new Map<string, StreamingArtifact>();
  const artifactRevealQueues = new Map<string, string>();
  const artifactRevealTimers = new Map<string, ReturnType<typeof globalThis.setTimeout>>();
  let assistantDraftFrame: number | null = null;
  let lastDraftText = "";

  const emitArtifact = (artifact: StreamingArtifact | undefined) => {
    if (artifact && params.onArtifactChunk) {
      startTransition(() => {
        params.onArtifactChunk?.(artifact);
      });
    }
  };

  const findArtifactKeyByToolCallId = (toolCallId: string) => {
    for (const [key, artifact] of streamingArtifacts.entries()) {
      if (artifact.toolCallId === toolCallId) {
        return key;
      }
    }
    return null;
  };

  const resolveArtifactKey = (event: Pick<ArtifactChunkEvent, "toolCallId" | "artifactKey">) => {
    const explicitKey = typeof event.artifactKey === "string" ? event.artifactKey.trim() : "";
    if (explicitKey) {
      if (explicitKey !== event.toolCallId && !streamingArtifacts.has(explicitKey)) {
        const placeholderArtifact = streamingArtifacts.get(event.toolCallId);
        if (placeholderArtifact) {
          streamingArtifacts.set(explicitKey, {
            ...placeholderArtifact,
            artifactKey: explicitKey,
          });
          streamingArtifacts.delete(event.toolCallId);
        }
        const queuedReveal = artifactRevealQueues.get(event.toolCallId);
        if (queuedReveal) {
          artifactRevealQueues.set(explicitKey, queuedReveal);
          artifactRevealQueues.delete(event.toolCallId);
        }
        const revealTimer = artifactRevealTimers.get(event.toolCallId);
        if (revealTimer) {
          artifactRevealTimers.set(explicitKey, revealTimer);
          artifactRevealTimers.delete(event.toolCallId);
        }
      }
      return explicitKey;
    }

    return findArtifactKeyByToolCallId(event.toolCallId) ?? event.toolCallId;
  };

  const takeLeadingText = (text: string, units: number) => {
    if (!text || units <= 0) {
      return { head: "", tail: text };
    }
    const chars = Array.from(text);
    return {
      head: chars.slice(0, units).join(""),
      tail: chars.slice(units).join(""),
    };
  };

  const resolveRevealUnits = (queuedLength: number) => {
    if (queuedLength > 1600) return 280;
    if (queuedLength > 800) return 180;
    if (queuedLength > 320) return 96;
    if (queuedLength > 120) return 48;
    return 24;
  };

  const commitAssistantDraft = () => {
    if (lastDraftText === combined) {
      return;
    }
    lastDraftText = combined;
    startTransition(() => {
      params.updateAssistantDraft({
        messageId: params.assistantMessageId,
        content: combined,
      });
    });
    params.scrollToBottom();
  };

  const scheduleAssistantDraftCommit = () => {
    if (assistantDraftFrame != null) {
      return;
    }
    assistantDraftFrame = globalThis.requestAnimationFrame(() => {
      assistantDraftFrame = null;
      commitAssistantDraft();
    });
  };

  const flushAssistantDraft = () => {
    if (assistantDraftFrame != null) {
      globalThis.cancelAnimationFrame(assistantDraftFrame);
      assistantDraftFrame = null;
    }
    commitAssistantDraft();
  };

  const clearAssistantDraft = () => {
    if (assistantDraftFrame != null) {
      globalThis.cancelAnimationFrame(assistantDraftFrame);
      assistantDraftFrame = null;
    }
    lastDraftText = "";
    startTransition(() => {
      params.clearAssistantDraft(params.assistantMessageId);
    });
  };

  const scheduleArtifactReveal = (key: string) => {
    if (artifactRevealTimers.has(key)) return;

    const tick = () => {
      const queued = artifactRevealQueues.get(key) ?? "";
      const artifact = streamingArtifacts.get(key);
      if (!artifact || !queued) {
        artifactRevealTimers.delete(key);
        return;
      }

      const { head, tail } = takeLeadingText(queued, resolveRevealUnits(Array.from(queued).length));
      artifactRevealQueues.set(key, tail);
      const nextArtifact = {
        ...artifact,
        rawContent: `${artifact.rawContent ?? ""}${head}`,
      };
      streamingArtifacts.set(key, nextArtifact);
      emitArtifact(nextArtifact);

      if (!tail) {
        artifactRevealTimers.delete(key);
        return;
      }

      artifactRevealTimers.set(
        key,
        globalThis.setTimeout(tick, ARTIFACT_REVEAL_TICK_MS),
      );
    };

    artifactRevealTimers.set(key, globalThis.setTimeout(tick, ARTIFACT_REVEAL_TICK_MS));
  };

  const flushArtifactRevealQueue = (key: string) => {
    const pending = artifactRevealQueues.get(key) ?? "";
    if (!pending) return;
    const artifact = streamingArtifacts.get(key);
    if (!artifact) return;
    artifactRevealQueues.set(key, "");
    const timer = artifactRevealTimers.get(key);
    if (timer) {
      globalThis.clearTimeout(timer);
      artifactRevealTimers.delete(key);
    }
    const nextArtifact = {
      ...artifact,
      rawContent: `${artifact.rawContent ?? ""}${pending}`,
    };
    streamingArtifacts.set(key, nextArtifact);
    emitArtifact(nextArtifact);
  };

  return {
    getCombinedText() {
      return combined;
    },
    getStreamErrorMessage() {
      return streamErrorMessage;
    },
    hasRenderableAssistantPayload() {
      return hasRenderableAssistantPayload || combined.trim().length > 0;
    },
    handleEvent(event: AgentStreamEvent) {
      switch (event.type) {
        case "meta": {
          if (event.conversationId) {
            params.setConversationId(event.conversationId);
          }
          break;
        }
        case "run": {
          break;
        }
        case "working-note": {
          params.upsertWorkingNote({
            id: event.id,
            runId: event.runId,
            section: event.section,
            status: event.status,
            title: event.title,
            markdown: event.markdown,
            importance: event.importance ?? "normal",
            transient: event.transient ?? true,
            at: event.at,
          });
          break;
        }
        case "process-summary": {
          params.setProcessSummary({
            runId: event.runId,
            title: event.title,
            markdown: event.markdown,
            totalMs: event.totalMs,
            at: event.at,
          });
          break;
        }
        case "text-delta": {
          const delta = typeof event.text === "string" ? event.text : "";
          if (!delta) break;
          combined += delta;
          hasRenderableAssistantPayload = true;
          scheduleAssistantDraftCommit();
          break;
        }
        case "phase": {
          const timelineId = `phase:${event.phase}`;
          if (event.status === "running") {
            params.appendTimelineItem({
              id: timelineId,
              kind: "step",
              title: event.label || event.phase,
              status: "running",
              startedAt: event.at,
              detail: event.detail,
            });
          } else {
            params.setTimelineItems((prev) => {
              const exists = prev.some((item) => item.id === timelineId);
              if (!exists) {
                return [
                  ...prev,
                  {
                    id: timelineId,
                    kind: "step",
                    title: event.label || event.phase,
                    status: event.status === "error" ? "error" : "done",
                    startedAt: event.at,
                    endedAt: event.at,
                    detail: event.detail,
                  },
                ];
              }

              return prev.map((item) =>
                item.id === timelineId
                  ? {
                      ...item,
                      status: event.status === "error" ? "error" : "done",
                      endedAt: event.at,
                      durationMs: Math.max(0, event.at - item.startedAt),
                      detail: event.detail ?? item.detail,
                    }
                  : item,
              );
            });
          }
          break;
        }
        case "question-ready": {
          if (event.question) {
            hasRenderableAssistantPayload = true;
            flushAssistantDraft();
            params.appendAssistantQuestionBlock(
              params.assistantMessageId,
              event.question,
            );
            params.scrollToBottom();
          }
          break;
        }
        case "step-start": {
          params.appendTimelineItem({
            id: event.stepId,
            kind: "step",
            title: event.label || "Step",
            status: "running",
            startedAt: event.at,
          });
          break;
        }
        case "step-finish": {
          params.setTimelineItems((prev) => {
            const explicitIndex = prev.findIndex((item) => item.id === event.stepId);
            const fallbackIndex =
              explicitIndex >= 0
                ? explicitIndex
                : (() => {
                    for (let index = prev.length - 1; index >= 0; index -= 1) {
                      const item = prev[index];
                      if (item.kind === "step" && item.status === "running") {
                        return index;
                      }
                    }
                    return -1;
                  })();

            if (fallbackIndex < 0) {
              return prev;
            }

            return prev.map((item, index) =>
              index === fallbackIndex
                ? {
                    ...item,
                    status: "done",
                    endedAt: event.at,
                    durationMs: Math.max(0, event.at - item.startedAt),
                    detail: event.finishReason
                      ? `结束原因：${event.finishReason}`
                      : item.detail,
                  }
                : item,
            );
          });
          break;
        }
        case "tool-call": {
          const toolName = event.toolName;
          params.appendTimelineItem({
            id: event.toolCallId,
            kind: "tool",
            title: toolName,
            status: "running",
            startedAt: event.at,
            inputPreview: previewUnknown(event.input),
          });
          const artifactPlaceholder = buildToolCallArtifactPlaceholder({
            toolCallId: event.toolCallId,
            toolName,
            isZh: params.isZh,
          });
          if (artifactPlaceholder) {
            hasRenderableAssistantPayload = true;
            streamingArtifacts.set(artifactPlaceholder.artifactKey, artifactPlaceholder);
            emitArtifact(artifactPlaceholder);
          }
          break;
        }
        case "tool-result": {
          params.patchTimelineItem(event.toolCallId, (prev) => ({
            ...prev,
            status: "done",
            endedAt: event.at,
            durationMs:
              event.durationMs ?? Math.max(0, event.at - prev.startedAt),
            outputPreview: previewUnknown(event.output),
          }));
          break;
        }
        case "tool-error": {
          const timelineId = event.toolCallId ?? `${Date.now()}`;
          if (event.toolCallId) {
            const artifactKey = findArtifactKeyByToolCallId(event.toolCallId) ?? event.toolCallId;
            const existingArtifact = streamingArtifacts.get(artifactKey);
            if (existingArtifact) {
              const invalidArtifact: StreamingArtifact = {
                ...existingArtifact,
                isComplete: true,
                integrityStatus: "invalid",
                previewText: event.message,
                meta: {
                  ...(typeof existingArtifact.meta === "object" && existingArtifact.meta
                    ? (existingArtifact.meta as Record<string, unknown>)
                    : {}),
                  integrityStatus: "invalid",
                  error: event.message,
                },
              };
              streamingArtifacts.set(artifactKey, invalidArtifact);
              emitArtifact(invalidArtifact);
            }
          }
          params.setTimelineItems((prev) => {
            const exists = prev.some((item) => item.id === timelineId);
            if (!exists) {
              return [
                ...prev,
                {
                  id: timelineId,
                  kind: "tool",
                  title: event.toolName ?? (params.isZh ? "工具" : "Tool"),
                  status: "error",
                  startedAt: event.at,
                  endedAt: event.at,
                  detail: event.message,
                },
              ];
            }
            return prev.map((item) =>
              item.id === timelineId
                ? {
                    ...item,
                    status: "error",
                    endedAt: event.at,
                    durationMs: Math.max(0, event.at - item.startedAt),
                    detail: event.message,
                  }
                : item,
            );
          });
          break;
        }
        case "artifact-chunk": {
          hasRenderableAssistantPayload = true;
          const key = resolveArtifactKey(event);
          let artifact = streamingArtifacts.get(key);
          const shouldIgnoreChunk =
            Boolean(artifact?.isComplete || artifact?.integrityStatus === "invalid") &&
            event.chunkType !== "complete";
          if (shouldIgnoreChunk) {
            break;
          }
          const chunkFields = extractArtifactChunkFields(event.data);

          if (event.chunkType === "meta") {
            const metaData = (event.data && typeof event.data === "object" ? event.data : {}) as Record<string, unknown>;
            artifact = {
              toolCallId: event.toolCallId,
              artifactKey: key,
              artifactRole: event.artifactRole ?? chunkFields.artifactRole,
              artifactVariant: event.artifactVariant ?? chunkFields.artifactVariant,
              artifactKind: event.artifactKind,
              contentMode: chunkFields.contentMode ?? artifact?.contentMode,
              title: chunkFields.title ||
                (typeof metaData.title === "string" && metaData.title.trim()) ||
                fallbackArtifactTitle(event.artifactKind, params.isZh),
              summary: chunkFields.summary,
              previewText: chunkFields.previewText,
              rawContent: chunkFields.rawContent,
              document: chunkFields.document,
              htmlContent: chunkFields.htmlContent,
              integrityStatus: chunkFields.integrityStatus,
              items: [],
              isComplete: false,
              meta: event.data,
              projector: artifact?.projector,
            };
            streamingArtifacts.set(key, artifact);
          } else if (event.chunkType === "outline-solid" || event.chunkType === "section-outline") {
            const outlineData =
              event.data && typeof event.data === "object" && !Array.isArray(event.data)
                ? (event.data as Record<string, unknown>)
                : {};
            const previousProjector =
              artifact?.projector && artifact.projector.kind === "markdown-outline"
                ? artifact.projector
                : null;
            const projector = mergeMarkdownOutlineProjectorState(previousProjector, {
              title:
                typeof outlineData.title === "string" ? outlineData.title : artifact?.title,
              summary:
                typeof outlineData.summary === "string" ? outlineData.summary : artifact?.summary,
              previewText:
                typeof outlineData.previewText === "string"
                  ? outlineData.previewText
                  : artifact?.previewText,
              nodes: readOutlineNodePatches(
                "nodes" in outlineData ? outlineData.nodes : outlineData.sections,
              ),
            });
            artifact = {
              toolCallId: event.toolCallId,
              artifactKey: key,
              artifactRole: event.artifactRole ?? chunkFields.artifactRole ?? artifact?.artifactRole,
              artifactVariant:
                event.artifactVariant ?? chunkFields.artifactVariant ?? artifact?.artifactVariant,
              artifactKind: event.artifactKind,
              contentMode: chunkFields.contentMode ?? artifact?.contentMode,
              title:
                projector.title ||
                chunkFields.title ||
                artifact?.title ||
                fallbackArtifactTitle(event.artifactKind, params.isZh),
              summary: projector.summary ?? chunkFields.summary ?? artifact?.summary,
              previewText:
                projector.previewText ?? chunkFields.previewText ?? artifact?.previewText,
              rawContent: artifact?.rawContent,
              document: artifact?.document,
              htmlContent: chunkFields.htmlContent ?? artifact?.htmlContent,
              integrityStatus: chunkFields.integrityStatus ?? artifact?.integrityStatus,
              items: artifact?.items ?? [],
              isComplete: false,
              meta: artifact?.meta ?? {},
              projector,
            };
            streamingArtifacts.set(key, artifact);
          } else if (event.chunkType === "node-patch" || event.chunkType === "section-patch") {
            const patchData =
              event.data && typeof event.data === "object" && !Array.isArray(event.data)
                ? (event.data as Record<string, unknown>)
                : {};
            if (!artifact) {
              artifact = {
                toolCallId: event.toolCallId,
                artifactKey: key,
                artifactRole: event.artifactRole,
                artifactVariant: event.artifactVariant,
                artifactKind: event.artifactKind,
                contentMode: chunkFields.contentMode,
                title: fallbackArtifactTitle(event.artifactKind, params.isZh),
                rawContent: "",
                items: [],
                isComplete: false,
                meta: {},
                htmlContent: undefined,
                integrityStatus: undefined,
              };
            }
            const projector = mergeMarkdownOutlineProjectorState(
              artifact.projector && artifact.projector.kind === "markdown-outline"
                ? artifact.projector
                : null,
              {
                title:
                  typeof patchData.title === "string" ? patchData.title : artifact.title,
                summary:
                  typeof patchData.summary === "string"
                    ? patchData.summary
                    : artifact.summary,
                previewText:
                  typeof patchData.previewText === "string"
                    ? patchData.previewText
                    : artifact.previewText,
                nodes: readOutlineNodePatches(
                  "nodes" in patchData ? patchData.nodes : patchData.sections,
                ),
              },
            );
            artifact = {
              ...artifact,
              title: projector.title || artifact.title,
              summary: projector.summary ?? artifact.summary,
              previewText: projector.previewText ?? artifact.previewText,
              projector,
            };
            streamingArtifacts.set(key, artifact);
          } else if (event.chunkType === "item") {
            if (!artifact) {
              artifact = {
                toolCallId: event.toolCallId,
                artifactKey: key,
                artifactRole: event.artifactRole,
                artifactVariant: event.artifactVariant,
                artifactKind: event.artifactKind,
                contentMode: chunkFields.contentMode,
                title: fallbackArtifactTitle(event.artifactKind, params.isZh),
                rawContent: "",
                items: [],
                isComplete: false,
                meta: {},
              };
            }
            artifact = {
              ...artifact,
              artifactRole: event.artifactRole ?? chunkFields.artifactRole ?? artifact.artifactRole,
              artifactVariant:
                event.artifactVariant ?? chunkFields.artifactVariant ?? artifact.artifactVariant,
              title: chunkFields.title || artifact.title,
              summary: chunkFields.summary ?? artifact.summary,
              previewText: chunkFields.previewText ?? artifact.previewText,
              rawContent: chunkFields.rawContent
                ? artifact.rawContent
                  ? `${artifact.rawContent}\n\n${chunkFields.rawContent}`
                  : chunkFields.rawContent
                : artifact.rawContent,
              document: chunkFields.document ?? artifact.document,
              htmlContent: chunkFields.htmlContent ?? artifact.htmlContent,
              contentMode: chunkFields.contentMode ?? artifact.contentMode,
              integrityStatus: chunkFields.integrityStatus ?? artifact.integrityStatus,
              items: [...artifact.items, event.data],
              projector: artifact.projector,
            };
            streamingArtifacts.set(key, artifact);
          } else if (event.chunkType === "text-delta") {
            const deltaRecord =
              event.data && typeof event.data === "object" && !Array.isArray(event.data)
                ? (event.data as Record<string, unknown>)
                : null;
            const deltaText =
              typeof deltaRecord?.delta === "string"
                ? deltaRecord.delta
                : typeof deltaRecord?.text === "string"
                  ? deltaRecord.text
                  : typeof event.data === "string"
                  ? event.data
                    : "";
            if (!artifact) {
              artifact = {
                toolCallId: event.toolCallId,
                artifactKey: key,
                artifactRole: event.artifactRole,
                artifactVariant: event.artifactVariant,
                artifactKind: event.artifactKind,
                contentMode: chunkFields.contentMode,
                title: chunkFields.title || fallbackArtifactTitle(event.artifactKind, params.isZh),
                rawContent: "",
                items: [],
                isComplete: false,
                meta: {},
                htmlContent: undefined,
                integrityStatus: undefined,
              };
            }
            artifact = {
              ...artifact,
              artifactRole: event.artifactRole ?? chunkFields.artifactRole ?? artifact.artifactRole,
              artifactVariant:
                event.artifactVariant ?? chunkFields.artifactVariant ?? artifact.artifactVariant,
              title: chunkFields.title || artifact.title,
              summary: chunkFields.summary ?? artifact.summary,
              previewText: chunkFields.previewText ?? artifact.previewText,
              document: chunkFields.document ?? artifact.document,
              htmlContent: chunkFields.htmlContent ?? artifact.htmlContent,
              contentMode: chunkFields.contentMode ?? artifact.contentMode,
              integrityStatus: chunkFields.integrityStatus ?? artifact.integrityStatus,
              projector: artifact.projector,
            };
            streamingArtifacts.set(key, artifact);
            artifactRevealQueues.set(key, `${artifactRevealQueues.get(key) ?? ""}${deltaText}`);
            scheduleArtifactReveal(key);
          } else if (event.chunkType === "text-snapshot") {
            flushArtifactRevealQueue(key);
            artifact = streamingArtifacts.get(key);
            if (!artifact) {
              artifact = {
                toolCallId: event.toolCallId,
                artifactKey: key,
                artifactKind: event.artifactKind,
                contentMode: chunkFields.contentMode,
                title: chunkFields.title || fallbackArtifactTitle(event.artifactKind, params.isZh),
                rawContent: "",
                items: [],
                isComplete: false,
                meta: {},
                htmlContent: undefined,
                integrityStatus: undefined,
              };
            }
            const snapshotRaw =
              typeof (event.data as Record<string, unknown> | null)?.snapshot === "string"
                ? ((event.data as Record<string, unknown>).snapshot as string)
                : null;
            const snapshotNormalized = snapshotRaw
              ? normalizeArtifactRenderableContent(snapshotRaw).content || snapshotRaw
              : null;
            artifact = {
              ...artifact,
              title: chunkFields.title || artifact.title,
              summary: chunkFields.summary ?? artifact.summary,
              previewText: chunkFields.previewText ?? artifact.previewText,
              rawContent:
                chunkFields.rawContent ?? snapshotNormalized ?? artifact.rawContent,
              document: chunkFields.document ?? artifact.document,
              htmlContent: chunkFields.htmlContent ?? artifact.htmlContent,
              contentMode: chunkFields.contentMode ?? artifact.contentMode,
              integrityStatus: chunkFields.integrityStatus ?? artifact.integrityStatus,
              projector: artifact.projector,
            };
            streamingArtifacts.set(key, artifact);
          } else if (event.chunkType === "complete") {
            flushArtifactRevealQueue(key);
            artifact = streamingArtifacts.get(key);
            if (!artifact) {
              artifact = {
                toolCallId: event.toolCallId,
                artifactKey: key,
                artifactKind: event.artifactKind,
                contentMode: chunkFields.contentMode,
                title: fallbackArtifactTitle(event.artifactKind, params.isZh),
                rawContent: "",
                items: [],
                isComplete: false,
                meta: {},
                htmlContent: undefined,
                integrityStatus: undefined,
              };
            }
            const finalRawContent = chunkFields.rawContent ?? artifact.rawContent;
            const finalNormalized = finalRawContent
              ? normalizeArtifactRenderableContent(finalRawContent).content || finalRawContent
              : finalRawContent;
            artifact = {
              ...artifact,
              title: chunkFields.title || artifact.title,
              summary: chunkFields.summary ?? artifact.summary,
              previewText: chunkFields.previewText ?? artifact.previewText,
              rawContent: finalNormalized,
              document: chunkFields.document ?? artifact.document,
              htmlContent: chunkFields.htmlContent ?? artifact.htmlContent,
              contentMode: chunkFields.contentMode ?? artifact.contentMode,
              integrityStatus: chunkFields.integrityStatus ?? artifact.integrityStatus,
              isComplete: true,
              projector: artifact.projector,
            };
            streamingArtifacts.set(key, artifact);
          }

          if (artifact && event.chunkType !== "text-delta") {
            emitArtifact(artifact);
          }
          break;
        }
        case "artifact-persisted": {
          params.onArtifactPersisted?.({
            artifactKey: event.artifactKey,
            assistantMessageId: event.assistantMessageId,
            conversationId: event.conversationId,
          });
          break;
        }
        case "error": {
          flushAssistantDraft();
          streamErrorMessage =
            event.message ||
            (params.isZh ? "Agent 流式调用失败" : "Agent streaming failed");
          params.setErrorText(streamErrorMessage);
          break;
        }
        case "finish": {
          flushAssistantDraft();
          if (typeof event.totalMs === "number") {
            params.setTimelineTotalMs(event.totalMs);
          }
          const finishedAt = Date.now();
          params.setTimelineItems((prev) =>
            prev.map((item) =>
              item.status === "running"
                ? {
                    ...item,
                    status: "done",
                    endedAt: item.endedAt ?? finishedAt,
                    durationMs:
                      item.durationMs ??
                      Math.max(0, (item.endedAt ?? finishedAt) - item.startedAt),
                    detail:
                      item.detail ??
                      (event.finishReason
                        ? `结束原因：${event.finishReason}`
                        : item.detail),
                  }
                : item,
            ),
          );
          params.refreshMemoryContext();
          break;
        }
        default: {
          break;
        }
      }
    },
    clearDraft() {
      clearAssistantDraft();
    },
  };
}
