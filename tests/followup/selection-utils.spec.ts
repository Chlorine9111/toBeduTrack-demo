import {
  countMeaningfulSelectionChars,
  hasMeaningfulSelectionText,
  MIN_MEANINGFUL_SELECTION_CHARS,
} from "../../lib/doc-engine/selection-utils";

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
  console.log("\nselection utils");

  await it("should ignore whitespace when counting selected characters", () => {
    assert(
      countMeaningfulSelectionChars("  导 数  ") === 2,
      "expected whitespace to be ignored for Chinese text",
    );
    assert(
      countMeaningfulSelectionChars("x  ^  2") === 3,
      "expected math-like text to count only meaningful characters",
    );
  });

  await it("should treat two Chinese characters as a meaningful selection", () => {
    assert(
      hasMeaningfulSelectionText("导数", MIN_MEANINGFUL_SELECTION_CHARS),
      "expected two Chinese characters to open selection actions",
    );
  });

  await it("should reject empty or one-character selections", () => {
    assert(!hasMeaningfulSelectionText(" "), "expected blank selection to be rejected");
    assert(!hasMeaningfulSelectionText("导"), "expected single character selection to be rejected");
  });

  console.log("\n==================================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

void main();
