import {
  buildDocumentArticleHtml,
  buildMarkdownContentHtml,
  buildMarkdownArticleHtml,
} from "../../lib/doc-engine/document-article-html";
import { normalizeDocumentHtml } from "../../lib/doc-engine/editor-html";
import { expandHtmlMathMarkup } from "../../lib/doc-engine/html-math";
import {
  normalizeMathHtml,
  normalizeMathText,
  hasMathRenderFailure,
} from "../../lib/doc-engine/math-core";
import { buildRubricHtmlFromDocument } from "../../lib/doc-engine/rubric-html";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
    return;
  }

  failed += 1;
  failures.push(message);
  console.error(`  FAIL: ${message}`);
}

function describe(name: string, fn: () => void | Promise<void>) {
  console.log(`\n${name}`);
  return Promise.resolve(fn());
}

async function it(name: string, fn: () => void | Promise<void>) {
  const failedBefore = failed;
  try {
    await fn();
    if (failed === failedBefore) {
      console.log(`  PASS: ${name}`);
    }
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    console.error(`  FAIL: ${name}: ${message}`);
  }
}

async function main() {
  await describe("buildDocumentArticleHtml", async () => {
    await it("应把题干、选项和解析里的 markdown 图片转成真实 img 标签", () => {
      const html = buildDocumentArticleHtml({
        id: "doc-1",
        type: "exercises",
        title: "图片题",
        meta: {},
        layoutConfig: {
          pageSize: "A4",
          columns: 1,
          margins: {
            top: 24,
            right: 24,
            bottom: 24,
            left: 24,
          },
          showPageNumbers: false,
        },
        blocks: [
          {
            id: "question-1",
            type: "question",
            data: {
              number: 1,
              stem: "Select the odd one out.\n\n![stem](/api/pdf/scan-image?path=stem)",
              questionType: "mc",
              options: [
                {
                  label: "A",
                  text: "![option-a](/api/pdf/scan-image?path=a)",
                },
                {
                  label: "B",
                  text: "Tree",
                },
              ],
              explanation:
                "观察图片。\n\n![explanation](/api/pdf/scan-image?path=explain)",
            },
          },
        ],
      }) ?? "";

      assert(
        html.includes('<img src="/api/pdf/scan-image?path=stem" alt="stem" />'),
        "题干图片应输出为 img",
      );
      assert(
        html.includes('<img src="/api/pdf/scan-image?path=a" alt="option-a" />'),
        "选项图片应输出为 img",
      );
      assert(
        html.includes('<img src="/api/pdf/scan-image?path=explain" alt="explanation" />'),
        "解析图片应输出为 img",
      );
      assert(!html.includes("![stem]("), "题干里不应保留 markdown 图片原文");
      assert(!html.includes("![option-a]("), "选项里不应保留 markdown 图片原文");
    });

    await it("应把 LaTeX 公式输出为 Tiptap 数学标签，而不是保留原始美元符号", () => {
      const html = buildDocumentArticleHtml({
        id: "lesson-math",
        type: "lesson-plan",
        title: "含公式教案",
        meta: {},
        layoutConfig: {
          pageSize: "A4",
          columns: 1,
          margins: {
            top: 24,
            right: 24,
            bottom: 24,
            left: 24,
          },
          showPageNumbers: false,
        },
        blocks: [
          {
            id: "lesson-step-math",
            type: "lesson-step",
            data: {
              phase: "instruction",
              title: "公式讲解",
              summary: [
                "链式法则：$\\dfrac{d}{dx}[f(g(x))]=f'(g(x))\\cdot g'(x)$",
                "$$\\frac{dV}{dt}=4\\pi r^2\\frac{dr}{dt}$$",
              ].join("\n\n"),
            },
          },
        ],
      }) ?? "";

      assert(html.includes("<math-inline"), "行内公式应输出为 math-inline 标签");
      assert(html.includes("<math-display"), "块级公式应输出为 math-display 标签");
      assert(!html.includes("$\\dfrac{d}{dx}"), "不应保留行内公式原始美元符号");
      assert(!html.includes("$$\\frac{dV}{dt}"), "不应保留块级公式原始美元符号");
    });

    await it("应保留被反斜杠转义的下划线空格线，而不是错误转成斜体噪音", () => {
      const html = buildDocumentArticleHtml({
        id: "worksheet-escaped-underscores",
        type: "notes",
        title: "Chain Rule Practice",
        meta: {},
        layoutConfig: {
          pageSize: "A4",
          columns: 1,
          margins: {
            top: 24,
            right: 24,
            bottom: 24,
            left: 24,
          },
          showPageNumbers: false,
        },
        blocks: [
          {
            id: "instruction-blank-lines",
            type: "instruction",
            data: {
              text: [
                "**Name:** \\_\\_\\_\\_\\_\\_  **Date:** \\_\\_\\_\\_",
                "$f'(x) =$ \\_\\_\\_\\_\\_\\_\\_\\_",
                "&nbsp;",
              ].join("\n\n"),
            },
          },
        ],
      }) ?? "";

      assert(
        !html.includes("\\<em>\\</em>"),
        "转义下划线不应被错误转换成斜体噪音",
      );
      assert(
        html.includes("Name:</strong> ______"),
        "姓名空格线应保留为可见下划线",
      );
      assert(
        html.includes('<math-inline data-latex="f&#39;(x) ="></math-inline> ________'),
        "公式后的空格线应保留为可见下划线",
      );
      assert(
        html.includes("<p>&nbsp;</p>"),
        "显式空白占位行应保留为 HTML 空格实体",
      );
    });

    await it("应能把数学标签展开为 Canvas 可见的 KaTeX HTML", () => {
      const html = buildDocumentArticleHtml({
        id: "lesson-math-expanded",
        type: "lesson-plan",
        title: "含公式教案",
        meta: {},
        layoutConfig: {
          pageSize: "A4",
          columns: 1,
          margins: {
            top: 24,
            right: 24,
            bottom: 24,
            left: 24,
          },
          showPageNumbers: false,
        },
        blocks: [
          {
            id: "lesson-step-math-expanded",
            type: "lesson-step",
            data: {
              phase: "instruction",
              title: "公式讲解",
              summary:
                "链式法则：$\\dfrac{d}{dx}[f(g(x))]=f'(g(x))\\cdot g'(x)$\n\n$$\\frac{dV}{dt}=4\\pi r^2\\frac{dr}{dt}$$",
            },
          },
        ],
      }) ?? "";

      const expanded = expandHtmlMathMarkup(html);
      assert(expanded.includes('class="katex"'), "展开后应包含 KaTeX HTML");
      assert(!expanded.includes("<math-inline"), "展开后不应再保留 math-inline 标签");
      assert(!expanded.includes("<math-display"), "展开后不应再保留 math-display 标签");
      assert(!expanded.includes("katex-mathml"), "展开后不应混入 MathML 回退分支");
      assert(!/<math\b/i.test(expanded), "展开后不应保留浏览器原生 math 标签");
    });

    await it("应把显式公式分隔符和高置信度裸 TeX 收口为语义数学节点", () => {
      const normalizedText = normalizeMathText(
        [
          "链式法则：$\\dfrac{d}{dx}[f(g(x))]=f'(g(x))\\cdot g'(x)$",
          "故收敛区间为 −1≤x<5-1 \\leq x < 5−1≤x<5。",
        ].join("\n"),
      );

      assert(
        normalizedText.includes('<math-inline data-latex="\\dfrac{d}{dx}[f(g(x))]=f&#39;(g(x))\\cdot g&#39;(x)"></math-inline>'),
        "显式行内公式应归一为 math-inline",
      );
      assert(
        normalizedText.includes('<math-inline data-latex="-1 \\leq x &lt; 5"></math-inline>'),
        "高置信度裸 TeX 片段应归一为规范化 math-inline",
      );
      assert(!normalizedText.includes("$\\dfrac"), "显式美元分隔符不应保留");
      assert(!normalizedText.includes("−1≤x<5-1"), "重复渲染噪声不应保留在正文中");
    });

    await it("应把 AP 纯文本级数表达式统一收口为语义数学节点", () => {
      const normalizedText = normalizeMathText(
        "The infinite series ∑(k=1 to ∞) a_k has nth partial sum S_n = (-1)^(n+1) for n ≥ 1.",
      );

      assert(
        normalizedText.includes('<math-inline data-latex="\\sum_{k=1}^{\\infty} a_{k}"></math-inline>'),
        "纯文本求和符号应归一为规范化求和公式",
      );
      assert(
        normalizedText.includes('<math-inline data-latex="S_{n} = (-1)^{n+1}"></math-inline>'),
        "纯文本上下标与幂表达式应归一为规范化公式",
      );
      assert(!normalizedText.includes("∑(k=1 to ∞)"), "原始纯文本求和写法不应残留在正文中");
      assert(!normalizedText.includes("(-1)^(n+1)"), "原始纯文本幂写法不应残留在正文中");
    });

    await it("应兼容 Unicode Σ 级数写法，并把简单分式方程右侧并入同一个数学节点", () => {
      const normalizedText = normalizeMathText(
        "The infinite series Σ(k=1 to ∞) a_k has nth partial sum S_n = n/(3n+1) for n ≥ 1. What is the value of Σ(n=0 to ∞) (−2/3)^n?",
      );

      assert(
        normalizedText.includes('<math-inline data-latex="\\sum_{k=1}^{\\infty} a_{k}"></math-inline>'),
        "Unicode Sigma summation should be normalized into a standard inline formula",
      );
      assert(
        normalizedText.includes('<math-inline data-latex="S_{n} = n/(3n+1)"></math-inline>'),
        "subscript equations with a simple fractional rhs should stay inside one inline formula",
      );
      assert(
        normalizedText.includes('<math-inline data-latex="\\sum_{n=0}^{\\infty} (-2/3)^n"></math-inline>'),
        "Unicode Sigma geometric series terms should stay attached to the summation formula",
      );
      assert(!normalizedText.includes("Σ(k=1 to ∞)"), "raw Unicode Sigma notation should not remain in the text");
      assert(!normalizedText.includes("Σ(n=0 to ∞)"), "raw Unicode Sigma notation should be fully normalized");
    });

    await it("应在共享 markdown 展示链里先收口数学，再处理下划线与裸 TeX", () => {
      const seriesPreview = expandHtmlMathMarkup(
        buildMarkdownContentHtml(
          "The infinite series ∑(k=1 to ∞) a_k has nth partial sum S_n = n/(3n+1) for n ≥ 1. What is the sum of the series ∑(k=1 to ∞) a_k?",
        ),
      );
      const rawTexPreview = expandHtmlMathMarkup(
        buildMarkdownContentHtml(
          String.raw`The sum of the series \frac{2^1}{1!}\frac{2^2}{2!}\frac{2^3}{3!} + \ldots + \frac{2^n}{n!} + \ldots is`,
        ),
      );
      const lnPreview = expandHtmlMathMarkup(
        buildMarkdownContentHtml(
          String.raw`What is the sum of the series 1 + \ln \frac{(\ln 2)^2}{2!} + \cdots + \frac{(\ln 2)^n}{n!} + \cdots ?`,
        ),
      );

      assert(
        !seriesPreview.includes("<em>"),
        "subscript expressions in question previews should not be misread as markdown italics",
      );
      assert(
        seriesPreview.includes('class="katex"'),
        "plain-text AP series preview should expand into KaTeX HTML",
      );
      assert(
        !rawTexPreview.includes("\\frac"),
        "bare TeX fractions should not remain as raw text in question previews",
      );
      assert(
        !rawTexPreview.includes("katex-error"),
        "bare TeX fractions should not be split into invalid KaTeX fragments",
      );
      assert(
        !lnPreview.includes("\\ln"),
        "bare TeX function commands should not remain as raw text in question previews",
      );
      assert(
        lnPreview.includes('class="katex"'),
        "mixed bare TeX expressions should still expand into KaTeX HTML",
      );
    });

    await it("应在共享 markdown 展示链里把 Unicode Σ 题干渲染成统一 KaTeX 公式", () => {
      const sigmaPreview = expandHtmlMathMarkup(
        buildMarkdownContentHtml(
          "The infinite series Σ(k=1 to ∞) a_k has nth partial sum S_n = n/(3n+1) for n ≥ 1. What is the value of Σ(n=0 to ∞) (−2/3)^n?",
        ),
      );

      assert(!sigmaPreview.includes("Σ(k=1 to ∞)"), "raw Unicode Sigma text should not remain in previews");
      assert(!sigmaPreview.includes("Σ(n=0 to ∞)"), "geometric Unicode Sigma text should not remain in previews");
      assert(
        sigmaPreview.includes('class="katex"'),
        "shared question previews should expand Unicode Sigma formulas into KaTeX HTML",
      );
      assert(
        !sigmaPreview.includes("katex-error"),
        "shared question previews should not split Unicode Sigma formulas into invalid KaTeX fragments",
      );
    });

    await it("应在共享 markdown 展示链里兼容没有空格的 Unicode Σ 区间写法", () => {
      const compactSigmaPreview = expandHtmlMathMarkup(
        buildMarkdownContentHtml(
          "If a_n = 1, what is the value of the infinite series Σ(n = 1to∞) a_n?",
        ),
      );

      assert(
        compactSigmaPreview.includes('class="katex"'),
        "compact Unicode Sigma bounds should still expand into KaTeX HTML",
      );
      assert(
        !compactSigmaPreview.includes("Σ(n = 1to∞)"),
        "compact raw Sigma notation should not remain in shared previews",
      );
      assert(
        !compactSigmaPreview.includes("katex-error"),
        "compact Unicode Sigma bounds should not create invalid KaTeX fragments",
      );
    });

    await it("应先把显式美元公式收口为数学标签，再处理 markdown 斜体与下划线", () => {
      const preview = expandHtmlMathMarkup(
        buildMarkdownContentHtml(
          "The infinite series $\\sum_{k=1}^{\\infty} a_k$ has nth partial sum $S_n = n/(3n+1)$ for n $\\geq 1$. What is the sum of the series $\\sum_{k=1}^{\\infty} a_k$?",
        ),
      );

      assert(!preview.includes("$sum"), "explicit dollar-delimited formulas should not leak raw dollar markup");
      assert(!preview.includes("<em>"), "math subscripts should not be misread as markdown italics");
      assert(!preview.includes("\\sum"), "raw LaTeX commands should not remain in rendered previews");
      assert(
        preview.includes('class="katex"'),
        "explicit inline formulas should still render through KaTeX after inline markdown formatting",
      );
    });

    await it("应在共享展示链里跳过代码样式行，避免把编程题赋值语句渲染成数学公式", () => {
      const preview = expandHtmlMathMarkup(
        buildMarkdownContentHtml(
          [
            "Consider the following code segment.",
            "",
            "int x = 3;",
            "num *= 2;",
            "System.out.print(x);",
            "/* data type 1 */ y = true;",
          ].join("\n"),
        ),
      );

      assert(preview.includes("int x = 3;"), "code assignment lines should stay as plain text in previews");
      assert(preview.includes("num *= 2;"), "compound assignment lines should stay as plain text in previews");
      assert(!preview.includes("katex-error"), "code-like lines should not create KaTeX failures");
      assert(!preview.includes("\\cdot ="), "code-like operators should not be rewritten as math operators");
    });

    await it("应把半显式半纯文本的旧级数题统一并入同一个 KaTeX 公式链", () => {
      const preview = expandHtmlMathMarkup(
        buildMarkdownContentHtml(
          String.raw`The infinite series Σ(k=1 to $\infty) a_k$ has nth partial sum $S_n$ = n/(3n+1) for n ≥ 1. What is the sum of the series Σ(k=1 to $\infty) a_k$?`,
        ),
      );

      assert(!preview.includes("Σ(k=1 to"), "split Sigma prefix text should not remain outside math tags");
      assert(!preview.includes("n/(3n+1)"), "equation rhs should not remain as plain text outside KaTeX");
      assert(
        preview.includes('class="katex"'),
        "mixed legacy Sigma notation should still render through KaTeX",
      );
      assert(
        !preview.includes("katex-error"),
        "mixed legacy Sigma notation should not degrade into KaTeX errors",
      );
    });

    await it("应把显式求和后面接的纯文本阶乘级数尾巴并入同一个公式", () => {
      const preview = expandHtmlMathMarkup(
        buildMarkdownContentHtml(
          String.raw`$\sum_{n=0}^{\infty} (−1)^{n}$ π^(2n+1)/(2n)! = π − π^{3}/2! + π^{5}/4! − π^{7}/6! + ··· is`,
        ),
      );

      assert(!preview.includes("π^(2n+1)"), "raw pi power tails should not remain outside KaTeX");
      assert(!preview.includes("(2n)!"), "factorial tails should be folded into math rendering");
      assert(
        preview.includes('class="katex"'),
        "mixed explicit/plain series tails should expand into KaTeX HTML",
      );
      assert(
        !preview.includes("katex-error"),
        "mixed explicit/plain series tails should not create invalid KaTeX fragments",
      );
    });

    await it("应修复被双反斜杠与转义美元符号污染的显式 LaTeX 预览", () => {
      const malformedPreview = expandHtmlMathMarkup(
        buildMarkdownContentHtml(
          String.raw`What is the sum of the series \$\\sum^∞_{n=1} \\frac{(-2)^n}{e^{n+1}}\$?`,
        ),
      );

      assert(
        malformedPreview.includes('class="katex"'),
        "escaped explicit latex should still render into KaTeX HTML in shared previews",
      );
      assert(
        !malformedPreview.includes("katex-error"),
        "escaped explicit latex should not degrade into red KaTeX error text",
      );
      assert(
        !malformedPreview.includes("\\$\\\\sum"),
        "shared previews should not keep escaped dollar wrappers around repaired formulas",
      );
    });

    await it("应避免把历史 math-inline 标签里的显式 LaTeX 再次拆成半截公式", () => {
      const normalized = normalizeMathText(
        'The sum of the series <math-inline data-latex="1 + \\\\frac{2^1}{1!} + \\\\frac{2^2}{2!} + \\\\frac{2^3}{3!} + \\\\cdots + \\\\frac{2^n}{n!} + \\\\cdots"></math-inline> is',
      );
      const preview = expandHtmlMathMarkup(buildMarkdownContentHtml(
        'The sum of the series <math-inline data-latex="1 + \\\\frac{2^1}{1!} + \\\\frac{2^2}{2!} + \\\\frac{2^3}{3!} + \\\\cdots + \\\\frac{2^n}{n!} + \\\\cdots"></math-inline> is',
      ));

      assert(
        normalized.includes('<math-inline data-latex="1 + \\frac{2^1}{1!} + \\frac{2^2}{2!} + \\frac{2^3}{3!} + \\cdots + \\frac{2^n}{n!} + \\cdots"></math-inline>'),
        "historical inline math tags should survive normalization as one complete math node",
      );
      assert(
        !normalized.includes('<math-inline data-latex="\\frac{2^2}{2"></math-inline>'),
        "normalization should not split historical inline math tags into nested fragments",
      );
      assert(
        preview.includes('class="katex"'),
        "historical inline math tags should still expand into KaTeX HTML in shared previews",
      );
      assert(
        !preview.includes("katex-error"),
        "historical inline math tags should not degrade into red KaTeX error text",
      );
    });

    await it("应在共享预览链里完整保留转义美元公式中的 \\sum 与 \\frac", () => {
      const preview = expandHtmlMathMarkup(
        buildMarkdownContentHtml(
          String.raw`What is the sum of the series \$\sum_{n=1}^{\infty} \frac{(-2)^n}{e^{n+1}}\$?`,
        ),
      );

      assert(
        preview.includes('class="katex"'),
        "escaped inline formulas should still expand into KaTeX HTML",
      );
      assert(
        !preview.includes("katex-error"),
        "escaped inline formulas should not be split into invalid KaTeX fragments",
      );
      assert(
        !preview.includes("\\$\\s"),
        "shared previews should not leave escaped dollar wrappers or chopped command prefixes behind",
      );
    });

    await it("应清理残留的 math-inline 尾巴，并保持题干与解析预览可渲染", () => {
      const brokenTailPreview = expandHtmlMathMarkup(
        buildMarkdownContentHtml(
          String.raw`To find an equivalent expression for (x + $2)^4$, the terms are $\cdot x^3\cdot 2, 6\cdot x^2\cdot 2^2, 4\cdot x\cdot 2^3, and 2^4$\"></math-inline>. Summing these terms yields $x^4 + 8x^3 + 24x^2 + 32x$ + 16.`,
        ),
      );

      assert(
        brokenTailPreview.includes('class="katex"'),
        "malformed math-tag tails should still leave the repaired formula renderable as KaTeX",
      );
      assert(
        !brokenTailPreview.includes("</math-inline>"),
        "broken trailing math-inline closers should be removed from the rendered preview",
      );
      assert(
        !brokenTailPreview.includes("katex-error"),
        "broken trailing math-inline closers should not degrade the preview into KaTeX fallback errors",
      );
    });

    await it("应在共享预览链里修复被错误截断的行内美元公式", () => {
      const preview = expandHtmlMathMarkup(
        buildMarkdownContentHtml(
          String.raw`Which of the following definite integrals are equal to lim $n→\infty ∑k=1^{n} \sin(-1$ + 5k/n) 5/n?`,
        ),
      );

      assert(
        preview.includes('class="katex"'),
        "repaired truncated inline formulas should still render through KaTeX",
      );
      assert(
        !preview.includes("katex-error"),
        "repaired truncated inline formulas should not trigger KaTeX failures",
      );
      assert(
        !preview.includes(String.raw`\sin(-1$ + 5k/n)`),
        "broken inline dollar boundaries should not remain in shared previews",
      );
    });

    await it("应在共享预览链里合并同一公式内部被双美元打断的碎片", () => {
      const preview = expandHtmlMathMarkup(
        buildMarkdownContentHtml(
          String.raw`Which of the following definite integrals are equal to lim $n \to \infty ∑k=1^{n} (-2 +$$8k/n)^{3} 8/n$?`,
        ),
      );

      assert(
        preview.includes('class="katex"'),
        "double-dollar inline fragments should still render through KaTeX",
      );
      assert(
        !preview.includes("$$8k/n"),
        "broken double-dollar fragments should not remain in shared previews",
      );
      assert(
        !preview.includes("katex-error"),
        "double-dollar inline fragments should not produce KaTeX failures",
      );
    });

    await it("应在共享预览链里修复命令名被截断且同一公式再次被双美元打断的坏题", () => {
      const preview = expandHtmlMathMarkup(
        buildMarkdownContentHtml(
          String.raw`Which of the following definite integrals is equal to lim n→\inf$ty ∑k=1^{n} (12k/n)$$\cos(1 + 4k/n) 4/n$?`,
        ),
      );

      assert(
        preview.includes('class="katex"'),
        "split command-name formulas should still render through KaTeX",
      );
      assert(
        !preview.includes(String.raw`\inf$ty`),
        "broken command-name splits should not remain in shared previews",
      );
      assert(
        !preview.includes(String.raw`$$\cos`),
        "secondary double-dollar breaks should be removed in shared previews",
      );
      assert(
        !preview.includes("katex-error"),
        "split command-name formulas should not produce KaTeX failures",
      );
    });

    await it("应避免把高风险纯文本公式切成半截数学节点，并收口可识别的复杂级数", () => {
      const piecewise = "f(x) = {3x + 1 for x ≤ 2, 5x - 3 for x > 2}";
      const parametric = "x = ln(t + 1) and y = (1 + t)e^(-t)";
      const pairedFunctions = "f(x) = x^2 + 2, g(x) = x^2/4 + 2";
      const factorial = "(2/7)^{2n}(-1)^n/(2n+1)!";
      const polynomial = "f'(x)=x⁴+x² -2";
      const limit = "lim[h→0] (e^(2+h) - e^2)/h is";
      const oneSidedLimit = "lim(x→a-) f(x) ≠ lim(x→a+) f(x)";
      const bareLimit = "If lim [f(x)+6]/g(x)";
      const limitAsCondition = "lim f(x) = 3 as x→2";
      const compactLimitAsCondition = "lim f(x) = 8 asx→2";
      const reorderedLimit = "lim [cos x + 4e^x]/5e^x is as x→0";
      const rawTeXFraction = String.raw`\frac{d}{dx}(sin^{-1}(x^{2}))|_{x=1}/4 =`;
      const differential = "dy/dx = x - y with initial condition";
      const cubic = "x³ + 3x² - 9x + 7 is increasing";
      const series =
        "For x > 0, the power series 1 - x²/(3!) + x⁴/(5!) - x⁶/(7!) + ... + (-1)ⁿx^(2n)/((2n+1)!) + ... converges.";

      const normalizedPiecewise = normalizeMathText(piecewise);
      const normalizedParametric = normalizeMathText(parametric);
      const normalizedPairedFunctions = normalizeMathText(pairedFunctions);
      const normalizedFactorial = normalizeMathText(factorial);
      const normalizedPolynomial = normalizeMathText(polynomial);
      const normalizedLimit = normalizeMathText(limit);
      const normalizedOneSidedLimit = normalizeMathText(oneSidedLimit);
      const normalizedBareLimit = normalizeMathText(bareLimit);
      const normalizedLimitAsCondition = normalizeMathText(limitAsCondition);
      const normalizedCompactLimitAsCondition = normalizeMathText(compactLimitAsCondition);
      const normalizedReorderedLimit = normalizeMathText(reorderedLimit);
      const normalizedRawTeXFraction = normalizeMathText(rawTeXFraction);
      const normalizedDifferential = normalizeMathText(differential);
      const normalizedCubic = normalizeMathText(cubic);
      const normalizedSeries = normalizeMathText(series);

      assert(
        normalizedPiecewise === piecewise,
        "piecewise definitions should remain unchanged instead of being partially wrapped",
      );
      assert(
        normalizedParametric === parametric,
        "parametric systems should remain unchanged until a dedicated parser exists",
      );
      assert(
        normalizedPairedFunctions === pairedFunctions,
        "multiple inline equations should remain unchanged instead of being partially wrapped",
      );
      assert(
        normalizedFactorial.includes('<math-inline data-latex="(2/7)^{2n}(-1)^n/(2n+1)!"></math-inline>'),
        "factorial expressions should remain inside a single inline formula",
      );
      assert(
        normalizedPolynomial.includes('<math-inline data-latex="f&#39;(x)=x^{4}+x^{2} -2"></math-inline>'),
        "trailing signed constants should remain inside the same inline formula",
      );
      assert(
        normalizedLimit.includes('<math-inline data-latex="\\lim_{h \\to 0} (e^{2+h} - e^2)/h"></math-inline>'),
        "historical limit bracket notation should normalize into a single inline formula",
      );
      assert(
        normalizedOneSidedLimit.includes('<math-inline data-latex="\\lim_{x \\to a^{-}} f(x) \\neq \\lim_{x \\to a^{+}} f(x)"></math-inline>'),
        "parenthesized one-sided limits should normalize into a canonical inline formula",
      );
      assert(
        normalizedBareLimit.includes('<math-inline data-latex="\\lim (f(x)+6)/(g(x))"></math-inline>'),
        "bare grouped quotient limits should normalize into canonical math-inline output",
      );
      assert(
        normalizedLimitAsCondition.includes('<math-inline data-latex="\\lim_{x \\to 2} f(x) = 3"></math-inline>'),
        "trailing as x→2 clauses should canonicalize into limit subscripts",
      );
      assert(
        normalizedCompactLimitAsCondition.includes('<math-inline data-latex="\\lim_{x \\to 2} f(x) = 8"></math-inline>'),
        "compact OCR-like asx→2 tails should canonicalize into limit subscripts",
      );
      assert(
        normalizedReorderedLimit.includes('<math-inline data-latex="\\lim_{x \\to 0} (\\cos x + 4e^x)/(5e^x)"></math-inline> is'),
        "reordered OCR-style limit clauses should normalize into one canonical inline formula",
      );
      assert(
        normalizedRawTeXFraction.includes('<math-inline data-latex="\\frac{d}{dx}(\\sin^{-1}(x^{2}))|_{x=1}/4 ="></math-inline>'),
        "bare TeX fractions without delimiters should collapse before plain-text math rules split them apart",
      );
      assert(
        normalizedDifferential.includes('<math-inline data-latex="\\frac{dy}{dx} = x - y"></math-inline>'),
        "simple differential equations should remain inside one inline formula",
      );
      assert(
        normalizedCubic.includes('<math-inline data-latex="x^{3} + 3x^{2} - 9x + 7"></math-inline>'),
        "trailing positive constants should remain inside the same inline formula",
      );
      assert(
        normalizedSeries.includes('<math-inline data-latex="1 - x^{2}/(3!) + x^{4}/(5!) - x^{6}/(7!) + \\cdots + (-1)^{n}x^{2n}/((2n+1)!) + \\cdots"></math-inline>'),
        "series expansions with ellipsis should now be normalized into a single inline formula",
      );
      assert(!normalizedSeries.includes("x²"), "unicode superscripts should not remain after series normalization");
      assert(!normalizedSeries.includes("..."), "raw ellipsis should be normalized inside the series formula");
      assert(!normalizedFactorial.includes("(2n+1)$!"), "factorial should not be split away from the formula");
    });
    await it("应把题目句中的裸 TeX 分式整体收口为单个数学节点，避免只渲染局部幂次", () => {
      const html = buildMarkdownContentHtml(
        "Let H(x) be an antiderivative of \\frac{x^3+\\sin x}{x^2+2}. If H(5) = π, then H(2) =",
      );
      const expanded = expandHtmlMathMarkup(html);

      assert(
        html.includes('<math-inline data-latex="\\frac{x^3+\\sin x}{x^2+2}"></math-inline>'),
        "裸 TeX 分式应整体归一为单个 math-inline 节点",
      );
      assert(
        expanded.includes('class="katex"'),
        "展开后的题目 HTML 应包含 KaTeX 渲染结果",
      );
      assert(!expanded.includes("\\frac"), "展开后的题目 HTML 不应残留原始分式命令");
      assert(!expanded.includes("\\sin"), "展开后的题目 HTML 不应残留原始函数命令");
      assert(
        expanded.includes("If H(5) = π, then H(2) ="),
        "公式后面的普通题干文本应保持不变",
      );
    });

    await it("应在共享预览链中修复被美元符号切碎的 Maclaurin 级数公式并避免 KaTeX 红字", () => {
      const stem = String.raw`Which of the following is the Maclaurin series for x \cos($x^2$)?`;
      const choice = String.raw`$x - \frac{ x^5$}{2!} + \frac{$x^9$}{4!} - \frac{$x^{13}$}{6!} + \cdots`;
      const explanation =
        String.raw`Starting with cos u $= \Sigma(-1)^{n}u^{2n}/(2n)$! and substituting u $= x^{2}$: $\cos(x^{2}) = \Sigma(-1)^{n}x^{4n}/(2n)$!. Multiplying by x: $x\cdot \cos(x^{2}) = \Sigma(-1)^{n}x^{4n+1}/(2n)! = x - x^{5}/2! + x^{9}/4! -$...`;

      const normalizedStem = normalizeMathText(stem);
      const normalizedChoice = normalizeMathText(choice);
      const normalizedExplanation = normalizeMathText(explanation);
      const expandedStem = expandHtmlMathMarkup(buildMarkdownContentHtml(stem));
      const expandedChoice = expandHtmlMathMarkup(buildMarkdownContentHtml(choice));
      const expandedExplanation = expandHtmlMathMarkup(buildMarkdownContentHtml(explanation));

      assert(
        normalizedStem.includes('<math-inline data-latex="x \\cos(x^2)"></math-inline>'),
        "stem-level mixed raw latex should normalize into one inline math node",
      );
      assert(
        normalizedChoice.includes('<math-inline data-latex="x - \\frac{x^5}{2!} + \\frac{x^9}{4!} - \\frac{x^{13}}{6!} + \\cdots"></math-inline>'),
        "fragmented inline series choices should collapse into one inline math node",
      );
      assert(
        normalizedExplanation.includes('<math-inline data-latex="\\cos u = \\sum(-1)^{n}u^{2n}/(2n)!"></math-inline>'),
        "series explanations should rewrite \\Sigma into \\sum and merge factorial tails",
      );
      assert(
        expandedStem.includes('class="katex"') &&
          expandedChoice.includes('class="katex"') &&
          expandedExplanation.includes('class="katex"'),
        "shared preview html should expand these repaired formulas into KaTeX output",
      );
      assert(!expandedChoice.includes("katex-error"), "fragmented series choices should not produce KaTeX errors");
      assert(!expandedChoice.includes("\\frac"), "expanded choice html should not leak raw TeX commands");
      assert(!expandedExplanation.includes("\\Sigma"), "expanded explanation html should not leak raw Sigma commands");
    });

    await it("应跳过 code/pre 和已存在的数学节点，保持归一化幂等", () => {
      const rawHtml = [
        '<article data-doc-type="lesson-plan">',
        "<p>普通段落里有 $x^2$。</p>",
        "<pre>$x^2$ 不应被转换</pre>",
        "<code>\\(y\\)</code>",
        '<p><math-inline data-latex="z^2"></math-inline></p>',
        "</article>",
      ].join("");

      const normalizedOnce = normalizeMathHtml(rawHtml);
      const normalizedTwice = normalizeMathHtml(normalizedOnce);

      assert(
        normalizedOnce.includes('<math-inline data-latex="x^2"></math-inline>'),
        "普通文本中的显式公式应被转换",
      );
      assert(
        normalizedOnce.includes("<pre>$x^2$ 不应被转换</pre>"),
        "pre 中的公式文本不应被转换",
      );
      assert(
        normalizedOnce.includes("<code>\\(y\\)</code>"),
        "code 中的公式文本不应被转换",
      );
      assert(
        normalizedTwice === normalizedOnce,
        "已归一化的 HTML 再处理应保持幂等",
      );
    });

    await it("应在统一文档归一化时修复段落内重复公式噪声", () => {
      const normalized = normalizeDocumentHtml(`
        <article data-doc-type="worksheet">
          <p>故收敛区间为 −1≤x<5-1 \\leq x < 5−1≤x<5。</p>
        </article>
      `);

      assert(
        normalized.includes('<math-inline data-latex="-1 \\leq x &lt; 5"></math-inline>'),
        "段落中的高置信度公式噪声应被统一为规范语义数学节点",
      );
    });

    await it("应在统一文档归一化时修复历史遗留的反斜杠下划线噪音 HTML", () => {
      const normalized = normalizeDocumentHtml(`
        <article data-doc-type="notes">
          <p><math-inline data-latex="f&#39;(x) ="></math-inline> \\<em>\\</em>\\<em>\\</em>\\<em>\\</em>\\<em>\\</em></p>
          <p>&amp;nbsp;</p>
        </article>
      `);
      const expanded = expandHtmlMathMarkup(normalized);

      assert(
        !normalized.includes("\\<em>\\</em>"),
        "历史遗留的反斜杠下划线噪音应在归一化时被修复",
      );
      assert(
        normalized.includes('<math-inline data-latex="f&#39;(x) ="></math-inline> ________'),
        "历史遗留的空格线应恢复为普通下划线",
      );
      assert(
        normalized.includes("<p>&nbsp;</p>"),
        "历史遗留的 &amp;nbsp; 应恢复为 HTML 空格实体",
      );
      assert(
        !expanded.includes("\\<em>\\</em>"),
        "展开后的预览 HTML 不应再出现反斜杠斜体噪音",
      );
    });

    await it("应把重复渲染文本与原始 TeX 混排收口为单个数学节点", () => {
      const normalized = normalizeMathHtml(String.raw`
        <article>
          <p>
            2. Which of the following is the interval of convergence for the power series
            ∑n=1∞(x−2)nn⋅3n\displaystyle\sum_{n=1}^{\infty} \frac{(x-2)^n}{n \cdot 3^n}n=1∑∞​n⋅3n(x−2)n​?
          </p>
          <p>
            解析（修正）：在 x=−1x=-1x=−1 时，级数为
            ∑(−1)nn\sum\frac{(-1)^n}{n}∑n(−1)n​，交错级数收敛；
            在 x=5x=5x=5 时，级数为调和级数，发散。故收敛区间为
            −1≤x<5-1\leq x<5−1≤x<5。
          </p>
        </article>
      `);

      assert(
        normalized.includes('<math-display data-latex="\\displaystyle\\sum_{n=1}^{\\infty} \\frac{(x-2)^n}{n \\cdot 3^n}"></math-display>'),
        "幂级数应收口为单个块级数学节点",
      );
      assert(
        normalized.includes('<math-inline data-latex="\\sum\\frac{(-1)^n}{n}"></math-inline>'),
        "交错级数应收口为单个行内数学节点",
      );
      assert(
        normalized.includes('<math-inline data-latex="-1 \\leq x&lt;5"></math-inline>'),
        "区间端点应收口为规范化区间公式",
      );
      assert(!normalized.includes("∑n=1∞(x−2)nn⋅3n"), "重复幂级数渲染噪声应被移除");
      assert(!normalized.includes("∑(−1)nn"), "重复交错级数渲染噪声应被移除");
      assert(!normalized.includes("−1≤x<5-1"), "重复区间渲染噪声应被移除");
    });

    await it("Rubric HTML 应存储语义数学节点，而不是直接落库 KaTeX HTML", () => {
      const html = buildRubricHtmlFromDocument({
        id: "rubric-math",
        type: "rubric",
        title: "函数评分标准",
        meta: {},
        layoutConfig: {
          pageSize: "A4",
          columns: 1,
          margins: {
            top: 24,
            right: 24,
            bottom: 24,
            left: 24,
          },
          showPageNumbers: false,
        },
        blocks: [
          {
            id: "rubric-row-1",
            type: "rubric-row",
            data: {
              dimension: "公式表达",
              description: "考查学生是否正确使用函数符号。",
              weight: 25,
              levels: [
                { label: "优秀", score: 4, description: "能正确书写 $f(x)=x^2$ 并解释含义" },
                { label: "良好", score: 3, description: "能书写 $f(x)=x^2$ 但说明不完整" },
                { label: "达标", score: 2, description: "能部分写出 \\(f(x)\\)" },
                { label: "待提升", score: 1, description: "公式表达存在明显错误" },
              ],
            },
          },
        ],
      });

      assert(Boolean(html), "Rubric HTML 应成功生成");
      assert(
        Boolean(html?.includes("<math-inline")),
        "Rubric 单元格中的公式应以 math-inline 节点存储",
      );
      assert(
        !Boolean(html?.includes('class="katex"')),
        "Rubric HTML 不应直接落库 KaTeX 渲染结果",
      );
    });

    await it("应把 lesson plan 里的 blockquote、分隔线和列表渲染成真实 HTML，而不是显示 markdown 符号", () => {
      const html = buildDocumentArticleHtml({
        id: "lesson-1",
        type: "lesson-plan",
        title: "教案",
        meta: {},
        layoutConfig: {
          pageSize: "A4",
          columns: 1,
          margins: {
            top: 24,
            right: 24,
            bottom: 24,
            left: 24,
          },
          showPageNumbers: false,
        },
        blocks: [
          {
            id: "lesson-step-1",
            type: "lesson-step",
            data: {
              phase: "summary",
              title: "练习与评估",
              summary: [
                "AP 风格题（独立作答，不可用计算器）",
                "",
                "> 题目：设 $f(x) = x^2$，求 $f'(x)$。",
                "",
                "评估要点：",
                "完成后同桌互批，教师统一讲评。",
                "",
                "---",
              ].join("\n"),
              activities: [
                "是否正确求导。",
                "是否规范书写步骤。",
              ],
            },
          },
        ],
      }) ?? "";

      assert(html.includes("<blockquote>"), "blockquote 应输出为真实标签");
      assert(html.includes("<hr />"), "分隔线应输出为 hr");
      assert(html.includes("<ul><li>是否正确求导。</li><li>是否规范书写步骤。</li></ul>"), "活动列表应保留为列表");
      assert(!html.includes("&gt; 题目"), "不应把 blockquote 显示为字面量 >");
      assert(!html.includes("<p>---</p>"), "不应把分隔线显示为字面量 ---");
    });

    await it("应正确解析同一段中的混合 markdown 块，而不是把 >、---、### 和表格当纯文本", () => {
      const html = buildDocumentArticleHtml({
        id: "lesson-2",
        type: "lesson-plan",
        title: "教案",
        meta: {},
        layoutConfig: {
          pageSize: "A4",
          columns: 1,
          margins: {
            top: 24,
            right: 24,
            bottom: 24,
            left: 24,
          },
          showPageNumbers: false,
        },
        blocks: [
          {
            id: "lesson-step-2",
            type: "lesson-step",
            data: {
              phase: "summary",
              title: "练习与评估",
              summary: [
                "阶段：summary",
                "学生独立完成以下 AP 风格题。",
                "> 题目：设 $f(x)=x^2$，求 $f'(x)$。",
                "---",
                "**评估要点：**",
                "| 环节 | 时间 |",
                "|------|------|",
                "| 导入 | 5 分钟 |",
                "### 基础层",
              ].join("\n"),
            },
          },
        ],
      }) ?? "";

      assert(html.includes("<blockquote>"), "混合段内的 blockquote 应输出为真实标签");
      assert(html.includes("<hr />"), "混合段内的分隔线应输出为 hr");
      assert(html.includes("<table>"), "markdown 表格应输出为 table");
      assert(html.includes("<h3>基础层</h3>"), "markdown 小标题应输出为 heading");
      assert(!html.includes("&gt; 题目"), "混合段内不应保留字面量 >");
      assert(!html.includes("<p>---</p>"), "混合段内不应保留字面量 ---");
      assert(!html.includes("| 环节 | 时间 |"), "表格不应保留为 pipe 文本");
      assert(!html.includes("### 基础层"), "标题不应保留为 ### 文本");
    });

    await it("应支持直接把 lesson plan markdown 转成 Tiptap 可编辑 HTML，而不先经过易失真的 DocumentModel", () => {
      const html = buildMarkdownArticleHtml({
        documentType: "lesson-plan",
        title: "麦克劳林级数教案",
        markdown: [
          "# 麦克劳林级数教案",
          "",
          "## 六、练习与评估（10 分钟）",
          "",
          "阶段：summary",
          "",
          "> 题目：设 $f(x)=\\int_0^x e^{-t^2}\\,dt$，求 $f'(x)$。",
          "",
          "---",
          "",
          "| 环节 | 时间 |",
          "| --- | --- |",
          "| 导入 | 5 分钟 |",
          "",
          "### 基础层",
        ].join("\n"),
        eyebrow: "Lesson Plan",
      });

      assert(html.includes('<article data-doc-type="lesson-plan">'), "应输出 lesson-plan article");
      assert(html.includes("<h1>麦克劳林级数教案</h1>"), "应保留标题到 article header");
      assert(html.includes("<blockquote>"), "应直接渲染 markdown blockquote");
      assert(html.includes("<hr />"), "应直接渲染 markdown 分隔线");
      assert(html.includes("<table>"), "应直接渲染 markdown table");
      assert(html.includes("<h3>基础层</h3>"), "应直接渲染 markdown heading");
      assert(html.includes("<math-inline"), "应直接渲染公式为 math 节点");
      assert(!html.includes("&gt; 题目"), "不应保留字面量引用符号");
      assert(!html.includes("| 环节 | 时间 |"), "不应保留 pipe 表格原文");
      assert(!html.includes("### 基础层"), "不应保留 markdown heading 原文");
    });

    await it("应把 delta_x_1 与绝对值不等式统一渲染为可直接展开的数学节点", () => {
      const normalized = normalizeMathText(
        "The total change in position is delta_x_tot. If (1/2)|delta_x_1| < |delta_x_2| < |delta_x_1|, choose the correct relation.",
      );
      const expanded = expandHtmlMathMarkup(normalized);

      assert(
        normalized.includes('<math-inline data-latex="\\delta_{x_{tot}}"></math-inline>'),
        "delta_x_tot should become a greek-subscript math node",
      );
      assert(
        normalized.includes('<math-inline data-latex="(1/2)\\left|\\delta_{x_{1}}\\right| &lt; \\left|\\delta_{x_{2}}\\right| &lt; \\left|\\delta_{x_{1}}\\right|"></math-inline>'),
        "absolute-value relation should become one renderable math node",
      );
      assert(!normalized.includes("delta_x_1"), "raw underscored delta text should not remain in preview html");
      assert(!normalized.includes("left\\left|"), "absolute-value wrappers should not be duplicated in preview html");
      assert(!hasMathRenderFailure(normalized), "normalized preview math should be renderable by KaTeX");
      assert(expanded.includes('class="katex"'), "expanded preview html should contain KaTeX output");
      assert(!expanded.includes("doc-math-fallback"), "expanded preview html should not fall back to raw text");
    });

    await it("应把化学同位素的 OCR 简写渲染成统一 KaTeX 公式，而不是保留原始字符", () => {
      const normalized = normalizeMathText(
        ["A. 12/6 C", "B. ^{2}C (Z=6)", "C. ^{1}_{2}H"].join("\n"),
      );
      const expanded = expandHtmlMathMarkup(normalized);

      assert(expanded.includes('class="katex"'), "chemical isotope shorthand should render through KaTeX");
      assert(!normalized.includes("12/6 C"), "slash isotope shorthand should not remain as plain text");
      assert(!normalized.includes("^{2}C"), "leading superscript isotope shorthand should not remain as plain text");
      assert(!hasMathRenderFailure(normalized), "chemical isotope shorthand should remain renderable");
      assert(!expanded.includes("doc-math-fallback"), "chemical isotope shorthand should not fall back to raw text");
    });
  });

  console.log("\n==================================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
