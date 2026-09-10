export type KnowledgeChunkContentType = "text" | "table" | "image_ocr";

export type KnowledgeChunkStructure = {
  contentType: KnowledgeChunkContentType;
  hasTable: boolean;
  hasFigure: boolean;
  structureHints: string[];
};

function dedupeStrings(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function hasMarkdownTable(text: string) {
  return /(^|\n)\|.+\|\n\|[\s:-]+\|/m.test(text);
}

function looksLikeTableLikeText(text: string) {
  const normalized = text.trim();
  if (!normalized) return false;

  const pipeMatches = normalized.match(/\|/g) ?? [];
  if (pipeMatches.length >= 4) return true;

  const pipeLines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => (line.match(/\|/g) ?? []).length >= 2);
  if (pipeLines.length >= 2) return true;

  const whitespaceRows = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\t+|\s{2,}/).map((cell) => cell.trim()).filter(Boolean))
    .filter((cells) => cells.length >= 3);

  if (whitespaceRows.length < 2) return false;

  const firstWidth = whitespaceRows[0]?.length ?? 0;
  return whitespaceRows.filter((cells) => cells.length === firstWidth).length >= 2;
}

export function inferKnowledgeChunkStructure(params: {
  content: string;
  fileType?: string | null;
  ocrProvider?: string | null;
}): KnowledgeChunkStructure {
  const fileType = `${params.fileType ?? ""}`.toLowerCase();
  const ocrProvider = `${params.ocrProvider ?? ""}`.toLowerCase();
  const isImageOcr = fileType.startsWith("image/") || ocrProvider === "vision-image";
  const markdownTable = hasMarkdownTable(params.content);
  const tableLikeText = !markdownTable && looksLikeTableLikeText(params.content);
  const hasTable = markdownTable || tableLikeText;

  return {
    contentType: isImageOcr ? "image_ocr" : hasTable ? "table" : "text",
    hasTable,
    hasFigure: isImageOcr,
    structureHints: dedupeStrings([
      isImageOcr ? "image_ocr" : "",
      markdownTable ? "markdown_table" : "",
      tableLikeText ? "table_like_text" : "",
    ]),
  };
}
