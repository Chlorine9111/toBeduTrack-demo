/**
 * 将 "code to clipboard.md" 按 <!DOCTYPE html> 拆分为独立 HTML 文件
 *
 * 命名规则：取每段开头的注释（如 <!-- Settings | Profile -->）
 * 转为 kebab-case（如 settings-profile.html）
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_FILE =
  "/Users/martin/Documents/obsidian仓库/开源项目研究/code to clipboard.md";
const OUTPUT_DIR = path.join(__dirname, "clipboard");

const content = fs.readFileSync(SOURCE_FILE, "utf-8");
const rawSegments = content.split("<!DOCTYPE html>");
const segments = [];

for (let i = 0; i < rawSegments.length; i += 1) {
  const segment = rawSegments[i];
  if (i === 0) {
    continue;
  }

  let comment = "";
  const prevSegment = rawSegments[i - 1];
  const prevLines = prevSegment.split("\n");

  for (let j = prevLines.length - 1; j >= 0; j -= 1) {
    const line = prevLines[j].trim();
    if (line.startsWith("<!--") && line.endsWith("-->")) {
      comment = line;
      break;
    }
    if (line.length > 0) {
      break;
    }
  }

  segments.push({
    comment,
    html: `<!DOCTYPE html>${segment}`,
  });
}

function commentToFilename(comment) {
  const match = comment.match(/<!--\s*(.+?)\s*-->/);
  if (!match) return null;

  const name = match[1]
    .replace(/\|/g, " ")
    .replace(/\(([^)]+)\)/g, "$1")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .map((word) => word.toLowerCase())
    .join("-");

  return `${name}.html`;
}

const fileNameCount = {};

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const results = [];

for (const segment of segments) {
  let filename = commentToFilename(segment.comment);

  if (!filename) {
    filename = `page-${results.length + 1}.html`;
  }

  if (fileNameCount[filename]) {
    fileNameCount[filename] += 1;
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    filename = `${base}-${fileNameCount[filename]}${ext}`;
  } else {
    fileNameCount[filename] = 1;
  }

  const outputContent = segment.comment
    ? `${segment.comment}\n${segment.html}`
    : segment.html;

  const outputPath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(outputPath, outputContent, "utf-8");

  results.push({
    filename,
    comment: segment.comment,
    lines: segment.html.split("\n").length,
  });
}

console.log(`拆分完成！共生成 ${results.length} 个文件：\n`);
results.forEach((result, index) => {
  console.log(
    `  ${String(index + 1).padStart(2, " ")}. ${result.filename.padEnd(40)} (${result.lines} 行) ${result.comment}`,
  );
});
