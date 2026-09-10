import { randomUUID } from "node:crypto";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type FinishReason,
} from "ai";
import {
  embedArtifactPayloads,
  normalizeArtifactContentMode,
  normalizeArtifactRole,
  normalizeArtifactVariant,
  resolveArtifactContentMode,
  type ArtifactRole,
  type ArtifactVariant,
  type EmbeddedArtifactKind,
  type EmbeddedArtifactPayload,
} from "@/lib/agent/artifact-payload";
import type { AgentMemoryPreview } from "@/lib/agent/context-memory";
import type { DocumentModel } from "@/lib/doc-engine/block-types";
import type { LessonPlanAudit } from "@/lib/agent/lesson-plan-workflow";
import type {
  AgentDecisionDataPart,
  AgentFinishDataPart,
  AgentHandoffDataPart,
  EduUIMessageChunk,
} from "@/lib/ai/ui-message";
import type { AgentQuestionBlock, AgentStreamEvent, ArtifactChunkKind, ArtifactChunkType } from "@/lib/agent/chat-stream-types";
import type {
  ToolArtifactDelta,
  ToolArtifactPayload,
} from "@/lib/agent/tools/tool-result";

function toSerializable(value: unknown, maxLength = 1500): unknown {
  try {
    const text = JSON.stringify(value);
    if (!text) return value;
    if (text.length <= maxLength) return value;
    return `${text.slice(0, maxLength)}...`;
  } catch {
    return String(value);
  }
}

type UiWriter = {
  write: (chunk: EduUIMessageChunk) => void;
};

function resolveDocumentToolPlaceholder(toolName: string) {
  switch (toolName) {
    case "generate_rubric":
      return {
        artifactKind: "rubric" as const,
        title: "Rubric（生成中）",
        summary: "正在生成 Rubric，右侧 Canvas 会持续补全真实正文。",
        previewText: "正在生成 Rubric，右侧 Canvas 已打开。",
      };
    case "generate_lesson_plan_workflow":
      return {
        artifactKind: "lesson-plan" as const,
        title: "教案（生成中）",
        summary: "正在生成教案，右侧 Canvas 会持续补全真实正文。",
        previewText: "正在生成教案，右侧 Canvas 已打开。",
      };
    case "generate_worksheet":
      return {
        artifactKind: "worksheet" as const,
        title: "Worksheet（生成中）",
        summary: "正在生成 Worksheet，右侧 Canvas 会持续补全真实正文。",
        previewText: "正在生成 Worksheet，右侧 Canvas 已打开。",
      };
    case "assemble_worksheet":
      return {
        artifactKind: "worksheet" as const,
        title: "Worksheet（组卷中）",
        summary: "正在组卷，右侧 Canvas 会持续补全真实正文。",
        previewText: "正在组卷，右侧 Canvas 已打开。",
      };
    case "generate_ap_exercises_pipeline":
      return {
        artifactKind: "exercises" as const,
        title: "试题（生成中）",
        summary: "正在生成试题，右侧 Canvas 会持续补全真实正文。",
        previewText: "正在生成试题，右侧 Canvas 已打开。",
      };
    case "generate_pbl_project":
      return {
        artifactKind: "pbl" as const,
        title: "PBL 项目（生成中）",
        summary: "正在生成 PBL 项目，右侧 Canvas 会持续补全真实正文。",
        previewText: "正在生成 PBL 项目，右侧 Canvas 已打开。",
      };
    default:
      return null;
  }
}

function writeUiData(
  writer: UiWriter,
  type: EduUIMessageChunk["type"],
  data: unknown,
) {
  writer.write({ type, data } as EduUIMessageChunk);
}

function writeAgentMeta(params: {
  writer: UiWriter;
  startedAt: number;
  conversationId?: string;
  memoryPreview?: AgentMemoryPreview;
}) {
  writeUiData(params.writer, "data-agent-meta", {
    startedAt: params.startedAt,
    conversationId: params.conversationId,
    memoryPreview: params.memoryPreview,
  });
}

type AgentRunMode =
  | "chat_answer"
  | "document_artifact"
  | "retrieval_only"
  | "retrieval_then_document"
  | "agent";
type AgentWorkingNoteSection =
  | "understanding"
  | "materials"
  | "planning"
  | "tooling"
  | "generation"
  | "validation"
  | "handoff";
type AgentWorkingNoteImportance = "high" | "normal" | "low";

function writeAgentRun(
  writer: UiWriter,
  payload: {
    runId: string;
    mode: AgentRunMode;
    status: "started" | "running" | "completed" | "error";
    startedAt: number;
  },
) {
  writeUiData(writer, "data-agent-run", payload);
}

function writeAgentDecision(
  writer: UiWriter,
  payload: AgentDecisionDataPart,
) {
  writeUiData(writer, "data-agent-decision", payload);
}

function writeAgentHandoff(
  writer: UiWriter,
  payload: AgentHandoffDataPart,
) {
  writeUiData(writer, "data-agent-handoff", payload);
}

function writeAgentWorkingNote(
  writer: UiWriter,
  payload: {
    id: string;
    runId: string;
    section: AgentWorkingNoteSection;
    status: "running" | "done" | "error";
    title: string;
    markdown: string;
    importance?: AgentWorkingNoteImportance;
    transient?: boolean;
    at?: number;
  },
) {
  writeUiData(writer, "data-agent-working-note", {
    ...payload,
    transient: payload.transient ?? true,
    at: payload.at ?? Date.now(),
  });
}

function writeAgentProcessSummary(
  writer: UiWriter,
  payload: {
    runId: string;
    title: string;
    markdown: string;
    totalMs?: number;
    at?: number;
  },
) {
  writeUiData(writer, "data-agent-process-summary", {
    ...payload,
    at: payload.at ?? Date.now(),
  });
}

function writeAgentPhase(
  writer: UiWriter,
  payload: {
    phase: string;
    label: string;
    status: "running" | "done" | "error";
    detail?: string;
    progressCurrent?: number;
    progressTotal?: number;
    at: number;
  },
) {
  writeUiData(writer, "data-agent-phase", payload);
}

function writeAgentStep(
  writer: UiWriter,
  payload: {
    kind: "start" | "finish";
    stepId: string;
    label: string;
    at: number;
    finishReason?: string;
  },
) {
  writeUiData(writer, "data-agent-step", payload);
}

function writeAgentQuestion(
  writer: UiWriter,
  question: AgentQuestionBlock,
  at: number,
) {
  writeUiData(writer, "data-agent-question-ready", { question, at });
}

function writeAgentArtifactChunk(
  writer: UiWriter,
  payload: {
    toolCallId: string;
    artifactKey?: string;
    artifactRole?: ArtifactRole;
    artifactVariant?: ArtifactVariant;
    artifactKind: ArtifactChunkKind;
    chunkType: ArtifactChunkType;
    data: unknown;
    at?: number;
  },
) {
  writeUiData(writer, "data-agent-artifact-chunk", {
    toolCallId: payload.toolCallId,
    artifactKey: payload.artifactKey,
    artifactRole: payload.artifactRole,
    artifactVariant: payload.artifactVariant,
    artifactKind: payload.artifactKind,
    chunkType: payload.chunkType,
    data: payload.data,
    at: payload.at ?? Date.now(),
  });
}

function writeAgentArtifactPersisted(
  writer: UiWriter,
  payload: {
    artifactKey: string;
    artifactRole?: ArtifactRole;
    artifactVariant?: ArtifactVariant;
    assistantMessageId?: string;
    conversationId?: string;
    at?: number;
  },
) {
  writeUiData(writer, "data-agent-artifact-persisted", {
    artifactKey: payload.artifactKey,
    artifactRole: payload.artifactRole,
    artifactVariant: payload.artifactVariant,
    assistantMessageId: payload.assistantMessageId,
    conversationId: payload.conversationId,
    at: payload.at ?? Date.now(),
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitDeltaIntoDisplayChunks(delta: string, options?: { maxChunkLength?: number }) {
  const normalized = delta;
  const maxChunkLength = Math.max(8, options?.maxChunkLength ?? 36);
  const chunks: string[] = [];
  let buffer = "";

  const flush = () => {
    if (!buffer) return;
    chunks.push(buffer);
    buffer = "";
  };

  for (const unit of Array.from(normalized)) {
    buffer += unit;
    const shouldFlush =
      buffer.length >= maxChunkLength ||
      /[\n。！？!?；;，,、：:）)\]】]/.test(unit);
    if (shouldFlush) {
      flush();
    }
  }

  flush();
  return chunks;
}

function writeAgentFinish(
  writer: UiWriter,
  payload: AgentFinishDataPart,
) {
  writeUiData(writer, "data-agent-finish", payload);
}

function createTextChunkWriter(writer: UiWriter) {
  const textId = `assistant-text-${randomUUID()}`;
  let opened = false;

  return {
    write(delta: string) {
      if (!delta) return;
      if (!opened) {
        writer.write({ type: "text-start", id: textId });
        opened = true;
      }
      writer.write({ type: "text-delta", id: textId, delta });
    },
    close() {
      if (!opened) return;
      writer.write({ type: "text-end", id: textId });
      opened = false;
    },
  };
}

function normalizeUiFinishReason(value: string | undefined): FinishReason | undefined {
  switch (value) {
    case "stop":
    case "length":
    case "error":
    case "content-filter":
    case "tool-calls":
    case "other":
      return value;
    default:
      return value ? "other" : undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEmbeddedArtifactKind(value: unknown): value is EmbeddedArtifactKind {
  return (
    value === "lesson-plan" ||
    value === "exam" ||
    value === "worksheet" ||
    value === "rubric" ||
    value === "exercises" ||
    value === "pbl" ||
    value === "research" ||
    value === "scan" ||
    value === "notes"
  );
}

function readToolArtifactDelta(value: unknown): ToolArtifactDelta | null {
  if (!isRecord(value) || !isRecord(value.artifactDelta)) return null;
  const artifactDelta = value.artifactDelta as Record<string, unknown>;
  if (!isEmbeddedArtifactKind(artifactDelta.kind) || typeof artifactDelta.delta !== "string") {
    return null;
  }
  return {
    kind: artifactDelta.kind,
    artifactKey: typeof artifactDelta.artifactKey === "string" ? artifactDelta.artifactKey : undefined,
    artifactRole: normalizeArtifactRole(artifactDelta.artifactRole),
    artifactVariant: normalizeArtifactVariant(artifactDelta.artifactVariant),
    contentMode: normalizeArtifactContentMode(artifactDelta.contentMode),
    delta: artifactDelta.delta,
    title: typeof artifactDelta.title === "string" ? artifactDelta.title : undefined,
    summary: typeof artifactDelta.summary === "string" ? artifactDelta.summary : undefined,
    previewText:
      typeof artifactDelta.previewText === "string"
        ? artifactDelta.previewText
        : undefined,
  };
}

function readToolArtifactPayload(value: unknown): ToolArtifactPayload | null {
  if (!isRecord(value) || !isRecord(value.artifact)) return null;
  const artifact = value.artifact as Record<string, unknown>;
  if (
    !isEmbeddedArtifactKind(artifact.kind) ||
    typeof artifact.title !== "string" ||
    typeof artifact.summary !== "string" ||
    typeof artifact.rawContent !== "string"
  ) {
    return null;
  }
  return {
    kind: artifact.kind,
    artifactKey: typeof artifact.artifactKey === "string" ? artifact.artifactKey.trim() : undefined,
    artifactRole: normalizeArtifactRole(artifact.artifactRole) ?? "primary",
    artifactVariant: normalizeArtifactVariant(artifact.artifactVariant) ?? "default",
    contentMode:
      normalizeArtifactContentMode(artifact.contentMode) ??
      resolveArtifactContentMode({
        document: artifact.document as DocumentModel | undefined,
        htmlContent: typeof artifact.htmlContent === "string" ? artifact.htmlContent : undefined,
        rawContent: artifact.rawContent,
      }),
    title: artifact.title,
    summary: artifact.summary,
    rawContent: artifact.rawContent,
    document: artifact.document as DocumentModel | undefined,
    htmlContent: typeof artifact.htmlContent === "string" ? artifact.htmlContent : undefined,
    layoutConfig:
      isRecord(artifact.layoutConfig) ? artifact.layoutConfig as EmbeddedArtifactPayload["layoutConfig"] : undefined,
    renderVersion:
      typeof artifact.renderVersion === "number" ? artifact.renderVersion : undefined,
    sourceStage:
      artifact.sourceStage === "streaming" ||
      artifact.sourceStage === "complete" ||
      artifact.sourceStage === "persisted" ||
      artifact.sourceStage === "legacy"
        ? artifact.sourceStage
        : undefined,
    integrityStatus:
      artifact.integrityStatus === "streaming" ||
      artifact.integrityStatus === "complete" ||
      artifact.integrityStatus === "repaired" ||
      artifact.integrityStatus === "invalid"
        ? artifact.integrityStatus
        : undefined,
    metadata: isRecord(artifact.metadata)
      ? artifact.metadata as EmbeddedArtifactPayload["metadata"]
      : undefined,
    previewText:
      typeof artifact.previewText === "string" ? artifact.previewText : undefined,
  };
}

function normalizeToolArtifactPayload(
  artifact: ToolArtifactPayload,
  fallbackArtifactKey: string,
): ToolArtifactPayload {
  return {
    ...artifact,
    artifactKey: artifact.artifactKey?.trim() || fallbackArtifactKey,
    artifactRole: artifact.artifactRole ?? "primary",
    artifactVariant: artifact.artifactVariant ?? "default",
    contentMode:
      artifact.contentMode ??
      resolveArtifactContentMode({
        document: artifact.document,
        htmlContent: artifact.htmlContent,
        rawContent: artifact.rawContent,
      }),
  };
}

function toPersistedArtifactPayload(
  artifact: ToolArtifactPayload,
): EmbeddedArtifactPayload {
  return {
    kind: artifact.kind,
    artifactKey: artifact.artifactKey,
    artifactRole: artifact.artifactRole ?? "primary",
    artifactVariant: artifact.artifactVariant ?? "default",
    contentMode:
      artifact.contentMode ??
      resolveArtifactContentMode({
        document: artifact.document,
        htmlContent: artifact.htmlContent,
        rawContent: artifact.rawContent,
      }),
    title: artifact.title,
    summary: artifact.summary,
    rawContent: artifact.rawContent,
    document: artifact.document,
    htmlContent: artifact.htmlContent,
    layoutConfig: artifact.layoutConfig,
    renderVersion: artifact.renderVersion,
    sourceStage: "persisted",
    integrityStatus: artifact.integrityStatus,
    metadata: artifact.metadata,
  };
}

export type AgentStreamWriter = {
  write: (event: AgentStreamEvent) => void;
  writeText: (text: string) => void;
  writeTextChunks: (text: string, chunkSize?: number) => void;
  writePhase: (payload: {
    phase: string;
    label: string;
    status: "running" | "done" | "error";
    detail?: string;
    progressCurrent?: number;
    progressTotal?: number;
    at?: number;
  }) => void;
  writeQuestion: (question: AgentQuestionBlock, at?: number) => void;
  writeArtifactChunk: (payload: {
    toolCallId: string;
    artifactKey?: string;
    artifactRole?: ArtifactRole;
    artifactVariant?: ArtifactVariant;
    artifactKind: ArtifactChunkKind;
    chunkType: ArtifactChunkType;
    data: unknown;
  }) => void;
  writeArtifactPersisted: (payload: {
    artifactKey: string;
    artifactRole?: ArtifactRole;
    artifactVariant?: ArtifactVariant;
    assistantMessageId?: string;
    conversationId?: string;
    at?: number;
  }) => void;
  writeRun: (payload: {
    runId: string;
    mode: AgentRunMode;
    status: "started" | "running" | "completed" | "error";
    startedAt?: number;
  }) => void;
  writeWorkingNote: (payload: {
    id: string;
    runId: string;
    section: AgentWorkingNoteSection;
    status: "running" | "done" | "error";
    title: string;
    markdown: string;
    importance?: AgentWorkingNoteImportance;
    transient?: boolean;
    at?: number;
  }) => void;
  writeProcessSummary: (payload: {
    runId: string;
    title: string;
    markdown: string;
    totalMs?: number;
    at?: number;
  }) => void;
};

function buildWorkingNoteTitle(mode: AgentRunMode) {
  switch (mode) {
    case "document_artifact":
      return "已识别为文档型任务";
    case "retrieval_then_document":
      return "已识别为先检索再生成文档";
    case "chat_answer":
      return "已识别为直接回答";
    case "retrieval_only":
      return "已识别为检索任务";
    default:
      return "Agent 已接收请求";
  }
}

function buildWorkingNoteMarkdown(mode: AgentRunMode) {
  switch (mode) {
    case "document_artifact":
      return "正在判断最合适的文档工具，并准备右侧 Canvas 的预览壳。";
    case "retrieval_then_document":
      return "正在先检索相关资料与网页内容，再进入文档生成工具，右侧 Canvas 会在文档工具启动后接管正文。";
    case "chat_answer":
      return "正在准备当前资料与会话上下文，随后会直接在左侧开始回答。";
    case "retrieval_only":
      return "正在整理检索范围与关键信息，随后返回查找结果。";
    default:
      return "正在准备本轮对话所需的上下文与执行路径。";
  }
}

function humanizeToolWorkingTitle(toolName: string) {
  switch (toolName) {
    case "generate_worksheet":
      return "正在生成 Worksheet";
    case "assemble_worksheet":
      return "正在组装 Worksheet";
    case "generate_rubric":
      return "正在生成 Rubric";
    case "generate_lesson_plan_workflow":
      return "正在生成教案";
    case "generate_ap_exercises_pipeline":
      return "正在生成试题";
    case "generate_answer_key":
      return "正在生成答案与解析";
    case "generate_exit_ticket":
      return "正在生成 Exit Ticket";
    case "adapt_difficulty":
      return "正在调整难度";
    case "generate_pbl_project":
      return "正在生成 PBL 项目";
    case "search_question_bank":
      return "正在检索题库";
    case "search_teacher_knowledge":
      return "正在检索教师知识库";
    case "read_webpage":
      return "正在读取网页";
    default:
      return `正在调用 ${toolName}`;
  }
}

export function writeArtifactTextSnapshot(params: {
  writer: AgentStreamWriter;
  toolCallId: string;
  artifactKey?: string;
  artifactRole?: ArtifactRole;
  artifactVariant?: ArtifactVariant;
  artifactKind: ArtifactChunkKind;
  rawContent: string;
  previewText?: string;
  title?: string;
  summary?: string;
}) {
  params.writer.writeArtifactChunk({
    toolCallId: params.toolCallId,
    artifactKey: params.artifactKey ?? params.toolCallId,
    artifactRole: params.artifactRole,
    artifactVariant: params.artifactVariant,
    artifactKind: params.artifactKind,
    chunkType: "text-snapshot",
    data: {
      rawContent: params.rawContent,
      previewText: params.previewText,
      title: params.title,
      summary: params.summary,
    },
  });
}

export function writeArtifactTextDeltaChunks(params: {
  writer: AgentStreamWriter;
  toolCallId: string;
  artifactKey?: string;
  artifactRole?: ArtifactRole;
  artifactVariant?: ArtifactVariant;
  artifactKind: ArtifactChunkKind;
  delta: string;
  previewText?: string;
  title?: string;
  summary?: string;
}) {
  if (!params.delta) return;
  for (const chunk of splitDeltaIntoDisplayChunks(params.delta)) {
    params.writer.writeArtifactChunk({
      toolCallId: params.toolCallId,
      artifactKey: params.artifactKey ?? params.toolCallId,
      artifactRole: params.artifactRole,
      artifactVariant: params.artifactVariant,
      artifactKind: params.artifactKind,
      chunkType: "text-delta",
      data: {
        delta: chunk,
        contentMode: "plain-text-fallback",
        previewText: params.previewText,
        title: params.title,
        summary: params.summary,
      },
    });
  }
}

export async function streamDocumentArtifactPreview(params: {
  writer: AgentStreamWriter;
  toolCallId: string;
  artifactKey?: string;
  artifactKind: ArtifactChunkKind;
  document: DocumentModel;
  title?: string;
  summary?: string;
  previewText?: string;
  rawContent?: string;
  chunkDelayMs?: number;
}) {
  const title = params.title?.trim() || params.document.title;
  const summary = params.summary?.trim() || "";
  const previewText = params.previewText?.trim() || "";

  params.writer.writeArtifactChunk({
    toolCallId: params.toolCallId,
    artifactKey: params.artifactKey ?? params.toolCallId,
    artifactKind: params.artifactKind,
    chunkType: "meta",
    data: {
      title,
      summary,
      previewText,
      contentMode: "structured-document",
      document: {
        id: params.document.id,
        type: params.document.type,
        title: params.document.title,
        meta: params.document.meta,
        layoutConfig: params.document.layoutConfig,
      },
    },
  });

  for (const block of params.document.blocks) {
    params.writer.writeArtifactChunk({
      toolCallId: params.toolCallId,
      artifactKey: params.artifactKey ?? params.toolCallId,
      artifactKind: params.artifactKind,
      chunkType: "item",
      data: {
        block,
      },
    });

    if ((params.chunkDelayMs ?? 0) > 0) {
      await sleep(params.chunkDelayMs ?? 0);
    }
  }

  params.writer.writeArtifactChunk({
    toolCallId: params.toolCallId,
    artifactKey: params.artifactKey ?? params.toolCallId,
    artifactKind: params.artifactKind,
    chunkType: "complete",
    data: {
      title,
      summary,
      previewText,
      contentMode: "structured-document",
      rawContent: params.rawContent,
      document: params.document,
    },
  });
}

export type AgentStreamVisibleEvent =
  | "working-note"
  | "text-delta"
  | "step-start"
  | "tool-call"
  | "tool-result"
  | "tool-error"
  | "phase"
  | "question-ready"
  | "error";

export type AgentStreamLifecycleHooks = {
  onFirstVisible?: (payload: {
    eventType: AgentStreamVisibleEvent;
    ttftMs: number;
  }) => Promise<void> | void;
  onFinish?: (payload: {
    assistantText: string;
    toolNames: string[];
    totalMs: number;
    ttftMs: number | null;
    firstVisibleEvent: AgentStreamVisibleEvent | null;
    finishReason?: string;
    usage?: Record<string, unknown>;
  }) => Promise<void> | void;
  onError?: (payload: {
    assistantText: string;
    toolNames: string[];
    totalMs: number;
    ttftMs: number | null;
    firstVisibleEvent: AgentStreamVisibleEvent | null;
    finishReason?: string;
    message: string;
  }) => Promise<void> | void;
};

function reportLifecycleHook<TPayload>(
  hook: ((payload: TPayload) => Promise<void> | void) | undefined,
  payload: TPayload,
  label: string,
) {
  if (!hook) return;
  void Promise.resolve(hook(payload)).catch((error) => {
    console.error(`[agent-stream] ${label} hook failed`, error);
  });
}

async function runLifecycleHook<TPayload>(
  hook: ((payload: TPayload) => Promise<void> | void) | undefined,
  payload: TPayload,
  label: string,
) {
  if (!hook) return;
  try {
    await hook(payload);
  } catch (error) {
    console.error(`[agent-stream] ${label} hook failed`, error);
  }
}

function buildUiResponse(
  stream: ReturnType<typeof createUIMessageStream>,
  headers?: HeadersInit,
) {
  return createUIMessageStreamResponse({
    stream,
    headers: {
      "Cache-Control": "no-cache, no-transform",
      ...(headers ?? {}),
    },
  });
}

export function createNdjsonStreamResponse(params: {
  result?: { fullStream: AsyncIterable<Record<string, unknown>> };
  getResult?: () => Promise<{ fullStream: AsyncIterable<Record<string, unknown>> }>;
  conversationId?: string;
  memoryPreview?: AgentMemoryPreview;
  initialDecision?: Omit<AgentDecisionDataPart, "at">;
  getHandoff?: () =>
    | Promise<Omit<AgentHandoffDataPart, "at"> | null>
    | Omit<AgentHandoffDataPart, "at">
    | null;
  runMode?: AgentRunMode;
  initialWorkingNote?: {
    title: string;
    markdown: string;
  };
  hooks?: AgentStreamLifecycleHooks;
  headers?: HeadersInit;
  onFinish?: (payload: {
    assistantText: string;
    toolNames: string[];
    totalMs: number;
    finishReason?: string;
    usage?: Record<string, unknown>;
  }) => Promise<{ assistantMessageId?: string } | void> | { assistantMessageId?: string } | void;
}) {
  const stream = createUIMessageStream({
    onError: (error) =>
      error instanceof Error ? error.message : "Agent 流式输出失败",
    execute: async ({ writer }) => {
      const startedAt = Date.now();
      const runId = `run-${randomUUID()}`;
      const runMode = params.runMode ?? "agent";
      const toolCallStartedAt = new Map<string, number>();
      const stepStartedAt = new Set<string>();
      const toolNames = new Set<string>();
      const textWriter = createTextChunkWriter(writer);
      let combinedText = "";
      let finishReason: string | undefined;
      let usage: Record<string, unknown> | undefined;
      let streamFailed = false;
      let firstVisibleAt: number | null = null;
      let firstVisibleEvent: AgentStreamVisibleEvent | null = null;
      let errorMessage = "";
      let finishWritten = false;
      let latestArtifactPayload: ToolArtifactPayload | null = null;
      const visibleArtifactPayloads = new Map<string, ToolArtifactPayload>();
      let generationNoteStarted = false;
      const preparationNoteId = `${runId}:preparation`;
      const generationNoteId = `${runId}:generation`;

      const markFirstVisible = (eventType: AgentStreamVisibleEvent) => {
        if (firstVisibleAt !== null) return;
        firstVisibleAt = Date.now();
        firstVisibleEvent = eventType;
        reportLifecycleHook(
          params.hooks?.onFirstVisible,
          {
            eventType,
            ttftMs: Math.max(0, firstVisibleAt - startedAt),
          },
          "onFirstVisible",
        );
      };

      const flushFinish = (payload?: {
        finishReason?: string;
        usage?: Record<string, unknown>;
      }) => {
        if (finishWritten) return;
        finishWritten = true;
        textWriter.close();
        const totalMs = Math.max(0, Date.now() - startedAt);
        writeAgentFinish(writer, {
          totalMs,
          finishReason: payload?.finishReason,
          usage: payload?.usage,
        });
        writer.write({
          type: "finish",
          finishReason: normalizeUiFinishReason(
            payload?.finishReason ?? (streamFailed ? "error" : "stop"),
          ),
        });
      };

      writer.write({ type: "start" });
      writeAgentMeta({
        writer,
        startedAt,
        conversationId: params.conversationId,
        memoryPreview: params.memoryPreview,
      });
      writeAgentRun(writer, {
        runId,
        mode: runMode,
        status: "started",
        startedAt,
      });
      if (params.initialDecision) {
        markFirstVisible("working-note");
        writeAgentDecision(writer, {
          ...params.initialDecision,
          at: startedAt,
        });
      }
      markFirstVisible("working-note");
      writeAgentWorkingNote(writer, {
        id: `${runId}:understanding`,
        runId,
        section: "understanding",
        status: "running",
        title: params.initialWorkingNote?.title ?? buildWorkingNoteTitle(runMode),
        markdown:
          params.initialWorkingNote?.markdown ?? buildWorkingNoteMarkdown(runMode),
        importance: "high",
        at: startedAt,
      });
      writeAgentWorkingNote(writer, {
        id: preparationNoteId,
        runId,
        section: "planning",
        status: "running",
        title: "正在准备资料与会话上下文",
        markdown: "会先整理当前引用资料、最近对话和可用工具，再开始真正生成。",
        importance: "normal",
        at: startedAt,
      });

      try {
        const handoffPromise = params.getHandoff
          ? Promise.resolve(params.getHandoff()).catch((error) => {
              console.error("[agent-stream] getHandoff failed", error);
              return null;
            })
          : Promise.resolve(null);
        const resultPromise = params.result
          ? Promise.resolve(params.result)
          : params.getResult
            ? params.getResult()
            : Promise.resolve(null);
        const [handoff, result] = await Promise.all([handoffPromise, resultPromise]);
        if (!result) {
          throw new Error("Agent 流式结果未就绪");
        }
        writeAgentRun(writer, {
          runId,
          mode: runMode,
          status: "running",
          startedAt,
        });
        if (handoff) {
          writeAgentHandoff(writer, {
            ...handoff,
            at: Date.now(),
          });
        }
        writeAgentWorkingNote(writer, {
          id: preparationNoteId,
          runId,
          section: "planning",
          status: "done",
          title: "已完成首轮上下文装配",
          markdown: "资料与当前会话上下文已就绪，开始进入模型响应或工具执行阶段。",
          importance: "normal",
        });

        for await (const part of result.fullStream) {
          const type = typeof part.type === "string" ? part.type : "";
          switch (type) {
            case "text-delta": {
              const textDelta =
                (typeof part.textDelta === "string" ? part.textDelta : null) ??
                (typeof part.text === "string" ? part.text : "");
              if (!textDelta) break;
              combinedText += textDelta;
              if (!generationNoteStarted) {
                generationNoteStarted = true;
                writeAgentWorkingNote(writer, {
                  id: generationNoteId,
                  runId,
                  section: "generation",
                  status: "running",
                  title: "正在生成正文",
                  markdown:
                    runMode === "document_artifact"
                      ? "右侧 Canvas 会随着正文逐步补全，左侧仅保留简短说明。"
                      : "左侧回答已经开始输出，会持续补全本轮正文。",
                  importance: "high",
                });
              }
              markFirstVisible("text-delta");
              textWriter.write(textDelta);
              break;
            }
            case "start-step": {
              const stepId =
                (typeof part.stepId === "string" ? part.stepId : null) ??
                (typeof part.step === "number" ? `step-${part.step}` : `step-${Date.now()}`);
              if (stepStartedAt.has(stepId)) break;
              stepStartedAt.add(stepId);
              markFirstVisible("step-start");
              writeAgentStep(writer, {
                kind: "start",
                stepId,
                label: typeof part.step === "number" ? `Step ${part.step}` : "Step",
                at: Date.now(),
              });
              break;
            }
            case "finish-step": {
              const stepId =
                (typeof part.stepId === "string" ? part.stepId : null) ??
                (typeof part.step === "number" ? `step-${part.step}` : `step-${Date.now()}`);
              writeAgentStep(writer, {
                kind: "finish",
                stepId,
                label: typeof part.step === "number" ? `Step ${part.step}` : "Step",
                at: Date.now(),
                finishReason: typeof part.finishReason === "string" ? part.finishReason : undefined,
              });
              break;
            }
            case "tool-call": {
              const toolCallId =
                (typeof part.toolCallId === "string" ? part.toolCallId : null) ??
                `${String(part.toolName ?? "tool")}-${Date.now()}`;
              const toolName = String(part.toolName ?? "unknown_tool");
              toolCallStartedAt.set(toolCallId, Date.now());
              toolNames.add(toolName);
              markFirstVisible("tool-call");
              writer.write({
                type: "tool-input-available",
                toolCallId,
                toolName,
                input: toSerializable(part.input),
              });
              writeAgentWorkingNote(writer, {
                id: `${runId}:tool:${toolCallId}`,
                runId,
                section: "tooling",
                status: "running",
                title: humanizeToolWorkingTitle(toolName),
                markdown: `已选择工具 **${toolName}**，正在准备本轮执行所需输入。`,
                importance: "high",
                at: Date.now(),
              });
              const placeholder = resolveDocumentToolPlaceholder(toolName);
              if (placeholder) {
                writeAgentArtifactChunk(writer, {
                  toolCallId,
                  artifactKey: toolCallId,
                  artifactKind: placeholder.artifactKind,
                  chunkType: "meta",
                  data: {
                    title: placeholder.title,
                    summary: placeholder.summary,
                    previewText: placeholder.previewText,
                    contentMode: "plain-text-fallback",
                  },
                  at: Date.now(),
                });
              }
              break;
            }
            case "tool-result": {
              const toolCallId =
                (typeof part.toolCallId === "string" ? part.toolCallId : null) ??
                `${String(part.toolName ?? "tool")}-${Date.now()}`;
              toolNames.add(String(part.toolName ?? "unknown_tool"));
              markFirstVisible("tool-result");
              const toolOutput = (part.output ?? part.result) as unknown;
              const artifactDelta = readToolArtifactDelta(toolOutput);
              if (artifactDelta) {
                writeAgentArtifactChunk(writer, {
                  toolCallId,
                  artifactKey: artifactDelta.artifactKey?.trim() || toolCallId,
                  artifactRole: artifactDelta.artifactRole,
                  artifactVariant: artifactDelta.artifactVariant,
                  artifactKind: artifactDelta.kind,
                  chunkType: "text-delta",
                  data: {
                    delta: artifactDelta.delta,
                    contentMode: artifactDelta.contentMode ?? "plain-text-fallback",
                    title: artifactDelta.title,
                    summary: artifactDelta.summary,
                    previewText: artifactDelta.previewText,
                  },
                  at: Date.now(),
                });
              }
              const rawArtifactPayload = readToolArtifactPayload(toolOutput);
              if (rawArtifactPayload) {
                const artifactPayload = normalizeToolArtifactPayload(
                  rawArtifactPayload,
                  toolCallId,
                );
                latestArtifactPayload = artifactPayload;
                visibleArtifactPayloads.set(artifactPayload.artifactKey ?? toolCallId, artifactPayload);
                writeAgentArtifactChunk(writer, {
                  toolCallId,
                  artifactKey: artifactPayload.artifactKey,
                  artifactRole: artifactPayload.artifactRole,
                  artifactVariant: artifactPayload.artifactVariant,
                  artifactKind: artifactPayload.kind,
                  chunkType: "complete",
                  data: {
                    title: artifactPayload.title,
                    summary: artifactPayload.summary,
                    previewText:
                      artifactPayload.previewText ??
                      `${artifactPayload.title} 已生成，正在同步到右侧 Canvas。`,
                    rawContent: artifactPayload.rawContent,
                    document: artifactPayload.document,
                    htmlContent: artifactPayload.htmlContent,
                    layoutConfig: artifactPayload.layoutConfig,
                    renderVersion: artifactPayload.renderVersion,
                    sourceStage: artifactPayload.sourceStage ?? "complete",
                    integrityStatus: artifactPayload.integrityStatus,
                    contentMode: artifactPayload.contentMode,
                  },
                  at: Date.now(),
                });
                writeAgentWorkingNote(writer, {
                  id: `${runId}:tool:${toolCallId}`,
                  runId,
                  section: "handoff",
                  status: "done",
                  title: `${humanizeToolWorkingTitle(String(part.toolName ?? "tool")).replace("正在", "")}并已交给 Canvas`,
                  markdown: `已生成 **${artifactPayload.title}**，右侧 Canvas 将继续展示正式正文。`,
                  importance: "high",
                  at: Date.now(),
                });
              } else {
                writeAgentWorkingNote(writer, {
                  id: `${runId}:tool:${toolCallId}`,
                  runId,
                  section: "validation",
                  status: "done",
                  title: `${humanizeToolWorkingTitle(String(part.toolName ?? "tool")).replace("正在", "")}已完成`,
                  markdown: "工具结果已经返回，正在整理本轮输出。",
                  importance: "normal",
                  at: Date.now(),
                });
              }
              const toolName = String(part.toolName ?? "unknown_tool");
              writer.write({
                type: "tool-output-available",
                toolCallId,
                output: toSerializable(toolOutput, 1500),
              });
              break;
            }
            case "tool-error": {
              const toolCallId =
                (typeof part.toolCallId === "string" ? part.toolCallId : null) ??
                `${String(part.toolName ?? "tool")}-${Date.now()}`;
              const toolName = String(part.toolName ?? "unknown_tool");
              toolNames.add(toolName);
              markFirstVisible("tool-error");
              writer.write({
                type: "tool-input-error",
                toolCallId,
                toolName,
                input: null,
                errorText: String(part.error ?? "工具调用失败"),
              });
              writeAgentWorkingNote(writer, {
                id: `${runId}:tool:${toolCallId}`,
                runId,
                section: "tooling",
                status: "error",
                title: `${humanizeToolWorkingTitle(toolName)}失败`,
                markdown: String(part.error ?? "工具调用失败"),
                importance: "high",
                at: Date.now(),
              });
              break;
            }
            case "error": {
              streamFailed = true;
              errorMessage = String(part.error ?? "模型流式调用失败");
              writeAgentWorkingNote(writer, {
                id: preparationNoteId,
                runId,
                section: "planning",
                status: "error",
                title: "本轮处理失败",
                markdown: errorMessage,
                importance: "high",
                at: Date.now(),
              });
              markFirstVisible("error");
              writer.write({
                type: "error",
                errorText: errorMessage,
              });
              break;
            }
            case "finish": {
              finishReason =
                typeof part.finishReason === "string" ? part.finishReason : undefined;
              usage =
                part.totalUsage && typeof part.totalUsage === "object"
                  ? (part.totalUsage as Record<string, unknown>)
                  : undefined;
              break;
            }
            default:
              break;
          }
        }
      } catch (error) {
        streamFailed = true;
        errorMessage = error instanceof Error ? error.message : "Agent 流式输出失败";
        markFirstVisible("error");
        writer.write({
          type: "error",
          errorText: errorMessage,
        });
      } finally {
        const totalMs = Math.max(0, Date.now() - startedAt);
        const visibleAssistantText =
          combinedText.trim() ||
          latestArtifactPayload?.previewText ||
          latestArtifactPayload?.summary ||
          latestArtifactPayload?.title ||
          "";
        const persistedArtifacts = Array.from(visibleArtifactPayloads.values()).map(
          toPersistedArtifactPayload,
        );
        const persistedAssistantText = persistedArtifacts.length > 0
          ? embedArtifactPayloads(
              visibleAssistantText,
              persistedArtifacts,
            )
          : visibleAssistantText;
        let persistedAssistantMessageId: string | undefined;

        if (!streamFailed && params.onFinish && (visibleAssistantText || toolNames.size > 0)) {
          try {
            const persisted = await params.onFinish({
              assistantText: persistedAssistantText,
              toolNames: Array.from(toolNames),
              totalMs,
              finishReason,
              usage,
            });
            persistedAssistantMessageId = persisted?.assistantMessageId;
          } catch (error) {
            console.error("Agent 会话持久化失败", error);
          }
        }

        if (persistedAssistantMessageId) {
          for (const artifactPayload of visibleArtifactPayloads.values()) {
            const persistedArtifactKey = artifactPayload.artifactKey?.trim();
            if (!persistedArtifactKey) {
              continue;
            }
            writeAgentArtifactPersisted(writer, {
              artifactKey: persistedArtifactKey,
              artifactRole: artifactPayload.artifactRole,
              artifactVariant: artifactPayload.artifactVariant,
              assistantMessageId: persistedAssistantMessageId,
              conversationId: params.conversationId,
              at: Date.now(),
            });
          }
        }

        if (generationNoteStarted) {
          writeAgentWorkingNote(writer, {
            id: generationNoteId,
            runId,
            section: "generation",
            status: streamFailed ? "error" : "done",
            title: streamFailed ? "正文生成失败" : "正文生成完成",
            markdown: streamFailed
              ? errorMessage || "本轮正文生成未完成。"
              : latestArtifactPayload
                ? "正文已生成并稳定交接到右侧 Canvas。"
                : "本轮正文已生成完成。",
            importance: "high",
          });
        }
        writeAgentRun(writer, {
          runId,
          mode: runMode,
          status: streamFailed ? "error" : "completed",
          startedAt,
        });
        writeAgentProcessSummary(writer, {
          runId,
          title: streamFailed ? "本轮处理未完成" : "本轮工作摘要",
          markdown: streamFailed
            ? `本轮在处理过程中出错：${errorMessage || "未知错误"}`
            : [
                toolNames.size > 0
                  ? `- 共调用 ${toolNames.size} 个工具：${Array.from(toolNames).join("、")}`
                  : "- 本轮未调用工具，直接完成回答",
                latestArtifactPayload
                  ? `- 已生成文档：**${latestArtifactPayload.title}**`
                  : combinedText.trim()
                    ? "- 已生成本轮回答正文"
                    : "- 本轮未返回可见正文",
              ].join("\n"),
          totalMs,
        });
        flushFinish({
          finishReason: streamFailed ? "error" : finishReason,
          usage,
        });

        if (streamFailed) {
          await runLifecycleHook(
            params.hooks?.onError,
            {
              assistantText: combinedText.trim(),
              toolNames: Array.from(toolNames),
              totalMs,
              ttftMs:
                firstVisibleAt === null ? null : Math.max(0, firstVisibleAt - startedAt),
              firstVisibleEvent,
              finishReason: "error",
              message: errorMessage || "Agent 流式输出失败",
            },
            "onError",
          );
        } else {
          await runLifecycleHook(
            params.hooks?.onFinish,
            {
              assistantText: combinedText.trim(),
              toolNames: Array.from(toolNames),
              totalMs: Math.max(0, Date.now() - startedAt),
              ttftMs:
                firstVisibleAt === null ? null : Math.max(0, firstVisibleAt - startedAt),
              firstVisibleEvent,
              finishReason,
              usage,
            },
            "onFinish",
          );
        }
      }
    },
  });

  return buildUiResponse(stream, params.headers);
}

export function createCustomAgentStreamResponse(params: {
  startedAt: number;
  conversationId?: string;
  memoryPreview?: AgentMemoryPreview;
  runMode?: AgentRunMode;
  initialWorkingNote?: {
    title: string;
    markdown: string;
  };
  hooks?: AgentStreamLifecycleHooks;
  execute: (writer: AgentStreamWriter) => Promise<{
    totalMs?: number;
    finishReason?: string;
  } | void>;
}) {
  const stream = createUIMessageStream({
    onError: (error) => (error instanceof Error ? error.message : "Agent 执行失败"),
    execute: async ({ writer }) => {
      const startedAt = params.startedAt;
      const runId = `run-${randomUUID()}`;
      const runMode = params.runMode ?? "agent";
      const toolNames = new Set<string>();
      const textWriter = createTextChunkWriter(writer);
      const toolCallStartedAt = new Map<string, number>();
      let combinedText = "";
      let errorMessage = "";
      let firstVisibleAt: number | null = null;
      let firstVisibleEvent: AgentStreamVisibleEvent | null = null;
      let finishWritten = false;
      let generationNoteStarted = false;

      const markFirstVisible = (eventType: AgentStreamVisibleEvent) => {
        if (firstVisibleAt !== null) return;
        firstVisibleAt = Date.now();
        firstVisibleEvent = eventType;
        reportLifecycleHook(
          params.hooks?.onFirstVisible,
          {
            eventType,
            ttftMs: Math.max(0, firstVisibleAt - startedAt),
          },
          "onFirstVisible",
        );
      };

      const flushFinish = (payload: {
        totalMs: number;
        finishReason?: string;
        usage?: Record<string, unknown>;
      }) => {
        if (finishWritten) return;
        finishWritten = true;
        textWriter.close();
        writeAgentFinish(writer, payload);
        writer.write({
          type: "finish",
          finishReason: normalizeUiFinishReason(payload.finishReason ?? "stop"),
        });
      };

      const agentWriter: AgentStreamWriter = {
        write(event) {
          switch (event.type) {
            case "run":
              writeAgentRun(writer, {
                runId: event.runId,
                mode: event.mode,
                status: event.status,
                startedAt: event.startedAt,
              });
              break;
            case "working-note":
              markFirstVisible("working-note");
              writeAgentWorkingNote(writer, event);
              break;
            case "process-summary":
              writeAgentProcessSummary(writer, event);
              break;
            case "text-delta":
              combinedText += event.text;
              if (!generationNoteStarted) {
                generationNoteStarted = true;
                writeAgentWorkingNote(writer, {
                  id: `${runId}:generation`,
                  runId,
                  section: "generation",
                  status: "running",
                  title: "正在生成正文",
                  markdown:
                    runMode === "document_artifact"
                      ? "右侧 Canvas 会随着正文持续补全。"
                      : "左侧回答已经开始输出。",
                  importance: "high",
                });
              }
              markFirstVisible("text-delta");
              textWriter.write(event.text);
              break;
            case "phase":
              markFirstVisible("phase");
              writeAgentPhase(writer, event);
              break;
            case "question-ready":
              markFirstVisible("question-ready");
              writeAgentQuestion(writer, event.question, event.at);
              break;
            case "step-start":
              markFirstVisible("step-start");
              writeAgentStep(writer, {
                kind: "start",
                stepId: event.stepId,
                label: event.label,
                at: event.at,
              });
              break;
            case "step-finish":
              writeAgentStep(writer, {
                kind: "finish",
                stepId: event.stepId,
                label: event.label,
                at: event.at,
                finishReason: event.finishReason,
              });
              break;
            case "tool-call":
              toolNames.add(event.toolName);
              toolCallStartedAt.set(event.toolCallId, event.at);
              markFirstVisible("tool-call");
              writer.write({
                type: "tool-input-available",
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                input: toSerializable(event.input),
              });
              break;
            case "tool-result": {
              if (event.toolName) toolNames.add(event.toolName);
              markFirstVisible("tool-result");
              writer.write({
                type: "tool-output-available",
                toolCallId: event.toolCallId,
                output: toSerializable(event.output, 1500),
              });
              break;
            }
            case "tool-error":
              if (event.toolName) toolNames.add(event.toolName);
              markFirstVisible("tool-error");
              writer.write({
                type: "tool-input-error",
                toolCallId: event.toolCallId ?? `tool-error-${Date.now()}`,
                toolName: event.toolName ?? "unknown_tool",
                input: null,
                errorText: event.message,
              });
              break;
            case "artifact-persisted":
              writeAgentArtifactPersisted(writer, event);
              break;
            case "error":
              errorMessage = event.message;
              markFirstVisible("error");
              writer.write({ type: "error", errorText: event.message });
              break;
            case "meta":
            case "finish":
              break;
            default:
              break;
          }
        },
        writeText(text) {
          if (!text) return;
          combinedText += text;
          markFirstVisible("text-delta");
          textWriter.write(text);
        },
        writeTextChunks(text, chunkSize = 180) {
          if (!text) return;
          const chunks = text.match(new RegExp(`[\\s\\S]{1,${chunkSize}}`, "g")) ?? [];
          for (const chunk of chunks) {
            combinedText += chunk;
            markFirstVisible("text-delta");
            textWriter.write(chunk);
          }
        },
        writePhase(payload) {
          markFirstVisible("phase");
          writeAgentPhase(writer, {
            phase: payload.phase,
            label: payload.label,
            status: payload.status,
            detail: payload.detail,
            progressCurrent: payload.progressCurrent,
            progressTotal: payload.progressTotal,
            at: payload.at ?? Date.now(),
          });
        },
        writeQuestion(question, at = Date.now()) {
          markFirstVisible("question-ready");
          writeAgentQuestion(writer, question, at);
        },
        writeArtifactChunk(payload) {
          writeAgentArtifactChunk(writer, payload);
        },
        writeArtifactPersisted(payload) {
          writeAgentArtifactPersisted(writer, payload);
        },
        writeRun(payload) {
          writeAgentRun(writer, {
            runId: payload.runId,
            mode: payload.mode,
            status: payload.status,
            startedAt: payload.startedAt ?? Date.now(),
          });
        },
        writeWorkingNote(payload) {
          writeAgentWorkingNote(writer, payload);
        },
        writeProcessSummary(payload) {
          writeAgentProcessSummary(writer, payload);
        },
      };

      writer.write({ type: "start" });
      writeAgentMeta({
        writer,
        startedAt,
        conversationId: params.conversationId,
        memoryPreview: params.memoryPreview,
      });
      writeAgentRun(writer, {
        runId,
        mode: runMode,
        status: "started",
        startedAt,
      });
      markFirstVisible("working-note");
      writeAgentWorkingNote(writer, {
        id: `${runId}:understanding`,
        runId,
        section: "understanding",
        status: "running",
        title: params.initialWorkingNote?.title ?? buildWorkingNoteTitle(runMode),
        markdown:
          params.initialWorkingNote?.markdown ?? buildWorkingNoteMarkdown(runMode),
        importance: "high",
        at: startedAt,
      });

      try {
        const result = await params.execute(agentWriter);
        const totalMs = result?.totalMs ?? Math.max(0, Date.now() - startedAt);
        if (generationNoteStarted) {
          writeAgentWorkingNote(writer, {
            id: `${runId}:generation`,
            runId,
            section: "generation",
            status: "done",
            title: "正文生成完成",
            markdown:
              runMode === "document_artifact"
                ? "文档正文已完成，右侧 Canvas 将保留正式预览。"
                : "本轮左侧回答已生成完成。",
            importance: "high",
          });
        }
        writeAgentRun(writer, {
          runId,
          mode: runMode,
          status: "completed",
          startedAt,
        });
        writeAgentProcessSummary(writer, {
          runId,
          title: "本轮工作摘要",
          markdown:
            toolNames.size > 0
              ? `- 共调用 ${toolNames.size} 个工具：${Array.from(toolNames).join("、")}`
              : "- 本轮未调用工具，直接完成处理",
          totalMs,
        });
        flushFinish({
          totalMs,
          finishReason: result?.finishReason ?? "stop",
        });
        await runLifecycleHook(
          params.hooks?.onFinish,
          {
            assistantText: combinedText.trim(),
            toolNames: Array.from(toolNames),
            totalMs,
            ttftMs:
              firstVisibleAt === null ? null : Math.max(0, firstVisibleAt - startedAt),
            firstVisibleEvent,
            finishReason: result?.finishReason ?? "stop",
          },
          "onFinish",
        );
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : "Agent 执行失败";
        writeAgentRun(writer, {
          runId,
          mode: runMode,
          status: "error",
          startedAt,
        });
        writeAgentWorkingNote(writer, {
          id: `${runId}:understanding`,
          runId,
          section: "understanding",
          status: "error",
          title: "本轮处理失败",
          markdown: errorMessage,
          importance: "high",
        });
        markFirstVisible("error");
        writer.write({ type: "error", errorText: errorMessage });
        const totalMs = Math.max(0, Date.now() - startedAt);
        writeAgentProcessSummary(writer, {
          runId,
          title: "本轮工作摘要",
          markdown: `本轮执行失败：${errorMessage}`,
          totalMs,
        });
        flushFinish({
          totalMs,
          finishReason: "error",
        });
        await runLifecycleHook(
          params.hooks?.onError,
          {
            assistantText: combinedText.trim(),
            toolNames: Array.from(toolNames),
            totalMs,
            ttftMs:
              firstVisibleAt === null ? null : Math.max(0, firstVisibleAt - startedAt),
            firstVisibleEvent,
            finishReason: "error",
            message: errorMessage,
          },
          "onError",
        );
      }
    },
  });

  return buildUiResponse(stream);
}

export function createDirectLessonPlanResponse(payload: {
  markdown: string;
  startedAt: number;
  totalMs: number;
  conversationId?: string;
  memoryPreview?: AgentMemoryPreview;
  timings?: Record<string, number>;
  warnings?: string[];
  sources?: Array<{ title: string; url: string }>;
  qualityAudit?: LessonPlanAudit | null;
  revisionRounds?: number;
}) {
  return createCustomAgentStreamResponse({
    startedAt: payload.startedAt,
    conversationId: payload.conversationId,
    memoryPreview: payload.memoryPreview,
    execute: async (writer) => {
      const toolCallId = "direct-lesson-plan";
      const stepId = "step-direct-lesson-plan";

      writer.write({
        type: "step-start",
        stepId,
        label: "Step 1",
        at: payload.startedAt,
      });
      writer.write({
        type: "tool-call",
        toolCallId,
        toolName: "generate_lesson_plan_workflow",
        input: { mode: "direct" },
        at: payload.startedAt + 1,
      });
      writer.write({
        type: "tool-result",
        toolCallId,
        toolName: "generate_lesson_plan_workflow",
        output: {
          timings: payload.timings ?? {},
          sources: payload.sources ?? [],
          warnings: payload.warnings ?? [],
          qualityAudit: payload.qualityAudit ?? null,
          revisionRounds: payload.revisionRounds ?? 0,
        },
        at: payload.startedAt + Math.max(2, payload.totalMs - 5),
        durationMs: payload.totalMs,
      });
      writer.write({
        type: "step-finish",
        stepId,
        label: "Step 1",
        at: payload.startedAt + Math.max(2, payload.totalMs - 4),
        finishReason: "completed",
      });

      const sourceLines =
        payload.sources && payload.sources.length > 0
          ? `\n\n参考来源：\n${payload.sources.map((item) => `- ${item.title} ${item.url}`).join("\n")}`
          : "";
      const warningLines =
        payload.warnings && payload.warnings.length > 0
          ? `\n\n材料处理提醒：\n${payload.warnings.map((item) => `- ${item}`).join("\n")}`
          : "";
      writer.writeTextChunks(`${payload.markdown}${sourceLines}${warningLines}`);

      return {
        totalMs: payload.totalMs,
        finishReason: "stop",
      };
    },
  });
}

export function createDirectToolResponse(payload: {
  text: string;
  startedAt: number;
  totalMs: number;
  conversationId?: string;
  memoryPreview?: AgentMemoryPreview;
  toolName: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  stepLabel?: string;
  finishReason?: string;
  hooks?: AgentStreamLifecycleHooks;
}) {
  return createCustomAgentStreamResponse({
    startedAt: payload.startedAt,
    conversationId: payload.conversationId,
    memoryPreview: payload.memoryPreview,
    hooks: payload.hooks,
    execute: async (writer) => {
      const safeToolName = payload.toolName.trim() || "direct-tool";
      const toolCallId = `direct-${safeToolName}`;
      const stepId = `step-${safeToolName}`;

      writer.write({
        type: "step-start",
        stepId,
        label: payload.stepLabel ?? "Step 1",
        at: payload.startedAt,
      });
      writer.write({
        type: "tool-call",
        toolCallId,
        toolName: safeToolName,
        input: payload.toolInput ?? { mode: "direct" },
        at: payload.startedAt + 1,
      });
      writer.write({
        type: "tool-result",
        toolCallId,
        toolName: safeToolName,
        output: payload.toolOutput ?? null,
        at: payload.startedAt + Math.max(2, payload.totalMs - 5),
        durationMs: payload.totalMs,
      });
      writer.write({
        type: "step-finish",
        stepId,
        label: payload.stepLabel ?? "Step 1",
        at: payload.startedAt + Math.max(2, payload.totalMs - 4),
        finishReason: payload.finishReason ?? "completed",
      });
      writer.writeTextChunks(payload.text);

      return {
        totalMs: payload.totalMs,
        finishReason: payload.finishReason ?? "stop",
      };
    },
  });
}
