import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_LESSON_PLAN_PREFERENCES } from "@/lib/lesson-plan/defaults";
import type {
  CedObjective,
  CedTopicMatch,
  LessonIntentConfirmation,
  LessonIntentResult,
  LessonPlanPreferences,
  LessonPlanTemplateKind,
} from "@/lib/lesson-plan/types";
import type { Database } from "@/types/database";

type CourseIndex = {
  id: string;
  code: string;
  name: string;
  units: UnitIndex[];
};

type UnitIndex = {
  id: string;
  unitNumber: string;
  title: string;
  topics: TopicIndex[];
};

type TopicIndex = {
  id: string;
  topicNumber: string;
  title: string;
  learningObjectives: CedObjective[];
  essentialKnowledge: CedObjective[];
};

type CedIndex = {
  courses: CourseIndex[];
};

const SUBJECT_ALIASES: Record<string, string[]> = {
  "AP Calculus AB": ["ap calculus ab", "calculus ab", "ab calculus"],
  "AP Physics 1": ["ap physics 1", "physics 1"],
};

const TOPIC_ALIASES: Record<string, string[]> = {
  "fundamental theorem of calculus": ["ftc", "fundamental theorem"],
};

function isGenericLabel(value: string) {
  const normalized = normalize(value);
  return (
    normalized.length === 0 ||
    normalized === "通用" ||
    normalized === "通用单元" ||
    normalized === "通用知识点" ||
    normalized === "general" ||
    normalized === "general unclassified" ||
    normalized === "unit"
  );
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreContains(haystack: string, needle: string) {
  if (!needle) return 0;
  if (haystack.includes(needle)) return needle.length;
  return 0;
}

function parseDurationMinutes(message: string) {
  const match = message.match(/(\d{2,3})\s*(分钟|min|mins|minute|minutes)/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.max(15, Math.min(180, value));
}

function parseUnitHint(message: string) {
  const unitMatch = message.match(/unit\s*([0-9]{1,2})/i);
  if (unitMatch) {
    return `${Number(unitMatch[1])}`;
  }

  const zhMatch = message.match(/第\s*([0-9]{1,2})\s*单元/i);
  if (zhMatch) {
    return `${Number(zhMatch[1])}`;
  }

  return null;
}

function extractTopicHint(message: string) {
  const quotedPatterns = [
    /《([^》]{2,80})》/,
    /“([^”]{2,80})”/,
    /"([^"]{2,80})"/,
    /「([^」]{2,80})」/,
  ];
  for (const pattern of quotedPatterns) {
    const match = message.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return value;
  }

  const topicLabelMatch = message.match(
    /(?:主题|知识点|topic)\s*[:：]?\s*([a-z0-9\u4e00-\u9fa5\s\-&(),/]{2,80}?)(?=\s*(?:[，。,.;；]|$))/i,
  );
  if (topicLabelMatch?.[1]?.trim()) {
    return topicLabelMatch[1].trim();
  }

  const unitTailMatch = message.match(
    /unit\s*[0-9]{1,2}\s*[:：-]?\s*([a-z0-9\u4e00-\u9fa5\s\-&(),/]{2,80}?)(?=\s*(?:的|教案|lesson|，|。|,|\.|重点|强调|$))/i,
  );
  if (unitTailMatch?.[1]?.trim()) {
    return unitTailMatch[1].trim();
  }

  const aboutMatch = message.match(
    /(?:关于|讲解|围绕)([^，。,.；;]{2,80}?)(?=\s*(?:的?\s*\d+\s*分钟|教案|课程|课堂|，|。|$))/,
  );
  if (aboutMatch?.[1]?.trim()) {
    return aboutMatch[1].trim();
  }

  return null;
}

function parsePreferences(message: string): {
  preferences: LessonPlanPreferences;
  defaultsApplied: Partial<Record<keyof LessonPlanPreferences, boolean>>;
} {
  const preferences: LessonPlanPreferences = {
    ...DEFAULT_LESSON_PLAN_PREFERENCES,
  };

  const defaultsApplied: Partial<Record<keyof LessonPlanPreferences, boolean>> = {
    durationMinutes: true,
    studentLevel: true,
    languagePref: true,
    templateKind: true,
    quizDensity: true,
    explanationDepth: true,
    includeExtension: true,
    showCedCodes: true,
    includeTeacherNotes: true,
  };

  const duration = parseDurationMinutes(message);
  if (duration) {
    preferences.durationMinutes = duration;
    defaultsApplied.durationMinutes = false;
  }

  if (/(基础|入门|basic)/i.test(message)) {
    preferences.studentLevel = "basic";
    defaultsApplied.studentLevel = false;
  }
  if (/(中等|标准|medium)/i.test(message)) {
    preferences.studentLevel = "medium";
    defaultsApplied.studentLevel = false;
  }
  if (/(进阶|提高|advanced)/i.test(message)) {
    preferences.studentLevel = "advanced";
    defaultsApplied.studentLevel = false;
  }

  if (/(中文|汉语)/i.test(message)) {
    preferences.languagePref = "zh";
    defaultsApplied.languagePref = false;
  }
  if (/(英文|english)/i.test(message)) {
    preferences.languagePref = "en";
    defaultsApplied.languagePref = false;
  }
  if (/(双语|bilingual)/i.test(message)) {
    preferences.languagePref = "bilingual";
    defaultsApplied.languagePref = false;
  }

  const templateMap: Array<{ match: RegExp; value: LessonPlanTemplateKind }> = [
    { match: /(概念|讲解|concept)/i, value: "concept" },
    { match: /(例题|训练|example)/i, value: "example" },
    { match: /(冲刺|考前|sprint)/i, value: "sprint" },
    { match: /(探究|讨论|inquiry)/i, value: "inquiry" },
  ];

  templateMap.forEach((item) => {
    if (item.match.test(message)) {
      preferences.templateKind = item.value;
      defaultsApplied.templateKind = false;
    }
  });

  if (/(quiz.*少|少量检测|low quiz)/i.test(message)) {
    preferences.quizDensity = "low";
    defaultsApplied.quizDensity = false;
  }
  if (/(quiz.*中|中等检测|medium quiz)/i.test(message)) {
    preferences.quizDensity = "medium";
    defaultsApplied.quizDensity = false;
  }
  if (/(quiz.*多|多做检测|high quiz)/i.test(message)) {
    preferences.quizDensity = "high";
    defaultsApplied.quizDensity = false;
  }

  if (/(简洁|简短|concise)/i.test(message)) {
    preferences.explanationDepth = "concise";
    defaultsApplied.explanationDepth = false;
  }
  if (/(标准|normal|standard)/i.test(message)) {
    preferences.explanationDepth = "standard";
    defaultsApplied.explanationDepth = false;
  }
  if (/(详细|深入|detailed)/i.test(message)) {
    preferences.explanationDepth = "detailed";
    defaultsApplied.explanationDepth = false;
  }

  if (/(拓展|extension|延伸)/i.test(message)) {
    preferences.includeExtension = true;
    defaultsApplied.includeExtension = false;
  }

  if (/(不显示\s*ced|hide\s*ced)/i.test(message)) {
    preferences.showCedCodes = false;
    defaultsApplied.showCedCodes = false;
  }

  if (/(教师备注|teacher notes?)/i.test(message)) {
    preferences.includeTeacherNotes = true;
    defaultsApplied.includeTeacherNotes = false;
  }

  return { preferences, defaultsApplied };
}

function topicToMatch(topic: TopicIndex): CedTopicMatch {
  return {
    id: topic.id,
    topicNumber: topic.topicNumber,
    title: topic.title,
    learningObjectives: topic.learningObjectives,
    essentialKnowledge: topic.essentialKnowledge,
  };
}

function normalizeObjectives(value: unknown, prefix: string): CedObjective[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (typeof item === "string") {
        return { code: `${prefix}${index + 1}`, description: item };
      }
      if (item && typeof item === "object") {
        const data = item as Record<string, unknown>;
        const codeRaw =
          (typeof data.code === "string" && data.code) ||
          (typeof data.lo_id === "string" && data.lo_id) ||
          (typeof data.ek_id === "string" && data.ek_id) ||
          `${prefix}${index + 1}`;
        const descriptionRaw =
          (typeof data.description === "string" && data.description) ||
          (typeof data.text === "string" && data.text) ||
          JSON.stringify(data);
        return { code: codeRaw, description: descriptionRaw };
      }
      return null;
    })
    .filter((item): item is CedObjective => Boolean(item));
}

const FALLBACK_CED_INDEX: CedIndex = {
  courses: [
    {
      id: "fallback-course-calculus-ab",
      code: "AP-CALC-AB",
      name: "AP Calculus AB",
      units: [
        {
          id: "fallback-unit-6",
          unitNumber: "6",
          title: "Integration and Accumulation of Change",
          topics: [
            {
              id: "fallback-topic-ftc",
              topicNumber: "6.1",
              title: "Fundamental Theorem of Calculus",
              learningObjectives: [
                {
                  code: "FUN-6.A",
                  description: "Use accumulation functions to model contexts and interpret accumulated change.",
                },
                {
                  code: "FUN-6.B",
                  description: "Apply the Fundamental Theorem of Calculus to connect derivatives and integrals.",
                },
              ],
              essentialKnowledge: [
                {
                  code: "FUN-6.A.1",
                  description: "If F(x)=∫_a^x f(t)dt and f is continuous, then F'(x)=f(x).",
                },
                {
                  code: "FUN-6.B.1",
                  description: "Definite integrals represent net change over an interval.",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export async function loadCedIndex(
  supabase?: SupabaseClient<Database>,
): Promise<CedIndex> {
  if (process.env.E2E_TEST === "1") {
    return FALLBACK_CED_INDEX;
  }
  if (!supabase) {
    throw new Error("课程目录服务不可用");
  }

  const { data: courses, error: courseError } = await supabase
    .from("courses")
    .select("id,code,name")
    .order("name", { ascending: true });

  if (courseError) {
    throw new Error(`加载课程目录失败：${courseError.message}`);
  }
  if (!courses || courses.length === 0) {
    throw new Error("课程目录为空，无法解析教案意图");
  }

  const courseIds = courses.map((item) => item.id);
  const { data: units } = await supabase
    .from("units")
    .select("id,course_id,unit_number,title")
    .in("course_id", courseIds)
    .order("unit_number", { ascending: true });

  const unitIds = (units ?? []).map((item) => item.id);
  const { data: topics } = await supabase
    .from("topics")
    .select("id,unit_id,topic_number,title,learning_objectives,essential_knowledge")
    .in("unit_id", unitIds)
    .order("topic_number", { ascending: true });

  const topicsByUnit = new Map<string, TopicIndex[]>();
  (topics ?? []).forEach((topic) => {
    const list = topicsByUnit.get(topic.unit_id) ?? [];
    list.push({
      id: topic.id,
      topicNumber: topic.topic_number,
      title: topic.title,
      learningObjectives: normalizeObjectives(topic.learning_objectives, "LO"),
      essentialKnowledge: normalizeObjectives(topic.essential_knowledge, "EK"),
    });
    topicsByUnit.set(topic.unit_id, list);
  });

  const unitsByCourse = new Map<string, UnitIndex[]>();
  (units ?? []).forEach((unit) => {
    const list = unitsByCourse.get(unit.course_id) ?? [];
    list.push({
      id: unit.id,
      unitNumber: unit.unit_number,
      title: unit.title,
      topics: topicsByUnit.get(unit.id) ?? [],
    });
    unitsByCourse.set(unit.course_id, list);
  });

  return {
    courses: courses.map((course) => ({
      id: course.id,
      code: course.code,
      name: course.name,
      units: unitsByCourse.get(course.id) ?? [],
    })),
  };
}

function matchCourse(message: string, index: CedIndex) {
  const normalizedMessage = normalize(message);
  let bestCourse: CourseIndex | null = null;
  let bestScore = 0;

  for (const course of index.courses) {
    const normalizedName = normalize(course.name);
    const normalizedCode = normalize(course.code);
    let score = 0;
    score += scoreContains(normalizedMessage, normalizedName);
    const codeScore = scoreContains(normalizedMessage, normalizedCode);
    score += codeScore > 0 ? codeScore + 1 : 0;

    const aliases = SUBJECT_ALIASES[course.name] ?? [];
    aliases.forEach((alias) => {
      score += scoreContains(normalizedMessage, normalize(alias));
    });

    if (score > 0 && score > bestScore) {
      bestScore = score;
      bestCourse = course;
    }
  }

  if (bestCourse) {
    return bestCourse;
  }

  const genericCourse =
    index.courses.find((course) => normalize(course.name) === "通用") ??
    index.courses.find((course) => normalize(course.code).includes("general"));
  if (!genericCourse) {
    return null;
  }

  if (/[一-龥]/.test(message)) {
    return genericCourse;
  }

  if (/\b(mathematics|general|biology|chemistry|physics|science|english|history)\b/i.test(message)) {
    return genericCourse;
  }

  return null;
}

function matchUnit(message: string, course: CourseIndex | null) {
  if (!course) return null;
  const hint = parseUnitHint(message);
  if (hint) {
    const exactMatch =
      course.units.find((unit) => normalize(unit.unitNumber) === normalize(hint)) ?? null;
    if (exactMatch) {
      return exactMatch;
    }
  }

  const genericUnit =
    course.units.find((unit) => isGenericLabel(unit.unitNumber) || isGenericLabel(unit.title)) ??
    null;
  if (!genericUnit) return null;

  if (hint) {
    return {
      ...genericUnit,
      unitNumber: hint,
      title: isGenericLabel(genericUnit.title) ? `Unit ${hint}` : genericUnit.title,
    };
  }

  if (course.units.length === 1 || course.units.every((unit) => isGenericLabel(unit.unitNumber) || isGenericLabel(unit.title))) {
    return genericUnit;
  }

  return null;
}

function normalizeTopicSignals(message: string) {
  const text = normalize(message);
  const enrichedSignals: string[] = [text];

  Object.entries(TOPIC_ALIASES).forEach(([topicName, aliases]) => {
    aliases.forEach((alias) => {
      if (text.includes(normalize(alias))) {
        enrichedSignals.push(normalize(topicName));
      }
    });
  });

  return enrichedSignals;
}

function matchTopics(message: string, unit: UnitIndex | null) {
  if (!unit) return [];
  const signals = normalizeTopicSignals(message);

  const scored = unit.topics
    .map((topic) => {
      const title = normalize(topic.title);
      const loText = normalize(
        topic.learningObjectives.map((item) => `${item.code} ${item.description}`).join(" "),
      );
      const ekText = normalize(
        topic.essentialKnowledge.map((item) => `${item.code} ${item.description}`).join(" "),
      );

      let score = 0;
      signals.forEach((signal) => {
        score += scoreContains(title, signal) * 2;
        score += scoreContains(loText, signal);
        score += scoreContains(ekText, signal);
      });

      return { topic, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    const genericTopic =
      unit.topics.find((topic) => isGenericLabel(topic.topicNumber) || isGenericLabel(topic.title)) ??
      null;
    if (!genericTopic) {
      return [];
    }
    const extractedTitle = extractTopicHint(message);
    return [
      {
        ...topicToMatch(genericTopic),
        title:
          extractedTitle ??
          (isGenericLabel(unit.title) ? genericTopic.title : unit.title),
      },
    ];
  }

  return scored.slice(0, 2).map((item) => topicToMatch(item.topic));
}

function createClarification(
  missing: Array<"subject" | "unit" | "topic">,
  index: CedIndex,
): LessonIntentResult {
  const questions: string[] = [];
  if (missing.includes("subject")) {
    questions.push("请先告诉我学科（例如 AP Calculus AB / AP Physics 1）。");
  }
  if (missing.includes("unit")) {
    questions.push("请补充单元信息（例如 Unit 5）。");
  }
  if (missing.includes("topic")) {
    questions.push("请补充具体知识点或主题（例如 Fundamental Theorem of Calculus）。");
  }

  const suggestions = {
    subjects: index.courses.slice(0, 6).map((item) => item.name),
  };

  return {
    needsClarification: true,
    missing,
    questions,
    suggestions,
  };
}

export async function parseLessonIntent(params: {
  message: string;
  supabase?: SupabaseClient<Database>;
  preferenceOverride?: Partial<LessonPlanPreferences>;
}): Promise<LessonIntentResult> {
  const index = await loadCedIndex(params.supabase);
  const { preferences, defaultsApplied } = parsePreferences(params.message);

  const mergedPreferences = {
    ...preferences,
    ...params.preferenceOverride,
  };

  const course = matchCourse(params.message, index);
  const unit = matchUnit(params.message, course);
  const topics = matchTopics(params.message, unit);

  const missing: Array<"subject" | "unit" | "topic"> = [];
  if (!course) missing.push("subject");
  if (!unit) missing.push("unit");
  if (topics.length === 0) missing.push("topic");

  if (missing.length > 0) {
    return createClarification(missing, index);
  }

  if (!course || !unit) {
    return createClarification(["subject", "unit"], index);
  }

  const confirmation: LessonIntentConfirmation = {
    subject: {
      courseId: course.id,
      code: course.code,
      name: course.name,
    },
    unit: {
      id: unit.id,
      unitNumber: unit.unitNumber,
      title: unit.title,
    },
    topics,
    preferences: mergedPreferences,
  };

  return {
    needsClarification: false,
    confirmation,
    defaultsApplied,
  };
}

export function collectEssentialKnowledge(topics: CedTopicMatch[]) {
  return topics.flatMap((topic) => topic.essentialKnowledge);
}

export function collectLearningObjectiveCodes(topics: CedTopicMatch[]) {
  const codeSet = new Set<string>();
  topics.forEach((topic) => {
    topic.learningObjectives.forEach((objective) => {
      codeSet.add(objective.code);
    });
  });
  return Array.from(codeSet);
}
