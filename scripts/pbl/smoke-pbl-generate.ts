import { randomUUID } from "crypto";
import { generatePblProject } from "@/lib/pbl/generator";
import type { PblQualityStatus, PblSimpleInput } from "@/lib/pbl/types";

type SmokeScenario = {
  name: string;
  input: PblSimpleInput;
};

async function runScenario(input: PblSimpleInput) {
  const { plan, searchResults, timings } = await generatePblProject(input);
  const qualitySummary = plan.qualityCheck.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { pass: 0, warning: 0, fail: 0 } satisfies Record<PblQualityStatus, number>,
  );

  return {
    input: {
      curriculumSystem: input.curriculumSystem ?? null,
      subject: input.subject ?? null,
      grade: input.grade ?? null,
      totalPeriods: input.totalPeriods ?? null,
      prompt: input.prompt,
    },
    inferred: {
      curriculumSystem: plan.inferredParams.curriculumSystem,
      primarySubject: plan.inferredParams.primarySubject,
      grade: plan.inferredParams.grade,
      totalPeriods: plan.inferredParams.totalPeriods,
      difficulty: plan.inferredParams.difficulty,
      topic: plan.inferredParams.topic,
      knowledgePoints: plan.inferredParams.knowledgePoints,
    },
    searchResultCount: searchResults.length,
    topSearchResults: searchResults.slice(0, 3).map((item) => ({
      title: item.title,
      url: item.url,
      type: item.type,
    })),
    plan: {
      title: plan.title,
      stageCount: plan.stages.length,
      stageNames: plan.stages.map((item) => item.name),
      curriculumAlignment: plan.curriculumAlignment.map((item) => item.knowledgePointCode),
      materialReferences: plan.materialReferences.map((item) => item.materialId),
      drivingQuestion: plan.drivingQuestion,
      qualitySummary,
    },
    timings,
  };
}

async function main() {
  const scenarios: SmokeScenario[] = [
    {
      name: "ap-chem-energy-materials",
      input: {
        prompt:
          "为 AP Chemistry 11 年级设计一个 6 周 PBL 项目，主题聚焦能源与材料、环境与生态，需要学生完成研究报告和展示答辩，并且明确引用 AP CED 课标证据。",
        curriculumSystem: "AP",
        grade: "G11",
        subject: "AP Chemistry",
        totalPeriods: 18,
      },
    },
    {
      name: "ap-physics-community-engineering",
      input: {
        prompt:
          "为 AP Physics 1 和 AP Computer Science A 的跨学科班级设计一个 8 周工程设计型 PBL 项目，主题是城市与社区，学生最终要提交产品原型或实物作品。",
        curriculumSystem: "AP",
        grade: "G10",
        subject: "AP Physics 1",
        totalPeriods: 24,
      },
    },
  ];

  const results = [];
  for (const scenario of scenarios) {
    const result = await runScenario(scenario.input);
    results.push({
      id: randomUUID(),
      scenario: scenario.name,
      ...result,
    });
  }

  console.log(JSON.stringify({ ok: true, scenarios: results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
