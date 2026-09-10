import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseIntentFromText } from "../../lib/chat/intent";
import {
  buildAgentTaskState,
  mergeAgentTaskStateWithContext,
} from "../../lib/agent/task-state";
import { resolveAgentTriageDecision } from "../../lib/agent/triage/engine";

type GoldenFixture = {
  id: string;
  prompt: string;
  expected: {
    workflow: string;
    artifactIntent?: string;
    allowedToolsCount?: number;
    retrievalSourcesOneOf?: string[];
  };
};

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

async function loadFixtures() {
  const fixturePath = join(
    process.cwd(),
    "tests/followup/fixtures/agent-triage-golden-prompts.json",
  );
  const raw = await readFile(fixturePath, "utf-8");
  return JSON.parse(raw) as GoldenFixture[];
}

function resolveDecision(prompt: string) {
  const taskState = buildAgentTaskState({
    visiblePrompt: prompt,
    latestPrompt: prompt,
    lastArtifactType: "",
    hasUploadedMaterials: false,
  });
  return resolveAgentTriageDecision({
    promptTaskState: taskState,
    contextualTaskState: mergeAgentTaskStateWithContext(taskState, undefined),
    parsedIntent: parseIntentFromText(prompt),
    visiblePrompt: prompt,
  });
}

async function main() {
  console.log("\nagent triage golden prompts");
  const fixtures = await loadFixtures();

  for (const fixture of fixtures) {
    const decision = resolveDecision(fixture.prompt);
    const title = `[${fixture.id}]`;
    assert(
      decision.workflow === fixture.expected.workflow,
      `${title} workflow 期望 ${fixture.expected.workflow}，实际 ${decision.workflow}`,
    );
    if (fixture.expected.artifactIntent) {
      assert(
        decision.artifactIntent === fixture.expected.artifactIntent,
        `${title} artifactIntent 期望 ${fixture.expected.artifactIntent}，实际 ${decision.artifactIntent}`,
      );
    }
    if (typeof fixture.expected.allowedToolsCount === "number") {
      assert(
        decision.allowedTools.length === fixture.expected.allowedToolsCount,
        `${title} allowedTools.length 期望 ${fixture.expected.allowedToolsCount}，实际 ${decision.allowedTools.length}`,
      );
    }
    if (fixture.expected.retrievalSourcesOneOf?.length) {
      assert(
        fixture.expected.retrievalSourcesOneOf.includes(decision.retrievalSources),
        `${title} retrievalSources 期望在 ${fixture.expected.retrievalSourcesOneOf.join(",")}，实际 ${decision.retrievalSources}`,
      );
    }
    if (failures.length === 0) {
      console.log(`  PASS: ${fixture.id}`);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} assertions failed, ${passed} passed.`);
    process.exit(1);
  }
  console.log(`\nAll ${passed} assertions passed.`);
}

void main();

