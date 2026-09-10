import {
  isAgentTriageClassifierEnabled,
  resolveAgentTriageClassifierFallback,
} from "../../lib/agent/triage/classifier";

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
  await describe("agent triage classifier fallback", async () => {
    await it("feature toggle: 默认开启，显式 false 可关闭", async () => {
      const original = process.env.AGENT_TRIAGE_CLASSIFIER_ENABLED;
      try {
        delete process.env.AGENT_TRIAGE_CLASSIFIER_ENABLED;
        assert(isAgentTriageClassifierEnabled(), "默认应开启");
        process.env.AGENT_TRIAGE_CLASSIFIER_ENABLED = "false";
        assert(!isAgentTriageClassifierEnabled(), "false 应关闭");
      } finally {
        if (original === undefined) {
          delete process.env.AGENT_TRIAGE_CLASSIFIER_ENABLED;
        } else {
          process.env.AGENT_TRIAGE_CLASSIFIER_ENABLED = original;
        }
      }
    });

    await it("高置信可落地输出应转为 taskContext", async () => {
      const result = await resolveAgentTriageClassifierFallback({
        message: "给我做一份 AP Biology Unit 4 worksheet，并附答案",
        conversationContext: [],
        hasAttachments: false,
        classify: async () => ({
          decision: "apply",
          confidence: "high",
          action: "create_worksheet",
          curriculum: "AP Biology Unit 4",
          topic: "Cell Communication",
          count: "8",
          duration: "",
          scope: "",
          reason: "worksheet intent clear",
        }),
      });

      assert(result.applied, "应应用 classifier fallback");
      assert(result.action === "create_worksheet", "应保留 action");
      assert(
        result.taskContext?.kind === "exercise",
        "create_worksheet 应映射到 exercise kind",
      );
      assert(
        result.taskContext?.action === "create_worksheet",
        "taskContext.action 应为 create_worksheet",
      );
      assert(
        result.taskContext?.curriculum === "AP Biology Unit 4",
        "应带出 curriculum",
      );
    });

    await it("decision=skip 时不应应用 fallback", async () => {
      const result = await resolveAgentTriageClassifierFallback({
        message: "帮我看看这个",
        conversationContext: [],
        hasAttachments: false,
        classify: async () => ({
          decision: "skip",
          confidence: "low",
          curriculum: "",
          topic: "",
          count: "",
          duration: "",
          scope: "",
          reason: "ambiguous",
        }),
      });

      assert(!result.applied, "skip 时不应应用");
      assert(result.reasonCode === "classifier:skip", "reasonCode 应为 classifier:skip");
    });

    await it("低置信即使 apply 也不应应用 fallback", async () => {
      const result = await resolveAgentTriageClassifierFallback({
        message: "继续",
        conversationContext: ["assistant: 上一轮是 general chat"],
        hasAttachments: false,
        classify: async () => ({
          decision: "apply",
          confidence: "low",
          action: "generate_exercises",
          curriculum: "",
          topic: "",
          count: "",
          duration: "",
          scope: "",
          reason: "not sure",
        }),
      });

      assert(!result.applied, "低置信不应应用");
      assert(
        result.reasonCode === "classifier:low_confidence",
        "reasonCode 应标记 low confidence",
      );
    });
  });

  if (failed > 0) {
    console.error(`\n${failed} assertions failed, ${passed} passed.`);
    process.exit(1);
  }
  console.log(`\nAll ${passed} assertions passed.`);
}

void main();
