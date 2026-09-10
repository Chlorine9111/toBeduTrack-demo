export type IntentCourseOption = {
  id: string;
  name: string;
  code: string;
};

export type IntentUnitOption = {
  id: string;
  courseId: string;
  unitNumber: string;
  title: string;
};

export type IntentTopicOption = {
  id: string;
  unitId: string;
  topicNumber: string;
  title: string;
};

export type InferredCurriculumContext = {
  courseId?: string;
  courseName?: string;
  unitId?: string;
  unitName?: string;
  topicId?: string;
  topicName?: string;
  warning?: string;
};

type SubjectHint = {
  label: string;
  pattern: RegExp;
  tokens: string[];
};

const SUBJECT_HINTS: SubjectHint[] = [
  {
    label: "英语/写作",
    pattern: /(英语|english|ela|language arts|writing|essay|作文|写作|文学)/i,
    tokens: ["english", "ela", "language", "writing", "literature", "作文", "写作", "英语"],
  },
  {
    label: "统计学",
    pattern: /(统计|statistics|数据|data)/i,
    tokens: ["statistics", "统计", "data", "数据"],
  },
  {
    label: "数学",
    pattern: /(数学|math|calculus|微积分|代数|几何)/i,
    tokens: ["math", "calculus", "algebra", "geometry", "数学", "微积分", "代数"],
  },
  {
    label: "物理",
    pattern: /(物理|physics|mechanics)/i,
    tokens: ["physics", "mechanics", "物理"],
  },
  {
    label: "化学",
    pattern: /(化学|chemistry)/i,
    tokens: ["chemistry", "化学"],
  },
  {
    label: "生物",
    pattern: /(生物|biology)/i,
    tokens: ["biology", "生物"],
  },
  {
    label: "历史",
    pattern: /(历史|history|world history|us history)/i,
    tokens: ["history", "world", "histor", "历史"],
  },
  {
    label: "经济学",
    pattern: /(经济|economics|宏观|微观|macro|micro)/i,
    tokens: ["economics", "经济", "macro", "micro", "宏观", "微观"],
  },
];

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesScore(source: string, target: string) {
  if (!source || !target) return 0;
  return source.includes(target) ? target.length : 0;
}

export function parseUnitHint(message: string) {
  const unitMatch = message.match(/unit\s*([0-9]{1,2})/i);
  if (unitMatch) {
    return String(Number(unitMatch[1]));
  }

  const shortUnit = message.match(/\bu\s*([0-9]{1,2})\b/i);
  if (shortUnit) {
    return String(Number(shortUnit[1]));
  }

  const zhMatch = message.match(/第\s*([0-9]{1,2})\s*单元/i);
  if (zhMatch) {
    return String(Number(zhMatch[1]));
  }

  return null;
}

export function parseTopicHint(message: string) {
  const topicMatch =
    message.match(/topic\s*([0-9]+(?:\.[0-9]+)?)/i) ??
    message.match(/知识点\s*([0-9]+(?:\.[0-9]+)?)/i) ??
    message.match(/\bT\s*([0-9]+(?:\.[0-9]+)?)\b/i);
  if (topicMatch) {
    return topicMatch[1];
  }
  return null;
}

function detectSubjectHint(message: string): SubjectHint | null {
  for (const hint of SUBJECT_HINTS) {
    if (hint.pattern.test(message)) {
      return hint;
    }
  }
  return null;
}

function scoreCourse(message: string, course: IntentCourseOption, subjectHint: SubjectHint | null) {
  const normalizedMessage = normalizeText(message);
  const normalizedName = normalizeText(course.name);
  const normalizedCode = normalizeText(course.code);

  let score = 0;
  score += includesScore(normalizedMessage, normalizedName) * 2;
  score += includesScore(normalizedMessage, normalizedCode) * 2;

  const specificKeywords = {
    calculus: "AP Calculus AB and BC",
    statistics: "AP Statistics",
    chemistry: "AP Chemistry",
    physics: "AP Physics C: Mechanics",
    macroeconomics: "AP Macroeconomics",
    microeconomics: "AP Microeconomics",
    微积分: "AP Calculus AB and BC",
    统计: "AP Statistics",
    化学: "AP Chemistry",
    物理: "AP Physics C: Mechanics",
    宏观: "AP Macroeconomics",
    微观: "AP Microeconomics",
  };

  for (const [keyword, targetCourse] of Object.entries(specificKeywords)) {
    if (normalizedMessage.includes(keyword) && course.name === targetCourse) {
      score += 30;
    }
  }

  if (subjectHint) {
    const searchable = `${normalizedName} ${normalizedCode}`;
    const tokenMatches = subjectHint.tokens.filter((token) => searchable.includes(normalizeText(token))).length;
    if (tokenMatches > 0) {
      score += tokenMatches * 18;
    }
  }

  if (/(rubric|评分|评分标准|评分量表)/i.test(message) && /(写作|作文|essay|writing)/i.test(message)) {
    if (/(english|ela|language|writing|literature|作文|写作|英语)/i.test(`${course.name} ${course.code}`)) {
      score += 24;
    }
  }

  return score;
}

function scoreUnit(message: string, unit: IntentUnitOption) {
  const normalizedMessage = normalizeText(message);
  const normalizedTitle = normalizeText(unit.title);

  let score = includesScore(normalizedMessage, normalizedTitle) * 2;

  const titleTokens = normalizedTitle
    .split(" ")
    .map((item) => item.trim())
    .filter((item) => item.length >= 3);
  titleTokens.forEach((token) => {
    if (normalizedMessage.includes(token)) {
      score += token.length;
    }
  });

  if (normalizedMessage.includes(`unit ${Number(unit.unitNumber)}`)) {
    score += 6;
  }

  return score;
}

function scoreTopic(message: string, topic: IntentTopicOption) {
  const normalizedMessage = normalizeText(message);
  const normalizedTitle = normalizeText(topic.title);

  let score = includesScore(normalizedMessage, normalizedTitle) * 2;

  const titleTokens = normalizedTitle
    .split(" ")
    .map((item) => item.trim())
    .filter((item) => item.length >= 3);
  titleTokens.forEach((token) => {
    if (normalizedMessage.includes(token)) {
      score += token.length;
    }
  });

  const normalizedTopicNumber = topic.topicNumber.replace(/\s+/g, "");
  if (new RegExp(`topic\\s*${normalizedTopicNumber}`, "i").test(message)) {
    score += 8;
  }
  if (new RegExp(`知识点\\s*${normalizedTopicNumber}`, "i").test(message)) {
    score += 8;
  }

  return score;
}

export function formatIntentUnitName(unit: Pick<IntentUnitOption, "unitNumber" | "title">) {
  const unitNumber = `${unit.unitNumber}`.trim();
  return unitNumber ? `Unit ${unitNumber} · ${unit.title}` : unit.title;
}

export function inferCurriculumContext(params: {
  message: string;
  courses: IntentCourseOption[];
  units: IntentUnitOption[];
  topics?: IntentTopicOption[];
}): InferredCurriculumContext {
  const { message, courses, units, topics = [] } = params;
  if (!message.trim() || courses.length === 0) {
    return {};
  }

  const subjectHint = detectSubjectHint(message);
  let bestCourse: IntentCourseOption | null = null;
  let bestCourseScore = 0;

  for (const course of courses) {
    const score = scoreCourse(message, course, subjectHint);
    if (score > bestCourseScore) {
      bestCourseScore = score;
      bestCourse = course;
    }
  }

  if (!bestCourse || bestCourseScore <= 0) {
    if (subjectHint) {
      return {
        warning: `检测到“${subjectHint.label}”相关需求，但未匹配到课程。请在参数中手动选择课程和单元。`,
      };
    }
    return {};
  }

  const context: InferredCurriculumContext = {
    courseId: bestCourse.id,
    courseName: bestCourse.name,
  };

  const unitsInCourse = units.filter((item) => item.courseId === bestCourse.id);
  if (unitsInCourse.length === 0) {
    return {
      ...context,
      warning: `课程“${bestCourse.name}”暂未配置单元，请先完善课程结构。`,
    };
  }

  const hintedUnitNumber = parseUnitHint(message);
  if (hintedUnitNumber) {
    const unitByNumber = unitsInCourse.find((item) => String(Number(item.unitNumber)) === hintedUnitNumber);
    if (unitByNumber) {
      context.unitId = unitByNumber.id;
      context.unitName = formatIntentUnitName(unitByNumber);
    } else {
      return {
        ...context,
        warning: `课程“${bestCourse.name}”中未找到 Unit ${hintedUnitNumber}，请手动选择单元。`,
      };
    }
  } else {
    let bestUnit: IntentUnitOption | null = null;
    let bestUnitScore = 0;
    for (const unit of unitsInCourse) {
      const score = scoreUnit(message, unit);
      if (score > bestUnitScore) {
        bestUnitScore = score;
        bestUnit = unit;
      }
    }

    if (bestUnit && bestUnitScore > 0) {
      context.unitId = bestUnit.id;
      context.unitName = formatIntentUnitName(bestUnit);
    }
  }

  if (topics.length === 0) {
    return context;
  }

  const scopedTopics = context.unitId
    ? topics.filter((topic) => topic.unitId === context.unitId)
    : topics.filter((topic) => unitsInCourse.some((unit) => unit.id === topic.unitId));

  if (scopedTopics.length === 0) {
    return context;
  }

  const hintedTopicNumber = parseTopicHint(message);
  if (hintedTopicNumber) {
    const topicByNumber = scopedTopics.find((topic) => topic.topicNumber === hintedTopicNumber);
    if (topicByNumber) {
      context.topicId = topicByNumber.id;
      context.topicName = `Topic ${topicByNumber.topicNumber} · ${topicByNumber.title}`;
      return context;
    }

    return {
      ...context,
      warning: `未找到 Topic ${hintedTopicNumber}，请手动选择知识点。`,
    };
  }

  let bestTopic: IntentTopicOption | null = null;
  let bestTopicScore = 0;
  for (const topic of scopedTopics) {
    const score = scoreTopic(message, topic);
    if (score > bestTopicScore) {
      bestTopic = topic;
      bestTopicScore = score;
    }
  }

  if (bestTopic && bestTopicScore > 0) {
    context.topicId = bestTopic.id;
    context.topicName = `Topic ${bestTopic.topicNumber} · ${bestTopic.title}`;
  }

  return context;
}
