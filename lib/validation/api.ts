/**
 * Zod schemas for API request validation.
 */
import { z } from "zod";
import { exerciseContentSchema } from "@/lib/exercises/content";
import { toExerciseDifficulty } from "@/types/exercise";

const uuidRegex =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const uuidSchema = z.string().regex(uuidRegex, "Invalid UUID format.");
export const trackSchema = z.enum(["ap", "general"]);

export const rubricGenerateRequestSchema = z
  .object({
    track: trackSchema.optional().default("ap"),
    courseId: uuidSchema.optional(),
    unitId: uuidSchema.optional(),
    topic: z.string().trim().min(1).max(300).optional(),
    subjectCategory: z.string().trim().min(1).max(80).optional(),
    gradeLevel: z.string().trim().min(1).max(40).optional(),
    teacherRequest: z.string().trim().min(1).max(2000),
    sourceAssetIds: z.array(z.string().uuid()).max(8).optional().default([]),
  })
  .superRefine((value, ctx) => {
    if (value.track === "ap" && !value.courseId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["courseId"],
        message: "AP 轨道必须提供 courseId。",
      });
    }
    if (value.track === "general" && !value.topic) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["topic"],
        message: "通用轨道必须提供 topic。",
      });
    }
  });

export const exerciseGenerateRequestSchema = z
  .object({
    track: trackSchema.optional().default("ap"),
    courseId: uuidSchema.optional(),
    unitId: uuidSchema.optional(),
    topicId: uuidSchema.optional(),
    topic: z.string().trim().min(1).max(300).optional(),
    subjectCategory: z.string().trim().min(1).max(80).optional(),
    gradeLevel: z.string().trim().min(1).max(40).optional(),
    exerciseType: z.enum(["MC", "FR"]),
    difficulty: z
      .union([
        z.enum(["easy", "medium", "hard"]),
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
      ])
      .transform((v) => (typeof v === "number" ? toExerciseDifficulty(v) : v)),
    count: z.number().int().min(1).max(20),
    rubricId: uuidSchema.optional(),
    sourceAssetIds: z.array(z.string().uuid()).max(8).optional().default([]),
    // 500 chars is too tight once we include context (current stem + anti-dup constraints).
    // Keep this bounded to avoid abuse, but allow enough room for high-quality generation.
    teacherRequest: z.string().max(2000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.track === "ap") {
      if (!value.courseId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["courseId"],
          message: "AP 轨道必须提供 courseId。",
        });
      }
      if (!value.unitId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["unitId"],
          message: "AP 轨道必须提供 unitId。",
        });
      }
    }
    if (value.track === "general" && !value.topic) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["topic"],
        message: "通用轨道必须提供 topic。",
      });
    }
  });

export const exerciseVerifyRequestSchema = z.object({
  exerciseIds: z.array(uuidSchema).min(1).max(50),
});

const exerciseTypeSchema = z.enum(["MC", "FR", "fill_in"]);
const exerciseDifficultySchema = z
  .union([
    z.enum(["easy", "medium", "hard"]),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ])
  .transform((v) => (typeof v === "number" ? toExerciseDifficulty(v) : v));
const exerciseOptionSchema = z.object({
  label: z.string().min(1),
  text: z.string().min(1),
  isCorrect: z.boolean(),
});
const exerciseContentRequestSchema = exerciseContentSchema.superRefine((value, ctx) => {
  if (value.type !== "MC") return;

  const options = value.options ?? [];
  if (options.length !== 4) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "MC questions must include exactly 4 options.",
      path: ["options"],
    });
    return;
  }

  const correctCount = options.filter((option) => option.isCorrect).length;
  if (correctCount !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "MC questions must have exactly one correct option.",
      path: ["options"],
    });
  }
});

const worksheetExerciseSchema = z.object({
  type: z.enum(["MC", "FR", "fill_in"]),
  difficulty: z
    .union([
      z.enum(["easy", "medium", "hard"]),
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
    ])
    .transform((v) => (typeof v === "number" ? toExerciseDifficulty(v) : v)),
  questionText: z.string().min(1),
  options: z
    .array(
      z.object({
        label: z.string().min(1),
        text: z.string().min(1),
        isCorrect: z.boolean().optional(),
      }),
    )
    .optional(),
  correctAnswer: z.string().optional(),
  solutionSteps: z.string().optional(),
  parts: z.record(z.string(), z.unknown()).optional(),
  totalPoints: z.number().optional(),
  rubricId: uuidSchema.optional(),
});

export const pdfGenerateRequestSchema = z
  .object({
    documentType: z.enum(["exam", "rubric", "worksheet", "lesson_plan"]),
    worksheetId: uuidSchema.optional(),
    rubricId: uuidSchema.optional(),
    lessonPlanId: uuidSchema.optional(),
    pageSize: z.enum(["A4", "Letter"]).optional(),
    mode: z.enum(["teacher", "student", "classroom"]).optional(),
    includeAnswerKey: z.boolean().optional(),
    includeRubric: z.boolean().optional(),
    exercises: z.array(worksheetExerciseSchema).min(1).max(50).optional(),
    title: z.string().max(200).optional(),
    courseName: z.string().max(200).optional(),
    teacherName: z.string().max(200).optional(),
    date: z.string().max(200).optional(),
    includeExplanations: z.boolean().optional(),
    paperSize: z.enum(["A3", "A4", "Letter"]).optional(),
    margins: z.enum(["standard", "narrow", "wide"]).optional(),
    save: z.boolean().optional(),
    templateVariant: z
      .enum([
        "exam-classic",
        "exam-modern",
        "rubric-table",
        "rubric-cards",
        "worksheet-academic",
        "worksheet-friendly",
        "lesson-plan-standard",
        "lesson-plan-compact",
      ])
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.documentType === "rubric" && !value.rubricId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rubricId is required for rubric documents.",
        path: ["rubricId"],
      });
    }

    if (value.documentType === "exam" && !value.worksheetId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "worksheetId is required for exam documents.",
        path: ["worksheetId"],
      });
    }

    if (value.documentType === "worksheet") {
      const hasWorksheetId = Boolean(value.worksheetId);
      const hasExercises = Boolean(value.exercises && value.exercises.length > 0);
      if (hasWorksheetId === hasExercises) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "worksheetId or exercises is required, but not both.",
          path: ["worksheetId"],
        });
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "worksheetId or exercises is required, but not both.",
          path: ["exercises"],
        });
      }
    }

    if (value.documentType === "lesson_plan" && !value.lessonPlanId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "lessonPlanId is required for lesson plan documents.",
        path: ["lessonPlanId"],
      });
    }
  });

export const exercisePdfGenerateRequestSchema = z.object({
  title: z.string().min(1).max(200),
  save: z.boolean().optional(),
  exercises: z
    .array(
      z.object({
        type: z.enum(["MC", "FR"]),
        difficulty: z
          .union([
            z.enum(["easy", "medium", "hard"]),
            z.literal(1),
            z.literal(2),
            z.literal(3),
            z.literal(4),
          ])
          .transform((v) => (typeof v === "number" ? toExerciseDifficulty(v) : v)),
        questionText: z.string().min(1),
        options: z
          .array(
            z.object({
              label: z.string().min(1),
              text: z.string().min(1),
              isCorrect: z.boolean(),
            }),
          )
          .optional(),
        correctAnswer: z.string().optional(),
        solutionSteps: z.string().optional(),
        loIds: z.array(z.string()).optional(),
        ekIds: z.array(z.string()).optional(),
        parts: z.record(z.string(), z.unknown()).optional(),
        totalPoints: z.number().optional(),
      }),
    )
    .min(1)
    .max(50),
  includeAnswerKey: z.boolean().optional(),
  includeRubric: z.boolean().optional(),
  pageSize: z.enum(["A4", "Letter"]).optional(),
});

export const worksheetLayoutSchema = z.object({
  columns: z.union([z.literal(1), z.literal(2)]),
  showHeaderFooter: z.boolean(),
  headerText: z.string().max(200).optional(),
  footerText: z.string().max(200).optional(),
  teacherName: z.string().max(200).optional(),
  schoolLogoUrl: z.string().url().optional(),
  answerSpaceSize: z.enum(["small", "medium", "large"]),
  includeAnswerKey: z.boolean(),
  pageSize: z.enum(["A4", "Letter"]),
});

export const worksheetCreateSchema = z.object({
  title: z.string().min(1, "标题不能为空").max(200, "标题过长"),
  description: z.string().max(2000, "描述过长").optional(),
  courseId: uuidSchema,
  unitId: uuidSchema.optional(),
});

export const worksheetAssembleSchema = z
  .object({
    title: z.string().min(1, "标题不能为空").max(200, "标题过长"),
    description: z.string().max(2000, "描述过长").optional(),
    courseId: uuidSchema,
    unitId: uuidSchema.optional(),
    query: z.string().trim().min(2, "检索描述过短").max(800, "检索描述过长").optional(),
    seedExerciseId: uuidSchema.optional(),
    type: z.enum(["MC", "FR", "fill_in"]).optional(),
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
    knowledgeCluster: z
      .enum([
        "derivatives",
        "integrals",
        "limits",
        "functions_modeling",
        "algebra_equations",
        "geometry_trigonometry",
        "probability_statistics",
        "mechanics",
        "electricity_magnetism",
        "waves_thermo",
        "chemical_reactions",
        "equilibrium_acid_base",
        "organic_chemistry",
        "cell_energy",
        "genetics_evolution",
        "ecology_systems",
        "reading_writing",
        "language_usage",
        "general",
      ])
      .optional(),
    assessmentStyle: z
      .enum([
        "concept_check",
        "direct_application",
        "multi_step_problem",
        "graph_interpretation",
        "data_analysis",
        "experiment_analysis",
        "proof_reasoning",
        "error_analysis",
        "modeling_scenario",
        "text_evidence",
        "translation_expression",
        "mixed",
      ])
      .optional(),
    clusterNodeId: uuidSchema.optional(),
    subskillNodeId: uuidSchema.optional(),
    hasFigure: z.boolean().optional(),
    count: z.number().int().min(1, "至少选择 1 道题").max(20, "一次最多组 20 道题").default(8),
    maxCandidates: z
      .number()
      .int()
      .min(6, "候选题至少需要 6 道")
      .max(40, "候选题最多 40 道")
      .default(18),
    includeSeedExercise: z.boolean().optional().default(true),
  })
  .superRefine((value, ctx) => {
    if (!value.query && !value.seedExerciseId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["query"],
        message: "至少提供 query 或 seedExerciseId 之一。",
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["seedExerciseId"],
        message: "至少提供 query 或 seedExerciseId 之一。",
      });
    }

    if (value.count > value.maxCandidates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["count"],
        message: "题目数量不能超过候选题数量。",
      });
    }
  });

export const worksheetUpdateSchema = z
  .object({
    title: z.string().min(1, "标题不能为空").max(200, "标题过长").optional(),
    description: z.string().max(2000, "描述过长").optional().nullable(),
    courseId: uuidSchema.optional(),
    unitId: uuidSchema.optional().nullable(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.description !== undefined ||
      value.courseId !== undefined ||
      value.unitId !== undefined,
    "至少提供一个可更新字段。",
  );

export const worksheetExercisesAddSchema = z.object({
  exerciseIds: z
    .array(uuidSchema)
    .min(1, "至少选择一道题。")
    .max(50, "一次最多添加 50 道题。"),
});

export const worksheetBuilderCreateSchema = z.object({
  courseId: uuidSchema,
  unitId: uuidSchema.optional().nullable(),
  title: z.string().min(1, "标题不能为空").max(200, "标题过长"),
  description: z.string().max(2000, "描述过长").optional(),
  exerciseIds: z.array(uuidSchema).max(50, "一次最多导入 50 道题。").optional(),
});

export const worksheetBuilderUpdateSchema = z
  .object({
    title: z.string().min(1, "标题不能为空").max(200, "标题过长").optional(),
    description: z.string().max(2000, "描述过长").optional().nullable(),
    documentHtml: z.string().trim().min(1).max(2_000_000).optional(),
    document: z.unknown().optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.description !== undefined ||
      value.documentHtml !== undefined ||
      value.document !== undefined,
    "至少提供一个可更新字段。",
  );

export const worksheetExercisesReorderSchema = z.object({
  exerciseIds: z
    .array(uuidSchema)
    .min(1, "至少需要一道题进行排序。")
    .max(200, "排序数量过多。"),
});

export const worksheetExercisePointsSchema = z.object({
  points: z.number().min(0, "分值不能小于 0。").nullable(),
});

export const worksheetCreateRequestSchema = z.object({
  courseId: uuidSchema,
  unitId: uuidSchema.optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  layoutConfig: worksheetLayoutSchema,
});

export const worksheetAddExerciseRequestSchema = z.object({
  exerciseId: uuidSchema,
  sortOrder: z.number().int().min(0),
  points: z.number().min(0).optional(),
});

// Teacher edit validation
export const rubricUpdateSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    status: z.enum(["draft", "published"]).optional(),
    dimensions: z
      .array(
        z.object({
          name: z.string().min(1),
          description: z.string().min(1),
          weight: z.number().positive(),
          levels: z.object({
            excellent: z.string().min(1),
            good: z.string().min(1),
            passing: z.string().min(1),
            failing: z.string().min(1),
          }),
        }),
      )
      .min(3)
      .max(6)
      .optional(),
  })
  .refine(
    (value) => value.title || value.status || value.dimensions,
    "At least one field must be provided.",
  );

export const exerciseUpdateSchema = z.object({
  questionText: z.string().min(1).optional(),
  type: exerciseTypeSchema,
  difficulty: exerciseDifficultySchema,
  content: exerciseContentRequestSchema.optional(),
  options: z.array(exerciseOptionSchema).optional(),
  correctAnswer: z.string().min(1).optional(),
  solutionSteps: z.string().min(1).optional(),
  commonMistakes: z.array(z.string().min(1)).optional(),
}).superRefine((value, ctx) => {
  if (value.content && value.content.type !== value.type) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Content type must match exercise type.",
      path: ["content", "type"],
    });
  }

  if (!value.content) {
    if (!value.questionText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "questionText is required when content is not provided.",
        path: ["questionText"],
      });
    }
    if (!value.correctAnswer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "correctAnswer is required when content is not provided.",
        path: ["correctAnswer"],
      });
    }
    if (!value.solutionSteps) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "solutionSteps is required when content is not provided.",
        path: ["solutionSteps"],
      });
    }
  }

  if (value.type === "MC") {
    const options = value.content?.options
      ? value.content.options.map((option) => ({
          label: option.label,
          text: option.blocks
            .map((block) => ("text" in block ? block.text : block.src))
            .join(""),
          isCorrect: Boolean(option.isCorrect),
        }))
      : value.options;

    if (!options || options.length !== 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MC questions must include exactly 4 options.",
        path: ["options"],
      });
      return;
    }

    const correctCount = options.filter((option) => option.isCorrect).length;
    if (correctCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MC questions must have exactly one correct option.",
        path: ["options"],
      });
    }
  }
});

export const exerciseSaveRequestSchema = z.object({
  exercises: z
    .array(
      z.object({
        courseId: uuidSchema,
        unitId: uuidSchema.optional(),
        topicId: uuidSchema.optional(),
        rubricId: uuidSchema.optional(),
        importBatchId: uuidSchema.optional(),
        type: exerciseTypeSchema,
        difficulty: exerciseDifficultySchema,
        content: exerciseContentRequestSchema.optional(),
        questionText: z.string().min(1).optional(),
        options: z.array(exerciseOptionSchema).optional(),
        correctAnswer: z.string().min(1).optional(),
        solutionSteps: z.string().min(1).optional(),
        commonMistakes: z.array(z.string().min(1)).optional(),
        verificationStatus: z
          .enum(["pending", "rule_checked", "verified", "failed", "manual_review"])
          .optional(),
        verificationAttempts: z.number().int().min(0).optional(),
        teacherPrompt: z.string().max(500).optional(),
        isAiGenerated: z.boolean().optional(),
        teacherModified: z.boolean().optional(),
        sourceKind: z
          .enum(["pdf_scan", "knowledge_document", "agent_generated", "manual"])
          .optional(),
        sourceDocumentId: uuidSchema.optional(),
        sourceUploadId: uuidSchema.optional(),
        sourceFileName: z.string().trim().max(200).optional(),
        sourcePageStart: z.number().int().min(1).optional(),
        sourcePageEnd: z.number().int().min(1).optional(),
        sourceConfidence: z.number().min(0).max(100).optional(),
        sourceReviewStatus: z
          .enum(["ready", "review", "critical", "unreviewed"])
          .optional(),
        similarityFingerprint: z.string().trim().min(8).max(80).optional(),
        knowledgeCluster: z.string().trim().min(2).max(80).optional(),
        knowledgeSubskillKey: z.string().trim().min(2).max(80).optional(),
        knowledgeSubskillLabel: z.string().trim().min(2).max(120).optional(),
        knowledgeTags: z.array(z.string().trim().min(2).max(80)).max(10).optional(),
        assessmentStyle: z.string().trim().min(2).max(80).optional(),
        assessmentTags: z.array(z.string().trim().min(2).max(80)).max(10).optional(),
        classificationConfidence: z.number().int().min(0).max(100).optional(),
        classificationStatus: z
          .enum(["auto_confirmed", "needs_review", "teacher_confirmed", "unreviewed"])
          .optional(),
        classificationReasons: z.array(z.string().trim().min(2).max(200)).max(12).optional(),
        subskillConfidence: z.number().min(0).max(100).optional(),
        subskillMatchMode: z
          .enum(["matched_existing", "candidate_new", "needs_review", "teacher_confirmed"])
          .optional(),
        subskillReasons: z.array(z.string().trim().min(2).max(200)).max(12).optional(),
      }),
    )
    .min(1)
    .max(20),
}).superRefine((value, ctx) => {
  value.exercises.forEach((exercise, index) => {
    if (exercise.content && exercise.content.type !== exercise.type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Content type must match exercise type.",
        path: ["exercises", index, "content", "type"],
      });
    }

    if (!exercise.content) {
      if (!exercise.questionText) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "questionText is required when content is not provided.",
          path: ["exercises", index, "questionText"],
        });
      }
      if (!exercise.correctAnswer) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "correctAnswer is required when content is not provided.",
          path: ["exercises", index, "correctAnswer"],
        });
      }
      if (!exercise.solutionSteps) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "solutionSteps is required when content is not provided.",
          path: ["exercises", index, "solutionSteps"],
        });
      }
    }

    if (exercise.type === "MC") {
      const options = exercise.content?.options
        ? exercise.content.options.map((option) => ({
            label: option.label,
            text: option.blocks
              .map((block) => ("text" in block ? block.text : block.src))
              .join(""),
            isCorrect: Boolean(option.isCorrect),
          }))
        : exercise.options;

      if (!options || options.length !== 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MC questions must include exactly 4 options.",
          path: ["exercises", index, "options"],
        });
        return;
      }

      const correctCount = options.filter((option) => option.isCorrect).length;
      if (correctCount !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MC questions must have exactly one correct option.",
          path: ["exercises", index, "options"],
        });
      }
    }
  });
});
