// ChatFlow 共享类型定义

export type FlowPhase =
  | "idle"
  | "intent-loading"
  | "intent-asking"
  | "intent-summarizing"
  | "confirmed"
  | "generating"
  | "done"

export type PreviewType =
  | "dashboard"
  | "unit-info"
  | "exercises"
  | "rubric"
  | "pdf"
  | "worksheet"
  | "lesson-plan"
  | "swipe-filter"

export type ExerciseType = "MC" | "FR" | "MIXED"

export interface MockExercise {
  id: string
  questionText: string
  type: Exclude<ExerciseType, "MIXED">
  difficulty: 1 | 2 | 3 | 4
  options?: Array<{ label: string; text: string; isCorrect: boolean }>
  correctAnswer: string
  solutionSteps: string
}

export interface MockRubricDimension {
  id: string
  name: string
  description: string
  weight: number
  levels: {
    excellent: string
    good: string
    passing: string
    failing: string
  }
}

export interface MockRubric {
  id: string
  title: string
  dimensions: MockRubricDimension[]
  columnLabels?: {
    dimension?: string
    excellent?: string
    good?: string
    passing?: string
    failing?: string
    weight?: string
    actions?: string
  }
}

export interface MockUnit {
  id: string
  unitNumber: string
  title: string
  topics: string[]
  exerciseCount: number
  lastGenerated: string
}

export interface MockCourse {
  id: string
  name: string
  code: string
  units: MockUnit[]
}

export interface FollowUpOption {
  label: string
  value: string | number | boolean
}

export type ParamSource = "user_input" | "ai_inferred" | "default"

export interface QuickOption {
  label: string
  value: string
  field: string
  icon?: string
}

export type IntentTrack = "ap" | "general"

export interface OptionChoice {
  key: string
  label: string
  value: string
  field: string
  isOther: boolean
  description?: string
}

export interface OptionQuestion {
  question: string
  options: OptionChoice[]
  questionType: "required" | "preference"
  field: string
}

export type IntentCompleteness = "complete" | "needs_info"

export type InferenceConfidenceLevel = "high" | "medium" | "low"

export interface ConfirmationQuestionPayload {
  text: string
  field: string
  options: Array<{ label: string; value: string }>
}

export interface ConfirmationPayload {
  summary: string
  canAutoConfirm: boolean
  question?: ConfirmationQuestionPayload
}

export interface InferencePayload {
  overallConfidence?: InferenceConfidenceLevel
  needsConfirmation?: boolean
  criticalUnknowns?: string[]
}

export interface IntentResponse {
  intent: IntentData
  source: "model" | "fallback"
  completeness: IntentCompleteness
  missingRequired: string[]
  followUpQuestion?: string
  followUpOptions?: QuickOption[]
  optionQuestion?: OptionQuestion
  naturalConfirmation?: string
  confirmation?: ConfirmationPayload
  inference?: InferencePayload
  model?: string
}

export type ParamSummarySource = "user_specified" | "context_inferred" | "default"

export interface ParamSummaryItem {
  field: string
  label: string
  value: string
  source: ParamSummarySource
}

export interface FollowUpQuestion {
  id: string
  question: string
  field: string
  options: FollowUpOption[]
  defaultIndex: number
  source?: ParamSource
}

export interface DynamicParamOption {
  label: string
  value: string | number | boolean
  recommended?: boolean
}

export interface DynamicParam {
  id: string
  field: string
  label: string
  source: ParamSource
  value: unknown
  options: DynamicParamOption[]
  editable: boolean
}

export type WorksheetSource = "from_existing" | "generate_new"

export interface IntentData {
  action:
    | "generate_exercises"
    | "generate_rubric"
    | "export_pdf"
    | "save_exercises"
    | "create_worksheet"
    | "full_workflow"
    | "generate_lesson_plan"
    | "scan_pdf"
  actions?: Array<
    | "generate_exercises"
    | "generate_rubric"
    | "export_pdf"
    | "save_exercises"
    | "create_worksheet"
    | "full_workflow"
    | "generate_lesson_plan"
    | "scan_pdf"
  >
  count: number
  exerciseType: ExerciseType
  difficulty: 1 | 2 | 3 | 4
  courseId: string
  courseName: string
  unitId: string
  unitName: string
  topicId?: string
  topicName?: string
  track?: IntentTrack
  topic?: string
  subjectCategory?: string
  gradeLevel?: string
  enableWebSearch?: boolean
  warning?: string
  includeAnswerKey?: boolean
  rubricDimensionCount?: number
  rubricLevelCount?: number
  worksheetSource?: WorksheetSource
  worksheetTitle?: string
  duration?: number
  level?: "基础" | "中等" | "进阶" | "basic" | "medium" | "advanced"
  template?: string
  teacherRequest?: string
  topicFocus?: string
  followUpQuestions?: FollowUpQuestion[]
  dynamicParams?: DynamicParam[]
}

export interface MockWorksheetSection {
  id: string
  title: string
  instructions: string
  exerciseIds: string[]
  pointsPerQuestion: number
}

export interface MockWorksheet {
  id: string
  title: string
  courseName: string
  totalPoints: number
  sections: MockWorksheetSection[]
}

export type LessonStepPhase =
  | "warm-up"
  | "instruction"
  | "practice"
  | "summary"
  | "extension"

export interface MockLessonStep {
  id: string
  phase: LessonStepPhase
  title: string
  duration: number
  teacherActions: string[]
  studentActions: string[]
}

export interface MockLessonPlan {
  id: string
  title: string
  courseName: string
  unitName: string
  totalMinutes: number
  level: "基础" | "中等" | "进阶"
  objectives: string[]
  keyPoints: string[]
  difficulties: string[]
  steps: MockLessonStep[]
  resources: string[]
  assessment: string
  sectionLabels?: {
    objectives?: string
    keyPoints?: string
    difficulties?: string
    resources?: string
    assessment?: string
  }
}

export type SwipeDecision = "keep" | "discard" | "pending"

export interface CommunityResource {
  id: string
  authorName: string
  authorSchool: string
  authorAvatar: string
  title: string
  subject: string
  rating: number
  useCount: number
  type: "lesson-plan" | "exercises" | "rubric" | "worksheet"
}

export type ChatMessageKind = "text" | "status"
export type ChatStatusState = "generating" | "completed" | "failed" | "cancelled"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  kind?: ChatMessageKind
  content: string
  timestamp: number
  targetTabId?: string
  statusMeta?: {
    state: ChatStatusState
    taskId?: string
    canCancel?: boolean
    canRetry?: boolean
    retryIntent?: IntentData
    tabId?: string
  }
  suggestions?: string[]
  intentQuestion?: {
    question: string
    optionQuestion?: OptionQuestion
    quickOptions?: QuickOption[]
    roundNumber?: number
    missingFields: string[]
  }
  intentSummary?: {
    action: IntentData["action"]
    actionLabel: string
    params: ParamSummaryItem[]
    canAutoConfirm: boolean
    confirmed?: boolean
  }
}

export interface PreviewContent {
  type: PreviewType
  exercises?: MockExercise[]
  rubric?: MockRubric
  unit?: MockUnit
  generatingProgress?: { current: number; total: number; label?: string }
  pdfTitle?: string
  worksheet?: MockWorksheet
  lessonPlan?: MockLessonPlan
  swipeExercises?: MockExercise[]
  errorMessage?: string
}

export type CanvasTabType = "exercises" | "rubric" | "worksheet" | "lesson-plan"
export type CanvasTabStatus = "generating" | "completed" | "failed"

export interface CanvasTab {
  id: string
  type: CanvasTabType
  title: string
  status: CanvasTabStatus
  content: PreviewContent
  createdAt: number
  meta?: Record<string, unknown>
}

export type SelectableItemType = "exercise" | "rubric-dimension" | "lesson-step"

export interface CanvasSelection {
  type: SelectableItemType
  itemId: string
  label: string
}

export type AiRewriteStatus = "idle" | "loading" | "preview" | "error"

export interface AiRewriteResult {
  selection: CanvasSelection
  beforeText: string
  afterText: string
  rewrittenData: MockExercise | MockRubricDimension | MockLessonStep
}

export interface AiRewriteContext {
  status: AiRewriteStatus
  result: AiRewriteResult | null
  errorMessage: string
}

export interface ChatPanelProps {
  messages: ChatMessage[]
  phase: FlowPhase
  inputValue: string
  onInputChange: (value: string) => void
  onSendMessage: () => void
  onSuggestionClick: (suggestion: string) => void
  onMessageJump?: (tabId: string) => void
  onStatusAction?: (message: ChatMessage, action: "cancel" | "retry") => void
  intentLoading: boolean
  onIntentQuickOptionClick?: (option: QuickOption) => void
  onIntentOptionSelect?: (
    option: OptionChoice,
    context: { questionType: "required" | "preference"; field: string },
  ) => void
  onIntentOptionOtherSubmit?: (payload: {
    field: string
    value: string
    questionType: "required" | "preference"
  }) => void
  isOtherInput?: boolean
  otherInputField?: string | null
  onIntentSummaryConfirm?: (messageId: string) => void
  onIntentSummaryModify?: (messageId: string) => void
  onPdfSubmit?: (files: File[], draftText?: string) => void
  timelineSteps?: Array<{ id: string; label: string; status: string; detail?: string }>
  timelineElapsed?: number
  canvasSelection?: CanvasSelection | null
  rewriteStatus?: AiRewriteStatus
  onClearSelection?: () => void
}

export interface PreviewPanelProps {
  content: PreviewContent
  phase: FlowPhase
  tabStatus?: CanvasTabStatus
  pdfExporting?: string | null
  onExerciseToggleAnswer?: (id: string) => void
  onExerciseChange?: (exerciseId: string, exercise: MockExercise) => void
  onExerciseDelete?: (id: string) => void
  onExerciseRegenerate?: (id: string) => Promise<void>
  onExerciseReorder?: (fromIndex: number, toIndex: number) => void
  onRubricChange?: (rubric: MockRubric) => void
  onWorksheetChange?: (worksheet: MockWorksheet) => void
  onLessonPlanChange?: (lessonPlan: MockLessonPlan) => void
  onAction?: (action: string) => void
  onSwipeDecision?: (exerciseId: string, decision: SwipeDecision) => void
  onSwipeComplete?: (keptExercises: MockExercise[]) => void
  timelineSteps?: Array<{ id: string; label: string; status: string; detail?: string }>
  timelineElapsed?: number
  canvasSelection?: CanvasSelection | null
  onSelectItem?: (selection: CanvasSelection) => void
  rewriteContext?: AiRewriteContext | null
  onAcceptRewrite?: () => void
  onRejectRewrite?: () => void
}

export interface RecentWork {
  id: string
  title: string
  type: "exercises" | "rubric" | "worksheet" | "lesson-plan" | "pdf"
  timestamp: string
  detail: string
}
