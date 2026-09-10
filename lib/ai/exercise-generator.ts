/**
 * Exercise generator: assemble prompt -> call Kimi -> validate output.
 */
import type { ExerciseAIOutput } from "@/types/exercise";
import { exerciseAIOutputSchema } from "@/lib/validation/ai";
import {
  buildExercisePrompt,
  renderSystemPrompt,
  type ExercisePromptInput,
} from "@/lib/ai/prompt-assembler";
import { generateStructuredObject } from "@/lib/ai/structured-output";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";

export type PrebuiltExercisePrompt = {
  prompt: string;
  systemPrompt: string;
};

function resolveExerciseSystemTaskType(
  exerciseType: ExercisePromptInput["exerciseType"],
): "mc_exercise" | "fr_exercise" {
  return exerciseType === "MC" ? "mc_exercise" : "fr_exercise";
}

export function calculateExerciseMaxTokens(params: {
  exerciseType: ExercisePromptInput["exerciseType"];
  count: number;
}) {
  const count = Math.max(1, Math.floor(params.count));
  // per-question token：MC ~900/题（题干+4选项+解析），FR ~1300/题
  const perQuestion = params.exerciseType === "FR" ? 1300 : 900;
  const structureOverhead = 800; // JSON 结构开销
  const raw = count * perQuestion + structureOverhead;
  // 下界 2000，上界 20000（防止成本爆炸）
  return Math.max(2000, Math.min(20000, raw));
}

export function resolveExerciseTemperature(params: {
  count: number;
  requestCountHint?: number;
}) {
  const count = Math.max(1, Math.floor(params.requestCountHint ?? params.count));
  if (count === 1) return 0.3;
  if (count <= 5) return 0.5;
  return 0.6;
}

export async function generateExercises(
  input: ExercisePromptInput & {
    prebuiltPrompt?: PrebuiltExercisePrompt;
  },
): Promise<ExerciseAIOutput> {
  const promptContext = input.prebuiltPrompt
    ? {
        prompt: input.prebuiltPrompt.prompt,
        systemPrompt: input.prebuiltPrompt.systemPrompt,
      }
    : (() => undefined)();
  const assembled = promptContext
    ? promptContext
    : await (async () => {
        const { prompt, systemContext } = await buildExercisePrompt(input);
        const systemPrompt = await renderSystemPrompt(
          systemContext,
          resolveExerciseSystemTaskType(input.exerciseType),
          {
            track: input.track,
            subjectCategory: input.subjectCategory,
          },
        );
        return { prompt, systemPrompt };
      })();
  const model = getResolvedLanguageModelForTask("exercise_generate");
  const maxTokens = Math.max(
    2000,
    calculateExerciseMaxTokens({
      exerciseType: input.exerciseType,
      count: input.count,
    }),
  );
  const temperature = resolveExerciseTemperature({
    count: input.count,
    requestCountHint: input.requestCountHint,
  });

  const raw = await generateStructuredObject({
    model,
    schema: exerciseAIOutputSchema,
    systemPrompt: assembled.systemPrompt,
    userPrompt: assembled.prompt,
    maxTokens,
    temperature,
  });

  const validated = exerciseAIOutputSchema.parse(raw) as ExerciseAIOutput;

  return normalizeExerciseAIOutput(validated, input);
}

function normalizeExerciseAIOutput(
  output: ExerciseAIOutput,
  input: ExercisePromptInput,
): ExerciseAIOutput {
  const fallbackDifficulty = input.difficulty;
  const validTopicIds = new Set((input.preloaded?.topics ?? []).map((topic) => topic.id));
  const fallbackTopicId =
    input.topicId ??
    input.preloaded?.selectedTopic?.id ??
    input.preloaded?.topics[0]?.id ??
    "";

  return {
    ...output,
    exercises: output.exercises.map((exercise) => {
      const difficulty =
        typeof exercise.difficulty === "number"
          ? exercise.difficulty
          : typeof exercise.difficulty === "string"
            ? difficultyFromLabel(exercise.difficulty, fallbackDifficulty)
            : fallbackDifficulty;

      const normalizedType =
        exercise.type ??
        (exercise.questionType === "MCQ" ? "MC" : exercise.questionType === "FRQ" ? "FR" : undefined) ??
        (exercise.question_type === "MCQ" ? "MC" : exercise.question_type === "FRQ" ? "FR" : undefined);

      const questionText = exercise.questionText ?? exercise.stem ?? "";
      const correctAnswer = exercise.correctAnswer ?? exercise.correct_answer ?? "";
      const solutionSteps = exercise.solutionSteps ?? exercise.solution ?? "";
      const rawTopicId =
        typeof exercise.topicId === "string"
          ? exercise.topicId
          : typeof exercise.topic_id === "string"
            ? exercise.topic_id
            : "";
      const trimmedTopicId = rawTopicId.trim();
      const topicId =
        trimmedTopicId && (validTopicIds.size === 0 || validTopicIds.has(trimmedTopicId))
          ? trimmedTopicId
          : fallbackTopicId;

      let options = exercise.options;
      if (options && !Array.isArray(options)) {
        const optionMap = options as Record<string, string>;
        options = ["A", "B", "C", "D"]
          .filter((label) => optionMap[label])
          .map((label) => ({
            label,
            text: optionMap[label],
            isCorrect: correctAnswer === label,
          }));
      }

      return {
        ...exercise,
        questionText,
        type: normalizedType ?? exercise.type ?? "FR",
        difficulty,
        topicId,
        correctAnswer,
        solutionSteps,
        options,
      };
    }),
  };
}

function difficultyFromLabel(
  label: string,
  fallback: ExercisePromptInput["difficulty"],
): ExercisePromptInput["difficulty"] {
  if (label === "easy") return "easy";
  if (label === "medium") return "medium";
  if (label === "hard") return "hard";
  return fallback;
}
