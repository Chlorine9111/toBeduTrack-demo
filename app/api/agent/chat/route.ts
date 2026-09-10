import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { Json } from "@/types/database";
import { z } from "zod";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  stepCountIs,
  type ModelMessage,
} from "ai";
import {
  addConversationMessage,
  createConversation,
  getConversation,
  listConversationMessages,
  summarizeConversationTitle,
  updateConversationTitle,
} from "@/lib/assistant/store";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { requireRouteActorAnyRole } from "@/lib/auth/require-role";
import { InvalidJsonBodyError } from "@/lib/api/request";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import type { AgentHandoffDataPart } from "@/lib/ai/ui-message";
import {
  buildAgentConversationContext,
} from "@/lib/agent/conversation-context";
import { resolveAgentPreflight } from "@/lib/agent/preflight";
import {
  createNdjsonStreamResponse,
  type AgentStreamLifecycleHooks,
} from "@/lib/agent/chat-stream";
import {
  buildUploadedMaterialConversationSources,
  buildConversationMessagesForModel,
  extractUploadedMaterialsWithOptions,
  getLatestAssistantMessage,
  getLatestUserMessage,
  parseAgentChatRequest,
  type StoredConversationMessage,
} from "@/lib/agent/chat-shared";
import { createAgentChatTools } from "@/lib/agent/chat-tools";
import {
  buildTaskAwareMaterialContext,
  buildTaskAwareMaterialPreview,
} from "@/lib/agent/material-context";
import {
  buildConversationOverviewTitle,
} from "@/lib/agent/chat-direct-routing";
import {
  parseIntentFromText,
} from "@/lib/chat/intent";
import {
  buildAgentSystemPrompt,
  summarizeUsage,
} from "@/lib/agent/chat-route-prompt";
import { resolveContentAssetReferences } from "@/lib/content-assets/reference-context";
import {
  acquireConcurrencySlot,
  buildConcurrencyLimitHeaders,
} from "@/lib/api/concurrency-limit";
import {
  buildQuotaExhaustedDetails,
  buildQuotaHeaders,
} from "@/lib/quota/headers";
import {
  checkQuotaAdmissionSafe,
  finalizeQuotaSpendSafe,
  resolveQuotaIdempotencyKey,
} from "@/lib/quota/service";
import {
  createWorkflowRun,
  finalizeWorkflowRun,
  recordWorkflowStep,
} from "@/lib/runtime/workflow-telemetry";
import { isFeatureEnabled } from "@/lib/runtime/feature-flags";
import { createServerTimingRecorder, withServerTiming } from "@/lib/api/server-timing";
import {
  evaluateWorkflowBudget,
  getWorkflowProfile,
  serializeWorkflowProfile,
} from "@/lib/runtime/workflow-profiles";
import {
  buildAgentTaskState,
  mergeAgentTaskStateWithContext,
  type AgentTaskState,
  type AgentToolName,
} from "@/lib/agent/task-state";
import {
  buildAgentToolLoopPlan,
  buildExecutionPlanWorkingNote,
  DOCUMENT_SEQUENCE_TOOL_NAMES,
  planAgentExecution,
  reconcileExecutionPlanWithRuntime,
  type AgentExecutionPlan,
} from "@/lib/agent/execution-plan";
import {
  resolveAgentTriageDecision,
} from "@/lib/agent/triage/engine";
import type { AgentTriageDecision } from "@/lib/agent/triage/types";
import {
  isAgentTriageClassifierEnabled,
  resolveAgentTriageClassifierFallback,
} from "@/lib/agent/triage/classifier";

export const maxDuration = 120;
const RECENT_CONVERSATION_MESSAGE_LIMIT = 8;
const CONTENT_ASSET_REFERENCE_CACHE_TTL_MS = 2 * 60 * 1000;
const UNSUPPORTED_SCAN_REQUEST_PATTERN =
  /(拆题|拆解题目|拆分题目|提取题目|识别题目|扫描试卷|扫描题目|scan\s*(pdf|paper|exam)?|split\s+questions?|extract\s+questions?|ocr)/i;
const UNSUPPORTED_SCAN_COMBO_PATTERN =
  /(拆解|拆分|提取|识别|扫描).*(pdf|试卷|题目|试题)|(?:pdf|试卷|题目|试题).*(拆解|拆分|提取|识别|扫描)/i;

function isUnsupportedAgentScanRequest(prompt: string) {
  return (
    UNSUPPORTED_SCAN_REQUEST_PATTERN.test(prompt) ||
    UNSUPPORTED_SCAN_COMBO_PATTERN.test(prompt)
  );
}

type ResolvedContentAssetReferences = Awaited<
  ReturnType<typeof resolveContentAssetReferences>
>;

type AgentHandoffMode = AgentHandoffDataPart["promptMode"];

function toAgentRunMode(mode: AgentExecutionPlan["mode"]): AgentHandoffMode {
  return mode === "document_artifact"
    ? "document_artifact"
    : mode === "retrieval_then_document"
      ? "retrieval_then_document"
      : mode === "retrieval_only"
        ? "retrieval_only"
        : "chat_answer";
}

const contentAssetReferenceCache = new Map<
  string,
  {
    expiresAt: number;
    value: ResolvedContentAssetReferences;
  }
>();

function normalizeContentAssetReferenceCacheKey(params: {
  teacherId: string;
  assetIds: string[];
  userQuery: string;
}) {
  const normalizedQuery = params.userQuery.trim().toLowerCase().replace(/\s+/g, " ");
  const normalizedAssetIds = [...params.assetIds].sort().join(",");
  return `${params.teacherId}::${normalizedAssetIds}::${normalizedQuery}`;
}

async function resolveCachedContentAssetReferences(params: {
  supabase: Parameters<typeof resolveContentAssetReferences>[0]["supabase"];
  teacherId: string;
  assetIds: string[];
  userQuery: string;
}) {
  if (params.assetIds.length === 0) {
    return {
      materials: [],
      sources: [],
      warnings: [],
    } as ResolvedContentAssetReferences;
  }

  const now = Date.now();
  for (const [key, entry] of contentAssetReferenceCache.entries()) {
    if (entry.expiresAt <= now) {
      contentAssetReferenceCache.delete(key);
    }
  }

  const cacheKey = normalizeContentAssetReferenceCacheKey(params);
  const cached = contentAssetReferenceCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const resolved = await resolveContentAssetReferences({
    supabase: params.supabase,
    teacherId: params.teacherId,
    assetIds: params.assetIds,
    userQuery: params.userQuery,
  });
  contentAssetReferenceCache.set(cacheKey, {
    expiresAt: now + CONTENT_ASSET_REFERENCE_CACHE_TTL_MS,
    value: resolved,
  });
  return resolved;
}

function createStaticAgentTextResponse(params: {
  conversationId: string;
  text: string;
  headers?: HeadersInit;
}) {
  const stream = createUIMessageStream({
    onError: (error) =>
      error instanceof Error ? error.message : "Agent 流式输出失败",
    execute: ({ writer }) => {
      const textId = `assistant-text-${randomUUID()}`;
      writer.write({
        type: "data-agent-meta",
        data: {
          startedAt: Date.now(),
          conversationId: params.conversationId,
        },
      });
      writer.write({ type: "text-start", id: textId });
      writer.write({ type: "text-delta", id: textId, delta: params.text });
      writer.write({ type: "text-end", id: textId });
      writer.write({
        type: "data-agent-finish",
        data: {
          totalMs: 0,
          finishReason: "stop",
        },
      });
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: {
      "Cache-Control": "no-cache, no-transform",
      ...(params.headers ?? {}),
    },
  });
}

function formatPreflightClarificationMessage(params: {
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

function resolveUploadedMaterialExtractionOptions(taskState: AgentTaskState) {
  if (taskState.kind === "lesson_plan" || taskState.kind === "rubric") {
    return { pdfImagePageLimit: 6 };
  }
  if (taskState.kind === "research" || taskState.kind === "summary") {
    return { pdfImagePageLimit: 4 };
  }
  if (taskState.kind === "exercise" || taskState.kind === "pbl") {
    return { pdfImagePageLimit: 10 };
  }
  return { pdfImagePageLimit: 6 };
}

function inferLastArtifactTypeFromAssistantReply(text: string) {
  if (!text) return "";
  if (/评分标准|rubric/i.test(text)) return "rubric";
  if (/lesson\s*plan|教案|教学设计|课堂流程/i.test(text)) return "lesson_plan";
  if (/worksheet|讲义|学习单|guided notes|activity sheet/i.test(text)) {
    return "worksheet";
  }
  if (/exam|试卷|题单|选择题|FRQ|练习题/i.test(text)) return "exam";
  if (/pbl|项目式学习|project\s*-?\s*based/i.test(text)) return "pbl";
  return "";
}

function shouldCarryRecentConversation(prompt: string) {
  return /刚才|上面|上一版|继续|再|改成|简化|重写|基于刚才|沿用|continue|rewrite|revise|shorter|expand/i.test(
    prompt,
  );
}

function shouldLoadRecentConversationHistory(params: {
  conversationId?: string | null;
  prompt: string;
  attachedMaterialCount: number;
}) {
  if (!params.conversationId) {
    return false;
  }

  if (shouldCarryRecentConversation(params.prompt)) {
    return true;
  }

  // 当前轮没有重新挂资料时，仍需要从最近会话里恢复上一轮材料与上下文。
  if (params.attachedMaterialCount === 0) {
    return true;
  }

  return false;
}

function buildSelectedReferenceQaSystemPrompt(params: {
  materialContextText: string;
}) {
  return [
    "你是教师资料助手。",
    "当前任务是基于教师显式选定并已完成索引的资料直接回答，不调用工具，不创建右侧 Canvas，不要输出 HTML。",
    "只允许依据【当前材料】和当前会话最近消息作答；如果材料不足，直接说明“当前资料未覆盖这部分内容”。",
    "优先直接回答，再补 1-2 个最关键证据点；用简体中文；不要让老师重新上传资料。",
    "如果是在做总结/提取/解释/翻译，必须紧扣材料正文，不要泛泛而谈。",
    "",
    params.materialContextText
      ? `【当前材料】\n${params.materialContextText}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function POST(request: Request) {
  const serverTiming = createServerTimingRecorder();
  const routeStartedAt = performance.now();
  let releaseConcurrency: (() => void) | null = null;
  let workflowRunId: string | undefined;
  let workflowFinalized = false;
  let firstVisibleRecorded = false;

  const respond = (response: Response, description = "响应就绪") => {
    serverTiming.measure("response_ready", routeStartedAt, description);
    return withServerTiming(response, serverTiming);
  };

  try {
    const access = await requireRouteActorAnyRole(["subject_teacher", "admin"], {
      nextPath: "/main/agent",
    });
    if (access.response) {
      return respond(access.response, "角色鉴权失败");
    }

    const teacherContext = await getTeacherContext();
    if (!teacherContext.teacherId) {
      return respond(jsonError(
        "UNAUTHORIZED",
        teacherContext.errorMessage ??
          (teacherContext.authBypass ? "未找到可用教师账号" : "未授权访问"),
        teacherContext.errorStatus ?? (teacherContext.authBypass ? 400 : 401),
      ), "鉴权失败");
    }
    const { supabase, teacherId } = teacherContext;

    const { body, files } = await parseAgentChatRequest(request);
    const latestUserPrompt = (
      body.message?.trim() || getLatestUserMessage(body.messages ?? [])
    ).trim();
    const displayUserPrompt = (
      body.displayMessage?.trim() || latestUserPrompt
    ).trim();
    const clientAssistantPrompt = getLatestAssistantMessage(
      body.messages ?? [],
    );

    if (!latestUserPrompt) {
      return respond(jsonError("VALIDATION_ERROR", "缺少有效提问内容", 400), "参数校验失败");
    }

    const quotaAdmission = await checkQuotaAdmissionSafe(supabase, {
      teacherId,
      action: "agent_chat",
    });
    if (quotaAdmission && !quotaAdmission.allowed) {
      return respond(jsonError(
        "QUOTA_EXHAUSTED",
        "当前测试期使用量已达上限，请等待下个周期重置后继续。",
        403,
        buildQuotaExhaustedDetails(quotaAdmission),
        buildQuotaHeaders(quotaAdmission, { snapshot: "admission" }),
      ), "额度校验失败");
    }
    const quotaIdempotencyKey = resolveQuotaIdempotencyKey(
      request,
      `agent-chat:${teacherId}`,
    );

    const latestParsedIntent = parseIntentFromText(
      displayUserPrompt || latestUserPrompt,
    );
    const unsupportedScanRequest = isUnsupportedAgentScanRequest(
      displayUserPrompt || latestUserPrompt,
    );
    const shouldAttemptPromptPreflight =
      !body.taskContext &&
      !unsupportedScanRequest &&
      latestParsedIntent.actions.length === 0;
    const promptPreflightPromise = shouldAttemptPromptPreflight
      ? resolveAgentPreflight({
          message: displayUserPrompt || latestUserPrompt,
          attachments: files.length > 0
            ? {
                fileCount: files.length,
                totalQuestions: 0,
                archivedQuestionCount: 0,
                materialFileCount: files.length,
                questionFileCount: 0,
                hasFigures: false,
                hasTables: false,
                fileNames: files.map((file) => file.name || "上传材料"),
                contentKinds: Array.from({ length: files.length }, () => "material" as const),
              }
            : null,
          answers: {},
          sessionDefaults: {},
          conversationContext: (body.messages ?? [])
            .slice(-6)
            .map((message) => `${message.role}: ${message.content}`),
          locale: "zh",
        })
      : Promise.resolve(null);
    const existingConversationPromise = body.conversationId
      ? getConversation(supabase, teacherId, body.conversationId)
      : Promise.resolve(null);
    const [existingConversation, promptPreflightResult] = await Promise.all([
      existingConversationPromise,
      promptPreflightPromise,
    ]);

    const conversationStartedAt = performance.now();
    let conversation = existingConversation;
    if (!conversation && body.conversationId) {
      return respond(jsonError("NOT_FOUND", "对话不存在", 404), "对话不存在");
    }
    if (!conversation) {
      conversation = await createConversation(
        supabase,
        teacherId,
        summarizeConversationTitle(displayUserPrompt || latestUserPrompt),
      );
    }
    serverTiming.measure("conversation", conversationStartedAt, "对话载入");
    let activeConversation = conversation;
    if (!activeConversation) {
      throw new Error("对话初始化失败");
    }

    if (promptPreflightResult?.status === "needs_info") {
      const clarificationMessage = formatPreflightClarificationMessage({
        summary: promptPreflightResult.summary,
        question: promptPreflightResult.question.question,
        options: promptPreflightResult.question.options.map((option) => ({
          label: option.label,
          value: option.value,
        })),
      });

      await addConversationMessage(supabase, {
        teacherId,
        conversationId: activeConversation.id,
        role: "user",
        content: displayUserPrompt,
      });
      await addConversationMessage(supabase, {
        teacherId,
        conversationId: activeConversation.id,
        role: "assistant",
        content: clarificationMessage,
      });

      serverTiming.mark("route_mode", 0, "mode:clarify");
      return respond(
        createStaticAgentTextResponse({
          conversationId: activeConversation.id,
          text: clarificationMessage,
          headers: buildQuotaHeaders(quotaAdmission, { snapshot: "admission" }),
        }),
        "低置信追问提示就绪",
      );
    }

    if (unsupportedScanRequest) {
      const unsupportedMessage =
        "拆题 / 扫描 PDF 功能已迁出当前 Agent 页面。这里现在只保留资料上传、问答，以及 Worksheet、Rubric、Lesson Plan、Exam 等文档生成；如果你要做拆题，请改用新的拆题页面。";

      await addConversationMessage(supabase, {
        teacherId,
        conversationId: activeConversation.id,
        role: "user",
        content: displayUserPrompt,
      });
      await addConversationMessage(supabase, {
        teacherId,
        conversationId: activeConversation.id,
        role: "assistant",
        content: unsupportedMessage,
      });

      serverTiming.mark("route_mode", 0, "mode:unsupported_scan");
      return respond(
        createStaticAgentTextResponse({
          conversationId: activeConversation.id,
          text: unsupportedMessage,
          headers: buildQuotaHeaders(quotaAdmission, { snapshot: "admission" }),
        }),
        "拆题迁移提示就绪",
      );
    }

    let effectiveRequestTaskContext =
      body.taskContext ??
      (promptPreflightResult?.status === "ready"
        ? promptPreflightResult.taskContext
        : undefined);
    let triageSourceOverride: AgentTriageDecision["source"] | undefined =
      promptPreflightResult?.status === "ready" && !body.taskContext
        ? "structured_classifier"
        : undefined;
    const triageExtraReasonCodes: string[] =
      promptPreflightResult?.status === "ready" && !body.taskContext
        ? ["preflight:ready"]
        : [];

    const promptTaskState = buildAgentTaskState({
      visiblePrompt: displayUserPrompt || latestUserPrompt,
      latestPrompt: latestUserPrompt,
      lastArtifactType: "",
      hasUploadedMaterials:
        files.length > 0 ||
        (body.contentAssetIds?.length ?? 0) > 0,
    });
    let initialTriageDecision = resolveAgentTriageDecision({
      promptTaskState,
      contextualTaskState: mergeAgentTaskStateWithContext(
        promptTaskState,
        effectiveRequestTaskContext,
      ),
      taskContext: effectiveRequestTaskContext,
      parsedIntent: latestParsedIntent,
      visiblePrompt: displayUserPrompt || latestUserPrompt,
      sourceOverride: triageSourceOverride,
      extraReasonCodes: triageExtraReasonCodes,
    });
    const classifierFallbackEnabled =
      isAgentTriageClassifierEnabled() &&
      (await isFeatureEnabled("agent.triage.classifier_fallback", true));
    const shouldAttemptClassifierFallback =
      classifierFallbackEnabled &&
      !body.taskContext &&
      !effectiveRequestTaskContext &&
      !unsupportedScanRequest &&
      initialTriageDecision.workflow === "general_chat" &&
      initialTriageDecision.confidence === "medium" &&
      initialTriageDecision.forcedToolChoice == null &&
      initialTriageDecision.preferredTools.length === 0;

    if (shouldAttemptClassifierFallback) {
      const classifierStartedAt = performance.now();
      const classifierResult = await resolveAgentTriageClassifierFallback({
        message: displayUserPrompt || latestUserPrompt,
        conversationContext: (body.messages ?? [])
          .slice(-6)
          .map((message) => `${message.role}: ${message.content}`),
        hasAttachments:
          files.length > 0 ||
          (body.contentAssetIds?.length ?? 0) > 0,
      });
      if (
        classifierResult.reasonCode &&
        !triageExtraReasonCodes.includes(classifierResult.reasonCode)
      ) {
        triageExtraReasonCodes.push(classifierResult.reasonCode);
      }
      if (classifierResult.applied && classifierResult.taskContext) {
        effectiveRequestTaskContext = classifierResult.taskContext;
        triageSourceOverride = "structured_classifier";
      }
      initialTriageDecision = resolveAgentTriageDecision({
        promptTaskState,
        contextualTaskState: mergeAgentTaskStateWithContext(
          promptTaskState,
          effectiveRequestTaskContext,
        ),
        taskContext: effectiveRequestTaskContext,
        parsedIntent: latestParsedIntent,
        visiblePrompt: displayUserPrompt || latestUserPrompt,
        sourceOverride: triageSourceOverride,
        extraReasonCodes: triageExtraReasonCodes,
      });
      serverTiming.measure(
        "triage_classifier",
        classifierStartedAt,
        classifierResult.applied
          ? "classifier_fallback_applied"
          : "classifier_fallback_skipped",
      );
    }

    const promptOnlyExecutionPlanPromise = planAgentExecution({
      visiblePrompt: displayUserPrompt || latestUserPrompt,
      promptTaskState: initialTriageDecision.taskState,
      parsedIntent: latestParsedIntent,
      taskContext: initialTriageDecision.taskContext,
      forcedToolChoice: initialTriageDecision.forcedToolChoice,
      preferredTools: initialTriageDecision.preferredTools,
      hasSelectedReferenceMaterials: (body.contentAssetIds?.length ?? 0) > 0,
      hasInlineUploads: files.length > 0,
    });

    const agentChatProfile = getWorkflowProfile("agent_chat");
    const concurrencyLease = acquireConcurrencySlot({
      key: agentChatProfile.name,
      identifier: teacherId,
      limit: agentChatProfile.concurrency?.maxInFlight ?? 2,
    });
    if (!concurrencyLease.allowed) {
      return respond(jsonError(
        "RATE_LIMITED",
        "当前进行中的 Agent 任务过多，请等待已有任务完成后再试。",
        429,
        {
          workflow: agentChatProfile.name,
          active: concurrencyLease.active,
          limit: concurrencyLease.limit,
        },
        buildConcurrencyLimitHeaders({
          active: concurrencyLease.active,
          limit: concurrencyLease.limit,
        }),
      ), "并发限制命中");
    }
    releaseConcurrency = concurrencyLease.release;

    const workflowRequestId = randomUUID();
    const workflowRunKey = randomUUID();
    let workflowRunPromise: Promise<string> | null = null;
    const ensureWorkflowRun = async () => {
      if (workflowRunId) {
        return workflowRunId;
      }
      if (!workflowRunPromise) {
        workflowRunPromise = createWorkflowRun({
          id: workflowRunKey,
          workflow: agentChatProfile.name,
          requestId: workflowRequestId,
          teacherId,
          conversationId: activeConversation.id,
          status: "running",
          metadata: {
            route: "/api/agent/chat",
            profile: serializeWorkflowProfile(agentChatProfile),
          },
        }).then((runId) => {
          workflowRunId = runId;
          return runId;
        });
      }
      return workflowRunPromise;
    };

    const finalizeAgentChatWorkflow = async (params: {
      status: "completed" | "failed";
      stepStatus: "completed" | "failed";
      mode: "direct" | "llm";
      totalMs: number;
      ttftMs: number | null;
      firstVisibleEvent: string | null;
      finishReason?: string;
      toolNames?: string[];
      message?: string;
      usage?: Record<string, unknown>;
      provider?: string | null;
      model?: string | null;
    }) => {
      if (workflowFinalized) return;
      workflowFinalized = true;
      const runId = await ensureWorkflowRun();
      const usageSummary = summarizeUsage(params.usage);
      const budget = evaluateWorkflowBudget(agentChatProfile, {
        totalMs: params.totalMs,
        ttftMs: params.ttftMs,
      });
      await recordWorkflowStep({
        runId,
        workflow: agentChatProfile.name,
        step: "stream_complete",
        status: params.stepStatus,
        provider: params.provider ?? null,
        model: params.model ?? null,
        durationMs: params.totalMs,
        ttftMs: params.ttftMs,
        inputTokens: usageSummary?.inputTokens ?? null,
        outputTokens: usageSummary?.outputTokens ?? null,
        cacheHit: usageSummary?.cacheHit ?? false,
        errorMessage: params.message ?? null,
        metadata: {
          mode: params.mode,
          toolNames: params.toolNames ?? [],
          finishReason: params.finishReason ?? null,
          firstVisibleEvent: params.firstVisibleEvent,
          budget,
        },
      });
      await finalizeWorkflowRun({
        runId,
        status: params.status,
        metadata: {
          mode: params.mode,
          finishReason: params.finishReason ?? null,
          firstVisibleEvent: params.firstVisibleEvent,
          toolCount: params.toolNames?.length ?? 0,
          provider: params.provider ?? null,
          model: params.model ?? null,
          budget,
        },
      });
      releaseConcurrency?.();
      releaseConcurrency = null;
    };

    const createStreamHooks = (params: {
      mode: "direct" | "llm";
      provider?: string | null;
      model?: string | null;
    }): AgentStreamLifecycleHooks => ({
      onFirstVisible: async ({ eventType, ttftMs }) => {
        if (firstVisibleRecorded) return;
        firstVisibleRecorded = true;
        const runId = await ensureWorkflowRun();
        const budget = evaluateWorkflowBudget(agentChatProfile, {
          ttftMs,
        });
        await recordWorkflowStep({
          runId,
          workflow: agentChatProfile.name,
          step: "stream_first_visible",
          status: "completed",
          provider: params.provider ?? null,
          model: params.model ?? null,
          durationMs: ttftMs,
          ttftMs,
          metadata: {
            mode: params.mode,
            firstVisibleEvent: eventType,
            budget,
          },
        });
      },
      onFinish: async ({
        totalMs,
        ttftMs,
        firstVisibleEvent,
        finishReason,
        toolNames,
        usage,
      }) => {
        await finalizeAgentChatWorkflow({
          status: "completed",
          stepStatus: "completed",
          mode: params.mode,
          totalMs,
          ttftMs,
          firstVisibleEvent,
          finishReason,
          toolNames,
          usage,
          provider: params.provider,
          model: params.model,
        });
        await finalizeQuotaSpendSafe(supabase, {
          teacherId,
          action: "agent_chat",
          idempotencyKey: quotaIdempotencyKey,
          metadata: {
            route: "/api/agent/chat",
            mode: params.mode,
            conversationId: activeConversation.id,
            toolNames,
            finishReason: finishReason ?? null,
          },
        });
      },
      onError: async ({
        totalMs,
        ttftMs,
        firstVisibleEvent,
        finishReason,
        toolNames,
        message,
      }) => {
        await finalizeAgentChatWorkflow({
          status: "failed",
          stepStatus: "failed",
          mode: params.mode,
          totalMs,
          ttftMs,
          firstVisibleEvent,
          finishReason,
          toolNames,
          message,
          provider: params.provider,
          model: params.model,
        });
      },
    });

    const hasSelectedReferenceMaterials =
      (body.contentAssetIds?.length ?? 0) > 0;
    const promptOnlyExecutionPlan = await promptOnlyExecutionPlanPromise;
    const promptOnlyTaskState = initialTriageDecision.taskState;
    const promptOnlyPreferredTools = promptOnlyExecutionPlan.preferredTools;
    const promptOnlyRequestMode = promptOnlyExecutionPlan.mode;
    const promptOnlyWorkingNote = buildExecutionPlanWorkingNote(
      promptOnlyExecutionPlan,
    );
    const promptOnlySelectedReferenceQaFastPath =
      promptOnlyExecutionPlan.useSelectedReferenceQaFastPath &&
      promptOnlyPreferredTools.length === 0;
    serverTiming.mark(
      "route_mode",
      0,
      promptOnlySelectedReferenceQaFastPath
        ? `mode:${promptOnlyRequestMode},fast:selected_reference_qa`
        : `mode:${promptOnlyRequestMode}`,
    );
    {
      const runId = await ensureWorkflowRun();
      await recordWorkflowStep({
        runId,
        workflow: agentChatProfile.name,
        step: "triage_prompt",
        status: "completed",
        durationMs: 0,
        metadata: {
          workflowId: initialTriageDecision.workflow,
          workflowLabel: initialTriageDecision.workflowLabel,
          confidence: initialTriageDecision.confidence,
          source: initialTriageDecision.source,
          continuationMode: initialTriageDecision.continuationMode,
          retrievalSources: initialTriageDecision.retrievalSources,
          artifactIntent: initialTriageDecision.artifactIntent,
          forcedToolChoice: initialTriageDecision.forcedToolChoice,
          preferredTools: initialTriageDecision.preferredTools,
          reasonCodes: initialTriageDecision.reasonCodes,
          requestMode: promptOnlyRequestMode,
        },
      });
    }

    type PreparedChatRuntime = {
      uploaded: Awaited<ReturnType<typeof extractUploadedMaterialsWithOptions>>;
      contentAssetResult: ResolvedContentAssetReferences;
      attachedMaterials: Awaited<
        ReturnType<typeof extractUploadedMaterialsWithOptions>
      >["materials"];
      attachedWarnings: string[];
      previousMessages: StoredConversationMessage[];
      conversationContext: ReturnType<typeof buildAgentConversationContext>;
      latestAssistantPrompt: string;
      triageDecision: AgentTriageDecision;
      taskState: AgentTaskState;
      effectiveTaskContext: typeof effectiveRequestTaskContext;
      forcedToolChoice: AgentTriageDecision["forcedToolChoice"];
      preferredTools: AgentTriageDecision["preferredTools"];
      allowedTools: AgentTriageDecision["allowedTools"];
      requestMode: AgentExecutionPlan["mode"];
      useSelectedReferenceQaFastPath: boolean;
      materialTaskKind: Parameters<typeof buildTaskAwareMaterialPreview>[0]["taskKind"];
      uploadedMaterialSummary: string;
      uploadedMaterialSources: Array<Record<string, unknown>>;
      runtimeContextText: string;
      hasMaterialsInHistory: boolean;
      executionPlan: AgentExecutionPlan;
    };

    const shouldLoadRecentHistory = shouldLoadRecentConversationHistory({
      conversationId: body.conversationId,
      prompt: displayUserPrompt || latestUserPrompt,
      attachedMaterialCount: files.length + (body.contentAssetIds?.length ?? 0),
    });

    let userMessagePersistPromise: Promise<unknown> | null = null;
    let preparedChatRuntimePromise: Promise<PreparedChatRuntime> | null = null;

    const awaitUserMessagePersist = async () => {
      if (!userMessagePersistPromise) return;
      try {
        await userMessagePersistPromise;
      } catch (error) {
        console.error("用户消息持久化失败", error);
      }
    };

    const prepareChatRuntime = async (): Promise<PreparedChatRuntime> => {
      if (preparedChatRuntimePromise) {
        return preparedChatRuntimePromise;
      }

      preparedChatRuntimePromise = (async () => {
        const materialsStartedAt = performance.now();
        const [uploaded, contentAssetResult] = await Promise.all([
          extractUploadedMaterialsWithOptions(
            files,
            resolveUploadedMaterialExtractionOptions(promptOnlyTaskState),
          ),
          resolveCachedContentAssetReferences({
            supabase,
            teacherId,
            assetIds: body.contentAssetIds ?? [],
            userQuery: latestUserPrompt,
          }),
        ]);
        serverTiming.measure("materials", materialsStartedAt, "材料准备");

        const attachedMaterials = [
          ...uploaded.materials,
          ...contentAssetResult.materials,
        ];
        const attachedWarnings = [
          ...uploaded.warnings,
          ...contentAssetResult.warnings,
        ];

        const contextSetupStartedAt = performance.now();
        const previousRows = shouldLoadRecentHistory
          ? await listConversationMessages(
              supabase,
              teacherId,
              activeConversation.id,
              {
                limit: RECENT_CONVERSATION_MESSAGE_LIMIT,
              },
            )
          : [];
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
          conversationContext.latestAssistantReply || clientAssistantPrompt;
        const lastArtifactType = inferLastArtifactTypeFromAssistantReply(
          conversationContext.latestAssistantReply,
        );
        const contextualPromptTaskState = buildAgentTaskState({
          visiblePrompt: displayUserPrompt || latestUserPrompt,
          latestPrompt: latestUserPrompt,
          lastArtifactType,
          hasUploadedMaterials:
            files.length > 0 ||
            (body.contentAssetIds?.length ?? 0) > 0,
        });
        const runtimeTriageDecision = resolveAgentTriageDecision({
          promptTaskState: contextualPromptTaskState,
          contextualTaskState: mergeAgentTaskStateWithContext(
            contextualPromptTaskState,
            effectiveRequestTaskContext,
          ),
          taskContext: effectiveRequestTaskContext,
          parsedIntent: latestParsedIntent,
          visiblePrompt: displayUserPrompt || latestUserPrompt,
          sourceOverride: triageSourceOverride,
          extraReasonCodes: triageExtraReasonCodes,
        });
        const taskState = runtimeTriageDecision.taskState;
        const effectiveTaskContext = runtimeTriageDecision.taskContext;
        const executionPlan = reconcileExecutionPlanWithRuntime({
          promptPlan: promptOnlyExecutionPlan,
          runtimeTaskState: taskState,
          runtimeForcedToolChoice: runtimeTriageDecision.forcedToolChoice,
          runtimePreferredTools: runtimeTriageDecision.preferredTools,
          visiblePrompt: displayUserPrompt || latestUserPrompt,
          hasSelectedReferenceMaterials,
          hasInlineUploads: files.length > 0,
        });
        const forcedToolChoice = executionPlan.forcedToolChoice;
        const preferredTools = executionPlan.preferredTools;
        const requestMode = executionPlan.mode;
        const triageChanged =
          runtimeTriageDecision.workflow !== initialTriageDecision.workflow ||
          runtimeTriageDecision.continuationMode !== initialTriageDecision.continuationMode ||
          runtimeTriageDecision.forcedToolChoice !== initialTriageDecision.forcedToolChoice ||
          runtimeTriageDecision.preferredTools.join(",") !==
            initialTriageDecision.preferredTools.join(",");
        {
          const runId = await ensureWorkflowRun();
          await recordWorkflowStep({
            runId,
            workflow: agentChatProfile.name,
            step: triageChanged ? "triage_runtime_override" : "triage_runtime",
            status: "completed",
            durationMs: 0,
            metadata: {
              workflowId: runtimeTriageDecision.workflow,
              workflowLabel: runtimeTriageDecision.workflowLabel,
              confidence: runtimeTriageDecision.confidence,
              source: runtimeTriageDecision.source,
              continuationMode: runtimeTriageDecision.continuationMode,
              retrievalSources: runtimeTriageDecision.retrievalSources,
              artifactIntent: runtimeTriageDecision.artifactIntent,
              forcedToolChoice: runtimeTriageDecision.forcedToolChoice,
              preferredTools: runtimeTriageDecision.preferredTools,
              allowedTools: runtimeTriageDecision.allowedTools,
              reasonCodes: runtimeTriageDecision.reasonCodes,
              requestMode,
              changedFromPrompt: triageChanged,
              promptWorkflowId: initialTriageDecision.workflow,
            },
          });
        }
        const useSelectedReferenceQaFastPath =
          executionPlan.useSelectedReferenceQaFastPath &&
          preferredTools.length === 0;
        const materialTaskKind =
          taskState.kind === "organize" ? "general" : taskState.kind;
        const uploadedMaterialSummary = buildTaskAwareMaterialPreview({
          materials: attachedMaterials,
          taskKind: materialTaskKind,
          query: displayUserPrompt || latestUserPrompt,
        });
        const uploadedMaterialSources = buildUploadedMaterialConversationSources({
          materials: attachedMaterials,
          summary: uploadedMaterialSummary,
        }) as Array<Record<string, unknown>>;
        const runtimeContextText = uploadedMaterialSummary
          ? `当前资料摘要：\n${uploadedMaterialSummary}`
          : "";
        const userMessageSources = [
          ...(uploaded.materials.length > 0 ? uploadedMaterialSources : []),
          ...contentAssetResult.sources,
        ];

        if (!userMessagePersistPromise) {
          userMessagePersistPromise = addConversationMessage(supabase, {
            teacherId,
            conversationId: activeConversation.id,
            role: "user",
            content: displayUserPrompt,
            sources: userMessageSources.length > 0
              ? (userMessageSources as unknown as Json)
              : undefined,
          });
        }

        const nextConversationTitle = buildConversationOverviewTitle({
          currentTitle: activeConversation.title,
          displayPrompt: displayUserPrompt,
          latestPrompt: latestUserPrompt,
          uploadedFileNames: uploaded.materials.map((item) => item.fileName),
        });
        if (nextConversationTitle && nextConversationTitle !== activeConversation.title) {
          void updateConversationTitle(
            supabase,
            teacherId,
            activeConversation.id,
            nextConversationTitle,
          )
            .then((normalizedTitle) => {
              activeConversation = {
                ...activeConversation,
                title: normalizedTitle,
              };
            })
            .catch((error) => {
              console.error("更新对话标题失败", error);
            });
        }

        const hasMaterialsInHistory = previousMessages.some(
          (msg) => Array.isArray(msg.sources) && msg.sources.some(
            (source: unknown) => source && typeof source === "object" && (
              (source as Record<string, unknown>).kind === "uploaded_materials" ||
              (source as Record<string, unknown>).kind === "content_library_references"
            ),
          ),
        );

        serverTiming.measure("context_setup", contextSetupStartedAt, "当前会话上下文");

        return {
          uploaded,
          contentAssetResult,
          attachedMaterials,
          attachedWarnings,
          previousMessages,
          conversationContext,
          latestAssistantPrompt,
          triageDecision: runtimeTriageDecision,
          taskState,
          effectiveTaskContext,
          forcedToolChoice,
          preferredTools,
          allowedTools: runtimeTriageDecision.allowedTools,
          requestMode,
          useSelectedReferenceQaFastPath,
          materialTaskKind,
          uploadedMaterialSummary,
          uploadedMaterialSources,
          runtimeContextText,
          hasMaterialsInHistory,
          executionPlan,
        };
      })();

      return preparedChatRuntimePromise;
    };

    const resolvedAgentModel = getResolvedLanguageModelForTask("assistant_chat");
    const buildPromptRuntimeHandoff = (
      runtime: PreparedChatRuntime,
    ): Omit<AgentHandoffDataPart, "at"> => {
      const promptMode = toAgentRunMode(promptOnlyRequestMode);
      const runtimeMode = toAgentRunMode(runtime.requestMode);
      const changed =
        initialTriageDecision.workflow !== runtime.triageDecision.workflow ||
        initialTriageDecision.source !== runtime.triageDecision.source ||
        initialTriageDecision.confidence !== runtime.triageDecision.confidence ||
        promptMode !== runtimeMode;
      const reasonCodes = Array.from(
        new Set([
          ...initialTriageDecision.reasonCodes,
          ...runtime.triageDecision.reasonCodes,
        ]),
      );

      return {
        kind: "triage_to_runtime" as const,
        promptWorkflow: initialTriageDecision.workflow,
        runtimeWorkflow: runtime.triageDecision.workflow,
        promptMode,
        runtimeMode,
        promptSource: initialTriageDecision.source,
        runtimeSource: runtime.triageDecision.source,
        promptConfidence: initialTriageDecision.confidence,
        runtimeConfidence: runtime.triageDecision.confidence,
        changed,
        reasonCodes,
      };
    };

    if (promptOnlySelectedReferenceQaFastPath) {
      const qaModel = getResolvedLanguageModelForTask("material_digest");
      serverTiming.mark("tool_selection", 0, "count:0,direct:selected_reference_qa");
      return respond(createNdjsonStreamResponse({
        runMode: "chat_answer",
        initialDecision: {
          workflow: initialTriageDecision.workflow,
          workflowLabel: initialTriageDecision.workflowLabel,
          source: initialTriageDecision.source,
          confidence: initialTriageDecision.confidence,
          continuationMode: initialTriageDecision.continuationMode,
          retrievalSources: initialTriageDecision.retrievalSources,
          artifactIntent: initialTriageDecision.artifactIntent,
          forcedToolChoice: initialTriageDecision.forcedToolChoice,
          preferredTools: initialTriageDecision.preferredTools,
          allowedTools: initialTriageDecision.allowedTools,
          reasonCodes: initialTriageDecision.reasonCodes,
        },
        getResult: async () => {
          const qaSetupStartedAt = performance.now();
          const runtime = await prepareChatRuntime();
          const carryRecentConversation = shouldCarryRecentConversation(
            displayUserPrompt || latestUserPrompt,
          );
          const qaMessages = carryRecentConversation
            ? (buildConversationMessagesForModel(
                runtime.conversationContext,
                latestUserPrompt,
                displayUserPrompt || latestUserPrompt,
              ).slice(-4) as ModelMessage[])
            : ([{
                role: "user",
                content: latestUserPrompt,
              }] as ModelMessage[]);
          const qaMaterialContext = buildTaskAwareMaterialContext({
            materials: runtime.attachedMaterials,
            taskKind: runtime.materialTaskKind,
            query: displayUserPrompt || latestUserPrompt,
            maxLength: 18_000,
            maxMaterials: 3,
          });
          serverTiming.measure("llm_setup", qaSetupStartedAt, "资料快路径装配");
          return streamText({
            model: qaModel.model,
            system: buildSelectedReferenceQaSystemPrompt({
              materialContextText: qaMaterialContext || runtime.runtimeContextText,
            }),
            messages: qaMessages,
            maxOutputTokens: 1400,
            maxRetries: 1,
            providerOptions: {
              anthropic: {
                cacheControl: { type: "ephemeral" },
              },
            },
            prepareStep: ({ messages }) => {
              return {
                messages: messages.map((msg, i) =>
                  i === messages.length - 1
                    ? {
                        ...msg,
                        providerOptions: {
                          ...msg.providerOptions,
                          anthropic: { cacheControl: { type: "ephemeral" } },
                        },
                      }
                    : msg,
                ),
              };
            },
          });
        },
        getHandoff: async () => {
          const runtime = await prepareChatRuntime();
          return buildPromptRuntimeHandoff(runtime);
        },
        conversationId: activeConversation.id,
        headers: buildQuotaHeaders(quotaAdmission, { snapshot: "admission" }),
        initialWorkingNote: promptOnlyWorkingNote,
        hooks: createStreamHooks({
          mode: "llm",
          provider: qaModel.provider,
          model: qaModel.modelId,
        }),
        onFinish: async ({ assistantText }) => {
          await awaitUserMessagePersist();
          const assistantMessage = await addConversationMessage(supabase, {
            teacherId,
            conversationId: activeConversation.id,
            role: "assistant",
            content: assistantText,
          });
          return {
            assistantMessageId: assistantMessage.id,
          };
        },
      }), "资料快路径流式响应就绪");
    }

    return respond(createNdjsonStreamResponse({
      runMode: toAgentRunMode(promptOnlyRequestMode),
      initialDecision: {
        workflow: initialTriageDecision.workflow,
        workflowLabel: initialTriageDecision.workflowLabel,
        source: initialTriageDecision.source,
        confidence: initialTriageDecision.confidence,
        continuationMode: initialTriageDecision.continuationMode,
        retrievalSources: initialTriageDecision.retrievalSources,
        artifactIntent: initialTriageDecision.artifactIntent,
        forcedToolChoice: initialTriageDecision.forcedToolChoice,
        preferredTools: initialTriageDecision.preferredTools,
        allowedTools: initialTriageDecision.allowedTools,
        reasonCodes: initialTriageDecision.reasonCodes,
      },
      getResult: async () => {
        const llmSetupStartedAt = performance.now();
        const runtime = await prepareChatRuntime();
        const agentModel = resolvedAgentModel.model;
        const effectiveHasMaterials =
          runtime.attachedMaterials.length > 0 || runtime.hasMaterialsInHistory;
        const systemPromptText = [
          buildAgentSystemPrompt({
            hasUploadedMaterials: effectiveHasMaterials,
            hasReferencedMaterials:
              hasSelectedReferenceMaterials || runtime.hasMaterialsInHistory,
            requestMode: runtime.requestMode,
            runtimeContextText: runtime.runtimeContextText,
            taskStateSummary: runtime.taskState.summary,
          }),
          runtime.attachedMaterials.length > 0 && hasSelectedReferenceMaterials
            ? [
                `当前已接收 ${runtime.attachedMaterials.length} 份教师选定资料（长资料已按相关段落检索）。`,
                "资料概要：",
                ...runtime.attachedMaterials.slice(0, 5).map((material, index) =>
                  `  ${index + 1}. ${material.fileName}`,
                ),
                "",
                "重要：生成工具调用时，query/teacherRequest 必须包含资料的学科和主题信息。",
                "例如：如果资料是英语文学小说，生成 worksheet 时 query 应写 '英语阅读理解 - 小说章节分析'，而不是默认 AP 课程。",
              ].join("\n")
            : runtime.hasMaterialsInHistory && runtime.attachedMaterials.length === 0
              ? [
                  "注意：本对话的前几轮中教师曾上传过资料文件（见对话历史中的【当前材料摘要】）。",
                  "当用户要求「根据刚才的资料」「参考PDF」「基于上传的文件」时：",
                  "- 必须从对话历史中找到之前的材料内容，用那些内容作为依据",
                  "- 不要说「没有看到附件」「请重新上传」——资料已经在对话历史里了",
                  "- 直接基于对话历史中的资料内容执行生成任务",
                ].join("\n")
              : runtime.attachedMaterials.length > 0
                ? `当前已接收 ${runtime.attachedMaterials.length} 份材料（含上传文件或已引用内容），请在生成任务中优先整合。`
                : "",
          runtime.attachedWarnings.length > 0
            ? `材料告警：${runtime.attachedWarnings.join("；")}`
            : "",
          runtime.preferredTools.length > 1
            ? `本轮仅允许以下工具：${runtime.preferredTools.join(", ")}。如果同时需要主文档和答案解析，必须先生成主文档，再生成答案解析。`
            : runtime.preferredTools.length === 1
              ? `本轮仅允许工具：${runtime.preferredTools[0]}。调用一次即可，不要重复调用。`
              : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        const baseMessages = buildConversationMessagesForModel(
          runtime.conversationContext,
          latestUserPrompt,
          displayUserPrompt || latestUserPrompt,
        );
        const allImages = runtime.attachedMaterials.flatMap((material) => material.images ?? []);
        const agentMessages = allImages.length > 0
          ? (baseMessages.map((msg, index) =>
              index === baseMessages.length - 1
                ? {
                    role: msg.role as "user",
                    content: [
                      ...allImages.map((img) => ({
                        type: "image" as const,
                        image: Buffer.from(img.data, "base64"),
                      })),
                      { type: "text" as const, text: msg.content },
                    ],
                  }
                : msg,
            ) as ModelMessage[])
          : (baseMessages as ModelMessage[]);

        // 默认优先使用执行计划收敛后的工具白名单，避免单轮误触发第二个主文档工具
        const selectedTools =
          runtime.preferredTools.length > 0
            ? runtime.preferredTools
            : runtime.allowedTools;
        const toolRuntime = {
          previousMessages: runtime.previousMessages,
          latestGeneratedArtifact: null,
        };
        const allTools = runtime.requestMode === "chat_answer"
          ? undefined
          : createAgentChatTools({
              supabase,
              teacherId,
              latestUserPrompt,
              latestAssistantPrompt: runtime.latestAssistantPrompt ?? "",
              taskState: runtime.taskState,
              uploaded: {
                materials: runtime.attachedMaterials,
              warnings: runtime.attachedWarnings,
            },
            allowedTools: selectedTools,
            runtime: toolRuntime,
          });
        serverTiming.mark(
          "tool_selection",
          0,
          allTools
            ? `count:${Object.keys(allTools).length},tools:${Object.keys(allTools).join(",")}`
            : "count:0",
        );
        serverTiming.measure("llm_setup", llmSetupStartedAt, "模型与工具装配");

        const maxOutputTokens =
          runtime.requestMode === "document_artifact"
            ? 8192
            : runtime.requestMode === "retrieval_only"
              ? 4096
              : runtime.requestMode === "retrieval_then_document"
                ? 6144
              : 3072;
        const toolLoopPlan = buildAgentToolLoopPlan({
          requestMode: runtime.requestMode,
          preferredTools: runtime.preferredTools,
        });
        const stopWhen = stepCountIs(toolLoopPlan.stepLimit);
        const completedDocumentTools = new Set<string>();
        const baseActiveTools = allTools
          ? (selectedTools.length > 0
              ? selectedTools
              : (Object.keys(allTools) as string[]))
          : undefined;

        return streamText({
          model: agentModel,
          system: systemPromptText,
          messages: agentMessages,
          maxOutputTokens,
          maxRetries: 2,
          stopWhen,
          tools: allTools as NonNullable<Parameters<typeof streamText>[0]["tools"]>,
          activeTools: baseActiveTools,
          toolChoice: (() => {
            if (runtime.forcedToolChoice && allTools && runtime.forcedToolChoice in allTools) {
              return { type: "tool" as const, toolName: runtime.forcedToolChoice };
            }
            if (
              allTools &&
              (runtime.requestMode === "document_artifact" ||
                runtime.requestMode === "retrieval_then_document")
            ) {
              return "required" as const;
            }
            return "auto" as const;
          })(),
          providerOptions: {
            anthropic: {
              cacheControl: { type: "ephemeral" },
            },
          },
          prepareStep: ({ messages, stepNumber }) => {
            const preparedMessages = messages.map((msg, index) =>
              index === messages.length - 1
                ? {
                    ...msg,
                    providerOptions: {
                      ...msg.providerOptions,
                      anthropic: { cacheControl: { type: "ephemeral" } },
                    },
                  }
                : msg,
            );

            if (stepNumber === 0) {
              return { messages: preparedMessages };
            }

            // 阻止模型重复调用同一类文档工具
            if (completedDocumentTools.size > 0 && baseActiveTools) {
              const policy = runtime.executionPlan.artifactPolicy;
              const allowedTools = policy?.explicitMultiArtifact
                ? baseActiveTools.filter((name) => !completedDocumentTools.has(name))
                : baseActiveTools.filter((name) => !DOCUMENT_SEQUENCE_TOOL_NAMES.has(name as AgentToolName));

              if (allowedTools.length === 0) {
                return {
                  messages: preparedMessages,
                  toolChoice: "none" as const,
                };
              }
              return {
                messages: preparedMessages,
                toolChoice: "auto" as const,
                activeTools: allowedTools,
              };
            }

            return {
              messages: preparedMessages,
              toolChoice: "auto" as const,
            };
          },
          onStepFinish: ({ stepNumber, toolCalls, finishReason }) => {
            const validToolCalls = toolCalls
              ?.filter((toolCall): toolCall is NonNullable<typeof toolCall> => Boolean(toolCall))
              ?? [];
            for (const tc of validToolCalls) {
              if (DOCUMENT_SEQUENCE_TOOL_NAMES.has(tc.toolName as AgentToolName)) {
                completedDocumentTools.add(tc.toolName);
              }
            }
            if (validToolCalls.length > 0 && process.env.NODE_ENV === "development") {
              console.log(`[agent-chat] Step ${stepNumber}: ${finishReason}, tools: ${validToolCalls.map((tc) => tc.toolName).join(",")}`);
            }
          },
        });
      },
      getHandoff: async () => {
        const runtime = await prepareChatRuntime();
        return buildPromptRuntimeHandoff(runtime);
      },
      conversationId: activeConversation.id,
      initialWorkingNote: promptOnlyWorkingNote,
      headers: buildQuotaHeaders(quotaAdmission, { snapshot: "admission" }),
      hooks: createStreamHooks({
        mode: "llm",
        provider: resolvedAgentModel.provider,
        model: resolvedAgentModel.modelId,
      }),
      onFinish: async ({ assistantText }) => {
        await awaitUserMessagePersist();
        const assistantMessage = await addConversationMessage(supabase, {
          teacherId,
          conversationId: activeConversation.id,
          role: "assistant",
          content: assistantText,
        });
        return {
          assistantMessageId: assistantMessage.id,
        };
      },
    }), "LLM 流式响应就绪");
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return respond(jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400), "请求体解析失败");
    }
    if (error instanceof z.ZodError) {
      return respond(jsonError(
        "VALIDATION_ERROR",
        "请求参数不合法",
        400,
        error.flatten(),
      ), "请求参数不合法");
    }

    console.error("Agent 对话失败", error);
    if (workflowRunId && !workflowFinalized) {
      const agentChatProfile = getWorkflowProfile("agent_chat");
      const budget = evaluateWorkflowBudget(agentChatProfile, {});
      await recordWorkflowStep({
        runId: workflowRunId,
        workflow: agentChatProfile.name,
        step: "route_failure",
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Agent 对话失败",
        metadata: {
          budget,
        },
      });
      await finalizeWorkflowRun({
        runId: workflowRunId,
        status: "failed",
        metadata: {
          route: "/api/agent/chat",
          budget,
        },
      });
    }
    releaseConcurrency?.();
    return respond(NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Agent 对话失败，请稍后重试。",
      },
      { status: 500 },
    ), "Agent 路由失败");
  }
}
