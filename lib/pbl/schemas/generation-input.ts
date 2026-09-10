import { z } from "zod";
import { DEFAULT_PBL_INPUT, normalizeDifficulty } from "@/lib/pbl/defaults";

const stringListSchema = z.array(z.string().trim().min(1));

export const generationInputSchema = z
  .object({
    curriculumSystem: z.enum(["AP", "IB", "CN"]),
    primarySubject: z.string().trim().min(1),
    crossSubjects: stringListSchema.max(2).default(DEFAULT_PBL_INPUT.crossSubjects),
    grade: z.string().trim().min(1),
    totalPeriods: z.number().int().min(2).max(60).default(8),
    topic: z.string().trim().max(200).optional(),
    knowledgePoints: stringListSchema.default(DEFAULT_PBL_INPUT.knowledgePoints),
    projectForms: stringListSchema.max(2).default(DEFAULT_PBL_INPUT.projectForms),
    difficulty: z.string().optional(),
    themes: stringListSchema.max(2).default(DEFAULT_PBL_INPUT.themes),
    classSize: z.string().trim().min(1).default(DEFAULT_PBL_INPUT.classSize),
    resources: stringListSchema.default(DEFAULT_PBL_INPUT.resources),
    outcomes: stringListSchema.default(DEFAULT_PBL_INPUT.outcomes),
    specialRequirements: z.string().trim().max(4000).optional(),
  })
  .transform((input) => ({
    curriculumSystem: input.curriculumSystem,
    primarySubject: input.primarySubject,
    crossSubjects: input.crossSubjects ?? [],
    grade: input.grade,
    totalPeriods: input.totalPeriods,
    topic: input.topic?.trim() || undefined,
    knowledgePoints: input.knowledgePoints ?? [],
    projectForms: input.projectForms ?? [],
    difficulty: normalizeDifficulty(input.difficulty),
    themes: input.themes ?? [],
    classSize: input.classSize,
    resources: input.resources ?? ["无特殊资源"],
    outcomes: input.outcomes ?? [],
    specialRequirements: input.specialRequirements,
  }));

export type GenerationInput = z.infer<typeof generationInputSchema>;

export const generateOverviewsRequestSchema = z.object({
  action: z.literal("overview").default("overview"),
  input: generationInputSchema,
});

export const expandPlanRequestSchema = z.object({
  action: z.literal("expand"),
  requestId: z.string().uuid(),
  optionLabel: z.enum(["A", "B", "C"]),
});

export const generateRequestSchema = z.union([
  generateOverviewsRequestSchema,
  expandPlanRequestSchema,
]);
