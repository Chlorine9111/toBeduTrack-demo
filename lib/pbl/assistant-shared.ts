import { z } from "zod";
import { normalizeDifficulty } from "@/lib/pbl/defaults";
import {
  PBL_GRADE_OPTIONS,
  clampPeriods,
  getDefaultSubjectForCurriculum,
  normalizeGradeOption,
  normalizeSubjectForCurriculum,
} from "@/lib/pbl/options";
import type { PblCurriculumSystem, PblDifficulty, PblGenerationInput } from "@/lib/pbl/types";

export const PBL_ASSISTANT_ACTIONS = [
  "reply_only",
  "update_input",
  "generate_overviews",
  "expand_overview",
  "generate_and_expand",
  "patch_plan",
] as const;

export type PblAssistantAction = (typeof PBL_ASSISTANT_ACTIONS)[number];

export const pblAssistantInputPatchSchema = z.object({
  curriculumSystem: z.enum(["AP", "IB", "CN"]).optional(),
  primarySubject: z.string().trim().min(1).optional(),
  grade: z.string().trim().min(1).optional(),
  totalPeriods: z.number().int().min(2).max(60).optional(),
  topic: z.string().trim().max(200).optional(),
  difficulty: z.enum(["basic", "advanced", "challenge"]).optional(),
  specialRequirements: z.string().trim().max(4000).optional(),
});

export type PblAssistantInputPatch = z.infer<typeof pblAssistantInputPatchSchema>;

export const pblPlanPatchSchema = z.object({
  stageNumber: z.number().int().min(1).optional(),
  field: z.enum([
    "objective",
    "coreActivities",
    "teacherRole",
    "knowledgeEmbedding",
    "scaffolding",
    "deliverables",
    "drivingQuestion",
    "overviewText",
    "finalOutcomeRequirements",
    "name",
    "timeSuggestion",
    "requiredResources",
  ]).optional(),
  instruction: z.string().trim().min(1),
});

export type PblPlanPatch = z.infer<typeof pblPlanPatchSchema>;

export const pblAssistantTurnResponseSchema = z.object({
  reply: z.string().trim().min(1),
  action: z.enum(PBL_ASSISTANT_ACTIONS),
  optionLabel: z.enum(["A", "B", "C"]).optional(),
  inputPatch: pblAssistantInputPatchSchema.default({}),
  planPatch: pblPlanPatchSchema.optional(),
});

export type PblAssistantTurnResponse = z.infer<typeof pblAssistantTurnResponseSchema>;

function normalizePatch(
  currentInput: PblGenerationInput,
  patch: PblAssistantInputPatch,
): PblAssistantInputPatch {
  const nextCurriculum = patch.curriculumSystem ?? currentInput.curriculumSystem;
  const normalizedPatch: PblAssistantInputPatch = {};

  if (patch.curriculumSystem) {
    normalizedPatch.curriculumSystem = patch.curriculumSystem;
  }

  if (patch.primarySubject || patch.curriculumSystem) {
    normalizedPatch.primarySubject = normalizeSubjectForCurriculum(
      nextCurriculum,
      patch.primarySubject ?? currentInput.primarySubject,
    );
  }

  if (patch.grade) {
    normalizedPatch.grade = normalizeGradeOption(
      patch.grade,
      currentInput.grade as (typeof PBL_GRADE_OPTIONS)[number],
    );
  }

  if (patch.totalPeriods != null) {
    normalizedPatch.totalPeriods = clampPeriods(patch.totalPeriods);
  }

  if ("topic" in patch) {
    normalizedPatch.topic = patch.topic?.trim() || "";
  }

  if (patch.difficulty) {
    normalizedPatch.difficulty = normalizeDifficulty(patch.difficulty) as PblDifficulty;
  }

  if ("specialRequirements" in patch) {
    normalizedPatch.specialRequirements = patch.specialRequirements?.trim() || "";
  }

  return normalizedPatch;
}

export function applyPblInputPatch(
  currentInput: PblGenerationInput,
  patch: PblAssistantInputPatch,
): PblGenerationInput {
  const normalizedPatch = normalizePatch(currentInput, patch);
  const nextCurriculum = normalizedPatch.curriculumSystem ?? currentInput.curriculumSystem;

  return {
    ...currentInput,
    ...normalizedPatch,
    curriculumSystem: nextCurriculum as PblCurriculumSystem,
    primarySubject:
      normalizedPatch.primarySubject ??
      normalizeSubjectForCurriculum(nextCurriculum, currentInput.primarySubject),
    grade: normalizedPatch.grade ?? currentInput.grade,
    totalPeriods: normalizedPatch.totalPeriods ?? currentInput.totalPeriods,
    topic: "topic" in patch ? normalizedPatch.topic || undefined : currentInput.topic,
    difficulty: normalizedPatch.difficulty ?? currentInput.difficulty,
    specialRequirements:
      "specialRequirements" in patch
        ? normalizedPatch.specialRequirements
        : currentInput.specialRequirements,
  };
}

export function getDefaultPblSubjectForCurriculum(curriculumSystem: PblCurriculumSystem) {
  return getDefaultSubjectForCurriculum(curriculumSystem);
}
