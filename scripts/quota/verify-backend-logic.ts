import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildQuotaHeaders } from "../../lib/quota/headers";
import { resolveQuotaIdempotencyKey } from "../../lib/quota/service";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

function readRepoFile(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function expectIncludes(text: string, expected: string, label: string) {
  assert.ok(text.includes(expected), `${label}: 缺少 ${expected}`);
}

function expectBefore(text: string, first: string, second: string, label: string) {
  const firstIndex = text.indexOf(first);
  const secondIndex = text.indexOf(second);
  assert.ok(firstIndex >= 0, `${label}: 未找到 ${first}`);
  assert.ok(secondIndex >= 0, `${label}: 未找到 ${second}`);
  assert.ok(firstIndex < secondIndex, `${label}: ${first} 应该出现在 ${second} 之前`);
}

function verifyHeaderHelpers() {
  const summaryHeaders = new Headers(
    buildQuotaHeaders(
      {
        plan: "beta_teacher",
        status: "active",
        quotaTotal: 300,
        quotaUsed: 120,
        quotaRemaining: 180,
        quotaSoftRemaining: 230,
        graceBuffer: 50,
        periodDays: 30,
        periodStart: "2026-03-01T00:00:00.000Z",
        periodEnd: "2026-03-31T00:00:00.000Z",
        usageRatio: 0.12,
      },
      { snapshot: "final", charged: true },
    ),
  );
  assert.equal(summaryHeaders.get("X-Quota-Snapshot"), "final");
  assert.equal(summaryHeaders.get("X-Quota-Charged"), "1");
  assert.equal(summaryHeaders.get("X-Quota-Remaining"), "180");
}

function verifyIdempotencyHelper() {
  const requestWithHeader = new Request("https://example.com", {
    headers: {
      "x-idempotency-key": "fixed-key",
    },
  });
  assert.equal(
    resolveQuotaIdempotencyKey(requestWithHeader, "lesson-plan:teacher-1"),
    "fixed-key",
  );

  const requestWithoutHeader = new Request("https://example.com");
  const generated = resolveQuotaIdempotencyKey(
    requestWithoutHeader,
    "lesson-plan:teacher-1",
  );
  assert.ok(generated.startsWith("lesson-plan:teacher-1:"));
}

function verifyMigrationContract() {
  const migration = readRepoFile(
    "supabase/migrations/20260320173000_beta_teacher_quota.sql",
  );

  expectIncludes(migration, "create table if not exists public.quota_accounts", "migration");
  expectIncludes(
    migration,
    "and account.quota_used < account.quota_total",
    "migration",
  );
  expectIncludes(
    migration,
    "and account.quota_used + normalized_units <= account.quota_total + account.grace_buffer as allowed",
    "migration",
  );
  expectIncludes(
    migration,
    "when account.quota_used >= account.quota_total then 'quota_exhausted'",
    "migration",
  );
  expectIncludes(
    migration,
    "when account.quota_used + normalized_units > account.quota_total + account.grace_buffer then 'grace_exceeded'",
    "migration",
  );
  expectIncludes(
    migration,
    "unique (teacher_id, idempotency_key)",
    "migration",
  );
}

function verifyRouteWiring() {
  const agentRoute = readRepoFile("app/api/agent/chat/route.ts");
  expectIncludes(agentRoute, 'action: "agent_chat"', "agent route");
  expectBefore(
    agentRoute,
    "const quotaAdmission = await checkQuotaAdmissionSafe",
    "let conversation = body.conversationId",
    "agent route",
  );
  expectIncludes(agentRoute, "await finalizeQuotaSpendSafe", "agent route");

  const exerciseRoute = readRepoFile("app/api/ai/exercises/generate/route.ts");
  expectIncludes(
    exerciseRoute,
    'action: "generate_exercises"',
    "exercise route",
  );
  expectIncludes(exerciseRoute, "onComplete: async () => {", "exercise route");
  expectIncludes(exerciseRoute, "quotaFinalize ?? quotaAdmission", "exercise route");

  const lessonRoute = readRepoFile("app/api/lesson-plans/generate/route.ts");
  expectIncludes(
    lessonRoute,
    'action: "generate_lesson_plan"',
    "lesson route",
  );
  expectIncludes(lessonRoute, "await finalizeQuotaSpendSafe", "lesson route");
  expectIncludes(
    lessonRoute,
    'buildQuotaHeaders(quotaAdmission, { snapshot: "admission" })',
    "lesson route",
  );

  const pblRoute = readRepoFile("app/api/pbl/generate/route.ts");
  expectIncludes(pblRoute, 'action: "generate_pbl"', "pbl route");
  expectIncludes(pblRoute, "await finalizeQuotaSpendSafe", "pbl route");

  const quotaRoute = readRepoFile("app/api/quota/route.ts");
  expectIncludes(quotaRoute, "export async function GET()", "quota route");
  expectIncludes(quotaRoute, "summary", "quota route");
}

function verifyStreamReliability() {
  const chatStream = readRepoFile("lib/agent/chat-stream.ts");
  expectIncludes(chatStream, "await runLifecycleHook(", "chat stream");
  expectIncludes(chatStream, "return buildUiResponse(stream, params.headers);", "chat stream");
}

function main() {
  verifyHeaderHelpers();
  verifyIdempotencyHelper();
  verifyMigrationContract();
  verifyRouteWiring();
  verifyStreamReliability();
  console.log("quota backend logic verification: PASS");
}

main();
