"use client"

import {
  createContext,
  useContext,
  useState,
  useMemo,
  type ReactNode,
} from "react"
import type {
  TabId,
  ChatStep,
  RubricPartData,
  WorksheetStepData,
  ExamQuestionData,
} from "./mock-data"
import {
  RUBRIC_CHAT_EN,
  RUBRIC_DATA_EN,
  WORKSHEET_CHAT_EN,
  WORKSHEET_STANDARD_EN,
  WORKSHEET_ADVANCED_EN,
  EXAM_CHAT_EN,
  EXAM_QUESTIONS_EN,
} from "./content-en"
import {
  RUBRIC_CHAT_ZH,
  RUBRIC_DATA_ZH,
  WORKSHEET_CHAT_ZH,
  WORKSHEET_STANDARD_ZH,
  WORKSHEET_ADVANCED_ZH,
  EXAM_CHAT_ZH,
  EXAM_QUESTIONS_ZH,
} from "./content-zh"

// ---------------------------------------------------------------------------
// Locale type
// ---------------------------------------------------------------------------
export type Locale = "en" | "zh"

// ---------------------------------------------------------------------------
// UI translations interface
// ---------------------------------------------------------------------------
export interface UITranslations {
  hero: {
    brand: string
    titleLine1: string
    titleLine2: string
    subtitle: string
    subtitleLine2: string
    ctaButton: string
  }
  chat: {
    headerTitle: string
    skipButton: string
  }
  tabs: {
    rubric: string
    worksheet: string
    exam: string
    rubricDesc: string
    worksheetDesc: string
    examDesc: string
    tabHint: string
  }
  guide: Record<string, { done: string; next: string; cta: string }>
  rubricPanel: {
    title: string
    unitInfo: string
    totalLabel: string
    pointsUnit: string
    ptUnit: string
  }
  worksheetPanel: {
    title: string
    unitInfo: string
    courseInfo: string
    nameField: string
    dateField: string
    standardLabel: string
    advancedLabel: string
    scaffoldedHints: string
    hideButton: string
    revealButton: string
    stepsHidden: string
  }
  examPanel: {
    defaultTitle: string
    dateLabel: string
    pointsUnit: string
    freeResponse: string
    explanation: string
    rubricLabel: string
    ptUnit: string
    ptsUnit: string
    ptsTotal: string
    mcLabel: string
    frqLabel: string
    easyLabel: string
    medLabel: string
    hardLabel: string
    includeAnswerKey: string
    includeRubric: string
    exportPdf: string
    generating: string
  }
  exportOverlay: {
    title: string
    subtitle: string
    featureTitle: string
    features: string[]
    requestAccess: string
    restartDemo: string
  }
  cta: {
    title: string
    subtitle: string
    placeholder: string
    submitButton: string
    successMessage: string
    waitlistCount: string
  }
  footer: {
    tagline: string
  }
}

// ---------------------------------------------------------------------------
// English UI translations
// ---------------------------------------------------------------------------
const en: UITranslations = {
  hero: {
    brand: "Deskmate",
    titleLine1: "From rubrics to exams,",
    titleLine2: "3 minutes flat.",
    subtitle: "Experience the full AP lesson-prep workflow.",
    subtitleLine2: "Interactive demo — click through to try it yourself.",
    ctaButton: "Try the demo",
  },
  chat: {
    headerTitle: "Deskmate AI",
    skipButton: "Skip",
  },
  tabs: {
    rubric: "Rubric",
    worksheet: "Worksheet",
    exam: "Exam",
    rubricDesc: "Scoring criteria",
    worksheetDesc: "Practice problems",
    examDesc: "Assessment builder",
    tabHint: "Press Tab to switch",
  },
  guide: {
    "0": {
      done: "Rubric ready",
      next: "Build a matching worksheet?",
      cta: "Generate Worksheet",
    },
    "1": {
      done: "Worksheet ready",
      next: "Compile everything into a quiz?",
      cta: "Start Exam Assembly",
    },
    "2": { done: "Exam exported", next: "", cta: "" },
  },
  rubricPanel: {
    title: "FRQ Scoring Rubric",
    unitInfo: "Unit 3: Chain Rule",
    totalLabel: "Total:",
    pointsUnit: "points",
    ptUnit: "pt",
  },
  worksheetPanel: {
    title: "Computational Thinking Worksheet",
    unitInfo: "Unit 3: Chain Rule",
    courseInfo: "AP Calculus AB",
    nameField: "Name: ____________",
    dateField: "Date: ____________",
    standardLabel: "Standard",
    advancedLabel: "Advanced",
    scaffoldedHints: "Scaffolded Hints",
    hideButton: "Hide",
    revealButton: "Reveal",
    stepsHidden: "steps hidden",
  },
  examPanel: {
    defaultTitle: "AP Calculus AB — Unit 3 Chain Rule Quiz",
    dateLabel: "Date: Feb 2026",
    pointsUnit: "points",
    freeResponse: "Free Response",
    explanation: "Explanation",
    rubricLabel: "Rubric",
    ptUnit: "pt",
    ptsUnit: "pts",
    ptsTotal: "pts total",
    mcLabel: "MC",
    frqLabel: "FRQ",
    easyLabel: "Easy",
    medLabel: "Med",
    hardLabel: "Hard",
    includeAnswerKey: "Include answer key",
    includeRubric: "Include rubric",
    exportPdf: "Export PDF",
    generating: "Generating...",
  },
  exportOverlay: {
    title: "Exam exported successfully",
    subtitle: "AP Calculus AB — Unit 3 Quiz",
    featureTitle: "In the full product, you can also:",
    features: [
      "Generate questions with AI in real-time",
      "Curate exams from a shared question bank",
      "Track student performance and weak areas",
    ],
    requestAccess: "Request beta access",
    restartDemo: "Restart the demo",
  },
  cta: {
    title: "Ready to prep with AI?",
    subtitle: "Deskmate is opening up to beta testers now.",
    placeholder: "your@email.com",
    submitButton: "Request access",
    successMessage: "You\u2019re on the list! We\u2019ll be in touch soon.",
    waitlistCount: "200+ AP teachers already on the waitlist",
  },
  footer: {
    tagline: "Deskmate — AI-powered lesson prep for AP teachers",
  },
}

// ---------------------------------------------------------------------------
// Chinese UI translations
// ---------------------------------------------------------------------------
const zh: UITranslations = {
  hero: {
    brand: "Deskmate",
    titleLine1: "从评分标准到考试，",
    titleLine2: "只需三分钟。",
    subtitle: "体验完整的 AP 课程备课流程。",
    subtitleLine2: "互动演示 — 点击体验完整流程。",
    ctaButton: "开始体验",
  },
  chat: {
    headerTitle: "Deskmate AI",
    skipButton: "跳过",
  },
  tabs: {
    rubric: "评分标准",
    worksheet: "练习题",
    exam: "考试",
    rubricDesc: "评分细则",
    worksheetDesc: "课堂练习",
    examDesc: "试卷组装",
    tabHint: "按 Tab 键切换",
  },
  guide: {
    "0": {
      done: "评分标准已就绪",
      next: "生成配套练习题？",
      cta: "生成练习题",
    },
    "1": {
      done: "练习题已就绪",
      next: "将所有内容组装成考试？",
      cta: "开始组装试卷",
    },
    "2": { done: "试卷已导出", next: "", cta: "" },
  },
  rubricPanel: {
    title: "FRQ 评分标准",
    unitInfo: "第三单元：链式法则",
    totalLabel: "总计：",
    pointsUnit: "分",
    ptUnit: "分",
  },
  worksheetPanel: {
    title: "计算思维练习题",
    unitInfo: "第三单元：链式法则",
    courseInfo: "AP 微积分 AB",
    nameField: "姓名：____________",
    dateField: "日期：____________",
    standardLabel: "标准版",
    advancedLabel: "进阶版",
    scaffoldedHints: "分步提示",
    hideButton: "隐藏",
    revealButton: "显示",
    stepsHidden: "步提示已隐藏",
  },
  examPanel: {
    defaultTitle: "AP 微积分 AB — 第三单元 链式法则小测",
    dateLabel: "日期：2026年2月",
    pointsUnit: "分",
    freeResponse: "解答题",
    explanation: "解析",
    rubricLabel: "评分细则",
    ptUnit: "分",
    ptsUnit: "分",
    ptsTotal: "分（总计）",
    mcLabel: "选择题",
    frqLabel: "解答题",
    easyLabel: "简单",
    medLabel: "中等",
    hardLabel: "困难",
    includeAnswerKey: "包含答案",
    includeRubric: "包含评分标准",
    exportPdf: "导出 PDF",
    generating: "生成中...",
  },
  exportOverlay: {
    title: "试卷导出成功",
    subtitle: "AP 微积分 AB — 第三单元小测",
    featureTitle: "完整产品还可以：",
    features: [
      "实时使用 AI 生成题目",
      "从共享题库中筛选试题",
      "追踪学生成绩和薄弱环节",
    ],
    requestAccess: "申请内测资格",
    restartDemo: "重新开始演示",
  },
  cta: {
    title: "准备好用 AI 备课了吗？",
    subtitle: "Deskmate 正在开放内测名额。",
    placeholder: "your@email.com",
    submitButton: "申请内测",
    successMessage: "已加入等候名单！我们会尽快联系您。",
    waitlistCount: "已有 200+ AP 教师加入等候名单",
  },
  footer: {
    tagline: "Deskmate — AP 教师的 AI 备课助手",
  },
}

// ---------------------------------------------------------------------------
// Translations map
// ---------------------------------------------------------------------------
const UI_TRANSLATIONS: Record<Locale, UITranslations> = { en, zh }

// ---------------------------------------------------------------------------
// Content data per locale
// ---------------------------------------------------------------------------
function getContentData(locale: Locale) {
  if (locale === "zh") {
    return {
      chatFlows: {
        0: RUBRIC_CHAT_ZH,
        1: WORKSHEET_CHAT_ZH,
        2: EXAM_CHAT_ZH,
      } as Record<TabId, ChatStep[]>,
      rubricData: RUBRIC_DATA_ZH,
      worksheetStandard: WORKSHEET_STANDARD_ZH,
      worksheetAdvanced: WORKSHEET_ADVANCED_ZH,
      examQuestions: EXAM_QUESTIONS_ZH,
    }
  }
  return {
    chatFlows: {
      0: RUBRIC_CHAT_EN,
      1: WORKSHEET_CHAT_EN,
      2: EXAM_CHAT_EN,
    } as Record<TabId, ChatStep[]>,
    rubricData: RUBRIC_DATA_EN,
    worksheetStandard: WORKSHEET_STANDARD_EN,
    worksheetAdvanced: WORKSHEET_ADVANCED_EN,
    examQuestions: EXAM_QUESTIONS_EN,
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
interface LanguageContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: UITranslations
  chatFlows: Record<TabId, ChatStep[]>
  rubricData: RubricPartData[]
  worksheetStandard: WorksheetStepData[]
  worksheetAdvanced: WorksheetStepData[]
  examQuestions: ExamQuestionData[]
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en")

  const value = useMemo<LanguageContextValue>(() => {
    const t = UI_TRANSLATIONS[locale]
    const content = getContentData(locale)
    return { locale, setLocale, t, ...content }
  }, [locale])

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider")
  return ctx
}
