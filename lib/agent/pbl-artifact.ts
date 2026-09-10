import { embedArtifactPayload } from "@/lib/agent/artifact-payload";
import type { PblPlan } from "@/lib/pbl/types";
import { summarizeMarkdownPlain } from "@/lib/pbl/plan-markdown";

export function buildPblArtifactAssistantText(
  plan: PblPlan,
  options?: { isContinuation?: boolean },
) {
  const conciseSummary = [
    plan.projectBrief.coreChallenge,
    plan.projectBrief.researchBoundary,
    plan.projectBrief.successCriteria[0],
  ]
    .filter(Boolean)
    .join(" ");
  const summaryText = conciseSummary || summarizeMarkdownPlain(plan.markdownContent, 220);
  const topResources = plan.searchResults.slice(0, 3);
  const resourceLine =
    topResources.length > 0
      ? topResources
          .map((resource, index) => `${index + 1}. ${resource.title}`)
          .join(" / ")
      : "将自动补充项目所需参考资料";

  const visibleText = [
    `## ${plan.title}`,
    `**驱动问题：** ${plan.drivingQuestion}`,
    "",
    `**项目定位：** ${plan.projectBrief.realWorldContext || summaryText}`,
    `**成果形式：** ${plan.finalOutcomeForm} · ${plan.presentationFormat}`,
    `**实施规模：** ${plan.primarySubject} | ${plan.grade} | ${plan.totalPeriods} 课时 | ${plan.stages.length} 个阶段`,
    `**参考来源：** 已绑定 ${plan.searchResults.length} 条资料，优先使用：${resourceLine}`,
    options?.isContinuation
      ? "**方案状态：** 已按你的要求更新当前 PBL 方案，可继续在对话中迭代。"
      : "**方案状态：** 已生成完整 Markdown 教学方案，可继续在对话中迭代。",
    "",
    "## 下一步",
    "1. 点击下方引用块，在右侧查看完整方案与阶段设计",
    "2. 继续直接说：压缩课时 / 改阶段任务 / 增加评估与量规",
    "3. 如需归档查看，也可以稍后在内容库的 PBL 项目中打开",
  ]
    .filter(Boolean)
    .join("\n");

  return embedArtifactPayload(visibleText, {
    kind: "pbl",
    title: plan.title,
    summary: summaryText,
    rawContent: plan.markdownContent,
    metadata: {
      planId: plan.id,
      primarySubject: plan.primarySubject,
      grade: plan.grade,
      curriculumSystem: plan.curriculumSystem,
      totalPeriods: plan.totalPeriods,
      stageCount: plan.stages.length,
      referenceCount: plan.searchResults.length,
      finalOutcomeForm: plan.finalOutcomeForm,
      targetAudience: plan.targetAudience,
      coreChallenge: plan.projectBrief.coreChallenge,
      searchResults: plan.searchResults,
      version: plan.version,
      updatedAt: plan.updatedAt,
    },
  });
}
