import type { EditorDocumentProperty } from "@/lib/documents/types";
import { TEMPLATE_HTML_SKELETONS } from "@/lib/templates/html-skeletons";

export type TemplateCategory =
  | "rubric"
  | "lesson-plan"
  | "exam"
  | "worksheet"
  | "notes";

export type TemplateTag = {
  label: string;
  bgColor: string;
  textColor: string;
};

export type TemplateDefinition = {
  id: string;
  title: { zh: string; en: string };
  description: { zh: string; en: string };
  category: TemplateCategory;
  tags: TemplateTag[];
  previewKind: TemplateCategory;
  documentKind: string;
  htmlContent: string;
  properties: EditorDocumentProperty[];
};

const tagStyles = {
  rubric: { label: "Rubric", bgColor: "rgba(94,106,210,0.08)", textColor: "#5E6AD2" },
  lessonPlan: { label: "Lesson Plan", bgColor: "rgba(250,235,221,0.5)", textColor: "#D9730D" },
  worksheet: { label: "Worksheet", bgColor: "rgba(221,237,234,0.5)", textColor: "#0F7B6C" },
  exam: { label: "Exam", bgColor: "rgba(251,228,228,0.5)", textColor: "#E03E3E" },
  notes: { label: "Notes", bgColor: "rgba(0,0,0,0.06)", textColor: "#3a3a3c" },
} as const;

function makeProperties(
  entries: Array<{ key: string; label: string; value: string }>,
): EditorDocumentProperty[] {
  return entries.map((entry) => ({
    key: entry.key,
    label: entry.label,
    value: entry.value,
  }));
}

export const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    id: "rubric-ap-generic",
    title: { zh: "AP 课程评分量规", en: "AP Course Rubric" },
    description: {
      zh: "用于课堂任务、写作和项目展示的通用 AP 评分标准。",
      en: "A reusable AP rubric for classwork, writing, and presentations.",
    },
    category: "rubric",
    tags: [tagStyles.rubric, { label: "AP", bgColor: "rgba(234,228,242,0.5)", textColor: "#6940A5" }],
    previewKind: "rubric",
    documentKind: "rubric",
    htmlContent: TEMPLATE_HTML_SKELETONS.rubricApGeneric,
    properties: makeProperties([
      { key: "curriculum", label: "课程体系", value: "AP" },
      { key: "usage", label: "使用场景", value: "课堂任务" },
    ]),
  },
  {
    id: "rubric-lab-report",
    title: { zh: "实验报告评分标准", en: "Lab Report Rubric" },
    description: {
      zh: "适合 AP Chemistry / Physics 实验报告评分。",
      en: "A rubric for AP lab reports and experimental writeups.",
    },
    category: "rubric",
    tags: [tagStyles.rubric, { label: "Science", bgColor: "rgba(221,237,234,0.5)", textColor: "#0F7B6C" }],
    previewKind: "rubric",
    documentKind: "rubric",
    htmlContent: TEMPLATE_HTML_SKELETONS.rubricLabReport,
    properties: makeProperties([
      { key: "curriculum", label: "课程体系", value: "AP" },
      { key: "assessmentType", label: "评价类型", value: "实验报告" },
    ]),
  },
  {
    id: "lp-concept",
    title: { zh: "概念讲解课教案", en: "Concept Lesson Plan" },
    description: {
      zh: "从导入到小结的标准概念讲解流程。",
      en: "A structured concept-teaching lesson flow.",
    },
    category: "lesson-plan",
    tags: [tagStyles.lessonPlan, { label: "Concept", bgColor: "rgba(251,243,219,0.5)", textColor: "#DFAB01" }],
    previewKind: "lesson-plan",
    documentKind: "lesson-plan",
    htmlContent: TEMPLATE_HTML_SKELETONS.lessonConcept,
    properties: makeProperties([
      { key: "course", label: "科目", value: "AP [填写科目]" },
      { key: "duration", label: "时长", value: "45 分钟" },
    ]),
  },
  {
    id: "lp-example",
    title: { zh: "例题演练课教案", en: "Example Drill Lesson Plan" },
    description: {
      zh: "适合讲评题型、强化步骤和课堂演练。",
      en: "A drill-focused lesson plan for worked examples and practice.",
    },
    category: "lesson-plan",
    tags: [tagStyles.lessonPlan, { label: "Practice", bgColor: "rgba(221,237,234,0.5)", textColor: "#0F7B6C" }],
    previewKind: "lesson-plan",
    documentKind: "lesson-plan",
    htmlContent: TEMPLATE_HTML_SKELETONS.lessonExample,
    properties: makeProperties([
      { key: "course", label: "科目", value: "AP [填写科目]" },
      { key: "lessonType", label: "课型", value: "例题演练" },
    ]),
  },
  {
    id: "lp-sprint",
    title: { zh: "冲刺复习课教案", en: "Sprint Review Lesson Plan" },
    description: {
      zh: "用于考试前考点回顾、易错点提醒和限时训练。",
      en: "A sprint review lesson for exam prep and timed practice.",
    },
    category: "lesson-plan",
    tags: [tagStyles.lessonPlan, { label: "Review", bgColor: "rgba(251,228,228,0.5)", textColor: "#E03E3E" }],
    previewKind: "lesson-plan",
    documentKind: "lesson-plan",
    htmlContent: TEMPLATE_HTML_SKELETONS.lessonSprint,
    properties: makeProperties([
      { key: "course", label: "科目", value: "AP [填写科目]" },
      { key: "lessonType", label: "课型", value: "冲刺复习" },
    ]),
  },
  {
    id: "lp-inquiry",
    title: { zh: "探究式教学教案", en: "Inquiry Lesson Plan" },
    description: {
      zh: "围绕驱动问题组织课堂，强调学生探索和概念浮现。",
      en: "An inquiry lesson built around a driving question.",
    },
    category: "lesson-plan",
    tags: [tagStyles.lessonPlan, { label: "Inquiry", bgColor: "rgba(234,228,242,0.5)", textColor: "#6940A5" }],
    previewKind: "lesson-plan",
    documentKind: "lesson-plan",
    htmlContent: TEMPLATE_HTML_SKELETONS.lessonInquiry,
    properties: makeProperties([
      { key: "course", label: "科目", value: "AP [填写科目]" },
      { key: "lessonType", label: "课型", value: "探究式" },
    ]),
  },
  {
    id: "exam-unit-quiz",
    title: { zh: "单元小测", en: "Unit Quiz" },
    description: {
      zh: "包含选择题和简答题的轻量测验模板。",
      en: "A lightweight quiz template with MCQ and FRQ sections.",
    },
    category: "exam",
    tags: [tagStyles.exam, { label: "Quiz", bgColor: "rgba(251,243,219,0.5)", textColor: "#DFAB01" }],
    previewKind: "exam",
    documentKind: "exam",
    htmlContent: TEMPLATE_HTML_SKELETONS.examUnitQuiz,
    properties: makeProperties([
      { key: "course", label: "科目", value: "AP [填写科目]" },
      { key: "assessmentType", label: "测评类型", value: "单元小测" },
    ]),
  },
  {
    id: "exam-midterm",
    title: { zh: "期中综合卷", en: "Midterm Exam" },
    description: {
      zh: "适合期中/期末考试的完整卷面结构。",
      en: "A fuller exam structure for midterm or final assessments.",
    },
    category: "exam",
    tags: [tagStyles.exam, { label: "Comprehensive", bgColor: "rgba(94,106,210,0.08)", textColor: "#5E6AD2" }],
    previewKind: "exam",
    documentKind: "exam",
    htmlContent: TEMPLATE_HTML_SKELETONS.examMidterm,
    properties: makeProperties([
      { key: "course", label: "科目", value: "AP [填写科目]" },
      { key: "assessmentType", label: "测评类型", value: "期中 / 期末" },
    ]),
  },
  {
    id: "ws-weekly-practice",
    title: { zh: "每周练习", en: "Weekly Practice" },
    description: {
      zh: "适合按周布置的 warm-up + core practice + challenge 结构。",
      en: "A weekly worksheet with warm-up, core practice, and challenge.",
    },
    category: "worksheet",
    tags: [tagStyles.worksheet, { label: "Weekly", bgColor: "rgba(94,106,210,0.08)", textColor: "#5E6AD2" }],
    previewKind: "worksheet",
    documentKind: "exam",
    htmlContent: TEMPLATE_HTML_SKELETONS.worksheetWeeklyPractice,
    properties: makeProperties([
      { key: "course", label: "科目", value: "AP [填写科目]" },
      { key: "worksheetType", label: "练习类型", value: "每周练习" },
    ]),
  },
  {
    id: "ws-topic-drill",
    title: { zh: "知识点专项训练", en: "Topic Drill Worksheet" },
    description: {
      zh: "围绕单一知识点分层练习，适合作业或补弱。",
      en: "A focused worksheet for one skill or topic area.",
    },
    category: "worksheet",
    tags: [tagStyles.worksheet, { label: "Topic Drill", bgColor: "rgba(234,228,242,0.5)", textColor: "#6940A5" }],
    previewKind: "worksheet",
    documentKind: "exam",
    htmlContent: TEMPLATE_HTML_SKELETONS.worksheetTopicDrill,
    properties: makeProperties([
      { key: "course", label: "科目", value: "AP [填写科目]" },
      { key: "worksheetType", label: "练习类型", value: "专项训练" },
    ]),
  },
  {
    id: "notes-observation",
    title: { zh: "课堂观察记录", en: "Observation Notes" },
    description: {
      zh: "用于课后复盘学生表现、目标达成和改进点。",
      en: "Observation notes for lesson reflection and next-step planning.",
    },
    category: "notes",
    tags: [tagStyles.notes, { label: "Observation", bgColor: "rgba(221,237,234,0.5)", textColor: "#0F7B6C" }],
    previewKind: "notes",
    documentKind: "notes",
    htmlContent: TEMPLATE_HTML_SKELETONS.notesObservation,
    properties: makeProperties([
      { key: "noteType", label: "笔记类型", value: "课堂观察" },
    ]),
  },
  {
    id: "notes-semester-plan",
    title: { zh: "学期教学进度表", en: "Semester Teaching Plan" },
    description: {
      zh: "按周规划教学主题、作业、测评和关键节点。",
      en: "A week-by-week semester teaching plan and pacing tracker.",
    },
    category: "notes",
    tags: [tagStyles.notes, { label: "Planning", bgColor: "rgba(251,243,219,0.5)", textColor: "#DFAB01" }],
    previewKind: "notes",
    documentKind: "notes",
    htmlContent: TEMPLATE_HTML_SKELETONS.notesSemesterPlan,
    properties: makeProperties([
      { key: "noteType", label: "笔记类型", value: "学期规划" },
    ]),
  },
];
