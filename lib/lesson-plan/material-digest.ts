import { z } from "zod";
import { generateStructuredObject } from "@/lib/ai/structured-output";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import type { UploadedMaterial } from "@/lib/lesson-plan/material-parser";
import { trimText } from "@/lib/lesson-plan/material-parser";

export const materialDigestSchema = z.object({
  titleHint: z.string().trim().max(120).optional(),
  keyKnowledgePoints: z.array(z.string().trim().min(1).max(120)).min(3).max(10),
  classroomGoals: z.array(z.string().trim().min(1).max(180)).min(1).max(5),
  misconceptions: z.array(z.string().trim().min(1).max(180)).max(5).default([]),
  differentiatedSupport: z.array(z.string().trim().min(1).max(200)).max(5).default([]),
  suggestedQueries: z.array(z.string().trim().min(1).max(120)).max(3).default([]),
  materialHighlights: z
    .array(
      z.object({
        source: z.string().trim().min(1).max(120),
        snippet: z.string().trim().min(1).max(420),
        whyImportant: z.string().trim().min(1).max(220),
      }),
    )
    .max(5),
});

export type MaterialDigest = z.infer<typeof materialDigestSchema>;

export async function buildMaterialDigest(
  materials: UploadedMaterial[],
  sourcePrompt: string,
  options?: { abortSignal?: AbortSignal },
): Promise<MaterialDigest | null> {
  if (materials.length === 0) return null;

  const model = getResolvedLanguageModelForTask("material_digest");
  const materialText = materials
    .map((item, index) => `【材料${index + 1}】${item.fileName}\n${trimText(item.textContent, 3600)}`)
    .join("\n\n");

  return generateStructuredObject({
    model,
    schema: materialDigestSchema,
    systemPrompt: [
      "你是教学材料提炼 agent。",
      "任务：从教师上传材料中提炼可直接用于上课的结构化信息。",
      "要求：输出必须具体、可执行、避免空话。",
    ].join("\n"),
    userPrompt: [
      `教师需求：${sourcePrompt}`,
      "请结合以下材料提炼：关键知识点、课堂目标、分层支持、建议联网检索问题。",
      materialText,
    ].join("\n\n"),
    maxTokens: 2600,
    temperature: 0.2,
    abortSignal: options?.abortSignal,
  });
}
