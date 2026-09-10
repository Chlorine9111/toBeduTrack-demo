import type { AgentMemoryPreview } from "@/lib/agent/context-memory";
import type { ArtifactRole, ArtifactVariant } from "@/lib/agent/artifact-payload";

export type AgentQuestionBlock = {
  id: string;
  questionNumber?: number;
  questionType?: string;
  title?: string;
  stem: string;
  options?: Array<{ key: string; content: string }>;
  answer?: string;
  solution?: string;
  knowledgePoint?: string;
  sourceLabel?: string;
  linkedFigures?: string[];
};

export type ArtifactChunkKind =
  | "rubric"
  | "exercises"
  | "lesson-plan"
  | "exam"
  | "pbl"
  | "worksheet"
  | "document"
  | (string & {});
export type ArtifactChunkType =
  | "meta"
  | "item"
  | "complete"
  | "text-delta"
  | "text-snapshot"
  | "outline-solid"
  | "node-patch"
  | "section-outline"
  | "section-patch"
  | (string & {});
export type ArtifactChunkPayloadRecord = Record<string, unknown>;

export type ArtifactChunkEvent = {
  type: "artifact-chunk";
  toolCallId: string;
  artifactKey?: string;
  artifactRole?: ArtifactRole;
  artifactVariant?: ArtifactVariant;
  artifactKind: ArtifactChunkKind;
  chunkType: ArtifactChunkType;
  data: unknown;
  at: number;
};

export type ArtifactPersistedEvent = {
  type: "artifact-persisted";
  artifactKey: string;
  artifactRole?: ArtifactRole;
  artifactVariant?: ArtifactVariant;
  assistantMessageId?: string;
  conversationId?: string;
  at: number;
};

export type AgentRunEvent = {
  type: "run";
  runId: string;
  mode:
    | "chat_answer"
    | "document_artifact"
    | "retrieval_only"
    | "retrieval_then_document"
    | "agent";
  status: "started" | "running" | "completed" | "error";
  startedAt: number;
};

export type AgentWorkingNoteEvent = {
  type: "working-note";
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
  importance?: "high" | "normal" | "low";
  transient?: boolean;
  at: number;
};

export type AgentProcessSummaryEvent = {
  type: "process-summary";
  runId: string;
  title: string;
  markdown: string;
  totalMs?: number;
  at: number;
};

export type AgentDecisionEvent = {
  type: "decision";
  workflow: string;
  workflowLabel: string;
  source: string;
  confidence: string;
  continuationMode: string;
  retrievalSources: string;
  artifactIntent: string;
  forcedToolChoice?: string | null;
  preferredTools: string[];
  allowedTools: string[];
  reasonCodes: string[];
  at: number;
};

export type AgentHandoffEvent = {
  type: "handoff";
  kind: "triage_to_runtime";
  promptWorkflow: string;
  runtimeWorkflow: string;
  promptMode:
    | "chat_answer"
    | "document_artifact"
    | "retrieval_only"
    | "retrieval_then_document"
    | "agent";
  runtimeMode:
    | "chat_answer"
    | "document_artifact"
    | "retrieval_only"
    | "retrieval_then_document"
    | "agent";
  promptSource: string;
  runtimeSource: string;
  promptConfidence: string;
  runtimeConfidence: string;
  changed: boolean;
  reasonCodes: string[];
  at: number;
};

export type AgentStreamEvent =
  | AgentRunEvent
  | AgentDecisionEvent
  | AgentHandoffEvent
  | AgentWorkingNoteEvent
  | AgentProcessSummaryEvent
  | {
      type: "meta";
      startedAt: number;
      conversationId?: string;
      memoryPreview?: AgentMemoryPreview;
    }
  | { type: "text-delta"; text: string }
  | ArtifactChunkEvent
  | ArtifactPersistedEvent
  | {
      type: "phase";
      phase: string;
      label: string;
      status: "running" | "done" | "error";
      at: number;
      detail?: string;
      progressCurrent?: number;
      progressTotal?: number;
    }
  | { type: "question-ready"; question: AgentQuestionBlock; at: number }
  | { type: "step-start"; stepId: string; label: string; at: number }
  | {
      type: "step-finish";
      stepId: string;
      label: string;
      at: number;
      finishReason?: string;
    }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      input: unknown;
      at: number;
    }
  | {
      type: "tool-result";
      toolCallId: string;
      toolName: string;
      output: unknown;
      at: number;
      durationMs?: number;
    }
  | {
      type: "tool-error";
      toolCallId?: string;
      toolName?: string;
      message: string;
      at: number;
    }
  | { type: "error"; message: string }
  | {
      type: "finish";
      totalMs: number;
      finishReason?: string;
      usage?: Record<string, unknown>;
    };
