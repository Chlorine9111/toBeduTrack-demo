import { z } from "zod";
import { generateStructuredObjectWithGateway } from "@/lib/ai/gateway";
import { getModelForTask } from "@/lib/ai/model-router";
import { resolveLanguageModel } from "@/lib/ai/provider-registry";
import type { AssetCategory } from "@/lib/content-assets/types";

const MAX_INPUT_CHARS = 3000;
const SHORT_TEXT_THRESHOLD = 200;

const assetSummarySchema = z.object({
  summary: z.string(),
  tags: z.array(z.string()).max(5),
  category: z.enum([
    "instructional",
    "assessment",
    "student_work",
    "reference",
    "uncategorized",
  ]),
});

export type AssetSummaryResult = {
  summary: string;
  tags: string[];
  category: AssetCategory;
};

// ── 文件名规则引擎（AI 调用前的硬匹配） ──────────────────────
type FileNameRule = { pattern: RegExp; category: AssetCategory; confidence: "high" | "medium" };

const FILE_NAME_RULES: FileNameRule[] = [
  // 高置信 — 文件名明确包含类型关键词
  { pattern: /lesson[\s_-]*plan|教案|lektion|teaching[\s_-]*plan/i, category: "instructional", confidence: "high" },
  { pattern: /syllabus|课程大纲|curriculum[\s_-]*guide/i, category: "instructional", confidence: "high" },
  { pattern: /exam|quiz|test|考试|练习|模拟[卷题]|midterm|final|期[中末]|真题/i, category: "assessment", confidence: "high" },
  { pattern: /rubric|评分[标准量规表]|scoring[\s_-]*guide/i, category: "assessment", confidence: "high" },
  { pattern: /frq|mcq|free[\s_-]*response|multiple[\s_-]*choice/i, category: "assessment", confidence: "high" },
  { pattern: /student[\s_-]*work|学生[作答]|submission|答[卷题]/i, category: "student_work", confidence: "high" },
  { pattern: /college[\s_-]*board|collegeboard|cb[\s_-]*official/i, category: "reference", confidence: "high" },
  { pattern: /ced|course[\s_-]*description|课程描述/i, category: "reference", confidence: "high" },
  { pattern: /textbook|教[材科]书|参考[资书]/i, category: "reference", confidence: "high" },

  // 中置信 — 需要内容辅助确认
  { pattern: /notes|笔记|讲义|handout|worksheet/i, category: "instructional", confidence: "medium" },
  { pattern: /slide|ppt|课件|presentation/i, category: "instructional", confidence: "medium" },
  { pattern: /practice|exercise|drill|assignment|作业|习题/i, category: "assessment", confidence: "medium" },
  { pattern: /review|复习|回顾/i, category: "instructional", confidence: "medium" },
  { pattern: /lab|实验|report|报告/i, category: "assessment", confidence: "medium" },
];

function inferCategoryFromFileName(fileName: string): { category: AssetCategory; confidence: "high" | "medium" } | null {
  for (const rule of FILE_NAME_RULES) {
    if (rule.pattern.test(fileName)) {
      return { category: rule.category, confidence: rule.confidence };
    }
  }
  return null;
}

// ── System Prompt ────────────────────────────────────────────
const SYSTEM_PROMPT = [
  "你是一名AP课程教学资料分析助手。",
  "根据以下文档内容，完成三件事：",
  "",
  "1. 生成一句话中文摘要（不超过100字）。",
  "2. 提取最多5个标签（反映学科、主题、文档类型）。",
  "3. 判断文档所属分类（从以下5类中选择一个）：",
  "   - instructional：教案、课件、讲义、学习指南、教学大纲、Lesson Plan、教学笔记",
  "   - assessment：试卷、练习题、Quiz、FRQ、MCQ、评分标准、Rubric、考试、实验报告",
  "   - student_work：学生提交的作业、答卷、学生作品、学生笔记",
  "   - reference：教材章节、College Board 官方文档、参考论文、研究资料、课程描述",
  "   - uncategorized：无法判断或不属于以上任何类别",
  "",
  "重要分类规则（按优先级）：",
  "1. 如果文件名提示中包含分类建议，优先采纳（除非内容明显矛盾）",
  "2. 教师自己写的笔记、讲义、教学资料 → instructional（不是 reference）",
  "3. 包含题目、选项、得分点、评分维度 → assessment",
  "4. 只有来自出版社、College Board、学术期刊的文档才是 reference",
  "5. 拿不准时倾向 instructional 而非 reference（教师上传的多是自用教学材料）",
  "",
  "以 JSON 格式输出 { summary, tags, category }。",
].join("\n");

export async function generateAssetSummary(params: {
  rawText: string;
  fileName: string;
  fileType: string;
}): Promise<AssetSummaryResult> {
  const truncatedText = params.rawText.slice(0, MAX_INPUT_CHARS);

  // 文件名预判
  const fileNameHint = inferCategoryFromFileName(params.fileName);

  // 无文本时直接用文件名规则
  if (!truncatedText.trim()) {
    return {
      summary: "",
      tags: [],
      category: fileNameHint?.category ?? "uncategorized",
    };
  }

  // 短文本 + 高置信文件名 → 直接采信文件名，不调 AI
  if (truncatedText.length < SHORT_TEXT_THRESHOLD && fileNameHint?.confidence === "high") {
    return {
      summary: "",
      tags: [],
      category: fileNameHint.category,
    };
  }

  try {
    const modelId = getModelForTask("asset_summarize");
    const resolved = resolveLanguageModel(modelId);

    // 构建 user prompt，文件名提示作为额外信号
    const userPromptParts = [
      `文件名: ${params.fileName}`,
      `文件类型: ${params.fileType}`,
    ];

    if (fileNameHint) {
      userPromptParts.push(
        `文件名分类提示: 文件名特征匹配到 "${fileNameHint.category}"（置信度: ${fileNameHint.confidence}），请参考但以内容为准`,
      );
    }

    userPromptParts.push("", "--- 文档内容 ---", truncatedText);

    const { object } = await generateStructuredObjectWithGateway({
      model: resolved,
      schema: assetSummarySchema,
      schemaName: "asset_summary",
      schemaDescription: "文档摘要、标签和分类",
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: userPromptParts.join("\n"),
      maxTokens: 512,
      timeout: 30_000,
    });

    return {
      summary: (object.summary ?? "").slice(0, 200),
      tags: (object.tags ?? []).slice(0, 5),
      category: object.category ?? fileNameHint?.category ?? "uncategorized",
    };
  } catch (error) {
    console.warn("[content-assets/summarize] AI 摘要生成失败，已降级", error);
    // AI 失败时用文件名规则兜底
    return {
      summary: "",
      tags: [],
      category: fileNameHint?.category ?? "uncategorized",
    };
  }
}
