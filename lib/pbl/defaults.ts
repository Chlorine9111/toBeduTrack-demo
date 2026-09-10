import type { PblDifficulty, PblGenerationInput } from "@/lib/pbl/types";

export const DEFAULT_PBL_INPUT: Omit<PblGenerationInput, "curriculumSystem" | "primarySubject" | "grade" | "totalPeriods"> = {
  crossSubjects: [],
  knowledgePoints: [],
  projectForms: [],
  difficulty: "advanced",
  themes: [],
  classSize: "30-45 人",
  resources: ["无特殊资源"],
  outcomes: [],
};

export function normalizeDifficulty(input: string | undefined): PblDifficulty {
  if (input === "basic" || input === "challenge") return input;
  return "advanced";
}

export function clampTotalPeriods(input: number): number {
  return Math.max(2, Math.min(60, Math.round(input)));
}

/** 兼容旧 duration 字符串，转换为近似课时数 */
export function legacyDurationToPeriods(duration: string): number {
  if (duration.includes("1-2") || duration.includes("微型")) return 4;
  if (duration.includes("3-4") || duration.includes("标准")) return 8;
  if (duration.includes("5-8") || duration.includes("深度")) return 16;
  if (duration.includes("学期")) return 32;
  return 8;
}

/** 为兼容旧表结构，将 totalPeriods 反推到历史 duration 桶值。 */
export function periodsToLegacyDuration(totalPeriods: number): string {
  const normalized = clampTotalPeriods(totalPeriods);
  if (normalized <= 4) return "1-2 周（微型项目）";
  if (normalized <= 8) return "3-4 周（标准项目）";
  if (normalized <= 16) return "5-8 周（深度项目）";
  return "学期项目";
}

export function inferGroupSetup(classSize: string): { groupSize: number; groupCount: number } {
  const mapping: Record<string, number> = {
    "15 人以下": 12,
    "15-30 人": 24,
    "30-45 人": 36,
    "45 人以上": 48,
  };

  const population = Object.entries(mapping).find(([key]) => classSize.includes(key))?.[1] ?? 36;
  const groupSize = population <= 18 ? 3 : 4;
  return {
    groupSize,
    groupCount: Math.max(1, Math.round(population / groupSize)),
  };
}

export function inferProjectForm(subject: string, forms: string[]): string {
  if (forms.length > 0) return forms[0];

  const lower = subject.toLowerCase();
  if (lower.includes("physics") || subject.includes("物理")) return "实验探究";
  if (lower.includes("chem") || subject.includes("化学")) return "实验探究";
  if (lower.includes("bio") || subject.includes("生物")) return "实验探究";
  if (lower.includes("math") || subject.includes("数学")) return "数学建模";
  if (lower.includes("history") || subject.includes("历史")) return "文献研究";
  if (lower.includes("government") || subject.includes("政治")) return "社会调研";
  if (lower.includes("english") || subject.includes("英语")) return "创意表达";
  return "数据分析";
}

export function inferTheme(themes: string[], subject: string): string {
  if (themes.length > 0) return themes[0];

  const lower = subject.toLowerCase();
  if (lower.includes("environment") || subject.includes("环境")) return "环境与生态";
  if (lower.includes("chem") || lower.includes("physics") || lower.includes("computer")) {
    return "科技与创新";
  }
  if (lower.includes("econ") || subject.includes("经济")) return "经济与商业";
  if (lower.includes("history") || subject.includes("历史")) return "文化与传承";
  return "教育与发展";
}
