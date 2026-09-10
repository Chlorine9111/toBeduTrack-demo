import type { AgentTaskContext } from "@/lib/agent/task-context";
import type { StoredConversationMessage } from "@/lib/agent/chat-shared";
import {
  looksLikeQuestionBankRetrievalRequest,
  parseIntentFromText,
} from "@/lib/chat/intent";

export const EXERCISE_CONTEXT_PATTERN =
  /(生成练习题|生成习题|generate\s+questions?|worksheet|选择题|问答题|frq|题量|多少道题|多少道)/i;
const EXERCISE_TYPE_PATTERN =
  /(选择题|multiple\s*choice|mcq|mc\b|question\s*type:\s*mc)/i;
const EXERCISE_FR_PATTERN =
  /(问答题|简答题|free\s*response|frq|fr\b|question\s*type:\s*fr)/i;
const ENGLISH_PATTERN = /(英文|english)/i;
const CHINESE_PATTERN = /(中文|chinese)/i;
const DIFFICULTY_PATTERN =
  /(基础|简单|中等|困难|challenging|hard|easy|medium)/i;
const SUBJECT_DETAIL_PATTERN =
  /(ap\s+(biology|chemistry|physics|calculus|statistics|history|english|environmental\s*science)|biology|chemistry|physics|calculus|statistics|environmental\s*science|unit\s*\d+)/i;
const EXERCISE_COUNT_ONLY_CONTINUATION_PATTERN =
  /^(再来|再出|再给|再补|继续|接着|再生成|再做|再来个|再来一组|another|give me another|continue)\s*(\d+|几|几道|几题)?.*(道题|题|道)?\s*[！!。.]?$/i;

function collectRecentConversationText(
  previousMessages: StoredConversationMessage[],
  limit = 6,
) {
  return previousMessages
    .slice(-limit)
    .map((item) => item.content)
    .join("\n");
}

function looksLikeExerciseFollowUp(message: string) {
  const text = message.trim();
  if (!text) return false;
  const signalCount = [
    EXERCISE_TYPE_PATTERN.test(text) || EXERCISE_FR_PATTERN.test(text),
    ENGLISH_PATTERN.test(text) || CHINESE_PATTERN.test(text),
    DIFFICULTY_PATTERN.test(text),
    SUBJECT_DETAIL_PATTERN.test(text),
  ].filter(Boolean).length;
  return signalCount >= 2;
}

export function shouldHandleExerciseDirectly(params: {
  latestUserPrompt: string;
  displayUserPrompt: string;
  previousMessages: StoredConversationMessage[];
  taskContext?: AgentTaskContext | null;
}) {
  const currentPrompt = params.displayUserPrompt || params.latestUserPrompt;
  if (looksLikeQuestionBankRetrievalRequest(currentPrompt)) {
    return false;
  }

  if (
    params.taskContext?.kind === "exercise" &&
    (params.taskContext.action === "generate_exercises" ||
      params.taskContext.action === "create_worksheet") &&
    params.taskContext.mode === "continuation"
  ) {
    return true;
  }

  const currentIntent = parseIntentFromText(currentPrompt);
  if (
    currentIntent.actions.includes("generate_exercises") ||
    currentIntent.actions.includes("create_worksheet")
  ) {
    return true;
  }

  const recentText = collectRecentConversationText(params.previousMessages);
  if (
    EXERCISE_CONTEXT_PATTERN.test(recentText) &&
    EXERCISE_COUNT_ONLY_CONTINUATION_PATTERN.test(currentPrompt)
  ) {
    return true;
  }

  return (
    EXERCISE_CONTEXT_PATTERN.test(recentText) &&
    looksLikeExerciseFollowUp(currentPrompt)
  );
}
