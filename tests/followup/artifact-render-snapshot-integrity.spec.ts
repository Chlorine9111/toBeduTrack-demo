import { buildArtifactRenderSnapshot } from "../../lib/agent/artifact-render-snapshot";

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
  await it("会清理半截标题里的孤立 markdown 标记和重复尾词", () => {
    const snapshot = buildArtifactRenderSnapshot({
      kind: "worksheet",
      title: "Part 5 — L'Hôpital's Rule **Rule",
      summary: "课堂 worksheet",
      rawContent: "# Part 5 — L'Hôpital's Rule **Rule\n\n## Warm-up\n\n- Solve the derivative.",
      sourceStage: "complete",
      allowLegacyFallback: true,
    });

    assert(
      snapshot.title === "Part 5 — L'Hôpital's Rule",
      `expected cleaned title, got ${snapshot.title}`,
    );
    assert(
      snapshot.integrityStatus === "repaired",
      `expected repaired integrity, got ${snapshot.integrityStatus}`,
    );
    assert(Boolean(snapshot.document), "expected repaired markdown to still build a document");
  });

  await it("尾部孤立强调标记会在落正式文档前被清理", () => {
    const snapshot = buildArtifactRenderSnapshot({
      kind: "notes",
      title: "AP Calculus Notes",
      summary: "摘要",
      rawContent: "# AP Calculus Notes\n\nL'Hôpital's Rule helps evaluate indeterminate forms **",
      sourceStage: "complete",
      allowLegacyFallback: true,
    });

    assert(
      !snapshot.rawContent.endsWith("**"),
      `expected dangling suffix to be removed, got ${snapshot.rawContent}`,
    );
    assert(
      snapshot.integrityStatus === "repaired",
      `expected repaired integrity, got ${snapshot.integrityStatus}`,
    );
  });

  await it("明显未闭合的 markdown 不能直接升级成正式文档", () => {
    const snapshot = buildArtifactRenderSnapshot({
      kind: "worksheet",
      title: "Broken Worksheet",
      summary: "摘要",
      rawContent: "# Broken Worksheet\n\n```markdown\n- still open",
      sourceStage: "complete",
      allowLegacyFallback: true,
    });

    assert(
      snapshot.integrityStatus === "invalid",
      `expected invalid integrity, got ${snapshot.integrityStatus}`,
    );
    assert(snapshot.document === undefined, "expected invalid snapshot to skip document fallback");
    assert(snapshot.htmlContent === undefined, "expected invalid snapshot to skip html fallback");
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
