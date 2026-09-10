import { z } from "zod";
import {
  generateGatewayText,
  generateToolInputWithGateway,
  streamGatewayText,
} from "@/lib/ai/gateway";
import { getModelForTask } from "@/lib/ai/model-router";
import { generateStructuredObject } from "@/lib/ai/structured-output";
import { detectAssistantIntent } from "@/lib/assistant/intent-router";
import { buildAssistantContext } from "@/lib/assistant/context-builder";
import { appendConversationSummaryMemory } from "@/lib/assistant/supermemory";
import { resolveAgentPreflight } from "@/lib/agent/preflight";
import { selectConversationMessages } from "@/lib/context-engineering/core";
import { getTeacherMemoryByTeacherId, trackTeacherMemoryEvent } from "@/lib/teacher-memory/service";
import { resolveProfileKey } from "@/lib/agent/chat-shared";
import type {
  AssistantMessageInput,
  ChatResponse,
  ConversationSummaryExtraction,
} from "@/lib/assistant/types";

const threeLayerMemorySchema = z.object({
  summary: z.string(),
  proceduralMemory: z.array(z.string()),
  semanticMemory: z.array(z.string()),
  episodicMemory: z.array(z.string()),
  coreProfile: z
    .object({
      subjects: z.array(z.string()),
      teachingStyle: z.string(),
      notes: z.string(),
    })
    .optional(),
});

type ThreeLayerExtraction = z.infer<typeof threeLayerMemorySchema>;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("memory_extract_timeout")), ms);
    }),
  ]);
}

function buildAssistantSystemPrompt() {
  return [
    "你是 AP 课程教师智能助手。",
    "目标：高效、准确、可执行地帮助教师完成教案、习题、评分标准与资料整理。",
    "输出要求：",
    "1) 优先引用教师私有资料；信息不足时再结合联网结果。",
    "2) 明确给出结构化结果，段落短、要点清晰。",
    "3) 如果关键信息缺失，先提出最多 2 个关键追问。",
    "4) 不要编造来源；若无把握请标记“需教师确认”。",
    "5) 如果长期记忆、最近对话和当前问题存在冲突，以当前问题和当前检索到的资料为准。",
  ].join("\n");
}

function formatHistory(messages: AssistantMessageInput[], currentMessage: string) {
  const selected = selectConversationMessages({
    query: currentMessage,
    messages: messages
      .filter(
        (item): item is { role: "user" | "assistant"; content: string } =>
          item.role === "user" || item.role === "assistant",
      )
      .map((item) => ({
        role: item.role,
        content: item.content,
      })),
    maxMessages: 6,
    maxLength: 1_500,
  });

  return selected
    .map(
      (item) =>
        `${item.role === "user" ? "教师" : item.role === "assistant" ? "助手" : "系统"}: ${item.content}`,
    )
    .join("\n");
}

type PreparedAssistantReply = {
  intent: ChatResponse["intent"];
  sources: ChatResponse["sources"];
  contextBundle: ChatResponse["contextBundle"];
  systemPrompt: string;
  userPrompt: string;
  model: string;
  maxTokens: number;
  temperature: number;
  immediateAnswer?: string;
};

function buildAssistantUserPrompt(params: {
  message: string;
  history: AssistantMessageInput[];
  contextBundle: ChatResponse["contextBundle"];
}) {
  const formattedHistory = formatHistory(params.history, params.message);
  return [
    `教师问题：${params.message}`,
    formattedHistory ? `\n【最近对话】\n${formattedHistory}` : "",
    params.contextBundle.memoryContext ? `\n【长期记忆】\n${params.contextBundle.memoryContext}` : "",
    params.contextBundle.knowledgeContext ? `\n【教师私有资料】\n${params.contextBundle.knowledgeContext}` : "",
    params.contextBundle.webContext ? `\n【联网检索】\n${params.contextBundle.webContext}` : "",
    "\n请直接给出可执行答案，必要时附上“下一步建议”。",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function formatAssistantClarificationMessage(params: {
  summary: string;
  question: string;
  options: Array<{ label: string; value: string }>;
}) {
  return [
    params.summary.trim(),
    params.question.trim(),
    params.options.length > 0
      ? [
          "可直接回复其中一个选项：",
          ...params.options.map((option) => `- ${option.label}（${option.value}）`),
        ].join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function prepareAssistantReply(params: {
  teacherId: string;
  message: string;
  history: AssistantMessageInput[];
}): Promise<PreparedAssistantReply> {
  const intent = detectAssistantIntent(params.message);
  const shouldAttemptPreflight =
    intent.requiresFollowUp || intent.intent === "general_chat";
  const preflightResult = shouldAttemptPreflight
    ? await resolveAgentPreflight({
        message: params.message,
        attachments: null,
        answers: {},
        sessionDefaults: {},
        conversationContext: params.history
          .slice(-6)
          .map((item) => `${item.role}: ${item.content}`),
        locale: "zh",
      })
    : null;
  const effectiveMessage =
    preflightResult?.status === "ready"
      ? preflightResult.enrichedPrompt
      : params.message;
  const contextBundle =
    intent.requiresFollowUp || preflightResult?.status === "needs_info"
    ? {
        knowledgeContext: "",
        webContext: "",
        memoryContext: "",
        sources: [],
      }
    : await buildAssistantContext({
        teacherId: params.teacherId,
        query: effectiveMessage,
        useKnowledge: intent.useKnowledge,
        useWeb: intent.useWeb,
        history: params.history,
      });

  const systemPrompt = buildAssistantSystemPrompt();
  const userPrompt = buildAssistantUserPrompt({
    message: effectiveMessage,
    history: params.history,
    contextBundle,
  });

  return {
    intent,
    sources: contextBundle.sources,
    contextBundle,
    systemPrompt,
    userPrompt,
    model: getModelForTask("assistant_chat"),
    maxTokens: 5200,
    temperature: 0.3,
    immediateAnswer:
      preflightResult?.status === "needs_info"
        ? formatAssistantClarificationMessage({
            summary: preflightResult.summary,
            question: preflightResult.question.question,
            options: preflightResult.question.options.map((option) => ({
              label: option.label,
              value: option.value,
            })),
          })
        : intent.requiresFollowUp
          ? `在开始前我需要确认：\n- ${intent.followUpQuestions.join("\n- ")}`
          : undefined,
  };
}

export function startAssistantReplyStream(params: PreparedAssistantReply) {
  if (params.immediateAnswer) {
    return null;
  }

  return streamGatewayText({
    capability: "stream",
    model: params.model,
    system: params.systemPrompt,
    prompt: params.userPrompt,
    maxOutputTokens: params.maxTokens,
    temperature: params.temperature,
    maxRetries: 2,
  }).result;
}

export async function buildAssistantReply(params: {
  teacherId: string;
  message: string;
  history: AssistantMessageInput[];
}): Promise<ChatResponse> {
  const prepared = await prepareAssistantReply(params);

  if (prepared.immediateAnswer) {
    return {
      intent: prepared.intent,
      answer: prepared.immediateAnswer,
      sources: prepared.sources,
      contextBundle: prepared.contextBundle,
    };
  }

  let answer = "";
  const result = await generateGatewayText({
    capability: "text",
    model: prepared.model,
    system: prepared.systemPrompt,
    prompt: prepared.userPrompt,
    maxOutputTokens: prepared.maxTokens,
    temperature: prepared.temperature,
    maxRetries: 2,
  });
  answer = result.text ?? "";

  return {
    intent: prepared.intent,
    answer: answer.trim() || "我已完成分析，但没有生成有效文本，请重试。",
    sources: prepared.sources,
    contextBundle: prepared.contextBundle,
  };
}

export async function summarizeConversationMemory(params: {
  teacherId: string;
  conversationId: string;
  messages: AssistantMessageInput[];
}) {
  const transcript = params.messages
    .slice(-20)
    .map((item) => `${item.role}: ${item.content}`)
    .join("\n");

  if (!transcript.trim()) return;

  const model = getModelForTask("assistant_memory_extract");
  // 单次尝试超时 1.8s；两次尝试最坏 3.6s，但因本函数是 fire-and-forget 调用，不阻塞主流程
  const timeoutMs = 1800;

  const systemPrompt = [
    "你是对话记忆提取助手。只保留对未来多轮追问真正有价值的信息。",
    "请把记忆显式拆成三层：",
    "- proceduralMemory: 稳定偏好与做事习惯（如偏好结构化回答、喜欢用表格、每次要求分步骤）",
    "- semanticMemory: 稳定事实与长期知识锚点（如教授 AP Calculus BC、关注 Unit 5 链式法则）",
    "- episodicMemory: 最近任务与待跟进事项（如上次生成了链式法则教案、学生在求导方面薄弱）",
    "另外提取教师档案 coreProfile（仅在对话明确提及时提取，不要猜测）：",
    "- subjects: 教授的AP科目",
    "- teachingStyle: 教学风格偏好",
    "- notes: 其他身份备注",
    "不要记录寒暄，不要复制大段原文，不要编造不存在的事实。",
    "每层最多 6 条，每条不超过 50 字。",
  ].join("\n");

  const userPrompt = `请从以下教师对话中提取长期有价值信息：\n对话：\n${transcript}`;

  const asStrArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((s) => `${s}`.trim()).filter(Boolean) : [];

  let extraction: ThreeLayerExtraction | null = null;

  try {
    extraction = await withTimeout(
      generateStructuredObject({
        model,
        schema: threeLayerMemorySchema,
        systemPrompt,
        userPrompt,
        maxTokens: 2400,
        temperature: 0,
      }),
      timeoutMs,
    );
  } catch {
    try {
      const raw = await withTimeout(
        generateToolInputWithGateway<Partial<ThreeLayerExtraction>>({
          model,
          systemPrompt,
          userPrompt,
          tool: {
            name: "return_memory_extraction",
            description: "输出对话三层记忆提取结果",
            inputSchema: {
              type: "object",
              required: ["summary", "proceduralMemory", "semanticMemory", "episodicMemory"],
              properties: {
                summary: { type: "string" },
                proceduralMemory: { type: "array", items: { type: "string" } },
                semanticMemory: { type: "array", items: { type: "string" } },
                episodicMemory: { type: "array", items: { type: "string" } },
                coreProfile: {
                  type: "object",
                  properties: {
                    subjects: { type: "array", items: { type: "string" } },
                    teachingStyle: { type: "string" },
                    notes: { type: "string" },
                  },
                },
              },
            },
          },
          maxTokens: 2400,
        }).then((r) => r.input),
        timeoutMs,
      );

      extraction = {
        summary: `${raw.summary ?? ""}`.trim(),
        proceduralMemory: asStrArr(raw.proceduralMemory),
        semanticMemory: asStrArr(raw.semanticMemory),
        episodicMemory: asStrArr(raw.episodicMemory),
        coreProfile: raw.coreProfile
          ? {
              subjects: asStrArr(raw.coreProfile.subjects),
              teachingStyle: `${raw.coreProfile.teachingStyle ?? ""}`.trim(),
              notes: `${raw.coreProfile.notes ?? ""}`.trim(),
            }
          : undefined,
      };
    } catch {
      return;
    }
  }

  if (!extraction) return;

  const isEmpty =
    !extraction.summary &&
    extraction.proceduralMemory.length === 0 &&
    extraction.semanticMemory.length === 0 &&
    extraction.episodicMemory.length === 0;

  if (isEmpty) return;

  if (process.env.SUPERMEMORY_MIRROR === "1") {
    await appendConversationSummaryMemory({
      teacherId: params.teacherId,
      conversationId: params.conversationId,
      extraction: {
        summary: extraction.summary || "",
        preferences: extraction.proceduralMemory.slice(0, 4),
        progress: extraction.semanticMemory.slice(0, 4),
        weakPoints: extraction.episodicMemory.slice(0, 4),
      },
    }).catch(() => {});
  }

  // 写入本地 teacher_usage_memory（三层格式）
  try {
    const existing = await getTeacherMemoryByTeacherId({
      teacherId: params.teacherId,
      scope: "agent_workspace",
    }).catch(() => null);

    const profileKey = existing?.memory.profileKey ?? resolveProfileKey(undefined, params.teacherId);
    const payload: Record<string, unknown> = {
      proceduralMemory: extraction.proceduralMemory,
      semanticMemory: extraction.semanticMemory,
      episodicMemory: extraction.episodicMemory,
      conversationSummary: extraction.summary,
    };

    if (
      extraction.coreProfile &&
      (extraction.coreProfile.subjects.length > 0 ||
        extraction.coreProfile.teachingStyle ||
        extraction.coreProfile.notes)
    ) {
      payload.coreProfile = extraction.coreProfile;
    }

    await trackTeacherMemoryEvent({
      profileKey,
      scope: "agent_workspace",
      teacherId: params.teacherId,
      eventType: "assistant_memory_sync",
      payload,
    });
  } catch (error) {
    console.error(
      "[assistant-memory] 本地记忆写入失败:",
      error instanceof Error ? error.message : error,
    );
  }
}
