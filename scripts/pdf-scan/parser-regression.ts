import { parseQuestionsFromText } from "../../lib/pdf-scan/question-parser"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function runImageOptionCase() {
  const content = `
1. Which option matches the chart shown in Figure 1?
Figure 1 shows four symbols.
(A)
![optA](https://example.com/a.png)
(B)
![optB](https://example.com/b.png)
(C) Triangle with dot
(D) Square with dot
`
  const questions = parseQuestionsFromText(content)
  assert(questions.length === 1, "图片选项用例应识别为 1 道题")
  assert(questions[0].questionType === "choice", "图片选项用例应识别为选择题")
  assert(questions[0].options != null, "图片选项用例应识别出选项")
  assert(Object.keys(questions[0].options ?? {}).length >= 3, "图片选项应至少提取 3 个选项")
  assert((questions[0].linkedFigures ?? []).length >= 1, "图片选项应关联图表引用")
}

function runFrqCase() {
  const content = `
1. Free Response Question:
(a) Explain how photosynthesis converts light energy into chemical energy.
(b) Compare this process with cellular respiration and justify your answer.
`
  const questions = parseQuestionsFromText(content)
  assert(questions.length === 1, "FRQ 用例应识别为 1 道题")
  assert(questions[0].questionType === "essay", "FRQ 用例应识别为 essay")
  assert((questions[0].subQuestions ?? []).length >= 2, "FRQ 用例应提取子问题 a/b")
}

function runProofAndCalcCase() {
  const content = `
1. Prove that the sequence converges to zero.
2. Calculate the value of \\int_0^1 x^2 dx.
`
  const questions = parseQuestionsFromText(content)
  assert(questions.length === 2, "证明/计算用例应识别为 2 道题")
  assert(questions[0].questionType === "proof", "第一题应识别为 proof")
  assert(questions[1].questionType === "calculation", "第二题应识别为 calculation")
}

function runMergedSplitCase() {
  const content = `
1. What is 1+1?
(A) 1
(B) 2
(C) 3
(D) 4
2. What is 2+2?
(A) 2
(B) 3
(C) 4
(D) 5
`
  const questions = parseQuestionsFromText(content)
  assert(questions.length === 2, "合并题干用例应识别为 2 道题")
}

function runChoiceStemDedupCase() {
  const content = `
1. Which statement best explains why ATP is considered the cell's energy currency?
A. It stores energy in phosphate bonds for rapid transfer.
B. It permanently stores genetic information.
C. It forms the main structure of the cell membrane.
D. It directly replicates DNA during mitosis.
`
  const questions = parseQuestionsFromText(content)
  assert(questions.length === 1, "题干去重用例应识别为 1 道题")
  assert(questions[0].options != null, "题干去重用例应识别出选项")
  assert(!questions[0].originalContent.includes("A. It stores energy"), "题干不应重复包含 A 选项文本")
  assert(!questions[0].originalContent.includes("B. It permanently stores"), "题干不应重复包含 B 选项文本")
}

function runInlineChoiceStemDedupCase() {
  const content = `
1. Which graph best represents the relationship between temperature and enzyme activity? (A) Graph 1 (B) Graph 2 (C) Graph 3 (D) Graph 4
`
  const questions = parseQuestionsFromText(content)
  assert(questions.length === 1, "行内选项用例应识别为 1 道题")
  assert(questions[0].options != null, "行内选项用例应识别出选项")
  assert(!questions[0].originalContent.includes("(A) Graph 1"), "题干不应重复包含行内选项")
}

function main() {
  runImageOptionCase()
  runFrqCase()
  runProofAndCalcCase()
  runMergedSplitCase()
  runChoiceStemDedupCase()
  runInlineChoiceStemDedupCase()
  process.stdout.write("parser regression: PASS\n")
}

main()
