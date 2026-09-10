import {
  buildWorksheetContinuationPrompt,
  shouldContinueWorksheetGeneration,
} from "../../lib/agent/tools/generate-worksheet-shared";

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
  console.log("\ngenerate worksheet");

  await it("finishReason 为 length 时应触发 continuation", () => {
    const shouldContinue = shouldContinueWorksheetGeneration({
      finishReason: "length",
      integrityStatus: "complete",
      markdown: "# Worksheet\n\nPart 1",
    });

    assert(shouldContinue, "expected continuation for finishReason=length");
  });

  await it("即使 finishReason 为 stop，只要完整性 invalid 也应触发 continuation", () => {
    const shouldContinue = shouldContinueWorksheetGeneration({
      finishReason: "stop",
      integrityStatus: "invalid",
      markdown: "# Worksheet\n\n## Part 5\n\n- unfinished *",
    });

    assert(shouldContinue, "expected continuation for invalid worksheet tail");
  });

  await it("完整 stop 结果不应触发 continuation", () => {
    const shouldContinue = shouldContinueWorksheetGeneration({
      finishReason: "stop",
      integrityStatus: "complete",
      markdown: "# Worksheet\n\n## Warm-up\n\n- Complete sentence.",
    });

    assert(!shouldContinue, "did not expect continuation for complete stop result");
  });

  await it("continuation prompt 应保留教师需求并携带末尾上下文，而不是整段前文", () => {
    const longMarkdown = `最前面的旧上下文标记\n${"前文内容\n".repeat(2000)}最后一段收束到关键概念`;
    const prompt = buildWorksheetContinuationPrompt({
      teacherRequest: "连网搜索指环王相关内容，然后生成一个 worksheet",
      partialMarkdown: longMarkdown,
    });

    assert(
      prompt.includes("教师原始需求"),
      "expected continuation prompt to include teacher request header",
    );
    assert(
      prompt.includes("最后一段收束到关键概念"),
      "expected continuation prompt to include trailing worksheet context",
    );
    assert(
      !prompt.includes("最前面的旧上下文标记"),
      "expected continuation prompt to trim the oldest leading context",
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
