import {
  inferExerciseSavePreference,
  resolveExerciseSaveDecision,
} from "../../lib/agent/exercise-save-preference";

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
  await describe("exercise save preference", async () => {
    await it("explicit no-save prompt should be temp_only", async () => {
      const preference = inferExerciseSavePreference(
        "请生成 3 道 AP Biology Unit 3 题，先不要入库。",
      );
      assert(preference === "temp_only", `expected temp_only, got ${preference}`);
    });

    await it("explicit save prompt should save immediately when curriculum is resolved", async () => {
      const decision = resolveExerciseSaveDecision({
        taskSavePreference: "default",
        promptText: "请生成 3 道 AP Biology Unit 3 题并保存到题库。",
        curriculumSaveMode: "save_now",
        courseId: "course-1",
      });
      assert(decision.shouldSaveToQuestionBank, "expected shouldSaveToQuestionBank=true");
      assert(
        decision.effectiveSaveMode === "save_now",
        `expected save_now, got ${decision.effectiveSaveMode}`,
      );
    });

    await it("plain generation prompt should wait for confirmation instead of auto-saving", async () => {
      const decision = resolveExerciseSaveDecision({
        taskSavePreference: "save_after_confirm",
        promptText: "请生成 3 道 AP Biology Unit 3 题。",
        curriculumSaveMode: "save_now",
        courseId: "course-1",
      });
      assert(!decision.shouldSaveToQuestionBank, "expected shouldSaveToQuestionBank=false");
      assert(
        (decision.effectiveSaveHint ?? "").includes("保存到题库"),
        `expected confirmation hint, got ${decision.effectiveSaveHint}`,
      );
    });

    await it("stale task temp_only flag should not leak into a fresh generation prompt", async () => {
      const decision = resolveExerciseSaveDecision({
        taskSavePreference: "temp_only",
        promptText: "帮我生成一道 chain rule 习题",
        curriculumSaveMode: "defer_until_curriculum",
        courseId: null,
      });

      assert(!decision.shouldSaveToQuestionBank, "expected shouldSaveToQuestionBank=false");
      assert(
        decision.effectivePreference === "save_after_confirm",
        `expected save_after_confirm, got ${decision.effectivePreference}`,
      );
    });

    await it("stale task default flag should not leak into a fresh generation prompt", async () => {
      const decision = resolveExerciseSaveDecision({
        taskSavePreference: "default",
        promptText: "帮我生成一道 chain rule 习题",
        curriculumSaveMode: "defer_until_curriculum",
        courseId: null,
      });

      assert(!decision.shouldSaveToQuestionBank, "expected shouldSaveToQuestionBank=false");
      assert(
        decision.effectivePreference === "save_after_confirm",
        `expected save_after_confirm, got ${decision.effectivePreference}`,
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
