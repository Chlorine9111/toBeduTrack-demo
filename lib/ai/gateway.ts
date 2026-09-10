import {
  Output,
  defaultSettingsMiddleware,
  generateText,
  jsonSchema,
  streamText,
  tool as defineTool,
  wrapLanguageModel,
  type ModelMessage,
} from "ai";
import { aiCacheMiddleware } from "@/lib/ai/cache-middleware";
import { z } from "zod";
import {
  type AiGatewayProvider,
  createAiRequestId,
  finalizeAiMetadata,
  resolveLanguageModel,
  resolveModelTemperature,
  type ResolvedClaudeLanguageModel,
  type ResolvedLanguageModel,
  type AiGatewayCapability,
  type AiGatewayMetadata,
} from "@/lib/ai/provider-registry";
import { callGeminiOpenRouterJson } from "@/lib/ai/gemini-openrouter-helper";
import { createDeadlineSignal, resolveTimeoutMs } from "@/lib/runtime/deadline";
import { recordWorkflowStep } from "@/lib/runtime/workflow-telemetry";
import { toAppError } from "@/lib/runtime/app-error";

export type GatewayResolvedModel =
  | ResolvedLanguageModel
  | ResolvedClaudeLanguageModel;

export type GatewayModelInput = string | GatewayResolvedModel;
export type GatewayToolDefinition = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
};

export type AnthropicEffort = "low" | "medium" | "high" | "max";

type SharedGatewayParams = {
  capability?: AiGatewayCapability;
  model: GatewayModelInput;
  system?: string;
  prompt?: string;
  messages?: ModelMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  thinking?: { type: "enabled"; budgetTokens: number } | { type: "disabled" };
  effort?: AnthropicEffort;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  timeout?:
    | number
    | {
        totalMs?: number;
        stepMs?: number;
        chunkMs?: number;
      };
  fallbackUsed?: boolean;
  attemptCount?: number;
  onTextDelta?: (delta: string) => void | Promise<void>;
};

type StructuredGatewayParams<TSchema extends z.ZodTypeAny> = {
  capability?: "structured";
  model: GatewayModelInput;
  schema: TSchema;
  schemaName?: string;
  schemaDescription?: string;
  systemPrompt: string;
  userPrompt?: string;
  messages?: ModelMessage[];
  maxTokens?: number;
  temperature?: number;
  effort?: AnthropicEffort;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  timeout?:
    | number
    | {
        totalMs?: number;
        stepMs?: number;
        chunkMs?: number;
      };
  fallbackUsed?: boolean;
  attemptCount?: number;
};

type StructuredPartialCallback<TSchema extends z.ZodTypeAny> = (
  partialObject: Partial<z.infer<TSchema>>,
) => void | Promise<void>;

function isResolvedGatewayModel(
  model: GatewayModelInput,
): model is GatewayResolvedModel {
  return typeof model !== "string";
}

function resolveGatewayModelInput(model: GatewayModelInput) {
  return isResolvedGatewayModel(model) ? model : resolveLanguageModel(model);
}

type WrappedLanguageModelInput = Parameters<typeof wrapLanguageModel>[0]["model"];

function createGatewayWrappedModel(params: {
  model: WrappedLanguageModelInput;
  temperature: number;
  maxOutputTokens: number;
  effort?: AnthropicEffort;
}) {
  return wrapLanguageModel({
    model: params.model,
    middleware: [
      defaultSettingsMiddleware({
        settings: {
          temperature: params.temperature,
          maxOutputTokens: params.maxOutputTokens,
          providerOptions: {
            anthropic: {
              cacheControl: { type: "ephemeral" },
              ...(params.effort ? { effort: params.effort } : {}),
            },
          },
        },
      }),
      aiCacheMiddleware,
    ],
  });
}

function buildTextInvocation(params: SharedGatewayParams, defaultCapability: "text" | "stream") {
  const resolved = resolveGatewayModelInput(params.model);
  const capability = params.capability ?? defaultCapability;
  const requestId = createAiRequestId(capability);
  const startedAt = Date.now();
  const thinkingEnabled = params.thinking?.type === "enabled";
  const temperature = thinkingEnabled
    ? undefined
    : resolveModelTemperature(resolved.modelId, params.temperature ?? 0);
  const maxOutputTokens = params.maxOutputTokens ?? 5200;

  const thinkingBudget = params.thinking?.type === "enabled" ? params.thinking.budgetTokens : 4096;
  const providerOptions = thinkingEnabled
    ? {
        anthropic: {
          thinking: { type: "enabled" as const, budgetTokens: thinkingBudget },
        },
      }
    : undefined;

  return {
    model: createGatewayWrappedModel({
      model: resolved.model as WrappedLanguageModelInput,
      temperature: temperature ?? 0,
      maxOutputTokens,
      effort: params.effort,
    }),
    modelId: resolved.modelId,
    provider: resolved.provider,
    requestId,
    startedAt,
    capability,
    settings: {
      system: params.system,
      maxOutputTokens,
      temperature,
      maxRetries: params.maxRetries ?? 1,
      abortSignal: params.abortSignal,
      timeout: params.timeout,
    },
    providerOptions,
    prompt: params.prompt ?? "",
    messages: params.messages,
    fallbackUsed: params.fallbackUsed ?? false,
    attemptCount: params.attemptCount ?? 1,
  };
}

function buildMetadata(params: {
  requestId: string;
  capability: AiGatewayCapability;
  provider: AiGatewayProvider;
  modelId: string;
  startedAt: number;
  fallbackUsed: boolean;
  attemptCount: number;
}) {
  return finalizeAiMetadata({
    requestId: params.requestId,
    capability: params.capability,
    provider: params.provider,
    modelId: params.modelId,
    startedAt: params.startedAt,
    fallbackUsed: params.fallbackUsed,
    attemptCount: params.attemptCount,
  });
}

function extractUsageMetrics(result: unknown) {
  const usage = result && typeof result === "object" ? (result as { usage?: unknown }).usage : null;
  if (!usage || typeof usage !== "object") {
    return {
      inputTokens: null,
      outputTokens: null,
      cacheHit: false,
    };
  }

  const record = usage as Record<string, unknown>;
  const inputTokens =
    typeof record.inputTokens === "number"
      ? record.inputTokens
      : typeof record.promptTokens === "number"
        ? record.promptTokens
        : typeof record.input_tokens === "number"
          ? record.input_tokens
          : null;
  const outputTokens =
    typeof record.outputTokens === "number"
      ? record.outputTokens
      : typeof record.completionTokens === "number"
        ? record.completionTokens
        : typeof record.output_tokens === "number"
          ? record.output_tokens
          : null;
  const cacheHit =
    (typeof record.cacheReadInputTokens === "number" && record.cacheReadInputTokens > 0) ||
    (typeof record.cache_read_input_tokens === "number" && record.cache_read_input_tokens > 0);

  return {
    inputTokens,
    outputTokens,
    cacheHit,
  };
}

function queueGatewayTelemetry(params: {
  workflow: string;
  step: string;
  status: "completed" | "failed";
  metadata: AiGatewayMetadata;
  result?: unknown;
  error?: unknown;
}) {
  const usage = params.result ? extractUsageMetrics(params.result) : null;
  const error = params.error
    ? toAppError(params.error, {
        code: "UPSTREAM_UNAVAILABLE",
        message:
          params.error instanceof Error ? params.error.message : "AI Gateway 调用失败",
        retryable: true,
        source: params.metadata.provider,
      })
    : null;

  void recordWorkflowStep({
    workflow: params.workflow,
    step: params.step,
    status: params.status,
    provider: params.metadata.provider,
    model: params.metadata.modelId,
    durationMs: params.metadata.durationMs,
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    cacheHit: usage?.cacheHit ?? false,
    fallbackTriggered: params.metadata.fallbackUsed,
    errorCode: error?.code ?? null,
    errorMessage: error?.message ?? null,
    metadata: {
      requestId: params.metadata.requestId,
      capability: params.metadata.capability,
      attemptCount: params.metadata.attemptCount,
    },
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeStableStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return `${Date.now()}`;
  }
}

function coerceEmbeddedJsonStrings(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        return coerceEmbeddedJsonStrings(JSON.parse(trimmed));
      } catch {
        return value;
      }
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => coerceEmbeddedJsonStrings(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, coerceEmbeddedJsonStrings(nested)]),
    );
  }

  return value;
}

function shouldUseGeminiStructuredFallback(resolved: GatewayResolvedModel) {
  return resolved.provider === "openrouter" && resolved.modelId.startsWith("google/gemini-");
}

function parseStructuredOutput<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
) {
  const direct = schema.safeParse(value);
  if (direct.success) {
    return direct.data;
  }

  if (Array.isArray(value) && schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const shapeKeys = Object.keys(shape);

    if (shapeKeys.length === 1) {
      const wrapped = schema.safeParse({ [shapeKeys[0]]: value });
      if (wrapped.success) {
        return wrapped.data;
      }
    }
  }

  const normalized = coerceEmbeddedJsonStrings(value);
  const reparsed = schema.safeParse(normalized);
  if (reparsed.success) {
    return reparsed.data;
  }

  // Return best-effort coerced data instead of throwing — callers that need
  // strict validation (e.g. rubric-generator) already run their own
  // coerce-then-parse pipeline on the returned value.
  console.warn("[ai-gateway] structured output coerced (schema validation deferred to caller)", {
    preview: safeStableStringify(value).slice(0, 1200),
  });
  return normalized as z.infer<TSchema>;
}

function collectNewTopLevelArrayEntries(
  partialObject: Record<string, unknown>,
  emittedCounts: Map<string, number>,
) {
  let emitted = 0;

  for (const [field, value] of Object.entries(partialObject)) {
    if (!Array.isArray(value)) continue;

    const previousCount = emittedCounts.get(field) ?? 0;
    if (value.length <= previousCount) continue;

    emitted += value.length - previousCount;
    emittedCounts.set(field, value.length);
  }

  return emitted;
}

export async function emitStructuredObjectPartialUpdates<TObject>(params: {
  partialOutputStream: AsyncIterable<TObject>;
  onPartialObject?: (partialObject: TObject) => void | Promise<void>;
}) {
  if (!params.onPartialObject) return;

  const emittedCounts = new Map<string, number>();
  let lastSnapshot = "";

  for await (const partialObject of params.partialOutputStream) {
    const snapshot = safeStableStringify(partialObject);
    const newArrayEntries = isPlainObject(partialObject)
      ? collectNewTopLevelArrayEntries(partialObject, emittedCounts)
      : 0;

    if (newArrayEntries > 0 || snapshot !== lastSnapshot) {
      await params.onPartialObject(partialObject);
      lastSnapshot = snapshot;
    }
  }
}

export async function generateGatewayText(params: SharedGatewayParams) {
  const invocation = buildTextInvocation(params, "text");
  const deadline = createDeadlineSignal({
    timeoutMs: resolveTimeoutMs(invocation.settings.timeout, 90_000),
    parentSignal: invocation.settings.abortSignal,
    reason: `ai-gateway-text>${invocation.modelId}`,
  });

  try {
    const result =
      invocation.messages && invocation.messages.length > 0
        ? await generateText({
            model: invocation.model,
            system: invocation.settings.system,
            messages: invocation.messages,
            maxRetries: invocation.settings.maxRetries,
            abortSignal: deadline.signal,
            timeout: invocation.settings.timeout,
            ...(invocation.providerOptions ? { providerOptions: invocation.providerOptions } : {}),
          })
        : await generateText({
            model: invocation.model,
            system: invocation.settings.system,
            prompt: invocation.prompt,
            maxRetries: invocation.settings.maxRetries,
            abortSignal: deadline.signal,
            timeout: invocation.settings.timeout,
            ...(invocation.providerOptions ? { providerOptions: invocation.providerOptions } : {}),
          });

    const metadata = buildMetadata({
      requestId: invocation.requestId,
      capability: invocation.capability,
      provider: invocation.provider,
      modelId: invocation.modelId,
      startedAt: invocation.startedAt,
      fallbackUsed: invocation.fallbackUsed,
      attemptCount: invocation.attemptCount,
    });
    console.info("[ai-gateway] text", metadata);
    queueGatewayTelemetry({
      workflow: "ai-gateway",
      step: "text",
      status: "completed",
      metadata,
      result,
    });

    return {
      text: result.text ?? "",
      result,
      metadata,
    };
  } catch (error) {
    const metadata = buildMetadata({
      requestId: invocation.requestId,
      capability: invocation.capability,
      provider: invocation.provider,
      modelId: invocation.modelId,
      startedAt: invocation.startedAt,
      fallbackUsed: invocation.fallbackUsed,
      attemptCount: invocation.attemptCount,
    });
    queueGatewayTelemetry({
      workflow: "ai-gateway",
      step: "text",
      status: "failed",
      metadata,
      error,
    });
    throw toAppError(error, {
      code: "UPSTREAM_UNAVAILABLE",
      message:
        error instanceof Error ? error.message : "文本生成失败",
      retryable: true,
      source: invocation.provider,
    });
  } finally {
    deadline.clear();
  }
}

export function streamGatewayText(params: SharedGatewayParams) {
  const invocation = buildTextInvocation(params, "stream");
  const result =
    invocation.messages && invocation.messages.length > 0
      ? streamText({
          model: invocation.model,
          system: invocation.settings.system,
          messages: invocation.messages,
          maxRetries: invocation.settings.maxRetries,
          abortSignal: invocation.settings.abortSignal,
          timeout: invocation.settings.timeout,
          ...(invocation.providerOptions ? { providerOptions: invocation.providerOptions } : {}),
        })
      : streamText({
          model: invocation.model,
          system: invocation.settings.system,
          prompt: invocation.prompt,
          maxRetries: invocation.settings.maxRetries,
          abortSignal: invocation.settings.abortSignal,
          timeout: invocation.settings.timeout,
          ...(invocation.providerOptions ? { providerOptions: invocation.providerOptions } : {}),
        });

  const metadata = buildMetadata({
    requestId: invocation.requestId,
    capability: invocation.capability,
    provider: invocation.provider,
    modelId: invocation.modelId,
    startedAt: invocation.startedAt,
    fallbackUsed: invocation.fallbackUsed,
    attemptCount: invocation.attemptCount,
  });
  console.info("[ai-gateway] stream", metadata);

  return {
    result,
    metadata,
  };
}

/**
 * 流式生成文本并收集完整结果。
 * 与 generateGatewayText 返回相同的接口，但内部使用 streamText 避免 HTTP 超时。
 * 适用于大输出量的场景（如 PBL 方案、长教案等）。
 */
export async function streamGatewayTextToCompletion(params: SharedGatewayParams) {
  const { result, metadata } = streamGatewayText(params);
  try {
    let text = "";

    if (params.onTextDelta) {
      for await (const chunk of result.textStream) {
        if (!chunk) continue;
        text += chunk;
        await params.onTextDelta(chunk);
      }
    } else {
      text = await result.text;
    }

    queueGatewayTelemetry({
      workflow: "ai-gateway",
      step: "stream-to-completion",
      status: "completed",
      metadata,
      result,
    });
    return { text, result, metadata };
  } catch (error) {
    queueGatewayTelemetry({
      workflow: "ai-gateway",
      step: "stream-to-completion",
      status: "failed",
      metadata,
      error,
    });
    throw toAppError(error, {
      code: "UPSTREAM_UNAVAILABLE",
      message: error instanceof Error ? error.message : "流式文本生成失败",
      retryable: true,
      source: metadata.provider,
    });
  }
}

/**
 * 递归剥离部分 provider 不支持的 JSON Schema 约束。
 * 运行时仍会再经过 Zod parse，因此这里优先保证 structured 调用不被 schema 方言差异打断。
 */
export function sanitizeStructuredJsonSchemaForGateway(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...schema };
  delete result.minItems;
  delete result.maxItems;
  delete result.minimum;
  delete result.maximum;
  delete result.exclusiveMinimum;
  delete result.exclusiveMaximum;

  if (result.properties && typeof result.properties === "object") {
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result.properties as Record<string, unknown>)) {
      props[key] = value && typeof value === "object" && !Array.isArray(value)
        ? sanitizeStructuredJsonSchemaForGateway(value as Record<string, unknown>)
        : value;
    }
    result.properties = props;
  }

  if (result.items && typeof result.items === "object" && !Array.isArray(result.items)) {
    result.items = sanitizeStructuredJsonSchemaForGateway(
      result.items as Record<string, unknown>,
    );
  }

  for (const key of ["anyOf", "oneOf"] as const) {
    if (Array.isArray(result[key])) {
      result[key] = (result[key] as unknown[]).map((branch) =>
        branch && typeof branch === "object" && !Array.isArray(branch)
          ? sanitizeStructuredJsonSchemaForGateway(branch as Record<string, unknown>)
          : branch,
      );
    }
  }

  if (result.$defs && typeof result.$defs === "object") {
    const defs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result.$defs as Record<string, unknown>)) {
      defs[key] = value && typeof value === "object" && !Array.isArray(value)
        ? sanitizeStructuredJsonSchemaForGateway(value as Record<string, unknown>)
        : value;
    }
    result.$defs = defs;
  }

  return result;
}

export async function generateStructuredObjectWithGateway<TSchema extends z.ZodTypeAny>(
  params: StructuredGatewayParams<TSchema>,
): Promise<{ object: z.infer<TSchema>; metadata: AiGatewayMetadata }> {
  const resolved = resolveGatewayModelInput(params.model);
  const requestId = createAiRequestId(params.capability ?? "structured");
  const startedAt = Date.now();
  const temperature = resolveModelTemperature(
    resolved.modelId,
    params.temperature ?? 0,
  );
  const maxOutputTokens = params.maxTokens ?? 5200;

  const rawJsonSchema = z.toJSONSchema(params.schema);
  const safeJsonSchema = sanitizeStructuredJsonSchemaForGateway(
    rawJsonSchema as Record<string, unknown>,
  );

  const deadline = createDeadlineSignal({
    timeoutMs: resolveTimeoutMs(params.timeout, 90_000),
    parentSignal: params.abortSignal,
    reason: `ai-gateway-structured>${resolved.modelId}`,
  });

  try {
    if (!params.messages?.length && shouldUseGeminiStructuredFallback(resolved)) {
      const { data, metadata } = await callGeminiOpenRouterJson<z.infer<TSchema>>({
        capability: params.capability ?? "structured",
        model: resolved.modelId,
        messages: [
          {
            role: "system",
            content: params.systemPrompt,
          },
          {
            role: "user",
            content: params.userPrompt ?? "",
          },
        ],
        temperature,
        maxTokens: maxOutputTokens,
        attemptCount: params.attemptCount ?? 1,
        fallbackUsed: params.fallbackUsed ?? false,
      });
      console.info("[ai-gateway] structured", metadata);
      queueGatewayTelemetry({
        workflow: "ai-gateway",
        step: "structured",
        status: "completed",
        metadata,
        result: { output: data },
      });

      return {
        object: parseStructuredOutput(params.schema, data),
        metadata,
      };
    }

    const model = createGatewayWrappedModel({
      model: resolved.model as WrappedLanguageModelInput,
      temperature,
      maxOutputTokens,
      effort: params.effort,
    });
    const output = Output.object({
      schema: jsonSchema(safeJsonSchema as Parameters<typeof jsonSchema>[0]),
      name: params.schemaName,
      description: params.schemaDescription,
    });

    const structuredProviderOptions =
      resolved.provider === "anthropic"
        ? { anthropic: { structuredOutputMode: "jsonTool" as const } }
        : undefined;

    const result =
      params.messages && params.messages.length > 0
        ? await generateText({
            model,
            system: params.systemPrompt,
            messages: params.messages,
            output,
            maxRetries: params.maxRetries ?? 1,
            abortSignal: deadline.signal,
            timeout: params.timeout,
            providerOptions: structuredProviderOptions,
          })
        : await generateText({
            model,
            system: params.systemPrompt,
            prompt: params.userPrompt ?? "",
            output,
            maxRetries: params.maxRetries ?? 1,
            abortSignal: deadline.signal,
            timeout: params.timeout,
            providerOptions: structuredProviderOptions,
          });

    const metadata = buildMetadata({
      requestId,
      capability: params.capability ?? "structured",
      provider: resolved.provider,
      modelId: resolved.modelId,
      startedAt,
      fallbackUsed: params.fallbackUsed ?? false,
      attemptCount: params.attemptCount ?? 1,
    });
    console.info("[ai-gateway] structured", metadata);
    queueGatewayTelemetry({
      workflow: "ai-gateway",
      step: "structured",
      status: "completed",
      metadata,
      result,
    });

    return {
      object: parseStructuredOutput(params.schema, result.output),
      metadata,
    };
  } catch (error) {
    const metadata = buildMetadata({
      requestId,
      capability: params.capability ?? "structured",
      provider: resolved.provider,
      modelId: resolved.modelId,
      startedAt,
      fallbackUsed: params.fallbackUsed ?? false,
      attemptCount: params.attemptCount ?? 1,
    });
    queueGatewayTelemetry({
      workflow: "ai-gateway",
      step: "structured",
      status: "failed",
      metadata,
      error,
    });
    throw toAppError(error, {
      code: "UPSTREAM_UNAVAILABLE",
      message:
        error instanceof Error ? error.message : "结构化生成失败",
      retryable: true,
      source: resolved.provider,
    });
  } finally {
    deadline.clear();
  }
}

function hasNonEmptyToolInput(input: unknown): input is Record<string, unknown> {
  return Boolean(
    input &&
      typeof input === "object" &&
      !Array.isArray(input) &&
      Object.keys(input).length > 0,
  );
}

export async function generateToolInputWithGateway<TInput = unknown>(params: {
  model: GatewayModelInput;
  systemPrompt: string;
  userPrompt: string;
  tool: GatewayToolDefinition;
  maxTokens?: number;
  temperature?: number;
  effort?: AnthropicEffort;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  fallbackUsed?: boolean;
  attemptCount?: number;
}) {
  const invocation = buildTextInvocation(
    {
      capability: "tool",
      effort: params.effort,
      model: params.model,
      system: params.systemPrompt,
      prompt: params.userPrompt,
      maxOutputTokens: params.maxTokens ?? 5200,
      temperature: params.temperature ?? 0,
      maxRetries: params.maxRetries ?? 1,
      abortSignal: params.abortSignal,
      fallbackUsed: params.fallbackUsed,
      attemptCount: params.attemptCount,
    },
    "text",
  );

  const deadline = createDeadlineSignal({
    timeoutMs: resolveTimeoutMs(params.maxTokens ? { stepMs: 90_000 } : undefined, 90_000),
    parentSignal: invocation.settings.abortSignal,
    reason: `ai-gateway-tool>${invocation.modelId}`,
  });

  try {
    const result = await generateText({
      model: invocation.model,
      system: invocation.settings.system,
      prompt: invocation.prompt,
      tools: {
        [params.tool.name]: defineTool({
          description: params.tool.description ?? "",
          inputSchema: jsonSchema(
            sanitizeStructuredJsonSchemaForGateway(
              params.tool.inputSchema as Record<string, unknown>,
            ) as never,
          ),
        }),
      },
      toolChoice: {
        type: "tool",
        toolName: params.tool.name,
      },
      maxRetries: invocation.settings.maxRetries,
      abortSignal: deadline.signal,
    });

    const toolCall = result.toolCalls.find(
      (call) => !call.dynamic && call.toolName === params.tool.name,
    );

    const metadata = buildMetadata({
      requestId: invocation.requestId,
      capability: "tool",
      provider: invocation.provider,
      modelId: invocation.modelId,
      startedAt: invocation.startedAt,
      fallbackUsed: invocation.fallbackUsed,
      attemptCount: invocation.attemptCount,
    });
    console.info("[ai-gateway] tool", metadata);

    if (!toolCall || !hasNonEmptyToolInput(toolCall.input)) {
      const detail =
        result.finishReason === "length"
          ? "响应被截断"
          : result.text.trim().length > 0
            ? `模型返回了文本而非工具调用: ${result.text.trim().slice(0, 200)}`
            : `finishReason=${result.finishReason ?? "unknown"}`;
      throw new Error(
        `AI_GATEWAY/tool_failed(${invocation.requestId}): 未拿到 ${params.tool.name} 的有效工具入参: ${detail}`,
      );
    }

    queueGatewayTelemetry({
      workflow: "ai-gateway",
      step: "tool",
      status: "completed",
      metadata,
      result,
    });

    return {
      input: toolCall.input as TInput,
      result,
      metadata,
    };
  } catch (error) {
    const metadata = buildMetadata({
      requestId: invocation.requestId,
      capability: "tool",
      provider: invocation.provider,
      modelId: invocation.modelId,
      startedAt: invocation.startedAt,
      fallbackUsed: invocation.fallbackUsed,
      attemptCount: invocation.attemptCount,
    });
    queueGatewayTelemetry({
      workflow: "ai-gateway",
      step: "tool",
      status: "failed",
      metadata,
      error,
    });
    throw toAppError(error, {
      code: "UPSTREAM_UNAVAILABLE",
      message:
        error instanceof Error ? error.message : "工具入参生成失败",
      retryable: true,
      source: invocation.provider,
    });
  } finally {
    deadline.clear();
  }
}

export async function streamStructuredObjectWithGateway<TSchema extends z.ZodTypeAny>(
  params: StructuredGatewayParams<TSchema> & {
    onPartialObject?: StructuredPartialCallback<TSchema>;
  },
): Promise<{ object: z.infer<TSchema>; metadata: AiGatewayMetadata }> {
  const resolved = resolveGatewayModelInput(params.model);
  const requestId = createAiRequestId(params.capability ?? "structured");
  const startedAt = Date.now();
  const temperature = resolveModelTemperature(
    resolved.modelId,
    params.temperature ?? 0,
  );
  const maxOutputTokens = params.maxTokens ?? 5200;
  const structuredProviderOptions =
    resolved.provider === "anthropic"
      ? { anthropic: { structuredOutputMode: "jsonTool" as const } }
      : undefined;
  const result = streamText({
    model: createGatewayWrappedModel({
      model: resolved.model as WrappedLanguageModelInput,
      temperature,
      maxOutputTokens,
      effort: params.effort,
    }),
    system: params.systemPrompt,
    prompt: params.userPrompt ?? "",
    output: Output.object({
      schema: params.schema,
      name: params.schemaName,
      description: params.schemaDescription,
    }),
    maxRetries: params.maxRetries ?? 1,
    abortSignal: params.abortSignal,
    ...(structuredProviderOptions ? { providerOptions: structuredProviderOptions } : {}),
  });

  await emitStructuredObjectPartialUpdates({
    partialOutputStream: result.partialOutputStream as AsyncIterable<Partial<z.infer<TSchema>>>,
    onPartialObject: params.onPartialObject,
  });

  const object = await result.output;
  const metadata = buildMetadata({
    requestId,
    capability: params.capability ?? "structured",
    provider: resolved.provider,
    modelId: resolved.modelId,
    startedAt,
    fallbackUsed: params.fallbackUsed ?? false,
    attemptCount: params.attemptCount ?? 1,
  });
  console.info("[ai-gateway] structured-stream", metadata);

  return {
    object: parseStructuredOutput(params.schema, object),
    metadata,
  };
}

export {
  buildSystemPromptText,
  createAiRequestId,
  finalizeAiMetadata,
  firstNonEmptyEnv,
  getAnthropicProvider,
  getMoonshotProvider,
  getOpenRouterProvider,
  normalizeClaudeModelName,
  normalizeOpenRouterModel,
  resolveAnthropicApiKey,
  resolveAnthropicBaseURL,
  resolveAnthropicBaseUrl,
  resolveClaudeModel,
  resolveDirectAnthropicApiKey,
  resolveModelTemperature,
  resolveOpenRouterApiKey,
  resolveOpenRouterBaseURL,
} from "@/lib/ai/provider-registry";

export const getTextGenerationModel = resolveLanguageModel;
export const getStructuredOutputModel = resolveLanguageModel;
export const resolveStructuredOutputTemperature = resolveModelTemperature;
