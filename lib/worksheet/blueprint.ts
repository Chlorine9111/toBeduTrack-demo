import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router"
import { generateStructuredObject } from "@/lib/ai/structured-output"

type InventoryEntry = {
  topicCode: string
  difficulty: string
  count: number
}

export type InventorySnapshot = {
  course: string
  unit: number | null
  topics: Record<string, { easy: number; medium: number; hard: number }>
  totalAvailable: number
}

export async function queryQuestionInventory(
  supabase: SupabaseClient,
  course: string,
  unit?: number,
): Promise<InventorySnapshot> {
  let query = supabase
    .from("questions")
    .select("topic_code, difficulty")
    .eq("status", "active")

  if (course) {
    query = query.eq("course", course)
  }

  if (unit != null) {
    query = query.eq("unit", unit)
  }

  const { data, error } = await query.limit(20000)

  if (error) {
    throw new Error(`Failed to query question inventory: ${error.message}`)
  }

  const topics: Record<string, { easy: number; medium: number; hard: number }> = {}
  let totalAvailable = 0

  for (const row of data ?? []) {
    const tc = (row as { topic_code: string | null; difficulty: string }).topic_code ?? "unknown"
    const diff = (row as { topic_code: string | null; difficulty: string }).difficulty ?? "medium"

    if (!topics[tc]) {
      topics[tc] = { easy: 0, medium: 0, hard: 0 }
    }

    if (diff === "easy") topics[tc].easy++
    else if (diff === "hard") topics[tc].hard++
    else topics[tc].medium++

    totalAvailable++
  }

  return { course, unit: unit ?? null, topics, totalAvailable }
}

export const blueprintSchema = z.object({
  intent: z.string().min(4).max(300),
  totalQuestions: z.number().int().min(1).max(60),
  difficultyDistribution: z.object({
    easy: z.number().int().min(0),
    medium: z.number().int().min(0),
    hard: z.number().int().min(0),
  }),
  slots: z.array(z.object({
    topicCode: z.string(),
    topicLabel: z.string(),
    difficulty: z.enum(["easy", "medium", "hard"]),
    count: z.number().int().min(1).max(20),
    searchHint: z.string().max(200),
  })).min(1).max(30),
})

export type Blueprint = z.infer<typeof blueprintSchema>

function formatInventoryForPrompt(inventory: InventorySnapshot): string {
  const lines: string[] = []
  for (const [topicCode, counts] of Object.entries(inventory.topics)) {
    const total = counts.easy + counts.medium + counts.hard
    lines.push(`${topicCode}: ${total} total (${counts.easy}E/${counts.medium}M/${counts.hard}H)`)
  }
  return lines.join("\n")
}

export async function generateBlueprint(params: {
  prompt: string
  course: string
  unit?: number
  questionCount: number
  inventory: InventorySnapshot
  abortSignal?: AbortSignal
}): Promise<Blueprint> {
  const inventoryText = formatInventoryForPrompt(params.inventory)

  return generateStructuredObject({
    model: getResolvedLanguageModelForTask("worksheet_blueprint"),
    schema: blueprintSchema,
    systemPrompt: `You are an AP exam blueprint architect. Given a teacher's request and the actual question inventory for their course, generate a structured selection blueprint.

Rules:
- Default difficulty distribution: 30% Easy, 50% Medium, 20% Hard
- Adjust distribution if teacher explicitly requests it, OR if inventory is heavily skewed (e.g., only 3 hard questions → reduce hard, increase medium)
- Maximize topic_code coverage within the requested scope
- "comprehensive review" or no specific topic → spread across all available topics
- Teacher specifies a topic → focus slots on that topic, still vary difficulty
- Each slot: topicCode + difficulty + count + searchHint (a concise phrase for semantic search)
- Sum of all slot counts must equal the requested question count exactly
- If a topic+difficulty combo has <2 available questions, merge into adjacent difficulty or skip that slot
- Prefer topics with more available questions to ensure quality selection`,
    userPrompt: `Teacher request: "${params.prompt}"
Course: ${params.course}${params.unit != null ? `, Unit ${params.unit}` : ""}
Requested questions: ${params.questionCount}

Available question inventory:
${inventoryText}

Total available: ${params.inventory.totalAvailable} questions`,
    temperature: 0.3,
    maxTokens: 800,
    maxRetries: 2,
    abortSignal: params.abortSignal,
  })
}
