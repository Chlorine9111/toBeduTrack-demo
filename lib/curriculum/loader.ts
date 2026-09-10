/**
 * Curriculum data loader for courses, units, topics, and AI examples.
 */
import { readFile } from "fs/promises";
import path from "path";
import type { Course, Unit, Topic, CurriculumObjective } from "@/types/curriculum";
import type { RubricAIOutput } from "@/types/rubric";
import { fromExerciseDifficulty, type ExerciseAIOutput, type ExerciseType, type ExerciseDifficulty } from "@/types/exercise";
import { exerciseAIOutputSchema, rubricAIOutputSchema } from "@/lib/validation/ai";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { detectSubjectCategory, type SubjectCategory } from "@/lib/ai/subject-category";

function normalizeObjectives(value: unknown, fallbackPrefix: string): CurriculumObjective[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (typeof item === "string") {
        return {
          code: `${fallbackPrefix}${index + 1}`,
          description: item,
        };
      }
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const code =
          typeof record.code === "string"
            ? record.code
            : typeof record.lo_id === "string"
              ? record.lo_id
              : typeof record.ek_id === "string"
                ? record.ek_id
                : typeof record.loId === "string"
                  ? record.loId
                  : typeof record.ekId === "string"
                    ? record.ekId
                    : typeof record.id === "string"
                      ? record.id
                      : `${fallbackPrefix}${index + 1}`;
        const description =
          typeof record.description === "string"
            ? record.description
            : typeof record.text === "string"
              ? record.text
              : typeof record.statement === "string"
                ? record.statement
                : JSON.stringify(record);
        return {
          code,
          description,
        };
      }
      return null;
    })
    .filter((item): item is CurriculumObjective => Boolean(item));
}

type AppSupabaseClient = SupabaseClient<Database>;

const COURSE_SELECT = [
  "id",
  "framework",
  "name",
  "code",
  "description",
  "created_at",
  "updated_at",
].join(",");

const UNIT_SELECT = [
  "id",
  "course_id",
  "unit_number",
  "title",
  "description",
  "created_at",
  "updated_at",
].join(",");

const TOPIC_SELECT = [
  "id",
  "unit_id",
  "topic_number",
  "title",
  "learning_objectives",
  "essential_knowledge",
  "math_practices",
  "created_at",
  "updated_at",
].join(",");
type StaticExerciseExampleDocument = {
  examples?: Array<{
    label?: string;
    block?: unknown;
  }>;
};

const staticExerciseExampleCache = new Map<
  string,
  Promise<ExerciseAIOutput["exercises"]>
>();

const difficultyLabelByLevel: Record<ExerciseDifficulty, "easy" | "medium" | "hard"> = {
  easy: "easy",
  medium: "medium",
  hard: "hard",
};

const staticDifficultyFallbackOrder: Record<"easy" | "medium" | "hard", string[]> = {
  easy: ["easy", "medium", "hard"],
  medium: ["medium", "easy", "hard"],
  hard: ["hard", "medium", "easy"],
};

async function loadStaticExerciseExampleFile(
  filename: string,
): Promise<ExerciseAIOutput["exercises"]> {
  const absolutePath = path.join(
    process.cwd(),
    "lib",
    "ai",
    "prompts",
    "examples",
    filename,
  );
  const cached = staticExerciseExampleCache.get(absolutePath);
  if (cached) {
    return cached;
  }

  const readPromise = readFile(absolutePath, "utf-8")
    .then((raw) => {
      const parsed = JSON.parse(raw) as StaticExerciseExampleDocument;
      const blocks = Array.isArray(parsed.examples)
        ? parsed.examples
            .map((example) => example.block)
            .filter(
              (block): block is ExerciseAIOutput["exercises"][number] =>
                Boolean(block && typeof block === "object"),
            )
        : [];
      if (blocks.length === 0) {
        return [];
      }

      const validated = exerciseAIOutputSchema.safeParse({ exercises: blocks });
      if (!validated.success) {
        console.error(
          `Invalid static exercise examples in ${filename}`,
          validated.error.flatten(),
        );
        return [];
      }

      return validated.data.exercises as ExerciseAIOutput["exercises"];
    })
    .catch((error: NodeJS.ErrnoException) => {
      staticExerciseExampleCache.delete(absolutePath);
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    });

  staticExerciseExampleCache.set(absolutePath, readPromise);
  return readPromise;
}

function resolveStaticExerciseSubject(options?: {
  courseName?: string;
  subjectCategory?: string | SubjectCategory | null;
}): SubjectCategory | null {
  const subjectFromOverride = detectSubjectCategory(options?.subjectCategory ?? "");
  if (subjectFromOverride) {
    return subjectFromOverride;
  }
  return detectSubjectCategory(options?.courseName ?? "");
}

function buildStaticExerciseExampleCandidates(params: {
  subject: SubjectCategory;
  exerciseType: ExerciseType;
  difficulty: ExerciseDifficulty;
}) {
  if (params.exerciseType !== "MC" && params.exerciseType !== "FR") {
    return [];
  }

  const typeLabel = params.exerciseType === "MC" ? "mc" : "fr";
  const requestedDifficulty = difficultyLabelByLevel[params.difficulty];
  const filenames = staticDifficultyFallbackOrder[requestedDifficulty].map(
    (difficultyLabel) =>
      `exercise-${typeLabel}-${params.subject}-${difficultyLabel}.json`,
  );

  return Array.from(new Set(filenames));
}

async function loadStaticExerciseExamples(params: {
  courseName?: string;
  subjectCategory?: string | SubjectCategory | null;
  exerciseType: ExerciseType;
  difficulty: ExerciseDifficulty;
  limit: number;
}): Promise<ExerciseAIOutput["exercises"]> {
  const subject = resolveStaticExerciseSubject({
    courseName: params.courseName,
    subjectCategory: params.subjectCategory,
  });
  if (!subject || params.limit <= 0) {
    return [];
  }

  const candidates = buildStaticExerciseExampleCandidates({
    subject,
    exerciseType: params.exerciseType,
    difficulty: params.difficulty,
  });
  if (candidates.length === 0) {
    return [];
  }

  const collected: ExerciseAIOutput["exercises"] = [];
  const seenKeys = new Set<string>();

  for (const filename of candidates) {
    const examples = await loadStaticExerciseExampleFile(filename);
    for (const example of examples) {
      const key = [
        example.type ?? example.questionType ?? example.question_type ?? "",
        example.topicId ?? example.topic_id ?? "",
        example.questionText ?? example.stem ?? "",
      ].join("::");
      if (seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);
      collected.push(example);
      if (collected.length >= params.limit) {
        return collected;
      }
    }
  }

  return collected;
}

export async function loadCourse(
  courseId: string,
  supabaseOverride?: AppSupabaseClient,
): Promise<Course | null> {
  const supabase: AppSupabaseClient =
    supabaseOverride ?? ((await createServerSupabaseClient()) as AppSupabaseClient);
  const { data, error } = await supabase
    .from("courses")
    .select(COURSE_SELECT)
    .eq("id", courseId)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error("Failed to load course", error);
    }
    return null;
  }

  const course = data as unknown as Database["public"]["Tables"]["courses"]["Row"];

  return {
    id: course.id,
    framework: course.framework as Course["framework"],
    name: course.name,
    code: course.code,
    description: course.description,
    createdAt: course.created_at,
    updatedAt: course.updated_at,
  };
}

export async function loadUnitWithTopics(
  unitId: string,
  supabaseOverride?: AppSupabaseClient,
): Promise<{
  unit: Unit | null;
  topics: Topic[];
}> {
  const supabase: AppSupabaseClient =
    supabaseOverride ?? ((await createServerSupabaseClient()) as AppSupabaseClient);
  const { data: unitData, error: unitError } = await supabase
    .from("units")
    .select(UNIT_SELECT)
    .eq("id", unitId)
    .maybeSingle();

  if (unitError || !unitData) {
    if (unitError) {
      console.error("Failed to load unit", unitError);
    }
    return { unit: null, topics: [] };
  }

  const unit = unitData as unknown as Database["public"]["Tables"]["units"]["Row"];

  const { data: topicRows, error: topicsError } = await supabase
    .from("topics")
    .select(TOPIC_SELECT)
    .eq("unit_id", unitId)
    .order("topic_number", { ascending: true });

  if (topicsError) {
    console.error("Failed to load topics", topicsError);
  }

  const topics = (
    (topicRows ?? []) as unknown as Database["public"]["Tables"]["topics"]["Row"][]
  ).map((topic) => ({
    id: topic.id,
    unitId: topic.unit_id,
    topicNumber: topic.topic_number,
    title: topic.title,
    learningObjectives: normalizeObjectives(
      topic.learning_objectives,
      "LO",
    ),
    essentialKnowledge: normalizeObjectives(
      topic.essential_knowledge,
      "EK",
    ),
    mathPractices: topic.math_practices ?? [],
    createdAt: topic.created_at,
    updatedAt: topic.updated_at,
  }));

  return {
    unit: {
      id: unit.id,
      courseId: unit.course_id,
      unitNumber: unit.unit_number,
      title: unit.title,
      description: unit.description,
      createdAt: unit.created_at,
      updatedAt: unit.updated_at,
    },
    topics,
  };
}

export async function loadTopic(
  topicId: string,
  supabaseOverride?: AppSupabaseClient,
): Promise<Topic | null> {
  const supabase: AppSupabaseClient =
    supabaseOverride ?? ((await createServerSupabaseClient()) as AppSupabaseClient);
  const { data, error } = await supabase
    .from("topics")
    .select(TOPIC_SELECT)
    .eq("id", topicId)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error("Failed to load topic", error);
    }
    return null;
  }

  const topic = data as unknown as Database["public"]["Tables"]["topics"]["Row"];

  return {
    id: topic.id,
    unitId: topic.unit_id,
    topicNumber: topic.topic_number,
    title: topic.title,
    learningObjectives: normalizeObjectives(topic.learning_objectives, "LO"),
    essentialKnowledge: normalizeObjectives(topic.essential_knowledge, "EK"),
    mathPractices: topic.math_practices ?? [],
    createdAt: topic.created_at,
    updatedAt: topic.updated_at,
  };
}

export async function loadRubricExamples(
  courseId: string,
  unitId?: string,
  limit = 2,
  supabaseOverride?: AppSupabaseClient,
): Promise<RubricAIOutput[]> {
  const supabase: AppSupabaseClient =
    supabaseOverride ?? ((await createServerSupabaseClient()) as AppSupabaseClient);
  const examples: RubricAIOutput[] = [];

  if (unitId) {
    const { data: unitExamples, error: unitError } = await supabase
      .from("rubric_examples")
      .select("rubric_json")
      .eq("course_id", courseId)
      .eq("unit_id", unitId)
      .limit(limit);

    if (unitError) {
      console.error("Failed to load rubric examples", unitError);
    }

    (unitExamples ?? []).forEach((row) => {
      const parsed = rubricAIOutputSchema.safeParse(row.rubric_json);
      if (parsed.success) {
        examples.push(parsed.data);
      }
    });
  }

  if (examples.length < limit) {
    const { data: courseExamples, error: courseError } = await supabase
      .from("rubric_examples")
      .select("rubric_json")
      .eq("course_id", courseId)
      .is("unit_id", null)
      .limit(limit - examples.length);

    if (courseError) {
      console.error("Failed to load rubric examples", courseError);
    }

    (courseExamples ?? []).forEach((row) => {
      const parsed = rubricAIOutputSchema.safeParse(row.rubric_json);
      if (parsed.success) {
        examples.push(parsed.data);
      }
    });
  }

  return examples;
}

export async function loadExerciseExamples(
  courseId: string,
  exerciseType: ExerciseType,
  difficulty: ExerciseDifficulty,
  limit = 2,
  supabaseOverride?: AppSupabaseClient,
  options?: {
    courseName?: string;
    subjectCategory?: string | SubjectCategory | null;
  },
): Promise<ExerciseAIOutput["exercises"]> {
  const supabase: AppSupabaseClient =
    supabaseOverride ?? ((await createServerSupabaseClient()) as AppSupabaseClient);
  const examples: ExerciseAIOutput["exercises"] = [];

  const { data: primary, error: primaryError } = await supabase
    .from("exercise_examples")
    .select("exercise_json")
    .eq("course_id", courseId)
    .eq("exercise_type", exerciseType)
    .eq("difficulty", fromExerciseDifficulty(difficulty))
    .order("created_at", { ascending: false })
    .limit(limit);

  if (primaryError) {
    console.error("Failed to load exercise examples", primaryError);
  }

  const normalizedPrimary =
    primary?.map((row) => row.exercise_json as ExerciseAIOutput["exercises"][number]) ??
    [];
  examples.push(...normalizedPrimary);

  const fallbackDifficultyMap: Record<ExerciseDifficulty, ExerciseDifficulty[]> = {
    easy: ["medium"],
    medium: ["easy", "hard"],
    hard: ["medium"],
  };
  const fallbackDifficulties = fallbackDifficultyMap[difficulty] ?? [];

  if (examples.length < limit && fallbackDifficulties.length > 0) {
    const remaining = Math.max(limit - examples.length, 0);
    const { data: fallback, error: fallbackError } = await supabase
      .from("exercise_examples")
      .select("exercise_json")
      .eq("course_id", courseId)
      .eq("exercise_type", exerciseType)
      .in("difficulty", fallbackDifficulties.map(fromExerciseDifficulty))
      .order("created_at", { ascending: false })
      .limit(remaining);

    if (fallbackError) {
      console.error("Failed to load fallback exercise examples", fallbackError);
    } else {
      const normalizedFallback =
        fallback?.map((row) => row.exercise_json as ExerciseAIOutput["exercises"][number]) ??
        [];
      examples.push(...normalizedFallback);
    }
  }

  if (examples.length < limit) {
    const staticExamples = await loadStaticExerciseExamples({
      courseName: options?.courseName,
      subjectCategory: options?.subjectCategory,
      exerciseType,
      difficulty,
      limit: limit - examples.length,
    });
    examples.push(...staticExamples);
  }

  return examples.slice(0, limit);
}
