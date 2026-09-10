import process from "node:process";
import { Client } from "pg";
import {
  BETA_TEACHER_GRACE_BUFFER,
  BETA_TEACHER_QUOTA_TOTAL,
  DEFAULT_QUOTA_PERIOD_DAYS,
} from "../../lib/quota/constants";

type Mode = "unlimit" | "reset";

type QuotaConfig = {
  plan: string;
  status: "active" | "paused";
  quotaTotal: number;
  quotaUsed: number;
  graceBuffer: number;
  periodDays: number;
};

type QuotaAccountRow = {
  teacher_id: string;
  plan: string;
  status: "active" | "paused";
  quota_total: number;
  quota_used: number;
  grace_buffer: number;
  period_days: number;
  period_start: string;
  period_end: string;
};

const DEFAULT_DB_URL =
  process.env.QUOTA_DEV_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function parseMode(value: string | undefined): Mode {
  if (value === "unlimit" || value === "reset") {
    return value;
  }
  throw new Error("用法: npm run quota:dev:unlimit 或 npm run quota:dev:reset");
}

function parseArgs(args: string[]) {
  let teacherId = process.env.AUTH_BYPASS_USER_ID?.trim() ?? "";
  let connectionString = DEFAULT_DB_URL;

  for (const arg of args) {
    if (arg.startsWith("--teacher=")) {
      teacherId = arg.slice("--teacher=".length).trim();
      continue;
    }
    if (arg.startsWith("--db=")) {
      connectionString = arg.slice("--db=".length).trim();
    }
  }

  if (!teacherId) {
    throw new Error("缺少教师账号 ID。请先配置 AUTH_BYPASS_USER_ID，或通过 --teacher=<uuid> 传入。");
  }

  return {
    teacherId,
    connectionString,
  };
}

function resolveQuotaConfig(mode: Mode): QuotaConfig {
  if (mode === "unlimit") {
    return {
      plan: "beta_teacher",
      status: "active",
      quotaTotal: Number(process.env.QUOTA_DEV_UNLIMIT_TOTAL ?? 1_000_000),
      quotaUsed: 0,
      graceBuffer: Number(process.env.QUOTA_DEV_UNLIMIT_GRACE ?? 1_000_000),
      periodDays: Number(process.env.QUOTA_DEV_UNLIMIT_PERIOD_DAYS ?? 365),
    };
  }

  return {
    plan: "beta_teacher",
    status: "active",
    quotaTotal: BETA_TEACHER_QUOTA_TOTAL,
    quotaUsed: 0,
    graceBuffer: BETA_TEACHER_GRACE_BUFFER,
    periodDays: DEFAULT_QUOTA_PERIOD_DAYS,
  };
}

async function upsertQuotaAccount(params: {
  client: Client;
  teacherId: string;
  config: QuotaConfig;
}) {
  const result = await params.client.query<QuotaAccountRow>(
    `
      insert into public.quota_accounts (
        teacher_id,
        plan,
        status,
        quota_total,
        quota_used,
        grace_buffer,
        period_days,
        period_start,
        period_end
      )
      values (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7::smallint,
        timezone('utc', now()),
        timezone('utc', now()) + make_interval(days => $7::int)
      )
      on conflict (teacher_id)
      do update
      set
        plan = excluded.plan,
        status = excluded.status,
        quota_total = excluded.quota_total,
        quota_used = excluded.quota_used,
        grace_buffer = excluded.grace_buffer,
        period_days = excluded.period_days,
        period_start = excluded.period_start,
        period_end = excluded.period_end,
        updated_at = timezone('utc', now())
      returning
        teacher_id,
        plan,
        status,
        quota_total,
        quota_used,
        grace_buffer,
        period_days,
        period_start,
        period_end
    `,
    [
      params.teacherId,
      params.config.plan,
      params.config.status,
      params.config.quotaTotal,
      params.config.quotaUsed,
      params.config.graceBuffer,
      params.config.periodDays,
    ],
  );

  return result.rows[0] ?? null;
}

async function main() {
  const mode = parseMode(process.argv[2]);
  const { teacherId, connectionString } = parseArgs(process.argv.slice(3));
  const config = resolveQuotaConfig(mode);

  if (
    !Number.isFinite(config.quotaTotal) ||
    !Number.isFinite(config.graceBuffer) ||
    !Number.isFinite(config.periodDays) ||
    config.quotaTotal < 0 ||
    config.graceBuffer < 0 ||
    config.periodDays < 1
  ) {
    throw new Error("额度脚本配置非法，请检查 QUOTA_DEV_* 环境变量。");
  }

  const client = new Client({
    connectionString,
    application_name: `quota-dev-${mode}`,
    statement_timeout: 30_000,
    query_timeout: 30_000,
  });

  await client.connect();
  try {
    const account = await upsertQuotaAccount({
      client,
      teacherId,
      config,
    });

    if (!account) {
      throw new Error("额度更新完成，但未读回 quota_accounts 记录。");
    }

    console.log(
      JSON.stringify(
        {
          mode,
          teacherId: account.teacher_id,
          plan: account.plan,
          status: account.status,
          quotaTotal: account.quota_total,
          quotaUsed: account.quota_used,
          graceBuffer: account.grace_buffer,
          periodDays: account.period_days,
          periodStart: account.period_start,
          periodEnd: account.period_end,
        },
        null,
        2,
      ),
    );

    console.log(
      mode === "unlimit"
        ? "测试教师额度已调大，可以继续做真实生成验证。"
        : "测试教师额度已恢复到默认 beta_teacher 配置。",
    );
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "额度脚本执行失败",
  );
  process.exitCode = 1;
});
