import type { IntentRouteResult } from "@/lib/assistant/types";
import { buildAgentTaskState } from "@/lib/agent/task-state";
import { parseIntentFromText } from "@/lib/chat/intent";
import { resolveAgentTriageDecision } from "@/lib/agent/triage/engine";
import type { AgentWorkflowId } from "@/lib/agent/triage/types";

function includesAny(input: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(input));
}

function parseExerciseCount(input: string): number | undefined {
  const match = input.match(/(\d{1,2})\s*(道|题|questions?)/i);
  if (!match) return undefined;
  const count = Number(match[1]);
  if (!Number.isFinite(count) || count < 1) return undefined;
  return Math.min(20, count);
}

function parseClassHours(input: string): number | undefined {
  const match = input.match(/(\d{1,2})\s*(课时|节课|classes?|hours?)/i);
  if (!match) return undefined;
  const hours = Number(match[1]);
  if (!Number.isFinite(hours) || hours < 1) return undefined;
  return Math.min(10, hours);
}

function parseDifficulty(input: string): "easy" | "medium" | "hard" | undefined {
  if (includesAny(input, [/简单|基础|easy/i])) return "easy";
  if (includesAny(input, [/困难|hard|challenging/i])) return "hard";
  if (includesAny(input, [/中等|medium|一般/i])) return "medium";
  return undefined;
}

function parseQuestionType(input: string): "mcq" | "frq" | undefined {
  if (includesAny(input, [/mcq|选择题|single\s*choice|multiple\s*choice/i])) return "mcq";
  if (includesAny(input, [/frq|自由问答|解答题|问答题/i])) return "frq";
  return undefined;
}

export function detectAssistantIntent(message: string): IntentRouteResult {
  const text = message.trim();
  const parsed = {
    questionType: parseQuestionType(text),
    count: parseExerciseCount(text),
    difficulty: parseDifficulty(text),
    classHours: parseClassHours(text),
  };
  const taskState = buildAgentTaskState({
    visiblePrompt: text,
    latestPrompt: text,
    lastArtifactType: "",
    hasUploadedMaterials: false,
  });
  const triageDecision = resolveAgentTriageDecision({
    promptTaskState: taskState,
    contextualTaskState: taskState,
    parsedIntent: parseIntentFromText(text),
    visiblePrompt: text,
  });

  const intent = mapWorkflowToAssistantIntent(
    triageDecision.workflow,
    triageDecision.retrievalSources,
  );
  const useWeb =
    triageDecision.retrievalSources === "web" ||
    triageDecision.retrievalSources === "mixed";
  const useKnowledge =
    triageDecision.retrievalSources === "knowledge" ||
    triageDecision.retrievalSources === "mixed" ||
    (!useWeb && triageDecision.workflow !== "retrieval");

  const followUpQuestions: string[] = [];
  if (intent === "generate_exercises") {
    if (!parsed.questionType) {
      followUpQuestions.push("需要生成 MCQ 还是 FRQ？");
    }
    if (!parsed.count) {
      followUpQuestions.push("一共需要多少题？（1-20）");
    }
    if (!parsed.difficulty) {
      followUpQuestions.push("难度希望是简单 / 中等 / 困难？");
    }
  }

  if (intent === "generate_lesson_plan" && !parsed.classHours) {
    followUpQuestions.push("这份教案计划安排多少课时？（1-10）");
  }

  return {
    intent,
    useKnowledge,
    useWeb,
    requiresFollowUp: followUpQuestions.length > 0,
    followUpQuestions,
    parsed,
  };
}

function mapWorkflowToAssistantIntent(
  workflow: AgentWorkflowId,
  retrievalSources: ReturnType<typeof resolveAgentTriageDecision>["retrievalSources"],
): IntentRouteResult["intent"] {
  if (workflow === "lesson_plan") return "generate_lesson_plan";
  if (workflow === "rubric") return "generate_rubric";
  if (
    workflow === "exercises" ||
    workflow === "worksheet" ||
    workflow === "question_bank" ||
    workflow === "answer_key" ||
    workflow === "adapt_difficulty" ||
    workflow === "exit_ticket"
  ) {
    return "generate_exercises";
  }
  if (workflow === "retrieval") {
    return retrievalSources === "knowledge" ? "knowledge_qa" : "search_web";
  }
  if (retrievalSources === "knowledge") {
    return "knowledge_qa";
  }
  return "general_chat";
}
