import { POST } from "../../app/api/agent/preflight/route";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`  FAIL: ${message}`);
}

async function main() {
  console.log("\nagent preflight retired route");

  const response = await POST();
  const payload = await response.json().catch(() => null);

  assert(response.status === 410, `expected 410, got ${response.status}`);
  assert(
    payload?.error?.code === "FEATURE_DISABLED",
    `expected FEATURE_DISABLED, got ${payload?.error?.code ?? "unknown"}`,
  );
  assert(
    typeof payload?.error?.message === "string" &&
      payload.error.message.includes("/api/agent/chat"),
    "expected retirement message to direct callers to /api/agent/chat",
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
