import type {
  CedTopicMatch,
  LessonPlanPreferences,
  LessonPlanSection,
} from "@/lib/lesson-plan/types";
import type { Course, Topic, Unit } from "@/types/curriculum";
import type { ExerciseAIOutput, ExerciseDifficulty } from "@/types/exercise";
import type { RubricDetailPayload } from "@/types/rubric";

type QualityDomain = "lesson_plan" | "exercise" | "rubric";
type QualityBand = "fail" | "edge" | "good" | "excellent";
type QualityRisk = "low" | "medium" | "high";

type RuleAssessment = {
  score: number;
  riskLevel: QualityRisk;
  boundary: boolean;
  fatal: boolean;
  summary: string;
  strengths: string[];
  issues: string[];
  referenceText: string;
  contentText: string;
};

export type QualityReviewResult = {
  score: number;
  band: QualityBand;
  bandLabel: string;
  summary: string;
  strengths: string[];
  issues: string[];
  riskLevel: QualityRisk;
  boundary: boolean;
};

export type LessonQualityReviewInput = {
  sourcePrompt: string;
  subject: { code: string; name: string };
  unit: { unitNumber: string; title: string };
  topics: CedTopicMatch[];
  preferences: LessonPlanPreferences;
  sections: LessonPlanSection[];
  outlineTitle?: string;
};

export type LessonSectionRuleIssue = {
  severity: "low" | "medium" | "high";
  message: string;
  suggestion: string;
};

export type LessonSectionRuleReviewInput = {
  sourcePrompt: string;
  section: LessonPlanSection;
  preferences: LessonPlanPreferences;
  topics: CedTopicMatch[];
};

export type LessonSectionRuleReviewResult = {
  score: number;
  issues: LessonSectionRuleIssue[];
  summary: string;
};

export type ExerciseQualityReviewInput = {
  course: Course;
  unit: Unit;
  topics: Topic[];
  teacherRequest?: string;
  exerciseType: "MC" | "FR" | "MIXED";
  difficulty: ExerciseDifficulty;
  exercises: Array<
    ExerciseAIOutput["exercises"][number] & {
      verificationStatus?: string;
      verificationAttempts?: number;
    }
  >;
};

export type RubricQualityReviewInput = {
  course: Course;
  unit: Unit | null;
  topics: Topic[];
  teacherRequest?: string;
  rubric: RubricDetailPayload;
};

const LESSON_VAGUE_WORDS = [
  "讲解",
  "理解",
  "掌握",
  "巩固",
  "加深理解",
  "介绍",
  "练习",
  "讨论",
  "复习",
  "总结",
];

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function isBoundaryScore(score: number) {
  return Math.abs(score - 60) <= 2 || Math.abs(score - 75) <= 2 || Math.abs(score - 90) <= 2;
}

function uniq(items: string[], maxItems = 8) {
  return Array.from(new Set(items.filter((item) => item.trim().length > 0))).slice(0, maxItems);
}

function collectText(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => collectText(item));
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) => collectText(item));
  }
  return [];
}

function compactJson(value: unknown, maxLength: number) {
  const raw = JSON.stringify(value);
  if (!raw) return "";
  if (raw.length <= maxLength) return raw;
  return `${raw.slice(0, maxLength)}...(truncated)`;
}

function normalizeQualityBand(score: number): QualityBand {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 60) return "edge";
  return "fail";
}

function bandLabel(domain: QualityDomain, band: QualityBand) {
  if (domain === "lesson_plan") {
    if (band === "excellent") return "示范优秀";
    if (band === "good") return "规范良好";
    if (band === "edge") return "合格边缘";
    return "不及格";
  }
  if (domain === "exercise") {
    if (band === "excellent") return "标杆题";
    if (band === "good") return "规范题";
    if (band === "edge") return "基础题";
    return "废题";
  }
  if (band === "excellent") return "标杆量规";
  if (band === "good") return "规范量规";
  if (band === "edge") return "基础量规";
  return "无效量规";
}

function resolveRiskLevel(score: number, fatal: boolean, boundary: boolean): QualityRisk {
  if (fatal || score < 65) return "high";
  if (boundary || score < 85) return "medium";
  return "low";
}

function parseExerciseType(raw: ExerciseAIOutput["exercises"][number]) {
  const fromType = raw.type;
  if (fromType === "MC" || fromType === "FR") return fromType;
  const fromQuestionType = raw.questionType ?? raw.question_type;
  if (fromQuestionType === "MCQ" || fromQuestionType === "MC") return "MC";
  if (fromQuestionType === "FRQ" || fromQuestionType === "FR") return "FR";
  return "FR";
}

function normalizeExerciseOptions(raw: ExerciseAIOutput["exercises"][number]["options"]) {
  if (!raw) return [] as Array<{ label: string; text: string; isCorrect: boolean }>;
  if (Array.isArray(raw)) {
    return raw
      .map((item) => ({
        label: item.label,
        text: item.text,
        isCorrect: item.isCorrect,
      }))
      .filter((item) => item.label && item.text);
  }
  return Object.entries(raw).map(([label, text]) => ({
    label,
    text: String(text ?? ""),
    isCorrect: false,
  }));
}

function escapeRegex(source: string) {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countHits(text: string, keyword: string) {
  if (!text) return 0;
  const pattern = new RegExp(escapeRegex(keyword), "gi");
  return (text.match(pattern) ?? []).length;
}

function containsNumericMathCue(text: string) {
  return /(\d|=|\+|-|\*|\/|\^|lim|f\(x\)|导数|积分|概率|方程)/i.test(text);
}

function containsTimeTag(text: string) {
  return /(\[|\(|（)?\s*\d+\s*(分钟|min|mins|秒)\s*(\]|\)|）)?/i.test(text);
}

function normalizedTextLength(text: string) {
  if (!text) return 0;
  return text.replace(/\s+/g, "").length;
}

function hasMisconceptionTripleFormat(text: string) {
  if (!text) return false;
  // 检测各种错误分析模式：错法/错因/正法、错误示例/错因/正确做法、错误：.../原因：.../正确：...
  return /(错法\s*[:：]|错因\s*[:：]|正法\s*[:：]|错误示例\s*[:：]|正确做法\s*[:：]|常见错误\s*[:：]|错误原因\s*[:：])/i.test(text);
}

function isFocusLessonSectionTitle(title: string) {
  return /原理|推导|例题|演示/.test(title);
}

function blockText(block: LessonPlanSection["blocks"][number]) {
  return collectText(block.content).join(" ");
}

function buildIssue(
  severity: LessonSectionRuleIssue["severity"],
  message: string,
  suggestion: string,
): LessonSectionRuleIssue {
  return { severity, message, suggestion };
}

export function reviewLessonSectionRule(
  input: LessonSectionRuleReviewInput,
): LessonSectionRuleReviewResult {
  const section = input.section;
  const blocks = section.blocks;
  const issues: LessonSectionRuleIssue[] = [];
  let score = 72;

  // 检测 block 内容重复
  const blockTexts = blocks.map((block) => {
    const text = blockText(block).trim();
    return text.length > 20 ? text : "";
  }).filter((text) => text.length > 0);

  const uniqueTexts = new Set(blockTexts);
  const duplicateCount = blockTexts.length - uniqueTexts.size;

  if (duplicateCount > 0) {
    score -= Math.min(30, duplicateCount * 10);
    issues.push(
      buildIssue(
        "high",
        `发现 ${duplicateCount} 个内容完全重复的 block。`,
        "每个 block 必须包含不同的内容，不能复制粘贴相同文本。请为每个 block 类型定制具体内容。",
      ),
    );
  }

  // 检测高度相似的内容（长度超过50字符且前50字符相同）
  const textPrefixes = blockTexts.map((text) => text.slice(0, 50));
  const prefixCounts = new Map<string, number>();
  for (const prefix of textPrefixes) {
    if (prefix.length >= 50) {
      prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
    }
  }
  const similarCount = Array.from(prefixCounts.values()).filter((count) => count > 1).length;

  if (similarCount > 0) {
    score -= Math.min(15, similarCount * 5);
    issues.push(
      buildIssue(
        "medium",
        `发现 ${similarCount} 组高度相似的 block 内容。`,
        "不同 block 的内容应该有明显差异，避免重复的开头或结构。",
      ),
    );
  }

  const exampleBlocks = blocks.filter((block) => block.type === "example");
  const misconceptionBlocks = blocks.filter(
    (block) => block.type === "callout" && block.subtype === "misconception",
  );
  const definitionBlocks = blocks.filter((block) => block.type === "definition");
  const stepsBlocks = blocks.filter((block) => block.type === "steps");
  const interactiveBlocks = blocks.filter(
    (block) => block.type === "quiz" || block.type === "poll" || block.type === "steps",
  );

  const exampleWithNumbers = exampleBlocks.filter((block) => {
    const prompt = String((block.content as Record<string, unknown>).prompt ?? "");
    return containsNumericMathCue(prompt);
  });
  const detailedExampleCount = exampleBlocks.filter((block) => {
    const steps = Array.isArray((block.content as Record<string, unknown>).steps)
      ? ((block.content as Record<string, unknown>).steps as unknown[])
      : [];
    return steps.length >= 5;
  }).length;

  const stepsItems = stepsBlocks.flatMap((block) => {
    const items = (block.content as Record<string, unknown>).items;
    return Array.isArray(items) ? items.map((item) => String(item ?? "")) : [];
  });
  const timedStepsCount = stepsItems.filter((item) => containsTimeTag(item)).length;
  const paragraphBlocks = blocks.filter((block) => block.type === "paragraph");

  // 检测“错法-错因-正法”格式污染：仅允许出现在 callout(misconception)
  const pollutedBlocks = blocks.filter((block) => {
    const isMisconceptionCallout =
      block.type === "callout" && block.subtype === "misconception";
    if (isMisconceptionCallout) return false;
    return hasMisconceptionTripleFormat(blockText(block));
  });
  if (pollutedBlocks.length > 0) {
    score -= 20;
    issues.push(
      buildIssue(
        "high",
        "\"错法-错因-正法\"格式出现在了非 misconception block 中。",
        "该格式只能在 callout(misconception) 中使用，其他 block 应描述正确的教学活动。",
      ),
    );
  }

  // 检测非 misconception block 中的错误分析内容泛滥
  const errorAnalysisPattern = /(错误|错因|正确做法|易错|误区|错误示例|常见错误)/g;
  const nonMiscBlocks = blocks.filter(
    (block) => !(block.type === "callout" && block.subtype === "misconception"),
  );
  const errorMentionCount = nonMiscBlocks.reduce((sum, block) => {
    const text = blockText(block);
    return sum + (text.match(errorAnalysisPattern) ?? []).length;
  }, 0);
  if (errorMentionCount > 3) {
    score -= Math.min(25, errorMentionCount * 3);
    issues.push(
      buildIssue(
        "high",
        `非 misconception block 中出现了 ${errorMentionCount} 次错误分析相关词汇。`,
        "paragraph/steps/definition/example 应聚焦于正面教学内容，错误分析仅限 callout(misconception) 使用。",
      ),
    );
  }

  // 检测 paragraph 内容过短
  const shortParagraphCount = paragraphBlocks.filter(
    (block) => normalizedTextLength(blockText(block)) < 80,
  ).length;
  if (shortParagraphCount > 0) {
    score -= Math.min(15, shortParagraphCount * 5);
    issues.push(
      buildIssue(
        shortParagraphCount > 3 ? "medium" : "low",
        `发现 ${shortParagraphCount} 个内容过短的 paragraph（< 80 字）。`,
        "paragraph 应该包含详细的教学活动描述，至少 80 字，重点内容至少 150 字。",
      ),
    );
  }

  // 检测 example.steps 过简
  const weakExamples = exampleBlocks.filter((block) => {
    const stepsRaw = Array.isArray((block.content as Record<string, unknown>).steps)
      ? ((block.content as Record<string, unknown>).steps as unknown[])
      : [];
    const steps = stepsRaw.map((item) => String(item ?? ""));
    if (steps.length < 5) return true;
    const avgStepLength =
      steps.length > 0
        ? steps.reduce((sum, item) => sum + normalizedTextLength(item), 0) / steps.length
        : 0;
    return avgStepLength < 20;
  });
  if (weakExamples.length > 0) {
    score -= Math.min(20, weakExamples.length * 10);
    issues.push(
      buildIssue(
        "high",
        `发现 ${weakExamples.length} 个推导步骤过简的 example。`,
        "example.steps 至少 5 步，每步至少 20 字，必须包含推理依据和预期结果。",
      ),
    );
  }

  // 检测重点章节内容详细度
  if (isFocusLessonSectionTitle(section.title)) {
    const paragraphAvgLength =
      paragraphBlocks.length > 0
        ? paragraphBlocks.reduce((sum, block) => sum + normalizedTextLength(blockText(block)), 0) /
          paragraphBlocks.length
        : 0;
    const allExampleSteps = exampleBlocks.flatMap((block) => {
      const steps = (block.content as Record<string, unknown>).steps;
      return Array.isArray(steps) ? steps.map((item) => String(item ?? "")) : [];
    });
    const exampleStepAvgLength =
      allExampleSteps.length > 0
        ? allExampleSteps.reduce((sum, item) => sum + normalizedTextLength(item), 0) /
          allExampleSteps.length
        : 0;

    if (paragraphAvgLength < 150 || exampleStepAvgLength < 25) {
      score -= 15;
      issues.push(
        buildIssue(
          "high",
          "重点章节内容详细度不足。",
          "原理/推导类章节的 paragraph 应至少 200 字，example 至少 7 步且每步至少 30 字。",
        ),
      );
    }
  }

  if (exampleBlocks.length === 0) {
    score -= 18;
    issues.push(
      buildIssue(
        "high",
        "缺少具体数学例题。",
        "至少加入 1 个 example block，题干包含具体数字/表达式，steps 不少于 5 步并解释推理理由。",
      ),
    );
  } else {
    score += 8;
    if (exampleBlocks.length >= 2) {
      score += 5;
    }
    if (exampleWithNumbers.length < exampleBlocks.length) {
      score -= 6;
      issues.push(
        buildIssue(
          "medium",
          "部分 example 题干缺少具体数字或数学表达。",
          "将 example.prompt 改为具体题目，例如“求 f(x)=(3x^2+5)^7 的导数”。",
        ),
      );
    }
    if (detailedExampleCount >= exampleBlocks.length) {
      score += 6;
    } else {
      score -= 5;
      issues.push(
        buildIssue(
          "medium",
          "example 推导步骤偏少，细节不足。",
          "把每个 example 的 steps 扩展到至少 5 步，逐步写清“公式-代入-运算-结论”。",
        ),
      );
    }
  }

  if (misconceptionBlocks.length >= 1) {
    score += 5;
  }

  const headingTexts = blocks
    .filter((block) => block.type === "heading")
    .map((block) => String((block.content as Record<string, unknown>).text ?? ""));
  const headingHasTime =
    headingTexts.some((text) => containsTimeTag(text)) || containsTimeTag(section.title);
  if (headingHasTime) {
    score += 5;
  } else {
    score -= 4;
    issues.push(
      buildIssue(
        "medium",
        "章节标题缺少时间标注。",
        "在 heading 或 section 标题中加入“（X 分钟）”。",
      ),
    );
  }

  if (stepsItems.length > 0) {
    if (timedStepsCount === stepsItems.length) {
      score += 6;
    } else if (timedStepsCount > 0) {
      score += 2;
      issues.push(
        buildIssue(
          "low",
          "部分互动步骤缺少时间标签。",
          "将 steps.items 统一写成“[X 分钟] 教师动作 + 学生反应 + 应对策略”。",
        ),
      );
    } else {
      score -= 4;
      issues.push(
        buildIssue(
          "medium",
          "互动步骤未标注时间。",
          "所有 steps.items 加入 [2 分钟] 等时间信息。",
        ),
      );
    }
  }

  if (interactiveBlocks.length === 0) {
    score -= 10;
    issues.push(
      buildIssue(
        "high",
        "缺少互动与检验环节。",
        "至少包含 quiz/poll/steps 之一，并设计可观察的学生产出。",
      ),
    );
  } else {
    score += 5;
    if (stepsItems.length >= 3) {
      score += 5;
    }
  }

  const paragraphAndHeadingText = blocks
    .filter((block) => block.type === "paragraph" || block.type === "heading")
    .map((block) => blockText(block))
    .join(" ");
  const vagueHits = LESSON_VAGUE_WORDS.reduce(
    (sum, item) => sum + countHits(paragraphAndHeadingText, item),
    0,
  );
  if (vagueHits > 0) {
    score -= Math.min(20, vagueHits * 2);
    issues.push(
      buildIssue(
        vagueHits > 10 ? "high" : "medium",
        `出现 ${vagueHits} 次泛化表述。`,
        "将“讲解/理解/巩固”等词替换为具体动作：提问、板书、计时练习、当堂反馈。",
      ),
    );
  }

  const hasThinkOrConnection = blocks.some(
    (block) =>
      block.type === "callout" && (block.subtype === "think" || block.subtype === "connection"),
  );
  if (input.preferences.studentLevel === "basic") {
    if (definitionBlocks.length === 0) {
      score -= 10;
      issues.push(
        buildIssue(
          "high",
          "基础层教案缺少 definition block。",
          "为基础层补充 definition block，给出准确定义+通俗解释+类比。",
        ),
      );
    }
    if (detailedExampleCount < exampleBlocks.length) {
      score -= 5;
      issues.push(
        buildIssue(
          "medium",
          "基础层示例步骤不够细。",
          "基础层 example 至少 5 步，并补充每步原因说明。",
        ),
      );
    }
  } else if (input.preferences.studentLevel === "medium") {
    if (!hasThinkOrConnection) {
      score -= 4;
      issues.push(
        buildIssue(
          "low",
          "中等层缺少引导性思考。",
          "增加 think callout，例如“为什么 h→0 而不是 h=0？”",
        ),
      );
    }
  } else {
    if (!hasThinkOrConnection) {
      score -= 10;
      issues.push(
        buildIssue(
          "high",
          "进阶层缺少深度思考或知识连接。",
          "增加 think/connection callout，要求学生解释跨概念联系或方法边界。",
        ),
      );
    }
  }

  score = clampScore(score);
  const summary =
    score >= 90
      ? "单节内容具体且可执行，达到示范级。"
      : score >= 75
        ? "单节结构规范，具备课堂可用性。"
        : score >= 60
          ? "单节处于及格边缘，建议按 issues 定向修补。"
          : "单节质量不达标，建议重生或使用 fallback。";

  return {
    score,
    issues,
    summary,
  };
}

function ruleOnlyReview(domain: QualityDomain, rule: RuleAssessment): QualityReviewResult {
  const band = normalizeQualityBand(rule.score);
  const boundary = isBoundaryScore(rule.score);
  return {
    score: rule.score,
    band,
    bandLabel: bandLabel(domain, band),
    summary: rule.summary,
    strengths: uniq(rule.strengths),
    issues: uniq(rule.issues, 10),
    riskLevel: resolveRiskLevel(rule.score, rule.fatal, boundary),
    boundary,
  };
}

function reviewLessonRule(input: LessonQualityReviewInput): RuleAssessment {
  const sections = input.sections;
  const allBlocks = sections.flatMap((section) => section.blocks);
  const totalDuration = sections.reduce((sum, section) => sum + section.durationMinutes, 0);
  const durationDiff = Math.abs(totalDuration - input.preferences.durationMinutes);
  const interactionSections = sections.filter((section) =>
    section.blocks.some((block) => block.type === "quiz" || block.type === "poll"),
  ).length;
  const misconceptionBlocks = allBlocks.filter(
    (block) => block.type === "callout" && (block.subtype === "misconception" || block.subtype === "warning"),
  ).length;
  const objectiveCodes = new Set(
    input.topics.flatMap((topic) => [
      ...topic.learningObjectives.map((item) => item.code),
      ...topic.essentialKnowledge.map((item) => item.code),
    ]),
  );
  const usedCedCodes = new Set(allBlocks.flatMap((block) => block.cedCodes));
  const coveredCodes = Array.from(usedCedCodes).filter((code) => objectiveCodes.has(code));
  const coverageRate = objectiveCodes.size > 0 ? coveredCodes.length / objectiveCodes.size : 0;
  const avgBlocksPerSection = sections.length > 0 ? allBlocks.length / sections.length : 0;
  const lessonText = [
    input.sourcePrompt,
    sections.map((section) => section.title).join(" "),
    sections.map((section) => section.summary).join(" "),
    collectText(allBlocks.map((block) => block.content)).join(" "),
  ].join(" ");

  const sectionAssessments = sections.map((section) =>
    reviewLessonSectionRule({
      sourcePrompt: input.sourcePrompt,
      section,
      preferences: input.preferences,
      topics: input.topics,
    }),
  );
  const avgSectionScore =
    sectionAssessments.length > 0
      ? sectionAssessments.reduce((sum, item) => sum + item.score, 0) / sectionAssessments.length
      : 0;
  const sectionHighIssueCount = sectionAssessments.reduce(
    (sum, item) => sum + item.issues.filter((issue) => issue.severity === "high").length,
    0,
  );
  const sectionIssueMessages = sectionAssessments
    .flatMap((item) =>
      item.issues.map((issue) => `${issue.message} 建议：${issue.suggestion}`),
    )
    .slice(0, 6);

  // 检测跨 section 的内容重复
  const allBlockTexts = allBlocks.map((block, index) => ({
    text: blockText(block).trim(),
    sectionIndex: sections.findIndex((s) => s.blocks.includes(block)),
    blockIndex: index,
    blockType: block.type,
  })).filter((item) => item.text.length > 30);

  const textToOccurrences = new Map<string, Array<{ sectionIndex: number; blockType: string }>>();
  for (const item of allBlockTexts) {
    const existing = textToOccurrences.get(item.text) ?? [];
    existing.push({ sectionIndex: item.sectionIndex, blockType: item.blockType });
    textToOccurrences.set(item.text, existing);
  }

  const crossSectionDuplicates = Array.from(textToOccurrences.entries())
    .filter(([, occurrences]) => {
      if (occurrences.length <= 1) return false;
      const sectionIndices = new Set(occurrences.map((o) => o.sectionIndex));
      return sectionIndices.size > 1; // 出现在不同 section 中
    });

  const crossSectionDuplicateCount = crossSectionDuplicates.length;
  let crossSectionDuplicateMessage = "";
  if (crossSectionDuplicateCount > 0) {
    const duplicateInfo = crossSectionDuplicates.slice(0, 2).map(([text, occurrences]) => {
      const sectionTitles = Array.from(new Set(occurrences.map((o) => o.sectionIndex)))
        .map((idx) => sections[idx]?.title ?? "未知章节")
        .join("、");
      return `"${text.slice(0, 30)}..."出现在【${sectionTitles}】`;
    }).join("；");
    crossSectionDuplicateMessage = `发现 ${crossSectionDuplicateCount} 处跨章节内容完全重复：${duplicateInfo}。不同章节必须生成不同内容。`;
  }

  const exampleBlocks = allBlocks.filter((block) => block.type === "example");
  const detailedExampleBlocks = exampleBlocks.filter((block) => {
    const steps = Array.isArray((block.content as Record<string, unknown>).steps)
      ? ((block.content as Record<string, unknown>).steps as unknown[])
      : [];
    return steps.length >= 5;
  });
  const numericExamples = exampleBlocks.filter((block) => {
    const prompt = String((block.content as Record<string, unknown>).prompt ?? "");
    return containsNumericMathCue(prompt);
  });

  const headingTimeCount = sections.filter((section) => {
    const sectionHeadingTexts = section.blocks
      .filter((block) => block.type === "heading")
      .map((block) => String((block.content as Record<string, unknown>).text ?? ""));
    return containsTimeTag(section.title) || sectionHeadingTexts.some((text) => containsTimeTag(text));
  }).length;
  const stepsItems = allBlocks
    .filter((block) => block.type === "steps")
    .flatMap((block) => {
      const items = (block.content as Record<string, unknown>).items;
      return Array.isArray(items) ? items.map((item) => String(item ?? "")) : [];
    });
  const timedStepsCount = stepsItems.filter((item) => containsTimeTag(item)).length;

  const vagueText = [
    sections.map((section) => section.title).join(" "),
    sections.map((section) => section.summary).join(" "),
    allBlocks
      .filter((block) => block.type === "paragraph" || block.type === "heading")
      .map((block) => blockText(block))
      .join(" "),
  ].join(" ");
  const vagueWordHits = LESSON_VAGUE_WORDS.reduce((sum, word) => sum + countHits(vagueText, word), 0);

  const fatalReasons: string[] = [];
  if (sections.length < 3) {
    fatalReasons.push("章节数量不足，教学环节不完整。");
  }
  if (sections.some((section) => section.durationMinutes <= 0 || section.blocks.length === 0)) {
    fatalReasons.push("存在空章节或时长异常，流程断裂。");
  }
  if (coverageRate < 0.1 && !/(目标|objective|learning outcome|lo\b)/i.test(lessonText)) {
    fatalReasons.push("缺少可追踪教学目标。");
  }
  if (
    interactionSections === 0 &&
    misconceptionBlocks === 0 &&
    !/(学生|student|互动|讨论|pair|group|quiz|assessment)/i.test(lessonText)
  ) {
    fatalReasons.push("教学活动以教师单向输出为主，缺少学生任务。");
  }
  if (exampleBlocks.length === 0) {
    fatalReasons.push("缺少具体数学例题。");
  }
  // misconception 不再作为 fatal reason，降级为普通建议
  if (crossSectionDuplicateCount >= 3) {
    fatalReasons.push(crossSectionDuplicateMessage);
  }

  const strengths: string[] = [];
  const issues: string[] = [];
  let score = 70;

  if (fatalReasons.length > 0) {
    score = 40 + Math.max(0, 15 - fatalReasons.length * 4);
    issues.push(...fatalReasons);
  } else {
    if (sections.length >= 5) {
      score += 6;
      strengths.push("章节结构完整。");
    } else if (sections.length >= 4) {
      score += 3;
    }

    if (coverageRate >= 0.75) {
      score += 12;
      strengths.push("CED 目标覆盖充分。");
    } else if (coverageRate >= 0.45) {
      score += 7;
      strengths.push("CED 目标覆盖中等。");
    } else if (coverageRate >= 0.2) {
      score += 2;
      issues.push("CED 对齐深度不足。");
    } else {
      score -= 10;
      issues.push("CED 对齐明显不足。");
    }

    if (avgBlocksPerSection >= 3.2) {
      score += 6;
    } else if (avgBlocksPerSection < 2) {
      score -= 8;
      issues.push("章节内容过薄，难以支撑课堂。");
    }

    if (interactionSections >= 2) {
      score += 8;
      strengths.push("形成了嵌入式课堂评价。");
    } else if (interactionSections === 1) {
      score += 3;
      issues.push("课堂评价触点偏少。");
    } else {
      score -= 6;
      issues.push("缺少课堂检测或互动反馈。");
    }

    if (misconceptionBlocks >= 1) {
      score += 6;
      strengths.push("对学生易错点有预判。");
    }

    if (crossSectionDuplicateCount > 0 && crossSectionDuplicateCount < 3) {
      score -= Math.min(25, crossSectionDuplicateCount * 12);
      issues.push(crossSectionDuplicateMessage);
    }

    if (exampleBlocks.length >= 1) {
      score += 10;
      strengths.push("包含具体数学例题。");
    }
    if (exampleBlocks.length >= 2) {
      score += 5;
    }
    if (detailedExampleBlocks.length === exampleBlocks.length && exampleBlocks.length > 0) {
      score += 5;
      strengths.push("例题推导步骤较完整。");
    } else if (exampleBlocks.length > 0) {
      score -= 4;
      issues.push("例题推导步骤偏少，建议每题至少 5 步。");
    }
    if (numericExamples.length < exampleBlocks.length) {
      score -= 5;
      issues.push("部分例题题干缺少具体数字或表达式。");
    }

    if (headingTimeCount > 0) {
      score += 5;
    } else {
      score -= 5;
      issues.push("章节标题缺少时间分配信息。");
    }
    if (headingTimeCount === sections.length && sections.length > 0) {
      score += 5;
      strengths.push("全部章节标注了时间分配。");
    }
    if (stepsItems.length > 0 && timedStepsCount === stepsItems.length) {
      score += 5;
    } else if (stepsItems.length > 0 && timedStepsCount > 0) {
      score += 2;
    } else if (stepsItems.length > 0) {
      score -= 4;
      issues.push("互动步骤缺少时间标注。");
    }

    if (vagueWordHits > 0) {
      score -= Math.min(20, vagueWordHits * 2);
      issues.push(`使用了 ${vagueWordHits} 次泛化表述，应替换为具体动作。`);
    }

    if (avgSectionScore >= 85) {
      score += 8;
      strengths.push("分节内容具体、可执行性较强。");
    } else if (avgSectionScore >= 70) {
      score += 3;
    } else if (avgSectionScore < 60) {
      score -= 10;
      issues.push("多节内容具体性不足，存在上课可执行风险。");
    }
    if (sectionHighIssueCount > 0) {
      score -= Math.min(12, sectionHighIssueCount * 3);
      issues.push(`存在 ${sectionHighIssueCount} 个高风险分节问题。`);
    }

    if (input.preferences.studentLevel === "basic") {
      const hasDefinition = allBlocks.some((block) => block.type === "definition");
      if (!hasDefinition) {
        score -= 10;
        issues.push("基础层教案缺少 definition block。");
      }
      if (detailedExampleBlocks.length < exampleBlocks.length) {
        score -= 5;
        issues.push("基础层示例步骤不够细。");
      }
    } else if (input.preferences.studentLevel === "medium") {
      const hasThink = allBlocks.some(
        (block) => block.type === "callout" && block.subtype === "think",
      );
      if (!hasThink) {
        score -= 5;
        issues.push("中等层教案建议补充 think callout。");
      }
    } else {
      const hasDeepThink = allBlocks.some(
        (block) =>
          block.type === "callout" &&
          (block.subtype === "think" || block.subtype === "connection"),
      );
      if (!hasDeepThink) {
        score -= 10;
        issues.push("进阶层教案缺少 think/connection callout。");
      }
    }

    if (durationDiff <= 5) {
      score += 4;
    } else if (durationDiff <= 12) {
      score += 1;
    } else {
      score -= 6;
      issues.push("总时长与目标课时偏差较大。");
    }

    if (
      coverageRate >= 0.7 &&
      interactionSections >= 2 &&
      misconceptionBlocks >= 1 &&
      /(评价|assessment|检测|rubric|exit ticket)/i.test(lessonText)
    ) {
      score += 8;
    }
  }

  score = clampScore(score);
  const boundary = isBoundaryScore(score);
  const riskLevel = resolveRiskLevel(score, fatalReasons.length > 0, boundary);
  const band = normalizeQualityBand(score);
  const summary =
    fatalReasons.length > 0
      ? "教案存在基础结构风险，暂不建议直接上课。"
      : band === "excellent"
        ? "教案达到示范层，目标、过程和评价联动明显。"
        : band === "good"
          ? "教案结构规范，可用性较好，但亮点和区分度仍可提升。"
          : band === "edge"
            ? "教案处于及格边缘，需补强目标对齐和课堂任务设计。"
            : "教案质量不达标，需要重建核心教学环节。";

  const preview = {
    title: input.outlineTitle,
    sections: sections.map((section) => ({
      id: section.id,
      title: section.title,
      summary: section.summary,
      durationMinutes: section.durationMinutes,
      blockTypes: section.blocks.map((block) => block.type),
      blocks: section.blocks.slice(0, 8).map((block) => ({
        type: block.type,
        subtype: block.subtype,
        cedCodes: block.cedCodes,
        contentPreview: compactJson(block.content, 180),
      })),
    })),
  };

  const referenceText = [
    `课程：${input.subject.name} (${input.subject.code})`,
    `单元：Unit ${input.unit.unitNumber} - ${input.unit.title}`,
    `课时：${input.preferences.durationMinutes} 分钟`,
    `主题：${input.topics.map((topic) => `${topic.topicNumber} ${topic.title}`).join(" | ")}`,
    `LO/EK：${input.topics
      .flatMap((topic) => [
        ...topic.learningObjectives.map((item) => item.code),
        ...topic.essentialKnowledge.map((item) => item.code),
      ])
      .slice(0, 24)
      .join(", ")}`,
  ].join("\n");

  return {
    score,
    riskLevel,
    boundary,
    fatal: fatalReasons.length > 0,
    summary,
    strengths: uniq(strengths),
    issues: uniq([...issues, ...fatalReasons, ...sectionIssueMessages], 10),
    referenceText,
    contentText: compactJson(preview, 12000),
  };
}

function reviewExerciseRule(input: ExerciseQualityReviewInput): RuleAssessment {
  const exercises = input.exercises;
  const strengths: string[] = [];
  const issues: string[] = [];
  let severeIssues = 0;
  let mcValidCount = 0;
  let clearPromptCount = 0;
  let solidSolutionCount = 0;
  let loEkCoverageCount = 0;
  let commonMistakeCount = 0;

  for (const exercise of exercises) {
    const questionText = exercise.questionText ?? exercise.stem ?? "";
    const solution = exercise.solutionSteps ?? exercise.solution ?? "";
    const type = parseExerciseType(exercise);
    const loEkCount = (exercise.loIds?.length ?? 0) + (exercise.lo_ids?.length ?? 0) + (exercise.ekIds?.length ?? 0) + (exercise.ek_ids?.length ?? 0);

    if (questionText.trim().length >= 18) clearPromptCount += 1;
    if (solution.trim().length >= 45) solidSolutionCount += 1;
    if (loEkCount > 0) loEkCoverageCount += 1;
    if ((exercise.commonMistakes?.length ?? 0) > 0) commonMistakeCount += 1;

    if (!questionText.trim() || !solution.trim()) {
      severeIssues += 1;
      issues.push("存在题干或解析缺失。");
      continue;
    }

    if (type === "MC") {
      const options = normalizeExerciseOptions(exercise.options);
      const uniqueOptionText = new Set(options.map((item) => item.text.trim().toLowerCase()));
      const correctAnswer = (exercise.correctAnswer ?? exercise.correct_answer ?? "").trim();
      const labeledCorrectCount = options.filter((item) => item.isCorrect).length;
      const hasCorrectByLabel = options.some((item) => item.label === correctAnswer);
      const distractorTexts = options
        .filter((item) => item.label !== correctAnswer && !item.isCorrect)
        .map((item) => item.text.trim());

      const valid =
        options.length === 4 &&
        uniqueOptionText.size === 4 &&
        (labeledCorrectCount === 1 || hasCorrectByLabel) &&
        distractorTexts.length >= 2 &&
        distractorTexts.every((text) => text.length >= 3);

      if (valid) {
        mcValidCount += 1;
      } else {
        severeIssues += 1;
        issues.push("选择题选项结构或干扰项质量不足。");
      }
    }
  }

  const total = Math.max(1, exercises.length);
  const clearRate = clearPromptCount / total;
  const solutionRate = solidSolutionCount / total;
  const loEkRate = loEkCoverageCount / total;
  const commonMistakeRate = commonMistakeCount / total;
  const mcRate =
    exercises.filter((exercise) => parseExerciseType(exercise) === "MC").length > 0
      ? mcValidCount /
        Math.max(
          1,
          exercises.filter((exercise) => parseExerciseType(exercise) === "MC").length,
        )
      : 1;

  let score = 72;
  if (severeIssues > 0) {
    score = 58 - Math.min(18, severeIssues * 4);
  } else {
    if (clearRate >= 0.85) {
      score += 8;
      strengths.push("题干指令清晰，学生可快速理解任务。");
    } else if (clearRate < 0.6) {
      score -= 8;
      issues.push("题干表达偏绕，阅读负担较高。");
    }

    if (solutionRate >= 0.8) {
      score += 7;
      strengths.push("解析完整度较高。");
    } else if (solutionRate < 0.5) {
      score -= 7;
      issues.push("解析过短，支撑教学复盘不足。");
    }

    if (mcRate >= 0.85) {
      score += 8;
      strengths.push("选择题干扰项设计较有效。");
    } else if (mcRate < 0.6) {
      score -= 8;
      issues.push("选择题干扰项区分度不足。");
    }

    if (loEkRate >= 0.6) {
      score += 6;
    } else if (loEkRate < 0.3) {
      score -= 4;
      issues.push("题目与单元 LO/EK 的显式关联不足。");
    }

    if (commonMistakeRate >= 0.5) {
      score += 4;
    }

    if (mcRate >= 0.85 && solutionRate >= 0.85 && loEkRate >= 0.6) {
      score += 8;
    }
  }

  score = clampScore(score);
  const boundary = isBoundaryScore(score);
  const riskLevel = resolveRiskLevel(score, severeIssues > 0, boundary);
  const band = normalizeQualityBand(score);
  const summary =
    severeIssues > 0
      ? "题目存在结构性缺陷，建议拦截重生。"
      : band === "excellent"
        ? "题组达到标杆层，具备明显测能力特征。"
        : band === "good"
          ? "题组规范可用，但仍偏模板化。"
          : band === "edge"
            ? "题组勉强可用，需修复干扰项与解析深度。"
            : "题组质量不达标，建议直接淘汰。";

  const preview = {
    requestedType: input.exerciseType,
    requestedDifficulty: input.difficulty,
    count: exercises.length,
    exercises: exercises.map((exercise, index) => ({
      index: index + 1,
      type: parseExerciseType(exercise),
      questionText: (exercise.questionText ?? exercise.stem ?? "").slice(0, 260),
      correctAnswer: exercise.correctAnswer ?? exercise.correct_answer ?? "",
      solution: (exercise.solutionSteps ?? exercise.solution ?? "").slice(0, 320),
      options: normalizeExerciseOptions(exercise.options),
      loIds: exercise.loIds ?? exercise.lo_ids ?? [],
      ekIds: exercise.ekIds ?? exercise.ek_ids ?? [],
    })),
  };

  const referenceText = [
    `课程：${input.course.name} (${input.course.code})`,
    `单元：Unit ${input.unit.unitNumber} - ${input.unit.title}`,
    `目标题型：${input.exerciseType}`,
    `目标难度：${input.difficulty}`,
    `主题：${input.topics.map((topic) => `${topic.topicNumber} ${topic.title}`).join(" | ")}`,
    input.teacherRequest ? `教师要求：${input.teacherRequest}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    score,
    riskLevel,
    boundary,
    fatal: severeIssues > 0,
    summary,
    strengths: uniq(strengths),
    issues: uniq(issues, 10),
    referenceText,
    contentText: compactJson(preview, 12000),
  };
}

function normalizeRubricLevelDescription(
  rubric: RubricDetailPayload,
  levelName: "excellent" | "good" | "passing" | "failing",
) {
  return rubric.dimensions.map((dimension) => {
    const level = dimension.levels.find((item) => item.level === levelName);
    return level?.description ?? "";
  });
}

function reviewRubricRule(input: RubricQualityReviewInput): RuleAssessment {
  const dimensions = input.rubric.dimensions ?? [];
  const strengths: string[] = [];
  const issues: string[] = [];
  const severeIssues: string[] = [];

  if (dimensions.length < 3) {
    severeIssues.push("维度数量不足，无法覆盖核心表现。");
  }

  const rawWeightSum = dimensions.reduce((sum, item) => sum + (item.weight ?? 0), 0);
  const normalizedWeightSum =
    rawWeightSum > 0 && rawWeightSum <= 1.5 ? rawWeightSum * 100 : rawWeightSum;
  if (rawWeightSum <= 0) {
    severeIssues.push("维度权重异常。");
  }

  const levelNames: Array<"excellent" | "good" | "passing" | "failing"> = [
    "excellent",
    "good",
    "passing",
    "failing",
  ];
  let observableCount = 0;
  let totalLevelDescriptions = 0;
  let genericCount = 0;
  let progressionGoodCount = 0;

  const genericPattern = /(理解充分|分析到位|表现较好|表现很好|认真思考|态度良好|比较完整)/i;
  const observablePattern =
    /(解释|证明|比较|计算|建模|推导|识别|应用|justify|compute|analyze|model|derive|evaluate|compare)/i;

  for (const dimension of dimensions) {
    const levelsByName = new Map(dimension.levels.map((item) => [item.level, item.description]));
    const missingLevel = levelNames.some((name) => !levelsByName.get(name)?.trim());
    if (missingLevel) {
      severeIssues.push(`维度“${dimension.name}”等级描述不完整。`);
      continue;
    }

    const excellent = levelsByName.get("excellent") ?? "";
    const good = levelsByName.get("good") ?? "";
    const passing = levelsByName.get("passing") ?? "";
    const failing = levelsByName.get("failing") ?? "";

    if (
      excellent.trim() !== good.trim() &&
      good.trim() !== passing.trim() &&
      passing.trim() !== failing.trim() &&
      excellent.length >= good.length - 8 &&
      good.length >= passing.length - 8
    ) {
      progressionGoodCount += 1;
    }

    for (const text of [excellent, good, passing, failing]) {
      totalLevelDescriptions += 1;
      if (observablePattern.test(text)) {
        observableCount += 1;
      }
      if (genericPattern.test(text)) {
        genericCount += 1;
      }
    }
  }

  const dimensionNameSet = new Set(dimensions.map((item) => item.name.trim().toLowerCase()));
  if (dimensionNameSet.size < dimensions.length) {
    issues.push("存在重复或高度重叠的维度命名。");
  }

  let score = 70;
  if (severeIssues.length > 0) {
    score = 55 - Math.min(18, severeIssues.length * 4);
  } else {
    if (Math.abs(normalizedWeightSum - 100) <= 2) {
      score += 10;
      strengths.push("权重分配清晰且总和合理。");
    } else if (Math.abs(normalizedWeightSum - 100) <= 8) {
      score += 4;
      issues.push("权重总和接近 100，但仍需校准。");
    } else {
      score -= 8;
      issues.push("权重体系不稳定。");
    }

    const observableRate = totalLevelDescriptions > 0 ? observableCount / totalLevelDescriptions : 0;
    if (observableRate >= 0.65) {
      score += 8;
      strengths.push("等级描述以可观察表现为主。");
    } else if (observableRate < 0.35) {
      score -= 8;
      issues.push("等级描述过于抽象，不利于实操评分。");
    }

    if (progressionGoodCount >= Math.ceil(dimensions.length * 0.7)) {
      score += 8;
      strengths.push("等级区分度较好。");
    } else {
      score -= 5;
      issues.push("等级之间区分度偏弱。");
    }

    if (genericCount <= Math.floor(totalLevelDescriptions * 0.15)) {
      score += 5;
    } else {
      score -= 8;
      issues.push("泛化措辞偏多（如“理解充分/分析到位”）。");
    }

    const unitKeywords = [
      input.unit?.title ?? "",
      ...input.topics.map((topic) => topic.title),
    ]
      .join(" ")
      .toLowerCase();
    const rubricText = [
      input.rubric.title,
      ...dimensions.map((item) => `${item.name} ${item.description}`),
      ...normalizeRubricLevelDescription(input.rubric, "excellent"),
    ]
      .join(" ")
      .toLowerCase();
    if (unitKeywords && unitKeywords.split(/\s+/).some((word) => word.length > 3 && rubricText.includes(word))) {
      score += 5;
      strengths.push("量规与单元语境结合较紧密。");
    } else {
      issues.push("量规学科/单元辨识度一般。");
    }

    if (
      Math.abs(normalizedWeightSum - 100) <= 2 &&
      progressionGoodCount >= dimensions.length - 1 &&
      genericCount === 0
    ) {
      score += 8;
    }
  }

  score = clampScore(score);
  const boundary = isBoundaryScore(score);
  const riskLevel = resolveRiskLevel(score, severeIssues.length > 0, boundary);
  const band = normalizeQualityBand(score);
  const summary =
    severeIssues.length > 0
      ? "量规存在结构性缺陷，当前版本不可直接用于评分。"
      : band === "excellent"
        ? "量规具备较高可用性与区分度，可作为示范模板。"
        : band === "good"
          ? "量规规范完整，但细粒度行为描述仍可加强。"
          : band === "edge"
            ? "量规仅基础可用，信度和可观察性不足。"
            : "量规无效，建议重建。";

  const preview = {
    title: input.rubric.title,
    dimensions: dimensions.map((dimension) => ({
      name: dimension.name,
      description: dimension.description,
      weight: dimension.weight,
      levels: dimension.levels.map((level) => ({
        level: level.level,
        score: level.score,
        description: level.description,
      })),
    })),
  };

  const referenceText = [
    `课程：${input.course.name} (${input.course.code})`,
    input.unit ? `单元：Unit ${input.unit.unitNumber} - ${input.unit.title}` : "单元：未指定",
    `主题：${input.topics.map((topic) => `${topic.topicNumber} ${topic.title}`).join(" | ")}`,
    input.teacherRequest ? `教师要求：${input.teacherRequest}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    score,
    riskLevel,
    boundary,
    fatal: severeIssues.length > 0,
    summary,
    strengths: uniq(strengths),
    issues: uniq([...issues, ...severeIssues], 10),
    referenceText,
    contentText: compactJson(preview, 12000),
  };
}

export function reviewLessonPlanGeneration(input: LessonQualityReviewInput) {
  return ruleOnlyReview("lesson_plan", reviewLessonRule(input));
}

export function reviewExerciseGeneration(input: ExerciseQualityReviewInput) {
  return ruleOnlyReview("exercise", reviewExerciseRule(input));
}

export function reviewExerciseRuleOnly(input: ExerciseQualityReviewInput) {
  return ruleOnlyReview("exercise", reviewExerciseRule(input));
}

export function reviewRubricGeneration(input: RubricQualityReviewInput) {
  return ruleOnlyReview("rubric", reviewRubricRule(input));
}

export function reviewRubricRuleOnly(input: RubricQualityReviewInput) {
  return ruleOnlyReview("rubric", reviewRubricRule(input));
}
