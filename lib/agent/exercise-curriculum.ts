import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateStructuredObjectWithGateway } from "@/lib/ai/gateway";
import { getModelForTask } from "@/lib/ai/model-router";
import { parseIntentFromText, type ParsedIntent } from "@/lib/chat/intent";
import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

type CourseRow = {
  id: string;
  name: string;
  code: string | null;
  framework: string | null;
};

type UnitRow = {
  id: string;
  title: string;
  unit_number: string | number | null;
};

type UnitWithCourseRow = UnitRow & {
  course_id: string;
};

type TopicRow = {
  id: string;
  title: string;
  topic_number: string | number | null;
  unit_id?: string;
};

type MissingField = "course" | "unit";

export type ExerciseCurriculumSaveMode = "save_now" | "defer_until_curriculum";

type RankedCourseCandidate = {
  item: CourseRow;
  score: number;
  matchedSignals: string[];
};

type RankedUnitCandidate = {
  item: UnitRow;
  score: number;
  matchedSignals: string[];
};

type TopicCandidateRow = TopicRow & {
  unit_id: string;
  unit: UnitRow;
  course?: CourseRow | null;
};

type RankedTopicCandidate = {
  item: TopicCandidateRow;
  score: number;
  matchedSignals: string[];
};

export type ExerciseCurriculumClarification = {
  summary: string;
  question: string;
  placeholder: string;
  options: string[];
};

export type ExerciseCurriculumResolution = {
  parsedIntent: ParsedIntent;
  courseId: string | null;
  unitId: string | null;
  topicId: string | null;
  courseName: string | null;
  unitLabel: string | null;
  topicName: string | null;
  missing: MissingField[];
  clarification: ExerciseCurriculumClarification | null;
  saveMode: ExerciseCurriculumSaveMode;
  saveHint: string | null;
};

const clarificationDecisionSchema = z.object({
  selectedCourseName: z.string().trim().max(160).optional().default(""),
  selectedUnitLabel: z.string().trim().max(160).optional().default(""),
  summary: z.string().trim().max(160).optional().default(""),
  question: z.string().trim().max(220).optional().default(""),
  placeholder: z.string().trim().max(120).optional().default(""),
  options: z.array(z.string().trim().min(1).max(120)).max(4).optional().default([]),
});

const generationDecisionSchema = z.object({
  canGenerateNow: z.boolean().optional().default(false),
  reason: z.string().trim().max(180).optional().default(""),
  question: z.string().trim().max(220).optional().default(""),
  placeholder: z.string().trim().max(120).optional().default(""),
});

function timeoutAfter<T>(ms: number, label: string): Promise<T> {
  return new Promise<T>((_, reject) => {
    const timeoutId = setTimeout(() => {
      clearTimeout(timeoutId);
      reject(new Error(`${label}_timeout`));
    }, ms);
  });
}

function normalizeLookupText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactLookupText(value: string) {
  return normalizeLookupText(value).replace(/\s+/g, "");
}

function prefersChineseText(value: string | null | undefined) {
  return /[\u4e00-\u9fa5]/.test(`${value ?? ""}`);
}

function formatUnitLabel(unit: UnitRow) {
  const normalizedUnitNumber = `${unit.unit_number ?? ""}`.trim();
  if (!normalizedUnitNumber) {
    return unit.title?.trim() || "通用单元";
  }
  return unit.title?.trim()
    ? `Unit ${normalizedUnitNumber} · ${unit.title.trim()}`
    : `Unit ${normalizedUnitNumber}`;
}

function deriveFamilyAlias(name: string) {
  const normalized = normalizeLookupText(name).replace(/^ap\s+/, "");
  if (!normalized) return "";
  return normalized
    .replace(/\s+(ab|bc)$/i, "")
    .replace(/\s+(language and composition|literature and composition)$/i, " english")
    .replace(/\s+(1|2)$/i, " physics")
    .replace(/\s+c\s+(mechanics|electricity and magnetism)$/i, " physics c");
}

function buildCourseAliases(course: CourseRow) {
  const normalizedName = normalizeLookupText(course.name);
  const normalizedCode = normalizeLookupText(course.code ?? "");
  const withoutAp = normalizedName.replace(/^ap\s+/, "");
  const familyAlias = deriveFamilyAlias(course.name);
  const aliases = new Set<string>([
    normalizedName,
    normalizedCode,
    withoutAp,
    familyAlias,
  ]);

  if (withoutAp.includes("calculus ab")) {
    aliases.add("calc ab");
  }
  if (withoutAp.includes("calculus bc")) {
    aliases.add("calc bc");
  }
  if (withoutAp === "calculus") {
    aliases.add("calc");
  }
  if (withoutAp.includes("computer science a")) {
    aliases.add("csa");
  }
  if (withoutAp.includes("computer science principles")) {
    aliases.add("csp");
  }
  if (withoutAp.includes("english language")) {
    aliases.add("ap lang");
    aliases.add("lang");
  }
  if (withoutAp.includes("english literature")) {
    aliases.add("ap lit");
    aliases.add("lit");
  }

  return Array.from(aliases).filter((item) => item.length >= 3);
}

function rankApCourseCandidates(params: {
  promptText: string;
  parsedIntent: ParsedIntent;
  courses: CourseRow[];
}) {
  const normalizedPrompt = normalizeLookupText(params.promptText);
  const normalizedCourseHint = normalizeLookupText(params.parsedIntent.courseHint ?? "");

  return params.courses
    .map((item) => {
      const matchedSignals: string[] = [];
      let score = 0;
      const normalizedName = normalizeLookupText(item.name);
      const normalizedCode = normalizeLookupText(item.code ?? "");
      const familyAlias = deriveFamilyAlias(item.name);

      if (normalizedName && normalizedPrompt.includes(normalizedName)) {
        score += 40;
        matchedSignals.push("exact_course_name");
      }
      if (normalizedCode && normalizedPrompt.includes(normalizedCode)) {
        score += 28;
        matchedSignals.push("course_code");
      }

      for (const alias of buildCourseAliases(item)) {
        if (!normalizedPrompt.includes(alias)) continue;
        if (alias === familyAlias) {
          score += 12;
          matchedSignals.push("family_alias");
          continue;
        }
        if (alias === normalizedName || alias === normalizedCode) {
          continue;
        }
        score += 18;
        matchedSignals.push("specific_alias");
      }

      if (normalizedCourseHint) {
        if (familyAlias === normalizedCourseHint) {
          score += 10;
          matchedSignals.push("course_hint_family");
        } else if (normalizedName.includes(normalizedCourseHint)) {
          score += 14;
          matchedSignals.push("course_hint_specific");
        }
      }

      return {
        item,
        score,
        matchedSignals: Array.from(new Set(matchedSignals)),
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.item.name.localeCompare(right.item.name);
    });
}

function rankUnitCandidates(params: {
  promptText: string;
  parsedIntent: ParsedIntent;
  units: UnitRow[];
}) {
  const normalizedPrompt = normalizeLookupText(params.promptText);
  const normalizedTopic = normalizeLookupText(
    params.parsedIntent.topic ?? params.parsedIntent.topicFocus ?? "",
  );

  return params.units
    .map((item) => {
      const matchedSignals: string[] = [];
      let score = 0;
      const normalizedTitle = normalizeLookupText(item.title ?? "");

      if (
        params.parsedIntent.unitHint &&
        `${item.unit_number}` === params.parsedIntent.unitHint.trim()
      ) {
        score += 60;
        matchedSignals.push("explicit_unit_number");
      }

      if (normalizedTitle && normalizedPrompt.includes(normalizedTitle)) {
        score += 28;
        matchedSignals.push("unit_title");
      }

      if (normalizedTopic && normalizedTitle && normalizedTitle.includes(normalizedTopic)) {
        score += 18;
        matchedSignals.push("topic_overlap");
      }

      return {
        item,
        score,
        matchedSignals: Array.from(new Set(matchedSignals)),
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const leftNumber = Number(left.item.unit_number ?? Number.MAX_SAFE_INTEGER);
      const rightNumber = Number(right.item.unit_number ?? Number.MAX_SAFE_INTEGER);
      return leftNumber - rightNumber;
    });
}

function tokenizeLookupText(value: string) {
  return normalizeLookupText(value)
    .split(" ")
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function rankTopicCandidates(params: {
  promptText: string;
  parsedIntent: ParsedIntent;
  topics: TopicCandidateRow[];
}) {
  const normalizedPrompt = normalizeLookupText(params.promptText);
  const compactPrompt = compactLookupText(params.promptText);
  const normalizedTopic = normalizeLookupText(
    params.parsedIntent.topic ?? params.parsedIntent.topicFocus ?? "",
  );
  const compactTopic = compactLookupText(params.parsedIntent.topic ?? params.parsedIntent.topicFocus ?? "");
  const promptTokens = new Set(tokenizeLookupText(params.promptText));

  return params.topics
    .map((item) => {
      const matchedSignals: string[] = [];
      let score = 0;
      const normalizedTitle = normalizeLookupText(item.title ?? "");
      const compactTitle = compactLookupText(item.title ?? "");

      if (
        params.parsedIntent.topicHint &&
        `${item.topic_number}`.trim() === params.parsedIntent.topicHint.trim()
      ) {
        score += 60;
        matchedSignals.push("explicit_topic_number");
      }

      if (normalizedTitle && normalizedPrompt.includes(normalizedTitle)) {
        score += 44;
        matchedSignals.push("exact_topic_title");
      }
      if (compactTitle && compactPrompt.includes(compactTitle) && !normalizedPrompt.includes(normalizedTitle)) {
        score += 42;
        matchedSignals.push("compact_topic_title");
      }

      if (normalizedTopic) {
        if (normalizedTitle === normalizedTopic) {
          score += 40;
          matchedSignals.push("topic_exact");
        } else if (normalizedTitle.includes(normalizedTopic)) {
          score += 30;
          matchedSignals.push("topic_contained");
        }

        const overlap = tokenizeLookupText(item.title).filter((token) => promptTokens.has(token));
        if (overlap.length > 0) {
          score += overlap.length * 8;
          matchedSignals.push("topic_token_overlap");
        }
      }
      if (compactTopic) {
        if (compactTitle === compactTopic) {
          score += 38;
          matchedSignals.push("topic_exact_compact");
        } else if (compactTitle.includes(compactTopic)) {
          score += 28;
          matchedSignals.push("topic_contained_compact");
        }
      }
      if (item.course) {
        const normalizedCourseHint = normalizeLookupText(params.parsedIntent.courseHint ?? "");
        if (normalizedCourseHint && deriveFamilyAlias(item.course.name) === normalizedCourseHint) {
          score += 6;
          matchedSignals.push("course_hint_family");
        }
        if (buildCourseAliases(item.course).some((alias) => normalizedPrompt.includes(alias))) {
          score += 8;
          matchedSignals.push("course_alias_overlap");
        }
      }

      return {
        item,
        score,
        matchedSignals: Array.from(new Set(matchedSignals)),
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const leftUnitNumber = Number(left.item.unit.unit_number ?? Number.MAX_SAFE_INTEGER);
      const rightUnitNumber = Number(right.item.unit.unit_number ?? Number.MAX_SAFE_INTEGER);
      if (leftUnitNumber !== rightUnitNumber) return leftUnitNumber - rightUnitNumber;
      return `${left.item.topic_number ?? ""}`.localeCompare(`${right.item.topic_number ?? ""}`);
    });
}

function resolveSingleCourse(candidates: RankedCourseCandidate[]) {
  const first = candidates[0];
  const second = candidates[1];
  if (!first) return null;
  if (first.score >= 40) return first.item;
  if (!second && first.score >= 10) return first.item;
  if (first.score >= 24 && (!second || first.score - second.score >= 6)) {
    return first.item;
  }
  return null;
}

function resolveSingleUnit(candidates: RankedUnitCandidate[]) {
  const first = candidates[0];
  const second = candidates[1];
  if (!first) return null;
  if (first.score >= 60) return first.item;
  if (!second && first.score >= 18) return first.item;
  if (first.score >= 28 && (!second || first.score - second.score >= 8)) {
    return first.item;
  }
  return null;
}

function resolveSingleTopicCandidate(candidates: RankedTopicCandidate[]) {
  const first = candidates[0];
  const second = candidates[1];
  if (!first) return null;
  if (first.score >= 44) return first.item;
  if (!second && first.score >= 24) return first.item;
  if (first.score >= 30 && (!second || first.score - second.score >= 8)) {
    return first.item;
  }
  return null;
}

type TopicDrivenCurriculumResolution = {
  course: CourseRow;
  unit: UnitRow;
  topic: TopicCandidateRow;
};

function hasResolvableTopicSignal(parsedIntent: ParsedIntent) {
  const normalizedTopic = normalizeLookupText(parsedIntent.topic ?? parsedIntent.topicFocus ?? "");
  const compactTopic = compactLookupText(parsedIntent.topic ?? parsedIntent.topicFocus ?? "");
  return Boolean(parsedIntent.topicHint || normalizedTopic.length >= 2 || compactTopic.length >= 4);
}

export function resolveTopicDrivenCurriculum(params: {
  promptText: string;
  parsedIntent: ParsedIntent;
  courses: CourseRow[];
  units: UnitWithCourseRow[];
  topics: TopicRow[];
}): TopicDrivenCurriculumResolution | null {
  if (!hasResolvableTopicSignal(params.parsedIntent)) {
    return null;
  }

  const courseById = new Map(params.courses.map((item) => [item.id, item]));
  const unitById = new Map(params.units.map((item) => [item.id, item]));
  const topicRowsForRanking: TopicCandidateRow[] = [];

  for (const item of params.topics) {
    const unit = unitById.get(item.unit_id ?? "");
    if (!unit) continue;
    const course = courseById.get(unit.course_id);
    if (!course) continue;
    topicRowsForRanking.push({
      ...item,
      unit_id: item.unit_id ?? unit.id,
      unit,
      course,
    });
  }

  const topicCandidates = rankTopicCandidates({
    promptText: params.promptText,
    parsedIntent: params.parsedIntent,
    topics: topicRowsForRanking,
  });
  const resolvedTopic = resolveSingleTopicCandidate(topicCandidates);
  if (!resolvedTopic?.course) {
    return null;
  }

  return {
    course: resolvedTopic.course,
    unit: resolvedTopic.unit,
    topic: resolvedTopic,
  };
}

function matchCourseByAiName(name: string, candidates: RankedCourseCandidate[]) {
  const normalized = normalizeLookupText(name);
  if (!normalized) return null;
  return (
    candidates.find((candidate) => normalizeLookupText(candidate.item.name) === normalized)?.item ??
    candidates.find((candidate) => normalizeLookupText(candidate.item.code ?? "") === normalized)?.item ??
    null
  );
}

function matchUnitByAiLabel(label: string, candidates: RankedUnitCandidate[]) {
  const normalized = normalizeLookupText(label);
  if (!normalized) return null;
  return (
    candidates.find((candidate) => normalizeLookupText(formatUnitLabel(candidate.item)) === normalized)?.item ??
    candidates.find((candidate) => normalizeLookupText(candidate.item.title) === normalized)?.item ??
    null
  );
}

function buildFallbackCourseClarification(params: {
  parsedIntent: ParsedIntent;
  courseCandidates: RankedCourseCandidate[];
  needsUnit: boolean;
}): ExerciseCurriculumClarification {
  const options = params.courseCandidates.slice(0, 3).map((candidate) => candidate.item.name);
  const familyAlias = params.parsedIntent.courseHint?.trim();
  const summary = familyAlias
    ? `我已经识别到你在 AP ${familyAlias[0].toUpperCase()}${familyAlias.slice(1)} 范围内，但还差最后一个最小必要信息。`
    : "我已经识别到你要生成 AP 题目，但还差最后一个最小必要信息。";

  if (options.length >= 2) {
    return {
      summary,
      question: params.needsUnit
        ? `你指的是 ${options.slice(0, 2).join(" 还是 ")}？另外是哪个 Unit？`
        : `你指的是 ${options.slice(0, 2).join(" 还是 ")}？`,
      placeholder: params.needsUnit ? `${options[0]} Unit 3` : options[0],
      options,
    };
  }

  return {
    summary,
    question: params.needsUnit ? "这套题对应哪门 AP 课程和哪个 Unit？" : "这套题对应哪门 AP 课程？",
    placeholder: params.needsUnit ? "例如：AP Biology Unit 3" : "例如：AP Biology",
    options,
  };
}

function buildFallbackUnitClarification(params: {
  courseName: string;
  unitCandidates: RankedUnitCandidate[];
}): ExerciseCurriculumClarification {
  const options = params.unitCandidates.slice(0, 3).map((candidate) => formatUnitLabel(candidate.item));
  return {
    summary: `我已经识别课程是 ${params.courseName}，现在只差具体 Unit。`,
    question: `你希望题目落在哪个 Unit？`,
    placeholder: options[0] ?? "例如：Unit 3",
    options,
  };
}

async function generateCurriculumClarification(params: {
  promptText: string;
  recentConversationText?: string;
  missing: MissingField[];
  parsedIntent: ParsedIntent;
  courseCandidates: RankedCourseCandidate[];
  unitCandidates?: RankedUnitCandidate[];
  resolvedCourse?: CourseRow | null;
}): Promise<z.infer<typeof clarificationDecisionSchema> | null> {
  const missingLabel =
    params.missing.length > 1 ? params.missing.join(", ") : params.missing[0] ?? "course";
  const courseCandidateText = params.courseCandidates
    .slice(0, 4)
    .map(
      (candidate, index) =>
        `${index + 1}. ${candidate.item.name} | score=${candidate.score} | signals=${candidate.matchedSignals.join(",") || "none"}`,
    )
    .join("\n");
  const unitCandidateText = (params.unitCandidates ?? [])
    .slice(0, 5)
    .map(
      (candidate, index) =>
        `${index + 1}. ${formatUnitLabel(candidate.item)} | score=${candidate.score} | signals=${candidate.matchedSignals.join(",") || "none"}`,
    )
    .join("\n");

  try {
    const task = generateStructuredObjectWithGateway({
      model: getModelForTask("intent"),
      schema: clarificationDecisionSchema,
      systemPrompt:
        "你负责为教师题目生成流程决定下一条最小必要追问。优先利用上下文补全信息；只有在无法可靠补全时才追问。不要问宽泛问题，绝不能在已经知道课程族别时再问“是什么科目”。如果候选里已经足够明显，可直接从候选中选出 selectedCourseName 或 selectedUnitLabel，且必须逐字使用候选原文。question 必须只问一个最关键的问题，options 最多 3 个。",
      userPrompt: [
        `教师请求：${params.promptText}`,
        params.recentConversationText
          ? `最近上下文：\n${params.recentConversationText}`
          : "最近上下文：无",
        `当前缺失字段：${missingLabel}`,
        `解析提示：courseHint=${params.parsedIntent.courseHint ?? ""}; unitHint=${params.parsedIntent.unitHint ?? ""}; topic=${params.parsedIntent.topic ?? params.parsedIntent.topicFocus ?? ""}`,
        params.resolvedCourse ? `已确认课程：${params.resolvedCourse.name}` : "已确认课程：无",
        `课程候选：\n${courseCandidateText || "无"}`,
        `单元候选：\n${unitCandidateText || "无"}`,
        "返回要求：",
        "- 如果你能可靠确定课程或单元，就填写 selectedCourseName / selectedUnitLabel。",
        "- 如果仍需追问，summary 用一句话说明为什么要问，question 只问最窄的那个问题。",
        "- placeholder 给老师一个可直接回复的示例。",
        "- options 仅保留最有帮助的 2-3 个候选。",
      ].join("\n\n"),
      maxTokens: 420,
      temperature: 0.1,
      maxRetries: 1,
    });

    const { object } = await Promise.race([
      task,
      timeoutAfter<{ object: z.infer<typeof clarificationDecisionSchema> }>(2500, "exercise_curriculum_clarification"),
    ]);

    return object;
  } catch {
    return null;
  }
}

async function decideExerciseGenerationReadiness(params: {
  promptText: string;
  recentConversationText?: string;
  parsedIntent: ParsedIntent;
  missing: MissingField[];
  courseCandidates: RankedCourseCandidate[];
}): Promise<z.infer<typeof generationDecisionSchema> | null> {
  const courseCandidateText = params.courseCandidates
    .slice(0, 4)
    .map(
      (candidate, index) =>
        `${index + 1}. ${candidate.item.name} | score=${candidate.score} | signals=${candidate.matchedSignals.join(",") || "none"}`,
    )
    .join("\n");

  try {
    const task = generateStructuredObjectWithGateway({
      model: getModelForTask("intent"),
      schema: generationDecisionSchema,
      systemPrompt:
        "你负责判断教师的习题请求是否已经具备执行所需的最小信息。课程和 Unit 主要影响题库归档，不应该默认阻塞生成。只要老师已经给出足够明确的学科/知识点/题量/题型中的关键信息，通常就应该 canGenerateNow=true。像“帮我生成三道chainrule习题”这种已包含明确知识点和题量的请求，必须判定为 canGenerateNow=true。只有在缺少学科或知识点，导致无法生成合格题目时，才 canGenerateNow=false，并给出一个最小追问。",
      userPrompt: [
        `教师请求：${params.promptText}`,
        params.recentConversationText
          ? `最近上下文：\n${params.recentConversationText}`
          : "最近上下文：无",
        `缺失的归档字段：${params.missing.join(", ") || "无"}`,
        `解析提示：courseHint=${params.parsedIntent.courseHint ?? ""}; unitHint=${params.parsedIntent.unitHint ?? ""}; topic=${params.parsedIntent.topic ?? params.parsedIntent.topicFocus ?? ""}; exerciseType=${params.parsedIntent.exerciseType ?? params.parsedIntent.exerciseParams?.exerciseType ?? ""}`,
        `课程候选：\n${courseCandidateText || "无"}`,
        "返回要求：",
        "- 如果当前已经足够先生成题目，返回 canGenerateNow=true。",
        "- 如果只是无法确定题库归档课程，也仍然返回 canGenerateNow=true。",
        "- 只有当前真的缺少生成所需信息时，才返回 canGenerateNow=false，并补一个最小追问。",
      ].join("\n\n"),
      maxTokens: 220,
      temperature: 0.1,
      maxRetries: 1,
    });

    const { object } = await Promise.race([
      task,
      timeoutAfter<{ object: z.infer<typeof generationDecisionSchema> }>(2200, "exercise_generation_readiness"),
    ]);

    return object;
  } catch {
    return null;
  }
}

function buildDeferredSaveHint(params: { parsedIntent: ParsedIntent; courseCandidates: RankedCourseCandidate[] }) {
  const topic = params.parsedIntent.topic ?? params.parsedIntent.topicFocus ?? "";
  const topicLabel = topic ? `“${topic}”` : "当前这组题";
  return `${topicLabel} 我可以先生成给你看；如果后续要真实写入题库，再补一句明确的 AP 课程和 Unit 即可。`;
}

function resolveTopic(params: {
  parsedIntent: ParsedIntent;
  topicRows: TopicRow[];
}) {
  const topicSignal = normalizeLookupText(params.parsedIntent.topic ?? params.parsedIntent.topicFocus ?? "");
  const compactTopicSignal = compactLookupText(params.parsedIntent.topic ?? params.parsedIntent.topicFocus ?? "");
  return (
    params.topicRows.find((item) => {
      if (
        params.parsedIntent.topicHint &&
        `${item.topic_number}`.trim() === params.parsedIntent.topicHint.trim()
      ) {
        return true;
      }
      const normalizedTitle = normalizeLookupText(item.title);
      const compactTitle = compactLookupText(item.title);
      if (topicSignal.length > 1 && normalizedTitle.includes(topicSignal)) {
        return true;
      }
      return compactTopicSignal.length >= 4 && compactTitle.includes(compactTopicSignal);
    }) ?? null
  );
}

export async function resolveApExerciseCurriculum(params: {
  supabase: AppSupabase;
  promptText: string;
  recentConversationText?: string;
}): Promise<ExerciseCurriculumResolution> {
  const parsedIntent = parseIntentFromText(params.promptText);

  const { data: courseRows, error: courseError } = await params.supabase
    .from("courses")
    .select("id, name, code, framework")
    .order("name", { ascending: true });
  if (courseError) {
    throw new Error("读取课程失败");
  }

  const courses = (courseRows ?? []).filter((item) => `${item.framework ?? ""}`.toUpperCase() === "AP");
  const courseCandidates = rankApCourseCandidates({
    promptText: params.promptText,
    parsedIntent,
    courses,
  });

  let course = resolveSingleCourse(courseCandidates);
  let topicResolvedUnit: UnitRow | null = null;
  let topicResolvedTopic: TopicCandidateRow | null = null;
  let courseClarification: ExerciseCurriculumClarification | null = null;

  if (!course) {
    const courseIds = hasResolvableTopicSignal(parsedIntent) ? courses.map((item) => item.id) : [];
    if (courseIds.length > 0) {
      const { data: unitRowsForTopic, error: unitRowsForTopicError } = await params.supabase
        .from("units")
        .select("id, title, unit_number, course_id")
        .in("course_id", courseIds)
        .order("unit_number", { ascending: true });
      if (unitRowsForTopicError) {
        throw new Error("读取单元失败");
      }

      const topicUnitIds = (unitRowsForTopic ?? []).map((item) => item.id);
      if (topicUnitIds.length > 0) {
        const { data: topicRowsForCourse, error: topicRowsForCourseError } = await params.supabase
          .from("topics")
          .select("id, title, topic_number, unit_id")
          .in("unit_id", topicUnitIds)
          .order("topic_number", { ascending: true });
        if (topicRowsForCourseError) {
          throw new Error("读取知识点失败");
        }

        const topicDrivenResolution = resolveTopicDrivenCurriculum({
          promptText: params.promptText,
          parsedIntent,
          courses,
          units: unitRowsForTopic ?? [],
          topics: topicRowsForCourse ?? [],
        });
        if (topicDrivenResolution) {
          course = topicDrivenResolution.course;
          topicResolvedUnit = topicDrivenResolution.unit;
          topicResolvedTopic = topicDrivenResolution.topic;
        }
      }
    }

    if (!course) {
      const aiDecision = await generateCurriculumClarification({
        promptText: params.promptText,
        recentConversationText: params.recentConversationText,
        missing: ["course", "unit"],
        parsedIntent,
        courseCandidates,
      });
      const aiCourse = matchCourseByAiName(aiDecision?.selectedCourseName ?? "", courseCandidates);
      if (aiCourse) {
        course = aiCourse;
      } else {
        const fallback = buildFallbackCourseClarification({
          parsedIntent,
          courseCandidates,
          needsUnit: false,
        });
        courseClarification = {
          summary: aiDecision?.summary || fallback.summary,
          question: aiDecision?.question || fallback.question,
          placeholder: aiDecision?.placeholder || fallback.placeholder,
          options: aiDecision?.options?.length ? aiDecision.options : fallback.options,
        };
      }
    }
  }

  if (!course) {
    const generationDecision = await decideExerciseGenerationReadiness({
      promptText: params.promptText,
      recentConversationText: params.recentConversationText,
      parsedIntent,
      missing: ["course"],
      courseCandidates,
    });
    const canGenerateWithoutCurriculum =
      generationDecision?.canGenerateNow ||
      (!generationDecision &&
        parsedIntent.actions.includes("generate_exercises") &&
        hasResolvableTopicSignal(parsedIntent));
    if (canGenerateWithoutCurriculum) {
      const fallbackSaveHint = buildDeferredSaveHint({ parsedIntent, courseCandidates });
      return {
        parsedIntent,
        courseId: null,
        unitId: null,
        topicId: null,
        courseName: null,
        unitLabel: null,
        topicName: null,
        missing: [],
        clarification: null,
        saveMode: "defer_until_curriculum",
        saveHint: prefersChineseText(generationDecision?.reason)
          ? generationDecision?.reason ?? fallbackSaveHint
          : fallbackSaveHint,
      };
    }

    return {
      parsedIntent,
      courseId: null,
      unitId: null,
      topicId: null,
      courseName: null,
      unitLabel: null,
      topicName: null,
      missing: ["course"],
      clarification:
        generationDecision?.question
          ? {
              summary:
                generationDecision.reason ||
                "我还缺一个会直接影响出题方向的关键信息。",
              question: generationDecision.question,
              placeholder: generationDecision.placeholder || "例如：AP Calculus BC",
              options: [],
            }
          : courseClarification,
      saveMode: "defer_until_curriculum",
      saveHint: null,
    };
  }

  const { data: unitRows, error: unitError } = await params.supabase
    .from("units")
    .select("id, title, unit_number")
    .eq("course_id", course.id)
    .order("unit_number", { ascending: true });
  if (unitError) {
    throw new Error("读取单元失败");
  }

  const unitCandidates = rankUnitCandidates({
    promptText: params.promptText,
    parsedIntent,
    units: unitRows ?? [],
  });

  let unit =
    topicResolvedUnit && (unitRows ?? []).some((item) => item.id === topicResolvedUnit.id)
      ? topicResolvedUnit
      : resolveSingleUnit(unitCandidates);
  if (!unit && (unitRows ?? []).length === 1) {
    unit = unitRows?.[0] ?? null;
  }
  let inferredTopicFromCourse: TopicCandidateRow | null = topicResolvedTopic;

  if (!unit) {
    const topicSignal = normalizeLookupText(parsedIntent.topic ?? parsedIntent.topicFocus ?? "");
    const unitById = new Map((unitRows ?? []).map((item) => [item.id, item]));

    if (topicSignal.length > 1 && unitById.size > 0) {
      const { data: courseTopicRows, error: courseTopicError } = await params.supabase
        .from("topics")
        .select("id, title, topic_number, unit_id")
        .in("unit_id", Array.from(unitById.keys()))
        .order("topic_number", { ascending: true });
      if (courseTopicError) {
        throw new Error("读取知识点失败");
      }

      const topicRowsForRanking: TopicCandidateRow[] = [];
      for (const item of courseTopicRows ?? []) {
        const matchedUnit = unitById.get(item.unit_id);
        if (!matchedUnit) continue;
        topicRowsForRanking.push({
          ...item,
          unit: matchedUnit,
        });
      }

      const topicCandidates = rankTopicCandidates({
        promptText: params.promptText,
        parsedIntent,
        topics: topicRowsForRanking,
      });
      const inferredTopic = resolveSingleTopicCandidate(topicCandidates);
      if (inferredTopic) {
        inferredTopicFromCourse = inferredTopic;
        unit = inferredTopic.unit;
      }
    }
  }

  if (!unit) {
    return {
      parsedIntent,
      courseId: course.id,
      unitId: null,
      topicId: null,
      courseName: course.name,
      unitLabel: null,
      topicName: null,
      missing: [],
      clarification: null,
      saveMode: "save_now",
      saveHint: null,
    };
  }

  const { data: topicRows, error: topicError } = await params.supabase
    .from("topics")
    .select("id, title, topic_number")
    .eq("unit_id", unit.id)
    .order("topic_number", { ascending: true });
  if (topicError) {
    throw new Error("读取知识点失败");
  }

  const topic = resolveTopic({
    parsedIntent,
    topicRows: topicRows ?? [],
  }) ?? (
    inferredTopicFromCourse && inferredTopicFromCourse.unit_id === unit.id
      ? inferredTopicFromCourse
      : null
  );

  return {
    parsedIntent,
    courseId: course.id,
    unitId: unit.id,
    topicId: topic?.id ?? null,
    courseName: course.name,
    unitLabel: formatUnitLabel(unit),
    topicName: topic?.title ?? null,
    missing: [],
    clarification: null,
    saveMode: "save_now",
    saveHint: null,
  };
}

export function buildExerciseMissingContextMessage(resolution: {
  courseName: string | null;
  clarification: ExerciseCurriculumClarification | null;
}) {
  const fallbackSummary = resolution.courseName
    ? `我已经识别课程是 ${resolution.courseName}，但还差一个最小必要信息。`
    : "我已经识别到你要生成 AP 题目，但还差一个最小必要信息。";
  const fallbackQuestion = resolution.courseName
    ? "请补充你希望归档到哪个 Unit。"
    : "请补充 AP 课程归属。";
  const fallbackPlaceholder = resolution.courseName
    ? `${resolution.courseName} Unit 3`
    : "例如：AP Calculus BC";

  const summary = resolution.clarification?.summary || fallbackSummary;
  const question = resolution.clarification?.question || fallbackQuestion;
  const placeholder = resolution.clarification?.placeholder || fallbackPlaceholder;
  const options = resolution.clarification?.options ?? [];

  return [
    summary,
    question,
    ...options.map((option) => `- ${option}`),
    `直接回复示例：${placeholder}`,
    "补全后我会直接继续生成，并把结果真实写入数据库；内容库可用时也会自动同步。",
  ]
    .filter(Boolean)
    .join("\n");
}

export { formatUnitLabel, rankApCourseCandidates, rankTopicCandidates };
