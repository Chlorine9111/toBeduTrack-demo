// 题目解析器 v2 - 改进版
// 支持置信度评分、复合题识别、智能分割

import type {
  MathpixResponse,
  QuestionType,
  DifficultyLevel,
  QuestionOptions,
} from "./types"

// ============================================
// 类型定义
// ============================================

export interface ParsedQuestion {
  questionNumber: number
  originalContent: string
  questionType: QuestionType
  options: QuestionOptions | null
  difficulty: DifficultyLevel
  subject: string
  knowledgePoint: string
  // v2 新增字段
  confidence: number           // 置信度 0-100
  isSubQuestion: boolean       // 是否为子题
  parentNumber?: number        // 父题号（子题专用）
  rawQuestionNumber: string    // 原始题号字符串
  subQuestions?: Array<{ label: string; content: string }>
  linkedFigures?: string[]
}

const QUESTION_CUE_PATTERN = /(求|计算|证明|判断|下列|选择|已知|若|设|解|简述|说明|是否|which|what|find|determine|prove|calculate|compute|evaluate|explain|describe|justify|\?|？)/i

// 题号候选位置
interface QuestionBoundary {
  position: number             // 在全文中的位置
  lineStart: number            // 所在行的起始位置
  questionNumber: number       // 解析出的题号
  rawMatch: string             // 原始匹配字符串
  patternType: 'major' | 'minor' | 'sub' // 大题号 / 普通题号 / 子题号
  isAtLineStart: boolean       // 是否在行首
  isInsideOptions: boolean     // 是否在选项区域内
}

// ============================================
// 中文数字映射
// ============================================

const CHINESE_NUMBERS: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
  '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
  '十六': 16, '十七': 17, '十八': 18, '十九': 19, '二十': 20,
  '二十一': 21, '二十二': 22, '二十三': 23, '二十四': 24, '二十五': 25,
}

// 带圈数字映射
const CIRCLED_NUMBERS: Record<string, number> = {
  '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5,
  '⑥': 6, '⑦': 7, '⑧': 8, '⑨': 9, '⑩': 10,
  '⑪': 11, '⑫': 12, '⑬': 13, '⑭': 14, '⑮': 15,
  '⑯': 16, '⑰': 17, '⑱': 18, '⑲': 19, '⑳': 20,
}

// ============================================
// 题号正则模式（按类型分类）
// ============================================

// 大题号模式（通常表示题目分组，如"一、选择题"）
const MAJOR_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /^([一二三四五六七八九十]+)、\s*/, name: 'chinese_section' },
  { pattern: /^第([一二三四五六七八九十]+)(?:大)?题[.、：:\s]*/, name: 'di_chinese' },
]

// 普通题号模式
const NORMAL_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /^(\d+)\.\s+/, name: 'arabic_dot' },           // 1. 2. 3.（后跟空格）
  { pattern: /^(\d+)、\s*/, name: 'arabic_dun' },           // 1、2、3、
  { pattern: /^(\d+)\)\s+/, name: 'arabic_right_paren' },   // 1) 2) 3)
  { pattern: /^第(\d+)题[.、：:\s]*/, name: 'di_arabic' },  // 第1题
  { pattern: /^[Qq]uestion\s+(\d+)[.:：]?\s*/, name: 'question' },
  { pattern: /^Q(\d+)[.：:]?\s*/i, name: 'q_short' },
]

// 子题号模式（通常在大题下面）
const SUB_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /^\((\d+)\)\s*/, name: 'paren' },              // (1) (2) (3)
  { pattern: /^(\d+)\)\s*/, name: 'right_paren' },          // 1) 2) 3)
  { pattern: /^\(([a-z]|[ivx]+)\)\s*/, name: 'alpha_roman_paren' },
  { pattern: /^([a-z]|[ivx]+)[.)]\s*/, name: 'alpha_roman_plain' },
  { pattern: /^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])\s*/, name: 'circled' },
]

// 选项模式（用于检测是否在选项区域内）
const OPTION_LINE_PATTERN = /^(?:\([A-Ea-e]\)|[A-Ea-e][.、．:：)\]])\s*/

const TRAILING_NOISE_PATTERNS = [
  /\n{2,}\\section\*\{ANSWER KEY\}[\s\S]*$/i,
  /\n{2,}\\section\*\{(?:DIVISION[^}]*|STOP HERE|Continue|ACHIEVERS SECTION|SCIENCE)\}[\s\S]*$/i,
  /\n{2,}DIVISION\s+\d+[\s\S]*$/i,
  /\n{2,}Your last answer should[\s\S]*$/i,
  /\n{2,}Answer questions\s*#?\d+[\s\S]*$/i,
  /\n{2,}Treat\s+\$?g[\s\S]*$/i,
]

const LATEX_METADATA_BLOCK_PATTERNS = [
  /\\title\{[\s\S]*?\}/gi,
  /\\author\{[\s\S]*?\}/gi,
  /\\subtitle\{[\s\S]*?\}/gi,
  /\\section\*?\{[\s\S]*?\}/gi,
  /\\subsection\*?\{[\s\S]*?\}/gi,
  /\\subsubsection\*?\{[\s\S]*?\}/gi,
  /^\s*\\maketitle\s*$/gim,
]

const OCR_METADATA_LINE_PATTERNS = [
  /^\s*END OF PART\s+[A-Z]\s*$/i,
  /^\s*PART\s+[A-Z]\s*$/i,
  /^\s*[A-Z][A-Z\s,.\-]{4,}SECTION\s+[IVXLC]+(?:,\s*Part\s+[A-Z])?\s*$/i,
  /^\s*Time\s*[-–—:]?\s*\d[\w\s.-]*$/i,
  /^\s*\d+\s+Questions?\s*$/i,
  /^\s*NO CALCULATOR IS (?:ALLOWED|PERMITTED|REQUIRED)[^.]*\.?\s*$/i,
  /^\s*(?:A GRAPHING )?CALCULATOR IS (?:ALLOWED|PERMITTED|REQUIRED)[^.]*\.?\s*$/i,
]

const MARKDOWN_HEADING_PREFIX_PATTERN = /^\s{0,3}#{1,6}\s+/
const GENERIC_SECTION_TITLE_PATTERN = /^(?:multiple choice|free response|short answer|essay|calculation|fill in(?: the blank)?|question set|questions?|选择题|填空题|解答题|问答题|计算题|证明题|简答题|论述题)\s*$/i
const FIGURE_OPTION_PATTERN = /\\begin\{figure\}[\s\S]*?\\caption\{\(([A-Ea-e])\)\}[\s\S]*?\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}[\s\S]*?\\end\{figure\}/g
const OPTION_BLOCK_START_PATTERN = /(?:^|\n)\s*(?:\([A-Ea-e]\)|[A-Ea-e][.、．:：)\]])\s*/m
const INLINE_OPTION_BLOCK_START_PATTERN = /\s(?:\([A-Ea-e]\)|[A-Ea-e][.、．:：)\]])\s+(?=\S)/g
const OPTION_LEAD_IN_PATTERN = /(?:^|\n)?\s*(?:options?|choices?|answer choices?|选项|备选项|请选择|选择正确答案|choose the correct answer|select the correct answer)\s*[:：-]?\s*$/i
const SHORT_FRAGMENT_LINE_PATTERN = /^[\p{L}\p{N}\p{M}+\-−=<>≤≥°%μΩΔ().,/_^{}\\[\]]+$/u
const OPTION_MARKER_ONLY_PATTERN = /^\(?[A-Ea-e]\)?[.)、．:：]?$/u
const QUESTION_NUMBER_ONLY_PATTERN = /^\d+[.)、．:：]?$/u

// ============================================
// 主函数：解析题目
// ============================================

/**
 * 从 Mathpix 识别结果中解析题目
 */
export function parseQuestions(mathpixResult: MathpixResponse): ParsedQuestion[] {
  if (mathpixResult.status !== 'completed') {
    return []
  }

  if (!mathpixResult.pages || mathpixResult.pages.length === 0) {
    return []
  }

  // 合并所有页面内容
  const fullContent = mathpixResult.pages
    .map(page => page.content)
    .join('\n')

  return parseQuestionsFromText(fullContent)
}

export function parseQuestionsFromText(rawContent: string): ParsedQuestion[] {
  const fullContent = normalizeParsedText(rawContent)
  if (!fullContent) return []

  // 使用改进的解析算法
  let questions = parseWithImprovedAlgorithm(fullContent)

  // 兜底：如果没有识别到任何题目，尝试按段落分割
  if (questions.length === 0) {
    questions = parseByParagraphs(fullContent)
  }

  // 过滤掉非题目内容并重新编号
  const filtered = questions.filter((q) => !isLikelyNonQuestionContent(q.originalContent))
  const refined = refineQuestionBoundaries(filtered)
  return renumberQuestions(refined)
}

export function validateLlmOutput(questions: Array<{
  questionNumber: number
  content: string
  questionType: QuestionType
  options: QuestionOptions | null
}>): string[] {
  const issues: string[] = []

  for (let index = 0; index < questions.length; index += 1) {
    if (questions[index].questionNumber !== index + 1) {
      issues.push(`题号不连续: 第${index + 1}题实际编号为${questions[index].questionNumber}`)
    }
  }

  const choiceQuestions = questions.filter((question) => question.questionType === "choice")
  for (const question of choiceQuestions) {
    const optionCount = Object.keys(question.options ?? {}).length
    if (optionCount < 2) {
      issues.push(`题${question.questionNumber}: 选择题只有${optionCount}个选项`)
    }
  }

  for (const question of questions) {
    if (question.content.trim().length < 10) {
      issues.push(`题${question.questionNumber}: 题干过短(${question.content.trim().length}字)`)
    }
  }

  for (const question of choiceQuestions) {
    const optionA = question.options?.A?.trim()
    if (optionA && question.content.includes(optionA)) {
      issues.push(`题${question.questionNumber}: 题干中包含选项A文本`)
    }
  }

  return issues
}

function renumberQuestions(questions: ParsedQuestion[]): ParsedQuestion[] {
  return questions.map((q, index) => ({
    ...q,
    questionNumber: index + 1,
  }))
}

function normalizeParsedText(content: string): string {
  if (!content) return ''
  const normalized = sanitizeOcrQuestionText(content)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00a0\u2003]/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return trimLeadingInstructions(normalized)
}

function stripLatexMetadataBlocks(content: string): string {
  return LATEX_METADATA_BLOCK_PATTERNS.reduce(
    (result, pattern) => result.replace(pattern, '\n'),
    content,
  )
}

function shouldDropOcrMetadataLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  return OCR_METADATA_LINE_PATTERNS.some((pattern) => pattern.test(trimmed))
}

function isSuspiciousShortFragmentLine(line: string): boolean {
  const compact = line.trim().replace(/\s+/g, '')
  if (!compact) return false
  if (compact.length > 8) return false
  if (OPTION_MARKER_ONLY_PATTERN.test(compact)) return false
  if (QUESTION_NUMBER_ONLY_PATTERN.test(compact)) return false
  return SHORT_FRAGMENT_LINE_PATTERN.test(compact)
}

function shouldInlineMergeContinuationLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (OPTION_MARKER_ONLY_PATTERN.test(trimmed)) return false
  if (QUESTION_NUMBER_ONLY_PATTERN.test(trimmed)) return false
  if (/^(?:\\begin\{tabular\}|\\end\{tabular\}|\\hline\b)/.test(trimmed)) return false
  return true
}

function collapseSuspiciousFragmentRuns(lines: string[]): string[] {
  const merged: string[] = []

  for (let index = 0; index < lines.length; ) {
    const current = lines[index]
    if (!isSuspiciousShortFragmentLine(current)) {
      merged.push(current)
      index += 1
      continue
    }

    const fragments: string[] = []
    let cursor = index
    while (cursor < lines.length && isSuspiciousShortFragmentLine(lines[cursor])) {
      fragments.push(lines[cursor].trim().replace(/\s+/g, ''))
      cursor += 1
    }

    if (fragments.length < 2) {
      merged.push(current)
      index += 1
      continue
    }

    const compact = fragments.join('')
    if (!compact) {
      index = cursor
      continue
    }

    const prevIndex = merged.length - 1
    const previous = prevIndex >= 0 ? merged[prevIndex] : ''
    if (previous && previous.trim() && !/[|&]$/.test(previous.trim())) {
      let nextValue = `${previous.replace(/[ \t]+$/g, '')} ${compact}`.replace(/\s{2,}/g, ' ')
      if (shouldInlineMergeContinuationLine(lines[cursor] ?? '')) {
        nextValue = `${nextValue} ${lines[cursor].trim()}`.replace(/\s{2,}/g, ' ')
        cursor += 1
      }
      merged[prevIndex] = nextValue
    } else {
      merged.push(compact)
    }

    index = cursor
  }

  return merged
}

export function sanitizeOcrQuestionText(content: string): string {
  if (!content) return ''

  const normalized = stripLatexMetadataBlocks(content)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00a0\u2003]/g, ' ')
    .replace(/\t/g, ' ')

  const cleanedLines = normalized
    .split('\n')
    .map((line) => line.replace(MARKDOWN_HEADING_PREFIX_PATTERN, '').replace(/[ \t]+$/g, ''))
    .filter((line) => !shouldDropOcrMetadataLine(line))

  return collapseSuspiciousFragmentRuns(cleanedLines)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function trimLeadingInstructions(content: string): string {
  const lines = content.split('\n')
  const q1Pattern = /^\s*(?:question\s+)?1[.)、．:：]\s+/i
  const optionPattern = /(?:^|\n)\s*(?:\([A-Ea-e]\)|[A-Ea-e][.)、．:：])\s+\S/g

  for (let i = 0; i < lines.length; i += 1) {
    if (!q1Pattern.test(lines[i])) continue
    const windowText = lines.slice(i, Math.min(lines.length, i + 20)).join('\n')
    const optionHits = (windowText.match(optionPattern) || []).length
    if (optionHits >= 2 || QUESTION_CUE_PATTERN.test(windowText)) {
      if (i > 0) {
        return lines.slice(i).join('\n').trim()
      }
      break
    }
  }

  return content
}

function stripTrailingNoise(content: string): string {
  let result = content.trimEnd()
  let changed = true

  while (changed) {
    changed = false
    for (const pattern of TRAILING_NOISE_PATTERNS) {
      const match = pattern.exec(result)
      pattern.lastIndex = 0
      if (match?.index != null) {
        result = result.slice(0, match.index).trimEnd()
        changed = true
        break
      }
    }
  }

  return result
}

function isLikelyNonQuestionContent(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed) return true

  const optionPattern = /(?:^|\n)\s*(?:\([A-Ea-e]\)|[A-Ea-e][.、．:：)\]])\s+[^\n]+/
  if (optionPattern.test(trimmed)) return false

  const headerKeywords = [
    '试题', '考试', '期末', '期中', '课程', '学号', '姓名', '班级', '成绩',
    '注意事项', '答题', '时间', '日期', '总分', '院系', '学院', '专业',
    '考试时间', '闭卷', '开卷', '课程号',
    'competition', 'answer sheet', 'before beginning', 'scoring', 'manager',
    'minutes', 'demographic information', 'reserves the right', 'integrity of the results',
  ]
  const keywordCount = headerKeywords.reduce((count, keyword) => (trimmed.includes(keyword) ? count + 1 : count), 0)
  const dateTimeRegex = /(\d{4}\s*年|\d{1,2}\s*月|\d{1,2}\s*日|\d{1,2}\s*[:：]\s*\d{2})/
  const filePathRegex = /(\/Users\/|[A-Za-z]:\\)/i
  const titleRegex = /\\title\{[^}]+\}/i

  if (titleRegex.test(trimmed)) return true
  if (keywordCount >= 2 && trimmed.length < 260 && !QUESTION_CUE_PATTERN.test(trimmed)) return true
  if (dateTimeRegex.test(trimmed) && keywordCount >= 1) return true
  if (filePathRegex.test(trimmed) && trimmed.length < 200) return true
  if (/^(scoring|instructions?)[:：]/i.test(trimmed)) return true
  if (!QUESTION_CUE_PATTERN.test(trimmed) && trimmed.length < 40) return true

  return false
}

/**
 * 改进的解析算法 - 两阶段分割
 */
function parseWithImprovedAlgorithm(fullContent: string): ParsedQuestion[] {
  // 第一阶段：找出所有可能的题号位置
  const boundaries = findAllBoundaries(fullContent)

  // 如果没有找到任何题号
  if (boundaries.length === 0) {
    return []
  }

  // 第二阶段：过滤和验证
  const validBoundaries = filterAndValidateBoundaries(boundaries, fullContent)

  // 第三阶段：根据边界分割内容
  return splitByBoundaries(validBoundaries, fullContent)
}

/**
 * 找出所有可能的题号位置
 */
function findAllBoundaries(fullContent: string): QuestionBoundary[] {
  const boundaries: QuestionBoundary[] = []
  const lines = fullContent.split('\n')
  let currentPosition = 0

  for (const line of lines) {
    const lineStart = currentPosition
    const trimmedLine = line.trimStart()
    const leadingSpaces = line.length - trimmedLine.length

    // 检查是否是选项行
    const isOptionLine = OPTION_LINE_PATTERN.test(trimmedLine)

    // 尝试匹配各种题号模式
    for (const { pattern } of MAJOR_PATTERNS) {
      const match = trimmedLine.match(pattern)
      if (match) {
        const rawNum = match[1]
        const num = CHINESE_NUMBERS[rawNum] ?? parseInt(rawNum, 10)
        if (!isNaN(num)) {
          boundaries.push({
            position: lineStart + leadingSpaces,
            lineStart,
            questionNumber: num,
            rawMatch: match[0],
            patternType: 'major',
            isAtLineStart: leadingSpaces < 4, // 允许小量缩进
            isInsideOptions: false,
          })
        }
        break // 一行只匹配一个题号
      }
    }

    // 如果是选项行，跳过普通和子题号匹配
    if (!isOptionLine) {
      for (const { pattern } of NORMAL_PATTERNS) {
        const match = trimmedLine.match(pattern)
        if (match) {
          const num = parseInt(match[1], 10)
          if (!isNaN(num)) {
            boundaries.push({
              position: lineStart + leadingSpaces,
              lineStart,
              questionNumber: num,
              rawMatch: match[0],
              patternType: 'minor',
              isAtLineStart: leadingSpaces < 4,
              isInsideOptions: false,
            })
          }
          break
        }
      }

      for (const { pattern } of SUB_PATTERNS) {
        const match = trimmedLine.match(pattern)
        if (match) {
          const rawNum = match[1]
          const num = CIRCLED_NUMBERS[rawNum] ?? parseInt(rawNum, 10)
          if (!isNaN(num)) {
            boundaries.push({
              position: lineStart + leadingSpaces,
              lineStart,
              questionNumber: num,
              rawMatch: match[0],
              patternType: 'sub',
              isAtLineStart: leadingSpaces < 4,
              isInsideOptions: false,
            })
          }
          break
        }
      }
    }

    currentPosition += line.length + 1 // +1 for newline
  }

  return boundaries
}

/**
 * 过滤和验证题号边界
 */
function filterAndValidateBoundaries(
  boundaries: QuestionBoundary[],
  fullContent: string
): QuestionBoundary[] {
  if (boundaries.length === 0) return []

  // 标记在选项区域内的边界
  markInsideOptions(boundaries, fullContent)

  const sectionMarkers = boundaries
    .filter((b) => b.patternType === 'major' && b.isAtLineStart && !b.isInsideOptions)
    .filter((b) => {
      const content = getContentAfterBoundary(b, fullContent, 24)
      return isSectionTitle(content)
    })
    .sort((a, b) => a.position - b.position)

  // 过滤掉在选项区域内的边界
  let filtered = boundaries.filter(b => !b.isInsideOptions)

  // 如果过滤后为空，保留原始边界
  if (filtered.length === 0) {
    filtered = boundaries
  }

  // 只保留在行首的边界
  const atLineStart = filtered.filter(b => b.isAtLineStart)
  if (atLineStart.length > 0) {
    filtered = atLineStart
  }

  // 决定使用哪种题号类型
  // 优先级：major > minor > sub
  const hasMajor = filtered.some(b => b.patternType === 'major')
  const hasMinor = filtered.some(b => b.patternType === 'minor')

  // 如果有大题号，检查是否是"选择题"/"填空题"等分组标题
  if (hasMajor) {
    const majorBoundaries = filtered.filter(b => b.patternType === 'major')
    const isSectionHeader = majorBoundaries.every(b => {
      const content = getContentAfterBoundary(b, fullContent, 20)
      return isSectionTitle(content)
    })

    // 如果大题号都是分组标题，使用 minor 或 sub 作为实际题号
    if (isSectionHeader && (hasMinor || filtered.some(b => b.patternType === 'sub'))) {
      filtered = filtered.filter(b => b.patternType !== 'major')
    }
  }

  // 验证题号序列
  const validated = validateSequence(filtered)

  return collapseSubBoundaries(validated, fullContent, sectionMarkers)
}

/**
 * 标记在选项区域内的边界
 */
function markInsideOptions(boundaries: QuestionBoundary[], fullContent: string): void {
  // 找出所有选项区域的范围
  const optionRegions: Array<{ start: number; end: number }> = []

  // 选项区域的识别：连续的 A. B. C. D. 行
  const optionBlockPattern = /(?:^|\n)((?:\([A-E]\)|[A-E])[.、．:：)\]]?\s*[^\n]*(?:\n(?:\([A-E]\)|[A-E])[.、．:：)\]]?\s*[^\n]*)*)/g
  let match: RegExpExecArray | null

  while ((match = optionBlockPattern.exec(fullContent)) !== null) {
    optionRegions.push({
      start: match.index,
      end: match.index + match[0].length,
    })
  }

  // 标记在选项区域内的边界
  for (const boundary of boundaries) {
    for (const region of optionRegions) {
      if (boundary.position > region.start && boundary.position < region.end) {
        boundary.isInsideOptions = true
        break
      }
    }
  }
}

/**
 * 获取边界后的内容
 */
function getContentAfterBoundary(boundary: QuestionBoundary, fullContent: string, length: number): string {
  const start = boundary.position + boundary.rawMatch.length
  return fullContent.slice(start, start + length)
}

/**
 * 检查是否是分组标题（如"选择题"、"填空题"）
 */
function isSectionTitle(content: string): boolean {
  const sectionKeywords = [
    '选择题', '填空题', '解答题', '问答题', '计算题', '证明题', '应用题',
    '判断题', '简答题', '论述题', '分析题', '综合题', '阅读题', '写作题',
    'Multiple Choice', 'Fill in', 'Short Answer', 'Essay',
  ]
  return sectionKeywords.some(kw => content.includes(kw))
}

/**
 * 验证题号序列
 */
function validateSequence(boundaries: QuestionBoundary[]): QuestionBoundary[] {
  if (boundaries.length <= 1) return boundaries

  // 按位置排序
  const sorted = [...boundaries].sort((a, b) => a.position - b.position)

  // 检查是否有从 1 开始的序列
  const startsWithOne = sorted.some(b => b.questionNumber === 1)

  if (!startsWithOne) {
    // 如果没有从 1 开始，可能是页面中间开始的内容
    // 仍然保留，但后续会降低置信度
    return sorted
  }

  // 过滤出合理的序列（允许小间隔）
  const validated: QuestionBoundary[] = [sorted[0]]
  let lastNum = sorted[0].questionNumber

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const gap = current.questionNumber - lastNum

    // 允许的间隔：0（重复）到 3（跳过最多2题）
    if (gap >= 0 && gap <= 3) {
      // 如果是重复题号，优先保留非子题边界
      if (gap === 0) {
        const prev = validated[validated.length - 1]
        if (prev.patternType === 'sub' && current.patternType !== 'sub') {
          validated[validated.length - 1] = current
        } else if (prev.patternType !== 'sub' && current.patternType === 'sub') {
          // 保留主题号，忽略子题号
        } else {
          validated[validated.length - 1] = current
        }
      } else {
        validated.push(current)
        lastNum = current.questionNumber
      }
    } else if (gap > 3) {
      // 间隔太大，可能是新的序列开始，或者中间有遗漏
      // 仍然包含，但在置信度中处理
      validated.push(current)
      lastNum = current.questionNumber
    } else if (gap < 0) {
      // 题号重置（如试卷说明部分 1-9 后正式题目从 1 开始）
      if (current.questionNumber === 1) {
        validated.push(current)
        lastNum = current.questionNumber
      }
    }
    // 其他倒序情况忽略，通常是误识别
  }

  return validated
}

/**
 * 根据边界分割内容
 */
function splitByBoundaries(
  boundaries: QuestionBoundary[],
  fullContent: string
): ParsedQuestion[] {
  if (boundaries.length === 0) return []

  const questions: ParsedQuestion[] = []
  const sorted = [...boundaries].sort((a, b) => a.position - b.position)

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i]
    const next = sorted[i + 1]

    const contentStart = current.position + current.rawMatch.length
    const contentEnd = next ? next.position : fullContent.length
    const content = normalizeQuestionBody(fullContent.slice(contentStart, contentEnd))

    // 计算置信度
    const confidence = calculateConfidence(current, content, sorted, i)

    // 判断是否为子题
    const isSubQuestion = current.patternType === 'sub'
    const parentNumber = isSubQuestion ? findParentNumber(sorted, i) : undefined

    questions.push(buildParsedQuestion({
      questionNumber: current.questionNumber,
      content,
      confidence,
      isSubQuestion,
      parentNumber,
      rawQuestionNumber: current.rawMatch.trim(),
    }))
  }

  return questions
}

/**
 * 合并可能的子题边界，避免将同一大题的分问拆成多题
 */
function collapseSubBoundaries(
  boundaries: QuestionBoundary[],
  fullContent: string,
  sectionMarkers: QuestionBoundary[]
): QuestionBoundary[] {
  if (boundaries.length === 0) return boundaries

  const sorted = [...boundaries].sort((a, b) => a.position - b.position)
  const sections = buildSections(sectionMarkers, fullContent.length)
  const result: QuestionBoundary[] = []

  for (const section of sections) {
    const segment = sorted.filter(
      (b) => b.position >= section.start && b.position < section.end
    )
    if (segment.length === 0) continue

    const hasMain = segment.some((b) => b.patternType !== 'sub')

    if (!hasMain) {
      const shouldMerge = shouldMergeSubOnlySegment(
        segment,
        fullContent,
        section.start
      )
      if (shouldMerge) {
        result.push(makeSyntheticBoundary(segment[0], section.start))
      } else {
        result.push(...segment)
      }
      continue
    }

    let seenMain = false
    for (const boundary of segment) {
      if (boundary.patternType !== 'sub') {
        seenMain = true
        result.push(boundary)
        continue
      }

      if (!seenMain) {
        result.push(boundary)
      }
      // seenMain 时丢弃 sub 边界，作为同题的小问
    }
  }

  return result
}

function buildSections(
  sectionMarkers: QuestionBoundary[],
  totalLength: number
): Array<{ start: number; end: number }> {
  if (sectionMarkers.length === 0) {
    return [{ start: 0, end: totalLength }]
  }

  const sections: Array<{ start: number; end: number }> = []
  let start = 0

  for (const marker of sectionMarkers) {
    if (marker.position > start) {
      sections.push({ start, end: marker.position })
    }
    start = marker.position
  }

  sections.push({ start, end: totalLength })
  return sections
}

function shouldMergeSubOnlySegment(
  segment: QuestionBoundary[],
  fullContent: string,
  segmentStart: number
): boolean {
  const first = segment[0]
  const preamble = fullContent.slice(segmentStart, first.position).trim()
  if (preamble.length < 20) return false

  return QUESTION_CUE_PATTERN.test(preamble)
}

function makeSyntheticBoundary(
  first: QuestionBoundary,
  start: number
): QuestionBoundary {
  return {
    position: start,
    lineStart: start,
    questionNumber: first.questionNumber,
    rawMatch: '',
    patternType: 'minor',
    isAtLineStart: true,
    isInsideOptions: false,
  }
}

function normalizeQuestionBody(content: string): string {
  const normalized = stripTrailingNoise(sanitizeOcrQuestionText(content))
    .replace(/^\s*[-–—]\s*/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return stripLeadingSectionTitle(normalized)
}

function stripLeadingSectionTitle(content: string): string {
  if (!content) return content

  const lines = content
    .split('\n')
    .map((line) => line.trimEnd())

  let firstNonEmptyIndex = -1
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim()) {
      firstNonEmptyIndex = index
      break
    }
  }

  if (firstNonEmptyIndex < 0) return content

  const firstLine = lines[firstNonEmptyIndex].trim()
  if (!GENERIC_SECTION_TITLE_PATTERN.test(firstLine)) {
    return content
  }

  const remaining = lines.slice(firstNonEmptyIndex + 1).join('\n').trim()
  if (!remaining) {
    return content
  }

  const hasQuestionSignal =
    QUESTION_CUE_PATTERN.test(remaining) ||
    countChoiceMarkers(remaining) >= 2 ||
    /(?:^|\n)\s*(?:\([A-Ea-e]\)|[A-Ea-e][.、．:：)\]])\s+\S/.test(remaining)

  return hasQuestionSignal ? remaining : content
}

function findFirstOptionBlockStart(content: string): number {
  const candidates: number[] = []

  const blockIndex = content.search(OPTION_BLOCK_START_PATTERN)
  if (blockIndex >= 0) {
    candidates.push(blockIndex)
  }

  const figureIndex = content.search(/\\begin\{figure\}[\s\S]*?\\caption\{\([A-Ea-e]\)\}/)
  if (figureIndex >= 0) {
    candidates.push(figureIndex)
  }

  let inlineMatch: RegExpExecArray | null
  while ((inlineMatch = INLINE_OPTION_BLOCK_START_PATTERN.exec(content)) !== null) {
    const leadingSpaceIndex = inlineMatch.index ?? -1
    if (leadingSpaceIndex < 0) continue
    const markerOffset = inlineMatch[0].search(/\(?[A-Ea-e]/)
    candidates.push(markerOffset >= 0 ? leadingSpaceIndex + markerOffset : leadingSpaceIndex)
    break
  }
  INLINE_OPTION_BLOCK_START_PATTERN.lastIndex = 0

  if (candidates.length === 0) return -1
  return Math.min(...candidates)
}

export function stripExtractedOptionsFromContent(content: string, options: QuestionOptions | null): string {
  const normalized = normalizeQuestionBody(content)
  if (!normalized || !options || Object.keys(options).length < 2) {
    return normalized
  }

  const optionStart = findFirstOptionBlockStart(normalized)
  if (optionStart < 0) {
    return normalized
  }

  const stripped = normalized
    .slice(0, optionStart)
    .replace(OPTION_LEAD_IN_PATTERN, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return stripped || normalized
}

function countLowercaseChoiceMarkers(content: string): number {
  const lowerLineMarker = /(?:^|\n)\s*(?:\([a-e]\)|[a-e][.、．:：)\]])\s*(?:\S|$)/g
  return (content.match(lowerLineMarker) || []).length
}

function extractSubQuestions(content: string): Array<{ label: string; content: string }> {
  const lines = content.split('\n')
  const result: Array<{ label: string; content: string }> = []
  const subPattern = /^\s*(?:\(([a-z]|[ivx]+|\d+)\)|([a-z]|[ivx]+|\d+)[.)])\s*(.*)$/
  const upperOptionPattern = /^\s*(?:\(([A-E])\)|([A-E])[.、．:：)\]])\s*/
  const lowerOptionPattern = /^\s*(?:\(([a-e])\)|([a-e])[.、．:：)\]])\s*/
  const shouldTreatLowercaseAsOptions = countLowercaseChoiceMarkers(content) >= 3

  let currentLabel = ''
  let buffer: string[] = []

  const flush = () => {
    if (!currentLabel) return
    const text = buffer.join('\n').trim()
    if (text) {
      result.push({ label: currentLabel, content: text })
    }
  }

  for (const line of lines) {
    if (upperOptionPattern.test(line) || (shouldTreatLowercaseAsOptions && lowerOptionPattern.test(line))) {
      if (currentLabel) buffer.push(line.trim())
      continue
    }

    const match = line.match(subPattern)
    if (match) {
      const label = (match[1] || match[2] || '').trim()
      const isUpperOptionLabel = /^[A-E]$/.test(label)
      const isLowerOptionLabel = shouldTreatLowercaseAsOptions && /^[a-e]$/.test(label)
      if (!label || isUpperOptionLabel || isLowerOptionLabel) {
        if (currentLabel) buffer.push(line.trim())
        continue
      }

      flush()
      currentLabel = label
      buffer = []
      const remain = (match[3] || '').trim()
      if (remain) buffer.push(remain)
      continue
    }

    if (currentLabel) {
      buffer.push(line.trim())
    }
  }

  flush()
  return result.length >= 2 ? result : []
}

function extractLinkedFigures(content: string): string[] {
  const refs = new Set<string>()

  const markdownImagePattern = /!\[[^\]]*]\(([^)]+)\)/g
  let imageMatch: RegExpExecArray | null
  while ((imageMatch = markdownImagePattern.exec(content)) !== null) {
    refs.add(imageMatch[1].trim())
  }

  const includeGraphicsPattern = /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g
  let includeMatch: RegExpExecArray | null
  while ((includeMatch = includeGraphicsPattern.exec(content)) !== null) {
    refs.add(includeMatch[1].trim())
  }

  const textRefPattern = /\b(?:Figure|Fig\.?|Table|图|表)\s*\d+[A-Za-z]?\b/gi
  let textMatch: RegExpExecArray | null
  while ((textMatch = textRefPattern.exec(content)) !== null) {
    refs.add(textMatch[0].trim())
  }

  return Array.from(refs)
}

function buildParsedQuestion(params: {
  questionNumber: number
  content: string
  confidence: number
  isSubQuestion: boolean
  rawQuestionNumber: string
  parentNumber?: number
}): ParsedQuestion {
  const normalized = normalizeQuestionBody(params.content)
  const options = extractOptions(normalized)
  const questionStem = stripExtractedOptionsFromContent(normalized, options)
  const questionType = options && Object.keys(options).length >= 2
    ? 'choice'
    : detectQuestionType(questionStem)
  return {
    questionNumber: params.questionNumber,
    originalContent: questionStem,
    questionType,
    options,
    difficulty: detectDifficulty(questionStem),
    subject: detectSubject(questionStem),
    knowledgePoint: extractKnowledgePoint(questionStem),
    confidence: params.confidence,
    isSubQuestion: params.isSubQuestion,
    parentNumber: params.parentNumber,
    rawQuestionNumber: params.rawQuestionNumber,
    subQuestions: extractSubQuestions(questionStem),
    linkedFigures: extractLinkedFigures(questionStem),
  }
}

function refineQuestionBoundaries(questions: ParsedQuestion[]): ParsedQuestion[] {
  if (questions.length === 0) return questions

  const expanded: ParsedQuestion[] = []
  for (const question of questions) {
    if (shouldSplitMergedQuestion(question)) {
      const split = splitMergedQuestion(question)
      if (split.length > 1) {
        expanded.push(...split)
        continue
      }
    }
    expanded.push(question)
  }

  const merged: ParsedQuestion[] = []
  for (let i = 0; i < expanded.length; i += 1) {
    const current = expanded[i]
    const next = expanded[i + 1]
    if (!next) {
      merged.push(current)
      continue
    }

    if (shouldMergeIntoNext(current, next)) {
      merged.push(buildParsedQuestion({
        questionNumber: current.questionNumber,
        content: `${current.originalContent}\n${next.originalContent}`,
        confidence: Math.round((current.confidence + next.confidence) / 2),
        isSubQuestion: false,
        rawQuestionNumber: current.rawQuestionNumber,
      }))
      i += 1
      continue
    }

    merged.push(current)
  }

  return merged
}

function shouldSplitMergedQuestion(question: ParsedQuestion): boolean {
  const content = question.originalContent
  if (content.length < 700) return false

  const startPattern = /(?:^|\n)\s*(?:Question\s+)?(\d{1,3})[.)、．:：]\s+/gi
  const starts = Array.from(content.matchAll(startPattern))
  if (starts.length < 2) return false

  const numbers = starts.map((match) => Number.parseInt(match[1], 10)).filter((num) => !Number.isNaN(num))
  if (numbers.length < 2) return false

  let sequenceOk = 0
  for (let i = 1; i < numbers.length; i += 1) {
    const gap = numbers[i] - numbers[i - 1]
    if (gap > 0 && gap <= 3) sequenceOk += 1
  }
  if (sequenceOk < Math.max(1, numbers.length - 2)) return false

  const optionHits = (content.match(/(?:^|\n)\s*(?:\([A-E]\)|[A-E])[.)、．:：]/g) || []).length
  return optionHits >= Math.min(6, starts.length * 2)
}

function splitMergedQuestion(question: ParsedQuestion): ParsedQuestion[] {
  const content = question.originalContent
  const startPattern = /(?:^|\n)\s*(?:Question\s+)?(\d{1,3})[.)、．:：]\s+/gi
  const starts = Array.from(content.matchAll(startPattern))
  if (starts.length < 2) return [question]

  const chunks: ParsedQuestion[] = []
  for (let i = 0; i < starts.length; i += 1) {
    const startMatch = starts[i]
    const startIndex = startMatch.index ?? -1
    if (startIndex < 0) continue

    const marker = startMatch[0]
    const bodyStart = startIndex + marker.length
    const nextStart = starts[i + 1]?.index ?? content.length
    const body = normalizeQuestionBody(content.slice(bodyStart, nextStart))
    if (!body || body.length < 10) continue

    chunks.push(buildParsedQuestion({
      questionNumber: Number.parseInt(startMatch[1], 10) || i + 1,
      content: body,
      confidence: Math.min(100, question.confidence + 8),
      isSubQuestion: false,
      rawQuestionNumber: marker.trim(),
    }))
  }

  return chunks.length > 1 ? chunks : [question]
}

function shouldMergeIntoNext(current: ParsedQuestion, next: ParsedQuestion): boolean {
  if (current.options && Object.keys(current.options).length >= 2) return false
  if (current.subQuestions && current.subQuestions.length > 0) return false
  if (current.originalContent.length > 40) return false
  if (QUESTION_CUE_PATTERN.test(current.originalContent)) return false
  if (/^\s*(?:Question\s*)?\d+/i.test(current.originalContent)) return false

  return next.originalContent.length > 60 && QUESTION_CUE_PATTERN.test(next.originalContent)
}

/**
 * 计算置信度
 */
function calculateConfidence(
  boundary: QuestionBoundary,
  content: string,
  allBoundaries: QuestionBoundary[],
  index: number
): number {
  let score = 50 // 基础分

  // 题号在行首 +15
  if (boundary.isAtLineStart) score += 15

  // 题号格式清晰（大题号或普通题号）+10
  if (boundary.patternType === 'major' || boundary.patternType === 'minor') {
    score += 10
  }

  // 内容长度合理 +10
  if (content.length >= 20 && content.length <= 1000) {
    score += 10
  } else if (content.length < 10) {
    score -= 15 // 内容太短
  } else if (content.length > 2000) {
    score -= 5 // 内容较长
  }

  // 题号序列连续性检查
  if (index > 0) {
    const prev = allBoundaries[index - 1]
    const gap = boundary.questionNumber - prev.questionNumber
    if (gap === 1) {
      score += 10 // 连续
    } else if (gap === 0) {
      score -= 10 // 重复题号
    } else if (gap > 1 && gap <= 3) {
      score += 5 // 小间隔
    } else {
      score -= 10 // 大间隔
    }
  } else {
    // 第一题
    if (boundary.questionNumber === 1) {
      score += 10
    } else {
      score -= 5 // 不从 1 开始
    }
  }

  // 检查内容类型一致性
  const questionType = detectQuestionType(content)
  if (questionType === 'choice') {
    const options = extractOptions(content)
    if (options && Object.keys(options).length >= 2) {
      score += 10 // 选择题有选项
    } else {
      score -= 10 // 选择题但没有选项
    }
  } else if (questionType === 'fill') {
    if (/_{2,}|（\s*）|\(\s*\)/.test(content)) {
      score += 5 // 填空题有空位
    }
  }

  // 限制在 0-100 范围
  return Math.max(0, Math.min(100, score))
}

/**
 * 找到子题的父题号
 */
function findParentNumber(boundaries: QuestionBoundary[], currentIndex: number): number | undefined {
  // 向前查找最近的大题号
  for (let i = currentIndex - 1; i >= 0; i--) {
    if (boundaries[i].patternType === 'major') {
      return boundaries[i].questionNumber
    }
  }
  return undefined
}

/**
 * 兜底逻辑：按空行分割段落
 */
function parseByParagraphs(fullContent: string): ParsedQuestion[] {
  const paragraphs = fullContent
    .split(/\n\s*\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0)

  if (paragraphs.length === 0) {
    return []
  }

  // 过滤掉太短的段落（可能是标题或无效内容）
  const validParagraphs = paragraphs.filter(p => p.length >= 10)

  if (validParagraphs.length === 0) {
    // 如果过滤后没有内容，使用原始段落
    return paragraphs.map((content, i) => createFallbackQuestion(content, i + 1))
  }

  return validParagraphs.map((content, i) => createFallbackQuestion(content, i + 1))
}

/**
 * 创建兜底题目（置信度较低）
 */
function createFallbackQuestion(content: string, number: number): ParsedQuestion {
  const normalized = normalizeQuestionBody(content)
  return buildParsedQuestion({
    questionNumber: number,
    content: normalized,
    confidence: 40, // 兜底逻辑置信度较低
    isSubQuestion: false,
    rawQuestionNumber: '',
  })
}

// ============================================
// 题型识别
// ============================================

/**
 * 识别题目类型
 */
export function detectQuestionType(content: string): QuestionType {
  if (!content) {
    return 'essay'
  }

  const choiceMarkerCount = countChoiceMarkers(content)
  if (choiceMarkerCount >= 2) {
    return 'choice'
  }

  const hasImageRef = /!\[[^\]]*\]\([^)]+\)|\\includegraphics|\\begin\{figure\}|\[IMAGE_REGION:|!\[选项/.test(content)
  const hasAnyOptionLabel = /(?:^|\n)\s*(?:\([A-Da-d]\)|[A-D][.、．:：)\]])/m.test(content)
  if (hasImageRef && hasAnyOptionLabel) {
    return 'choice'
  }

  // 填空题：包含下划线或括号空格
  const fillPattern = /_{2,}|（\s*）|\(\s*\)|____|\[\s*\]/
  if (fillPattern.test(content)) {
    return 'fill'
  }

  const frqPattern = /(free[-\s]?response|frq|简答题|问答题|回答下列问题|explain|describe|justify your answer)/i
  const hasSubQuestionCue = /(?:^|\n)\s*\(([a-z]|[ivx]+)\)\s+/im.test(content)
  if (frqPattern.test(content) || hasSubQuestionCue) {
    return 'essay'
  }

  // 证明题关键词（优先于计算）
  const proofPattern = /(证明|推导|论证|show that|prove that|demonstrate that)/i
  if (proofPattern.test(content)) {
    return 'proof'
  }

  // 计算题关键词
  const calculationPattern = /(计算|求值|求出|算出|calculate|compute|evaluate|determine the value|find the value)/i
  const symbolicPattern = /[=∫∑√^]|\\frac|\\int|\\sum/
  if (calculationPattern.test(content) || (symbolicPattern.test(content) && QUESTION_CUE_PATTERN.test(content))) {
    return 'calculation'
  }

  // 其他情况归为 FRQ/问答
  return 'essay'
}

function countChoiceMarkers(content: string): number {
  const upperLineMarker = /(?:^|\n)\s*(?:\([A-E]\)|[A-E][.、．:：)\]])\s*(?:\S|$)/g
  const inlineMarker = /\([A-Ea-e]\)\s*[^()\n]+(?=.*\([A-Ea-e]\))/g
  const upperHits = (content.match(upperLineMarker) || []).length
  const lowerHits = countLowercaseChoiceMarkers(content)
  const inlineHits = (content.match(inlineMarker) || []).length
  return Math.max(upperHits, lowerHits >= 3 ? lowerHits : 0, inlineHits)
}

// ============================================
// 选项提取
// ============================================

/**
 * 提取选择题选项
 */
export function extractOptions(content: string): QuestionOptions | null {
  const options: QuestionOptions = {}
  const rawMarkers: string[] = []

  const normalizedContent = content.replace(/\r/g, '')
  const lines = normalizedContent.split('\n')
  const optionStartPattern = /^\s*(?:\(([A-Ea-e])\)|([A-Ea-e])[.、．:：)\]])\s*(.*)$/

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const match = line.match(optionStartPattern)
    if (!match) continue

    const letter = (match[1] || match[2] || '').toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E'
    if (!letter) continue
    rawMarkers.push((match[1] || match[2] || ''))

    const collected: string[] = []
    const firstPart = (match[3] || '').trim()
    if (firstPart) {
      collected.push(firstPart)
    }

    let j = i + 1
    for (; j < lines.length; j += 1) {
      const nextLine = lines[j]
      if (optionStartPattern.test(nextLine)) {
        break
      }
      if (nextLine.trim().length === 0) {
        if (collected.length > 0) {
          collected.push('')
        }
        continue
      }
      collected.push(nextLine.trim())
    }

    const text = collected.join('\n').trim()
    if (text && !options[letter]) {
      options[letter] = text
    }

    i = j - 1
  }

  if (Object.keys(options).length < 2) {
    const firstOptionIndex = normalizedContent.search(/(?:^|\n|\s)(?:\([A-Ea-e]\)|[A-Ea-e][.、．:：)\]])\s*/m)
    if (firstOptionIndex >= 0) {
      const optionBlock = normalizedContent.slice(firstOptionIndex)
      const inlinePattern = /(?:^|\s)(?:\(([A-Ea-e])\)|([A-Ea-e])[.、．:：)\]])\s*([\s\S]*?)(?=(?:\s(?:\([A-Ea-e]\)|[A-Ea-e][.、．:：)\]])\s*)|$)/g
      let match: RegExpExecArray | null
      while ((match = inlinePattern.exec(optionBlock)) !== null) {
        const letter = (match[1] || match[2] || '').toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E'
        if (!letter) continue
        rawMarkers.push((match[1] || match[2] || ''))
        const text = normalizeOptionText(match[3] || '')
        if (text && !options[letter]) {
          options[letter] = text
        }
      }
    }
  }

  if (Object.keys(options).length < 2) {
    let match: RegExpExecArray | null
    while ((match = FIGURE_OPTION_PATTERN.exec(normalizedContent)) !== null) {
      const letter = (match[1] || '').toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E'
      const imageUrl = normalizeOptionText(match[2] || '')
      if (!letter || !imageUrl) continue
      rawMarkers.push(match[1] || '')
      options[letter] = `![选项 ${letter}](${imageUrl})`
    }
    FIGURE_OPTION_PATTERN.lastIndex = 0
  }

  const optionCount = Object.keys(options).length
  const allLowercaseMarkers = rawMarkers.length > 0 && rawMarkers.every((marker) => /^[a-e]$/.test(marker))
  if (allLowercaseMarkers && optionCount < 3) {
    return null
  }
  return optionCount >= 2 ? options : null
}

function normalizeOptionText(text: string): string {
  return stripTrailingNoise(text)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+$/g, '')
    .trim()
}

// ============================================
// 难度判断
// ============================================

/**
 * 判断题目难度
 */
export function detectDifficulty(content: string): DifficultyLevel {
  if (!content) {
    return 'easy'
  }

  // 困难指标
  const hardIndicators = [
    /\\int|\\sum|\\lim|\\frac|\\prod/,  // LaTeX 高级公式
    /∫|∑|∏|∞|∂|∇/,                      // 数学符号
    /证明|推导|论证|解释.*原理/,          // 证明类关键词
    /极限|积分|微分|级数|矩阵/,           // 高等数学概念
    /prove|derive|demonstrate/i,         // 英文证明关键词
  ]

  // 中等指标
  const mediumIndicators = [
    /三角形|四边形|圆|抛物线/,            // 几何图形
    /方程|函数|不等式|表达式/,            // 代数概念
    /求|解|计算|求解/,                    // 计算类
    /已知.*求|if.*find|given.*solve/i,   // 已知求解
  ]

  // 检查困难指标
  const hardScore = hardIndicators.filter(p => p.test(content)).length
  if (hardScore >= 2 || content.length > 300) {
    return 'hard'
  }

  // 检查中等指标
  const mediumScore = mediumIndicators.filter(p => p.test(content)).length
  if (mediumScore >= 1 || content.length > 80) {
    return 'medium'
  }

  return 'easy'
}

// ============================================
// 学科识别
// ============================================

/**
 * 识别学科
 */
export function detectSubject(content: string): string {
  if (!content) {
    return '未知'
  }

  // 化学关键词（优先检测）
  const chemistryKeywords = /化学|分子|原子|离子|元素|化合物|反应|方程式|酸|碱|盐|氧化|还原|电解|摩尔|H2O|NaCl|CO2|O2|Fe|Cu|Zn|mol\/L|pH|溶液/
  if (chemistryKeywords.test(content)) {
    return '化学'
  }

  // 生物关键词
  const biologyKeywords = /细胞|基因|DNA|RNA|蛋白质|酶|光合作用|呼吸作用|遗传|变异|进化|生态|生物|染色体|有丝分裂|减数分裂/
  if (biologyKeywords.test(content)) {
    return '生物'
  }

  // 物理关键词
  const physicsKeywords = /质量|速度|加速度|力|能量|电流|电压|电阻|磁场|光|波|热|功率|动量|牛顿|欧姆|焦耳|m\/s|kg|N|J|W|电场|磁感应/
  if (physicsKeywords.test(content)) {
    return '物理'
  }

  // 数学关键词
  const mathKeywords = /∫|∑|sin|cos|tan|log|ln|方程|函数|导数|积分|极限|矩阵|向量|概率|统计|几何|三角|代数|求解|证明.*等式|不等式|slope|derivative|integral/i
  if (mathKeywords.test(content)) {
    return '数学'
  }

  // 语文关键词
  const chineseKeywords = /作文|阅读|诗词|成语|修辞|句子|段落|文章|作者|主题|中心思想|描写|叙述|《.*》|红楼梦|三国|水浒|西游|古诗|文言文|翻译.*句/
  if (chineseKeywords.test(content)) {
    return '语文'
  }

  // 英语关键词
  const englishKeywords = /[Tt]ranslate|[Ee]nglish|the\s+\w+|is\s+\w+|are\s+\w+|was\s+\w+|were\s+\w+|[Rr]ead.*passage|[Cc]hoose.*correct/
  if (englishKeywords.test(content)) {
    return '英语'
  }

  // 历史关键词
  const historyKeywords = /历史|朝代|战争|革命|运动|事件|公元|世纪|王朝|皇帝|改革|条约/
  if (historyKeywords.test(content)) {
    return '历史'
  }

  // 地理关键词
  const geographyKeywords = /地理|气候|地形|河流|山脉|大陆|海洋|纬度|经度|人口|城市|农业|工业/
  if (geographyKeywords.test(content)) {
    return '地理'
  }

  return '未知'
}

// ============================================
// 知识点提取
// ============================================

/**
 * 提取知识点关键词
 */
export function extractKnowledgePoint(content: string): string {
  if (!content) {
    return ''
  }

  // 知识点关键词映射
  const knowledgePatterns: Array<{ pattern: RegExp; point: string }> = [
    // 数学
    { pattern: /二次函数/, point: '二次函数' },
    { pattern: /一次函数/, point: '一次函数' },
    { pattern: /勾股定理/, point: '勾股定理' },
    { pattern: /三角函数|sin|cos|tan/, point: '三角函数' },
    { pattern: /导数|derivative/, point: '导数' },
    { pattern: /积分|integral/, point: '积分' },
    { pattern: /极限|limit/, point: '极限' },
    { pattern: /概率|probability/, point: '概率' },
    { pattern: /排列组合|permutation|combination/, point: '排列组合' },
    { pattern: /等差数列/, point: '等差数列' },
    { pattern: /等比数列/, point: '等比数列' },
    { pattern: /向量|vector/, point: '向量' },
    { pattern: /矩阵|matrix/, point: '矩阵' },

    // 物理
    { pattern: /牛顿.*定律|F\s*=\s*ma/, point: '牛顿定律' },
    { pattern: /欧姆定律/, point: '欧姆定律' },
    { pattern: /自由落体/, point: '自由落体' },
    { pattern: /动量守恒/, point: '动量守恒' },
    { pattern: /能量守恒/, point: '能量守恒' },
    { pattern: /电磁感应/, point: '电磁感应' },

    // 化学
    { pattern: /化学平衡/, point: '化学平衡' },
    { pattern: /氧化还原/, point: '氧化还原反应' },
    { pattern: /离子反应/, point: '离子反应' },
    { pattern: /电解/, point: '电解' },
    { pattern: /有机化学|有机物/, point: '有机化学' },

    // 生物
    { pattern: /光合作用/, point: '光合作用' },
    { pattern: /细胞分裂|有丝分裂|减数分裂/, point: '细胞分裂' },
    { pattern: /遗传|基因/, point: '遗传学' },
  ]

  for (const { pattern, point } of knowledgePatterns) {
    if (pattern.test(content)) {
      return point
    }
  }

  return ''
}

// ============================================
// 辅助函数：获取低置信度题目
// ============================================

/**
 * 获取低置信度的题目（可能需要人工校验）
 */
export function getLowConfidenceQuestions(
  questions: ParsedQuestion[],
  threshold: number = 60
): ParsedQuestion[] {
  return questions.filter(q => q.confidence < threshold)
}

/**
 * 获取分题统计信息
 */
export function getParsingStats(questions: ParsedQuestion[]): {
  total: number
  highConfidence: number
  mediumConfidence: number
  lowConfidence: number
  averageConfidence: number
  byType: Record<QuestionType, number>
  bySubject: Record<string, number>
} {
  const stats = {
    total: questions.length,
    highConfidence: 0,
    mediumConfidence: 0,
    lowConfidence: 0,
    averageConfidence: 0,
    byType: {
      choice: 0,
      fill: 0,
      essay: 0,
      calculation: 0,
      proof: 0,
    } as Record<QuestionType, number>,
    bySubject: {} as Record<string, number>,
  }

  let totalConfidence = 0

  for (const q of questions) {
    totalConfidence += q.confidence

    if (q.confidence >= 80) {
      stats.highConfidence++
    } else if (q.confidence >= 60) {
      stats.mediumConfidence++
    } else {
      stats.lowConfidence++
    }

    stats.byType[q.questionType]++
    stats.bySubject[q.subject] = (stats.bySubject[q.subject] || 0) + 1
  }

  stats.averageConfidence = questions.length > 0
    ? Math.round(totalConfidence / questions.length)
    : 0

  return stats
}
