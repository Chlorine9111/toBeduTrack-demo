import { z } from "zod";
import type { ModelMessage } from "ai";
import {
  type AnthropicEffort,
  type GatewayModelInput,
  generateStructuredObjectWithGateway,
  streamStructuredObjectWithGateway,
} from "@/lib/ai/gateway";

export async function generateStructuredObject<TSchema extends z.ZodTypeAny>(params: {
  model: GatewayModelInput;
  schema: TSchema;
  systemPrompt: string;
  userPrompt?: string;
  messages?: ModelMessage[];
  maxTokens?: number;
  temperature?: number;
  effort?: AnthropicEffort;
  maxRetries?: number;
  abortSignal?: AbortSignal;
}): Promise<z.infer<TSchema>> {
  const { object } = await generateStructuredObjectWithGateway({
    capability: "structured",
    model: params.model,
    schema: params.schema,
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    messages: params.messages,
    maxTokens: params.maxTokens,
    temperature: params.temperature,
    effort: params.effort,
    maxRetries: params.maxRetries,
    abortSignal: params.abortSignal,
  });

  return object;
}

export async function streamStructuredObject<TSchema extends z.ZodTypeAny>(params: {
  model: GatewayModelInput;
  schema: TSchema;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  effort?: AnthropicEffort;
  maxRetries?: number;
  onPartialObject?: (partialObject: Partial<z.infer<TSchema>>) => void | Promise<void>;
  abortSignal?: AbortSignal;
}): Promise<z.infer<TSchema>> {
  const { object } = await streamStructuredObjectWithGateway({
    capability: "structured",
    model: params.model,
    schema: params.schema,
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    maxTokens: params.maxTokens,
    temperature: params.temperature,
    effort: params.effort,
    maxRetries: params.maxRetries,
    onPartialObject: params.onPartialObject,
    abortSignal: params.abortSignal,
  });

  return object;
}
