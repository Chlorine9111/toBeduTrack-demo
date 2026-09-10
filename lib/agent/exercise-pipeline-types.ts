import { z } from "zod";
import type { UploadedMaterial } from "@/lib/agent/chat-shared";
import type { GatewayModelInput } from "@/lib/ai/gateway";
import type { ExerciseDifficulty, ExerciseVerificationStatus } from "@/types/exercise";

export const EXERCISE_PIPELINE_MAX_TOTAL_COUNT = 20;
export const EXERCISE_PIPELINE_MAX_BATCH_COUNT = 6;
export const EXERCISE_PIPELINE_REQUEST_BATCH_TARGET = 5;

const difficultyBandSchema = z.enum(["基础巩固", "中等应用", "高阶分析"]);
const bloomLevelSchema = z.enum([
  "记忆",
  "理解",
  "应用",
  "分析",
  "评价",
  "创造",
]);
const languageSchema = z.enum(["中文", "英文"]);

export const blueprintSchema = z.object({
  subject: z.string().trim().min(1).max(120).nullable().optional(),
  unit: z.string().trim().min(1).max(120).nullable().optional(),
  learningObjective: z.string().trim().min(1).max(200).nullable().optional(),
  exerciseType: z.enum(["MC", "FR"]).default("MC"),
  count: z.number().int().min(1).max(EXERCISE_PIPELINE_MAX_TOTAL_COUNT).default(3),
  bloomLevel: bloomLevelSchema.default("应用"),
  difficultyBand: difficultyBandSchema.default("中等应用"),
  needRealWorldContext: z.boolean().default(true),
  language: languageSchema.default("中文"),
  teacherIntent: z.string().trim().min(1).max(2000),
});

const optionSchema = z.object({
  label: z.string().trim().min(1).max(2),
  text: z.string().trim().min(1).max(500),
  isCorrect: z.boolean().optional().default(false),
});

const exerciseGenerationOptionsSchema = z.object({
  A: z.string().trim().min(1).max(500),
  B: z.string().trim().min(1).max(500),
  C: z.string().trim().min(1).max(500),
  D: z.string().trim().min(1).max(500),
});

export const exerciseGenerationSchema = z
  .object({
    questionText: z.string().trim().min(1).max(3000),
    type: z.enum(["MC", "FR"]).default("MC"),
    difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
    options: exerciseGenerationOptionsSchema.optional(),
    correctAnswer: z.string().trim().min(1).max(800),
    solutionSteps: z.string().trim().min(1).max(5000),
    commonMistakes: z
      .array(z.string().trim().min(1).max(300))
      .max(6)
      .optional()
      .default([]),
    topicId: z.string().trim().max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type !== "MC") return;
    if (!value.options) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "选择题必须提供 4 个选项",
        path: ["options"],
      });
    }
    const correct = value.correctAnswer.trim().toUpperCase();
    if (!["A", "B", "C", "D"].includes(correct)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "选择题 correctAnswer 必须是 A-D",
        path: ["correctAnswer"],
      });
    }
  });

export const exerciseGenerationBundleSchema = z.object({
  exercises: z.array(exerciseGenerationSchema).min(1).max(EXERCISE_PIPELINE_MAX_BATCH_COUNT),
});

export const exerciseRawSchema = z.object({
  questionText: z.string().trim().max(3000).optional(),
  question: z.string().trim().max(3000).optional(),
  prompt: z.string().trim().max(3000).optional(),
  body: z.string().trim().max(3000).optional(),
  question_text: z.string().trim().max(3000).optional(),
  stem: z.string().trim().max(3000).optional(),
  type: z.enum(["MC", "FR"]).optional(),
  questionType: z.enum(["MC", "FR", "MCQ", "FRQ"]).optional(),
  question_type: z.enum(["MC", "FR", "MCQ", "FRQ"]).optional(),
  difficulty: z
    .union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.enum(["easy", "medium", "hard"]),
    ])
    .optional(),
  options: z
    .union([
      z.array(optionSchema),
      z.array(z.string().trim().min(1).max(500)).max(6),
      z.record(z.string(), z.string()),
    ])
    .optional(),
  correctAnswer: z.string().trim().max(800).optional(),
  correct_answer: z.string().trim().max(800).optional(),
  answer: z.string().trim().max(800).optional(),
  finalAnswer: z.string().trim().max(800).optional(),
  solutionSteps: z
    .union([z.string().trim().max(5000), z.array(z.string().trim().max(2000))])
    .optional(),
  solution_text: z
    .union([z.string().trim().max(5000), z.array(z.string().trim().max(2000))])
    .optional(),
  solution: z
    .union([z.string().trim().max(5000), z.array(z.string().trim().max(2000))])
    .optional(),
  explanation: z
    .union([z.string().trim().max(5000), z.array(z.string().trim().max(2000))])
    .optional(),
  analysis: z
    .union([z.string().trim().max(5000), z.array(z.string().trim().max(2000))])
    .optional(),
  commonMistakes: z.array(z.string().trim().max(300)).max(6).optional(),
  topicId: z.string().trim().max(200).optional(),
  topic_id: z.string().trim().max(200).optional(),
});

export const exerciseBundleSchema = z.object({
  exercises: z.array(exerciseRawSchema).min(1).max(EXERCISE_PIPELINE_MAX_BATCH_COUNT),
});

export const solverSchema = z
  .object({
    answerText: z.string().trim().max(1500).optional(),
    answer_text: z.string().trim().max(1500).optional(),
    answer: z.string().trim().max(1500).optional(),
    my_answer: z.string().trim().max(1500).optional(),
    finalAnswer: z.string().trim().max(1500).optional(),
    final_answer: z.string().trim().max(1500).optional(),
    result: z.string().trim().max(1500).optional(),
    my_solution: z.string().trim().max(3000).optional(),
    selectedOption: z.string().trim().max(20).optional(),
    selected_option: z.string().trim().max(20).optional(),
    option: z.string().trim().max(20).optional(),
    choice: z.string().trim().max(20).optional(),
    my_choice: z.string().trim().max(20).optional(),
    hasAmbiguity: z.union([z.boolean(), z.string()]).optional().default(false),
    is_ambiguous: z.union([z.boolean(), z.string()]).optional(),
    ambiguityReason: z.string().trim().max(300).optional().default(""),
    ambiguity_reason: z.string().trim().max(300).optional(),
  });

export function normalizeSolverResult(value: z.infer<typeof solverSchema>) {
  const normalizedOption = (
    value.selectedOption ??
    value.selected_option ??
    value.option ??
    value.choice ??
    value.my_choice ??
    value.my_answer
  )
    ?.toUpperCase()
    .match(/[A-D]/)?.[0] as "A" | "B" | "C" | "D" | undefined;
  const normalizedAnswer =
    value.answerText?.trim() ||
    value.answer_text?.trim() ||
    value.answer?.trim() ||
    value.my_answer?.trim() ||
    value.finalAnswer?.trim() ||
    value.final_answer?.trim() ||
    value.result?.trim() ||
    value.my_solution?.trim() ||
    normalizedOption ||
    "未给出明确答案";
  const ambiguityFlag =
    typeof (value.hasAmbiguity ?? value.is_ambiguous) === "string"
      ? ["true", "1", "yes", "是"].includes(
          String(value.hasAmbiguity ?? value.is_ambiguous)
            .trim()
            .toLowerCase(),
        )
      : Boolean(value.hasAmbiguity ?? value.is_ambiguous);
  return {
    answerText: normalizedAnswer,
    selectedOption: normalizedOption,
    hasAmbiguity: ambiguityFlag,
    ambiguityReason:
      value.ambiguityReason?.trim() ??
      value.ambiguity_reason?.trim() ??
      "",
  };
}

export const equivalenceSchema = z
  .object({
    isEquivalent: z.boolean().optional(),
    is_equivalent: z.boolean().optional(),
    equivalent: z.boolean().optional(),
    reason: z.string().trim().max(300).optional(),
    message: z.string().trim().max(300).optional(),
  });

export function normalizeEquivalenceResult(
  value: z.infer<typeof equivalenceSchema>,
) {
  return {
    isEquivalent:
      value.isEquivalent ?? value.is_equivalent ?? value.equivalent ?? false,
    reason: value.reason ?? value.message ?? "",
  };
}

export const teacherReviewItemSchema = z.object({
  index: z.number().int().min(1).max(EXERCISE_PIPELINE_MAX_BATCH_COUNT),
  questionPrecision: z.number().min(0).max(10),
  distractorQuality: z.number().min(0).max(10),
  cognitiveLevel: z.number().min(0).max(10),
  rubricOperability: z.number().min(0).max(10),
  overall: z.number().min(0).max(10),
  issues: z
    .array(z.string().trim().min(1).max(600))
    .max(8)
    .optional()
    .default([]),
  suggestions: z
    .array(z.string().trim().min(1).max(600))
    .max(8)
    .optional()
    .default([]),
  pass: z.boolean().optional(),
});

export const teacherReviewBundleSchema = z.object({
  items: z.array(teacherReviewItemSchema).min(1).max(EXERCISE_PIPELINE_MAX_BATCH_COUNT),
});

export type ExerciseBlueprint = z.infer<typeof blueprintSchema>;

export type PipelineExercise = {
  questionText: string;
  type: "MC" | "FR";
  difficulty: ExerciseDifficulty;
  options?: Array<{ label: string; text: string; isCorrect: boolean }>;
  correctAnswer: string;
  solutionSteps: string;
  commonMistakes: string[];
  topicId?: string;
};

export type ExerciseVerificationLog = {
  round: number;
  passed: boolean;
  reason: string;
  solverAnswer: string;
  hasAmbiguity: boolean;
};

export type PassedExerciseResult = {
  exercise: PipelineExercise;
  verificationStatus: ExerciseVerificationStatus;
  qualityNote: string;
  logs: ExerciseVerificationLog[];
  repaired: boolean;
};

export type ExercisePipelineVerificationMode =
  | "rule_only"
  | "teacher_review"
  | "solver_verify"
  | "mixed";

export type ExercisePipelineStrategy = {
  verificationMode: ExercisePipelineVerificationMode;
  useTeacherReview: boolean;
  useSolverVerification: boolean;
  maxRepairRounds: number;
  verificationConcurrency: number;
  reviewAfterRepair: boolean;
};

export type ApExercisePipelineOutput = {
  summary: string;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  blueprint: ExerciseBlueprint;
  curriculumContext: {
    courseName: string | null;
    unitName: string | null;
    topicName: string | null;
    contextText: string;
  } | null;
  passedExercises: PipelineExercise[];
  passedResults: PassedExerciseResult[];
  rejectedExercises: Array<{
    exercise: PipelineExercise;
    reason: string;
    attempts: number;
    logs: ExerciseVerificationLog[];
  }>;
  metrics: {
    requested: number;
    passed: number;
    rejected: number;
    totalModelCalls: number;
    maxRepairRounds: number;
    verificationMode: ExercisePipelineVerificationMode;
    verificationStatusCounts: Record<ExerciseVerificationStatus, number>;
    timings: {
      blueprintMs: number;
      curriculumMs: number;
      generationMs: number;
      teacherReviewMs: number;
      verificationMs: number;
      repairMs: number;
      totalMs: number;
    };
  };
  teacherOptions: Array<{
    label: string;
    value: string;
  }>;
};

export type RunApExercisePipelineInput = {
  model: GatewayModelInput;
  verificationModel?: GatewayModelInput;
  equivalenceModel?: GatewayModelInput;
  reviewModel?: GatewayModelInput;
  teacherRequest: string;
  count?: number;
  exerciseType?: "MC" | "FR";
  language?: "中文" | "英文";
  courseId?: string;
  unitId?: string;
  topicId?: string;
  uploadedMaterials?: UploadedMaterial[];
  maxRepairRounds?: number;
  blueprintOverride?: ExerciseBlueprint;
  curriculumContextOverride?: {
    courseName: string | null;
    unitName: string | null;
    topicName: string | null;
    contextText: string;
  } | null;
  materialContextOverride?: string;
  skipAiBlueprintResolve?: boolean;
  batchParent?: boolean;
  onTextDelta?: (delta: string) => void | Promise<void>;
  onTextReset?: () => void | Promise<void>;
};

export type PipelineState = {
  totalModelCalls: number;
};

export type ExerciseProcessingResult = {
  passedResult?: PassedExerciseResult;
  rejectedExercise?: ApExercisePipelineOutput["rejectedExercises"][number];
  verificationMs: number;
  repairMs: number;
};

export type TeacherReviewItem = z.infer<typeof teacherReviewItemSchema>;
