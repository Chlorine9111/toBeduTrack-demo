import fs from "node:fs/promises"
import path from "node:path"
import { runScanPipeline } from "../../lib/pdf-scan/pipeline"
import { renderPdfPages } from "../../lib/pdf-scan/pdf-render"
import type { ScannedQuestion } from "../../lib/pdf-scan/types"

interface RoundCase {
  round: number
  source: string
  paperType: string
  filePath: string
  expectedQuestions?: number
  useVision?: boolean
  allowMathpixUpload?: boolean
}

interface RoundScore {
  切割准确性: number
  内容完整性: number
  格式保真度: number
  题号识别: number
  边界情况处理: number
}

interface RoundResult {
  round: number
  source: string
  paperType: string
  filePath: string
  totalQuestions: number
  totalMs: number
  avgMsPerQuestion: number
  extractionMode: string
  score: RoundScore
  scoreAverage: number
  questions: Array<{
    questionNumber: number
    questionText: string
    options: Record<string, string | undefined> | null
    subQuestions: Array<{ label: string; content: string }>
    linkedFigures: string[]
    knowledgeTags: string[]
  }>
}

const COMPETITION_DIR = "/Users/martin/Documents/竞赛题目"

const ROUND_CASES: RoundCase[] = [
  {
    round: 1,
    source: "2025 USNCO Local Exam",
    paperType: "公式/符号密集卷（USNCO）",
    filePath: path.join(COMPETITION_DIR, "2025-usnco-local-exam.pdf"),
    expectedQuestions: 60,
    useVision: true,
    allowMathpixUpload: true,
  },
  {
    round: 2,
    source: "PB Exam 25-2",
    paperType: "竞赛证明/主观卷（PB）",
    filePath: path.join(COMPETITION_DIR, "PB-Exam-25-2.pdf"),
    expectedQuestions: 50,
    useVision: true,
    allowMathpixUpload: true,
  },
  {
    round: 3,
    source: "NSO Sample Paper Class 1",
    paperType: "图表/综合卷（Science Olympiad）",
    filePath: path.join(COMPETITION_DIR, "nso_sample_paper_class-1_2025-26.pdf"),
    expectedQuestions: 9,
    useVision: true,
    allowMathpixUpload: true,
  },
]

const WORD_SMOKE_FILE = "/Users/martin/Library/Mobile Documents/com~apple~CloudDocs/Punctuation_SAT_Practice.docx"

const FRQ_CASES = [
  path.join(COMPETITION_DIR, "PB-Exam-25-2.pdf"),
  path.join(COMPETITION_DIR, "PB-Exam-Draft-I-Final-version-2024.pdf"),
]

function clampScore(value: number): number {
  return Math.max(0, Math.min(10, Number(value.toFixed(2))))
}

function hasMojibake(text: string): boolean {
  return /�/.test(text)
}

function countUnbalancedDollar(text: string): number {
  const count = (text.match(/\$/g) ?? []).length
  return count % 2
}

function hasSharedStemCue(text: string): boolean {
  return /Questions?\s+\d+\s*(?:-|–|to|through)\s*\d+/i.test(text)
}

function scoreRound(params: {
  questions: ScannedQuestion[]
  expectedQuestions?: number
}): RoundScore {
  const questions = params.questions
  if (questions.length === 0) {
    return {
      切割准确性: 0,
      内容完整性: 0,
      格式保真度: 0,
      题号识别: 0,
      边界情况处理: 0,
    }
  }

  const lengths = questions.map((q) => q.content.trim().length)
  const shortRatio = lengths.filter((len) => len < 40).length / questions.length
  const hugeRatio = lengths.filter((len) => len > 2500).length / questions.length
  const expectedGap = params.expectedQuestions
    ? Math.abs(questions.length - params.expectedQuestions) / params.expectedQuestions
    : 0
  const cutScore = clampScore(10 - shortRatio * 3 - hugeRatio * 2 - expectedGap * 6)

  const missingStemRatio = questions.filter((q) => q.content.trim().length < 20).length / questions.length
  const choiceQuestions = questions.filter((q) => q.questionType === "choice")
  const badOptionRatio = choiceQuestions.length
    ? choiceQuestions.filter((q) => Object.keys(q.options ?? {}).length < 3).length / choiceQuestions.length
    : 0
  const brokenCharRatio = questions.filter((q) => hasMojibake(q.content)).length / questions.length
  const completenessScore = clampScore(10 - missingStemRatio * 5 - badOptionRatio * 3 - brokenCharRatio * 2)

  const formulaIssueRatio =
    questions.filter((q) => countUnbalancedDollar(q.content) > 0 || hasMojibake(q.content)).length / questions.length
  const formatScore = clampScore(10 - formulaIssueRatio * 5)

  let numberingBreaks = 0
  for (let i = 0; i < questions.length; i += 1) {
    if (questions[i].questionNumber !== i + 1) numberingBreaks += 1
  }
  const subCuePattern = /(?:^|\n)\s*\(([a-z]|[ivx]+)\)\s+/
  const subCueCount = questions.filter((q) => subCuePattern.test(q.content)).length
  const subCapturedCount = questions.filter((q) => (q.subQuestions?.length ?? 0) > 0).length
  const subMissRatio =
    subCueCount > 0 ? Math.max(0, (subCueCount - subCapturedCount) / subCueCount) : 0
  const numberScore = clampScore(10 - (numberingBreaks / questions.length) * 6 - subMissRatio * 4)

  const hasSharedStem = questions.some((q) => hasSharedStemCue(q.content))
  const figureCueCount = questions.filter((q) => /\b(?:Figure|Fig\.?|图|表)\s*\d+/i.test(q.content)).length
  const figureLinkedCount = questions.filter((q) => (q.linkedFigures?.length ?? 0) > 0).length
  const figureMissRatio = figureCueCount > 0 ? Math.max(0, (figureCueCount - figureLinkedCount) / figureCueCount) : 0
  const edgeScore = clampScore(10 - (hasSharedStem ? 0 : 0) - figureMissRatio * 2)

  return {
    切割准确性: cutScore,
    内容完整性: completenessScore,
    格式保真度: formatScore,
    题号识别: numberScore,
    边界情况处理: edgeScore,
  }
}

function averageScore(score: RoundScore): number {
  const values = Object.values(score)
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
}

function toQuestionView(questions: ScannedQuestion[]) {
  return questions.map((q) => ({
    questionNumber: q.questionNumber,
    questionText: q.content,
    options: q.options,
    subQuestions: q.subQuestions ?? [],
    linkedFigures: q.linkedFigures ?? [],
    knowledgeTags: [q.subject, q.knowledgePoint].filter(Boolean),
  }))
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

async function createImageSmokeCase(outputDir: string): Promise<string | null> {
  try {
    const nsoPdf = await fs.readFile(path.join(COMPETITION_DIR, "nso_sample_paper_class-1_2025-26.pdf"))
    const pages = await renderPdfPages(nsoPdf, 2)
    if (pages.length === 0) return null
    const imagePath = path.join(outputDir, "amc-first-page.png")
    await fs.writeFile(imagePath, pages[0].buffer)
    return imagePath
  } catch {
    return null
  }
}

async function runRound(roundCase: RoundCase): Promise<RoundResult> {
  const fileBuffer = await fs.readFile(roundCase.filePath)
  const startedAt = Date.now()
  const pipeline = await runScanPipeline({
    fileBuffer,
    fileName: path.basename(roundCase.filePath),
    useVision: roundCase.useVision,
    allowMathpixUpload: roundCase.allowMathpixUpload,
      uploadId: `bench-${roundCase.round}`,
      teacherId: "benchmark",
      forceProvider: "mistral",
    })

  const totalMs = Date.now() - startedAt
  const score = scoreRound({
    questions: pipeline.questions,
    expectedQuestions: roundCase.expectedQuestions,
  })

  return {
    round: roundCase.round,
    source: roundCase.source,
    paperType: roundCase.paperType,
    filePath: roundCase.filePath,
    totalQuestions: pipeline.questions.length,
    totalMs,
    avgMsPerQuestion: pipeline.questions.length > 0 ? Number((totalMs / pipeline.questions.length).toFixed(2)) : 0,
    extractionMode: pipeline.extractionMode,
    score,
    scoreAverage: averageScore(score),
    questions: toQuestionView(pipeline.questions),
  }
}

function formatRoundSummary(result: RoundResult): string {
  return [
    `### 第 ${result.round} 轮`,
    `- 试卷来源与类型: ${result.source} / ${result.paperType}`,
    `- 总题数: ${result.totalQuestions}`,
    `- 五维评分:`,
    `  - 切割准确性: ${result.score.切割准确性}`,
    `  - 内容完整性: ${result.score.内容完整性}`,
    `  - 格式保真度: ${result.score.格式保真度}`,
    `  - 题号识别: ${result.score.题号识别}`,
    `  - 边界情况处理: ${result.score.边界情况处理}`,
    `  - 平均分: ${result.scoreAverage}`,
    `- 耗时: 总计 ${result.totalMs}ms，平均每题 ${result.avgMsPerQuestion}ms`,
    `- 提取模式: ${result.extractionMode}`,
  ].join("\n")
}

async function runWordAndImageSmoke(outputDir: string) {
  const smoke: Record<string, unknown> = {}

  try {
    const wordBuffer = await fs.readFile(WORD_SMOKE_FILE)
    const wordResult = await runScanPipeline({
      fileBuffer: wordBuffer,
      fileName: path.basename(WORD_SMOKE_FILE),
      allowMathpixUpload: false,
      useVision: false,
    })
    smoke.word = {
      file: WORD_SMOKE_FILE,
      questionCount: wordResult.questions.length,
      extractionMode: wordResult.extractionMode,
      timings: wordResult.timings,
    }
  } catch (error) {
    smoke.word = {
      file: WORD_SMOKE_FILE,
      error: error instanceof Error ? error.message : "word smoke failed",
    }
  }

  const imagePath = await createImageSmokeCase(outputDir)
  if (imagePath) {
    try {
      const imageBuffer = await fs.readFile(imagePath)
      const imageResult = await runScanPipeline({
        fileBuffer: imageBuffer,
        fileName: path.basename(imagePath),
        allowMathpixUpload: false,
        useVision: false,
        forceProvider: "mistral",
      })
      smoke.image = {
        file: imagePath,
        questionCount: imageResult.questions.length,
        extractionMode: imageResult.extractionMode,
        timings: imageResult.timings,
      }
    } catch (error) {
      smoke.image = {
        file: imagePath,
        error: error instanceof Error ? error.message : "image smoke failed",
      }
    }
  }

  await fs.writeFile(
    path.join(outputDir, "format-smoke.json"),
    JSON.stringify(smoke, null, 2),
    "utf8",
  )
}

async function runFrqStabilityChecks(outputDir: string) {
  const rows: Array<{
    file: string
    total: number
    extractionMode: string
    byType: Record<string, number>
    withSubQuestions: number
    withLinkedFigures: number
    avgMsPerQuestion: number
  }> = []

  for (const filePath of FRQ_CASES) {
    const fileBuffer = await fs.readFile(filePath)
    const startedAt = Date.now()
    const result = await runScanPipeline({
      fileBuffer,
      fileName: path.basename(filePath),
      useVision: true,
      allowMathpixUpload: true,
      forceProvider: "mistral",
    })
    const elapsed = Date.now() - startedAt

    const byType: Record<string, number> = {}
    let withSubQuestions = 0
    let withLinkedFigures = 0
    for (const question of result.questions) {
      byType[question.questionType] = (byType[question.questionType] ?? 0) + 1
      if ((question.subQuestions?.length ?? 0) > 0) withSubQuestions += 1
      if ((question.linkedFigures?.length ?? 0) > 0) withLinkedFigures += 1
    }

    rows.push({
      file: filePath,
      total: result.questions.length,
      extractionMode: result.extractionMode,
      byType,
      withSubQuestions,
      withLinkedFigures,
      avgMsPerQuestion:
        result.questions.length > 0 ? Number((elapsed / result.questions.length).toFixed(2)) : 0,
    })
  }

  await fs.writeFile(
    path.join(outputDir, "frq-stability.json"),
    JSON.stringify(rows, null, 2),
    "utf8",
  )

  return rows
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)
  const outputDir = path.join(process.cwd(), "document", "scan-iterations", timestamp)
  await ensureDir(outputDir)

  const roundResults: RoundResult[] = []
  for (const roundCase of ROUND_CASES) {
    const result = await runRound(roundCase)
    roundResults.push(result)
    await fs.writeFile(
      path.join(outputDir, `round-${roundCase.round}-questions.json`),
      JSON.stringify(result.questions, null, 2),
      "utf8",
    )
    await fs.writeFile(
      path.join(outputDir, `round-${roundCase.round}-summary.json`),
      JSON.stringify(result, null, 2),
      "utf8",
    )
  }

  await runWordAndImageSmoke(outputDir)
  const frqRows = await runFrqStabilityChecks(outputDir)

  const summaries = roundResults.map(formatRoundSummary).join("\n\n")
  const qualified = roundResults.every((r) => r.scoreAverage >= 9.5)
  const report = [
    "# 竞赛试卷解析迭代报告",
    "",
    `- 生成时间: ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
    `- 轮次数量: ${roundResults.length}`,
    `- 连续达标（>=9.5）: ${qualified ? "是" : "否"}`,
    "",
    summaries,
    "",
    "## 轮次结论",
    ...roundResults.map((r) => `- 第 ${r.round} 轮平均分 ${r.scoreAverage}，总耗时 ${r.totalMs}ms`),
    "",
    "## FRQ 稳定性补充",
    ...frqRows.map(
      (row) =>
        `- ${path.basename(row.file)}: 总题数 ${row.total}，题型分布 ${JSON.stringify(row.byType)}，子问题 ${row.withSubQuestions}，图表关联 ${row.withLinkedFigures}，平均每题 ${row.avgMsPerQuestion}ms`,
    ),
    "",
    `- 产物目录: ${outputDir}`,
    "- 备注: Word/图片入口能力见 format-smoke.json；FRQ 稳定性见 frq-stability.json",
  ].join("\n")

  await fs.writeFile(path.join(outputDir, "report.md"), report, "utf8")

  process.stdout.write(`${outputDir}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
