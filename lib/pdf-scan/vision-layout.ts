import { sendVisionJsonMessage } from "./ai-vision"
import type { LayoutResult } from "./types"

export function normalizeLayout(result: LayoutResult): LayoutResult {
  if (!result?.questions) {
    return { questions: [] }
  }

  const normalized = result.questions
    .filter((q) => q && Array.isArray(q.region) && q.region.length === 4)
    .map((q) => ({
      ...q,
      text_regions: Array.isArray(q.text_regions) ? q.text_regions : [],
      formula_regions: Array.isArray(q.formula_regions) ? q.formula_regions : [],
      figure_regions: Array.isArray(q.figure_regions) ? q.figure_regions : [],
      options: Array.isArray(q.options) ? q.options : [],
      options_type: q.options_type || (q.options?.some((opt) => opt.type === 'image') ? 'image' : 'text'),
      has_figure: Boolean(q.has_figure),
      confidence: typeof q.confidence === 'number' ? q.confidence : 0.5,
    }))
    .sort((a, b) => a.region[1] - b.region[1])

  return { questions: normalized }
}

const SYSTEM_PROMPT = `你是一个严格的版面结构分析器。只输出 JSON，不要输出解释、不要输出 Markdown。`

function buildPrompt(pageNumber: number, width: number, height: number): string {
  return `
请识别以下 PDF 第 ${pageNumber} 页的题目版面结构，并输出严格 JSON。
要求：
1) 仅输出 JSON，不能有任何说明文字或 Markdown。
2) 坐标为像素坐标，原点左上角，格式 [x1,y1,x2,y2]。
3) questions 按从上到下顺序排列。
4) 每题必须拆分 text_regions / formula_regions / figure_regions / options。
5) 选项必须标注 label（A/B/C/D/E）和 region。
6) 如果选项内容是图片，type 设为 image；纯文字为 text；混合为 mixed。
7) 如果无图，figure_regions 为空数组，has_figure=false。

页面尺寸：width=${width}, height=${height}

输出 JSON schema：
{
  "questions": [
    {
      "id": 1,
      "region": [x1,y1,x2,y2],
      "text_regions": [[...]],
      "formula_regions": [[...]],
      "figure_regions": [[...]],
      "options": [
        {"label":"A","region":[...],"type":"text|image|mixed"}
      ],
      "options_type": "text|image|mixed",
      "has_figure": true,
      "confidence": 0.0
    }
  ]
}`
}

export async function detectPageLayout(params: {
  pageNumber: number
  width: number
  height: number
  imageBuffer: Buffer
}): Promise<LayoutResult> {
  const { pageNumber, width, height, imageBuffer } = params
  const prompt = buildPrompt(pageNumber, width, height)
  const base64 = imageBuffer.toString('base64')

  const result = await sendVisionJsonMessage<LayoutResult>(prompt, {
    mediaType: 'image/png',
    data: base64,
  }, {
    maxTokens: 3072,
    temperature: 0,
    system: SYSTEM_PROMPT,
  })

  return result
}
