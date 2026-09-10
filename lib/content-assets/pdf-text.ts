import path from "node:path";

type PdfJsTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  hasEOL?: boolean;
};

export type ExtractedPdfText = {
  rawText: string;
  pageTexts: string[];
  pageCount: number;
};

const MIN_TOTAL_TEXT_CHARS = 80;
const MIN_AVG_TEXT_CHARS_PER_NON_EMPTY_PAGE = 20;
const MAX_REPLACEMENT_CHAR_RATIO = 0.2;
const LINE_BREAK_Y_DELTA = 4;
const WORD_BREAK_X_DELTA = 6;

function toPdfJsData(buffer: Buffer) {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function normalizeWhitespace(value: string) {
  return value
    .replace(/[\u00a0\u2003]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getNumeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function stitchPdfTextItems(items: unknown[]) {
  let text = "";
  let lastY: number | null = null;
  let lastXEnd: number | null = null;
  let lastEndedWithEol = false;

  for (const rawItem of items) {
    const item = (rawItem ?? {}) as PdfJsTextItem;
    const str = `${item.str ?? ""}`;
    const y = getNumeric(item.transform?.[5]);
    const x = getNumeric(item.transform?.[4]);
    const width = getNumeric(item.width);
    const trimmed = str.trim();

    if (trimmed) {
      if (!lastEndedWithEol && lastY !== null && y !== null) {
        const yDelta = Math.abs(y - lastY);
        if (yDelta > LINE_BREAK_Y_DELTA) {
          text += "\n";
        } else if (lastXEnd !== null && x !== null && x - lastXEnd > WORD_BREAK_X_DELTA) {
          text += " ";
        }
      }

      text += str;
    }

    if (item.hasEOL) {
      text += "\n";
      lastEndedWithEol = true;
      lastXEnd = null;
    } else if (x !== null) {
      lastXEnd = x + (width ?? Math.max(str.length * 4, 0));
      lastEndedWithEol = false;
    } else {
      lastEndedWithEol = false;
    }

    if (y !== null) {
      lastY = y;
    }
  }

  return normalizeWhitespace(text);
}

export function isExtractedPdfTextLikelyUsable(result: ExtractedPdfText) {
  const nonEmptyPages = result.pageTexts
    .map((page) => normalizeWhitespace(page))
    .filter(Boolean);

  if (nonEmptyPages.length === 0) {
    return false;
  }

  const condensed = nonEmptyPages.join("");
  const nonWhitespaceChars = condensed.replace(/\s+/g, "").length;
  if (nonWhitespaceChars < MIN_TOTAL_TEXT_CHARS) {
    return false;
  }

  const replacementChars = (condensed.match(/\uFFFD/g) ?? []).length;
  if (replacementChars > 0 && replacementChars / Math.max(condensed.length, 1) > MAX_REPLACEMENT_CHAR_RATIO) {
    return false;
  }

  const averageChars = nonWhitespaceChars / Math.max(nonEmptyPages.length, 1);
  return averageChars >= MIN_AVG_TEXT_CHARS_PER_NON_EMPTY_PAGE;
}

export async function extractPdfText(fileBuffer: Buffer): Promise<ExtractedPdfText> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const standardFontDataUrl = path.join(
    process.cwd(),
    "node_modules/pdfjs-dist/standard_fonts/",
  );
  const loadingTask = pdfjs.getDocument({
    data: toPdfJsData(fileBuffer),
    disableWorker: true,
    useSystemFonts: false,
    standardFontDataUrl,
    disableFontFace: true,
    isEvalSupported: false,
  } as Record<string, unknown>);

  const pdf = await loadingTask.promise;

  try {
    const pageTexts: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      try {
        const textContent = await page.getTextContent({
          includeMarkedContent: false,
          disableNormalization: false,
        });
        pageTexts.push(stitchPdfTextItems(textContent.items as unknown[]));
      } finally {
        page.cleanup();
      }
    }

    return {
      rawText: normalizeWhitespace(pageTexts.filter(Boolean).join("\n\n---\n\n")),
      pageTexts,
      pageCount: pdf.numPages,
    };
  } finally {
    await pdf.destroy();
  }
}
