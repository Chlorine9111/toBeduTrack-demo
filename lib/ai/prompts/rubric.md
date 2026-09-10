# Rubric Generation Prompt Template

## Curriculum Context
{{CURRICULUM_CONTEXT}}

## Reference Rubrics (Few-shot)
{{RUBRIC_EXAMPLES}}

If no reference rubrics are provided above, use the Good Example in the rubric rules as your quality baseline. Every dimension must reach that level of specificity.

## Teacher Request
{{TEACHER_REQUEST}}

## Generation Instructions
- Each dimension must target a distinct skill or knowledge area. If two dimensions could be scored by looking at the same student work, merge them.
- The `description` field for each dimension should state what it assesses and which LO/EK it aligns to (e.g., "Assesses application of the Chain Rule, aligned to FUN-3.C").
- The `weight` values across all dimensions must sum to 100 (percentage). Distribute weight according to the cognitive demand of each dimension.
- Level descriptions must contain observable, scorable criteria — not degree adverbs. A scorer should be able to assign a level without subjective interpretation.
- If reference rubrics are provided, match their granularity and depth but do not copy text verbatim.
- When the teacher request specifies a particular FRQ or task context, tailor dimensions to that task rather than generating generic rubric dimensions.
- A rubric is a scoring matrix, not a worksheet. Do not output questions, prompts, answer keys, answer spaces, or one dimension per question unless the teacher explicitly asks for question-by-question scoring.
- Dimension names must be criterion names such as reasoning, evidence use, accuracy, communication, procedure quality, or conceptual explanation; never use labels like "Question 1", "Problem 2", "Task A", or "Exercise 3".
- The final structure should support a single matrix view with one row per dimension and fixed performance levels across the whole rubric.

## Pre-submission Check
- Do all dimensions assess genuinely different aspects? (No two dimensions should overlap in what student work they evaluate.)
- Does each level description differ from adjacent levels in concrete, observable ways — not just adverbs like "mostly" vs "fully"?
- Do all `weight` values sum to 100?
- Are all referenced LO/EK codes from the provided curriculum context?
- Does the rubric have a `title` that clearly describes the assessment task?
- Would a teacher read this as a scoring table rather than as a question set, worksheet, or answer key?

Return a structured rubric that matches the tool-use schema.
