import {
  buildQuestionScoringGuidance,
  inferAnswerKeyLanguageHint,
  inferLanguageHintFromText,
  inferQuestionResponseMode,
} from "../../lib/grading/strategy-router";
import type { AnswerKeyItem } from "../../lib/grading/types";

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
  await describe("inferLanguageHintFromText", async () => {
    await it("纯英文内容应返回 en-US", () => {
      assert(
        inferLanguageHintFromText(["Explain the chain rule in calculus."]) === "en-US",
        "英文内容应推断为 en-US",
      );
    });

    await it("中文占比较高时应返回 zh-CN", () => {
      assert(
        inferLanguageHintFromText(["请说明链式法则，并写出计算过程"]) === "zh-CN",
        "中文内容应推断为 zh-CN",
      );
    });
  });

  await describe("inferQuestionResponseMode", async () => {
    await it("计算题默认应归为 math", () => {
      assert(
        inferQuestionResponseMode({
          questionType: "calculation",
          questionText: "Find the derivative of sin(3x^2).",
          subjectHint: "AP Calculus",
        }) === "math",
        "calculation 应推断为 math",
      );
    });

    await it("带画图关键词的题应归为 diagram", () => {
      assert(
        inferQuestionResponseMode({
          questionType: "FR",
          questionText: "Draw and label the mitochondria diagram.",
          subjectHint: "AP Biology",
        }) === "diagram",
        "diagram 关键词应推断为 diagram",
      );
    });

    await it("既要解释又要计算的题应归为 mixed", () => {
      assert(
        inferQuestionResponseMode({
          questionType: "calculation",
          questionText: "Show your work and explain how to solve the equation.",
          subjectHint: "AP Physics",
        }) === "mixed",
        "解释 + 计算应推断为 mixed",
      );
    });
  });

  await describe("inferAnswerKeyLanguageHint", async () => {
    await it("应根据答案键与标题综合判断语言", () => {
      const answerKey: AnswerKeyItem[] = [
        {
          questionNumber: 1,
          questionText: "请解释线粒体结构与功能的关系。",
          questionType: "FR",
          correctAnswer: "双层膜结构有助于能量转换。",
          maxScore: 4,
          knowledgePoints: ["细胞器结构"],
        },
      ];

      assert(
        inferAnswerKeyLanguageHint(answerKey, "生物单元测验") === "zh-CN",
        "中文答案键应推断为 zh-CN",
      );
    });
  });

  await describe("buildQuestionScoringGuidance", async () => {
    await it("diagram 题应返回保守复核指导", () => {
      const guidance = buildQuestionScoringGuidance({
        questionNumber: 3,
        questionText: "Draw a labeled free-body diagram.",
        questionType: "FR",
        correctAnswer: "正确标注受力方向",
        maxScore: 3,
        responseMode: "diagram",
      });

      assert(guidance.responseMode === "diagram", "responseMode 应保留为 diagram");
      assert(guidance.guidance.includes("保守给分"), "diagram 指导语应提醒保守给分");
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
