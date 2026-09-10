import type { AgentConversationContext } from "@/lib/agent/context-memory";
import {
  buildContextRetrievalQuery,
  detectContextContinuation,
  type ContextFragment,
  detectContextReset,
  formatContextFragments,
  selectContextFragments,
} from "@/lib/context-engineering/core";
import {
  budgetPromptSections,
  trimTextToApproxTokens,
} from "@/lib/ai/prompt-budget";

type AgentRuntimeContextPack = {
  systemContext: string;
  retrievalHint: string;
  resetApplied: boolean;
  selectedLabels: string[];
};

const SYSTEM_CONTEXT_TOKEN_BUDGET = 1_500;
const RETRIEVAL_HINT_TOKEN_BUDGET = 260;

function splitMemoryPrompt(prompt: string) {
  return prompt
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function buildAgentRuntimeContextPack(params: {
  visiblePrompt: string;
  modelPrompt: string;
  queryOverride?: string;
  conversationContext: AgentConversationContext;
  memoryPrompt?: string;
  memoryFragments?: ContextFragment[];
  uploadedMaterialsSummary?: string;
  memorySemanticHints: string[];
  memoryEpisodicHints: string[];
}) {
  const promptForSelection = params.queryOverride || params.visiblePrompt || params.modelPrompt;
  const resetApplied = detectContextReset(promptForSelection);
  const continuationApplied =
    !resetApplied && detectContextContinuation(promptForSelection);
  const fallbackMemoryLines = params.memoryPrompt ? splitMemoryPrompt(params.memoryPrompt) : [];
  const memoryFragments =
    params.memoryFragments && params.memoryFragments.length > 0
      ? params.memoryFragments
      : fallbackMemoryLines.map((line, index) => ({
          id: `memory-${index}`,
          kind: "memory" as const,
          label: index === 0 ? "长期记忆摘要" : `长期记忆 ${index + 1}`,
          content: line,
          priority: Math.max(4, 9 - index),
          maxLength: 180,
          suppressOnReset: true,
        }));

  const selected = selectContextFragments({
    query: promptForSelection,
    maxLength: 2_400,
    resetMode: resetApplied ? "reset" : "normal",
    minScore: 2,
    fragments: [
      ...memoryFragments,
      params.conversationContext.olderSummary
        ? {
            id: "older-summary",
            kind: "history" as const,
            label: "更早对话摘要",
            content: params.conversationContext.olderSummary,
            priority: 5,
            maxLength: 720,
            suppressOnReset: true,
          }
        : null,
      params.conversationContext.latestAssistantArtifact
        ? {
            id: "latest-artifact",
            kind: "artifact" as const,
            label: "上一份重要产物摘要",
            content: params.conversationContext.latestAssistantArtifact,
            priority: 7,
            maxLength: 560,
            suppressOnReset: true,
          }
        : null,
      params.uploadedMaterialsSummary
        ? {
            id: "uploaded-materials",
            kind: "attachment" as const,
            label: "当前材料摘要",
            content: params.uploadedMaterialsSummary,
            priority: 12,
            maxLength: 1_000,
            sticky: true,
            suppressOnReset: false,
          }
        : null,
    ].filter(Boolean) as Array<{
      id: string;
      kind: "memory" | "history" | "artifact" | "attachment";
      label: string;
      content: string;
      priority: number;
      maxLength: number;
      sticky?: boolean;
      suppressOnReset: boolean;
    }>,
  });

  const instructionLines = [
    resetApplied
      ? "本轮输入被识别为新任务。除非教师明确引用上一轮内容，否则不要沿用旧记忆、旧对话和旧产物。"
      : "若长期记忆、旧对话、旧产物与本轮教师要求冲突，以本轮教师输入、当前材料和当前工具结果为准。",
    "只把当前步骤真正需要的上下文用于回答；信息不足时优先调用工具检索，不要用旧上下文补空白。",
  ];

  const formattedContext = selected.fragments.length
    ? formatContextFragments(selected.fragments)
    : "";
  const budgetedSystemContext = budgetPromptSections([
    {
      key: "instructions",
      text: instructionLines.join("\n"),
      weight: 2,
      minTokens: 140,
      maxTokens: 260,
    },
    {
      key: "context",
      text: formattedContext,
      weight: 6,
      minTokens: 220,
      preserveTail: true,
    },
  ], SYSTEM_CONTEXT_TOKEN_BUDGET);
  const systemContext = [
    budgetedSystemContext.instructions,
    budgetedSystemContext.context,
  ]
    .filter(Boolean)
    .join("\n\n");

  const retrievalHint = trimTextToApproxTokens(
    buildContextRetrievalQuery({
      query: promptForSelection,
      hints: [
        ...params.memorySemanticHints,
        ...params.memoryEpisodicHints,
        ...selected.fragments
          .filter((item) => item.kind !== "attachment")
          .map((item) => item.content),
      ],
      maxLength: 320,
      carryover: continuationApplied,
    }),
    RETRIEVAL_HINT_TOKEN_BUDGET,
    { preserveTail: true },
  );

  return {
    systemContext,
    retrievalHint,
    resetApplied,
    selectedLabels: selected.fragments.map((item) => item.label),
  } satisfies AgentRuntimeContextPack;
}

export type { AgentRuntimeContextPack };
