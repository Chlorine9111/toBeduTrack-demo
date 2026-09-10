import {
  backfillOptionsFromOcrMarkdown,
  normalizeExtractedQuestionOptions,
} from "../../lib/pdf-scan/llm-question-extractor";

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
  await describe("normalizeExtractedQuestionOptions", async () => {
    await it("应保留 IMAGE_REGION 占位符选项，而不是归一化为空", () => {
      const options = normalizeExtractedQuestionOptions({
        A: '[IMAGE_REGION: page=1, bbox=[10,20,30,40], desc="图 A"]',
        B: '[IMAGE_REGION: page=1, bbox=[40,20,60,40], desc="图 B"]',
      });

      assert(options != null, "expected non-null options");
      assert(Object.keys(options ?? {}).length === 2, `expected 2 options, got ${Object.keys(options ?? {}).length}`);
      assert(options?.A?.includes("[IMAGE_REGION:") === true, "A 应保留 IMAGE_REGION 占位符");
      assert(options?.B?.includes("[IMAGE_REGION:") === true, "B 应保留 IMAGE_REGION 占位符");
    });
  });

  await describe("backfillOptionsFromOcrMarkdown", async () => {
    await it("当 LLM 只返回 Image 占位时，即使未标记 hasOptionImages，也应从 OCR markdown 回填真实图片选项", () => {
      const questions: Parameters<typeof backfillOptionsFromOcrMarkdown>[0] = [
        {
          questionNumber: 4,
          sourcePageNumber: 2,
          content: "Select the odd one out on the basis of natural and man-made things.",
          questionType: "choice",
          options: {
            A: "Image",
            B: "Image",
            C: "Image",
            D: "Image",
          },
          subQuestions: [],
          linkedFigures: [],
          stemRegion: null,
          optionImageRegions: null,
          hasStemImage: false,
          hasOptionImages: false,
          difficulty: "easy",
          subject: "",
          knowledgePoint: "",
          confidence: 88,
        },
      ];

      backfillOptionsFromOcrMarkdown(questions, [
        {
          pageNumber: 2,
          markdown: [
            "4. Select the odd one out on the basis of natural and man-made things.",
            "",
            "(A)",
            "",
            "![img-10](/api/pdf/scan-image?path=a)",
            "",
            "(B)",
            "",
            "![img-11](/api/pdf/scan-image?path=b)",
            "",
            "(C)",
            "",
            "![img-12](/api/pdf/scan-image?path=c)",
            "",
            "(D)",
            "",
            "![img-13](/api/pdf/scan-image?path=d)",
          ].join("\n"),
        },
      ]);

      assert(questions[0]?.hasOptionImages === true, "应把该题回标为 hasOptionImages");
      assert(questions[0]?.options?.A?.includes("/api/pdf/scan-image?path=a") === true, "A 应回填真实图片 URL");
      assert(questions[0]?.options?.D?.includes("/api/pdf/scan-image?path=d") === true, "D 应回填真实图片 URL");
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
