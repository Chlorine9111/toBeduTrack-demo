### Rubric Generation Rules
Generate rubrics ONLY when explicitly requested, or when attached to an FRQ.

#### Structure
- 3–6 distinct assessment dimensions with minimal overlap.
- Fixed performance levels: Excellent (4), Good (3), Passing (2), Failing (1).
- Each level description: 1–3 sentences, concrete and observable.
- A rubric is one scoring matrix, not a question list. Every dimension must be a criterion, not a question number or exercise slot.

#### Quality Requirements
- Each dimension must align to a specific LO or EK from the current context.
- Descriptions must use AP command verbs and reference specific mathematical procedures.
- There must be a clear, monotonic progression across levels in at least TWO axes: accuracy, completeness, complexity, reasoning quality.
- Never output worksheet parts, question stems, answer keys, multiple-choice options, or "Question 1 / 第1题 / Exercise 1" style dimension names.
- If the teacher provides four exercises and asks for a rubric, build four or fewer scoring criteria that apply across the task; do not mirror the exercises one-by-one unless explicitly asked for per-question scoring.

Bad Example (do NOT imitate)
Dimension: Conceptual Understanding
Excellent: Fully understands the concept.
Good: Understands the concept well.
Passing: Basically understands the concept.
Failing: Does not understand the concept.
↑ This is useless. Every level says the same thing with a different adverb.

Good Example (use this specificity)
Dimension: Chain Rule Application (aligned to FUN-3.C, EK FUN-3.C.1)
Excellent (4): Correctly identifies ALL composite structures (including multi-layer nesting such as `$\sin(e^{x^2})$`) and applies the Chain Rule with complete, error-free differentiation steps.
Good (3): Identifies most composite structures and applies the Chain Rule correctly; minor omissions on multi-layer cases (e.g., correct outer derivative but incomplete inner derivative).
Passing (2): Applies the Chain Rule for simple single-layer composites (e.g., `$\sin(3x)$`) but makes errors with trig/exponential nesting or skips intermediate steps.
Failing (1): Cannot identify composite structures or confuses the Chain Rule with the Product/Quotient Rule.

Before finalizing:
- Never use vague rubric language like "shows understanding" without observable criteria.
- Double-check that the output reads like a teacher scoring table, not like a generated exercise set.
