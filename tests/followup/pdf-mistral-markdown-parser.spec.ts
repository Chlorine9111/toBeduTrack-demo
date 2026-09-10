import {
  parseMistralOcrMarkdown,
  convertToScannedQuestions,
} from "../../lib/pdf-scan/mistral-markdown-parser";

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
  await describe("parseMistralOcrMarkdown", async () => {
    await it("应过滤标题页噪声、ACHIEVERS SECTION，并在 ANSWER KEY 处截断", () => {
      const parsed = parseMistralOcrMarkdown([
        {
          pageNumber: 1,
          markdown: [
            "SOF OLYMPIADS CLASS 1 SAMPLE PAPER",
            "Time : 60",
            "1. What comes next in the pattern?",
            "(A) Circle",
            "(B) Triangle",
            "",
            "ACHIEVERS SECTION",
            "2. Which animal can fly?",
            "(A) Dog",
            "(B) Bird",
            "",
            "ANSWER KEY",
            "1. B",
            "2. B",
          ].join("\n"),
        },
      ]);

      assert(parsed.length === 2, `expected 2 questions, got ${parsed.length}`);
      assert(!parsed[0]?.stem.includes("SOF OLYMPIADS"), "题干不应包含试卷标题噪声");
      assert(!parsed[1]?.stem.includes("ACHIEVERS SECTION"), "题干不应包含分区标题");
      assert(!parsed[1]?.stem.includes("ANSWER KEY"), "题干不应包含答案区");
    });

    await it("转换后的扫描题应保留题号并正确识别选择题", () => {
      const questions = convertToScannedQuestions(
        parseMistralOcrMarkdown([
          {
            pageNumber: 2,
            markdown: [
              "1. Choose the correct picture.",
              "(A) ![img-1](https://example.com/a.png)",
              "(B) ![img-2](https://example.com/b.png)",
            ].join("\n"),
          },
        ]),
      );

      assert(questions.length === 1, `expected 1 question, got ${questions.length}`);
      assert(questions[0]?.questionType === "choice", `expected choice, got ${questions[0]?.questionType}`);
      assert(questions[0]?.sourcePageNumber === 2, `expected source page 2, got ${questions[0]?.sourcePageNumber}`);
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
