"use client"

import { useMemo } from "react"
import katex from "katex"
import "katex/dist/katex.min.css"
import { cn } from "@/lib/utils"

interface MathTextProps {
  text: string
  className?: string
}

// display math: $$...$$ 或 \[...\]
const DISPLAY_PATTERN = /\$\$([^$]+)\$\$|\\\[(.+?)\\\]/g
// inline math: $...$ 或 \(...\)
const INLINE_PATTERN = /\$([^$]+)\$|\\\((.+?)\\\)/g

/**
 * 匹配裸 LaTeX 表达式（无 $ 分隔符）并自动包裹 $...$。
 *
 * 策略：匹配 \command 开头的完整表达式，包括其花括号参数、上下标等，
 * 然后用 $...$ 包裹使其能被 INLINE_PATTERN 处理。
 *
 * 匹配范围：
 * 1. 带花括号参数的命令: \frac{a}{b}, \sqrt{x}, \text{hello}
 * 2. 环境块: \begin{cases}...\end{cases}
 * 3. 无参数的符号命令: \alpha, \infty, \cdot
 * 4. 带上下标的: \int_{a}^{b}, \sum_{i=0}^{n}
 */
const LATEX_EXPR = new RegExp(
  // 环境块: \begin{env}...\end{env}
  '\\\\begin\\{[^}]+\\}[\\s\\S]*?\\\\end\\{[^}]+\\}' +
  '|' +
  // 命令 + 花括号参数（含嵌套）+ 可选上下标
  '\\\\(?:frac|sqrt|binom|text|mathrm|mathbf|mathit|mathbb|mathcal|overline|underline|hat|bar|vec|dot|ddot|tilde|widetilde|widehat|overset|underset|stackrel)' +
  '(?:\\{[^}]*\\})+' +
  '(?:[_^](?:\\{[^}]*\\}|[a-zA-Z0-9]))*' +
  '|' +
  // 积分/求和等 + 可选上下标
  '\\\\(?:int|iint|iiint|oint|sum|prod|lim|sup|inf|max|min|log|ln|sin|cos|tan|partial)' +
  '(?:[_^](?:\\{[^}]*\\}|[a-zA-Z0-9]))*' +
  '|' +
  // 分隔符: \left( ... \right)
  '\\\\(?:left|right)[()\\[\\]{}|.]' +
  '|' +
  // 无参数的符号命令
  '\\\\(?:alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|infty|cdot|cdots|ldots|ddots|vdots|times|div|pm|mp|circ|ast|star|dagger|ddagger|bullet|neq|leq|geq|ll|gg|approx|equiv|sim|simeq|cong|propto|perp|parallel|subset|supset|subseteq|supseteq|in|notin|cup|cap|vee|wedge|oplus|otimes|forall|exists|neg|nabla|angle|triangle|square|diamond|ell|hbar|Re|Im|wp|aleph|emptyset|quad|qquad|to|rightarrow|leftarrow|Rightarrow|Leftarrow|mapsto|implies|iff)\\b',
  'g',
)

// ---------------------------------------------------------------------------
// Unicode 数学符号归一化
// ---------------------------------------------------------------------------

const UNICODE_SUPERSCRIPTS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  'ⁿ': 'n', '⁺': '+', '⁻': '-',
}
const UNICODE_SUBSCRIPTS: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
}

/**
 * 转义纯文本中的花括号为 LaTeX 安全形式。
 * 仅处理不含 $ 的文本（即非 LaTeX 源文本），防止 {A,B} 进入 $...$ 后变成不可见分组。
 * 在 Unicode 归一化之前调用，这样后续产生的 ^{} _{} 不受影响。
 */
function escapePlainTextBraces(text: string): string {
  if (/\$/.test(text)) return text
  return text.replace(/\{/g, "\\{").replace(/\}/g, "\\}")
}

function normalizeUnicodeMath(text: string): string {
  return text
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻]+/g, (m) =>
      '^{' + [...m].map(c => UNICODE_SUPERSCRIPTS[c] ?? c).join('') + '}')
    .replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, (m) =>
      '_{' + [...m].map(c => UNICODE_SUBSCRIPTS[c] ?? c).join('') + '}')
}

// ---------------------------------------------------------------------------
// AP 纯文本数学 → LaTeX 转换
// ---------------------------------------------------------------------------

/** 导数记号检测 */
const DERIVATIVE_PATTERN = /\bd[a-z]?\/d[a-z]\b/
/** 素数记号检测: f'(x), y', g'' */
const PRIME_MATH_PATTERN = /[a-zA-Z]'{1,3}(?:\(|$|\s*=)/

/** 希腊字母名 → LaTeX 命令映射 */
const GREEK_NAMES: Record<string, string> = {
  alpha: "\\alpha", beta: "\\beta", gamma: "\\gamma", delta: "\\delta",
  epsilon: "\\epsilon", zeta: "\\zeta", eta: "\\eta", theta: "\\theta",
  kappa: "\\kappa", lambda: "\\lambda", mu: "\\mu", nu: "\\nu",
  xi: "\\xi", pi: "\\pi", rho: "\\rho", sigma: "\\sigma",
  tau: "\\tau", phi: "\\phi", chi: "\\chi", psi: "\\psi", omega: "\\omega",
  Delta: "\\Delta", Omega: "\\Omega", Sigma: "\\Sigma", Pi: "\\Pi",
  Theta: "\\Theta", Lambda: "\\Lambda", Phi: "\\Phi", Gamma: "\\Gamma",
}
const GREEK_PATTERN = new RegExp(
  `\\b(${Object.keys(GREEK_NAMES).join("|")})\\b`, "g",
)

/** 数学函数调用 → LaTeX */
const FUNC_NAMES = ["sqrt", "sin", "cos", "tan", "log", "ln", "exp", "abs"]
const FUNC_CALL_PATTERN = new RegExp(
  `\\b(${FUNC_NAMES.join("|")})(\\()`, "g",
)

/**
 * 检测一个 token 是否看起来像数学表达式。
 * 不会匹配普通英文单词。
 */
function looksLikeMath(token: string): boolean {
  // 包含下标
  if (/[A-Za-z]_[A-Za-z0-9]/.test(token)) return true
  // 包含上标（也允许 ) 和 } 出现在 ^ 前面，如 (x+1)^{2}）
  if (/[A-Za-z0-9)}]\^[A-Za-z0-9{(]/.test(token)) return true
  // 函数调用
  if (/\b(?:sqrt|sin|cos|tan|sec|csc|cot|log|ln)\s*\(/.test(token)) return true
  // 乘号连接的变量
  if (/[A-Za-z]\*[A-Za-z]/.test(token)) return true
  // 导数记号: dy/dx, d/dx, dx/dt
  if (DERIVATIVE_PATTERN.test(token)) return true
  // 素数记号: f'(x), y', g''(x)
  if (/[a-zA-Z]'{1,3}(?:\(|$)/.test(token)) return true
  // 三角函数带幂: sin^3, cos^2
  if (/\b(?:sin|cos|tan|sec|csc|cot)\^/.test(token)) return true
  // 数字+变量组合: 2x, 3t（排除 2D, 3D, 4K, 2nd 等非数学用法）
  if (/^\d+[a-zA-Z][,;.]?$/.test(token) && !/^\d+(?:st|nd|rd|th|D|G|K|A|B)[,;.]?$/i.test(token)) return true
  // 积分符号
  if (/∫/.test(token)) return true
  // 包含希腊字母名 + 运算符
  if (GREEK_PATTERN.test(token) && /[_^*\/+\-=<>]/.test(token)) {
    GREEK_PATTERN.lastIndex = 0
    return true
  }
  GREEK_PATTERN.lastIndex = 0
  return false
}

/**
 * 将 AP 纯文本数学表达式转成 LaTeX。
 * 对文本中的数学片段进行检测和转换，非数学文本保持不变。
 */
function convertApPlainTextMath(text: string): string {
  // 已有标准 LaTeX 标记 → 不处理
  if (/\$/.test(text)) return text
  // 没有任何数学特征 → 不处理
  if (
    !/[_^*∫]/.test(text) &&
    !FUNC_CALL_PATTERN.test(text) &&
    !DERIVATIVE_PATTERN.test(text) &&
    !PRIME_MATH_PATTERN.test(text)
  ) {
    FUNC_CALL_PATTERN.lastIndex = 0
    return text
  }
  FUNC_CALL_PATTERN.lastIndex = 0

  // 按逗号和分号分隔的独立子句分别处理
  // 但先按空格将文本分成 token 序列来判断
  const segments = text.split(/(?<=\s)|(?=\s)/)
  const result: string[] = []
  let mathBuffer: string[] = []

  function flushMathBuffer() {
    if (mathBuffer.length === 0) return
    const raw = mathBuffer.join("")
    // 内部转换
    let latex = raw
      // 导数记号: dy/dx → \frac{dy}{dx}
      .replace(/\bd([a-z])\/d([a-z])\b/g, "\\frac{d$1}{d$2}")
      // d/dx → \frac{d}{dx}
      .replace(/\bd\/d([a-z])\b/g, "\\frac{d}{d$1}")
      // 函数调用：sqrt(...) → \sqrt{...} 需要特殊处理
      .replace(/\bsqrt\(([^)]*)\)/g, "\\sqrt{$1}")
      // 三角函数带幂: sin^{3} 或 sin^3 → \sin^{3}（排除已转义的 \sin）
      .replace(/(?<!\\)\b(sin|cos|tan|sec|csc|cot)\^\{?(\d+)\}?/g, "\\$1^{$2}")
      // 函数前缀带括号: sin( → \sin(
      .replace(/(?<!\\)\b(sin|cos|tan|sec|csc|cot|log|ln|exp)\(/g, "\\$1(")
      // 独立函数名（无括号无幂）: sin x → \sin x
      .replace(/(?<!\\)\b(sin|cos|tan|sec|csc|cot|log|ln|lim)\b(?!\^|[a-zA-Z])/g, "\\$1")
      // 希腊字母
      .replace(GREEK_PATTERN, (_, name) => GREEK_NAMES[name] ?? name)
      // 乘号 * → \cdot
      .replace(/\*/g, "\\cdot ")
    GREEK_PATTERN.lastIndex = 0
    result.push(`$${latex}$`)
    mathBuffer = []
  }

  /** 运算符 token（连接两个数学 token 的桥梁） */
  function isMathOperator(s: string): boolean {
    return /^[+\-−*/=<>≤≥≠≈·×÷|]+$/.test(s.trim())
  }

  /** 短变量名（1-3 个字母，可能是物理量如 M, R, GmM） */
  function isShortVariable(s: string): boolean {
    return /^[A-Za-zΔΣΩαβγδεζηθικλμνξπρσςτυφχψωρ]{1,4}$/.test(s.trim())
  }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]

    if (/^\s+$/.test(seg)) {
      if (mathBuffer.length > 0) {
        mathBuffer.push(seg)
      } else {
        result.push(seg)
      }
      continue
    }

    if (looksLikeMath(seg)) {
      mathBuffer.push(seg)
      continue
    }

    // 运算符或短变量：如果前后有数学 token 则归入数学 buffer
    if (mathBuffer.length > 0 && (isMathOperator(seg) || isShortVariable(seg))) {
      // 往前看：后面还有数学 token 吗？
      let hasFollowingMath = false
      for (let j = i + 1; j < segments.length && j <= i + 4; j++) {
        const future = segments[j]
        if (/^\s+$/.test(future)) continue
        if (looksLikeMath(future) || isMathOperator(future)) { hasFollowingMath = true; break }
        break
      }
      if (hasFollowingMath) {
        mathBuffer.push(seg)
        continue
      }
    }

    // 不是数学
    flushMathBuffer()
    result.push(seg)
  }
  flushMathBuffer()

  const converted = result.join("")
  return converted !== text ? converted : text
}

function wrapBareLatex(text: string): string {
  return text.replace(LATEX_EXPR, (match) => `$${match}$`)
}

function renderKatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, { throwOnError: false, displayMode })
  } catch {
    return latex
  }
}

function wrapRenderedMath(html: string, displayMode: boolean): string {
  return displayMode
    ? `<span class="deskmate-math-display">${html}</span>`
    : `<span class="deskmate-math-inline">${html}</span>`
}

function renderMathSegments(text: string): string {
  let hasMatch = false

  // 纯文本花括号转义（{A,B} → \{A,B\}），避免进入 $...$ 后变成不可见分组
  const bracesEscaped = escapePlainTextBraces(text)
  if (bracesEscaped !== text) {
    hasMatch = true
  }

  // Unicode 上下标归一化（x² → x^{2}, x₀ → x_{0}）
  const unicodeNormalized = normalizeUnicodeMath(bracesEscaped)
  if (unicodeNormalized !== text) {
    hasMatch = true
  }

  // AP 纯文本数学预处理（F_1 → $F_1$, sqrt(x) → $\sqrt{x}$, dy/dx → $\frac{dy}{dx}$ 等）
  const preprocessed = convertApPlainTextMath(unicodeNormalized)
  if (preprocessed !== unicodeNormalized) {
    hasMatch = true
  }

  // 先处理 display math（displayMode: true）
  let result = preprocessed.replace(DISPLAY_PATTERN, (_match, dollar, bracket) => {
    hasMatch = true
    return wrapRenderedMath(renderKatex(dollar ?? bracket, true), true)
  })

  // 再处理 inline math
  result = result.replace(INLINE_PATTERN, (_match, dollar, paren) => {
    hasMatch = true
    return wrapRenderedMath(renderKatex(dollar ?? paren, false), false)
  })

  // 裸 LaTeX 检测：如果没匹配到 $ 分隔符，尝试自动包裹后重新处理
  LATEX_EXPR.lastIndex = 0
  if (!hasMatch && LATEX_EXPR.test(text)) {
    // 重置 lastIndex（全局正则需要）
    LATEX_EXPR.lastIndex = 0
    const wrapped = wrapBareLatex(text)
    if (wrapped !== text) {
      // 用 INLINE_PATTERN 处理自动包裹后的文本
      const wrappedResult = wrapped.replace(INLINE_PATTERN, (_match, dollar, paren) => {
        hasMatch = true
        return wrapRenderedMath(renderKatex(dollar ?? paren, false), false)
      })
      if (hasMatch) return wrappedResult
    }
  }

  return hasMatch ? result : ""
}

export default function MathText({ text, className }: MathTextProps) {
  const html = useMemo(() => renderMathSegments(text), [text])

  if (!html) {
    return <span className={className}>{text}</span>
  }

  return (
    <span
      className={cn("deskmate-math-text", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
