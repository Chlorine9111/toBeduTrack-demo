import { buildArtifactRenderSnapshot } from "../../lib/agent/artifact-render-snapshot";
import {
  buildExamDocumentFromRenderInput,
  buildExercisesDocumentFromAgentQuestions,
  buildRubricDocumentFromMock,
  buildWorksheetDocumentFromRenderInput,
} from "../../lib/doc-engine/adapters";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failed += 1;
    console.error(`  FAIL: ${message}`);
    return;
  }
  passed += 1;
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
    console.error(`  FAIL: ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  console.log("\nartifact render snapshot");

  await it("should build stable html snapshot for exercises", () => {
    const document = buildExercisesDocumentFromAgentQuestions({
      title: "AI 生成试题",
      questions: [
        {
          id: "q-1",
          questionNumber: 1,
          questionType: "MC",
          title: "第 1 题",
          stem: "Which statement about limits is correct?",
          options: [
            { key: "A", content: "Option A" },
            { key: "B", content: "Option B" },
          ],
          answer: "A",
          solution: "Use the limit definition.",
        },
      ],
    });
    const first = buildArtifactRenderSnapshot({
      kind: "exercises",
      title: "AI 生成试题",
      summary: "一套带解析的试题",
      rawContent: "",
      document,
      sourceStage: "complete",
    });
    const second = buildArtifactRenderSnapshot({
      kind: "exercises",
      title: "AI 生成试题",
      summary: "一套带解析的试题",
      rawContent: "",
      document,
      sourceStage: "persisted",
    });

    assert(Boolean(first.htmlContent), "expected exercises snapshot html to exist");
    assert(first.htmlContent === second.htmlContent, "expected exercises html snapshot to be stable");
    assert(
      first.htmlContent?.includes("Which statement about limits is correct?") ?? false,
      "expected exercises html to contain the question stem",
    );
  });

  await it("should build stable html snapshot for rubric matrix", () => {
    const document = buildRubricDocumentFromMock({
      id: "rubric-1",
      title: "课堂展示 Rubric",
      dimensions: [
        {
          id: "dim-1",
          name: "科学准确性",
          description: "是否准确使用核心概念",
          weight: 60,
          levels: {
            excellent: "概念准确且表述清晰",
            good: "概念基本准确",
            passing: "存在轻微概念偏差",
            failing: "核心概念明显错误",
          },
        },
        {
          id: "dim-2",
          name: "表达组织",
          description: "是否有清晰结构",
          weight: 40,
          levels: {
            excellent: "结构完整，过渡自然",
            good: "结构较清晰",
            passing: "结构松散",
            failing: "结构混乱",
          },
        },
      ],
      columnLabels: {
        excellent: "4",
        good: "3",
        passing: "2",
        failing: "1",
      },
    });
    const snapshot = buildArtifactRenderSnapshot({
      kind: "rubric",
      title: document.title,
      summary: "Rubric 矩阵",
      rawContent: "",
      document,
      sourceStage: "complete",
    });

    assert(Boolean(snapshot.htmlContent), "expected rubric snapshot html to exist");
    assert(
      snapshot.htmlContent?.includes('data-rubric="true"') ?? false,
      "expected rubric html to keep matrix table markup",
    );
    assert(
      snapshot.htmlContent?.includes("科学准确性") ?? false,
      "expected rubric html to contain dimension labels",
    );
  });

  await it("should build stable html snapshot for worksheet and exam without dropping sections", () => {
    const worksheetDocument = buildWorksheetDocumentFromRenderInput({
      id: "worksheet-1",
      title: "Unit 3 Worksheet",
      courseName: "AP Biology",
      unitName: "Unit 3",
      sections: [
        {
          title: "选择题",
          rationale: "先做概念题",
          exerciseIds: ["wq-1"],
        },
      ],
      exercises: [
        {
          id: "wq-1",
          exerciseType: "MC",
          difficulty: 2,
          questionText: "Which process requires ATP?",
          options: [
            { label: "A", text: "Diffusion" },
            { label: "B", text: "Active transport" },
          ],
          correctAnswer: "B",
          solutionSteps: "ATP powers active transport.",
        },
      ],
    });
    const examDocument = buildExamDocumentFromRenderInput({
      id: "exam-1",
      title: "Unit 3 Exam",
      courseName: "AP Biology",
      unitName: "Unit 3",
      sections: [
        {
          title: "Section I",
          rationale: "选择题部分",
          exerciseIds: ["eq-1"],
        },
      ],
      exercises: [
        {
          id: "eq-1",
          exerciseType: "MC",
          difficulty: 3,
          questionText: "Which organelle is responsible for ATP synthesis?",
          options: [
            { label: "A", text: "Nucleus" },
            { label: "B", text: "Mitochondrion" },
          ],
          correctAnswer: "B",
          solutionSteps: "ATP synthesis occurs in mitochondria.",
        },
      ],
    });
    const worksheetSnapshot = buildArtifactRenderSnapshot({
      kind: "worksheet",
      title: worksheetDocument.title,
      summary: "worksheet snapshot",
      rawContent: "",
      document: worksheetDocument,
      sourceStage: "complete",
    });
    const examSnapshot = buildArtifactRenderSnapshot({
      kind: "exam",
      title: examDocument.title,
      summary: "exam snapshot",
      rawContent: "",
      document: examDocument,
      sourceStage: "complete",
    });

    assert(
      worksheetSnapshot.htmlContent?.includes("选择题") ?? false,
      "expected worksheet html to keep section title",
    );
    assert(
      worksheetSnapshot.htmlContent?.includes("Which process requires ATP?") ?? false,
      "expected worksheet html to keep question content",
    );
    assert(
      examSnapshot.htmlContent?.includes("Section I") ?? false,
      "expected exam html to keep section title",
    );
    assert(
      examSnapshot.htmlContent?.includes("Which organelle is responsible for ATP synthesis?") ?? false,
      "expected exam html to keep question content",
    );
  });

  await it("should repair escaped markdown before legacy fallback html conversion", () => {
    const snapshot = buildArtifactRenderSnapshot({
      kind: "notes",
      title: "异常 markdown",
      summary: "应先修复再渲染",
      rawContent:
        "\"## 标题\\\\n\\\\n正文第一段\\\\n\\\\n\\\\\\\\[E=mc^2\\\\\\\\]\"",
      sourceStage: "legacy",
      allowLegacyFallback: true,
    });

    assert(
      snapshot.rawContent.includes("## 标题"),
      `expected raw content heading to be repaired, got ${snapshot.rawContent}`,
    );
    assert(
      snapshot.rawContent.includes("\\[E=mc^2\\]"),
      `expected math delimiters to be repaired, got ${snapshot.rawContent}`,
    );
    assert(
      snapshot.htmlContent?.includes("正文第一段") ?? false,
      "expected legacy html fallback to render repaired markdown content",
    );
  });

  console.log("\n==================================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

void main();
