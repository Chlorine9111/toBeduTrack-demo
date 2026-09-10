import { createHash } from "node:crypto";

function normalizeQuestionText(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[[A-Z]\][\s.:：-]*/g, " ")
    .replace(/\([A-Z]\)[\s.:：-]*/g, " ")
    .replace(/^[A-Z][.、)\s]+/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function buildExerciseSimilarityFingerprint(questionText: string) {
  const normalized = normalizeQuestionText(questionText);
  if (!normalized) return null;

  return createHash("sha1")
    .update(normalized)
    .digest("hex");
}
