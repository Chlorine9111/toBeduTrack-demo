import { runTeacherMemoryMaintenance } from "@/lib/teacher-memory/service";

async function main() {
  const teacherArg = process.argv.find((arg) => arg.startsWith("--teacher="));
  const scopeArg = process.argv.find((arg) => arg.startsWith("--scope="));
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));

  const results = await runTeacherMemoryMaintenance({
    teacherId: teacherArg?.split("=")[1],
    scope: (scopeArg?.split("=")[1] as "wechat_editor" | "agent_workspace" | undefined) ?? undefined,
    limit: Number(limitArg?.split("=")[1] ?? 50) || 50,
  });

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
