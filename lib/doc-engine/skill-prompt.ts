const BASE_RULES = `直接输出 HTML，以 <article data-doc-type="TYPE"> 开头。不输出 markdown、解释文字或代码块。

## 结构
- 整个文档: <article data-doc-type="TYPE">
- 逻辑块: <section data-section="唯一kebab-case名">（用于 AI 定位编辑）

## 允许的标签（只能用这些，其他会被过滤）
结构: article, section, div, header, footer
标题: h1(仅一次), h2, h3, h4
文本: p, span, strong, em, u, sub, sup, br
列表: ol, ul, li
表格: table, thead, tbody, tr, th, td
其他: blockquote, hr, img, figure, figcaption

## 教育专用 data 属性
- 题目: <div data-question="题号" data-points="分值">
- 选项: <ol data-options type="A">
- 答题框: <div data-answer-space="small|medium|large">（small=单词, medium=2-3句, large=段落/计算）
- 评分表: <table data-rubric>

## 风格
纯黑白学术。不用 style/class/id/script 属性。题号加粗+分值: <strong>1.</strong> (2 pts)

## 质量锚点
- AP 题目对标 College Board CED 大纲
- MC 干扰项基于常见学生错误（如混淆 movement along vs shift of curve），每个干扰项对应一种典型误解
- Rubric 每格写具体可观察行为:
  ✓ 好: "Correctly identifies all four determinants of demand and provides real-world examples for each"
  ✗ 差: "Shows good understanding of demand determinants"
- 教案写具体教师行为+学生活动，不写"讲解概念""复习知识"

## 自由度
section 数、表格行列、题型、评分等级数、排版细节均自由决定。`;

const TYPE_RULES: Record<string, string> = {
  worksheet: `## Worksheet 规则

结构: header section(h1标题 + Name/Date/Period + 总分时间) → 按Part分section(h2标注小计) → instructions
题目: <div data-question="N" data-points="X"> → MC用<ol data-options type="A"> → FR后跟<div data-answer-space> → 填空用________
质量: 题目按难度递增，每题只测一个知识点，MC干扰项对应具体学生错误

示例结构:
<section data-section="header">
  <h1>AP Microeconomics Unit 3 Test</h1>
  <p>Name: ________________ Date: ________ Period: ____</p>
  <p>Total: 50 pts | Time: 45 min</p>
</section>
<section data-section="part-a-mcq">
  <h2>Part A: Multiple Choice (20 pts)</h2>
  <div data-question="1" data-points="2">
    <p><strong>1.</strong> (2 pts) Which of the following...</p>
    <ol data-options type="A"><li>...</li><li>...</li></ol>
  </div>
</section>`,

  rubric: `## Rubric 规则

结构: 一张完整<table data-rubric>。表头: Criteria | Weight | 等级名(分值)...
每行一个评分维度，每格2-3个具体可观察行为，等级间在 accuracy+complexity 递进。
AP课程引用 CED skill 编号。默认4等级，用户指定时可调。

✓ 好的等级描述: "Correctly applies supply-demand model, identifies both surplus and shortage, and calculates deadweight loss with labeled graph"
✗ 差的等级描述: "Shows good understanding of market equilibrium"

示例结构:
<table data-rubric>
  <thead><tr><th>Criteria</th><th>Weight</th><th>Excellent (4)</th><th>Good (3)</th><th>Developing (2)</th><th>Beginning (1)</th></tr></thead>
  <tbody><tr><td>Economic Analysis</td><td>30%</td><td>Applies multiple models correctly with real-world examples...</td><td>...</td><td>...</td><td>...</td></tr></tbody>
</table>`,

  "lesson-plan": `## Lesson Plan 规则

结构: 每个教学阶段一个section，h2含阶段名+时间(如"Warm-Up (5 min)")
每阶段包含: 目标、教师具体行为、学生具体活动、所需材料
用列表或表格组织均可

示例:
<section data-section="warm-up">
  <h2>Warm-Up (5 min)</h2>
  <p><strong>Objective:</strong> Activate prior knowledge on supply curves</p>
  <p><strong>Teacher:</strong> Display graph with unlabeled axes, ask students to identify...</p>
  <p><strong>Students:</strong> Pair-discuss for 2 minutes, then share predictions...</p>
</section>`,

  exercises: `## Exercises 规则

题型自由: 选择/填空/简答/匹配/判断/排序/论述
每题用 data-question + data-points
填空: ________ | 匹配: 两列表格 | 判断: (T/F) 标记
按难度递增排列`,

  exam: `## Exam 规则

比 worksheet 更正式。顶部: 考试名称、课程、时间限制、总分、注意事项
按 Part 组织，每 Part 标注小计分数`,
};

export function getDocumentSkillPrompt(type: string): string {
  const typeRule = TYPE_RULES[type] ?? "";
  return [BASE_RULES, typeRule].filter(Boolean).join("\n\n");
}

export function getDocumentSkillSystemMessage(type: string, userRequest: string): string {
  return [
    getDocumentSkillPrompt(type),
    "\n## 用户需求\n",
    userRequest,
    "\n请直接输出完整的 HTML 文档（以 <article> 开头），不要输出其他解释文字。",
  ].join("\n");
}

export const SUPPORTED_DOC_TYPES = Object.keys(TYPE_RULES);
