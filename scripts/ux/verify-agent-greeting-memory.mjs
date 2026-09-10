import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const artifactDir = process.argv[2];

if (!artifactDir) {
  console.error("缺少产物目录参数");
  process.exit(1);
}

const baseUrl = process.env.UX_BASE_URL ?? "http://127.0.0.1:3001";
const loginEmail =
  process.env.UX_LOGIN_EMAIL ?? "teacher.onboarding.1772888667431@example.com";
const loginPassword = process.env.UX_LOGIN_PASSWORD ?? "Teacher123A";
const greetingPrompt = process.env.UX_GREETING_PROMPT ?? "hi";
const teachingPrompt =
  process.env.UX_MEMORY_PROMPT ??
  "帮我生成两道 AP Calculus BC Unit 3 的 chain rule 选择题";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("缺少 Supabase 环境变量，无法验证 teacher_memory_jobs 写库");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const networkEvents = [];
const consoleErrors = [];
const pageErrors = [];
const static404s = [];
const crossChecks = [];
const requestStarts = new WeakMap();

function sanitizeUrl(rawUrl) {
  const url = new URL(rawUrl);
  [
    "apikey",
    "access_token",
    "refresh_token",
    "token",
    "token_hash",
    "code",
    "conversationId",
  ].forEach((key) => url.searchParams.delete(key));
  return `${url.origin}${url.pathname}${url.search}`;
}

function isTrackedApi(url) {
  return (
    url.includes("/api/account/profile") ||
    url.includes("/api/chat/conversations") ||
    url.includes("/api/agent/preflight") ||
    url.includes("/api/agent/chat")
  );
}

function isStatic404(response) {
  if (response.status() !== 404) return false;
  const request = response.request();
  const resourceType = request.resourceType();
  if (
    resourceType === "stylesheet" ||
    resourceType === "script" ||
    resourceType === "font"
  ) {
    return true;
  }
  return /\.(css|js|woff2?|ttf|otf)(\?|$)/i.test(request.url());
}

function normalizeText(value) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readNdjsonResponse(response) {
  const raw = await response.text().catch(() => "");
  const events = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });

  return {
    raw,
    events,
    text: events
      .filter(
        (event) =>
          event?.type === "text-delta" &&
          (typeof event.text === "string" || typeof event.delta === "string"),
      )
      .map((event) => event.text ?? event.delta)
      .join(""),
    toolCalls: events
      .filter(
        (event) =>
          (event?.type === "tool-call" ||
            event?.type === "tool-input-available" ||
            event?.type === "tool-output-available") &&
          typeof event.toolName === "string",
      )
      .map((event) => event.toolName),
    toolResults: events
      .filter((event) => event?.type === "tool-result" && typeof event.toolName === "string")
      .map((event) => ({
        toolName: event.toolName,
        output: event.output ?? null,
        durationMs: typeof event.durationMs === "number" ? event.durationMs : null,
      })),
  };
}

async function waitForMemoryWrites(teacherId, startedAtIso) {
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    const [{ data: jobs, error: jobsError }, { data: mutations, error: mutationsError }] =
      await Promise.all([
        admin
          .from("teacher_memory_jobs")
          .select("id,status,job_type,created_at")
          .eq("teacher_id", teacherId)
          .gte("created_at", startedAtIso)
          .order("created_at", { ascending: false })
          .limit(5),
        admin
          .from("teacher_memory_mutations")
          .select("id,bucket,operation,created_at")
          .eq("teacher_id", teacherId)
          .gte("created_at", startedAtIso)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

    if (jobsError) {
      throw new Error(`teacher_memory_jobs 查询失败: ${jobsError.message}`);
    }
    if (mutationsError) {
      throw new Error(`teacher_memory_mutations 查询失败: ${mutationsError.message}`);
    }

    if ((jobs?.length ?? 0) > 0 && (mutations?.length ?? 0) > 0) {
      return {
        jobs,
        mutations,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("等待 teacher_memory_jobs / teacher_memory_mutations 写入超时");
}

async function run() {
  await fs.mkdir(artifactDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(120000);

  page.on("request", (request) => {
    requestStarts.set(request, Date.now());
  });

  page.on("response", (response) => {
    const request = response.request();
    if (isTrackedApi(request.url())) {
      const startedAt = requestStarts.get(request) ?? Date.now();
      networkEvents.push({
        method: request.method(),
        url: sanitizeUrl(request.url()),
        status: response.status(),
        durationMs: Date.now() - startedAt,
      });
    }

    if (isStatic404(response)) {
      static404s.push({
        url: sanitizeUrl(response.url()),
        status: response.status(),
        resourceType: request.resourceType(),
      });
    }
  });

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    consoleErrors.push({
      type: message.type(),
      text: message.text(),
      location: message.location(),
    });
  });

  page.on("pageerror", (error) => {
    pageErrors.push({
      message: error.message,
      stack: error.stack ?? null,
    });
  });

  try {
    await page.goto(`${baseUrl}/auth/login`, { waitUntil: "domcontentloaded" });
    await page
      .locator('form[data-auth-ready="true"]')
      .waitFor({ state: "visible", timeout: 60000 });
    await page.locator("#login-email").fill(loginEmail);
    await page.locator("#login-password").fill(loginPassword);

    await Promise.all([
      page.waitForURL((url) => url.pathname === "/main/agent", { timeout: 120000 }),
      page.getByRole("button", { name: /^登录$/ }).click(),
    ]);

    const composer = page.locator('[data-testid="agent-composer"]').first();
    await composer.waitFor({ state: "visible", timeout: 60000 });

    const profile = await page.evaluate(async () => {
      const response = await fetch("/api/account/profile");
      if (!response.ok) {
        throw new Error(`profile_failed_${response.status}`);
      }
      return response.json();
    });
    const teacherId = profile?.profile?.id;
    assert(Boolean(teacherId), "未获取到 teacherId");

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const hiPreflightPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/preflight") &&
        response.request().method() === "POST",
      { timeout: 60000 },
    );

    await composer.fill(greetingPrompt);
    await composer.press("Enter");

    const hiPreflightResponse = await hiPreflightPromise;
    const hiPreflightBody = await hiPreflightResponse.json().catch(() => null);
    assert(
      hiPreflightBody?.status === "needs_info",
      `hi preflight 应返回 needs_info，实际为 ${JSON.stringify(hiPreflightBody ?? {})}`,
    );

    const clarificationQuestion = page
      .locator('[data-testid="agent-clarification-question"]')
      .last();
    await clarificationQuestion.waitFor({ state: "visible", timeout: 30000 });
    const clarificationText = normalizeText(await clarificationQuestion.textContent());
    assert(
      clarificationText.includes("今天要处理哪类教学任务") ||
        clarificationText.includes("先产出哪类结果"),
      `hi 后未出现正确引导问题：${clarificationText}`,
    );

    const chatEventsAfterHi = networkEvents.filter((item) =>
      item.url.includes("/api/agent/chat"),
    );
    assert(chatEventsAfterHi.length === 0, "hi 不应直接触发 /api/agent/chat");

    crossChecks.push({
      apiField: "POST /api/agent/preflight -> status",
      apiValue: hiPreflightBody?.status ?? null,
      domValue: clarificationText,
      pass:
        hiPreflightBody?.status === "needs_info" &&
        (clarificationText.includes("教学任务") ||
          clarificationText.includes("先产出哪类结果")),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    const resetConversationButton = page
      .locator('[data-testid="agent-reset-conversation"]')
      .first();
    await resetConversationButton.click();
    await clarificationQuestion.waitFor({ state: "hidden", timeout: 30000 });
    await composer.waitFor({ state: "visible", timeout: 30000 });

    const normalTurnStartedAtIso = new Date().toISOString();
    const exercisePreflightPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/preflight") &&
        response.request().method() === "POST",
      { timeout: 60000 },
    );
    const chatPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/chat") &&
        response.request().method() === "POST" &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 150000 },
    ).catch(() => null);

    await composer.fill(teachingPrompt);
    await composer.press("Enter");

    const exercisePreflightResponse = await exercisePreflightPromise;
    const exercisePreflightBody = await exercisePreflightResponse.json().catch(() => null);
    const preflightReady =
      exercisePreflightBody?.ready === true ||
      exercisePreflightBody?.decision === "ready" ||
      exercisePreflightBody?.status === "ready";
    assert(preflightReady, `正式请求 preflight 未 ready：${JSON.stringify(exercisePreflightBody ?? {})}`);

    const chatResponse = await chatPromise;
    assert(chatResponse, "正式请求未触发成功的 /api/agent/chat");
    const chatNdjson = await readNdjsonResponse(chatResponse);

    await page.waitForFunction(
      () => {
        const nodes = Array.from(
          document.querySelectorAll('[data-testid="agent-assistant-message"]'),
        );
        const last = nodes.at(-1);
        const content = last?.textContent?.replace(/\s+/g, " ").trim() ?? "";
        return (
          content.includes("第 1 题") ||
          content.includes("已完成习题生成") ||
          content.includes("先不入库")
        );
      },
      { timeout: 120000 },
    );

    const assistantText = normalizeText(
      await page.locator('[data-testid="agent-assistant-message"]').last().textContent(),
    );
    const memoryWrites = await waitForMemoryWrites(teacherId, normalTurnStartedAtIso);

    crossChecks.push({
      apiField: "POST /api/agent/preflight -> taskContext.action",
      apiValue: exercisePreflightBody?.taskContext?.action ?? null,
      domValue: assistantText.slice(0, 80),
      pass:
        exercisePreflightBody?.taskContext?.action === "generate_exercises" &&
        (assistantText.includes("第 1 题") || assistantText.includes("已完成习题生成")),
    });

    crossChecks.push({
      apiField: "teacher_memory_jobs / teacher_memory_mutations",
      apiValue: JSON.stringify({
        jobs: memoryWrites.jobs.map((item) => item.status),
        mutations: memoryWrites.mutations.map((item) => item.operation),
      }),
      domValue: assistantText.slice(0, 80),
      pass:
        memoryWrites.jobs.length > 0 &&
        memoryWrites.mutations.length > 0 &&
        !assistantText.includes("Could not find the table 'public.teacher_memory_jobs'"),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });

    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      static404s,
      consoleErrors,
      pageErrors,
    });

    const keyApis = networkEvents.filter(
      (item) =>
        item.url.includes("/api/account/profile") ||
        item.url.includes("/api/agent/preflight") ||
        item.url.includes("/api/agent/chat"),
    );
    const finalPass =
      static404s.length === 0 &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      keyApis.every((item) => item.status >= 200 && item.status < 300) &&
      keyApis
        .filter((item) => item.url.includes("/api/agent/chat"))
        .every((item) => item.durationMs <= 30000) &&
      crossChecks.every((item) => item.pass);

    const report = `## UX 验证报告

- 验证级别: L1
- 最终结论: ${finalPass ? "PASS" : "FAIL"}
- 关键接口耗时:
${keyApis
  .map((item) => `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${(item.durationMs / 1000).toFixed(2)}s`)
  .join("\n")}
- 错误统计:
  - 静态资源 404: ${static404s.length}
  - console error: ${consoleErrors.length}
  - pageerror: ${pageErrors.length}
- 数据流交叉验证:
${crossChecks
  .map(
    (item) =>
      `  - API 字段 \`${item.apiField}\` -> DOM 文本 \`${item.domValue}\`: ${item.pass ? "PASS" : "FAIL"}`,
  )
  .join("\n")}
- 截图:
  - verify-1-loaded.png
  - verify-2-after-action.png
  - verify-3-result.png
- 产物目录:
  - ${artifactDir}
`;

    await fs.writeFile(path.join(artifactDir, "report.md"), report, "utf8");

    if (!finalPass) {
      throw new Error("L1 验收未通过，请检查 report.md");
    }
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
