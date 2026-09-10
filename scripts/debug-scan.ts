/**
 * 本地调试脚本：直接跑 runScanPipeline，输出拆题结果
 * 用法: node --env-file=.env.local --import tsx scripts/debug-scan.ts <pdf-path>
 */
import { readFileSync } from "node:fs"
import { basename } from "node:path"
import { runScanPipeline } from "../lib/pdf-scan/pipeline"

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error("用法: node --env-file=.env.local --import tsx scripts/debug-scan.ts <pdf-path>")
    process.exit(1)
  }

  const fileBuffer = readFileSync(filePath)
  const fileName = basename(filePath)

  console.log(`\n=== 开始拆题: ${fileName} (${(fileBuffer.byteLength / 1024).toFixed(0)} KB) ===\n`)

  const result = await runScanPipeline({
    fileBuffer,
    fileName,
    useVision: true,
    allowMathpixUpload: false,
  })

  console.log(`提取模式: ${result.extractionMode}`)
  console.log(`文件类型: ${result.fileType}`)
  console.log(`内容分析: ${result.analysis.contentKind} (置信度 ${result.analysis.confidence})`)
  console.log(`耗时: 提取 ${result.timings.extractMs}ms, 解析 ${result.timings.parseMs}ms, 总计 ${result.timings.totalMs}ms`)
  console.log(`题目数量: ${result.questions.length}\n`)

  for (const q of result.questions) {
    console.log(`--- 题 ${q.questionNumber} ---`)
    console.log(`  类型: ${q.questionType}`)
    console.log(`  置信度: ${q.confidence}`)
    console.log(`  题干: ${q.content.slice(0, 200)}${q.content.length > 200 ? "..." : ""}`)
    if (q.options) {
      console.log(`  选项:`)
      for (const [label, text] of Object.entries(q.options)) {
        console.log(`    ${label}: ${(text ?? "").slice(0, 100)}`)
      }
    }
    if (q.linkedFigures && q.linkedFigures.length > 0) {
      console.log(`  关联图片 (${q.linkedFigures.length}):`)
      for (const fig of q.linkedFigures) {
        console.log(`    - ${fig.slice(0, 120)}`)
      }
    }
    if (q.subQuestions && q.subQuestions.length > 0) {
      console.log(`  子题 (${q.subQuestions.length}):`)
      for (const sub of q.subQuestions) {
        console.log(`    ${sub.label}: ${sub.content.slice(0, 100)}`)
      }
    }
    console.log()
  }
}

main().catch((err) => {
  console.error("拆题失败:", err)
  process.exit(1)
})
