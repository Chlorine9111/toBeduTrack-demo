"use client";

import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { apiGet } from "@/lib/api/client";
import {
  AGENT_CONVERSATION_STORAGE_KEY,
  AGENT_OPEN_CONVERSATION_EVENT,
  AGENT_RESET_EVENT,
  buildAgentConversationStorageKey,
  type AgentOpenConversationDetail,
} from "@/lib/agent/workspace";
import {
  joinUniqueMessages,
  normalizeWorkspaceLoadError,
} from "@/components/main/agent/workspace-utils";
import { buildPblArtifactAssistantText } from "@/lib/agent/pbl-artifact";
import type { PblPlan } from "@/lib/pbl/types";
import type {
  AccountProfileResponse,
  AgentMessage,
} from "@/components/main/agent/workspace-types";

type Params = {
  isZh: boolean;
  conversationId: string;
  conversationStorageKey: string;
  restoringConversation: boolean;
  streaming: boolean;
  createWelcomeAssistantMessage: () => AgentMessage;
  restoreConversationRef: MutableRefObject<
    (requestedConversationId: string) => Promise<void>
  >;
  resetConversationRef: MutableRefObject<() => void>;
  startAgentTaskRef: MutableRefObject<
    (rawInput: string, files?: File[]) => Promise<void>
  >;
  conversationIdRef: MutableRefObject<string>;
  initialPromptRef: MutableRefObject<string>;
  entrypointHandledRef: MutableRefObject<boolean>;
  conversationRestoreSeqRef: MutableRefObject<number>;
  initialIsZhRef: MutableRefObject<boolean>;
  setWorkspaceBootstrapping: Dispatch<SetStateAction<boolean>>;
  setWorkspaceLoadErrorText: Dispatch<SetStateAction<string>>;
  setConversationStorageKey: Dispatch<SetStateAction<string>>;
  setConversationId: Dispatch<SetStateAction<string>>;
  setRestoringConversation: Dispatch<SetStateAction<boolean>>;
  setInput: Dispatch<SetStateAction<string>>;
  setMessages: Dispatch<SetStateAction<AgentMessage[]>>;
  setConversationWarningText: Dispatch<SetStateAction<string>>;
  openArtifact: (artifactId: string) => void;
  persistLocalMessages: (appended: AgentMessage[], titleHint?: string) => Promise<void>;
};

export function useAgentWorkspaceLifecycle(params: Params) {
  const initialPblPlanIdRef = useRef("");
  const pblBootstrapStartedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    const controller = new AbortController();
    const initialIsZh = params.initialIsZhRef.current;

    params.setWorkspaceBootstrapping(true);

    const load = async () => {
      const loadErrors: string[] = [];
      try {
        const profileResult = await Promise.allSettled([
          apiGet<AccountProfileResponse>("/api/account/profile", {
            signal: controller.signal,
          }),
        ]);

        if (cancelled) return;

        const profile =
          profileResult[0]?.status === "fulfilled" ? profileResult[0].value : null;

        if (profileResult[0]?.status === "rejected") {
          loadErrors.push(
            normalizeWorkspaceLoadError(
              profileResult[0].reason instanceof Error
                ? profileResult[0].reason.message
                : initialIsZh
                  ? "账户信息读取失败"
                  : "Failed to load account profile",
              initialIsZh,
            ),
          );
        }

        params.setWorkspaceLoadErrorText(joinUniqueMessages(loadErrors));

        const accountId = profile?.profile.id?.trim() ?? "";
        const nextConversationStorageKey =
          buildAgentConversationStorageKey(accountId);
        params.setConversationStorageKey(nextConversationStorageKey);
        window.localStorage.removeItem(AGENT_CONVERSATION_STORAGE_KEY);

        const searchParams = new URLSearchParams(window.location.search);
        const requestedConversationId =
          searchParams.get("conversationId")?.trim() ?? "";
        const requestedPblPlanId =
          searchParams.get("pblPlanId")?.trim() ?? "";
        const savedConversationId =
          window.localStorage.getItem(nextConversationStorageKey)?.trim() ?? "";
        const initialConversationId =
          requestedConversationId ||
          (requestedPblPlanId ? "" : savedConversationId);

        if (initialConversationId) {
          params.setConversationId(initialConversationId);
        }

        if (initialConversationId) {
          await params.restoreConversationRef.current(initialConversationId);
        } else {
          params.setRestoringConversation(false);
        }
      } finally {
        if (!cancelled) {
          params.setRestoringConversation(false);
          params.setWorkspaceBootstrapping(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (
      params.restoringConversation ||
      params.streaming ||
      pblBootstrapStartedRef.current
    ) {
      return;
    }

    const pblPlanId = initialPblPlanIdRef.current.trim();
    if (!pblPlanId) {
      return;
    }

    pblBootstrapStartedRef.current = true;

    const bootstrap = async () => {
      try {
        const payload = await apiGet<{ plan: PblPlan }>(
          `/api/pbl/projects/${encodeURIComponent(pblPlanId)}`,
        );
        const plan = payload.plan;
        const assistantMessage: AgentMessage = {
          id: `pbl-bootstrap-${plan.id}`,
          role: "assistant",
          content: buildPblArtifactAssistantText(plan),
        };

        params.conversationIdRef.current = "";
        params.setConversationId("");
        params.setConversationWarningText("");
        params.setMessages([
          params.createWelcomeAssistantMessage(),
          assistantMessage,
        ]);
        await params.persistLocalMessages([assistantMessage], plan.title);
        params.openArtifact(assistantMessage.id);

        const bootstrapPrompt = params.initialPromptRef.current.trim();
        if (bootstrapPrompt) {
          params.entrypointHandledRef.current = true;
          params.initialPromptRef.current = "";
          void params.startAgentTaskRef.current(bootstrapPrompt);
        }
      } catch (error) {
        params.setConversationWarningText(
          normalizeWorkspaceLoadError(
            error instanceof Error
              ? error.message
              : params.isZh
                ? "PBL 项目加载失败"
                : "Failed to load the PBL project",
            params.isZh,
          ),
        );
      } finally {
        initialPblPlanIdRef.current = "";
      }
    };

    void bootstrap();
  }, [
    params.conversationIdRef,
    params.createWelcomeAssistantMessage,
    params.entrypointHandledRef,
    params.isZh,
    params.openArtifact,
    params.persistLocalMessages,
    params.restoringConversation,
    params.setConversationId,
    params.setConversationWarningText,
    params.setMessages,
    params.startAgentTaskRef,
    params.streaming,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const searchParams = new URLSearchParams(window.location.search);
    const prompt = searchParams.get("prompt")?.trim() ?? "";
    const action = searchParams.get("action")?.trim() ?? "";
    const conversationIdParam =
      searchParams.get("conversationId")?.trim() ?? "";
    const pblPlanId = searchParams.get("pblPlanId")?.trim() ?? "";

    params.initialPromptRef.current = prompt;
    initialPblPlanIdRef.current = conversationIdParam ? "" : pblPlanId;

    if (prompt) {
      params.setInput(prompt);
    }

    if (action === "scan_pdf") {
      params.setConversationWarningText(
        params.isZh
          ? "拆题 / 扫描 PDF 功能已迁出当前 Agent 页面。这里现在只保留资料问答与文档生成。"
          : "Question extraction has moved out of this Agent page.",
      );
    }

    if (prompt || action || pblPlanId) {
      const nextParams = new URLSearchParams();
      if (conversationIdParam) {
        nextParams.set("conversationId", conversationIdParam);
      }
      const nextUrl = nextParams.toString()
        ? `/main/agent?${nextParams.toString()}`
        : "/main/agent";
      window.history.replaceState({}, "", nextUrl);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    params.conversationIdRef.current = params.conversationId;
    if (params.conversationId) {
      window.localStorage.setItem(
        params.conversationStorageKey,
        params.conversationId,
      );
      window.localStorage.removeItem(AGENT_CONVERSATION_STORAGE_KEY);
      return;
    }

    window.localStorage.removeItem(params.conversationStorageKey);
    window.localStorage.removeItem(AGENT_CONVERSATION_STORAGE_KEY);
  }, [params.conversationId, params.conversationIdRef, params.conversationStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleReset = () => {
      params.conversationRestoreSeqRef.current += 1;
      params.resetConversationRef.current();
    };

    const handleOpenConversation = (event: Event) => {
      const detail = (event as CustomEvent<AgentOpenConversationDetail>).detail;
      const nextConversationId = detail?.conversationId?.trim();
      if (!nextConversationId) return;
      if (nextConversationId === params.conversationIdRef.current.trim()) return;
      params.entrypointHandledRef.current = true;
      params.initialPromptRef.current = "";
      void params.restoreConversationRef.current(nextConversationId);
    };

    window.addEventListener(AGENT_RESET_EVENT, handleReset);
    window.addEventListener(
      AGENT_OPEN_CONVERSATION_EVENT,
      handleOpenConversation as EventListener,
    );

    return () => {
      window.removeEventListener(AGENT_RESET_EVENT, handleReset);
      window.removeEventListener(
        AGENT_OPEN_CONVERSATION_EVENT,
        handleOpenConversation as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = () => {
      const nextConversationId =
        new URLSearchParams(window.location.search).get("conversationId")?.trim() ?? "";

      if (nextConversationId === params.conversationIdRef.current.trim()) {
        return;
      }

      params.entrypointHandledRef.current = true;
      params.initialPromptRef.current = "";

      if (!nextConversationId) {
        params.conversationRestoreSeqRef.current += 1;
        params.resetConversationRef.current();
        return;
      }

      void params.restoreConversationRef.current(nextConversationId);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (
      params.restoringConversation ||
      params.streaming ||
      pblBootstrapStartedRef.current ||
      initialPblPlanIdRef.current ||
      params.entrypointHandledRef.current
    ) {
      return;
    }

    const initialPrompt = params.initialPromptRef.current.trim();
    if (!initialPrompt) {
      return;
    }

    params.entrypointHandledRef.current = true;
    params.initialPromptRef.current = "";
    void params.startAgentTaskRef.current(initialPrompt);
  }, [params.isZh, params.restoringConversation, params.streaming]);
}
