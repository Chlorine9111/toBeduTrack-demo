// ============================================================
// Landing Page Demo - Preset Data (Zero LLM cost)
// ============================================================

export interface DemoExercise {
  questionText: string
  type: "MC"
  options: { label: string; text: string; isCorrect: boolean }[]
  correctAnswer: string
  solutionSteps: string
}

export interface DemoRubricDimension {
  name: string
  weight: string
  levels: { label: string; description: string }[]
}

export interface DemoLessonSection {
  title: string
  duration: string
  blocks: { type: string; content: string }[]
}

export interface DemoSubjectData {
  subject: string
  subjectLabel: string
  course: string
  unit: string
  exercises: DemoExercise[]
  rubric: {
    title: string
    dimensions: DemoRubricDimension[]
  }
  lessonPlan: {
    title: string
    totalMinutes: number
    sections: DemoLessonSection[]
  }
}

// --- AI Edit Autoplay Preset ---

export const AI_EDIT_AUTOPLAY = {
  beforeText: "What is the value of f'(2)?",
  instruction: "Make it harder",
  afterText:
    "Determine all values of c in the interval [0, 3] that satisfy the conclusion of the Mean Value Theorem for f(x) = 3x\u00B2 \u2212 4x + 1.",
}

// --- Subject Presets (from existing example JSONs) ---

export const DEMO_SUBJECTS: DemoSubjectData[] = [
  {
    subject: "math",
    subjectLabel: "Mathematics",
    course: "AP Calculus AB",
    unit: "Unit 5: Analytical Applications of Differentiation",
    exercises: [
      {
        questionText:
          "Let f(x) = 3x\u00B2 \u2212 4x + 1. What is the value of f\u2032(2)?",
        type: "MC",
        options: [
          { label: "A", text: "8", isCorrect: true },
          { label: "B", text: "5", isCorrect: false },
          { label: "C", text: "12", isCorrect: false },
          { label: "D", text: "6", isCorrect: false },
        ],
        correctAnswer: "A",
        solutionSteps:
          "Differentiate: f\u2032(x) = 6x \u2212 4. Substitute x = 2: f\u2032(2) = 12 \u2212 4 = 8.",
      },
      {
        questionText:
          "If g(x) = x\u00B3 \u2212 3x, find all critical points of g on the interval [\u22122, 2].",
        type: "MC",
        options: [
          { label: "A", text: "x = \u22121 and x = 1", isCorrect: true },
          { label: "B", text: "x = 0 only", isCorrect: false },
          { label: "C", text: "x = \u22121 only", isCorrect: false },
          { label: "D", text: "x = \u00B1\u221A3", isCorrect: false },
        ],
        correctAnswer: "A",
        solutionSteps:
          "g\u2032(x) = 3x\u00B2 \u2212 3 = 3(x\u00B2 \u2212 1) = 0 \u21D2 x = \u00B11. Both are in [\u22122, 2].",
      },
    ],
    rubric: {
      title: "AP Calculus AB \u2014 Problem Set Rubric",
      dimensions: [
        {
          name: "Mathematical Reasoning",
          weight: "30%",
          levels: [
            {
              label: "Excellent",
              description:
                "Clearly states theorems and applies them with precise justification.",
            },
            {
              label: "Proficient",
              description:
                "Identifies relevant theorems with minor gaps in justification.",
            },
            {
              label: "Developing",
              description:
                "Attempts to apply theorems but with significant logical gaps.",
            },
            {
              label: "Beginning",
              description:
                "No clear mathematical reasoning or theorem application.",
            },
          ],
        },
        {
          name: "Computational Accuracy",
          weight: "30%",
          levels: [
            {
              label: "Excellent",
              description:
                "All calculations are correct with proper notation throughout.",
            },
            {
              label: "Proficient",
              description:
                "Minor arithmetic errors that do not affect the final answer.",
            },
            {
              label: "Developing",
              description:
                "Multiple errors that lead to an incorrect final answer.",
            },
            {
              label: "Beginning",
              description: "Calculations are largely absent or incorrect.",
            },
          ],
        },
        {
          name: "Communication",
          weight: "20%",
          levels: [
            {
              label: "Excellent",
              description:
                "Work is clearly organized with complete step-by-step solutions.",
            },
            {
              label: "Proficient",
              description: "Organized but missing some intermediate steps.",
            },
            {
              label: "Developing",
              description: "Disorganized with unclear progression of ideas.",
            },
            {
              label: "Beginning",
              description: "No discernible organization or explanation.",
            },
          ],
        },
      ],
    },
    lessonPlan: {
      title: "Applications of the Mean Value Theorem",
      totalMinutes: 50,
      sections: [
        {
          title: "Warm-Up: Review of Rolle\u2019s Theorem",
          duration: "8 min",
          blocks: [
            {
              type: "activity",
              content:
                "Students sketch a continuous function on [a, b] where f(a) = f(b) and identify where f\u2032(c) = 0.",
            },
            {
              type: "discussion",
              content:
                "Connect Rolle\u2019s Theorem as a special case of MVT. Ask: what changes if f(a) \u2260 f(b)?",
            },
          ],
        },
        {
          title: "Direct Instruction: Mean Value Theorem",
          duration: "15 min",
          blocks: [
            {
              type: "lecture",
              content:
                "Present MVT statement. Walk through geometric interpretation: secant slope equals tangent slope at some interior point.",
            },
            {
              type: "example",
              content:
                "Worked example: f(x) = x\u00B3 \u2212 3x on [0, 2]. Find c satisfying MVT.",
            },
          ],
        },
        {
          title: "Guided Practice & Exit Ticket",
          duration: "22 min",
          blocks: [
            {
              type: "practice",
              content:
                "Students work in pairs on 3 MVT problems of increasing difficulty. Teacher circulates and provides hints.",
            },
            {
              type: "assessment",
              content:
                "Exit ticket: Given a table of values, determine whether MVT guarantees a point where f\u2032(c) = 4.",
            },
          ],
        },
      ],
    },
  },
  {
    subject: "english",
    subjectLabel: "English",
    course: "AP English Language",
    unit: "Unit 4: Rhetorical Analysis",
    exercises: [
      {
        questionText:
          '"We paved the river, straightened it, and fenced it. Then we wondered why the water no longer sang to us." The writer\'s shift in the second sentence primarily serves to',
        type: "MC",
        options: [
          {
            label: "A",
            text: "personify the river to highlight the loss created by human control",
            isCorrect: true,
          },
          {
            label: "B",
            text: "provide statistical evidence that the river's flow rate has declined",
            isCorrect: false,
          },
          {
            label: "C",
            text: "concede that development improved safety before criticizing it",
            isCorrect: false,
          },
          {
            label: "D",
            text: "establish the speaker's credibility through personal experience",
            isCorrect: false,
          },
        ],
        correctAnswer: "A",
        solutionSteps:
          '"Sang to us" personifies the river. The shift contrasts mechanical control with emotional loss.',
      },
      {
        questionText:
          "A writer argues that public libraries should extend evening hours. Which evidence would most effectively support this claim?",
        type: "MC",
        options: [
          {
            label: "A",
            text: "A survey showing 68% of working adults can only visit after 6 PM",
            isCorrect: true,
          },
          {
            label: "B",
            text: "A quote from a librarian praising the current schedule",
            isCorrect: false,
          },
          {
            label: "C",
            text: "Statistics about declining book sales nationwide",
            isCorrect: false,
          },
          {
            label: "D",
            text: "An anecdote about a child who enjoys reading on weekends",
            isCorrect: false,
          },
        ],
        correctAnswer: "A",
        solutionSteps:
          "The survey directly addresses the claim by showing unmet demand during evening hours.",
      },
    ],
    rubric: {
      title: "AP English Language \u2014 Rhetorical Analysis Rubric",
      dimensions: [
        {
          name: "Thesis & Argument",
          weight: "30%",
          levels: [
            {
              label: "Excellent",
              description:
                "Presents a defensible thesis that addresses rhetorical choices with nuance.",
            },
            {
              label: "Proficient",
              description:
                "Thesis is present and addresses rhetorical choices adequately.",
            },
            {
              label: "Developing",
              description:
                "Thesis is vague or only partially addresses the prompt.",
            },
            {
              label: "Beginning",
              description: "No discernible thesis or restates the prompt.",
            },
          ],
        },
        {
          name: "Evidence & Commentary",
          weight: "40%",
          levels: [
            {
              label: "Excellent",
              description:
                "Embeds specific textual evidence with insightful commentary on effect.",
            },
            {
              label: "Proficient",
              description:
                "Uses relevant evidence with adequate commentary.",
            },
            {
              label: "Developing",
              description:
                "Evidence is present but commentary is superficial or missing.",
            },
            {
              label: "Beginning",
              description: "Little or no textual evidence cited.",
            },
          ],
        },
        {
          name: "Sophistication",
          weight: "30%",
          levels: [
            {
              label: "Excellent",
              description:
                "Demonstrates a complex understanding of the rhetorical situation.",
            },
            {
              label: "Proficient",
              description:
                "Shows awareness of complexity but lacks full development.",
            },
            {
              label: "Developing",
              description: "Oversimplifies the rhetorical situation.",
            },
            {
              label: "Beginning",
              description: "No awareness of rhetorical complexity.",
            },
          ],
        },
      ],
    },
    lessonPlan: {
      title: "Analyzing Tone Shifts in Persuasive Writing",
      totalMinutes: 50,
      sections: [
        {
          title: "Opening: Identifying Tone Words",
          duration: "10 min",
          blocks: [
            {
              type: "activity",
              content:
                'Students read two short passages and circle words that signal a change in tone. Share findings in pairs.',
            },
          ],
        },
        {
          title: "Close Reading: Rhetorical Shifts",
          duration: "20 min",
          blocks: [
            {
              type: "lecture",
              content:
                "Model how to annotate a passage for tone shifts. Identify signal words: however, yet, but, despite.",
            },
            {
              type: "practice",
              content:
                "Students annotate a new passage independently, then compare annotations with a partner.",
            },
          ],
        },
        {
          title: "Writing Workshop & Reflection",
          duration: "20 min",
          blocks: [
            {
              type: "practice",
              content:
                "Draft a paragraph analyzing the rhetorical effect of a tone shift in the provided text.",
            },
            {
              type: "assessment",
              content:
                "Peer review: exchange drafts and evaluate whether the analysis identifies the shift and its purpose.",
            },
          ],
        },
      ],
    },
  },
  {
    subject: "science",
    subjectLabel: "Science",
    course: "AP Biology",
    unit: "Unit 4: Cell Communication",
    exercises: [
      {
        questionText:
          "A student tests whether fertilizer increases bean plant height. She places fertilized plants on a sunny windowsill and unfertilized plants in a shaded corner. Which flaw most seriously weakens her conclusion?",
        type: "MC",
        options: [
          {
            label: "A",
            text: "The sample includes too many bean plants",
            isCorrect: false,
          },
          {
            label: "B",
            text: "Light exposure is not controlled between the two groups",
            isCorrect: true,
          },
          {
            label: "C",
            text: "Bean plants are unsuitable for controlled experiments",
            isCorrect: false,
          },
          {
            label: "D",
            text: "Fertilizer should only be added after flowering begins",
            isCorrect: false,
          },
        ],
        correctAnswer: "B",
        solutionSteps:
          "Two variables change at once (fertilizer and light). The confounding variable is light exposure.",
      },
      {
        questionText:
          "In a signal transduction pathway, a ligand binds to a receptor on the cell surface. What is the most likely next step?",
        type: "MC",
        options: [
          {
            label: "A",
            text: "The receptor undergoes a conformational change, activating a relay protein",
            isCorrect: true,
          },
          {
            label: "B",
            text: "The ligand enters the nucleus and directly activates gene transcription",
            isCorrect: false,
          },
          {
            label: "C",
            text: "The cell membrane dissolves to allow the signal molecule inside",
            isCorrect: false,
          },
          {
            label: "D",
            text: "ATP is immediately converted to ADP at the receptor site",
            isCorrect: false,
          },
        ],
        correctAnswer: "A",
        solutionSteps:
          "Ligand binding causes a conformational change in the receptor, which then activates intracellular relay proteins through phosphorylation cascades.",
      },
    ],
    rubric: {
      title: "AP Biology \u2014 Lab Report Rubric",
      dimensions: [
        {
          name: "Experimental Design",
          weight: "35%",
          levels: [
            {
              label: "Excellent",
              description:
                "Clearly identifies variables, controls, and includes appropriate sample sizes.",
            },
            {
              label: "Proficient",
              description:
                "Identifies most variables with adequate controls.",
            },
            {
              label: "Developing",
              description:
                "Missing key controls or confounding variables present.",
            },
            {
              label: "Beginning",
              description: "No clear experimental design or variables.",
            },
          ],
        },
        {
          name: "Data Analysis",
          weight: "35%",
          levels: [
            {
              label: "Excellent",
              description:
                "Uses appropriate statistical tests with correct interpretation of results.",
            },
            {
              label: "Proficient",
              description:
                "Presents data clearly with basic statistical analysis.",
            },
            {
              label: "Developing",
              description:
                "Data is presented but analysis is incomplete or incorrect.",
            },
            {
              label: "Beginning",
              description: "Raw data only, no analysis attempted.",
            },
          ],
        },
        {
          name: "Scientific Reasoning",
          weight: "30%",
          levels: [
            {
              label: "Excellent",
              description:
                "Connects results to biological concepts with evidence-based conclusions.",
            },
            {
              label: "Proficient",
              description:
                "Makes reasonable connections but lacks depth in reasoning.",
            },
            {
              label: "Developing",
              description:
                "Conclusions are stated but not supported by data.",
            },
            {
              label: "Beginning",
              description: "No connection between data and biological concepts.",
            },
          ],
        },
      ],
    },
    lessonPlan: {
      title: "Signal Transduction Pathways",
      totalMinutes: 50,
      sections: [
        {
          title: "Engage: Cell Phone Analogy",
          duration: "8 min",
          blocks: [
            {
              type: "activity",
              content:
                'Ask: "How does your phone receive a text and turn it into a notification?" Draw parallels to cell signaling: signal \u2192 receptor \u2192 transduction \u2192 response.',
            },
          ],
        },
        {
          title: "Explore: Phosphorylation Cascades",
          duration: "20 min",
          blocks: [
            {
              type: "lecture",
              content:
                "Walk through a G-protein coupled receptor pathway. Emphasize signal amplification at each step.",
            },
            {
              type: "activity",
              content:
                "Students model a 4-step kinase cascade using colored tokens. Each step doubles the signal.",
            },
          ],
        },
        {
          title: "Evaluate: Pathway Disruption",
          duration: "22 min",
          blocks: [
            {
              type: "practice",
              content:
                "Given a disrupted pathway diagram, students predict which cellular response will be affected and explain why.",
            },
            {
              type: "assessment",
              content:
                "Exit ticket: If a mutation prevents the receptor from changing shape, what happens to the downstream response?",
            },
          ],
        },
      ],
    },
  },
]
