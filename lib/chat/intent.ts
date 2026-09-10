
import type { ExerciseDifficulty } from "@/types/exercise";
import { extractRequestedCount } from "@/lib/text/count-parser";

export const WORKFLOW_ACTIONS = [
  "generate_rubric",
  "generate_exercises",
  "generate_lesson_plan",
  "generate_pbl",
  "save_exercises",
  "create_worksheet",
  "export_exam_pdf",
  "export_worksheet_pdf",
  "export_rubric_pdf",
  "scan_pdf",
  "organize_content",
] as const;

export type WorkflowAction = (typeof WORKFLOW_ACTIONS)[number];

export type FollowUpQuestion = {
  id: string;
  question: string;
  field: string;
  options: Array<{ label: string; value: string | number | boolean }>;
  defaultIndex: number;
};

export type ExerciseIntentParams = {
  count: number;
  exerciseType: "MC" | "FR" | "MIXED";
  difficulty: ExerciseDifficulty;
  topicFocus: string | null;
} | null;

export type RubricIntentParams = {
  dimensionCount: number | null;
} | null;

export type LessonIntentParams = {
  duration: number;
  level: "basic" | "medium" | "advanced";
  templateKind: "concept" | "example" | "sprint" | "inquiry";
} | null;

export type ExportIntentParams = {
  examTemplate: "exam-classic" | "exam-modern";
  worksheetTemplate: "worksheet-academic" | "worksheet-friendly";
  rubricTemplate: "rubric-table" | "rubric-cards";
  worksheetTitle: string | null;
} | null;

export type ParsedIntent = {
  actions: WorkflowAction[];
  commonParams: {
    teacherRequest: string;
  };
  exerciseParams: ExerciseIntentParams;
  rubricParams: RubricIntentParams;
  lessonParams: LessonIntentParams;
  exportParams: ExportIntentParams;
  followUpQuestions?: FollowUpQuestion[];

  // Legacy flattened fields (for backward compatibility)
  count: number;
  exerciseType: "MC" | "FR" | "MIXED";
  difficulty: ExerciseDifficulty;
  includeRubric: boolean;
  examTemplate: "exam-classic" | "exam-modern";
  worksheetTemplate: "worksheet-academic" | "worksheet-friendly";
  rubricTemplate: "rubric-table" | "rubric-cards";
  worksheetTitle: string | null;
  topicFocus?: string;
  rubricDimensionCount?: number;
  duration?: number;
  level?: "basic" | "medium" | "advanced";
  templateKind?: "concept" | "example" | "sprint" | "inquiry";

  unitHint?: string;
  topicHint?: string;
  courseHint?: string;
  track?: "ap" | "general";
  topic?: string;
  subjectCategory?: string;
  gradeLevel?: string;
  enableWebSearch?: boolean;
};

export type IntentConfidence = "high" | "medium" | "low";
export type IntentTrack = "ap" | "general";
export type RequiredIntentField = "action" | "track" | "courseId" | "unitId" | "topic";
export type IntentCompleteness = "complete" | "needs_info";

export const ACTION_ORDER: WorkflowAction[] = [...WORKFLOW_ACTIONS];
export const REQUIRED_COURSE_ACTIONS = new Set<WorkflowAction>([
  "generate_exercises",
  "generate_rubric",
  "generate_lesson_plan",
  "create_worksheet",
]);
export const REQUIRED_UNIT_ACTIONS = new Set<WorkflowAction>([
  "generate_exercises",
  "generate_lesson_plan",
  "create_worksheet",
]);
export const GENERATION_ACTIONS = new Set<WorkflowAction>([
  "generate_exercises",
  "generate_rubric",
  "generate_lesson_plan",
  "create_worksheet",
]);

const GENERATE_WORD_PATTERN =
  /(生成|创建|新建|制作|编写|出(?:题|卷|几题|几道)|做(?:题|个|套|几题|几道)|写(?:题|个|套|几题|几道)|(?:出|做|写)\s*\d{1,2}\s*(?:道|题|个|套))/i;
const LESSON_WORD_PATTERN =
  /(教案|教学计划|教学设计|lesson\s*plan|mini\s*lesson|micro\s*lesson|备课|课件|课堂设计|课堂流程|课时安排|上课|微课)/i;
const EXERCISE_WORD_PATTERN =
  /(习题|题目|出题|练习题|exercise|exercises|practice\s+questions?|quiz\s+questions?|question\s+set|worksheet|刷题|练习|选择题|问答题|简答题|计算题|填空题|题单|套题|mcq|frq|multiple\s*choice|free\s*response|(?:\d{1,2}\s*(?:道|题)))/i;
const RUBRIC_WORD_PATTERN = /(rubric|评分标准|评分量表|评分细则|评分规则)/i;
const PBL_WORD_PATTERN = /(pbl|项目式学习|项目制学习|project\s*-?\s*based\s*learning|pbl\s*项目|pbl\s*plan)/i;
const WORKSHEET_WORD_PATTERN = /(worksheet|练习卷|作业单|组卷)/i;
const EXAM_WORD_PATTERN = /(exam|试卷|考试卷)/i;
const PDF_WORD_PATTERN = /(pdf|导出|下载|排版|打印)/i
const SCAN_PDF_PATTERN = /(扫描|识别|导入|解析|提取).*(pdf|试卷|试题|题目)|上传.*(pdf|试卷)/i;
const ORGANIZE_CONTENT_PATTERN = /(整理|归类|归档|分类|移到|移动到|放到|放进|搬到|排列|organize|sort\s+my\s+files?|move\s+.*\s+to|categorize|tidy\s+up|clean\s+up\s+my\s+(?:files?|content|library))/i;
export const SAVE_TO_QUESTION_BANK_PATTERN =
  /(保存(?:到|进)?题库|存入题库|写入题库|入库|归档(?:到)?题库)/i;
export const QUESTION_BANK_RETRIEVAL_PATTERN =
  /(从.*题库|题库里|现成题|已有题|已有习题|我上传的题|我的题|上传的题|历年题册|question\s*bank|existing\s+questions?|uploaded\s+questions?)/i;
const CHINESE_SUBJECT_PATTERN = /(语文|中文|国语|作文|阅读理解|文言文|古诗|古文|散文|议论文|修辞|成语|拼音)/i;
const ENGLISH_NONAP_PATTERN = /(英语|grammar|被动语态|虚拟语气|完形填空|六级|四级|口语|听力|阅读理解)/i;
const HISTORY_NONAP_PATTERN = /(中国历史|世界历史|近代史|三国|明朝|清朝|唐朝|文艺复兴|工业革命|历史故事)/i;
const GENERAL_SUBJECT_PATTERN = /(地理|政治|思想品德|生物(?!.*ap)|化学(?!.*ap)|物理(?!.*ap)|科学探究)/i;

export function normalizeIntentSurfaceText(input: string) {
  return input
    .replace(/\bwork[\s-]+sheet\b/gi, "worksheet")
    .replace(/\bguided[\s-]+notes?\b/gi, "guided notes")
    .replace(/\bactivity[\s-]+sheet\b/gi, "activity sheet")
    .replace(/\bstudy[\s-]+guide\b/gi, "study guide")
    .replace(/\bexit[\s-]+ticket\b/gi, "exit ticket")
    .replace(/\s+/g, " ")
    .trim();
}

function clampCount(raw: number) {
  return Math.max(1, Math.min(20, raw));
}

function clampDuration(raw: number) {
  return Math.max(15, Math.min(180, raw));
}

function normalizeActions(input: WorkflowAction[]) {
  const actionSet = new Set<WorkflowAction>(input);

  if (actionSet.has("export_rubric_pdf")) {
    actionSet.add("generate_rubric");
  }

  if (actionSet.has("export_worksheet_pdf")) {
    actionSet.add("create_worksheet");
  }

  return ACTION_ORDER.filter((action) => actionSet.has(action));
}

function parseExerciseType(input: string): "MC" | "FR" | "MIXED" {
  const wantsMC = /(mc|选择题|选择|choice|multiple\s*choice|判断题|true\s*-?\s*false)/i.test(input);
  const wantsFR = /(fr|frq|问答|解答|简答|大题|free\s*response|填空题|计算题|应用题)/i.test(input);
  return wantsMC && wantsFR ? "MIXED" : wantsFR ? "FR" : "MC";
}

function parseDifficulty(input: string): ExerciseDifficulty {
  if (/(简单|基础|入门|easy|beginner)/i.test(input)) return "easy";
  if (/(困难|偏难|较难|有难度|hard|ap\s*level|考试难度|冲刺|高难|挑战|very\s*hard|advanced)/i.test(input)) return "hard";
  return "medium";
}

export function inferExplicitExerciseType(input: string): "MC" | "FR" | undefined {
  if (/(问答题|简答题|free\s*response|frq|fr\b|填空题|计算题|应用题)/i.test(input)) {
    return "FR";
  }
  if (/(选择题|multiple\s*choice|mcq|mc\b|判断题|true\s*-?\s*false)/i.test(input)) {
    return "MC";
  }
  return undefined;
}

export function inferExplicitDifficulty(input: string): ExerciseDifficulty | undefined {
  if (!/(基础|简单|中等|困难|challenging|hard|easy|medium|入门|偏难|高难|挑战|advanced)/i.test(input)) {
    return undefined;
  }
  return parseDifficulty(input);
}

export function inferExplicitExerciseTypeFromTexts(
  texts: string[],
): "MC" | "FR" | undefined {
  for (const text of texts) {
    const inferred = inferExplicitExerciseType(text);
    if (inferred) return inferred;
  }
  return undefined;
}

export function inferExplicitDifficultyFromTexts(
  texts: string[],
): 1 | 2 | 3 | 4 | undefined {
  for (const text of texts) {
    const inferred = inferExplicitDifficulty(text);
    if (typeof inferred === "number") return inferred;
  }
  return undefined;
}

function parseLessonLevel(input: string): "basic" | "medium" | "advanced" {
  if (/(基础|入门|beginner|basic)/i.test(input)) return "basic";
  if (/(进阶|高阶|advanced)/i.test(input)) return "advanced";
  return "medium";
}

function parseTemplateKind(input: string): "concept" | "example" | "sprint" | "inquiry" {
  if (/(例题示范|example)/i.test(input)) return "example";
  if (/(复习冲刺|sprint)/i.test(input)) return "sprint";
  if (/(探究式|inquiry)/i.test(input)) return "inquiry";
  return "concept";
}

export function extractRequestedArtifactTitle(input: string): string | null {
  const normalized = input.trim();
  if (!normalized) return null;

  const quotedPatterns = [
    /标题(?:写成|改成|改为|命名为|叫做)\s*[“"「]([^”"」\n]{2,120})[”"」]/i,
    /(?:title|name)\s*(?:as|to|:)\s*[“"]([^”"\n]{2,120})[”"]/i,
  ];

  for (const pattern of quotedPatterns) {
    const match = normalized.match(pattern);
    const title = match?.[1]?.trim();
    if (title) return title;
  }

  const plainPatterns = [
    /标题(?:写成|改成|改为|命名为|叫做)\s*([^，。\n；;（(]{2,120}?)(?:[，。；;\n]|$)/i,
    /标题\s*[:：]\s*([^，。\n；;]{2,120}?)(?:[，。；;\n]|$)/i,
    /(?:title|name)\s*(?:as|to|:)\s*([^,\n.;]{2,120}?)(?:[,.;\n]|$)/i,
  ];

  for (const pattern of plainPatterns) {
    const match = normalized.match(pattern);
    const title = match?.[1]?.trim();
    if (title) return title;
  }

  return null;
}

function parseDimensionCount(input: string): number | null {
  const match =
    input.match(/(\d)\s*(个|条)?\s*维度/i) ??
    input.match(/维度\s*(\d)/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.max(3, Math.min(8, Math.floor(value)));
}

function parseDuration(input: string): number | null {
  const match = input.match(/(\d{2,3})\s*(分钟|min)/i);
  if (!match) return null;
  return clampDuration(Number(match[1]));
}

function parseTopicHint(input: string): string | undefined {
  const hit =
    input.match(/topic\s*(\d+(?:\.\d+)?)/i) ??
    input.match(/知识点\s*(\d+(?:\.\d+)?)/i) ??
    input.match(/\bT\s*(\d+(?:\.\d+)?)\b/i);
  return hit ? hit[1] : undefined;
}

function parseTopicFocus(input: string): string | undefined {
  const match =
    input.match(
      /(?:unit\s*\d+(?:\.\d+)?|第\s*\d+\s*单元)\s+(.{2,60}?)(?=\s*(?:选择题|问答题|练习题|习题|worksheet|rubric|教案|lesson\s*plan|试卷|exam|标题|右侧|并|，|。|$))/i,
    ) ??
    input.match(/(?:关于|侧重|聚焦|focus(?:ed)?\s*(?:on)?)\s*(.{2,40}?)(?:[，。,.]|$)/i) ??
    input.match(/(chain\s*rule|implicit\s*differentiation|integration|series|continuity)/i);
  const value = match?.[1]?.trim();
  return value && value.length >= 2 ? value : undefined;
}

function parseTopic(input: string): string | undefined {
  const match =
    input.match(/(?:主题|topic|关于|围绕|聚焦)\s*[:：]?\s*(.{2,60}?)(?:[，。,.]|$)/i) ??
    input.match(/(?:生成|做|写|设计).{0,12}(语文|英语|历史|地理|政治|作文|阅读理解).{0,50}/i);
  const value = match?.[1]?.trim();
  if (!value) return undefined;
  return value.replace(/[。,.]$/, "").trim();
}

function parseSubjectCategory(input: string): string | undefined {
  if (CHINESE_SUBJECT_PATTERN.test(input)) return "语文";
  if (ENGLISH_NONAP_PATTERN.test(input)) return "英语";
  if (HISTORY_NONAP_PATTERN.test(input)) return "历史";
  if (/地理/i.test(input)) return "地理";
  if (/政治|思想品德/i.test(input)) return "政治";
  return undefined;
}

function inferTrackFromText(input: string, courseHint?: string): IntentTrack | undefined {
  if (/(不是\s*ap|非\s*ap|not\s+ap)/i.test(input)) {
    return "general";
  }
  if (/(^|\s)ap(\s|$)|college\s*board|ced/i.test(input)) {
    return "ap";
  }
  if (courseHint) {
    return "ap";
  }
  if (
    CHINESE_SUBJECT_PATTERN.test(input) ||
    ENGLISH_NONAP_PATTERN.test(input) ||
    HISTORY_NONAP_PATTERN.test(input) ||
    GENERAL_SUBJECT_PATTERN.test(input)
  ) {
    return "general";
  }
  return undefined;
}

function normalizeTeacherRequest(input: string): string {
  return input
    .replace(/^(请|帮我|麻烦|能不能|可以)?\s*/i, "")
    .trim();
}

export function looksLikeQuestionBankRetrievalRequest(input: string) {
  const normalizedInput = normalizeIntentSurfaceText(input);
  return (
    QUESTION_BANK_RETRIEVAL_PATTERN.test(normalizedInput) &&
    !SAVE_TO_QUESTION_BANK_PATTERN.test(normalizedInput)
  );
}

export function parseIntentFromText(input: string): ParsedIntent {
  const normalizedInput = normalizeIntentSurfaceText(input);
  const requestedCount = extractRequestedCount(normalizedInput);
  const count = clampCount(requestedCount ?? 6);
  const exerciseType = parseExerciseType(normalizedInput);
  const difficulty = parseDifficulty(normalizedInput);
  const duration = parseDuration(normalizedInput) ?? 45;
  const level = parseLessonLevel(normalizedInput);
  const templateKind = parseTemplateKind(normalizedInput);
  const topicFocus = parseTopicFocus(normalizedInput) ?? null;

  const examTemplate: "exam-classic" | "exam-modern" = /(modern|现代)/i.test(normalizedInput)
    ? "exam-modern"
    : "exam-classic";
  const worksheetTemplate: "worksheet-academic" | "worksheet-friendly" = /(friendly|友好)/i.test(normalizedInput)
    ? "worksheet-friendly"
    : "worksheet-academic";
  const rubricTemplate: "rubric-table" | "rubric-cards" = /(cards|卡片)/i.test(normalizedInput)
    ? "rubric-cards"
    : "rubric-table";

  const worksheetTitle = extractRequestedArtifactTitle(normalizedInput);

  const asksAllInOne = /(全流程|完整流程|一键|全部做完|从.*到.*pdf)/i.test(normalizedInput);
  const hasRubricWord = RUBRIC_WORD_PATTERN.test(normalizedInput);
  const hasPblWord = PBL_WORD_PATTERN.test(normalizedInput);
  const hasExerciseWord = EXERCISE_WORD_PATTERN.test(normalizedInput);
  const hasWorksheetWord = WORKSHEET_WORD_PATTERN.test(normalizedInput);
  const hasExamWord = EXAM_WORD_PATTERN.test(normalizedInput);
  const hasPdfWord = PDF_WORD_PATTERN.test(normalizedInput);
  const hasSaveWord = SAVE_TO_QUESTION_BANK_PATTERN.test(normalizedInput);
  const hasGenerateWord = GENERATE_WORD_PATTERN.test(normalizedInput);
  const hasLessonWord = LESSON_WORD_PATTERN.test(normalizedInput);
  const hasScanPdf = SCAN_PDF_PATTERN.test(normalizedInput);
  const hasOrganizeContent = ORGANIZE_CONTENT_PATTERN.test(normalizedInput) &&
    !hasExerciseWord && !hasLessonWord && !hasRubricWord && !hasPblWord;

  const actions: WorkflowAction[] = [];

  if (hasOrganizeContent) {
    actions.push("organize_content");
    const normalizedActions = normalizeActions(actions);
      return {
        actions: normalizedActions,
        commonParams: { teacherRequest: normalizeTeacherRequest(normalizedInput) },
      exerciseParams: null,
      rubricParams: null,
      lessonParams: null,
      exportParams: null,
      followUpQuestions: [],
      count: 6,
      exerciseType: "MC",
      difficulty: "medium",
      includeRubric: false,
      examTemplate: "exam-classic",
      worksheetTemplate: "worksheet-academic",
      rubricTemplate: "rubric-table",
      worksheetTitle: null,
    };
  }

  if (hasScanPdf) {
    actions.push("scan_pdf");
  }

  if (asksAllInOne || (hasRubricWord && hasExerciseWord && hasExamWord)) {
    actions.push(
      "generate_rubric",
      "generate_exercises",
      "save_exercises",
      "create_worksheet",
      "export_exam_pdf",
    );
    if (hasLessonWord) {
      actions.push("generate_lesson_plan");
    }
  } else {
    if (hasRubricWord && (hasGenerateWord || !hasPdfWord)) {
      actions.push("generate_rubric");
    }

    if (hasPblWord && (hasGenerateWord || actions.length === 0)) {
      actions.push("generate_pbl");
    }

    if (hasLessonWord && (hasGenerateWord || actions.length === 0)) {
      actions.push("generate_lesson_plan");
    }

    if (hasExerciseWord && !looksLikeQuestionBankRetrievalRequest(normalizedInput)) {
      actions.push("generate_exercises");
    }

    if (hasSaveWord) {
      actions.push("save_exercises");
    }

    if (hasWorksheetWord) {
      actions.push("create_worksheet");
    }

    if (hasExamWord && !hasWorksheetWord) {
      actions.push("create_worksheet");
    }

    if (hasExamWord && hasPdfWord) {
      actions.push("export_exam_pdf");
      actions.push("create_worksheet");
    }

    if (hasWorksheetWord && hasPdfWord && !hasExamWord) {
      actions.push("export_worksheet_pdf");
    }

    if (hasRubricWord && hasPdfWord) {
      actions.push("export_rubric_pdf");
    }
  }

  if (actions.length === 0) {
    if (hasPblWord) {
      actions.push("generate_pbl");
    } else if (hasLessonWord) {
      actions.push("generate_lesson_plan");
    } else if (hasExerciseWord || hasGenerateWord) {
      actions.push("generate_exercises");
    }
  }

  const normalizedActions = normalizeActions(actions);
  const hasExerciseAction = normalizedActions.includes("generate_exercises");
  const hasRubricAction = normalizedActions.includes("generate_rubric");
  const hasLessonAction = normalizedActions.includes("generate_lesson_plan");
  const hasExportAction = normalizedActions.some((action) => action.startsWith("export_"));

  const rubricDimensionCount = parseDimensionCount(normalizedInput);

  const unitMatch = normalizedInput.match(/unit\s*(\d{1,2})/i) ?? normalizedInput.match(/第\s*(\d{1,2})\s*单元/);
  const unitHint = unitMatch ? String(Number(unitMatch[1])) : undefined;

  const topicHint = parseTopicHint(normalizedInput);

  const courseHint = /(environmental\s*science|enviorment\s*science|环境科学)/i.test(normalizedInput)
    ? "environmental_science"
    : /(calculus|微积分)/i.test(normalizedInput)
    ? "calculus"
    : /(physics|物理)/i.test(normalizedInput)
      ? "physics"
      : /(statistics|统计)/i.test(normalizedInput)
        ? "statistics"
        : /(chemistry|化学)/i.test(normalizedInput)
          ? "chemistry"
          : /(biology|生物)/i.test(normalizedInput)
            ? "biology"
            : /(english|英语|ela)/i.test(normalizedInput)
              ? "english"
              : /(history|历史)/i.test(normalizedInput)
                ? "history"
                : undefined;
  const track = inferTrackFromText(normalizedInput, courseHint);
  const subjectCategory = parseSubjectCategory(normalizedInput);
  const topic = parseTopic(normalizedInput) ?? (track === "general" ? parseTopicFocus(normalizedInput) : undefined);

  const teacherRequest = normalizeTeacherRequest(normalizedInput);

  return {
    actions: normalizedActions,
    commonParams: {
      teacherRequest,
    },
    exerciseParams: hasExerciseAction
      ? {
          count,
          exerciseType,
          difficulty,
          topicFocus,
        }
      : null,
    rubricParams: hasRubricAction
      ? {
          dimensionCount: rubricDimensionCount,
        }
      : null,
    lessonParams: hasLessonAction
      ? {
          duration,
          level,
          templateKind,
        }
      : null,
    exportParams: hasExportAction
      ? {
          examTemplate,
          worksheetTemplate,
          rubricTemplate,
          worksheetTitle,
        }
      : null,
    followUpQuestions: [],

    count,
    exerciseType,
    difficulty,
    includeRubric: hasRubricAction,
    examTemplate,
    worksheetTemplate,
    rubricTemplate,
    worksheetTitle,
    topicFocus: topicFocus ?? undefined,
    rubricDimensionCount: rubricDimensionCount ?? undefined,
    duration,
    level,
    templateKind,

    unitHint,
    topicHint,
    courseHint,
    track,
    topic,
    subjectCategory,
  };
}

function hasValue(input: string | null | undefined) {
  if (typeof input !== "string") return false;
  const normalized = input.trim().toLowerCase();
  return normalized.length > 0 && normalized !== "unknown" && normalized !== "null";
}

export function getRequiredFields(action: WorkflowAction, track?: IntentTrack): RequiredIntentField[] {
  const fields: RequiredIntentField[] = ["action"];
  if (GENERATION_ACTIONS.has(action)) {
    fields.push("track");
  }

  if (track === "ap") {
    if (REQUIRED_COURSE_ACTIONS.has(action)) {
      fields.push("courseId");
    }
    if (REQUIRED_UNIT_ACTIONS.has(action)) {
      fields.push("unitId");
    }
  } else if (track === "general") {
    if (GENERATION_ACTIONS.has(action)) {
      fields.push("topic");
    }
  }

  return fields;
}

export function getRequiredFieldsByActions(actions: WorkflowAction[], track?: IntentTrack): RequiredIntentField[] {
  const action = Array.isArray(actions) && actions.length > 0 ? actions[0] : null;
  if (!action) {
    return ["action"];
  }
  return getRequiredFields(action, track);
}

export function evaluateIntentCompleteness(input: {
  actions: WorkflowAction[];
  track?: IntentTrack | null;
  courseId?: string | null;
  unitId?: string | null;
  topic?: string | null;
}): {
  completeness: IntentCompleteness;
  missingRequired: RequiredIntentField[];
} {
  const missingRequired: RequiredIntentField[] = [];

  if (!Array.isArray(input.actions) || input.actions.length === 0) {
    missingRequired.push("action");
  }

  const requiredFields = getRequiredFieldsByActions(input.actions ?? [], input.track ?? undefined);
  if (requiredFields.includes("track") && !(input.track === "ap" || input.track === "general")) {
    missingRequired.push("track");
  }
  if (requiredFields.includes("courseId") && !hasValue(input.courseId)) {
    missingRequired.push("courseId");
  }
  if (requiredFields.includes("unitId") && !hasValue(input.unitId)) {
    missingRequired.push("unitId");
  }
  if (requiredFields.includes("topic") && !hasValue(input.topic)) {
    missingRequired.push("topic");
  }

  return {
    completeness: missingRequired.length > 0 ? "needs_info" : "complete",
    missingRequired,
  };
}

export function scoreIntentConfidence(message: string, intent: ParsedIntent): IntentConfidence {
  if (intent.actions.length === 0) {
    return "low";
  }

  const asksAllInOne = /(全流程|完整流程|一键|全部做完|从.*到.*pdf)/i.test(message);
  if (asksAllInOne) {
    return "high";
  }

  const strongSignals = [
    /(生成|创建|新建).*(rubric|评分标准|评分量表|评分细则)/i,
    /(导出|下载|排版).*(rubric).*(pdf|文件)?/i,
    /(生成|创建|新建|出题).*(习题|题目|exercise)/i,
    /(生成|创建|备课|做).*(教案|教学计划|lesson\s*plan)/i,
    /(保存|入库).*(题目|题库)/i,
    /(创建|生成).*(worksheet|练习卷|作业单)/i,
    /(导出|下载|排版).*(exam|试卷).*(pdf|文件)?/i,
    /(导出|下载|排版).*(worksheet|练习卷).*(pdf|文件)?/i,
    /(\d{1,2})\s*(道|题).*(选择题|问答题|习题|题目)/i,
  ].filter((pattern) => pattern.test(message)).length;

  if (strongSignals >= 2) {
    return "high";
  }

  if (strongSignals >= 1 && intent.actions.length === 1) {
    return "high";
  }

  if (strongSignals >= 1) {
    return "medium";
  }

  return intent.actions.length >= 2 ? "medium" : "low";
}
