/**
 * Minimal tests for structured streaming callback behavior.
 *
 * Can be run with: npx tsx tests/followup/ai-gateway-structured-stream.spec.ts
 */

import { emitStructuredObjectPartialUpdates } from "../../lib/ai/gateway";

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

function describe(name: string, fn: () => Promise<void>) {
  return (async () => {
    console.log(`\n${name}`);
    await fn();
  })();
}

async function it(name: string, fn: () => Promise<void>) {
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

async function* toAsyncIterable<T>(items: T[]) {
  for (const item of items) {
    yield item;
  }
}

async function main() {
  await describe("emitStructuredObjectPartialUpdates", async () => {
    await it("should emit when top-level array gains new items", async () => {
      const snapshots: Array<Record<string, unknown>> = [];

      await emitStructuredObjectPartialUpdates({
        partialOutputStream: toAsyncIterable([
          { exercises: [{ question: "Q1" }] },
          { exercises: [{ question: "Q1" }] },
          { exercises: [{ question: "Q1" }, { question: "Q2" }] },
        ]),
        onPartialObject: async (partialObject) => {
          snapshots.push(partialObject);
        },
      });

      assert(snapshots.length === 2, `expected 2 callback emissions, got ${snapshots.length}`);
      assert(
        Array.isArray(snapshots[1]?.exercises) && (snapshots[1]?.exercises as unknown[]).length === 2,
        "second callback should include the second completed array item",
      );
    });

    await it("should emit when non-array partial object changes", async () => {
      const titles: string[] = [];

      await emitStructuredObjectPartialUpdates({
        partialOutputStream: toAsyncIterable([
          { title: "初稿" },
          { title: "初稿" },
          { title: "终稿", summary: "done" },
        ]),
        onPartialObject: async (partialObject) => {
          if (typeof partialObject.title === "string") {
            titles.push(partialObject.title);
          }
        },
      });

      assert(titles.length === 2, `expected 2 title updates, got ${titles.length}`);
      assert(titles[0] === "初稿", `first title should be 初稿, got ${titles[0] ?? "<empty>"}`);
      assert(titles[1] === "终稿", `second title should be 终稿, got ${titles[1] ?? "<empty>"}`);
    });
  });

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failures.length > 0) {
    console.error("\nFailures:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
}

void main();
