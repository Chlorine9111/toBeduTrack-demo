import {
  evaluateAnswerKeyQuality,
  evaluateSubmissionQuality,
} from "../../lib/grading/quality-gates";
import type { AnswerKeyItem } from "../../lib/grading/types";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(message);
    console.error(`  FAIL: ${message}`);
  }
}

function describe(name: string, fn: () => void | Promise<void>) {
  console.log(`\n${name}`);
  return Promise.resolve(fn());
}

async function it(name: string, fn: () => void | Promise<void>) {
  const beforeFailed = failed;
  try {
    await fn();
    if (beforeFailed === failed) {
      console.log(`  PASS: ${name}`);
    }
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    console.error(`  FAIL: ${name}: ${message}`);
  }
}

function createAnswerKey(partial?: Partial<AnswerKeyItem>): AnswerKeyItem {
  return {
    questionNumber: 1,
    questionText: "What is the derivative of x^3?",
    questionType: "MC",
    correctAnswer: "B",
    maxScore: 1,
    inferenceConfidence: 0.92,
    reviewRecommended: false,
    reviewReason: null,
    ...partial,
  };
}

async function main() {
  await describe("evaluateAnswerKeyQuality", async () => {
    await it("不完整答案键应该直接阻止自动判卷", () => {
      const gate = evaluateAnswerKeyQuality({
        answerKey: [
          createAnswerKey(),
          createAnswerKey({
            questionNumber: 2,
            questionType: "FR",
            correctAnswer: "请教师补充参考答案。",
            maxScore: 4,
          }),
        ],
        sourceQuestionNumbers: [1, 2],
      });

      assert(gate.blocked === true, "占位答案必须 blocked");
      assert(gate.status === "manual_review_required", `expected manual_review_required, got ${gate.status}`);
      assert(gate.incompleteQuestionNumbers.includes(2), "应包含缺失标准答案题号 2");
    });

    await it("题号不一致应该标记为 partial_result", () => {
      const gate = evaluateAnswerKeyQuality({
        answerKey: [createAnswerKey({ questionNumber: 1 })],
        sourceQuestionNumbers: [1, 2],
      });

      assert(gate.status === "partial_result", `expected partial_result, got ${gate.status}`);
      assert(gate.missingQuestionNumbers.includes(2), "应记录缺失题号 2");
      assert(gate.blocked === true, "题号不一致应阻止继续自动判卷");
    });
  });

  await describe("evaluateSubmissionQuality", async () => {
    await it("OCR 缺题时应该返回 partial_result", () => {
      const gate = evaluateSubmissionQuality({
        answerKey: [
          createAnswerKey({ questionNumber: 1 }),
          createAnswerKey({
            questionNumber: 2,
            questionType: "FR",
            correctAnswer: "Use the chain rule.",
            maxScore: 4,
          }),
        ],
        extractedAnswers: [
          {
            questionNumber: 1,
            studentAnswer: "B",
            confidence: 0.96,
          },
          {
            questionNumber: 2,
            studentAnswer: "",
            confidence: 0,
          },
        ],
        gradedAnswers: [
          {
            questionNumber: 1,
            needsReview: false,
          },
          {
            questionNumber: 2,
            needsReview: true,
          },
        ],
      });

      assert(gate.status === "partial_result", `expected partial_result, got ${gate.status}`);
      assert(gate.missingOcrQuestionNumbers.includes(2), "应标记 OCR 缺失题号 2");
      assert(
        gate.reviewRecommendedQuestionNumbers.includes(2),
        "应把 needsReview 题号合并进 reviewRecommendedQuestionNumbers",
      );
    });
  });

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const failure of failures) {
      console.log(`  - ${failure}`);
    }
  }
  console.log(`${"=".repeat(50)}`);

  if (failed > 0) {
    process.exit(1);
  }
}

void main();
