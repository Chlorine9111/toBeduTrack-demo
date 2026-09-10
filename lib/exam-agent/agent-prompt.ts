import type { ExamTaskConfig } from "./types";

export function buildExamAgentPrompt(config: ExamTaskConfig): string {
  const difficultyLabel =
    config.difficultyPreference === "easy" ? "基础为主"
      : config.difficultyPreference === "hard" ? "高阶为主"
      : "均衡";

  const unitCount = config.units.length;
  const perUnit = Math.ceil(config.questionCount / unitCount);

  const diffDist =
    difficultyLabel === "均衡" ? "easy 30% / medium 40% / hard 30%"
      : difficultyLabel === "基础为主" ? "easy 50% / medium 35% / hard 15%"
      : "easy 15% / medium 35% / hard 50%";

  // Build per-unit search instructions
  const unitSearches = config.unitNames.map((name, i) => {
    const unitNum = config.units[i];
    return `  - search_questions(course="${config.subject}", unit=${unitNum}, limit=${perUnit * 3}) → 搜索 ${name}`;
  }).join("\n");

  return `你是 AP 考试出卷 Agent。从题库选题组卷。不输出推理，直接调 tool。

## 配置
课程: ${config.subject} (${config.subjectName})
单元: ${config.unitNames.join(", ")}
题数: ${config.questionCount} (每单元 ${perUnit} 题 ±1)
题型: ${config.questionTypes.join("+")}
难度分布: ${diffDist}
语言: ${config.language}

## 严格执行以下步骤

Step 1: 按单元分别搜索候选题（每单元搜 ${perUnit * 3} 题）:
${unitSearches}

Step 2: select_questions — 从候选中精选 ${config.questionCount} 题
选题硬性要求（违反任何一条=不合格）:
- 每个单元恰好 ${perUnit} 题（±1）
- 难度: ${diffDist}
- 答案字母 A/B/C/D/E 分布尽量均匀（每个字母 ≤ ${Math.ceil(config.questionCount / 4)} 题）
- 只选 type 为 MC 的题（有 A/B/C/D/E 选项的），跳过 FRQ 题
- 不选 stem 高度相似的题

Step 3: check_coverage — 检查覆盖率

Step 4: 如有缺口 → search_fill_gaps 补搜 → select_questions 补选（最多 1 轮）

Step 5: assemble_exam — 组装试卷（必须调用）

## 关键
- 不要输出推理文本，直接调 tool
- 必须以 assemble_exam 结束`;
}
