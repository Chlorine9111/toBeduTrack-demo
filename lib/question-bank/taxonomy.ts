import { z } from "zod";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import { generateStructuredObject } from "@/lib/ai/structured-output";
import type {
  ExerciseAssessmentStyle,
  ExerciseClassificationStatus,
  ExerciseKnowledgeCluster,
  ExerciseType,
} from "@/types/exercise";

export {
  KNOWLEDGE_CLUSTER_LABELS,
  KNOWLEDGE_CLUSTER_KEYS,
  ASSESSMENT_STYLE_LABELS,
  ASSESSMENT_STYLE_KEYS,
  getKnowledgeClusterLabel,
  getAssessmentStyleLabel,
} from "@/lib/question-bank/taxonomy-labels";

import {
  ASSESSMENT_STYLE_KEYS,
  ASSESSMENT_STYLE_LABELS,
  getAssessmentStyleLabel,
  getKnowledgeClusterLabel,
  KNOWLEDGE_CLUSTER_KEYS,
} from "@/lib/question-bank/taxonomy-labels";
import {
  getSubskillDefinition,
  getSubskillsForCluster,
  QUESTION_CLUSTER_KEYS,
} from "@/lib/question-bank/subskills";

export type ExerciseTaxonomy = {
  knowledgeCluster: ExerciseKnowledgeCluster | null;
  knowledgeSubskillKey?: string | null;
  knowledgeSubskillLabel?: string | null;
  knowledgeTags: string[];
  assessmentStyle: ExerciseAssessmentStyle | null;
  assessmentTags: string[];
  classificationConfidence: number;
  classificationStatus: ExerciseClassificationStatus;
  classificationReasons: string[];
};

type HeuristicRule = {
  cluster: ExerciseKnowledgeCluster;
  keywords: string[];
  subskills: Array<{
    key: string;
    label: string;
    keywords: string[];
  }>;
};

type HeuristicCandidate = {
  cluster: ExerciseKnowledgeCluster;
  score: number;
  reasons: string[];
  subskillKey: string | null;
  subskillLabel: string | null;
  subskillScore: number;
};

type HeuristicTaxonomy = ExerciseTaxonomy & {
  candidateClusters: ExerciseKnowledgeCluster[];
};

const CLASSIFY_SCHEMA = z.object({
  knowledgeCluster: z.string().trim().min(1).max(80),
  knowledgeSubskillKey: z.string().trim().min(2).max(80).nullable().default(null),
  knowledgeSubskillLabel: z.string().trim().min(2).max(120).nullable().default(null),
  assessmentStyle: z.string().trim().min(1).max(80).nullable().default(null),
  confidence: z.number().int().min(0).max(100),
  reasons: z.array(z.string().trim().min(1).max(160)).max(5).default([]),
});

const DIRECT_HEURISTIC_CONFIDENCE = 88;
const KNOWN_CLUSTER_SET = new Set<string>(QUESTION_CLUSTER_KEYS);
const KNOWN_STYLE_SET = new Set<string>(ASSESSMENT_STYLE_KEYS);

const HEURISTIC_RULES: HeuristicRule[] = [
  {
    cluster: "derivatives",
    keywords: ["derivative", "differentiate", "dy dx", "dy/dx", "rate of change", "tangent line"],
    subskills: [
      { key: "basic_derivative", label: "基础求导", keywords: ["derivative of", "differentiate", "power rule"] },
      { key: "chain_rule", label: "链式法则", keywords: ["chain rule", "composite function"] },
      { key: "product_quotient_rule", label: "乘除法则", keywords: ["product rule", "quotient rule"] },
      { key: "implicit_differentiation", label: "隐函数求导", keywords: ["implicit", "related rates"] },
      { key: "optimization_related", label: "导数优化", keywords: ["maximize", "minimum", "optimization"] },
    ],
  },
  {
    cluster: "integrals",
    keywords: ["integral", "antiderivative", "area under", "accumulation", "definite integral"],
    subskills: [
      { key: "antiderivative", label: "原函数与不定积分", keywords: ["antiderivative", "indefinite integral"] },
      { key: "definite_integral_area", label: "定积分与面积", keywords: ["definite integral", "area under"] },
      { key: "accumulation_function", label: "累积函数", keywords: ["accumulation", "accumulation function"] },
      { key: "average_value", label: "平均值与总量", keywords: ["average value", "total amount"] },
    ],
  },
  {
    cluster: "limits",
    keywords: ["limit", "continuity", "continuous", "asymptote", "approaches"],
    subskills: [
      { key: "limit_evaluation", label: "极限求值", keywords: ["limit", "approaches"] },
      { key: "continuity_classification", label: "连续性判断", keywords: ["continuous", "continuity"] },
      { key: "infinite_limit_behavior", label: "无穷极限与渐近行为", keywords: ["asymptote", "infinite limit"] },
    ],
  },
  {
    cluster: "probability_statistics",
    keywords: ["probability", "distribution", "sample", "regression", "standard deviation", "confidence interval"],
    subskills: [
      { key: "probability_rules", label: "概率规则", keywords: ["probability", "conditional probability"] },
      { key: "distribution_reasoning", label: "分布与随机变量", keywords: ["distribution", "random variable"] },
      { key: "sampling_inference", label: "抽样与推断", keywords: ["confidence interval", "hypothesis", "sampling"] },
      { key: "regression_association", label: "回归与关联", keywords: ["regression", "correlation"] },
    ],
  },
  {
    cluster: "mechanics",
    keywords: ["force", "velocity", "acceleration", "momentum", "kinetic energy", "newton"],
    subskills: [
      { key: "kinematics", label: "运动学", keywords: ["velocity", "acceleration", "displacement"] },
      { key: "newton_laws", label: "牛顿定律", keywords: ["newton", "force"] },
      { key: "energy_work", label: "能量与功", keywords: ["work", "energy"] },
      { key: "momentum_impulse", label: "动量与冲量", keywords: ["momentum", "impulse"] },
    ],
  },
  {
    cluster: "electricity_magnetism",
    keywords: ["electric", "voltage", "current", "circuit", "magnetic", "field"],
    subskills: [
      { key: "circuit_analysis", label: "电路分析", keywords: ["circuit", "current", "resistance"] },
      { key: "electric_field_potential", label: "电场与电势", keywords: ["potential", "electric field"] },
      { key: "magnetic_force_induction", label: "磁场与感应", keywords: ["magnetic", "induction"] },
    ],
  },
  {
    cluster: "waves_thermo",
    keywords: ["wave", "wavelength", "frequency", "optics", "light", "refraction"],
    subskills: [
      { key: "wave_property", label: "波动性质", keywords: ["wave", "frequency", "wavelength"] },
      { key: "optics_reasoning", label: "光学分析", keywords: ["optics", "refraction", "reflection"] },
    ],
  },
  {
    cluster: "atomic_structure_bonding",
    keywords: [
      "ionization energy",
      "electron affinity",
      "electronegativity",
      "electron configuration",
      "quantum number",
      "quantum numbers",
      "principal quantum number",
      "photoelectron",
      "photoelectron spectroscopy",
      "mass spectra",
      "mass spectrum",
      "lewis",
      "formal charge",
      "vsepr",
      "hybridization",
      "bond order",
      "molecular geometry",
      "trigonal planar",
      "tetrahedral",
      "lone pairs",
      "orbital",
      "photon",
      "nucleus",
      "half life",
      "radioactive",
      "decays by",
    ],
    subskills: [
      { key: "electron_configuration", label: "电子排布与量子数", keywords: ["electron configuration", "quantum number", "principal quantum number", "orbital", "subshell structure"] },
      { key: "periodic_trends", label: "周期趋势与原子性质", keywords: ["ionization energy", "electronegativity", "electron affinity", "atomic radius"] },
      { key: "bonding_lewis_structure", label: "化学键与路易斯结构", keywords: ["lewis", "formal charge", "bond order"] },
      { key: "molecular_geometry", label: "分子构型与杂化", keywords: ["vsepr", "hybridization", "molecular geometry", "trigonal planar", "tetrahedral", "lone pairs"] },
      { key: "spectroscopy_photon", label: "光谱与光子性质", keywords: ["photoelectron", "spectroscopy", "mass spectra", "photon", "electromagnetic spectrum"] },
      { key: "nuclear_chemistry", label: "核化学与衰变", keywords: ["half life", "radioactive", "alpha particle", "beta particle", "decay", "activity of"] },
    ],
  },
  {
    cluster: "matter_properties",
    keywords: [
      "boiling point",
      "melting point",
      "intermolecular",
      "dipole",
      "hydrogen bonding",
      "london dispersion",
      "ideal gas",
      "gas law",
      "pressure",
      "volume",
      "temperature",
      "critical point",
      "supercritical",
      "closest packed",
      "solid",
      "liquid",
      "solution",
      "solvent",
      "dissolve",
      "hard water",
      "colligative",
      "freezing point",
      "osmotic",
    ],
    subskills: [
      { key: "intermolecular_forces", label: "分子间作用力", keywords: ["intermolecular", "dipole", "hydrogen bonding", "london dispersion"] },
      { key: "gases_and_kinetic_theory", label: "气体定律与动理论", keywords: ["ideal gas", "gas law", "pressure", "volume", "kinetic molecular theory", "average molecular velocity"] },
      { key: "solutions_and_mixtures", label: "溶液与混合物性质", keywords: ["solution", "solvent", "dissolve", "hard water", "mixture"] },
      { key: "phase_changes_and_solids", label: "相变与固体结构", keywords: ["boiling point", "melting point", "phase", "closest packed", "solid", "liquid", "critical point", "supercritical"] },
      { key: "colligative_properties", label: "依数性", keywords: ["colligative", "freezing point", "boiling point elevation", "osmotic", "vapor pressure lowering"] },
    ],
  },
  {
    cluster: "thermodynamics_kinetics",
    keywords: [
      "enthalpy",
      "heat capacity",
      "calorimetry",
      "hess",
      "entropy",
      "gibbs",
      "free energy",
      "spontaneous",
      "favorable",
      "rate law",
      "rate constant",
      "activation energy",
      "arrhenius",
      "ln(k)",
      "kinetics",
      "reaction time",
      "thermodynamic control",
      "kinetic control",
    ],
    subskills: [
      { key: "enthalpy_calorimetry", label: "焓变与量热", keywords: ["enthalpy", "heat capacity", "calorimetry", "hess", "heat transfer"] },
      { key: "entropy_gibbs", label: "熵与吉布斯自由能", keywords: ["entropy", "gibbs", "free energy", "spontaneous", "favorable"] },
      { key: "rate_laws", label: "速率定律与反应级数", keywords: ["rate law", "reaction time", "first order", "second order"] },
      { key: "activation_energy", label: "活化能与 Arrhenius", keywords: ["activation energy", "arrhenius", "ln(k)"] },
      { key: "thermo_kinetic_control", label: "热力学控制与动力学控制", keywords: ["thermodynamic control", "kinetic control"] },
    ],
  },
  {
    cluster: "chemical_reactions",
    keywords: [
      "molar mass",
      "empirical formula",
      "mole",
      "stoichiometry",
      "yield",
      "percent yield",
      "percent by mass",
      "mass percent",
      "concentration",
      "dilution",
      "titration",
      "precipitate",
      "aqueous",
      "balanced equation",
      "limiting reagent",
      "oxidation state",
      "redox",
      "consume",
      "ore",
      "complete recovery",
      "metallic copper",
      "electrolyzed",
      "deposits on the cathode",
    ],
    subskills: [
      { key: "reaction_stoichiometry", label: "反应计量", keywords: ["mole", "molar mass", "empirical formula", "stoichiometry", "percent by mass", "mass percent", "limiting reagent", "consume", "ore", "complete recovery", "metallic copper"] },
      { key: "reaction_type", label: "反应类型判断", keywords: ["precipitate", "oxidation state", "redox", "half reaction", "anode", "cathode"] },
      { key: "solution_concentration", label: "溶液浓度", keywords: ["concentration", "dilution", "titration", "molarity", "aqueous solution"] },
      { key: "reaction_energy", label: "反应能量变化", keywords: ["delta h", "enthalpy of reaction", "bond enthalpy"] },
    ],
  },
  {
    cluster: "equilibrium_acid_base",
    keywords: [
      "equilibrium",
      "ksp",
      "ka",
      "kb",
      "kw",
      "ph",
      "poh",
      "pka",
      "buffer",
      "acid",
      "base",
      "titration curve",
      "solubility",
      "electrolysis",
      "electrochemical",
      "cell potential",
      "galvanic",
      "voltaic",
      "electrolytic",
      "nernst",
      "anode",
      "cathode",
      "reduction potential",
      "oxidation potential",
    ],
    subskills: [
      { key: "chemical_equilibrium", label: "化学平衡", keywords: ["equilibrium", "equilibrium constant", "le chatelier", "reaction quotient"] },
      { key: "acid_base_reasoning", label: "酸碱分析", keywords: ["acid", "base", "ph", "poh", "pka", "buffer", "titration"] },
      { key: "electrochemistry", label: "电化学", keywords: ["electrolysis", "electrochemical", "cell potential", "galvanic", "voltaic", "electrolytic", "anode", "cathode", "nernst"] },
      { key: "solubility_equilibrium", label: "溶解平衡", keywords: ["ksp", "solubility", "precipitate", "agbr", "sparingly soluble"] },
    ],
  },
  {
    cluster: "organic_chemistry",
    keywords: [
      "alcohol",
      "ketone",
      "ester",
      "alkene",
      "alkyne",
      "cyclohexane",
      "conformation",
      "enantiomer",
      "diastereomer",
      "structural isomers",
      "functional group",
      "sn1",
      "sn2",
      "e1",
      "e2",
      "nucleophilic",
      "carbonyl",
      "resonance stabilized",
      "nitromethane",
      "ethinylestradiol",
    ],
    subskills: [
      { key: "functional_group_identification", label: "官能团识别", keywords: ["functional group", "ketone", "ester", "alcohol", "carbonyl"] },
      { key: "reaction_mechanism_pattern", label: "反应机理模式", keywords: ["sn1", "sn2", "e1", "e2", "nucleophilic", "mechanism", "best described", "tertiary alcohol", "substitution", "elimination"] },
      { key: "structure_property", label: "结构与性质", keywords: ["enantiomer", "diastereomer", "isomer", "conformation", "cyclohexane"] },
      { key: "synthesis_pathway", label: "有机合成路径", keywords: ["synthesis", "pathway", "multi step synthesis"] },
    ],
  },
  {
    cluster: "reading_writing",
    keywords: ["main idea", "author", "evidence", "rhetoric", "passage"],
    subskills: [
      { key: "main_idea_structure", label: "主旨与结构", keywords: ["main idea", "structure"] },
      { key: "evidence_inference", label: "证据与推断", keywords: ["evidence", "infer"] },
    ],
  },
  {
    cluster: "language_usage",
    keywords: ["grammar", "usage", "translation", "vocabulary", "sentence"],
    subskills: [
      { key: "grammar_usage", label: "语法运用", keywords: ["grammar", "usage"] },
      { key: "vocabulary_context", label: "词汇与语境", keywords: ["vocabulary", "context"] },
      { key: "translation_accuracy", label: "翻译准确性", keywords: ["translation"] },
    ],
  },
];

const CLASSIFY_SYSTEM_PROMPT = `你是教师题库的单题分类器。你的任务是把一道题归到稳定的“知识簇 + 细分知识点 + 考查方式”。

严格要求：
1. 不要输出课程名、学科名、AP Unit 名，也不要把 “math / chemistry / physics” 当成知识簇。
2. knowledgeCluster 必须从给定候选 key 中选择一个。
3. knowledgeSubskillKey 优先复用候选知识簇下已有 key；如果没有完全匹配，可以返回 null，并在 knowledgeSubskillLabel 中给出简洁稳定的中文标签。
4. assessmentStyle 优先从已有 key 中选择：${ASSESSMENT_STYLE_KEYS.join(", ")}。
5. OCR 提供的 subject / knowledgePoint 提示可能是噪声；当它和题干正文冲突时，必须以题干正文和选项为准。

化学题的优先规则：
- 原子结构、周期趋势、Lewis 结构、VSEPR、杂化、光谱、核衰变 -> atomic_structure_bonding
- 气体定律、分子间作用力、相变、固体结构、溶液与依数性 -> matter_properties
- 焓、熵、吉布斯自由能、速率定律、活化能、Arrhenius -> thermodynamics_kinetics
- 计量、摩尔、经验式、浓度、沉淀、反应类型 -> chemical_reactions
- 平衡、酸碱、pH、Ka/Kb/Ksp、缓冲、电化学 -> equilibrium_acid_base
- 官能团、同分异构、立体化学、构象、SN1/SN2/E1/E2 -> organic_chemistry

只输出结构化结果，不要额外解释。`;

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function normalizeClassifierText(value: string | null | undefined) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\\+/g, " ")
    .replace(/[_*`~]+/g, " ")
    .replace(/[{}[\]()]/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fa5+\-./%°\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToken(value: string | null | undefined) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "_")
    .replace(/^_+|_+$/g, "");
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

function keywordMatchesText(text: string, keyword: string) {
  const normalizedKeyword = normalizeClassifierText(keyword);
  if (!normalizedKeyword) return false;

  if (!normalizedKeyword.includes(" ") && normalizedKeyword.length <= 4) {
    return text.split(" ").includes(normalizedKeyword);
  }

  return text.includes(normalizedKeyword);
}

function countKeywordMatches(text: string, keywords: string[]) {
  const matches = keywords.filter((keyword) => keywordMatchesText(text, keyword));
  return {
    score: matches.reduce((total, keyword) => total + (keyword.length >= 8 ? 3 : 2), 0),
    matches,
  };
}

function buildClusterCatalog(clusters: ExerciseKnowledgeCluster[]) {
  return clusters
    .map((cluster) => {
      const subskills = getSubskillsForCluster(cluster)
        .map((item) => `- ${item.key} | ${item.label} | ${item.description}`)
        .join("\n");
      return `## ${cluster} | ${getKnowledgeClusterLabel(cluster)}\n${subskills || "- 暂无内置知识点"}`;
    })
    .join("\n\n");
}

function buildKnowledgeTags(cluster: string | null, subskillKey: string | null, subskillLabel: string | null) {
  return uniqueStrings([cluster, subskillKey, subskillLabel]);
}

function normalizeCluster(
  raw: string | null | undefined,
  fallback: ExerciseKnowledgeCluster = "general",
) {
  const normalized = normalizeToken(raw);
  if (!normalized) return fallback;
  if (KNOWN_CLUSTER_SET.has(normalized)) return normalized;
  return fallback;
}

function normalizeStyle(
  raw: string | null | undefined,
  fallback: ExerciseAssessmentStyle = "mixed",
) {
  const normalized = normalizeToken(raw);
  if (!normalized) return fallback;
  if (KNOWN_STYLE_SET.has(normalized)) return normalized;
  return fallback;
}

function resolveAssessmentStyle(params: {
  questionText: string;
  optionsText: string;
}) {
  const text = `${params.questionText}\n${params.optionsText}`;
  const normalized = normalizeClassifierText(text);
  if (/(graph|plot|curve|shown below|figure|diagram|arrhenius|ln\(k\)|1 \/ t)/i.test(text)) {
    return {
      style: "graph_interpretation" as const,
      reasons: ["题目包含图像或图像解释信号"],
    };
  }
  if (
    /(table|tabular|data|measured|measurement|mass data|collected|spectrum|values shown|chart)/i.test(text) ||
    normalized.includes("begin tabular")
  ) {
    return {
      style: "data_analysis" as const,
      reasons: ["题目包含表格/数据读数信号"],
    };
  }
  if (/(student|experiment|buret|buret|beaker|titration|measured|lab|electrolyzed|sample)/i.test(text)) {
    return {
      style: "experiment_analysis" as const,
      reasons: ["题目包含实验/操作场景"],
    };
  }
  if (/(how many|how much|what is the|calculate|determine|compute|closest|value of|molecular formula)/i.test(text)) {
    return {
      style: "multi_step_problem" as const,
      reasons: ["题目要求计算或多步求值"],
    };
  }
  if (/(which|must be true|best describes|correct statement|strongest|smallest|shortest|relationship)/i.test(text)) {
    return {
      style: "concept_check" as const,
      reasons: ["题目以概念辨析/判断为主"],
    };
  }
  return {
    style: "mixed" as const,
    reasons: [],
  };
}

function chooseSubskillLabel(cluster: ExerciseKnowledgeCluster, key: string | null, fallbackLabel: string | null) {
  if (!key) return cleanText(fallbackLabel) || null;
  const fallback = cleanText(fallbackLabel) || null;
  return getSubskillDefinition(cluster, key)?.label ?? fallback;
}

function buildTaxonomyResult(params: {
  cluster: ExerciseKnowledgeCluster;
  subskillKey: string | null;
  subskillLabel: string | null;
  assessmentStyle: ExerciseAssessmentStyle;
  confidence: number;
  reasons: string[];
}): ExerciseTaxonomy {
  const confidence = Math.max(0, Math.min(100, Math.round(params.confidence)));
  return {
    knowledgeCluster: params.cluster,
    knowledgeSubskillKey: params.subskillKey,
    knowledgeSubskillLabel: chooseSubskillLabel(params.cluster, params.subskillKey, params.subskillLabel),
    knowledgeTags: buildKnowledgeTags(params.cluster, params.subskillKey, params.subskillLabel),
    assessmentStyle: params.assessmentStyle,
    assessmentTags: uniqueStrings([params.assessmentStyle]),
    classificationConfidence: confidence,
    classificationStatus: confidence >= 82 && params.cluster !== "general" ? "auto_confirmed" : "needs_review",
    classificationReasons: uniqueStrings(params.reasons).slice(0, 5),
  };
}

function pickCandidateClusters(questionText: string, hintText: string, scoredClusters: HeuristicCandidate[]) {
  const topClusters = scoredClusters
    .filter((item) => item.score > 0)
    .slice(0, 4)
    .map((item) => item.cluster);

  const normalizedContext = normalizeClassifierText(`${questionText} ${hintText}`);
  if (/chem|acid|base|mole|molar|ksp|electron|orbital|organic|enthalpy|entropy|gibbs|ph|electro/.test(normalizedContext)) {
    return uniqueStrings([
      ...topClusters,
      "atomic_structure_bonding",
      "matter_properties",
      "thermodynamics_kinetics",
      "chemical_reactions",
      "equilibrium_acid_base",
      "organic_chemistry",
    ]) as ExerciseKnowledgeCluster[];
  }

  return (topClusters.length > 0 ? topClusters : [...QUESTION_CLUSTER_KEYS]) as ExerciseKnowledgeCluster[];
}

export function inferExerciseTaxonomyHeuristically(params: {
  questionText: string;
  responseFormat?: ExerciseType | null;
  sourceKnowledgePoint?: string | null;
  subjectHint?: string | null;
  optionsText?: string | null;
}): HeuristicTaxonomy {
  const questionText = cleanText(params.questionText);
  const optionsText = cleanText(params.optionsText);
  const trustedHint = cleanText(params.subjectHint);
  const trustedKnowledgePoint = cleanText(params.sourceKnowledgePoint);
  const normalizedQuestion = normalizeClassifierText(questionText);
  const normalizedOptions = normalizeClassifierText(optionsText);
  const normalizedHint = normalizeClassifierText(
    [trustedHint, trustedKnowledgePoint]
      .filter(Boolean)
      .join(" "),
  );

  if (!questionText) {
    return {
      ...buildFallbackTaxonomy("题干为空"),
      candidateClusters: ["general"],
    };
  }

  const chemistryClusterSet = new Set<ExerciseKnowledgeCluster>([
    "atomic_structure_bonding",
    "matter_properties",
    "thermodynamics_kinetics",
    "chemical_reactions",
    "equilibrium_acid_base",
    "organic_chemistry",
  ]);
  const physicsClusterSet = new Set<ExerciseKnowledgeCluster>([
    "mechanics",
    "electricity_magnetism",
    "waves_thermo",
  ]);
  const mathClusterSet = new Set<ExerciseKnowledgeCluster>([
    "derivatives",
    "integrals",
    "limits",
    "functions_modeling",
    "algebra_equations",
    "geometry_trigonometry",
    "probability_statistics",
  ]);

  const scoredClusters: HeuristicCandidate[] = HEURISTIC_RULES.map((rule) => {
    const questionMatch = countKeywordMatches(normalizedQuestion, rule.keywords);
    const optionsMatch = countKeywordMatches(normalizedOptions, rule.keywords);
    const hintMatch = countKeywordMatches(normalizedHint, rule.keywords);
    let bestSubskillKey: string | null = null;
    let bestSubskillLabel: string | null = null;
    let bestSubskillScore = 0;
    const reasons = uniqueStrings(
      [...questionMatch.matches, ...optionsMatch.matches].slice(0, 3).map((item) => `命中知识簇关键词: ${item}`),
    );

    for (const subskill of rule.subskills) {
      const subskillQuestionMatch = countKeywordMatches(normalizedQuestion, subskill.keywords);
      const subskillOptionsMatch = countKeywordMatches(normalizedOptions, subskill.keywords);
      const subskillHintMatch = countKeywordMatches(normalizedHint, subskill.keywords);
      const totalSubskillScore =
        (subskillQuestionMatch.score * 2) +
        Math.floor(subskillOptionsMatch.score / 2) +
        Math.floor(subskillHintMatch.score / 2);
      if (totalSubskillScore > bestSubskillScore) {
        bestSubskillScore = totalSubskillScore;
        bestSubskillKey = subskill.key;
        bestSubskillLabel = subskill.label;
      }
    }

    let courseHintBoost = 0;
    if (/ap chemistry|chemistry|化学/.test(normalizedHint) && chemistryClusterSet.has(rule.cluster)) {
      courseHintBoost += 8;
    }
    if (/ap physics|physics|物理/.test(normalizedHint) && physicsClusterSet.has(rule.cluster)) {
      courseHintBoost += 8;
    }
    if (/calculus|math|数学|微积分/.test(normalizedHint) && mathClusterSet.has(rule.cluster)) {
      courseHintBoost += 8;
    }

    return {
      cluster: rule.cluster,
      score:
        (questionMatch.score * 2) +
        Math.floor(optionsMatch.score / 2) +
        Math.floor(hintMatch.score / 2) +
        bestSubskillScore +
        courseHintBoost,
      reasons,
      subskillKey: bestSubskillKey,
      subskillLabel: bestSubskillLabel,
      subskillScore: bestSubskillScore,
    };
  }).sort((left, right) => right.score - left.score);

  const best = scoredClusters[0] ?? {
    cluster: "general",
    score: 0,
    reasons: [],
    subskillKey: null,
    subskillLabel: null,
    subskillScore: 0,
  };
  const second = scoredClusters[1];
  const assessment = resolveAssessmentStyle({ questionText, optionsText });
  const candidateClusters = pickCandidateClusters(questionText, trustedHint, scoredClusters);

  if (best.score <= 0) {
    return {
      ...buildFallbackTaxonomy("启发式未找到稳定知识簇"),
      candidateClusters,
    };
  }

  const separation = Math.max(0, best.score - (second?.score ?? 0));
  let confidence = 56 + best.score * 3 + Math.min(12, separation * 2);
  if (best.subskillScore > 0) {
    confidence += 8;
  }
  if (assessment.style !== "mixed") {
    confidence += 4;
  }
  if (second && separation <= 2) {
    confidence -= 12;
  }

  const reasons = uniqueStrings([
    ...best.reasons,
    best.subskillKey ? `命中细分知识点: ${best.subskillLabel}` : null,
    ...assessment.reasons,
    trustedHint ? `参考课程提示: ${trustedHint}` : null,
  ]);

  return {
    ...buildTaxonomyResult({
      cluster: best.cluster,
      subskillKey: best.subskillKey,
      subskillLabel: best.subskillLabel,
      assessmentStyle: assessment.style,
      confidence,
      reasons,
    }),
    candidateClusters,
  };
}

function finalizeTaxonomyFromAi(params: {
  heuristic: HeuristicTaxonomy;
  ai: z.infer<typeof CLASSIFY_SCHEMA>;
}) {
  const fallbackCluster = params.heuristic.knowledgeCluster ?? "general";
  const cluster = normalizeCluster(params.ai.knowledgeCluster, fallbackCluster);
  const aiSubskillKey = cleanText(params.ai.knowledgeSubskillKey) || null;
  const aiSubskillLabel = cleanText(params.ai.knowledgeSubskillLabel) || null;
  const definition = getSubskillDefinition(cluster, aiSubskillKey);
  const subskillKey =
    definition?.key ??
    (aiSubskillKey && cluster === fallbackCluster ? aiSubskillKey : params.heuristic.knowledgeSubskillKey ?? null);
  const subskillLabel =
    definition?.label ??
    aiSubskillLabel ??
    params.heuristic.knowledgeSubskillLabel ??
    null;
  const assessmentStyle = normalizeStyle(
    params.ai.assessmentStyle,
    params.heuristic.assessmentStyle ?? "mixed",
  );
  const confidence = Math.max(
    params.heuristic.classificationConfidence,
    Math.round((params.heuristic.classificationConfidence * 0.42) + (params.ai.confidence * 0.58)),
  );

  return buildTaxonomyResult({
    cluster,
    subskillKey,
    subskillLabel,
    assessmentStyle,
    confidence,
    reasons: uniqueStrings([
      ...params.heuristic.classificationReasons,
      ...params.ai.reasons,
    ]),
  });
}

export async function classifyExerciseTaxonomy(params: {
  questionText: string;
  responseFormat?: ExerciseType | null;
  sourceKnowledgePoint?: string | null;
  subjectHint?: string | null;
  optionsText?: string | null;
}): Promise<ExerciseTaxonomy> {
  const questionText = cleanText(params.questionText);
  if (!questionText) {
    return buildFallbackTaxonomy("题干为空");
  }

  const heuristic = inferExerciseTaxonomyHeuristically({
    questionText,
    responseFormat: params.responseFormat ?? null,
    sourceKnowledgePoint: params.sourceKnowledgePoint ?? null,
    subjectHint: params.subjectHint ?? null,
    optionsText: params.optionsText ?? null,
  });

  if (
    heuristic.knowledgeCluster &&
    heuristic.knowledgeCluster !== "general" &&
    heuristic.classificationConfidence >= DIRECT_HEURISTIC_CONFIDENCE
  ) {
    return {
      ...heuristic,
      classificationReasons: uniqueStrings([
        ...heuristic.classificationReasons,
        "高置信启发式分类直接采用，无需额外模型修正。",
      ]),
    };
  }

  try {
    const result = await generateStructuredObject({
      model: getResolvedLanguageModelForTask("question_taxonomy"),
      schema: CLASSIFY_SCHEMA,
      systemPrompt: CLASSIFY_SYSTEM_PROMPT,
      userPrompt: [
        "请对下面题目做知识分类。",
        `作答形式：${params.responseFormat ?? "未知"}`,
        params.subjectHint ? `课程/来源提示（可能有噪声）：${cleanText(params.subjectHint)}` : "",
        params.sourceKnowledgePoint ? `OCR 知识点提示（可能有噪声）：${cleanText(params.sourceKnowledgePoint)}` : "",
        "",
        "题目正文：",
        questionText,
        params.optionsText ? `\n选项：\n${cleanText(params.optionsText)}` : "",
        "",
        `启发式初判：${heuristic.knowledgeCluster} | ${getKnowledgeClusterLabel(heuristic.knowledgeCluster)}`,
        heuristic.knowledgeSubskillLabel
          ? `启发式细分点：${heuristic.knowledgeSubskillKey ?? "candidate"} | ${heuristic.knowledgeSubskillLabel}`
          : "启发式细分点：暂无稳定结果",
        `启发式考查方式：${getAssessmentStyleLabel(heuristic.assessmentStyle)}`,
        "",
        "允许使用的知识簇与细分点：",
        buildClusterCatalog(heuristic.candidateClusters),
      ]
        .filter(Boolean)
        .join("\n"),
      temperature: 0,
      maxTokens: 700,
      maxRetries: 1,
    });

    return finalizeTaxonomyFromAi({
      heuristic,
      ai: result,
    });
  } catch (error) {
    if (heuristic.knowledgeCluster && heuristic.knowledgeCluster !== "general") {
      return {
        ...heuristic,
        classificationReasons: uniqueStrings([
          ...heuristic.classificationReasons,
          error instanceof Error && cleanText(error.message)
            ? `模型修正失败，保留启发式结果：${cleanText(error.message)}`
            : "模型修正失败，保留启发式结果",
        ]),
      };
    }
    return buildFallbackTaxonomy(
      error instanceof Error && cleanText(error.message)
        ? cleanText(error.message)
        : "分类调用失败",
    );
  }
}

export function classifyExerciseTaxonomySync(params: {
  questionText: string;
  responseFormat?: ExerciseType | null;
  sourceKnowledgePoint?: string | null;
  subjectHint?: string | null;
  optionsText?: string | null;
}): ExerciseTaxonomy {
  const heuristic = inferExerciseTaxonomyHeuristically(params);
  if (heuristic.knowledgeCluster && heuristic.knowledgeCluster !== "general") {
    return {
      ...heuristic,
      classificationReasons: uniqueStrings([
        ...heuristic.classificationReasons,
        "同步场景使用启发式分类。",
      ]),
    };
  }
  return buildFallbackTaxonomy("旧题暂未拿到稳定分类结果");
}

function buildFallbackTaxonomy(reason: string): ExerciseTaxonomy {
  return {
    knowledgeCluster: "general",
    knowledgeSubskillKey: null,
    knowledgeSubskillLabel: null,
    knowledgeTags: ["general"],
    assessmentStyle: "mixed",
    assessmentTags: ["mixed"],
    classificationConfidence: 18,
    classificationStatus: "needs_review",
    classificationReasons: [reason],
  };
}
