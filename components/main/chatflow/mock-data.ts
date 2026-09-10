import type {
  MockExercise,
  MockRubric,
  MockCourse,
  MockWorksheet,
  MockLessonPlan,
  CommunityResource,
  RecentWork,
} from "./types"

export const MOCK_COURSES: MockCourse[] = [
  {
    id: "course-1",
    name: "AP Calculus AB and BC",
    code: "APCALCAB_BC",
    units: [
      {
        id: "unit-1",
        unitNumber: "1",
        title: "Limits and Continuity",
        topics: [
          "Defining Limits",
          "Estimating Limits from Graphs and Tables",
          "Squeeze Theorem",
          "Continuity and Discontinuity",
          "Intermediate Value Theorem",
        ],
        exerciseCount: 24,
        lastGenerated: "2天前",
      },
      {
        id: "unit-2",
        unitNumber: "2",
        title: "Differentiation: Definition and Fundamental Properties",
        topics: [
          "Average and Instantaneous Rate of Change",
          "The Derivative as a Function",
          "Differentiation Rules",
          "Product and Quotient Rules",
        ],
        exerciseCount: 16,
        lastGenerated: "5天前",
      },
      {
        id: "unit-3",
        unitNumber: "3",
        title: "Differentiation: Composite, Implicit, and Inverse Functions",
        topics: [
          "Chain Rule",
          "Implicit Differentiation",
          "Inverse Trigonometric Functions",
          "Higher-Order Derivatives",
        ],
        exerciseCount: 8,
        lastGenerated: "1周前",
      },
    ],
  },
  {
    id: "course-2",
    name: "AP Statistics",
    code: "APSTAT",
    units: [
      {
        id: "unit-s1",
        unitNumber: "1",
        title: "Exploring One-Variable Data",
        topics: [
          "Representing Data with Graphs",
          "Describing Distributions",
          "Summary Statistics",
        ],
        exerciseCount: 12,
        lastGenerated: "3天前",
      },
    ],
  },
]

export const MOCK_EXERCISES: MockExercise[] = [
  {
    id: "ex-1",
    questionText:
      "What is the value of lim(x→2) (x² - 4)/(x - 2)?",
    type: "MC",
    difficulty: 2,
    options: [
      { label: "A", text: "0", isCorrect: false },
      { label: "B", text: "2", isCorrect: false },
      { label: "C", text: "4", isCorrect: true },
      { label: "D", text: "Does not exist", isCorrect: false },
    ],
    correctAnswer: "C",
    solutionSteps:
      "Factor the numerator: (x² - 4) = (x+2)(x-2). Cancel (x-2) from numerator and denominator. Substitute x = 2: lim = 2 + 2 = 4.",
  },
  {
    id: "ex-2",
    questionText:
      "If f(x) is continuous on [a, b] and f(a) < 0 < f(b), which theorem guarantees the existence of c ∈ (a, b) such that f(c) = 0?",
    type: "MC",
    difficulty: 2,
    options: [
      { label: "A", text: "Mean Value Theorem", isCorrect: false },
      { label: "B", text: "Intermediate Value Theorem", isCorrect: true },
      { label: "C", text: "Extreme Value Theorem", isCorrect: false },
      { label: "D", text: "Squeeze Theorem", isCorrect: false },
    ],
    correctAnswer: "B",
    solutionSteps:
      "The Intermediate Value Theorem states that if f is continuous on [a, b] and k is between f(a) and f(b), then there exists c ∈ (a, b) with f(c) = k. Here k = 0.",
  },
  {
    id: "ex-3",
    questionText:
      "Evaluate lim(x→0) sin(3x)/x.",
    type: "MC",
    difficulty: 2,
    options: [
      { label: "A", text: "0", isCorrect: false },
      { label: "B", text: "1", isCorrect: false },
      { label: "C", text: "3", isCorrect: true },
      { label: "D", text: "Does not exist", isCorrect: false },
    ],
    correctAnswer: "C",
    solutionSteps:
      "Rewrite as 3 · sin(3x)/(3x). As x→0, 3x→0 and sin(3x)/(3x)→1. So the limit = 3 · 1 = 3.",
  },
  {
    id: "ex-4",
    questionText:
      "At which value of x is the function f(x) = (x² - 1)/(x - 1) discontinuous?",
    type: "MC",
    difficulty: 1,
    options: [
      { label: "A", text: "x = 0", isCorrect: false },
      { label: "B", text: "x = 1", isCorrect: true },
      { label: "C", text: "x = -1", isCorrect: false },
      { label: "D", text: "The function is continuous everywhere", isCorrect: false },
    ],
    correctAnswer: "B",
    solutionSteps:
      "The denominator is zero when x = 1, causing a discontinuity (removable). The limit exists (equals 2), but f(1) is undefined.",
  },
  {
    id: "ex-5",
    questionText:
      "If lim(x→c) f(x) = L and lim(x→c) g(x) = M, what is lim(x→c) [2f(x) - g(x)]?",
    type: "MC",
    difficulty: 1,
    options: [
      { label: "A", text: "2L - M", isCorrect: true },
      { label: "B", text: "2(L - M)", isCorrect: false },
      { label: "C", text: "L - 2M", isCorrect: false },
      { label: "D", text: "Cannot be determined", isCorrect: false },
    ],
    correctAnswer: "A",
    solutionSteps:
      "By limit laws: lim[2f(x) - g(x)] = 2·lim f(x) - lim g(x) = 2L - M.",
  },
  {
    id: "ex-6",
    questionText:
      "Which of the following limits equals e?",
    type: "MC",
    difficulty: 3,
    options: [
      { label: "A", text: "lim(n→∞) (1 + 1/n)ⁿ", isCorrect: true },
      { label: "B", text: "lim(n→∞) (1 + n)^(1/n)", isCorrect: false },
      { label: "C", text: "lim(x→0) (1 + x)^x", isCorrect: false },
      { label: "D", text: "lim(x→∞) ln(x)/x", isCorrect: false },
    ],
    correctAnswer: "A",
    solutionSteps:
      "The classic definition of e is lim(n→∞)(1 + 1/n)ⁿ. Option D → 0 by L'Hôpital's Rule.",
  },
  {
    id: "ex-7",
    questionText:
      "For f(x) = |x - 3|, what is lim(x→3) f(x)?",
    type: "MC",
    difficulty: 1,
    options: [
      { label: "A", text: "3", isCorrect: false },
      { label: "B", text: "0", isCorrect: true },
      { label: "C", text: "-3", isCorrect: false },
      { label: "D", text: "Does not exist", isCorrect: false },
    ],
    correctAnswer: "B",
    solutionSteps:
      "Both left and right limits approach |3-3| = 0. Since both one-sided limits equal 0, lim(x→3)|x-3| = 0.",
  },
  {
    id: "ex-8",
    questionText:
      "The function f is defined as f(x) = { x² for x < 1, 2x - 1 for x ≥ 1 }. Is f continuous at x = 1?",
    type: "MC",
    difficulty: 2,
    options: [
      { label: "A", text: "Yes, because both pieces equal 1 at x = 1", isCorrect: true },
      { label: "B", text: "No, because the derivatives differ", isCorrect: false },
      { label: "C", text: "No, because f(1) is undefined", isCorrect: false },
      { label: "D", text: "Yes, because it is a polynomial", isCorrect: false },
    ],
    correctAnswer: "A",
    solutionSteps:
      "Left limit: lim(x→1⁻) x² = 1. Right limit: lim(x→1⁺) 2x-1 = 1. f(1) = 2(1)-1 = 1. Since left = right = f(1) = 1, f is continuous at x = 1.",
  },
]

export const MOCK_RUBRIC: MockRubric = {
  id: "rubric-1",
  title: "AP Calculus Unit 1 - Limits and Continuity Assessment Rubric",
  dimensions: [
    {
      id: "dim-1",
      name: "Conceptual Understanding",
      description: "Understanding of limit concepts and theorems",
      weight: 30,
      levels: {
        excellent:
          "Demonstrates thorough understanding of limit definitions, properties, and theorems. Correctly identifies all limit types and applies appropriate methods.",
        good: "Shows solid understanding with minor conceptual gaps. Applies most limit techniques correctly.",
        passing:
          "Basic understanding of limits with some misconceptions. Can evaluate simple limits but struggles with complex cases.",
        failing:
          "Fundamental misunderstanding of limit concepts. Cannot correctly evaluate basic limits.",
      },
    },
    {
      id: "dim-2",
      name: "Computational Accuracy",
      description: "Accuracy of mathematical computations",
      weight: 25,
      levels: {
        excellent:
          "All computations are correct with proper notation. Work is shown clearly and completely.",
        good: "Minor computational errors that don't affect the overall approach. Most work is shown.",
        passing:
          "Several computational errors. Some steps are missing or unclear.",
        failing:
          "Pervasive computational errors. Little or no work shown.",
      },
    },
    {
      id: "dim-3",
      name: "Problem-Solving Strategy",
      description: "Selection and execution of appropriate solution strategies",
      weight: 25,
      levels: {
        excellent:
          "Selects optimal strategies for each problem. Shows flexibility in approach and verification.",
        good: "Uses appropriate strategies but may not choose the most efficient path.",
        passing:
          "Attempts reasonable strategies but execution is incomplete or incorrect.",
        failing:
          "No clear strategy evident. Random or inappropriate techniques used.",
      },
    },
    {
      id: "dim-4",
      name: "Mathematical Communication",
      description: "Clarity and precision of mathematical reasoning",
      weight: 20,
      levels: {
        excellent:
          "Explanations are precise and well-organized. Uses correct mathematical notation and terminology throughout.",
        good: "Explanations are mostly clear with minor notation issues.",
        passing:
          "Explanations are vague or incomplete. Some notation errors.",
        failing:
          "No meaningful explanations provided. Notation is incorrect or absent.",
      },
    },
  ],
}

export const MOCK_RECENT_WORK: RecentWork[] = [
  {
    id: "rw-1",
    title: "Unit 1 选择题 x8",
    type: "exercises",
    timestamp: "2分钟前",
    detail: "MC · 中等难度 · Limits and Continuity",
  },
  {
    id: "rw-2",
    title: "Unit 1 Rubric",
    type: "rubric",
    timestamp: "昨天",
    detail: "4个评分维度 · Limits and Continuity",
  },
  {
    id: "rw-3",
    title: "Unit 2 Exam PDF",
    type: "pdf",
    timestamp: "3天前",
    detail: "10题 · 含答案 · Differentiation",
  },
  {
    id: "rw-4",
    title: "AP Calculus 教案",
    type: "lesson-plan",
    timestamp: "1周前",
    detail: "5个章节 · Unit 1-2",
  },
]

export const QUICK_START_CARDS = [
  {
    id: "qs-1",
    icon: "📝",
    title: "出一套题",
    description: "选择单元，即刻生成",
    prompt: "帮我生成一套练习题",
    gradient: "from-blue-50 to-indigo-50",
    border: "border-blue-200",
    iconBg: "bg-blue-100",
  },
  {
    id: "qs-2",
    icon: "📖",
    title: "写教案",
    description: "AI 协助备课",
    prompt: "帮我写一个教案",
    gradient: "from-emerald-50 to-teal-50",
    border: "border-emerald-200",
    iconBg: "bg-emerald-100",
  },
  {
    id: "qs-3",
    icon: "📄",
    title: "做试卷",
    description: "全流程一键导出",
    prompt: "全流程：生成rubric，出8道中等难度题，保存后导出exam PDF",
    gradient: "from-amber-50 to-orange-50",
    border: "border-amber-200",
    iconBg: "bg-amber-100",
  },
  {
    id: "qs-4",
    icon: "📊",
    title: "生成 Rubric",
    description: "评分标准表",
    prompt: "帮我生成本单元 rubric",
    gradient: "from-purple-50 to-violet-50",
    border: "border-purple-200",
    iconBg: "bg-purple-100",
  },
  {
    id: "qs-5",
    icon: "📋",
    title: "创建练习卷",
    description: "Worksheet 练习卷",
    prompt: "创建 worksheet 并导出 PDF",
    gradient: "from-rose-50 to-pink-50",
    border: "border-rose-200",
    iconBg: "bg-rose-100",
  },
  {
    id: "qs-6",
    icon: "📚",
    title: "我的资源",
    description: "题库 / 教案 / Rubric",
    prompt: "",
    gradient: "from-slate-50 to-gray-50",
    border: "border-slate-200",
    iconBg: "bg-slate-100",
  },
] as const

export const MOCK_WORKSHEET: MockWorksheet = {
  id: "ws-1",
  title: "Unit 1: Limits and Continuity Practice",
  courseName: "AP Calculus AB/BC",
  totalPoints: 40,
  sections: [
    {
      id: "ws-sec-1",
      title: "Part A: Multiple Choice",
      instructions:
        "Choose the best answer for each question. Show your work for partial credit. (4 points each)",
      exerciseIds: ["ex-1", "ex-2", "ex-3", "ex-4"],
      pointsPerQuestion: 4,
    },
    {
      id: "ws-sec-2",
      title: "Part B: Free Response",
      instructions:
        "Answer each question completely. Show all steps and justify your reasoning. (6 points each)",
      exerciseIds: ["ex-5", "ex-6"],
      pointsPerQuestion: 6,
    },
    {
      id: "ws-sec-3",
      title: "Part C: Challenge",
      instructions:
        "These problems require deeper analysis. Full credit requires complete justification. (8 points each)",
      exerciseIds: ["ex-7", "ex-8"],
      pointsPerQuestion: 8,
    },
  ],
}

export const MOCK_LESSON_PLAN: MockLessonPlan = {
  id: "lp-1",
  title: "Limits and Continuity 导论",
  courseName: "AP Calculus AB",
  unitName: "Unit 1",
  totalMinutes: 45,
  level: "中等",
  objectives: [
    "理解极限的直观定义和数学表达",
    "能从图表和数值表估算极限值",
    "识别单侧极限与双侧极限的区别",
    "初步理解连续性的概念",
  ],
  keyPoints: ["epsilon-delta 定义的直观理解", "单侧极限的判断方法", "极限运算法则"],
  difficulties: [
    "从具体到抽象的极限概念过渡",
    "无穷处极限的理解",
    "可去间断点与不可去间断点的区分",
  ],
  steps: [
    {
      id: "step-1",
      phase: "warm-up",
      title: "课前导入：趋近的概念",
      duration: 5,
      teacherActions: [
        "展示一段动画：点在曲线上逼近某位置",
        "提问：当 x 越来越接近 2 时，f(x) 趋向什么？",
      ],
      studentActions: ["观察动画并思考", "与同桌讨论直觉上的答案"],
    },
    {
      id: "step-2",
      phase: "instruction",
      title: "新知讲授：极限的定义与求法",
      duration: 15,
      teacherActions: [
        "用数值表和图像引入 lim(x→a) f(x) = L",
        "讲解直接代入法、因式分解法",
        "演示 Desmos 上的交互图形",
      ],
      studentActions: [
        "记录关键定义和公式",
        "跟随教师在 Desmos 上操作",
        "完成 2 道跟练题",
      ],
    },
    {
      id: "step-3",
      phase: "practice",
      title: "课堂练习：极限计算",
      duration: 15,
      teacherActions: ["分发练习题（4 道基础 + 2 道提高）", "巡视指导，重点关注易错点"],
      studentActions: ["独立完成基础题", "小组合作讨论提高题", "展示解题过程"],
    },
    {
      id: "step-4",
      phase: "summary",
      title: "课堂小结",
      duration: 5,
      teacherActions: ["回顾本节课核心概念", "强调极限求解的一般步骤", "布置课后练习"],
      studentActions: ["总结今天学到的 3 个关键点", "记录课后作业要求"],
    },
    {
      id: "step-5",
      phase: "extension",
      title: "拓展延伸",
      duration: 5,
      teacherActions: [
        "简要介绍下节课内容（连续性）",
        "推荐 Khan Academy 相关视频",
      ],
      studentActions: ["记录拓展学习资源", "思考极限与连续性之间的联系"],
    },
  ],
  resources: ["投影仪", "Desmos 在线图形计算器", "练习卷（Part A）", "Khan Academy 视频链接"],
  assessment: "课后完成 5 道极限基础题 + 1 道思考题，下节课前提交",
}

export const MOCK_COMMUNITY_RESOURCES: CommunityResource[] = [
  {
    id: "cr-1",
    authorName: "李明",
    authorSchool: "北京 101 中学",
    authorAvatar: "👨‍🏫",
    title: "AP Calculus 极限专题教案",
    subject: "AP Calculus AB",
    rating: 4.8,
    useCount: 234,
    type: "lesson-plan",
  },
  {
    id: "cr-2",
    authorName: "王芳",
    authorSchool: "上海中学国际部",
    authorAvatar: "👩‍🏫",
    title: "极限与连续性导论 · 45min",
    subject: "AP Calculus AB",
    rating: 4.6,
    useCount: 189,
    type: "lesson-plan",
  },
  {
    id: "cr-3",
    authorName: "张伟",
    authorSchool: "人大附中 ICC",
    authorAvatar: "👨‍💼",
    title: "Unit 2 微分综合练习 x20",
    subject: "AP Calculus BC",
    rating: 4.9,
    useCount: 312,
    type: "exercises",
  },
  {
    id: "cr-4",
    authorName: "陈静",
    authorSchool: "深圳中学",
    authorAvatar: "👩‍💼",
    title: "Rubric 模板：计算类评分标准",
    subject: "AP Calculus AB",
    rating: 4.5,
    useCount: 98,
    type: "rubric",
  },
  {
    id: "cr-5",
    authorName: "刘洋",
    authorSchool: "南京外国语学校",
    authorAvatar: "🧑‍🏫",
    title: "Statistics Unit 1 练习卷",
    subject: "AP Statistics",
    rating: 4.7,
    useCount: 156,
    type: "worksheet",
  },
  {
    id: "cr-6",
    authorName: "赵琳",
    authorSchool: "成都七中国际部",
    authorAvatar: "👩‍🎓",
    title: "导数应用完整教案 · 90min",
    subject: "AP Calculus BC",
    rating: 4.4,
    useCount: 87,
    type: "lesson-plan",
  },
]

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: "简单",
  2: "中等",
  3: "困难",
  4: "高难",
}

export const DASHBOARD_STATS = {
  totalExercises: 48,
  totalRubrics: 3,
  totalWorksheets: 2,
  totalLessonPlans: 2,
  weeklyGenerated: 12,
}
