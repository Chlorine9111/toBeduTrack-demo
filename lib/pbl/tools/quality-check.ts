import { z } from "zod";
import type { PblPlan, PblQualityCheckItem } from "@/lib/pbl/types";
import { generateToolInputWithGateway } from "@/lib/ai/gateway";
import { generateStructuredObject } from "@/lib/ai/structured-output";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import { PBL_QUALITY_CHECK_PROMPT } from "@/lib/pbl/prompts/quality-check";
import pblQualityCheckToolSchema from "@/lib/ai/tools/pbl-quality-check.schema.json";

const aiQualityCheckResultSchema = z.object({
  checks: z.array(z.object({
    key: z.string(),
    status: z.enum(["pass", "warning", "fail"]),
    note: z.string().optional(),
  })).min(1),
});

function hasRealAudience(plan: PblPlan) {
  const text = plan.targetAudience.trim();
  return text.length > 0 && !text.includes("老师") && !text.includes("教师") && !text.includes("teacher only");
}

function hasConcreteExploreStage(plan: PblPlan) {
  const exploreStage = plan.stages.find((stage) => stage.stageType === "explore");
  if (!exploreStage) return false;
  return (
    exploreStage.realWorldProblem.length >= 20
    && exploreStage.implementationSteps.length >= 3
    && exploreStage.checklist.length >= 3
  );
}

function hasActionableTeacherSupport(plan: PblPlan) {
  return plan.stages.every(
    (stage) =>
      stage.teacherMoves.length >= 2
      && stage.feedbackFocus.length >= 2
      && stage.deliverableCriteria.length >= 2,
  );
}

function hasEvidenceTraceability(plan: PblPlan) {
  return plan.stages.every(
    (stage) => stage.evidenceRequirements.length >= 1 && stage.deliverables.length >= 1,
  );
}

function qualityCheckTemplate(plan: PblPlan): PblQualityCheckItem[] {
  const hasScaffoldMatch =
    (plan.difficulty === "basic" && plan.stages.some((s) => s.scaffolding.join(" ").includes("模板"))) ||
    (plan.difficulty === "challenge" && !plan.stages.some((s) => s.scaffolding.join(" ").includes("分步模板"))) ||
    plan.difficulty === "advanced";

  const hasCurriculumCode = plan.curriculumAlignment.some(
    (a) => a.knowledgePointCode !== "UNSPECIFIED-CORE-1",
  );

  const hasTeacherActionability =
    hasActionableTeacherSupport(plan)
    && plan.teacherGuidance.commonDifficulties.length >= 3
    && plan.teacherGuidance.timeManagement.length >= 2;
  const hasFormativeAssessment = plan.assessments.some((a) => a.type === "formative");
  const hasReflection = plan.stages.some((s) =>
    s.coreActivities.join(" ").includes("反思") || s.deliverables.join(" ").includes("反思"),
  );

  return [
    {
      key: "driving_question_quality",
      status:
        /如何|哪些|能否|为什么|何种|怎样|如何在/.test(plan.drivingQuestion) || plan.drivingQuestion.includes("How")
          ? "pass"
          : "warning",
      note: "建议使用开放式疑问句。",
    },
    {
      key: "problem_framing_specificity",
      status: hasConcreteExploreStage(plan) ? "pass" : "fail",
      note: "探索阶段必须明确真实问题、研究边界和检查清单。",
    },
    {
      key: "stage_actionability",
      status: hasActionableTeacherSupport(plan)
        ? "pass"
        : "warning",
      note: "每个阶段都应有教师动作、反馈重点与达标标准。",
    },
    {
      key: "core_alignment_exists",
      status: plan.curriculumAlignment.some((item) => item.coverageType === "core") ? "pass" : "fail",
      note: "至少需要 1 条核心覆盖知识点。",
    },
    {
      key: "evidence_traceability",
      status: hasEvidenceTraceability(plan) ? "pass" : "warning",
      note: "每个阶段都应说明要抓的证据与交付物。",
    },
    {
      key: "difficulty_scaffold_match",
      status: hasScaffoldMatch ? "pass" : "warning",
      note: "脚手架策略应与设定难度匹配。",
    },
    {
      key: "curriculum_code_standard",
      status: hasCurriculumCode ? "pass" : "warning",
      note: "建议使用规范的课标知识点编号。",
    },
    {
      key: "assessment_alignment",
      status: plan.assessments.length >= 4 ? "pass" : "warning",
      note: "评估节点应覆盖探索、中期执行和最终展示。",
    },
    {
      key: "resource_feasibility",
      status: plan.stages.every((s) => s.requiredResources.length > 0) ? "pass" : "warning",
      note: "所有阶段应列出可获取的资源。",
    },
    {
      key: "real_audience",
      status: hasRealAudience(plan) ? "pass" : "warning",
      note: "建议指定真实受众而非仅教师评分。",
    },
    {
      key: "teacher_guidance_actionability",
      status: hasTeacherActionability ? "pass" : "warning",
      note: "教师指导应具体到阶段、课时、检查点和处理动作。",
    },
    {
      key: "process_assessment_reflection",
      status: hasFormativeAssessment && hasReflection ? "pass" : "warning",
      note: "建议包含形成性评价和学生反思环节。",
    },
    {
      key: "rubric_dimensions",
      status: plan.rubric.length === 6 ? "pass" : "fail",
      note: "量规需覆盖六维度。",
    },
  ];
}

function buildPlanSummaryForAI(plan: PblPlan): string {
  const stagesSummary = plan.stages
    .map((s) => `  - ${s.stageType}（第${s.periodStart}-${s.periodEnd}课时）：${s.objective}\n    活动：${s.coreActivities.join("；")}`)
    .join("\n");

  const rubricSummary = plan.rubric
    .map((r) => `  - ${r.dimension}：${r.score5.slice(0, 40)}...`)
    .join("\n");

  return `# PBL 方案摘要
标题：${plan.title}
驱动问题：${plan.drivingQuestion}
概述：${plan.overviewText}
学科：${plan.primarySubject}（${plan.curriculumSystem}）
年级：${plan.grade}
难度：${plan.difficulty}
总课时：${plan.totalPeriods} 课时
成果形式：${plan.finalOutcomeForm}
成果要求：${plan.finalOutcomeRequirements}
受众：${plan.targetAudience}

## 阶段
${stagesSummary}

## 量规维度
${rubricSummary}

## 课标对齐
${plan.curriculumAlignment.map((a) => `  - ${a.knowledgePointCode}（${a.coverageType}）`).join("\n")}

## 素材引用数量：${plan.materialReferences.length}
## 评估节点数量：${plan.assessments.length}`;
}

async function qualityCheckWithAI(plan: PblPlan): Promise<PblQualityCheckItem[]> {
  const planSummary = buildPlanSummaryForAI(plan);
  const model = getResolvedLanguageModelForTask("pbl_quality_check");
  const userPrompt = `请对以下 PBL 方案执行 12 项质量检查：\n\n${planSummary}`;
  const toolSchema = pblQualityCheckToolSchema as {
    name: string;
    description?: string;
    input_schema: Record<string, unknown>;
  };

  const result = await generateStructuredObject({
    model,
    schema: aiQualityCheckResultSchema,
    systemPrompt: PBL_QUALITY_CHECK_PROMPT,
    userPrompt,
    maxTokens: 5000,
    temperature: 0,
  }).catch(async () => {
    const toolResult = await generateToolInputWithGateway<unknown>({
      model,
      systemPrompt: PBL_QUALITY_CHECK_PROMPT,
      userPrompt,
      tool: {
        name: toolSchema.name,
        description: toolSchema.description,
        inputSchema: toolSchema.input_schema,
      },
      maxTokens: 5000,
      temperature: 0,
    });

    return aiQualityCheckResultSchema.parse(toolResult.input);
  });

  return result.checks;
}

export async function qualityCheck(plan: PblPlan): Promise<PblQualityCheckItem[]> {
  return qualityCheckWithOptions(plan, { preferAi: true });
}

export async function qualityCheckWithOptions(
  plan: PblPlan,
  options: { preferAi?: boolean } = {},
): Promise<PblQualityCheckItem[]> {
  if (options.preferAi === false) {
    return qualityCheckTemplate(plan);
  }

  try {
    return await qualityCheckWithAI(plan);
  } catch (error) {
    console.warn("AI 质量检查失败，降级到规则检查", error);
    return qualityCheckTemplate(plan);
  }
}
