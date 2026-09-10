/**
 * Prompt assembler that injects curriculum context and examples into templates.
 */
import type { ExerciseAIOutput, ExerciseType, ExerciseDifficulty } from "@/types/exercise";
import type { Course, Unit, Topic, CurriculumObjective } from "@/types/curriculum";
import type { RubricAIOutput } from "@/types/rubric";
import type {
  CedTopicMatch,
  LessonPlanBlock,
  LessonPlanPreferences,
  OutlineSection,
} from "@/lib/lesson-plan/types";
import { readFile } from "fs/promises";
import path from "path";
import {
  loadCourse,
  loadExerciseExamples,
  loadRubricExamples,
  loadTopic,
  loadUnitWithTopics,
} from "@/lib/curriculum/loader";
import { budgetPromptSections, trimTextToApproxTokens } from "@/lib/ai/prompt-budget";
import { BANNED_VAGUE_WORDS } from "@/lib/lesson-plan/prompt-rules";
import { detectSubjectCategory, type SubjectCategory } from "@/lib/ai/subject-category";

export interface PreloadedRubricContext {
  course: Course;
  unit: Unit | null;
  topics: Topic[];
  examples: RubricAIOutput[];
}

export interface PreloadedExerciseContext {
  course: Course;
  unit: Unit;
  topics: Topic[];
  selectedTopic: Topic | null;
  examples: ExerciseAIOutput["exercises"];
}

export interface RubricPromptInput {
  courseId: string;
  unitId?: string;
  teacherRequest: string;
  track?: "ap" | "general";
  subjectCategory?: string;
  preloaded?: PreloadedRubricContext;
}

export interface ExercisePromptInput {
  courseId: string;
  unitId?: string;
  topicId?: string;
  track?: "ap" | "general";
  subjectCategory?: string;
  exerciseType: ExerciseType;
  difficulty: ExerciseDifficulty;
  count: number;
  requestCountHint?: number;
  diversitySeed?: string;
  teacherRequest?: string;
  preloaded?: PreloadedExerciseContext;
}

export interface ExerciseVerificationPromptInput {
  questionText: string;
  exerciseType: ExerciseType;
  options?: Array<{ label: string; text: string }>;
}

export interface SystemPromptContext {
  courseName: string;
  unitNumber: string;
  unitTitle: string;
  topicId: string;
  topicTitle: string;
  learningObjectives: CurriculumObjective[];
  essentialKnowledge: CurriculumObjective[];
}

export type SystemPromptTaskType =
  | "mc_exercise"
  | "fr_exercise"
  | "rubric"
  | "exercise_verify"
  | "lesson";

export type PromptTrack = "ap" | "general";

export type PromptPair = {
  systemPrompt: string;
  userPrompt: string;
};

export interface LessonOutlinePromptInput {
  sourcePrompt: string;
  titleHint: string;
  topics: CedTopicMatch[];
  preferences: LessonPlanPreferences;
  courseName?: string;
}

export interface LessonSectionPromptInput {
  sourcePrompt: string;
  section: OutlineSection;
  topics: CedTopicMatch[];
  preferences: LessonPlanPreferences;
  previousSummary?: string;
  nextSummary?: string;
  retryInstructions?: string;
  courseName?: string;
}

export interface LessonRewritePromptInput {
  sourcePrompt: string;
  instruction: string;
  block: LessonPlanBlock;
  previousBlock: LessonPlanBlock | null;
  nextBlock: LessonPlanBlock | null;
  topics: CedTopicMatch[];
  preferences: LessonPlanPreferences;
  courseName?: string;
}

const promptTemplateCache = new Map<string, Promise<string>>();

async function readPromptTemplateCached(...relativeSegments: string[]) {
  const absolutePath = path.join(process.cwd(), ...relativeSegments);
  const cached = promptTemplateCache.get(absolutePath);
  if (cached) {
    return cached;
  }

  const readPromise = readFile(absolutePath, "utf-8").catch((error) => {
    promptTemplateCache.delete(absolutePath);
    throw error;
  });

  promptTemplateCache.set(absolutePath, readPromise);
  return readPromise;
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replacePlaceholder(template: string, key: string, value: string) {
  const pattern = new RegExp(`{{${escapeRegex(key)}}}`, "g");
  return template.replace(pattern, value);
}

function replaceIfBlocks(template: string, vars: Record<string, string | null | undefined>) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    const pattern = new RegExp(`{{#if\\s+${escapeRegex(key)}}}([\\s\\S]*?){{\\/if}}`, "g");
    result = result.replace(pattern, (_, blockContent: string) => {
      if (!value || value.trim().length === 0) return "";
      return replacePlaceholder(blockContent, key, value);
    });
  }
  return result;
}

async function loadJsonExamples(filename: string, limit?: number): Promise<string> {
  const raw = await readPromptTemplateCached("lib", "ai", "prompts", "examples", filename);
  const parsed = JSON.parse(raw) as {
    examples?: Array<{ label?: string; block?: unknown; isNegativeExample?: boolean }>;
  };
  const examples = Array.isArray(parsed.examples) ? parsed.examples : [];
  const selectedExamples =
    typeof limit === "number" && limit > 0 ? examples.slice(0, limit) : examples;
  let positiveIndex = 0;
  let negativeIndex = 0;
  return selectedExamples
    .map((item) => {
      const label = item.label?.trim() || "";
      if (item.isNegativeExample) {
        negativeIndex++;
        return `❌ 反例 ${negativeIndex}（以下是低质量示范，禁止模仿）：${label}\n${JSON.stringify(item.block ?? {}, null, 2)}`;
      }
      positiveIndex++;
      return `示例 ${positiveIndex}：${label}\n${JSON.stringify(item.block ?? {}, null, 2)}`;
    })
    .join("\n\n");
}

async function loadFragment(name: string): Promise<string> {
  return readPromptTemplateCached("lib", "ai", "prompts", "fragments", `${name}.md`);
}

async function loadSystemModule(name: string): Promise<string> {
  return readPromptTemplateCached("lib", "ai", "prompts", "system", `${name}.md`);
}

async function tryLoadSystemModule(name: string, fallback: string): Promise<string> {
  try {
    return await loadSystemModule(name);
  } catch {
    return loadSystemModule(fallback);
  }
}

async function loadGeneralSubjectHint(subject: string | null | undefined): Promise<string> {
  const normalized = (subject ?? "").trim().toLowerCase();
  if (!normalized) return "";
  const candidate =
    /语文|chinese/.test(normalized)
      ? "subject-hint-chinese"
      : /英语|english/.test(normalized)
        ? "subject-hint-general-english"
        : null;
  if (!candidate) return "";
  try {
    return await loadFragment(candidate);
  } catch {
    return "";
  }
}

async function loadTaskModule(name: string): Promise<string> {
  return readPromptTemplateCached("lib", "ai", "prompts", "tasks", `${name}.md`);
}

async function tryLoadTaskModule(name: string | null): Promise<string> {
  if (!name) return "";
  try {
    return await loadTaskModule(name);
  } catch {
    return "";
  }
}

async function loadSubjectHint(subject: SubjectCategory | null): Promise<string> {
  if (!subject) return "";
  try {
    return await loadFragment(`subject-hint-${subject}`);
  } catch {
    return "";
  }
}

async function loadSubjectExamples(subject: SubjectCategory | null): Promise<string> {
  const fallbackFile = "lesson-section-blocks.json";
  if (!subject) return loadJsonExamples(fallbackFile, 1);
  try {
    return await loadJsonExamples(`lesson-section-blocks-${subject}.json`, 1);
  } catch {
    return loadJsonExamples(fallbackFile, 1);
  }
}

async function loadSubjectHintFromContext(
  context: SystemPromptContext,
): Promise<string> {
  const subject = detectSubjectCategory(context.courseName);
  if (!subject) {
    return "";
  }
  return loadSubjectHint(subject);
}

function resolvePromptSubjectCategory(params: {
  context: SystemPromptContext;
  subjectCategory?: string | null;
}) {
  const explicitSubject = detectSubjectCategory(params.subjectCategory ?? "");
  if (explicitSubject) {
    return explicitSubject;
  }
  return detectSubjectCategory(params.context.courseName);
}

const exerciseDiversitySeeds = [
  "real-world application",
  "graphical interpretation",
  "data table analysis",
  "common misconception",
  "historical context",
  "experimental design",
  "comparison between models",
  "edge case exploration",
  "visual reasoning",
];

function resolveRequestedExerciseCount(input: ExercisePromptInput) {
  return Math.max(1, Math.floor(input.requestCountHint ?? input.count));
}

function resolveExerciseDiversitySeed(input: ExercisePromptInput) {
  if (input.diversitySeed?.trim()) {
    return input.diversitySeed.trim();
  }
  if (resolveRequestedExerciseCount(input) <= 1) {
    return null;
  }
  return exerciseDiversitySeeds[Math.floor(Math.random() * exerciseDiversitySeeds.length)]!;
}

function renderLessonPreferences(pref: LessonPlanPreferences) {
  return [
    `课时：${pref.durationMinutes} 分钟`,
    `学生水平：${pref.studentLevel}`,
    `语言偏好：${pref.languagePref}`,
    `模板：${pref.templateKind}`,
    `Quiz 密度：${pref.quizDensity}`,
    `解释深度：${pref.explanationDepth}`,
    `拓展内容：${pref.includeExtension ? "开" : "关"}`,
    `显示 CED 编号：${pref.showCedCodes ? "开" : "关"}`,
    `教师备注：${pref.includeTeacherNotes ? "开" : "关"}`,
  ].join("\n");
}

function renderLessonTopicContext(topics: CedTopicMatch[]) {
  return topics
    .map((topic) => {
      const lo = topic.learningObjectives.map((item) => `${item.code}: ${item.description}`).join("\n");
      const ek = topic.essentialKnowledge.map((item) => `${item.code}: ${item.description}`).join("\n");
      return [
        `Topic ${topic.topicNumber} - ${topic.title}`,
        "Learning Objectives:",
        lo,
        "Essential Knowledge:",
        ek,
      ].join("\n");
    })
    .join("\n\n");
}

async function getLevelRules(studentLevel: LessonPlanPreferences["studentLevel"]) {
  if (studentLevel === "basic") {
    return loadFragment("level-rules-basic");
  }
  if (studentLevel === "advanced") {
    return loadFragment("level-rules-advanced");
  }
  return loadFragment("level-rules-medium");
}

const CHINESE_NUMBER_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

function parseChineseDimensionCount(raw: string) {
  const normalized = raw.trim();
  if (!normalized) return null;
  if (normalized === "十") return 10;
  if (normalized.length === 2 && normalized.startsWith("十")) {
    return 10 + (CHINESE_NUMBER_MAP[normalized.slice(1)] ?? 0);
  }
  if (normalized.length === 2 && normalized.endsWith("十")) {
    return (CHINESE_NUMBER_MAP[normalized[0]] ?? 0) * 10;
  }
  if (normalized.length === 3 && normalized[1] === "十") {
    return (CHINESE_NUMBER_MAP[normalized[0]] ?? 0) * 10 + (CHINESE_NUMBER_MAP[normalized[2]] ?? 0);
  }
  return CHINESE_NUMBER_MAP[normalized] ?? null;
}

export function extractRequestedRubricDimensionCount(text: string) {
  const normalized = text.trim();
  if (!normalized) return null;

  const digitMatch = normalized.match(/(\d{1,2})\s*(?:个|项)?\s*(?:评分)?维度/i);
  if (digitMatch) {
    const count = Number(digitMatch[1]);
    return Number.isFinite(count) ? count : null;
  }

  const englishMatch = normalized.match(/(\d{1,2})\s*(?:rubric\s+)?dimensions?/i);
  if (englishMatch) {
    const count = Number(englishMatch[1]);
    return Number.isFinite(count) ? count : null;
  }

  const chineseMatch = normalized.match(/([一二两三四五六七八九十]{1,3})\s*个?\s*(?:评分)?维度/);
  if (!chineseMatch) return null;
  return parseChineseDimensionCount(chineseMatch[1]);
}

export function extractRequestedRubricDimensionNames(text: string) {
  const patterns = [
    /(?:新增|加入|增加|补充|添加)\s*[“"「]([^”"」]{2,30})[”"」]\s*(?:维度)?/g,
    /(?:保留|必须保留|必须包含|包含)\s*[“"「]([^”"」]{2,30})[”"」]\s*(?:维度)?/g,
  ];
  const names = patterns.flatMap((pattern) =>
    Array.from(text.matchAll(pattern))
      .map((match) => match[1]?.trim())
      .filter((item): item is string => Boolean(item)),
  );
  return Array.from(new Set(names));
}

export function extractRequestedRubricTitle(text: string) {
  const normalized = text.trim();
  if (!normalized) return null;

  const quotedMatch = normalized.match(
    /标题(?:写成|改成|改为|命名为|叫做)\s*[“"「]([^”"」\n]{2,80})[”"」]/i,
  );
  if (quotedMatch?.[1]?.trim()) {
    return quotedMatch[1].trim();
  }

  const plainMatch = normalized.match(
    /标题(?:写成|改成|改为|命名为|叫做)\s*([^，。\n]{2,80}?)(?:[，。；;]|$)/i,
  );
  return plainMatch?.[1]?.trim() || null;
}

export function buildRubricTeacherRequestWithConstraints(teacherRequest: string) {
  const constraints: string[] = [];
  const requestedDimensionCount = extractRequestedRubricDimensionCount(teacherRequest);
  const requestedDimensionNames = extractRequestedRubricDimensionNames(teacherRequest);
  const requestedTitle = extractRequestedRubricTitle(teacherRequest);

  if (requestedDimensionCount && requestedDimensionCount >= 3 && requestedDimensionCount <= 6) {
    constraints.push(
      `显式约束：最终 Rubric 必须严格包含 ${requestedDimensionCount} 个评分维度，不多不少。`,
    );
  }

  if (requestedDimensionNames.length > 0) {
    constraints.push(
      `显式约束：最终 Rubric 必须包含以下维度：${requestedDimensionNames.join("、")}。`,
    );
    constraints.push(
      "显式约束：以上被点名的维度标题必须原样保留，不要翻译、不要改写、不要用英文同义词替换。",
    );
  }

  if (requestedTitle) {
    constraints.push(`显式约束：最终 Rubric 标题必须严格写成「${requestedTitle}」。`);
  }

  if (constraints.length === 0) return teacherRequest.trim();
  return [teacherRequest.trim(), ...constraints].filter(Boolean).join("\n\n");
}

export async function buildRubricPrompt(
  input: RubricPromptInput,
): Promise<{ prompt: string; systemContext: SystemPromptContext }> {
  const course = input.preloaded?.course ?? (await loadCourse(input.courseId));
  if (!course) {
    throw new Error("Course not found for rubric prompt.");
  }

  const unitContext = input.preloaded
    ? { unit: input.preloaded.unit, topics: input.preloaded.topics }
    : input.unitId
      ? await loadUnitWithTopics(input.unitId)
      : { unit: null, topics: [] };

  const rubricExamples =
    input.preloaded?.examples ??
    (await loadRubricExamples(input.courseId, input.unitId));

  const curriculumLines: string[] = [];
  curriculumLines.push(
    `Course: ${course.name} (${course.code})`,
  );
  if (course.description) {
    curriculumLines.push(`Course Description: ${course.description}`);
  }

  if (unitContext.unit) {
    curriculumLines.push(
      `Unit: ${unitContext.unit.unitNumber} - ${unitContext.unit.title}`,
    );
    if (unitContext.unit.description) {
      curriculumLines.push(`Unit Description: ${unitContext.unit.description}`);
    }
  } else {
    curriculumLines.push(
      "Unit: None selected. Create a course-level rubric that applies across the course.",
    );
  }

  if (unitContext.topics.length > 0) {
    curriculumLines.push("Topics, Learning Objectives, and Essential Knowledge:");
    unitContext.topics.forEach((topic) => {
      curriculumLines.push(
        `Topic ${topic.topicNumber}: ${topic.title}`,
      );
      if (topic.learningObjectives.length > 0) {
        curriculumLines.push("Learning Objectives:");
        topic.learningObjectives.forEach((lo) => {
          curriculumLines.push(`- ${lo.code}: ${lo.description}`);
        });
      }
      if (topic.essentialKnowledge.length > 0) {
        curriculumLines.push("Essential Knowledge:");
        topic.essentialKnowledge.forEach((ek) => {
          curriculumLines.push(`- ${ek.code}: ${ek.description}`);
        });
      }
      if (topic.mathPractices.length > 0) {
        curriculumLines.push(
          `Math Practices: ${topic.mathPractices.join(", ")}`,
        );
      }
      curriculumLines.push("");
    });
  }

  const curriculumContext = curriculumLines.join("\n").trim();

  const examplesText =
    rubricExamples.length === 0
      ? "No reference rubrics available."
      : rubricExamples
          .map(
            (example, index) =>
              `Example ${index + 1}:\n${JSON.stringify(example, null, 2)}`,
          )
          .join("\n\n");

  const rubricTemplate = await readPromptTemplateCached("lib", "ai", "prompts", "rubric.md");

  const systemContext = buildSystemPromptContext({
    courseName: course.name,
    unitNumber: unitContext.unit?.unitNumber ?? "N/A",
    unitTitle: unitContext.unit?.title ?? "Course-level rubric",
    topics: unitContext.topics ?? [],
    selectedTopic: null,
  });

  const budgeted = budgetPromptSections(
    [
      {
        key: "curriculumContext",
        text: curriculumContext,
        weight: 1.7,
        minTokens: 280,
        maxTokens: 680,
      },
      {
        key: "examplesText",
        text: examplesText,
        weight: 1.1,
        minTokens: 180,
        maxTokens: 520,
      },
      {
        key: "teacherRequest",
        text: buildRubricTeacherRequestWithConstraints(input.teacherRequest),
        weight: 1.8,
        minTokens: 160,
        maxTokens: 420,
      },
    ],
    1300,
  );

  return {
    prompt: rubricTemplate
      .replace("{{CURRICULUM_CONTEXT}}", budgeted.curriculumContext)
      .replace("{{RUBRIC_EXAMPLES}}", budgeted.examplesText)
      .replace("{{TEACHER_REQUEST}}", budgeted.teacherRequest),
    systemContext,
  };
}

export async function buildExercisePrompt(
  input: ExercisePromptInput,
): Promise<{ prompt: string; systemContext: SystemPromptContext }> {
  const course = input.preloaded?.course ?? (await loadCourse(input.courseId));
  if (!course) {
    throw new Error("Course not found for exercise prompt.");
  }

  if (!input.unitId && !input.preloaded?.unit) {
    throw new Error("Unit is required for exercise generation.");
  }

  const unitContext = input.preloaded
    ? { unit: input.preloaded.unit, topics: input.preloaded.topics }
    : await loadUnitWithTopics(input.unitId!);

  const { unit, topics } = unitContext;
  if (!unit) {
    throw new Error("Unit not found for exercise prompt.");
  }

  let selectedTopics = topics;
  let selectedTopicDetail = input.preloaded?.selectedTopic ?? null;
  if (!input.preloaded && input.topicId) {
    const topic = await loadTopic(input.topicId);
    if (!topic || topic.unitId !== unit.id) {
      throw new Error("Topic not found or does not belong to unit.");
    }
    selectedTopics = [topic];
    selectedTopicDetail = topic;
  } else if (input.preloaded?.selectedTopic) {
    selectedTopics = [input.preloaded.selectedTopic];
  }

  const curriculumContext = formatCurriculumContext({
    courseName: course.name,
    courseCode: course.code,
    unitNumber: unit.unitNumber,
    unitTitle: unit.title,
    topics: selectedTopics,
  });

  const difficultyDefinition = difficultyDefinitionByLevel[input.difficulty];
  const difficultyTier = difficultyTierByLevel[input.difficulty];
  const examples =
    input.preloaded?.examples && input.preloaded.examples.length > 0
      ? input.preloaded.examples
      : input.track === "general"
        ? []
      : await loadExerciseExamples(
          input.courseId,
          input.exerciseType,
          input.difficulty,
          2,
          undefined,
          {
            courseName: course.name,
            subjectCategory: input.subjectCategory,
          },
        );

  const template = await readPromptTemplateCached("lib", "ai", "prompts", "exercise.md");

  const examplesText = examples.length
    ? examples
        .map(
          (example, index) =>
            `Example ${index + 1}:\n${JSON.stringify(example, null, 2)}`,
        )
        .join("\n\n")
    : "No reference exercises available yet.";

  const teacherRequest = input.teacherRequest?.trim()
    ? input.teacherRequest.trim()
    : "None.";

  const systemContext = buildSystemPromptContext({
    courseName: course.name,
    unitNumber: unit.unitNumber,
    unitTitle: unit.title,
    topics: selectedTopics,
    selectedTopic: selectedTopicDetail,
  });

  const topicIdInstruction = selectedTopicDetail
    ? `Use topicId \`${selectedTopicDetail.id}\` for all exercises.`
    : "Choose topicId from the listed topics for each exercise.";

  const mcFlag = input.exerciseType === "MC" ? "true" : null;
  const diversitySeed = resolveExerciseDiversitySeed(input);

  const budgeted = budgetPromptSections(
    [
      {
        key: "curriculumContext",
        text: curriculumContext,
        weight: 1.9,
        minTokens: 320,
        maxTokens: 900,
      },
      {
        key: "examplesText",
        text: examplesText,
        weight: 1.3,
        minTokens: 180,
        maxTokens: 760,
      },
      {
        key: "teacherRequest",
        text: teacherRequest,
        weight: 1.8,
        minTokens: 120,
        maxTokens: 360,
      },
    ],
    1900,
  );

  const prompt = replaceIfBlocks(
    template
      .replace("{{CURRICULUM_CONTEXT}}", budgeted.curriculumContext)
      .replace("{{DIFFICULTY_DEFINITION}}", difficultyDefinition)
      .replace(/\{\{DIFFICULTY_TIER\}\}/g, difficultyTier)
      .replace("{{EXERCISE_EXAMPLES}}", budgeted.examplesText)
      .replace("{{TEACHER_REQUEST}}", budgeted.teacherRequest)
      .replace("{{COUNT}}", String(input.count))
      .replace("{{EXERCISE_TYPE}}", input.exerciseType)
      .replace("{{DIFFICULTY}}", String(input.difficulty))
      .replace("{{TOPIC_ID_INSTRUCTION}}", topicIdInstruction),
    {
      MC_SECTION: mcFlag,
      MC_CHECK: mcFlag,
      DIVERSITY_SEED: diversitySeed,
    },
  );

  return { prompt, systemContext };
}

export async function buildExerciseVerificationPrompt(
  input: ExerciseVerificationPromptInput,
): Promise<string> {
  const optionsText =
    input.exerciseType === "MC" && input.options?.length
      ? input.options
          .map((option) => `${option.label}. ${option.text}`)
          .join("\n")
      : "";
  const template = await readPromptTemplateCached("lib", "ai", "prompts", "exercise-verify.md");
  const withOptionBlock = replaceIfBlocks(template, {
    OPTIONS_TEXT: optionsText || null,
  });
  return replacePlaceholder(
    replacePlaceholder(withOptionBlock, "QUESTION_TEXT", input.questionText),
    "OPTIONS_TEXT",
    optionsText,
  );
}

export async function buildLessonOutlinePrompt(
  input: LessonOutlinePromptInput,
): Promise<PromptPair> {
  const subject = detectSubjectCategory(input.courseName ?? "");
  const [template, taskModule, subjectHint, sharedRules] = await Promise.all([
    readPromptTemplateCached("lib", "ai", "prompts", "lesson-outline.md"),
    loadTaskModule("lesson-outline-rules"),
    loadSubjectHint(subject),
    loadFragment("lesson-shared-rules"),
  ]);
  const bannedWords =
    (await loadFragment("banned-words").catch(() => null)) ?? BANNED_VAGUE_WORDS.join("、");
  const renderedSharedRules = replacePlaceholder(sharedRules, "BANNED_WORDS", bannedWords);

  let rendered = replacePlaceholder(template, "TOPIC_CONTEXT", renderLessonTopicContext(input.topics));
  rendered = replacePlaceholder(rendered, "PREFERENCES", renderLessonPreferences(input.preferences));
  rendered = replacePlaceholder(rendered, "TEACHER_REQUEST", input.sourcePrompt.trim());
  rendered = replacePlaceholder(rendered, "TITLE_HINT", input.titleHint.trim());
  rendered = replaceIfBlocks(rendered, { SUBJECT_HINT: subjectHint || null });

  return {
    systemPrompt: [taskModule.trim(), renderedSharedRules.trim()].join("\n\n"),
    userPrompt: rendered,
  };
}

export async function buildLessonSectionPrompt(
  input: LessonSectionPromptInput,
): Promise<PromptPair> {
  const subject = detectSubjectCategory(input.courseName ?? "");
  const [template, taskModule, subjectHint, fewShotExamples, sharedRules] = await Promise.all([
    readPromptTemplateCached("lib", "ai", "prompts", "lesson-section.md"),
    loadTaskModule("lesson-section-rules"),
    loadSubjectHint(subject),
    loadSubjectExamples(subject),
    loadFragment("lesson-shared-rules"),
  ]);
  const levelRules = await getLevelRules(input.preferences.studentLevel);
  const bannedWords =
    (await loadFragment("banned-words").catch(() => null)) ?? BANNED_VAGUE_WORDS.join("、");
  const focusSectionRequirement = /原理|推导|例题|演示/.test(input.section.title)
    ? "当前章节属于重点章节（原理/推导/例题/演示）：内容需特别详细，推导完整，每步有解释。"
    : "若章节涉及原理/推导/例题/演示，需自动提升详细度。";

  const renderedSharedRules = replacePlaceholder(sharedRules, "BANNED_WORDS", bannedWords);

  const budgeted = budgetPromptSections(
    [
      {
        key: "teacherRequest",
        text: input.sourcePrompt.trim(),
        weight: 1.9,
        minTokens: 140,
        maxTokens: 360,
      },
      {
        key: "topicContext",
        text: renderLessonTopicContext(input.topics),
        weight: 1.5,
        minTokens: 220,
        maxTokens: 620,
      },
      {
        key: "fewShotExamples",
        text: fewShotExamples,
        weight: 1,
        minTokens: 120,
        maxTokens: 420,
      },
      {
        key: "previousSummary",
        text: input.previousSummary ?? "",
        weight: 0.5,
        minTokens: 40,
        maxTokens: 100,
      },
      {
        key: "nextSummary",
        text: input.nextSummary ?? "",
        weight: 0.5,
        minTokens: 40,
        maxTokens: 100,
      },
      {
        key: "retryInstructions",
        text: input.retryInstructions ?? "",
        weight: 0.5,
        minTokens: 60,
        maxTokens: 160,
      },
    ],
    1650,
  );

  let rendered = template;
  rendered = replacePlaceholder(rendered, "COURSE_NAME", (input.courseName ?? "当前课程").trim() || "当前课程");
  rendered = replacePlaceholder(rendered, "SECTION_TITLE", input.section.title);
  rendered = replacePlaceholder(rendered, "SECTION_SUMMARY", input.section.summary);
  rendered = replacePlaceholder(rendered, "SECTION_DURATION", String(input.section.durationMinutes));
  rendered = replacePlaceholder(rendered, "TEACHER_REQUEST", budgeted.teacherRequest);
  rendered = replacePlaceholder(rendered, "TOPIC_CONTEXT", budgeted.topicContext);
  rendered = replacePlaceholder(rendered, "PREFERENCES", renderLessonPreferences(input.preferences));
  rendered = replacePlaceholder(rendered, "SHARED_RULES", renderedSharedRules);
  rendered = replacePlaceholder(rendered, "LEVEL_RULES", levelRules);
  rendered = replacePlaceholder(rendered, "FEW_SHOT_EXAMPLES", budgeted.fewShotExamples);
  rendered = replacePlaceholder(rendered, "FOCUS_SECTION_REQUIREMENT", focusSectionRequirement);
  rendered = replacePlaceholder(rendered, "STUDENT_LEVEL", input.preferences.studentLevel);
  rendered = replaceIfBlocks(rendered, {
    SUBJECT_HINT: subjectHint || null,
    PREVIOUS_SUMMARY: budgeted.previousSummary || null,
    NEXT_SUMMARY: budgeted.nextSummary || null,
    RETRY_INSTRUCTIONS: budgeted.retryInstructions || null,
  });

  return {
    systemPrompt: taskModule.trim(),
    userPrompt: rendered,
  };
}

export async function buildLessonRewritePrompt(
  input: LessonRewritePromptInput,
): Promise<PromptPair> {
  const subject = detectSubjectCategory(input.courseName ?? "");
  const [template, taskModule, subjectHint] = await Promise.all([
    readPromptTemplateCached("lib", "ai", "prompts", "lesson-rewrite.md"),
    loadTaskModule("lesson-rewrite-rules"),
    loadSubjectHint(subject),
  ]);
  const compactTeacherRequest = trimTextToApproxTokens(input.sourcePrompt.trim(), 260);

  let rendered = template;
  rendered = replacePlaceholder(rendered, "TEACHER_REQUEST", compactTeacherRequest);
  rendered = replacePlaceholder(rendered, "REWRITE_INSTRUCTION", input.instruction.trim());
  rendered = replacePlaceholder(rendered, "CURRENT_BLOCK_JSON", JSON.stringify(input.block));
  rendered = replacePlaceholder(
    rendered,
    "TOPIC_CONTEXT",
    renderLessonTopicContext(input.topics),
  );
  rendered = replacePlaceholder(
    rendered,
    "PREFERENCES",
    renderLessonPreferences(input.preferences),
  );
  rendered = replaceIfBlocks(rendered, {
    SUBJECT_HINT: subjectHint || null,
    PREVIOUS_BLOCK_JSON: input.previousBlock ? JSON.stringify(input.previousBlock) : null,
    NEXT_BLOCK_JSON: input.nextBlock ? JSON.stringify(input.nextBlock) : null,
  });

  return {
    systemPrompt: taskModule.trim(),
    userPrompt: rendered,
  };
}

const difficultyTierByLevel: Record<ExerciseDifficulty, "easy" | "medium" | "hard"> = {
  easy: "easy",
  medium: "medium",
  hard: "hard",
};

const difficultyDefinitionByLevel: Record<ExerciseDifficulty, string> = {
  easy: [
    "Difficulty Tier: Easy",
    "Cognitive demand: Recall / Direct Application (Bloom's Level 1-2).",
    "Quantitative constraints:",
    "- Stem: no more than 2 sentences, excluding given information.",
    "- Solution: 1-2 steps, anchored to exactly 1 LO/EK.",
    "- MC distractors: single-point errors only (sign flip, formula swap, or one missed detail).",
    "- No multi-concept synthesis, proof, or extended scenario.",
    "- A well-prepared student should solve it in under 90 seconds.",
    "AP exam equivalent: straightforward MC items or FRQ part (a).",
    "What NOT to do at this level:",
    "- Do not combine multiple EKs or cross-unit concepts.",
    "- Do not hide the task inside unnecessary context or data interpretation.",
    "- Do not require justification beyond direct identification or computation.",
  ].join("\n"),
  medium: [
    "Difficulty Tier: Medium",
    "Cognitive demand: Application / Analysis (Bloom's Level 3-4).",
    "Quantitative constraints:",
    "- Stem: 2-4 sentences and may include a scenario, source, or small data table.",
    "- Solution: 3-5 steps involving 2-3 LOs/EKs from the same unit.",
    "- MC distractors: procedural or reasoning errors, not random guesses.",
    "- The student must choose and apply the correct method rather than recall a fact.",
    "- A well-prepared student should solve it in 2-4 minutes.",
    "AP exam equivalent: standard MC items or FRQ parts (b)-(c).",
    "What NOT to do at this level:",
    "- Do not require cross-unit synthesis or original proof construction.",
    "- Do not collapse it into a single lookup or one-step routine task.",
    "- Do not add difficulty through irrelevant numbers or verbose storytelling.",
  ].join("\n"),
  hard: [
    "Difficulty Tier: Hard",
    "Cognitive demand: Synthesis / Evaluation (Bloom's Level 5-6).",
    "Quantitative constraints:",
    "- Stem: 3-6 sentences, and may include an extended scenario, passage, or data set.",
    "- Solution: at least 5 steps with cross-topic or cross-unit reasoning.",
    "- MC distractors: deep conceptual errors such as wrong model choice or flawed reasoning chain.",
    "- The student must justify, interpret, or strategically connect multiple ideas.",
    "- A well-prepared student should solve it in 4-8 minutes.",
    "AP exam equivalent: challenging MC items or FRQ parts (c)-(d).",
    "What NOT to do at this level:",
    "- Do not exceed the provided CED scope.",
    "- Do not fake difficulty with messy arithmetic or irrelevant background text.",
    "- Do not make it hard by stapling together two unrelated easy questions.",
  ].join("\n"),
};

function formatCurriculumContext({
  courseName,
  courseCode,
  unitNumber,
  unitTitle,
  topics,
}: {
  courseName: string;
  courseCode: string;
  unitNumber: string;
  unitTitle: string;
  topics: Array<{
    id: string;
    topicNumber: string;
    title: string;
    learningObjectives: Array<{ code?: string; description?: string } | string>;
    essentialKnowledge: Array<{ code?: string; description?: string } | string>;
    mathPractices: string[];
  }>;
}) {
  const topicBlocks = topics
    .map((topic) => {
      const objectives = formatObjectiveList(topic.learningObjectives);
      const knowledge = formatObjectiveList(topic.essentialKnowledge);
      const practices =
        topic.mathPractices && topic.mathPractices.length > 0
          ? topic.mathPractices.map((item) => `- ${item}`).join("\n")
          : "None listed.";

      return [
        `Topic: ${topic.topicNumber} - ${topic.title}`,
        `Learning Objectives:\n${objectives}`,
        `Essential Knowledge:\n${knowledge}`,
        `Math Practices:\n${practices}`,
      ].join("\n");
    })
    .join("\n\n");

  return [
    `Course: ${courseName} (${courseCode})`,
    `Unit ${unitNumber}: ${unitTitle}`,
    `Topics in scope:\n${topicBlocks}`,
  ].join("\n\n");
}

function formatObjectiveList(
  items: Array<{ code?: string; description?: string } | string> | null | undefined,
) {
  if (!items || items.length === 0) {
    return "None listed.";
  }

  return items
    .map((item) => {
      if (typeof item === "string") {
        return `- ${item}`;
      }
      const code = item.code ? `${item.code}: ` : "";
      const description = item.description ?? "";
      return `- ${code}${description}`.trim();
    })
    .join("\n");
}

function mergeObjectives(
  lists: Array<Array<{ code: string; description: string }>>,
): CurriculumObjective[] {
  const merged = new Map<string, CurriculumObjective>();
  lists.flat().forEach((item) => {
    const key = `${item.code}::${item.description}`;
    if (!merged.has(key)) {
      merged.set(key, item);
    }
  });
  return Array.from(merged.values());
}

function buildSystemPromptContext({
  courseName,
  unitNumber,
  unitTitle,
  topics,
  selectedTopic,
}: {
  courseName: string;
  unitNumber: string;
  unitTitle: string;
  topics: Array<{
    id: string;
    topicNumber: string;
    title: string;
    learningObjectives: CurriculumObjective[];
    essentialKnowledge: CurriculumObjective[];
  }>;
  selectedTopic: { id: string; topicNumber: string; title: string } | null;
}): SystemPromptContext {
  const topicId =
    selectedTopic?.topicNumber ??
    (topics.length === 1 ? topics[0].topicNumber : "All");
  const topicTitle =
    selectedTopic?.title ??
    (topics.length === 1
      ? topics[0].title
      : `All topics in Unit ${unitNumber}`);

  const learningObjectives = mergeObjectives(
    topics.map((topic) => topic.learningObjectives ?? []),
  );
  const essentialKnowledge = mergeObjectives(
    topics.map((topic) => topic.essentialKnowledge ?? []),
  );

  return {
    courseName,
    unitNumber,
    unitTitle,
    topicId,
    topicTitle,
    learningObjectives,
    essentialKnowledge,
  };
}

function buildCurriculumBlock(context: SystemPromptContext): string {
  return [
    "### Current Context",
    `Course: ${context.courseName}`,
    `Unit ${context.unitNumber}: ${context.unitTitle}`,
    `Topic ${context.topicId}: ${context.topicTitle}`,
    "",
    "Full Learning Objectives and Essential Knowledge are provided in the task prompt below.",
  ].join("\n");
}

export async function renderSystemPrompt(
  context: SystemPromptContext,
  taskType: SystemPromptTaskType,
  options?: {
    track?: PromptTrack;
    subjectCategory?: string;
  },
): Promise<string> {
  const track = options?.track ?? "ap";
  const subjectCategory = options?.subjectCategory ?? null;
  const detectedSubject = resolvePromptSubjectCategory({
    context,
    subjectCategory,
  });
  const [
    identityModule,
    rulesModule,
    subjectHintModule,
    latexModule,
    selfCheckModule,
    antiPatternsModule,
  ] = await Promise.all([
    track === "general"
      ? tryLoadSystemModule("identity-general", "identity")
      : tryLoadSystemModule("identity-ap", "identity"),
    track === "general"
      ? tryLoadSystemModule("general-rules", "curriculum-rules")
      : loadSystemModule("curriculum-rules"),
    track === "general"
      ? loadGeneralSubjectHint(subjectCategory)
      : loadSubjectHintFromContext(context),
    loadSystemModule("latex-standards"),
    loadSystemModule("self-check"),
    loadSystemModule("anti-patterns"),
  ]);

  const taskModules: string[] = [];
  if (taskType === "mc_exercise") {
    const [baseRules, distractorRules] = await Promise.all([
      loadTaskModule("mcq-rules"),
      tryLoadTaskModule(
        detectedSubject ? `mcq-distractors-${detectedSubject}` : null,
      ),
    ]);
    taskModules.push(baseRules.trim());
    if (distractorRules.trim()) {
      taskModules.push(distractorRules.trim());
    }
  } else if (taskType === "fr_exercise") {
    const [baseRules, rubricRules] = await Promise.all([
      loadTaskModule("frq-rules"),
      tryLoadTaskModule(
        detectedSubject ? `frq-rubric-${detectedSubject}` : null,
      ),
    ]);
    taskModules.push(baseRules.trim());
    if (rubricRules.trim()) {
      taskModules.push(rubricRules.trim());
    }
  } else if (taskType === "rubric") {
    taskModules.push((await loadTaskModule("rubric-rules")).trim());
  }

  const isExerciseTask =
    taskType === "mc_exercise" || taskType === "fr_exercise";

  const sections = [
    identityModule.trim(),
    buildCurriculumBlock(context),
    rulesModule.trim(),
    antiPatternsModule.trim(),
  ];
  if (subjectHintModule.trim().length > 0) {
    sections.push(subjectHintModule.trim());
  }
  sections.push(...taskModules.filter((module) => module.length > 0));
  sections.push(latexModule.trim(), selfCheckModule.trim());

  return sections.join("\n\n");
}
