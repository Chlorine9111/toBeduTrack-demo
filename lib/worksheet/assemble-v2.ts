import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router"
import { generateStructuredObject } from "@/lib/ai/structured-output"
import {
  queryQuestionInventory,
  generateBlueprint,
  type Blueprint,
} from "./blueprint"
import {
  fillBlueprintSlots,
  selectFromSlotResults,
  type FilledQuestion,
} from "./slot-filler"

// ── Types ──

export type AssembleV2Input = {
  supabase: SupabaseClient
  prompt: string
  course: string
  unit?: number
  questionCount: number
  abortSignal?: AbortSignal
}

export type AssembleV2Section = {
  title: string
  rationale: string
  questionIds: string[]
}

export type AssembleV2Result = {
  blueprint: Blueprint
  questions: FilledQuestion[]
  sections: AssembleV2Section[]
  skipped: Array<{ questionId: string; reason: string }>
  summary: string
}

// ── Phase 3: Curation ──

const curationSchema = z.object({
  sections: z.array(z.object({
    title: z.string().min(2).max(80),
    rationale: z.string().min(4).max(220),
    questionIds: z.array(z.string().uuid()).min(1),
  })).min(1).max(4),
  skipped: z.array(z.object({
    questionId: z.string().uuid(),
    reason: z.string().max(200),
  })).default([]),
  summary: z.string().min(8).max(400),
})

function buildQuestionCatalog(questions: FilledQuestion[]): string {
  return questions
    .map((q, i) => {
      const stemPreview = (q.stem ?? "").replace(/\s+/g, " ").trim().slice(0, 140)
      const choiceCount = Object.keys(q.choices ?? {}).length
      return [
        `${i + 1}. id=${q.id}`,
        `difficulty=${q.difficulty}`,
        `topic=${q.topic_code ?? "unknown"}`,
        `cognitive=${q.cognitive_task ?? "unknown"}`,
        choiceCount > 0 ? `choices=${choiceCount}` : "",
        q.explanation ? "has_explanation" : "",
        `stem="${stemPreview}"`,
      ].filter(Boolean).join(" | ")
    })
    .join("\n")
}

async function curateSelection(params: {
  questions: FilledQuestion[]
  blueprint: Blueprint
  prompt: string
  abortSignal?: AbortSignal
}): Promise<z.infer<typeof curationSchema>> {
  try {
    return await generateStructuredObject({
      model: getResolvedLanguageModelForTask("worksheet_curate"),
      schema: curationSchema,
      systemPrompt: `You are an AP exam quality reviewer. You receive a pre-selected set of questions assembled by a blueprint system. Your job:

1. All questions are SELECTED by default. Only mark a question as "skipped" if it has genuinely poor quality (empty/broken stem, duplicate concept with another question in the set).
2. Group questions into 1-3 exam sections with descriptive titles (e.g., "Conceptual Understanding", "Application & Analysis", "Synthesis & Evaluation").
3. Within each section, order questions from easier to harder.
4. Every question ID must appear in exactly one section OR in skipped. Do not drop any question silently.
5. Write a brief summary describing the assembled worksheet.`,
      userPrompt: `Teacher's original request: "${params.prompt}"
Blueprint intent: ${params.blueprint.intent}
Difficulty target: ${params.blueprint.difficultyDistribution.easy}E / ${params.blueprint.difficultyDistribution.medium}M / ${params.blueprint.difficultyDistribution.hard}H

Questions to review (${params.questions.length} total):
${buildQuestionCatalog(params.questions)}`,
      temperature: 0.2,
      maxTokens: 1200,
      maxRetries: 2,
      abortSignal: params.abortSignal,
    })
  } catch {
    return {
      sections: [{
        title: "Practice Questions",
        rationale: "Questions selected by blueprint, ordered by difficulty.",
        questionIds: params.questions.map((q) => q.id),
      }],
      skipped: [],
      summary: `${params.questions.length} questions assembled for ${params.blueprint.intent}.`,
    }
  }
}

// ── Main orchestrator ──

export async function assembleWorksheetV2(input: AssembleV2Input): Promise<AssembleV2Result> {
  // Phase 1: Inventory + Blueprint
  const inventory = await queryQuestionInventory(
    input.supabase,
    input.course,
    input.unit,
  )

  if (inventory.totalAvailable === 0) {
    throw new Error("No questions available for the selected course/unit")
  }

  const blueprint = await generateBlueprint({
    prompt: input.prompt,
    course: input.course,
    unit: input.unit,
    questionCount: Math.min(input.questionCount, inventory.totalAvailable),
    inventory,
    abortSignal: input.abortSignal,
  })

  // Phase 2: Fill slots in parallel
  const slotResults = await fillBlueprintSlots({
    supabase: input.supabase,
    course: input.course,
    unit: input.unit,
    blueprint,
  })

  const questions = selectFromSlotResults(slotResults)

  if (questions.length === 0) {
    throw new Error("Could not find enough questions to fill the blueprint")
  }

  // Phase 3: AI curation
  const curation = await curateSelection({
    questions,
    blueprint,
    prompt: input.prompt,
    abortSignal: input.abortSignal,
  })

  // Resolve: map curation IDs back to question objects
  const questionMap = new Map(questions.map((q) => [q.id, q]))
  const resolvedSections: AssembleV2Section[] = curation.sections
    .map((s) => ({
      title: s.title,
      rationale: s.rationale,
      questionIds: s.questionIds.filter((id) => questionMap.has(id)),
    }))
    .filter((s) => s.questionIds.length > 0)

  // Collect any questions not assigned to sections
  const assignedIds = new Set(resolvedSections.flatMap((s) => s.questionIds))
  const skippedIds = new Set(curation.skipped.map((s) => s.questionId))
  const unassigned = questions.filter((q) => !assignedIds.has(q.id) && !skippedIds.has(q.id))
  if (unassigned.length > 0 && resolvedSections.length > 0) {
    resolvedSections[resolvedSections.length - 1].questionIds.push(
      ...unassigned.map((q) => q.id),
    )
  }

  return {
    blueprint,
    questions,
    sections: resolvedSections,
    skipped: curation.skipped.filter((s) => questionMap.has(s.questionId)),
    summary: curation.summary,
  }
}
