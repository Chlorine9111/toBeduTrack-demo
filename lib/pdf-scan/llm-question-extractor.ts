import { z } from "zod"
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router"
import { generateStructuredObject } from "@/lib/ai/structured-output"
import { cropImageBuffer } from "./image-crop"
import { storeImageBuffer } from "./mathpix-images"
import { parseQuestionsFromText, sanitizeOcrQuestionText } from "./question-parser"
import type {
  DifficultyLevel,
  QuestionOptions,
  QuestionType,
  RegionBox,
  RenderedPage,
  ScannedQuestion,
} from "./types"

export interface LlmExtractionInput {
  pageMarkdowns: Array<{ pageNumber: number; markdown: string }>
  pageImages: Array<Pick<RenderedPage, "pageNumber" | "buffer" | "width" | "height">>
  uploadId?: string
  teacherId?: string
}

export interface LlmExtractionOutput {
  questions: ScannedQuestion[]
  stats: {
    total: number
    byType: Record<string, number>
    averageConfidence: number
    pagesProcessed: number
    regexFallbackPages: number
  }
  timings: {
    totalMs: number
    extractionMs: number
    imageProcessingMs: number
  }
}

type FigureRegion = {
  page: number
  bbox: RegionBox | null
  description: string
}

type ExtractedQuestion = {
  questionNumber: number
  sourcePageNumber: number
  content: string
  questionType: QuestionType
  options: QuestionOptions | null
  subQuestions: Array<{ label: string; content: string }>
  linkedFigures: FigureRegion[]
  stemRegion: RegionBox | null
  optionImageRegions: Record<string, RegionBox> | null
  hasStemImage: boolean
  hasOptionImages: boolean
  difficulty: DifficultyLevel
  subject: string
  knowledgePoint: string
  confidence: number
}

const rawFigureSchema = z.object({
  page: z.number().default(1),
  bbox: z.array(z.number()).length(4).nullable().default(null),
  description: z.string().trim().min(1).max(240),
})

const rawOptionsSchema = z
  .object({
    A: z.string().max(2000).optional(),
    B: z.string().max(2000).optional(),
    C: z.string().max(2000).optional(),
    D: z.string().max(2000).optional(),
    E: z.string().max(2000).optional(),
  })
  .nullable()
  .default(null)

const rawQuestionSchema = z.object({
  questionNumber: z.number().default(0),
  content: z.string().trim().min(1),
  questionType: z.enum(["choice", "fill", "short_answer", "essay", "calculation", "proof"]).default("essay"),
  options: rawOptionsSchema,
  subQuestions: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(32),
        content: z.string().trim().min(1),
      }),
    )
    .default([]),
  linkedFigures: z.array(rawFigureSchema).default([]),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  subject: z.string().trim().max(120).default(""),
  knowledgePoint: z.string().trim().max(200).default(""),
  confidence: z.number().default(68),
  stemRegion: z.array(z.number()).length(4).nullable().default(null),
  optionImageRegions: z.record(z.string(), z.array(z.number()).length(4)).nullable().default(null),
  hasStemImage: z.boolean().default(false),
  hasOptionImages: z.boolean().default(false),
})

const pageExtractionSchema = z.object({
  questions: z.array(rawQuestionSchema).default([]),
})

type RawQuestion = z.infer<typeof rawQuestionSchema>

const IMAGE_REGION_PATTERN =
  /\[IMAGE_REGION:\s*page=(\d+),\s*bbox=\[(\d+),(\d+),(\d+),(\d+)\](?:,\s*desc="([^"]*)")?\]/g

const SYSTEM_PROMPT =
  "你是专业的试卷结构化解析系统。你会收到 OCR Markdown 和对应页面图片。所有文字以 OCR Markdown 为准，图片只用于理解图表、图片选项和 bbox。严格输出符合 schema 的结构化结果，不要输出解释。"

function normalizeConfidence(value: number) {
  if (!Number.isFinite(value)) return 68
  if (value <= 1) {
    return Math.round(Math.max(0, Math.min(1, value)) * 100)
  }
  return Math.round(Math.max(0, Math.min(100, value)))
}

function normalizeRegionBox(value: number[] | null | undefined): RegionBox | null {
  if (!value || value.length !== 4) return null

  const [x1, y1, x2, y2] = value.map((item) =>
    Number.isFinite(item) ? Math.max(0, Math.round(item)) : 0,
  )
  if (x2 <= x1 || y2 <= y1) return null
  return [x1, y1, x2, y2]
}

function hasImageRegionPlaceholder(value: string) {
  return value.includes("[IMAGE_REGION:")
}

export function normalizeExtractedQuestionOptions(
  value: Record<string, string | undefined> | null | undefined,
): QuestionOptions | null {
  if (!value) return null

  const entries = Object.entries(value).flatMap(([label, option]) => {
    const raw = option ?? ""
    if (hasImageRegionPlaceholder(raw)) {
      return [[label, raw.trim()] as const]
    }

    const normalized = sanitizeOcrQuestionText(raw)
    return normalized ? [[label, normalized] as const] : []
  })

  if (entries.length < 2) return null
  return Object.fromEntries(entries)
}

function normalizeFigureRegions(value: RawQuestion["linkedFigures"], fallbackPageNumber: number) {
  return value
    .map((item) => ({
      page: Math.max(1, Math.round(item.page || fallbackPageNumber)),
      bbox: normalizeRegionBox(item.bbox),
      description: item.description.trim() || `page-${fallbackPageNumber}-figure`,
    }))
    .filter((item) => item.description.length > 0)
}

function normalizeOptionImageRegions(
  value: RawQuestion["optionImageRegions"],
): Record<string, RegionBox> | null {
  if (!value) return null

  const entries = Object.entries(value).flatMap(([label, bbox]) => {
    const normalizedLabel = label.trim().toUpperCase()
    const normalizedBbox = normalizeRegionBox(bbox)
    if (!normalizedLabel || !normalizedBbox) return []
    return [[normalizedLabel, normalizedBbox] as const]
  })

  return entries.length > 0 ? Object.fromEntries(entries) : null
}

function normalizeExtractedQuestion(value: RawQuestion, pageNumber: number): ExtractedQuestion {
  return {
    questionNumber: Math.max(0, Math.round(value.questionNumber || 0)),
    sourcePageNumber: pageNumber,
    content: sanitizeOcrQuestionText(value.content),
    questionType: value.questionType,
    options: normalizeExtractedQuestionOptions(value.options),
    subQuestions: value.subQuestions.map((item) => ({
      label: item.label.trim(),
      content: sanitizeOcrQuestionText(item.content),
    })),
    linkedFigures: normalizeFigureRegions(value.linkedFigures, pageNumber),
    stemRegion: normalizeRegionBox(value.stemRegion),
    optionImageRegions: normalizeOptionImageRegions(value.optionImageRegions),
    hasStemImage: Boolean(value.hasStemImage),
    hasOptionImages: Boolean(value.hasOptionImages),
    difficulty: value.difficulty,
    subject: value.subject.trim(),
    knowledgePoint: value.knowledgePoint.trim(),
    confidence: normalizeConfidence(value.confidence),
  }
}

function toRegexFallbackQuestions(markdown: string, pageNumber: number): ExtractedQuestion[] {
  return parseQuestionsFromText(sanitizeOcrQuestionText(markdown)).map((question) => ({
    questionNumber: question.questionNumber,
    sourcePageNumber: pageNumber,
    content: question.originalContent,
    questionType: question.questionType,
    options: question.options,
    subQuestions: question.subQuestions ?? [],
    linkedFigures: (question.linkedFigures ?? []).map((figure) => ({
      page: pageNumber,
      bbox: null,
      description: figure,
    })),
    stemRegion: null,
    optionImageRegions: null,
    hasStemImage: false,
    hasOptionImages: false,
    difficulty: question.difficulty,
    subject: question.subject,
    knowledgePoint: question.knowledgePoint,
    confidence: question.confidence,
  }))
}

function buildExtractionPrompt(params: {
  pageNumber: number
  markdown: string
  width: number
  height: number
}) {
  const cleanedMarkdown = sanitizeOcrQuestionText(params.markdown)
  return `你会收到一页试卷的 OCR Markdown 和对应页面图片。

任务：把这一页中的题目拆成结构化结果。

规则：
1. 所有文字、公式、上下标、符号以 OCR Markdown 为准，不要重新 OCR 图片文字。
1.1 忽略版式命令和页眉页脚噪声，例如 \\section*{...}、\\title{...}、END OF PART A、Time-1 hour、4 Questions、NO CALCULATOR ... 这类不是题干的内容。
2. 页面图片只用于理解图表、函数图像、几何图、实验装置图、图片选项，以及估计 bbox。
3. 如果本页开头内容是上一页最后一题的延续，请把第一条的 questionNumber 设为 0。
4. 如果题目引用图片，请在 linkedFigures 中输出对象：
   { "page": ${params.pageNumber}, "bbox": [x1,y1,x2,y2], "description": "图片简述" }
5. 如果选项是图片（而不是文字），不要把图片内容翻译成文字写入 options。
   而是在 optionImageRegions 中输出每个选项的 bbox。
   options 中写简短的占位描述（如 "图片选项"），也可以留空字符串。
   questionType 必须为 "choice"。
6. content 里不要重复包含选项文本。
7. 跳过页眉、页脚、考试说明、答题卡、答案等非题目内容。
8. confidence 输出 0-100 的数字；如果你更习惯 0-1，也可以输出小数，系统会自动归一化。
9. 严禁重复：每道题只输出一次。不要把同一道题拆成"文字版"和"图片版"两道题。
   如果一道题的选项是图片，只输出一条记录，选项用 optionImageRegions 表示。
10. 图片区域识别：
   10.1 如果题干包含图片/图表/图形，设 hasStemImage=true，
       并在 stemRegion 中输出包含题干所有图片的最小外接矩形 bbox [x1,y1,x2,y2]。
   10.2 如果选项本身是图片，设 hasOptionImages=true，questionType 必须为 "choice"，
       并在 optionImageRegions 中输出每个选项图片的 bbox。
   10.3 bbox 坐标基于页面图片的像素尺寸（当前页 ${params.width} x ${params.height}）

当前页信息：
- pageNumber: ${params.pageNumber}
- imageSize: ${params.width} x ${params.height}

OCR Markdown:
${cleanedMarkdown || "(空)"}
`
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  worker: (item: TInput, index: number) => Promise<TOutput>,
) {
  const results = new Array<TOutput>(items.length)
  let cursor = 0

  const runWorker = async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index], index)
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length))
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()))
  return results
}

async function extractQuestionsFromPage(params: {
  pageNumber: number
  markdown: string
  imageBuffer: Buffer
  width: number
  height: number
}): Promise<{ questions: ExtractedQuestion[]; usedRegexFallback: boolean }> {
  const messages = [
    {
      role: "user" as const,
      content: [
        {
          type: "text" as const,
          text: buildExtractionPrompt(params),
        },
        {
          type: "image" as const,
          image: params.imageBuffer,
          mediaType: "image/png",
        },
      ],
    },
  ]

  let lastError: unknown
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const payload = await generateStructuredObject({
        model: getResolvedLanguageModelForTask("pdf_llm_parse"),
        schema: pageExtractionSchema,
        systemPrompt: SYSTEM_PROMPT,
        messages,
        maxTokens: 6144,
        temperature: 0,
        maxRetries: 1,
      })

      return {
        questions: payload.questions.map((item) => normalizeExtractedQuestion(item, params.pageNumber)),
        usedRegexFallback: false,
      }
    } catch (error) {
      lastError = error
      console.warn("[pdf-scan] LLM 页拆题失败", {
        pageNumber: params.pageNumber,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const fallbackQuestions = toRegexFallbackQuestions(params.markdown, params.pageNumber)
  console.warn("[pdf-scan] LLM 页拆题最终回退正则", {
    pageNumber: params.pageNumber,
    fallbackQuestionCount: fallbackQuestions.length,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  })

  return {
    questions: fallbackQuestions,
    usedRegexFallback: true,
  }
}

function mergeQuestionOptions(
  left: QuestionOptions | null,
  right: QuestionOptions | null,
): QuestionOptions | null {
  if (!left && !right) return null
  return {
    ...(left ?? {}),
    ...(right ?? {}),
  }
}

function mergeAcrossPages(pageResults: Array<{ pageNumber: number; questions: ExtractedQuestion[] }>) {
  const merged: ExtractedQuestion[] = []

  for (const page of pageResults) {
    if (page.questions.length === 0) continue

    const first = page.questions[0]
    const previous = merged[merged.length - 1]

    if (previous && first.questionNumber === 0) {
      merged[merged.length - 1] = {
        ...previous,
        content: [previous.content, first.content].filter(Boolean).join("\n"),
        options: mergeQuestionOptions(previous.options, first.options),
        subQuestions: [...previous.subQuestions, ...first.subQuestions],
        linkedFigures: [...previous.linkedFigures, ...first.linkedFigures],
        stemRegion: previous.stemRegion ?? first.stemRegion,
        optionImageRegions:
          previous.optionImageRegions || first.optionImageRegions
            ? {
                ...(previous.optionImageRegions ?? {}),
                ...(first.optionImageRegions ?? {}),
              }
            : null,
        hasStemImage: previous.hasStemImage || first.hasStemImage,
        hasOptionImages: previous.hasOptionImages || first.hasOptionImages,
        sourcePageNumber:
          previous.hasStemImage || previous.hasOptionImages
            ? previous.sourcePageNumber
            : first.sourcePageNumber ?? previous.sourcePageNumber,
        confidence: Math.max(previous.confidence, first.confidence),
      }
      merged.push(...page.questions.slice(1))
      continue
    }

    merged.push(...page.questions)
  }

  return merged
}

/**
 * 去除 LLM 对同一道题生成的重复记录。
 * 场景：LLM 可能对含图片的题生成"文字版"和"图片版"两条记录，题号相同。
 * 策略：同一题号保留信息更完整的那条（有选项/有图片区域的优先）。
 */
function deduplicateByQuestionNumber(questions: ExtractedQuestion[]): ExtractedQuestion[] {
  const grouped = new Map<number, ExtractedQuestion[]>()
  for (const q of questions) {
    const key = q.questionNumber
    if (!grouped.has(key)) {
      grouped.set(key, [])
    }
    grouped.get(key)!.push(q)
  }

  const result: ExtractedQuestion[] = []
  for (const [, group] of grouped) {
    if (group.length === 1) {
      result.push(group[0])
      continue
    }

    // 多条同题号记录：选择信息最完整的那条
    const scored = group.map((q) => {
      let score = 0
      if (q.options && Object.keys(q.options).length >= 2) score += 10
      if (q.hasOptionImages) score += 5
      if (q.hasStemImage) score += 3
      if (q.linkedFigures.length > 0) score += 2
      if (q.content.length > 20) score += 1
      return { q, score }
    })
    scored.sort((a, b) => b.score - a.score)
    result.push(scored[0].q)
  }

  // 按原始顺序排列
  return result.sort((a, b) => {
    const aIdx = questions.indexOf(a)
    const bIdx = questions.indexOf(b)
    return aIdx - bIdx
  })
}

/**
 * 从 OCR markdown 中提取所有可渲染的图片 URL。
 * Mathpix 返回 \includegraphics{url}，Mistral 返回 ![](url)。
 * persistMathpixImages 会把这些替换为真实的 Supabase Storage URL。
 */
function extractImageUrlsFromMarkdown(markdown: string): string[] {
  const urls: string[] = []
  const patterns = [
    /!\[[^\]]*\]\(([^)]+)\)/g,
    /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g,
  ]
  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(markdown)) !== null) {
      const url = (match[1] ?? "").trim()
      if (url && /^(https?:\/\/|\/)/.test(url)) {
        urls.push(url)
      }
    }
  }
  return urls
}

/**
 * 把 OCR markdown 中的图片 URL 回填到 LLM 提取的题目中。
 * LLM 会丢失图片引用（因为 structured output 不保留原始图片 URL），
 * 但 OCR markdown 中的 URL 已经是持久化后的真实 URL。
 */
function backfillImageUrlsFromMarkdown(
  questions: ExtractedQuestion[],
  pageMarkdowns: Array<{ pageNumber: number; markdown: string }>,
) {
  // 收集所有页面的图片 URL
  const allImageUrls: string[] = []
  for (const page of pageMarkdowns) {
    allImageUrls.push(...extractImageUrlsFromMarkdown(page.markdown))
  }

  if (allImageUrls.length === 0) return

  // 如果题目已有 linkedFigures 是真实 URL，不需要回填
  const questionsNeedingImages = questions.filter((q) => {
    const hasRealUrls = q.linkedFigures.some((f) => /^(https?:\/\/|\/)/.test(f.description))
    return !hasRealUrls && q.linkedFigures.length === 0
  })

  if (questionsNeedingImages.length === 0) return

  // 简单策略：按顺序分配图片给需要图片的题目
  // （更精确的方法需要匹配题号和 OCR 文本位置，但这里用简单策略先保证图片不丢）
  let urlCursor = 0
  for (const q of questions) {
    if (q.hasStemImage && q.linkedFigures.length === 0 && urlCursor < allImageUrls.length) {
      q.linkedFigures.push({
        page: q.sourcePageNumber,
        bbox: null,
        description: allImageUrls[urlCursor],
      })
      urlCursor += 1
    }
  }
}

function expandRegion(region: RegionBox, width: number, height: number) {
  const [x1, y1, x2, y2] = region
  const regionWidth = Math.max(1, x2 - x1)
  const regionHeight = Math.max(1, y2 - y1)
  const padX = Math.min(120, Math.max(24, Math.round(regionWidth * 0.12)))
  const padTop = Math.min(120, Math.max(24, Math.round(regionHeight * 0.12)))
  const padBottom = Math.min(140, Math.max(32, Math.round(regionHeight * 0.18)))
  return {
    x1: Math.max(0, x1 - padX),
    y1: Math.max(0, y1 - padTop),
    x2: Math.min(width, x2 + padX),
    y2: Math.min(height, y2 + padBottom),
  }
}

async function persistRegionImage(params: {
  region: RegionBox
  pageImage: Pick<RenderedPage, "buffer" | "width" | "height">
  uploadId?: string
  teacherId?: string
}) {
  if (!params.uploadId || !params.teacherId) {
    return null
  }

  const cropped = await cropImageBuffer(
    params.pageImage.buffer,
    expandRegion(params.region, params.pageImage.width, params.pageImage.height),
  ).catch(() => null)
  if (!cropped) return null

  return storeImageBuffer({
    buffer: cropped,
    uploadId: params.uploadId,
    teacherId: params.teacherId,
    contentType: "image/png",
  })
}

async function hydrateLinkedFigures(params: {
  figures: FigureRegion[]
  pageImages: Map<number, Pick<RenderedPage, "buffer" | "width" | "height">>
  uploadId?: string
  teacherId?: string
}) {
  const results = await Promise.all(
    params.figures.map(async (figure) => {
      if (!figure.bbox) return figure.description
      const pageImage = params.pageImages.get(figure.page)
      if (!pageImage) return figure.description

      const url = await persistRegionImage({
        region: figure.bbox,
        pageImage,
        uploadId: params.uploadId,
        teacherId: params.teacherId,
      })

      return url || figure.description
    }),
  )

  return Array.from(new Set(results.filter(Boolean)))
}

async function hydrateOptionImageRegions(params: {
  options: QuestionOptions | null
  pageImages: Map<number, Pick<RenderedPage, "buffer" | "width" | "height">>
  uploadId?: string
  teacherId?: string
}) {
  if (!params.options) return null

  const nextOptions: QuestionOptions = {}
  for (const [label, value] of Object.entries(params.options)) {
    if (!value) {
      nextOptions[label] = value
      continue
    }

    let replaced = value
    const matches = Array.from(value.matchAll(IMAGE_REGION_PATTERN))
    for (const match of matches) {
      const pageNumber = Number(match[1])
      const bbox: RegionBox = [
        Number(match[2]),
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
      ]
      const description = match[6]?.trim() || `选项 ${label}`
      const pageImage = params.pageImages.get(pageNumber)
      if (!pageImage) {
        replaced = replaced.replace(match[0], `(${description})`)
        continue
      }

      const url = await persistRegionImage({
        region: bbox,
        pageImage,
        uploadId: params.uploadId,
        teacherId: params.teacherId,
      })

      replaced = replaced.replace(match[0], url ? `![${description}](${url})` : `(${description})`)
    }

    nextOptions[label] = replaced
  }

  return nextOptions
}

async function persistStemRegionImage(params: {
  question: ExtractedQuestion
  pageImages: Map<number, Pick<RenderedPage, "buffer" | "width" | "height">>
  uploadId?: string
  teacherId?: string
}) {
  if (!params.question.hasStemImage || !params.question.stemRegion) return null

  const pageImage = params.pageImages.get(params.question.sourcePageNumber)
  if (!pageImage) return null

  return persistRegionImage({
    region: params.question.stemRegion,
    pageImage,
    uploadId: params.uploadId,
    teacherId: params.teacherId,
  })
}

async function persistOptionRegionImages(params: {
  question: ExtractedQuestion
  pageImages: Map<number, Pick<RenderedPage, "buffer" | "width" | "height">>
  uploadId?: string
  teacherId?: string
}) {
  if (!params.question.hasOptionImages || !params.question.optionImageRegions) {
    return {} as Record<string, string>
  }

  const pageImage = params.pageImages.get(params.question.sourcePageNumber)
  if (!pageImage) {
    return {} as Record<string, string>
  }

  const entries = await Promise.all(
    Object.entries(params.question.optionImageRegions).map(async ([label, bbox]) => {
      const url = await persistRegionImage({
        region: bbox,
        pageImage,
        uploadId: params.uploadId,
        teacherId: params.teacherId,
      })
      return url ? [label, url] as const : null
    }),
  )

  return Object.fromEntries(entries.filter(Boolean) as Array<[string, string]>)
}

function buildOptionLabels(
  options: QuestionOptions | null,
  optionImageRegions: Record<string, RegionBox> | null,
) {
  const labels = new Set<string>()
  for (const label of Object.keys(options ?? {})) {
    const normalized = label.trim().toUpperCase()
    if (normalized) labels.add(normalized)
  }
  for (const label of Object.keys(optionImageRegions ?? {})) {
    const normalized = label.trim().toUpperCase()
    if (normalized) labels.add(normalized)
  }

  const ordered = ["A", "B", "C", "D", "E"].filter((label) => labels.has(label))
  for (const label of labels) {
    if (!ordered.includes(label)) {
      ordered.push(label)
    }
  }
  return ordered
}

/**
 * 从 OCR markdown 中解析选项，包含图片引用。
 * 返回 { questionNumber: { A: "![](url)", B: "text", ... } }
 */
function parseOptionsFromOcrMarkdown(markdown: string): Map<number, Record<string, string>> {
  const result = new Map<number, Record<string, string>>()
  const lines = markdown.split("\n")
  const questionNumPattern = /^(\d+)\.\s*/
  const optionPattern = /^\(([A-E])\)\s*(.*)/

  let currentQuestionNum = 0
  let currentOptionLabel: string | null = null
  let currentOptions: Record<string, string> = {}

  for (const line of lines) {
    const trimmed = line.trim()

    const qMatch = trimmed.match(questionNumPattern)
    if (qMatch && trimmed.startsWith(qMatch[0].trimStart())) {
      if (currentQuestionNum > 0 && Object.keys(currentOptions).length > 0) {
        result.set(currentQuestionNum, currentOptions)
      }
      currentQuestionNum = parseInt(qMatch[1], 10)
      currentOptions = {}
      currentOptionLabel = null
      continue
    }

    const optMatch = trimmed.match(optionPattern)
    if (optMatch) {
      currentOptionLabel = optMatch[1]
      currentOptions[currentOptionLabel] = optMatch[2].trim()
      continue
    }

    // 续行：如果当前在某个选项下，追加内容
    if (currentOptionLabel && trimmed) {
      currentOptions[currentOptionLabel] = currentOptions[currentOptionLabel]
        ? `${currentOptions[currentOptionLabel]}\n${trimmed}`
        : trimmed
    }
  }

  if (currentQuestionNum > 0 && Object.keys(currentOptions).length > 0) {
    result.set(currentQuestionNum, currentOptions)
  }

  return result
}

function hasPlaceholderImageOnlyOptions(options: QuestionOptions | null | undefined) {
  if (!options) return false

  const IMAGE_PATTERN = /!\[[^\]]*\]\([^)]+\)/
  const IMAGE_PLACEHOLDER_PATTERN =
    /^(?:image|img|picture|photo|figure|graph|diagram|chart|图片|图像|图片选项|图形|图表)$/i

  const values = Object.values(options)
    .map((value) => (value ?? "").trim())
    .filter(Boolean)

  if (values.length < 2) return false

  return values.every((text) => {
    if (IMAGE_PATTERN.test(text)) return false
    const normalized = text.replace(/\s+/g, " ").trim()
    if (IMAGE_PLACEHOLDER_PATTERN.test(normalized)) return true
    return normalized.length <= 12 && /^[A-Za-z\u4e00-\u9fff\s]+$/.test(normalized)
  })
}

/**
 * 当 LLM 输出的选项是占位文字（如 "图片选项"、"Image"）但 OCR markdown 中有图片引用时，
 * 用 OCR 的版本替换。
 */
export function backfillOptionsFromOcrMarkdown(
  questions: ExtractedQuestion[],
  pageMarkdowns: Array<{ pageNumber: number; markdown: string }>,
) {
  const allMarkdown = pageMarkdowns.map((p) => p.markdown).join("\n")
  const ocrOptions = parseOptionsFromOcrMarkdown(allMarkdown)

  const IMAGE_PATTERN = /!\[[^\]]*\]\([^)]+\)/

  for (const question of questions) {
    const ocrOpts = ocrOptions.get(question.questionNumber)
    if (!ocrOpts) continue

    // OCR 选项中是否有图片引用？
    const ocrHasImages = Object.values(ocrOpts).some((v) => IMAGE_PATTERN.test(v))
    if (!ocrHasImages) continue

    const shouldBackfill =
      !question.options || hasPlaceholderImageOnlyOptions(question.options)
    if (!shouldBackfill) continue

    question.hasOptionImages = true
    question.questionType = "choice"

    // 替换：用 OCR 选项覆盖 LLM 的占位选项或缺失选项
    question.options = question.options ?? {}
    for (const [label, text] of Object.entries(ocrOpts)) {
      if (text) {
        question.options[label] = text
      }
    }
  }
}

function buildStats(questions: ScannedQuestion[], pagesProcessed: number, regexFallbackPages: number) {
  const byType: Record<string, number> = {}
  for (const question of questions) {
    byType[question.questionType] = (byType[question.questionType] ?? 0) + 1
  }

  return {
    total: questions.length,
    byType,
    averageConfidence:
      questions.length > 0
        ? Math.round(
            questions.reduce((sum, question) => sum + question.confidence, 0) / questions.length,
          )
        : 0,
    pagesProcessed,
    regexFallbackPages,
  }
}

export async function extractQuestionsWithLlm(
  input: LlmExtractionInput,
): Promise<LlmExtractionOutput> {
  const startedAt = Date.now()
  const pageImages = new Map(
    input.pageImages.map((page) => [
      page.pageNumber,
      {
        buffer: page.buffer,
        width: page.width,
        height: page.height,
      },
    ]),
  )
  const concurrency = Math.max(
    1,
    Math.min(
      4,
      Number(process.env.PDF_LLM_PAGE_CONCURRENCY || process.env.PDF_VISION_PAGE_CONCURRENCY || 3),
    ),
  )

  const extractionStartedAt = Date.now()
  const pageResults = await mapWithConcurrency(input.pageImages, concurrency, async (pageImage) => {
    const markdown =
      sanitizeOcrQuestionText(
        input.pageMarkdowns.find((page) => page.pageNumber === pageImage.pageNumber)?.markdown || "",
      )
    const pageResult = await extractQuestionsFromPage({
      pageNumber: pageImage.pageNumber,
      markdown,
      imageBuffer: pageImage.buffer,
      width: pageImage.width,
      height: pageImage.height,
    })

    return {
      pageNumber: pageImage.pageNumber,
      questions: pageResult.questions,
      usedRegexFallback: pageResult.usedRegexFallback,
    }
  })
  const extractionMs = Date.now() - extractionStartedAt
  const regexFallbackPages = pageResults.filter((page) => page.usedRegexFallback).length

  const mergedQuestions = deduplicateByQuestionNumber(
    mergeAcrossPages(
      pageResults.sort((left, right) => left.pageNumber - right.pageNumber),
    ),
  )

  // 从 OCR markdown 回填图片到 LLM 结果
  backfillImageUrlsFromMarkdown(mergedQuestions, input.pageMarkdowns)
  backfillOptionsFromOcrMarkdown(mergedQuestions, input.pageMarkdowns)

  const imageStartedAt = Date.now()
  const questions = await Promise.all(
    mergedQuestions.map(async (question, index) => {
      const legacyOptions = await hydrateOptionImageRegions({
        options: question.options,
        pageImages,
        uploadId: input.uploadId,
        teacherId: input.teacherId,
      })

      const stemImageUrl = await persistStemRegionImage({
        question,
        pageImages,
        uploadId: input.uploadId,
        teacherId: input.teacherId,
      })

      const optionImageUrls = await persistOptionRegionImages({
        question,
        pageImages,
        uploadId: input.uploadId,
        teacherId: input.teacherId,
      })

      // 检查新路径（bbox 截图）是否成功产出了有效的图片 URL
      const hasValidOptionImages = Object.keys(optionImageUrls).length >= 2
      const hasValidStemImage = Boolean(stemImageUrl)

      // 如果新路径失败（bbox 不可用），fallback 到旧路径
      const shouldUseLegacy =
        (!hasValidOptionImages && !hasValidStemImage) ||
        (!question.hasStemImage && !question.hasOptionImages)

      const optionLabels = buildOptionLabels(legacyOptions, question.optionImageRegions)
      const finalOptions = optionLabels.reduce<QuestionOptions>((acc, label) => {
        const optionImageUrl = optionImageUrls[label]

        if (optionImageUrl) {
          const text = typeof legacyOptions?.[label] === "string" ? legacyOptions[label]?.trim() : ""
          acc[label] = text
            ? `![选项 ${label}](${optionImageUrl})\n${text}`
            : `![选项 ${label}](${optionImageUrl})`
          return acc
        }

        // 新路径无图片 URL → 使用 legacyOptions（可能包含 IMAGE_REGION 或原始文本）
        const legacyText = typeof legacyOptions?.[label] === "string" ? legacyOptions[label]?.trim() : ""
        if (legacyText) {
          acc[label] = legacyText
          return acc
        }

        // 最后 fallback：使用 LLM 原始 options 文本
        const rawText = typeof question.options?.[label] === "string" ? question.options[label]?.trim() : ""
        if (rawText) {
          acc[label] = rawText
        }

        return acc
      }, {})

      const legacyFigures = shouldUseLegacy
        ? await hydrateLinkedFigures({
            figures: question.linkedFigures,
            pageImages,
            uploadId: input.uploadId,
            teacherId: input.teacherId,
          })
        : []

      const normalizedOptions = Object.keys(finalOptions).length >= 2 ? finalOptions : null

      return {
        questionNumber: index + 1,
        content: question.content,
        questionType:
          question.hasOptionImages || (normalizedOptions && Object.keys(normalizedOptions).length >= 2)
            ? "choice"
            : question.questionType,
        difficulty: question.difficulty,
        subject: question.subject,
        knowledgePoint: question.knowledgePoint,
        options: normalizedOptions,
        confidence: question.confidence,
        subQuestions: question.subQuestions,
        linkedFigures: stemImageUrl ? [stemImageUrl] : legacyFigures,
        rawQuestionNumber:
          question.questionNumber > 0 ? String(question.questionNumber) : String(index + 1),
        sourcePageNumber: question.sourcePageNumber,
        sourceType: "pdf" as const,
      }
    }),
  )
  const imageProcessingMs = Date.now() - imageStartedAt

  return {
    questions,
    stats: buildStats(questions, input.pageImages.length, regexFallbackPages),
    timings: {
      totalMs: Date.now() - startedAt,
      extractionMs,
      imageProcessingMs,
    },
  }
}
