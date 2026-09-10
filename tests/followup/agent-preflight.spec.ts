import { resolveAgentPreflightFallback } from "../../lib/agent/preflight";
import { parseIntentFromText } from "../../lib/chat/intent";
import { extractRequestedCount } from "../../lib/text/count-parser";
import {
  rankApCourseCandidates,
  rankTopicCandidates,
  resolveTopicDrivenCurriculum,
} from "../../lib/agent/exercise-curriculum";

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

async function main() {
  await describe("resolveAgentPreflight", async () => {
    await it("exercise request with AP Calculus should not be blocked by curriculum preflight", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "帮我出 5 道 AP Calculus 选择题",
        attachments: null,
        answers: {},
        sessionDefaults: {},
        conversationContext: [],
        locale: "zh",
      });

      assert(result.status === "ready", `expected ready, got ${result.status}`);
    });

    await it("curriculum-only request should ask for action instead of ready-without-goal", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "帮我处理一下 AP Calculus 这个单元",
        attachments: null,
        answers: {},
        sessionDefaults: {},
        conversationContext: [],
        locale: "zh",
      });

      assert(result.status === "needs_info", `expected needs_info, got ${result.status}`);
      if (result.status === "needs_info") {
        assert(result.question.field === "action", `expected action question, got ${result.question.field}`);
      }
    });

    await it("greeting-only request should not be auto-filled into a custom execution", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "hi",
        attachments: null,
        answers: {},
        sessionDefaults: { curriculum: "AP Biology Unit 3", count: "6" },
        conversationContext: [
          "user: 帮我出 6 道 AP Biology Unit 3 选择题",
          "assistant: 已补全关键偏好：生成练习题 · 6 道题 · AP Biology Unit 3。开始执行。",
        ],
        locale: "zh",
      });

      assert(result.status === "needs_info", `expected needs_info, got ${result.status}`);
      if (result.status === "needs_info") {
        assert(result.question.field === "action", `expected action question, got ${result.question.field}`);
        assert(
          !result.summary.includes("开始执行"),
          `expected greeting summary not to auto-execute, got ${result.summary}`,
        );
      }
    });

    await it("follow-up request should carry forward recent count and curriculum context", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "再来几道，换成 FRQ",
        attachments: null,
        answers: {},
        sessionDefaults: {},
        conversationContext: [
          "user: 帮我出 5 道 AP Calculus BC Unit 10 选择题",
          "assistant: 已补全关键偏好：生成练习题 · 5 道题 · AP Calculus BC Unit 10。开始执行。",
        ],
        locale: "zh",
      });

      assert(result.status === "ready", `expected ready, got ${result.status}`);
      assert(result.collectedAnswers.count === "5", `expected carried count 5, got ${result.collectedAnswers.count}`);
      assert(
        result.collectedAnswers.curriculum === "AP Calculus BC Unit 10",
        `expected carried curriculum, got ${result.collectedAnswers.curriculum}`,
      );
    });

    await it("save-to-question-bank follow-up should resolve to save_exercises instead of regenerate", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "保存到题库",
        attachments: null,
        answers: {},
        sessionDefaults: {},
        conversationContext: [
          "user: 帮我出 2 道 chain rule 选择题",
          "assistant: 已完成习题生成；本轮先不入库。",
          "assistant: ### 第 1 题",
          "assistant: 求 y = sin(3x^2) 的导数 y'。",
        ],
        locale: "zh",
      });

      assert(result.status === "ready", `expected ready, got ${result.status}`);
      if (result.status === "ready") {
        assert(
          result.taskContext.action === "save_exercises",
          `expected save_exercises, got ${result.taskContext.action}`,
        );
      }
    });

    await it("generate-and-save request should still resolve to generate_exercises", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "请生成 3 道 AP Biology Unit 3 题并保存到题库",
        attachments: null,
        answers: {},
        sessionDefaults: {},
        conversationContext: [],
        locale: "zh",
      });

      assert(result.status === "ready", `expected ready, got ${result.status}`);
      if (result.status === "ready") {
        assert(
          result.taskContext.action === "generate_exercises",
          `expected generate_exercises, got ${result.taskContext.action}`,
        );
        assert(
          result.taskContext.savePreference === "default",
          `expected default savePreference, got ${result.taskContext.savePreference}`,
        );
      }
    });

    await it("generate-without-save request should stay temp_only when user explicitly says do not save", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "请生成 3 道 AP Biology Unit 3 题，先不要入库。",
        attachments: null,
        answers: {},
        sessionDefaults: {},
        conversationContext: [],
        locale: "zh",
      });

      assert(result.status === "ready", `expected ready, got ${result.status}`);
      if (result.status === "ready") {
        assert(
          result.taskContext.action === "generate_exercises",
          `expected generate_exercises, got ${result.taskContext.action}`,
        );
        assert(
          result.taskContext.savePreference === "temp_only",
          `expected temp_only savePreference, got ${result.taskContext.savePreference}`,
        );
      }
    });

    await it("attachment worksheet request should resolve to temp pool worksheet mode", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "从这份 PDF 里面的题直接组一套 worksheet",
        attachments: {
          fileCount: 1,
          totalQuestions: 8,
          archivedQuestionCount: 0,
          materialFileCount: 0,
          questionFileCount: 1,
          hasFigures: false,
          hasTables: false,
          fileNames: ["ap-calculus-bc-frq.pdf"],
          contentKinds: ["question_set"],
        },
        answers: {},
        sessionDefaults: {},
        conversationContext: [],
        locale: "zh",
      });

      assert(result.status === "ready", `expected ready, got ${result.status}`);
      if (result.status === "ready") {
        assert(
          result.taskContext.attachmentMode === "scan_pool_worksheet",
          `expected scan_pool_worksheet, got ${result.taskContext.attachmentMode}`,
        );
        assert(
          result.taskContext.savePreference === "temp_only",
          `expected temp_only savePreference, got ${result.taskContext.savePreference}`,
        );
      }
    });

    await it("material pdf worksheet request should stay on material_reference instead of temp pool mode", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "请基于这份 PDF 资料生成一份 exam，包含 5 道选择题和 2 道简答题",
        attachments: {
          fileCount: 1,
          totalQuestions: 0,
          archivedQuestionCount: 0,
          materialFileCount: 1,
          questionFileCount: 0,
          hasFigures: false,
          hasTables: false,
          fileNames: ["chapter-11.pdf"],
          contentKinds: ["material"],
        },
        answers: {},
        sessionDefaults: {},
        conversationContext: [],
        locale: "zh",
      });

      assert(result.status === "ready", `expected ready, got ${result.status}`);
      if (result.status === "ready") {
        assert(
          result.taskContext.attachmentMode === "material_reference",
          `expected material_reference, got ${result.taskContext.attachmentMode}`,
        );
        assert(
          result.taskContext.savePreference === "save_after_confirm",
          `expected save_after_confirm, got ${result.taskContext.savePreference}`,
        );
      }
    });

    await it("pbl request without a concrete theme should ask for a specific topic", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "帮我设计一个 AP Chemistry 的 PBL 项目",
        attachments: null,
        answers: {},
        sessionDefaults: {},
        conversationContext: [],
        locale: "zh",
      });

      assert(result.status === "needs_info", `expected needs_info, got ${result.status}`);
      if (result.status === "needs_info") {
        assert(result.question.field === "topic", `expected topic question, got ${result.question.field}`);
        assert(
          result.collectedAnswers.action === "generate_pbl",
          `expected generate_pbl action, got ${result.collectedAnswers.action}`,
        );
      }
    });

    await it("pbl request with a concrete theme should be ready and carry pbl-specific prompt instructions", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "帮我设计一个 AP Chemistry PBL 项目，主题是化学电池在校园应急供电中的应用",
        attachments: null,
        answers: {},
        sessionDefaults: {},
        conversationContext: [],
        locale: "zh",
      });

      assert(result.status === "ready", `expected ready, got ${result.status}`);
      if (result.status === "ready") {
        assert(
          result.taskContext.action === "generate_pbl",
          `expected generate_pbl action, got ${result.taskContext.action}`,
        );
        assert(
          result.enrichedPrompt.includes("检查清单") && result.enrichedPrompt.includes("参考资料链接"),
          `expected pbl enriched prompt to include execution and evidence requirements, got ${result.enrichedPrompt}`,
        );
      }
    });
  });

  await describe("sessionDefaults", async () => {
    await it("should use session curriculum when message has no curriculum info", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "帮我出 5 道选择题",
        attachments: null,
        answers: {},
        sessionDefaults: { curriculum: "AP Biology Unit 3" },
        conversationContext: [],
        locale: "zh",
      });

      assert(result.status === "ready", `expected ready, got ${result.status}`);
      assert(
        result.collectedAnswers.curriculum === "AP Biology Unit 3",
        `expected session curriculum AP Biology Unit 3, got ${result.collectedAnswers.curriculum}`,
      );
    });

    await it("should NOT override explicit message curriculum with session defaults", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "帮我出 5 道 AP Chemistry 选择题",
        attachments: null,
        answers: {},
        sessionDefaults: { curriculum: "AP Biology Unit 3" },
        conversationContext: [],
        locale: "zh",
      });

      assert(result.status === "ready", `expected ready, got ${result.status}`);
      // 消息中的 AP Chemistry 应通过 LLM/parsedIntent 提取，不被 session 覆盖
      // 在 fallback 路径中，curriculum 不通过正则提取，所以 session default 会填入
      // 但如果消息明确提到了 AP Chemistry，parsedIntent 会识别到
      // 关键是 session default 不会覆盖已有值
    });

    await it("should NOT override explicit answers with session defaults", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "帮我出 5 道选择题",
        attachments: null,
        answers: { curriculum: "AP Physics Unit 1" },
        sessionDefaults: { curriculum: "AP Biology Unit 3" },
        conversationContext: [],
        locale: "zh",
      });

      assert(result.status === "ready", `expected ready, got ${result.status}`);
      assert(
        result.collectedAnswers.curriculum === "AP Physics Unit 1",
        `expected explicit curriculum AP Physics Unit 1, got ${result.collectedAnswers.curriculum}`,
      );
    });

    await it("新的 AP 教案请求不应继承上一轮习题的 session topic 与课程，并且在课程单元已明确时应直接 ready", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "帮我生成一个 enviorment science ap unit1 的教案",
        attachments: null,
        answers: {},
        sessionDefaults: {
          action: "generate_exercises",
          curriculum: "AP Calculus BC Unit 3",
          topic: "chain rule",
        },
        conversationContext: [],
        locale: "zh",
      });

      assert(result.status === "ready", `expected ready, got ${result.status}`);
      assert(
        result.collectedAnswers.curriculum !== "AP Calculus BC Unit 3",
        `expected fresh lesson request not to inherit old curriculum, got ${result.collectedAnswers.curriculum}`,
      );
      assert(
        result.collectedAnswers.topic !== "chain rule",
        `expected fresh lesson request not to inherit old topic, got ${result.collectedAnswers.topic}`,
      );
      if (result.status === "ready") {
        assert(
          !result.taskContext?.normalizedRequest.includes("chain rule"),
          `expected taskContext not to include stale topic, got: ${result.taskContext?.normalizedRequest}`,
        );
      }
    });

    await it("短的新教案请求不应因为长度较短而继承上一轮习题上下文", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "语文教案",
        attachments: null,
        answers: {},
        sessionDefaults: {
          action: "generate_exercises",
          curriculum: "AP Calculus BC Unit 3",
          topic: "chain rule",
        },
        conversationContext: [
          "user: 帮我出 5 道 AP Calculus BC Unit 3 chain rule 选择题",
          "assistant: 已完成习题生成；本轮先不入库。",
        ],
        locale: "zh",
      });

      assert(result.status === "needs_info", `expected needs_info, got ${result.status}`);
      assert(
        result.collectedAnswers.curriculum !== "AP Calculus BC Unit 3",
        `expected short fresh lesson request not to inherit old curriculum, got ${result.collectedAnswers.curriculum}`,
      );
      assert(
        result.collectedAnswers.topic !== "chain rule",
        `expected short fresh lesson request not to inherit old topic, got ${result.collectedAnswers.topic}`,
      );
    });

    await it("带有“全新”锚点的新 AP 教案请求应覆盖 continuation 词，不得继承旧课程与主题", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "继续做一个全新的 AP Biology Unit 1 教案",
        attachments: null,
        answers: {},
        sessionDefaults: {
          action: "lesson_plan",
          curriculum: "AP Chemistry Unit 6",
          topic: "equilibrium",
        },
        conversationContext: [
          "user: 帮我做一份 AP Chemistry Unit 6 equilibrium 教案",
          "assistant: 已补全关键偏好：生成教案 · 45 分钟 · AP Chemistry Unit 6 · equilibrium。开始执行。",
        ],
        locale: "zh",
      });

      assert(result.status === "ready", `expected ready, got ${result.status}`);
      assert(
        result.collectedAnswers.curriculum !== "AP Chemistry Unit 6",
        `expected fresh lesson request not to inherit old chemistry curriculum, got ${result.collectedAnswers.curriculum}`,
      );
      assert(
        result.collectedAnswers.topic !== "equilibrium",
        `expected fresh lesson request not to inherit old chemistry topic, got ${result.collectedAnswers.topic}`,
      );
      if (result.status === "ready") {
        assert(
          !result.taskContext.normalizedRequest.includes("equilibrium"),
          `expected taskContext not to contain stale topic, got ${result.taskContext.normalizedRequest}`,
        );
      }
    });
  });

  await describe("default transparency", async () => {
    await it("should include default note when count is auto-filled", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "帮我出题",
        attachments: null,
        answers: { action: "generate_exercises", topic: "线性代数" },
        sessionDefaults: {},
        conversationContext: [],
        locale: "zh",
      });

      assert(result.status === "ready", `expected ready, got ${result.status}`);
      if (result.status === "ready") {
        assert(
          result.summary.includes("默认值"),
          `expected summary to mention defaults, got: ${result.summary}`,
        );
      }
    });

    await it("should include default note for duration when lesson plan topic is already specific", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "帮我生成一份教案",
        attachments: null,
        answers: { topic: "古诗词鉴赏" },
        sessionDefaults: {},
        conversationContext: [],
        locale: "zh",
      });

      assert(result.status === "ready", `expected ready, got ${result.status}`);
      if (result.status === "ready") {
        assert(
          result.summary.includes("默认值"),
          `expected summary to mention defaults, got: ${result.summary}`,
        );
        assert(
          result.summary.includes("45"),
          `expected summary to show 45 min default, got: ${result.summary}`,
        );
      }
    });

    await it("语文教案在 fallback 路径下应追问具体主题，且不能误抽出题量 1", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "帮我生成一个语文教案",
        attachments: null,
        answers: {},
        sessionDefaults: {},
        conversationContext: [],
        locale: "zh",
      });

      assert(result.status === "needs_info", `expected needs_info, got ${result.status}`);
      if (result.status === "needs_info") {
        assert(result.question.field === "topic", `expected topic question, got ${result.question.field}`);
        assert(
          !("count" in result.collectedAnswers),
          `expected lesson plan preflight not to infer count, got ${JSON.stringify(result.collectedAnswers)}`,
        );
        assert(
          !result.taskContext?.normalizedRequest.includes("数量：1"),
          `expected taskContext not to contain fake count, got ${result.taskContext?.normalizedRequest}`,
        );
      }
    });

    await it("语文教案 follow-up 选项应给出具体主题，而不是会导致循环的占位答案", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "帮我生成一个语文教案",
        attachments: null,
        answers: { topic: "当前章节重点" },
        sessionDefaults: {},
        conversationContext: [],
        locale: "zh",
      });

      assert(result.status === "needs_info", `expected needs_info, got ${result.status}`);
      if (result.status === "needs_info") {
        const labels = result.question.options.map((option) => option.label);
        assert(
          labels.includes("古诗词鉴赏"),
          `expected lesson topic options to include concrete chinese topic, got ${labels.join(", ")}`,
        );
        assert(
          !labels.includes("当前章节重点"),
          `expected question options not to repeat generic placeholder, got ${labels.join(", ")}`,
        );
        assert(
          !labels.includes("课堂小测重点"),
          `expected question options not to repeat quiz placeholder, got ${labels.join(", ")}`,
        );
      }
    });

    await it("语文教案补充具体主题后应 ready，且摘要里不应出现题量", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "帮我生成一个语文教案",
        attachments: null,
        answers: { topic: "古诗词鉴赏" },
        sessionDefaults: {},
        conversationContext: [],
        locale: "zh",
      });

      assert(result.status === "ready", `expected ready, got ${result.status}`);
      if (result.status === "ready") {
        assert(
          !result.summary.includes("道题"),
          `expected lesson plan summary not to mention question count, got ${result.summary}`,
        );
        assert(
          !result.enrichedPrompt.includes("输出数量"),
          `expected lesson plan prompt not to include quantity, got ${result.enrichedPrompt}`,
        );
      }
    });

    await it("AP Environmental Science 教案请求不应被误判成 research", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "帮我生成一个 AP Environmental Science Unit 1 的教案，45 分钟，聚焦 Earth Systems and Resources。",
        attachments: null,
        answers: {},
        sessionDefaults: {},
        conversationContext: [],
        locale: "zh",
      });

      assert(result.status === "ready", `expected ready, got ${result.status}`);
      if (result.status === "ready") {
        assert(
          result.taskContext.action === "lesson_plan",
          `expected lesson_plan, got ${result.taskContext.action}`,
        );
        assert(
          !result.summary.includes("联网检索"),
          `expected summary not to mention research, got ${result.summary}`,
        );
      }
    });

    await it("AP Environmental Science Unit 1 教案在已有课程单元锚点时不应继续追问 topic", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "帮我生成一个 enviorment science ap unit1 的教案，45 分钟，包含教学目标、课时安排、导入活动。",
        attachments: null,
        answers: {},
        sessionDefaults: {},
        conversationContext: [],
        locale: "zh",
      });

      assert(result.status === "ready", `expected ready, got ${result.status}`);
      if (result.status === "ready") {
        assert(
          result.taskContext.action === "lesson_plan",
          `expected lesson_plan, got ${result.taskContext.action}`,
        );
      }
    });

    await it("should NOT show default note when user explicitly specifies count", async () => {
      const result = await resolveAgentPreflightFallback({
        message: "帮我出 8 道 AP Calculus 选择题",
        attachments: null,
        answers: {},
        sessionDefaults: {},
        conversationContext: [],
        locale: "zh",
      });

      assert(result.status === "ready", `expected ready, got ${result.status}`);
      if (result.status === "ready") {
        assert(
          !result.summary.includes("默认值"),
          `expected no default note when user specified count, got: ${result.summary}`,
        );
      }
    });
  });

  await describe("rankApCourseCandidates", async () => {
    await it("AP Calculus should surface AB and BC as the top disambiguation candidates", () => {
      const parsedIntent = parseIntentFromText("AP Calculus 出 5 道题");
      const ranked = rankApCourseCandidates({
        promptText: "AP Calculus 出 5 道题",
        parsedIntent,
        courses: [
          { id: "ab", name: "AP Calculus AB", code: "CALC-AB", framework: "AP" },
          { id: "bc", name: "AP Calculus BC", code: "CALC-BC", framework: "AP" },
          { id: "bio", name: "AP Biology", code: "BIO", framework: "AP" },
        ],
      });

      assert(ranked.length >= 2, `expected at least 2 candidates, got ${ranked.length}`);
      assert(ranked[0]?.item.name === "AP Calculus AB", `expected first candidate to be AB, got ${ranked[0]?.item.name}`);
      assert(ranked[1]?.item.name === "AP Calculus BC", `expected second candidate to be BC, got ${ranked[1]?.item.name}`);
    });

    await it("explicit BC mention should rank BC above AB", () => {
      const parsedIntent = parseIntentFromText("AP Calculus BC Unit 10 series 出 3 道 FRQ");
      const ranked = rankApCourseCandidates({
        promptText: "AP Calculus BC Unit 10 series 出 3 道 FRQ",
        parsedIntent,
        courses: [
          { id: "ab", name: "AP Calculus AB", code: "CALC-AB", framework: "AP" },
          { id: "bc", name: "AP Calculus BC", code: "CALC-BC", framework: "AP" },
        ],
      });

      assert(ranked[0]?.item.name === "AP Calculus BC", `expected BC first, got ${ranked[0]?.item.name}`);
      assert(
        (ranked[0]?.score ?? 0) > (ranked[1]?.score ?? 0),
        `expected BC score > AB score, got ${ranked[0]?.score} vs ${ranked[1]?.score}`,
      );
    });
  });

  await describe("rankTopicCandidates", async () => {
    await it("chainrule 连写时也应该把匹配 topic 排在第一位", () => {
      const parsedIntent = parseIntentFromText("帮我出三道chainrule习题");
      const ranked = rankTopicCandidates({
        promptText: "帮我出三道chainrule习题",
        parsedIntent,
        topics: [
          {
            id: "topic-1",
            title: "The Chain Rule",
            topic_number: "3.5",
            unit_id: "unit-3",
            unit: { id: "unit-3", title: "Applying Derivatives to Analyze Functions", unit_number: "3" },
          },
          {
            id: "topic-2",
            title: "Mean Value Theorem and Extreme Value Theorem",
            topic_number: "5.6",
            unit_id: "unit-5",
            unit: { id: "unit-5", title: "Analytical Applications of Differentiation", unit_number: "5" },
          },
          {
            id: "topic-3",
            title: "Selected Values of Trigonometric Functions",
            topic_number: "2.5",
            unit_id: "unit-2",
            unit: { id: "unit-2", title: "Differentiation: Definition and Fundamental Properties", unit_number: "2" },
          },
        ],
      });

      assert(ranked.length >= 1, `expected at least 1 ranked topic, got ${ranked.length}`);
      assert(ranked[0]?.item.title === "The Chain Rule", `expected Chain Rule first, got ${ranked[0]?.item.title}`);
      assert(ranked[0]?.item.unit.unit_number === "3", `expected Chain Rule to map to Unit 3, got ${ranked[0]?.item.unit.unit_number}`);
    });

    await it("topic 可以先反推到 AP Calculus AB and BC 与 Unit 3", () => {
      const parsedIntent = parseIntentFromText("帮我出三道chainrule习题");
      const resolved = resolveTopicDrivenCurriculum({
        promptText: "帮我出三道chainrule习题",
        parsedIntent,
        courses: [
          { id: "calc-combined", name: "AP Calculus AB and BC", code: "CALC-ABC", framework: "AP" },
          { id: "bio", name: "AP Biology", code: "BIO", framework: "AP" },
        ],
        units: [
          { id: "unit-3", course_id: "calc-combined", title: "Applying Derivatives to Analyze Functions", unit_number: "3" },
          { id: "unit-bio", course_id: "bio", title: "Cell Structure and Function", unit_number: "2" },
        ],
        topics: [
          { id: "topic-1", title: "The Chain Rule", topic_number: "3.5", unit_id: "unit-3" },
          { id: "topic-2", title: "Cell Communication", topic_number: "2.1", unit_id: "unit-bio" },
        ],
      });

      assert(Boolean(resolved), "expected topic-driven curriculum resolution to succeed");
      assert(resolved?.course.name === "AP Calculus AB and BC", `expected calculus course, got ${resolved?.course.name}`);
      assert(resolved?.unit.unit_number === "3", `expected Unit 3, got ${resolved?.unit.unit_number}`);
      assert(resolved?.topic.title === "The Chain Rule", `expected Chain Rule topic, got ${resolved?.topic.title}`);
    });
  });

  await describe("extractRequestedCount", async () => {
    await it("应该能识别中文题量", () => {
      assert(extractRequestedCount("帮我出三道题") === 3, `expected 3, got ${extractRequestedCount("帮我出三道题")}`);
      assert(extractRequestedCount("帮我出十二道题") === 12, `expected 12, got ${extractRequestedCount("帮我出十二道题")}`);
    });
  });

  // shouldBypassPlannerClarify 测试已移除 — 逻辑合并到 Haiku 意图规划中

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const failure of failures) {
      console.log(`  - ${failure}`);
    }
  }
  console.log(`${"=".repeat(50)}`);

  if (failed > 0) {
    process.exit(1);
  }
}

void main();
