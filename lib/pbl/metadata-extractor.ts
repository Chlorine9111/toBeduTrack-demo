import { z } from "zod";
import { generateStructuredObjectWithGateway } from "@/lib/ai/gateway";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import {
  extractDrivingQuestionFromMarkdown,
  extractTitleFromMarkdown,
  normalizeDrivingQuestion,
  normalizePlanTitle,
} from "@/lib/pbl/plan-markdown";

const metadataSchema = z.object({
  title: z.string().trim().min(1),
  drivingQuestion: z.string().trim().min(1),
});

export async function extractPlanMetadata(markdown: string): Promise<{
  title: string;
  drivingQuestion: string;
}> {
  const localTitle = extractTitleFromMarkdown(markdown);
  const localDrivingQuestion = extractDrivingQuestionFromMarkdown(markdown);

  if (localTitle && localDrivingQuestion.length >= 16) {
    return {
      title: localTitle,
      drivingQuestion: localDrivingQuestion,
    };
  }

  const { object } = await generateStructuredObjectWithGateway({
    model: getResolvedLanguageModelForTask("pbl_metadata_extract"),
    schema: metadataSchema,
    systemPrompt: "从下面的 Markdown 教学方案中提取项目标题和驱动问题。",
    userPrompt: markdown.slice(0, 3000),
    maxTokens: 300,
    temperature: 0,
  });

  return {
    title: normalizePlanTitle(object.title),
    drivingQuestion: normalizeDrivingQuestion(object.drivingQuestion),
  };
}
