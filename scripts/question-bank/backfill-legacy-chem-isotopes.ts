import { normalizeStoredExerciseText } from "@/lib/exercises/content";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database";
import type { ApQuestionBankChoice } from "@/lib/question-bank/ap-types";

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
  | "parts"
>;

type ScriptArgs = {
  dryRun: boolean;
  limit: number | null;
  pageSize: number;
  sampleSize: number;
};

const SCIENCE_COURSES = new Set([
  "AP_BIO",
  "AP_CHEM",
  "AP_PHYSICS_1",
  "AP_PHYSICS_2",
  "AP_PHYSICS_C_MECH",
  "AP_PHYSICS_C_EM",
]);

const LEGACY_CHEM_ISOTOPE_PATTERN =
  /(?:\b\d{1,3}\s*\/\s*\d{1,3}\s*(?:H|He|Li|Be|B|C|N|O|F|Ne|Na|Mg|Al|Si|P|S|Cl|Ar|K|Ca|Sc|Ti|V|Cr|Mn|Fe|Co|Ni|Cu|Zn|Ga|Ge|As|Se|Br|Kr|Rb|Sr|Y|Zr|Nb|Mo|Tc|Ru|Rh|Pd|Ag|Cd|In|Sn|Sb|Te|I|Xe|Cs|Ba|La|Ce|Pr|Nd|Pm|Sm|Eu|Gd|Tb|Dy|Ho|Er|Tm|Yb|Lu|Hf|Ta|W|Re|Os|Ir|Pt|Au|Hg|Tl|Pb|Bi|Po|At|Rn|Fr|Ra|Ac|Th|Pa|U|Np|Pu|Am|Cm|Bk|Cf|Es|Fm|Md|No|Lr|Rf|Db|Sg|Bh|Hs|Mt|Ds|Rg|Cn|Nh|Fl|Mc|Lv|Ts|Og)\b)|(?:\^\{?\d{1,3}\}?(?:_\{?\d{1,3}\}?)?\s*(?:H|He|Li|Be|B|C|N|O|F|Ne|Na|Mg|Al|Si|P|S|Cl|Ar|K|Ca|Sc|Ti|V|Cr|Mn|Fe|Co|Ni|Cu|Zn|Ga|Ge|As|Se|Br|Kr|Rb|Sr|Y|Zr|Nb|Mo|Tc|Ru|Rh|Pd|Ag|Cd|In|Sn|Sb|Te|I|Xe|Cs|Ba|La|Ce|Pr|Nd|Pm|Sm|Eu|Gd|Tb|Dy|Ho|Er|Tm|Yb|Lu|Hf|Ta|W|Re|Os|Ir|Pt|Au|Hg|Tl|Pb|Bi|Po|At|Rn|Fr|Ra|Ac|Th|Pa|U|Np|Pu|Am|Cm|Bk|Cf|Es|Fm|Md|No|Lr|Rf|Db|Sg|Bh|Hs|Mt|Ds|Rg|Cn|Nh|Fl|Mc|Lv|Ts|Og)(?:\s*\(\s*Z\s*=\s*\d{1,3}\s*\))?)/;

function parseArgs(argv: string[]): ScriptArgs {
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  const pageSizeArg = argv.find((arg) => arg.startsWith("--page-size="));
  const sampleSizeArg = argv.find((arg) => arg.startsWith("--sample-size="));

  return {
    dryRun: !argv.includes("--write"),
    limit: limitArg ? Number.parseInt(limitArg.split("=")[1] ?? "", 10) || null : null,
    pageSize: pageSizeArg ? Math.max(1, Number.parseInt(pageSizeArg.split("=")[1] ?? "", 10) || 200) : 200,
    sampleSize: sampleSizeArg ? Math.max(0, Number.parseInt(sampleSizeArg.split("=")[1] ?? "", 10) || 8) : 8,
  };
}

function stableJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeQuestionChoices(
  raw: Record<string, ApQuestionBankChoice> | null | undefined,
) {
  if (!raw || typeof raw !== "object") return null;

  const entries = Object.entries(raw).map(([label, choice]) => {
    const nextChoice: ApQuestionBankChoice = {
      ...choice,
      text: normalizeStoredExerciseText(choice?.text ?? ""),
      misconception:
        choice?.misconception == null
          ? null
          : normalizeStoredExerciseText(choice.misconception),
    };
    return [label, nextChoice] as const;
  });

  return Object.fromEntries(entries) as Record<string, ApQuestionBankChoice>;
}

function normalizeQuestionJson(value: Json | null): Json | null {
  if (value == null) return value;
  if (typeof value === "string") {
    return normalizeStoredExerciseText(value) as Json;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeQuestionJson(item as Json)) as Json;
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeQuestionJson(item as Json)]),
    ) as Json;
  }
  return value;
}

function looksLikeLegacyChemIsotope(row: QuestionRow) {
  if (!SCIENCE_COURSES.has(row.course)) {
    return false;
  }

  const combined = [
    row.stem ?? "",
    row.correct_answer ?? "",
    row.explanation ?? "",
    JSON.stringify(row.choices ?? null),
    JSON.stringify(row.parts ?? null),
  ].join("\n");

  return LEGACY_CHEM_ISOTOPE_PATTERN.test(combined);
}

async function applyUpdates(updates: Array<Record<string, unknown> & { id: string }>) {
  const db = createAdminSupabaseClient();

  for (const batch of chunkArray(updates, 4)) {
    const results = await Promise.all(
      batch.map((item) => {
        const { id, ...update } = item;
        return db.from("questions").update(update).eq("id", id);
      }),
    );

    const failed = results.find((result) => result.error);
    if (failed?.error) {
      throw new Error(`批量更新 questions 失败：${failed.error.message}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = createAdminSupabaseClient();

  let from = 0;
  let scanned = 0;
  let candidates = 0;
  let changed = 0;
  let updated = 0;
  const samples: Array<Record<string, string | number | null>> = [];

  while (true) {
    const { data, error } = await db
      .from("questions")
      .select("id,status,course,unit,question_number,stem,choices,correct_answer,explanation,parts")
      .neq("status", "deprecated")
      .order("created_at", { ascending: true })
      .range(from, from + args.pageSize - 1);

    if (error) {
      throw new Error(`读取 questions 失败：${error.message}`);
    }

    const rows = (data ?? []) as QuestionRow[];
    if (rows.length === 0) {
      break;
    }

    const pendingUpdates: Array<Record<string, unknown> & { id: string }> = [];

    for (const row of rows) {
      if (args.limit != null && scanned >= args.limit) {
        break;
      }

      scanned += 1;
      if (!looksLikeLegacyChemIsotope(row)) {
        continue;
      }

      candidates += 1;

      const nextStem = normalizeStoredExerciseText(row.stem ?? "");
      const nextChoices = normalizeQuestionChoices(row.choices as Record<string, ApQuestionBankChoice> | null);
      const nextCorrectAnswer =
        row.correct_answer == null ? null : normalizeStoredExerciseText(row.correct_answer);
      const nextExplanation =
        row.explanation == null ? null : normalizeStoredExerciseText(row.explanation);
      const nextParts = normalizeQuestionJson(row.parts);

      const rowChanged =
        stableJson(row.stem) !== stableJson(nextStem) ||
        stableJson(row.choices) !== stableJson(nextChoices) ||
        stableJson(row.correct_answer) !== stableJson(nextCorrectAnswer) ||
        stableJson(row.explanation) !== stableJson(nextExplanation) ||
        stableJson(row.parts) !== stableJson(nextParts);

      if (!rowChanged) {
        continue;
      }

      changed += 1;
      if (samples.length < args.sampleSize) {
        samples.push({
          id: row.id,
          course: row.course,
          unit: row.unit,
          questionNumber: row.question_number,
          beforeStem: (row.stem ?? "").slice(0, 220),
          afterStem: nextStem.slice(0, 220),
        });
      }

      if (!args.dryRun) {
        pendingUpdates.push({
          id: row.id,
          stem: nextStem,
          choices: nextChoices as unknown as Json,
          correct_answer: nextCorrectAnswer,
          explanation: nextExplanation,
          parts: nextParts,
        });
      }
    }

    if (!args.dryRun && pendingUpdates.length > 0) {
      await applyUpdates(pendingUpdates);
      updated += pendingUpdates.length;
    }

    console.log(
      `[progress] mode=${args.dryRun ? "dry-run" : "write"} scanned=${scanned} candidates=${candidates} changed=${changed} updated=${updated}`,
    );

    if (args.limit != null && scanned >= args.limit) {
      break;
    }

    from += rows.length;
  }

  console.log(
    JSON.stringify(
      {
        mode: args.dryRun ? "dry-run" : "write",
        limit: args.limit,
        pageSize: args.pageSize,
        scanned,
        candidates,
        changed,
        updated,
        samples,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[backfill-legacy-chem-isotopes] failed");
  console.error(error);
  process.exit(1);
});
