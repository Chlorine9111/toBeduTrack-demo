import { renderPdfPages } from "./pdf-render"
import { sendVisionJsonMessage } from "./ai-vision"
import { cropImageBuffer } from "./image-crop"
import { storeImageBuffer } from "./mathpix-images"
import { stripExtractedOptionsFromContent } from "./question-parser"
import { detectPageLayout, normalizeLayout } from "./vision-layout"
import type { LayoutQuestion, OptionRegion, RegionBox, VisionParsedQuestion, QuestionType, DifficultyLevel } from "./types"

/**
 * 直接提取模式 — 每页发送 1 次 Vision 请求，让 Claude 直接提取所有题目
 * 比 region-based 模式快 5-10 倍，准确率更高
 */

interface ExtractedQuestion {
  questionNumber: number
  content: string
  questionType: "choice" | "fill" | "essay" | "calculation" | "proof"
  options: Record<string, string> | null
  subQuestions?: Array<{ label: string; content: string }>
  linkedFigures?: string[]
  difficulty: "easy" | "medium" | "hard" | "expert"
  subject: string
  knowledgePoint: string
  confidence: number
}

interface PageExtractionResult {
  questions: ExtractedQuestion[]
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  worker: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results: TOutput[] = new Array(items.length)
  let cursor = 0

  const runOne = async () => {
    while (cursor < items.length) {
      const currentIndex = cursor
      cursor += 1
      results[currentIndex] = await worker(items[currentIndex], currentIndex)
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length))
  await Promise.all(Array.from({ length: workerCount }, () => runOne()))
  return results
}

const SYSTEM_PROMPT = `你是一个专业的试卷 OCR 系统。你能准确识别试卷图片中的所有题目、选项和数学公式。只输出 JSON，不要输出解释或 Markdown。`
const IMAGE_PLACEHOLDER_PATTERN = /\[IMAGE:\s*([^\]]*)\]/gi

function hasImagePlaceholder(text: string | null | undefined) {
  if (!text) return false
  IMAGE_PLACEHOLDER_PATTERN.lastIndex = 0
  return IMAGE_PLACEHOLDER_PATTERN.test(text)
}

function rewriteImagePlaceholders(text: string, fallbackText = "see figure") {
  return text.replace(IMAGE_PLACEHOLDER_PATTERN, (_match, description: string) => {
    const normalized = description?.trim()
    return normalized ? `(${normalized})` : `(${fallbackText})`
  }).trim()
}

function expandRegion(region: RegionBox, width: number, height: number, padding = 12) {
  const [x1, y1, x2, y2] = region
  return {
    x1: Math.max(0, x1 - padding),
    y1: Math.max(0, y1 - padding),
    x2: Math.min(width, x2 + padding),
    y2: Math.min(height, y2 + padding),
  }
}

async function persistRegionImage(params: {
  pageBuffer: Buffer
  region: RegionBox
  pageWidth: number
  pageHeight: number
  uploadId: string
  teacherId: string
}): Promise<string | null> {
  const cropped = await cropImageBuffer(
    params.pageBuffer,
    expandRegion(params.region, params.pageWidth, params.pageHeight),
  ).catch(() => null)

  if (!cropped) {
    return null
  }

  return storeImageBuffer({
    buffer: cropped,
    uploadId: params.uploadId,
    teacherId: params.teacherId,
    contentType: "image/png",
  })
}

async function persistFigureRegions(params: {
  pageBuffer: Buffer
  pageWidth: number
  pageHeight: number
  uploadId: string
  teacherId: string
  figureRegions: RegionBox[]
}): Promise<string[]> {
  const results = await Promise.all(
    params.figureRegions.map((region) =>
      persistRegionImage({
        pageBuffer: params.pageBuffer,
        region,
        pageWidth: params.pageWidth,
        pageHeight: params.pageHeight,
        uploadId: params.uploadId,
        teacherId: params.teacherId,
      }),
    ),
  )

  return results.filter((url): url is string => Boolean(url))
}

async function hydrateOptionImages(params: {
  pageBuffer: Buffer
  pageWidth: number
  pageHeight: number
  uploadId: string
  teacherId: string
  options: Record<string, string> | null
  layoutOptions: OptionRegion[]
}): Promise<Record<string, string> | null> {
  if (!params.options) {
    return null
  }

  const nextOptions: Record<string, string> = { ...params.options }
  const imageOptionEntries = await Promise.all(
    params.layoutOptions
      .filter((option) => option.type === "image" || option.type === "mixed")
      .map(async (option) => {
        const imageUrl = await persistRegionImage({
          pageBuffer: params.pageBuffer,
          region: option.region,
          pageWidth: params.pageWidth,
          pageHeight: params.pageHeight,
          uploadId: params.uploadId,
          teacherId: params.teacherId,
        })

        if (!imageUrl) return null
        return [option.label, imageUrl] as const
      }),
  )

  for (const entry of imageOptionEntries) {
    if (!entry) continue
    const [label, imageUrl] = entry
    const existingText = rewriteImagePlaceholders(nextOptions[label] || "", `option ${label}`).trim()
    nextOptions[label] = existingText
      ? `![选项 ${label}](${imageUrl})\n${existingText}`
      : `![选项 ${label}](${imageUrl})`
  }

  return nextOptions
}

function shouldDetectLayout(questions: ExtractedQuestion[]) {
  return questions.some((question) => {
    if (hasImagePlaceholder(question.content)) return true
    if (Array.isArray(question.linkedFigures) && question.linkedFigures.length > 0) return true
    return Object.values(question.options ?? {}).some((value) => hasImagePlaceholder(value))
  })
}

function buildExtractionPrompt(pageNumber: number): string {
  return `请识别以下试卷第 ${pageNumber} 页中的所有题目。

要求：
1) 提取每道题的完整题干（content），包括所有文字和数学公式
2) 数学公式使用 LaTeX 格式（$..$ 行内，$$...$$ 行间）
3) 如果是选择题，提取每个选项的 label (A/B/C/D) 和完整文本
3.1) 如果选项是图片或图表，选项文本写为 [IMAGE: 描述]，并在 linkedFigures 记录图号或图片引用
4) 题干中不要包含选项内容
5) 跳过页眉、页脚、标题、说明文字等非题目内容
6) 按页面从上到下的顺序编号
7) questionType: choice=选择题, fill=填空题, essay=问答/简述, calculation=计算题, proof=证明题
8) difficulty: 根据题目复杂度判断 easy/medium/hard/expert
9) subject: 题目所属学科（如 Computer Science, 数学, 物理 等）
10) knowledgePoint: 题目涉及的知识点（如 Data Compression, 极限 等）
11) confidence: 你对识别准确性的信心 0.0-1.0
12) 如果题目有子问 (a)/(b)/(c) 或 (i)/(ii)/(iii)，请写入 subQuestions 数组
13) 如果题目关联图片/图表，请写入 linkedFigures 数组（如 Figure 2、图3）

输出严格 JSON：
{
  "questions": [
    {
      "questionNumber": 1,
      "content": "题干文本...",
      "questionType": "choice",
      "options": {"A": "选项A文本", "B": "选项B文本", "C": "选项C文本", "D": "选项D文本"},
      "subQuestions": [{"label":"a","content":"..."},{"label":"b","content":"..."}],
      "linkedFigures": ["Figure 2"],
      "difficulty": "medium",
      "subject": "Computer Science",
      "knowledgePoint": "Data Compression",
      "confidence": 0.95
    }
  ]
}

注意：
- 如果不是选择题，options 设为 null
- 只提取实际的考试题目，不要提取标题或说明
- 每道题的 content 要完整，不要截断`
}

async function extractQuestionsFromPage(
  imageBuffer: Buffer,
  pageNumber: number,
): Promise<ExtractedQuestion[]> {
  const base64 = imageBuffer.toString("base64")

  const result = await sendVisionJsonMessage<PageExtractionResult>(
    buildExtractionPrompt(pageNumber),
    { mediaType: "image/png", data: base64 },
    {
      maxTokens: 5120,
      temperature: 0,
      system: SYSTEM_PROMPT,
    },
  )

  if (!result?.questions || !Array.isArray(result.questions)) {
    return []
  }

  return result.questions.filter(
    (q) => q && typeof q.content === "string" && q.content.trim().length > 0,
  )
}

export async function parsePdfWithVision(params: {
  pdfBuffer: Buffer
  uploadId: string
  teacherId: string
}): Promise<VisionParsedQuestion[]> {
  const { pdfBuffer } = params
  const scale = Number(process.env.PDF_RENDER_SCALE || 1.5)
  const pages = await renderPdfPages(pdfBuffer, scale)
  const concurrency = Math.max(1, Math.min(4, Number(process.env.PDF_VISION_PAGE_CONCURRENCY || 3)))
  const pageResults = await mapWithConcurrency(pages, concurrency, async (page) => {
    const extracted = await extractQuestionsFromPage(page.buffer, page.pageNumber)
    const layoutQuestions = shouldDetectLayout(extracted)
      ? normalizeLayout(await detectPageLayout({
          pageNumber: page.pageNumber,
          width: page.width,
          height: page.height,
          imageBuffer: page.buffer,
        }).catch(() => ({ questions: [] }))).questions
      : []

    const pageQuestions = await Promise.all(
      extracted.map(async (q, index) => {
        const layoutQuestion: LayoutQuestion | undefined = layoutQuestions[index]
        const baseOptions = q.options && Object.keys(q.options).length >= 2 ? q.options : null
        const normalizedOptions = await hydrateOptionImages({
          pageBuffer: page.buffer,
          pageWidth: page.width,
          pageHeight: page.height,
          uploadId: params.uploadId,
          teacherId: params.teacherId,
          options: baseOptions,
          layoutOptions: layoutQuestion?.options ?? [],
        })
        const figureUrls = layoutQuestion
          ? await persistFigureRegions({
              pageBuffer: page.buffer,
              pageWidth: page.width,
              pageHeight: page.height,
              uploadId: params.uploadId,
              teacherId: params.teacherId,
              figureRegions: layoutQuestion.figure_regions,
            })
          : []
        const normalizedContent = stripExtractedOptionsFromContent(
          rewriteImagePlaceholders(q.content.trim()),
          normalizedOptions,
        )
        const questionType: QuestionType = (
          ["choice", "fill", "short_answer", "essay", "calculation", "proof"] as const
        ).includes(q.questionType as QuestionType)
          ? (q.questionType as QuestionType)
          : "essay"

        const difficulty: DifficultyLevel = (
          ["easy", "medium", "hard", "expert"] as const
        ).includes(q.difficulty as DifficultyLevel)
          ? (q.difficulty as DifficultyLevel)
          : "medium"

        return {
          questionNumber: index + 1,
          content: normalizedContent,
          questionType,
          difficulty,
          subject: q.subject || "",
          knowledgePoint: q.knowledgePoint || "",
          options: normalizedOptions,
          confidence: Math.round((q.confidence ?? 0.8) * 100),
          subQuestions: Array.isArray(q.subQuestions) ? q.subQuestions : [],
          linkedFigures: Array.from(new Set([
            ...figureUrls,
            ...(Array.isArray(q.linkedFigures) ? q.linkedFigures : []),
          ])),
          rawQuestionNumber: String(q.questionNumber),
          sourcePageNumber: page.pageNumber,
        } satisfies VisionParsedQuestion
      }),
    )

    return pageQuestions
  })

  return pageResults
    .flat()
    .map((question, index) => ({
      ...question,
      questionNumber: index + 1,
    }))
}
