/**
 * 测试 Mistral OCR 图片提取：PDF → Mistral OCR (include_image_base64=true) → 输出 PNG
 *
 * 用法: npx tsx scripts/test-mistral-ocr-images.ts [pdf-path]
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ocrPdfWithMistral } from "@/lib/pdf-scan/mistral-ocr";

const PDF_PATH =
  process.argv[2] ||
  "/Users/martin/Downloads/04AP Micro微观 CB官方题库/Progress check/Unit3/Unit3 ProgressCheck MCQ.pdf";
const OUTPUT_DIR = "/Users/martin/Documents/个人项目/new-start/ocr-debug/mistral-ocr-test";

async function main() {
  console.log(`PDF: ${PDF_PATH}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const pdfBuffer = Buffer.from(readFileSync(PDF_PATH));
  const fileName = PDF_PATH.split("/").pop() || "test.pdf";

  console.log("\n[1] Calling Mistral OCR...");
  const result = await ocrPdfWithMistral(pdfBuffer, fileName);
  console.log(`  Model: ${result.model}`);
  console.log(`  Pages: ${result.pages.length}`);

  let totalImages = 0;

  for (const page of result.pages) {
    console.log(`\n  Page ${page.pageNumber}:`);
    console.log(`    Markdown length: ${page.markdown.length}`);
    console.log(`    Images: ${page.images.length}`);
    console.log(`    Dimensions: ${page.dimensions.width}x${page.dimensions.height}`);

    // Save markdown
    writeFileSync(
      join(OUTPUT_DIR, `page-${page.pageNumber}.md`),
      page.markdown,
    );

    // Save images
    for (let i = 0; i < page.images.length; i++) {
      const img = page.images[i];
      const base64Data = img.base64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const ext = img.base64.startsWith("data:image/png") ? "png" : "jpg";
      const filename = `page-${page.pageNumber}-img-${i + 1}-${img.name || "unnamed"}.${ext}`;
      writeFileSync(join(OUTPUT_DIR, filename), buffer);
      console.log(`    → ${filename} (${buffer.length} bytes)`);
      totalImages++;
    }

    // Show first 200 chars of markdown
    console.log(`    Preview: ${page.markdown.slice(0, 150).replace(/\n/g, " ")}...`);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Pages: ${result.pages.length}`);
  console.log(`Total images extracted: ${totalImages}`);
  console.log(`Output: ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error("Failed:", err.message || err);
  process.exit(1);
});
