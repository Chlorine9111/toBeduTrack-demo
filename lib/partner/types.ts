import { z } from "zod";
import type { ExerciseOption } from "@/types/exercise";

export const partnerTeacherRoleSchema = z.enum(["admin", "group_leader", "teacher"]);
export const partnerTeacherStatusSchema = z.enum(["active", "disabled"]);
export const partnerGroupRoleSchema = z.enum(["leader", "member"]);
export const partnerVisibilitySchema = z.enum(["private", "group", "school"]);
export const partnerExerciseTypeSchema = z.enum([
  "MC",
  "FR",
  "fill_in",
  "TF",
  "experiment",
  "proof",
  "drawing",
]);
export const partnerExerciseSourceKindSchema = z.enum(["pdf_scan", "manual", "bulk_import"]);
export const partnerResourceTypeSchema = z.enum([
  "lesson_plan",
  "courseware",
  "exam_paper",
  "document",
  "image",
  "other",
]);
export const partnerWorksheetStatusSchema = z.enum(["draft", "published"]);

export type PartnerTeacherRole = z.infer<typeof partnerTeacherRoleSchema>;
export type PartnerTeacherStatus = z.infer<typeof partnerTeacherStatusSchema>;
export type PartnerGroupRole = z.infer<typeof partnerGroupRoleSchema>;
export type PartnerVisibility = z.infer<typeof partnerVisibilitySchema>;
export type PartnerExerciseType = z.infer<typeof partnerExerciseTypeSchema>;
export type PartnerExerciseSourceKind = z.infer<typeof partnerExerciseSourceKindSchema>;
export type PartnerResourceType = z.infer<typeof partnerResourceTypeSchema>;
export type PartnerWorksheetStatus = z.infer<typeof partnerWorksheetStatusSchema>;

export type PartnerContext = {
  schoolId: string;
  schoolName: string;
  teacherId: string | null;
  teacherExternalId: string | null;
  teacherName: string | null;
  teacherRole: PartnerTeacherRole;
  apiKeyId: string;
  permissions: string[];
  isSystem: boolean;
};

export type PartnerExerciseInput = {
  exerciseType: PartnerExerciseType;
  difficulty: number;
  questionText: string;
  options?: ExerciseOption[] | null;
  correctAnswer?: string | null;
  solutionSteps?: string | null;
  commonMistakes?: string[] | null;
  courseId?: string | null;
  unitId?: string | null;
  visibility?: PartnerVisibility;
  groupId?: string | null;
  tags?: string[];
  stage?: string | null;
  subject?: string | null;
  gradeLevel?: string | null;
  textbookVersion?: string | null;
  knowledgePoints?: string[];
  reviewFlag?: "disputed" | null;
  reviewFlagReason?: string | null;
  sourceKind?: PartnerExerciseSourceKind;
  sourceFileName?: string | null;
  sourcePageStart?: number | null;
  sourcePageEnd?: number | null;
  sourceConfidence?: number | null;
  isAiGenerated?: boolean;
};

export type PartnerPaginationResult<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

export const partnerOptionSchema = z.object({
  label: z.string().trim().min(1).max(20),
  text: z.string().trim().min(1).max(4000),
  isCorrect: z.boolean().optional().default(false),
});

export const partnerExerciseInputSchema = z.object({
  exerciseType: partnerExerciseTypeSchema,
  difficulty: z.coerce.number().int().min(1).max(4),
  questionText: z.string().trim().min(1).max(20000),
  options: z.array(partnerOptionSchema).max(8).optional().nullable(),
  correctAnswer: z.string().trim().max(4000).optional().nullable(),
  solutionSteps: z.string().trim().max(20000).optional().nullable(),
  commonMistakes: z.array(z.string().trim().min(1).max(500)).max(20).optional().nullable(),
  courseId: z.string().uuid().optional().nullable(),
  unitId: z.string().uuid().optional().nullable(),
  visibility: partnerVisibilitySchema.optional().default("private"),
  groupId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).optional().default([]),
  stage: z.string().trim().max(120).optional().nullable(),
  subject: z.string().trim().max(120).optional().nullable(),
  gradeLevel: z.string().trim().max(120).optional().nullable(),
  textbookVersion: z.string().trim().max(120).optional().nullable(),
  knowledgePoints: z
    .array(z.string().trim().min(1).max(120))
    .max(20)
    .optional()
    .default([]),
  reviewFlag: z.enum(["disputed"]).optional().nullable(),
  reviewFlagReason: z.string().trim().max(500).optional().nullable(),
});

export type PartnerExerciseInputPayload = z.infer<typeof partnerExerciseInputSchema>;

export const partnerTeacherPayloadSchema = z.object({
  externalId: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320).optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  avatarUrl: z.string().trim().url().max(2000).optional().nullable(),
  role: partnerTeacherRoleSchema.optional().default("teacher"),
});

export const partnerGroupPayloadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  subject: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
});

export const partnerGroupMemberPayloadSchema = z.object({
  teacherId: z.string().uuid(),
  role: partnerGroupRoleSchema.optional().default("member"),
});

export const partnerCoursePayloadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().max(120).optional().nullable(),
  stage: z.string().trim().max(120).optional().nullable(),
  subject: z.string().trim().max(120).optional().nullable(),
  gradeLevel: z.string().trim().max(120).optional().nullable(),
  textbookVersion: z.string().trim().max(120).optional().nullable(),
});

export const partnerUnitPayloadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  unitNumber: z.coerce.number().int().min(0).max(999).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional().default(0),
});

export const partnerResourcePayloadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  resourceType: partnerResourceTypeSchema,
  visibility: partnerVisibilitySchema.optional().default("private"),
  groupId: z.string().uuid().optional().nullable(),
  stage: z.string().trim().max(120).optional().nullable(),
  subject: z.string().trim().max(120).optional().nullable(),
  gradeLevel: z.string().trim().max(120).optional().nullable(),
  textbookVersion: z.string().trim().max(120).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).optional().default([]),
});

export const partnerWorksheetPayloadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  courseId: z.string().uuid().optional().nullable(),
  exerciseIds: z.array(z.string().uuid()).min(1).max(200),
  points: z.array(z.coerce.number().min(0).max(1000)).optional().default([]),
  description: z.string().trim().max(2000).optional().nullable(),
});

export const partnerWorksheetExportPayloadSchema = z.object({
  includeAnswers: z.boolean().optional().default(false),
  template: z.string().trim().max(80).optional().default("default"),
});

export const partnerDateRangeSchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
});
