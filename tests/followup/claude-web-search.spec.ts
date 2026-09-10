import { resolveClaudeWebSearchModel } from "../../lib/assistant/claude-web-search";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${message}`);
}

async function it(name: string, fn: () => void | Promise<void>) {
  const failedBefore = failed;
  await fn();
  if (failed === failedBefore) {
    console.log(`PASS: ${name}`);
  }
}

async function main() {
  console.log("\nclaude web search");

  await it("应把 OpenRouter 风格的 Claude model 归一成原生 Anthropic SDK 可用格式", () => {
    const model = resolveClaudeWebSearchModel("anthropic/claude-sonnet-4.6");
    assert(
      model === "claude-sonnet-4-6",
      `expected claude-sonnet-4-6, got ${model}`,
    );
  });

  await it("应保留已是原生 Anthropic dated model 的格式，只去掉 provider 前缀", () => {
    const model = resolveClaudeWebSearchModel("anthropic/claude-sonnet-4-5-20250929");
    assert(
      model === "claude-sonnet-4-5-20250929",
      `expected claude-sonnet-4-5-20250929, got ${model}`,
    );
  });

  if (failed > 0) {
    console.error(`${failed} assertions failed.`);
    process.exitCode = 1;
    return;
  }

  console.log(`All ${passed} assertions passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
