import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmbeddedArtifactPayload } from "@/lib/agent/artifact-payload";
import type { AgentTaskState, AgentToolName } from "@/lib/agent/task-state";
import type { StoredConversationMessage, UploadedMaterial } from "@/lib/agent/chat-shared";
import type { ToolArtifactPayload, ToolResultType } from "@/lib/agent/tools/tool-result";
import type { Database } from "@/types/database";

export type AppSupabase = SupabaseClient<Database>;

export type AgentToolRuntimeState = {
  previousMessages: StoredConversationMessage[];
  latestPersistedArtifact?: EmbeddedArtifactPayload | null;
  latestGeneratedArtifact?: {
    type: ToolResultType;
    artifact: ToolArtifactPayload;
  } | null;
};

export type AgentChatToolsParams = {
  supabase: AppSupabase;
  teacherId: string;
  latestUserPrompt: string;
  latestAssistantPrompt: string;
  taskState: AgentTaskState;
  uploaded: {
    materials: UploadedMaterial[];
    warnings: string[];
  };
  allowedTools?: AgentToolName[];
  runtime?: AgentToolRuntimeState;
};
