import {
  extractChoiceLabel,
  inferChoiceLabelFromAnswerText,
  normalizeExercise,
} from "../../lib/agent/exercise-pipeline-helpers";
import {
  normalizeEquivalenceResult,
  normalizeSolverResult,
} from "../../lib/agent/exercise-pipeline-types";

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
  await describe("normalizeExercise", async () => {
    await it("应接受 question/prompt/answer/explanation 等常见别名，避免把有效题误判成题干为空", async () => {
      const normalized = normalizeExercise({
        question: "设 f(x)=sin(3x^2)，则 f'(x) 等于：",
        type: "MC",
        difficulty: 2,
        options: {
          A: "3xcos(3x^2)",
          B: "6xcos(3x^2)",
          C: "6xsin(3x^2)",
          D: "cos(3x^2)",
        },
        answer: "B",
        explanation: "先对外层 sin 求导，再乘以内层 3x^2 的导数 6x。",
        commonMistakes: ["漏乘内层导数"],
      });

      assert(normalized.questionText.includes("sin(3x^2)"), "应从 question 别名提取题干");
      assert(normalized.correctAnswer === "B", "应从 answer 别名提取正确答案");
      assert(
        normalized.solutionSteps.includes("漏乘内层导数") === false,
        "解析应来自 explanation 而不是误区字段",
      );
      assert(
        normalized.solutionSteps.includes("内层 3x^2 的导数 6x"),
        "应从 explanation 别名提取解析",
      );
    });

    await it("solver / equivalence 归一化不应再依赖 zod transform", async () => {
      const solver = normalizeSolverResult({
        answer: "B",
        selectedOption: "option b",
        hasAmbiguity: "false",
        ambiguityReason: "",
      });
      const equivalence = normalizeEquivalenceResult({
        is_equivalent: true,
        message: "same meaning",
      });

      assert(solver.answerText === "B", `expected normalized answer B, got ${solver.answerText}`);
      assert(solver.selectedOption === "B", `expected selected option B, got ${solver.selectedOption}`);
      assert(!solver.hasAmbiguity, "expected hasAmbiguity=false");
      assert(equivalence.isEquivalent, "expected equivalence true");
      assert(
        equivalence.reason === "same meaning",
        `expected equivalence reason to keep fallback message, got ${equivalence.reason}`,
      );
    });

    await it("应接受 selected_option / answer_text 这类 Sonnet 常见别名，避免误判成无法提取答案", async () => {
      const solver = normalizeSolverResult({
        answer_text: "答案是 B，因为需要乘以内层导数。",
        selected_option: "选项 B",
        hasAmbiguity: false,
        ambiguityReason: "",
      });

      assert(
        solver.answerText.includes("答案是 B"),
        `expected answer_text alias to be preserved, got ${solver.answerText}`,
      );
      assert(
        solver.selectedOption === "B",
        `expected selected_option alias to normalize into B, got ${solver.selectedOption}`,
      );
    });

    await it("应接受 my_answer / my_solution / is_ambiguous 这类 solver 原始字段", async () => {
      const solver = normalizeSolverResult({
        my_answer: "B",
        my_solution: "使用链式法则得到 6xcos(3x^2+1)。",
        hasAmbiguity: false,
        is_ambiguous: false,
        ambiguityReason: "",
        ambiguity_reason: "",
      });

      assert(solver.selectedOption === "B", `expected my_answer to normalize into B, got ${solver.selectedOption}`);
      assert(
        solver.answerText === "B",
        `expected my_answer to be preferred as final answer text, got ${solver.answerText}`,
      );
      assert(!solver.hasAmbiguity, "expected is_ambiguous=false");
    });

    await it("应能从中文答案或选项文本里反推出选择题字母，避免 verification 误杀", async () => {
      const labelFromChineseAnswer = extractChoiceLabel("答案是B，因为要先对外层求导。");
      const labelFromOptionText = inferChoiceLabelFromAnswerText(
        "导数应为 6xcos(3x^2 + 1)",
        [
          { label: "A", text: "3xcos(3x^2 + 1)" },
          { label: "B", text: "6xcos(3x^2 + 1)" },
          { label: "C", text: "6xsin(3x^2 + 1)" },
          { label: "D", text: "cos(3x^2 + 1)" },
        ],
      );

      assert(
        labelFromChineseAnswer === "B",
        `expected chinese answer text to resolve into B, got ${labelFromChineseAnswer}`,
      );
      assert(
        labelFromOptionText === "B",
        `expected option-text matching to resolve into B, got ${labelFromOptionText}`,
      );
    });

    await it("应接受 stem 和数组型 solutionSteps，避免 Sonnet 的可归一化输出被误判失败", async () => {
      const normalized = normalizeExercise({
        stem: "已知 y = (x^2+1)^3，求 y'。",
        type: "FR",
        difficulty: 2,
        correct_answer: "y' = 6x(x^2+1)^2",
        solutionSteps: [
          "把外层函数看成 u^3，先求导得到 3u^2。",
          "再乘以内层 u=x^2+1 的导数 2x。",
        ],
      });

      assert(
        normalized.questionText.includes("(x^2+1)^3"),
        `expected stem alias to map into questionText, got ${normalized.questionText}`,
      );
      assert(
        normalized.correctAnswer.includes("6x"),
        `expected correct_answer alias to map into correctAnswer, got ${normalized.correctAnswer}`,
      );
      assert(
        normalized.solutionSteps.includes("先求导得到 3u^2"),
        `expected array solutionSteps to be joined, got ${normalized.solutionSteps}`,
      );
    });
  });

  if (failed > 0) {
    console.error(`\n${failed} assertions failed.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nAll ${passed} assertions passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
