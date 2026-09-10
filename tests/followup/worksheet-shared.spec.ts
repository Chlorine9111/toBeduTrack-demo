import {
  buildExerciseTeacherRequest,
  shouldCarryWorksheetConversation,
} from "../../lib/agent/workflows/worksheet-shared";

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
  await describe("worksheet shared carryover", async () => {
    await it("长的新请求默认不再拼接旧 user message", async () => {
      const requestText = buildExerciseTeacherRequest(
        "请基于 AP Chemistry Unit 1 重新组一套 6 道题的 worksheet，不要沿用上一次的主题。",
        [
          { role: "user", content: "帮我出 3 道 chain rule 题" },
          { role: "assistant", content: "上一轮是微积分题。" },
          { role: "user", content: "再来 2 道 derivative 题" },
        ],
      );

      assert(
        requestText ===
          "请基于 AP Chemistry Unit 1 重新组一套 6 道题的 worksheet，不要沿用上一次的主题。",
        `expected fresh request to exclude prior prompts, got: ${requestText}`,
      );
    });

    await it("短 follow-up 仍然允许带上最近 user message", async () => {
      const requestText = buildExerciseTeacherRequest(
        "保存到题库",
        [
          { role: "user", content: "帮我出 3 道 AP Biology Unit 3 题" },
          { role: "assistant", content: "已完成习题生成；本轮先不入库。" },
        ],
      );

      assert(
        requestText.includes("帮我出 3 道 AP Biology Unit 3 题"),
        `expected continuation request to include previous prompt, got: ${requestText}`,
      );
      assert(
        requestText.endsWith("保存到题库"),
        `expected current follow-up to be preserved, got: ${requestText}`,
      );
    });

    await it("短的新组卷请求如果没有 continuation 信号，不应再偷带上一轮出题上下文", async () => {
      const requestText = buildExerciseTeacherRequest(
        "组一套卷子",
        [
          { role: "user", content: "帮我出 3 道 AP Biology Unit 4 细胞通讯选择题" },
          { role: "assistant", content: "已完成习题生成；本轮先不入库。" },
        ],
      );

      assert(
        requestText === "组一套卷子",
        `expected short fresh worksheet request to stay isolated, got: ${requestText}`,
      );
      assert(
        !shouldCarryWorksheetConversation("组一套卷子"),
        "expected short worksheet request without continuation wording to avoid carryover",
      );
    });

    await it("显式 continuation 信号仍应允许 carryover", async () => {
      assert(
        shouldCarryWorksheetConversation("继续按刚才那套题组一份 worksheet"),
        "expected continuation prompt to carry over prior context",
      );
      assert(
        !shouldCarryWorksheetConversation(
          "请基于 AP Biology Unit 1 生成一份全新的 worksheet，不要参考上一轮。",
        ),
        "expected fresh explicit request to avoid carryover",
      );
    });

    await it("带前置补充说明的 prompt 不应把内部说明原样带进习题请求", async () => {
      const requestText = buildExerciseTeacherRequest(
        `帮我生成一道 chain rule 习题

【前置补充说明】
- 任务目标：生成练习题
- 输出数量：1 道
- 主题范围：chain rule`,
        [],
        false,
        {
          curriculum: "",
          topic: "chain rule",
          count: "1",
          duration: "",
          scope: "",
        },
      );

      assert(
        !requestText.includes("【前置补充说明】"),
        `expected internal clarification block to be stripped, got: ${requestText}`,
      );
      assert(
        requestText.includes("chain rule"),
        `expected clean request to keep topic, got: ${requestText}`,
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
