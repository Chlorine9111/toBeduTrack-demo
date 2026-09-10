# AI Assembly V2 — Blueprint-Driven Worksheet Assembly

## Problem

Current AI assembly (`lib/worksheet/assemble.ts`) only searches the teacher's personal `exercises` table (~few dozen questions), ignoring the 13,000+ question global AP bank in `questions` table. It lacks structured difficulty distribution, knowledge point coverage control, and AP exam pattern awareness.

## Solution: Two-Phase Pipeline

### Phase 1: Blueprint Generation (AI)

**Input:** Teacher's natural language request + course/unit inventory metadata

**Context provided to AI:**
1. **Inventory snapshot** — aggregated from `questions` table:
   ```sql
   SELECT topic_code, difficulty, COUNT(*) as available
   FROM questions
   WHERE course = ? AND status = 'active'
     AND (unit = ? OR ? IS NULL)
   GROUP BY topic_code, difficulty
   ```
2. **Teacher's prompt** — raw natural language
3. **Defaults** — difficulty distribution 30% Easy / 50% Medium / 20% Hard

**AI model:** Haiku (fast, cheap, structured output)

**System prompt:**
```
You are an AP exam blueprint architect. Given a teacher's request and the actual
question inventory for their course, generate a structured selection blueprint.

Rules:
- Default difficulty distribution: 30% Easy, 50% Medium, 20% Hard
- Adjust distribution if: teacher explicitly requests it, OR inventory is skewed
  (e.g., only 3 hard questions available → reduce hard allocation)
- Maximize topic_code coverage within the requested scope
- If teacher says "comprehensive review" → spread across all topics
- If teacher specifies a topic (e.g., "photosynthesis") → focus slots on that topic
- Each slot: topic_code + difficulty + count + searchHint (semantic search phrase)
- Total slot counts must equal the requested question count
- If a slot would have <2 available questions, merge with adjacent topic or relax difficulty
```

**Output schema:**
```typescript
type Blueprint = {
  intent: string
  totalQuestions: number
  difficultyDistribution: { easy: number; medium: number; hard: number }
  slots: Array<{
    topicCode: string
    topicLabel: string
    difficulty: "easy" | "medium" | "hard"
    count: number
    searchHint: string
  }>
}
```

### Phase 2: Slot Filling (No AI — parallel SQL queries)

For each slot in the blueprint, query `questions` table:
```sql
SELECT id, stem, choices, correct_answer, explanation, difficulty,
       cognitive_task, topic_code, key_concepts, source_assessment
FROM questions
WHERE course = :course
  AND status = 'active'
  AND topic_code = :slot.topicCode
  AND difficulty = :slot.difficulty
  AND (unit = :unit OR :unit IS NULL)
ORDER BY random()
LIMIT :slot.count * 3
```

All slot queries execute **in parallel** via `Promise.all`.

After retrieval:
- Deduplicate by `stimulus_id` (same stimulus group → keep only one)
- For each slot, pick `slot.count` questions from the candidates
- If a slot has insufficient candidates, relax the difficulty constraint (try adjacent difficulty)

### Phase 3: Final Curation (AI)

**Input:** The assembled candidate set (all slots filled)

**AI model:** Sonnet (needs to understand question content for quality judgment)

**System prompt:**
```
You are an AP exam quality reviewer. Review the pre-selected questions and:

1. All questions are SELECTED by default. Only mark SKIP if quality is genuinely
   poor (empty stem, broken options, duplicate concept with another selected question).
2. Order questions: easy → medium → hard within each section.
3. Group into 1-3 exam sections with descriptive titles.
4. Verify topic coverage matches the original blueprint intent.
5. Output the final ordered list with section assignments.
```

**Output schema:**
```typescript
type CurationResult = {
  sections: Array<{
    title: string
    rationale: string
    questionIds: string[]
  }>
  skipped: Array<{
    questionId: string
    reason: string
  }>
  summary: string
}
```

## Data Flow

```
Teacher prompt: "AP Bio Unit 3, 15 questions, comprehensive review"
  ↓
Phase 1: Blueprint AI (Haiku, ~2s)
  → inventory query: { "3.1": {easy:45, med:120, hard:28}, "3.2": {...} }
  → blueprint: 5 slots covering topics 3.1-3.5, 4E/8M/3H distribution
  ↓
Phase 2: Slot Filling (parallel SQL, ~1s)
  → 5 parallel queries → 45 candidates total (3x per slot)
  → dedup + per-slot selection → 15 questions
  ↓
Phase 3: Curation AI (Sonnet, ~3s)
  → review 15 questions → group into 2 sections → order by difficulty
  → default all selected, skip 0-2 if poor quality
  ↓
Frontend: show results with checkboxes (all checked by default)
  → teacher unchecks any unwanted → import selected
```

## Search Source Priority

1. **Primary:** `questions` table (13,000+ global AP bank, rich metadata)
2. **Secondary:** `exercises` table (teacher's personal uploads, if any match)
3. Merge: global results first, personal results appended, deduplicated

## Frontend UX

AiAssemblePanel shows:
1. Loading state with blueprint preview (show slot breakdown while filling)
2. Results grid: all questions checked by default
3. Each question shows: topic, difficulty badge, stem preview
4. "Import selected" button with count
5. Blueprint summary bar: "4 Easy / 8 Medium / 3 Hard across 5 topics"

## Performance Budget

| Phase | Target | Model |
|-------|--------|-------|
| Blueprint | <2s | Haiku |
| Slot fill | <1s | None (SQL) |
| Curation | <3s | Sonnet |
| **Total** | **<6s** | |

## Files to Create/Modify

| File | Action |
|------|--------|
| `lib/worksheet/blueprint.ts` | New — inventory query + Blueprint AI |
| `lib/worksheet/slot-filler.ts` | New — parallel slot queries on `questions` table |
| `lib/worksheet/assemble-v2.ts` | New — orchestrates 3 phases |
| `app/api/worksheets/assemble/route.ts` | Modify — use v2 pipeline |
| `components/.../AiAssemblePanel.tsx` | Modify — show blueprint results, checkbox selection |
| `components/.../QuestionBankBuilderPage.tsx` | Modify — integrate v2 assembly flow |
