/**
 * 知识簇和考察方式的标签映射。
 * 内置标签覆盖常见 AP 学科；Haiku 可自由创建新 key，
 * 未知 key 会自动转为可读标签（snake_case → 空格分词 → 首字母大写）。
 */

/** 内置知识簇标签（向后兼容） */
export const BUILT_IN_CLUSTER_LABELS: Record<string, string> = {
  derivatives: "导数与变化率",
  integrals: "积分与面积变化",
  limits: "极限与连续性",
  functions_modeling: "函数与建模",
  algebra_equations: "代数与方程",
  geometry_trigonometry: "几何与三角",
  probability_statistics: "概率与统计",
  mechanics: "运动与受力",
  electricity_magnetism: "电学与磁学",
  waves_thermo: "波动、光学与热学",
  atomic_structure_bonding: "原子结构与化学键",
  matter_properties: "物质结构、状态与性质",
  thermodynamics_kinetics: "热化学、热力学与动力学",
  chemical_reactions: "化学反应与计量",
  equilibrium_acid_base: "平衡与酸碱电化学",
  organic_chemistry: "有机化学",
  cell_energy: "细胞、代谢与能量",
  genetics_evolution: "遗传与进化",
  ecology_systems: "生态与系统",
  reading_writing: "阅读与写作",
  language_usage: "语言运用",
  general: "综合知识",
};

/** 内置考察方式标签 */
export const BUILT_IN_STYLE_LABELS: Record<string, string> = {
  concept_check: "概念辨析",
  direct_application: "直接应用",
  multi_step_problem: "多步求解",
  graph_interpretation: "图像图表解读",
  data_analysis: "数据分析",
  experiment_analysis: "实验分析",
  proof_reasoning: "证明与论证",
  error_analysis: "错因辨析",
  modeling_scenario: "情境建模",
  text_evidence: "文本证据理解",
  translation_expression: "翻译与表达",
  mixed: "综合考查",
};

// 向后兼容导出（外部代码引用这些名称）
export const KNOWLEDGE_CLUSTER_LABELS = BUILT_IN_CLUSTER_LABELS;
export const ASSESSMENT_STYLE_LABELS = BUILT_IN_STYLE_LABELS;

/** 内置 key 列表（用于 Haiku prompt 提供参考） */
export const KNOWLEDGE_CLUSTER_KEYS = Object.keys(BUILT_IN_CLUSTER_LABELS);
export const ASSESSMENT_STYLE_KEYS = Object.keys(BUILT_IN_STYLE_LABELS);

/** snake_case → 可读标签（如 "microeconomics" → "Microeconomics"） */
function humanize(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getKnowledgeClusterLabel(
  value: string | null | undefined,
): string {
  if (!value) return "未分类";
  return BUILT_IN_CLUSTER_LABELS[value] ?? humanize(value);
}

export function getAssessmentStyleLabel(
  value: string | null | undefined,
): string {
  if (!value) return "未分类";
  return BUILT_IN_STYLE_LABELS[value] ?? humanize(value);
}
