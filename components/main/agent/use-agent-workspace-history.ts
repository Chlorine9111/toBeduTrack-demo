"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback, useRef } from "react";
import {
  AGENT_CONVERSATION_STORAGE_KEY,
  AGENT_CONVERSATION_RESTORE_STATUS_EVENT,
  AGENT_CONVERSATIONS_UPDATED_EVENT,
  type AgentConversationRestoreStatusDetail,
} from "@/lib/agent/workspace";
import {
  buildScanMessageSource,
  restoreScanMessageResult,
} from "@/components/main/agent/workspace-utils";
import { ENABLE_AGENT_CLARIFICATION_UI } from "@/components/main/agent/workspace-flags";
import type {
  AgentMessage,
  ConversationDetailResponse,
  PendingClarification,
  PersistConversationResponse,
} from "@/components/main/agent/workspace-types";

type Params = {
  isZh: boolean;
  conversationStorageKey: string;
  conversationIdRef: MutableRefObject<string>;
  conversationRestoreSeqRef: MutableRefObject<number>;
  createWelcomeAssistantMessage: () => AgentMessage;
  parseErrorMessage: (response: Response) => Promise<string>;
  setConversationId: Dispatch<SetStateAction<string>>;
  setMessages: Dispatch<SetStateAction<AgentMessage[]>>;
  setPendingClarification: Dispatch<SetStateAction<PendingClarification | null>>;
  setConversationWarningText: Dispatch<SetStateAction<string>>;
  setRestoringConversation: Dispatch<SetStateAction<boolean>>;
};

export function useAgentWorkspaceHistory(params: Params) {
  const restoreAbortRef = useRef<AbortController | null>(null);
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

  const notifyConversationsUpdated = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(AGENT_CONVERSATIONS_UPDATED_EVENT));
  }, []);

  const notifyConversationRestoreStatus = useCallback(
    (detail: AgentConversationRestoreStatusDetail) => {
      if (typeof window === "undefined") return;
      window.dispatchEvent(
        new CustomEvent<AgentConversationRestoreStatusDetail>(
          AGENT_CONVERSATION_RESTORE_STATUS_EVENT,
          { detail },
        ),
      );
    },
    [],
  );

  const persistLocalMessages = useCallback(
    async (
      appended: AgentMessage[],
      titleHint?: string,
      options?: {
        pendingClarification?: PendingClarification | null;
      },
    ) => {
      const currentConversationId = params.conversationIdRef.current.trim();
      const messagesToPersist = appended
        .filter((item) => item.role === "user" || item.role === "assistant")
        .map((item) => {
          const scanSource = item.scanResult
            ? [buildScanMessageSource(item.scanResult)]
            : [];
          const clarificationSource =
            item.clarificationQuestion
              ? [
                  {
                    kind: "clarification_question" as const,
                    field: item.clarificationQuestion.field,
                    question: item.clarificationQuestion.question,
                    placeholder: item.clarificationQuestion.placeholder,
                    options: item.clarificationQuestion.options,
                    questions: item.clarificationQuestions,
                    pending:
                      options?.pendingClarification?.messageId === item.id
                        ? {
                            originalInput:
                              options.pendingClarification.originalInput,
                            displayInput:
                              options.pendingClarification.displayInput,
                            answers: options.pendingClarification.answers,
                            taskContext:
                              options.pendingClarification.taskContext,
                            clarifyRound:
                              options.pendingClarification.clarifyRound,
                            scanResult:
                              options.pendingClarification.scanResult,
                          }
                        : undefined,
                  },
                ]
              : [];

          const sources =
            scanSource.length > 0 || clarificationSource.length > 0
              ? [...scanSource, ...clarificationSource]
              : undefined;

          return {
            role: item.role,
            content: item.content.trim(),
            sources,
          };
        })
        .filter((item) => item.content);

      if (messagesToPersist.length === 0) return;

      try {
        const response = await fetch("/api/chat/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: currentConversationId || undefined,
            title: titleHint?.trim() || undefined,
            messages: messagesToPersist,
          }),
        });

        if (!response.ok) {
          throw new Error(await params.parseErrorMessage(response));
        }

        const payload = (await response.json()) as PersistConversationResponse;
        const nextConversationId = payload.conversation?.id?.trim() ?? "";
        if (nextConversationId && nextConversationId !== currentConversationId) {
          params.conversationIdRef.current = nextConversationId;
          params.setConversationId(nextConversationId);
        }
        notifyConversationsUpdated();
      } catch (error) {
        console.warn("本地消息写入历史记录失败", error);
      }
    },
    [notifyConversationsUpdated, params],
  );

  const restoreConversation = useCallback(
    async (requestedConversationId: string) => {
      const targetConversationId = requestedConversationId.trim();
      const requestId = params.conversationRestoreSeqRef.current + 1;
      params.conversationRestoreSeqRef.current = requestId;

      if (!targetConversationId) {
        restoreAbortRef.current?.abort();
        restoreAbortRef.current = null;
        params.setConversationWarningText("");
        params.setConversationId("");
        params.setPendingClarification(null);
        params.setMessages([params.createWelcomeAssistantMessage()]);
        params.setRestoringConversation(false);
        return;
      }

      restoreAbortRef.current?.abort();
      const controller = new AbortController();
      restoreAbortRef.current = controller;
      notifyConversationRestoreStatus({
        conversationId: targetConversationId,
        state: "started",
      });
      params.setRestoringConversation(true);

      try {
        const response = await fetch(
          `/api/chat/conversations/${encodeURIComponent(targetConversationId)}`,
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (params.conversationRestoreSeqRef.current !== requestId) return;

        if (!response.ok) {
          const restoreMessage = await params.parseErrorMessage(response);
          window.localStorage.removeItem(params.conversationStorageKey);
          window.localStorage.removeItem(AGENT_CONVERSATION_STORAGE_KEY);
          params.setConversationId("");
          params.setPendingClarification(null);
          params.setMessages([params.createWelcomeAssistantMessage()]);
          params.setConversationWarningText(
            response.status === 404
              ? params.isZh
                ? "历史对话不存在或当前账号无权访问，已切换为新对话。"
                : "This conversation no longer exists or is not accessible for the current account. Switched to a new chat."
              : params.isZh
                ? `历史对话恢复失败：${restoreMessage}`
                : `Failed to restore the conversation: ${restoreMessage}`,
          );
          return;
        }

        const restoredConversation =
          (await response.json()) as ConversationDetailResponse;
        const restoredMessages: AgentMessage[] = [];
        let restoredPendingClarification: PendingClarification | null = null;
        let lastUserContent = "";
        let lastScanResult: PendingClarification["scanResult"] = null;

        for (const item of restoredConversation.messages ?? []) {
          if (item.role !== "user" && item.role !== "assistant") continue;

          const msg: AgentMessage = {
            id: item.id,
            role: item.role as "user" | "assistant",
            content: item.content,
          };
          const sources = Array.isArray(item.sources)
            ? item.sources.filter(isRecord)
            : [];

          const scanSource = sources.find((source) => source.kind === "scan_result");
          const restoredScanResult = restoreScanMessageResult(scanSource);
          if (restoredScanResult) {
            msg.scanResult = restoredScanResult;
            msg.includeInModel = false;
            lastScanResult = restoredScanResult;
          }

          const clarifySource = sources.find(
            (source) => source.kind === "clarification_question",
          );
          if (clarifySource) {
            msg.includeInModel = false;
          }
          if (
            ENABLE_AGENT_CLARIFICATION_UI &&
            clarifySource &&
            typeof clarifySource.question === "string"
          ) {
            const field = String(clarifySource.field ?? "action");
            const sourceOptions = Array.isArray(clarifySource.options)
              ? clarifySource.options.filter(isRecord)
              : [];
            msg.clarificationQuestion = {
              id: `restored-${field}`,
              question: clarifySource.question,
              field,
              questionType: "required",
              placeholder:
                typeof clarifySource.placeholder === "string"
                  ? clarifySource.placeholder
                  : undefined,
              options: sourceOptions.map((opt, i) => ({
                key: `${field}-${i}`,
                label: String(opt.label ?? ""),
                value: String(opt.value ?? ""),
                field,
                isOther: Boolean(opt.isOther),
                description:
                  typeof opt.description === "string"
                    ? opt.description
                    : undefined,
              })),
            };
            if (Array.isArray(clarifySource.questions)) {
              msg.clarificationQuestions =
                clarifySource.questions as AgentMessage["clarificationQuestions"];
            } else {
              msg.clarificationQuestions = [msg.clarificationQuestion];
            }
            msg.includeInModel = false;

            const pending = isRecord(clarifySource.pending)
              ? clarifySource.pending
              : null;
            const pendingScanResult =
              restoreScanMessageResult(pending?.scanResult) ?? lastScanResult;
            restoredPendingClarification = {
              messageId: item.id,
              originalInput:
                typeof pending?.originalInput === "string" &&
                pending.originalInput.trim()
                  ? pending.originalInput
                  : lastUserContent,
              displayInput:
                typeof pending?.displayInput === "string" &&
                pending.displayInput.trim()
                  ? pending.displayInput
                  : lastUserContent,
              scanResult: pendingScanResult,
              answers:
                isRecord(pending?.answers)
                  ? Object.fromEntries(
                      Object.entries(pending.answers)
                        .filter((entry): entry is [string, string] =>
                          typeof entry[1] === "string" && entry[1].trim().length > 0,
                        ),
                    )
                  : {},
              question: msg.clarificationQuestion,
              taskContext: isRecord(pending?.taskContext)
                ? (pending.taskContext as PendingClarification["taskContext"])
                : undefined,
              clarifyRound:
                typeof pending?.clarifyRound === "number" &&
                Number.isFinite(pending.clarifyRound)
                  ? Math.max(1, Math.floor(pending.clarifyRound))
                  : 1,
            };
          }

          restoredMessages.push(msg);
          if (msg.role === "user" && msg.content.trim()) {
            lastUserContent = msg.content.trim();
          }
        }

        if (restoredMessages.length === 0) {
          window.localStorage.removeItem(params.conversationStorageKey);
          window.localStorage.removeItem(AGENT_CONVERSATION_STORAGE_KEY);
          params.setConversationId("");
          params.setPendingClarification(null);
          params.setMessages([params.createWelcomeAssistantMessage()]);
          params.setConversationWarningText(
            params.isZh
              ? "这条历史对话没有可恢复内容，已切换为新对话。"
              : "This conversation has no restorable content. Switched to a new chat.",
          );
          return;
        }

        params.setConversationId(targetConversationId);
        params.setPendingClarification(
          ENABLE_AGENT_CLARIFICATION_UI
            ? restoredPendingClarification
            : null,
        );
        params.setMessages(restoredMessages);
        params.setConversationWarningText("");
      } catch {
        if (controller.signal.aborted) return;
        if (params.conversationRestoreSeqRef.current !== requestId) return;
        params.setConversationId("");
        params.setPendingClarification(null);
        params.setMessages([params.createWelcomeAssistantMessage()]);
        params.setConversationWarningText(
          params.isZh
            ? "历史对话恢复失败，请稍后重试。"
            : "Failed to restore the conversation. Try again shortly.",
        );
      } finally {
        if (restoreAbortRef.current === controller) {
          restoreAbortRef.current = null;
        }
        if (params.conversationRestoreSeqRef.current === requestId) {
          notifyConversationRestoreStatus({
            conversationId: targetConversationId,
            state: "finished",
          });
          params.setRestoringConversation(false);
        }
      }
    },
    [notifyConversationRestoreStatus, params],
  );

  return {
    notifyConversationsUpdated,
    persistLocalMessages,
    restoreConversation,
  };
}
