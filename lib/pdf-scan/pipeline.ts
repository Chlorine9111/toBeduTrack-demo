import { parseDocument } from "../wechat/document-parser"
import { hasPdfLlmParseProvider, hasPdfVisionProvider, sendVisionMessage } from "./ai-vision"
import { detectScanFileType, getFileExtension } from "./file-type"
import {
  getResult,
  hasMathpixCredentials,
  recognizeImageMmd,
  uploadPDF,
  waitForCompletion,
} from "./mathpix"
import { extractQuestionsWithLlm } from "./llm-question-extractor"
import { persistMathpixImages } from "./mathpix-images"
import { hasMistralOcrCredentials, ocrImageWithMistral, ocrPdfWithMistral } from "./mistral-ocr"
import { persistMistralOcrImages } from "./mathpix-images"
import { parseMistralOcrMarkdown, convertToScannedQuestions as convertMistralToScannedQuestions } from "./mistral-markdown-parser"
import { selectOcrProvider } from "./ocr-router"
import { renderPdfPages } from "./pdf-render"
import { parseQuestionsFromText, stripExtractedOptionsFromContent, validateLlmOutput } from "./question-parser"
import { parsePdfWithVision } from "./vision-pdf"
import type { ParsedQuestion } from "./question-parser"
import type { ScanFileType } from "./file-type"
import type { MistralOcrPage } from "./mistral-ocr"
import type { OcrProvider } from "./ocr-router"
import type { ScannedQuestion, ScanSourceType } from "./types"

export interface ScanPipelineInput {
  fileBuffer: Buffer
  fileName: string
  mimeType?: string
  mathpixId?: string | null
  uploadId?: string
  teacherId?: string
  useVision?: boolean
  allowMathpixUpload?: boolean
  subject?: string
  forceProvider?: OcrProvider
  prefetchedText?: string
  prefetchedPages?: MistralOcrPage[]
  prefetchedMode?: string
}

export interface ScanPipelineOutput {
  questions: ScannedQuestion[]
  fileType: ScanFileType
  extractionMode: string
  textPreview: string
  analysis: {
    contentKind: "question_set" | "material" | "mixed"
    confidence: number
    reasons: string[]
  }
  timings: {
    totalMs: number
    extractMs: number
    parseMs: number
  }
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function buildTextPreview(rawText: string, maxLength = 1800) {
  const normalized = rawText
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  if (!normalized) return ""
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength)}\n...（其余内容已截断）`
}

function buildQuestionPreview(questions: ScannedQuestion[], maxQuestions = 8) {
  const lines = questions.slice(0, maxQuestions).map((question, index) => {
    const stem = (question.content ?? "").replace(/\s+/g, " ").trim()
    const title = `题号 ${question.questionNumber ?? index + 1}`
    const content = stem.length > 180 ? `${stem.slice(0, 180)}...` : stem
    return `${title}: ${content || "（题干为空）"}`
  })
  return lines.join("\n")
}

function splitMathpixMarkdownByPage(markdown: string) {
  const pages = markdown
    .split(/\\newpage\b/)
    .map((content, index) => ({
      pageNumber: index + 1,
      markdown: content.trim(),
    }))
    .filter((page) => page.markdown.length > 0)

  if (pages.length > 0) {
    return pages
  }

  const normalized = markdown.trim()
  return normalized
    ? [{ pageNumber: 1, markdown: normalized }]
    : []
}

function buildPdfPageMarkdowns(params: {
  extractionMode: string
  extractedText: string
  mistralPages?: MistralOcrPage[]
  renderedPageCount: number
}) {
  const sourcePages =
    params.extractionMode.startsWith("mistral") && params.mistralPages?.length
      ? params.mistralPages
        .map((page) => ({
          pageNumber: page.pageNumber,
          markdown: page.markdown.trim(),
        }))
        .filter((page) => page.markdown.length > 0)
      : splitMathpixMarkdownByPage(params.extractedText)

  return Array.from({ length: params.renderedPageCount }, (_, index) => {
    const pageNumber = index + 1
    return (
      sourcePages.find((page) => page.pageNumber === pageNumber) ??
      sourcePages[index] ?? {
        pageNumber,
        markdown: "",
      }
    )
  })
}

function countQuestionMarkers(text: string) {
  const matches = text.match(
    /(?:^|\n)\s*(?:第\s*\d+\s*题|\d+[.)、．]\s+|Q(?:uestion)?\s*\d+[.:：]?\s+|\(\d+\)\s+)/gim,
  )
  return matches?.length ?? 0
}

function inferExtractionAnalysis(params: {
  questions: ScannedQuestion[]
  rawText: string
  questionScore: number
}) {
  const questionCount = params.questions.length
  const avgConfidence = questionCount > 0
    ? params.questions.reduce((sum, q) => sum + Math.max(0, Math.min(100, q.confidence)), 0) / questionCount
    : 0
  const markerCount = countQuestionMarkers(params.rawText)
  const rawLength = params.rawText.trim().length

  if (questionCount === 0) {
    if (markerCount >= 3 && rawLength >= 400) {
      return {
        contentKind: "mixed" as const,
        confidence: 0.58,
        reasons: ["检测到疑似题号标记，但结构化题目抽取为空"],
      }
    }
    return {
      contentKind: "material" as const,
      confidence: rawLength >= 160 ? 0.9 : 0.68,
      reasons: ["未检测到稳定题号序列，判定为资料/讲义内容"],
    }
  }

  const strongQuestionSignal =
    questionCount >= 3 &&
    avgConfidence >= 58 &&
    markerCount >= Math.max(2, Math.floor(questionCount * 0.5))

  if (strongQuestionSignal) {
    return {
      contentKind: "question_set" as const,
      confidence: clamp01(Math.max(0.65, params.questionScore)),
      reasons: ["题号连续性与题目结构完整度较高"],
    }
  }

  const likelyMaterial =
    questionCount <= 2 &&
    avgConfidence < 50 &&
    rawLength > 1200

  if (likelyMaterial) {
    return {
      contentKind: "material" as const,
      confidence: 0.72,
      reasons: ["抽取题目数量过少且置信度偏低，更接近长文资料"],
    }
  }

  return {
    contentKind: "mixed" as const,
    confidence: clamp01(0.45 + params.questionScore * 0.4),
    reasons: ["同时包含题目片段与资料性文本，建议按混合内容处理"],
  }
}

function evaluateQuestionSet(questions: ScannedQuestion[]): number {
  if (questions.length === 0) return 0

  let continuityHits = 0
  for (let i = 0; i < questions.length; i += 1) {
    if (questions[i].questionNumber === i + 1) continuityHits += 1
  }
  const continuityRatio = continuityHits / questions.length

  const avgConfidence =
    questions.reduce((sum, q) => sum + Math.max(0, Math.min(100, q.confidence)), 0) /
    (questions.length * 100)

  const completenessRatio =
    questions.filter((q) => q.content.trim().length >= 20).length / questions.length

  const choiceQuestions = questions.filter((q) => q.questionType === "choice")
  const choiceCompletenessRatio =
    choiceQuestions.length === 0
      ? 1
      : choiceQuestions.filter((q) => Object.keys(q.options ?? {}).length >= 2).length / choiceQuestions.length

  return (
    continuityRatio * 0.35 +
    avgConfidence * 0.25 +
    completenessRatio * 0.25 +
    choiceCompletenessRatio * 0.15
  )
}

const RENDERABLE_FIGURE_PATTERN = /!\[[^\]]*]\(([^)]+)\)|\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g
const RENDERABLE_URL_PATTERN = /^(https?:\/\/|\/)/i

function extractRenderableFigureUrls(text: string): string[] {
  const refs = new Set<string>()
  for (const match of text.matchAll(RENDERABLE_FIGURE_PATTERN)) {
    const candidate = (match[1] || match[2] || "").trim()
    if (candidate && RENDERABLE_URL_PATTERN.test(candidate)) {
      refs.add(candidate)
    }
  }
  return Array.from(refs)
}

function hasRenderableVisuals(question: ScannedQuestion): boolean {
  if ((question.linkedFigures ?? []).some((figure) => RENDERABLE_URL_PATTERN.test(figure.trim()))) {
    return true
  }

  if (extractRenderableFigureUrls(question.content ?? "").length > 0) {
    return true
  }

  return Object.values(question.options ?? {}).some((option) => {
    if (typeof option !== "string") return false
    return extractRenderableFigureUrls(option).length > 0
  })
}

function hasSuspiciousChoiceFormatting(question: ScannedQuestion): boolean {
  return Object.values(question.options ?? {}).some((option) => {
    if (typeof option !== "string") return false
    return /(?:\([B-E]\)|[B-E][.、．:：)\]])\s*/.test(option)
  })
}

function splitLinkedFigures(figures: string[] | undefined) {
  const urls: string[] = []
  const refs: string[] = []
  const seenUrls = new Set<string>()
  const seenRefs = new Set<string>()

  for (const figure of figures ?? []) {
    const normalized = figure.trim()
    if (!normalized) continue

    if (RENDERABLE_URL_PATTERN.test(normalized)) {
      if (!seenUrls.has(normalized)) {
        seenUrls.add(normalized)
        urls.push(normalized)
      }
      continue
    }

    if (!seenRefs.has(normalized)) {
      seenRefs.add(normalized)
      refs.push(normalized)
    }
  }

  return { urls, refs }
}

export function mergeLinkedFigures(
  textFigures: string[] | undefined,
  visionFigures: string[] | undefined,
): string[] {
  const text = splitLinkedFigures(textFigures)
  const vision = splitLinkedFigures(visionFigures)

  const urls = text.urls.length >= vision.urls.length ? text.urls : vision.urls
  const refs = Array.from(new Set([...text.refs, ...vision.refs]))

  return [...urls, ...refs]
}

export function mergeOptions(
  textOptions: ScannedQuestion["options"],
  visionOptions: ScannedQuestion["options"],
): ScannedQuestion["options"] {
  const keys = new Set<string>([
    ...Object.keys(textOptions ?? {}),
    ...Object.keys(visionOptions ?? {}),
  ])

  const merged: Record<string, string | undefined> = {}
  for (const key of keys) {
    const textValue = typeof textOptions?.[key] === "string" ? textOptions[key]?.trim() : ""
    const visionValue = typeof visionOptions?.[key] === "string" ? visionOptions[key]?.trim() : ""
    const textHasVisual = Boolean(textValue && extractRenderableFigureUrls(textValue).length > 0)
    const visionHasVisual = Boolean(visionValue && extractRenderableFigureUrls(visionValue).length > 0)

    if (textHasVisual && visionHasVisual) {
      merged[key] = visionValue || textValue
      continue
    }

    if (textHasVisual && !visionHasVisual) {
      merged[key] = textValue
      continue
    }

    if (visionValue) {
      merged[key] = visionValue
      continue
    }

    if (textValue) {
      merged[key] = textValue
    }
  }

  const mergedCount = Object.keys(merged).length
  if (mergedCount >= 2) {
    return merged
  }

  const textCount = Object.keys(textOptions ?? {}).length
  const visionCount = Object.keys(visionOptions ?? {}).length
  if (visionCount >= 2 && visionCount >= textCount) return visionOptions ?? null
  if (textCount >= 2) return textOptions ?? null
  return null
}

function mergeVisionWithText(
  textCandidate: ScannedQuestion[],
  visionCandidate: ScannedQuestion[],
): ScannedQuestion[] {
  const maxLength = Math.max(textCandidate.length, visionCandidate.length)
  const merged: ScannedQuestion[] = []

  for (let index = 0; index < maxLength; index += 1) {
    const textQuestion = textCandidate[index]
    const visionQuestion = visionCandidate[index]

    if (textQuestion && visionQuestion) {
      const mergedOptions = mergeOptions(textQuestion.options, visionQuestion.options)
      const textContentHasVisual = extractRenderableFigureUrls(textQuestion.content ?? "").length > 0
      const visionContentHasVisual = extractRenderableFigureUrls(visionQuestion.content ?? "").length > 0
      const content = textContentHasVisual && !visionContentHasVisual
        ? textQuestion.content
        : stripExtractedOptionsFromContent(
            visionQuestion.content || textQuestion.content,
            mergedOptions,
          )

      merged.push({
        ...visionQuestion,
        content: content || textQuestion.content,
        options: mergedOptions,
        subQuestions: visionQuestion.subQuestions?.length ? visionQuestion.subQuestions : textQuestion.subQuestions,
        linkedFigures: mergeLinkedFigures(textQuestion.linkedFigures, visionQuestion.linkedFigures),
        subject: visionQuestion.subject || textQuestion.subject,
        knowledgePoint: visionQuestion.knowledgePoint || textQuestion.knowledgePoint,
        difficulty: visionQuestion.difficulty || textQuestion.difficulty,
        questionType: mergedOptions && Object.keys(mergedOptions).length >= 2
          ? "choice"
          : visionQuestion.questionType || textQuestion.questionType,
        confidence: Math.max(visionQuestion.confidence, textQuestion.confidence),
        rawQuestionNumber: visionQuestion.rawQuestionNumber || textQuestion.rawQuestionNumber,
        sourcePageNumber: visionQuestion.sourcePageNumber ?? textQuestion.sourcePageNumber,
      })
      continue
    }

    if (visionQuestion) {
      merged.push(visionQuestion)
      continue
    }

    if (textQuestion) {
      merged.push(textQuestion)
    }
  }

  return merged
}

type PdfTextCandidateSelection = {
  questions: ScannedQuestion[]
  parser: "mistral-markdown" | "regex"
}

function buildRegexPdfTextCandidate(extractedText: string): ScannedQuestion[] {
  return toScannedQuestions(parseQuestionsFromText(extractedText), "pdf")
}

function buildMistralPdfTextCandidate(
  mistralPages: MistralOcrPage[] | undefined,
): ScannedQuestion[] {
  if (!mistralPages?.length) return []
  return convertMistralToScannedQuestions(parseMistralOcrMarkdown(mistralPages))
}

export function shouldPreferRegexTextCandidate(params: {
  rawText: string
  mistralCandidate: ScannedQuestion[]
  regexCandidate: ScannedQuestion[]
}): boolean {
  const { rawText, mistralCandidate, regexCandidate } = params
  if (regexCandidate.length === 0) return false
  if (mistralCandidate.length === 0) return true

  const markerCount = countQuestionMarkers(rawText)
  const mistralScore = evaluateQuestionSet(mistralCandidate)
  const regexScore = evaluateQuestionSet(regexCandidate)

  if (regexCandidate.length >= mistralCandidate.length + 2) {
    return true
  }

  if (regexCandidate.length > mistralCandidate.length) {
    const mistralCoverage = markerCount > 0 ? mistralCandidate.length / markerCount : 0
    const regexCoverage = markerCount > 0 ? regexCandidate.length / markerCount : 0

    if (regexCoverage >= mistralCoverage + 0.25) {
      return true
    }

    if (regexScore + 0.05 >= mistralScore) {
      return true
    }
  }

  if (regexCandidate.length === mistralCandidate.length && regexScore > mistralScore + 0.12) {
    return true
  }

  return false
}

export function selectPdfTextCandidate(params: {
  extractionMode: string
  extractedText: string
  mistralPages?: MistralOcrPage[]
}): PdfTextCandidateSelection {
  const regexCandidate = buildRegexPdfTextCandidate(params.extractedText)
  const isMistralSource = params.extractionMode.includes("mistral") && Boolean(params.mistralPages?.length)

  if (!isMistralSource) {
    return {
      questions: regexCandidate,
      parser: "regex",
    }
  }

  const mistralCandidate = buildMistralPdfTextCandidate(params.mistralPages)
  if (
    shouldPreferRegexTextCandidate({
      rawText: params.extractedText,
      mistralCandidate,
      regexCandidate,
    })
  ) {
    return {
      questions: regexCandidate,
      parser: "regex",
    }
  }

  return {
    questions: mistralCandidate,
    parser: "mistral-markdown",
  }
}

export function shouldEscalateMistralTextCandidate(params: {
  rawText: string
  questions: ScannedQuestion[]
}): boolean {
  const markerCount = countQuestionMarkers(params.rawText)
  if (markerCount >= 2 && params.questions.length === 0) return true
  if (markerCount >= 3 && params.questions.length < Math.ceil(markerCount * 0.75)) return true
  return params.questions.some(hasSuspiciousChoiceFormatting)
}

function shouldUseLlmQuestions(params: {
  rawText: string
  llmQuestions: ScannedQuestion[]
  textCandidate: ScannedQuestion[]
}): boolean {
  const { rawText, llmQuestions, textCandidate } = params
  if (llmQuestions.length === 0) return false
  if (textCandidate.length === 0) return true

  const markerCount = countQuestionMarkers(rawText)
  const llmScore = evaluateQuestionSet(llmQuestions)
  const textScore = evaluateQuestionSet(textCandidate)

  if (llmQuestions.length > textCandidate.length && llmScore + 0.05 >= textScore) {
    return true
  }

  if (llmQuestions.length === textCandidate.length && llmScore > textScore + 0.08) {
    return true
  }

  if (
    markerCount >= 3 &&
    llmQuestions.length >= Math.min(markerCount, textCandidate.length + 1) &&
    llmScore + 0.02 >= textScore
  ) {
    return true
  }

  return false
}

function toScannedQuestions(questions: ParsedQuestion[], sourceType: ScanSourceType): ScannedQuestion[] {
  return questions.map((q) => ({
    questionNumber: q.questionNumber,
    content: q.originalContent,
    questionType: q.questionType,
    difficulty: q.difficulty,
    subject: q.subject,
    knowledgePoint: q.knowledgePoint,
    options: q.options,
    confidence: q.confidence,
    rawQuestionNumber: q.rawQuestionNumber,
    subQuestions: q.subQuestions,
    linkedFigures: q.linkedFigures,
    sourceType,
    sourcePageNumber: undefined,
  }))
}

async function parseWordToText(fileBuffer: Buffer, fileName: string): Promise<string> {
  const ext = getFileExtension(fileName)
  const normalizedName = ext ? fileName : `${fileName}.docx`
  const parsed = await parseDocument(fileBuffer, normalizedName)
  return parsed.textContent
}

async function parseImageToText(params: {
  fileBuffer: Buffer
  fileName: string
  mimeType?: string
}): Promise<{ text: string; mode: string }> {
  const mediaType = (() => {
    const mime = params.mimeType?.toLowerCase() ?? ""
    if (mime === "image/jpeg" || mime === "image/jpg") return "image/jpeg"
    if (mime === "image/webp") return "image/webp"
    if (mime === "image/png") return "image/png"
    const ext = getFileExtension(params.fileName)
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
    if (ext === "webp") return "image/webp"
    return "image/png"
  })()

  if (hasMathpixCredentials()) {
    if (hasMistralOcrCredentials()) {
      try {
        const text = await ocrImageWithMistral(params.fileBuffer, mediaType)
        return { text, mode: "mistral-image" }
      } catch (error) {
        console.warn("[pdf-scan] mistral image OCR 失败，回退 Mathpix", error)
      }
    }

    const text = await recognizeImageMmd(params.fileBuffer)
    return { text, mode: "mathpix-image" }
  }

  if (hasMistralOcrCredentials()) {
    const text = await ocrImageWithMistral(params.fileBuffer, mediaType)
    return { text, mode: "mistral-image" }
  }

  if (hasPdfVisionProvider()) {
    const base64 = params.fileBuffer.toString("base64")
    const text = await sendVisionMessage(
      "请提取图片中的所有题目文本，保留公式、上下标和选项编号。只输出纯文本。",
      { mediaType, data: base64 },
      { maxTokens: 5120, temperature: 0 },
    )
    return { text, mode: "vision-image" }
  }

  throw new Error("图片解析失败：未配置 MATHPIX 或 ANTHROPIC")
}

export async function runScanPipeline(input: ScanPipelineInput): Promise<ScanPipelineOutput> {
  const startedAt = Date.now()
  const fileType = detectScanFileType({
    fileName: input.fileName,
    mimeType: input.mimeType,
  })

  if (!fileType) {
    throw new Error("不支持的文件类型，仅支持 PDF/图片/Word")
  }

  let extractionMode = "unknown"
  let extractedText = ""
  let extractMs = 0
  let parseMs = 0

  if (fileType === "pdf") {
    const extractStart = Date.now()
    let mistralPages: MistralOcrPage[] | undefined
    const prefetchedText = input.prefetchedText?.trim() ?? ""
    if (prefetchedText) {
      extractedText = prefetchedText
      mistralPages = input.prefetchedPages
      extractionMode =
        input.prefetchedMode ??
        (mistralPages?.length ? "mistral-prefetched" : "ocr-prefetched")
    } else if (input.mathpixId) {
      extractedText = (await getResult(input.mathpixId)).content
      extractionMode = "mathpix-result"
    } else {
      const route = selectOcrProvider({
        fileName: input.fileName,
        subject: input.subject,
        forceProvider: input.forceProvider,
        fileSize: input.fileBuffer.byteLength,
      })

      if (
        route.provider === "mathpix" &&
        input.allowMathpixUpload !== false &&
        hasMathpixCredentials()
      ) {
        const uploadedId = await uploadPDF(input.fileBuffer, input.fileName)
        extractedText = (await waitForCompletion(uploadedId)).content
        extractionMode = "mathpix-sync"
      } else if (route.provider === "mistral" && hasMistralOcrCredentials()) {
        const result = await ocrPdfWithMistral(input.fileBuffer, input.fileName)

        // 持久化 Mistral OCR 返回的 base64 图片，替换 markdown 引用
        if (input.uploadId && input.teacherId) {
          const persisted = await persistMistralOcrImages({
            pages: result.pages,
            uploadId: input.uploadId,
            teacherId: input.teacherId,
          }).catch(() => null)

          if (persisted && persisted.totalPersisted > 0) {
            // 用替换后的 markdown 更新内容
            const updatedContent = persisted.pages
              .map((p) => p.markdown)
              .join("\n\n")
              .trim()
            extractedText = updatedContent || result.content
            mistralPages = result.pages.map((page, i) => ({
              ...page,
              markdown: persisted.pages[i]?.markdown ?? page.markdown,
            }))
          } else {
            extractedText = result.content
            mistralPages = result.pages
          }
        } else {
          extractedText = result.content
          mistralPages = result.pages
        }

        extractionMode = "mistral-ocr"
      } else {
        throw new Error("未配置可用的 Mathpix / Mistral OCR 凭据，无法处理 PDF")
      }
    }

    if (
      extractionMode.startsWith("mathpix") &&
      extractedText &&
      input.uploadId &&
      input.teacherId
    ) {
      const persisted = await persistMathpixImages({
        content: extractedText,
        uploadId: input.uploadId,
        teacherId: input.teacherId,
      }).catch(() => null)

      if (persisted?.content) {
        extractedText = persisted.content
      }
    }

    extractMs = Date.now() - extractStart

    const textParseStart = Date.now()
    const textSelection = selectPdfTextCandidate({
      extractionMode,
      extractedText,
      mistralPages,
    })
    const textCandidate = textSelection.questions
    const fallbackTextMode =
      extractionMode.includes("mistral") && textSelection.parser === "regex"
        ? `${extractionMode}+regex-fallback`
        : extractionMode
    const shouldEscalateMistralLlm =
      extractionMode.includes("mistral") &&
      shouldEscalateMistralTextCandidate({
        rawText: extractedText,
        questions: textCandidate,
      })

    // Mistral OCR 低召回时允许接入现有 LLM 拆题补救，否则保留轻量文本解析
    const llmEligible =
      (!extractionMode.includes("mistral") || shouldEscalateMistralLlm) &&
      input.useVision !== false &&
      hasPdfLlmParseProvider()

    if (llmEligible) {
      try {
        const scale = Number(process.env.PDF_RENDER_SCALE || 1.5)
        const pageImages = await renderPdfPages(input.fileBuffer, scale)
        const pageMarkdowns = buildPdfPageMarkdowns({
          extractionMode,
          extractedText,
          mistralPages,
          renderedPageCount: pageImages.length,
        })
        const llmResult = await extractQuestionsWithLlm({
          pageMarkdowns,
          pageImages,
          uploadId: input.uploadId,
          teacherId: input.teacherId,
        })

        const questionScore = evaluateQuestionSet(llmResult.questions)
        const analysis = inferExtractionAnalysis({
          questions: llmResult.questions,
          rawText: extractedText,
          questionScore,
        })
        const validationIssues = validateLlmOutput(llmResult.questions)
        if (validationIssues.length > 0) {
          console.warn("[pdf-scan] LLM 拆题校验告警", {
            fileName: input.fileName,
            issueCount: validationIssues.length,
            issues: validationIssues.slice(0, 8),
          })
        }

        const needsTextFallback =
          llmResult.questions.length === 0 && countQuestionMarkers(extractedText) >= 2
        const shouldReturnLlm =
          !extractionMode.includes("mistral") ||
          shouldUseLlmQuestions({
            rawText: extractedText,
            llmQuestions: llmResult.questions,
            textCandidate,
          })

        if (!needsTextFallback && shouldReturnLlm) {
          const llmModeSuffix =
            llmResult.stats.regexFallbackPages > 0 ? "+llm-page-fallback" : "+llm"
          const textPreview = analysis.contentKind === "question_set"
            ? buildQuestionPreview(llmResult.questions)
            : buildTextPreview(extractedText) || buildQuestionPreview(llmResult.questions)
          parseMs = Date.now() - textParseStart

          return {
            questions: llmResult.questions,
            fileType,
            extractionMode: `${extractionMode}${llmModeSuffix}`,
            textPreview,
            analysis,
            timings: {
              totalMs: Date.now() - startedAt,
              extractMs,
              parseMs,
            },
          }
        }

        extractionMode = `${fallbackTextMode}+llm-fallback`
      } catch (error) {
        console.warn("[pdf-scan] LLM 拆题失败，回退正则解析", error)
        extractionMode = `${fallbackTextMode}+llm-error`
      }
    } else {
      extractionMode = fallbackTextMode
    }

    parseMs = Date.now() - textParseStart
    const textScore = evaluateQuestionSet(textCandidate)
    const analysis = inferExtractionAnalysis({
      questions: textCandidate,
      rawText: extractedText,
      questionScore: textScore,
    })
    const textPreview = analysis.contentKind === "question_set"
      ? buildQuestionPreview(textCandidate)
      : buildTextPreview(extractedText) || buildQuestionPreview(textCandidate)

    return {
      questions: textCandidate,
      fileType,
      extractionMode,
      textPreview,
      analysis,
      timings: {
        totalMs: Date.now() - startedAt,
        extractMs,
        parseMs,
      },
    }
  }

  if (fileType === "image") {
    const extractStart = Date.now()
    const imageResult = await parseImageToText({
      fileBuffer: input.fileBuffer,
      fileName: input.fileName,
      mimeType: input.mimeType,
    })
    extractedText = imageResult.text
    extractionMode = imageResult.mode
    extractMs = Date.now() - extractStart

    const parseStart = Date.now()
    const parsed = parseQuestionsFromText(extractedText)
    parseMs = Date.now() - parseStart

    const questions = toScannedQuestions(parsed, "image")
    const questionScore = evaluateQuestionSet(questions)
    const analysis = inferExtractionAnalysis({
      questions,
      rawText: extractedText,
      questionScore,
    })
    const textPreview = analysis.contentKind === "question_set"
      ? buildQuestionPreview(questions)
      : buildTextPreview(extractedText) || buildQuestionPreview(questions)

    return {
      questions,
      fileType,
      extractionMode,
      textPreview,
      analysis,
      timings: {
        totalMs: Date.now() - startedAt,
        extractMs,
        parseMs,
      },
    }
  }

  const extractStart = Date.now()
  extractedText = await parseWordToText(input.fileBuffer, input.fileName)
  extractionMode = "word-local"
  extractMs = Date.now() - extractStart

  const parseStart = Date.now()
  const parsed = parseQuestionsFromText(extractedText)
  parseMs = Date.now() - parseStart

  const questions = toScannedQuestions(parsed, "word")
  const questionScore = evaluateQuestionSet(questions)
  const analysis = inferExtractionAnalysis({
    questions,
    rawText: extractedText,
    questionScore,
  })
  const textPreview = analysis.contentKind === "question_set"
    ? buildQuestionPreview(questions)
    : buildTextPreview(extractedText) || buildQuestionPreview(questions)

  return {
    questions,
    fileType,
    extractionMode,
    textPreview,
    analysis,
    timings: {
      totalMs: Date.now() - startedAt,
      extractMs,
      parseMs,
    },
  }
}
