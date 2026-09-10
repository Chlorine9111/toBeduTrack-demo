import {
  buildTaskContextTeacherPrompt,
  stripPreflightClarificationBlock,
} from "../../lib/agent/chat-shared";

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
  await describe("chat shared prompt normalization", async () => {
    await it("should strip preflight clarification blocks from model prompt", async () => {
      const cleaned = stripPreflightClarificationBlock(`帮我生成一个语文教案

【前置补充说明】
- 任务目标：生成教案
- 课时时长：45 分钟
- 主题范围：鲁迅《孔乙己》`);

      assert(cleaned === "帮我生成一个语文教案", `expected raw prompt only, got: ${cleaned}`);
    });

    await it("should rebuild a clean teacher request from task context instead of leaking preflight labels", async () => {
      const prompt = buildTaskContextTeacherPrompt({
        rawPrompt: `帮我生成一个enviorment science ap unit1的教案

【前置补充说明】
- 任务目标：生成教案
- 课时时长：45 分钟
- 课程 / 单元：AP Environmental Science Unit 1
- 主题范围：Earth Systems and Resources`,
        taskContext: {
          curriculum: "AP Environmental Science Unit 1",
          topic: "Earth Systems and Resources",
          scope: "",
          count: "",
          duration: "45",
        },
        includeFields: ["curriculum", "topic", "duration"],
      });

      assert(
        !prompt.includes("【前置补充说明】"),
        `expected cleaned prompt without preflight block, got: ${prompt}`,
      );
      assert(
        prompt.includes("AP Environmental Science Unit 1"),
        `expected curriculum to be preserved, got: ${prompt}`,
      );
      assert(
        prompt.includes("Earth Systems and Resources"),
        `expected topic to be preserved, got: ${prompt}`,
      );
      assert(
        prompt.includes("45 分钟"),
        `expected duration to be preserved, got: ${prompt}`,
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
