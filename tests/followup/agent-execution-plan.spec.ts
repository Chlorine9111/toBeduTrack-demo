import {
  buildAgentToolLoopPlan,
  buildFallbackAgentExecutionPlan,
  reconcileExecutionPlanWithRuntime,
} from "../../lib/agent/execution-plan";
import { buildAgentTaskState } from "../../lib/agent/task-state";
import { parseIntentFromText } from "../../lib/chat/intent";

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

function buildPromptTaskState(prompt: string) {
  return buildAgentTaskState({
    visiblePrompt: prompt,
    latestPrompt: prompt,
    lastArtifactType: "",
    hasUploadedMaterials: false,
  });
}

async function main() {
  console.log("\nagent execution plan");

  await it("search + work sheet 应进入先检索再生成文档模式", () => {
    const prompt =
      "我是一个老师 然后目前我在做 指环王相关内容 请你搜寻网络相关内容 给我一个指环王的work sheet";
    const taskState = buildPromptTaskState(prompt);
    const plan = buildFallbackAgentExecutionPlan({
      visiblePrompt: prompt,
      promptTaskState: taskState,
      parsedIntent: parseIntentFromText(prompt),
      taskContext: undefined,
      forcedToolChoice: "generate_worksheet",
      preferredTools: ["generate_worksheet"],
      hasSelectedReferenceMaterials: false,
      hasInlineUploads: false,
    });

    assert(plan.taskType === "worksheet", `expected worksheet, got ${plan.taskType}`);
    assert(
      plan.mode === "retrieval_then_document",
      `expected retrieval_then_document, got ${plan.mode}`,
    );
    assert(
      plan.preferredTools.join(",") === "web_search,read_webpage,generate_worksheet",
      `expected web_search,read_webpage,generate_worksheet got ${plan.preferredTools.join(",")}`,
    );
    assert(
      plan.artifactPolicy.maxPrimaryArtifacts === 1 &&
        plan.artifactPolicy.allowAuxiliaryArtifacts === false,
      "single worksheet plan should only allow one primary artifact",
    );
  });

  await it("worksheet + answer key 请求应只允许一个主文档并显式放行 answer key 作为附属产物", () => {
    const prompt = "给我一个指环王 worksheet，并附答案解析";
    const taskState = buildPromptTaskState(prompt);
    const plan = buildFallbackAgentExecutionPlan({
      visiblePrompt: prompt,
      promptTaskState: taskState,
      parsedIntent: parseIntentFromText(prompt),
      taskContext: undefined,
      forcedToolChoice: "generate_worksheet",
      preferredTools: ["generate_worksheet", "generate_answer_key"],
      hasSelectedReferenceMaterials: false,
      hasInlineUploads: false,
    });

    assert(
      plan.preferredTools.join(",") === "generate_worksheet,generate_answer_key",
      `expected generate_worksheet,generate_answer_key got ${plan.preferredTools.join(",")}`,
    );
    assert(
      plan.artifactPolicy.maxPrimaryArtifacts === 1 &&
        plan.artifactPolicy.allowAuxiliaryArtifacts &&
        plan.artifactPolicy.explicitMultiArtifact,
      "worksheet + answer key should remain single-primary with explicit auxiliary artifact",
    );
  });

  await it("先检索再生成文档时应强制搜索后进入文档工具，避免只停在左侧文本回答", () => {
    const loopPlan = buildAgentToolLoopPlan({
      requestMode: "retrieval_then_document",
      preferredTools: ["web_search", "read_webpage", "generate_worksheet"],
    });

    assert(
      loopPlan.forcedToolSequence?.join(",") === "web_search,read_webpage,generate_worksheet",
      `expected web_search,read_webpage,generate_worksheet got ${loopPlan.forcedToolSequence?.join(",") ?? "null"}`,
    );
    assert(
      loopPlan.stepLimit === 4,
      `expected step limit 4, got ${loopPlan.stepLimit}`,
    );
  });

  await it("文档型多工具链应保留原顺序，统一走 artifact / canvas 交接", () => {
    const loopPlan = buildAgentToolLoopPlan({
      requestMode: "document_artifact",
      preferredTools: ["search_question_bank", "assemble_worksheet", "generate_answer_key"],
    });

    assert(
      loopPlan.forcedToolSequence == null,
      `expected null forced sequence, got ${loopPlan.forcedToolSequence?.join(",") ?? "null"}`,
    );
    assert(
      loopPlan.stepLimit === 4,
      `expected step limit 4, got ${loopPlan.stepLimit}`,
    );
  });

  await it("runtime 明确文档任务时应覆盖低置信 chat_answer 计划", () => {
    const prompt = "给我一个 AP Calculus BC rubric";
    const runtimeTaskState = buildPromptTaskState(prompt);
    const promptPlan = {
      taskType: "chat_answer" as const,
      mode: "chat_answer" as const,
      confidence: "low" as const,
      forcedToolChoice: null,
      preferredTools: [],
      artifactPolicy: {
        maxPrimaryArtifacts: 1,
        allowAuxiliaryArtifacts: false,
        explicitMultiArtifact: false,
      },
      requiresSearch: false,
      requiresRecentArtifact: false,
      useQuestionBank: false,
      useSelectedReferenceQaFastPath: false,
      uiLabel: "正在整理资料并直接回答",
    };

    const merged = reconcileExecutionPlanWithRuntime({
      promptPlan,
      runtimeTaskState,
      runtimeForcedToolChoice: "generate_rubric",
      runtimePreferredTools: ["generate_rubric"],
      visiblePrompt: prompt,
      hasSelectedReferenceMaterials: false,
      hasInlineUploads: false,
    });

    assert(merged.taskType === "rubric", `expected rubric, got ${merged.taskType}`);
    assert(merged.mode === "document_artifact", `expected document_artifact, got ${merged.mode}`);
    assert(
      merged.forcedToolChoice === "generate_rubric",
      `expected generate_rubric, got ${merged.forcedToolChoice}`,
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
