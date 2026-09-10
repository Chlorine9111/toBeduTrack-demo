import {
  acquireConcurrencySlot,
} from "../../lib/api/concurrency-limit";
import {
  evaluateWorkflowBudget,
  getWorkflowProfile,
} from "../../lib/runtime/workflow-profiles";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
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
    failed++;
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    console.error(`  FAIL: ${name}: ${message}`);
  }
}

async function main() {
  await describe("evaluateWorkflowBudget", async () => {
    await it("应正确标记 preflight 超出目标与上限预算", () => {
      const profile = getWorkflowProfile("agent_preflight");
      const result = evaluateWorkflowBudget(profile, {
        totalMs: 1_650,
      });

      assert(result.targetTotalMs === 800, `expected targetTotalMs 800, got ${result.targetTotalMs}`);
      assert(result.maxTotalMs === 1500, `expected maxTotalMs 1500, got ${result.maxTotalMs}`);
      assert(result.overTargetTotal, "preflight 超过目标耗时后应标记 overTargetTotal");
      assert(result.overMaxTotal, "preflight 超过最大耗时后应标记 overMaxTotal");
    });

    await it("应正确标记 agent chat 的 TTFT 超预算", () => {
      const profile = getWorkflowProfile("agent_chat");
      const result = evaluateWorkflowBudget(profile, {
        ttftMs: 2_300,
        totalMs: 12_000,
      });

      assert(result.targetTtftMs === 2000, `expected targetTtftMs 2000, got ${result.targetTtftMs}`);
      assert(result.overTargetTtft, "agent chat TTFT 超过 2s 时应标记 overTargetTtft");
      assert(!result.overMaxTotal, "总耗时未超过 30s 时不应标记 overMaxTotal");
    });
  });

  await describe("acquireConcurrencySlot", async () => {
    await it("应在释放前拒绝超限并发，释放后允许继续进入", () => {
      const key = `agent-chat-spec-${Date.now()}`;
      const first = acquireConcurrencySlot({
        key,
        identifier: "teacher-1",
        limit: 1,
      });
      const second = acquireConcurrencySlot({
        key,
        identifier: "teacher-1",
        limit: 1,
      });

      assert(first.allowed, "第一个并发位应成功获取");
      assert(!second.allowed, "第二个并发位应被拒绝");
      assert(second.active === 1, `expected active 1 while blocked, got ${second.active}`);

      first.release();

      const third = acquireConcurrencySlot({
        key,
        identifier: "teacher-1",
        limit: 1,
      });
      assert(third.allowed, "释放后应允许再次获取并发位");
      third.release();
    });
  });

  console.log("\n==================================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
