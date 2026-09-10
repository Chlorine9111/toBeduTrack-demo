import type { RubricDetailPayload } from "@/types/rubric";
import type { RubricData } from "@/lib/pdf/types";

const levelLabelMap: Record<string, string> = {
  excellent: "优秀",
  good: "良好",
  passing: "及格",
  failing: "待改进",
};

export function mapRubricDetailToPdf(detail: RubricDetailPayload): RubricData {
  const parts = detail.dimensions.map((dimension) => {
    const levels = dimension.levels.slice().sort((a, b) => b.score - a.score);
    const maxScore = levels.length > 0 ? Math.max(...levels.map((level) => level.score)) : 0;
    return {
      label: dimension.name,
      description: dimension.description,
      points: maxScore,
      criteria: levels.map((level) => ({
        text: `${levelLabelMap[level.level] ?? level.level}（${level.score}分）：${level.description}`,
        points: level.score,
      })),
    };
  });

  const totalPoints = parts.reduce((sum, part) => sum + part.points, 0);

  return {
    title: detail.title,
    subtitle: "评分标准",
    courseName: detail.course.name ? `${detail.course.name} (${detail.course.code})` : detail.course.code,
    unitTitle: detail.unit?.title ?? null,
    notes: [
      "评分应以最符合的等级描述为准。",
      "总分为各维度最高分之和。",
      "如需细化评分，请在每个维度内补充说明。",
    ],
    totalPoints,
    parts,
  };
}
