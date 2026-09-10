import { z } from "zod"
import { generateToolInputWithGateway } from "@/lib/ai/gateway"
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router"
import type { MockExercise } from "@/types/chatflow"

const optionSchema = z.object({
  label: z.string().min(1).max(4),
  text: z.string().min(1).max(600),
  isCorrect: z.boolean(),
})

const exerciseSchema = z
  .object({
    id: z.string().min(1),
    questionText: z.string().min(1).max(5000),
    type: z.enum(["MC", "FR"]),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    options: z.array(optionSchema).optional(),
    correctAnswer: z.string().min(1).max(80),
    solutionSteps: z.string().min(1).max(7000),
  })
  .superRefine((value, ctx) => {
    if (value.type === "MC") {
      if (!value.options || value.options.length !== 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MC 题必须有且仅有 4 个选项",
          path: ["options"],
        })
        return
      }
      const correctCount = value.options.filter((option) => option.isCorrect).length
      if (correctCount !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MC 题必须且仅能有 1 个正确选项",
          path: ["options"],
        })
      }
    }
  })

function isExerciseRewriteAiConfigured() {
  try {
    getResolvedLanguageModelForTask("exercise_generate")
    return true
  } catch {
    return false
  }
}

export async function rewriteExerciseWithAi(input: {
  instruction: string
  currentExercise: MockExercise
}): Promise<MockExercise> {
  if (!isExerciseRewriteAiConfigured()) {
    throw new Error("AI 服务未配置")
  }

  const model = getResolvedLanguageModelForTask("exercise_generate")

  const tool = {
    name: "return_rewritten_exercise",
    description: "Return rewritten exercise",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id", "questionText", "type", "difficulty", "correctAnswer", "solutionSteps"],
      properties: {
        id: { type: "string" },
        questionText: { type: "string" },
        type: { type: "string", enum: ["MC", "FR"] },
        difficulty: { type: "integer", enum: [1, 2, 3, 4] },
        options: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "text", "isCorrect"],
            properties: {
              label: { type: "string" },
              text: { type: "string" },
              isCorrect: { type: "boolean" },
            },
          },
        },
        correctAnswer: { type: "string" },
        solutionSteps: { type: "string" },
      },
    },
  } as const

  const systemPrompt = [
    "你是资深命题编辑。",
    "任务：按教师指令改写一道题。",
    "硬性要求：",
    "1) 保持学科语境，不要换学科。",
    "2) type=MC 时必须 4 个选项且仅 1 个正确。",
    "3) type=FR 时 options 置空或省略。",
    "4) 保留 LaTeX 原样，不要损坏反斜杠。",
    "5) 仅返回工具调用。",
  ].join("\n")

  const userPrompt = [
    `教师指令：${input.instruction}`,
    "当前题目 JSON：",
    JSON.stringify(input.currentExercise, null, 2),
  ].join("\n\n")

  let raw: Record<string, unknown>
  try {
    const toolResult = await generateToolInputWithGateway<Record<string, unknown>>({
      model,
      systemPrompt,
      userPrompt,
      tool,
      maxTokens: 2400,
      temperature: 0.4,
      maxRetries: 2,
    })
    raw = toolResult.input
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知异常"
    throw new Error(`习题改写失败：${message}`)
  }

  const parsed = exerciseSchema.safeParse(raw)
  if (parsed.success) {
    return {
      ...parsed.data,
      id: input.currentExercise.id,
      options: parsed.data.type === "MC" ? parsed.data.options : undefined,
    }
  }
  throw new Error("习题改写结果不合法，请重试")
}
