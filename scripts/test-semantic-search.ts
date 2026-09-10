import { searchExerciseSemanticHits } from "@/lib/question-bank/semantic-index";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const sb = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const teacherId = process.env.AUTH_BYPASS_USER_ID!;

async function main() {
  const queries = [
    "opportunity cost",
    "机会成本",
    "comparative advantage",
    "PPC production possibilities",
    "profit maximization",
    "边际效用递减",
  ];

  for (const q of queries) {
    console.log(`\n=== Query: "${q}" ===`);
    const results = await searchExerciseSemanticHits({
      supabase: sb,
      teacherId,
      query: q,
      limit: 5,
    });
    for (const r of results) {
      const meta = r.metadata ?? {};
      const text = String(meta.questionText ?? meta.content ?? meta.text ?? JSON.stringify(meta).slice(0, 100));
      console.log(`  ${r.score.toFixed(3)} | id=${r.exerciseId?.slice(0,8)} | ${text.slice(0,80)}`);
    }
    if (results.length === 0) console.log("  (empty)");
  }
}

main();
