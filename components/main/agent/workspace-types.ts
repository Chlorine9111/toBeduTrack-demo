import type { LucideIcon } from "lucide-react";
import type { AgentTaskContext } from "@/lib/agent/chat-shared";
import type { AgentQuestionBlock } from "@/lib/agent/chat-stream-types";
import type { ScanBatchResult } from "@/components/main/agent/scan-workflow";
import type { StructuredScanBatch } from "@/components/main/scan/ScanStructuredResult";

export type AgentPreflightAnswers = Record<string, string>;

export type AgentClarificationChoice = {
  key: string;
  label: string;
  value: string;
  field: string;
  isOther: boolean;
  description?: string;
};

export type AgentClarificationQuestion = {
  id: string;
  question: string;
  field: string;
  questionType: "required" | "preference";
  placeholder?: string;
  options: AgentClarificationChoice[];
};

export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  scanResult?: StructuredScanBatch;
  questionBlocks?: AgentQuestionBlock[];
  clarificationQuestion?: AgentClarificationQuestion;
  clarificationQuestions?: AgentClarificationQuestion[];
  includeInModel?: boolean;
};

export type ConversationDetailResponse = {
  conversation?: {
    id: string;
  };
  messages?: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    sources?: unknown;
  }>;
};

export type PersistConversationResponse = {
  conversation?: {
    id: string;
  };
  messages?: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    sources?: unknown;
  }>;
};

export type AccountProfileResponse = {
  profile: {
    id: string;
    displayName: string;
  };
};

export type PendingClarification = {
  messageId: string;
  originalInput: string;
  displayInput: string;
  scanResult: ScanBatchResult | null;
  answers: AgentPreflightAnswers;
  question: AgentClarificationQuestion;
  taskContext?: AgentTaskContext;
  clarifyRound: number;
};

export type WorkspaceQuickTag = {
  id: string;
  icon: LucideIcon;
  label: string;
  prompt: string;
};
