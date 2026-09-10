import {
  mergeLinkedFigures,
  mergeOptions,
  selectPdfTextCandidate,
  shouldEscalateMistralTextCandidate,
  shouldPreferRegexTextCandidate,
} from "../../lib/pdf-scan/pipeline";

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
  await describe("mergeLinkedFigures", async () => {
    await it("当两个通道都产出 URL 图片时，应只保留一侧 URL 并合并文本引用", () => {
      const merged = mergeLinkedFigures(
        ["/text/a.png", "/text/b.png", "Figure 1"],
        ["/vision/a.png", "/vision/b.png", "Figure 2"],
      );

      assert(merged.length === 4, `expected 4 merged figures, got ${merged.length}`);
      assert(merged.includes("/text/a.png"), "应保留 text 通道图片");
      assert(merged.includes("/text/b.png"), "应保留 text 通道图片");
      assert(!merged.includes("/vision/a.png"), "不应同时保留重复 vision 图片");
      assert(merged.includes("Figure 1") && merged.includes("Figure 2"), "应保留双方文本引用");
    });

    await it("当一侧 URL 更完整时，应优先保留更完整的一组", () => {
      const merged = mergeLinkedFigures(
        ["/text/a.png", "/text/b.png"],
        ["/vision/a.png", "/vision/b.png", "/vision/c.png"],
      );

      assert(merged.includes("/vision/c.png"), "应保留更完整的 vision 图片集合");
      assert(!merged.includes("/text/a.png"), "不应混入另一侧重复 URL");
    });
  });

  await describe("mergeOptions", async () => {
    await it("同一选项双方都有图片时，应优先保留 vision 版本，避免重复", () => {
      const merged = mergeOptions(
        {
          A: "![选项 A](/text-a.png)\n文本 A",
          B: "Text B",
        },
        {
          A: "![选项 A](/vision-a.png)\n文本 A",
          B: "Text B",
        },
      );

      assert(merged?.A?.includes("/vision-a.png") === true, "A 应优先保留 vision 图片");
      assert(merged?.A?.includes("/text-a.png") !== true, "A 不应合并出两张重复图片");
    });
  });

  await describe("mistral text fallback selection", async () => {
    await it("Mistral markdown 解析漏题时，应回退到 regex 文本解析", () => {
      const extractedText = [
        "AP Calculus Question Set",
        "",
        "Question 1. What is the derivative of x^2?",
        "A. x  B. 2x  C. x^2  D. 2",
        "",
        "Question 2. Explain the chain rule in one sentence.",
      ].join("\n");

      const selection = selectPdfTextCandidate({
        extractionMode: "mistral-ocr",
        extractedText,
        mistralPages: [
          {
            pageNumber: 1,
            markdown: extractedText,
            images: [],
            dimensions: { width: 1000, height: 1400 },
          },
        ],
      });

      assert(selection.parser === "regex", `expected regex parser, got ${selection.parser}`);
      assert(selection.questions.length === 2, `expected 2 questions, got ${selection.questions.length}`);
    });

    await it("Mistral 文本候选覆盖率不足时，应触发 LLM 升级判断", () => {
      const extractedText = [
        "AP Calculus Question Set",
        "",
        "Question 1. What is the derivative of x^2?",
        "A. x  B. 2x  C. x^2  D. 2",
        "",
        "Question 2. Explain the chain rule in one sentence.",
        "",
        "Question 3. Solve 2x + 4 = 10.",
      ].join("\n");

      const selection = selectPdfTextCandidate({
        extractionMode: "mistral-ocr",
        extractedText,
        mistralPages: [
          {
            pageNumber: 1,
            markdown: extractedText,
            images: [],
            dimensions: { width: 1000, height: 1400 },
          },
        ],
      });

      const shouldEscalate = shouldEscalateMistralTextCandidate({
        rawText: extractedText,
        questions: selection.questions,
      });

      assert(shouldEscalate === true, "expected low-recall mistral candidate to escalate to LLM");
    });

    await it("Mistral markdown 解析正常时，不应无条件偏向 regex", () => {
      const mistralMarkdown = [
        "1. Choose the correct picture.",
        "(A) Option A",
        "(B) Option B",
        "",
        "2. Explain why the answer is correct.",
      ].join("\n");

      const selection = selectPdfTextCandidate({
        extractionMode: "mistral-ocr",
        extractedText: mistralMarkdown,
        mistralPages: [
          {
            pageNumber: 2,
            markdown: mistralMarkdown,
            images: [],
            dimensions: { width: 1000, height: 1400 },
          },
        ],
      });

      const prefersRegex = shouldPreferRegexTextCandidate({
        rawText: mistralMarkdown,
        mistralCandidate: selection.questions,
        regexCandidate: [],
      });

      assert(selection.parser === "mistral-markdown", `expected mistral-markdown, got ${selection.parser}`);
      assert(prefersRegex === false, "should not prefer regex when mistral parser already works");
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
