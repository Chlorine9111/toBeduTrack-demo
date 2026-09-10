"use client"

import katex from "katex"

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/**
 * Parse text containing $...$ delimiters and render math via KaTeX.
 * Returns an HTML string safe for dangerouslySetInnerHTML.
 */
export function renderInlineMath(input: string): string {
  if (!input) return ""
  const parts: string[] = []
  let idx = 0
  while (idx < input.length) {
    const dollarPos = input.indexOf("$", idx)
    if (dollarPos === -1) {
      parts.push(escapeHtml(input.slice(idx)))
      break
    }
    if (dollarPos > idx) {
      parts.push(escapeHtml(input.slice(idx, dollarPos)))
    }
    const end = input.indexOf("$", dollarPos + 1)
    if (end === -1) {
      parts.push(escapeHtml(input.slice(dollarPos)))
      break
    }
    const tex = input.slice(dollarPos + 1, end)
    try {
      parts.push(katex.renderToString(tex.trim(), { throwOnError: false }))
    } catch {
      parts.push(escapeHtml(`$${tex}$`))
    }
    idx = end + 1
  }
  return parts.join("")
}

/**
 * Inline math renderer using <span> — safe inside buttons, flex rows,
 * and other inline contexts.
 */
export function MathSpan({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: renderInlineMath(text) }}
    />
  )
}
