import type {
  AnswerKeyItem,
  GradingQuestionType,
  GradingResponseMode,
} from "@/lib/grading/types";

const MATH_KEYWORDS = [
  "derive",
  "derivative",
  "integral",
  "equation",
  "formula",
  "calculate",
  "solve",
  "function",
  "graph",
  "chain rule",
  "limit",
  "slope",
  "求导",
  "积分",
  "方程",
  "公式",
  "函数",
  "计算",
  "解方程",
];

const DIAGRAM_KEYWORDS = [
  "draw",
  "sketch",
  "label the diagram",
  "diagram",
  "graph the",
  "plot",
  "molecule",
  "structure",
  "circuit",
  "free-body",
  "绘制",
  "画图",
  "示意图",
  "结构图",
  "标注",
  "图表",
];

const MIXED_KEYWORDS = [
  "show your work",
  "justify",
  "support your answer",
  "证明",
  "写出过程",
];

const TEXT_RESPONSE_KEYWORDS = [
  "explain",
  "describe",
  "discuss",
  "analyze",
  "compare",
  "why",
  "how",
  "说明",
  "解释",
  "分析",
  "比较",
  "为什么",
  "如何",
];

function normalizeText(value: string | null | undefined) {
  return `${value ?? ""}`.trim().toLowerCase();
}

function containsKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function countCjkCharacters(text: string) {
  return (text.match(/[\u3400-\u9fff]/g) ?? []).length;
}

export function inferLanguageHintFromText(values: Array<string | null | undefined>) {
  const joined = values.map((value) => `${value ?? ""}`).join(" ").trim();
  if (!joined) return "en-US";

  const cjkCount = countCjkCharacters(joined);
  const latinCount = (joined.match(/[a-z]/gi) ?? []).length;

  if (cjkCount === 0) return "en-US";
  if (latinCount === 0) return "zh-CN";
  return cjkCount >= latinCount * 0.35 ? "zh-CN" : "en-US";
}

export function inferQuestionResponseMode(params: {
  questionType: GradingQuestionType;
  questionText?: string | null;
  subjectHint?: string | null;
  knowledgePoints?: string[] | null;
  sourceQuestionType?: string | null;
}) {
  const text = normalizeText(
    [
      params.questionText,
      params.subjectHint,
      ...(params.knowledgePoints ?? []),
      params.sourceQuestionType,
    ].join(" "),
  );
  const hasDiagramSignals = containsKeyword(text, DIAGRAM_KEYWORDS);
  const hasMixedSignals = containsKeyword(text, MIXED_KEYWORDS);
  const hasMathSignals = containsKeyword(text, MATH_KEYWORDS);
  const prefersTextResponse = containsKeyword(text, TEXT_RESPONSE_KEYWORDS);

  if (params.questionType === "MC") {
    return "text" satisfies GradingResponseMode;
  }

  if (params.questionType === "calculation") {
    if (hasMixedSignals) {
      return "mixed" satisfies GradingResponseMode;
    }
    return hasDiagramSignals ? "mixed" : ("math" satisfies GradingResponseMode);
  }

  if (params.questionType === "essay") {
    return "text" satisfies GradingResponseMode;
  }

  if (hasDiagramSignals) {
    return hasMixedSignals ? "mixed" : ("diagram" satisfies GradingResponseMode);
  }

  if (params.questionType === "FR" && prefersTextResponse && !hasMixedSignals) {
    return "text" satisfies GradingResponseMode;
  }

  if (hasMathSignals) {
    return hasMixedSignals ? "mixed" : ("math" satisfies GradingResponseMode);
  }

  if (hasMixedSignals) {
    return "mixed" satisfies GradingResponseMode;
  }

  return "text" satisfies GradingResponseMode;
}

export function inferAnswerKeyLanguageHint(
  answerKey: AnswerKeyItem[],
  sessionTitle?: string | null,
) {
  return inferLanguageHintFromText([
    sessionTitle,
    ...answerKey.flatMap((item) => [
      item.questionText,
      item.correctAnswer,
      item.subjectHint,
      ...(item.knowledgePoints ?? []),
    ]),
  ]);
}

export function buildQuestionScoringGuidance(question: AnswerKeyItem) {
  const responseMode =
    question.responseMode ??
    inferQuestionResponseMode({
      questionType: question.questionType,
      questionText: question.questionText,
      subjectHint: question.subjectHint,
      knowledgePoints: question.knowledgePoints,
      sourceQuestionType: question.sourceQuestionType,
    });

  if (responseMode === "math") {
    return {
      responseMode,
      guidance:
        "重点检查公式、符号、等价表达、关键步骤与最终结果；允许等价数学写法，不要因为排版差异误判。",
    };
  }

  if (responseMode === "diagram") {
    return {
      responseMode,
      guidance:
        "重点检查图中关键结构、标注、相对位置与必要说明；若 OCR 无法可靠恢复图示细节，应保守给分并建议复核。",
    };
  }

  if (responseMode === "mixed") {
    return {
      responseMode,
      guidance:
        "同时检查文字解释与公式/图示是否一致，不能只看结果；若任一部分识别不清，优先标记为建议复核。",
    };
  }

  return {
    responseMode,
    guidance: "重点检查术语准确性、论点是否直接回应题目、证据与解释是否覆盖 rubric 要求。",
  };
}
