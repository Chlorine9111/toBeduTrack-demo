import { isUploadedPdfAsset } from "../../lib/content-assets/pdf-library-sync-helpers";
import { toContentAssetSummary } from "../../lib/content-assets/summary";
import type { ContentAsset } from "../../lib/content-assets/types";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(message);
    console.error(`  FAIL: ${message}`);
  }
}

function describe(name: string, fn: () => void | Promise<void>) {
  console.log(`\n${name}`);
  return Promise.resolve(fn());
}

async function it(name: string, fn: () => void | Promise<void>) {
  const failedBefore = failed;
  try {
    await fn();
    if (failed === failedBefore) {
      console.log(`  PASS: ${name}`);
    }
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    console.error(`  FAIL: ${name}: ${message}`);
  }
}

function makeAsset(overrides: Partial<ContentAsset> = {}): ContentAsset {
  return {
    id: "asset-1",
    teacherId: "teacher-1",
    folderId: null,
    assetSource: "uploaded",
    fileName: "chapter-11.pdf",
    fileType: "application/pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 1024,
    storagePath: "teacher-1/chapter-11.pdf",
    storageBucket: "content-assets",
    refEntityType: null,
    refEntityId: null,
    contentLibraryItemId: "library-item-1",
    title: "Chapter 11",
    rawText: "正文内容",
    summaryText: "摘要",
    tags: [],
    searchText: "chapter 11",
    courseId: null,
    unitId: null,
    courseLabel: null,
    unitLabel: null,
    category: "reference",
    processingStatus: "ready",
    processingError: null,
    chunkCount: 12,
    pageCount: 8,
    metadata: {},
    createdAt: "2026-03-26T10:00:00.000Z",
    updatedAt: "2026-03-26T10:05:00.000Z",
    ...overrides,
  };
}

async function main() {
  await describe("content asset upload material semantics", async () => {
    await it("uploaded pdf 仍应被识别为可作为资料素材的 PDF", async () => {
      assert(isUploadedPdfAsset(makeAsset()), "expected uploaded pdf to be recognized");
      assert(
        !isUploadedPdfAsset(makeAsset({ assetSource: "reference" })),
        "reference asset should not be recognized as uploaded pdf",
      );
      assert(
        !isUploadedPdfAsset(
          makeAsset({
            fileName: "chapter-11.docx",
            fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          }),
        ),
        "docx should not be treated as uploaded pdf",
      );
    });

    await it("uploaded 资产摘要不应继续暴露自动入库语义", async () => {
      const summary = toContentAssetSummary({
        id: "asset-1",
        folderId: null,
        assetSource: "uploaded",
        fileName: "chapter-11.pdf",
        fileType: "application/pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 1024,
        contentLibraryItemId: "library-item-1",
        title: "Chapter 11",
        note: null,
        rendererType: "markdown",
        originEntityType: "content_asset",
        originEntityId: "asset-1",
        courseId: null,
        unitId: null,
        courseName: null,
        unitName: null,
        category: "reference",
        processingStatus: "ready",
        processingError: null,
        chunkCount: 12,
        pageCount: 8,
        refEntityType: null,
        refEntityId: null,
        metadata: {},
        createdAt: "2026-03-26T10:00:00.000Z",
        updatedAt: "2026-03-26T10:05:00.000Z",
      });

      assert(summary.contentLibraryItemId === null, "uploaded asset summary should hide contentLibraryItemId");
      assert(summary.rendererType === null, "uploaded asset summary should hide rendererType");
      assert(summary.originEntityType === null, "uploaded asset summary should hide originEntityType");
      assert(summary.originEntityId === null, "uploaded asset summary should hide originEntityId");
    });
  });

  if (failed > 0) {
    console.error(`\n${failed} assertions failed.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nAll ${passed} assertions passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
