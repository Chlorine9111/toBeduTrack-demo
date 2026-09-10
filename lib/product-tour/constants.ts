import type { TourStepDef } from "./types";

export const SIDEBAR_TOUR_STEPS: TourStepDef[] = [
  {
    targetSelector: '[data-tour-id="nav-new-chat"]',
    placement: "right",
    title: { zh: "AI 助手", en: "AI Assistant" },
    description: {
      zh: "点这里开始和 AI 对话，可以生成教案、练习题、评分量规等教学资料。",
      en: "Start a conversation with AI to generate lesson plans, exercises, rubrics, and more.",
    },
  },
  {
    targetSelector: '[data-tour-id="nav-content-assets"]',
    placement: "right",
    title: { zh: "内容库", en: "Content Library" },
    description: {
      zh: "上传课件和教材，AI 会自动解析内容，之后生成资料时可以直接引用。",
      en: "Upload your course materials. AI will parse them so you can reference them when generating content.",
    },
  },
  {
    targetSelector: '[data-tour-id="nav-question-bank"]',
    placement: "right",
    title: { zh: "题库", en: "Question Bank" },
    description: {
      zh: "按学科、单元、难度浏览和搜索 AP 真题及 AI 生成的练习题。",
      en: "Browse and search AP exam questions and AI-generated exercises by subject, unit, and difficulty.",
    },
  },
  {
    targetSelector: '[data-tour-id="nav-feedback"]',
    placement: "right",
    title: { zh: "反馈", en: "Feedback" },
    description: {
      zh: "提交使用中遇到的问题或建议，我们会尽快处理和回复。",
      en: "Submit issues or suggestions you encounter. We'll respond as soon as possible.",
    },
  },
  {
    targetSelector: '[data-tour-id="nav-settings"]',
    placement: "right",
    title: { zh: "设置", en: "Settings" },
    description: {
      zh: "管理个人资料、语言偏好和账户安全设置。随时可以在偏好设置中重新开启本导览。",
      en: "Manage your profile, language, and security. You can restart this tour anytime from Preferences.",
    },
  },
];

export const AGENT_TOUR_STEPS: TourStepDef[] = [
  {
    targetSelector: '[data-tour-id="agent-input"]',
    placement: "top",
    title: { zh: "输入任务", en: "Enter your task" },
    description: {
      zh: "用自然语言描述你的需求，例如「帮我出一套 AP Physics 1 的 MCQ 练习」。",
      en: 'Describe your need in plain language, e.g. "Create a set of AP Physics 1 MCQ exercises."',
    },
  },
];

export const CONTENT_ASSETS_TOUR_STEPS: TourStepDef[] = [
  {
    targetSelector: '[data-tour-id="assets-upload"]',
    placement: "bottom",
    title: { zh: "上传文件", en: "Upload files" },
    description: {
      zh: "点击这里上传文件，AI 会自动解析内容，方便之后引用。",
      en: "Click here to upload files. AI will parse the content for future reference.",
    },
  },
];

export const QUESTION_BANK_TOUR_STEPS: TourStepDef[] = [
  {
    targetSelector: '[data-tour-id="qbank-filters"]',
    placement: "bottom",
    title: { zh: "筛选题目", en: "Filter questions" },
    description: {
      zh: "按学科、单元、难度和题型筛选，快速找到你需要的题目。",
      en: "Filter by subject, unit, difficulty, and type to quickly find the questions you need.",
    },
  },
  {
    targetSelector: '[data-tour-id="qbank-split-entry"]',
    placement: "bottom",
    title: { zh: "拆题", en: "Question Splitter" },
    description: {
      zh: "上传 PDF 或图片试卷，AI 自动识别并拆分成独立题目，逐题审校后入库。",
      en: "Upload a PDF or image exam paper. AI will automatically split it into individual questions for review.",
    },
  },
  {
    targetSelector: '[data-tour-id="qbank-builder-entry"]',
    placement: "bottom",
    title: { zh: "组卷", en: "Exam Builder" },
    description: {
      zh: "从题库中挑选题目组装成完整试卷，支持分节、排序和导出 PDF。",
      en: "Select questions from the bank to assemble a complete exam. Supports sections, ordering, and PDF export.",
    },
  },
];

export const BUILDER_TOUR_STEPS: TourStepDef[] = [
  {
    targetSelector: '[data-tour-id="builder-sidebar"]',
    placement: "right",
    title: { zh: "题库搜索", en: "Search questions" },
    description: {
      zh: "在左侧按学科、单元搜索题目，点击即可添加到试卷中。",
      en: "Search questions by subject and unit on the left. Click to add them to your exam.",
    },
  },
  {
    targetSelector: '[data-tour-id="builder-editor"]',
    placement: "left",
    title: { zh: "试卷编辑", en: "Exam editor" },
    description: {
      zh: "在这里编辑试卷标题、调整题目顺序，支持拖拽排序和分节管理。",
      en: "Edit exam title, reorder questions with drag-and-drop, and manage sections here.",
    },
  },
];

export const SPLIT_TOUR_STEPS: TourStepDef[] = [
  {
    targetSelector: '[data-tour-id="split-upload"]',
    placement: "bottom",
    title: { zh: "上传文档", en: "Upload documents" },
    description: {
      zh: "上传 PDF、Word 或图片，AI 会自动扫描并拆分出每道题目。",
      en: "Upload PDF, Word, or images. AI will scan and split each question automatically.",
    },
  },
  {
    targetSelector: '[data-tour-id="split-editor"]',
    placement: "top",
    title: { zh: "审校与入库", en: "Review & commit" },
    description: {
      zh: "逐题检查答案、解析和标签，确认无误后点击「全部入库」保存到题库。",
      en: "Review each question's answer, explanation, and tags. Click 'Commit All' to save to the bank.",
    },
  },
];

export const FEEDBACK_TOUR_STEPS: TourStepDef[] = [
  {
    targetSelector: '[data-tour-id="feedback-submit"]',
    placement: "top",
    title: { zh: "提交反馈", en: "Submit feedback" },
    description: {
      zh: "描述你遇到的问题或建议，可以附带截图，我们会尽快回复。",
      en: "Describe issues or suggestions, attach screenshots if needed. We'll respond promptly.",
    },
  },
];

export const CANVAS_TOUR_STEPS: TourStepDef[] = [
  {
    targetSelector: '[data-tour-id="canvas-edit-toggle"]',
    placement: "left",
    title: { zh: "切换编辑模式", en: "Switch to edit mode" },
    description: {
      zh: "生成内容后可以在这里切换到编辑模式，直接对内容进行修改和调整。",
      en: "After content is generated, switch to edit mode here to modify and adjust the content directly.",
    },
  },
  {
    targetSelector: '[data-tour-id="canvas-save-to-library"]',
    placement: "left",
    title: { zh: "保存到内容库", en: "Save to Library" },
    description: {
      zh: "点击这里将生成的内容保存到内容库，方便之后查看和复用。",
      en: "Click here to save the generated content to your library for later access and reuse.",
    },
  },
];

export const MODULE_TOUR_STEPS_MAP = {
  agent: AGENT_TOUR_STEPS,
  contentAssets: CONTENT_ASSETS_TOUR_STEPS,
  questionBank: QUESTION_BANK_TOUR_STEPS,
  builder: BUILDER_TOUR_STEPS,
  split: SPLIT_TOUR_STEPS,
  feedback: FEEDBACK_TOUR_STEPS,
  canvas: CANVAS_TOUR_STEPS,
} as const;
