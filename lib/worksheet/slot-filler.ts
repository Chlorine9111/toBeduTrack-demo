import type { SupabaseClient } from "@supabase/supabase-js"
import type { Blueprint } from "./blueprint"

export type FilledQuestion = {
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
  source_assessment: string
  question_number: number
  stimulus_id: string | null
  standalone_usable: boolean
}

export type SlotResult = {
  slotIndex: number
  topicCode: string
  difficulty: string
  requested: number
  candidates: FilledQuestion[]
}

const QUESTION_SELECT = `id, course, unit, stem, choices, correct_answer, explanation, difficulty, cognitive_task, topic_code, key_concepts, source_assessment, question_number, stimulus_id, standalone_usable`

async function fillSlot(
  supabase: SupabaseClient,
  course: string,
  unit: number | undefined,
  slot: Blueprint["slots"][number],
  slotIndex: number,
  candidateMultiplier: number,
): Promise<SlotResult> {
  const limit = slot.count * candidateMultiplier

  let query = supabase
    .from("questions")
    .select(QUESTION_SELECT)
    .eq("status", "active")
    .eq("difficulty", slot.difficulty)

  if (course) {
    query = query.eq("course", course)
  }

  if (slot.topicCode && slot.topicCode !== "any") {
    query = query.eq("topic_code", slot.topicCode)
  }

  if (unit != null) {
    query = query.eq("unit", unit)
  }

  query = query
    .order("standalone_usable", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)

  const { data, error } = await query

  if (error) {
    return { slotIndex, topicCode: slot.topicCode, difficulty: slot.difficulty, requested: slot.count, candidates: [] }
  }

  return {
    slotIndex,
    topicCode: slot.topicCode,
    difficulty: slot.difficulty,
    requested: slot.count,
    candidates: (data ?? []) as FilledQuestion[],
  }
}

async function fillSlotWithFallback(
  supabase: SupabaseClient,
  course: string,
  unit: number | undefined,
  slot: Blueprint["slots"][number],
  slotIndex: number,
): Promise<SlotResult> {
  const exact = await fillSlot(supabase, course, unit, slot, slotIndex, 3)

  if (exact.candidates.length >= slot.count) {
    return exact
  }

  const relaxedSlot = { ...slot, difficulty: "medium" as const }
  const relaxed = await fillSlot(supabase, course, unit, relaxedSlot, slotIndex, 3)

  const seenIds = new Set(exact.candidates.map((q) => q.id))
  const merged = [...exact.candidates]
  for (const q of relaxed.candidates) {
    if (!seenIds.has(q.id)) {
      merged.push(q)
      seenIds.add(q.id)
    }
  }

  return { ...exact, candidates: merged }
}

export async function fillBlueprintSlots(params: {
  supabase: SupabaseClient
  course: string
  unit?: number
  blueprint: Blueprint
}): Promise<SlotResult[]> {
  const results = await Promise.all(
    params.blueprint.slots.map((slot, index) =>
      fillSlotWithFallback(params.supabase, params.course, params.unit, slot, index),
    ),
  )

  const usedStimulusIds = new Set<string>()
  for (const result of results) {
    result.candidates = result.candidates.filter((q) => {
      if (q.stimulus_id && usedStimulusIds.has(q.stimulus_id)) return false
      if (q.stimulus_id) usedStimulusIds.add(q.stimulus_id)
      return true
    })
  }

  return results
}

export function selectFromSlotResults(slotResults: SlotResult[]): FilledQuestion[] {
  const selected: FilledQuestion[] = []
  const usedIds = new Set<string>()

  for (const result of slotResults) {
    let picked = 0
    for (const candidate of result.candidates) {
      if (picked >= result.requested) break
      if (usedIds.has(candidate.id)) continue
      selected.push(candidate)
      usedIds.add(candidate.id)
      picked++
    }
  }

  return selected
}
