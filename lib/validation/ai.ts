/**
 * Zod schemas for AI tool-use output validation.
 */
import { z } from "zod";

const rubricLevelSchema = z.object({
  excellent: z.string().min(1),
  good: z.string().min(1),
  passing: z.string().min(1),
  failing: z.string().min(1),
});

const rubricDimensionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  weight: z.number().positive(),
  levels: rubricLevelSchema,
});

export const rubricAIOutputSchema = z.object({
  title: z.string().min(1),
  dimensions: z.array(rubricDimensionSchema).min(3).max(6),
});

const exerciseOptionSchema = z.object({
  label: z.string().min(1),
  text: z.string().min(1),
  isCorrect: z.boolean(),
});

const exerciseOptionMapSchema = z.object({
  A: z.string().min(1),
  B: z.string().min(1),
  C: z.string().min(1),
  D: z.string().min(1),
});

const difficultyLabelSchema = z.enum(["easy", "medium", "hard"]);

const nonEmptyStringSchema = z.string().trim().min(1);

const exerciseAIItemSchema = z
  .object({
    questionText: z.string().min(1).optional(),
    stem: z.string().min(1).optional(),
    type: z.enum(["MC", "FR"]).optional(),
    questionType: z.enum(["MCQ", "FRQ", "MC", "FR"]).optional(),
    question_type: z.enum(["MCQ", "FRQ", "MC", "FR"]).optional(),
    difficulty: z
      .union([
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
        difficultyLabelSchema,
      ])
      .optional(),
    difficultyLabel: difficultyLabelSchema.optional(),
    difficulty_label: difficultyLabelSchema.optional(),
    topicId: nonEmptyStringSchema.optional(),
    topic_id: nonEmptyStringSchema.optional(),
    loIds: z.array(z.string()).optional(),
    lo_ids: z.array(z.string()).optional(),
    ekIds: z.array(z.string()).optional(),
    ek_ids: z.array(z.string()).optional(),
    options: z.union([z.array(exerciseOptionSchema), exerciseOptionMapSchema]).optional(),
    correctAnswer: z.string().min(1).optional(),
    correct_answer: z.string().min(1).optional(),
    solutionSteps: z.string().min(1).optional(),
    solution: z.string().min(1).optional(),
    commonMistakes: z.array(z.string().min(1)).optional(),
    distractorRationale: z.record(z.string(), z.string()).optional(),
    distractor_rationale: z.record(z.string(), z.string()).optional(),
    parts: z.record(z.string(), z.unknown()).optional(),
    totalPoints: z.number().optional(),
    total_points: z.number().optional(),
  })
  .superRefine((value, ctx) => {
    const resolvedType =
      value.type ??
      (value.questionType === "MCQ" || value.questionType === "MC"
        ? "MC"
        : value.questionType === "FRQ" || value.questionType === "FR"
          ? "FR"
          : undefined) ??
      (value.question_type === "MCQ" || value.question_type === "MC"
        ? "MC"
        : value.question_type === "FRQ" || value.question_type === "FR"
          ? "FR"
          : undefined);

    const hasQuestionText = Boolean(value.questionText || value.stem);
    if (!hasQuestionText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "questionText or stem must be provided.",
        path: ["questionText"],
      });
    }

    const hasCorrectAnswer = Boolean(value.correctAnswer || value.correct_answer);
    if (!hasCorrectAnswer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "correctAnswer or correct_answer must be provided.",
        path: ["correctAnswer"],
      });
    }

    const hasDifficulty = Boolean(
      value.difficulty || value.difficultyLabel || value.difficulty_label,
    );
    if (!hasDifficulty) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "difficulty or difficultyLabel must be provided.",
        path: ["difficulty"],
      });
    }

    const hasSolution = Boolean(value.solutionSteps || value.solution);
    if (!hasSolution) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "solutionSteps or solution must be provided.",
        path: ["solutionSteps"],
      });
    }

    if (resolvedType === "MC") {
      if (!value.options) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MC questions must include exactly 4 options.",
          path: ["options"],
        });
        return;
      }
      if (Array.isArray(value.options)) {
        if (value.options.length !== 4) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "MC questions must include exactly 4 options.",
            path: ["options"],
          });
          return;
        }
        const correctCount = value.options.filter((opt) => opt.isCorrect).length;
        if (correctCount !== 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "MC questions must have exactly one correct option.",
            path: ["options"],
          });
        }
      }

      const answer = value.correctAnswer ?? value.correct_answer ?? "";
      if (answer && !["A", "B", "C", "D"].includes(answer)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "correctAnswer must be one of A, B, C, or D for MC questions.",
          path: ["correctAnswer"],
        });
      }
    }
  });

export const exerciseAIOutputSchema = z.object({
  exercises: z.array(exerciseAIItemSchema).min(1),
});
