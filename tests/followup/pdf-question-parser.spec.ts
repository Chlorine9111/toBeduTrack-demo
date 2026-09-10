import {
  detectQuestionType,
  parseQuestionsFromText,
  sanitizeOcrQuestionText,
} from "../../lib/pdf-scan/question-parser";

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

const markdownHeadingOcrText = [
  "# AP Calculus Mini Quiz",
  "",
  "Name: ___________",
  "",
  "## 1. Multiple Choice",
  "",
  "What is the derivative of $x^3$?",
  "",
  "A. $x^2$",
  "B. $3x^2$",
  "C. $3x$",
  "D. $x^3$",
  "",
  "## 2. Free Response",
  "",
  "Find the derivative of $y = \\sin(x^2)$.",
  "",
  "Briefly explain how the chain rule is used.",
].join("\n");

async function main() {
  await describe("sanitizeOcrQuestionText", async () => {
    await it("应移除 Markdown 标题前缀，保留题号正文", () => {
      const sanitized = sanitizeOcrQuestionText(markdownHeadingOcrText);
      assert(!sanitized.includes("## 1. Multiple Choice"), "不应保留 ## 题号标题前缀");
      assert(sanitized.includes("1. Multiple Choice"), "应保留题号正文");
      assert(sanitized.includes("2. Free Response"), "应保留第二题标题正文");
    });

    await it("应合并 OCR 误切成逐字符换行的公式片段", () => {
      const brokenInlineText = [
        "What is the",
        "K",
        "s",
        "p",
        "of AgBr at 298 K ?",
      ].join("\n");

      const sanitized = sanitizeOcrQuestionText(brokenInlineText);
      assert(
        sanitized.includes("What is the Ksp of AgBr at 298 K ?"),
        `unexpected sanitized text: ${sanitized}`,
      );
      assert(!sanitized.includes("\nK\ns\np"), "不应保留逐字符断行");
    });
  });

  await describe("parseQuestionsFromText", async () => {
    await it("应把 Markdown 题号标题识别成两道题，而不是按段落误拆成四题", () => {
      const parsed = parseQuestionsFromText(markdownHeadingOcrText);

      assert(parsed.length === 2, `expected 2 questions, got ${parsed.length}`);
      assert(parsed[0]?.questionNumber === 1, `expected q1 number 1, got ${parsed[0]?.questionNumber}`);
      assert(parsed[1]?.questionNumber === 2, `expected q2 number 2, got ${parsed[1]?.questionNumber}`);
      assert(parsed[0]?.questionType === "choice", `expected q1 type choice, got ${parsed[0]?.questionType}`);
      assert(parsed[0]?.originalContent === "What is the derivative of $x^3$?", `unexpected q1 stem: ${parsed[0]?.originalContent}`);
      assert(parsed[0]?.options?.B === "$3x^2$", `expected q1 option B to be $3x^2$, got ${parsed[0]?.options?.B}`);
      assert(parsed[1]?.questionType === "essay", `expected q2 type essay, got ${parsed[1]?.questionType}`);
      assert(parsed[1]?.originalContent.includes("Find the derivative of $y = \\sin(x^2)$."), "q2 应包含导数问法");
      assert(parsed[1]?.originalContent.includes("Briefly explain how the chain rule is used."), "q2 应包含 chain rule 解释问法");
      assert(!parsed[1]?.originalContent.includes("Free Response"), "q2 题干中不应残留分区标题");
    });

    await it("应把带图片引用和选项标记的题目识别为 choice，而不是 fill", () => {
      const content = [
        "Look at the images and choose the correct answer.",
        "(A) ![选项 A](/images/a.png)",
        "____",
      ].join("\n");

      const detected = detectQuestionType(content);
      assert(detected === "choice", `expected choice, got ${detected}`);
    });

    await it("纯填空题仍应保持 fill 识别", () => {
      const detected = detectQuestionType("请填写答案：____");
      assert(detected === "fill", `expected fill, got ${detected}`);
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
