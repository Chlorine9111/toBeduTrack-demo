import { detectAssistantIntent } from "../../lib/assistant/intent-router";

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
  console.log("\nassistant intent router");

  await it("教案请求应复用 triage 后落到 generate_lesson_plan", () => {
    const result = detectAssistantIntent("帮我做一份 AP Biology Unit 3 的 lesson plan");

    assert(
      result.intent === "generate_lesson_plan",
      `expected generate_lesson_plan, got ${result.intent}`,
    );
    assert(result.useKnowledge, "expected useKnowledge=true");
  });

  await it("联网检索请求应落到 search_web", () => {
    const result = detectAssistantIntent("帮我搜索一下今年 AP Chemistry 官方更新");

    assert(result.intent === "search_web", `expected search_web, got ${result.intent}`);
    assert(result.useWeb, "expected useWeb=true");
  });

  await it("worksheet 请求在旧 assistant 链中应映射为 generate_exercises", () => {
    const result = detectAssistantIntent("根据这份资料生成一份 worksheet，并附答案解析");

    assert(
      result.intent === "generate_exercises",
      `expected generate_exercises, got ${result.intent}`,
    );
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
