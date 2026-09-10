// ============================================================
// Deskmate Landing Demo - Types & Constants
// ============================================================

// --- Types ---

export interface ChatMessage {
  id: string
  role: "ai" | "user"
  content: string
  typewriter?: boolean
}

export interface ChatOption {
  id: string
  text: string
  isMain?: boolean
}

export interface ChatStep {
  messages: ChatMessage[]
  options?: ChatOption[]
  triggerPanel?: boolean
  thinkingText?: string
}

export interface RubricItemData {
  id: string
  description: string
  points: number
}

export interface RubricPartData {
  id: string
  label: string
  title: string
  points: number
  items: RubricItemData[]
}

export interface WorksheetLineData {
  id: string
  text: string
  subLines?: string[]
}

export interface WorksheetStepData {
  id: string
  number: number
  title: string
  subtitle: string
  lines: WorksheetLineData[]
  advancedLines?: WorksheetLineData[]
  hintSteps?: string[]
}

export interface ExamQuestionData {
  id: string
  type: "MC" | "FRQ"
  difficulty: "Easy" | "Medium" | "Hard"
  preview: string
  fullQuestion: string
  options?: { label: string; text: string }[]
  correctAnswer?: string
  explanation?: string
  parts?: {
    label: string
    description: string
    points: number
    rubric: string
  }[]
  totalPoints: number
}

export type TabId = 0 | 1 | 2

// --- Difficulty Colors ---

export const DIFFICULTY_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  Easy: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  Medium: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  Hard: {
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
  },
}
