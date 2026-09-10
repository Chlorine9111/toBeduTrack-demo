import { z } from "zod";
import type { DocumentModel } from "@/lib/doc-engine/block-types";

export const marginsSchema = z.object({
  top: z.number().int().min(0),
  right: z.number().int().min(0),
  bottom: z.number().int().min(0),
  left: z.number().int().min(0),
});

const headerBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("header"),
  data: z.object({
    title: z.string().min(1),
    subtitle: z.string().optional(),
    eyebrow: z.string().optional(),
  }),
});

const sectionTitleBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("section-title"),
  data: z.object({
    title: z.string().min(1),
    numbering: z.string().optional(),
    subtitle: z.string().optional(),
  }),
});

const instructionBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("instruction"),
  data: z.object({
    text: z.string().min(1),
  }),
});

const questionOptionSchema = z.object({
  label: z.string().min(1),
  text: z.string().min(1),
  isCorrect: z.boolean().optional(),
});

const mcQuestionSchema = z.object({
  instanceId: z.string().nullable().optional(),
  sourceExerciseId: z.string().nullable().optional(),
  number: z.number().int().positive().optional(),
  stem: z.string().min(1),
  questionType: z.literal("mc"),
  points: z.number().optional(),
  difficulty: z.string().nullable().optional(),
  options: z.array(questionOptionSchema).min(1),
  correctAnswer: z.string().nullable().optional(),
  explanation: z.string().nullable().optional(),
  sourceLabel: z.string().nullable().optional(),
});

const frqQuestionSchema = z.object({
  instanceId: z.string().nullable().optional(),
  sourceExerciseId: z.string().nullable().optional(),
  number: z.number().int().positive().optional(),
  stem: z.string().min(1),
  questionType: z.literal("frq"),
  points: z.number().optional(),
  difficulty: z.string().nullable().optional(),
  answerSpace: z.enum(["small", "medium", "large"]).optional(),
  sampleAnswer: z.string().nullable().optional(),
  explanation: z.string().nullable().optional(),
  sourceLabel: z.string().nullable().optional(),
});

const fillQuestionSchema = z.object({
  instanceId: z.string().nullable().optional(),
  sourceExerciseId: z.string().nullable().optional(),
  number: z.number().int().positive().optional(),
  stem: z.string().min(1),
  questionType: z.literal("fill"),
  points: z.number().optional(),
  difficulty: z.string().nullable().optional(),
  blanks: z
    .array(
      z.object({
        position: z.number().int().nonnegative(),
        answer: z.string().nullable().optional(),
      }),
    )
    .optional(),
  explanation: z.string().nullable().optional(),
  sourceLabel: z.string().nullable().optional(),
});

const tfQuestionSchema = z.object({
  instanceId: z.string().nullable().optional(),
  sourceExerciseId: z.string().nullable().optional(),
  number: z.number().int().positive().optional(),
  stem: z.string().min(1),
  questionType: z.literal("tf"),
  points: z.number().optional(),
  difficulty: z.string().nullable().optional(),
  correctAnswer: z.boolean().nullable().optional(),
  explanation: z.string().nullable().optional(),
  sourceLabel: z.string().nullable().optional(),
});

const questionBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("question"),
  data: z.discriminatedUnion("questionType", [
    mcQuestionSchema,
    frqQuestionSchema,
    fillQuestionSchema,
    tfQuestionSchema,
  ]),
});

export const rubricRowBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("rubric-row"),
  data: z.object({
    dimension: z.string().min(1),
    description: z.string().nullable().optional(),
    weight: z.number().nullable().optional(),
    levels: z.array(
      z.object({
        label: z.string().min(1),
        score: z.union([z.number(), z.string()]).nullable().optional(),
        description: z.string().min(1),
      }),
    ),
  }),
});

const lessonPlanBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("lesson-step"),
  data: z.object({
    phase: z.string().optional(),
    title: z.string().min(1),
    duration: z.number().nullable().optional(),
    summary: z.string().nullable().optional(),
    objectives: z.array(z.string()).optional(),
    activities: z.array(z.string()).optional(),
    materials: z.array(z.string()).optional(),
    teacherNotes: z.string().nullable().optional(),
    blocks: z.array(z.record(z.string(), z.unknown())).optional(),
  }),
});

const dividerBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("divider"),
  data: z.object({
    style: z.enum(["solid", "dashed", "dotted"]).optional(),
  }),
});

const answerSpaceBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("answer-space"),
  data: z.object({
    size: z.enum(["small", "medium", "large"]),
    lines: z.number().int().positive().optional(),
  }),
});

const tableBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("table"),
  data: z.object({
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
    caption: z.string().optional(),
  }),
});

const pageBreakBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("page-break"),
  data: z.record(z.string(), z.never()).default({}),
});

export const documentBlockSchema = z.discriminatedUnion("type", [
  headerBlockSchema,
  sectionTitleBlockSchema,
  instructionBlockSchema,
  questionBlockSchema,
  rubricRowBlockSchema,
  lessonPlanBlockSchema,
  dividerBlockSchema,
  answerSpaceBlockSchema,
  tableBlockSchema,
  pageBreakBlockSchema,
]);

export const documentModelSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["worksheet", "exam", "rubric", "lesson-plan", "quiz", "exercises", "notes"]),
  title: z.string().min(1),
  meta: z.object({
    courseName: z.string().nullable().optional(),
    unitName: z.string().nullable().optional(),
    teacherName: z.string().nullable().optional(),
    schoolLogo: z.string().nullable().optional(),
    date: z.string().nullable().optional(),
    totalPoints: z.number().nullable().optional(),
    duration: z.number().nullable().optional(),
    downloadUrl: z.string().nullable().optional(),
  }),
  blocks: z.array(documentBlockSchema),
  layoutConfig: z.object({
    pageSize: z.enum(["A4", "Letter"]),
    columns: z.union([z.literal(1), z.literal(2)]),
    margins: marginsSchema,
    headerText: z.string().nullable().optional(),
    footerText: z.string().nullable().optional(),
    showPageNumbers: z.boolean(),
  }),
});

export function parseDocumentModel(value: unknown): DocumentModel | null {
  const parsed = documentModelSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data as DocumentModel;
}
