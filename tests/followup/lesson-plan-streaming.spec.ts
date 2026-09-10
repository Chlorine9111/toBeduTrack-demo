import {
  buildMarkdownOutlineProjectorMarkdown,
  createInitialMarkdownOutlineProjectorState,
  diffMarkdownOutlineProjectorState,
  extractMarkdownOutlineProjectorState,
  mergeMarkdownOutlineProjectorState,
  stripStreamingOutlinePrelude,
} from "../../lib/agent/markdown-outline-streaming";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`  FAIL: ${message}`);
}

async function it(name: string, fn: () => void | Promise<void>) {
  const before = failed;
  try {
    await fn();
    if (failed === before) {
      console.log(`  PASS: ${name}`);
    }
  } catch (error) {
    failed += 1;
    console.error(`  FAIL: ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  console.log("\nlesson plan streaming");

  await it("初始 projector 不应预置固定章节", () => {
    const state = createInitialMarkdownOutlineProjectorState({
      title: "教案（生成中）",
    });

    assert(state.nodes.length === 0, "expected no hard-coded outline-solid nodes");
  });

  await it("streaming outline-solid 应以模型声明的节点为准，而不是固定七段式", () => {
    const state = extractMarkdownOutlineProjectorState({
      streamText: [
        "<STREAMING_OUTLINE>",
        "TITLE: AP Calculus BC Chain Rule 微课教案",
        "NODE: 开场诊断",
        "NODE: 链式法则概念搭桥",
        "NODE: 板演与对比练习",
        "NODE: Exit Ticket",
        "</STREAMING_OUTLINE>",
        "",
        "# AP Calculus BC Chain Rule 微课教案",
        "",
        "## 开场诊断",
        "- 用一个复合函数热身题判断学生是否能识别外层与内层函数。",
        "",
        "## 链式法则概念搭桥",
        "- 用图像和口头类比解释“先里后外”的组合关系。",
      ].join("\n"),
      previewText: "正在按章节补全教案正文...",
    });

    assert(state.title === "AP Calculus BC Chain Rule 微课教案", "expected parsed lesson-plan title");
    assert(state.nodes.length === 4, "expected model-defined outline-solid node count");
    assert(state.nodes[0]?.title === "开场诊断", "expected first node from model outline-solid");
    assert(state.nodes[1]?.status === "streaming", "expected second node to be streaming");
    assert(state.nodes[3]?.status === "pending", "expected future node to stay pending");
  });

  await it("markdown shell 应保留模型定义的后续节点占位", () => {
    const state = extractMarkdownOutlineProjectorState({
      streamText: [
        "<STREAMING_OUTLINE>",
        "TITLE: AP Biology 酶活性微课",
        "NODE: 现象观察",
        "NODE: 变量控制实验",
        "NODE: 结果解释",
        "</STREAMING_OUTLINE>",
        "",
        "# AP Biology 酶活性微课",
        "",
        "## 现象观察",
        "- 解释温度如何影响酶活性。",
      ].join("\n"),
      previewText: "正在按章节补全教案正文...",
    });

    const shellMarkdown = buildMarkdownOutlineProjectorMarkdown(state);
    assert(shellMarkdown.includes("## 变量控制实验"), "expected shell markdown to include model-defined later heading");
    assert(shellMarkdown.includes("_正在生成这一部分..._"), "expected shell markdown placeholder");
  });

  await it("node patch 合并应只更新目标节点并保留既有内容", () => {
    const initial = createInitialMarkdownOutlineProjectorState({
      title: "教案（生成中）",
      previewText: "正在等待模型给出教案结构骨架...",
    });
    const merged = mergeMarkdownOutlineProjectorState(initial, {
      title: "AP Biology 酶活性教案",
      nodes: [
        {
          id: "node-1",
          title: "实验观察",
          status: "complete",
          content: "- 解释温度如何影响酶活性。",
        },
      ],
    });
    const diff = diffMarkdownOutlineProjectorState(initial, merged);

    assert(merged.nodes[0]?.content.includes("温度如何影响酶活性"), "expected first node to receive patch content");
    assert(diff.changedNodes.length === 1, "expected exactly one changed node");
  });

  await it("最终持久化 markdown 应剥离 streaming outline-solid 前导块", () => {
    const stripped = stripStreamingOutlinePrelude([
      "<STREAMING_OUTLINE>",
      "TITLE: AP Statistics 正态分布微课",
      "NODE: 导入数据问题",
      "NODE: 正态分布建模",
      "</STREAMING_OUTLINE>",
      "",
      "# AP Statistics 正态分布微课",
      "",
      "## 导入数据问题",
      "- 展示一组身高数据。",
    ].join("\n"));

    assert(!stripped.includes("<STREAMING_OUTLINE>"), "expected prelude markers removed");
    assert(stripped.startsWith("# AP Statistics 正态分布微课"), "expected markdown body preserved");
  });

  console.log("\n==================================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

void main();
