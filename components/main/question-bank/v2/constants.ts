import type { TikuSearchResultRow, TikuDifficulty, TikuCognitiveTask } from "@/lib/tiku/types"

// 分页常量
export const PAGE_SIZE = 18
export const MATERIALS_PAGE_SIZE = 18
export const PERSONAL_PAGE_SIZE = 24
export const DEBOUNCE_MS = 300

// 课程映射
export const COURSE_UNIT_MAP: Record<string, { label: string; unitStart: number; unitEnd: number }> = {
  APES: { label: "AP Environmental Science", unitStart: 1, unitEnd: 9 },
  AP_BIO: { label: "AP Biology", unitStart: 1, unitEnd: 8 },
  AP_CHEM: { label: "AP Chemistry", unitStart: 1, unitEnd: 9 },
  AP_CALC_AB: { label: "AP Calculus AB", unitStart: 1, unitEnd: 8 },
  AP_CALC_BC: { label: "AP Calculus BC", unitStart: 1, unitEnd: 10 },
  AP_PRECALC: { label: "AP Precalculus", unitStart: 1, unitEnd: 4 },
  AP_STATS: { label: "AP Statistics", unitStart: 1, unitEnd: 9 },
  AP_MACRO: { label: "AP Macroeconomics", unitStart: 1, unitEnd: 6 },
  AP_MICRO: { label: "AP Microeconomics", unitStart: 1, unitEnd: 6 },
  AP_CSA: { label: "AP Computer Science A", unitStart: 1, unitEnd: 10 },
  AP_CSP: { label: "AP Computer Science Principles", unitStart: 1, unitEnd: 5 },
  AP_PHYSICS_1: { label: "AP Physics 1", unitStart: 1, unitEnd: 8 },
  AP_PHYSICS_2: { label: "AP Physics 2", unitStart: 9, unitEnd: 15 },
  AP_PHYSICS_C_MECH: { label: "AP Physics C Mech", unitStart: 1, unitEnd: 7 },
  AP_PHYSICS_C_EM: { label: "AP Physics C E&M", unitStart: 8, unitEnd: 13 },
}

export const COURSE_KEYS = Object.keys(COURSE_UNIT_MAP)

// 课程代码 → 中文标签
export const COURSE_LABELS: Record<string, string> = {
  APES: "AP 环境科学",
  AP_BIO: "AP 生物",
  AP_CHEM: "AP 化学",
  AP_CALC_AB: "AP 微积分 AB",
  AP_CALC_BC: "AP 微积分 BC",
  AP_PRECALC: "AP 预备微积分",
  AP_STATS: "AP 统计",
  AP_MACRO: "AP 宏观经济",
  AP_MICRO: "AP 微观经济",
  AP_CSA: "AP 计算机 A",
  AP_CSP: "AP 计算机原理",
  AP_PHYSICS_1: "AP 物理 1",
  AP_PHYSICS_2: "AP 物理 2",
  AP_PHYSICS_C_MECH: "AP 物理 C 力学",
  AP_PHYSICS_C_EM: "AP 物理 C 电磁",
}

export const COGNITIVE_TASK_OPTIONS: { value: TikuCognitiveTask; label: string }[] = [
  { value: "recall", label: "Recall" },
  { value: "diagram_reading", label: "Diagram Reading" },
  { value: "calculation", label: "Calculation" },
  { value: "causal_prediction", label: "Causal Prediction" },
  { value: "comparison", label: "Comparison" },
  { value: "scenario_application", label: "Scenario Application" },
  { value: "evidence_evaluation", label: "Evidence Evaluation" },
]

export const DIFFICULTY_OPTIONS: { value: TikuDifficulty; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
]

// 类型定义
export type ViewMode = "questions" | "materials"

export type TikuListItem = {
  id: string
  course: string
  unit: number
  stem: string
  choices: Record<string, { text: string; misconception: string | null }>
  correct_answer: string
  explanation: string | null
  difficulty: string
  cognitive_task: string | null
  topic_code: string | null
  key_concepts: string[]
  source_type: string
  source_assessment: string
  question_number: number
  stimulus_id: string | null
  stimulus_dependent: boolean
  standalone_usable: boolean
  requires_calculation: boolean
  negative_stem: boolean
  created_at: string
}

export type TikuListResponse = {
  items: TikuListItem[]
  total: number
  page: number
  limit: number
}

export type MaterialItem = {
  course: string
  sourceAssessment: string
  unit: number
  questionCount: number
}

export type MaterialsResponse = {
  items: MaterialItem[]
  total: number
}

export type MaterialDetailQuestion = {
  id: string
  course: string
  unit: number
  stem: string
  choices: Record<string, { text: string; misconception: string | null }>
  correct_answer: string
  explanation: string | null
  difficulty: string
  cognitive_task: string | null
  topic_code: string | null
  key_concepts: string[]
  source_type: string
  source_assessment: string
  question_number: number
  stimulus_dependent: boolean
  standalone_usable: boolean
  requires_calculation: boolean
  negative_stem: boolean
  created_at: string
}

export type MaterialDetailResponse = {
  material: {
    course: string
    sourceAssessment: string
    questionCount: number
    unit: number | null
  }
  questions: MaterialDetailQuestion[]
}

export type PersonalQuestionItem = {
  id: string
  teacher_id: string
  exercise_type: string
  difficulty: number
  question_text: string
  options: Array<{ label: string; text: string; isCorrect?: boolean }> | null
  correct_answer: string
  solution_steps: string | null
  common_mistakes: string[] | null
  tags: string[] | null
  stage: string | null
  subject: string | null
  grade_level: string | null
  textbook_version: string | null
  knowledge_points: string[] | null
  knowledge_cluster: string | null
  source_kind: string | null
  source_file_name: string | null
  review_flag: string | null
  is_ai_generated: boolean
  created_at: string
}

export type PersonalQuestionBankResponse = {
  items: PersonalQuestionItem[]
  total: number
  page: number
  limit: number
}

// 辅助函数
export function personalDifficultyLabel(level: number, isZh = false): string {
  switch (level) {
    case 1: return isZh ? "简单" : "Easy"
    case 2: return isZh ? "中等" : "Medium"
    case 3: return isZh ? "困难" : "Hard"
    case 4: return isZh ? "专家" : "Expert"
    default: return isZh ? `等级 ${level}` : `Level ${level}`
  }
}

export function personalDifficultyColors(level: number): string {
  switch (level) {
    case 1: return "bg-emerald-50 text-emerald-700"
    case 2: return "bg-amber-50 text-amber-700"
    case 3: return "bg-rose-50 text-rose-700"
    case 4: return "bg-purple-50 text-purple-700"
    default: return "bg-slate-100 text-slate-600"
  }
}

export function personalTypeLabel(type: string, isZh = false): string {
  switch (type) {
    case "MC": return isZh ? "选择题" : "MC"
    case "FR": return isZh ? "简答题" : "FR"
    case "fill_in": return isZh ? "填空题" : "Fill-in"
    default: return type
  }
}

export function listItemToSearchRow(item: TikuListItem): TikuSearchResultRow {
  return {
    id: item.id,
    course: item.course,
    unit: item.unit,
    topic_code: item.topic_code,
    difficulty: item.difficulty,
    cognitive_task: item.cognitive_task,
    transfer_distance: null,
    source_assessment: item.source_assessment,
    question_number: item.question_number,
    stem: item.stem,
    choices: item.choices,
    correct_answer: item.correct_answer,
    explanation: item.explanation,
    key_concepts: item.key_concepts ?? [],
    stimulus_id: item.stimulus_id,
    standalone_usable: item.standalone_usable,
    similarity: 0,
    stimulus_content_type: null,
    stimulus_description: null,
    stimulus_image_url: null,
  }
}

export function materialQuestionToSearchRow(item: MaterialDetailQuestion): TikuSearchResultRow {
  return {
    id: item.id,
    course: item.course,
    unit: item.unit,
    topic_code: item.topic_code,
    difficulty: item.difficulty,
    cognitive_task: item.cognitive_task,
    transfer_distance: null,
    source_assessment: item.source_assessment,
    question_number: item.question_number,
    stem: item.stem,
    choices: item.choices,
    correct_answer: item.correct_answer,
    explanation: item.explanation,
    key_concepts: item.key_concepts ?? [],
    stimulus_id: null,
    standalone_usable: item.standalone_usable,
    similarity: 0,
    stimulus_content_type: null,
    stimulus_description: null,
    stimulus_image_url: null,
  }
}
