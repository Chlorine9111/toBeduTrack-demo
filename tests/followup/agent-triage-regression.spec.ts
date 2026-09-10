import { parseIntentFromText } from "../../lib/chat/intent";
import {
  buildAgentTaskState,
  mergeAgentTaskStateWithContext,
} from "../../lib/agent/task-state";
import { resolveAgentTriageDecision } from "../../lib/agent/triage/engine";
import { resolveAgentTriageClassifierFallback } from "../../lib/agent/triage/classifier";

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

function resolveDecision(params: {
  prompt: string;
  hasUploads?: boolean;
  taskContext?: Parameters<typeof resolveAgentTriageDecision>[0]["taskContext"];
}) {
  const normalizedTaskContext = params.taskContext ?? undefined;
  const promptTaskState = buildAgentTaskState({
    visiblePrompt: params.prompt,
    latestPrompt: params.prompt,
    lastArtifactType: "",
    hasUploadedMaterials: Boolean(params.hasUploads),
  });
  return resolveAgentTriageDecision({
    promptTaskState,
    contextualTaskState: mergeAgentTaskStateWithContext(
      promptTaskState,
      normalizedTaskContext,
    ),
    taskContext: normalizedTaskContext,
    parsedIntent: parseIntentFromText(params.prompt),
    visiblePrompt: params.prompt,
  });
}

async function main() {
  await describe("agent triage regression", async () => {
    await it("worksheet + answer key 应稳定为主文档 + 附属产物", async () => {
      const decision = resolveDecision({
        prompt: "根据 AP Biology Unit 3 生成一份 worksheet，并附答案解析",
      });
      assert(decision.workflow === "worksheet", "workflow 应为 worksheet");
      assert(
        decision.artifactIntent === "primary_plus_auxiliary",
        "artifactIntent 应为 primary_plus_auxiliary",
      );
    });

    await it("题库调题请求应稳定落到 question_bank", async () => {
      const decision = resolveDecision({
        prompt: "从题库里找 AP Chemistry Unit 7 的 FRQ，组一份课堂练习",
      });
      assert(decision.workflow === "question_bank", "workflow 应为 question_bank");
      assert(
        decision.allowedTools.includes("search_question_bank"),
        "allowedTools 应包含 search_question_bank",
      );
    });

    await it("联网+总结复合请求应保持 general_chat 且标记 web 检索倾向", async () => {
      const decision = resolveDecision({
        prompt: "帮我联网查一下今年 AP Physics 官方课程更新并总结",
      });
      assert(decision.workflow === "general_chat", "workflow 应为 general_chat");
      assert(
        decision.retrievalSources === "web" || decision.retrievalSources === "mixed",
        "retrievalSources 应包含 web",
      );
    });

    await it("artifact follow-up 请求应稳定标记 continuationMode", async () => {
      const decision = resolveDecision({
        prompt: "把刚才那份 worksheet 难度降低一档",
      });
      assert(
        decision.continuationMode === "artifact_followup",
        "continuationMode 应为 artifact_followup",
      );
    });

    await it("纯问候应保持 general_chat", async () => {
      const decision = resolveDecision({
        prompt: "hi",
      });
      assert(decision.workflow === "general_chat", "workflow 应为 general_chat");
      assert(decision.allowedTools.length === 0, "general_chat 不应暴露工具");
    });

    await it("classifier fallback 产出的 taskContext 应能驱动 triage 进入目标工作流", async () => {
      const classifier = await resolveAgentTriageClassifierFallback({
        message: "给我做 AP Calculus AB Unit 3 的课堂学习单",
        conversationContext: [],
        hasAttachments: false,
        classify: async () => ({
          decision: "apply",
          confidence: "high",
          action: "create_worksheet",
          curriculum: "AP Calculus AB Unit 3",
          topic: "Chain Rule",
          count: "6",
          duration: "",
          scope: "",
          reason: "worksheet intent",
        }),
      });
      assert(classifier.applied, "classifier fallback 应 applied");
      const decision = resolveDecision({
        prompt: "给我做 AP Calculus AB Unit 3 的课堂学习单",
        taskContext: classifier.taskContext,
      });
      assert(decision.workflow === "worksheet", "workflow 应为 worksheet");
      assert(
        decision.source === "runtime_context",
        "注入 taskContext 后 source 应为 runtime_context",
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
