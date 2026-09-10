import { getModelForTask } from "@/lib/ai/model-router"
import { generateGatewayText } from "@/lib/ai/gateway"
import {
  sendAnthropicJsonMessage,
  sendAnthropicVisionJsonMessage,
  sendAnthropicVisionMessage,
  type VisionImageInput,
} from "@/lib/ai/anthropic-vision"
import {
  resolveDirectAnthropicApiKey,
  resolveLanguageModel,
} from "@/lib/ai/provider-registry"

function hasDirectAnthropicVision() {
  return Boolean(resolveDirectAnthropicApiKey())
}

export function hasWechatVisionProvider() {
  if (hasDirectAnthropicVision()) return true
  try {
    resolveLanguageModel(getModelForTask("wechat_vision"))
    return true
  } catch {
    return false
  }
}

function extractJsonPayload(content: string) {
  const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/)
  return (jsonMatch ? jsonMatch[1] : content).trim()
}

function parseJsonObject<T>(content: string, options: { debugLabel?: string } = {}): T {
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJsonPayload(content))
  } catch {
    if (options.debugLabel) {
      console.error(
        `${options.debugLabel} JSON parse failed. Content length: ${content.length}, first 500 chars:`,
        content.slice(0, 500),
      )
      console.error(`${options.debugLabel} Last 200 chars:`, content.slice(-200))
    }
    throw new Error(`Vision model returned invalid JSON: ${content.slice(0, 200)}`)
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`Vision model returned non-object JSON: ${typeof parsed}`)
  }

  return parsed as T
}

async function sendGatewayTextMessage(params: {
  capability: "vision" | "structured"
  prompt: string
  images?: VisionImageInput | VisionImageInput[]
  options?: { maxTokens?: number; temperature?: number; system?: string }
}) {
  const modelId = getModelForTask("wechat_vision")
  const imageArray = params.images ? (Array.isArray(params.images) ? params.images : [params.images]) : []

  const result = imageArray.length > 0
    ? await generateGatewayText({
        capability: params.capability,
        model: modelId,
        system: params.options?.system,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: params.prompt,
              },
              ...imageArray.map((image) => ({
                type: "image" as const,
                image: image.data,
                mediaType: image.mediaType,
              })),
            ],
          },
        ],
        maxOutputTokens: params.options?.maxTokens ?? 5120,
        temperature: params.options?.temperature ?? 0,
        maxRetries: 2,
      })
    : await generateGatewayText({
        capability: params.capability,
        model: modelId,
        system: params.options?.system,
        prompt: params.prompt,
        maxOutputTokens: params.options?.maxTokens ?? 5120,
        temperature: params.options?.temperature ?? 0,
        maxRetries: 2,
      })

  return result.text
}

export async function sendVisionJsonMessage<T>(
  prompt: string,
  image: VisionImageInput,
  options: { maxTokens?: number; temperature?: number; system?: string } = {},
): Promise<T> {
  if (hasDirectAnthropicVision()) {
    return sendAnthropicVisionJsonMessage<T>(prompt, image, options)
  }

  const text = await sendGatewayTextMessage({
    capability: "vision",
    prompt,
    images: image,
    options,
  })
  return parseJsonObject<T>(text, { debugLabel: "[wechat-vision]" })
}

export async function sendJsonMessage<T>(
  prompt: string,
  options: { maxTokens?: number; temperature?: number; system?: string } = {},
): Promise<T> {
  if (hasDirectAnthropicVision()) {
    return sendAnthropicJsonMessage<T>(prompt, options)
  }

  const text = await sendGatewayTextMessage({
    capability: "structured",
    prompt,
    options,
  })
  return parseJsonObject<T>(text, { debugLabel: "[wechat-parse]" })
}

export async function sendVisionMessage(
  prompt: string,
  images: VisionImageInput | VisionImageInput[],
  options: { maxTokens?: number; temperature?: number; system?: string } = {},
): Promise<string> {
  if (hasDirectAnthropicVision()) {
    return sendAnthropicVisionMessage(prompt, images, options)
  }

  return sendGatewayTextMessage({
    capability: "vision",
    prompt,
    images,
    options,
  })
}
