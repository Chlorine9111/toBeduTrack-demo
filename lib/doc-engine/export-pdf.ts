import { readFileSync } from "fs";
import { join } from "path";
import type { DocumentLayoutConfig } from "@/lib/doc-engine/block-types";
import { launchDocumentBrowser } from "@/lib/doc-engine/chromium";
import { normalizeDocumentHtml } from "@/lib/doc-engine/editor-html";
import { expandHtmlMathMarkup } from "@/lib/doc-engine/math-core";

// ── 学术排版 CSS（服务端缓存，只读一次文件系统） ──────────
let _academicCssCache: string | undefined;
let _katexCssCache: string | undefined;

function getAcademicPrintCss(): string {
  if (_academicCssCache !== undefined) return _academicCssCache;
  try {
    _academicCssCache = readFileSync(
      join(process.cwd(), "lib/doc-engine/academic-print.css"),
      "utf-8",
    );
  } catch {
    _academicCssCache = "";
  }
  return _academicCssCache;
}

function inlineFontAsDataUri(fontsDir: string, relativePath: string): string {
  try {
    const fontPath = join(fontsDir, relativePath);
    const fontBuffer = readFileSync(fontPath);
    const ext = relativePath.split(".").pop() ?? "woff2";
    const mime = ext === "woff2" ? "font/woff2" : ext === "woff" ? "font/woff" : "font/ttf";
    return `data:${mime};base64,${fontBuffer.toString("base64")}`;
  } catch {
    return "";
  }
}

function getKatexPrintCss(): string {
  if (_katexCssCache !== undefined) return _katexCssCache;

  try {
    const katexCssPath = join(process.cwd(), "node_modules/katex/dist/katex.min.css");
    const katexFontsDir = join(process.cwd(), "node_modules/katex/dist/fonts");
    const rawCss = readFileSync(katexCssPath, "utf-8");

    // Inline woff2 fonts as base64 data URIs for serverless compatibility.
    // Remove woff/ttf fallbacks since all modern Chromium versions support woff2.
    _katexCssCache = rawCss
      .replace(
        /url\((['"]?)fonts\/([^)'"]+\.woff2)\1\)\s*format\((['"])woff2\3\)(?:,\s*url\([^)]+\)\s*format\([^)]+\))*(?:,\s*url\([^)]+\)\s*format\([^)]+\))*/g,
        (_match, _q1, fontFile) => {
          const dataUri = inlineFontAsDataUri(katexFontsDir, fontFile);
          return dataUri ? `url("${dataUri}") format("woff2")` : `url("fonts/${fontFile}") format("woff2")`;
        },
      )
      .concat(`
.doc-math-fallback {
  font-family: "New Computer Modern", "Times New Roman", "Noto Serif SC", serif;
}

.katex-display {
  display: block;
  margin: 0.65rem 0 0.7rem;
  text-align: center;
  overflow: visible;
  break-inside: avoid;
  page-break-inside: avoid;
}

.katex {
  font-size: 1em;
  line-height: 1.45;
  text-indent: 0;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  font-synthesis-weight: none;
}

.katex-display > .katex {
  display: inline-block;
  max-width: 100%;
  padding: 0 0.12rem;
}

[data-doc-type] p .katex,
[data-doc-type] li .katex,
[data-doc-type] td .katex,
[data-doc-type] th .katex {
  vertical-align: -0.08em;
}

.katex .mfrac .frac-line {
  border-bottom-width: 0.07em;
}

.katex .sqrt > .root {
  margin-right: 0.08em;
}

[data-doc-type] .katex .base {
  white-space: nowrap;
}
`);
  } catch {
    _katexCssCache = "";
  }

  return _katexCssCache;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeCssContent(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function stripDangerousMarkup(html: string) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "");
}

function resolveCssPageSize(layoutConfig: DocumentLayoutConfig, html: string) {
  const isRubricDocument =
    /data-doc-type=(['"])rubric\1/i.test(html) || /data-rubric=(['"])true\1/i.test(html);

  if (!isRubricDocument) {
    return layoutConfig.pageSize;
  }

  return layoutConfig.pageSize === "Letter" ? "Letter landscape" : "A4 landscape";
}

function buildPrintCss(layoutConfig: DocumentLayoutConfig, html: string) {
  const { margins, headerText, footerText, showPageNumbers } = layoutConfig;
  const footerContentParts = [
    footerText?.trim() ? `"${escapeCssContent(footerText.trim())}"` : "",
    showPageNumbers ? `"第 " counter(page) " 页"` : "",
  ].filter(Boolean);
  const resolvedPageSize = resolveCssPageSize(layoutConfig, html);

  return `
    @page {
      size: ${resolvedPageSize};
      margin: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      font-family: "PingFang SC", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif;
      color: #000000;
    }

    [data-print-shell] {
      position: relative;
      min-height: 100vh;
    }

    @media print {
      /*
       * 项目全局样式会在打印态把 body * 全部设成 hidden，
       * 导出 HTML 必须显式把打印容器和其后代重新设为 visible。
       */
      [data-print-shell],
      [data-print-shell] * {
        visibility: visible !important;
      }

      [data-print-shell] {
        position: relative !important;
        inset: auto !important;
        width: auto !important;
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
        background: white !important;
      }
    }

    ${
      headerText
        ? `
    [data-print-shell]::before {
      content: "${escapeCssContent(headerText)}";
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 10mm;
      color: #737373;
      font-size: 10px;
      line-height: 10mm;
      text-align: center;
      pointer-events: none;
    }`
        : ""
    }

    ${
      footerContentParts.length > 0
        ? `
    [data-print-shell]::after {
      content: ${footerContentParts.join(" \" · \" ")};
      position: fixed;
      left: 0;
      bottom: 0;
      height: 10mm;
      color: #9B9DA4;
      font-size: 9px;
      line-height: 10mm;
      text-align: left;
      padding-left: 12px;
      pointer-events: none;
    }`
        : ""
    }
  `;
}

/**
 * PDF 专用覆盖样式：解耦 Canvas 宽度，在 A4 视口下最优排版。
 * academic-print.css 中 [data-doc-type] 有 max-width: 800px 和 padding: 2rem，
 * 这是为屏幕阅读设计的。PDF 渲染时不需要这些约束。
 */
const PDF_OVERRIDE_CSS = `
  /* 解除屏幕阅读的宽度约束 */
  [data-doc-type] {
    max-width: none;
    padding: 0;
    margin: 0;
  }

  /* PDF 专用字体大小（pt 更精确） */
  [data-doc-type] { font-size: 11pt; line-height: 1.6; color: #000; }
  [data-doc-type] h1 { font-size: 15pt; font-weight: 700; }
  [data-doc-type] h2 { font-size: 12.5pt; font-weight: 700; }
  [data-doc-type] h3 { font-size: 11.5pt; font-weight: 600; }

  /* 题干文字加粗，让题目更醒目 */
  [data-question] { font-weight: 500; }
  [data-question] p:first-child { font-weight: 500; }
  [data-doc-type] strong { font-weight: 700; }

  /* Rubric 表格：PDF 下有更多空间，优化列宽 */
  [data-doc-type="rubric"] table[data-rubric] {
    table-layout: fixed;
    font-size: 9.5pt;
  }

  /* 确保表格边框在 PDF 中清晰 */
  [data-doc-type] th,
  [data-doc-type] td {
    border: 1px solid #333;
  }

  /* 答题框在 PDF 中更明显 */
  [data-answer-space] {
    border: 1.5px dashed #666;
  }

  /* Markdown artifact 导出：匹配 Canvas 中 prose 排版 */
  [data-doc-type="markdown"] {
    font-size: 10.5pt;
    line-height: 1.7;
    color: #1e293b;
  }
  [data-doc-type="markdown"] h1 { font-size: 16pt; margin: 1.2em 0 0.6em; font-weight: 700; }
  [data-doc-type="markdown"] h2 { font-size: 13pt; margin: 1em 0 0.5em; font-weight: 600; }
  [data-doc-type="markdown"] h3 { font-size: 11.5pt; margin: 0.8em 0 0.4em; font-weight: 600; }
  [data-doc-type="markdown"] p { margin: 0.5em 0; }
  [data-doc-type="markdown"] ul,
  [data-doc-type="markdown"] ol { margin: 0.4em 0; padding-left: 1.5em; }
  [data-doc-type="markdown"] li { margin: 0.2em 0; }
  [data-doc-type="markdown"] pre {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 0.8em 1em;
    font-size: 9.5pt;
    overflow-x: auto;
  }
  [data-doc-type="markdown"] code {
    background: #f1f5f9;
    padding: 0.15em 0.35em;
    border-radius: 4px;
    font-size: 0.9em;
  }
  [data-doc-type="markdown"] pre code {
    background: none;
    padding: 0;
  }
  [data-doc-type="markdown"] blockquote {
    border-left: 3px solid #cbd5e1;
    padding-left: 1em;
    margin: 0.6em 0;
    color: #475569;
  }
  [data-doc-type="markdown"] table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.6em 0;
  }
  [data-doc-type="markdown"] th,
  [data-doc-type="markdown"] td {
    border: 1px solid #cbd5e1;
    padding: 0.4em 0.6em;
    font-size: 10pt;
  }
  [data-doc-type="markdown"] th {
    background: #f8fafc;
    font-weight: 600;
  }
  [data-doc-type="markdown"] .katex-display {
    margin: 0.6em 0;
  }
`;

function ensureDocumentHtml(params: {
  html: string;
  title?: string | null;
  layoutConfig: DocumentLayoutConfig;
}) {
  const normalizedDocumentHtml = normalizeDocumentHtml(params.html);
  const sanitized = expandHtmlMathMarkup(stripDangerousMarkup(normalizedDocumentHtml));
  const hasFullDocument = /<html[\s>]/i.test(sanitized);
  const printCss = buildPrintCss(params.layoutConfig, sanitized);
  const title = params.title?.trim() || "Document";

  // 检测是否是 Skill HTML 文档（含 data-doc-type 属性）
  const isSkillHtml = /data-doc-type=/i.test(sanitized);
  const academicCss = isSkillHtml ? getAcademicPrintCss() : "";
  const katexCss = /class=(['"])[^'"]*\bkatex\b/i.test(sanitized) ? getKatexPrintCss() : "";

  // 合并所有 CSS：学术排版基础 → PDF 覆盖 → 页面布局
  const allCss = [
    academicCss,
    katexCss,
    isSkillHtml ? PDF_OVERRIDE_CSS : "",
    printCss,
  ].filter(Boolean).join("\n");

  if (hasFullDocument) {
    if (/<\/head>/i.test(sanitized)) {
      return sanitized.replace(/<\/head>/i, `<style>${allCss}</style></head>`);
    }
    return sanitized.replace(
      /<html[^>]*>/i,
      `$&<head><meta charset="utf-8" /><title>${escapeHtml(title)}</title><style>${allCss}</style></head>`,
    );
  }

  const watermarkCss = `
    .deskmate-export-watermark {
      position: fixed;
      bottom: 2mm;
      right: 2mm;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 7px;
      opacity: 0.55;
      pointer-events: none;
      z-index: 9999;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .deskmate-export-watermark .wm-powered {
      font-family: "Palatino", "Georgia", serif;
      font-style: italic;
      font-size: 6pt;
      color: #858481;
      letter-spacing: 0.04em;
      line-height: 1;
    }
    .deskmate-export-watermark .wm-brand-wrap {
      display: flex;
      align-items: center;
    }
    .deskmate-export-watermark .wm-d-svg {
      width: 13px;
      height: 13px;
      fill: none;
      stroke: #3B2A22;
      stroke-width: 2.2px;
      stroke-linejoin: round;
      margin-right: 1.5px;
      transform: translateY(-1px);
    }
    .deskmate-export-watermark .wm-brand {
      font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 9pt;
      font-weight: 600;
      color: #3B2A22;
      letter-spacing: 0.02em;
      line-height: 1;
    }
  `;

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>${allCss}\n${watermarkCss}</style>
  </head>
  <body>
    <div data-print-shell data-print-content="true">${sanitized}</div>
    <div class="deskmate-export-watermark" aria-hidden="true">
      <span class="wm-powered">powered by</span>
      <div class="wm-brand-wrap">
        <svg class="wm-d-svg" xmlns="http://www.w3.org/2000/svg" viewBox="2 2 20 20"><path d="M20 4 L20 20 L4 20 Z"/></svg>
        <span class="wm-brand">eskmate</span>
      </div>
    </div>
  </body>
</html>`;
}

export async function renderDocumentPdf(params: {
  html: string;
  title?: string | null;
  layoutConfig: DocumentLayoutConfig;
}) {
  const browser = await launchDocumentBrowser();

  try {
    const page = await browser.newPage();
    await page.emulateMediaType("print");
    await page.setContent(
      ensureDocumentHtml({
        html: params.html,
        title: params.title,
        layoutConfig: params.layoutConfig,
      }),
      {
        waitUntil: "networkidle0",
        timeout: 20_000,
      },
    );

    // 等待 KaTeX 字体加载完成（file:// URL 不触发 networkidle）
    await page.evaluate(() => document.fonts.ready);

    const pdf = await page.pdf({
      format: params.layoutConfig.pageSize === "Letter" ? "letter" : "a4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
      },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => undefined);
  }
}
