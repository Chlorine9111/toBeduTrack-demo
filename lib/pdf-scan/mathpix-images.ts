import crypto from 'node:crypto'
import { createAdminSupabaseClient } from "@/lib/supabase/admin"

const IMAGE_BUCKET = process.env.QUESTION_IMAGE_BUCKET ?? 'pdfs'
const IMAGE_PREFIX = 'question-images'
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

const INCLUDE_GRAPHICS_REGEX = /\\includegraphics(?:\[[^\]]*])?\{([^}]+)\}/g
const MARKDOWN_IMAGE_REGEX = /!\[[^\]]*]\(([^)]+)\)/g
const OPTION_FIGURE_BLOCK_REGEX =
  /\\begin\{figure\}[\s\S]*?\\caption\{\(([A-Ea-e])\)\}[\s\S]*?\\includegraphics(?:\[[^\]]*])?\{([^}]+)\}[\s\S]*?\\end\{figure\}/g

function isLikelyUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function isAlreadyStoredUrl(url: string): boolean {
  return /\/api\/pdf\/scan-image\?/i.test(url)
}

function buildStoredImageUrl(storagePath: string): string {
  return `/api/pdf/scan-image?path=${encodeURIComponent(storagePath)}`
}

export function rewriteMathpixImageReferences(content: string, mappings: Record<string, string>) {
  if (!content) return content

  let updated = content

  updated = updated.replace(
    OPTION_FIGURE_BLOCK_REGEX,
    (_match, label: string, url: string) => {
      const normalized = url?.trim()
      const target = (normalized && mappings[normalized]) || normalized || ''
      const optionLabel = (label || '').trim().toUpperCase()
      if (!target || !optionLabel) return ''
      return `(${optionLabel}) ![选项 ${optionLabel}](${target})`
    },
  )

  updated = updated.replace(INCLUDE_GRAPHICS_REGEX, (_match, url: string) => {
    const normalized = url?.trim()
    const target = (normalized && mappings[normalized]) || normalized || ''
    if (!target) return ''
    return `![](${target})`
  })

  updated = updated
    .replace(/\\begin\{figure\}/g, '')
    .replace(/\\end\{figure\}/g, '')
    .replace(/\\captionsetup\{[^}]*\}/g, '')
    .replace(/\\caption\{[^}]*\}/g, '')
    .replace(/\n{3,}/g, '\n\n')

  return updated
}

function guessExtension(contentType: string | null, url: string): string {
  if (contentType) {
    const lower = contentType.toLowerCase()
    if (lower.includes('image/jpeg')) return 'jpg'
    if (lower.includes('image/png')) return 'png'
    if (lower.includes('image/webp')) return 'webp'
    if (lower.includes('image/gif')) return 'gif'
    if (lower.includes('image/svg+xml')) return 'svg'
    if (lower.includes('image/bmp')) return 'bmp'
    if (lower.includes('image/tiff')) return 'tiff'
  }

  try {
    const pathName = new URL(url).pathname
    const match = pathName.match(/\.([a-zA-Z0-9]+)$/)
    if (match?.[1]) {
      return match[1].toLowerCase()
    }
  } catch {
    // ignore
  }

  return 'png'
}

async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string | null } | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) return null

    const contentType = response.headers.get('content-type')
    if (contentType && !contentType.toLowerCase().startsWith('image/')) {
      return null
    }

    const arrayBuffer = await response.arrayBuffer()
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
      return null
    }

    return { buffer: Buffer.from(arrayBuffer), contentType }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export async function storeImageBuffer(params: {
  buffer: Buffer
  uploadId: string
  teacherId: string
  contentType?: string | null
}): Promise<string | null> {
  const { buffer, uploadId, teacherId, contentType } = params
  const supabase = createAdminSupabaseClient()

  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 32)
  const ext = guessExtension(contentType ?? null, `hash.${hash}`)
  const path = `${IMAGE_PREFIX}/${teacherId}/${uploadId}/${hash}.${ext}`

  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, buffer, {
      contentType: contentType ?? undefined,
      upsert: true,
    })

  if (error) {
    return null
  }

  return buildStoredImageUrl(path)
}

export async function persistMathpixImages(params: {
  content: string
  uploadId: string
  teacherId: string
}): Promise<{ content: string; mappings: Record<string, string> }> {
  const { content, uploadId, teacherId } = params
  if (!content) {
    return { content, mappings: {} }
  }

  const urls = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = INCLUDE_GRAPHICS_REGEX.exec(content)) !== null) {
    const url = match[1]?.trim()
    if (url) urls.add(url)
  }

  while ((match = MARKDOWN_IMAGE_REGEX.exec(content)) !== null) {
    const url = match[1]?.trim()
    if (url) urls.add(url)
  }

  if (urls.size === 0) {
    return { content, mappings: {} }
  }

  const mappings: Record<string, string> = {}
  const resolvedEntries = await Promise.all(
    Array.from(urls).map(async (url) => {
      if (!isLikelyUrl(url) || isAlreadyStoredUrl(url)) {
        return null
      }

      const image = await downloadImage(url)
      if (!image) {
        return null
      }

      const storedUrl = await storeImageBuffer({
        buffer: image.buffer,
        uploadId,
        teacherId,
        contentType: image.contentType,
      })

      if (!storedUrl) {
        return null
      }

      return [url, storedUrl] as const
    }),
  )

  for (const entry of resolvedEntries) {
    if (!entry) continue
    mappings[entry[0]] = entry[1]
  }

  let rewrittenContent = content
  for (const [original, replacement] of Object.entries(mappings)) {
    rewrittenContent = rewrittenContent.split(original).join(replacement)
  }

  const updated = rewriteMathpixImageReferences(rewrittenContent, mappings)

  return { content: updated, mappings }
}

/**
 * 持久化 Mistral OCR 返回的 base64 图片。
 * 把 pages[].images 里的 base64 存到 Storage，
 * 同时替换每页 markdown 里的本地图片引用（如 `![](img-0.jpeg)`）为 Storage URL。
 */
export async function persistMistralOcrImages(params: {
  pages: Array<{
    pageNumber: number
    markdown: string
    images: Array<{ name: string; base64: string }>
  }>
  uploadId: string
  teacherId: string
}): Promise<{
  pages: Array<{ pageNumber: number; markdown: string }>
  totalPersisted: number
}> {
  const { uploadId, teacherId } = params
  let totalPersisted = 0

  const updatedPages = await Promise.all(
    params.pages.map(async (page) => {
      if (page.images.length === 0) {
        return { pageNumber: page.pageNumber, markdown: page.markdown }
      }

      let markdown = page.markdown
      for (const img of page.images) {
        const base64Data = img.base64.replace(/^data:image\/\w+;base64,/, "")
        const buffer = Buffer.from(base64Data, "base64")
        const contentType = img.base64.startsWith("data:image/png")
          ? "image/png"
          : "image/jpeg"

        const storedUrl = await storeImageBuffer({
          buffer,
          uploadId: `${uploadId}-p${page.pageNumber}`,
          teacherId,
          contentType,
        })

        if (storedUrl) {
          // 替换 markdown 中的本地引用：![alt](img-0.jpeg) → ![alt](storedUrl)
          if (img.name) {
            markdown = markdown.split(`(${img.name})`).join(`(${storedUrl})`)
          }
          totalPersisted++
        }
      }

      return { pageNumber: page.pageNumber, markdown }
    }),
  )

  return { pages: updatedPages, totalPersisted }
}
