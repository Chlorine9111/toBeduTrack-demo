import {
  buildTeacherMemoryMaintenanceSummary,
  readTeacherMemoryView,
  reconcileTeacherMemoryState,
} from "../../lib/teacher-memory/state";
import type { TeacherMemoryRecord } from "../../lib/teacher-memory/types";

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

function createMemory(summary: Record<string, unknown>): TeacherMemoryRecord {
  return {
    id: "memory-1",
    profileKey: "tm_test_profile",
    teacherId: "00000000-0000-0000-0000-000000000001",
    scope: "agent_workspace",
    preferences: {
      responseStyle: "结构化、短段落",
    },
    history: [],
    summary,
    createdAt: "2026-03-12T00:00:00.000Z",
    updatedAt: "2026-03-12T00:00:00.000Z",
    lastActiveAt: "2026-03-12T00:00:00.000Z",
  };
}

async function main() {
  await describe("teacher memory state", async () => {
    await it("should upgrade legacy arrays into structured state and preserve hot memory", () => {
      const memory = createMemory({
        recentTopics: ["Chain Rule"],
        stablePreferences: ["偏好结构化可执行回答"],
        knowledgeAnchors: ["主题:Chain Rule"],
        proceduralMemory: ["偏好结构化可执行回答"],
        semanticMemory: ["主题:Chain Rule"],
        activeGoals: ["生成一份链式法则题单"],
        openLoops: ["补一版 FRQ 变式题"],
        episodicMemory: ["上一轮生成了 3 道 Chain Rule 选择题"],
        coreProfile: {
          subjects: ["AP Calculus BC"],
          teachingStyle: "重视分步讲解",
          notes: "",
        },
      });

      const result = reconcileTeacherMemoryState({
        memory,
        payload: {
          conversationSummary: "继续围绕 chain rule 出题",
          recentTopics: ["Chain Rule"],
          activeGoals: ["生成一份链式法则题单"],
          openLoops: ["补一版 FRQ 变式题"],
          stablePreferences: ["偏好结构化可执行回答"],
          knowledgeAnchors: ["主题:Chain Rule"],
          proceduralMemory: ["偏好结构化可执行回答"],
          semanticMemory: ["主题:Chain Rule", "教授 AP Calculus BC"],
          episodicMemory: ["本轮继续补 FRQ"],
          lastArtifactType: "exercises",
          lastArtifactSummary: "链式法则题单",
        },
        now: "2026-03-12T10:00:00.000Z",
        meta: {
          turnKey: "turn-1",
          model: "gemini-3.1-flash-lite-preview",
        },
      });

      const upgraded = createMemory(result.nextSummary);
      const view = readTeacherMemoryView(upgraded);

      assert(result.nextSummary.memoryVersion === 2, "expected memoryVersion=2");
      assert(view.coreProfile.subjects.includes("AP Calculus BC"), "expected core profile subject preserved");
      assert(view.proceduralMemory.some((item) => item.includes("结构化")), "expected procedural memory preserved");
      assert(view.semanticMemory.some((item) => item.includes("Chain Rule")), "expected semantic memory preserved");
      assert(view.openLoops.some((item) => item.includes("FRQ")), "expected open loop preserved");
    });

    await it("should close open loops when closedLoops is provided", () => {
      const memory = createMemory({
        openLoops: ["补一版 FRQ 变式题"],
      });

      const result = reconcileTeacherMemoryState({
        memory,
        payload: {
          closedLoops: ["FRQ 变式题已经补完"],
        },
        now: "2026-03-12T11:00:00.000Z",
        meta: { turnKey: "turn-2" },
      });

      const upgraded = createMemory(result.nextSummary);
      const view = readTeacherMemoryView(upgraded);

      assert(view.openLoops.length === 0, "expected open loop to be closed");
      assert(view.closedLoops.some((item) => item.includes("FRQ")), "expected closed loop archive");
      assert(
        result.mutations.some((item) => item.operation === "close"),
        "expected at least one close mutation",
      );
    });

    await it("should expire stale episodic memory during maintenance", () => {
      const memory = createMemory({
        memoryState: {
          version: 2,
          coreProfile: { subjects: [], teachingStyle: "", notes: "" },
          procedural: [],
          semantic: [],
          activeGoals: [],
          openLoops: [],
          closedLoops: [],
          episodicRecent: [
            {
              key: "episodicRecent:old",
              content: "一条过期的最近任务",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              expiresAt: "2026-02-01T00:00:00.000Z",
              status: "active",
              sourceTurnKey: "old-turn",
            },
          ],
          latestConversationSummary: "",
          lastArtifactType: "",
          lastArtifactSummary: "",
          lastReviewedAt: "2026-01-01T00:00:00.000Z",
        },
      });

      const maintenance = buildTeacherMemoryMaintenanceSummary(
        memory,
        "2026-03-12T12:00:00.000Z",
      );
      const upgraded = createMemory(maintenance.nextSummary);
      const view = readTeacherMemoryView(upgraded);

      assert(view.episodicMemory.length === 0, "expected expired episodic memory to be pruned");
    });
  });

  if (failed > 0) {
    console.error(`\n${failed} tests failed`);
    process.exit(1);
  }

  console.log(`\nAll tests passed (${passed})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
