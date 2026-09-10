import { shouldUseSelectedReferenceQaFastPath } from "../../lib/agent/reference-qa-fast-path";

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
  await describe("selected reference qa fast path", async () => {
    await it("显式引用资料且是普通问答时应命中快路径", async () => {
      const result = shouldUseSelectedReferenceQaFastPath({
        hasSelectedReferenceMaterials: true,
        hasInlineUploads: false,
        taskKind: "general",
        actions: [],
        taskContextAction: null,
      });

      assert(result, "expected fast path for referenced general qa");
    });

    await it("摘要整理型资料问答也应命中快路径", async () => {
      const result = shouldUseSelectedReferenceQaFastPath({
        hasSelectedReferenceMaterials: true,
        hasInlineUploads: false,
        taskKind: "summary",
        actions: [],
        taskContextAction: null,
        visiblePrompt: "请根据我引用的资料总结核心内容。",
      });

      assert(result, "expected fast path for referenced summary qa");
    });

    await it("被误判为 research 的资料问答仍应命中快路径", async () => {
      const result = shouldUseSelectedReferenceQaFastPath({
        hasSelectedReferenceMaterials: true,
        hasInlineUploads: false,
        taskKind: "research",
        actions: [],
        taskContextAction: null,
        visiblePrompt: "请根据我刚引用的资料回答这份文档主要讲了什么。",
      });

      assert(result, "expected fast path for reference-only research-like qa");
    });

    await it("taskContext action 为 research 时仍应命中快路径", async () => {
      const result = shouldUseSelectedReferenceQaFastPath({
        hasSelectedReferenceMaterials: true,
        hasInlineUploads: false,
        taskKind: "research",
        actions: [],
        taskContextAction: "research",
        visiblePrompt: "请根据我刚引用的资料回答这份文档主要讲了什么。",
      });

      assert(result, "expected fast path when taskContext action is research");
    });

    await it("明确要求联网或外部检索时不应命中快路径", async () => {
      const result = shouldUseSelectedReferenceQaFastPath({
        hasSelectedReferenceMaterials: true,
        hasInlineUploads: false,
        taskKind: "research",
        actions: [],
        taskContextAction: null,
        visiblePrompt: "请结合我引用的资料，再联网搜索最新案例做对比。",
      });

      assert(!result, "did not expect fast path for web-assisted research");
    });

    await it("带原始上传文件时不应命中快路径", async () => {
      const result = shouldUseSelectedReferenceQaFastPath({
        hasSelectedReferenceMaterials: true,
        hasInlineUploads: true,
        taskKind: "general",
        actions: [],
        taskContextAction: null,
        visiblePrompt: "请根据这些材料回答。",
      });

      assert(!result, "did not expect fast path when inline uploads exist");
    });

    await it("生成类 action 不应命中快路径", async () => {
      const result = shouldUseSelectedReferenceQaFastPath({
        hasSelectedReferenceMaterials: true,
        hasInlineUploads: false,
        taskKind: "general",
        actions: ["generate_lesson_plan"],
        taskContextAction: null,
        visiblePrompt: "请根据我引用的资料生成教案。",
      });

      assert(!result, "did not expect fast path for generation action");
    });

    await it("显式 taskContext action 不应命中快路径", async () => {
      const result = shouldUseSelectedReferenceQaFastPath({
        hasSelectedReferenceMaterials: true,
        hasInlineUploads: false,
        taskKind: "general",
        actions: [],
        taskContextAction: "generate_exercises",
        visiblePrompt: "请根据我引用的资料出题。",
      });

      assert(!result, "did not expect fast path with taskContext action");
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
