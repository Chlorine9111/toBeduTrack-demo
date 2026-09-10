import type {
  DocumentModel,
  RubricLevel,
  RubricRowBlock,
} from "@/lib/doc-engine/block-types";
import type { RubricData } from "@/lib/pdf/types";

function normalizeRubricScore(level: RubricLevel, fallbackIndex: number) {
  if (typeof level.score === "number" && Number.isFinite(level.score)) {
    return level.score;
  }

  if (typeof level.score === "string") {
    const parsed = Number.parseFloat(level.score.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return Math.max(1, 4 - fallbackIndex);
}

function sortRubricLevels(levels: RubricLevel[]) {
  return [...levels].sort(
    (left, right) =>
      normalizeRubricScore(right, 0) - normalizeRubricScore(left, 0),
  );
}

function buildCriterionText(level: RubricLevel, fallbackIndex: number) {
  const score = normalizeRubricScore(level, fallbackIndex);
  const label = `${level.label ?? ""}`.trim();
  const description = `${level.description ?? ""}`.trim();

  if (!label) {
    return {
      text: description,
      points: score,
    };
  }

  return {
    text: description ? `${label}（${score}分）：${description}` : `${label}（${score}分）`,
    points: score,
  };
}

export function buildRubricPdfDataFromDocument(document: DocumentModel): RubricData {
  if (document.type !== "rubric") {
    throw new Error("当前文档不是 Rubric，无法导出评分量表 PDF。");
  }

  const rows = document.blocks.filter(
    (block): block is RubricRowBlock => block.type === "rubric-row",
  );
  if (rows.length === 0) {
    throw new Error("Rubric 缺少评分维度，无法导出 PDF。");
  }

  const parts = rows.map((row) => {
    const sortedLevels = sortRubricLevels(row.data.levels);
    const criteria = sortedLevels.map((level, index) =>
      buildCriterionText(level, index),
    );
    const derivedPoints = criteria.reduce(
      (max, item) => Math.max(max, item.points),
      0,
    );
    const rawWeight =
      typeof row.data.weight === "number" && Number.isFinite(row.data.weight)
        ? row.data.weight
        : derivedPoints;

    return {
      label: `${row.data.dimension ?? ""}`.trim() || "评分维度",
      description: `${row.data.description ?? ""}`.trim(),
      points: rawWeight,
      criteria,
    };
  });

  const totalPoints = parts.reduce((sum, part) => sum + part.points, 0);

  return {
    title: document.title,
    subtitle: "评分标准",
    courseName: document.meta.courseName ?? undefined,
    unitTitle: document.meta.unitName ?? null,
    notes: [
      "评分以最符合的等级描述为准。",
      "如需细化评分，可在单个维度中补充说明。",
    ],
    totalPoints,
    parts,
  };
}
