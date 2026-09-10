export interface DocumentChunk {
  index: number;
  content: string;
  heading?: string;
  pageRange?: string;
  pageStart?: number;
  pageEnd?: number;
  charOffset: number;
  tokenEstimate: number;
}

export interface ChunkOptions {
  maxChunkSize?: number;
  minChunkSize?: number;
  overlap?: number;
  splitBy?: "heading" | "paragraph" | "fixed";
}

type RawChunk = {
  content: string;
  heading?: string;
  charOffset: number;
};

type ParagraphEntry = {
  text: string;
  offset: number;
};

const DEFAULT_MAX_CHUNK_SIZE = 800;
const DEFAULT_MIN_CHUNK_SIZE = 100;
const DEFAULT_OVERLAP = 100;

function normalizeMarkdown(markdown: string) {
  return markdown
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function hasMarkdownTable(text: string) {
  return /(^|\n)\|.+\|\n\|[\s:-]+\|/m.test(text);
}

function startsWithMarkdownHeading(text: string) {
  return /^#{1,6}\s+/m.test(text.trim());
}

function buildChunkContent(heading: string | undefined, body: string) {
  const normalizedBody = body.trim();
  if (!heading) return normalizedBody;
  if (!normalizedBody) return `## ${heading}`;
  if (/^#{1,6}\s/.test(normalizedBody)) return normalizedBody;
  return `## ${heading}\n\n${normalizedBody}`;
}

function splitParagraphs(text: string): ParagraphEntry[] {
  if (!text.trim()) return [];

  const parts = text.split(/\n{2,}/);
  const result: ParagraphEntry[] = [];
  let cursor = 0;

  for (const part of parts) {
    const normalized = part.trim();
    if (!normalized) continue;
    const foundAt = text.indexOf(part, cursor);
    const offset = foundAt >= 0 ? foundAt : cursor;
    cursor = Math.max(offset + part.length, cursor);
    result.push({ text: normalized, offset });
  }

  return result;
}

function splitFixedEntries(text: string, startOffset: number, maxChunkSize: number): ParagraphEntry[] {
  if (!text.trim()) return [];

  const entries: ParagraphEntry[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    let end = Math.min(text.length, cursor + maxChunkSize);

    if (end < text.length) {
      const window = text.slice(cursor, end);
      const candidateIndexes = [
        window.lastIndexOf("\n\n"),
        window.lastIndexOf("。"),
        window.lastIndexOf("！"),
        window.lastIndexOf("？"),
        window.lastIndexOf("."),
        window.lastIndexOf("!"),
        window.lastIndexOf("?"),
      ].filter((value) => value >= 0);

      const boundary = candidateIndexes.length > 0 ? Math.max(...candidateIndexes) : -1;
      if (boundary >= Math.floor(maxChunkSize * 0.5)) {
        end = cursor + boundary + 1;
      }
    }

    const piece = text.slice(cursor, end).trim();
    if (piece) {
      entries.push({
        text: piece,
        offset: startOffset + cursor,
      });
    }

    cursor = end;
    while (cursor < text.length && /\s/.test(text[cursor] ?? "")) {
      cursor += 1;
    }
  }

  return entries;
}

function mergeTinyChunks(chunks: RawChunk[], minChunkSize: number, maxChunkSize: number) {
  if (chunks.length <= 1) return chunks;

  const merged: RawChunk[] = [];

  for (const chunk of chunks) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.heading === chunk.heading &&
      chunk.content.length < minChunkSize &&
      previous.content.length + 2 + chunk.content.length <= maxChunkSize &&
      !hasMarkdownTable(previous.content) &&
      !hasMarkdownTable(chunk.content)
    ) {
      previous.content = `${previous.content}\n\n${chunk.content}`.trim();
      continue;
    }

    merged.push({ ...chunk });
  }

  return merged;
}

function packEntries(params: {
  entries: ParagraphEntry[];
  heading?: string;
  sectionOffset: number;
  maxChunkSize: number;
  minChunkSize: number;
}): RawChunk[] {
  const { entries, heading, sectionOffset, maxChunkSize, minChunkSize } = params;
  if (entries.length === 0) {
    const content = buildChunkContent(heading, "");
    return content ? [{ content, heading, charOffset: sectionOffset }] : [];
  }

  const chunks: RawChunk[] = [];
  const headingOverhead = heading ? heading.length + 6 : 0;
  const fixedEntryMax = Math.max(160, maxChunkSize - headingOverhead);

  let currentParts: string[] = [];
  let currentOffset = sectionOffset;

  const flush = () => {
    if (currentParts.length === 0) return;
    const body = currentParts.join("\n\n").trim();
    const content = buildChunkContent(heading, body);
    if (content) {
      chunks.push({
        content,
        heading,
        charOffset: currentOffset,
      });
    }
    currentParts = [];
  };

  for (const entry of entries) {
    const candidateParts = currentParts.length > 0 ? [...currentParts, entry.text] : [entry.text];
    const candidateContent = buildChunkContent(heading, candidateParts.join("\n\n"));

    if (candidateContent.length <= maxChunkSize) {
      if (currentParts.length === 0) {
        currentOffset = sectionOffset + entry.offset;
      }
      currentParts = candidateParts;
      continue;
    }

    if (currentParts.length > 0) {
      flush();
    }

    const singleContent = buildChunkContent(heading, entry.text);
    if (singleContent.length <= maxChunkSize) {
      currentParts = [entry.text];
      currentOffset = sectionOffset + entry.offset;
      continue;
    }

    const splitEntries = splitFixedEntries(entry.text, entry.offset, fixedEntryMax);
    for (const splitEntry of splitEntries) {
      const content = buildChunkContent(heading, splitEntry.text);
      if (!content) continue;
      chunks.push({
        content,
        heading,
        charOffset: sectionOffset + splitEntry.offset,
      });
    }
  }

  flush();

  return mergeTinyChunks(chunks, minChunkSize, maxChunkSize);
}

function chunkByParagraph(markdown: string, options: Required<ChunkOptions>): RawChunk[] {
  const entries = splitParagraphs(markdown);
  if (entries.length === 0) return [];
  return packEntries({
    entries,
    sectionOffset: 0,
    maxChunkSize: options.maxChunkSize,
    minChunkSize: options.minChunkSize,
  });
}

function chunkByFixed(markdown: string, options: Required<ChunkOptions>): RawChunk[] {
  const entries = splitFixedEntries(markdown, 0, options.maxChunkSize);
  return packEntries({
    entries,
    sectionOffset: 0,
    maxChunkSize: options.maxChunkSize,
    minChunkSize: options.minChunkSize,
  });
}

function chunkByHeading(markdown: string, options: Required<ChunkOptions>): RawChunk[] {
  const headingMatches = Array.from(markdown.matchAll(/^#{1,3}\s+(.+)$/gm));
  if (headingMatches.length === 0) {
    return chunkByParagraph(markdown, options);
  }

  const chunks: RawChunk[] = [];

  for (let index = 0; index < headingMatches.length; index += 1) {
    const match = headingMatches[index];
    const sectionStart = match.index ?? 0;
    const sectionEnd = headingMatches[index + 1]?.index ?? markdown.length;
    const section = markdown.slice(sectionStart, sectionEnd).trim();
    if (!section) continue;

    const heading = match[1]?.trim() || undefined;
    const bodyStart = section.indexOf("\n");
    const body = bodyStart >= 0 ? section.slice(bodyStart + 1).trim() : "";

    const sectionChunks = packEntries({
      entries: splitParagraphs(body),
      heading,
      sectionOffset: sectionStart,
      maxChunkSize: options.maxChunkSize,
      minChunkSize: options.minChunkSize,
    });

    if (sectionChunks.length > 0) {
      chunks.push(...sectionChunks);
      continue;
    }

    const content = buildChunkContent(heading, body);
    if (!content) continue;
    chunks.push({
      content,
      heading,
      charOffset: sectionStart,
    });
  }

  return mergeTinyChunks(chunks, options.minChunkSize, options.maxChunkSize);
}

function applyOverlap(chunks: RawChunk[], overlap: number): DocumentChunk[] {
  return chunks.map((chunk, index) => {
    const previous = index > 0 ? chunks[index - 1] : null;
    const overlapText = overlap > 0 && previous ? previous.content.slice(-overlap).trim() : "";
    const shouldSkipOverlap =
      !previous ||
      !overlapText ||
      Boolean(chunk.heading) ||
      hasMarkdownTable(previous.content) ||
      hasMarkdownTable(chunk.content) ||
      startsWithMarkdownHeading(chunk.content);

    let content = chunk.content.trim();
    let charOffset = chunk.charOffset;

    if (!shouldSkipOverlap && !content.startsWith(overlapText)) {
      content = `${overlapText}\n${content}`.trim();
      charOffset = Math.max(0, chunk.charOffset - overlapText.length);
    }

    return {
      index,
      content,
      heading: chunk.heading,
      charOffset,
      tokenEstimate: estimateTokens(content),
    };
  });
}

function autoSelectStrategy(markdown: string): "heading" | "paragraph" | "fixed" {
  const headingCount = (markdown.match(/^#{1,3}\s/gm) || []).length;
  if (headingCount >= 3) return "heading";

  const paragraphCount = (markdown.match(/\n\n/g) || []).length;
  if (paragraphCount >= 5) return "paragraph";

  return "fixed";
}

export function chunkMarkdown(markdown: string, options: ChunkOptions = {}): DocumentChunk[] {
  const normalized = normalizeMarkdown(markdown);
  if (!normalized) return [];

  const resolved: Required<ChunkOptions> = {
    maxChunkSize: options.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE,
    minChunkSize: options.minChunkSize ?? DEFAULT_MIN_CHUNK_SIZE,
    overlap: options.overlap ?? DEFAULT_OVERLAP,
    splitBy: options.splitBy ?? autoSelectStrategy(normalized),
  };

  const baseChunks = (() => {
    switch (resolved.splitBy) {
      case "heading":
        return chunkByHeading(normalized, resolved);
      case "paragraph":
        return chunkByParagraph(normalized, resolved);
      case "fixed":
      default:
        return chunkByFixed(normalized, resolved);
    }
  })()
    .map((chunk) => ({
      ...chunk,
      content: chunk.content.trim(),
    }))
    .filter((chunk) => Boolean(chunk.content));

  if (baseChunks.length === 0) {
    return [
      {
        index: 0,
        content: normalized,
        charOffset: 0,
        tokenEstimate: estimateTokens(normalized),
      },
    ];
  }

  return applyOverlap(baseChunks, resolved.overlap);
}
