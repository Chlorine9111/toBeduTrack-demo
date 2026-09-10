import { embedArtifactPayload } from "../../lib/agent/artifact-payload";
import {
  artifactCanGenerateAnswerKey,
  findLatestPersistedArtifact,
  resolveSourceArtifact,
} from "../../lib/agent/tools/source-artifact";

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
  console.log("\nsource artifact");

  await it("应优先读取当前轮刚生成的 artifact", () => {
    const resolved = resolveSourceArtifact(
      {
        previousMessages: [],
        latestGeneratedArtifact: {
          type: "worksheet",
          artifact: {
            kind: "worksheet",
            title: "当前轮 Worksheet",
            summary: "summary",
            rawContent: "# 当前轮 Worksheet\n\n1. Q",
          },
        },
      },
      ["worksheet"],
    );

    assert(Boolean(resolved), "expected a source artifact");
    assert(resolved?.source === "current_turn", `expected current_turn, got ${resolved?.source}`);
    assert(resolved?.artifact.title === "当前轮 Worksheet", "expected current-turn title");
  });

  await it("没有当前轮 artifact 时应回退到最近历史 artifact", () => {
    const previousMessages = [
      {
        role: "assistant" as const,
        content: embedArtifactPayload("已生成练习卷", {
          kind: "exam",
          title: "历史试卷",
          summary: "summary",
          rawContent: "# 历史试卷\n\n1. Q",
        }),
      },
    ];

    const persisted = findLatestPersistedArtifact(previousMessages, ["exam"]);
    assert(Boolean(persisted), "expected persisted artifact from history");
    assert(persisted?.title === "历史试卷", `expected 历史试卷, got ${persisted?.title}`);

    const resolved = resolveSourceArtifact(
      {
        previousMessages,
        latestGeneratedArtifact: null,
      },
      ["exam"],
    );

    assert(Boolean(resolved), "expected resolved artifact from history");
    assert(resolved?.source === "history", `expected history, got ${resolved?.source}`);
    assert(resolved?.artifact.title === "历史试卷", "expected history title");
  });

  await it("worksheet 含活动与 quick check 时应允许生成 answer key", () => {
    const allowed = artifactCanGenerateAnswerKey({
      kind: "worksheet",
      rawContent:
        "# Chapter 11 Guided Notes\n\n## Quick Check\n1. Why does Dennis visit the school?\n\n## 活动\n请和同伴讨论 Pamela 的处境。",
    });

    assert(allowed, "expected worksheet with questions/activity to support answer key");
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
