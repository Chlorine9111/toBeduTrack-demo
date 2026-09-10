import { readFileSync } from "node:fs";
import { parseMistralOcrMarkdown, convertToScannedQuestions } from "@/lib/pdf-scan/mistral-markdown-parser";

const OUTPUT_DIR = "/Users/martin/Documents/个人项目/new-start/ocr-debug/mistral-ocr-test";

// Load pages from saved markdown files
const pages: Array<{ pageNumber: number; markdown: string }> = [];
for (let i = 1; i <= 8; i++) {
  try {
    const markdown = readFileSync(`${OUTPUT_DIR}/page-${i}.md`, "utf-8");
    pages.push({ pageNumber: i, markdown });
  } catch {
    break;
  }
}

console.log(`Loaded ${pages.length} pages\n`);

const parsed = parseMistralOcrMarkdown(pages);
const questions = convertToScannedQuestions(parsed);

console.log(`Parsed ${questions.length} questions\n`);

for (const q of questions) {
  const optKeys = q.options ? Object.keys(q.options).join("") : "(none)";
  const hasImg = q.linkedFigures && q.linkedFigures.length > 0 ? "IMG" : "   ";
  const stemPreview = q.content
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "[IMG]")
    .replace(/\n/g, " ")
    .slice(0, 70);
  console.log(
    `Q${String(q.questionNumber).padStart(2)} [${q.questionType.slice(0, 2).toUpperCase()}] ${hasImg} opts=${optKeys.padEnd(5)} p${q.sourcePageNumber} | ${stemPreview}`,
  );
}

// Verify cross-page questions
console.log("\n=== Cross-page verification ===");
const q10 = questions.find((q) => q.questionNumber === 10);
if (q10) {
  console.log(`Q10 options: ${q10.options ? Object.keys(q10.options).join(",") : "NONE"}`);
  console.log(`Q10 stem: ${q10.content.slice(0, 80)}...`);
}
const q13 = questions.find((q) => q.questionNumber === 13);
if (q13) {
  console.log(`Q13 options: ${q13.options ? Object.keys(q13.options).join(",") : "NONE"}`);
  console.log(`Q13 stem: ${q13.content.slice(0, 80)}...`);
}

// Verify shared context (questions 1-2 share an image)
console.log("\n=== Shared context verification ===");
const q1 = questions.find((q) => q.questionNumber === 1);
const q2 = questions.find((q) => q.questionNumber === 2);
if (q1) {
  console.log(`Q1 has image: ${q1.linkedFigures?.length ?? 0}`);
  console.log(`Q1 stem start: ${q1.content.slice(0, 60)}...`);
}
if (q2) {
  console.log(`Q2 has image: ${q2.linkedFigures?.length ?? 0}`);
}
