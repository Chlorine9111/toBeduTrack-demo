import { z } from "zod";

const inferredParamsSchema = z.object({
  curriculumSystem: z.enum(["AP", "IB", "CN"]),
  primarySubject: z.string().trim().min(1),
  grade: z.string().trim().min(1),
  totalPeriods: z.number().int().min(2).max(60),
  difficulty: z.enum(["basic", "advanced", "challenge"]),
  topic: z.string().trim().min(1),
  knowledgePoints: z.array(z.string().trim().min(1)).default([]),
});

const searchResultSchema = z.object({
  title: z.string().trim().min(1),
  url: z.string().trim().url(),
  snippet: z.string().trim().default(""),
  type: z.enum(["case", "regulation", "pbl_reference", "article", "video"]),
});

const chatMessageSchema = z.object({
  id: z.string().trim().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1),
  changeSummary: z.string().trim().optional(),
  createdAt: z.string().trim().min(1),
});

export const projectPlanSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  originalPrompt: z.string().trim().default(""),
  inferredParams: inferredParamsSchema,
  markdownContent: z.string().trim().min(1),
  drivingQuestion: z.string().trim().min(1),
  primarySubject: z.string().trim().min(1),
  curriculumSystem: z.enum(["AP", "IB", "CN"]),
  grade: z.string().trim().min(1),
  searchResults: z.array(searchResultSchema).default([]),
  chatHistory: z.array(chatMessageSchema).default([]),
  status: z.enum(["draft", "confirmed", "archived"]).default("draft"),
  version: z.number().int().min(1).default(1),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  overviewText: z.string().default(""),
  totalPeriods: z.number().int().min(2).max(60),
  difficulty: z.enum(["basic", "advanced", "challenge"]),
  crossSubjects: z.array(z.string()).default([]),
  suggestedGroupSize: z.number().int().min(1).default(4),
  suggestedGroupCount: z.number().int().min(1).default(8),
  finalOutcomeForm: z.string().default(""),
  finalOutcomeRequirements: z.string().default(""),
  projectBrief: z.object({
    realWorldContext: z.string().default(""),
    coreChallenge: z.string().default(""),
    researchBoundary: z.string().default(""),
    stakeholders: z.array(z.string()).default([]),
    successCriteria: z.array(z.string()).default([]),
    recommendedEvidence: z.array(z.string()).default([]),
  }),
  targetAudience: z.string().default(""),
  presentationFormat: z.string().default(""),
  stages: z.array(z.any()).default([]),
  curriculumAlignment: z.array(z.any()).default([]),
  rubric: z.array(z.any()).default([]),
  assessments: z.array(z.any()).default([]),
  materialReferences: z.array(z.any()).default([]),
  teacherGuidance: z.object({
    commonDifficulties: z.array(z.string()).default([]),
    differentiation: z.array(z.string()).default([]),
    timeManagement: z.array(z.string()).default([]),
    crossDisciplineCollab: z.array(z.string()).default([]),
  }),
  studentVersionMarkdown: z.string().default(""),
  qualityCheck: z.array(z.any()).default([]),
  requestId: z.string().nullable().optional(),
  overviewOption: z.enum(["A", "B", "C"]).nullable().optional(),
});

export type ProjectPlan = z.infer<typeof projectPlanSchema>;
