import type { UIDataTypes, UIMessageChunk } from "ai";
import type { AgentMemoryPreview } from "@/lib/agent/context-memory";
import type { AgentQuestionBlock } from "@/lib/agent/chat-stream-types";
import type {
  AgentTriageArtifactIntent,
  AgentTriageConfidence,
  AgentTriageContinuationMode,
  AgentTriageRetrievalSource,
  AgentTriageSource,
  AgentWorkflowId,
} from "@/lib/agent/triage/types";

export type AgentMetaDataPart = {
  startedAt: number;
  conversationId?: string;
  memoryPreview?: AgentMemoryPreview;
};

export type AgentRunDataPart = {
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

export type AgentDecisionDataPart = {
  workflow: AgentWorkflowId;
  workflowLabel: string;
  source: AgentTriageSource;
  confidence: AgentTriageConfidence;
  continuationMode: AgentTriageContinuationMode;
  retrievalSources: AgentTriageRetrievalSource;
  artifactIntent: AgentTriageArtifactIntent;
  forcedToolChoice?: string | null;
  preferredTools: string[];
  allowedTools: string[];
  reasonCodes: string[];
  at: number;
};

export type AgentHandoffDataPart = {
  kind: "triage_to_runtime";
  promptWorkflow: AgentWorkflowId;
  runtimeWorkflow: AgentWorkflowId;
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
  promptSource: AgentTriageSource;
  runtimeSource: AgentTriageSource;
  promptConfidence: AgentTriageConfidence;
  runtimeConfidence: AgentTriageConfidence;
  changed: boolean;
  reasonCodes: string[];
  at: number;
};

export type AgentWorkingNoteDataPart = {
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

export type AgentProcessSummaryDataPart = {
  runId: string;
  title: string;
  markdown: string;
  totalMs?: number;
  at: number;
};

export type AgentPhaseDataPart = {
  phase: string;
  label: string;
  status: "running" | "done" | "error";
  at: number;
  detail?: string;
  progressCurrent?: number;
  progressTotal?: number;
};

export type AgentQuestionReadyDataPart = {
  question: AgentQuestionBlock;
  at: number;
};

export type AgentStepDataPart = {
  kind: "start" | "finish";
  stepId: string;
  label: string;
  at: number;
  finishReason?: string;
};

export type AgentFinishDataPart = {
  totalMs: number;
  finishReason?: string;
  usage?: Record<string, unknown>;
};

export type LessonMetaDataPart = {
  planId: string;
  title: string;
  courseName?: string;
  unitName?: string;
  totalMinutes?: number;
  level?: string;
  materialCount?: number;
  totalSections?: number;
  completedSections?: number;
};

export type ArtifactChunkDataPart = {
  toolCallId: string;
  artifactKind: string;
  chunkType: string;
  data: unknown;
  at: number;
};

export type EduUIDataParts = UIDataTypes & {
  "agent-meta": AgentMetaDataPart;
  "agent-run": AgentRunDataPart;
  "agent-decision": AgentDecisionDataPart;
  "agent-handoff": AgentHandoffDataPart;
  "agent-working-note": AgentWorkingNoteDataPart;
  "agent-process-summary": AgentProcessSummaryDataPart;
  "agent-phase": AgentPhaseDataPart;
  "agent-question-ready": AgentQuestionReadyDataPart;
  "agent-step": AgentStepDataPart;
  "agent-finish": AgentFinishDataPart;
  "agent-artifact-chunk": ArtifactChunkDataPart;
  "lesson-meta": LessonMetaDataPart;
  "lesson-warning": { message: string };
  "lesson-section-warning": {
    sectionIndex: number;
    sectionId: string;
    issues: string[];
  };
  "lesson-section": {
    section: Record<string, unknown>;
    progress?: number;
    completedSections?: number;
    totalSections?: number;
    draft?: boolean;
  };
  "lesson-pipeline": Record<string, unknown>;
  "lesson-complete": { planId: string };
};

export type EduUIMessageChunk = UIMessageChunk<unknown, EduUIDataParts>;
