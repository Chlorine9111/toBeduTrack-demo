import { randomUUID } from "crypto";
import type {
  BlockType,
  CedTopicMatch,
  LessonPlanBlock,
  OutlineSection,
} from "@/lib/lesson-plan/types";
import { detectSubjectCategory } from "@/lib/ai/subject-category";

type FallbackSectionRole =
  | "intro"
  | "concept"
  | "principle"
  | "worked_example"
  | "application"
  | "assessment"
  | "consolidation"
  | "reflection"
  | "general";

type FallbackContext = {
  section: OutlineSection;
  sectionIndex: number;
  totalSections: number;
  allSections: OutlineSection[];
  role: FallbackSectionRole;
  courseName: string;
  subjectCategory: ReturnType<typeof detectSubjectCategory>;
  topicTitle: string;
  primaryLo: string;
  focusText: string;
  prevTitle: string;
  nextTitle: string;
};

function hasTimeTag(text: string) {
  return /(\(|（)?\s*\d+\s*(分钟|min|mins|秒)\s*(\)|）)?/i.test(text);
}

function normalizeSummary(summary: string) {
  const normalized = summary.replace(/\s+/g, " ").trim();
  if (!normalized) return "围绕本节目标完成可观察课堂产出。";
  return normalized.slice(0, 120);
}

function resolveSectionIndex(params: {
  section: OutlineSection;
  sectionIndex?: number;
  allSections: OutlineSection[];
}) {
  if (typeof params.sectionIndex === "number" && params.sectionIndex >= 0) {
    return params.sectionIndex;
  }
  const byId = params.allSections.findIndex((item) => item.id === params.section.id);
  if (byId >= 0) return byId;
  const byTitle = params.allSections.findIndex((item) => item.title === params.section.title);
  if (byTitle >= 0) return byTitle;
  return 0;
}

function resolveSectionRole(params: {
  sectionTitle: string;
  sectionIndex: number;
  totalSections: number;
}): FallbackSectionRole {
  const title = params.sectionTitle.toLowerCase();
  if (params.sectionIndex === 0) return "intro";
  if (params.totalSections > 1 && params.sectionIndex === 1) return "concept";
  if (params.totalSections > 2 && params.sectionIndex === params.totalSections - 2) {
    return "consolidation";
  }
  if (params.sectionIndex === params.totalSections - 1) return "reflection";

  if (/原理|推导|证明|展开/.test(params.sectionTitle)) return "principle";
  if (/例题|演示|示范|worked/.test(title) || /例题|演示/.test(params.sectionTitle)) {
    return "worked_example";
  }
  if (/检验|quiz|测验|模拟|评估/.test(title) || /检验|测验|模拟|评估/.test(params.sectionTitle)) {
    return "assessment";
  }
  if (/应用|练习|题型|任务/.test(params.sectionTitle)) {
    return "application";
  }
  return "general";
}

function buildNumericSeed(sectionIndex: number) {
  const a = 2 + sectionIndex;
  const b = 3 + sectionIndex * 2;
  const c = 5 + sectionIndex;
  return { a, b, c };
}

function buildContextualParagraph(context: FallbackContext) {
  const position = `第 ${context.sectionIndex + 1}/${context.totalSections} 节`;
  if (context.role === "intro") {
    return `Teacher: 以“${context.topicTitle} 在真实课堂任务中的用途”开场，要求学生先写出已知条件与待求目标。Student: 先独立标注信息，再同伴互评信息是否关键。Key: 对齐 ${context.primaryLo}，${position}重点是激活先备知识；本节焦点：${context.focusText}`;
  }
  if (context.role === "concept") {
    return `Teacher: 先板书 ${context.topicTitle} 的形式化定义、适用条件和反例边界，再让学生用“定义-条件-结论”句式复述。Student: 给出 1 个符合定义和 1 个不符合定义的例子。Key: 对齐 ${context.primaryLo}，${position}重点是完成概念建模；本节焦点：${context.focusText}`;
  }
  if (context.role === "principle") {
    return `Teacher: 把 ${context.topicTitle} 的推导拆成“起点假设→中间变换→结论校验”三段，每段都让学生说明依据。Student: 每完成一步都口头解释“为什么这样变形”。Key: 对齐 ${context.primaryLo}，${position}重点是推导逻辑；承接“${context.prevTitle}”，为“${context.nextTitle}”做准备。`;
  }
  if (context.role === "worked_example") {
    return `Teacher: 选择 1 道代表性例题进行逐行演示，强调审题、列式、计算、检验四个停顿点。Student: 在每个停顿点写下“本步目的”和“下一步风险”。Key: 对齐 ${context.primaryLo}，${position}重点是可迁移步骤化解题。`;
  }
  if (context.role === "consolidation") {
    return `Teacher: 组织综合练习，要求学生在有限时间内完成“识别模型→推导结果→证据解释”全链路。Student: 两人互改并指出对方证据链的断点。Key: 对齐 ${context.primaryLo}，${position}重点是综合运用与互评纠偏。`;
  }
  if (context.role === "reflection") {
    return `Teacher: 用出口任务收束本单元，要求学生提交“本节最关键方法 + 易错点 + 修正动作”三句反思。Student: 对照 rubric 自评并写下一条下节课行动计划。Key: 对齐 ${context.primaryLo}，${position}重点是总结反思与迁移。`;
  }
  if (context.role === "assessment") {
    return `Teacher: 进行限时诊断，题目覆盖 ${context.topicTitle} 的核心判断点与边界条件。Student: 每题必须给出结论和证据，不允许只写答案。Key: 对齐 ${context.primaryLo}，${position}重点是可证据化评价。`;
  }
  return `Teacher: 围绕 ${context.topicTitle} 组织“问题-方法-反馈”闭环。Student: 先独立尝试，再用同伴反馈修正。Key: 对齐 ${context.primaryLo}，${position}重点是具体应用与过程可视化；本节焦点：${context.focusText}`;
}

function buildContextualExample(context: FallbackContext) {
  const { a, b, c } = buildNumericSeed(context.sectionIndex);
  const isPhysics =
    context.subjectCategory === "science" && /physics/i.test(context.courseName);

  // Science fallback should never emit pure-math function drills.
  if (isPhysics) {
    if (context.role === "intro") {
      return {
        prompt: `情境判断题：一个质量 $m=\\mathrm{${a}.0\\,kg}$ 的物体从高度 $h=\\mathrm{${b}.0\\,m}$ 由静止释放（忽略空气阻力）。请判断求解落地瞬间速度需要哪些信息（${context.topicTitle}），哪些信息属于干扰项，并说明理由。`,
        steps: [
          "步骤 1：明确系统与目标量：以物体-地球系统为研究对象，目标是落地瞬间速度 v。",
          "步骤 2：列出已知量与可用守恒/定理：已知 m、h、初速度为 0；若忽略非保守力，可用机械能守恒。",
          "步骤 3：判断是否需要质量：写出 $mgh=\\tfrac12mv^2$，发现 m 可约去，因此质量不是决定 v 的必要信息（但可用于求能量数值）。",
          "步骤 4：整理出最小信息集：需要 g 与 h；不需要物体材质/形状（在忽略阻力条件下）。",
          "步骤 5：给出检查点：让学生写出“已知-未知-定理-方程”四栏，并说明每条信息为何进入方程或被排除。",
        ],
      };
    }

    if (context.role === "concept") {
      return {
        prompt: `概念辨析题：同一物体在不同参考系下运动。判断下列说法哪一个正确，并用 ${context.topicTitle} 的定义解释：A. 动能 $K=\\tfrac12mv^2$ 与参考系无关；B. 动能与参考系有关，但机械能守恒与否只取决于系统中是否存在非保守力。`,
        steps: [
          "步骤 1：写出动能的定义式并标注 v 的含义：v 必须是相对所选参考系测得的速度。",
          "步骤 2：用一个数值反例检验：同一物体相对地面 v=3 m/s，相对以 1 m/s 同向运动的车厢 v=2 m/s，对应动能不同。",
          "步骤 3：据此判断 A 为错：动能数值随参考系变化（即使公式形式不变）。",
          "步骤 4：解释 B 的第二句：机械能是否守恒取决于系统边界与非保守力做功（如摩擦、阻力），与参考系选择无直接因果关系。",
          "步骤 5：给出最终判断与一句可评分证据链：引用定义 + 给出反例 + 回到守恒条件。",
        ],
      };
    }

    if (context.role === "principle") {
      return {
        prompt: `推导题：在一维直线运动中，从牛顿第二定律 $F_{\\text{net}}=ma$ 推导功-能定理 $W_{\\text{net}}=\\Delta K$。要求说明每一步的物理含义（${context.topicTitle}）。`,
        steps: [
          "步骤 1：从 $F_{\\text{net}}=ma$ 出发，写成 $F_{\\text{net}}\\,dx = ma\\,dx$，说明这是把力与位移联系起来，为引入“功”做准备。",
          "步骤 2：用运动学关系 $a= v\\,dv/dx$（由 $a=dv/dt$ 与 $v=dx/dt$ 组合得到），把右侧改写为 $m v\\,dv$。",
          "步骤 3：对位移区间积分：$\\int F_{\\text{net}}\\,dx = \\int m v\\,dv$，左侧定义为净功 $W_{\\text{net}}$。",
          "步骤 4：计算右侧积分得到 $\\tfrac12 m v_f^2 - \\tfrac12 m v_i^2$，识别为动能变化 $\\Delta K$。",
          "步骤 5：写出结论 $W_{\\text{net}}=\\Delta K$ 并做合理性检验：若净功为负（摩擦占优），速度应降低（$\\Delta K<0$）。",
        ],
      };
    }

    if (context.role === "worked_example" || context.role === "application") {
      const mu = (0.1 * (1 + (context.sectionIndex % 3))).toFixed(2);
      const d = (1 + (context.sectionIndex % 3)).toFixed(1);
      return {
        prompt: `计算题：质量 $m=\\mathrm{${a}.0\\,kg}$ 的物块以初速度 $v_0=\\mathrm{${b}.0\\,m/s}$ 在粗糙水平面上滑行，动摩擦系数 $\\mu_k=\\mathrm{${mu}}$，滑行距离 $d=\\mathrm{${d}\\,m}$ 后停止。用功-能定理求摩擦力做功并判断是否与 ${context.topicTitle} 一致。`,
        steps: [
          "步骤 1：列出已知量与待求：m、v0、μk、d；求 $W_{\\text{fric}}$（以及可选求摩擦力大小）。",
          "步骤 2：写功-能定理：$W_{\\text{net}}=\\Delta K=0-\\tfrac12 m v_0^2$，因为末速度为 0。",
          "步骤 3：识别净功来源：水平方向只有摩擦做功（重力和支持力不做功），因此 $W_{\\text{net}}=W_{\\text{fric}}$。",
          "步骤 4：计算 $W_{\\text{fric}}=-\\tfrac12 m v_0^2$ 并带单位 J；若要核对，可再算 $f_k=\\mu_k mg$ 与 $W=-f_k d$。",
          "步骤 5：合理性检验：摩擦做功应为负；数值越大（更负）意味着损失的机械能更多，符合直觉。",
        ],
      };
    }

    if (context.role === "consolidation" || context.role === "assessment") {
      return {
        prompt: `综合应用题：一辆小车质量 $m=\\mathrm{${a}.0\\,kg}$ 从高度差 $\\Delta h=\\mathrm{${b}.0\\,m}$ 下滑后进入水平面，与弹簧（$k=\\mathrm{${c}00\\,N/m}$）相碰压缩。忽略摩擦，求最大压缩量 x，并说明 ${context.topicTitle} 中“能量转化链”是什么。`,
        steps: [
          "步骤 1：选系统并写能量图：重力势能 $m g\\Delta h$ 转化为弹簧势能 $\\tfrac12 kx^2$（末态瞬时速度为 0）。",
          "步骤 2：写能量守恒方程：$m g\\Delta h=\\tfrac12 kx^2$。",
          "步骤 3：代入数值并解出 x，注意单位换算（N/m, m）。",
          "步骤 4：解释链路：势能减少等于弹簧势能增加，中间动能只是过程态变量。",
          "步骤 5：做合理性检验：更大高度差或更小 k 应导致更大压缩量。",
        ],
      };
    }
  }

  if (context.role === "intro") {
    return {
      prompt: `情境判断题：已知课堂案例中给出数据 ${a}, ${b}, ${c}，请判断哪些信息可直接用于 ${context.topicTitle} 的求解，哪些是干扰信息。`,
      steps: [
        "步骤 1：圈出题干中的已知量、未知量和约束条件。",
        "步骤 2：把信息分成“直接可用/间接可用/干扰项”三类。",
        "步骤 3：说明每条信息与本节学习目标的关系。",
        "步骤 4：删除干扰项后重写简化版题干。",
        "步骤 5：给出 2 句可执行的解题起步策略。",
      ],
    };
  }
  if (context.role === "concept") {
    return {
      prompt: `概念辨析题：比较表达式 A=f(x)=(${a}x+${b})^${c} 与 B=g(x)=${a}x^${c}+${b}，指出哪一个满足本节定义场景并说明理由。`,
      steps: [
        "步骤 1：写出本节使用的正式定义与必要条件。",
        "步骤 2：逐条核对 A 是否满足定义条件。",
        "步骤 3：逐条核对 B 是否满足定义条件。",
        "步骤 4：指出最容易误判的那一条条件。",
        "步骤 5：给出最终判断并附一句证据链解释。",
      ],
    };
  }
  if (context.role === "principle") {
    return {
      prompt: `推导题：设 h(x)=(${a}x^2+${b})^${c}，请完成从目标函数到结果表达式的完整推导，并标注每一步依据。`,
      steps: [
        "步骤 1：识别复合结构并设中间变量，明确推导目标。",
        "步骤 2：写出外层变化率与内层变化率的对应关系。",
        "步骤 3：逐步代入并保留中间式，避免跳步。",
        "步骤 4：化简结果并核对符号、系数和次数。",
        "步骤 5：说明若漏掉某一步会导致什么错误。",
      ],
    };
  }
  if (context.role === "worked_example") {
    return {
      prompt: `例题演示：已知 p(x)=(${a}x-${b})^${c}，计算 p'(${a})，并展示“审题-列式-计算-校验”的完整流程。`,
      steps: [
        "步骤 1：先审题，明确要求的是导函数值而非函数值。",
        "步骤 2：写出通式并标记关键易错点（内层导数、符号）。",
        "步骤 3：代入 x=a 完成数值计算，保留中间结果。",
        "步骤 4：用数量级和符号快速做合理性检查。",
        "步骤 5：总结这类题的可迁移解题模板。",
      ],
    };
  }
  if (context.role === "consolidation") {
    return {
      prompt: `综合应用题：结合 ${context.topicTitle}，完成一道两阶段任务：先推导再解释，参数取 ${a}, ${b}, ${c}。`,
      steps: [
        "步骤 1：拆分子任务，明确每阶段输出格式。",
        "步骤 2：完成第一阶段计算并记录关键依据。",
        "步骤 3：完成第二阶段解释，说明结果与条件关系。",
        "步骤 4：互检同伴答案，指出证据链缺口。",
        "步骤 5：基于反馈修订答案并提交最终版。",
      ],
    };
  }
  if (context.role === "reflection") {
    return {
      prompt: `反思任务：回顾本单元含参数 ${a}, ${b}, ${c} 的代表题，写出“最容易失分的一步 + 失分原因 + 下次避免动作”。`,
      steps: [
        "步骤 1：选出本节最容易错的一道题。",
        "步骤 2：定位错误发生在审题、列式还是计算阶段。",
        "步骤 3：写清导致该错误的具体认知偏差。",
        "步骤 4：给出可执行的修正清单（至少 2 条）。",
        "步骤 5：用 30 秒口头复述改进计划。",
      ],
    };
  }
  return {
    prompt: `应用练习：围绕 ${context.topicTitle}，求解函数 q(x)=(${a}x+${b})^${c} 的指定任务，并解释所用方法。`,
    steps: [
      "步骤 1：先确定题型与可用方法。",
      "步骤 2：列出关键公式与条件检查点。",
      "步骤 3：执行计算并保留必要中间式。",
      "步骤 4：验证结果是否满足题设边界。",
      "步骤 5：总结可迁移到同类题的一条策略。",
    ],
  };
}

function buildContextualMisconception(context: FallbackContext) {
  if (context.role === "intro") {
    return "错法：看到数字就直接计算。错因：没有先筛选关键信息，导致计算方向错误。正法：先完成“已知-未知-约束”三栏，再开始运算。";
  }
  if (context.role === "concept") {
    return `错法：只背术语，不核对定义条件。错因：把关键词匹配当成概念理解。正法：逐条对照 ${context.topicTitle} 的必要条件与边界，缺一条都不能判定成立。`;
  }
  if (context.role === "principle") {
    return "错法：推导中跳步，直接写结论。错因：忽略中间变换依据，无法定位错误来源。正法：每一步标注“依据/变形目的”，确保链路可追踪。";
  }
  if (context.role === "worked_example") {
    return "错法：照抄步骤但不检查符号和系数。错因：把演示当记忆，不做过程校验。正法：每完成一步立即做局部检查，尤其关注内层导数与符号。";
  }
  if (context.role === "assessment" || context.role === "consolidation") {
    return "错法：只给结论不给证据。错因：把测验当背答案。正法：答案必须包含“结论 + 依据 + 边界条件”三要素。";
  }
  return "错法：套模板忽略题目限制。错因：未先识别任务目标与约束。正法：先读题标记约束，再选择方法并说明理由。";
}

function buildDefinitionExplanation(context: FallbackContext) {
  const summaryHint = context.focusText;
  if (context.role === "concept" || context.role === "principle") {
    return `规范定义：说明 ${context.topicTitle} 的数学对象、适用条件与结论形式。通俗解释：把它理解成“先识别结构再执行规则”的流程。课堂锚点：${summaryHint}`;
  }
  return `定义：给出 ${context.topicTitle} 的规范表述和适用边界。通俗解释：用“先判断条件，再执行步骤”帮助学生建立直觉。课堂锚点：${summaryHint}`;
}

function buildInteractionSteps(context: FallbackContext) {
  if (context.role === "reflection") {
    return [
      "[2 分钟] 教师公布收束任务：写出本节最关键方法与一条易错预警。",
      "[3 分钟] 学生对照示例自评并交换反馈，指出证据链薄弱点。",
      "[2 分钟] 教师汇总高频问题，给出下节前可执行补救动作。",
    ];
  }
  if (context.role === "consolidation" || context.role === "assessment") {
    return [
      "[2 分钟] 教师下发综合任务并强调提交标准（结论+证据）。",
      "[3 分钟] 学生独立作答后两人互审，圈出证据缺失位置。",
      "[2 分钟] 教师基于学生提交结果进行针对性反馈并复盘方法。",
    ];
  }
  return [
    "[2 分钟] 教师明确本节任务与可观察产出，学生同步记录目标。",
    "[3 分钟] 学生分组完成任务并说明每一步理由，教师巡视追问。",
    "[2 分钟] 教师收集典型答案，点评共性问题并示范标准解法。",
  ];
}

function buildFallbackContext(params: {
  section: OutlineSection;
  topic: CedTopicMatch | null;
  courseName?: string;
  sectionIndex?: number;
  totalSections?: number;
  allSections?: OutlineSection[];
}): FallbackContext {
  const allSections = params.allSections && params.allSections.length > 0
    ? params.allSections
    : [params.section];
  const totalSections = Math.max(1, params.totalSections ?? allSections.length);
  const sectionIndex = Math.max(
    0,
    Math.min(totalSections - 1, resolveSectionIndex({
      section: params.section,
      sectionIndex: params.sectionIndex,
      allSections,
    })),
  );
  const role = resolveSectionRole({
    sectionTitle: params.section.title,
    sectionIndex,
    totalSections,
  });
  const prevTitle = sectionIndex > 0 ? allSections[sectionIndex - 1]?.title ?? "前一节" : "前置导入";
  const nextTitle =
    sectionIndex < totalSections - 1
      ? allSections[sectionIndex + 1]?.title ?? "下一节"
      : "课程收束";

  const courseName = params.courseName ?? "";
  const subjectCategory = detectSubjectCategory(courseName);

  return {
    section: params.section,
    sectionIndex,
    totalSections,
    allSections,
    role,
    courseName,
    subjectCategory,
    topicTitle: params.topic?.title ?? "目标主题",
    primaryLo: params.topic?.learningObjectives[0]?.code ?? "LO-1",
    focusText: normalizeSummary(params.section.summary),
    prevTitle,
    nextTitle,
  };
}

function shouldAttachQuiz(context: FallbackContext) {
  if (context.role === "assessment" || context.role === "consolidation" || context.role === "reflection") {
    return true;
  }
  return /quiz|检验|模拟|测验|评估/i.test(context.section.title);
}

export function createBlock(type: BlockType, sortOrder: number): LessonPlanBlock {
  if (type === "heading") {
    return {
      id: randomUUID(),
      type,
      sortOrder,
      content: { level: "h2", text: "新标题" },
      cedCodes: [],
    };
  }

  if (type === "paragraph") {
    return {
      id: randomUUID(),
      type,
      sortOrder,
      content: { text: "请输入正文内容。" },
      cedCodes: [],
    };
  }

  if (type === "math") {
    return {
      id: randomUUID(),
      type,
      sortOrder,
      content: { latex: "f(x)=x^2", displayMode: true },
      cedCodes: [],
    };
  }

  if (type === "image") {
    return {
      id: randomUUID(),
      type,
      sortOrder,
      content: { url: "", alt: "" },
      cedCodes: [],
    };
  }

  if (type === "callout") {
    return {
      id: randomUUID(),
      type,
      subtype: "think",
      sortOrder,
      content: { title: "想一想", text: "这里写引导问题。" },
      cedCodes: [],
    };
  }

  if (type === "divider") {
    return {
      id: randomUUID(),
      type,
      sortOrder,
      content: {},
      cedCodes: [],
    };
  }

  if (type === "definition") {
    return {
      id: randomUUID(),
      type,
      sortOrder,
      content: { term: "术语", explanation: "术语解释" },
      cedCodes: [],
    };
  }

  if (type === "example") {
    return {
      id: randomUUID(),
      type,
      sortOrder,
      content: {
        prompt: "例题题干",
        steps: ["步骤 1", "步骤 2"],
      },
      cedCodes: [],
    };
  }

  if (type === "steps") {
    return {
      id: randomUUID(),
      type,
      sortOrder,
      content: {
        title: "步骤流程",
        items: ["第一步", "第二步"],
      },
      cedCodes: [],
    };
  }

  if (type === "quiz") {
    return {
      id: randomUUID(),
      type,
      sortOrder,
      content: {
        question: "这里是检测题目",
        options: [
          { id: "A", text: "选项 A" },
          { id: "B", text: "选项 B" },
          { id: "C", text: "选项 C" },
          { id: "D", text: "选项 D" },
        ],
        correctOptionId: "A",
        explanation: "解析说明",
      },
      cedCodes: [],
    };
  }

  return {
    id: randomUUID(),
    type: "poll",
    sortOrder,
    content: {
      question: "你更倾向哪个答案？",
      options: [
        { id: "A", text: "A" },
        { id: "B", text: "B" },
      ],
      presetDistribution: [
        { optionId: "A", percent: 50 },
        { optionId: "B", percent: 50 },
      ],
    },
    cedCodes: [],
  };
}

export function buildFallbackSectionBlocks(params: {
  section: OutlineSection;
  topic: CedTopicMatch | null;
  courseName?: string;
  sectionIndex?: number;
  totalSections?: number;
  allSections?: OutlineSection[];
}): LessonPlanBlock[] {
  const context = buildFallbackContext(params);
  const duration = Math.max(1, params.section.durationMinutes);
  const headingText = hasTimeTag(params.section.title)
    ? params.section.title
    : `${params.section.title}（${duration} 分钟）`;

  const blocks: LessonPlanBlock[] = [
    {
      id: randomUUID(),
      type: "heading",
      sortOrder: 0,
      content: { level: "h2", text: headingText },
      cedCodes: [context.primaryLo],
    },
    {
      id: randomUUID(),
      type: "paragraph",
      sortOrder: 1,
      content: {
        text: buildContextualParagraph(context),
      },
      cedCodes: [context.primaryLo],
    },
    {
      id: randomUUID(),
      type: "definition",
      sortOrder: 2,
      content: {
        term: context.topicTitle,
        explanation: buildDefinitionExplanation(context),
      },
      cedCodes: [context.primaryLo],
    },
    {
      id: randomUUID(),
      type: "example",
      sortOrder: 3,
      content: buildContextualExample(context),
      cedCodes: [context.primaryLo],
    },
    // misconception callout 仅在核心概念/推导章节出现，不是每个 section 都需要
    ...(context.role === "concept" || context.role === "principle" || context.role === "worked_example"
      ? [{
          id: randomUUID(),
          type: "callout" as const,
          subtype: "misconception" as const,
          sortOrder: 4,
          content: {
            title: "常见错误预警",
            text: buildContextualMisconception(context),
          },
          cedCodes: [context.primaryLo],
        }]
      : []),
    {
      id: randomUUID(),
      type: "steps",
      sortOrder: 5,
      content: {
        title: "互动检验流程",
        items: buildInteractionSteps(context),
      },
      cedCodes: [context.primaryLo],
    },
  ];

  if (shouldAttachQuiz(context)) {
    blocks.push({
      id: randomUUID(),
      type: "quiz",
      sortOrder: blocks.length,
      content: {
        question: `关于 ${context.topicTitle}，下列哪项最符合本节的判定标准？`,
        options: [
          { id: "A", text: "有明确结论，并给出与定义一致的证据。", },
          { id: "B", text: "只给出术语，不说明判定依据。", },
          { id: "C", text: "结论正确但忽略边界条件。", },
          { id: "D", text: "答案完整但与题目任务无关。", },
        ],
        correctOptionId: "A",
        explanation: "正确答案 A：本节强调“结论 + 可追踪证据 + 条件核对”。其余选项都缺少关键判定要素。",
      },
      cedCodes: [context.primaryLo],
    });
  }

  return blocks;
}
