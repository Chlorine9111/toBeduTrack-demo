import {
  buildExerciseContentFromLegacy,
  deriveLegacyExerciseFieldsFromContent,
  normalizeExerciseContent,
  normalizeExerciseContentForStorage,
  normalizeStoredExerciseText,
  readExerciseContent,
} from "../../lib/exercises/content";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(message);
    console.error(`  FAIL: ${message}`);
  }
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
    failed++;
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    console.error(`  FAIL: ${name}: ${message}`);
  }
}

async function main() {
  await describe("exercise content canonicalization", async () => {
    await it("应把 markdown 图片保留为独立 image block，并可回推旧平面字段", () => {
      const content = normalizeExerciseContent(
        buildExerciseContentFromLegacy({
          type: "MC",
          questionText: "Read the chart.\n\n![Chart](/storage/chart-1.png)",
          options: [
            { label: "A", text: "Option A", isCorrect: false },
            { label: "B", text: "Option B", isCorrect: true },
            { label: "C", text: "Option C", isCorrect: false },
            { label: "D", text: "Option D", isCorrect: false },
          ],
          correctAnswer: "B",
          solutionSteps: "Use the tallest bar.",
          commonMistakes: ["Misread the x-axis"],
        }),
      );

      const imageBlocks = content.stem.filter((block) => block.kind === "image");
      const derived = deriveLegacyExerciseFieldsFromContent(content);

      assert(content.type === "MC", "should preserve exercise type");
      assert(imageBlocks.length === 1, "should keep one image block in stem");
      assert(
        imageBlocks[0]?.kind === "image" &&
          imageBlocks[0].src === "/storage/chart-1.png",
        "should preserve the original image src",
      );
      assert(
        derived.questionText.includes("![Chart](/storage/chart-1.png)"),
        "derived markdown should still contain the image reference",
      );
      assert(derived.options?.length === 4, "should preserve four options");
      assert(derived.correctAnswer === "B", "should preserve correct answer");
      assert(
        derived.solutionSteps === "Use the tallest bar.",
        "should preserve explanation text",
      );
    });

    await it("应支持从 content_json 读取结构化题目，并保留选项正确性", () => {
      const parsed = readExerciseContent({
        version: 1,
        type: "MC",
        stem: [
          { id: "stem-1", kind: "text", text: "What is shown?" },
          { id: "stem-2", kind: "image", src: "/storage/figure.png", alt: "figure" },
        ],
        options: [
          {
            id: "opt-a",
            label: "A",
            blocks: [{ id: "opt-a-1", kind: "text", text: "Choice A" }],
            isCorrect: false,
          },
          {
            id: "opt-b",
            label: "B",
            blocks: [{ id: "opt-b-1", kind: "text", text: "Choice B" }],
            isCorrect: true,
          },
          {
            id: "opt-c",
            label: "C",
            blocks: [{ id: "opt-c-1", kind: "text", text: "Choice C" }],
            isCorrect: false,
          },
          {
            id: "opt-d",
            label: "D",
            blocks: [{ id: "opt-d-1", kind: "text", text: "Choice D" }],
            isCorrect: false,
          },
        ],
        answer: [{ id: "ans-1", kind: "text", text: "B" }],
        explanation: [{ id: "exp-1", kind: "text", text: "The figure labels B." }],
        answerSpace: null,
        commonMistakes: [],
      });

      assert(Boolean(parsed), "content_json should parse successfully");
      if (!parsed) return;

      const derived = deriveLegacyExerciseFieldsFromContent(parsed);
      assert(derived.questionText.includes("/storage/figure.png"), "should derive stem markdown with image");
      assert(
        derived.options?.find((option) => option.label === "B")?.isCorrect === true,
        "should preserve correct option flags",
      );
      assert(derived.correctAnswer === "B", "answer block should derive to legacy answer text");
    });

    await it("应把历史纯文本数学规范化为统一 LaTeX 存储格式", () => {
      const normalized = normalizeStoredExerciseText(
        "The infinite series ∑(k=1 to ∞) a_k has nth partial sum S_n = (-1)^(n+1).",
      );

      assert(
        normalized.includes("$\\sum_{k=1}^{\\infty} a_{k}$"),
        "plain-text summation should be normalized into inline LaTeX",
      );
      assert(
        normalized.includes("$S_{n} = (-1)^{n+1}$"),
        "plain-text power expressions should be normalized into inline LaTeX",
      );
      assert(!normalized.includes("∑(k=1 to ∞)"), "raw summation text should not remain after normalization");
      assert(!normalized.includes("(-1)^(n+1)"), "raw power text should not remain after normalization");
    });

    await it("应兼容 Unicode Σ 存储规范化，并保留简单分式方程右侧", () => {
      const normalized = normalizeStoredExerciseText(
        "The infinite series Σ(k=1 to ∞) a_k has nth partial sum S_n = n/(3n+1). What is the value of Σ(n=0 to ∞) (−2/3)^n?",
      );

      assert(
        normalized.includes("$\\sum_{k=1}^{\\infty} a_{k}$"),
        "Unicode Sigma summations should be normalized into inline LaTeX",
      );
      assert(
        normalized.includes("$S_{n} = n/(3n+1)$"),
        "subscript equations with a simple fractional rhs should stay inside one inline formula",
      );
      assert(
        normalized.includes("$\\sum_{n=0}^{\\infty} (-2/3)^n$"),
        "Unicode Sigma geometric series should keep the term attached inside the same inline formula",
      );
      assert(!normalized.includes("Σ(k=1 to ∞)"), "raw Unicode Sigma notation should not remain after normalization");
      assert(!normalized.includes("Σ(n=0 to ∞)"), "geometric Unicode Sigma notation should be fully normalized");
    });

    await it("应兼容没有空格的 Unicode Σ 区间写法，并统一为规范求和公式", () => {
      const normalized = normalizeStoredExerciseText(
        "If a_n = 1, what is the value of the infinite series Σ(n = 1to∞) a_n?",
      );

      assert(
        normalized.includes("$\\sum_{n=1}^{\\infty} a_{n}$"),
        "compact Sigma bounds should still normalize into canonical inline LaTeX",
      );
      assert(!normalized.includes("Σ(n = 1to∞)"), "compact raw Sigma notation should not remain after normalization");
    });

    await it("应修复半显式半纯文本的历史级数存储文本，而不是因出现美元公式就整题跳过", () => {
      const normalized = normalizeStoredExerciseText(
        String.raw`The infinite series Σ(k=1 to $\infty) a_k$ has nth partial sum $S_n$ = n/(3n+1) for n ≥ 1. What is the sum of the series Σ(k=1 to $\infty) a_k$?`,
      );

      assert(
        normalized.includes(String.raw`$\sum_{k=1}^{\infty} a_{k}$`),
        "split Sigma notation should be repaired into canonical inline LaTeX",
      );
      assert(
        normalized.includes(String.raw`$S_{n} = n/(3n+1)$`),
        "rhs fractions following an explicit lhs formula should be folded into the same inline formula",
      );
      assert(!normalized.includes(String.raw`Σ(k=1 to $\infty)`), "mixed legacy Sigma notation should not remain after storage normalization");
    });

    await it("应把显式求和后的纯文本阶乘级数尾巴并入同一个存储公式", () => {
      const normalized = normalizeStoredExerciseText(
        String.raw`$\sum_{n=0}^{\infty} (−1)^{n}$ π^(2n+1)/(2n)! = π − π^{3}/2! + π^{5}/4! − π^{7}/6! + ··· is`,
      );

      assert(
        normalized.startsWith(String.raw`$\sum_{n=0}^{\infty} (-1)^{n} \pi^{2n+1}/(2n)! = \pi - \pi^{3}/2! + \pi^{5}/4! - \pi^{7}/6! + \cdots$`),
        "mixed explicit/plain factorial series should be stored as one canonical inline formula",
      );
      assert(!normalized.includes("π^(2n+1)"), "raw pi power tails should not remain after normalization");
      assert(!normalized.includes("···"), "unicode ellipsis should be normalized inside stored formulas");
    });

    await it("应修复被双反斜杠与转义美元符号污染的显式 LaTeX 存储文本", () => {
      const normalized = normalizeStoredExerciseText(
        String.raw`What is the sum of the series \$\\sum^∞_{n=1} \\frac{(-2)^n}{e^{n+1}}\$?`,
      );

      assert(
        normalized.includes(String.raw`$\sum^{\infty}_{n=1} \frac{(-2)^n}{e^{n+1}}$?`),
        "escaped explicit latex should be rewritten into a canonical inline formula",
      );
      assert(!normalized.includes(String.raw`\$\\sum`), "escaped dollar wrappers should not remain after normalization");
      assert(!normalized.includes("^∞"), "Unicode infinity should be normalized inside explicit latex");
    });

    await it("应修复被错误截断的行内美元公式，并把后续数学尾巴并回同一个存储公式", () => {
      const normalized = normalizeStoredExerciseText(
        String.raw`Which of the following definite integrals are equal to lim $n→\infty ∑k=1^{n} \sin(-1$ + 5k/n) 5/n?`,
      );

      assert(
        normalized.includes(String.raw`$\lim_{n \to \infty} \sum_{k=1}^{n} \sin(-1 + 5k/n) 5/n$?`),
        "truncated inline formulas should be repaired into one canonical inline formula",
      );
      assert(
        !normalized.includes(String.raw`\sin(-1$ + 5k/n)`),
        "broken inline dollar boundaries should not remain after normalization",
      );
    });

    await it("应修复被双美元碎裂的行内公式，而不是把同一段数学拆成两个块", () => {
      const normalized = normalizeStoredExerciseText(
        String.raw`Which of the following definite integrals are equal to lim $n \to \infty ∑k=1^{n} (-2 +$$8k/n)^{3} 8/n$?`,
      );

      assert(
        normalized.includes(String.raw`$\lim_{n \to \infty} \sum_{k=1}^{n} (-2 + 8k/n)^{3} 8/n$?`),
        "double-dollar fragments inside one inline formula should be merged into a single canonical formula",
      );
      assert(!normalized.includes("$$8k/n"), "inner broken double-dollar fragments should be removed");
    });

    await it("应修复命令名被截断且同一公式再次被双美元打断的历史存储文本", () => {
      const normalized = normalizeStoredExerciseText(
        String.raw`Which of the following definite integrals is equal to lim n→\inf$ty ∑k=1^{n} (12k/n)$$\cos(1 + 4k/n) 4/n$?`,
      );

      assert(
        normalized.includes(String.raw`$\lim_{n \to \infty} \sum_{k=1}^{n} (12k/n) \cos(1 + 4k/n) 4/n$?`),
        "split command names and repeated inline-dollar breaks should collapse into one canonical formula",
      );
      assert(!normalized.includes(String.raw`\inf$ty`), "broken command-name splits should not remain after normalization");
      assert(!normalized.includes(String.raw`$$\cos`), "secondary double-dollar breaks should be removed");
    });

    await it("应移除历史残留的 math-inline 尾巴，避免解析中出现原始标记碎片", () => {
      const normalized = normalizeStoredExerciseText(
        String.raw`To find an equivalent expression, the terms are $\cdot x^3\cdot 2, 6\cdot x^2\cdot 2^2, 4\cdot x\cdot 2^3, and 2^4$\"></math-inline>.`,
      );

      assert(
        !normalized.includes("</math-inline>"),
        "orphan math-inline closing tails should be stripped during canonical storage normalization",
      );
      assert(
        normalized.endsWith("$."),
        "the repaired inline formula should remain intact after stripping the broken tail",
      );
    });

    await it("应跳过 markdown 图片片段，只规范化图片外部的数学文本", () => {
      const normalized = normalizeStoredExerciseText(
        "![Diagram: A simplified nitrogen cycle diagram. At the top: 'Nitrogen G](https://example.com/diagram.png)\n\nFind f^(-1)(x).",
      );

      assert(
        normalized.includes("![Diagram: A simplified nitrogen cycle diagram. At the top: 'Nitrogen G](https://example.com/diagram.png)"),
        "markdown image alt text should remain untouched",
      );
      assert(
        normalized.includes("Find $f^{-1}(x)$."),
        "math outside markdown image should still be normalized",
      );
      assert(
        !normalized.includes("$'Nitrogen G]("),
        "markdown image syntax should not be wrapped into math",
      );
    });

    await it("应在句号后停止数学拼接，避免把下一句科学记号错误吞进同一个公式", () => {
      const normalized = normalizeStoredExerciseText(
        "[OH⁻] = 0.009 M ≈ 10⁻². pOH ≈ 2. pH ≈ 12.",
      );

      assert(
        !normalized.includes("$10^{-2}. pOH$"),
        "sentence punctuation should break the previous math run",
      );
      assert(
        normalized.includes("10^{-2}$."),
        "the scientific notation should still be normalized as a standalone formula",
      );
    });

    await it("应跳过已带显式 LaTeX 的历史文本，避免二次改写破坏原有公式", () => {
      const source =
        "The mass percent of carbon in pure glucose, $C_{6}\n$$H_{12}$$\nO_{6}$, is 40.0 percent.";
      const normalized = normalizeStoredExerciseText(source);

      assert(
        normalized === source,
        "strings that already contain explicit LaTeX markup should be preserved verbatim",
      );
    });

    await it("应保留阶乘和尾部负数，避免把完整公式切成半截数学片段", () => {
      const factorialNormalized = normalizeStoredExerciseText(
        "(2/7)^{2n}(-1)^n/(2n+1)!",
      );
      const signedTailNormalized = normalizeStoredExerciseText("f'(x)=x⁴+x² -2");

      assert(
        factorialNormalized === "$(2/7)^{2n}(-1)^n/(2n+1)!$",
        "factorial expressions should stay inside the same inline formula",
      );
      assert(
        signedTailNormalized === "$f'(x)=x^{4}+x^{2} -2$",
        "a trailing signed number should remain inside the same inline formula",
      );
    });

    await it("应跳过高风险分段函数与参数方程，避免自动规范化把公式切坏", () => {
      const piecewise = "f(x) = {3x + 1 for x ≤ 2, 5x - 3 for x > 2}";
      const parametric = "x = ln(t + 1) and y = (1 + t)e^(-t)";
      const pairedFunctions = "f(x) = x^2 + 2, g(x) = x^2/4 + 2";

      assert(
        normalizeStoredExerciseText(piecewise) === piecewise,
        "piecewise definitions should stay unchanged until there is a dedicated parser",
      );
      assert(
        normalizeStoredExerciseText(parametric) === parametric,
        "parametric equation systems should stay unchanged instead of being partially wrapped",
      );
      assert(
        normalizeStoredExerciseText(pairedFunctions) === pairedFunctions,
        "multiple inline equations should stay unchanged instead of being partially wrapped",
      );
    });

    await it("应支持 lim[...] 这一类历史极限写法，并保留完整公式", () => {
      const normalized = normalizeStoredExerciseText("lim[h→0] (e^(2+h) - e^2)/h is");

      assert(
        normalized.startsWith("$\\lim_{h \\to 0} (e^{2+h} - e^2)/h$"),
        "limit notation should be normalized into a single inline formula",
      );
      assert(!normalized.includes("lim[h→0]"), "raw bracket limit notation should not remain");
    });

    await it("应把括号式一侧极限写法统一收口为标准下标极限公式", () => {
      const normalized = normalizeStoredExerciseText(
        "lim(x→a-) f(x) ≠ lim(x→a+) f(x)",
      );

      assert(
        normalized.includes(
          "$\\lim_{x \\to a^{-}} f(x) \\neq \\lim_{x \\to a^{+}} f(x)$",
        ),
        "parenthesized one-sided limits should normalize into canonical inline LaTeX",
      );
      assert(!normalized.includes("lim(x→a-)"), "raw left-hand limit notation should not remain");
      assert(!normalized.includes("lim(x→a+)"), "raw right-hand limit notation should not remain");
    });

    await it("应把 bare lim 操作符与 as x→2 这一类尾部条件统一收口进同一个公式", () => {
      const bareLimit = normalizeStoredExerciseText("If lim [f(x)+6]/g(x)");
      const limitAsCondition = normalizeStoredExerciseText("lim f(x) = 3 as x→2");
      const compactLimitAsCondition = normalizeStoredExerciseText("lim f(x) = 8 asx→2");
      const reorderedLimit = normalizeStoredExerciseText(
        "lim [cos x + 4e^x]/5e^x is as x→0",
      );

      assert(
        bareLimit.includes("$\\lim (f(x)+6)/(g(x))$"),
        "bare grouped quotient limits should normalize into canonical grouped math",
      );
      assert(
        limitAsCondition === "$\\lim_{x \\to 2} f(x) = 3$",
        "limits with trailing as x→2 conditions should normalize into canonical limit subscripts",
      );
      assert(
        compactLimitAsCondition === "$\\lim_{x \\to 2} f(x) = 8$",
        "compact OCR-like asx→2 tails should normalize into canonical limit subscripts",
      );
      assert(
        reorderedLimit === "$\\lim_{x \\to 0} (\\cos x + 4e^x)/(5e^x)$ is",
        "scrambled limit clauses with grouped quotients should reorder into canonical inline math",
      );
    });

    await it("应在纯文本规则介入前先保护无分隔符的裸 TeX 分式，避免被拆成红字残片", () => {
      const rawLatex = normalizeStoredExerciseText(
        String.raw`\frac{d}{dx}(sin^{-1}(x^{2}))|_{x=1}/4 =`,
      );

      assert(
        rawLatex === String.raw`$\frac{d}{dx}(\sin^{-1}(x^{2}))|_{x=1}/4 =$`,
        "bare TeX fractions without dollar delimiters should be wrapped as one inline formula",
      );
    });

    await it("应把简单方程右侧的尾部变量与常数继续并入同一个公式", () => {
      const differential = normalizeStoredExerciseText(
        "dy/dx = x - y with initial condition",
      );
      const polynomial = normalizeStoredExerciseText(
        "x³ + 3x² - 9x + 7 is increasing",
      );

      assert(
        differential.startsWith("$\\frac{dy}{dx} = x - y$"),
        "simple differential equations should stay inside one inline formula",
      );
      assert(
        polynomial.startsWith("$x^{3} + 3x^{2} - 9x + 7$"),
        "a trailing positive constant should stay inside the same inline formula",
      );
    });

    await it("应把带省略号的复杂级数展开规范化成单个公式，而不是留成原始纯文本", () => {
      const series =
        "For x > 0, the power series 1 - x²/(3!) + x⁴/(5!) - x⁶/(7!) + ... + (-1)ⁿx^(2n)/((2n+1)!) + ... converges.";

      assert(
        normalizeStoredExerciseText(series) ===
          "For x > 0, the power series $1 - x^{2}/(3!) + x^{4}/(5!) - x^{6}/(7!) + \\cdots + (-1)^{n}x^{2n}/((2n+1)!) + \\cdots$ converges.",
        "series expansions with ellipsis should now be normalized into a single inline formula",
      );
    });

    await it("应修复 AP 微积分中被美元符号切碎的 Maclaurin 级数题干、选项与解析", () => {
      const stem = String.raw`Which of the following is the Maclaurin series for x \cos($x^2$)?`;
      const choice = String.raw`$x - \frac{ x^5$}{2!} + \frac{$x^9$}{4!} - \frac{$x^{13}$}{6!} + \cdots`;
      const explanation =
        String.raw`Starting with cos u $= \Sigma(-1)^{n}u^{2n}/(2n)$! and substituting u $= x^{2}$: $\cos(x^{2}) = \Sigma(-1)^{n}x^{4n}/(2n)$!. Multiplying by x: $x\cdot \cos(x^{2}) = \Sigma(-1)^{n}x^{4n+1}/(2n)! = x - x^{5}/2! + x^{9}/4! -$...`;

      const normalizedStem = normalizeStoredExerciseText(stem);
      const normalizedChoice = normalizeStoredExerciseText(choice);
      const normalizedExplanation = normalizeStoredExerciseText(explanation);

      assert(
        normalizedStem === String.raw`Which of the following is the Maclaurin series for $x \cos(x^2)$?`,
        "raw latex function calls with a short leading variable should normalize into one inline formula",
      );
      assert(
        normalizedChoice === String.raw`$x - \frac{x^5}{2!} + \frac{x^9}{4!} - \frac{x^{13}}{6!} + \cdots$`,
        "fragmented inline fractions should collapse into one canonical series formula",
      );
      assert(
        normalizedExplanation ===
          String.raw`Starting with $\cos u = \sum(-1)^{n}u^{2n}/(2n)!$ and substituting $u = x^{2}$: $\cos(x^{2}) = \sum(-1)^{n}x^{4n}/(2n)!$. Multiplying by x: $x\cdot \cos(x^{2}) = \sum(-1)^{n}x^{4n+1}/(2n)! = x - x^{5}/2! + x^{9}/4! - \cdots$`,
        "mixed explicit/plain series explanations should be rewritten into canonical inline formulas",
      );
    });

    await it("应快速保留单个显式公式后跟等号提示符的题干写法", () => {
      const normalized = normalizeStoredExerciseText(
        String.raw`$\frac{d}{dx}(x \cos(x^{2}))$ =`,
      );

      assert(
        normalized === String.raw`$\frac{d}{dx}(x \cos(x^{2}))$ =`,
        "single inline formulas followed only by an equals prompt should remain canonical without extra rewrites",
      );
    });

    await it("应跳过代码样式行，避免把编程题赋值与复合运算符误改成数学公式", () => {
      const source = [
        "Consider the following code segment.",
        "",
        "int x = 3;",
        "num *= 2;",
        "System.out.print(x);",
        "/* data type 1 */ y = true;",
      ].join("\n");
      const normalized = normalizeStoredExerciseText(source);

      assert(normalized === source, "code-like lines should remain untouched during storage normalization");
      assert(!normalized.includes("$= 3$"), "plain assignment in code should not be wrapped into inline math");
      assert(!normalized.includes("\\cdot ="), "compound assignment in code should not be rewritten as multiplication");
    });

    await it("应只在写入时规范化题目文本，同时保留图片与已存在的 LaTeX", () => {
      const content = normalizeExerciseContentForStorage(
        normalizeExerciseContent(
          buildExerciseContentFromLegacy({
            type: "MC",
            questionText:
              "Evaluate ∑(n=1 to ∞) (-2)^n /(e^{n+1}) with figure ![plot](/storage/plot.png)",
            options: [
              { label: "A", text: "$\\frac{-2}{e+2}$", isCorrect: true },
              { label: "B", text: "Distractor", isCorrect: false },
            ],
            correctAnswer: "$\\frac{-2}{e+2}$",
            solutionSteps: "Use the geometric sum ratio r = -2/e.",
          }),
        ),
      );

      const derived = deriveLegacyExerciseFieldsFromContent(content);

      assert(
        derived.questionText.includes("$\\sum_{n=1}^{\\infty}"),
        "legacy question text should persist normalized inline LaTeX",
      );
      assert(
        derived.questionText.includes("![plot](/storage/plot.png)"),
        "markdown image references should still be preserved",
      );
      assert(
        derived.options?.[0]?.text === "$\\frac{-2}{e+2}$",
        "already valid LaTeX options should remain unchanged",
      );
      assert(
        derived.correctAnswer === "$\\frac{-2}{e+2}$",
        "existing LaTeX answers should remain unchanged",
      );
    });

    await it("应把 delta_x_1 这类带下划线的位移变量和绝对值关系规范化为可渲染 LaTeX", () => {
      const normalized = normalizeStoredExerciseText(
        "A student moving in the x-direction first has a change in position of delta_x_1, then a change in position of delta_x_2 in the opposite direction. The total change in position is delta_x_tot, where (1/2)|delta_x_1| < |delta_x_2| < |delta_x_1|.",
      );

      assert(
        normalized.includes("$\\delta_{x_{1}}$"),
        "delta_x_1 should normalize into a renderable greek subscript formula",
      );
      assert(
        normalized.includes("$\\delta_{x_{2}}$"),
        "delta_x_2 should normalize into a renderable greek subscript formula",
      );
      assert(
        normalized.includes("$\\delta_{x_{tot}}$"),
        "delta_x_tot should normalize into a renderable greek subscript formula",
      );
      assert(
        normalized.includes("$(1/2)\\left|\\delta_{x_{1}}\\right| < \\left|\\delta_{x_{2}}\\right| < \\left|\\delta_{x_{1}}\\right|$"),
        "absolute-value inequalities should normalize into renderable latex delimiters",
      );
      assert(!normalized.includes("delta_x_1"), "raw underscored delta text should not remain after normalization");
      assert(!normalized.includes("left\\left|"), "absolute-value wrappers should not be duplicated");
    });

    await it("应拆开把 prose 吞进同一个美元公式的历史希腊变量文本", () => {
      const normalized = normalizeStoredExerciseText(
        "Since $delta_x_1 and delta_x_2$ are in opposite directions, the total displacement is in the direction of $delta_x_1, with |delta_x_tot| = |delta_x_1| - |delta_x_2|$.",
      );

      assert(
        normalized.includes("Since $\\delta_{x_{1}}$ and $\\delta_{x_{2}}$ are in opposite directions"),
        "conjoined underscored delta variables should become separate inline formulas",
      );
      assert(
        normalized.includes("direction of $\\delta_{x_{1}}$, with $\\left|\\delta_{x_{tot}}\\right| = \\left|\\delta_{x_{1}}\\right| - \\left|\\delta_{x_{2}}\\right|$"),
        "clause bridges should split the leading variable from the following math relation",
      );
      assert(!normalized.includes("$\\delta_{x_{1}} and"), "prose should not remain inside the first inline formula");
      assert(!normalized.includes("$\\delta_{x_{1}}, with"), "clause introducers should not remain inside inline math");
    });

    await it("应把化学同位素的 OCR 斜杠写法与前置上标写法统一规范成可渲染公式", () => {
      const slashNormalized = normalizeStoredExerciseText("12/6 C");
      const superscriptNormalized = normalizeStoredExerciseText("^{2}C (Z=6)");

      assert(
        slashNormalized === "$" + String.raw`{}_{6}^{12}\mathrm{C}` + "$",
        "slash isotope shorthand should normalize into canonical isotope latex",
      );
      assert(
        superscriptNormalized === "$" + String.raw`{}_{6}^{2}\mathrm{C}\,( \mathrm{Z}=6 )` + "$",
        "leading superscript isotope shorthand with Z should normalize into canonical isotope latex",
      );
    });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error("\nFailures:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
