/**
 * 从 agent 输出的 JSONL 文件中提取最终分析报告，保存为 markdown 文件。
 *
 * 逻辑：
 * 1. 逐行解析 JSONL
 * 2. 找到最后一条 type === "assistant" 且 content 中包含大段文本的消息
 * 3. 拼接所有 text 类型的 content 块
 * 4. 写入对应的 .md 文件
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const TASK_DIR = '/private/tmp/claude-501/-Users-martin/2ad612fa-a95c-4aef-b22c-3b2e44e2357e/tasks'
const OUTPUT_DIR = '/Users/martin/Documents/个人项目/new-start/docs/cb-exam-patterns'

// 映射：输出文件 ID → 目标 markdown 文件名
const FILE_MAP = [
  { id: 'aaedb2386aadf1cf2', name: '06-ap-csa.md' },
  { id: 'af02e920df54b3997', name: '07-ap-csp.md' },
  { id: 'a20c6560a1a187599', name: '08-ap-physics-c.md' },
  { id: 'ae742167cc1c5069e', name: '09-ap-physics-2.md' },
  { id: 'a596dd2c6e7055050', name: '10-ap-macroeconomics.md' },
  { id: 'a6a24981ab35999f4', name: '11-ap-biology.md' },
  { id: 'a08a044c431f4b54d', name: '12-ap-precalculus.md' },
]

for (const { id, name } of FILE_MAP) {
  const inputPath = join(TASK_DIR, `${id}.output`)
  const outputPath = join(OUTPUT_DIR, name)

  try {
    const raw = readFileSync(inputPath, 'utf-8')
    const lines = raw.trim().split('\n')

    // 从后往前找最后一条 assistant 消息，其 content 中包含较长的文本分析
    let finalText = ''

    for (let i = lines.length - 1; i >= 0; i--) {
      let entry
      try {
        entry = JSON.parse(lines[i])
      } catch {
        continue
      }

      if (entry.type !== 'assistant') continue

      const content = entry.message?.content
      if (!Array.isArray(content)) continue

      // 提取所有 text 块
      const textParts = content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)

      const combined = textParts.join('\n')

      // 判断是否为最终报告（包含标题 # 或长度超过 500 字符）
      if (combined.includes('#') && combined.length > 500) {
        finalText = combined
        break
      }

      // 如果是最后一条 assistant 消息但没匹配，也取它
      if (finalText === '' && combined.length > 100) {
        finalText = combined
        break
      }
    }

    if (!finalText) {
      console.error(`[警告] ${name}: 未找到有效的分析报告`)
      continue
    }

    // 清理文本：去掉开头的非报告内容（如 "我已经阅读了..." 等过渡句）
    // 找到第一个 markdown 标题行作为起始
    const headerMatch = finalText.match(/^(#{1,3}\s+.+)/m)
    if (headerMatch) {
      const headerIndex = finalText.indexOf(headerMatch[0])
      finalText = finalText.substring(headerIndex)
    }

    // 确保文件以换行结尾
    if (!finalText.endsWith('\n')) {
      finalText += '\n'
    }

    writeFileSync(outputPath, finalText, 'utf-8')
    console.log(`[成功] ${name} (${finalText.length} 字符)`)
  } catch (err) {
    console.error(`[错误] ${name}: ${err.message}`)
  }
}

console.log('\n提取完成。')
