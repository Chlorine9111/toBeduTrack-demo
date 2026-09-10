import { z } from "zod";
import { documentBlockSchema } from "@/lib/doc-engine/document-schema";
import { toExerciseDifficulty } from "@/types/exercise";

const docTypeSchema = z.enum([
  "worksheet",
  "exam",
  "rubric",
  "lesson-plan",
  "quiz",
]);

export const docGeneratePreferencesSchema = z.object({
  pageSize: z.enum(["A4", "Letter"]).optional(),
  columns: z.union([z.literal(1), z.literal(2)]).optional(),
  questionCount: z.number().int().min(1).max(20).optional(),
  difficulty: z
    .union([
      z.enum(["easy", "medium", "hard"]),
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
    ])
    .transform((v) => (typeof v === "number" ? toExerciseDifficulty(v) : v))
    .optional(),
  duration: z.number().int().min(15).max(180).optional(),
  includeAnswerKey: z.boolean().optional(),
});

export const docGenerateRequestSchema = z.object({
  documentType: docTypeSchema,
  track: z.enum(["ap", "general"]).default("ap"),
  courseId: z.string().trim().min(1).max(120).optional(),
  unitId: z.string().trim().min(1).max(120).optional(),
  topic: z.string().trim().min(1).max(300).optional(),
  sourcePrompt: z.string().trim().min(1).max(4000),
  preferences: docGeneratePreferencesSchema.optional(),
});

export const docEditContextSchema = z.object({
  documentType: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  meta: z.record(z.string(), z.unknown()).optional(),
  totalBlockCount: z.number().int().min(1).max(500),
  surroundingBlocks: z.array(documentBlockSchema).max(6).optional(),
});

export const docEditRequestSchema = z.object({
  documentId: z.string().trim().min(1).max(200),
  selectedBlockIds: z.array(z.string().trim().min(1).max(200)).min(1).max(12),
  selectedBlocks: z.array(documentBlockSchema).min(1).max(12),
  instruction: z.string().trim().min(1).max(500),
  documentContext: docEditContextSchema,
});

export const docExportPdfRequestSchema = z.object({
  html: z.string().trim().min(1).max(2_000_000),
  title: z.string().trim().min(1).max(200).optional(),
  layoutConfig: z.object({
    pageSize: z.enum(["A4", "Letter"]),
    columns: z.union([z.literal(1), z.literal(2)]),
    margins: z.object({
      top: z.number().int().min(0).max(96),
      right: z.number().int().min(0).max(96),
      bottom: z.number().int().min(0).max(96),
      left: z.number().int().min(0).max(96),
    }),
    headerText: z.string().nullable().optional(),
    footerText: z.string().nullable().optional(),
    showPageNumbers: z.boolean(),
  }),
  includeAnswerKey: z.boolean().optional(),
});

export type DocGenerateRequest = z.infer<typeof docGenerateRequestSchema>;
export type DocEditRequest = z.infer<typeof docEditRequestSchema>;
export type DocExportPdfRequest = z.infer<typeof docExportPdfRequestSchema>;
