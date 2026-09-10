import type { PblCurriculumSystem, PblDifficulty } from "@/lib/pbl/types";

export const PBL_SUBJECT_OPTIONS: Record<PblCurriculumSystem, readonly string[]> = {
  AP: [
    "AP Chemistry",
    "AP Calculus AB",
    "AP Calculus BC",
    "AP Biology",
    "AP Physics 1: Algebra-Based",
    "AP Statistics",
    "AP Computer Science A",
    "AP English Language and Composition",
    "AP Microeconomics",
    "AP Psychology",
    "AP Environmental Science",
    "AP World History: Modern",
    "AP Research",
    "AP Seminar",
    "AP 2-D Art and Design",
    "AP 3-D Art and Design",
    "AP Drawing",
    "AP Art History",
    "AP Music Theory",
    "AP English Literature and Composition",
    "AP African American Studies",
    "AP Comparative Government and Politics",
    "AP European History",
    "AP Human Geography",
    "AP Macroeconomics",
    "AP United States Government and Politics",
    "AP United States History",
    "AP Computer Science Principles",
    "AP Precalculus",
    "AP Physics 2: Algebra-Based",
    "AP Physics C: Electricity and Magnetism",
    "AP Physics C: Mechanics",
    "AP Chinese Language and Culture",
    "AP French Language and Culture",
    "AP German Language and Culture",
    "AP Italian Language and Culture",
    "AP Japanese Language and Culture",
    "AP Latin",
    "AP Spanish Language and Culture",
    "AP Spanish Literature and Culture",
  ],
  IB: [
    "IB Physics HL",
    "IB Chemistry HL",
    "IB Biology HL",
    "IB Mathematics: Analysis and Approaches HL",
    "IB Economics HL",
    "IB English A: Language and Literature HL",
    "IB Computer Science HL",
    "IB Business Management HL",
    "IB Psychology HL",
    "IB Global Politics HL",
    "IB Physics SL",
    "IB Chemistry SL",
    "IB Biology SL",
    "IB Mathematics: Analysis and Approaches SL",
    "IB Mathematics: Applications and Interpretation HL",
    "IB Mathematics: Applications and Interpretation SL",
    "IB Economics SL",
    "IB English A: Language and Literature SL",
    "IB English A: Literature HL",
    "IB English A: Literature SL",
    "IB Chinese A: Language and Literature HL",
    "IB Chinese A: Language and Literature SL",
    "IB Chinese B HL",
    "IB Chinese B SL",
    "IB English B HL",
    "IB English B SL",
    "IB French B HL",
    "IB French B SL",
    "IB Spanish B HL",
    "IB Spanish B SL",
    "IB History HL",
    "IB History SL",
    "IB Geography HL",
    "IB Geography SL",
    "IB Philosophy HL",
    "IB Philosophy SL",
    "IB Digital Society HL",
    "IB Digital Society SL",
    "IB Social and Cultural Anthropology HL",
    "IB Social and Cultural Anthropology SL",
    "IB Business Management SL",
    "IB Global Politics SL",
    "IB Psychology SL",
    "IB Computer Science SL",
    "IB Design Technology HL",
    "IB Design Technology SL",
    "IB Environmental Systems and Societies SL",
    "IB Sports, Exercise and Health Science HL",
    "IB Sports, Exercise and Health Science SL",
    "IB Visual Arts HL",
    "IB Visual Arts SL",
    "IB Film HL",
    "IB Film SL",
    "IB Music HL",
    "IB Music SL",
    "IB Theatre HL",
    "IB Theatre SL",
    "IB Dance HL",
    "IB Dance SL",
  ],
  CN: [
    "高中数学",
    "高中英语",
    "高中语文",
    "高中物理",
    "高中化学",
    "高中生物",
    "高中历史",
    "高中地理",
    "高中思想政治",
    "高中信息技术",
    "高中通用技术",
  ],
};

export const PBL_POPULAR_SUBJECT_OPTIONS: Record<PblCurriculumSystem, readonly string[]> = {
  AP: [
    "AP Chemistry",
    "AP Calculus AB",
    "AP Calculus BC",
    "AP Biology",
    "AP Physics 1: Algebra-Based",
    "AP Statistics",
    "AP Computer Science A",
    "AP English Language and Composition",
    "AP Microeconomics",
    "AP Psychology",
  ],
  IB: [
    "IB Physics HL",
    "IB Chemistry HL",
    "IB Biology HL",
    "IB Mathematics: Analysis and Approaches HL",
    "IB Economics HL",
    "IB English A: Language and Literature HL",
    "IB Computer Science HL",
    "IB Business Management HL",
    "IB Psychology HL",
    "IB Global Politics HL",
  ],
  CN: [
    "高中数学",
    "高中英语",
    "高中语文",
    "高中物理",
    "高中化学",
    "高中生物",
  ],
};

export const PBL_CURRICULUM_COVERED_SUBJECTS: Record<PblCurriculumSystem, readonly string[]> = {
  AP: [
    "AP Biology",
    "AP Calculus AB",
    "AP Chemistry",
    "AP Computer Science A",
    "AP Computer Science Principles",
    "AP Physics 1: Algebra-Based",
    "AP Statistics",
  ],
  IB: [
    "IB Biology HL",
    "IB Chemistry SL",
    "IB Economics SL",
    "IB Mathematics: Analysis and Approaches HL",
    "IB Physics HL",
  ],
  CN: [
    "高中化学",
    "高中物理",
    "高中生物",
    "高中英语",
    "高中语文",
  ],
};

export const PBL_GRADE_OPTIONS = ["预科", "高一", "高二", "高三"] as const;

export const PBL_PERIOD_RANGE = { min: 2, max: 60, default: 8 } as const;

export const PBL_PERIOD_HINTS = [
  { range: "2-6", label: "微型项目", description: "聚焦单一问题，快速完成探索与总结" },
  { range: "6-12", label: "标准项目", description: "完整三阶段，适合大部分教学场景" },
  { range: "12-24", label: "深度项目", description: "双执行阶段，支持深度探究与迭代" },
  { range: "24+", label: "长期项目", description: "完整五阶段，适合跨学科或学期项目" },
] as const;

export const PBL_DIFFICULTY_OPTIONS: Array<{
  value: PblDifficulty;
  label: string;
  hint: string;
}> = [
  {
    value: "basic",
    label: "基础",
    hint: "缩小问题范围，增加分步模板和检查清单，降低变量复杂度。",
  },
  {
    value: "advanced",
    label: "进阶",
    hint: "保持标准 PBL 深度，在证据、协作和展示之间取得平衡。",
  },
  {
    value: "challenge",
    label: "挑战",
    hint: "提高开放度与自主性，要求多方法比较和更强论证深度。",
  },
];

function normalizeSubjectText(value: string | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[()（）:：,-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCurriculumLookupText(value: string | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/advanced\s*placement|ap\b/g, "")
    .replace(/international\s*baccalaureate|ib\b/g, "")
    .replace(/[()（）:：,-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSubjectText(value: string | undefined) {
  return normalizeCurriculumLookupText(value)
    .split(/[^a-z0-9\u4e00-\u9fa5]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function matchesStructuredCurriculumSubject(reference: string, candidate: string) {
  const normalizedReference = normalizeCurriculumLookupText(reference);
  const normalizedCandidate = normalizeCurriculumLookupText(candidate);

  if (!normalizedCandidate) return false;
  if (
    normalizedReference.includes(normalizedCandidate) ||
    normalizedCandidate.includes(normalizedReference)
  ) {
    return true;
  }

  const referenceTokens = tokenizeSubjectText(reference);
  const candidateTokens = tokenizeSubjectText(candidate);
  if (referenceTokens.length === 0 || candidateTokens.length === 0) {
    return false;
  }

  return candidateTokens.every((token) =>
    referenceTokens.some((referenceToken) => referenceToken.includes(token) || token.includes(referenceToken)),
  );
}

function splitKeywords(value: string | undefined) {
  return normalizeSubjectText(value)
    .split(" ")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeByOptions<T extends readonly string[]>(
  value: string | undefined,
  options: T,
  fallback: T[number],
): T[number] {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;

  const exact = options.find((option) => option === trimmed);
  if (exact) return exact;

  const normalized = normalizeSubjectText(trimmed);
  const fuzzy = options.find((option) => {
    const optionNormalized = normalizeSubjectText(option);
    return optionNormalized.includes(normalized) || normalized.includes(optionNormalized);
  });

  return fuzzy ?? fallback;
}

export function getPopularSubjectOptions(curriculumSystem: PblCurriculumSystem) {
  return PBL_POPULAR_SUBJECT_OPTIONS[curriculumSystem];
}

export function getDefaultSubjectForCurriculum(curriculumSystem: PblCurriculumSystem) {
  return getPopularSubjectOptions(curriculumSystem)[0] ?? PBL_SUBJECT_OPTIONS[curriculumSystem][0];
}

export function normalizeSubjectForCurriculum(
  curriculumSystem: PblCurriculumSystem,
  subject: string | undefined,
) {
  return normalizeByOptions(
    subject,
    PBL_SUBJECT_OPTIONS[curriculumSystem],
    getDefaultSubjectForCurriculum(curriculumSystem),
  );
}

export function hasStructuredCurriculumSupport(
  curriculumSystem: PblCurriculumSystem,
  subject: string,
) {
  return PBL_CURRICULUM_COVERED_SUBJECTS[curriculumSystem].some(
    (item) => matchesStructuredCurriculumSubject(item, subject),
  );
}

export function getRankedSubjectOptions(
  curriculumSystem: PblCurriculumSystem,
  query: string,
) {
  const options = PBL_SUBJECT_OPTIONS[curriculumSystem];
  const keywords = splitKeywords(query);
  const popular = new Set(getPopularSubjectOptions(curriculumSystem));
  const normalizedQuery = normalizeSubjectText(query);

  return [...options]
    .filter((option) => {
      if (keywords.length === 0) return true;
      const normalized = normalizeSubjectText(option);
      return keywords.every((keyword) => normalized.includes(keyword));
    })
    .sort((a, b) => {
      const aNormalized = normalizeSubjectText(a);
      const bNormalized = normalizeSubjectText(b);

      const score = (value: string, label: string) => {
        let total = 0;
        if (!normalizedQuery) total += 1;
        if (label === normalizedQuery) total += 120;
        else if (label.startsWith(normalizedQuery)) total += 80;
        else if (normalizedQuery && label.includes(normalizedQuery)) total += 40;
        if (popular.has(value)) total += 30;
        if (hasStructuredCurriculumSupport(curriculumSystem, value)) total += 12;
        return total;
      };

      const difference = score(b, bNormalized) - score(a, aNormalized);
      if (difference !== 0) return difference;
      return a.localeCompare(b, "en");
    });
}

export function normalizeGradeOption(
  value: string | undefined,
  fallback: (typeof PBL_GRADE_OPTIONS)[number] = PBL_GRADE_OPTIONS[1],
) {
  return normalizeByOptions(value, PBL_GRADE_OPTIONS, fallback);
}

export function clampPeriods(input: number): number {
  return Math.max(PBL_PERIOD_RANGE.min, Math.min(PBL_PERIOD_RANGE.max, Math.round(input)));
}
