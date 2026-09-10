import {
  buildExercisePipelineStrategy,
  heuristicBlueprint,
  splitExerciseRequestIntoBatches,
} from "../../lib/agent/exercise-pipeline-helpers";

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
  await describe("exercise pipeline strategy", async () => {
    await it("3 道中等 MC 题应走整批 teacher_review，而不是逐题 solver_verify", async () => {
      const blueprint = heuristicBlueprint({
        model: "anthropic/claude-sonnet-4.6",
        teacherRequest: "帮我生成 3 道 AP Biology Unit 3 选择题",
        count: 3,
        exerciseType: "MC",
        language: "中文",
        uploadedMaterials: [],
      });
      const strategy = buildExercisePipelineStrategy({
        blueprint,
        requestedRepairRounds: 2,
      });

      assert(
        strategy.verificationMode === "teacher_review",
        `expected teacher_review, got ${strategy.verificationMode}`,
      );
      assert(strategy.useTeacherReview, "3 道常见 MC 题应优先走整批 teacher_review");
      assert(strategy.verificationConcurrency === 3, "3 道题应允许 3 并发验证");
    });

    await it("2 道高阶 FR 题仍应保留 solver_verify", async () => {
      const blueprint = heuristicBlueprint({
        model: "anthropic/claude-sonnet-4.6",
        teacherRequest: "帮我生成 2 道高阶 AP Chemistry FRQ",
        count: 2,
        exerciseType: "FR",
        language: "中文",
        uploadedMaterials: [],
      });
      const strategy = buildExercisePipelineStrategy({
        blueprint,
        requestedRepairRounds: 2,
      });

      assert(
        strategy.verificationMode === "solver_verify",
        `expected solver_verify, got ${strategy.verificationMode}`,
      );
      assert(strategy.useSolverVerification, "高阶小批量 FR 题仍需逐题 solver 验证");
    });

    await it("10 道题请求应拆成 5+5 批次，而不是继续放大小批量链路", async () => {
      const batches = splitExerciseRequestIntoBatches(10);

      assert(
        batches.length === 2 && batches[0] === 5 && batches[1] === 5,
        `expected [5,5], got [${batches.join(", ")}]`,
      );
    });

    await it("启发式蓝图应允许解析到 10 道题，而不是被截回 6", async () => {
      const blueprint = heuristicBlueprint({
        model: "anthropic/claude-sonnet-4.6",
        teacherRequest: "帮我生成 10 道 AP Physics 选择题",
        count: 10,
        exerciseType: "MC",
        language: "中文",
        uploadedMaterials: [],
      });

      assert(blueprint.count === 10, `expected count=10, got ${blueprint.count}`);
    });

    await it("带材料的小批量 MC 请求应提升到 solver_verify，而不是继续走轻审", async () => {
      const blueprint = heuristicBlueprint({
        model: "anthropic/claude-sonnet-4.6",
        teacherRequest: "基于上传材料生成 3 道 AP History 选择题",
        count: 3,
        exerciseType: "MC",
        language: "中文",
        uploadedMaterials: [],
      });
      const strategy = buildExercisePipelineStrategy({
        blueprint,
        requestedRepairRounds: 1,
        hasMaterialContext: true,
      });

      assert(
        strategy.verificationMode === "solver_verify",
        `expected solver_verify, got ${strategy.verificationMode}`,
      );
      assert(strategy.useSolverVerification, "带材料的小批量 MC 请求应走更重验证");
    });
  });

  await describe("exercise verification model routing", async () => {
    await it("验证与等价判定默认应切到 Gemini Flash 线，不再跟随 Sonnet 主生成模型", async () => {
      const modelRouterNamespace = await import("../../lib/ai/model-router");
      const modelRouterModule =
        (modelRouterNamespace as unknown as { default?: unknown; "module.exports"?: unknown }).default ??
        (modelRouterNamespace as unknown as { "module.exports"?: unknown })["module.exports"] ??
        modelRouterNamespace;
      const { getModelForTask } = modelRouterModule as {
        getModelForTask: (task: string) => string;
      };
      const verifyModel = getModelForTask("exercise_verify");
      const equivalenceModel = getModelForTask("exercise_equivalence");

      assert(
        verifyModel.includes("gemini-3.1-flash"),
        `expected verify model to use gemini flash, got ${verifyModel}`,
      );
      assert(
        equivalenceModel.includes("gemini-3.1-flash"),
        `expected equivalence model to use gemini flash, got ${equivalenceModel}`,
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
