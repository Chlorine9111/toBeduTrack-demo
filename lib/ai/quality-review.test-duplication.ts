import { describe, it, expect } from "vitest";
import { reviewLessonSectionRule, reviewLessonPlanGeneration } from "./quality-review";
import type { LessonPlanSection, CedTopicMatch, LessonPlanPreferences } from "@/lib/lesson-plan/types";

const mockPreferences: LessonPlanPreferences = {
  durationMinutes: 45,
  studentLevel: "medium",
  languagePref: "bilingual",
  templateKind: "concept",
  quizDensity: "medium",
  explanationDepth: "standard",
  includeExtension: false,
  showCedCodes: true,
  includeTeacherNotes: true,
};

const mockTopics: CedTopicMatch[] = [
  {
    id: "topic-1",
    topicNumber: "2.1",
    title: "Defining Average and Instantaneous Rates of Change",
    learningObjectives: [
      { code: "LO-2.1.A", description: "Calculate average rates of change" },
    ],
    essentialKnowledge: [
      { code: "EK-2.1.A.1", description: "Average rate of change is slope of secant line" },
    ],
  },
];

let blockIdCounter = 0;
function makeBlock(
  type: string,
  content: Record<string, unknown>,
  subtype?: string,
) {
  blockIdCounter += 1;
  return {
    id: `block-${blockIdCounter}`,
    type: type as "paragraph" | "heading" | "example" | "callout",
    subtype: subtype as "misconception" | undefined,
    sortOrder: blockIdCounter,
    content,
    cedCodes: [] as string[],
  };
}

describe("内容重复检测", () => {
  beforeEach(() => {
    blockIdCounter = 0;
  });

  it("应该检测出单 section 内完全重复的 block 内容", () => {
    const duplicateText =
      "Teacher: 先用一个具体问题引入 Defining Average and Instantaneous Rates of Change at a Point...";

    const section: LessonPlanSection = {
      id: "section-1",
      title: "导入情境（8 分钟）",
      summary: "通过具体问题引入",
      durationMinutes: 8,
      sortOrder: 0,
      blocks: [
        makeBlock("paragraph", { text: duplicateText }),
        makeBlock("paragraph", { text: duplicateText }),
        makeBlock("paragraph", { text: "这是不同的内容，用于测试" }),
      ],
    };

    const result = reviewLessonSectionRule({
      sourcePrompt: "生成教案",
      section,
      preferences: mockPreferences,
      topics: mockTopics,
    });

    expect(result.score).toBeLessThan(72);
    expect(result.issues.some((issue) => issue.message.includes("内容完全重复"))).toBe(true);
  });

  it("应该检测出跨 section 的重复内容", async () => {
    const duplicateText =
      "Teacher: 先用一个具体问题引入 Defining Average and Instantaneous Rates of Change at a Point...";

    const sections: LessonPlanSection[] = [
      {
        id: "section-1",
        title: "导入情境（8 分钟）",
        summary: "引入概念",
        durationMinutes: 8,
        sortOrder: 0,
        blocks: [makeBlock("paragraph", { text: duplicateText })],
      },
      {
        id: "section-2",
        title: "概念定义（8 分钟）",
        summary: "定义核心概念",
        durationMinutes: 8,
        sortOrder: 1,
        blocks: [makeBlock("paragraph", { text: duplicateText })],
      },
      {
        id: "section-3",
        title: "原理展开（10 分钟）",
        summary: "展开推导",
        durationMinutes: 10,
        sortOrder: 2,
        blocks: [makeBlock("paragraph", { text: duplicateText })],
      },
    ];

    const result = await reviewLessonPlanGeneration({
      sourcePrompt: "生成 AP Calculus 教案",
      subject: {
        code: "AP-CALC-AB",
        name: "AP Calculus AB",
      },
      unit: {
        unitNumber: "2",
        title: "Differentiation: Definition and Fundamental Properties",
      },
      topics: mockTopics,
      preferences: mockPreferences,
      sections,
      outlineTitle: "测试教案",
    });

    expect(result.score).toBeLessThan(60);
    expect(result.issues.some((issue) => issue.includes("跨章节内容"))).toBe(true);
  });

  it("对于没有重复的内容应该正常打分", () => {
    const section: LessonPlanSection = {
      id: "section-1",
      title: "导入情境（8 分钟）",
      summary: "通过具体问题引入",
      durationMinutes: 8,
      sortOrder: 0,
      blocks: [
        makeBlock("heading", { level: 2, text: "导入情境（8 分钟）" }),
        makeBlock("paragraph", {
          text: "Teacher: 我们今天要学习平均变化率和瞬时变化率。请同学们思考：汽车的速度表显示的是什么速度？",
        }),
        makeBlock("example", {
          prompt: "一辆汽车在 t=2s 时位置为 s(2)=4m，在 t=5s 时位置为 s(5)=25m。求平均速度。",
          steps: [
            "写出平均速度公式：v_avg = Δs/Δt",
            "计算位移：Δs = s(5) - s(2) = 25 - 4 = 21m",
            "计算时间：Δt = 5 - 2 = 3s",
            "代入公式：v_avg = 21/3 = 7 m/s",
            "结论：汽车在这段时间内的平均速度是 7 m/s",
          ],
        }),
        makeBlock(
          "callout",
          {
            title: "常见错误",
            text: "错误：直接用 s(5)/5 计算平均速度。错误原因：混淆了平均速度和瞬时速度。正确做法：必须用位移差除以时间差。",
          },
          "misconception",
        ),
      ],
    };

    const result = reviewLessonSectionRule({
      sourcePrompt: "生成教案",
      section,
      preferences: mockPreferences,
      topics: mockTopics,
    });

    expect(result.score).toBeGreaterThan(60);
    expect(result.issues.every((issue) => !issue.message.includes("重复"))).toBe(true);
  });
});
