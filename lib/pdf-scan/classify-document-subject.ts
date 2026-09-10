import { z } from "zod";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import { generateStructuredObject } from "@/lib/ai/structured-output";
import { GENERIC_COURSE_CODE } from "@/lib/curriculum/generic";

export type DocumentSubjectResult = {
  courseName: string | null;
  courseCode: string | null;
  confidence: number;
  reasons: string[];
};

export type DocumentSubjectCourseCandidate = {
  id: string;
  name: string;
  code: string | null;
};

type HeuristicCourseMatch = DocumentSubjectResult & {
  matchedCourse: DocumentSubjectCourseCandidate | null;
};

const documentSubjectSchema = z.object({
  courseName: z.string().trim().max(160).nullable(),
  courseCode: z.string().trim().max(120).nullable(),
  confidence: z.number().int().min(0).max(100),
  reasons: z.array(z.string().trim().min(1).max(160)).max(5).default([]),
});

const DOCUMENT_SUBJECT_PROMPT = `你是试卷课程归类器。你只能从给定候选课程中选择一项，或在证据不足时返回 null。

规则：
1. 这是“整份文档”的归类，不是单题归类。要看整卷的主导学科。
2. OCR 个别题目的 subject/knowledgePoint 提示可能是错的，必须以题干正文和整卷主题为准。
3. 即使文件名里出现 olympiad、local exam、sample paper、practice test 等字样，只要学科明确，也应归到对应课程。
4. 只能返回候选课程中的完整课程名和其稳定 courseCode；不要自造课程名。
5. 如果证据不足，返回 null，不要硬猜。

特别注意：
- USNCO / stoichiometry / molar mass / equilibrium / pH / electrolysis / Lewis / orbital / enthalpy / entropy 这类信号应优先归到 AP Chemistry。
- derivative / integral / limit / tangent 这类信号应优先归到 AP Calculus。
- demand / supply / elasticity / marginal cost 这类信号应优先归到 AP Microeconomics。
- GDP / inflation / unemployment / monetary policy 这类信号应优先归到 AP Macroeconomics。
- velocity / force / momentum / acceleration 这类信号应优先归到 AP Physics C: Mechanics。
- probability / distribution / regression / hypothesis test 这类信号应优先归到 AP Statistics。

只输出结构化结果，不要额外解释。`;

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}

function normalizeLookupText(value: string | null | undefined) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactLookupText(value: string | null | undefined) {
  return normalizeLookupText(value).replace(/\s+/g, "");
}

function normalizeCourseCode(value: string | null | undefined) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildCourseAliases(course: Pick<DocumentSubjectCourseCandidate, "name" | "code">) {
  const normalizedName = normalizeLookupText(course.name);
  const compactName = compactLookupText(course.name);
  const normalizedCode = normalizeLookupText(course.code);
  const compactCode = compactLookupText(course.code);
  const normalizedSnakeCode = normalizeCourseCode(course.code);
  const withoutAp = normalizedName.replace(/^ap\s+/, "");

  return Array.from(
    new Set(
      [
        normalizedName,
        compactName,
        normalizedCode,
        compactCode,
        normalizedSnakeCode,
        withoutAp,
        withoutAp.replace(/\s+/g, ""),
      ].filter(Boolean),
    ),
  );
}

function getCourseDomainKeywords(course: DocumentSubjectCourseCandidate) {
  const searchable = `${normalizeLookupText(course.name)} ${normalizeLookupText(course.code)}`;

  if (/chem/.test(searchable)) {
    return [
      "chemistry",
      "化学",
      "usnco",
      "olympiad",
      "mole",
      "molar mass",
      "stoichiometry",
      "empirical formula",
      "equilibrium",
      "ksp",
      "ka",
      "kb",
      "ph",
      "electrolysis",
      "electrochemical",
      "oxidation state",
      "enthalpy",
      "entropy",
      "gibbs",
      "orbital",
      "lewis",
      "hybridization",
      "titration",
      "aqueous",
      "ionization energy",
      "periodic",
      "organic",
    ];
  }

  if (/calc/.test(searchable)) {
    return [
      "calculus",
      "微积分",
      "derivative",
      "integral",
      "limit",
      "continuity",
      "tangent",
      "slope",
      "accumulation",
      "chain rule",
    ];
  }

  if (/stat/.test(searchable)) {
    return [
      "statistics",
      "统计",
      "probability",
      "distribution",
      "regression",
      "confidence interval",
      "hypothesis",
      "sample",
      "mean",
      "standard deviation",
    ];
  }

  if (/phys/.test(searchable) || /mechanics/.test(searchable)) {
    return [
      "physics",
      "物理",
      "mechanics",
      "force",
      "velocity",
      "acceleration",
      "momentum",
      "energy",
      "projectile",
      "newton",
    ];
  }

  if (/micro/.test(searchable)) {
    return [
      "microeconomics",
      "微观",
      "economics",
      "demand",
      "supply",
      "elasticity",
      "marginal",
      "market",
      "monopoly",
      "competition",
    ];
  }

  if (/macro/.test(searchable)) {
    return [
      "macroeconomics",
      "宏观",
      "economics",
      "gdp",
      "inflation",
      "unemployment",
      "monetary policy",
      "fiscal policy",
      "aggregate demand",
      "aggregate supply",
    ];
  }

  return [];
}

function scoreCourseMatch(params: {
  subjectAliases: string[];
  subjectCompactAliases: string[];
  course: DocumentSubjectCourseCandidate;
}) {
  const courseAliases = buildCourseAliases(params.course);
  const courseCompactAliases = courseAliases.map((item) => item.replace(/\s+/g, ""));

  let score = 0;
  const matchedSignals: string[] = [];

  for (const alias of params.subjectAliases) {
    if (!alias) continue;
    if (courseAliases.includes(alias)) {
      score += alias.length >= 12 ? 120 : 96;
      matchedSignals.push("exact_alias");
      continue;
    }

    if (courseAliases.some((courseAlias) => courseAlias.includes(alias) || alias.includes(courseAlias))) {
      score += alias.length >= 8 ? 42 : 24;
      matchedSignals.push("partial_alias");
    }
  }

  for (const alias of params.subjectCompactAliases) {
    if (!alias) continue;
    if (courseCompactAliases.includes(alias)) {
      score += alias.length >= 10 ? 110 : 88;
      matchedSignals.push("exact_compact_alias");
      continue;
    }

    if (
      courseCompactAliases.some(
        (courseAlias) => courseAlias.includes(alias) || alias.includes(courseAlias),
      )
    ) {
      score += alias.length >= 8 ? 36 : 18;
      matchedSignals.push("partial_compact_alias");
    }
  }

  return {
    score,
    matchedSignals: Array.from(new Set(matchedSignals)),
  };
}

export function matchDocumentSubjectCourse(params: {
  courses: DocumentSubjectCourseCandidate[];
  courseName?: string | null;
  courseCode?: string | null;
}) {
  const subjectAliases = Array.from(
    new Set(
      [
        normalizeLookupText(params.courseName),
        normalizeLookupText(params.courseCode),
        normalizeCourseCode(params.courseCode),
        normalizeLookupText(cleanText(params.courseCode).replace(/_/g, " ")),
      ].filter(Boolean),
    ),
  );
  const subjectCompactAliases = Array.from(
    new Set(
      [
        compactLookupText(params.courseName),
        compactLookupText(params.courseCode),
        normalizeCourseCode(params.courseCode).replace(/_/g, ""),
      ].filter(Boolean),
    ),
  );

  if (subjectAliases.length === 0 && subjectCompactAliases.length === 0) {
    return null;
  }

  const ranked = params.courses
    .filter(
      (course) =>
        cleanText(course.name).length > 0 &&
        cleanText(course.code).toUpperCase() !== GENERIC_COURSE_CODE,
    )
    .map((course) => ({
      course,
      ...scoreCourseMatch({
        subjectAliases,
        subjectCompactAliases,
        course,
      }),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.course.name.localeCompare(right.course.name);
    });

  return ranked[0]?.course ?? null;
}

function normalizeResult(value: z.infer<typeof documentSubjectSchema>): DocumentSubjectResult {
  return {
    courseName: cleanText(value.courseName) || null,
    courseCode: normalizeCourseCode(value.courseCode) || null,
    confidence: Math.max(0, Math.min(100, Math.round(value.confidence))),
    reasons: value.reasons.map((item) => cleanText(item)).filter(Boolean).slice(0, 5),
  };
}

function scoreCourseFromDocument(params: {
  course: DocumentSubjectCourseCandidate;
  searchableText: string;
}) {
  const aliases = buildCourseAliases(params.course);
  const aliasMatches = aliases.filter((alias) => alias && params.searchableText.includes(alias));
  const keywordMatches = getCourseDomainKeywords(params.course)
    .map((keyword) => normalizeLookupText(keyword))
    .filter((keyword) => keyword && params.searchableText.includes(keyword));
  const exactSignals = aliasMatches.filter((item) => item.length >= 6);

  const score =
    (exactSignals.length * 40) +
    ((aliasMatches.length - exactSignals.length) * 20) +
    keywordMatches.reduce((total, keyword) => total + (keyword.length >= 8 ? 7 : 5), 0);

  return {
    score,
    reasons: uniqueStrings([
      ...exactSignals.slice(0, 2).map((item) => `命中文档别名: ${item}`),
      ...keywordMatches.slice(0, 4).map((item) => `命中学科关键词: ${item}`),
    ]),
  };
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((item) => cleanText(item))
        .filter(Boolean),
    ),
  );
}

export function inferDocumentSubjectHeuristically(params: {
  fileName: string;
  textPreview: string;
  sampleQuestions: string;
  courses: DocumentSubjectCourseCandidate[];
}): HeuristicCourseMatch {
  const searchableText = normalizeLookupText([
    params.fileName,
    params.textPreview,
    params.sampleQuestions,
  ].filter(Boolean).join("\n"));

  const ranked = params.courses
    .filter((course) => cleanText(course.code).toUpperCase() !== GENERIC_COURSE_CODE)
    .map((course) => ({
      course,
      ...scoreCourseFromDocument({
        course,
        searchableText,
      }),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.course.name.localeCompare(right.course.name);
    });

  const best = ranked[0];
  const second = ranked[1];
  if (!best) {
    return {
      courseName: null,
      courseCode: null,
      confidence: 0,
      reasons: ["启发式未找到稳定学科信号"],
      matchedCourse: null,
    };
  }

  const separation = Math.max(0, best.score - (second?.score ?? 0));
  let confidence = 48 + Math.min(42, best.score);
  if (best.reasons.some((reason) => reason.includes("usnco"))) {
    confidence += 10;
  }
  if (separation <= 6) {
    confidence -= 18;
  } else if (separation >= 12) {
    confidence += 8;
  }

  return {
    courseName: best.course.name,
    courseCode: normalizeCourseCode(best.course.code),
    confidence: Math.max(0, Math.min(100, Math.round(confidence))),
    reasons: uniqueStrings(best.reasons).slice(0, 5),
    matchedCourse: best.course,
  };
}

export async function classifyDocumentSubject(params: {
  fileName: string;
  textPreview: string;
  sampleQuestions: string;
  courses?: DocumentSubjectCourseCandidate[];
}): Promise<DocumentSubjectResult> {
  const userPrompt = [
    `文件名：${cleanText(params.fileName) || "未命名文件"}`,
    params.textPreview ? `文档摘要：${truncateText(cleanText(params.textPreview), 1800)}` : "",
    params.sampleQuestions
      ? `题目样本：\n${truncateText(params.sampleQuestions.trim(), 3200)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!userPrompt.trim()) {
    return {
      courseName: null,
      courseCode: null,
      confidence: 0,
      reasons: ["输入为空"],
    };
  }

  const heuristic =
    params.courses && params.courses.length > 0
      ? inferDocumentSubjectHeuristically({
          fileName: params.fileName,
          textPreview: params.textPreview,
          sampleQuestions: params.sampleQuestions,
          courses: params.courses,
        })
      : {
          courseName: null,
          courseCode: null,
          confidence: 0,
          reasons: [],
          matchedCourse: null,
        };

  if (heuristic.matchedCourse && heuristic.confidence >= 90) {
    return {
      courseName: heuristic.matchedCourse.name,
      courseCode: normalizeCourseCode(heuristic.matchedCourse.code),
      confidence: heuristic.confidence,
      reasons: uniqueStrings([
        ...heuristic.reasons,
        "高置信文档启发式识别直接采用。",
      ]),
    };
  }

  try {
    const result = await generateStructuredObject({
      model: getResolvedLanguageModelForTask("pdf_document_subject"),
      schema: documentSubjectSchema,
      systemPrompt: DOCUMENT_SUBJECT_PROMPT,
      userPrompt: [
        userPrompt,
        params.courses && params.courses.length > 0
          ? `候选课程：\n${params.courses
              .filter((course) => cleanText(course.code).toUpperCase() !== GENERIC_COURSE_CODE)
              .map((course) => `- ${course.name} | ${course.code ?? "无 code"}`)
              .join("\n")}`
          : "",
        heuristic.matchedCourse
          ? `启发式建议：${heuristic.matchedCourse.name} | ${heuristic.matchedCourse.code ?? "无 code"} | confidence ${heuristic.confidence}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      temperature: 0,
      maxTokens: 320,
      maxRetries: 1,
    });

    const normalized = normalizeResult(result);
    const matchedCourse =
      params.courses && params.courses.length > 0
        ? matchDocumentSubjectCourse({
            courses: params.courses,
            courseName: normalized.courseName,
            courseCode: normalized.courseCode,
          })
        : null;

    if (matchedCourse) {
      return {
        courseName: matchedCourse.name,
        courseCode: normalizeCourseCode(matchedCourse.code),
        confidence: Math.max(normalized.confidence, heuristic.matchedCourse?.id === matchedCourse.id ? heuristic.confidence : normalized.confidence),
        reasons: uniqueStrings([
          ...normalized.reasons,
          ...(heuristic.matchedCourse?.id === matchedCourse.id ? heuristic.reasons : []),
        ]),
      };
    }

    if (heuristic.matchedCourse && heuristic.confidence >= 70) {
      return {
        courseName: heuristic.matchedCourse.name,
        courseCode: normalizeCourseCode(heuristic.matchedCourse.code),
        confidence: heuristic.confidence,
        reasons: uniqueStrings([
          ...heuristic.reasons,
          "模型结果未稳定命中候选课程，回退启发式结果。",
        ]),
      };
    }

    return normalized;
  } catch (error) {
    if (heuristic.matchedCourse) {
      return {
        courseName: heuristic.matchedCourse.name,
        courseCode: normalizeCourseCode(heuristic.matchedCourse.code),
        confidence: heuristic.confidence,
        reasons: uniqueStrings([
          ...heuristic.reasons,
          error instanceof Error && cleanText(error.message)
            ? `模型识别失败，回退启发式：${cleanText(error.message)}`
            : "模型识别失败，回退启发式",
        ]),
      };
    }

    return {
      courseName: null,
      courseCode: null,
      confidence: 0,
      reasons: [
        error instanceof Error && cleanText(error.message)
          ? cleanText(error.message)
          : "学科识别失败",
      ],
    };
  }
}
