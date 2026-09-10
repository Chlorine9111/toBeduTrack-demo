"use client";

import { useEffect, useMemo } from "react";
import ArtifactMarkdownView from "@/components/main/agent/ArtifactMarkdownView";
import type { AgentArtifact } from "@/components/main/agent/artifact-utils";
import { buildRubricDocumentFromMock } from "@/lib/doc-engine/adapters";
import { buildRubricHtmlFromDocument } from "@/lib/doc-engine/rubric-html";
import type {
  DocumentModel,
  RubricLevel,
  RubricRowBlock,
} from "@/lib/doc-engine/block-types";
import type { MockRubric, MockRubricDimension } from "@/types/chatflow";
import "@/lib/doc-engine/academic-print.css";
import "katex/dist/katex.min.css";

type ArtifactRubricViewProps = {
  artifact: AgentArtifact;
  onDocumentChange?: (nextDocument: DocumentModel) => void;
};

type ParsedTable = {
  headers: string[];
  rows: string[][];
};

function extractAllTables(rawContent: string): ParsedTable[] {
  const lines = rawContent.split("\n");
  const tables: ParsedTable[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      current.push(trimmed);
    } else if (current.length > 0) {
      if (current.length >= 3) tables.push(parseTableLines(current));
      current = [];
    }
  }
  if (current.length >= 3) tables.push(parseTableLines(current));
  return tables;
}

function parseTableLines(lines: string[]): ParsedTable {
  const splitRow = (line: string) =>
    line
      .split("|")
      .map((cell) => cell.trim())
      .filter((_, index, array) => index > 0 && index < array.length - 1);

  return {
    headers: splitRow(lines[0]),
    rows: lines.slice(2).map(splitRow),
  };
}

function findCol(headers: string[], keywords: string[]) {
  return headers.findIndex((header) =>
    keywords.some((keyword) =>
      header.toLowerCase().includes(keyword.toLowerCase()),
    ),
  );
}

function cleanCell(text: string) {
  return text.replace(/\*\*/g, "").replace(/`/g, "").trim();
}

function extractTitle(rawContent: string) {
  const match = rawContent.match(/^#{1,3}\s+(.+)$/m);
  return cleanCell(match?.[1] ?? "Rubric");
}

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

function sortDocumentLevels(levels: RubricLevel[]) {
  return [...levels].sort(
    (left, right) =>
      normalizeRubricScore(right, 0) - normalizeRubricScore(left, 0),
  );
}

function inferRubricUiLabels(document: DocumentModel, firstLabels: string[]) {
  const joinedText = [document.title, ...firstLabels].join(" ");
  const likelyZh = /[\u4e00-\u9fff]/.test(joinedText);
  return {
    dimension: likelyZh ? "维度" : "Dimension",
    weight: likelyZh ? "权重" : "Weight",
  };
}

function parseRubricFromDocument(document: DocumentModel | undefined): MockRubric | null {
  if (!document || document.type !== "rubric") return null;

  const rows = document.blocks.filter(
    (block): block is RubricRowBlock => block.type === "rubric-row",
  );
  if (rows.length === 0) return null;

  const firstRowLevels = sortDocumentLevels(rows[0]?.data.levels ?? []);
  const uiLabels = inferRubricUiLabels(
    document,
    firstRowLevels.map((level) => cleanCell(level.label || "")),
  );

  const dimensions: MockRubricDimension[] = rows
    .map((row, index) => {
      const sortedLevels = sortDocumentLevels(row.data.levels);
      const fallbackWeight = Math.round(100 / Math.max(rows.length, 1));
      const rawWeight =
        typeof row.data.weight === "number" && Number.isFinite(row.data.weight)
          ? row.data.weight
          : fallbackWeight;

      return {
        id: row.id || `dim-${index + 1}`,
        name: cleanCell(row.data.dimension || `维度 ${index + 1}`),
        description: `${row.data.description ?? ""}`.trim(),
        weight: rawWeight,
        levels: {
          excellent: `${sortedLevels[0]?.description ?? ""}`.trim(),
          good: `${sortedLevels[1]?.description ?? ""}`.trim(),
          passing: `${sortedLevels[2]?.description ?? ""}`.trim(),
          failing: `${sortedLevels[3]?.description ?? ""}`.trim(),
        },
      };
    })
    .filter((dimension) => dimension.name);

  if (dimensions.length === 0) return null;

  return {
    id: document.id,
    title: document.title.trim() || "Rubric",
    dimensions,
    columnLabels: {
      dimension: uiLabels.dimension,
      weight: uiLabels.weight,
      excellent: cleanCell(firstRowLevels[0]?.label || ""),
      good: cleanCell(firstRowLevels[1]?.label || ""),
      passing: cleanCell(firstRowLevels[2]?.label || ""),
      failing: cleanCell(firstRowLevels[3]?.label || ""),
    },
  };
}

function tryParseSingleTable(rawContent: string): MockRubric | null {
  const tables = extractAllTables(rawContent);
  if (tables.length === 0) return null;

  for (const table of tables) {
    const { headers, rows } = table;
    const nameCol = findCol(headers, [
      "dimension",
      "维度",
      "name",
      "criteria",
      "评分",
      "评价",
    ]);
    const excellentCol = findCol(headers, [
      "excellent",
      "优秀",
      "4分",
      "4 分",
      "exemplary",
    ]);
    const goodCol = findCol(headers, [
      "good",
      "良好",
      "3分",
      "3 分",
      "proficient",
    ]);
    const passingCol = findCol(headers, [
      "passing",
      "及格",
      "2分",
      "2 分",
      "developing",
      "basic",
    ]);
    const failingCol = findCol(headers, [
      "failing",
      "不及格",
      "1分",
      "1 分",
      "beginning",
      "inadequate",
    ]);
    const weightCol = findCol(headers, [
      "weight",
      "权重",
      "%",
      "满分",
      "分值",
      "points",
    ]);

    if (nameCol < 0) continue;
    const levelColCount = [
      excellentCol,
      goodCol,
      passingCol,
      failingCol,
    ].filter((value) => value >= 0).length;
    if (levelColCount < 2) continue;

    const dimensions = rows
      .map((cells, index) => {
        const readCell = (col: number) =>
          col >= 0 && col < cells.length ? cleanCell(cells[col]) : "";
        const weightStr = readCell(weightCol).replace(/[^0-9.]/g, "");
        const weight = weightStr
          ? Number.parseFloat(weightStr)
          : Math.round(100 / rows.length);

        return {
          id: `dim-${index + 1}`,
          name: readCell(nameCol),
          description: "",
          weight: Number.isFinite(weight)
            ? weight
            : Math.round(100 / rows.length),
          levels: {
            excellent: readCell(excellentCol),
            good: readCell(goodCol),
            passing: readCell(passingCol),
            failing: readCell(failingCol),
          },
        };
      })
      .filter((dimension) => dimension.name);

    if (dimensions.length >= 2) {
      const columnLabels: MockRubric["columnLabels"] = {};
      if (excellentCol >= 0) columnLabels.excellent = headers[excellentCol];
      if (goodCol >= 0) columnLabels.good = headers[goodCol];
      if (passingCol >= 0) columnLabels.passing = headers[passingCol];
      if (failingCol >= 0) columnLabels.failing = headers[failingCol];
      return {
        id: `rubric-${Date.now()}`,
        title: extractTitle(rawContent),
        dimensions,
        columnLabels,
      };
    }
  }

  return null;
}

function tryParseMultiTable(rawContent: string): MockRubric | null {
  const tables = extractAllTables(rawContent);
  if (tables.length < 2) return null;

  const overviewTable = tables.find((table) => {
    const nameCol = findCol(table.headers, [
      "维度",
      "dimension",
      "评分",
      "criteria",
    ]);
    const scoreCol = findCol(table.headers, [
      "满分",
      "分值",
      "points",
      "总分",
      "weight",
    ]);
    return nameCol >= 0 && scoreCol >= 0 && table.rows.length >= 2;
  });

  const detailTables = tables.filter((table) => {
    const scoreCol = findCol(table.headers, [
      "分值",
      "分数",
      "score",
      "points",
      "等级",
    ]);
    const descCol = findCol(table.headers, [
      "标准",
      "描述",
      "description",
      "criteria",
      "特征",
    ]);
    return scoreCol >= 0 && descCol >= 0 && table.rows.length >= 3;
  });

  if (detailTables.length === 0) return null;

  const headings = Array.from(rawContent.matchAll(/^#{2,4}\s+(.+)$/gm)).map(
    (match) => cleanCell(match[1]),
  );

  const dimensions: MockRubricDimension[] = [];

  for (let index = 0; index < detailTables.length; index += 1) {
    const table = detailTables[index];
    const scoreCol = findCol(table.headers, [
      "分值",
      "分数",
      "score",
      "points",
      "等级",
    ]);
    const descCol = findCol(table.headers, [
      "标准",
      "描述",
      "description",
      "criteria",
      "特征",
    ]);
    const extraCol = findCol(table.headers, [
      "关键特征",
      "关键",
      "特征",
      "feature",
    ]);

    let dimName = `维度 ${index + 1}`;
    if (overviewTable && index < overviewTable.rows.length) {
      const nameCol = findCol(overviewTable.headers, [
        "维度",
        "dimension",
        "评分",
        "criteria",
      ]);
      if (nameCol >= 0) {
        dimName = cleanCell(overviewTable.rows[index][nameCol] ?? dimName);
      }
    } else if (headings[index]) {
      dimName = headings[index];
    }

    let maxScore = 0;
    if (overviewTable && index < overviewTable.rows.length) {
      const scoreColOverview = findCol(overviewTable.headers, [
        "满分",
        "分值",
        "points",
        "weight",
      ]);
      if (scoreColOverview >= 0) {
        const value = Number.parseInt(
          overviewTable.rows[index][scoreColOverview]?.replace(/[^0-9]/g, "") ??
            "0",
          10,
        );
        if (value > 0) maxScore = value;
      }
    }

    const levelTexts = table.rows
      .map((cells) => ({
        score: Number.parseInt(
          cells[scoreCol]?.replace(/[^0-9]/g, "") ?? "0",
          10,
        ),
        description: cleanCell(cells[descCol] ?? ""),
        extra:
          extraCol >= 0 ? cleanCell(cells[extraCol] ?? "") : "",
      }))
      .filter((row) => row.description)
      .sort((left, right) => right.score - left.score)
      .map((row) =>
        row.extra ? `${row.description}（${row.extra}）` : row.description,
      );

    dimensions.push({
      id: `dim-${index + 1}`,
      name: dimName,
      description: "",
      weight:
        maxScore > 0
          ? maxScore
          : Math.round(100 / Math.max(detailTables.length, 1)),
      levels: {
        excellent: levelTexts[0] ?? "",
        good: levelTexts[1] ?? "",
        passing:
          levelTexts[2] ??
          levelTexts[Math.floor(levelTexts.length / 2)] ??
          "",
        failing: levelTexts[levelTexts.length - 1] ?? "",
      },
    });
  }

  if (dimensions.length < 2) return null;

  return {
    id: `rubric-${Date.now()}`,
    title: extractTitle(rawContent),
    dimensions,
    columnLabels: {
      excellent: "优秀",
      good: "良好",
      passing: "及格",
      failing: "不及格",
    },
  };
}

function parseRubricFromMarkdown(rawContent: string): MockRubric | null {
  return tryParseSingleTable(rawContent) ?? tryParseMultiTable(rawContent);
}

export default function ArtifactRubricView({
  artifact,
  onDocumentChange,
}: ArtifactRubricViewProps) {
  const rubric = useMemo(() => {
    return (
      parseRubricFromDocument(artifact.document) ??
      parseRubricFromMarkdown(artifact.rawContent)
    );
  }, [artifact.document, artifact.rawContent]);

  const rubricDocument = useMemo(() => {
    if (artifact.document?.type === "rubric") {
      return artifact.document;
    }
    if (!rubric) return null;
    return buildRubricDocumentFromMock(rubric);
  }, [artifact.document, rubric]);

  const rubricHtml = useMemo(() => {
    if (!rubricDocument) return null;
    return buildRubricHtmlFromDocument(rubricDocument);
  }, [rubricDocument]);

  useEffect(() => {
    if (!rubric || artifact.document?.type === "rubric") return;
    onDocumentChange?.(buildRubricDocumentFromMock(rubric));
  }, [artifact.document, onDocumentChange, rubric]);

  if (!rubric) {
    return (
      <div className="rounded-[28px] border border-divider bg-white px-6 py-5 shadow-xs">
        <ArtifactMarkdownView content={artifact.rawContent} />
      </div>
    );
  }

  if (rubricHtml) {
    return (
      <div className="rounded-[28px] border border-divider bg-white px-5 py-5 shadow-xs lg:px-6">
        <div
          className="rubric-html-view"
          dangerouslySetInnerHTML={{ __html: rubricHtml }}
        />
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-divider bg-white px-6 py-5 shadow-xs">
      <ArtifactMarkdownView content={artifact.rawContent} />
    </div>
  );
}
