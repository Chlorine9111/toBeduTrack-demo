import {
  buildRenderableFigureMarkdown,
  inferScopedUnitFromHint,
  resolveExerciseType,
} from "../../lib/pdf-scan/save-to-library";
import {
  matchDocumentSubjectCourse,
} from "../../lib/pdf-scan/classify-document-subject";

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
  await describe("matchDocumentSubjectCourse", async () => {
    await it("应该优先把整卷 Biology 识别结果匹配到 AP Biology，而不是 AP Calculus", () => {
      const matched = matchDocumentSubjectCourse({
        courseName: "AP Biology",
        courseCode: "ap_biology",
        courses: [
          { id: "calc", name: "AP Calculus AB and BC", code: "AP_CALCULUS_AB_BC" },
          { id: "bio", name: "AP Biology", code: "AP_BIOLOGY" },
          { id: "chem", name: "AP Chemistry", code: "AP_CHEMISTRY" },
        ],
      });

      assert(matched?.id === "bio", `expected AP Biology, got ${matched?.name ?? "null"}`);
    });

    await it("无法稳定匹配时应该返回 null", () => {
      const matched = matchDocumentSubjectCourse({
        courseName: "Unknown Subject",
        courseCode: "unknown_subject",
        courses: [
          { id: "calc", name: "AP Calculus AB and BC", code: "AP_CALCULUS_AB_BC" },
          { id: "bio", name: "AP Biology", code: "AP_BIOLOGY" },
        ],
      });

      assert(matched == null, `expected null match, got ${matched?.name ?? "non-null"}`);
    });
  });

  await describe("inferScopedUnitFromHint", async () => {
    await it("在课程已确定时，应该按题目语义匹配到课程内正确单元", () => {
      const inferred = inferScopedUnitFromHint({
        hintText: [
          "Questions about cell membrane transport, organelles, and compartmentalization.",
          "Sample stem: Describe how the plasma membrane and endoplasmic reticulum support cell function.",
        ].join("\n"),
        course: {
          id: "bio",
          name: "AP Biology",
          code: "AP_BIOLOGY",
        },
        units: [
          {
            id: "unit-1",
            course_id: "bio",
            unit_number: "1",
            title: "Chemistry of Life",
          },
          {
            id: "unit-2",
            course_id: "bio",
            unit_number: "2",
            title: "Cell Structure and Function",
          },
          {
            id: "unit-3",
            course_id: "bio",
            unit_number: "3",
            title: "Cellular Energetics",
          },
        ],
      });

      assert(inferred?.unitId === "unit-2", `expected unit-2, got ${inferred?.unitId ?? "null"}`);
      assert(
        inferred?.unitLabel?.includes("Cell Structure and Function") === true,
        `unexpected unit label: ${inferred?.unitLabel ?? "null"}`,
      );
    });

    await it("没有有效 hintText 时不应强行推断单元", () => {
      const inferred = inferScopedUnitFromHint({
        hintText: "   ",
        course: {
          id: "bio",
          name: "AP Biology",
          code: "AP_BIOLOGY",
        },
        units: [
          {
            id: "unit-1",
            course_id: "bio",
            unit_number: "1",
            title: "Chemistry of Life",
          },
        ],
      });

      assert(inferred == null, `expected null inference, got ${JSON.stringify(inferred)}`);
    });
  });

  await describe("pdf scan question persistence helpers", async () => {
    await it("选择题一旦已识别为 choice，即使 options 缺失也应入库为 MC", () => {
      const exerciseType = resolveExerciseType({
        questionNumber: 1,
        content: "Choose the correct image.",
        questionType: "choice",
        difficulty: "medium",
        subject: "",
        knowledgePoint: "",
        options: null,
        correctAnswer: "",
        solutionSteps: "",
        confidence: 88,
        linkedFigures: [],
        subQuestions: [],
      });

      assert(exerciseType === "MC", `expected MC, got ${exerciseType}`);
    });

    await it("多张题干图片应保持 markdown 图片格式并去重", () => {
      const markdown = buildRenderableFigureMarkdown([
        "/storage/figure-1.png",
        "/storage/figure-2.png",
        "/storage/figure-1.png",
      ]);

      const imageRefs = markdown.match(/!\[[^\]]*\]\([^)]+\)/g) ?? [];
      assert(imageRefs.length === 2, `expected 2 image refs, got ${imageRefs.length}`);
      assert(markdown.includes("/storage/figure-1.png"), "应保留第一张图片");
      assert(markdown.includes("/storage/figure-2.png"), "应保留第二张图片");
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
