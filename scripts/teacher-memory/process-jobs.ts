import { processTeacherMemoryFormationJob } from "@/lib/teacher-memory/service";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

async function main() {
  const db = createAdminSupabaseClient();
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = Number(limitArg?.split("=")[1] ?? 20) || 20;

  const { data, error } = await (db.from as unknown as (table: string) => ReturnType<typeof db.from>)(
    "teacher_memory_jobs",
  )
    .select("id")
    .in("status", ["queued", "failed"])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message || "读取老师记忆任务失败");
  }

  const rows = (data ?? []) as Array<{ id: string }>;
  for (const row of rows) {
    await processTeacherMemoryFormationJob({ jobId: row.id });
    console.log(`processed ${row.id}`);
  }

  console.log(`done: ${rows.length} jobs`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
