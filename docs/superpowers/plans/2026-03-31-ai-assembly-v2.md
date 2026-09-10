# AI Assembly V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current personal-exercises-only AI assembly with a blueprint-driven pipeline that searches the 13,000+ global AP question bank, controls difficulty distribution, and maximizes knowledge coverage.

**Architecture:** Three-phase pipeline — (1) AI generates a structured blueprint from teacher intent + database inventory, (2) parallel SQL queries fill each blueprint slot from the `questions` table, (3) AI curates the final selection with ordering and grouping. All defaults to selected, teacher can uncheck.

**Tech Stack:** Anthropic Claude (Haiku for blueprint, Sonnet for curation), Supabase PostgreSQL, Zod schemas, existing `generateStructuredObject` utility.

---

### Task 1: Register new model tasks in model-router

**Files:**
- Modify: `lib/ai/model-router.ts`

- [ ] **Step 1: Add model task types**

Add `"worksheet_blueprint"` to the `ModelTask` union type (after `"worksheet_curate"`):

```typescript
// line ~10, add to the union
| "worksheet_blueprint"
```

- [ ] **Step 2: Add model resolution for blueprint task**

In `getResolvedLanguageModelForTask`, add a case for `worksheet_blueprint` that uses Haiku:

```typescript
// After the worksheet_curate case (~line 240)
if (task === "worksheet_blueprint") {
  return resolveClaudeTaskModel([
    "WORKSHEET_BLUEPRINT_MODEL",
  ], "claude-haiku-4-5-20251001");
}
```

And in the fallback section (~line 577):

```typescript
if (task === "worksheet_blueprint") {
  return "claude-haiku-4-5-20251001";
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add lib/ai/model-router.ts
git commit -m "feat: register worksheet_blueprint model task (Haiku)"
```

---

### Task 2: Create blueprint.ts — inventory query + AI blueprint generation

**Files:**
- Create: `lib/worksheet/blueprint.ts`

- [ ] **Step 1: Create the inventory query function**

```typescript
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router"
import { generateStructuredObject } from "@/lib/ai/structured-output"

type InventoryEntry = {
  topicCode: string
  difficulty: string
  count: number
}

type InventorySnapshot = {
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
    .eq("course", course)
    .eq("status", "active")

  if (unit != null) {
    query = query.eq("unit", unit)
  }

  // Fetch all matching rows' topic_code + difficulty to aggregate client-side
  // (Supabase JS doesn't support GROUP BY directly)
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
```

- [ ] **Step 2: Create the blueprint schema and generation function**

```typescript
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
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add lib/worksheet/blueprint.ts
git commit -m "feat: blueprint.ts — inventory query + AI blueprint generation"
```

---

### Task 3: Create slot-filler.ts — parallel slot queries on questions table

**Files:**
- Create: `lib/worksheet/slot-filler.ts`

- [ ] **Step 1: Create the slot filler**

```typescript
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
    .eq("course", course)
    .eq("status", "active")
    .eq("difficulty", slot.difficulty)

  if (slot.topicCode && slot.topicCode !== "any") {
    query = query.eq("topic_code", slot.topicCode)
  }

  if (unit != null) {
    query = query.eq("unit", unit)
  }

  // Prefer standalone questions, randomize within
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
  // First try exact match
  const exact = await fillSlot(supabase, course, unit, slot, slotIndex, 3)

  if (exact.candidates.length >= slot.count) {
    return exact
  }

  // Fallback: relax difficulty constraint
  const relaxedSlot = { ...slot, difficulty: "medium" as const }
  const relaxed = await fillSlot(supabase, course, unit, relaxedSlot, slotIndex, 3)

  // Merge: exact first, then relaxed (deduped)
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

  // Global dedup: same stimulus_id → keep only the first occurrence
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add lib/worksheet/slot-filler.ts
git commit -m "feat: slot-filler.ts — parallel blueprint slot queries"
```

---

### Task 4: Create assemble-v2.ts — orchestrate the 3-phase pipeline

**Files:**
- Create: `lib/worksheet/assemble-v2.ts`

- [ ] **Step 1: Create the orchestrator**

```typescript
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
    // Fallback: single section, no skips
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add lib/worksheet/assemble-v2.ts
git commit -m "feat: assemble-v2.ts — 3-phase blueprint-driven assembly pipeline"
```

---

### Task 5: Create API route for v2 assembly

**Files:**
- Create: `app/api/worksheets/assemble-v2/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
import { NextResponse } from "next/server"
import { z } from "zod"
import { jsonError } from "@/lib/api/response"
import { getTeacherContext } from "@/lib/api/teacher-context"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"
import { assembleWorksheetV2 } from "@/lib/worksheet/assemble-v2"

const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(1000),
  course: z.string().trim().min(1).max(50),
  unit: z.coerce.number().int().min(1).max(20).optional(),
  questionCount: z.coerce.number().int().min(1).max(60).default(15),
})

export async function POST(request: Request) {
  const { teacherId, errorMessage, errorStatus } = await getTeacherContext()
  if (!teacherId) {
    return jsonError("UNAUTHORIZED", errorMessage ?? "Please sign in first", errorStatus ?? 401)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError("VALIDATION_ERROR", "Invalid request body", 400)
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return jsonError("VALIDATION_ERROR", "Invalid parameters", 400, parsed.error.flatten())
  }

  try {
    const supabase = createAdminSupabaseClient()
    const result = await assembleWorksheetV2({
      supabase,
      prompt: parsed.data.prompt,
      course: parsed.data.course,
      unit: parsed.data.unit,
      questionCount: parsed.data.questionCount,
    })

    return NextResponse.json({
      blueprint: result.blueprint,
      questions: result.questions,
      sections: result.sections,
      skipped: result.skipped,
      summary: result.summary,
    })
  } catch (error) {
    console.error("[assemble-v2] failed:", error)
    return jsonError(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "Assembly failed",
      500,
    )
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: 0 errors

- [ ] **Step 3: Test with curl**

```bash
curl -s http://localhost:3001/api/worksheets/assemble-v2 \
  -X POST -H "Content-Type: application/json" \
  -d '{"prompt":"AP Bio Unit 3 comprehensive review","course":"AP_BIO","unit":3,"questionCount":10}' | jq '.summary, .blueprint.slots | length, .questions | length'
```

Expected: A summary string, slot count, and ~10 questions.

- [ ] **Step 4: Commit**

```bash
git add app/api/worksheets/assemble-v2/route.ts
git commit -m "feat: POST /api/worksheets/assemble-v2 — blueprint-driven assembly endpoint"
```

---

### Task 6: Integrate v2 assembly into AiAssemblePanel frontend

**Files:**
- Modify: `components/main/question-bank/worksheet-editor/AiAssemblePanel.tsx`

This task integrates the v2 API into the existing AI assembly UI. The key changes:
1. Call `/api/worksheets/assemble-v2` instead of the old search+sample approach
2. Show blueprint summary while loading
3. Display results with all checkboxes checked by default
4. "Import selected" imports only checked questions

- [ ] **Step 1: Read the current AiAssemblePanel**

Read `components/main/question-bank/worksheet-editor/AiAssemblePanel.tsx` to understand the current `runAiAssemble` function and UI structure before modifying.

- [ ] **Step 2: Add v2 assembly function**

Add a new `runAiAssembleV2` function that calls the v2 API. Keep the old function as fallback. Wire the UI to use v2 when the user's selected course is available.

The function should:
- POST to `/api/worksheets/assemble-v2` with `{ prompt, course, unit, questionCount }`
- On success: convert `FilledQuestion[]` to `WorksheetQuestionBankItem[]` format
- Set all items as checked by default
- Show blueprint summary (difficulty distribution, topic coverage)

- [ ] **Step 3: Verify the panel works**

Open http://localhost:3001/main/question-bank/builder, open the AI panel, enter a prompt like "AP Bio Unit 3, 10 questions", verify questions appear with checkboxes.

- [ ] **Step 4: Commit**

```bash
git add components/main/question-bank/worksheet-editor/AiAssemblePanel.tsx
git commit -m "feat: integrate v2 blueprint assembly into AiAssemblePanel"
```
