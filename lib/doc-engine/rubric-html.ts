import { marked } from "marked";
import type {
  DocumentModel,
  RubricLevel,
  RubricRowBlock,
} from "@/lib/doc-engine/block-types";
import { normalizeMathHtml } from "@/lib/doc-engine/math-core";

const DEFAULT_LEVEL_LABELS = ["优秀", "良好", "达标", "待提升"];

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanInlineText(text: string) {
  return text.replace(/\*\*/g, "").replace(/`/g, "").trim();
}

function normalizeScore(level: RubricLevel, fallbackIndex: number) {
  if (typeof level.score === "number" && Number.isFinite(level.score)) {
    return level.score;
  }
  if (typeof level.score === "string") {
    const parsed = Number.parseFloat(level.score.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return Math.max(1, 4 - fallbackIndex);
}

function sortLevels(levels: RubricLevel[]) {
  return [...levels].sort(
    (left, right) =>
      normalizeScore(right, 0) - normalizeScore(left, 0),
  );
}

function renderMarkdownCell(content: string) {
  const trimmed = content.trim();
  if (!trimmed) {
    return "<p>—</p>";
  }

  return normalizeMathHtml(
    marked.parse(escapeHtml(trimmed), {
      gfm: true,
      breaks: true,
    }) as string,
  );
}

function formatWeight(weight: number | null | undefined, totalWeight: number) {
  if (typeof weight !== "number" || !Number.isFinite(weight)) return "—";
  if (totalWeight >= 95 && totalWeight <= 105) {
    return `${Math.round(weight)}%`;
  }
  if (weight > 0 && weight <= 1) {
    return `${Math.round(weight * 100)}%`;
  }
  return Number.isInteger(weight) ? `${weight}` : weight.toFixed(1);
}

function inferLabels(rows: RubricRowBlock[]) {
  const firstLevels = sortLevels(rows[0]?.data.levels ?? []);
  const joinedText = [
    rows[0]?.data.dimension ?? "",
    ...firstLevels.map((level) => level.label),
  ].join(" ");
  const isZh = /[\u4e00-\u9fff]/.test(joinedText);

  return {
    criteria: isZh ? "评分维度 / 准则" : "Criteria / Dimension",
    weight: isZh ? "权重" : "Weight",
    levels: firstLevels.map((level, index) =>
      cleanInlineText(level.label || DEFAULT_LEVEL_LABELS[index] || `Level ${index + 1}`),
    ),
  };
}

function buildSubtitle(document: DocumentModel) {
  return [document.meta.courseName, document.meta.unitName]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" · ");
}

export function buildRubricHtmlFromDocument(document: DocumentModel) {
  if (document.type !== "rubric") return null;

  const rows = document.blocks.filter(
    (block): block is RubricRowBlock => block.type === "rubric-row",
  );
  if (rows.length === 0) return null;

  const labels = inferLabels(rows);
  const totalWeight = rows.reduce((sum, row) => {
    const weight = row.data.weight;
    return sum + (typeof weight === "number" && Number.isFinite(weight) ? weight : 0);
  }, 0);

  const matrixRows = rows
    .map((row, rowIndex) => {
      const sortedLevels = sortLevels(row.data.levels);
      const levelCells = Array.from({ length: 4 }, (_, index) => {
        const content = sortedLevels[index]?.description ?? "";
        return `<td>${renderMarkdownCell(content)}</td>`;
      }).join("");

      const dimensionHtml = [
        `<strong>${escapeHtml(cleanInlineText(row.data.dimension || `维度 ${rowIndex + 1}`))}</strong>`,
        row.data.description?.trim()
          ? `<p>${escapeHtml(row.data.description.trim())}</p>`
          : "",
      ]
        .filter(Boolean)
        .join("");

      return [
        "<tr>",
        `<td>${dimensionHtml}</td>`,
        `<td>${escapeHtml(formatWeight(row.data.weight, totalWeight))}</td>`,
        levelCells,
        "</tr>",
      ].join("");
    })
    .join("");

  const subtitle = buildSubtitle(document);
  const title = escapeHtml(document.title.trim() || "Rubric");

  return normalizeMathHtml([
    '<article data-doc-type="rubric">',
    '<section data-section="header">',
    "<p>Academic Rubric</p>",
    `<h1>${title}</h1>`,
    subtitle ? `<p>${escapeHtml(subtitle)}</p>` : "",
    `<p>评分矩阵共 ${rows.length} 个维度，采用单表阅读视图，便于教师统一查看所有评分准则。</p>`,
    "</section>",
    '<section data-section="rubric-matrix">',
    '<table data-rubric="true">',
    "<thead>",
    "<tr>",
    `<th>${escapeHtml(labels.criteria)}</th>`,
    `<th>${escapeHtml(labels.weight)}</th>`,
    ...labels.levels.map((label) => `<th>${escapeHtml(label)}</th>`),
    "</tr>",
    "</thead>",
    `<tbody>${matrixRows}</tbody>`,
    "</table>",
    "</section>",
    "</article>",
  ].join(""));
}
