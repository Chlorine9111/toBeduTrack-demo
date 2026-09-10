/**
 * 模型质量对比测试
 *
 * 测试 Qwen 3.6 Plus / Gemma 4 31B / Kimi K2.5 在同一组系统提示词下的生成质量。
 * 覆盖 6 种核心生成场景：MCQ、FRQ、教案、Worksheet、Exit Ticket、Rubric。
 *
 * 用法：
 *   OPENROUTER_API_KEY=sk-or-... bun scripts/agent/model-quality-benchmark.ts
 *
 * 输出：/tmp/model-benchmark-{timestamp}.json
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { writeFileSync, mkdirSync } from "node:fs";

// ─── 模型配置 ───────────────────────────────────────────────────────────

const MODELS = [
  { id: "qwen/qwen3.6-plus:free", label: "Qwen 3.6 Plus" },
  { id: "google/gemma-4-31b-it", label: "Gemma 4 31B" },
  { id: "moonshotai/kimi-k2.5", label: "Kimi K2.5" },
] as const;

// ─── 测试用例定义 ─────────────────────────────────────────────────────

type TestCase = {
  name: string;
  category: string;
  system: string;
  prompt: string;
  maxTokens: number;
  temperature: number;
  evaluationCriteria: string[];
};

const TEST_CASES: TestCase[] = [
  // ── 1. MCQ 习题生成 ──
  {
    name: "MCQ 习题生成 (AP Calculus AB)",
    category: "exercise_mcq",
    system: `你是 AP 课程资深命题老师。
你需要严格按蓝图生成高质量题目，并返回结构化结果。
不要输出题外解释。`,
    prompt: `目标题数：3
题型：MC（选择题）
认知层级：应用
难度层级：中等应用（建议难度值 2）
主题：AP Calculus AB - 极限与连续性
学习目标：学生能够使用极限定义判断函数在某点的连续性，并计算分段函数的极限。
真实情境：需要
语言：中文出题

输出要求：
1) 必须返回准确 3 道 exercises，使用 JSON 格式。
2) MC 题必须恰好 4 个选项，correctAnswer 为 A-D 之一。
3) solutionSteps 必须可执行，写出关键推导过程，80-140 字。
4) commonMistakes 提供 2 条高频错误点，每条 ≤18 字。

输出格式：
{ "exercises": [{ "questionText": "...", "type": "MC", "difficulty": "medium", "options": {"A":"...","B":"...","C":"...","D":"..."}, "correctAnswer": "B", "solutionSteps": "...", "commonMistakes": ["...", "..."] }] }`,
    maxTokens: 4000,
    temperature: 0.2,
    evaluationCriteria: [
      "JSON 格式是否有效",
      "题目数量是否准确 (3 道)",
      "每题是否有 4 个选项 (A/B/C/D)",
      "答案是否正确且有推导过程",
      "难度是否符合 AP Calculus 水平",
      "commonMistakes 是否有教学价值",
      "题干是否包含真实情境",
    ],
  },

  // ── 2. FRQ 习题生成 ──
  {
    name: "FRQ 习题生成 (AP Physics 1)",
    category: "exercise_frq",
    system: `你是 AP 课程资深命题老师。
你需要严格按蓝图生成高质量题目，并返回结构化结果。
不要输出题外解释。`,
    prompt: `目标题数：2
题型：FR（自由回答题）
认知层级：分析
难度层级：高阶推理（建议难度值 3）
主题：AP Physics 1 - 牛顿运动定律
学习目标：学生能够用自由体图分析多力作用下的物体运动，并用牛顿第二定律求解加速度。
真实情境：需要
语言：中文出题

输出要求：
1) 必须返回准确 2 道 exercises，使用 JSON 格式。
2) FR 题不需要选项，answer 字段写完整答案。
3) solutionSteps 必须可执行，包含公式推导和计算过程。
4) commonMistakes 提供 2-3 条高频错误点。

输出格式：
{ "exercises": [{ "questionText": "...", "type": "FR", "difficulty": "hard", "answer": "...", "solutionSteps": "...", "commonMistakes": ["...", "..."] }] }`,
    maxTokens: 4000,
    temperature: 0.2,
    evaluationCriteria: [
      "JSON 格式是否有效",
      "题目数量是否准确 (2 道)",
      "题目是否需要自由体图分析",
      "答案是否包含完整计算过程",
      "物理公式使用是否正确",
      "真实情境设计是否自然",
      "commonMistakes 是否体现物理学常见误解",
    ],
  },

  // ── 3. 教案生成 ──
  {
    name: "教案生成 (AP Biology Unit 2)",
    category: "lesson_plan",
    system: `你是资深 AP 教学设计专家。
目标：输出可直接上课的完整教案，但结构、环节、流程和命名都由你根据任务自主决定，不要机械套固定模板。
你决定的结构可以是流程、任务、环节、活动、案例、讲解段、练习段、讨论段、反思段，或任何更适合该课题的组织方式。
如果教师明确点名要某些环节或流程，优先满足；若未明确，就由你自行设计最自然、最可执行的课堂结构。

要求：
- 内容必须可执行、时间真实、互动自然
- 总字数控制在 1000-1400 汉字
- 避免 Markdown 表格，优先使用标题、短段落和项目符号
- 禁止保留内部标签（【教案设计摘要】【知识库】等）
- 输出格式：Markdown`,
    prompt: `请为以下课程生成教案：

课程：AP Biology
单元：Unit 2 - Cell Structure and Function
主题：细胞膜的结构与功能（流动镶嵌模型）
课时长度：45 分钟
学生水平：AP Biology 11年级学生，已完成 Unit 1（生物化学基础）

教师需求：
- 希望学生理解磷脂双分子层的结构
- 需要讲清被动运输和主动运输的区别
- 最好包含一个动手活动或小组讨论
- 课末有快速检查学生理解的环节`,
    maxTokens: 8000,
    temperature: 0.2,
    evaluationCriteria: [
      "是否为完整可执行教案",
      "时间分配是否合理（总计 45 分钟）",
      "是否覆盖磷脂双分子层 + 运输类型",
      "是否包含动手活动或小组讨论",
      "是否有课末检测环节",
      "内容深度是否达到 AP 水平",
      "字数是否在 1000-1400 字范围",
      "Markdown 格式是否规范",
    ],
  },

  // ── 4. Worksheet 生成 ──
  {
    name: "Worksheet 生成 (AP Chemistry)",
    category: "worksheet",
    system: `你是经验丰富的教学设计师，擅长将知识点编排成结构清晰、适合课堂使用的 Worksheet。

设计原则：
1. 形态适配：选择最适合当前需求的 worksheet 形态（guided notes / activity sheet / reading sheet / vocabulary sheet / study guide / student handout）。
2. 学科适配：结构应匹配学科特点——理科侧重公式推导与数据记录，文科侧重文本分析与论证，语言类侧重语境与运用。
3. 可用性：学生拿到就能用，指令清晰、布局可打印、留有书写空间。
4. 认知递进：从低阶认知自然过渡到高阶认知，而非机械罗列。
5. 克制出题：可包含 1-3 个 quick check，但不能退化成刷题卷。

当前判断的 worksheet 类型为「guided notes」，参考结构：
- 标题和学习目标
- 分段笔记区（关键概念留空让学生填写）
- 示例和练习
- 总结区域

格式要求：
- 第 1 行必须是一级标题（# 标题）
- 输出 Markdown 格式，可直接渲染
- 面向学生语气，清晰易读
- 不要输出代码块围栏`,
    prompt: `请生成一份 Guided Notes Worksheet：

课程：AP Chemistry
主题：化学平衡和 Le Chatelier 原理
学习目标：
1. 学生能写出平衡常数表达式（Kc 和 Kp）
2. 学生能用 Le Chatelier 原理预测平衡移动方向
3. 学生能解释浓度、温度、压力变化对平衡的影响

要求：
- 适合 45 分钟课堂使用
- 包含 2-3 个需要学生填写的关键概念留空
- 包含 1 个示例计算
- 最后有 2 个 quick check 题目`,
    maxTokens: 8000,
    temperature: 0.5,
    evaluationCriteria: [
      "第一行是否为 # 标题",
      "是否包含学习目标",
      "是否有留空填写区域",
      "Kc/Kp 表达式是否正确",
      "Le Chatelier 原理解释是否准确",
      "是否有示例计算",
      "是否有 2 个 quick check",
      "排版是否适合打印",
      "学生语气是否友好",
    ],
  },

  // ── 5. Exit Ticket 生成 ──
  {
    name: "Exit Ticket 生成 (AP US History)",
    category: "exit_ticket",
    system: `你是资深课堂教学设计师，负责为老师生成高质量 exit ticket。
exit ticket 是下课前 5 分钟完成的快速课堂检测，不是完整 worksheet，也不是正式考试。

输出要求：
1. 输出 Markdown，第一行必须是一级标题（# 标题）。
2. 一共只出 3-5 道题，默认 4 题。
3. 题目必须短、小、精准，紧贴当天学习目标和资料内容。
4. 可以混合题型，但优先可在 5 分钟内完成。
5. 不要输出答案，不要输出代码块围栏。
6. 适合直接给学生使用，可打印、可投屏。`,
    prompt: `请生成 Exit Ticket：

课程：AP US History
主题：美国内战的原因（1850-1861）
今天课堂讲了以下内容：
- 1850 年妥协案（Compromise of 1850）
- 堪萨斯-内布拉斯加法案（Kansas-Nebraska Act）
- 德雷德·斯科特案（Dred Scott v. Sandford）
- 林肯-道格拉斯辩论
- 约翰·布朗袭击哈珀斯渡口

学习目标：学生能分析导致内战的多重因素，并评估哪些事件对联邦分裂的贡献最大。`,
    maxTokens: 3000,
    temperature: 0.5,
    evaluationCriteria: [
      "第一行是否为 # 标题",
      "题目数量是否为 3-5 道",
      "是否可在 5 分钟内完成",
      "是否覆盖当天课堂内容",
      "是否不包含答案",
      "是否包含高阶思维题（分析/评估）",
      "题目是否紧扣学习目标",
      "是否适合投屏/打印",
    ],
  },

  // ── 6. Rubric 生成 ──
  {
    name: "Rubric 生成 (AP English Language)",
    category: "rubric",
    system: `你是教学评估专家，擅长设计清晰、可操作的评分标准（Rubric）。

设计原则：
1. 维度清晰：每个评分维度聚焦一个核心能力
2. 层级区分：不同分数层级之间有明确、可观察的行为差异
3. 语言精准：避免模糊词汇（如"较好""一般"），使用具体描述
4. 可操作性：教师拿到就能直接评分，不需要额外解释
5. 与课程标准对齐：反映 AP 考试评分标准的核心要求

输出格式：
- Markdown 格式
- 使用表格展示评分维度和等级
- 包含标题、评分总分、各维度描述`,
    prompt: `请生成一份 Rubric：

课程：AP English Language and Composition
任务：Rhetorical Analysis Essay（修辞分析文章）
满分：6 分

要求：
- 评分维度参考 AP English Language 的官方评分标准
- 包含 3 个核心维度：Thesis（论点）、Evidence and Commentary（证据与评论）、Sophistication（复杂性）
- 每个维度 0-6 分等级，描述不同分数对应的表现
- 包含一段使用说明，解释如何使用这个 rubric
- 中文输出`,
    maxTokens: 6000,
    temperature: 0.3,
    evaluationCriteria: [
      "是否包含 3 个指定维度",
      "每个维度是否有 0-6 分等级",
      "分数层级之间是否有明确区分",
      "是否符合 AP English Language 标准",
      "语言是否精准（非模糊词汇）",
      "是否包含使用说明",
      "表格格式是否清晰",
      "是否可直接用于教学评分",
    ],
  },
];

// ─── 评估函数 ─────────────────────────────────────────────────────────

type TestResult = {
  model: string;
  modelId: string;
  testCase: string;
  category: string;
  success: boolean;
  output: string;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
  qualityChecks: Record<string, boolean | string>;
};

function evaluateOutput(testCase: TestCase, output: string): Record<string, boolean | string> {
  const checks: Record<string, boolean | string> = {};
  const lower = output.toLowerCase();

  switch (testCase.category) {
    case "exercise_mcq": {
      // JSON 解析检查
      let parsed: { exercises?: unknown[] } | null = null;
      try {
        const jsonMatch = output.match(/\{[\s\S]*"exercises"[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      } catch {
        // 尝试从 markdown code block 中提取
        try {
          const codeBlock = output.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (codeBlock) {
            parsed = JSON.parse(codeBlock[1]);
          }
        } catch { /* ignore */ }
      }
      checks["JSON 可解析"] = parsed !== null;
      checks["题目数量 = 3"] = Array.isArray(parsed?.exercises) && parsed.exercises.length === 3;
      if (Array.isArray(parsed?.exercises)) {
        const allHave4Options = parsed.exercises.every((ex: Record<string, unknown>) => {
          const opts = ex.options as Record<string, string> | undefined;
          return opts && Object.keys(opts).length === 4;
        });
        checks["每题 4 选项"] = allHave4Options;
        const allHaveAnswer = parsed.exercises.every((ex: Record<string, unknown>) =>
          ["A", "B", "C", "D"].includes(String(ex.correctAnswer ?? ex.answer ?? ""))
        );
        checks["答案为 A-D"] = allHaveAnswer;
        const allHaveSolution = parsed.exercises.every((ex: Record<string, unknown>) =>
          String(ex.solutionSteps ?? ex.solution ?? "").length > 20
        );
        checks["解析 > 20 字"] = allHaveSolution;
        const allHaveMistakes = parsed.exercises.every((ex: Record<string, unknown>) =>
          Array.isArray(ex.commonMistakes) && (ex.commonMistakes as string[]).length >= 2
        );
        checks["常见错误 ≥ 2"] = allHaveMistakes;
      }
      checks["提及极限/连续"] = lower.includes("极限") || lower.includes("limit") || lower.includes("连续") || lower.includes("continuous");
      break;
    }

    case "exercise_frq": {
      let parsed: { exercises?: unknown[] } | null = null;
      try {
        const jsonMatch = output.match(/\{[\s\S]*"exercises"[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {
        try {
          const codeBlock = output.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (codeBlock) parsed = JSON.parse(codeBlock[1]);
        } catch { /* ignore */ }
      }
      checks["JSON 可解析"] = parsed !== null;
      checks["题目数量 = 2"] = Array.isArray(parsed?.exercises) && parsed.exercises.length === 2;
      if (Array.isArray(parsed?.exercises)) {
        const allHaveAnswer = parsed.exercises.every((ex: Record<string, unknown>) =>
          String(ex.answer ?? ex.solutionSteps ?? ex.solution ?? "").length > 30
        );
        checks["答案含推导"] = allHaveAnswer;
      }
      checks["提及牛顿/力"] = lower.includes("牛顿") || lower.includes("newton") || lower.includes("力") || lower.includes("force");
      checks["包含公式"] = output.includes("F=ma") || output.includes("F = ma") || output.includes("a=") || output.includes("加速度");
      break;
    }

    case "lesson_plan": {
      checks["Markdown 格式"] = output.includes("##") || output.includes("# ");
      checks["时间分配"] = /\d+\s*分钟/.test(output) || /\d+\s*min/.test(output);
      const charCount = output.replace(/\s/g, "").length;
      checks[`字数 ${charCount}`] = charCount >= 600 && charCount <= 2500;
      checks["提及磷脂"] = lower.includes("磷脂") || lower.includes("phospholipid");
      checks["提及运输"] = lower.includes("运输") || lower.includes("transport");
      checks["包含活动/讨论"] = lower.includes("活动") || lower.includes("讨论") || lower.includes("小组") || lower.includes("activity") || lower.includes("discuss");
      checks["包含检测环节"] = lower.includes("检测") || lower.includes("检查") || lower.includes("exit") || lower.includes("quiz") || lower.includes("check");
      const sectionCount = (output.match(/^##\s/gm) || []).length;
      checks[`章节数 ${sectionCount}`] = sectionCount >= 3;
      break;
    }

    case "worksheet": {
      checks["以 # 标题开头"] = /^#\s/.test(output.trim());
      checks["包含学习目标"] = lower.includes("学习目标") || lower.includes("objective") || lower.includes("目标");
      checks["包含留空区域"] = output.includes("____") || output.includes("___") || output.includes("填写") || output.includes("blank") || output.includes("fill in");
      checks["提及 Kc/Kp"] = output.includes("Kc") || output.includes("Kp") || output.includes("K_c") || output.includes("K_p");
      checks["提及 Le Chatelier"] = lower.includes("le chatelier") || lower.includes("勒夏特列");
      checks["包含示例计算"] = lower.includes("示例") || lower.includes("example") || lower.includes("计算") || lower.includes("calculate");
      checks["包含 quick check"] = lower.includes("quick check") || lower.includes("检测") || lower.includes("练习");
      checks["Markdown 格式"] = output.includes("##") || output.includes("- ");
      break;
    }

    case "exit_ticket": {
      checks["以 # 标题开头"] = /^#\s/.test(output.trim());
      const questionCount = (output.match(/^\d+[\.\)]/gm) || []).length ||
        (output.match(/^#{1,3}\s.*题|^#{1,3}\s.*Question/gmi) || []).length ||
        (output.match(/\n\d+[\.\)]/g) || []).length;
      checks[`题目数量 ${questionCount}`] = questionCount >= 3 && questionCount <= 5;
      checks["不包含答案"] = !lower.includes("答案：") && !lower.includes("answer:") && !lower.includes("正确答案");
      checks["提及 1850/内战"] = output.includes("1850") || lower.includes("内战") || lower.includes("civil war");
      checks["提及具体事件"] = lower.includes("kansas") || lower.includes("堪萨斯") || lower.includes("dred scott") || lower.includes("lincoln") || lower.includes("林肯");
      checks["适合 5 分钟"] = output.length < 3000;
      break;
    }

    case "rubric": {
      checks["包含 Thesis 维度"] = lower.includes("thesis") || lower.includes("论点");
      checks["包含 Evidence 维度"] = lower.includes("evidence") || lower.includes("证据");
      checks["包含 Sophistication"] = lower.includes("sophistication") || lower.includes("复杂");
      checks["包含表格"] = output.includes("|") && output.includes("---");
      checks["包含分数等级"] = output.includes("0") && (output.includes("6") || output.includes("5"));
      checks["包含使用说明"] = lower.includes("使用说明") || lower.includes("how to use") || lower.includes("说明") || lower.includes("instructions");
      checks["Markdown 格式"] = output.includes("##") || output.includes("# ");
      break;
    }
  }

  return checks;
}

// ─── 主运行逻辑 ───────────────────────────────────────────────────────

async function runSingleTest(
  openrouter: ReturnType<typeof createOpenRouter>,
  modelDef: (typeof MODELS)[number],
  testCase: TestCase,
): Promise<TestResult> {
  const startedAt = Date.now();
  console.log(`  [${modelDef.label}] ${testCase.name} ...`);

  try {
    const result = await generateText({
      model: openrouter(modelDef.id),
      system: testCase.system,
      prompt: testCase.prompt,
      maxTokens: testCase.maxTokens,
      temperature: testCase.temperature,
      maxRetries: 1,
      timeout: 120_000,
    });

    const durationMs = Date.now() - startedAt;
    const output = result.text ?? "";
    const qualityChecks = evaluateOutput(testCase, output);

    const usage = result.usage as { promptTokens?: number; completionTokens?: number } | undefined;
    console.log(
      `  [${modelDef.label}] ${testCase.name} -> ${durationMs}ms, ` +
      `${usage?.promptTokens ?? "?"}/${usage?.completionTokens ?? "?"} tokens, ` +
      `${Object.values(qualityChecks).filter((v) => v === true).length}/${Object.keys(qualityChecks).length} checks passed`
    );

    return {
      model: modelDef.label,
      modelId: modelDef.id,
      testCase: testCase.name,
      category: testCase.category,
      success: true,
      output,
      durationMs,
      inputTokens: usage?.promptTokens ?? null,
      outputTokens: usage?.completionTokens ?? null,
      error: null,
      qualityChecks,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  [${modelDef.label}] ${testCase.name} FAILED: ${errorMsg}`);

    return {
      model: modelDef.label,
      modelId: modelDef.id,
      testCase: testCase.name,
      category: testCase.category,
      success: false,
      output: "",
      durationMs,
      inputTokens: null,
      outputTokens: null,
      error: errorMsg,
      qualityChecks: {},
    };
  }
}

function printSummaryTable(results: TestResult[]) {
  console.log("\n" + "=".repeat(100));
  console.log("模型质量对比汇总表");
  console.log("=".repeat(100));

  // 按测试用例分组
  const categories = [...new Set(TEST_CASES.map((tc) => tc.category))];

  for (const category of categories) {
    const tc = TEST_CASES.find((t) => t.category === category)!;
    console.log(`\n── ${tc.name} ──`);
    console.log(
      "模型".padEnd(18) +
      "状态".padEnd(8) +
      "耗时".padEnd(10) +
      "输入T".padEnd(8) +
      "输出T".padEnd(8) +
      "通过率".padEnd(12) +
      "关键检查"
    );
    console.log("-".repeat(100));

    for (const model of MODELS) {
      const result = results.find(
        (r) => r.modelId === model.id && r.category === category,
      );
      if (!result) continue;

      const totalChecks = Object.keys(result.qualityChecks).length;
      const passedChecks = Object.values(result.qualityChecks).filter((v) => v === true).length;
      const passRate = totalChecks > 0 ? `${passedChecks}/${totalChecks}` : "N/A";
      const failedChecks = Object.entries(result.qualityChecks)
        .filter(([, v]) => v !== true)
        .map(([k]) => k)
        .slice(0, 3)
        .join(", ");

      console.log(
        model.label.padEnd(18) +
        (result.success ? "OK" : "FAIL").padEnd(8) +
        `${result.durationMs}ms`.padEnd(10) +
        `${result.inputTokens ?? "-"}`.padEnd(8) +
        `${result.outputTokens ?? "-"}`.padEnd(8) +
        passRate.padEnd(12) +
        (failedChecks || "全部通过")
      );
    }
  }

  // 总分汇总
  console.log("\n" + "=".repeat(100));
  console.log("总分汇总");
  console.log("=".repeat(100));
  console.log(
    "模型".padEnd(18) +
    "成功率".padEnd(10) +
    "总通过".padEnd(10) +
    "总检查".padEnd(10) +
    "通过率".padEnd(10) +
    "平均耗时".padEnd(12) +
    "平均输出T"
  );
  console.log("-".repeat(80));

  for (const model of MODELS) {
    const modelResults = results.filter((r) => r.modelId === model.id);
    const successCount = modelResults.filter((r) => r.success).length;
    const totalPassed = modelResults.reduce(
      (sum, r) => sum + Object.values(r.qualityChecks).filter((v) => v === true).length,
      0,
    );
    const totalChecks = modelResults.reduce(
      (sum, r) => sum + Object.keys(r.qualityChecks).length,
      0,
    );
    const avgDuration = Math.round(
      modelResults.reduce((sum, r) => sum + r.durationMs, 0) / modelResults.length,
    );
    const outputTokenResults = modelResults.filter((r) => r.outputTokens != null);
    const avgOutput = outputTokenResults.length > 0
      ? Math.round(
          outputTokenResults.reduce((sum, r) => sum + (r.outputTokens ?? 0), 0) / outputTokenResults.length,
        )
      : "-";

    console.log(
      model.label.padEnd(18) +
      `${successCount}/${modelResults.length}`.padEnd(10) +
      `${totalPassed}`.padEnd(10) +
      `${totalChecks}`.padEnd(10) +
      `${totalChecks > 0 ? Math.round((totalPassed / totalChecks) * 100) : 0}%`.padEnd(10) +
      `${avgDuration}ms`.padEnd(12) +
      `${avgOutput}`
    );
  }
}

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY 未配置。请设置环境变量后重试。");
    process.exit(1);
  }

  const openrouter = createOpenRouter({
    apiKey,
    headers: { "X-Title": "Deskmate Model Benchmark" },
  });

  console.log("=".repeat(60));
  console.log("Deskmate 模型质量对比测试");
  console.log("=".repeat(60));
  console.log(`模型：${MODELS.map((m) => m.label).join(" / ")}`);
  console.log(`测试用例：${TEST_CASES.length} 个`);
  console.log(`总计：${MODELS.length * TEST_CASES.length} 次调用`);
  console.log("=".repeat(60));

  const results: TestResult[] = [];

  // 按测试用例遍历，每个用例内并行调用 3 个模型
  for (const testCase of TEST_CASES) {
    console.log(`\n── ${testCase.name} ──`);
    const modelResults = await Promise.allSettled(
      MODELS.map((model) => runSingleTest(openrouter, model, testCase)),
    );
    for (const result of modelResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      }
    }
  }

  // 输出汇总表
  printSummaryTable(results);

  // 保存完整结果到文件
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outputPath = `/tmp/model-benchmark-${timestamp}.json`;
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        models: MODELS,
        testCases: TEST_CASES.map(({ name, category }) => ({ name, category })),
        results: results.map(({ output, ...rest }) => ({
          ...rest,
          outputPreview: output.slice(0, 500),
          outputLength: output.length,
        })),
        fullOutputs: results.map(({ model, category, output }) => ({
          model,
          category,
          output,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`\n完整结果已保存到: ${outputPath}`);

  // 保存详细输出以便人工审阅
  const detailDir = `/tmp/model-benchmark-${timestamp}`;
  mkdirSync(detailDir, { recursive: true });
  for (const result of results) {
    const filename = `${result.model.replace(/\s/g, "_")}_${result.category}.md`;
    writeFileSync(
      `${detailDir}/${filename}`,
      `# ${result.model} - ${result.testCase}\n\n` +
      `- 状态: ${result.success ? "成功" : "失败"}\n` +
      `- 耗时: ${result.durationMs}ms\n` +
      `- 输入 Tokens: ${result.inputTokens ?? "N/A"}\n` +
      `- 输出 Tokens: ${result.outputTokens ?? "N/A"}\n` +
      `- 质量检查: ${JSON.stringify(result.qualityChecks, null, 2)}\n\n` +
      `---\n\n${result.output}`,
    );
  }
  console.log(`详细输出已保存到: ${detailDir}/`);
}

main().catch((error) => {
  console.error("测试执行失败:", error);
  process.exit(1);
});
