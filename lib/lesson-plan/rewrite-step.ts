import { z } from "zod"
import { generateToolInputWithGateway } from "@/lib/ai/gateway"
import { generateStructuredObject } from "@/lib/ai/structured-output"
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router"
import type { LessonStepPhase, MockLessonStep } from "@/types/chatflow"

const lessonStepSchema = z.object({
  id: z.string().min(1),
  phase: z.enum(["warm-up", "instruction", "practice", "summary", "extension"]),
  title: z.string().min(1).max(200),
  duration: z.number().int().min(1).max(120),
  teacherActions: z.array(z.string().min(1).max(400)).min(1).max(8),
  studentActions: z.array(z.string().min(1).max(400)).min(1).max(8),
})

function normalizePhase(value: unknown): LessonStepPhase {
  if (value === "warm-up" || value === "instruction" || value === "practice" || value === "summary" || value === "extension") {
    return value
  }
  return "instruction"
}

function toNonEmptyStrings(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback
  const next = value
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0)
    .slice(0, 8)
  return next.length > 0 ? next : fallback
}

export async function rewriteLessonStepWithAi(input: {
  instruction: string
  currentStep: MockLessonStep
}): Promise<MockLessonStep> {
  const model = getResolvedLanguageModelForTask("lesson_rewrite")

  const tool = {
    name: "return_rewritten_step",
    description: "Return rewritten lesson step",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id", "phase", "title", "duration", "teacherActions", "studentActions"],
      properties: {
        id: { type: "string" },
        phase: { type: "string", enum: ["warm-up", "instruction", "practice", "summary", "extension"] },
        title: { type: "string" },
        duration: { type: "integer", minimum: 1, maximum: 120 },
        teacherActions: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
        studentActions: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
      },
    },
  } as const

  const systemPrompt = [
    "你是教学设计编辑助手。",
    "任务：基于教师指令改写单个教学环节(step)。",
    "要求：",
    "1) 保持课程语境，不要改成其他学科。",
    "2) 教师活动与学生活动必须不同，且可执行。",
    "3) 不要生成空泛口号，尽量给出具体课堂动作。",
    "4) 仅返回工具调用，不返回自然语言。",
  ].join("\n")

  const userPrompt = [
    `教师指令：${input.instruction}`,
    "当前 step JSON：",
    JSON.stringify(input.currentStep, null, 2),
  ].join("\n\n")

  const raw = await generateStructuredObject({
    model,
    schema: lessonStepSchema,
    systemPrompt,
    userPrompt,
    maxTokens: 2000,
    temperature: 0.4,
    maxRetries: 2,
  }).catch(async () => {
    const toolResult = await generateToolInputWithGateway<Record<string, unknown>>({
      model,
      systemPrompt,
      userPrompt,
      tool,
      maxTokens: 2000,
      temperature: 0.4,
      maxRetries: 2,
    })
    return toolResult.input
  })

  const parsed = lessonStepSchema.safeParse(raw)
  if (parsed.success) {
    return parsed.data
  }

  // 兜底归一化，避免模型轻微格式偏差导致整次失败。
  return {
    id: String(raw.id ?? input.currentStep.id),
    phase: normalizePhase(raw.phase ?? input.currentStep.phase),
    title: String(raw.title ?? input.currentStep.title).trim() || input.currentStep.title,
    duration: Number.isFinite(Number(raw.duration))
      ? Math.max(1, Math.min(120, Math.round(Number(raw.duration))))
      : input.currentStep.duration,
    teacherActions: toNonEmptyStrings(raw.teacherActions, input.currentStep.teacherActions),
    studentActions: toNonEmptyStrings(raw.studentActions, input.currentStep.studentActions),
  }
}
