import fs from "node:fs/promises";
import path from "node:path";
import {
  extractPdfText,
  isExtractedPdfTextLikelyUsable,
  stitchPdfTextItems,
} from "../../lib/content-assets/pdf-text";

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

async function main() {
  await describe("content asset pdf text extraction", async () => {
    await it("应按行与空格拼接 pdf.js 文本项", async () => {
      const text = stitchPdfTextItems([
        { str: "AP", transform: [1, 0, 0, 1, 0, 40], width: 12, hasEOL: false },
        { str: "Calculus", transform: [1, 0, 0, 1, 26, 40], width: 42, hasEOL: true },
        { str: "Chain", transform: [1, 0, 0, 1, 0, 20], width: 20, hasEOL: false },
        { str: "Rule", transform: [1, 0, 0, 1, 28, 20], width: 16, hasEOL: false },
      ]);

      assert(text === "AP Calculus\nChain Rule", `unexpected stitched text: ${text}`);
    });

    await it("真实 PDF 文本层可用时，应提取出可用于 embedding 的正文", async () => {
      const samplePath = path.join(process.cwd(), "tmp/ux-upload-sample.pdf");
      const fileBuffer = await fs.readFile(samplePath);
      const result = await extractPdfText(fileBuffer);

      assert(result.pageCount >= 1, `expected pageCount >= 1, got ${result.pageCount}`);
      assert(result.pageTexts.length === result.pageCount, "pageTexts length should match pageCount");
      assert(result.rawText.length >= 80, `expected extracted text length >= 80, got ${result.rawText.length}`);
      assert(
        isExtractedPdfTextLikelyUsable(result),
        "expected sample pdf text extraction to be considered usable",
      );
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
