import type {
  ChatStep,
  RubricPartData,
  WorksheetStepData,
  ExamQuestionData,
} from "./mock-data"

// ---------------------------------------------------------------------------
// Rubric Data (Chinese) - LaTeX formulas stay the same
// ---------------------------------------------------------------------------
export const RUBRIC_DATA_ZH: RubricPartData[] = [
  {
    id: "part-a",
    label: "第 (a) 部分",
    title: "用链式法则求 $f'(x)$",
    points: 3,
    items: [
      {
        id: "a1",
        description:
          "识别 $f(x) = g(h(x))$ 并分解为外函数 $g(u)$ 和内函数 $h(x)$",
        points: 1,
      },
      {
        id: "a2",
        description: "正确求出外函数的导数 $g'(u)$",
        points: 1,
      },
      {
        id: "a3",
        description:
          "乘以内函数导数得到 $f'(x) = g'(h(x)) \\cdot h'(x)$",
        points: 1,
      },
    ],
  },
  {
    id: "part-b",
    label: "第 (b) 部分",
    title: "求 $x = a$ 处的切线方程",
    points: 3,
    items: [
      {
        id: "b1",
        description: "将 $x = a$ 代入导数求出 $f'(a)$",
        points: 1,
      },
      {
        id: "b2",
        description: "计算切点坐标 $(a,\\, f(a))$",
        points: 1,
      },
      {
        id: "b3",
        description:
          "用点斜式写出切线方程 $y - f(a) = f'(a)(x - a)$",
        points: 1,
      },
    ],
  },
  {
    id: "part-c",
    label: "第 (c) 部分",
    title: "判断并论证 $f$ 的极值",
    points: 3,
    items: [
      {
        id: "c1",
        description: "令 $f'(x) = 0$ 并求解临界点",
        points: 1,
      },
      {
        id: "c2",
        description: "运用 $f''(x)$ 检验法或符号变化分析判断各临界点的类型",
        points: 1,
      },
      {
        id: "c3",
        description: "给出完整的书面论证并附上计算过程",
        points: 1,
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Chat Flows (Chinese)
// ---------------------------------------------------------------------------
export const RUBRIC_CHAT_ZH: ChatStep[] = [
  {
    messages: [
      {
        id: "r1",
        role: "ai",
        content: "张老师好！我是您的 AP 教学助手。今天我们准备什么？",
      },
    ],
    options: [
      {
        id: "ro1",
        text: "下周 Unit 3 小测 — 帮我拟定评分标准",
        isMain: true,
      },
      { id: "ro2", text: "生成链式法则练习题" },
      { id: "ro3", text: "分析 Unit 3 考试重点" },
    ],
  },
  {
    thinkingText: "正在分析 Unit 3 学习目标...",
    messages: [
      {
        id: "r2",
        role: "user",
        content: "下周 Unit 3 小测 — 帮我拟定评分标准",
      },
      {
        id: "r3",
        role: "ai",
        content:
          "收到。Unit 3 涵盖链式法则的三个核心学习目标：FUN-3.C（复合函数求导）、FUN-3.D（隐函数求导）和 FUN-3.E（反函数求导）。我来为您生成 FRQ 评分标准。",
        typewriter: true,
      },
    ],
  },
  {
    thinkingText: "正在生成 FRQ 评分标准...",
    messages: [
      {
        id: "r4",
        role: "ai",
        content: "\u2705 评分标准已生成 — 请在右侧面板中预览和编辑。",
      },
    ],
    triggerPanel: true,
  },
]

export const WORKSHEET_CHAT_ZH: ChatStep[] = [
  {
    messages: [
      {
        id: "w1",
        role: "ai",
        content:
          "评分标准已就绪 \u2713 需要我创建配套的课堂练习题吗？我可以生成分步引导的计算思维练习。",
      },
    ],
    options: [
      {
        id: "wo1",
        text: "好的 — 生成链式法则分步练习",
        isMain: true,
      },
      { id: "wo2", text: "先看看学习目标覆盖情况" },
    ],
  },
  {
    thinkingText: "正在设计分步练习层级...",
    messages: [
      {
        id: "w2",
        role: "user",
        content: "好的 — 生成链式法则分步练习",
      },
      {
        id: "w3",
        role: "ai",
        content:
          "我将设计四个递进层级：概念检测 \u2192 引导练习 \u2192 独立练习 \u2192 挑战题。每个层级针对不同的理解深度，确保每位学生都能参与。",
        typewriter: true,
      },
    ],
  },
  {
    thinkingText: "正在生成练习题内容...",
    messages: [
      {
        id: "w4",
        role: "ai",
        content:
          "\u2705 练习题已就绪 — 请在右侧预览。可以在「标准版」和「进阶版」之间切换。",
      },
    ],
    triggerPanel: true,
  },
]

export const EXAM_CHAT_ZH: ChatStep[] = [
  {
    thinkingText: "正在组装考试题目...",
    messages: [
      {
        id: "e1",
        role: "ai",
        content:
          "我已将所有内容整合为一份小测：5 道按难度分级的选择题，加上您之前设定评分标准的解答题。可以拖拽调整顺序，展开预览题目，准备好后即可导出。",
      },
    ],
    triggerPanel: true,
  },
]

// ---------------------------------------------------------------------------
// Worksheet Data (Chinese) - LaTeX formulas stay the same
// ---------------------------------------------------------------------------
export const WORKSHEET_STANDARD_ZH: WorksheetStepData[] = [
  {
    id: "step1",
    number: 1,
    title: "概念检测",
    subtitle: "判断是否需要链式法则",
    lines: [
      {
        id: "s1q1",
        text: "判断是否需要链式法则。指出外函数和内函数。",
      },
      {
        id: "s1q2",
        text: "1.  $f(x) = \\sin(3x)$",
        subLines: [
          "需要链式法则？ 是 / 否",
          "外函数：________   内函数：________",
        ],
      },
      {
        id: "s1q3",
        text: "2.  $g(x) = x^2 + \\cos(x)$",
        subLines: [
          "需要链式法则？ 是 / 否",
          "外函数：________   内函数：________",
        ],
      },
      {
        id: "s1q4",
        text: "3.  $h(x) = e^{x^2+1}$",
        subLines: [
          "需要链式法则？ 是 / 否",
          "外函数：________   内函数：________",
        ],
      },
    ],
  },
  {
    id: "step2",
    number: 2,
    title: "引导练习",
    subtitle: "按分步引导完成",
    lines: [
      {
        id: "s2q1",
        text: "求 $f(x) = (3x + 1)^5$ 的导数",
      },
    ],
    hintSteps: [
      "第 1 步：识别外函数 $u^5$，内函数 $u = 3x + 1$",
      "第 2 步：对外函数求导 $\\to$ ________",
      "第 3 步：对内函数求导 $\\to$ ________",
      "第 4 步：相乘得最终答案 $\\to$ ________",
    ],
  },
  {
    id: "step3",
    number: 3,
    title: "独立练习",
    subtitle: "不提供引导",
    lines: [
      { id: "s3q0", text: "求下列各函数的导数：" },
      { id: "s3q1", text: "1.  $f(x) = \\cos(x^3)$" },
      { id: "s3q2", text: "2.  $g(x) = \\ln(\\sin x)$" },
      { id: "s3q3", text: "3.  $h(x) = e^{\\sqrt{x}}$" },
      { id: "s3q4", text: "4.  $p(x) = (2x^2 - 1)^4$" },
    ],
  },
  {
    id: "step4",
    number: 4,
    title: "挑战题",
    subtitle: "链式法则的多重应用",
    lines: [
      {
        id: "s4q0",
        text: "以下题目需要嵌套使用链式法则。请列出每一步并标明所用法则。",
      },
      { id: "s4q1", text: "1.  $f(x) = \\sin(e^{2x})$" },
      { id: "s4q2", text: "2.  $g(x) = \\ln(\\cos(x^2))$" },
    ],
  },
]

export const WORKSHEET_ADVANCED_ZH: WorksheetStepData[] = [
  WORKSHEET_STANDARD_ZH[0],
  WORKSHEET_STANDARD_ZH[1],
  {
    id: "step3-adv",
    number: 3,
    title: "独立练习",
    subtitle: "进阶 — 隐函数与参数形式",
    lines: [
      { id: "s3aq0", text: "求下列各题的 $dy/dx$：" },
      {
        id: "s3aq1",
        text: "1.  $x^2 y + \\sin(xy) = 1$（隐函数求导）",
      },
      { id: "s3aq2", text: "2.  $y = \\arctan(e^{3x})$" },
      {
        id: "s3aq3",
        text: "3.  $x = t^2 + 1,\\; y = \\ln(t)$ — 用 $t$ 表示 $dy/dx$",
      },
      {
        id: "s3aq4",
        text: "4.  $y = [\\sin(2x)]^{\\cos x}$（对数求导法）",
      },
    ],
  },
  {
    id: "step4-adv",
    number: 4,
    title: "挑战题",
    subtitle: "进阶 — 多法则综合",
    lines: [
      {
        id: "s4aq0",
        text: "将链式法则与其他技巧结合使用。展示完整计算过程。",
      },
      {
        id: "s4aq1",
        text: "1.  $\\frac{d}{dx}\\left[\\int_0^{\\sin x} e^{t^2}\\,dt\\right]$（微积分基本定理 + 链式法则）",
      },
      {
        id: "s4aq2",
        text: "2.  已知 $f(g(x))$，其中 $f$ 和 $g$ 由表格给出，求 $(f \\circ g)'(2)$",
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Exam Data (Chinese) - LaTeX formulas stay the same
// ---------------------------------------------------------------------------
export const EXAM_QUESTIONS_ZH: ExamQuestionData[] = [
  {
    id: "mc1",
    type: "MC",
    difficulty: "Easy",
    preview: "若 $f(x) = (2x + 5)^3$，则 $f'(x) =$ ...",
    fullQuestion: "若 $f(x) = (2x + 5)^3$，则 $f'(x) =$",
    options: [
      { label: "A", text: "$3(2x + 5)^2$" },
      { label: "B", text: "$6(2x + 5)^2$" },
      { label: "C", text: "$3(2x + 5)^2 \\cdot 2x$" },
      { label: "D", text: "$2(2x + 5)^3$" },
    ],
    correctAnswer: "B",
    explanation:
      "链式法则：外函数 $= u^3 \\to 3u^2$，内函数 $= 2x+5 \\to 2$。结果：$6(2x+5)^2$。",
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
      "链式法则：外函数 $= \\sin u \\to \\cos u$，内函数 $= 4x \\to 4$。答案：$4\\cos(4x)$。",
    totalPoints: 1,
  },
  {
    id: "mc3",
    type: "MC",
    difficulty: "Medium",
    preview: "若 $g(x) = e^{x^2-1}$，则 $g'(1) =$ ...",
    fullQuestion: "若 $g(x) = e^{x^2-1}$，则 $g'(1) =$",
    options: [
      { label: "A", text: "$0$" },
      { label: "B", text: "$1$" },
      { label: "C", text: "$2$" },
      { label: "D", text: "$2e$" },
    ],
    correctAnswer: "C",
    explanation:
      "$g'(x) = 2x \\cdot e^{x^2-1}$。当 $x=1$ 时：$g'(1) = 2(1) \\cdot e^0 = 2$。",
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
      "链式法则：$(1/\\cos x)(-\\sin x) = -\\sin x / \\cos x = -\\tan x$。",
    totalPoints: 1,
  },
  {
    id: "mc5",
    type: "MC",
    difficulty: "Hard",
    preview: "若 $h(x) = \\sin(e^{2x})$，则 $h''(0) =$ ...",
    fullQuestion: "若 $h(x) = \\sin(e^{2x})$，则 $h''(0) =$",
    options: [
      { label: "A", text: "$2\\cos(1) + 4\\sin(1)$" },
      { label: "B", text: "$4\\cos(1) - 4\\sin(1)$" },
      { label: "C", text: "$2\\cos(1)$" },
      { label: "D", text: "$4\\cos(1)$" },
    ],
    correctAnswer: "B",
    explanation:
      "$h'(x) = 2e^{2x}\\cos(e^{2x})$。对 $h''(x)$ 用乘积法则 + 链式法则，在 $x = 0$ 处求值。",
    totalPoints: 1,
  },
  {
    id: "frq1",
    type: "FRQ",
    difficulty: "Hard",
    preview: "设 $f(x) = e^{\\sin(x^2)}$。回答第 (a)\u2013(d) 部分。",
    fullQuestion:
      "设 $f(x) = e^{\\sin(x^2)}$。函数 $f$ 在所有实数上有定义。",
    parts: [
      {
        label: "(a)",
        description: "求 $f'(x)$。展示链式法则的求导过程。",
        points: 3,
        rubric:
          "1 分：正确的外层导数 $e^{\\sin(x^2)}$；1 分：正确的中层导数 $\\cos(x^2)$；1 分：正确的内层导数 $2x$ 及最终乘积",
      },
      {
        label: "(b)",
        description: "写出 $f$ 在 $x = 0$ 处的切线方程。",
        points: 2,
        rubric:
          "1 分：正确的斜率 $f'(0) = 0$；1 分：正确的切点 $(0, e^0) = (0,1)$ 和方程 $y = 1$",
      },
      {
        label: "(c)",
        description:
          "判断 $f$ 在 $x = 0$ 处是否有局部极大值、局部极小值或都没有。请说明理由。",
        points: 2,
        rubric:
          "1 分：正确的二阶导数求值或符号分析；1 分：完整的论证和结论",
      },
      {
        label: "(d)",
        description:
          "用换元法求 $\\int_0^{\\sqrt{\\pi}} x \\cdot \\cos(x^2) \\cdot e^{\\sin(x^2)}\\,dx$ 的值。",
        points: 2,
        rubric:
          "1 分：正确的换元 $u = \\sin(x^2)$；1 分：正确换算积分限并求出最终答案",
      },
    ],
    totalPoints: 9,
  },
]
