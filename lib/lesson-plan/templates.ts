import { randomUUID } from "crypto";
import type { CedTopicMatch, LessonPlanTemplateKind, OutlineResult, OutlineSection } from "@/lib/lesson-plan/types";

const TEMPLATE_SECTIONS: Record<LessonPlanTemplateKind, string[]> = {
  concept: [
    "导入情境",
    "概念定义",
    "原理展开",
    "例题演示",
    "理解检验",
    "小结与延伸",
  ],
  example: [
    "方法回顾",
    "基础题",
    "进阶题",
    "综合题",
    "变式练习",
    "方法总结",
  ],
  sprint: [
    "考点速览",
    "高频题型",
    "易错点警示",
    "限时模拟",
    "答题策略",
  ],
  inquiry: [
    "问题抛出",
    "引导探索",
    "概念浮现",
    "验证与反例",
    "形式化",
    "巩固 Quiz",
  ],
};

function buildSectionSummary(sectionTitle: string, topics: CedTopicMatch[]) {
  const topicTitle = topics[0]?.title ?? "核心主题";
  if (sectionTitle.includes("导入") || sectionTitle.includes("问题")) {
    return `用贴近学生经验的具体问题引入 ${topicTitle}，并要求学生口头给出已知条件与目标。`;
  }
  if (sectionTitle.includes("定义") || sectionTitle.includes("形式化")) {
    return `板书 ${topicTitle} 的正式定义与边界条件，再让学生用自己的话复述含义。`;
  }
  if (sectionTitle.includes("例题") || sectionTitle.includes("基础题") || sectionTitle.includes("进阶题") || sectionTitle.includes("综合题")) {
    return `围绕 ${topicTitle} 给出具体数值例题，按“识别-建模-计算-检验”逐步推导。`;
  }
  if (sectionTitle.toLowerCase().includes("quiz") || sectionTitle.includes("检验") || sectionTitle.includes("模拟")) {
    return `通过限时互动题检测学生对 ${topicTitle} 的掌握程度，并当堂解释错因。`;
  }
  return `围绕 ${topicTitle} 组织可执行教学动作（提问、板书、练习、反馈）。`;
}

function allocateDuration(totalMinutes: number, sectionCount: number) {
  const base = Math.floor(totalMinutes / sectionCount);
  const remainder = totalMinutes % sectionCount;
  return Array.from({ length: sectionCount }).map((_, index) => base + (index < remainder ? 1 : 0));
}

export function buildTemplateOutline(params: {
  templateKind: LessonPlanTemplateKind;
  topics: CedTopicMatch[];
  totalMinutes: number;
  titleHint: string;
}): OutlineResult {
  const sectionTitles = TEMPLATE_SECTIONS[params.templateKind];
  const durationList = allocateDuration(params.totalMinutes, sectionTitles.length);

  const sections: OutlineSection[] = sectionTitles.map((title, index) => ({
    id: randomUUID(),
    title: `${title}（${durationList[index]} 分钟）`,
    summary: buildSectionSummary(title, params.topics),
    durationMinutes: durationList[index],
    keyPoints: [
      params.topics[0]?.title ?? "核心知识点",
      params.topics[0]?.learningObjectives[0]?.code ?? "LO-1",
    ],
  }));

  return {
    title: params.titleHint,
    sections,
  };
}
