import {
  parseExercisesFromAssistantText,
  shouldHandleExerciseSaveFollowUp,
} from "../../lib/agent/workflows/exercise-save-followup";

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

const assistantExerciseArtifact = `
已完成习题生成；本轮先不入库。
“chain rule” 我可以先生成给你看；如果你要真实写入题库，再补一句课程和 Unit。
题型：MC
语言：中文
请求/通过：2/2

### 第 1 题
求 y = sin(3x^2) 的导数 y'。
A. 6x cos(3x^2)
B. cos(3x^2)
C. 6x cos(6x)
D. 3 cos(3x^2)
答案：A
解析：先把外层函数看成 sin(u)，其中 u = 3x^2。再用链式法则，导数等于 cos(u) 乘以内层导数 6x，因此结果是 6x cos(3x^2)。
常见误区：漏乘内层导数；把 cos(3x^2) 直接当答案

### 第 2 题
解释为什么链式法则适用于复合函数求导。
答案：因为复合函数的变化率来自外层变化率与内层变化率的共同作用。
解析：当 y=f(g(x)) 时，x 先影响 g(x)，再影响 f(g(x))。因此总体变化率必须把两层变化率相乘，这就是链式法则的本质。
`.trim();

async function main() {
  await describe("exercise save follow-up", async () => {
    await it("应能从上一轮习题正文里反解出结构化题目", async () => {
      const parsed = parseExercisesFromAssistantText({
        assistantText: assistantExerciseArtifact,
        sourcePrompt: "帮我出 2 道 chain rule 题",
      });

      assert(parsed.length === 2, `expected 2 exercises, got ${parsed.length}`);
      assert(parsed[0]?.type === "MC", `expected first exercise MC, got ${parsed[0]?.type}`);
      assert(parsed[0]?.options?.length === 4, `expected 4 options, got ${parsed[0]?.options?.length}`);
      assert(parsed[0]?.correctAnswer === "A", `expected answer A, got ${parsed[0]?.correctAnswer}`);
      assert(
        parsed[0]?.commonMistakes.includes("漏乘内层导数"),
        `expected common mistake parsed, got ${parsed[0]?.commonMistakes.join(" / ")}`,
      );
      assert(parsed[1]?.type === "FR", `expected second exercise FR, got ${parsed[1]?.type}`);
      assert(
        parsed[1]?.solutionSteps.includes("两层变化率相乘"),
        `expected FR solution parsed, got ${parsed[1]?.solutionSteps}`,
      );
    });

    await it("应把纯保存 follow-up 路由到直连保存链", async () => {
      const shouldHandle = shouldHandleExerciseSaveFollowUp({
        latestUserPrompt: "保存到题库",
        displayUserPrompt: "保存到题库",
        previousMessages: [
          { role: "user", content: "帮我出 2 道 chain rule 题" },
          { role: "assistant", content: assistantExerciseArtifact },
        ],
        taskAction: "save_exercises",
      });

      assert(shouldHandle, "expected save follow-up to be handled directly");
    });

    await it("首轮生成并保存请求仍应走生成链，而不是误判成 follow-up 保存", async () => {
      const shouldHandle = shouldHandleExerciseSaveFollowUp({
        latestUserPrompt: "请生成 3 道 AP Biology Unit 3 题并保存到题库",
        displayUserPrompt: "请生成 3 道 AP Biology Unit 3 题并保存到题库",
        previousMessages: [],
        taskAction: null,
      });

      assert(!shouldHandle, "initial generate-and-save request should not be treated as save follow-up");
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
