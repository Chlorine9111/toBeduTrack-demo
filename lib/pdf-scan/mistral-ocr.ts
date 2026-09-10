import { createDeadlineSignal } from "@/lib/runtime/deadline"
import { createTimeoutError, createUpstreamUnavailableError } from "@/lib/runtime/app-error"
import { runWithRetry } from "@/lib/runtime/retry"

export interface MistralOcrPageImage {
  name: string
  base64: string
}

export interface MistralOcrPage {
  pageNumber: number
  markdown: string
  images: MistralOcrPageImage[]
  dimensions: {
    width: number
    height: number
  }
}

export interface MistralOcrResult {
  content: string
  pages: MistralOcrPage[]
  model: string
  usageInfo: {
    pagesProcessed: number
  }
}

type MistralOcrPagePayload = {
  index?: number
  markdown?: string
  dimensions?: {
    width?: number
    height?: number
  }
  blocks?: Array<{
    content?: string
    text?: string
  }>
}

const MISTRAL_OCR_ENDPOINT = "https://api.mistral.ai/v1/ocr"
const DEFAULT_MODEL = "mistral-ocr-latest"
const DEFAULT_TIMEOUT_MS = 120_000

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  return fallback
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function getApiKey() {
  return process.env.MISTRAL_API_KEY?.trim() || ""
}

function getModel() {
  return process.env.MISTRAL_OCR_MODEL?.trim() || DEFAULT_MODEL
}

function buildDataUrl(buffer: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`
}

function buildErrorDetail(payload: unknown) {
  const data = asObject(payload)

  const nestedError = asObject(data.error)
  return (
    readString(nestedError.message) ||
    readString(data.message) ||
    readString(data.detail) ||
    readString(data.error) ||
    ""
  )
}

function parseJsonPayload(rawText: string) {
  if (!rawText.trim()) return {}

  try {
    return JSON.parse(rawText)
  } catch {
    return { message: rawText.trim() }
  }
}

function normalizePageMarkdown(page: MistralOcrPagePayload) {
  const markdown = readString(page.markdown)
  if (markdown) return markdown

  const blocks = Array.isArray(page.blocks) ? page.blocks : []
  return blocks
    .map((block) => {
      const data = asObject(block)
      return readString(data.content) || readString(data.text)
    })
    .filter(Boolean)
    .join("\n")
    .trim()
}

function parseImages(raw: unknown): MistralOcrPageImage[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const obj = asObject(item)
      const name = readString(obj.name)
      const base64 = readString(obj.base64) || readString(obj.image_base64)
      if (!base64) return null
      return { name, base64 }
    })
    .filter((item): item is MistralOcrPageImage => item !== null)
}

function inlineTableReferences(markdown: string, tables: unknown): string {
  if (!Array.isArray(tables) || tables.length === 0) return markdown

  let result = markdown
  for (let i = 0; i < tables.length; i++) {
    const tableContent = typeof tables[i] === "string"
      ? tables[i]
      : typeof tables[i] === "object" && tables[i] !== null
        ? readString((tables[i] as Record<string, unknown>).html) ||
          readString((tables[i] as Record<string, unknown>).markdown) ||
          readString((tables[i] as Record<string, unknown>).content) ||
          JSON.stringify(tables[i])
        : ""
    if (!tableContent) continue

    // 替换 [tbl-N.html](tbl-N.html) 或 [tbl-N.md](tbl-N.md) 引用
    result = result
      .replace(`[tbl-${i}.html](tbl-${i}.html)`, tableContent)
      .replace(`[tbl-${i}.md](tbl-${i}.md)`, tableContent)
  }
  return result
}

function toPage(page: MistralOcrPagePayload, fallbackIndex: number): MistralOcrPage | null {
  let markdown = normalizePageMarkdown(page)
  if (!markdown) return null

  // 内联表格引用
  markdown = inlineTableReferences(markdown, (page as Record<string, unknown>).tables)

  const dimensions = asObject(page.dimensions)
  const rawIndex = typeof page.index === "number" ? page.index : fallbackIndex

  return {
    pageNumber: rawIndex + 1,
    markdown,
    images: parseImages((page as Record<string, unknown>).images),
    dimensions: {
      width: readNumber(dimensions.width),
      height: readNumber(dimensions.height),
    },
  }
}

async function requestMistralOcr(body: Record<string, unknown>, failureLabel: string): Promise<MistralOcrResult> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY 未配置")
  }

  const deadline = createDeadlineSignal({
    timeoutMs: DEFAULT_TIMEOUT_MS,
    reason: `${failureLabel}>timeout`,
  })

  try {
    const response = await runWithRetry(async () => {
      const nextResponse = await fetch(MISTRAL_OCR_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: deadline.signal,
      })

      if ([429, 502, 503, 504].includes(nextResponse.status)) {
        const rawText = await nextResponse.text()
        const payload = parseJsonPayload(rawText)
        const detail = buildErrorDetail(payload)
        if (nextResponse.status === 429) {
          throw createUpstreamUnavailableError(
            `${failureLabel}频率受限: ${detail || nextResponse.status}`,
            "mistral-ocr",
          )
        }

        throw createUpstreamUnavailableError(
          `${failureLabel}暂时不可用: ${detail || nextResponse.status}`,
          "mistral-ocr",
        )
      }

      return nextResponse
    }, {
      retries: 2,
      baseDelayMs: 1000,
      maxDelayMs: 4000,
    })

    const rawText = await response.text()
    const payload = parseJsonPayload(rawText)

    if (!response.ok) {
      const detail = buildErrorDetail(payload)
      throw new Error(
        `${failureLabel}失败: ${response.status}${detail ? ` ${detail}` : ""}`,
      )
    }

    const data = asObject(payload)
    const rawPages = Array.isArray(data.pages) ? data.pages : []
    const pages = rawPages
      .map((item, index) => toPage(asObject(item) as MistralOcrPagePayload, index))
      .filter((item): item is MistralOcrPage => item !== null)

    const usageInfo = asObject(data.usage_info)
    const fallbackUsage = asObject(data.usage)

    return {
      content: pages.map((page) => page.markdown).join("\n\n").trim() || "(未识别到文本内容)",
      pages,
      model: readString(data.model) || getModel(),
      usageInfo: {
        pagesProcessed:
          readNumber(usageInfo.pages_processed) ||
          readNumber(fallbackUsage.pages_processed) ||
          pages.length,
      },
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw createTimeoutError(
        `${failureLabel}超时（>${DEFAULT_TIMEOUT_MS / 1000}s）`,
        "mistral-ocr",
      )
    }
    if (error instanceof Error) {
      throw error
    }
    throw createUpstreamUnavailableError(`${failureLabel}失败`, "mistral-ocr")
  } finally {
    deadline.clear()
  }
}

export function hasMistralOcrCredentials(): boolean {
  return Boolean(getApiKey())
}

export async function ocrPdfWithMistral(pdfBuffer: Buffer, fileName: string): Promise<MistralOcrResult> {
  return requestMistralOcr(
    {
      model: getModel(),
      document: {
        type: "document_url",
        document_url: buildDataUrl(pdfBuffer, "application/pdf"),
      },
      table_format: "markdown",
      include_image_base64: true,
    },
    `Mistral OCR（PDF: ${fileName}）`,
  )
}

export async function ocrImageWithMistral(imageBuffer: Buffer, mimeType: string): Promise<string> {
  const result = await requestMistralOcr(
    {
      model: getModel(),
      document: {
        type: "image_url",
        image_url: buildDataUrl(imageBuffer, mimeType || "image/jpeg"),
      },
      table_format: "html",
      include_image_base64: true,
    },
    "Mistral OCR（图片）",
  )

  return result.content
}
