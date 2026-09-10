import type { AgentTaskContext } from "@/lib/agent/task-context";

const DEFER_SAVE_PATTERN =
  /(先不要(?:入库|保存(?:到题库)?)|先不(?:入库|保存(?:到题库)?)|暂时不要(?:入库|保存)|暂不入库|先别入库|先给我看|先看(?:题|结果|内容)?|先预览|后面再保存|稍后再保存)/i;
const SAVE_NOW_PATTERN =
  /(保存到题库|写入题库|加入题库|入题库|直接入库|并保存(?:到题库)?|顺手保存(?:到题库)?|保存一下)/i;

type ExerciseSaveMode = "save_now" | "defer_until_curriculum";
type ExerciseSaveDecision = {
  shouldSaveToQuestionBank: boolean;
  effectiveSaveMode: ExerciseSaveMode;
  effectiveSaveHint: string | null;
  effectivePreference: AgentTaskContext["savePreference"];
};

export function inferExerciseSavePreference(
  promptText: string,
): AgentTaskContext["savePreference"] {
  const normalized = promptText.replace(/\s+/g, " ").trim();
  if (!normalized) return "default";
  if (DEFER_SAVE_PATTERN.test(normalized)) return "temp_only";
  return "default";
}

export function resolveExerciseSaveDecision(params: {
  taskSavePreference?: AgentTaskContext["savePreference"] | null;
  promptText: string;
  curriculumSaveMode: ExerciseSaveMode;
  courseId: string | null;
  curriculumSaveHint?: string | null;
}): ExerciseSaveDecision {
  const normalizedPrompt = params.promptText.replace(/\s+/g, " ").trim();
  const explicitTempOnly = DEFER_SAVE_PATTERN.test(normalizedPrompt);
  const explicitSaveNow = SAVE_NOW_PATTERN.test(normalizedPrompt);
  const effectivePreference: AgentTaskContext["savePreference"] =
    explicitTempOnly
      ? "temp_only"
      : explicitSaveNow
        ? "default"
        : "save_after_confirm";

  // 没有课程信息时，暂缓入库（等确认课程后再保存）
  if (params.curriculumSaveMode !== "save_now" || !params.courseId) {
    return {
      shouldSaveToQuestionBank: false,
      effectiveSaveMode: "defer_until_curriculum",
      effectiveSaveHint:
        params.curriculumSaveHint ??
        "当前课程归属还没确认，所以先把题给你；如果要写入题库，再补一句课程和 Unit。",
      effectivePreference,
    };
  }

  // 用户明确说"先不保存"
  if (explicitTempOnly) {
    return {
      shouldSaveToQuestionBank: false,
      effectiveSaveMode: "defer_until_curriculum",
      effectiveSaveHint:
        "已按你的要求先生成题目，本轮不写入题库；如果确认要归档，直接回复保存到题库即可。",
      effectivePreference: "temp_only",
    };
  }

  if (!explicitSaveNow) {
    return {
      shouldSaveToQuestionBank: false,
      effectiveSaveMode: "defer_until_curriculum",
      effectiveSaveHint:
        "题目已经生成完成；如果确认要归档，直接回复“保存到题库”即可。",
      effectivePreference: "save_after_confirm",
    };
  }

  return {
    shouldSaveToQuestionBank: true,
    effectiveSaveMode: "save_now",
    effectiveSaveHint: null,
    effectivePreference: "default",
  };
}
