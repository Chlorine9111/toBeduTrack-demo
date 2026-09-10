import type {
  MockLessonPlan,
  MockLessonStep,
  LessonStepPhase,
} from "@/types/chatflow"

const VALID_PHASES: LessonStepPhase[] = [
  "warm-up",
  "instruction",
  "practice",
  "summary",
  "extension",
]

const PHASE_KEYWORDS: Array<{ phase: LessonStepPhase; pattern: RegExp }> = [
  { phase: "warm-up", pattern: /(导入|预热|情境|问题抛出|warm)/i },
  { phase: "instruction", pattern: /(概念|讲解|定义|原理|instruction)/i },
  { phase: "practice", pattern: /(练习|例题|演练|quiz|practice|模拟)/i },
  { phase: "summary", pattern: /(总结|小结|回顾|summary)/i },
  { phase: "extension", pattern: /(拓展|延伸|反思|extension)/i },
]
const ACTION_NOISE_PATTERNS = [/^h[1-6]$/i, /^(heading|title|text)$/i]

function normalizePhase(raw: unknown): LessonStepPhase {
  if (typeof raw === "string" && VALID_PHASES.includes(raw as LessonStepPhase)) {
    return raw as LessonStepPhase
  }
  return "instruction"
}

function inferPhaseByTitle(title: string, index: number): LessonStepPhase {
  for (const item of PHASE_KEYWORDS) {
    if (item.pattern.test(title)) {
      return item.phase
    }
  }
  return VALID_PHASES[Math.min(index, VALID_PHASES.length - 1)] ?? "instruction"
}

function toStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((item) => String(item ?? ""))
  if (typeof raw === "string") return [raw]
  return []
}

function collectText(raw: unknown): string[] {
  if (raw == null) return []
  if (typeof raw === "string") return [raw]
  if (typeof raw === "number" || typeof raw === "boolean") return [String(raw)]
  if (Array.isArray(raw)) return raw.flatMap((item) => collectText(item))
  if (typeof raw === "object") {
    return Object.values(raw as Record<string, unknown>).flatMap((item) => collectText(item))
  }
  return []
}

function sanitizeActionLine(line: string): string {
  return line
    .replace(/^#{1,6}\s*/g, "")
    .replace(/^h[1-6]\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeActions(raw: unknown, fallback: string): string[] {
  const lines = collectText(raw)
    .map((item) => sanitizeActionLine(item))
    .filter((item) => item.length > 0)
    .filter((item) => !ACTION_NOISE_PATTERNS.some((pattern) => pattern.test(item)))
    .filter((item, index, all) => all.indexOf(item) === index)
    .filter(
      (item, _index, all) =>
        !all.some(
          (other) =>
            other !== item &&
            item.length <= 18 &&
            other.length >= item.length + 4 &&
            other.includes(item),
        ),
    )
    .slice(0, 3)

  if (lines.length > 0) {
    return lines
  }
  return [fallback]
}

type LessonBlock = {
  type: string
  subtype?: string
  content: Record<string, unknown>
}

function normalizeBlockList(rawBlocks: unknown): LessonBlock[] {
  if (!Array.isArray(rawBlocks)) return []
  return rawBlocks
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      type: String(item.type ?? ""),
      subtype: typeof item.subtype === "string" ? item.subtype : undefined,
      content:
        item.content && typeof item.content === "object" && !Array.isArray(item.content)
          ? (item.content as Record<string, unknown>)
          : {},
    }))
}

function splitTeacherStudentFromLine(line: string): { teacher?: string; student?: string } {
  const clean = sanitizeActionLine(line).replace(/^\[\d+\s*(分钟|min|mins|秒)\]\s*/i, "")
  if (!clean) return {}

  const teacherMatch =
    clean.match(/(?:^|[，。；;])\s*(?:Teacher[:：]\s*)?教师[^，。；;!?！？]*/i) ??
    clean.match(/^(?:Teacher[:：]\s*)?[^，。；;!?！？]*/)
  const studentMatch =
    clean.match(/(?:^|[，。；;])\s*学生[^，。；;!?！？]*/i) ??
    clean.match(/(?:^|[，。；;])\s*(?:小组|同伴|全班|两人一组)[^，。；;!?！？]*/i)

  const teacher = teacherMatch?.[0]?.replace(/^[:：\s]+/, "").trim()
  const student = studentMatch?.[0]?.replace(/^[:：\s]+/, "").trim()

  return {
    teacher: teacher && teacher.length > 0 ? teacher : undefined,
    student: student && student.length > 0 ? student : undefined,
  }
}

function teacherActionCandidates(blocks: LessonBlock[]): string[] {
  const candidates: string[] = []
  for (const block of blocks) {
    if (block.type === "paragraph") {
      const text = String(block.content.text ?? "")
      if (!text) continue
      const split = splitTeacherStudentFromLine(text)
      if (split.teacher) candidates.push(split.teacher)
      continue
    }
    if (block.type === "steps") {
      const items = Array.isArray(block.content.items) ? block.content.items : []
      for (const item of items) {
        const split = splitTeacherStudentFromLine(String(item ?? ""))
        if (split.teacher) candidates.push(split.teacher)
      }
      continue
    }
    if (block.type === "callout") {
      const text = String(block.content.text ?? "")
      if (text) candidates.push(text)
    }
  }
  return candidates
}

function studentActionCandidates(blocks: LessonBlock[]): string[] {
  const candidates: string[] = []
  for (const block of blocks) {
    if (block.type === "quiz" || block.type === "poll") {
      const question = String(block.content.question ?? "")
      if (question) {
        candidates.push(`回答并解释：${question}`)
      }
      continue
    }
    if (block.type === "example") {
      const prompt = String(block.content.prompt ?? "")
      if (prompt) {
        candidates.push(`完成例题并说明理由：${prompt}`)
      }
      continue
    }
    if (block.type === "steps") {
      const items = Array.isArray(block.content.items) ? block.content.items : []
      for (const item of items) {
        const split = splitTeacherStudentFromLine(String(item ?? ""))
        if (split.student) candidates.push(split.student)
      }
      continue
    }
    if (block.type === "paragraph") {
      const text = String(block.content.text ?? "")
      if (!text) continue
      const split = splitTeacherStudentFromLine(text)
      if (split.student) candidates.push(split.student)
    }
  }
  return candidates
}

function adaptStep(raw: Record<string, unknown>, index: number): MockLessonStep {
  return {
    id: String(raw.id ?? `step-${index + 1}`),
    phase: normalizePhase(raw.phase ?? raw.sectionType),
    title: String(raw.title ?? `Step ${index + 1}`),
    duration: Number(raw.duration ?? 5),
    teacherActions: toStringArray(raw.teacherActions ?? raw.teacher_actions),
    studentActions: toStringArray(raw.studentActions ?? raw.student_actions),
  }
}

function adaptSectionToStep(raw: Record<string, unknown>, index: number): MockLessonStep {
  const title = String(raw.title ?? `Step ${index + 1}`)
  const blocks = normalizeBlockList(raw.blocks)
  return {
    id: String(raw.id ?? `step-${index + 1}`),
    phase: inferPhaseByTitle(title, index),
    title,
    duration: Number(raw.durationMinutes ?? raw.duration ?? 5),
    teacherActions: normalizeActions(
      teacherActionCandidates(blocks),
      "讲解核心概念并引导学生建立结构化理解。",
    ),
    studentActions: normalizeActions(
      studentActionCandidates(blocks),
      "完成当堂练习并用数学语言解释解题思路。",
    ),
  }
}

export function adaptLessonPlanFromEvents(
  events: Record<string, unknown>[],
  options?: {
    excludeLastIncomplete?: boolean
  },
): MockLessonPlan {
  const plan: MockLessonPlan = {
    id: "lesson-plan-pending",
    title: "",
    courseName: "当前课程",
    unitName: "当前单元",
    totalMinutes: 45,
    level: "中等",
    objectives: [],
    keyPoints: [],
    difficulties: [],
    steps: [],
    resources: [],
    assessment: "",
    sectionLabels: {},
  }

  if (!Array.isArray(events)) return plan

  const streamCompleted = events.some((event) => event?.type === "complete")
  let lastSectionEventIndex = -1
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i]
    if (!event || typeof event !== "object") continue
    const hasSectionPayload =
      event.type === "section" &&
      event.section != null &&
      typeof event.section === "object" &&
      !Array.isArray(event.section)
    if (hasSectionPayload) {
      lastSectionEventIndex = i
    }
  }
  const skipSectionEventIndex =
    options?.excludeLastIncomplete && !streamCompleted ? lastSectionEventIndex : -1

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]
    if (event == null || typeof event !== "object") continue

    const type = event.type as string
    const content = event.content

    if (type === "meta") {
      plan.id = String(event.planId ?? plan.id)
      plan.title = String(event.title ?? plan.title)
      if (event.courseName) plan.courseName = String(event.courseName)
      if (event.unitName) plan.unitName = String(event.unitName)
      if (event.totalMinutes) plan.totalMinutes = Number(event.totalMinutes)
      if (event.level) {
        const level = String(event.level)
        if (["基础", "中等", "进阶"].includes(level)) {
          plan.level = level as MockLessonPlan["level"]
        }
      }
      continue
    }

    if (type === "section") {
      const sectionPayload = event.section
      if (sectionPayload != null && typeof sectionPayload === "object" && !Array.isArray(sectionPayload)) {
        if (index === skipSectionEventIndex) {
          continue
        }
        const step = adaptSectionToStep(
          sectionPayload as Record<string, unknown>,
          plan.steps.length,
        )
        plan.steps = [...plan.steps, step]
        continue
      }

      const sectionType = event.sectionType as string

      if (sectionType === "objectives") {
        plan.objectives = toStringArray(content)
      } else if (sectionType === "key_points") {
        const parsed = content as Record<string, unknown> | unknown
        if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
          plan.keyPoints = toStringArray(
            (parsed as Record<string, unknown>).keyPoints ??
            (parsed as Record<string, unknown>).key_points ??
            []
          )
          plan.difficulties = toStringArray(
            (parsed as Record<string, unknown>).difficulties ?? []
          )
        } else {
          plan.keyPoints = toStringArray(content)
        }
      } else if (sectionType === "steps") {
        const stepsRaw = Array.isArray(content) ? content : []
        plan.steps = stepsRaw.map(
          (s: Record<string, unknown>, i: number) => adaptStep(s ?? {}, i)
        )
      } else if (sectionType === "assessment") {
        plan.assessment = typeof content === "string"
          ? content
          : JSON.stringify(content ?? "")
      } else if (sectionType === "resources") {
        plan.resources = toStringArray(content)
      }

      continue
    }
  }

  if (plan.steps.length > 0) {
    plan.totalMinutes = plan.steps.reduce((total, step) => total + step.duration, 0)
  }
  if (plan.objectives.length === 0) {
    plan.objectives = [
      "理解本单元核心概念并建立知识结构。",
      "能够在典型题型中应用方法并完成完整推理。",
    ]
  }
  if (plan.keyPoints.length === 0) {
    plan.keyPoints = plan.steps.slice(0, 3).map((step) => step.title)
  }
  if (plan.difficulties.length === 0) {
    plan.difficulties = ["概念抽象与符号表达", "多步骤推理的连贯性"]
  }
  if (plan.resources.length === 0) {
    plan.resources = ["课堂讲义", "分层练习题", "板书结构图"]
  }
  if (!plan.assessment) {
    plan.assessment = "课堂即时检测 + 课后巩固作业"
  }

  return plan
}
