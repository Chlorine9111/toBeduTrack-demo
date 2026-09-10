import { Marked } from "marked";
import {
  expandHtmlMathMarkup,
  normalizeMathHtml,
} from "../../lib/doc-engine/html-math";

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
  await describe("rich markdown math pipeline", async () => {
    await it("应把 Markdown 公式统一展开为纯 KaTeX HTML，且不污染代码块", () => {
      const markdownRenderer = new Marked({
        gfm: true,
        breaks: true,
      });
      const markdown = [
        "公式 $x_1$ 与 $$\\\\frac{a}{b}$$。",
        "",
        "```js",
        "const y = x_1;",
        "```",
      ].join("\n");

      const rawHtml = markdownRenderer.parse(markdown) as string;
      const expanded = expandHtmlMathMarkup(normalizeMathHtml(rawHtml));
      const codeBlockMatch = expanded.match(/<pre><code(?: class=\"language-js\")?>([\s\S]*?)<\/code><\/pre>/i);
      const codeBlock = codeBlockMatch?.[1] ?? "";

      assert(expanded.includes('class="katex"'), "Markdown 公式应展开为 KaTeX HTML");
      assert(!expanded.includes("katex-mathml"), "Markdown 公式不应混入 MathML 回退分支");
      assert(!/<math\b/i.test(expanded), "Markdown 公式展开后不应保留浏览器原生 math 标签");
      assert(codeBlock.includes("const y = x_1;"), "代码块中的原始下标文本应保持不变");
      assert(!codeBlock.includes('class="katex"'), "代码块中不应插入 KaTeX HTML");
    });
  });

  console.log(`\nPassed: ${passed}`);
  if (failed > 0) {
    console.error(`Failed: ${failed}`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("All checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
