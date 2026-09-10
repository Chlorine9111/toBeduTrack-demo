/**
 * Detect subject category from course name/code for subject-specific prompt loading.
 */

export type SubjectCategory =
  | "math"
  | "english"
  | "history"
  | "science"
  | "economics"
  | "psychology"
  | "computer-science";

const SUBJECT_PATTERNS: Array<{ category: SubjectCategory; pattern: RegExp }> = [
  {
    category: "math",
    pattern: /(calculus|statistics|precalculus|math|数学|微积分|统计|代数|几何)/i,
  },
  {
    category: "english",
    pattern: /(english|language|literature|writing|composition|ela|英语|写作|文学)/i,
  },
  {
    category: "economics",
    pattern: /(economics|macroeconomics|microeconomics|经济|宏观|微观)/i,
  },
  {
    category: "history",
    pattern: /(history|government|geography|人文地理|历史|政治|政府)/i,
  },
  {
    category: "psychology",
    pattern: /(psychology|psychological|psych|心理学)/i,
  },
  {
    category: "computer-science",
    pattern: /(computer[-\s]*science|computing|programming|algorithm|algorithms|计算机|编程|算法)/i,
  },
  {
    category: "science",
    pattern: /(science|physics|chemistry|biology|environmental|科学|物理|化学|生物|环境科学)/i,
  },
];

export function detectSubjectCategory(courseName: string): SubjectCategory | null {
  if (!courseName) return null;
  for (const { category, pattern } of SUBJECT_PATTERNS) {
    if (pattern.test(courseName)) return category;
  }
  return null;
}
