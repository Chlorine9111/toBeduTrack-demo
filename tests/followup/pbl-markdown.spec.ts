import {
  extractDrivingQuestionFromMarkdown,
  extractTitleFromMarkdown,
  normalizePlanTitle,
} from "../../lib/pbl/plan-markdown";

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
  console.log("\npbl markdown parsing");

  await it("should strip generic plan prefixes from H1 titles", () => {
    const title = extractTitleFromMarkdown(
      "# 高中物理 PBL 项目方案：极限与底线——从“10·27”事故看过山车安全工程设计",
    );

    assert(title === "极限与底线——从“10·27”事故看过山车安全工程设计", `unexpected title: ${title}`);
  });

  await it("should extract inline driving question", () => {
    const question = extractDrivingQuestionFromMarkdown(
      "# 标题\n\n**驱动问题**：作为特种设备安全工程师，我们如何基于物理学原理审查过山车方案并提出可执行的安全优化建议？",
    );

    assert(
      question === "作为特种设备安全工程师，我们如何基于物理学原理审查过山车方案并提出可执行的安全优化建议？",
      `unexpected question: ${question}`,
    );
  });

  await it("should extract block driving question under a section heading", () => {
    const question = extractDrivingQuestionFromMarkdown(
      "# 标题\n\n### 2. 驱动问题\n**“作为特种设备安全工程师，你将如何运用物理学原理与工程标准，设计一段既满足刺激感又绝对安全的过山车核心轨道，并为其制定安全评估报告？”**\n\n## 三、教学目标",
    );

    assert(
      question ===
        "作为特种设备安全工程师，你将如何运用物理学原理与工程标准，设计一段既满足刺激感又绝对安全的过山车核心轨道，并为其制定安全评估报告？",
      `unexpected block question: ${question}`,
    );
  });

  await it("normalizePlanTitle should keep already-clean titles untouched", () => {
    const title = normalizePlanTitle("化学电池项目化学习方案");
    assert(title === "化学电池项目化学习方案", `unexpected normalized title: ${title}`);
  });

  console.log("\n==================================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

void main();
