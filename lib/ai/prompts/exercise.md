# Exercise Generation Prompt Template

## Curriculum Context
{{CURRICULUM_CONTEXT}}

## Difficulty Definition
{{DIFFICULTY_DEFINITION}}

Difficulty Tier (for model output metadata): {{DIFFICULTY_TIER}}

## AP Command Verbs Reference
Use these verbs precisely in exercise stems — each has a specific AP exam expectation:

| Verb | What the student must do |
| --- | --- |
| Calculate / Find / Determine | Produce a numerical or algebraic answer with supporting work |
| Evaluate | Compute a specific value (often by substitution) |
| Justify | Cite a theorem/definition AND verify that its conditions are satisfied |
| Explain | Describe the mathematical reasoning in words, connecting to concepts |
| Interpret | Explain the real-world or mathematical meaning (with units if applicable) |
| Show that | Provide a logical argument arriving at a given conclusion |
| Verify | Confirm that a given statement or value is correct |
| Represent | Express in a different form (e.g., graph, table, equation) |
| Approximate | Use a method (e.g., Riemann sum, linearization) to estimate a value |

## Reference Exercises (Few-shot)
{{EXERCISE_EXAMPLES}}

If no reference exercises are provided above, follow the task rules strictly and produce exercises matching official AP exam style for the given difficulty tier.

## Teacher Request
{{TEACHER_REQUEST}}

{{#if MC_SECTION}}
## Distractor Rationale
For each MCQ, include a `distractor_rationale` field in your output that maps each wrong option label to the specific student error it represents. Error categories are defined in the MCQ rules.
{{/if}}

## Thinking Order (CRITICAL)
For each exercise, think in this exact order:

1. Pick the target LO/EK and decide the precise knowledge point being tested.
2. Design the scenario, numbers, passage, dataset, or stimulus.
3. Solve the problem yourself from start to finish before writing the stem.
4. Write `questionText` as a clear AP-style prompt.
5. Write `solutionSteps` based on the full reasoning from step 3.
6. Write `correctAnswer` by extracting the final answer from your solution.
7. Design distractors (MC only) from real student errors, not random alternatives.
8. Self-verify by re-solving from scratch; if the answer changes, revise the exercise.

NEVER decide the correct answer before solving the problem.
NEVER copy-paste structure across exercises.

{{#if DIVERSITY_SEED}}
## Diversity Instruction
Variation seed: "{{DIVERSITY_SEED}}"
Use this seed to vary scenarios, contexts, and problem structures across the set.
Do NOT repeat patterns from the few-shot examples or from another exercise in the same batch.
{{/if}}

## Generation Instructions
- You MUST return exactly {{COUNT}} exercises. Returning fewer or more is invalid.
- Exercise type: {{EXERCISE_TYPE}}.
- Difficulty level: {{DIFFICULTY}} (tier: {{DIFFICULTY_TIER}}).
- {{TOPIC_ID_INSTRUCTION}}
- Never use placeholders such as "TBD" or "same as above".
- Verify each answer independently: solve the problem from scratch and confirm your solution is correct before returning.

## Output Field Order (IMPORTANT)
When generating each exercise in the JSON output, populate fields in this exact order:

1. `topicId` — anchor the exercise to the provided curriculum.
2. `type` — MC or FR.
3. `difficulty` — match the requested tier.
4. `questionText` / `stem` — write the full AP-style stem.
5. `options` (MC only) — exactly 4 options labeled A-D.
6. `solutionSteps` — write the complete solution BEFORE finalizing the answer.
7. `correctAnswer` — extract it from the solution.
8. `distractor_rationale` (MC only) — explain each wrong option's error source.
9. `loIds`, `ekIds` — tag the exercise with the relevant curriculum codes.

## Output Formatting Rules (STRICT)
- Do NOT use emoji anywhere in the output (no 📝, ✅, ❌, 🔍, ⭐, etc.).
- Do NOT wrap questionText in bold or italic markdown (* or **).
- Do NOT add decorative headers like "Question 1:", "题目一：", or "Problem 1.".
- Do NOT add horizontal rules (---), bullet lists, or numbered lists inside questionText.
- Do NOT add introductory phrases like "Let's consider..." or "Consider the following scenario:".
- questionText must be plain prose: a scenario or setup followed by a clear question. No decoration.
- solutionSteps must be plain prose with LaTeX for math notation. No emoji, no decorative markers.
- Options (MC only): each option text is plain content. No leading dash or bullet beyond the A/B/C/D label already in the schema.
- correctAnswer: just the answer value (e.g., "B" for MC, or a number/expression for FR). No prefix like "Answer:" or "正确答案：".

## Pre-submission Check
- Re-solve each exercise from scratch. If the answer changes, revise before returning.
{{#if MC_CHECK}}- Verify that no distractor could reasonably be defended as correct.
- Verify every distractor maps to a named student error category.
{{/if}}- Check CED alignment: only the provided LOs/EKs may be tested.
- Check difficulty alignment: does the cognitive demand and step count match the requested tier?
- Check LaTeX validity: all mathematical notation must use balanced LaTeX delimiters.
- Check schema completeness: no empty strings, no placeholder text, no omitted required fields.
- Check uniqueness: each exercise must be substantively different from the others and from the few-shot examples.
- Are all `topicId` values from the provided curriculum context?

Return structured exercises that match the tool-use schema.
Tag every exercise with `loIds` and `ekIds` from the provided curriculum context.
