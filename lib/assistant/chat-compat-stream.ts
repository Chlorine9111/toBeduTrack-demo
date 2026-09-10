import { parseAgentStreamEvents } from "@/lib/api/ui-message-stream";
import type {
  AgentTriageRetrievalSource,
  AgentWorkflowId,
} from "@/lib/agent/triage/types";
import type { SourceReference } from "@/lib/assistant/types";

const FALLBACK_EMPTY_ANSWER = "我已完成分析，但没有生成有效文本，请重试。";
const STREAM_INTERRUPTED_SUFFIX = "对话生成失败，请稍后重试。";
const KNOWN_WORKFLOWS = new Set<AgentWorkflowId>([
  "general_chat",
  "retrieval",
  "lesson_plan",
  "exercises",
  "worksheet",
  "rubric",
  "pbl",
  "question_bank",
  "answer_key",
  "adapt_difficulty",
  "exit_ticket",
]);
const KNOWN_RETRIEVAL_SOURCES = new Set<AgentTriageRetrievalSource>([
  "none",
  "knowledge",
  "web",
  "mixed",
]);

function normalizeWorkflow(value: string): AgentWorkflowId {
  return KNOWN_WORKFLOWS.has(value as AgentWorkflowId)
    ? (value as AgentWorkflowId)
    : "general_chat";
}

function normalizeRetrievalSources(value: string): AgentTriageRetrievalSource {
  return KNOWN_RETRIEVAL_SOURCES.has(value as AgentTriageRetrievalSource)
    ? (value as AgentTriageRetrievalSource)
    : "none";
}

function mapAgentWorkflowToLegacyIntent(params: {
  workflow: AgentWorkflowId;
  retrievalSources: AgentTriageRetrievalSource;
}) {
  if (params.workflow === "lesson_plan") return "generate_lesson_plan";
  if (params.workflow === "rubric") return "generate_rubric";
  if (
    params.workflow === "exercises" ||
    params.workflow === "worksheet" ||
    params.workflow === "question_bank" ||
    params.workflow === "answer_key" ||
    params.workflow === "adapt_difficulty" ||
    params.workflow === "exit_ticket"
  ) {
    return "generate_exercises";
  }
  if (params.workflow === "retrieval") {
    return params.retrievalSources === "knowledge" ? "knowledge_qa" : "search_web";
  }
  if (params.retrievalSources === "knowledge") {
    return "knowledge_qa";
  }
  if (params.retrievalSources === "web") {
    return "search_web";
  }
  return "general_chat";
}

function buildLegacySources(
  retrievalSources: AgentTriageRetrievalSource,
): SourceReference[] {
  if (retrievalSources === "knowledge") {
    return [{ type: "knowledge", title: "教师资料检索" }];
  }
  if (retrievalSources === "web") {
    return [{ type: "web", title: "联网检索" }];
  }
  if (retrievalSources === "mixed") {
    return [
      { type: "knowledge", title: "教师资料检索" },
      { type: "web", title: "联网检索" },
    ];
  }
  return [];
}

export function createLegacyAssistantSseStream(params: {
  upstreamResponse: Response;
  fallbackConversationId?: string;
}) {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let conversationId = params.fallbackConversationId ?? "";
      let workflow: AgentWorkflowId = "general_chat";
      let retrievalSources: AgentTriageRetrievalSource = "none";
      let sources: SourceReference[] = [];
      let metaSent = false;
      let combinedAnswer = "";

      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      const ensureMeta = () => {
        if (metaSent) return;
        metaSent = true;
        send({
          type: "meta",
          conversationId,
          intent: mapAgentWorkflowToLegacyIntent({
            workflow,
            retrievalSources,
          }),
          sources,
        });
      };

      try {
        for await (const event of parseAgentStreamEvents(params.upstreamResponse)) {
          if (event.type === "meta") {
            if (event.conversationId) {
              conversationId = event.conversationId;
            }
            continue;
          }

          if (event.type === "decision") {
            workflow = normalizeWorkflow(event.workflow);
            retrievalSources = normalizeRetrievalSources(event.retrievalSources);
            sources = buildLegacySources(retrievalSources);
            continue;
          }

          if (event.type === "text-delta") {
            if (!event.text) continue;
            ensureMeta();
            combinedAnswer += event.text;
            send({
              type: "delta",
              content: event.text,
            });
            continue;
          }

          if (event.type === "error") {
            ensureMeta();
            const suffix = combinedAnswer.trim()
              ? "\n\n（回复生成中断，请重试）"
              : STREAM_INTERRUPTED_SUFFIX;
            combinedAnswer = `${combinedAnswer}${suffix}`.trim();
            send({
              type: "delta",
              content: suffix,
            });
          }
        }
      } catch (error) {
        console.error("旧聊天兼容流解析失败", error);
        ensureMeta();
        const suffix = combinedAnswer.trim()
          ? "\n\n（回复生成中断，请重试）"
          : STREAM_INTERRUPTED_SUFFIX;
        combinedAnswer = `${combinedAnswer}${suffix}`.trim();
        send({
          type: "delta",
          content: suffix,
        });
      }

      ensureMeta();
      if (!combinedAnswer.trim()) {
        send({
          type: "delta",
          content: FALLBACK_EMPTY_ANSWER,
        });
      }

      send({ type: "done" });
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}
