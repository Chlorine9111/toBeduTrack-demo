import { deleteContentLibraryRowsAfterLinkedAssets } from "../../lib/content-library/delete-helpers";

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
  await describe("content library deletion order", async () => {
    await it("should delete or unlink linked assets before deleting content library rows", async () => {
      const operations: string[] = [];

      await deleteContentLibraryRowsAfterLinkedAssets({
        deleteLinkedAssets: async () => {
          operations.push("delete-reference-assets");
          operations.push("unlink-uploaded-assets");
        },
        deleteItems: async () => {
          operations.push("delete-library-items");
          const cleanedLinkedAssets =
            operations.includes("delete-reference-assets") &&
            operations.includes("unlink-uploaded-assets");

          return cleanedLinkedAssets
            ? { error: null }
            : {
                error: {
                  message:
                    "update or delete on table content_library_items violates check constraint after fk set null",
                },
              };
        },
      });

      assert(
        operations.join(" -> ") ===
          "delete-reference-assets -> unlink-uploaded-assets -> delete-library-items",
        `unexpected order ${operations.join(" -> ")}`,
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
