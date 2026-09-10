import { z } from "zod";

const questionTypeEnum = z.enum(["MC", "FR", "essay", "calculation"]);

export const createSessionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  courseId: z.string().max(100).optional(),
  unitId: z.string().max(100).optional(),
  topicId: z.string().max(100).optional(),
});

export const answerKeyItemSchema = z.object({
  questionNumber: z.number().int().min(1),
  questionText: z.string().min(1),
  questionType: questionTypeEnum,
  correctAnswer: z.string().min(1),
  maxScore: z.number().min(0),
  responseMode: z.enum(["text", "math", "diagram", "mixed"]).optional(),
  subjectHint: z.string().max(200).nullable().optional(),
  languageHint: z.string().max(32).nullable().optional(),
  sourceQuestionType: z.string().max(64).nullable().optional(),
  rubricDimensions: z
    .array(
      z.object({
        name: z.string(),
        weight: z.number().min(0).max(100),
        description: z.string(),
      }),
    )
    .optional(),
  knowledgePoints: z.array(z.string()).optional(),
  inferenceConfidence: z.number().min(0).max(1).optional(),
  reviewRecommended: z.boolean().optional(),
  reviewReason: z.string().max(2000).nullable().optional(),
});

export const setAnswerKeySchema = z.object({
  answerKeySource: z.enum(["exercise", "manual", "rubric"]),
  answerKey: z.array(answerKeyItemSchema).min(1).max(200),
  rubricId: z.string().uuid().optional(),
});

export const uploadSubmissionSchema = z.object({
  studentName: z.string().trim().min(1).max(120).optional(),
});

export const gradeSubmissionSchema = z.object({
  submissionId: z.string().uuid(),
});

export const overrideAnswerSchema = z.object({
  answerId: z.string().uuid(),
  score: z.number().min(0),
  feedback: z.string().max(5000).optional(),
});

export const ocrResultSchema = z.object({
  pages: z.array(
    z.object({
      pageNumber: z.number().int().min(1),
      questions: z.array(
        z.object({
          questionNumber: z.number().int().min(1),
          studentAnswer: z.string(),
          confidence: z.number().min(0).max(1),
          boundingBox: z
            .object({
              x: z.number(),
              y: z.number(),
              w: z.number(),
              h: z.number(),
            })
            .optional(),
        }),
      ),
    }),
  ),
});

export const updateSessionSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    courseId: z.string().max(100).optional().nullable(),
    unitId: z.string().max(100).optional().nullable(),
    topicId: z.string().max(100).optional().nullable(),
    status: z.enum(["draft", "processing", "completed", "failed"]).optional(),
  })
  .refine(
    (value) => Object.values(value).some((item) => item !== undefined),
    "至少提供一个可更新字段。",
  );
