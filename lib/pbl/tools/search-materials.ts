import { loadKnowledgePoints, loadPublicMaterials } from "@/lib/pbl/data";
import type {
  PblCurriculumSystem,
  PblDifficulty,
  PblMaterial,
  PblMaterialCurriculumScope,
  PblMaterialBucketKey,
  PblMaterialKnowledgeMatch,
  PblMaterialSearchHints,
  PblMaterialSearchBucket,
  PblMaterialSearchResult,
  PblMaterialTopicMatch,
} from "@/lib/pbl/types";

export interface SearchMaterialsInput {
  subjects: string[];
  themes: string[];
  forms: string[];
  topic?: string;
  knowledgePoints?: string[];
  curriculumSystem?: PblCurriculumSystem;
  difficulty: PblDifficulty;
}

type RequestedKnowledgeContext = {
  requestedTokens: string[];
  requestedCodes: Set<string>;
  requestedNames: Set<string>;
};

type MaterialSignals = {
  primarySubjectScore: number;
  secondarySubjectScore: number;
  topicScore: number;
  themeScore: number;
  formScore: number;
  knowledgeScore: number;
  sameCurriculum: boolean;
  genericCurriculum: boolean;
  crossCurriculum: boolean;
  unknownCurriculum: boolean;
  contentLengthScore: number;
  recencyScore: number;
  authorityScore: number;
};

type RankedMaterial = {
  material: PblMaterial;
  overallScore: number;
  signals: MaterialSignals;
  bucketScores: Record<PblMaterialBucketKey, number>;
  searchHints?: PblMaterialSearchHints;
};

type TopicAlignment = {
  score: number;
  matches: PblMaterialTopicMatch[];
  keywordHits: string[];
};

type KnowledgeAlignment = {
  score: number;
  matches: PblMaterialKnowledgeMatch[];
  keywordHits: string[];
};

const BUCKET_ORDER: PblMaterialBucketKey[] = [
  "curriculumAnchors",
  "crossDisciplinaryBridges",
  "projectInspiration",
];

const BUCKET_META: Record<
  PblMaterialBucketKey,
  {
    label: string;
    purpose: string;
  }
> = {
  curriculumAnchors: {
    label: "课标锚点素材",
    purpose: "优先用于本体系知识点对齐、阶段目标、评价标准和成果规格设计。",
  },
  crossDisciplinaryBridges: {
    label: "跨学科 / 跨体系桥接素材",
    purpose: "用于补充跨学科方法、对比视角和体系外但高价值的概念迁移参考。",
  },
  projectInspiration: {
    label: "真实案例与项目启发素材",
    purpose: "用于驱动问题、真实情境、成果形式和展示方式设计，不直接替代课标锚点。",
  },
};

/**
 * 学科名称中英文别名映射。
 * 搜索时输入的学科名通常是英文（AP/IB 体系），
 * 但素材标签多为中文，需要双向扩展才能匹配。
 */
const SUBJECT_ALIAS_MAP: ReadonlyMap<string, readonly string[]> = new Map([
  ["computer science", ["计算机", "编程", "软件", "算法"]],
  ["计算机", ["computer science", "programming", "coding"]],
  ["biology", ["生物"]],
  ["生物", ["biology"]],
  ["chemistry", ["化学"]],
  ["化学", ["chemistry"]],
  ["physics", ["物理"]],
  ["物理", ["physics"]],
  ["mathematics", ["数学", "数学建模"]],
  ["数学", ["mathematics", "math"]],
  ["environmental science", ["环境科学", "环境与生态"]],
  ["环境科学", ["environmental science"]],
  ["economics", ["经济", "经济与商业"]],
  ["经济", ["economics"]],
  ["statistics", ["数据分析", "统计"]],
  ["数据分析", ["statistics", "data"]],
  ["psychology", ["心理学"]],
  ["心理学", ["psychology"]],
  ["history", ["历史"]],
  ["历史", ["history"]],
  ["english", ["英语"]],
  ["engineering", ["工程", "工程设计"]],
  ["工程", ["engineering"]],
]);

function expandWithAliases(keyword: string): string[] {
  const result = [keyword];
  for (const [key, aliases] of SUBJECT_ALIAS_MAP) {
    if (keyword.includes(key)) {
      result.push(...aliases);
    }
  }
  return result;
}

function normalizeKeywords(values: string[]) {
  const lowered = values
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const expanded = lowered.flatMap(expandWithAliases);
  return expanded.filter((value, index, arr) => arr.indexOf(value) === index);
}

function buildTopicKeywords(topic: string | undefined) {
  const trimmed = topic?.trim().toLowerCase();
  if (!trimmed) return [];

  const segments = trimmed
    .split(/[\n,，/／、;；|]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  const expanded = new Set<string>([trimmed, ...segments]);
  segments.forEach((segment) => {
    segment
      .split(/\s+/)
      .map((value) => value.trim())
      .filter((value) => value.length >= 3)
      .forEach((value) => expanded.add(value));
  });

  return normalizeKeywords(Array.from(expanded).filter((value) => value.length >= 2));
}

function analyzeTopicAlignment(material: PblMaterial, topic: string | undefined): TopicAlignment {
  const requestedTokens = buildTopicKeywords(topic);
  if (requestedTokens.length === 0) {
    return {
      score: 0,
      matches: [],
      keywordHits: [],
    };
  }

  const titleText = material.title.toLowerCase();
  const contentText = (material.originalContent ?? "").toLowerCase();
  const topicLinks = material.topicLinks ?? [];

  if (topicLinks.length === 0) {
    const titleHits = requestedTokens.filter((token) => titleText.includes(token));
    const contentHits = requestedTokens.filter((token) => contentText.includes(token));

    return {
      score: scoreByKeywords(titleText, requestedTokens, 8) + scoreByKeywords(contentText, requestedTokens, 5),
      matches: [],
      keywordHits: normalizeKeywords([...titleHits, ...contentHits]),
    };
  }

  let score = 0;
  const matches: PblMaterialTopicMatch[] = [];
  const keywordHits = normalizeKeywords(
    requestedTokens.filter((token) => titleText.includes(token) || contentText.includes(token)),
  );

  topicLinks.forEach((link) => {
    const linkWeight = link.relevance === "supporting" ? 0.65 : 1;
    const candidates = Array.from(
      new Set([link.name, link.slug, ...(link.aliases ?? [])].map((value) => value.trim().toLowerCase()).filter(Boolean)),
    );
    const exactTerms = requestedTokens.filter((token) => candidates.includes(token));
    const partialTerms = requestedTokens.filter(
      (token) =>
        !exactTerms.includes(token) &&
        candidates.some((candidate) => candidate.includes(token) || token.includes(candidate)),
    );

    if (exactTerms.length > 0) {
      score += 16 * linkWeight;
    }

    if (partialTerms.length > 0) {
      score += 8 * linkWeight;
    }

    if (exactTerms.length > 0 || partialTerms.length > 0) {
      matches.push({
        slug: link.slug,
        name: link.name,
        relevance: link.relevance,
        matchedTerms: normalizeKeywords([...exactTerms, ...partialTerms]),
        matchType: exactTerms.length > 0 ? "exact" : "partial",
      });
    }
  });

  score += scoreByKeywords(titleText, requestedTokens, 2);
  score += scoreByKeywords(contentText, requestedTokens, 1);

  return {
    score,
    matches,
    keywordHits,
  };
}

function scoreByKeywords(text: string, keywords: string[], weight: number) {
  if (!text || keywords.length === 0) return 0;

  let score = 0;
  keywords.forEach((keyword) => {
    if (text.includes(keyword)) {
      score += weight;
    }
  });

  return score;
}

function materialDedupKey(material: PblMaterial) {
  return `${material.type}:${material.title.trim().toLowerCase()}`;
}

function getDimensionTagText(material: PblMaterial, dimension: "A" | "B" | "C" | "D") {
  const grouped = material.tagsByDimension?.[dimension] ?? [];
  if (grouped.length > 0) {
    return grouped.join(" ").toLowerCase();
  }

  const detailed = material.tagDetails
    ?.filter((tag) => tag.dimension === dimension)
    .map((tag) => tag.name)
    .join(" ")
    .toLowerCase();

  return detailed && detailed.length > 0 ? detailed : material.tags.join(" ").toLowerCase();
}

function inferMaterialCurriculum(material: PblMaterial): PblMaterialCurriculumScope | null {
  if (material.curriculumScope) {
    return material.curriculumScope;
  }
  const links = material.knowledgePointLinks ?? [];
  if (links.length > 0) {
    const counter = new Map<PblCurriculumSystem, number>();
    links.forEach((link) => {
      counter.set(link.curriculumSystem, (counter.get(link.curriculumSystem) ?? 0) + 1);
    });

    const winners = Array.from(counter.entries()).sort((a, b) => b[1] - a[1]);
    if (winners.length === 1) return winners[0][0];
    if (winners.length > 1) return "GENERIC";
  }

  const text = `${material.title} ${material.source} ${material.tags.join(" ")}`.toLowerCase();
  if (
    text.includes(" ap ") ||
    text.startsWith("ap ") ||
    text.includes("apcentral") ||
    text.includes("college board")
  ) {
    return "AP";
  }
  if (text.includes(" ib ") || text.includes("ibo") || text.includes("diploma programme")) {
    return "IB";
  }
  if (
    text.includes("课程标准") ||
    text.includes("教育部") ||
    text.includes("高中") ||
    text.includes("国家中小学")
  ) {
    return "CN";
  }

  return "GENERIC";
}

function isCurriculumEligible(
  material: PblMaterial,
  requestedCurriculum: PblCurriculumSystem | undefined,
) {
  if (!requestedCurriculum) return true;
  const scope = inferMaterialCurriculum(material);
  if (!scope) return false;
  return scope === requestedCurriculum || scope === "GENERIC";
}

function buildRequestedKnowledgeContext(params: {
  knowledgePointInputs: string[];
  curriculumSystem?: PblCurriculumSystem;
}) {
  const requestedTokens = normalizeKeywords(params.knowledgePointInputs);
  const context: RequestedKnowledgeContext = {
    requestedTokens,
    requestedCodes: new Set(),
    requestedNames: new Set(),
  };

  return loadKnowledgePoints().then((allPoints) => {
    const candidates = params.curriculumSystem
      ? allPoints.filter((point) => point.curriculumSystem === params.curriculumSystem)
      : allPoints;

    requestedTokens.forEach((token) => {
      candidates.forEach((point) => {
        const code = point.code.toLowerCase();
        const name = point.name.toLowerCase();

        if (code === token || code.includes(token) || token.includes(code)) {
          context.requestedCodes.add(code);
          context.requestedNames.add(name);
          return;
        }

        if (name.includes(token) || token.includes(name)) {
          context.requestedCodes.add(code);
          context.requestedNames.add(name);
        }
      });
    });

    return context;
  });
}

function analyzeKnowledgePointAlignment(
  material: PblMaterial,
  context: RequestedKnowledgeContext,
): KnowledgeAlignment {
  if (context.requestedTokens.length === 0) {
    return {
      score: 0,
      matches: [],
      keywordHits: [],
    };
  }

  let score = 0;
  const links = material.knowledgePointLinks ?? [];
  const matches: PblMaterialKnowledgeMatch[] = [];

  links.forEach((link) => {
    const code = link.code.toLowerCase();
    const name = link.name.toLowerCase();
    const linkWeight = link.relevance === "primary" ? 1 : 0.65;
    const matchedTerms = new Set<string>();

    if (context.requestedCodes.has(code)) {
      score += 14 * linkWeight;
      matchedTerms.add(link.code);
    }

    if (context.requestedNames.has(name)) {
      score += 10 * linkWeight;
      matchedTerms.add(link.name);
    }

    const tokenHits = context.requestedTokens.filter((token) => code.includes(token) || name.includes(token));
    if (tokenHits.length > 0) {
      score += 4 * linkWeight;
      tokenHits.forEach((token) => matchedTerms.add(token));
    }

    if (matchedTerms.size > 0) {
      matches.push({
        code: link.code,
        name: link.name,
        curriculumSystem: link.curriculumSystem,
        subject: link.subject,
        relevance: link.relevance,
        matchedTerms: Array.from(matchedTerms),
      });
    }
  });

  const keywordHits: string[] = [];

  if (links.length === 0) {
    const contentText = (material.originalContent ?? "").toLowerCase();
    const titleText = material.title.toLowerCase();
    const titleHits = context.requestedTokens.filter((token) => titleText.includes(token));
    const contentHits = context.requestedTokens.filter((token) => contentText.includes(token));

    score += scoreByKeywords(contentText, context.requestedTokens, 3);
    score += scoreByKeywords(titleText, context.requestedTokens, 2);
    keywordHits.push(...titleHits, ...contentHits);
  }

  return {
    score,
    matches,
    keywordHits: normalizeKeywords(keywordHits),
  };
}

function buildMaterialSignals(
  material: PblMaterial,
  input: SearchMaterialsInput,
  knowledgeContext: RequestedKnowledgeContext,
): {
  signals: MaterialSignals;
  topicAlignment: TopicAlignment;
  knowledgeAlignment: KnowledgeAlignment;
  inferredCurriculum: PblMaterialCurriculumScope | null;
} {
  const primarySubjects = normalizeKeywords(input.subjects.slice(0, 1));
  const secondarySubjects = normalizeKeywords(input.subjects.slice(1));
  const themes = normalizeKeywords(input.themes);
  const forms = normalizeKeywords(input.forms);

  const subjectTagsText = getDimensionTagText(material, "A");
  const themeTagsText = getDimensionTagText(material, "C");
  const formTagsText = getDimensionTagText(material, "B");
  const titleText = material.title.toLowerCase();
  const sourceText = material.source.toLowerCase();
  const contentText = (material.originalContent ?? "").toLowerCase();
  const inferredCurriculum = inferMaterialCurriculum(material);
  const topicAlignment = analyzeTopicAlignment(material, input.topic);
  const knowledgeAlignment = analyzeKnowledgePointAlignment(material, knowledgeContext);

  const authorityScore =
    sourceText.includes("college board") ||
    sourceText.includes("ap central") ||
    sourceText.includes("ibo") ||
    sourceText.includes("diploma programme") ||
    sourceText.includes("教育部")
      ? 2
      : material.id.startsWith("APCED-")
        ? 2
        : 0;

  return {
    signals: {
      primarySubjectScore:
        scoreByKeywords(subjectTagsText, primarySubjects, 7) +
        scoreByKeywords(contentText, primarySubjects, 4) +
        scoreByKeywords(titleText, primarySubjects, 3),
      secondarySubjectScore:
        scoreByKeywords(subjectTagsText, secondarySubjects, 4) +
        scoreByKeywords(contentText, secondarySubjects, 3) +
        scoreByKeywords(titleText, secondarySubjects, 2),
      topicScore: topicAlignment.score,
      themeScore:
        scoreByKeywords(themeTagsText, themes, 3) +
        scoreByKeywords(contentText, themes, 2) +
        scoreByKeywords(titleText, themes, 1),
      formScore:
        scoreByKeywords(formTagsText, forms, 2) +
        scoreByKeywords(contentText, forms, 2) +
        scoreByKeywords(titleText, forms, 1),
      knowledgeScore: knowledgeAlignment.score,
      sameCurriculum: Boolean(input.curriculumSystem && inferredCurriculum === input.curriculumSystem),
      genericCurriculum: inferredCurriculum === "GENERIC",
      crossCurriculum: Boolean(
        input.curriculumSystem &&
        inferredCurriculum &&
        inferredCurriculum !== "GENERIC" &&
        inferredCurriculum !== input.curriculumSystem,
      ),
      unknownCurriculum: !inferredCurriculum,
      contentLengthScore:
        contentText.trim().length >= 1200 ? 2 : contentText.trim().length >= 300 ? 1 : 0,
      recencyScore: Math.max(0, Math.min(2, (material.year - 2018) * 0.2)),
      authorityScore,
    },
    topicAlignment,
    knowledgeAlignment,
    inferredCurriculum,
  };
}

function scoreCurriculumAnchors(
  material: PblMaterial,
  input: SearchMaterialsInput,
  signals: MaterialSignals,
) {
  let score =
    signals.primarySubjectScore * 1.45 +
    signals.secondarySubjectScore * 0.35 +
    signals.topicScore * 1.35 +
    signals.themeScore * 0.75 +
    signals.formScore * 0.5 +
    signals.knowledgeScore * 1.55 +
    signals.contentLengthScore +
    signals.recencyScore +
    signals.authorityScore;

  if (signals.sameCurriculum) score += 7;
  if (signals.genericCurriculum) score += 1.5;
  if (signals.unknownCurriculum) score += 0.5;
  if (material.type === "curriculum_map") score += 4;
  if (material.type === "driving_question" && input.difficulty === "basic") score += 1.5;
  if (material.id.startsWith("APCED-") && input.curriculumSystem === "AP") score += 2.5;

  return score;
}

function scoreCrossDisciplinaryBridges(
  material: PblMaterial,
  input: SearchMaterialsInput,
  signals: MaterialSignals,
) {
  let score =
    signals.primarySubjectScore * 0.8 +
    signals.secondarySubjectScore * 1.8 +
    signals.topicScore * 0.95 +
    signals.themeScore * 1.45 +
    signals.formScore * 0.8 +
    signals.knowledgeScore * 1.1 +
    signals.contentLengthScore +
    signals.recencyScore +
    signals.authorityScore * 0.5;

  if (signals.crossCurriculum) score += 4;
  else if (signals.genericCurriculum) score += 1;
  else if (signals.sameCurriculum) score += 1.5;
  else score += 2;

  if (signals.secondarySubjectScore > 0) score += 3;
  if (material.type === "competition") score += input.difficulty === "challenge" ? 4 : 2;
  if (material.type === "pbl_case") score += 2;
  if (material.type === "curriculum_map") score += 1;

  return score;
}

function scoreProjectInspiration(
  material: PblMaterial,
  input: SearchMaterialsInput,
  signals: MaterialSignals,
) {
  let score =
    signals.primarySubjectScore * 0.6 +
    signals.secondarySubjectScore +
    signals.topicScore * 1.6 +
    signals.themeScore * 1.8 +
    signals.formScore * 1.1 +
    signals.knowledgeScore * 0.65 +
    signals.contentLengthScore +
    signals.recencyScore +
    signals.authorityScore * 0.35;

  if (signals.crossCurriculum) score += 1.5;
  else if (signals.genericCurriculum) score += 1;
  else if (signals.sameCurriculum) score += 0.5;

  if (material.type === "pbl_case") score += 5;
  if (material.type === "driving_question") score += 5;
  if (material.type === "competition") score += input.difficulty === "challenge" ? 6 : 4;
  if (material.type === "curriculum_map") score += input.difficulty === "advanced" ? 2 : 1;

  return score;
}

function hasTopicalSignal(signals: MaterialSignals) {
  return (
    signals.primarySubjectScore > 0 ||
    signals.secondarySubjectScore > 0 ||
    signals.topicScore > 0 ||
    signals.themeScore > 0 ||
    signals.formScore > 0 ||
    signals.knowledgeScore > 0
  );
}

function buildSearchHints(params: {
  material: PblMaterial;
  input: SearchMaterialsInput;
  signals: MaterialSignals;
  topicAlignment: TopicAlignment;
  knowledgeAlignment: KnowledgeAlignment;
  inferredCurriculum: PblMaterialCurriculumScope | null;
}): PblMaterialSearchHints | undefined {
  const reasons: string[] = [];

  if (params.topicAlignment.matches.length > 0) {
    reasons.push(
      `细主题命中：${params.topicAlignment.matches
        .slice(0, 3)
        .map((match) => match.name)
        .join("、")}`,
    );
  } else if (params.topicAlignment.keywordHits.length > 0) {
    reasons.push(`题目词命中：${params.topicAlignment.keywordHits.slice(0, 4).join("、")}`);
  }

  if (params.knowledgeAlignment.matches.length > 0) {
    reasons.push(
      `知识点命中：${params.knowledgeAlignment.matches
        .slice(0, 3)
        .map((match) => match.code)
        .join("、")}`,
    );
  } else if (params.knowledgeAlignment.keywordHits.length > 0) {
    reasons.push(`知识点词命中：${params.knowledgeAlignment.keywordHits.slice(0, 4).join("、")}`);
  }

  if (params.input.curriculumSystem && params.signals.sameCurriculum && params.material.type === "curriculum_map") {
    reasons.push(`${params.input.curriculumSystem} 体系课标锚点`);
  } else if (params.input.curriculumSystem && params.signals.genericCurriculum) {
    reasons.push("通用素材：允许跨体系复用");
  } else if (params.input.curriculumSystem && params.signals.crossCurriculum && params.inferredCurriculum) {
    reasons.push(`跨体系桥接：${params.inferredCurriculum}`);
  }

  if (reasons.length === 0) {
    return undefined;
  }

  return {
    topicMatches: params.topicAlignment.matches.slice(0, 3),
    knowledgeMatches: params.knowledgeAlignment.matches.slice(0, 3),
    reasonSummary: reasons.slice(0, 3),
  };
}

function scoreMaterial(
  material: PblMaterial,
  input: SearchMaterialsInput,
  knowledgeContext: RequestedKnowledgeContext,
): RankedMaterial {
  const { signals, topicAlignment, knowledgeAlignment, inferredCurriculum } = buildMaterialSignals(
    material,
    input,
    knowledgeContext,
  );
  const bucketScores = {
    curriculumAnchors: scoreCurriculumAnchors(material, input, signals),
    crossDisciplinaryBridges: scoreCrossDisciplinaryBridges(material, input, signals),
    projectInspiration: scoreProjectInspiration(material, input, signals),
  } satisfies Record<PblMaterialBucketKey, number>;

  return {
    material,
    signals,
    bucketScores,
    searchHints: buildSearchHints({
      material,
      input,
      signals,
      topicAlignment,
      knowledgeAlignment,
      inferredCurriculum,
    }),
    overallScore:
      Math.max(
        bucketScores.curriculumAnchors,
        bucketScores.crossDisciplinaryBridges,
        bucketScores.projectInspiration,
      ) + signals.authorityScore * 0.25,
  };
}

function dedupeRanked(entries: RankedMaterial[]) {
  const deduped: RankedMaterial[] = [];
  const seenKeys = new Set<string>();

  entries.forEach((entry) => {
    const key = materialDedupKey(entry.material);
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    deduped.push(entry);
  });

  return deduped;
}

function selectBucketCandidates(entries: RankedMaterial[], bucket: PblMaterialBucketKey) {
  return entries.filter((entry) => {
    if (!hasTopicalSignal(entry.signals)) return false;

    if (bucket === "curriculumAnchors") {
      return (
        entry.bucketScores.curriculumAnchors > 0 &&
        (entry.signals.primarySubjectScore > 0 || entry.signals.knowledgeScore > 0 || entry.signals.topicScore > 0)
      );
    }

    if (bucket === "crossDisciplinaryBridges") {
      return (
        entry.bucketScores.crossDisciplinaryBridges > 0 &&
        (entry.signals.secondarySubjectScore > 0 ||
          entry.signals.crossCurriculum ||
          (entry.signals.themeScore > 0 && entry.signals.knowledgeScore > 0))
      );
    }

    return (
      entry.bucketScores.projectInspiration > 0 &&
      (entry.signals.themeScore > 0 ||
        entry.signals.formScore > 0 ||
        entry.signals.primarySubjectScore > 0 ||
        entry.signals.secondarySubjectScore > 0)
    );
  });
}

function resolveBucketQuotas(input: SearchMaterialsInput) {
  const hasSecondarySubjects = normalizeKeywords(input.subjects.slice(1)).length > 0;
  const hasKnowledgePoints = (input.knowledgePoints?.length ?? 0) > 0;

  return {
    curriculumAnchors: hasKnowledgePoints ? 5 : 4,
    crossDisciplinaryBridges: hasSecondarySubjects ? 4 : 3,
    projectInspiration: 4,
  } satisfies Record<PblMaterialBucketKey, number>;
}

function pickFromBucket(
  entries: RankedMaterial[],
  quota: number,
  usedKeys: Set<string>,
) {
  const selected: RankedMaterial[] = [];

  for (const entry of entries) {
    if (selected.length >= quota) break;
    const key = materialDedupKey(entry.material);
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    selected.push(entry);
  }

  return selected;
}

function interleaveBuckets(
  bucketEntries: Record<PblMaterialBucketKey, RankedMaterial[]>,
  ranked: RankedMaterial[],
  limit = 12,
) {
  const merged: RankedMaterial[] = [];
  const usedKeys = new Set<string>();
  const cursors = {
    curriculumAnchors: 0,
    crossDisciplinaryBridges: 0,
    projectInspiration: 0,
  } satisfies Record<PblMaterialBucketKey, number>;

  while (merged.length < limit) {
    let madeProgress = false;

    for (const bucket of BUCKET_ORDER) {
      const current = bucketEntries[bucket];
      while (cursors[bucket] < current.length) {
        const candidate = current[cursors[bucket]];
        cursors[bucket] += 1;
        const key = materialDedupKey(candidate.material);
        if (usedKeys.has(key)) continue;
        usedKeys.add(key);
        merged.push(candidate);
        madeProgress = true;
        break;
      }

      if (merged.length >= limit) break;
    }

    if (!madeProgress) break;
  }

  if (merged.length < limit) {
    for (const entry of ranked) {
      if (merged.length >= limit) break;
      const key = materialDedupKey(entry.material);
      if (usedKeys.has(key)) continue;
      usedKeys.add(key);
      merged.push(entry);
    }
  }

  return merged.slice(0, limit);
}

function buildAnnotatedMaterialMap(entries: RankedMaterial[]) {
  return new Map(
    entries.map((entry) => [
      entry.material.id,
      entry.searchHints
        ? {
            ...entry.material,
            searchHints: entry.searchHints,
          }
        : entry.material,
    ]),
  );
}

function resolveAnnotatedMaterial(
  entry: RankedMaterial,
  annotatedById: Map<string, PblMaterial>,
) {
  return annotatedById.get(entry.material.id) ?? entry.material;
}

function buildBuckets(
  entries: Record<PblMaterialBucketKey, RankedMaterial[]>,
  annotatedById: Map<string, PblMaterial>,
): PblMaterialSearchBucket[] {
  return BUCKET_ORDER.map((bucket) => ({
    key: bucket,
    label: BUCKET_META[bucket].label,
    purpose: BUCKET_META[bucket].purpose,
    materials: entries[bucket].map((entry) => resolveAnnotatedMaterial(entry, annotatedById)),
  }));
}

export async function searchMaterialsWithBuckets(
  input: SearchMaterialsInput,
): Promise<PblMaterialSearchResult> {
  const [allMaterials, knowledgeContext] = await Promise.all([
    loadPublicMaterials(),
    buildRequestedKnowledgeContext({
      knowledgePointInputs: input.knowledgePoints ?? [],
      curriculumSystem: input.curriculumSystem,
    }),
  ]);
  const materials = input.curriculumSystem
    ? allMaterials.filter((material) => isCurriculumEligible(material, input.curriculumSystem))
    : allMaterials;

  if (materials.length === 0) {
    return {
      materials: [],
      buckets: buildBuckets(
        {
          curriculumAnchors: [],
          crossDisciplinaryBridges: [],
          projectInspiration: [],
        },
        new Map(),
      ),
    };
  }

  const ranked = dedupeRanked(
    materials
      .map((material) => scoreMaterial(material, input, knowledgeContext))
      .sort((a, b) => b.overallScore - a.overallScore || b.material.year - a.material.year),
  );

  const relevant = ranked.filter((entry) => {
    if (entry.overallScore <= 0) return false;
    if (hasTopicalSignal(entry.signals)) return true;
    return (
      entry.signals.sameCurriculum &&
      entry.material.type === "curriculum_map" &&
      (entry.signals.primarySubjectScore > 0 || entry.signals.knowledgeScore > 0 || entry.signals.topicScore > 0)
    );
  });

  const baseEntries = relevant.length > 0 ? relevant : ranked;
  const quotas = resolveBucketQuotas(input);
  const usedKeys = new Set<string>();

  const selectedByBucket = {
    curriculumAnchors: pickFromBucket(
      selectBucketCandidates(baseEntries, "curriculumAnchors").sort(
        (a, b) =>
          b.bucketScores.curriculumAnchors - a.bucketScores.curriculumAnchors || b.material.year - a.material.year,
      ),
      quotas.curriculumAnchors,
      usedKeys,
    ),
    crossDisciplinaryBridges: pickFromBucket(
      selectBucketCandidates(baseEntries, "crossDisciplinaryBridges").sort(
        (a, b) =>
          b.bucketScores.crossDisciplinaryBridges - a.bucketScores.crossDisciplinaryBridges ||
          b.material.year - a.material.year,
      ),
      quotas.crossDisciplinaryBridges,
      usedKeys,
    ),
    projectInspiration: pickFromBucket(
      selectBucketCandidates(baseEntries, "projectInspiration").sort(
        (a, b) =>
          b.bucketScores.projectInspiration - a.bucketScores.projectInspiration ||
          b.material.year - a.material.year,
      ),
      quotas.projectInspiration,
      usedKeys,
    ),
  } satisfies Record<PblMaterialBucketKey, RankedMaterial[]>;

  const mergedEntries = interleaveBuckets(selectedByBucket, baseEntries);
  const annotatedById = buildAnnotatedMaterialMap(
    dedupeRanked([
      ...mergedEntries,
      ...selectedByBucket.curriculumAnchors,
      ...selectedByBucket.crossDisciplinaryBridges,
      ...selectedByBucket.projectInspiration,
    ]),
  );
  const materialsInMergedOrder = mergedEntries.map((entry) => resolveAnnotatedMaterial(entry, annotatedById));

  return {
    materials: materialsInMergedOrder,
    buckets: buildBuckets(selectedByBucket, annotatedById),
  };
}

export async function searchMaterials(input: SearchMaterialsInput) {
  const result = await searchMaterialsWithBuckets(input);
  return result.materials;
}
