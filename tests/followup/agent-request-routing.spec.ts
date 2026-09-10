import {
  resolveEffectiveAgentTaskState,
} from "../../lib/agent/request-routing";
import {
  buildAgentTaskState,
  mergeAgentTaskStateWithContext,
} from "../../lib/agent/task-state";
import { parseIntentFromText } from "../../lib/chat/intent";
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

function buildPromptTaskState(prompt: string) {
  return buildAgentTaskState({
    visiblePrompt: prompt,
    latestPrompt: prompt,
    lastArtifactType: "",
    hasUploadedMaterials: false,
  });
}

function resolveWithContext(prompt: string, taskContext?: AgentTaskContext) {
  const promptTaskState = buildPromptTaskState(prompt);
  return resolveEffectiveAgentTaskState({
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
  console.log("\nagent request routing");

  await it("显式 rubric 请求必须压过旧 worksheet taskContext", () => {
    const worksheetTaskContext: AgentTaskContext = {
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

    const resolved = resolveWithContext("根据刚才的内容给我一个 rubric", worksheetTaskContext);

    assert(resolved.taskState.kind === "rubric", `expected rubric, got ${resolved.taskState.kind}`);
    assert(
      resolved.forcedToolChoice === "generate_rubric",
      `expected generate_rubric, got ${resolved.forcedToolChoice}`,
    );
    assert(
      resolved.taskContext === undefined,
      "expected stale worksheet taskContext to be dropped",
    );
  });

  await it("显式 worksheet 请求必须压过旧 rubric taskContext", () => {
    const rubricTaskContext: AgentTaskContext = {
      kind: "rubric",
      action: "generate_rubric",
      mode: "continuation",
      normalizedRequest: "任务类型：Rubric；任务目标：generate_rubric；教师原话：生成 rubric",
      retrievalQuery: "rubric",
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

    const resolved = resolveWithContext("根据这份资料做一个 guided notes worksheet", rubricTaskContext);

    assert(resolved.taskState.kind === "exercise", `expected exercise, got ${resolved.taskState.kind}`);
    assert(
      resolved.forcedToolChoice === "generate_worksheet",
      `expected generate_worksheet, got ${resolved.forcedToolChoice}`,
    );
    assert(
      resolved.taskContext === undefined,
      "expected stale rubric taskContext to be dropped",
    );
  });

  await it("模糊 continuation 请求可以继续沿用上一轮文档任务", () => {
    const worksheetTaskContext: AgentTaskContext = {
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

    const resolved = resolveWithContext("继续细化上一版", worksheetTaskContext);

    assert(resolved.taskContext?.action === "create_worksheet", "expected continuation taskContext to be kept");
    assert(
      resolved.taskState.allowedTools.includes("generate_worksheet"),
      `expected generate_worksheet in allowed tools, got ${resolved.taskState.allowedTools.join(",")}`,
    );
  });

  await it("题库组卷请求应强制落到 assemble_worksheet", () => {
    const resolved = resolveWithContext("从题库里抽 8 道现成题组一套 worksheet");

    assert(
      resolved.forcedToolChoice === "assemble_worksheet",
      `expected assemble_worksheet, got ${resolved.forcedToolChoice}`,
    );
  });

  await it("显式 worksheet 即使带课堂表述也不能误落到 lesson plan", () => {
    const resolved = resolveWithContext(
      "请根据刚才这份资料生成一份给学生上课直接使用的 worksheet。要求：guided notes + 一个课堂活动单。",
    );

    assert(resolved.taskState.kind === "exercise", `expected exercise, got ${resolved.taskState.kind}`);
    assert(
      resolved.forcedToolChoice === "generate_worksheet",
      `expected generate_worksheet, got ${resolved.forcedToolChoice}`,
    );
  });

  await it("work sheet 变体写法也应稳定命中 generate_worksheet", () => {
    const resolved = resolveWithContext(
      "请根据这份资料做一个 work sheet，适合课堂直接发给学生使用。",
    );

    assert(resolved.taskState.kind === "exercise", `expected exercise, got ${resolved.taskState.kind}`);
    assert(
      resolved.forcedToolChoice === "generate_worksheet",
      `expected generate_worksheet, got ${resolved.forcedToolChoice}`,
    );
  });

  await it("exit ticket 请求应优先命中 generate_exit_ticket", () => {
    const resolved = resolveWithContext(
      "根据今天 Newton's Third Law 的内容帮我出一个 exit ticket，控制在 4 道题。",
    );

    assert(
      resolved.forcedToolChoice === "generate_exit_ticket",
      `expected generate_exit_ticket, got ${resolved.forcedToolChoice}`,
    );
    assert(
      resolved.preferredTools.join(",") === "generate_exit_ticket",
      `expected preferredTools=generate_exit_ticket, got ${resolved.preferredTools.join(",")}`,
    );
  });

  await it("worksheet 并附答案解析请求应组合 worksheet + answer key", () => {
    const resolved = resolveWithContext(
      "根据这份 PDF 生成一份 worksheet，并附详细答案解析。",
    );

    assert(
      resolved.preferredTools[0] === "generate_worksheet",
      `expected first preferred tool generate_worksheet, got ${resolved.preferredTools.join(",")}`,
    );
    assert(
      resolved.preferredTools.includes("generate_answer_key"),
      `expected generate_answer_key in preferred tools, got ${resolved.preferredTools.join(",")}`,
    );
  });

  await it("worksheet 中提到 quick check 时不能误落到 exit ticket", () => {
    const resolved = resolveWithContext(
      "请基于这份资料生成一份简短 worksheet，包含 4 道 quick check，并附详细答案解析。",
    );

    assert(
      resolved.preferredTools[0] === "generate_worksheet",
      `expected first preferred tool generate_worksheet, got ${resolved.preferredTools.join(",")}`,
    );
    assert(
      !resolved.preferredTools.includes("generate_exit_ticket"),
      `expected no generate_exit_ticket, got ${resolved.preferredTools.join(",")}`,
    );
    assert(
      resolved.preferredTools.includes("generate_answer_key"),
      `expected generate_answer_key in preferred tools, got ${resolved.preferredTools.join(",")}`,
    );
  });

  await it("答案解析单独请求应命中 generate_answer_key", () => {
    const resolved = resolveWithContext(
      "给刚才那份题目生成答案和解析。",
    );

    assert(
      resolved.forcedToolChoice === "generate_answer_key",
      `expected generate_answer_key, got ${resolved.forcedToolChoice}`,
    );
  });

  await it("基于上一份 worksheet 降一档请求应命中 adapt_difficulty", () => {
    const worksheetTaskContext: AgentTaskContext = {
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

    const resolved = resolveWithContext(
      "把刚才那份 worksheet 降一档，再加一点支架。",
      worksheetTaskContext,
    );

    assert(
      resolved.forcedToolChoice === "adapt_difficulty",
      `expected adapt_difficulty, got ${resolved.forcedToolChoice}`,
    );
    assert(
      resolved.preferredTools.join(",") === "adapt_difficulty",
      `expected preferredTools=adapt_difficulty, got ${resolved.preferredTools.join(",")}`,
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
