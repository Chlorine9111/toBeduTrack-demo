// PDF 扫描相关类型定义

export type DifficultyLevel = "easy" | "medium" | "hard"
export type QuestionType = "choice" | "fill" | "short_answer" | "essay" | "calculation" | "proof"
export type QuestionOptions = Record<string, string | undefined>
export type PdfScanStatus = "pending" | "uploading" | "processing" | "completed" | "failed"
export type ScanSourceType = "pdf" | "image" | "word"

export interface ConfidenceSignalDetail {
  score: number
  reasons: string[]
}

export interface QuestionConfidenceSignals {
  questionNumbering: ConfidenceSignalDetail
  contentCompleteness: ConfidenceSignalDetail
  optionIntegrity: ConfidenceSignalDetail
  visionAgreement: ConfidenceSignalDetail
}

export interface MathpixStatusResponse {
  status: 'received' | 'loaded' | 'split' | 'completed' | 'error'
  num_pages?: number
  num_pages_completed?: number
  percent_done?: number
  error?: string
}

export interface MathpixResult {
  pdf_id: string
  content: string
  format: 'mmd'
}

export interface MathpixTextResponse {
  text?: string
  latex_styled?: string
  error?: string
}

// 兼容 question-parser 的 MathpixResponse 输入
export interface MathpixResponse {
  status: 'completed' | 'error' | string
  pages?: Array<{ content: string }>
}

export interface ParsedQuestion {
  questionNumber: number
  originalContent: string
  questionType: QuestionType
  options: QuestionOptions | null
  difficulty: DifficultyLevel
  subject: string
  knowledgePoint: string
  confidence: number
  confidenceSignals?: QuestionConfidenceSignals
  isSubQuestion: boolean
  parentNumber?: number
  rawQuestionNumber: string
}

export interface ScannedQuestion {
  questionNumber: number
  content: string
  questionType: QuestionType
  difficulty: DifficultyLevel
  subject: string
  knowledgePoint: string
  options: QuestionOptions | null
  correctAnswer?: string
  solutionSteps?: string
  confidence: number
  confidenceSignals?: QuestionConfidenceSignals
  rawQuestionNumber?: string
  subQuestions?: Array<{ label: string; content: string }>
  linkedFigures?: string[]
  sourceType?: ScanSourceType
  sourcePageNumber?: number
}

export type RegionBox = [number, number, number, number]

export interface OptionRegion {
  label: 'A' | 'B' | 'C' | 'D' | 'E'
  region: RegionBox
  type: 'text' | 'image' | 'mixed'
}

export interface LayoutQuestion {
  id: number
  region: RegionBox
  text_regions: RegionBox[]
  formula_regions: RegionBox[]
  figure_regions: RegionBox[]
  options: OptionRegion[]
  options_type: 'text' | 'image' | 'mixed'
  has_figure: boolean
  confidence: number
}

export interface LayoutResult {
  questions: LayoutQuestion[]
}

export interface RenderedPage {
  pageNumber: number
  width: number
  height: number
  buffer: Buffer
}

export interface CropRegion {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface VisionParsedQuestion {
  questionNumber: number
  content: string
  questionType: QuestionType
  difficulty: DifficultyLevel
  subject: string
  knowledgePoint: string
  options: QuestionOptions | null
  confidence: number
  confidenceSignals?: QuestionConfidenceSignals
  subQuestions?: Array<{ label: string; content: string }>
  linkedFigures?: string[]
  rawQuestionNumber?: string
  boundaryHint?: number
  sourcePageNumber?: number
}

export interface PdfScanStats {
  total: number
  byType: Record<string, number>
  lowConfidenceCount: number
  averageConfidence: number
}
