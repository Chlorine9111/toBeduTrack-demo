// 基于 Context7 文档: Mathpix PDF Processing API
// Mathpix PDF 识别服务 - 上传 PDF 并获取带 LaTeX 格式的识别结果

import type {
  MathpixStatusResponse,
  MathpixResult,
  MathpixTextResponse,
} from "./types"

// ============================================
// 类型定义（内部使用）
// ============================================

interface MathpixUploadResponse {
  pdf_id: string
  error?: string
}

// ============================================
// 常量
// ============================================

const MATHPIX_API_BASE = 'https://api.mathpix.com/v3'
const POLL_INTERVAL_MS = 3000
const DEFAULT_MAX_WAIT_MS = 300000 // 5 minutes

// ============================================
// 辅助函数
// ============================================

/** 验证 Mathpix PDF ID 格式，防止 SSRF/路径注入 */
function validatePdfId(pdfId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(pdfId)) {
    throw new Error(`Invalid Mathpix PDF ID format: ${pdfId}`)
  }
  return pdfId
}

function getCredentials(): { appId: string; appKey: string } {
  const appId = process.env.MATHPIX_APP_ID?.trim()
  const appKey = process.env.MATHPIX_APP_KEY?.trim()

  if (!appId || !appKey) {
    throw new Error('MATHPIX_APP_ID and MATHPIX_APP_KEY must be set')
  }

  return { appId, appKey }
}

export function hasMathpixCredentials(): boolean {
  return Boolean(process.env.MATHPIX_APP_ID?.trim() && process.env.MATHPIX_APP_KEY?.trim())
}

function getAuthHeaders(): Record<string, string> {
  const { appId, appKey } = getCredentials()
  return {
    app_id: appId,
    app_key: appKey,
  }
}

// ============================================
// API 函数
// ============================================

/**
 * 上传 PDF 文件到 Mathpix 进行识别
 * @param buffer - PDF 文件的 Buffer
 * @param fileName - 文件名
 * @returns Mathpix PDF ID
 */
export async function uploadPDF(
  buffer: Buffer,
  fileName: string
): Promise<string> {
  const headers = getAuthHeaders()

  // 创建 FormData
  const formData = new FormData()
  // 将 Buffer 转换为 Uint8Array 以兼容 Blob
  const uint8Array = new Uint8Array(buffer)
  const blob = new Blob([uint8Array], { type: 'application/pdf' })
  formData.append('file', blob, fileName)

  // 配置选项：保留数学公式的 LaTeX 格式
  // 注意：mmd 格式是默认可用的，不需要在 conversion_formats 中指定
  // conversion_formats 只用于 docx, tex.zip, html, pdf, pptx 等格式
  const options = {
    math_inline_delimiters: ['$', '$'],
    math_display_delimiters: ['$$', '$$'],
    rm_spaces: true,
  }
  formData.append('options_json', JSON.stringify(options))

  const response = await fetch(`${MATHPIX_API_BASE}/pdf`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      `Mathpix upload failed: ${response.status} - ${error.error || 'Unknown error'}`
    )
  }

  const data: MathpixUploadResponse = await response.json()
  return data.pdf_id
}

/**
 * 查询 PDF 处理状态
 * @param pdfId - Mathpix PDF ID
 * @returns 状态和进度
 */
export async function checkStatus(
  pdfId: string
): Promise<{ status: string; progress: number }> {
  const safePdfId = validatePdfId(pdfId)
  const headers = getAuthHeaders()

  const response = await fetch(`${MATHPIX_API_BASE}/pdf/${safePdfId}`, {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      `Mathpix status check failed: ${response.status} - ${error.error || 'Unknown error'}`
    )
  }

  const data: MathpixStatusResponse = await response.json()

  return {
    status: data.status,
    progress: data.percent_done ?? (data.status === 'completed' ? 100 : 0),
  }
}

/**
 * 获取 PDF 识别结果（Mathpix Markdown 格式，保留 LaTeX）
 * @param pdfId - Mathpix PDF ID
 * @returns MathpixResult 包含识别内容
 */
export async function getResult(pdfId: string): Promise<MathpixResult> {
  const safePdfId = validatePdfId(pdfId)
  const headers = getAuthHeaders()

  // 获取 Mathpix Markdown 格式，保留 LaTeX 公式
  const response = await fetch(`${MATHPIX_API_BASE}/pdf/${safePdfId}.mmd`, {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      `Mathpix get result failed: ${response.status} - ${error.error || 'Unknown error'}`
    )
  }

  const content = await response.text()

  return {
    pdf_id: pdfId,
    content,
    format: 'mmd',
  }
}

/**
 * 识别图片中的文本/公式（Mathpix /v3/text）
 * @param imageBuffer - 图片 Buffer
 * @returns 识别后的 MMD 文本
 */
export async function recognizeImageMmd(imageBuffer: Buffer): Promise<string> {
  const headers = {
    ...getAuthHeaders(),
    'Content-Type': 'application/json',
  }

  const base64 = imageBuffer.toString('base64')
  const payload = {
    src: `data:image/png;base64,${base64}`,
    formats: ['text', 'latex_styled'],
    math_inline_delimiters: ['$', '$'],
    math_display_delimiters: ['$$', '$$'],
    rm_spaces: true,
  }

  const response = await fetch(`${MATHPIX_API_BASE}/text`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      `Mathpix image OCR failed: ${response.status} - ${error.error || 'Unknown error'}`
    )
  }

  const data: MathpixTextResponse = await response.json()
  return data.latex_styled || data.text || ''
}

/**
 * 轮询等待 PDF 处理完成并返回结果
 * @param pdfId - Mathpix PDF ID
 * @param maxWaitMs - 最大等待时间（毫秒），默认 5 分钟
 * @returns MathpixResult 包含识别内容
 */
export async function waitForCompletion(
  pdfId: string,
  maxWaitMs: number = DEFAULT_MAX_WAIT_MS
): Promise<MathpixResult> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    const { status } = await checkStatus(pdfId)

    if (status === 'completed') {
      return getResult(pdfId)
    }

    if (status === 'error') {
      throw new Error('PDF processing failed')
    }

    // 等待下一次轮询
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error(`PDF processing timeout after ${maxWaitMs}ms`)
}

/**
 * 从 File 对象上传 PDF 到 Mathpix
 * @param file - PDF File 对象
 * @returns Mathpix PDF ID
 */
export async function uploadPdfFile(file: File): Promise<string> {
  const headers = getAuthHeaders()

  const formData = new FormData()
  formData.append('file', file)
  formData.append(
    'options_json',
    JSON.stringify({
      math_inline_delimiters: ['$', '$'],
      math_display_delimiters: ['$$', '$$'],
      rm_spaces: true,
    })
  )

  const response = await fetch(`${MATHPIX_API_BASE}/pdf`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      `Mathpix upload failed: ${response.status} - ${error.error || 'Unknown error'}`
    )
  }

  const data = await response.json()
  return data.pdf_id
}

/**
 * 等待 PDF 处理完成（带进度回调）
 * @param pdfId - Mathpix PDF ID
 * @param onProgress - 进度回调
 * @param maxWaitMs - 最大等待时间
 */
export async function waitForPdfCompletion(
  pdfId: string,
  onProgress?: (percent: number, status: string) => void,
  maxWaitMs: number = DEFAULT_MAX_WAIT_MS
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    const { status, progress } = await checkStatus(pdfId)

    if (status === 'completed') {
      onProgress?.(100, 'completed')
      return
    }

    if (status === 'error') {
      throw new Error('PDF processing failed')
    }

    onProgress?.(progress, status)
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error(`PDF processing timeout after ${maxWaitMs}ms`)
}

/**
 * 获取 PDF 解析结果（Markdown 格式）
 * @param pdfId - Mathpix PDF ID
 * @returns Markdown 格式的文本
 */
export async function getPdfResultMarkdown(pdfId: string): Promise<string> {
  const safePdfId = validatePdfId(pdfId)
  const headers = getAuthHeaders()

  const response = await fetch(`${MATHPIX_API_BASE}/pdf/${safePdfId}.mmd`, {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      `Mathpix get result failed: ${response.status} - ${error.error || 'Unknown error'}`
    )
  }

  return response.text()
}

/**
 * 完整的 PDF 解析流程（从 File 对象）
 * @param file - PDF File 对象
 * @param onProgress - 进度回调
 * @returns 解析后的 Markdown 文本
 */
export async function processPdfWithMathpix(
  file: File,
  onProgress?: (step: string, percent: number, message: string) => void
): Promise<string> {
  // 1. 上传 PDF
  onProgress?.('upload', 100, '文件上传完成')
  const pdfId = await uploadPdfFile(file)

  // 2. 等待 OCR 处理
  await waitForPdfCompletion(pdfId, (percent, status) => {
    if (status !== 'completed') {
      onProgress?.('ocr', percent, `正在识别文字内容... ${percent}%`)
    }
  })

  // 3. 获取结果
  onProgress?.('parse', 50, '正在获取解析结果...')
  const markdown = await getPdfResultMarkdown(pdfId)

  onProgress?.('parse', 100, '解析完成')

  return markdown
}
