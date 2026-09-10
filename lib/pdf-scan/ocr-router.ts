import { hasMathpixCredentials } from "./mathpix"
import { hasMistralOcrCredentials } from "./mistral-ocr"

export type OcrProvider = "mathpix" | "mistral"

export interface OcrRouteDecision {
  provider: OcrProvider
  reason: string
}

const SUBJECT_HINTS_FOR_MATHPIX = [
  "math",
  "mathematics",
  "calculus",
  "algebra",
  "geometry",
  "statistics",
  "stat",
  "physics",
  "chemistry",
  "computer science",
  "cs",
  "数学",
  "统计",
  "物理",
  "化学",
  "计算机",
]

const FILE_HINTS_FOR_MATHPIX = [
  "math",
  "calculus",
  "algebra",
  "geometry",
  "statistics",
  "stat",
  "physics",
  "chemistry",
  "formula",
  "equation",
  "latex",
]

function normalize(value?: string) {
  return value?.trim().toLowerCase() ?? ""
}

function containsAny(value: string, candidates: string[]) {
  return candidates.some((candidate) => value.includes(candidate))
}

function resolveAvailableProvider(
  preferredProvider: OcrProvider,
  preferredReason: string,
  forcedProvider?: OcrProvider,
): OcrRouteDecision {
  const hasMathpix = hasMathpixCredentials()
  const hasMistral = hasMistralOcrCredentials()

  if (preferredProvider === "mathpix" && hasMathpix) {
    return { provider: "mathpix", reason: preferredReason }
  }

  if (preferredProvider === "mistral" && hasMistral) {
    return { provider: "mistral", reason: preferredReason }
  }

  if (preferredProvider === "mathpix" && hasMistral) {
    return {
      provider: "mistral",
      reason: forcedProvider === "mathpix"
        ? "已手动指定 Mathpix，但当前未配置凭据，回退到 Mistral OCR"
        : "文档更适合 Mathpix，但当前未配置凭据，回退到 Mistral OCR",
    }
  }

  if (preferredProvider === "mistral" && hasMathpix) {
    return {
      provider: "mathpix",
      reason: forcedProvider === "mistral"
        ? "已手动指定 Mistral OCR，但当前未配置凭据，回退到 Mathpix"
        : "默认首选 Mistral OCR，但当前未配置凭据，回退到 Mathpix",
    }
  }

  if (hasMistral) {
    return {
      provider: "mistral",
      reason: "仅检测到 Mistral OCR 凭据，使用 Mistral OCR",
    }
  }

  if (hasMathpix) {
    return {
      provider: "mathpix",
      reason: "仅检测到 Mathpix 凭据，使用 Mathpix",
    }
  }

  return {
    provider: preferredProvider,
    reason:
      forcedProvider != null
        ? `已手动指定 ${forcedProvider === "mathpix" ? "Mathpix" : "Mistral OCR"}，但当前未配置可用凭据`
        : "未配置可用的 Mathpix / Mistral OCR 凭据",
  }
}

export function selectOcrProvider(params: {
  fileName: string
  subject?: string
  forceProvider?: OcrProvider
  fileSize?: number
}): OcrRouteDecision {
  if (params.forceProvider) {
    return resolveAvailableProvider(
      params.forceProvider,
      `教师手动指定使用 ${params.forceProvider === "mathpix" ? "Mathpix" : "Mistral OCR"}`,
      params.forceProvider,
    )
  }

  const normalizedSubject = normalize(params.subject)
  const normalizedFileName = normalize(params.fileName)

  if (normalizedSubject && containsAny(normalizedSubject, SUBJECT_HINTS_FOR_MATHPIX)) {
    return resolveAvailableProvider("mathpix", "学科提示显示该文档公式密度较高，优先使用 Mathpix")
  }

  if (normalizedFileName && containsAny(normalizedFileName, FILE_HINTS_FOR_MATHPIX)) {
    return resolveAvailableProvider("mathpix", "文件名包含公式/理科提示词，优先使用 Mathpix")
  }

  return resolveAvailableProvider("mistral", "默认优先使用成本更低的 Mistral OCR")
}
