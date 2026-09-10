// PDF 扫描 AI 服务层 — Gemini / Claude Vision wrapper
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

type PdfModelTask = "pdf_vision" | "pdf_parse" | "pdf_llm_parse"

function isGeminiModelForTask(task: PdfModelTask) {
  const modelId = getModelForTask(task)
  return modelId.startsWith("google/")
}

/**
 * 判断当前 pdf_vision 任务是否应走直连 Anthropic 路径。
 * Gemini 模型必须走 gateway，由 provider-registry 自动优先选择 Google 官方 API。
 */
function shouldUseDirectAnthropic(modelTask: PdfModelTask) {
  if (!hasDirectAnthropicVision()) return false
  if (isGeminiModelForTask(modelTask)) return false
  return true
}

export function hasPdfVisionProvider() {
  // Gemini 模型: 检查 gateway / provider-registry 是否可用
  if (isGeminiModelForTask("pdf_vision")) {
    try {
      resolveLanguageModel(getModelForTask("pdf_vision"))
      return true
    } catch {
      return false
    }
  }
  // Claude 模型: 优先直连 Anthropic，回退 gateway
  if (hasDirectAnthropicVision()) return true
  try {
    resolveLanguageModel(getModelForTask("pdf_vision"))
    return true
  } catch {
    return false
  }
}

export function hasPdfLlmParseProvider() {
  if (isGeminiModelForTask("pdf_llm_parse")) {
    try {
      resolveLanguageModel(getModelForTask("pdf_llm_parse"))
      return true
    } catch {
      return false
    }
  }

  if (hasDirectAnthropicVision()) return true
  try {
    resolveLanguageModel(getModelForTask("pdf_llm_parse"))
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
  modelTask: PdfModelTask
  prompt: string
  images?: VisionImageInput | VisionImageInput[]
  options?: { maxTokens?: number; temperature?: number; system?: string }
}) {
  const modelId = getModelForTask(params.modelTask)
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

/**
 * 发送带图片的 JSON 请求到 Vision 模型（默认 Gemini 3.1 Pro）
 * 用于版面分析和 OCR 识别
 */
export async function sendVisionJsonMessage<T>(
  prompt: string,
  image: VisionImageInput,
  options: { maxTokens?: number; temperature?: number; system?: string } = {},
): Promise<T> {
  if (shouldUseDirectAnthropic("pdf_vision")) {
    return sendAnthropicVisionJsonMessage<T>(prompt, image, options)
  }

  const text = await sendGatewayTextMessage({
    capability: "vision",
    modelTask: "pdf_vision",
    prompt,
    images: image,
    options,
  })
  return parseJsonObject<T>(text, { debugLabel: "[pdf-scan-vision]" })
}

/**
 * 发送纯文本 JSON 请求
 * 用于题目结构化解析（pdf_parse 仍走 Claude）
 */
export async function sendJsonMessage<T>(
  prompt: string,
  options: { maxTokens?: number; temperature?: number; system?: string } = {},
): Promise<T> {
  if (shouldUseDirectAnthropic("pdf_parse")) {
    return sendAnthropicJsonMessage<T>(prompt, options)
  }

  const text = await sendGatewayTextMessage({
    capability: "structured",
    modelTask: "pdf_parse",
    prompt,
    options,
  })
  return parseJsonObject<T>(text, { debugLabel: "[pdf-scan-parse]" })
}

/**
 * 发送带图片的纯文本请求到 Vision 模型（默认 Gemini 3.1 Pro）
 * 用于 OCR 文字识别
 */
export async function sendVisionMessage(
  prompt: string,
  image: VisionImageInput,
  options: { maxTokens?: number; temperature?: number; system?: string } = {},
): Promise<string> {
  if (shouldUseDirectAnthropic("pdf_vision")) {
    return sendAnthropicVisionMessage(prompt, image, options)
  }

  return sendGatewayTextMessage({
    capability: "vision",
    modelTask: "pdf_vision",
    prompt,
    images: image,
    options,
  })
}
