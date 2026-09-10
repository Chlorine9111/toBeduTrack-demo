import { buildStreamingArtifactPreview } from "../../components/main/agent/stream-artifact-runtime";
import type { StreamingArtifact } from "../../components/main/agent/stream-runner";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failed += 1;
    console.error(`  FAIL: ${message}`);
    return;
  }
  passed += 1;
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
    console.error(`  FAIL: ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  console.log("\nstream artifact runtime");

  await it("应保留 live 会话的 sourceMessageId，而不是回退到 artifactKey", () => {
    const preview = buildStreamingArtifactPreview(
      {
        toolCallId: "tool-worksheet-1",
        artifactKey: "artifact-worksheet-1",
        sourceMessageId: "assistant-local-1",
        artifactKind: "worksheet",
        title: "Worksheet（生成中）",
        summary: "正在生成 worksheet",
        rawContent: "# Worksheet\n\n1. Solve the equation.",
        items: [],
        isComplete: true,
        meta: {},
      } as StreamingArtifact,
      true,
    );

    assert(Boolean(preview), "expected preview to be built");
    assert(
      preview?.sourceMessageId === "assistant-local-1",
      `expected sourceMessageId to stay on live assistant message, got ${preview?.sourceMessageId}`,
    );
    assert(
      preview?.artifactKey === "artifact-worksheet-1",
      `unexpected artifactKey: ${preview?.artifactKey}`,
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
