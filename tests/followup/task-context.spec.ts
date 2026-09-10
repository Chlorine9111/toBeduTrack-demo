import { buildAgentTaskContext } from "../../lib/agent/task-context";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  failures.push(message);
  console.error(`  FAIL: ${message}`);
}

async function it(name: string, fn: () => void | Promise<void>) {
  const before = failed;
  try {
    await fn();
    if (failed === before) {
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
  console.log("\nbuildAgentTaskContext");

  await it("fresh 请求的 retrievalQuery 不应混入旧对话知识点", () => {
    const context = buildAgentTaskContext({
      message: "帮我生成一个 AP Environmental Science Unit 1 的教案",
      action: "lesson_plan",
      actionLabel: "生成教案",
      curriculum: "AP Environmental Science Unit 1",
      topic: "",
      conversationContext: [
        "user: 帮我生成一道 chain rule 习题",
        "assistant: 已生成 1 道 AP Calculus 选择题。",
      ],
    });

    assert(context.mode === "fresh", `expected fresh mode, got ${context.mode}`);
    assert(
      !context.retrievalQuery.toLowerCase().includes("chain rule"),
      `expected fresh retrievalQuery to exclude stale chain rule context, got ${context.retrievalQuery}`,
    );
    assert(
      !context.retrievalQuery.toLowerCase().includes("calculus"),
      `expected fresh retrievalQuery to exclude stale calculus context, got ${context.retrievalQuery}`,
    );
  });

  await it("continuation 请求仍应保留上一轮上下文线索", () => {
    const context = buildAgentTaskContext({
      message: "继续把刚才那套题换成 FRQ",
      action: "generate_exercises",
      actionLabel: "生成练习题",
      curriculum: "",
      topic: "",
      conversationContext: [
        "user: 帮我出 5 道 AP Calculus BC Unit 3 chain rule 选择题",
        "assistant: 已补全关键偏好：生成练习题 · 5 道题 · AP Calculus BC Unit 3 · chain rule。开始执行。",
      ],
    });

    assert(
      context.mode === "continuation",
      `expected continuation mode, got ${context.mode}`,
    );
    assert(
      context.retrievalQuery.toLowerCase().includes("chain rule"),
      `expected continuation retrievalQuery to keep chain rule context, got ${context.retrievalQuery}`,
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
