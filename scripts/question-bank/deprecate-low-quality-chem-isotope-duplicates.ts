import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type QuestionRow = Pick<
  Database["public"]["Tables"]["questions"]["Row"],
  "id" | "status" | "course" | "unit" | "question_number" | "stem" | "choices" | "correct_answer" | "explanation"
>;

type DeprecationGroup = {
  label: string;
  keepId: string;
  deprecated: Array<{
    id: string;
    reason: string;
  }>;
};

const GROUPS: DeprecationGroup[] = [
  {
    label: "ionized atoms in same electric field",
    keepId: "f3d4b2b8-1ce3-441a-a3da-b3318c0a41b8",
    deprecated: [
      {
        id: "9957a656-6348-4bfc-b2e8-dcbde72010e2",
        reason:
          "contains not-standard isotope variants and answer/explanation contradict the strongest-force prompt",
      },
      {
        id: "5d56a56f-3c6a-4b66-bb7b-140fb0de04a5",
        reason:
          "contains impossible isotope mass numbers after OCR normalization and answer/explanation conflict",
      },
    ],
  },
  {
    label: "nuclei same distance from alpha particle",
    keepId: "c7eb6755-c62d-453f-bf92-8a8c4716cd3a",
    deprecated: [
      {
        id: "5ffd2989-1367-47dd-88f5-8c77da06ff30",
        reason:
          "contains not-standard isotope variants and answer/explanation contradict the strongest-force prompt",
      },
    ],
  },
];

type ScriptArgs = {
  dryRun: boolean;
};

function parseArgs(argv: string[]): ScriptArgs {
  return {
    dryRun: !argv.includes("--write"),
  };
}

async function fetchQuestionMap(ids: string[]) {
  const db = createAdminSupabaseClient();
  const { data, error } = await db
    .from("questions")
    .select("id,status,course,unit,question_number,stem,choices,correct_answer,explanation")
    .in("id", ids);

  if (error) {
    throw new Error(`读取 questions 失败：${error.message}`);
  }

  return new Map((data ?? []).map((row) => [row.id, row as QuestionRow]));
}

function truncate(value: string | null | undefined, length = 140) {
  const text = `${value ?? ""}`.replace(/\s+/g, " ").trim();
  return text.length <= length ? text : `${text.slice(0, length)}...`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = createAdminSupabaseClient();

  const ids = GROUPS.flatMap((group) => [group.keepId, ...group.deprecated.map((item) => item.id)]);
  const rowMap = await fetchQuestionMap(ids);
  const summary: Array<Record<string, unknown>> = [];

  for (const group of GROUPS) {
    const keepRow = rowMap.get(group.keepId);
    if (!keepRow) {
      throw new Error(`未找到保留题：${group.keepId}`);
    }
    if (keepRow.status === "deprecated") {
      throw new Error(`保留题已经是 deprecated：${group.keepId}`);
    }

    const updates: Array<{ id: string; reason: string; row: QuestionRow }> = [];
    for (const item of group.deprecated) {
      const row = rowMap.get(item.id);
      if (!row) {
        throw new Error(`未找到待下架题：${item.id}`);
      }
      if (row.status === "deprecated") {
        continue;
      }
      if (row.stem !== keepRow.stem) {
        throw new Error(
          `同题簇校验失败：${item.id} 与 ${group.keepId} 的 stem 不一致，已停止写库`,
        );
      }
      updates.push({ id: item.id, reason: item.reason, row });
    }

    summary.push({
      label: group.label,
      keep: {
        id: keepRow.id,
        course: keepRow.course,
        unit: keepRow.unit,
        questionNumber: keepRow.question_number,
        correctAnswer: keepRow.correct_answer,
        stem: truncate(keepRow.stem),
      },
      deprecated: updates.map((item) => ({
        id: item.id,
        course: item.row.course,
        unit: item.row.unit,
        questionNumber: item.row.question_number,
        correctAnswer: item.row.correct_answer,
        reason: item.reason,
      })),
    });

    if (!args.dryRun) {
      for (const item of updates) {
        const { error } = await db.from("questions").update({ status: "deprecated" }).eq("id", item.id);
        if (error) {
          throw new Error(`更新 question ${item.id} 失败：${error.message}`);
        }
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun: args.dryRun,
        deprecatedCount: summary.reduce(
          (total, group) => total + (((group.deprecated as Array<unknown>) ?? []).length || 0),
          0,
        ),
        groups: summary,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[deprecate-low-quality-chem-isotope-duplicates] failed");
  console.error(error);
  process.exit(1);
});
