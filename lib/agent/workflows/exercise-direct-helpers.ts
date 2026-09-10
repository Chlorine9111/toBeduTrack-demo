import { extractRequestedCount } from "@/lib/text/count-parser";
import type { ParsedIntent } from "@/lib/chat/intent";
import type { ApExercisePipelineOutput } from "@/lib/agent/exercise-pipeline";
import type { AgentTaskContext } from "@/lib/agent/task-context";
import { resolveExerciseSaveDecision as resolveExerciseSaveDecisionCore } from "@/lib/agent/exercise-save-preference";

const EXERCISE_TYPE_PATTERN =
  /(选择题|multiple\s*choice|mcq|mc\b|question\s*type:\s*mc)/i;
const EXERCISE_FR_PATTERN =
  /(问答题|简答题|free\s*response|frq|fr\b|question\s*type:\s*fr)/i;
const ENGLISH_PATTERN = /(英文|english)/i;
const CHINESE_PATTERN = /(中文|chinese)/i;

export function collectRecentConversationText(
  previousMessages: Array<{ content: string }>,
  limit = 6,
) {
  return previousMessages
    .slice(-limit)
    .map((item) => item.content)
    .join("\n");
}

export function inferExerciseCount(texts: string[]) {
  for (const text of texts) {
    const value = extractRequestedCount(text);
    if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 1 &&
      value <= 20
    ) {
      return Math.max(1, Math.min(20, value));
    }
  }
  return 5;
}

export function inferExerciseType(texts: string[], parsedIntent: ParsedIntent) {
  if (
    parsedIntent.exerciseParams?.exerciseType === "FR" ||
    parsedIntent.exerciseType === "FR"
  ) {
    return "FR" as const;
  }
  if (
    parsedIntent.exerciseParams?.exerciseType === "MC" ||
    parsedIntent.exerciseType === "MC"
  ) {
    return "MC" as const;
  }
  for (const text of texts) {
    if (EXERCISE_FR_PATTERN.test(text)) return "FR" as const;
    if (EXERCISE_TYPE_PATTERN.test(text)) return "MC" as const;
  }
  return "MC" as const;
}

export function inferExerciseLanguage(texts: string[]) {
  for (const text of texts) {
    if (ENGLISH_PATTERN.test(text)) return "英文" as const;
    if (CHINESE_PATTERN.test(text)) return "中文" as const;
  }

  const merged = texts.join(" ");
  const chineseChars = (merged.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const latinChars = (merged.match(/[a-z]/gi) ?? []).length;
  return latinChars > chineseChars ? ("英文" as const) : ("中文" as const);
}

export function resolveExerciseSaveDecision(params: {
  taskSavePreference?: AgentTaskContext["savePreference"] | null;
  promptText: string;
  curriculumSaveMode: "save_now" | "defer_until_curriculum";
  courseId: string | null;
  curriculumSaveHint?: string | null;
}) {
  return resolveExerciseSaveDecisionCore(params);
}

export { shouldCarryWorksheetConversation } from "@/lib/agent/workflows/worksheet-shared";

export function formatExerciseAssistantText(params: {
  courseName: string | null;
  unitLabel: string | null;
  topicName: string | null;
  output: ApExercisePipelineOutput;
  savedCount: number;
  saveMode: "save_now" | "defer_until_curriculum";
  savePreference: AgentTaskContext["savePreference"];
  saveHint?: string | null;
}) {
  const passed = params.output.metrics.passed;
  const exerciseType =
    params.output.blueprint.exerciseType === "MC" ? "选择题" : "问答题";

  const scopeParts = [
    params.courseName,
    params.unitLabel,
    params.topicName,
  ].filter(Boolean);
  const scopeLabel = scopeParts.length > 0 ? scopeParts.join(" · ") : "";

  const saveNote =
    params.savedCount > 0
        ? `已保存到题库。`
      : params.savePreference === "temp_only"
        ? "本轮先不入库。"
      : params.savePreference === "default" &&
          params.saveMode === "defer_until_curriculum"
        ? params.saveHint ||
          "如需写入题库，请补充课程和 Unit 信息。"
        : "";

  const headline = [
    `已生成 ${passed} 道${exerciseType}`,
    scopeLabel ? `（${scopeLabel}）` : "",
    saveNote ? `。${saveNote}` : "。",
  ].join("");

  const fallbackNote =
    params.output.fallbackUsed &&
    params.output.fallbackReason !== "interactive_low_latency"
      ? "提示：这批题建议抽查 1-2 道后再直接发给学生。"
      : "";

  const summaryText = [headline, fallbackNote]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const questionBlocks = params.output.passedResults.map((item, index) => {
    const options =
      item.exercise.type === "MC" && item.exercise.options?.length
        ? `\n${item.exercise.options
            .map((option) => `${option.label}. ${option.text}`)
            .join("\n")}`
        : "";
    const commonMistakes = item.exercise.commonMistakes.length
      ? `\n常见误区：${item.exercise.commonMistakes.join("；")}`
      : "";
    return [
      `### 第 ${index + 1} 题`,
      item.exercise.questionText,
      options,
      `答案：${item.exercise.correctAnswer}`,
      `解析：${item.exercise.solutionSteps}`,
      commonMistakes,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [summaryText, ...questionBlocks]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function formatExerciseAssistantSummaryText(params: Parameters<typeof formatExerciseAssistantText>[0]) {
  const fullText = formatExerciseAssistantText(params);
  const [summary] = fullText.split(/\n{2,}/);
  return summary?.trim() ?? "";
}
