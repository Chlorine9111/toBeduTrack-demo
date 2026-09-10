import { buildAgentTaskState, mergeAgentTaskStateWithContext } from "../../lib/agent/task-state";
import { parseIntentFromText } from "../../lib/chat/intent";
import { resolveAgentTriageDecision } from "../../lib/agent/triage/engine";
import type { AgentTaskContext } from "../../lib/agent/task-context";

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

function buildDecision(prompt: string, taskContext?: AgentTaskContext) {
  const promptTaskState = buildAgentTaskState({
    visiblePrompt: prompt,
    latestPrompt: prompt,
    lastArtifactType: "",
    hasUploadedMaterials: false,
  });

  return resolveAgentTriageDecision({
    promptTaskState,
    contextualTaskState: taskContext
      ? mergeAgentTaskStateWithContext(promptTaskState, taskContext)
      : promptTaskState,
    taskContext,
    parsedIntent: parseIntentFromText(prompt),
    visiblePrompt: prompt,
  });
}

async function main() {
  console.log("\nagent triage engine");

  await it("general chat 应落到 general_chat 且不暴露工具", () => {
    const decision = buildDecision("帮我解释一下 opportunity cost 和 sunk cost 的区别");

    assert(
      decision.workflow === "general_chat",
      `expected general_chat, got ${decision.workflow}`,
    );
    assert(
      decision.allowedTools.length === 0,
      `expected no allowed tools, got ${decision.allowedTools.join(",")}`,
    );
    assert(
      decision.continuationMode === "new_task",
      `expected new_task, got ${decision.continuationMode}`,
    );
  });

  await it("worksheet + answer key 请求应识别为主文档加附属产物", () => {
    const decision = buildDecision("根据这份资料生成一份 worksheet，并附详细答案解析。");

    assert(
      decision.workflow === "worksheet",
      `expected worksheet, got ${decision.workflow}`,
    );
    assert(
      decision.artifactIntent === "primary_plus_auxiliary",
      `expected primary_plus_auxiliary, got ${decision.artifactIntent}`,
    );
    assert(
      decision.allowedTools.includes("generate_worksheet"),
      `expected generate_worksheet, got ${decision.allowedTools.join(",")}`,
    );
    assert(
      decision.allowedTools.includes("generate_answer_key"),
      `expected generate_answer_key, got ${decision.allowedTools.join(",")}`,
    );
  });

  await it("题库组卷请求应稳定落到 question_bank workflow", () => {
    const decision = buildDecision("从题库里抽 8 道现成题组一套 worksheet");

    assert(
      decision.workflow === "question_bank",
      `expected question_bank, got ${decision.workflow}`,
    );
    assert(
      decision.retrievalSources === "question_bank",
      `expected question_bank retrieval, got ${decision.retrievalSources}`,
    );
  });

  await it("artifact follow-up 请求应标记 artifact_followup continuationMode", () => {
    const taskContext: AgentTaskContext = {
      kind: "exercise",
      action: "create_worksheet",
      mode: "continuation",
      normalizedRequest: "任务类型：习题；任务目标：create_worksheet；教师原话：做一份 worksheet",
      retrievalQuery: "worksheet",
      sourcePriority: ["当前教师输入", "最近对话上下文"],
      curriculum: "",
      topic: "",
      scope: "",
      count: "",
      duration: "",
      attachmentsSummary: "",
      attachmentMode: "none",
      attachmentUploadIds: [],
      savePreference: "default",
    };
    const decision = buildDecision("把刚才那份 worksheet 降一档，增加支架。", taskContext);

    assert(
      decision.workflow === "adapt_difficulty",
      `expected adapt_difficulty, got ${decision.workflow}`,
    );
    assert(
      decision.continuationMode === "artifact_followup",
      `expected artifact_followup, got ${decision.continuationMode}`,
    );
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
