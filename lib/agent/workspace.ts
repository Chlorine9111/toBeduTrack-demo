export const AGENT_CONVERSATION_STORAGE_KEY = "agent_workspace_conversation_id";
export const AGENT_RESET_EVENT = "deskmate-agent-reset";
export const AGENT_OPEN_CONVERSATION_EVENT = "deskmate-agent-open-conversation";
export const AGENT_CONVERSATIONS_UPDATED_EVENT = "deskmate-agent-conversations-updated";
export const AGENT_CONVERSATION_RESTORE_STATUS_EVENT =
  "deskmate-agent-conversation-restore-status";

export type AgentOpenConversationDetail = {
  conversationId: string;
};

export type AgentConversationRestoreStatusDetail = {
  conversationId: string;
  state: "started" | "finished";
};

export function buildAgentConversationStorageKey(accountId?: string | null) {
  const normalized = accountId?.trim();
  if (!normalized) return AGENT_CONVERSATION_STORAGE_KEY;
  return `${AGENT_CONVERSATION_STORAGE_KEY}:${normalized}`;
}

export function buildAgentConversationHref(conversationId?: string | null) {
  const normalized = conversationId?.trim();
  if (!normalized) return "/main/agent";
  return `/main/agent?conversationId=${encodeURIComponent(normalized)}`;
}

export function syncAgentConversationUrl(
  conversationId?: string | null,
  options?: { replace?: boolean },
) {
  if (typeof window === "undefined") return;
  const nextHref = buildAgentConversationHref(conversationId);
  const historyMethod = options?.replace ? "replaceState" : "pushState";
  window.history[historyMethod]({}, "", nextHref);
}
