import { detectSubjectCategory } from "../../lib/ai/subject-category";
import { renderSystemPrompt, type SystemPromptContext } from "../../lib/ai/prompt-assembler";
import { resolveExerciseTemperature } from "../../lib/ai/exercise-generator";
import { loadExerciseExamples } from "../../lib/curriculum/loader";

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

function createEmptyExerciseExampleSupabase() {
  const builder = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    in() {
      return this;
    },
    order() {
      return this;
    },
    async limit() {
      return {
        data: [],
        error: null,
      };
    },
  };

  return {
    from() {
      return builder;
    },
  };
}

const baseContext: SystemPromptContext = {
  courseName: "AP World History: Modern",
  unitNumber: "4",
  unitTitle: "Transoceanic Interconnections",
  topicId: "4.2",
  topicTitle: "Technological Innovations",
  learningObjectives: [
    {
      code: "LO-1",
      description: "Explain how technology changed imperial expansion.",
    },
  ],
  essentialKnowledge: [
    {
      code: "EK-1",
      description: "Industrial technologies accelerated conquest and extraction.",
    },
  ],
};

async function main() {
  await describe("detectSubjectCategory", async () => {
    await it("应识别 psychology 与 computer science", () => {
      assert(
        detectSubjectCategory("AP Psychology") === "psychology",
        "expected AP Psychology -> psychology",
      );
      assert(
        detectSubjectCategory("AP Computer Science A") === "computer-science",
        "expected AP Computer Science A -> computer-science",
      );
    });
  });

  await describe("resolveExerciseTemperature", async () => {
    await it("应按题量选择 temperature", () => {
      assert(resolveExerciseTemperature({ count: 1 }) === 0.3, "count=1 should use 0.3");
      assert(resolveExerciseTemperature({ count: 3 }) === 0.5, "count=3 should use 0.5");
      assert(resolveExerciseTemperature({ count: 5 }) === 0.5, "count=5 should use 0.5");
      assert(
        resolveExerciseTemperature({ count: 1, requestCountHint: 6 }) === 0.6,
        "requestCountHint=6 should override single-count temperature",
      );
    });
  });

  await describe("loadExerciseExamples", async () => {
    await it("数据库为空时应回退到静态 exercise examples", async () => {
      const examples = await loadExerciseExamples(
        "mock-course",
        "MC",
        "medium",
        1,
        createEmptyExerciseExampleSupabase() as never,
        { courseName: "AP World History: Modern" },
      );

      assert(examples.length === 1, `expected 1 static example, got ${examples.length}`);
      assert(examples[0]?.type === "MC", `expected MC example, got ${examples[0]?.type}`);
      assert(
        Boolean(examples[0]?.questionText?.includes("European states")),
        "expected static history MC example to be loaded",
      );
    });
  });

  await describe("renderSystemPrompt", async () => {
    await it("AP 历史 MC 应注入 anti-patterns、subject hint 与历史干扰项规则", async () => {
      const rendered = await renderSystemPrompt(baseContext, "mc_exercise", {
        track: "ap",
      });

      assert(rendered.includes("Anti-patterns"), "system prompt should include anti-patterns");
      assert(
        rendered.includes("学科适配：历史与社会科学"),
        "system prompt should include AP history subject hint",
      );
      assert(
        rendered.includes("History MCQ Distractor Rules"),
        "system prompt should include history-specific MC distractor rules",
      );
    });

    await it("AP Computer Science FR 应注入新的计算机科学 subject hint", async () => {
      const rendered = await renderSystemPrompt(
        {
          ...baseContext,
          courseName: "AP Computer Science A",
          unitTitle: "Primitive Types and Using Objects",
        },
        "fr_exercise",
        { track: "ap" },
      );

      assert(
        rendered.includes("学科适配：计算机科学"),
        "system prompt should include computer science subject hint",
      );
      assert(
        rendered.includes("Free-Response Question (FRQ) Rules"),
        "system prompt should still include base FRQ rules",
      );
    });
  });

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
