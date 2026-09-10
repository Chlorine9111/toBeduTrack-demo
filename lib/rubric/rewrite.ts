import { z } from "zod"
import { generateToolInputWithGateway } from "@/lib/ai/gateway"
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router"
import type { MockRubricDimension } from "@/types/chatflow"

const rubricDimensionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(1000),
  weight: z.number().min(0).max(100),
  levels: z.object({
    excellent: z.string().min(1).max(1200),
    good: z.string().min(1).max(1200),
    passing: z.string().min(1).max(1200),
    failing: z.string().min(1).max(1200),
  }),
})

function isRubricRewriteAiConfigured() {
  try {
    getResolvedLanguageModelForTask("rubric_generate")
    return true
  } catch {
    return false
  }
}

export async function rewriteRubricDimensionWithAi(input: {
  instruction: string
  currentDimension: MockRubricDimension
}): Promise<MockRubricDimension> {
  if (!isRubricRewriteAiConfigured()) {
    throw new Error("AI 服务未配置")
  }

  const model = getResolvedLanguageModelForTask("rubric_generate")

  const tool = {
    name: "return_rewritten_rubric_dimension",
    description: "Return rewritten rubric dimension",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "description", "weight", "levels"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        weight: { type: "number" },
        levels: {
          type: "object",
          additionalProperties: false,
          required: ["excellent", "good", "passing", "failing"],
          properties: {
            excellent: { type: "string" },
            good: { type: "string" },
            passing: { type: "string" },
            failing: { type: "string" },
          },
        },
      },
    },
  } as const

  const systemPrompt = [
    "你是评分量规编辑助手。",
    "任务：按教师指令改写单个维度，提升可观察性和可区分性。",
    "要求：",
    "1) 不要改动学科语境；",
    "2) 维度描述要具体、可观察；",
    "3) 四个等级要有清晰梯度；",
    "4) 仅返回工具调用。",
  ].join("\n")

  const userPrompt = [
    `教师指令：${input.instruction}`,
    "当前维度 JSON：",
    JSON.stringify(input.currentDimension, null, 2),
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
    throw new Error(`Rubric 改写失败：${message}`)
  }

  const parsed = rubricDimensionSchema.safeParse(raw)
  if (parsed.success) {
    return {
      ...parsed.data,
      id: input.currentDimension.id,
    }
  }
  throw new Error("Rubric 改写结果不合法，请重试")
}
