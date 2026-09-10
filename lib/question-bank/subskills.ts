import type { ExerciseKnowledgeCluster } from "@/types/exercise";

export type ExerciseKnowledgeSubskillDefinition = {
  key: string;
  label: string;
  description: string;
};

export const QUESTION_CLUSTER_KEYS = [
  "derivatives",
  "integrals",
  "limits",
  "functions_modeling",
  "algebra_equations",
  "geometry_trigonometry",
  "probability_statistics",
  "mechanics",
  "electricity_magnetism",
  "waves_thermo",
  "atomic_structure_bonding",
  "matter_properties",
  "thermodynamics_kinetics",
  "chemical_reactions",
  "equilibrium_acid_base",
  "organic_chemistry",
  "cell_energy",
  "genetics_evolution",
  "ecology_systems",
  "reading_writing",
  "language_usage",
  "general",
] as const satisfies readonly ExerciseKnowledgeCluster[];

export const QUESTION_BANK_SUBSKILLS: Record<
  ExerciseKnowledgeCluster,
  ExerciseKnowledgeSubskillDefinition[]
> = {
  derivatives: [
    { key: "basic_derivative", label: "基础求导", description: "直接使用基础求导规则或导数定义。" },
    { key: "chain_rule", label: "链式法则", description: "识别复合函数并使用链式法则求导。" },
    { key: "product_quotient_rule", label: "乘除法则", description: "处理乘积法则、商法则或与导数规则组合的题。" },
    { key: "implicit_differentiation", label: "隐函数求导", description: "通过隐函数关系或相关变率进行求导。" },
    { key: "graph_based_rate", label: "图像变化率", description: "从图像、表格或情境中判断导数与变化率。" },
    { key: "optimization_related", label: "导数优化", description: "利用导数处理极值、最优化或单调性问题。" },
  ],
  integrals: [
    { key: "antiderivative", label: "原函数与不定积分", description: "求原函数、不定积分或基础积分形式。" },
    { key: "definite_integral_area", label: "定积分与面积", description: "把定积分解释为面积、净变化或累计量。" },
    { key: "accumulation_function", label: "累积函数", description: "处理以积分定义的累积函数与相关性质。" },
    { key: "integral_in_context", label: "积分情境应用", description: "把积分放进真实情境、速度位移或增长变化中。" },
    { key: "average_value", label: "平均值与总量", description: "考查函数平均值、总量估计或积分解释。" },
  ],
  limits: [
    { key: "limit_evaluation", label: "极限求值", description: "直接计算或化简函数极限。" },
    { key: "continuity_classification", label: "连续性判断", description: "判断函数是否连续、可去间断或分段连续。" },
    { key: "infinite_limit_behavior", label: "无穷极限与渐近行为", description: "分析无穷远处行为、竖直/水平渐近趋势。" },
    { key: "limit_from_graph", label: "图像极限判断", description: "从图像或表格读取左右极限、函数值与连续性。" },
  ],
  functions_modeling: [
    { key: "function_representation", label: "函数表示转换", description: "在图像、表格、表达式之间切换理解函数。" },
    { key: "composition_inverse", label: "复合与反函数", description: "考查函数复合、反函数及其解释。" },
    { key: "model_interpretation", label: "模型解释", description: "根据函数模型解释参数、趋势和意义。" },
    { key: "piecewise_analysis", label: "分段函数分析", description: "分析分段函数、条件约束或定义域值域。" },
  ],
  algebra_equations: [
    { key: "equation_solving", label: "方程求解", description: "求解代数方程、方程组或等式关系。" },
    { key: "inequality_analysis", label: "不等式分析", description: "比较大小、区间判断或不等式推理。" },
    { key: "expression_manipulation", label: "代数变形", description: "因式分解、化简、恒等变形或表达式处理。" },
    { key: "sequence_pattern", label: "数列模式", description: "识别数列递推、模式或通项关系。" },
  ],
  geometry_trigonometry: [
    { key: "triangle_trigonometry", label: "三角求解", description: "利用三角比、解三角形或角边关系。" },
    { key: "unit_circle", label: "单位圆与三角函数", description: "使用单位圆、三角函数图像和周期性质。" },
    { key: "analytic_geometry", label: "解析几何", description: "通过坐标、直线、圆锥曲线处理几何关系。" },
    { key: "trig_identity", label: "三角恒等与变换", description: "进行三角恒等变换、化简或方程求解。" },
  ],
  probability_statistics: [
    { key: "descriptive_stats", label: "描述统计", description: "均值、方差、分布特征与统计图理解。" },
    { key: "probability_rules", label: "概率规则", description: "利用独立性、条件概率或组合概率求解。" },
    { key: "distribution_reasoning", label: "分布与随机变量", description: "处理离散/连续分布和随机变量含义。" },
    { key: "sampling_inference", label: "抽样与推断", description: "用抽样结果、区间或检验解释结论。" },
    { key: "regression_association", label: "回归与关联", description: "分析相关性、回归线和拟合质量。" },
  ],
  mechanics: [
    { key: "kinematics", label: "运动学", description: "速度、加速度、位移和时间关系。" },
    { key: "newton_laws", label: "牛顿定律", description: "受力分析、牛顿第二定律和系统动力学。" },
    { key: "energy_work", label: "能量与功", description: "功、动能、势能和能量守恒。" },
    { key: "momentum_impulse", label: "动量与冲量", description: "动量守恒、碰撞和冲量分析。" },
    { key: "circular_motion", label: "圆周运动", description: "向心力、周期和旋转情境。" },
  ],
  electricity_magnetism: [
    { key: "circuit_analysis", label: "电路分析", description: "电流、电压、电阻与串并联电路关系。" },
    { key: "electric_field_potential", label: "电场与电势", description: "电场线、电势差和库仑作用。" },
    { key: "magnetic_force_induction", label: "磁场与感应", description: "磁力、感应电流和法拉第定律。" },
    { key: "electromagnetic_application", label: "电磁应用", description: "在真实器件或情境中应用电磁规律。" },
  ],
  waves_thermo: [
    { key: "wave_property", label: "波动性质", description: "波长、频率、传播、干涉与衍射。" },
    { key: "optics_reasoning", label: "光学分析", description: "反射、折射、成像和光学现象解释。" },
    { key: "thermal_process", label: "热学过程", description: "温度、热量、热平衡和状态变化。" },
    { key: "gas_law_context", label: "气体定律情境", description: "理想气体关系及热学情境推理。" },
  ],
  atomic_structure_bonding: [
    { key: "electron_configuration", label: "电子排布与量子数", description: "电子构型、量子数、亚层与轨道占据。" },
    { key: "periodic_trends", label: "周期趋势与原子性质", description: "电离能、电负性、原子半径、电子亲和能等趋势判断。" },
    { key: "bonding_lewis_structure", label: "化学键与路易斯结构", description: "离子键、共价键、Lewis 结构、形式电荷与键级。" },
    { key: "molecular_geometry", label: "分子构型与杂化", description: "VSEPR、分子构型、键角、极性与杂化判断。" },
    { key: "spectroscopy_photon", label: "光谱与光子性质", description: "质谱、光电子能谱、光子能量与电磁谱相关分析。" },
    { key: "nuclear_chemistry", label: "核化学与衰变", description: "放射性衰变、核方程、半衰期与核性质计算。" },
  ],
  matter_properties: [
    { key: "intermolecular_forces", label: "分子间作用力", description: "London 力、偶极作用、氢键与沸点熔点比较。" },
    { key: "gases_and_kinetic_theory", label: "气体定律与动理论", description: "理想气体、分压、速率分布与动理论推理。" },
    { key: "solutions_and_mixtures", label: "溶液与混合物性质", description: "溶解、稀释、混合、浓度与胶体/混合物性质。" },
    { key: "phase_changes_and_solids", label: "相变与固体结构", description: "相图、熔沸点、晶体结构、固液气转化与材料结构。" },
    { key: "colligative_properties", label: "依数性", description: "沸点升高、凝固点降低、渗透压等依数性分析。" },
  ],
  thermodynamics_kinetics: [
    { key: "enthalpy_calorimetry", label: "焓变与量热", description: "热量、焓变、量热与 Hess 定律等热化学计算。" },
    { key: "entropy_gibbs", label: "熵与吉布斯自由能", description: "熵变、自发性、吉布斯自由能与热力学判据。" },
    { key: "rate_laws", label: "速率定律与反应级数", description: "速率方程、级数、浓度变化与积分速率方程。" },
    { key: "activation_energy", label: "活化能与 Arrhenius", description: "活化能、Arrhenius 图像与温度对速率的影响。" },
    { key: "thermo_kinetic_control", label: "热力学控制与动力学控制", description: "热力学控制、动力学控制与竞争路径判断。" },
  ],
  chemical_reactions: [
    { key: "reaction_stoichiometry", label: "反应计量", description: "配平、摩尔关系和产物量计算。" },
    { key: "reaction_type", label: "反应类型判断", description: "识别氧化还原、沉淀、中和等反应类型。" },
    { key: "solution_concentration", label: "溶液浓度", description: "浓度、稀释、滴定和溶液配制。" },
    { key: "reaction_energy", label: "反应能量变化", description: "焓变、放热吸热和热化学计算。" },
  ],
  equilibrium_acid_base: [
    { key: "chemical_equilibrium", label: "化学平衡", description: "平衡移动、平衡常数和勒夏特列原理。" },
    { key: "acid_base_reasoning", label: "酸碱分析", description: "酸碱强弱、pH、缓冲溶液与滴定。" },
    { key: "electrochemistry", label: "电化学", description: "原电池、电解池和电势分析。" },
    { key: "solubility_equilibrium", label: "溶解平衡", description: "溶度积、沉淀条件和离子平衡。" },
  ],
  organic_chemistry: [
    { key: "functional_group_identification", label: "官能团识别", description: "识别常见官能团、命名和性质。" },
    { key: "reaction_mechanism_pattern", label: "反应机理模式", description: "判断有机反应类型与反应趋势。" },
    { key: "structure_property", label: "结构与性质", description: "从结构推断性质、极性和反应性。" },
    { key: "synthesis_pathway", label: "有机合成路径", description: "多步合成与转化路线设计。" },
  ],
  cell_energy: [
    { key: "cell_structure_function", label: "细胞结构与功能", description: "细胞器、膜结构和功能关系。" },
    { key: "photosynthesis_respiration", label: "光合作用与呼吸作用", description: "光合作用、呼吸作用与能量转换。" },
    { key: "enzyme_regulation", label: "酶与代谢调控", description: "酶活性、代谢路径和调控机制。" },
    { key: "membrane_transport", label: "跨膜运输", description: "扩散、主动运输和渗透等过程。" },
  ],
  genetics_evolution: [
    { key: "inheritance_pattern", label: "遗传规律", description: "显隐性、连锁、概率和系谱推理。" },
    { key: "molecular_genetics", label: "分子遗传", description: "DNA、RNA、蛋白表达与突变分析。" },
    { key: "population_evolution", label: "群体进化", description: "自然选择、群体频率和进化证据。" },
    { key: "biotechnology_application", label: "生物技术应用", description: "PCR、基因工程或实验技术应用。" },
  ],
  ecology_systems: [
    { key: "population_dynamics", label: "种群动态", description: "种群变化、增长模型和限制因素。" },
    { key: "ecosystem_flow", label: "生态系统能量流动", description: "食物网、能量流动和物质循环。" },
    { key: "environmental_change", label: "环境变化影响", description: "环境因素对系统稳定性的影响。" },
    { key: "ecological_data_interpretation", label: "生态数据解读", description: "根据生态图表和数据作出判断。" },
  ],
  reading_writing: [
    { key: "main_idea_structure", label: "主旨与结构", description: "概括主旨、结构层次和作者思路。" },
    { key: "evidence_inference", label: "证据与推断", description: "根据文本证据做推断、判断或比较。" },
    { key: "rhetorical_analysis", label: "修辞与写作手法", description: "分析修辞、语气和写作策略。" },
    { key: "argument_evaluation", label: "论证评价", description: "分析论点、论据和论证有效性。" },
  ],
  language_usage: [
    { key: "grammar_usage", label: "语法运用", description: "语法结构、时态、语态和句式运用。" },
    { key: "vocabulary_context", label: "词汇与语境", description: "词义辨析、语境选择和搭配使用。" },
    { key: "translation_accuracy", label: "翻译准确性", description: "句子翻译、表达转换和语义对齐。" },
    { key: "writing_expression", label: "写作表达", description: "改写、扩写、总结和表达组织。" },
  ],
  general: [
    { key: "cross_topic_application", label: "跨主题综合", description: "需要跨多个知识点综合处理。" },
    { key: "mixed_foundation", label: "基础综合", description: "尚未出现稳定细分知识点，先归到综合类。" },
  ],
};

export function getSubskillsForCluster(cluster: ExerciseKnowledgeCluster | null | undefined) {
  if (!cluster) return [];
  return QUESTION_BANK_SUBSKILLS[cluster] ?? [];
}

export function getSubskillDefinition(
  cluster: ExerciseKnowledgeCluster | null | undefined,
  key: string | null | undefined,
) {
  if (!cluster || !key) return null;
  return getSubskillsForCluster(cluster).find((item) => item.key === key) ?? null;
}

export function getSubskillLabel(
  cluster: ExerciseKnowledgeCluster | null | undefined,
  key: string | null | undefined,
) {
  return getSubskillDefinition(cluster, key)?.label ?? null;
}
