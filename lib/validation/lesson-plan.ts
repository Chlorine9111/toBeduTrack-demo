import { z } from "zod";

const uuidSchema = z.string().uuid();

export const lessonPreferencesSchema = z.object({
  durationMinutes: z.number().int().min(15).max(180),
  studentLevel: z.enum(["basic", "medium", "advanced"]),
  languagePref: z.enum(["follow", "en", "zh", "bilingual"]),
  templateKind: z.enum(["concept", "example", "sprint", "inquiry"]),
  quizDensity: z.enum(["low", "medium", "high"]),
  explanationDepth: z.enum(["concise", "standard", "detailed"]),
  includeExtension: z.boolean(),
  showCedCodes: z.boolean(),
  includeTeacherNotes: z.boolean(),
});

export const lessonIntentRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  preferenceOverride: lessonPreferencesSchema.partial().optional(),
});

export const lessonIntentConfirmationSchema = z.object({
  subject: z.object({
    courseId: z.string().min(1).nullable(),
    code: z.string().min(1).max(100),
    name: z.string().min(1).max(200),
  }),
  unit: z.object({
    id: z.string().min(1).nullable(),
    unitNumber: z.string().min(1).max(20),
    title: z.string().min(1).max(200),
  }),
  topics: z
    .array(
      z.object({
        id: z.string().min(1),
        topicNumber: z.string().max(50),
        title: z.string().min(1),
        learningObjectives: z.array(
          z.object({
            code: z.string().min(1),
            description: z.string().min(1),
          }),
        ),
        essentialKnowledge: z.array(
          z.object({
            code: z.string().min(1),
            description: z.string().min(1),
          }),
        ),
      }),
    )
    .min(1)
    .max(3),
  preferences: lessonPreferencesSchema,
});

export const lessonOutlineRequestSchema = z.object({
  sourcePrompt: z.string().trim().min(1).max(4000),
  titleHint: z.string().trim().min(1).max(200),
  confirmation: lessonIntentConfirmationSchema,
});

export const lessonOutlineSectionSchema = z.object({
  id: uuidSchema,
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(2000),
  durationMinutes: z.number().int().min(1).max(180),
  keyPoints: z.array(z.string()).max(10),
});

export const lessonGenerateRequestSchema = z.object({
  sourcePrompt: z.string().trim().min(1).max(4000),
  confirmation: lessonIntentConfirmationSchema,
  outline: z.object({
    title: z.string().min(1).max(200),
    sections: z.array(lessonOutlineSectionSchema).min(3).max(8),
  }),
  enableWebSearch: z.boolean().optional().default(false),
  sourceAssetIds: z.array(z.string().uuid()).max(8).optional().default([]),
});

const blockSchema = z.object({
  id: uuidSchema,
  type: z.enum([
    "heading",
    "paragraph",
    "math",
    "image",
    "callout",
    "divider",
    "definition",
    "example",
    "steps",
    "quiz",
    "poll",
  ]),
  subtype: z.enum(["warning", "think", "misconception", "connection"]).optional(),
  sortOrder: z.number().int().min(0),
  content: z.record(z.string(), z.unknown()),
  cedCodes: z.array(z.string()),
  teacherNote: z.string().nullable().optional(),
});

export const lessonSectionSchema = z.object({
  id: uuidSchema,
  title: z.string().min(1).max(200),
  summary: z.string().max(4000),
  durationMinutes: z.number().int().min(0).max(180),
  sortOrder: z.number().int().min(0),
  blocks: z.array(blockSchema).max(100),
});

export const lessonPlanSaveSchema = z.object({
  title: z.string().min(1).max(200),
  sourcePrompt: z.string().min(1).max(4000),
  subjectLabel: z.string().min(1).max(200),
  courseId: z.string().min(1).nullable(),
  unitId: z.string().min(1).nullable(),
  topicIds: z.array(z.string()).max(10),
  learningObjectiveCodes: z.array(z.string()).max(50),
  essentialKnowledge: z.array(
    z.object({
      code: z.string().min(1),
      description: z.string().min(1),
    }),
  ),
  preferences: lessonPreferencesSchema,
  sections: z.array(lessonSectionSchema).max(80),
});

export const lessonRewriteBlockSchema = z
  .object({
    blockId: uuidSchema.optional(),
    sectionId: uuidSchema.optional(),
    instruction: z.string().trim().min(1).max(1000).optional(),
  })
  .refine(
    (value) => Boolean(value.blockId || value.sectionId),
    "blockId 或 sectionId 至少提供一个",
  );
