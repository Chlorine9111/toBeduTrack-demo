import { renderPdfPages } from "@/lib/pdf-scan/pdf-render";
import { storeImageBuffer } from "@/lib/pdf-scan/mathpix-images";

export type StoredScanPageImage = {
  pageNumber: number;
  url: string;
};

function isPdfFile(fileName: string) {
  return /\.pdf$/i.test(fileName.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function persistSourcePageImages(params: {
  fileBuffer: Buffer;
  fileName: string;
  uploadId: string;
  teacherId: string;
  pageNumbers: number[];
}) {
  if (!isPdfFile(params.fileName)) return [] as StoredScanPageImage[];

  const uniquePages = Array.from(
    new Set(
      params.pageNumbers
        .map((pageNumber) => Math.floor(pageNumber))
        .filter((pageNumber) => Number.isFinite(pageNumber) && pageNumber > 0),
    ),
  )
    .sort((left, right) => left - right)
    .slice(0, 40);
  if (uniquePages.length === 0) return [] as StoredScanPageImage[];

  try {
    const renderedPages = await renderPdfPages(params.fileBuffer, {
      scale: 1.25,
      pageNumbers: uniquePages,
    });
    const renderedPageMap = new Map(
      renderedPages.map((page) => [page.pageNumber, page] as const),
    );
    const storedPages = await Promise.all(
      uniquePages.map(async (pageNumber) => {
        const renderedPage = renderedPageMap.get(pageNumber);
        if (!renderedPage) return null;
        const url = await storeImageBuffer({
          buffer: renderedPage.buffer,
          uploadId: `${params.uploadId}-page-${pageNumber}`,
          teacherId: params.teacherId,
          contentType: "image/png",
        });
        return url ? { pageNumber, url } : null;
      }),
    );

    return storedPages.filter((item): item is StoredScanPageImage => Boolean(item));
  } catch (error) {
    console.warn("[pdf-scan] source page image persistence failed", error);
    return [] as StoredScanPageImage[];
  }
}

export function readStoredPageImageUrl(
  scanResult: unknown,
  pageNumber: number | null | undefined,
) {
  if (!pageNumber || !isRecord(scanResult) || !Array.isArray(scanResult.pageImages)) {
    return null;
  }

  const matched = scanResult.pageImages.find((entry) => {
    if (!isRecord(entry)) return false;
    return Number(entry.pageNumber) === pageNumber && typeof entry.url === "string";
  }) as Record<string, unknown> | undefined;

  return typeof matched?.url === "string" ? matched.url : null;
}
