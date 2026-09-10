import {
  normalizeArtifactRenderableContent,
} from "../../lib/agent/artifact-text";

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
  console.log("\nartifact text");

  await it("应能解开被整体 JSON.stringify 的 markdown", () => {
    const normalized = normalizeArtifactRenderableContent(
      "\"## 单元目标\\\\n\\\\n- 目标一\\\\n- 目标二\"",
    );

    assert(normalized.repairApplied, "expected quoted markdown to be repaired");
    assert(normalized.renderMode === "markdown", "expected markdown render mode");
    assert(normalized.content.includes("## 单元目标"), "expected heading to survive");
    assert(normalized.content.includes("- 目标一"), "expected list item to survive");
    assert(normalized.content.includes("\n"), "expected escaped line breaks to become real newlines");
  });

  await it("应能修复双重转义的 LaTeX 分隔符而不改坏正常公式", () => {
    const normalized = normalizeArtifactRenderableContent(
      "## 公式\\\\n\\\\n\\\\\\\\[a^2+b^2=c^2\\\\\\\\]\\\\n\\\\n正常行内公式：\\\\(x+1\\\\)",
    );

    assert(normalized.renderMode === "markdown", "expected markdown render mode for math payload");
    assert(normalized.content.includes("\\[a^2+b^2=c^2\\]"), "expected display math delimiters to be repaired");
    assert(normalized.content.includes("\\(x+1\\)"), "expected inline math delimiters to stay valid");
  });

  await it("纯反斜杠噪音应回退为纯文本显示", () => {
    const normalized = normalizeArtifactRenderableContent("\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\");

    assert(
      normalized.renderMode === "plain-text-fallback",
      "expected slash noise to enter plain text fallback",
    );
    assert(normalized.content.length > 0, "expected slash noise content to remain visible");
  });

  await it("普通路径文本不应被误判为需要修复", () => {
    const normalized = normalizeArtifactRenderableContent(
      "下载目录：C:\\\\Users\\\\martin\\\\Downloads\\\\lesson-plan.md",
    );

    assert(normalized.renderMode === "markdown", "expected path text to remain markdown-compatible");
    assert(
      normalized.content.includes("C:\\\\Users\\\\martin\\\\Downloads\\\\lesson-plan.md"),
      "expected windows-style path to stay intact",
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
