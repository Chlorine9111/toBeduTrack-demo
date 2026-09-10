import { loadKnowledgePoints } from "@/lib/pbl/data";
import type { PblCurriculumSystem } from "@/lib/pbl/types";

export interface CheckCurriculumInput {
  curriculumSystem: PblCurriculumSystem;
  subject: string;
  grade?: string;
}

function normalizeSubjectText(input: string) {
  return input
    .toLowerCase()
    .replace(/advanced\s*placement|ap\b/g, "")
    .replace(/international\s*baccalaureate|ib\b/g, "")
    .replace(/[()（）]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(input: string) {
  return normalizeSubjectText(input)
    .split(/[^a-z0-9\u4e00-\u9fa5]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function subjectMatches(pointSubject: string, inputSubject: string) {
  const point = normalizeSubjectText(pointSubject);
  const input = normalizeSubjectText(inputSubject);

  if (!input) return true;
  if (point.includes(input) || input.includes(point)) return true;

  const pointTokens = tokenize(pointSubject);
  const inputTokens = tokenize(inputSubject);
  if (pointTokens.length === 0 || inputTokens.length === 0) {
    return false;
  }

  return inputTokens.every((token) => pointTokens.some((pt) => pt.includes(token) || token.includes(pt)));
}

export async function checkCurriculum(input: CheckCurriculumInput) {
  const all = await loadKnowledgePoints();

  return all.filter((point) => {
    if (point.curriculumSystem !== input.curriculumSystem) return false;
    return subjectMatches(point.subject, input.subject);
  });
}
