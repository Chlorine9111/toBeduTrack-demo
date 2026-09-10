import Anthropic from "@anthropic-ai/sdk";
import { resolveAnthropicBaseUrl, resolveDirectAnthropicApiKey } from "@/lib/ai/provider-registry";

export type VisionImageInput = {
  mediaType: string;
  data: string;
};

type VisionOptions = {
  maxTokens?: number;
  temperature?: number;
  system?: string;
};

type ImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (cachedClient) return cachedClient;

  const apiKey = resolveDirectAnthropicApiKey();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  cachedClient = new Anthropic({
    apiKey,
    baseURL: resolveAnthropicBaseUrl(),
    maxRetries: 3,
    timeout: 60_000,
  });

  return cachedClient;
}

const DEFAULT_MODEL =
  process.env.ANTHROPIC_VISION_MODEL ||
  process.env.ANTHROPIC_MODEL ||
  "claude-sonnet-4-5-20250929";

function extractFirstTextBlock(response: Anthropic.Messages.Message) {
  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text : "";
}

function extractJsonPayload(content: string) {
  const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
  return (jsonMatch ? jsonMatch[1] : content).trim();
}

function parseJsonObject<T>(content: string, options: { debugLabel?: string } = {}): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonPayload(content));
  } catch {
    if (options.debugLabel) {
      console.error(
        `${options.debugLabel} JSON parse failed. Content length: ${content.length}, first 500 chars:`,
        content.slice(0, 500),
      );
      console.error(`${options.debugLabel} Last 200 chars:`, content.slice(-200));
    }
    throw new Error(`Claude returned invalid JSON: ${content.slice(0, 200)}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`Claude returned non-object JSON: ${typeof parsed}`);
  }

  return parsed as T;
}

function buildImageContent(
  images: VisionImageInput | VisionImageInput[],
): Anthropic.Messages.ContentBlockParam[] {
  const imageArray = Array.isArray(images) ? images : [images];

  return imageArray.map((image) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: image.mediaType as ImageMediaType,
      data: image.data,
    },
  }));
}

export async function sendAnthropicVisionJsonMessage<T>(
  prompt: string,
  image: VisionImageInput,
  options: VisionOptions = {},
): Promise<T> {
  const client = getClient();

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: options.maxTokens ?? 5120,
    temperature: options.temperature ?? 0,
    system: options.system || undefined,
    messages: [
      {
        role: "user",
        content: [
          ...buildImageContent(image),
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const content = extractFirstTextBlock(response);
  if (!content) {
    throw new Error("Claude Vision returned empty response");
  }

  return parseJsonObject<T>(content);
}

export async function sendAnthropicJsonMessage<T>(
  prompt: string,
  options: VisionOptions = {},
): Promise<T> {
  const client = getClient();

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: options.maxTokens ?? 5120,
    temperature: options.temperature ?? 0,
    system: options.system || undefined,
    messages: [{ role: "user", content: prompt }],
  });

  const content = extractFirstTextBlock(response);
  if (!content) {
    throw new Error("Claude returned empty response");
  }

  return parseJsonObject<T>(content, { debugLabel: "[anthropic-vision]" });
}

export async function sendAnthropicVisionMessage(
  prompt: string,
  images: VisionImageInput | VisionImageInput[],
  options: VisionOptions = {},
): Promise<string> {
  const client = getClient();

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: options.maxTokens ?? 5120,
    temperature: options.temperature ?? 0.2,
    system: options.system || undefined,
    messages: [
      {
        role: "user",
        content: [
          ...buildImageContent(images),
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  return extractFirstTextBlock(response);
}
