import type {
  ChatStep,
  RubricPartData,
  WorksheetStepData,
  ExamQuestionData,
} from "./mock-data"

// ---------------------------------------------------------------------------
// Rubric Data (English)
// ---------------------------------------------------------------------------
export const RUBRIC_DATA_EN: RubricPartData[] = [
  {
    id: "part-a",
    label: "Part (a)",
    title: "Compute $f'(x)$ using Chain Rule",
    points: 3,
    items: [
      {
        id: "a1",
        description:
          "Identifies $f(x) = g(h(x))$ and decomposes into outer $g(u)$ and inner $h(x)$",
        points: 1,
      },
      {
        id: "a2",
        description: "Correctly differentiates the outer function $g'(u)$",
        points: 1,
      },
      {
        id: "a3",
        description:
          "Multiplies by inner derivative to obtain $f'(x) = g'(h(x)) \\cdot h'(x)$",
        points: 1,
      },
    ],
  },
  {
    id: "part-b",
    label: "Part (b)",
    title: "Find the tangent line at $x = a$",
    points: 3,
    items: [
      {
        id: "b1",
        description:
          "Evaluates $f'(a)$ by substituting $x = a$ into the derivative",
        points: 1,
      },
      {
        id: "b2",
        description: "Computes the point of tangency $(a,\\, f(a))$",
        points: 1,
      },
      {
        id: "b3",
        description:
          "Writes tangent line in point-slope form $y - f(a) = f'(a)(x - a)$",
        points: 1,
      },
    ],
  },
  {
    id: "part-c",
    label: "Part (c)",
    title: "Determine and justify extrema of $f$",
    points: 3,
    items: [
      {
        id: "c1",
        description: "Sets $f'(x) = 0$ and solves for critical points",
        points: 1,
      },
      {
        id: "c2",
        description:
          "Applies $f''(x)$ test or sign-change analysis to classify each critical point",
        points: 1,
      },
      {
        id: "c3",
        description:
          "Provides a complete written justification with supporting calculations",
        points: 1,
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Chat Flows (English)
// ---------------------------------------------------------------------------
export const RUBRIC_CHAT_EN: ChatStep[] = [
  {
    messages: [
      {
        id: "r1",
        role: "ai",
        content:
          "Hi Ms. Zhang! I'm your AP teaching assistant. What are we preparing today?",
      },
    ],
    options: [
      {
        id: "ro1",
        text: "Unit 3 quiz next week \u2014 help me draft a rubric",
        isMain: true,
      },
      { id: "ro2", text: "Generate a Chain Rule worksheet" },
      { id: "ro3", text: "Analyze Unit 3 exam focus areas" },
    ],
  },
  {
    thinkingText: "Analyzing Unit 3 learning objectives...",
    messages: [
      {
        id: "r2",
        role: "user",
        content: "Unit 3 quiz next week \u2014 help me draft a rubric",
      },
      {
        id: "r3",
        role: "ai",
        content:
          "Got it. Unit 3 covers three core Learning Objectives for Chain Rule: FUN-3.C (composite function derivatives), FUN-3.D (implicit differentiation), and FUN-3.E (inverse function derivatives). Let me generate an FRQ scoring rubric for you.",
        typewriter: true,
      },
    ],
  },
  {
    thinkingText: "Generating FRQ scoring rubric...",
    messages: [
      {
        id: "r4",
        role: "ai",
        content:
          "\u2705 Rubric generated \u2014 preview and edit on the right panel.",
      },
    ],
    triggerPanel: true,
  },
]

export const WORKSHEET_CHAT_EN: ChatStep[] = [
  {
    messages: [
      {
        id: "w1",
        role: "ai",
        content:
          "Rubric is set \u2713 Want me to create a matching classroom worksheet? I can generate a scaffolded computational thinking exercise.",
      },
    ],
    options: [
      {
        id: "wo1",
        text: "Yes \u2014 scaffolded Chain Rule practice",
        isMain: true,
      },
      { id: "wo2", text: "Show me the LO coverage first" },
    ],
  },
  {
    thinkingText: "Designing scaffolded practice tiers...",
    messages: [
      {
        id: "w2",
        role: "user",
        content: "Yes \u2014 scaffolded Chain Rule practice",
      },
      {
        id: "w3",
        role: "ai",
        content:
          "I\u2019ll design four progressive tiers: Concept Check \u2192 Guided Practice \u2192 Independent Practice \u2192 Challenge. Each tier targets a different depth of understanding so every student stays engaged.",
        typewriter: true,
      },
    ],
  },
  {
    thinkingText: "Building worksheet content...",
    messages: [
      {
        id: "w4",
        role: "ai",
        content:
          "\u2705 Worksheet ready \u2014 preview it on the right. Toggle between Standard and Advanced.",
      },
    ],
    triggerPanel: true,
  },
]

export const EXAM_CHAT_EN: ChatStep[] = [
  {
    thinkingText: "Assembling exam questions...",
    messages: [
      {
        id: "e1",
        role: "ai",
        content:
          "I\u2019ve compiled everything into a quiz: 5 MC questions graded by difficulty plus the FRQ you rubric\u2019d. Drag to reorder, expand to preview, then export when ready.",
      },
    ],
    triggerPanel: true,
  },
]

// ---------------------------------------------------------------------------
// Worksheet Data (English)
// ---------------------------------------------------------------------------
export const WORKSHEET_STANDARD_EN: WorksheetStepData[] = [
  {
    id: "step1",
    number: 1,
    title: "Concept Check",
    subtitle: "Identify when Chain Rule applies",
    lines: [
      {
        id: "s1q1",
        text: "Determine whether Chain Rule is needed. Identify the outer and inner functions.",
      },
      {
        id: "s1q2",
        text: "1.  $f(x) = \\sin(3x)$",
        subLines: [
          "Chain Rule needed?  YES / NO",
          "Outer: ________   Inner: ________",
        ],
      },
      {
        id: "s1q3",
        text: "2.  $g(x) = x^2 + \\cos(x)$",
        subLines: [
          "Chain Rule needed?  YES / NO",
          "Outer: ________   Inner: ________",
        ],
      },
      {
        id: "s1q4",
        text: "3.  $h(x) = e^{x^2+1}$",
        subLines: [
          "Chain Rule needed?  YES / NO",
          "Outer: ________   Inner: ________",
        ],
      },
    ],
  },
  {
    id: "step2",
    number: 2,
    title: "Guided Practice",
    subtitle: "Follow the scaffolded steps",
    lines: [
      {
        id: "s2q1",
        text: "Find the derivative of $f(x) = (3x + 1)^5$",
      },
    ],
    hintSteps: [
      "Step 1: Identify outer $u^5$, inner $u = 3x + 1$",
      "Step 2: Differentiate outer $\\to$ ________",
      "Step 3: Differentiate inner $\\to$ ________",
      "Step 4: Multiply for final answer $\\to$ ________",
    ],
  },
  {
    id: "step3",
    number: 3,
    title: "Independent Practice",
    subtitle: "No scaffolding provided",
    lines: [
      { id: "s3q0", text: "Find the derivative of each function:" },
      { id: "s3q1", text: "1.  $f(x) = \\cos(x^3)$" },
      { id: "s3q2", text: "2.  $g(x) = \\ln(\\sin x)$" },
      { id: "s3q3", text: "3.  $h(x) = e^{\\sqrt{x}}$" },
      { id: "s3q4", text: "4.  $p(x) = (2x^2 - 1)^4$" },
    ],
  },
  {
    id: "step4",
    number: 4,
    title: "Challenge",
    subtitle: "Multiple applications of Chain Rule",
    lines: [
      {
        id: "s4q0",
        text: "These require nested Chain Rule. Show every step and name each rule used.",
      },
      { id: "s4q1", text: "1.  $f(x) = \\sin(e^{2x})$" },
      { id: "s4q2", text: "2.  $g(x) = \\ln(\\cos(x^2))$" },
    ],
  },
]

export const WORKSHEET_ADVANCED_EN: WorksheetStepData[] = [
  WORKSHEET_STANDARD_EN[0],
  WORKSHEET_STANDARD_EN[1],
  {
    id: "step3-adv",
    number: 3,
    title: "Independent Practice",
    subtitle: "Advanced \u2014 implicit & parametric forms",
    lines: [
      { id: "s3aq0", text: "Find $dy/dx$ for each:" },
      {
        id: "s3aq1",
        text: "1.  $x^2 y + \\sin(xy) = 1$ (implicit differentiation)",
      },
      { id: "s3aq2", text: "2.  $y = \\arctan(e^{3x})$" },
      {
        id: "s3aq3",
        text: "3.  $x = t^2 + 1,\\; y = \\ln(t)$ \u2014 find $dy/dx$ in terms of $t$",
      },
      {
        id: "s3aq4",
        text: "4.  $y = [\\sin(2x)]^{\\cos x}$ (logarithmic differentiation)",
      },
    ],
  },
  {
    id: "step4-adv",
    number: 4,
    title: "Challenge",
    subtitle: "Advanced \u2014 multi-rule synthesis",
    lines: [
      {
        id: "s4aq0",
        text: "Combine Chain Rule with other techniques. Show full working.",
      },
      {
        id: "s4aq1",
        text: "1.  $\\frac{d}{dx}\\left[\\int_0^{\\sin x} e^{t^2}\\,dt\\right]$ (FTC + Chain Rule)",
      },
      {
        id: "s4aq2",
        text: "2.  Given $f(g(x))$ where $f$ and $g$ are defined by a table, find $(f \\circ g)'(2)$",
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Exam Data (English)
// ---------------------------------------------------------------------------
export const EXAM_QUESTIONS_EN: ExamQuestionData[] = [
  {
    id: "mc1",
    type: "MC",
    difficulty: "Easy",
    preview: "If $f(x) = (2x + 5)^3$, then $f'(x) =$ ...",
    fullQuestion: "If $f(x) = (2x + 5)^3$, then $f'(x) =$",
    options: [
      { label: "A", text: "$3(2x + 5)^2$" },
      { label: "B", text: "$6(2x + 5)^2$" },
      { label: "C", text: "$3(2x + 5)^2 \\cdot 2x$" },
      { label: "D", text: "$2(2x + 5)^3$" },
    ],
    correctAnswer: "B",
    explanation:
      "Apply Chain Rule: outer $= u^3 \\to 3u^2$, inner $= 2x+5 \\to 2$. Product: $6(2x+5)^2$.",
    totalPoints: 1,
  },
  {
    id: "mc2",
    type: "MC",
    difficulty: "Easy",
    preview: "$\\frac{d}{dx}[\\sin(4x)] =$ ...",
    fullQuestion: "$\\frac{d}{dx}[\\sin(4x)] =$",
    options: [
      { label: "A", text: "$\\cos(4x)$" },
      { label: "B", text: "$4\\cos(4x)$" },
      { label: "C", text: "$-\\cos(4x)$" },
      { label: "D", text: "$4\\sin(4x)$" },
    ],
    correctAnswer: "B",
    explanation:
      "Chain Rule: outer $= \\sin u \\to \\cos u$, inner $= 4x \\to 4$. Answer: $4\\cos(4x)$.",
    totalPoints: 1,
  },
  {
    id: "mc3",
    type: "MC",
    difficulty: "Medium",
    preview: "If $g(x) = e^{x^2-1}$, then $g'(1) =$ ...",
    fullQuestion: "If $g(x) = e^{x^2-1}$, then $g'(1) =$",
    options: [
      { label: "A", text: "$0$" },
      { label: "B", text: "$1$" },
      { label: "C", text: "$2$" },
      { label: "D", text: "$2e$" },
    ],
    correctAnswer: "C",
    explanation:
      "$g'(x) = 2x \\cdot e^{x^2-1}$. At $x=1$: $g'(1) = 2(1) \\cdot e^0 = 2$.",
    totalPoints: 1,
  },
  {
    id: "mc4",
    type: "MC",
    difficulty: "Medium",
    preview: "$\\frac{d}{dx}[\\ln(\\cos x)] =$ ...",
    fullQuestion: "$\\frac{d}{dx}[\\ln(\\cos x)] =$",
    options: [
      { label: "A", text: "$1/\\cos x$" },
      { label: "B", text: "$-\\tan x$" },
      { label: "C", text: "$\\tan x$" },
      { label: "D", text: "$-\\sin x / \\cos^2 x$" },
    ],
    correctAnswer: "B",
    explanation:
      "Chain Rule: $(1/\\cos x)(-\\sin x) = -\\sin x / \\cos x = -\\tan x$.",
    totalPoints: 1,
  },
  {
    id: "mc5",
    type: "MC",
    difficulty: "Hard",
    preview: "If $h(x) = \\sin(e^{2x})$, then $h''(0) =$ ...",
    fullQuestion: "If $h(x) = \\sin(e^{2x})$, then $h''(0) =$",
    options: [
      { label: "A", text: "$2\\cos(1) + 4\\sin(1)$" },
      { label: "B", text: "$4\\cos(1) - 4\\sin(1)$" },
      { label: "C", text: "$2\\cos(1)$" },
      { label: "D", text: "$4\\cos(1)$" },
    ],
    correctAnswer: "B",
    explanation:
      "$h'(x) = 2e^{2x}\\cos(e^{2x})$. Apply product + chain rule for $h''(x)$, evaluate at $x = 0$.",
    totalPoints: 1,
  },
  {
    id: "frq1",
    type: "FRQ",
    difficulty: "Hard",
    preview: "Let $f(x) = e^{\\sin(x^2)}$. Answer parts (a)\u2013(d).",
    fullQuestion:
      "Let $f(x) = e^{\\sin(x^2)}$. The function $f$ is defined for all real numbers.",
    parts: [
      {
        label: "(a)",
        description:
          "Find $f'(x)$. Show your work applying the Chain Rule.",
        points: 3,
        rubric:
          "1 pt: correct outer derivative $e^{\\sin(x^2)}$; 1 pt: correct middle derivative $\\cos(x^2)$; 1 pt: correct inner derivative $2x$ and final product",
      },
      {
        label: "(b)",
        description:
          "Write the equation of the tangent line to $f$ at $x = 0$.",
        points: 2,
        rubric:
          "1 pt: correct slope $f'(0) = 0$; 1 pt: correct point $(0, e^0) = (0,1)$ and equation $y = 1$",
      },
      {
        label: "(c)",
        description:
          "Determine whether $f$ has a local maximum, local minimum, or neither at $x = 0$. Justify.",
        points: 2,
        rubric:
          "1 pt: correct second derivative evaluation or sign analysis; 1 pt: complete justification with conclusion",
      },
      {
        label: "(d)",
        description:
          "Find the value of $\\int_0^{\\sqrt{\\pi}} x \\cdot \\cos(x^2) \\cdot e^{\\sin(x^2)}\\,dx$ using substitution.",
        points: 2,
        rubric:
          "1 pt: correct u-substitution $u = \\sin(x^2)$; 1 pt: correct evaluation with new limits and final answer",
      },
    ],
    totalPoints: 9,
  },
]
