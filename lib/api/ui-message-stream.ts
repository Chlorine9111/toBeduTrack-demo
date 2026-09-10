import type { AgentMemoryPreview } from "@/lib/agent/context-memory";
import type { AgentQuestionBlock, AgentStreamEvent, ArtifactChunkKind, ArtifactChunkType } from "@/lib/agent/chat-stream-types";
import type { EduUIMessageChunk } from "@/lib/ai/ui-message";
import {
  normalizeArtifactRole,
  normalizeArtifactVariant,
} from "@/lib/agent/artifact-payload";
import { parseNDJSON, parseSSEJson } from "@/lib/api/ndjson";

export function isUiMessageStreamResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  const uiStreamVersion = response.headers.get("x-vercel-ai-ui-message-stream") ?? "";
  return contentType.includes("text/event-stream") || uiStreamVersion.trim() === "v1";
}

export function isStructuredAgentStreamResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  return (
    isUiMessageStreamResponse(response) ||
    contentType.includes("application/x-ndjson")
  );
}

type AgentStreamState = {
  toolNames: Map<string, string>;
  toolStartedAt: Map<string, number>;
  stepOrder: string[];
  unnamedStepCount: number;
};

type LegacyToolResultChunk = {
  type: "tool-result";
  toolCallId?: string;
  toolName?: string;
  output?: unknown;
  result?: unknown;
};

function createAgentStreamState(): AgentStreamState {
  return {
    toolNames: new Map<string, string>(),
    toolStartedAt: new Map<string, number>(),
    stepOrder: [],
    unnamedStepCount: 0,
  };
}

function readChunkData(chunk: { data: unknown }) {
  return chunk.data && typeof chunk.data === "object" && !Array.isArray(chunk.data)
    ? (chunk.data as Record<string, unknown>)
    : {};
}

function normalizeToolOutput(output: unknown) {
  if (typeof output !== "string") {
    return output;
  }

  try {
    return JSON.parse(output);
  } catch {
    return output;
  }
}

function toAgentEventsFromChunk(
  chunk: EduUIMessageChunk,
  state: AgentStreamState,
): AgentStreamEvent[] {
  const at = Date.now();
  const rawType = (chunk as { type?: string }).type;

  if (rawType === "tool-result") {
    const legacyChunk = chunk as unknown as LegacyToolResultChunk;
    const toolCallId =
      typeof legacyChunk.toolCallId === "string"
        ? legacyChunk.toolCallId
        : "unknown_tool_call";
    const toolName =
      (typeof legacyChunk.toolName === "string"
        ? legacyChunk.toolName
        : state.toolNames.get(toolCallId)) ?? "unknown_tool";
    const startedAt = state.toolStartedAt.get(toolCallId);
    const output = normalizeToolOutput(
      legacyChunk.output !== undefined ? legacyChunk.output : legacyChunk.result,
    );

    return [
      {
        type: "tool-result",
        toolCallId,
        toolName,
        output,
        at,
        durationMs: startedAt ? Math.max(0, at - startedAt) : undefined,
      },
    ];
  }

  switch (chunk.type) {
    case "data-agent-meta": {
      const data = readChunkData(chunk);
      return [
        {
          type: "meta",
          startedAt: typeof data.startedAt === "number" ? data.startedAt : at,
          conversationId:
            typeof data.conversationId === "string" ? data.conversationId : undefined,
          memoryPreview:
            data.memoryPreview && typeof data.memoryPreview === "object"
              ? (data.memoryPreview as AgentMemoryPreview)
              : undefined,
        },
      ];
    }
    case "data-agent-run": {
      const data = readChunkData(chunk);
      return [
        {
          type: "run",
          runId: typeof data.runId === "string" ? data.runId : `run-${at}`,
          mode:
            data.mode === "chat_answer" ||
            data.mode === "document_artifact" ||
            data.mode === "retrieval_only" ||
            data.mode === "retrieval_then_document"
              ? data.mode
              : "agent",
          status:
            data.status === "running" ||
            data.status === "completed" ||
            data.status === "error"
              ? data.status
              : "started",
          startedAt: typeof data.startedAt === "number" ? data.startedAt : at,
        },
      ];
    }
    case "data-agent-handoff": {
      const data = readChunkData(chunk);
      return [
        {
          type: "handoff",
          kind:
            data.kind === "triage_to_runtime" ? data.kind : "triage_to_runtime",
          promptWorkflow:
            typeof data.promptWorkflow === "string"
              ? data.promptWorkflow
              : "general_chat",
          runtimeWorkflow:
            typeof data.runtimeWorkflow === "string"
              ? data.runtimeWorkflow
              : "general_chat",
          promptMode:
            data.promptMode === "chat_answer" ||
            data.promptMode === "document_artifact" ||
            data.promptMode === "retrieval_only" ||
            data.promptMode === "retrieval_then_document"
              ? data.promptMode
              : "agent",
          runtimeMode:
            data.runtimeMode === "chat_answer" ||
            data.runtimeMode === "document_artifact" ||
            data.runtimeMode === "retrieval_only" ||
            data.runtimeMode === "retrieval_then_document"
              ? data.runtimeMode
              : "agent",
          promptSource:
            typeof data.promptSource === "string" ? data.promptSource : "rules",
          runtimeSource:
            typeof data.runtimeSource === "string" ? data.runtimeSource : "rules",
          promptConfidence:
            typeof data.promptConfidence === "string"
              ? data.promptConfidence
              : "medium",
          runtimeConfidence:
            typeof data.runtimeConfidence === "string"
              ? data.runtimeConfidence
              : "medium",
          changed: data.changed === true,
          reasonCodes: Array.isArray(data.reasonCodes)
            ? data.reasonCodes.filter(
                (item): item is string => typeof item === "string",
              )
            : [],
          at: typeof data.at === "number" ? data.at : at,
        },
      ];
    }
    case "data-agent-decision": {
      const data = readChunkData(chunk);
      return [
        {
          type: "decision",
          workflow:
            typeof data.workflow === "string" ? data.workflow : "general_chat",
          workflowLabel:
            typeof data.workflowLabel === "string"
              ? data.workflowLabel
              : "通用对话",
          source: typeof data.source === "string" ? data.source : "rules",
          confidence:
            typeof data.confidence === "string" ? data.confidence : "medium",
          continuationMode:
            typeof data.continuationMode === "string"
              ? data.continuationMode
              : "new_task",
          retrievalSources:
            typeof data.retrievalSources === "string"
              ? data.retrievalSources
              : "none",
          artifactIntent:
            typeof data.artifactIntent === "string"
              ? data.artifactIntent
              : "none",
          forcedToolChoice:
            typeof data.forcedToolChoice === "string" ||
            data.forcedToolChoice == null
              ? (data.forcedToolChoice as string | null | undefined)
              : undefined,
          preferredTools: Array.isArray(data.preferredTools)
            ? data.preferredTools.filter(
                (item): item is string => typeof item === "string",
              )
            : [],
          allowedTools: Array.isArray(data.allowedTools)
            ? data.allowedTools.filter(
                (item): item is string => typeof item === "string",
              )
            : [],
          reasonCodes: Array.isArray(data.reasonCodes)
            ? data.reasonCodes.filter(
                (item): item is string => typeof item === "string",
              )
            : [],
          at: typeof data.at === "number" ? data.at : at,
        },
      ];
    }
    case "data-agent-working-note": {
      const data = readChunkData(chunk);
      return [
        {
          type: "working-note",
          id: typeof data.id === "string" ? data.id : `note-${at}`,
          runId: typeof data.runId === "string" ? data.runId : "run-current",
          section:
            data.section === "materials" ||
            data.section === "planning" ||
            data.section === "tooling" ||
            data.section === "generation" ||
            data.section === "validation" ||
            data.section === "handoff"
              ? data.section
              : "understanding",
          status:
            data.status === "done" || data.status === "error"
              ? data.status
              : "running",
          title: typeof data.title === "string" ? data.title : "Agent 正在处理",
          markdown:
            typeof data.markdown === "string" ? data.markdown : "",
          importance:
            data.importance === "high" ||
            data.importance === "low" ||
            data.importance === "normal"
              ? data.importance
              : undefined,
          transient: typeof data.transient === "boolean" ? data.transient : true,
          at: typeof data.at === "number" ? data.at : at,
        },
      ];
    }
    case "data-agent-process-summary": {
      const data = readChunkData(chunk);
      return [
        {
          type: "process-summary",
          runId: typeof data.runId === "string" ? data.runId : "run-current",
          title: typeof data.title === "string" ? data.title : "本轮工作摘要",
          markdown: typeof data.markdown === "string" ? data.markdown : "",
          totalMs: typeof data.totalMs === "number" ? data.totalMs : undefined,
          at: typeof data.at === "number" ? data.at : at,
        },
      ];
    }
    case "data-agent-phase": {
      const data = readChunkData(chunk);
      return [
        {
          type: "phase",
          phase: typeof data.phase === "string" ? data.phase : "agent_phase",
          label: typeof data.label === "string" ? data.label : "阶段",
          status:
            data.status === "done" || data.status === "error" ? data.status : "running",
          at: typeof data.at === "number" ? data.at : at,
          detail: typeof data.detail === "string" ? data.detail : undefined,
          progressCurrent:
            typeof data.progressCurrent === "number" ? data.progressCurrent : undefined,
          progressTotal:
            typeof data.progressTotal === "number" ? data.progressTotal : undefined,
        },
      ];
    }
    case "data-agent-question-ready": {
      const data = readChunkData(chunk);
      return data.question
        ? [
            {
              type: "question-ready",
              question: data.question as AgentQuestionBlock,
              at: typeof data.at === "number" ? data.at : at,
            },
          ]
        : [];
    }
    case "data-agent-step": {
      const data = readChunkData(chunk);
      return data.kind === "start"
        ? [{
            type: "step-start",
            stepId: typeof data.stepId === "string" ? data.stepId : `step-${state.unnamedStepCount + 1}`,
            label: typeof data.label === "string" ? data.label : "Step",
            at: typeof data.at === "number" ? data.at : at,
          }]
        : [
            {
              type: "step-finish",
              stepId: typeof data.stepId === "string" ? data.stepId : `step-${state.unnamedStepCount + 1}`,
              label: typeof data.label === "string" ? data.label : "Step",
              at: typeof data.at === "number" ? data.at : at,
              finishReason:
                typeof data.finishReason === "string" ? data.finishReason : undefined,
            },
          ];
    }
    case "data-agent-artifact-chunk": {
      const data = readChunkData(chunk);
      return [
        {
          type: "artifact-chunk",
          toolCallId: typeof data.toolCallId === "string" ? data.toolCallId : "",
          artifactKey:
            typeof data.artifactKey === "string" ? data.artifactKey : undefined,
          artifactRole: normalizeArtifactRole(data.artifactRole) ?? undefined,
          artifactVariant: normalizeArtifactVariant(data.artifactVariant) ?? undefined,
          artifactKind: (typeof data.artifactKind === "string" ? data.artifactKind : "exercises") as ArtifactChunkKind,
          chunkType: (typeof data.chunkType === "string" ? data.chunkType : "meta") as ArtifactChunkType,
          data: data.data,
          at: typeof data.at === "number" ? data.at : at,
        },
      ];
    }
    case "data-agent-artifact-persisted": {
      const data = readChunkData(chunk);
      return typeof data.artifactKey === "string" && data.artifactKey.trim()
        ? [
            {
              type: "artifact-persisted",
              artifactKey: data.artifactKey.trim(),
              artifactRole: normalizeArtifactRole(data.artifactRole) ?? undefined,
              artifactVariant: normalizeArtifactVariant(data.artifactVariant) ?? undefined,
              assistantMessageId:
                typeof data.assistantMessageId === "string"
                  ? data.assistantMessageId
                  : undefined,
              conversationId:
                typeof data.conversationId === "string"
                  ? data.conversationId
                  : undefined,
              at: typeof data.at === "number" ? data.at : at,
            },
          ]
        : [];
    }
    case "data-agent-finish": {
      const data = readChunkData(chunk);
      return [
        {
          type: "finish",
          totalMs: typeof data.totalMs === "number" ? data.totalMs : 0,
          finishReason:
            typeof data.finishReason === "string" ? data.finishReason : undefined,
          usage:
            data.usage && typeof data.usage === "object"
              ? (data.usage as Record<string, unknown>)
              : undefined,
        },
      ];
    }
    case "text-delta":
      return [{ type: "text-delta", text: chunk.delta }];
    case "tool-input-available":
      state.toolNames.set(chunk.toolCallId, chunk.toolName);
      state.toolStartedAt.set(chunk.toolCallId, at);
      return [
        {
          type: "tool-call",
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          input: chunk.input,
          at,
        },
      ];
    case "tool-input-error":
      state.toolNames.set(chunk.toolCallId, chunk.toolName);
      return [
        {
          type: "tool-error",
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          message: chunk.errorText,
          at,
        },
      ];
    case "tool-output-available": {
      const toolName = state.toolNames.get(chunk.toolCallId) ?? "unknown_tool";
      const startedAt = state.toolStartedAt.get(chunk.toolCallId);
      return [
        {
          type: "tool-result",
          toolCallId: chunk.toolCallId,
          toolName,
          output: normalizeToolOutput(chunk.output),
          at,
          durationMs: startedAt ? Math.max(0, at - startedAt) : undefined,
        },
      ];
    }
    case "tool-output-error": {
      const toolName = state.toolNames.get(chunk.toolCallId);
      return [
        {
          type: "tool-error",
          toolCallId: chunk.toolCallId,
          toolName,
          message: chunk.errorText,
          at,
        },
      ];
    }
    case "start-step": {
      state.unnamedStepCount += 1;
      const stepId = `step-${state.unnamedStepCount}`;
      state.stepOrder.push(stepId);
      return [{ type: "step-start", stepId, label: `Step ${state.unnamedStepCount}`, at }];
    }
    case "finish-step": {
      const stepId = state.stepOrder.shift() ?? `step-${++state.unnamedStepCount}`;
      return [{ type: "step-finish", stepId, label: stepId.replace("-", " "), at }];
    }
    case "error":
      return [{ type: "error", message: chunk.errorText }];
    default:
      return [];
  }
}

export async function* parseUiMessageChunks(
  response: Response,
): AsyncGenerator<EduUIMessageChunk> {
  for await (const chunk of parseSSEJson<EduUIMessageChunk>(response)) {
    if (chunk && typeof chunk === "object" && typeof chunk.type === "string") {
      yield chunk;
    }
  }
}

export async function* parseAgentStreamEvents(
  response: Response,
): AsyncGenerator<AgentStreamEvent> {
  if (!isUiMessageStreamResponse(response)) {
    for await (const event of parseNDJSON<AgentStreamEvent>(response)) {
      yield event;
    }
    return;
  }

  const state = createAgentStreamState();
  for await (const chunk of parseUiMessageChunks(response)) {
    const events = toAgentEventsFromChunk(chunk, state);
    for (const event of events) {
      yield event;
    }
  }
}

export async function* parseLessonUiParts(
  response: Response,
): AsyncGenerator<
  | EduUIMessageChunk
  | { type: "error"; errorText: string }
> {
  if (isUiMessageStreamResponse(response)) {
    for await (const chunk of parseUiMessageChunks(response)) {
      yield chunk;
    }
    return;
  }

  for await (const event of parseNDJSON<Record<string, unknown>>(response)) {
    const type = typeof event.type === "string" ? event.type : "";
    if (type === "error") {
      yield {
        type: "error",
        errorText:
          typeof event.message === "string" && event.message.trim().length > 0
            ? event.message
            : "教案生成失败",
      };
      continue;
    }
    if (type === "meta") {
      yield { type: "data-lesson-meta", data: event } as EduUIMessageChunk;
      continue;
    }
    if (type === "section") {
      yield {
        type: "data-lesson-section",
        data: {
          section:
            event.section && typeof event.section === "object" && !Array.isArray(event.section)
              ? (event.section as Record<string, unknown>)
              : {},
          progress: typeof event.progress === "number" ? event.progress : undefined,
          completedSections:
            typeof event.completedSections === "number" ? event.completedSections : undefined,
          totalSections:
            typeof event.totalSections === "number" ? event.totalSections : undefined,
          draft: event.draft === true,
        },
      } as EduUIMessageChunk;
      continue;
    }
    if (type === "section_warning") {
      yield {
        type: "data-lesson-section-warning",
        data: {
          sectionIndex:
            typeof event.sectionIndex === "number" ? event.sectionIndex : -1,
          sectionId:
            typeof event.sectionId === "string" ? event.sectionId : "",
          issues: Array.isArray(event.issues)
            ? event.issues.map((item) => String(item))
            : [],
        },
      } as EduUIMessageChunk;
      continue;
    }
    if (type === "warning") {
      yield {
        type: "data-lesson-warning",
        data: {
          message:
            typeof event.message === "string" ? event.message : "教案生成过程中出现提醒",
        },
      } as EduUIMessageChunk;
      continue;
    }
    if (type === "pipeline") {
      yield { type: "data-lesson-pipeline", data: event } as EduUIMessageChunk;
      continue;
    }
    if (type === "complete") {
      yield {
        type: "data-lesson-complete",
        data: {
          planId: typeof event.planId === "string" ? event.planId : "",
        },
      } as EduUIMessageChunk;
    }
  }
}
