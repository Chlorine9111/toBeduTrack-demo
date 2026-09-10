import type { UploadedMaterial } from "@/lib/lesson-plan/material-parser";
import type { MaterialDigest } from "@/lib/lesson-plan/material-digest";
import type { WebEnrichmentResult } from "@/lib/lesson-plan/web-enrichment";
import type { CedObjective, CedTopicMatch } from "@/lib/lesson-plan/types";

type CurriculumTopic = Awaited<
  ReturnType<typeof import("@/lib/curriculum/loader").loadUnitWithTopics>
>["topics"][number];

export function buildAugmentedSourcePrompt(params: {
  sourcePrompt: string;
  materials: UploadedMaterial[];
  digest: MaterialDigest | null;
  web: WebEnrichmentResult | null;
}): string {
  const parts: string[] = [params.sourcePrompt];

  if (params.materials.length > 0) {
    parts.push(
      [
        "【教师上传原始材料】",
        ...params.materials.map((item) => `- ${item.fileName} (${item.fileType})`),
      ].join("\n"),
    );
  }

  if (params.digest) {
    parts.push(
      [
        "【材料提炼结果（自动）】",
        `关键知识点：${params.digest.keyKnowledgePoints.join("；")}`,
        `课堂目标：${params.digest.classroomGoals.join("；")}`,
        `常见误区：${params.digest.misconceptions.join("；") || "无"}`,
        `分层建议：${params.digest.differentiatedSupport.join("；") || "无"}`,
        "重点引用片段：",
        ...params.digest.materialHighlights.map(
          (item) => `- ${item.source}：${item.snippet}（用途：${item.whyImportant}）`,
        ),
      ].join("\n"),
    );
  }

  if (params.web) {
    parts.push(
      [
        "【联网补充（自动）】",
        params.web.summary,
        "可引用来源：",
        ...params.web.references.map((item) => `- ${item.title} ${item.url}`),
      ].join("\n"),
    );
  }

  parts.push(
    [
      "【硬性输出要求】",
      "请确保生成教案完整覆盖并明确体现以下结构：",
      "1) 教学目标（可测量）",
      "2) 课时安排（含分钟分配）",
      "3) 导入活动",
      "4) 核心讲解逻辑",
      "5) 课堂互动环节",
      "6) 练习与评估",
      "7) 分层教学建议（基础/中等/进阶）",
      "要求：优先使用上传材料，再融合联网信息，禁止堆砌式罗列。",
    ].join("\n"),
  );

  return parts.join("\n\n");
}

export function buildQuickTopic(unitNumber: string, unitId?: string): CedTopicMatch {
  const learningObjectives: CedObjective[] = [
    {
      code: `U${unitNumber}-LO1`,
      description: "识别核心概念并解释其教学价值。",
    },
    {
      code: `U${unitNumber}-LO2`,
      description: "在课堂任务中应用知识并给出完整推理。",
    },
  ];

  const essentialKnowledge: CedObjective[] = [
    {
      code: `U${unitNumber}-EK1`,
      description: "掌握定义、边界条件与常见误区。",
    },
    {
      code: `U${unitNumber}-EK2`,
      description: "能够在图像、符号与案例中迁移应用。",
    },
  ];

  return {
    id: unitId ? `${unitId}-topic-1` : `unit-${unitNumber}-topic-1`,
    topicNumber: `${unitNumber}.1`,
    title: `Unit ${unitNumber} 核心知识点`,
    learningObjectives,
    essentialKnowledge,
  };
}

export function toCedTopicFromCurriculum(topic: CurriculumTopic): CedTopicMatch {
  return {
    id: topic.id,
    topicNumber: topic.topicNumber,
    title: topic.title,
    learningObjectives: topic.learningObjectives,
    essentialKnowledge: topic.essentialKnowledge,
  };
}
