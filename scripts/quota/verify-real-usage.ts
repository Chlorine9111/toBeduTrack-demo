import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

type QuotaRow = {
  teacher_id: string;
  plan: string;
  quota_total: number;
  quota_used: number;
  grace_buffer: number;
  period_end: string;
};

type QuotaTransactionRow = {
  action: string;
  units: number;
  idempotency_key: string;
  created_at: string;
};

type VerificationReport = {
  teacherId: string;
  startedAt: string;
  finishedAt?: string;
  baseUrl: string;
  steps: Record<string, unknown>;
};

function describeError(error: unknown) {
  const context =
    error && typeof error === "object" && "context" in error
      ? (error as { context?: unknown }).context ?? null
      : null;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
      context,
    };
  }
  return {
    name: "UnknownError",
    message: String(error),
    stack: null,
    context,
  };
}

function withErrorContext(error: unknown, context: unknown) {
  if (error instanceof Error) {
    (error as Error & { context?: unknown }).context = context;
    return error;
  }

  const wrapped = new Error(String(error));
  (wrapped as Error & { context?: unknown }).context = context;
  return wrapped;
}

async function captureScenario<T>(params: {
  label: string;
  report: VerificationReport;
  failures: string[];
  run: () => Promise<T>;
}) {
  try {
    const result = await params.run();
    params.report.steps[params.label] = result;
    return result;
  } catch (error) {
    const described = describeError(error);
    params.failures.push(`${params.label}: ${described.message}`);
    params.report.steps[params.label] = {
      failed: true,
      error: described,
    };
    return null;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

const APP_BASE_URL = process.env.QUOTA_VERIFY_BASE_URL ?? "http://127.0.0.1:3001";
const DB_URL =
  process.env.QUOTA_VERIFY_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const TEACHER_ID = process.env.AUTH_BYPASS_USER_ID;
const REPORT_DIR = process.env.QUOTA_VERIFY_REPORT_DIR ?? path.join(
  repoRoot,
  "document",
  "backend-verification",
  new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "_"),
);

if (!TEACHER_ID) {
  throw new Error("AUTH_BYPASS_USER_ID 未配置，无法做真实额度验证");
}
const VERIFIED_TEACHER_ID: string = TEACHER_ID;

function maskHeaders(headers: Headers) {
  const entries = Object.fromEntries(headers.entries());
  delete entries.authorization;
  delete entries.cookie;
  return entries;
}

async function requestJson(url: string, init?: RequestInit) {
  const startedAt = Date.now();
  const response = await fetch(url, init);
  const text = await response.text();
  const durationMs = Date.now() - startedAt;
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return {
    status: response.status,
    headers: maskHeaders(response.headers),
    body: json,
    durationMs,
  };
}

async function requestText(url: string, init?: RequestInit) {
  const startedAt = Date.now();
  const response = await fetch(url, init);
  const text = await response.text();
  const durationMs = Date.now() - startedAt;
  return {
    status: response.status,
    headers: maskHeaders(response.headers),
    body: text,
    durationMs,
  };
}

async function withDb<T>(fn: (client: Client) => Promise<T>) {
  const client = new Client({
    connectionString: DB_URL,
    application_name: "quota-real-verify",
    statement_timeout: 30_000,
    query_timeout: 30_000,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function getQuotaRow(client: Client) {
  const result = await client.query<QuotaRow>(
    `
      select teacher_id, plan, quota_total, quota_used, grace_buffer, period_end
      from public.quota_accounts
      where teacher_id = $1
    `,
    [VERIFIED_TEACHER_ID],
  );
  return result.rows[0] ?? null;
}

async function getTransactions(client: Client) {
  const result = await client.query<QuotaTransactionRow>(
    `
      select action, units, idempotency_key, created_at
      from public.quota_transactions
      where teacher_id = $1
      order by created_at asc
    `,
    [VERIFIED_TEACHER_ID],
  );
  return result.rows;
}

async function resetQuota(client: Client, params: {
  total: number;
  used: number;
  graceBuffer: number;
}) {
  await client.query(
    `
      update public.quota_accounts
      set
        quota_total = $2,
        quota_used = $3,
        grace_buffer = $4,
        status = 'active',
        period_days = 30,
        period_start = timezone('utc', now()),
        period_end = timezone('utc', now()) + interval '30 days',
        updated_at = timezone('utc', now())
      where teacher_id = $1
    `,
    [VERIFIED_TEACHER_ID, params.total, params.used, params.graceBuffer],
  );
}

async function clearTransactions(client: Client) {
  await client.query(
    "delete from public.quota_transactions where teacher_id = $1",
    [VERIFIED_TEACHER_ID],
  );
}

async function main() {
  mkdirSync(REPORT_DIR, { recursive: true });

  const report: VerificationReport = {
    teacherId: VERIFIED_TEACHER_ID,
    startedAt: new Date().toISOString(),
    baseUrl: APP_BASE_URL,
    steps: {},
  };
  const scenarioFailures: string[] = [];

  const initialQuota = await requestJson(`${APP_BASE_URL}/api/quota`);
  assert.equal(initialQuota.status, 200, "初始 /api/quota 必须可用");
  report.steps.initialQuota = initialQuota;

  await withDb(async (client) => {
    const row = await getQuotaRow(client);
    assert.ok(row, "quota_accounts 行必须存在");
  });

  await captureScenario({
    label: "agentScenario",
    report,
    failures: scenarioFailures,
    run: async () => withDb(async (client) => {
    await clearTransactions(client);
    await resetQuota(client, { total: 1, used: 0, graceBuffer: 50 });

    const first = await requestText(`${APP_BASE_URL}/api/agent/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": "quota-real-agent-1",
      },
      body: JSON.stringify({
        message: "你好，请用一句简短的话回应我。",
      }),
    });

    const afterFirst = await getQuotaRow(client);
    const firstTransactions = await getTransactions(client);

    const second = await requestJson(`${APP_BASE_URL}/api/agent/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": "quota-real-agent-2",
      },
      body: JSON.stringify({
        message: "再回复一句话。",
      }),
    });

    const afterSecond = await getQuotaRow(client);
    const secondTransactions = await getTransactions(client);

    assert.equal(first.status, 200, "第一次 Agent 请求应成功");
    assert.equal(first.headers["x-quota-snapshot"], "admission");
    assert.ok(first.body.includes("finish") || first.body.includes("text-delta"));
    assert.equal(afterFirst?.quota_used, 2, "第一次 Agent 请求后应扣减 2");
    assert.equal(firstTransactions.length, 1, "第一次 Agent 请求后应有 1 条流水");
    assert.equal(firstTransactions[0]?.action, "agent_chat");
    assert.equal(firstTransactions[0]?.units, 2);

    assert.equal(second.status, 403, "第二次 Agent 请求应被额度拦截");
    assert.equal(
      (second.body as { error?: { code?: string } })?.error?.code,
      "QUOTA_EXHAUSTED",
    );
    assert.equal(afterSecond?.quota_used, 2, "被拦截后 quota_used 不应继续增长");
    assert.equal(secondTransactions.length, 1, "被拦截后不应新增流水");

    return {
      first,
      afterFirst,
      firstTransactions,
      second,
      afterSecond,
      secondTransactions,
    };
    }),
  });

  await captureScenario({
    label: "exerciseScenario",
    report,
    failures: scenarioFailures,
    run: async () => withDb(async (client) => {
    await clearTransactions(client);
    await resetQuota(client, { total: 10, used: 0, graceBuffer: 50 });

    const exercise = await requestJson(`${APP_BASE_URL}/api/ai/exercises/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": "quota-real-exercise-1",
      },
      body: JSON.stringify({
        track: "general",
        topic: "一元一次方程",
        subjectCategory: "Mathematics",
        gradeLevel: "8年级",
        exerciseType: "MC",
        difficulty: 2,
        count: 1,
        teacherRequest: "请生成 1 道关于一元一次方程的选择题。",
      }),
    });

    const afterExercise = await getQuotaRow(client);
    const exerciseTransactions = await getTransactions(client);

    assert.equal(exercise.status, 200, "习题真实生成应成功");
    assert.equal(exercise.headers["x-quota-snapshot"], "final");
    assert.equal(exercise.headers["x-quota-charged"], "1");
    assert.equal(afterExercise?.quota_used, 4, "习题生成后应扣减 4");
    assert.equal(exerciseTransactions.length, 1, "习题生成后应有 1 条流水");
    assert.equal(exerciseTransactions[0]?.action, "generate_exercises");
    assert.equal(exerciseTransactions[0]?.units, 4);

    return {
      exercise,
      afterExercise,
      exerciseTransactions,
    };
    }),
  });

  await captureScenario({
    label: "rubricScenario",
    report,
    failures: scenarioFailures,
    run: async () => withDb(async (client) => {
    await clearTransactions(client);
    await resetQuota(client, { total: 1, used: 0, graceBuffer: 50 });

    const first = await requestJson(`${APP_BASE_URL}/api/ai/rubric`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": "quota-real-rubric-1",
      },
      body: JSON.stringify({
        track: "general",
        topic: "一元一次方程",
        subjectCategory: "Mathematics",
        gradeLevel: "8年级",
        teacherRequest: "请生成一个简短 rubric。",
      }),
    });

    const afterFirst = await getQuotaRow(client);
    const firstTransactions = await getTransactions(client);

    try {
      assert.equal(first.status, 200, "第一次 Rubric 请求应成功");
      assert.equal(first.headers["x-quota-snapshot"], "final");
      assert.equal(first.headers["x-quota-charged"], "1");
      assert.equal(afterFirst?.quota_used, 4, "第一次 Rubric 请求后应扣减 4");
      assert.equal(firstTransactions.length, 1, "第一次 Rubric 请求后应有 1 条流水");
      assert.equal(firstTransactions[0]?.action, "generate_rubric");
      assert.equal(firstTransactions[0]?.units, 4);
      assert.ok(
        (first.body as { rubric?: { id?: string } })?.rubric?.id,
        "Rubric 响应应包含 rubric.id",
      );
    } catch (error) {
      throw withErrorContext(error, {
        first,
        afterFirst,
        firstTransactions,
      });
    }

    const second = await requestJson(`${APP_BASE_URL}/api/ai/rubric`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": "quota-real-rubric-2",
      },
      body: JSON.stringify({
        track: "general",
        topic: "一元一次方程",
        subjectCategory: "Mathematics",
        gradeLevel: "8年级",
        teacherRequest: "请再生成一个简短 rubric。",
      }),
    });

    const afterSecond = await getQuotaRow(client);
    const secondTransactions = await getTransactions(client);

    try {
      assert.equal(second.status, 403, "第二次 Rubric 请求应被额度拦截");
      assert.equal(
        (second.body as { error?: { code?: string } })?.error?.code,
        "QUOTA_EXHAUSTED",
      );
      assert.equal(afterSecond?.quota_used, 4, "被拦截后 Rubric quota_used 不应继续增长");
      assert.equal(secondTransactions.length, 1, "被拦截后 Rubric 不应新增流水");
    } catch (error) {
      throw withErrorContext(error, {
        first,
        afterFirst,
        firstTransactions,
        second,
        afterSecond,
        secondTransactions,
      });
    }

    return {
      first,
      afterFirst,
      firstTransactions,
      second,
      afterSecond,
      secondTransactions,
    };
    }),
  });

  await captureScenario({
    label: "lessonPlanScenario",
    report,
    failures: scenarioFailures,
    run: async () => withDb(async (client) => {
    await clearTransactions(client);
    await resetQuota(client, { total: 20, used: 0, graceBuffer: 50 });

    const lesson = await requestText(`${APP_BASE_URL}/api/lesson-plans/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": "quota-real-lesson-1",
      },
      body: JSON.stringify({
        track: "general",
        topic: "一元一次方程",
        subjectCategory: "Mathematics",
        gradeLevel: "8年级",
        sourcePrompt: "请生成一个 20 分钟、面向初二的一元一次方程微型教案。",
        duration: 20,
        level: "basic",
        template: "concept",
        enableWebSearch: false,
      }),
    });

    const afterLesson = await getQuotaRow(client);
    const lessonTransactions = await getTransactions(client);

    assert.equal(lesson.status, 200, "教案真实生成应成功");
    assert.equal(lesson.headers["x-quota-snapshot"], "admission");
    assert.equal(afterLesson?.quota_used, 12, "教案生成后应扣减 12");
    assert.equal(lessonTransactions.length, 1, "教案生成后应有 1 条流水");
    assert.equal(lessonTransactions[0]?.action, "generate_lesson_plan");
    assert.equal(lessonTransactions[0]?.units, 12);
    assert.ok(
      lesson.body.includes("data-lesson-complete") ||
        lesson.body.includes("data-lesson-section") ||
        lesson.body.includes("\"finish\""),
      "教案流式响应应包含完成或章节信号",
    );

    return {
      lesson,
      afterLesson,
      lessonTransactions,
    };
    }),
  });

  report.steps.pblScenario = {
    skipped: true,
    reason: "PBL 暂不上线，本轮真实额度验证跳过该功能。",
  };

  await withDb(async (client) => {
    await clearTransactions(client);
    await resetQuota(client, { total: 1, used: 2, graceBuffer: 50 });
  });

  const exhaustedQuota = await requestJson(`${APP_BASE_URL}/api/quota`);
  assert.equal(exhaustedQuota.status, 200);
  report.steps.exhaustedQuota = exhaustedQuota;

  report.finishedAt = new Date().toISOString();
  writeFileSync(
    path.join(REPORT_DIR, "quota-real-results.json"),
    JSON.stringify(report, null, 2),
  );
  if (scenarioFailures.length > 0) {
    throw new Error(`部分场景失败: ${scenarioFailures.join(" | ")}`);
  }
  console.log(`quota real verification: PASS`);
  console.log(`report: ${REPORT_DIR}`);
}

main().catch((error) => {
  console.error("quota real verification: FAIL");
  console.error(error);
  process.exitCode = 1;
});
