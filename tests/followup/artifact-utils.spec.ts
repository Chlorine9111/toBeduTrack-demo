import {
  deriveArtifactsFromMessages,
} from "../../components/main/agent/artifact-utils";
import { areArtifactsLikelySame } from "../../lib/agent/artifact-match";
import { buildArtifactRenderSnapshot } from "../../lib/agent/artifact-render-snapshot";
import {
  embedArtifactPayload,
  embedArtifactPayloads,
} from "../../lib/agent/artifact-payload";
import { buildRubricDocumentFromMock } from "../../lib/doc-engine/adapters";

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
  await describe("artifact utils", async () => {
    await it("should detect worksheet assistant text as worksheet artifact", async () => {
      const artifacts = deriveArtifactsFromMessages([
        {
          id: "assistant-1",
          role: "assistant",
          content: [
            "## 已从题库组好一套试卷",
            "",
            "- 标题：AP Chemistry Unit 2 Worksheet",
            "- 题目数：2",
            "",
            "### 分组说明",
            "1. 默认练习区（按语义最接近题排序）",
            "",
            "### 题目预览",
            "1. What is the derivative of x^2 ?",
            "2. Explain the chain rule in one sentence.",
            "",
            "PDF 下载：[点击下载](/api/pdf/download/mock-record)",
          ].join("\n"),
        },
      ]);

      assert(artifacts.length === 1, `expected 1 artifact, got ${artifacts.length}`);
      assert(artifacts[0]?.kind === "worksheet", `expected worksheet kind, got ${artifacts[0]?.kind}`);
      assert(
        artifacts[0]?.title.includes("试卷") || artifacts[0]?.title.includes("Worksheet"),
        `expected worksheet title, got ${artifacts[0]?.title}`,
      );
    });

    await it("should not turn freeform lesson text into artifact without explicit payload", async () => {
      const artifacts = deriveArtifactsFromMessages([
        {
          id: "assistant-lesson-1",
          role: "assistant",
          content: [
            "# 🎬 AP Physics 1 · 牛顿第二定律 · 35 min 微课",
            "",
            "**课堂结构**：Challenge Flow + Misconception Clinic + Exit Check",
            "",
            "## 📐 全课时间轴一览",
            "",
            "| 阶段 | 模块 | 时长 |",
            "| --- | --- | --- |",
            "| ① | Cold Challenge | 5 min |",
            "| ② | Data Reveal | 7 min |",
            "| ③ | Misconception Clinic | 10 min |",
            "| ④ | Model Building | 8 min |",
            "| ⑤ | Exit Check | 5 min |",
            "",
            "## 🗂️ 教师备课清单",
            "",
            "- 小白板",
            "- 预制数据表",
            "",
            "## 💡 设计逻辑说明",
            "",
            "让学生的错误和预测驱动知识浮现，而不是按固定模板讲解。",
          ].join("\n"),
        },
      ]);

      assert(
        artifacts.length === 0,
        `expected freeform lesson text to stay in chat, got ${artifacts.length} artifacts`,
      );
    });

    await it("should strip internal thinking tags from artifact summary and raw content", async () => {
      const artifacts = deriveArtifactsFromMessages([
        {
          id: "assistant-thinking-1",
          role: "assistant",
          content: embedArtifactPayload("已生成一份微课教案", {
            kind: "lesson-plan",
            title: "<thinking>内部标题</thinking> AP Physics 1 · 牛顿第二定律微课",
            summary: "<thinking>内部摘要</thinking> 先预测同样的力作用在不同质量物体上的表现。",
            rawContent: [
              "<thinking>",
              "先快速想一下结构。",
              "</thinking>",
              "",
              "# AP Physics 1 · 牛顿第二定律微课",
              "",
              "## Challenge Flow",
              "",
              "让学生先预测同样的力作用在不同质量物体上的表现。",
              "",
              "## Exit Check",
              "",
              "用 2 分钟完成一题判断题和一题简答题。",
            ].join("\n"),
          }),
        },
      ]);

      assert(artifacts.length === 1, `expected 1 artifact, got ${artifacts.length}`);
      assert(
        !artifacts[0]?.summary.includes("<thinking>"),
        `expected summary to strip thinking tags, got ${artifacts[0]?.summary}`,
      );
      assert(
        !artifacts[0]?.rawContent.includes("<thinking>"),
        `expected raw content to strip thinking tags, got ${artifacts[0]?.rawContent}`,
      );
    });

    await it("should normalize escaped artifact payload content before hydrating Canvas", async () => {
      const artifacts = deriveArtifactsFromMessages([
        {
          id: "assistant-escaped-artifact-1",
          role: "assistant",
          content: embedArtifactPayload("已生成一份练习卷", {
            kind: "worksheet",
            title: "Unit 3 Worksheet",
            summary: "一份带公式的练习卷",
            rawContent:
              "\"## Unit 3 Worksheet\\\\n\\\\n1. 计算下式：\\\\\\\\(x+1\\\\\\\\)^2\\\\n\\\\n\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\"",
          }),
        },
      ]);

      assert(artifacts.length === 1, `expected 1 artifact, got ${artifacts.length}`);
      assert(
        artifacts[0]?.rawContent.includes("## Unit 3 Worksheet") ?? false,
        `expected heading to be restored, got ${artifacts[0]?.rawContent}`,
      );
      assert(
        artifacts[0]?.rawContent.includes("\\(x+1\\)^2") ?? false,
        `expected math delimiters to be repaired, got ${artifacts[0]?.rawContent}`,
      );
      assert(
        !(artifacts[0]?.rawContent.startsWith(`"`) ?? false),
        `expected quoted payload to be unwrapped, got ${artifacts[0]?.rawContent}`,
      );
    });

    await it("should dedupe repeated artifact markers with the same artifactKey inside one message", async () => {
      const content = embedArtifactPayloads("已生成 Worksheet", [
        {
          kind: "worksheet",
          artifactKey: "worksheet-key-1",
          title: "Worksheet A",
          summary: "第一份",
          rawContent: "# Worksheet A",
        },
        {
          kind: "worksheet",
          artifactKey: "worksheet-key-1",
          title: "Worksheet A duplicated",
          summary: "重复 marker",
          rawContent: "# Worksheet A duplicated",
        },
      ]);

      const artifacts = deriveArtifactsFromMessages([
        {
          id: "assistant-duplicate-1",
          role: "assistant",
          content,
        },
      ]);

      assert(artifacts.length === 1, `expected 1 deduped artifact, got ${artifacts.length}`);
      assert(
        artifacts[0]?.artifactKey === "worksheet-key-1",
        `expected worksheet-key-1, got ${artifacts[0]?.artifactKey}`,
      );
    });

    await it("should keep ordinary structured explanations out of Canvas", async () => {
      const artifacts = deriveArtifactsFromMessages([
        {
          id: "assistant-general-1",
          role: "assistant",
          content: [
            "## Opportunity Cost",
            "",
            "机会成本是你做出选择时放弃的下一个最佳选项的价值。",
            "",
            "## Sunk Cost",
            "",
            "沉没成本是已经发生且无法收回的成本，不应该继续影响后续决策。",
            "",
            "## 两个生活例子",
            "",
            "例子一：你已经买了电影票，但临时生病；要不要去电影院，应该看接下来是否值得，而不是票钱是否已经花掉。",
            "",
            "例子二：你在复习时已经花了两小时整理错误笔记，但如果继续死磕只会拖慢效率，就应该及时换方法。",
          ].join("\n"),
        },
      ]);

      assert(
        artifacts.length === 0,
        `expected ordinary explanation to stay in chat, got ${artifacts.length} artifacts`,
      );
    });

    await it("should skip clarification or non-model assistant messages", async () => {
      const clarificationArtifacts = deriveArtifactsFromMessages([
        {
          id: "assistant-clarify-1",
          role: "assistant",
          content: "请补充以下信息：学科、年级、题量。",
          clarificationQuestion: { id: "q1" },
        },
      ]);
      const hiddenArtifacts = deriveArtifactsFromMessages([
        {
          id: "assistant-hidden-1",
          role: "assistant",
          content: "请补充以下信息：学科、年级、题量。",
          includeInModel: false,
        },
      ]);

      assert(
        clarificationArtifacts.length === 0,
        `expected clarification assistant message to stay out of Canvas, got ${clarificationArtifacts.length} artifacts`,
      );
      assert(
        hiddenArtifacts.length === 0,
        `expected includeInModel=false assistant message to stay out of Canvas, got ${hiddenArtifacts.length} artifacts`,
      );
    });

    await it("should prefer embedded snapshot html over raw markdown fallback when hydrating persisted artifacts", async () => {
      const rubricDocument = buildRubricDocumentFromMock({
        id: "rubric-1",
        title: "自由结构 Rubric",
        dimensions: [
          {
            id: "dim-1",
            name: "论证质量",
            description: "看学生是否能给出完整推理",
            weight: 50,
            levels: {
              excellent: "论证完整且证据充分",
              good: "论证基本完整",
              passing: "论证有明显断层",
              failing: "只有结论没有推理",
            },
          },
          {
            id: "dim-2",
            name: "表达清晰度",
            description: "看语言是否清楚",
            weight: 50,
            levels: {
              excellent: "表达清晰，结构自然",
              good: "表达较清晰",
              passing: "表达较乱但可读",
              failing: "表达混乱，难以理解",
            },
          },
        ],
        columnLabels: {
          dimension: "维度",
          weight: "权重",
          excellent: "4",
          good: "3",
          passing: "2",
          failing: "1",
        },
      });
      const snapshot = buildArtifactRenderSnapshot({
        kind: "rubric",
        title: "自由结构 Rubric",
        summary: "按真实矩阵渲染",
        rawContent: "# 旧 markdown\n\n| 维度 | 优秀 |\n| --- | --- |\n| 错误旧数据 | 会误导完成态 |\n",
        document: rubricDocument,
        sourceStage: "persisted",
      });
      const artifacts = deriveArtifactsFromMessages([
        {
          id: "assistant-rubric-snapshot-1",
          role: "assistant",
          content: embedArtifactPayload("已生成一份 Rubric", {
            kind: "rubric",
            title: snapshot.title,
            summary: snapshot.summary,
            rawContent: snapshot.rawContent,
            document: snapshot.document,
            htmlContent: snapshot.htmlContent,
            layoutConfig: snapshot.layoutConfig,
            renderVersion: snapshot.renderVersion,
            sourceStage: "persisted",
          }),
        },
      ]);

      assert(artifacts.length === 1, `expected 1 artifact, got ${artifacts.length}`);
      assert(
        artifacts[0]?.htmlContent === snapshot.htmlContent,
        "expected persisted artifact to keep embedded snapshot html",
      );
      assert(
        artifacts[0]?.htmlContent?.includes('data-rubric="true"') ?? false,
        "expected rubric snapshot html to keep matrix layout",
      );
    });

    await it("should match persisted artifact even when streaming preview still uses placeholder title and partial raw text", async () => {
      const matched = areArtifactsLikelySame(
        {
          kind: "exercises",
          title: "AI 生成试题",
          summary: "已生成 3 道选择题。",
          rawContent:
            "已生成 3 道选择题。\n\n### 第 1 题\n题目正文\n\n### 第 2 题\n更多正文",
          sourceStage: "persisted",
        },
        {
          kind: "exercises",
          title: "试题（生成中）",
          summary: "已生成 3 道选择题。",
          rawContent: "###",
          sourceStage: "complete",
        },
      );

      assert(matched, "expected persisted artifact to match placeholder streaming preview");
    });

    await it("should not merge different persisted artifacts only because kind matches", async () => {
      const matched = areArtifactsLikelySame(
        {
          kind: "exercises",
          title: "AI 生成试题",
          summary: "已生成 3 道选择题。",
          rawContent: "### 第 1 题\n导数题",
          sourceStage: "persisted",
        },
        {
          kind: "exercises",
          title: "另一份试题（生成中）",
          summary: "已生成 5 道选择题。",
          rawContent: "### 第 1 题\n数列题",
          sourceStage: "streaming",
        },
      );

      assert(!matched, "expected different artifacts to stay isolated");
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
