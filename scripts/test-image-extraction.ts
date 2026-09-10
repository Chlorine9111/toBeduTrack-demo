/**
 * 测试脚本：PDF → 渲染页面 → Haiku Vision 定位图片 → 裁剪 → 输出 PNG
 *
 * 用法: npx tsx scripts/test-image-extraction.ts <pdf-path> [output-dir]
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderPdfPages } from "@/lib/pdf-scan/pdf-render";
import { getAnthropicProvider } from "@/lib/ai/provider-registry";
import { parseJsonFromRawText } from "@/lib/agent/exercise-pipeline-parsing";

const PDF_PATH =
  process.argv[2] ||
  "/Users/martin/Downloads/04AP Micro微观 CB官方题库/Progress check/Unit3/Unit3 ProgressCheck MCQ.pdf";
const OUTPUT_DIR = process.argv[3] || "/Users/martin/Documents/个人项目/new-start/ocr-debug/extraction-test";

type DetectedFigure = {
  page: number;
  bbox: [number, number, number, number];
  description: string;
};

// ---------------------------------------------------------------------------
// Haiku Vision：一页一次调用，标出所有图片
// ---------------------------------------------------------------------------

async function detectFiguresOnPage(
  pageBuffer: Buffer,
  pageNumber: number,
  pageWidth: number,
  pageHeight: number,
): Promise<DetectedFigure[]> {
  const { streamText } = await import("ai");
  const anthropic = getAnthropicProvider();

  const stream = streamText({
    model: anthropic("claude-haiku-4-5-20251001"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            image: new Uint8Array(pageBuffer),
          },
          {
            type: "text",
            text: `这是一页 PDF 的截图（${pageWidth}x${pageHeight} 像素）。

请标出这页中**所有独立的图片、图表、曲线图、表格截图**的精确边界坐标。

规则：
- bbox 必须包含图片的完整可见区域，包括坐标轴标签、图例、标题、数据标注
- 宁可多包含 20px 也不要切掉任何内容
- 坐标是像素值 [x1, y1, x2, y2]，左上角为原点
- 纯文字段落不算图片，不要标注
- 如果这页没有任何图片/图表，返回空数组

只输出 JSON 数组，不要解释：
[{"bbox":[x1,y1,x2,y2],"description":"图片描述"}]`,
          },
        ],
      },
    ],
    maxOutputTokens: 500,
    temperature: 0,
  });

  const text = await stream.text;
  const parsed = parseJsonFromRawText(text ?? "");

  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(
      (item: Record<string, unknown>) =>
        Array.isArray(item.bbox) && item.bbox.length === 4,
    )
    .map((item: Record<string, unknown>) => ({
      page: pageNumber,
      bbox: (item.bbox as number[]).map(Math.round) as [
        number,
        number,
        number,
        number,
      ],
      description: String(item.description ?? ""),
    }));
}

// ---------------------------------------------------------------------------
// 裁剪：从页面 PNG 中裁出 bbox 区域
// ---------------------------------------------------------------------------

async function cropRegion(
  pageBuffer: Buffer,
  bbox: [number, number, number, number],
  pageWidth: number,
  pageHeight: number,
): Promise<Buffer> {
  // 加 20px 安全边距
  const pad = 20;
  const x1 = Math.max(0, bbox[0] - pad);
  const y1 = Math.max(0, bbox[1] - pad);
  const x2 = Math.min(pageWidth, bbox[2] + pad);
  const y2 = Math.min(pageHeight, bbox[3] + pad);

  // 用 sharp 裁剪
  try {
    const sharp = (await import("sharp")).default;
    const cropped = await sharp(pageBuffer)
      .extract({
        left: x1,
        top: y1,
        width: x2 - x1,
        height: y2 - y1,
      })
      .png()
      .toBuffer();
    return cropped;
  } catch {
    // fallback: 返回整页
    return pageBuffer;
  }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  console.log(`PDF: ${PDF_PATH}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Step 1: 渲染 PDF
  console.log("\n[1] Rendering PDF pages...");
  const pdfBuffer = readFileSync(PDF_PATH);
  const pages = await renderPdfPages(pdfBuffer, 2.0); // 2x for better quality
  console.log(`  ${pages.length} pages rendered`);

  // 保存每页原图
  for (const page of pages) {
    const pagePath = join(OUTPUT_DIR, `page-${page.pageNumber}-full.png`);
    writeFileSync(pagePath, page.buffer);
    console.log(`  Page ${page.pageNumber}: ${page.width}x${page.height}px → ${pagePath}`);
  }

  // Step 2: Haiku Vision 检测每页的图片
  console.log("\n[2] Detecting figures with Haiku Vision...");
  const allFigures: DetectedFigure[] = [];

  for (const page of pages) {
    console.log(`  Scanning page ${page.pageNumber}...`);
    const figures = await detectFiguresOnPage(
      page.buffer,
      page.pageNumber,
      page.width,
      page.height,
    );
    console.log(`    Found ${figures.length} figures`);
    for (const fig of figures) {
      console.log(`    - [${fig.bbox.join(",")}] ${fig.description}`);
    }
    allFigures.push(...figures);
  }

  // Step 3: 裁剪并保存
  console.log(`\n[3] Cropping ${allFigures.length} figures...`);
  const pageMap = new Map(pages.map((p) => [p.pageNumber, p]));

  for (let i = 0; i < allFigures.length; i++) {
    const fig = allFigures[i];
    const page = pageMap.get(fig.page);
    if (!page) continue;

    const cropped = await cropRegion(
      page.buffer,
      fig.bbox,
      page.width,
      page.height,
    );

    const filename = `figure-p${fig.page}-${i + 1}.png`;
    const outPath = join(OUTPUT_DIR, filename);
    writeFileSync(outPath, cropped);
    console.log(`  ${filename} (${fig.description})`);
  }

  // Summary
  console.log("\n=== Summary ===");
  console.log(`Pages: ${pages.length}`);
  console.log(`Figures detected: ${allFigures.length}`);
  console.log(`Output: ${OUTPUT_DIR}`);

  // Save metadata
  writeFileSync(
    join(OUTPUT_DIR, "figures.json"),
    JSON.stringify(allFigures, null, 2),
  );
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
