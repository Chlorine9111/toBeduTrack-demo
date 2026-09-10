import { addConversationMessage } from "@/lib/assistant/store";
import { type AgentMemoryPreview } from "@/lib/agent/context-memory";
import type { AgentStreamLifecycleHooks } from "@/lib/agent/chat-stream";
import { type StoredConversationMessage, type UploadedMaterial } from "@/lib/agent/chat-shared";
import type { ParsedIntent } from "@/lib/chat/intent";
import type { AgentTaskContext } from "@/lib/agent/task-context";

export const WORKSHEET_ANSWER_KEY_PATTERN =
  /(答案|解析|附答案|answer\s*key|include\s+answers?|solutions?)/i;

export type ConversationStoreClient = Parameters<typeof addConversationMessage>[0];

export type ConversationRecord = {
  id: string;
  title: string | null;
};

export type TempPoolWorksheetParams = {
  supabase: ConversationStoreClient;
  teacherId: string;
  conversation: ConversationRecord;
  previousMessages: StoredConversationMessage[];
  isFirstTurn: boolean;
  displayUserPrompt: string;
  latestUserPrompt: string;
  latestParsedIntent: ParsedIntent;
  profileKey: string;
  memoryPreview?: AgentMemoryPreview;
  taskContext?: AgentTaskContext | null;
  streamHooks?: AgentStreamLifecycleHooks;
};

export type QuestionBankWorksheetParams = {
  supabase: ConversationStoreClient;
  teacherId: string;
  conversation: ConversationRecord;
  previousMessages: StoredConversationMessage[];
  isFirstTurn: boolean;
  displayUserPrompt: string;
  latestUserPrompt: string;
  latestParsedIntent: ParsedIntent;
  uploadedMaterials: UploadedMaterial[];
  uploadedFileNames: string[];
  uploadedMaterialSummary: string;
  profileKey: string;
  memoryPreview?: AgentMemoryPreview;
  taskContext?: AgentTaskContext | null;
  streamHooks?: AgentStreamLifecycleHooks;
};

export function collectRecentConversationText(
  previousMessages: StoredConversationMessage[],
  limit = 6,
) {
  return previousMessages
    .slice(-limit)
    .map((item) => item.content)
    .join("\n");
}

export function extractAttachmentFileNames(summary: string | undefined) {
  if (!summary) return [];
  const pattern = /([A-Za-z0-9._-]+\.(?:pdf|docx?|pptx?|png|jpe?g|webp))/gi;
  const matches = Array.from(summary.matchAll(pattern))
    .map((match) => match[1])
    .filter(Boolean);
  return [...new Set(matches)];
}
