import { buildAgentSystemPrompt } from "../../lib/agent/chat-route-prompt";

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
  await describe("chat route prompt material awareness", async () => {
    await it("教师显式选定资料时应注入更严格的资料规则", async () => {
      const prompt = buildAgentSystemPrompt({
        hasUploadedMaterials: true,
        hasReferencedMaterials: true,
      });

      assert(
        prompt.includes("教师从内容库显式选定的参考资料"),
        `expected referenced material guidance, got: ${prompt}`,
      );
      assert(
        prompt.includes("直接基于所附资料回答，不调用任何生成工具"),
        `expected direct-answer guidance, got: ${prompt}`,
      );
      assert(
        prompt.includes("根据《资料标题》第N段"),
        `expected source naming guidance, got: ${prompt}`,
      );
      assert(
        prompt.includes("所附资料未覆盖此内容"),
        `expected insufficiency guidance, got: ${prompt}`,
      );
    });

    await it("只有普通上传材料时应保留通用文案，不误报教师显式选定资料", async () => {
      const prompt = buildAgentSystemPrompt({
        hasUploadedMaterials: true,
        hasReferencedMaterials: false,
      });

      assert(
        prompt.includes("当前有上传材料或已引用内容，生成任务优先整合这些材料"),
        `expected generic material guidance, got: ${prompt}`,
      );
      assert(
        !prompt.includes("教师显式选定的参考资料"),
        `did not expect selected-reference wording, got: ${prompt}`,
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
