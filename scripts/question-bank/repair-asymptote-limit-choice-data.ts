import type { ApQuestionBankChoice } from "@/lib/question-bank/ap-types";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type QuestionRepair = {
  id: string;
  stemCue: string;
  reason: string;
  choices: Record<string, ApQuestionBankChoice>;
  explanation: string;
};

function parseArgs(argv: string[]) {
  return {
    dryRun: !argv.includes("--write"),
  };
}

function stableJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

const FIXED_CHOICES: Record<string, ApQuestionBankChoice> = {
  A: {
    text: "$\\lim_{x \\to 0^{+}} f(x) = \\infty$ and $\\lim_{x \\to \\infty} f(x) = \\infty$",
    image_url: null,
    misconception:
      "Student correctly identifies the vertical asymptote behavior but confuses the horizontal asymptote with another vertical asymptote or unbounded growth.",
  },
  B: {
    text: "$\\lim_{x \\to 0^{+}} f(x) = 2$ and $\\lim_{x \\to \\infty} f(x) = 0$",
    image_url: null,
    misconception:
      "Student reverses the behavior of vertical and horizontal asymptotes and misidentifies the horizontal asymptote value.",
  },
  C: {
    text: "$\\lim_{x \\to 0^{+}} f(x) = \\infty$ and $\\lim_{x \\to \\infty} f(x) = 2$",
    image_url: null,
    misconception: null,
  },
  D: {
    text: "$\\lim_{x \\to 2^{+}} f(x) = \\infty$ and $\\lim_{x \\to \\infty} f(x) = 2$",
    image_url: null,
    misconception:
      "Student misidentifies the location of the vertical asymptote as x=2 instead of x=0.",
  },
};

const FIXED_EXPLANATION =
  "A vertical asymptote at x=0 means $\\lim_{x \\to 0^{+}} f(x) = \\infty$. A horizontal asymptote at y=2 means $\\lim_{x \\to \\infty} f(x) = 2$. These conditions are stated in choice C.";

const REPAIRS: QuestionRepair[] = [
  {
    id: "9f0afd6a-7133-4ccc-b97c-e306ccccb361",
    stemCue: "If the asymptotes of the graph of f are x = 0 and y = 2",
    reason:
      "This row lost the limit subscripts inside choices, so the UI only receives bare `lim f(x)` fragments.",
    choices: FIXED_CHOICES,
    explanation: FIXED_EXPLANATION,
  },
  {
    id: "38d3ece8-b7f2-4d87-8a75-7511ec356f93",
    stemCue: "If the asymptotes of the graph of f are x = 0 and y = 2",
    reason:
      "This row lost the limit subscripts and also contains stray JSON choice keys like `x→2`, `x→∞`, and `x→0⁺`.",
    choices: FIXED_CHOICES,
    explanation: FIXED_EXPLANATION,
  },
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = createAdminSupabaseClient();

  console.log(`[repair-asymptote-limit-choice-data] mode=${args.dryRun ? "dry-run" : "write"}`);

  for (const repair of REPAIRS) {
    const { data, error } = await db
      .from("questions")
      .select("id, course, unit, question_number, stem, choices, explanation")
      .eq("id", repair.id)
      .single();

    if (error) {
      throw new Error(`读取问题 ${repair.id} 失败: ${error.message}`);
    }
    if (!data) {
      throw new Error(`问题 ${repair.id} 不存在`);
    }
    if (!`${data.stem ?? ""}`.includes(repair.stemCue)) {
      throw new Error(`问题 ${repair.id} 题干不匹配，已中止写入`);
    }

    const choicesChanged = stableJson(data.choices) !== stableJson(repair.choices);
    const explanationChanged = `${data.explanation ?? ""}` !== repair.explanation;

    console.log(
      `[question] ${repair.id} course=${data.course} unit=${data.unit ?? "?"} q=${data.question_number ?? "?"}`,
    );
    console.log(`  reason: ${repair.reason}`);
    console.log(`  choicesChanged=${choicesChanged} explanationChanged=${explanationChanged}`);

    if (args.dryRun || (!choicesChanged && !explanationChanged)) {
      continue;
    }

    const { error: updateError } = await db
      .from("questions")
      .update({
        choices: repair.choices,
        explanation: repair.explanation,
      })
      .eq("id", repair.id);

    if (updateError) {
      throw new Error(`更新问题 ${repair.id} 失败: ${updateError.message}`);
    }

    console.log(`  updated=${repair.id}`);
  }
}

main().catch((error) => {
  console.error("[repair-asymptote-limit-choice-data] failed");
  console.error(error);
  process.exit(1);
});
