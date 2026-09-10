import { isDocumentMetadataReadOnly } from "../../lib/documents/store";

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

async function main() {
  console.log("\ndocument readonly metadata");

  assert(
    isDocumentMetadataReadOnly({ readOnly: true }) === true,
    "expected readOnly=true metadata to be recognized",
  );
  assert(
    isDocumentMetadataReadOnly({ readOnly: false }) === false,
    "expected readOnly=false metadata to stay editable",
  );
  assert(
    isDocumentMetadataReadOnly(null) === false,
    "null metadata should not be readonly",
  );

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
