import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type QuestionRow = Pick<
  Database["public"]["Tables"]["questions"]["Row"],
  | "id"
  | "status"
  | "course"
  | "unit"
  | "question_number"
  | "stem"
  | "choices"
  | "correct_answer"
  | "explanation"
>;

const SCIENCE_COURSES = new Set([
  "AP_BIO",
  "AP_CHEM",
  "AP_PHYSICS_1",
  "AP_PHYSICS_2",
  "AP_PHYSICS_C_MECH",
  "AP_PHYSICS_C_EM",
]);

const ELEMENT_TO_Z: Record<string, number> = {
  H: 1, He: 2, Li: 3, Be: 4, B: 5, C: 6, N: 7, O: 8, F: 9, Ne: 10,
  Na: 11, Mg: 12, Al: 13, Si: 14, P: 15, S: 16, Cl: 17, Ar: 18, K: 19, Ca: 20,
  Sc: 21, Ti: 22, V: 23, Cr: 24, Mn: 25, Fe: 26, Co: 27, Ni: 28, Cu: 29, Zn: 30,
  Ga: 31, Ge: 32, As: 33, Se: 34, Br: 35, Kr: 36, Rb: 37, Sr: 38, Y: 39, Zr: 40,
  Nb: 41, Mo: 42, Tc: 43, Ru: 44, Rh: 45, Pd: 46, Ag: 47, Cd: 48, In: 49, Sn: 50,
  Sb: 51, Te: 52, I: 53, Xe: 54, Cs: 55, Ba: 56, La: 57, Ce: 58, Pr: 59, Nd: 60,
  Pm: 61, Sm: 62, Eu: 63, Gd: 64, Tb: 65, Dy: 66, Ho: 67, Er: 68, Tm: 69, Yb: 70,
  Lu: 71, Hf: 72, Ta: 73, W: 74, Re: 75, Os: 76, Ir: 77, Pt: 78, Au: 79, Hg: 80,
  Tl: 81, Pb: 82, Bi: 83, Po: 84, At: 85, Rn: 86, Fr: 87, Ra: 88, Ac: 89, Th: 90,
  Pa: 91, U: 92, Np: 93, Pu: 94, Am: 95, Cm: 96, Bk: 97, Cf: 98, Es: 99, Fm: 100,
  Md: 101, No: 102, Lr: 103, Rf: 104, Db: 105, Sg: 106, Bh: 107, Hs: 108, Mt: 109, Ds: 110,
  Rg: 111, Cn: 112, Nh: 113, Fl: 114, Mc: 115, Lv: 116, Ts: 117, Og: 118,
};

const STORED_ISOTOPE_PATTERN =
  /\$\{\}(?:_(?:\{)?(\d{1,3})(?:\})?)?\^(?:\{)?(\d{1,3})(?:\})?\\mathrm\{([A-Z][a-z]?)\}(?:\\,\(\s*\\mathrm\{Z\}=(\d{1,3})\s*\))?\$/g;
const STORED_ISOTOPE_ALT_PATTERN =
  /\$\{\}(?:_\{(\d{1,3})\})?\^\{(\d{1,3})\}\\mathrm\{([A-Z][a-z]?)\}(?:\\,\( \\mathrm\{Z\}=(\d{1,3}) \))?\$/g;
const RAW_ISOTOPE_SLASH_PATTERN = /\b(\d{1,3})\s*\/\s*(\d{1,3})\s*([A-Z][a-z]?)\b/g;
const RAW_ISOTOPE_SUPER_PATTERN =
  /\^\{?(\d{1,3})\}?(?:_\{?(\d{1,3})\}?)?\s*([A-Z][a-z]?)(?:\s*\(\s*Z\s*=\s*(\d{1,3})\s*\))?/g;

type ParsedIsotope = {
  raw: string;
  element: string;
  massNumber: number | null;
  atomicNumber: number | null;
  displayedZ: number | null;
};

type QuestionAudit = {
  id: string;
  course: string;
  unit: number | null;
  questionNumber: number | null;
  score: number;
  isotopeCount: number;
  invalidCount: number;
  reasons: string[];
  stem: string;
};

function normalizeStemKey(stem: string | null | undefined) {
  return `${stem ?? ""}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[“”‘’"'`]/g, "")
    .trim();
}

function parseMaybeNumber(value: string | undefined | null) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIsotopesFromText(value: string | null | undefined): ParsedIsotope[] {
  const text = `${value ?? ""}`;
  const results: ParsedIsotope[] = [];

  for (const match of text.matchAll(STORED_ISOTOPE_PATTERN)) {
    results.push({
      raw: match[0],
      atomicNumber: parseMaybeNumber(match[1]),
      massNumber: parseMaybeNumber(match[2]),
      element: match[3] ?? "",
      displayedZ: parseMaybeNumber(match[4]),
    });
  }

  for (const match of text.matchAll(STORED_ISOTOPE_ALT_PATTERN)) {
    results.push({
      raw: match[0],
      atomicNumber: parseMaybeNumber(match[1]),
      massNumber: parseMaybeNumber(match[2]),
      element: match[3] ?? "",
      displayedZ: parseMaybeNumber(match[4]),
    });
  }

  for (const match of text.matchAll(RAW_ISOTOPE_SLASH_PATTERN)) {
    results.push({
      raw: match[0],
      atomicNumber: parseMaybeNumber(match[2]),
      massNumber: parseMaybeNumber(match[1]),
      element: match[3] ?? "",
      displayedZ: null,
    });
  }

  for (const match of text.matchAll(RAW_ISOTOPE_SUPER_PATTERN)) {
    results.push({
      raw: match[0],
      atomicNumber: parseMaybeNumber(match[2]),
      massNumber: parseMaybeNumber(match[1]),
      element: match[3] ?? "",
      displayedZ: parseMaybeNumber(match[4]),
    });
  }

  return results;
}

function looksLikeChemIsotopeFamily(row: QuestionRow) {
  if (!SCIENCE_COURSES.has(row.course)) {
    return false;
  }

  const combined = [
    row.stem ?? "",
    JSON.stringify(row.choices ?? null),
    row.explanation ?? "",
    row.correct_answer ?? "",
  ].join("\n");

  return (
    /orbital electrons|alpha particle|isotope/i.test(combined) ||
    parseIsotopesFromText(combined).length > 0 ||
    /not standard/i.test(combined)
  );
}

function auditQuestion(row: QuestionRow): QuestionAudit {
  const reasons: string[] = [];
  const combined = [
    row.stem ?? "",
    JSON.stringify(row.choices ?? null),
    row.explanation ?? "",
    row.correct_answer ?? "",
  ].join("\n");
  const isotopes = parseIsotopesFromText(combined);
  let invalidCount = 0;
  let score = 0;

  if (/not standard|likely a variant/i.test(combined)) {
    reasons.push("contains explicit not-standard marker");
    score -= 6;
  }

  for (const isotope of isotopes) {
    const expectedZ = ELEMENT_TO_Z[isotope.element];
    if (!expectedZ) {
      invalidCount += 1;
      score -= 4;
      reasons.push(`unknown element symbol in isotope: ${isotope.raw}`);
      continue;
    }

    score += 2;

    if (isotope.atomicNumber != null && isotope.atomicNumber !== expectedZ) {
      invalidCount += 1;
      score -= 6;
      reasons.push(
        `atomic number mismatch for ${isotope.element}: got ${isotope.atomicNumber}, expected ${expectedZ}`,
      );
    }

    if (isotope.displayedZ != null && isotope.displayedZ !== expectedZ) {
      invalidCount += 1;
      score -= 6;
      reasons.push(
        `displayed Z mismatch for ${isotope.element}: got ${isotope.displayedZ}, expected ${expectedZ}`,
      );
    }

    if (
      isotope.massNumber != null &&
      isotope.massNumber < expectedZ
    ) {
      invalidCount += 1;
      score -= 8;
      reasons.push(
        `impossible isotope mass for ${isotope.element}: A=${isotope.massNumber} < Z=${expectedZ}`,
      );
    }
  }

  if (/orbital electrons/i.test(combined)) {
    score += 2;
  }

  return {
    id: row.id,
    course: row.course,
    unit: row.unit,
    questionNumber: row.question_number,
    score,
    isotopeCount: isotopes.length,
    invalidCount,
    reasons: [...new Set(reasons)],
    stem: row.stem ?? "",
  };
}

async function main() {
  const db = createAdminSupabaseClient();
  let from = 0;
  const rows: QuestionRow[] = [];

  while (true) {
    const { data, error } = await db
      .from("questions")
      .select("id,status,course,unit,question_number,stem,choices,correct_answer,explanation")
      .neq("status", "deprecated")
      .in("course", [...SCIENCE_COURSES])
      .order("created_at", { ascending: true })
      .range(from, from + 199);

    if (error) {
      throw new Error(`读取 questions 失败：${error.message}`);
    }

    const batch = (data ?? []) as QuestionRow[];
    if (batch.length === 0) break;
    rows.push(...batch);
    from += batch.length;
  }

  const candidates = rows.filter(looksLikeChemIsotopeFamily);
  const audits = candidates.map(auditQuestion);
  const byStem = new Map<string, QuestionAudit[]>();

  for (const audit of audits) {
    const key = normalizeStemKey(audit.stem);
    const bucket = byStem.get(key) ?? [];
    bucket.push(audit);
    byStem.set(key, bucket);
  }

  const clusters = [...byStem.entries()]
    .map(([stemKey, items]) => ({
      stemKey,
      stem: items[0]?.stem ?? "",
      items: [...items].sort((a, b) => b.score - a.score),
    }))
    .filter((cluster) => cluster.items.length > 1 || cluster.items.some((item) => item.invalidCount > 0))
    .sort((a, b) => {
      const aWorst = Math.max(...a.items.map((item) => item.invalidCount));
      const bWorst = Math.max(...b.items.map((item) => item.invalidCount));
      return bWorst - aWorst || b.items.length - a.items.length;
    });

  console.log(
    JSON.stringify(
      {
        scanned: rows.length,
        candidates: candidates.length,
        clusters: clusters.map((cluster) => ({
          stem: cluster.stem,
          items: cluster.items.map((item) => ({
            id: item.id,
            course: item.course,
            unit: item.unit,
            questionNumber: item.questionNumber,
            score: item.score,
            isotopeCount: item.isotopeCount,
            invalidCount: item.invalidCount,
            reasons: item.reasons,
          })),
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[audit-chem-isotope-quality] failed");
  console.error(error);
  process.exit(1);
});
