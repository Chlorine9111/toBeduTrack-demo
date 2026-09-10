import { listConversationMessages } from "@/lib/assistant/store";
import { buildAgentConversationContext } from "@/lib/agent/context-memory";
import { buildAgentRuntimeContextPack } from "@/lib/agent/runtime-context";
import { buildTaskAwareMaterialPreview } from "@/lib/agent/material-context";
import { buildAgentTaskState, mergeAgentTaskStateWithContext } from "@/lib/agent/task-state";
import {
  buildUploadedMaterialConversationSources,
  resolveProfileKey,
  trimQueryText,
  type AgentTaskContext,
  type StoredConversationMessage,
  type UploadedMaterial,
} from "@/lib/agent/chat-shared";

type ConversationStoreClient = Parameters<typeof listConversationMessages>[0];

export async function prepareAgentChatPreflight(params: {
  supabase: ConversationStoreClient;
  teacherId: string;
  conversationId: string;
  profileKeyInput?: string;
  displayUserPrompt: string;
  latestUserPrompt: string;
  clientAssistantPrompt?: string;
  taskContext?: AgentTaskContext;
  uploadedMaterials: UploadedMaterial[];
}) {
  const previousRows = await listConversationMessages(
    params.supabase,
    params.teacherId,
    params.conversationId,
  );
  const previousMessages: StoredConversationMessage[] = previousRows.map((item) => ({
    role:
      item.role === "user" ||
      item.role === "assistant" ||
      item.role === "system"
        ? item.role
        : "assistant",
    content: item.content,
    createdAt: item.createdAt,
    sources: item.sources,
  }));
  const conversationContext = buildAgentConversationContext(previousMessages);
  const latestAssistantPrompt =
    conversationContext.latestAssistantReply || params.clientAssistantPrompt;
  const profileKey = resolveProfileKey(params.profileKeyInput, params.teacherId);
  const inferredTaskState = buildAgentTaskState({
    visiblePrompt: params.displayUserPrompt || params.latestUserPrompt,
    latestPrompt: params.latestUserPrompt,
    lastArtifactType: "",
    hasUploadedMaterials: params.uploadedMaterials.length > 0,
  });
  const taskState = mergeAgentTaskStateWithContext(
    inferredTaskState,
    params.taskContext,
  );
  const uploadedMaterialSummary = buildTaskAwareMaterialPreview({
    materials: params.uploadedMaterials,
    taskKind: taskState.kind === "organize" ? "general" : taskState.kind,
    query: params.displayUserPrompt || params.latestUserPrompt,
  });
  const uploadedMaterialSources = buildUploadedMaterialConversationSources({
    materials: params.uploadedMaterials,
    summary: uploadedMaterialSummary,
  });
  const runtimeContext = buildAgentRuntimeContextPack({
    visiblePrompt: params.displayUserPrompt || params.latestUserPrompt,
    modelPrompt: params.latestUserPrompt,
    queryOverride: params.taskContext?.retrievalQuery,
    conversationContext,
    memoryPrompt: "",
    memoryFragments: [],
    uploadedMaterialsSummary: uploadedMaterialSummary,
    memorySemanticHints: [],
    memoryEpisodicHints: [],
  });

  return {
    previousRows,
    previousMessages,
    conversationContext,
    latestAssistantPrompt,
    profileKey,
    lastArtifactType: "",
    taskState,
    uploadedMaterialSummary,
    uploadedMaterialSources,
    runtimeContext,
    retrievalHint: trimQueryText(runtimeContext.retrievalHint),
  };
}
