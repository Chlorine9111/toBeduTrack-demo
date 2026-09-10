import * as knowledgeAutoImportModule from "../../lib/question-bank/knowledge-auto-import";

type KnowledgeAutoImportModuleShape = {
  default?: {
    planKnowledgeDocumentQuestionImport: typeof import("../../lib/question-bank/knowledge-auto-import").planKnowledgeDocumentQuestionImport;
  };
  "module.exports"?: {
    planKnowledgeDocumentQuestionImport: typeof import("../../lib/question-bank/knowledge-auto-import").planKnowledgeDocumentQuestionImport;
  };
  planKnowledgeDocumentQuestionImport?: typeof import("../../lib/question-bank/knowledge-auto-import").planKnowledgeDocumentQuestionImport;
};

const knowledgeAutoImport =
  ((knowledgeAutoImportModule as KnowledgeAutoImportModuleShape).default ??
    (knowledgeAutoImportModule as KnowledgeAutoImportModuleShape)["module.exports"] ??
    (knowledgeAutoImportModule as KnowledgeAutoImportModuleShape)) as {
    planKnowledgeDocumentQuestionImport: typeof import("../../lib/question-bank/knowledge-auto-import").planKnowledgeDocumentQuestionImport;
  };

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
  await describe("planKnowledgeDocumentQuestionImport", async () => {
    await it("应把没有题目关键词文件名但正文含连续 Question 标记的 PDF 识别为可自动拆题", () => {
      const plan = knowledgeAutoImport.planKnowledgeDocumentQuestionImport({
        fileName: "ux-upload-sample.pdf",
        fileType: "application/pdf",
        extractedText: [
          "AP Calculus Question Set",
          "Question 1. What is the derivative of x^2?",
          "A. x",
          "B. 2x",
          "C. x^2",
          "D. 2",
          "Question 2. Explain the chain rule in one sentence.",
          "Question 3. Solve 2x + 4 = 10.",
        ].join("\n"),
        parsedDocument: null,
      });

      assert(plan.shouldProcess === true, `expected shouldProcess=true, got ${plan.shouldProcess}`);
      assert(plan.metadata.status === "queued", `expected queued, got ${plan.metadata.status}`);
      assert((plan.metadata.parsedQuestionCount ?? 0) >= 2, "expected parsedQuestionCount >= 2");
    });

    await it("应继续把普通讲义 PDF 保持为 skipped", () => {
      const plan = knowledgeAutoImport.planKnowledgeDocumentQuestionImport({
        fileName: "chapter-3-notes.pdf",
        fileType: "application/pdf",
        extractedText: [
          "Chapter 3 Lecture Notes",
          "Photosynthesis converts light energy to chemical energy.",
          "Key concepts: chloroplast, thylakoid, Calvin cycle.",
        ].join("\n"),
        parsedDocument: null,
      });

      assert(plan.shouldProcess === false, `expected shouldProcess=false, got ${plan.shouldProcess}`);
      assert(plan.metadata.status === "skipped", `expected skipped, got ${plan.metadata.status}`);
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
