import {
  buildLessonPlanDocumentFromPdfInput,
  buildWorksheetDocumentFromRenderInput,
} from "../../lib/doc-engine/adapters";
import { buildDocumentExportSnapshotFromDocument } from "../../lib/doc-engine/export-snapshot";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failed += 1;
    console.error(`FAIL: ${message}`);
    return;
  }
  passed += 1;
}

function main() {
  const worksheetDocument = buildWorksheetDocumentFromRenderInput({
    id: "worksheet-export-test",
    title: "Math Worksheet",
    courseName: "AP Calculus AB",
    unitName: "Unit 5",
    sections: [],
    exercises: [
      {
        id: "q1",
        exerciseType: "FR",
        difficulty: 2,
        questionText: "求导数：$f(x)=x^2$，并说明为什么 $f'(x)=2x$。",
        correctAnswer: "$2x$",
        solutionSteps: "由幂函数求导法则可得 $$\\frac{d}{dx}x^2=2x$$。",
      },
    ],
  });

  const worksheetSnapshot = buildDocumentExportSnapshotFromDocument({
    document: worksheetDocument,
    sourceKind: "worksheet-visible-test",
  });

  assert(worksheetSnapshot.html.includes('data-doc-type="worksheet"'), "worksheet snapshot 缺少文档类型");
  assert(worksheetSnapshot.mathNodeCount >= 2, `worksheet snapshot 数学节点过少: ${worksheetSnapshot.mathNodeCount}`);
  assert(worksheetSnapshot.html.includes("data-latex=\"f(x)=x^2\""), "worksheet snapshot 丢失题干公式");
  assert(worksheetSnapshot.html.includes("data-latex=\"2x\""), "worksheet snapshot 丢失答案公式");

  const lessonPlanDocument = buildLessonPlanDocumentFromPdfInput({
    id: "lesson-plan-export-test",
    lessonPlan: {
      title: "Derivative Lesson",
      courseName: "AP Calculus AB",
      unitName: "Unit 5",
      totalMinutes: 45,
      level: "medium",
      sections: [
        {
          id: "section-1",
          title: "Warm-up",
          summary: "Recall derivative rules",
          durationMinutes: 10,
          sortOrder: 0,
          blocks: [
            {
              id: "block-1",
              type: "math",
              sortOrder: 0,
              content: {
                latex: "\\frac{d}{dx}x^n = nx^{n-1}",
                displayMode: true,
              },
              cedCodes: [],
            },
          ],
        },
      ],
    },
  });

  const lessonSnapshot = buildDocumentExportSnapshotFromDocument({
    document: lessonPlanDocument,
    sourceKind: "lesson-plan-visible-test",
  });

  assert(lessonSnapshot.html.includes('data-doc-type="lesson-plan"'), "lesson snapshot 缺少文档类型");
  assert(lessonSnapshot.mathNodeCount >= 1, `lesson snapshot 数学节点过少: ${lessonSnapshot.mathNodeCount}`);
  assert(
    lessonSnapshot.html.includes('data-latex="\\frac{d}{dx}x^n = nx^{n-1}"'),
    "lesson snapshot 丢失 lesson plan 数学公式",
  );

  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();
