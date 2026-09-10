import {
  defaultMaxScoreForQuestion,
  mapScanQuestionTypeToGradingType,
  normalizeInferenceItem,
  summarizeAnswerKey,
} from "../../lib/grading/answer-key-inference";
import { evaluateAnswerKeyQuality } from "../../lib/grading/quality-gates";
import type { ScannedQuestion } from "../../lib/pdf-scan/types";

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

function createSourceQuestion(partial?: Partial<ScannedQuestion>): ScannedQuestion {
  return {
    questionNumber: 1,
    content: "What is the derivative of x^3?",
    questionType: "choice",
    difficulty: "medium",
    subject: "AP Calculus",
    knowledgePoint: "Derivative rules",
    options: {
      A: "x^2",
      B: "3x^2",
      C: "x^3",
      D: "3x",
    },
    confidence: 92,
    ...partial,
  };
}

async function main() {
  await describe("mapScanQuestionTypeToGradingType", async () => {
    await it("应该把选择题映射为 MC", () => {
      assert(mapScanQuestionTypeToGradingType("choice") === "MC", "choice 应映射为 MC");
    });

    await it("应该把证明题映射为 FR", () => {
      assert(mapScanQuestionTypeToGradingType("proof") === "FR", "proof 应映射为 FR");
    });

    await it("应该保留 calculation 类型", () => {
      assert(
        mapScanQuestionTypeToGradingType("calculation") === "calculation",
        "calculation 应映射为 calculation",
      );
    });
  });

  await describe("defaultMaxScoreForQuestion", async () => {
    await it("选择题默认 1 分", () => {
      assert(defaultMaxScoreForQuestion("MC", "easy") === 1, "MC easy 应为 1 分");
    });

    await it("困难计算题默认 6 分", () => {
      assert(
        defaultMaxScoreForQuestion("calculation", "hard") === 6,
        "hard calculation 应为 6 分",
      );
    });

    await it("中等 essay 默认 4 分", () => {
      assert(defaultMaxScoreForQuestion("essay", "medium") === 4, "medium essay 应为 4 分");
    });
  });

  await describe("normalizeInferenceItem", async () => {
    await it("低置信选择题应该自动标记待复核，并把答案文本归一为选项字母", () => {
      const normalized = normalizeInferenceItem(createSourceQuestion({ confidence: 40 }), {
        questionNumber: 1,
        questionType: "MC",
        correctAnswer: "3x^2",
        solutionOutline: "",
        rubricDimensions: [],
        maxScore: 1,
        inferenceConfidence: 0.45,
        reviewRecommended: false,
        reviewReason: "",
      });

      assert(normalized.correctAnswer === "B", `expected correctAnswer B, got ${normalized.correctAnswer}`);
      assert(normalized.responseMode === "text", `expected responseMode text, got ${normalized.responseMode}`);
      assert(normalized.subjectHint === "AP Calculus", `expected subjectHint AP Calculus, got ${normalized.subjectHint}`);
      assert(normalized.languageHint === "en-US", `expected languageHint en-US, got ${normalized.languageHint}`);
      assert(normalized.sourceQuestionType === "choice", `expected sourceQuestionType choice, got ${normalized.sourceQuestionType}`);
      assert(normalized.reviewRecommended === true, "低置信题应标记 reviewRecommended");
      assert(
        Boolean(normalized.reviewReason && normalized.reviewReason.length > 0),
        "低置信题应生成复核原因",
      );
      assert(
        (normalized.inferenceConfidence ?? 0) < 0.72,
        `expected combined confidence < 0.72, got ${normalized.inferenceConfidence}`,
      );
    });

    await it("主观题缺少标准答案时应该给出 fallback 答案并要求复核", () => {
      const normalized = normalizeInferenceItem(
        createSourceQuestion({
          questionNumber: 2,
          questionType: "short_answer",
          content: "Explain why the derivative rule works.",
          options: null,
          confidence: 88,
        }),
        {
          questionNumber: 2,
          questionType: "FR",
          correctAnswer: "",
          solutionOutline: "",
          rubricDimensions: [],
          maxScore: 3,
          inferenceConfidence: 0.84,
          reviewRecommended: false,
          reviewReason: "",
        },
      );

      assert(normalized.correctAnswer.includes("请教师补充"), "缺失答案时应给出教师补充提示");
      assert(normalized.responseMode === "text", `expected responseMode text, got ${normalized.responseMode}`);
      assert(normalized.reviewRecommended === true, "缺失答案时必须建议复核");
    });
  });

  await describe("summarizeAnswerKey", async () => {
    await it("应该统计题型、知识点和低置信数量", () => {
      const sourceQuestions = [
        createSourceQuestion({
          questionNumber: 1,
          difficulty: "medium",
          knowledgePoint: "Derivative rules",
          subject: "AP Calculus",
          confidence: 90,
        }),
        createSourceQuestion({
          questionNumber: 2,
          questionType: "essay",
          difficulty: "hard",
          knowledgePoint: "Chain Rule",
          subject: "AP Calculus",
          options: null,
          confidence: 80,
        }),
      ];

      const summary = summarizeAnswerKey(
        [
          {
            questionNumber: 1,
            questionText: "Q1",
            questionType: "MC",
            correctAnswer: "B",
            maxScore: 1,
            inferenceConfidence: 0.92,
            reviewRecommended: false,
            reviewReason: null,
          },
          {
            questionNumber: 2,
            questionText: "Q2",
            questionType: "essay",
            correctAnswer: "Discuss the chain rule.",
            maxScore: 6,
            inferenceConfidence: 0.63,
            reviewRecommended: true,
            reviewReason: "OCR 不完整",
          },
        ],
        {
          sourceQuestions,
          extractionMode: "vision",
          contentKind: "question_set",
          notes: ["1 题建议复核"],
          modelId: "gemini-3.1-pro-preview",
          qualityGate: evaluateAnswerKeyQuality({
            answerKey: [
              {
                questionNumber: 1,
                questionText: "Q1",
                questionType: "MC",
                correctAnswer: "B",
                maxScore: 1,
              },
              {
                questionNumber: 2,
                questionText: "Q2",
                questionType: "essay",
                correctAnswer: "Discuss the chain rule.",
                maxScore: 6,
                inferenceConfidence: 0.63,
                reviewRecommended: true,
              },
            ],
            sourceQuestionNumbers: sourceQuestions.map((item) => item.questionNumber),
          }),
        },
      );

      assert(summary.totalQuestions === 2, `expected 2 questions, got ${summary.totalQuestions}`);
      assert(summary.totalMaxScore === 7, `expected total score 7, got ${summary.totalMaxScore}`);
      assert(summary.byType.MC === 1, `expected MC count 1, got ${summary.byType.MC}`);
      assert(summary.byType.essay === 1, `expected essay count 1, got ${summary.byType.essay}`);
      assert(
        summary.reviewRecommendedCount === 1,
        `expected reviewRecommendedCount 1, got ${summary.reviewRecommendedCount}`,
      );
      assert(summary.lowConfidenceCount === 1, `expected lowConfidenceCount 1, got ${summary.lowConfidenceCount}`);
      assert(
        summary.knowledgePoints.includes("Chain Rule"),
        "summary 应包含 Chain Rule 知识点",
      );
      assert(
        summary.detectedSubjects.includes("AP Calculus"),
        "summary 应包含 AP Calculus 学科",
      );
      assert(
        summary.qualityGate.status === "manual_review_required",
        `expected qualityGate manual_review_required, got ${summary.qualityGate.status}`,
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
