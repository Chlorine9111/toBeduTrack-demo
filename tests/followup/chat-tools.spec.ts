import { createAgentChatTools } from "../../lib/agent/chat-tools";
import { buildAdaptDifficultyTool } from "../../lib/agent/tools/adapt-difficulty";
import { buildGenerateAnswerKeyTool } from "../../lib/agent/tools/generate-answer-key";
import { buildAgentTaskState } from "../../lib/agent/task-state";

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

function safeParseInput(
  schema: unknown,
  value: unknown,
): { success: boolean } {
  if (
    schema &&
    typeof schema === "object" &&
    "safeParse" in schema &&
    typeof (schema as { safeParse?: unknown }).safeParse === "function"
  ) {
    return (schema as { safeParse: (input: unknown) => { success: boolean } }).safeParse(
      value,
    );
  }
  throw new Error("tool inputSchema does not expose safeParse at runtime");
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
  console.log("\nchat tools");

  await it("general 对话默认不应分配任何 tools", () => {
    const taskState = buildAgentTaskState({
      visiblePrompt: "帮我解释一下 opportunity cost 和 sunk cost 的区别，并举两个生活例子",
      latestPrompt: "帮我解释一下 opportunity cost 和 sunk cost 的区别，并举两个生活例子",
      hasUploadedMaterials: false,
    });

    assert(taskState.kind === "general", `expected general task kind, got ${taskState.kind}`);
    assert(
      taskState.allowedTools.length === 0,
      `expected no allowed tools for general chat, got ${taskState.allowedTools.join(",")}`,
    );
  });

  await it("createAgentChatTools 在裁剪到本地主链工具时应稳定构建", () => {
    const generalTaskState = buildAgentTaskState({
      visiblePrompt: "解释 sunk cost",
      latestPrompt: "解释 sunk cost",
      hasUploadedMaterials: false,
    });
    const tools = createAgentChatTools({
      supabase: {} as never,
      teacherId: "teacher-1",
      latestUserPrompt: "解释 sunk cost",
      latestAssistantPrompt: "",
      taskState: {
        ...generalTaskState,
        allowedTools: [],
        summary: "任务类型：通用对话",
      },
      uploaded: {
        materials: [],
        warnings: [],
      },
      allowedTools: [
        "adapt_difficulty",
        "generate_answer_key",
        "generate_ap_exercises_pipeline",
        "generate_exit_ticket",
        "generate_lesson_plan_workflow",
        "generate_pbl_project",
        "generate_rubric",
        "generate_worksheet",
        "assemble_worksheet",
        "search_question_bank",
        "read_webpage",
      ],
    });

    const toolNames = Object.keys(tools);
    assert(
      toolNames.includes("adapt_difficulty"),
      `expected adapt_difficulty, got ${toolNames.join(",")}`,
    );
    assert(
      toolNames.includes("generate_answer_key"),
      `expected generate_answer_key, got ${toolNames.join(",")}`,
    );
    assert(
      toolNames.includes("generate_ap_exercises_pipeline"),
      `expected generate_ap_exercises_pipeline, got ${toolNames.join(",")}`,
    );
    assert(
      toolNames.includes("generate_exit_ticket"),
      `expected generate_exit_ticket, got ${toolNames.join(",")}`,
    );
    assert(
      toolNames.includes("generate_rubric"),
      `expected generate_rubric, got ${toolNames.join(",")}`,
    );
    assert(
      toolNames.includes("assemble_worksheet"),
      `expected assemble_worksheet, got ${toolNames.join(",")}`,
    );
    assert(
      toolNames.includes("generate_lesson_plan_workflow"),
      `expected generate_lesson_plan_workflow, got ${toolNames.join(",")}`,
    );
    assert(
      toolNames.includes("generate_pbl_project"),
      `expected generate_pbl_project, got ${toolNames.join(",")}`,
    );
    assert(
      toolNames.includes("search_question_bank"),
      `expected search_question_bank, got ${toolNames.join(",")}`,
    );
    assert(
      !toolNames.includes("search_teacher_knowledge"),
      `did not expect retired search_teacher_knowledge, got ${toolNames.join(",")}`,
    );
  });

  await it("配置了 allowedTools 时不应偷偷创建未请求的 provider-defined tools", () => {
    const taskState = buildAgentTaskState({
      visiblePrompt: "根据资料生成 rubric",
      latestPrompt: "根据资料生成 rubric",
      hasUploadedMaterials: true,
    });
    const tools = createAgentChatTools({
      supabase: {} as never,
      teacherId: "teacher-1",
      latestUserPrompt: "根据资料生成 rubric",
      latestAssistantPrompt: "",
      taskState,
      uploaded: {
        materials: [],
        warnings: [],
      },
      allowedTools: ["generate_rubric", "read_webpage"],
    });

    const toolNames = Object.keys(tools);
    assert(
      !toolNames.includes("web_search"),
      `did not expect web_search when not requested, got ${toolNames.join(",")}`,
    );
    assert(
      toolNames.includes("read_webpage"),
      `expected read_webpage to remain available, got ${toolNames.join(",")}`,
    );
  });

  await it("allowedTools 应严格过滤出当前请求允许的工具", () => {
    const taskState = buildAgentTaskState({
      visiblePrompt: "根据资料生成 rubric",
      latestPrompt: "根据资料生成 rubric",
      hasUploadedMaterials: true,
    });
    const tools = createAgentChatTools({
      supabase: {} as never,
      teacherId: "teacher-1",
      latestUserPrompt: "根据资料生成 rubric",
      latestAssistantPrompt: "",
      taskState,
      uploaded: {
        materials: [],
        warnings: [],
      },
      allowedTools: ["generate_rubric"],
    });

    const toolNames = Object.keys(tools);
    assert(toolNames.length === 1, `expected 1 tool, got ${toolNames.join(",")}`);
    assert(
      toolNames[0] === "generate_rubric",
      `expected generate_rubric only, got ${toolNames.join(",")}`,
    );
  });

  await it("generate_answer_key 应接受多工具链里较长的 teacherRequest", () => {
    const tool = buildGenerateAnswerKeyTool({
      supabase: {} as never,
      teacherId: "teacher-1",
      latestUserPrompt: "",
      latestAssistantPrompt: "",
      taskState: {} as never,
      uploaded: { materials: [], warnings: [] },
    });

    const parsed = safeParseInput(tool.inputSchema, {
      teacherRequest: "根据刚才那份 worksheet 生成答案解析。".repeat(350),
      sourceTitle: "Chapter 11 Worksheet",
      sourceContent: "Question 1\nAnswer here\n".repeat(500),
    });

    assert(parsed.success, "expected generate_answer_key inputSchema to accept long multi-step request");
  });

  await it("adapt_difficulty 应接受带完整上下文的续写请求", () => {
    const tool = buildAdaptDifficultyTool({
      supabase: {} as never,
      teacherId: "teacher-1",
      latestUserPrompt: "",
      latestAssistantPrompt: "",
      taskState: {} as never,
      uploaded: { materials: [], warnings: [] },
    });

    const parsed = safeParseInput(tool.inputSchema, {
      teacherRequest:
        "把刚才那份 worksheet 降一档，增加支架，并保留相同学习目标。".repeat(180),
    });

    assert(parsed.success, "expected adapt_difficulty inputSchema to accept contextual follow-up prompt");
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
