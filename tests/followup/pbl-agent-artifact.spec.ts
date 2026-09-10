import {
  embedArtifactPayload,
  extractEmbeddedArtifactPayload,
  stripEmbeddedArtifactPayload,
} from "../../lib/agent/artifact-payload";
import { buildPblArtifactAssistantText } from "../../lib/agent/pbl-artifact";
import { deriveArtifactsFromMessages } from "../../components/main/agent/artifact-utils";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failed += 1;
    console.error(`  FAIL: ${message}`);
    return;
  }
  passed += 1;
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
    console.error(`  FAIL: ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  console.log("\npbl agent artifact");

  await it("should embed and recover hidden artifact payload", () => {
    const content = embedArtifactPayload("## 可见摘要", {
      kind: "pbl",
      title: "化学电池项目",
      summary: "围绕化学电池的系统性研究",
      rawContent: "# 化学电池项目\n\n## 驱动问题\n...",
      metadata: {
        planId: "plan-1",
        primarySubject: "AP Chemistry",
        grade: "11",
        curriculumSystem: "AP",
        searchResults: [],
      },
    });

    const payload = extractEmbeddedArtifactPayload(content);
    assert(payload?.kind === "pbl", "expected embedded payload kind to be pbl");
    assert(payload?.title === "化学电池项目", `unexpected payload title: ${payload?.title}`);
    assert(stripEmbeddedArtifactPayload(content) === "## 可见摘要", "visible text should remain after stripping");
  });

  await it("should derive a pbl artifact from assistant summary message", () => {
    const content = embedArtifactPayload("## 化学电池项目\n\n点击查看完整方案", {
      kind: "pbl",
      title: "化学电池项目",
      summary: "在不同电解质浓度下比较电池性能",
      rawContent: "# 化学电池项目\n\n## 项目概述\n\n完整方案正文",
      metadata: {
        planId: "plan-1",
        primarySubject: "AP Chemistry",
        grade: "11",
        curriculumSystem: "AP",
        searchResults: [],
        version: 2,
      },
    });

    const artifacts = deriveArtifactsFromMessages(
      [
        {
          id: "assistant-1",
          role: "assistant",
          content,
        },
      ],
      true,
    );

    assert(artifacts.length === 1, `expected one artifact, got ${artifacts.length}`);
    assert(artifacts[0]?.kind === "pbl", `unexpected artifact kind: ${artifacts[0]?.kind}`);
    assert(artifacts[0]?.title === "化学电池项目", `unexpected artifact title: ${artifacts[0]?.title}`);
    assert(artifacts[0]?.pblMetadata?.planId === "plan-1", "expected planId to be preserved");
  });

  await it("should build reusable agent-visible text for a saved PBL plan", () => {
    const content = buildPblArtifactAssistantText({
      id: "plan-2",
      title: "化学电池性能优化项目",
      originalPrompt: "围绕化学电池做一个项目",
      inferredParams: {
        curriculumSystem: "AP",
        primarySubject: "AP Chemistry",
        grade: "11",
        totalPeriods: 10,
        difficulty: "advanced",
        topic: "化学电池",
        knowledgePoints: ["Electrochemistry"],
      },
      markdownContent: "# 化学电池性能优化项目\n\n## 驱动问题\n\n如何在安全前提下优化电池性能？",
      drivingQuestion: "如何在安全前提下优化电池性能？",
      primarySubject: "AP Chemistry",
      curriculumSystem: "AP",
      grade: "11",
      totalPeriods: 10,
      difficulty: "advanced",
      crossSubjects: [],
      suggestedGroupSize: 4,
      suggestedGroupCount: 6,
      finalOutcomeForm: "研究报告",
      finalOutcomeRequirements: "提交研究报告与口头展示",
      overviewText: "围绕化学电池开展研究设计。",
      searchResults: [],
      chatHistory: [],
      status: "draft",
      version: 1,
      createdAt: "2026-03-15T00:00:00.000Z",
      updatedAt: "2026-03-15T00:00:00.000Z",
      projectBrief: {
        realWorldContext: "新能源设备需要更稳定的电池系统。",
        coreChallenge: "性能与安全的平衡。",
        researchBoundary: "不进入工业级制造流程。",
        stakeholders: ["学生", "教师"],
        successCriteria: ["论证完整"],
        recommendedEvidence: ["实验记录"],
      },
      stages: [],
      assessments: [],
      rubric: [],
      curriculumAlignment: [],
      teacherGuidance: {
        commonDifficulties: [],
        differentiation: [],
        timeManagement: [],
        crossDisciplineCollab: [],
      },
      targetAudience: "校内展示",
      presentationFormat: "答辩",
      materialReferences: [],
      qualityCheck: [],
      studentVersionMarkdown: "# 化学电池性能优化项目",
    });

    const payload = extractEmbeddedArtifactPayload(content);
    assert(payload?.kind === "pbl", "expected reusable assistant text to carry a pbl payload");
    assert(stripEmbeddedArtifactPayload(content).includes("下一步"), "expected visible text to contain next-step guidance");
  });

  console.log("\n==================================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

void main();
