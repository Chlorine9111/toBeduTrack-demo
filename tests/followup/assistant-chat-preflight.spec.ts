import {
  formatAssistantClarificationMessage,
  prepareAssistantReply,
} from "../../lib/assistant/chat";

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
  console.log("\nassistant chat preflight");

  await it("clarification formatter 应输出 summary + question + options", () => {
    const text = formatAssistantClarificationMessage({
      summary: "我还需要确认一个关键点。",
      question: "你想让我做什么？",
      options: [
        { label: "生成习题", value: "generate_exercises" },
        { label: "生成教案", value: "lesson_plan" },
      ],
    });

    assert(text.includes("我还需要确认一个关键点。"), "expected summary");
    assert(text.includes("你想让我做什么？"), "expected question");
    assert(text.includes("生成习题"), "expected option label");
  });

  await it("prepareAssistantReply 在模糊请求上应优先使用 preflight 追问", async () => {
    const prepared = await prepareAssistantReply({
      teacherId: "teacher-1",
      message: "帮我处理一下 AP Calculus 这个单元",
      history: [],
    });

    assert(
      typeof prepared.immediateAnswer === "string" &&
        prepared.immediateAnswer.includes("可直接回复其中一个选项"),
      `expected preflight clarification, got ${prepared.immediateAnswer ?? "undefined"}`,
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
